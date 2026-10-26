import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  enqueueOutboundPromptSchema,
  outboundClaimSchema,
  outboundSettleSchema,
  type OutboundPromptDelivery,
  type OutboundPromptState,
  type OutboundPromptStatus,
} from '../domain/outbound-prompt.js';
import { WorkflowError, type Principal, type Run } from '../domain/workflow.js';

type Job = OutboundPromptDelivery & {
  owner: string;
  status: OutboundPromptStatus;
  updatedAt: number;
  message?: string;
};

const denied = (message: string) =>
  new WorkflowError('OUTBOUND_CONFLICT', message);

/**
 * ADR 0036 PR1: durable outbox for continuation_prompt only.
 * Separate from ADR 0022 human-answer continuations. Delivery ≠ execution.
 */
export class OutboundPromptQueue {
  constructor(
    private db: DatabaseSync,
    private getRun: (id: string) => Run,
    private now: () => number = Date.now,
  ) {
    db.exec(`CREATE TABLE IF NOT EXISTS outbound_prompt_jobs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        command_id TEXT NOT NULL,
        data TEXT NOT NULL,
        UNIQUE(run_id, command_id)
      );
      CREATE INDEX IF NOT EXISTS outbound_prompt_run ON outbound_prompt_jobs(run_id);`);
  }

  private atomic<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private row(id: string): Job | undefined {
    const found = this.db
      .prepare('SELECT data FROM outbound_prompt_jobs WHERE id=?')
      .get(id);
    return found ? (JSON.parse(found.data as string) as Job) : undefined;
  }

  private byCommand(runId: string, commandId: string): Job | undefined {
    const found = this.db
      .prepare(
        'SELECT data FROM outbound_prompt_jobs WHERE run_id=? AND command_id=?',
      )
      .get(runId, commandId);
    return found ? (JSON.parse(found.data as string) as Job) : undefined;
  }

  private jobs(runId?: string): Job[] {
    const rows = runId
      ? this.db
          .prepare(
            'SELECT data FROM outbound_prompt_jobs WHERE run_id=? ORDER BY rowid',
          )
          .all(runId)
      : this.db
          .prepare('SELECT data FROM outbound_prompt_jobs ORDER BY rowid')
          .all();
    return rows.map((row) => JSON.parse(row.data as string) as Job);
  }

