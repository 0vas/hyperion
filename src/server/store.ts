import {
  artifactInputSchema,
  artifactLimit,
  attachArtifact,
  type Artifact,
} from '../domain/artifacts.js';
import { ContinuationQueue } from './continuations.js';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { validateHumanForms } from '../domain/human-forms.js';
import {
  reconcileOrphanRunning,
  type OrphanReconcileOptions,
} from '../domain/orphan-running.js';
import {
  createRun,
  transition,
  commandSchema,
  planSchema,
  WorkflowError,
  type Principal,
  type Run,
} from '../domain/workflow.js';
const keySchema = z.string().min(1).max(128);

/** One transaction covers the snapshot and its idempotent command receipt. */
export class Store {
  private db: DatabaseSync;
  readonly continuations: ContinuationQueue;
  constructor(path: string, options: { now?: () => number } = {}) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (scope TEXT NOT NULL, key TEXT NOT NULL, fingerprint TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(scope,key));
      CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, content BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS run_links (child_id TEXT PRIMARY KEY, parent_id TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS run_links_parent ON run_links(parent_id);
      PRAGMA user_version=3;`);
    this.continuations = new ContinuationQueue(
      this.db,
      (id) => this.get(id),
      options.now,
    );
  }
  private transact(
    scope: string,
    key: string,
    payload: unknown,
    action: () => Run,
  ): Run {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const previous = this.db
        .prepare(
          'SELECT fingerprint,response FROM receipts WHERE scope=? AND key=?',
        )
        .get(scope, key);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new WorkflowError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key reused with different content',
          );
        this.db.exec('COMMIT');
        return JSON.parse(previous.response as string) as Run;
      }
      const run = action();
      const data = JSON.stringify(run);
      this.db
        .prepare(
          'INSERT INTO runs(id,snapshot,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot',
        )
        .run(run.id, data, run.createdAt);
      this.db
        .prepare(
          'INSERT INTO receipts(scope,key,fingerprint,response) VALUES(?,?,?,?)',
        )
        .run(scope, key, fingerprint, data);
      const command = (payload as { command?: { type: string } }).command;
      this.continuations.onRunChanged(run, command?.type);
      this.db.exec('COMMIT');
      return run;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  create(
    input: unknown,
    actor: Principal,
    key: string,
    parentRunId?: string,
  ): Run {
    if (actor.role !== 'agent')
      throw new WorkflowError('FORBIDDEN', 'An agent creates the plan', 403);
    const plan = planSchema.parse(input);
    if (parentRunId !== undefined) z.string().uuid().parse(parentRunId);
    return this.transact(
      'create',
      keySchema.parse(key),
      { plan, actor, ...(parentRunId ? { parentRunId } : {}) },
      () => {
        validateHumanForms(plan);
        const run = createRun(plan, actor.id);
        if (parentRunId) {
          const parent = this.get(parentRunId);
          if (parent.status !== 'completed')
            throw new WorkflowError(
              'NOT_COMPLETED',
              'Continue only a completed run',
            );
          if (!plan.request)
            throw new WorkflowError(
              'REQUEST_REQUIRED',
              'A new user request is required',
              400,
            );
          const count = this.db
            .prepare(
              'SELECT count(*) AS count FROM run_links WHERE parent_id=?',
            )
            .get(parentRunId)!.count as number;
          if (count >= 32)
            throw new WorkflowError(
              'CYCLE_LIMIT',
              'A run supports up to 32 direct continuations',
              400,
            );
          run.origin = {
            runId: parent.id,
            revision: parent.revision,
            title: parent.title,
          };
          this.db
            .prepare('INSERT INTO run_links(child_id,parent_id) VALUES(?,?)')
            .run(run.id, parent.id);
        }
        return run;
      },
    );
  }
  command(id: string, input: unknown, actor: Principal): Run {
    const command = commandSchema.parse(input);
    const key = keySchema.parse(command.commandId);
    return this.transact(id, key, { command, actor }, () => {
      const current = this.get(id);
      // Authorization and revision validation precede authoring feedback.
      const updated = transition(current, command, actor);
      if (command.type === 'revise' && command.plan)
        validateHumanForms(command.plan, current);
      return updated;
    });
  }
  links(id: string): NonNullable<Run['links']> {
    const run = this.get(id);
    const link = (id: string) => {
      const item = this.get(id);
      return {
        id: item.id,
        title: item.title,
        status: item.status,
        request: item.request,
      };
    };
    return {
      ...(run.origin ? { previous: link(run.origin.runId) } : {}),
      next: this.db
        .prepare(
          'SELECT child_id FROM run_links WHERE parent_id=? ORDER BY rowid',
        )
        .all(id)
        .map((row) => link(row.child_id as string)),
    };
  }
  addArtifact(id: string, input: unknown, actor: Principal): Run {
    const data = artifactInputSchema.parse(input);
    const content =
      data.contentBase64 === undefined
        ? undefined
        : Buffer.from(data.contentBase64, 'base64');
    if (content && content.length > artifactLimit)
      throw new WorkflowError('TOO_LARGE', 'Artifact exceeds 10 MiB', 413);
    // Hash bytes for idempotency; receipts and run snapshots never duplicate the file.
    const { contentBase64: _content, ...metadata } = data;
    const sha256 =
      content && createHash('sha256').update(content).digest('hex');
    return this.transact(
      id,
      data.commandId,
      { artifact: { ...metadata, ...(content ? { sha256 } : {}) }, actor },
      () => {
        const artifact: Artifact = {
          id: crypto.randomUUID(),
          name: data.name,
          mediaType: data.mediaType,
          attempt: data.attempt,
          createdAt: new Date().toISOString(),
          ...(content ? { size: content.length, sha256 } : { url: data.url }),
        };
        const run = attachArtifact(this.get(id), artifact, data, actor);
        if (content)
          this.db
            .prepare('INSERT INTO artifacts(id,run_id,content) VALUES(?,?,?)')
            .run(artifact.id, id, content);
        return run;
      },
    );
  }
  artifactContent(runId: string, artifactId: string) {
    const artifact = this.get(runId)
      .steps.flatMap((step) => step.artifacts || [])
      .find((item) => item.id === artifactId);
    const row = this.db
      .prepare('SELECT content FROM artifacts WHERE id=? AND run_id=?')
      .get(artifactId, runId);
    if (!artifact || !row)
      throw new WorkflowError('NOT_FOUND', 'Artifact file not found', 404);
    return { artifact, content: row.content as Uint8Array };
  }
  get(id: string): Run {
    const row = this.db.prepare('SELECT snapshot FROM runs WHERE id=?').get(id);
    if (!row) throw new WorkflowError('NOT_FOUND', 'Run not found', 404);
    return JSON.parse(row.snapshot as string) as Run;
  }
  /**
   * Lazy orphan-running lease (ADR 0035). Persists only when an attempt is abandoned.
   * Invoked from authenticated GET/SSE projections — not a background tick.
   */
  reconcileOrphans(
    id: string,
    context: Pick<OrphanReconcileOptions, 'agentWaiting' | 'now'> = {},
  ): { run: Run; changed: boolean } {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const current = this.get(id);
      const next = reconcileOrphanRunning(current, {
        agentWaiting: context.agentWaiting,
        continuationStatus: this.continuations.state(id)?.status,
        ...(context.now !== undefined ? { now: context.now } : {}),
      });
      if (next.revision === current.revision) {
        this.db.exec('COMMIT');
        return { run: current, changed: false };
      }
      this.db
        .prepare(
          'INSERT INTO runs(id,snapshot,created_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot',
        )
        .run(next.id, JSON.stringify(next), next.createdAt);
      this.continuations.onRunChanged(next, 'abandon');
      this.db.exec('COMMIT');
      return { run: next, changed: true };
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  list(): Run[] {
    return this.db
      .prepare('SELECT snapshot FROM runs ORDER BY created_at DESC LIMIT 100')
      .all()
      .map((row) => JSON.parse(row.snapshot as string) as Run);
  }
  close() {
    this.db.close();
  }
}