  private save(job: Job) {
    this.db
      .prepare(
        `INSERT INTO outbound_prompt_jobs(id, run_id, command_id, data)
         VALUES(?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
      )
      .run(job.id, job.runId, job.commandId, JSON.stringify(job));
  }

  private authorizeConsumer(actor: Principal, owner?: string) {
    if (actor.role !== 'agent')
      throw new WorkflowError(
        'FORBIDDEN',
        'Only an agent can consume outbound prompts',
        403,
      );
    if (owner && actor.id !== owner)
      throw new WorkflowError(
        'FORBIDDEN',
        'Only the coordinator can manage outbound prompts',
        403,
      );
  }

  private authorizeEnqueue(actor: Principal, run: Run) {
    if (actor.role === 'human') return;
    if (actor.role === 'agent' && actor.id === run.coordinator) return;
    throw new WorkflowError(
      'FORBIDDEN',
      'Only the human or run coordinator can enqueue outbound prompts',
      403,
    );
  }

  private toDelivery(job: Job): OutboundPromptDelivery {
    const {
      owner: _o,
      status: _s,
      updatedAt: _u,
      message: _m,
      ...delivery
    } = job;
    return delivery;
  }

  private toState(job: Job): OutboundPromptState {
    const status =
      job.status === 'leased' && job.leaseUntil <= this.now()
        ? 'uncertain'
        : job.status;
    return {
      status,
      kind: job.kind,
      connectorId: job.connectorId,
      harness: job.harness,
      updatedAt: job.updatedAt,
      jobId: job.id,
    };
  }

  /** Latest job projection for a run (no session secrets). */
  state(runId: string): OutboundPromptState | undefined {
    const job = this.jobs(runId).at(-1);
    return job ? this.toState(job) : undefined;
  }

  /**
   * Enqueue one continuation_prompt job. Idempotent by commandId.
   * One job covers all parallel ready steps (caller supplies the full Copiar text).
   */
  enqueue(
    runId: string,
    input: unknown,
    actor: Principal,
  ): OutboundPromptState {
    const data = enqueueOutboundPromptSchema.parse(input);
    return this.atomic(() => {
      const run = this.getRun(runId);
      this.authorizeEnqueue(actor, run);
      if (run.revision !== data.expectedRevision)
        throw denied('Current revision required');
      if (run.status !== 'active')
        throw denied('Outbound prompts require an active run');
      if (data.connector.harness !== run.coordinator)
        throw denied('Connector harness must match the run coordinator');

      const existing = this.byCommand(runId, data.commandId);
      if (existing) {
        const same =
          existing.text === data.text &&
          existing.connectorId === data.connector.id &&
          existing.kind === data.kind;
        if (!same)
          throw new WorkflowError(
            'IDEMPOTENCY_CONFLICT',
            'commandId reused with different outbound prompt content',
          );
        return this.toState(existing);
      }

      const outstanding = this.jobs(runId).some((job) =>
        ['queued', 'leased', 'uncertain'].includes(
          job.status === 'leased' && job.leaseUntil <= this.now()
            ? 'uncertain'
            : job.status,
        ),
      );
      if (outstanding)
        throw denied(
          'Reconcile outstanding outbound delivery before enqueueing another',
        );

      const c = data.connector;
      const job: Job = {
        id: randomUUID(),
        kind: data.kind,
        runId,
        revision: run.revision,
        commandId: data.commandId,
        text: data.text,
        connectorId: c.id,
        harness: c.harness,
        sessionId: c.sessionId,
        scope: c.scope,
        status: 'queued',
        leaseToken: '',
        leaseUntil: 0,
        owner: run.coordinator,
        updatedAt: this.now(),
      };
      this.save(job);
      return this.toState(job);
    });
  }

  pending(connectorId: string, actor: Principal): OutboundPromptDelivery[] {
    outboundClaimSchema.parse({ connectorId });
    this.authorizeConsumer(actor);
    return this.jobs()
      .filter(
        (job) =>
          job.owner === actor.id &&
          job.connectorId === connectorId &&
          (job.status === 'uncertain' ||
            (job.status === 'leased' && job.leaseUntil <= this.now())),
      )
      .map((job) => this.toDelivery(job));
  }

  claim(connectorId: string, actor: Principal): OutboundPromptDelivery | null {
    outboundClaimSchema.parse({ connectorId });
    this.authorizeConsumer(actor);
    return this.atomic(() => {
      let claimed: OutboundPromptDelivery | null = null;
      for (const job of this.jobs()) {
        if (job.owner !== actor.id || job.connectorId !== connectorId) continue;
        if (job.status === 'leased' && job.leaseUntil <= this.now()) {
          job.status = 'uncertain';
          job.updatedAt = this.now();
          this.save(job);
        }
        if (claimed || job.status !== 'queued') continue;
        const run = this.getRun(job.runId);
        if (run.status !== 'active') {
          job.status = 'cancelled';
          job.updatedAt = this.now();
          this.save(job);
          continue;
        }
        job.status = 'leased';
        job.leaseToken = randomUUID();
        job.leaseUntil = this.now() + 300000;
        job.updatedAt = this.now();
        this.save(job);
        claimed = this.toDelivery(job);
      }
      return claimed;
    });
  }

  settle(
    id: string,
    input: unknown,
    actor: Principal,
  ): { runId: string; state: OutboundPromptState } {
    const data = outboundSettleSchema.parse(input);
    return this.atomic(() => {
      const job = this.row(id);
      if (!job)
        throw new WorkflowError('NOT_FOUND', 'Outbound prompt not found', 404);
      this.authorizeConsumer(actor, job.owner);
      if (data.leaseToken !== job.leaseToken)
        throw denied('Invalid lease token');
      const target = data.outcome === 'accepted' ? 'delivered' : 'failed';
      if (job.status === target)
        return { runId: job.runId, state: this.toState(job) };
      if (!['leased', 'uncertain'].includes(job.status))
        throw denied('Outbound prompt cancelled or already settled');
      if (
        (job.status === 'uncertain' || job.leaseUntil <= this.now()) &&
        !data.reconciled
      )
        throw denied('Expired delivery requires reconciliation');
      if (['cancelled', 'rejected'].includes(this.getRun(job.runId).status))
        throw denied('Run no longer accepts outbound delivery');
      job.status = target;
      job.updatedAt = this.now();
      job.message = data.message;
      this.save(job);
      return { runId: job.runId, state: this.toState(job) };
    });
  }
}
