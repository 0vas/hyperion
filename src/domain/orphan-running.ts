import type { ContinuationState } from './continuation.js';
import { refreshRun, type Run, type Step } from './workflow.js';

/** Wall time without attempt progress before an orphan running agent step is abandoned. */
export const ORPHAN_RUNNING_LEASE_MS = 180_000;

export const ORPHAN_ABANDON_MESSAGE =
  'Attempt abandoned: no progress while no agent wait was active.';

/** Distinct from agent `fail`; step status is still `failed`. */
export const ORPHAN_ABANDON_EVENT = 'abandon';

export const ORPHAN_ABANDON_ACTOR = 'hyperion';

const PROGRESS_EVENT_TYPES = new Set([
  'start',
  'log',
  'complete',
  'fail',
  'artifact',
  'abandon',
]);

const CONTINUATION_OWNS_TURN = new Set<ContinuationState['status']>([
  'waiting',
  'queued',
  'leased',
  'delivered',
  'uncertain',
]);

export type OrphanReconcileOptions = {
  now?: number;
  agentWaiting?: boolean;
  continuationStatus?: ContinuationState['status'];
  leaseMs?: number;
};

/** Latest progress timestamp (epoch ms) for the step's current attempt, or null. */
export function lastAttemptProgressAt(run: Run, step: Step): number | null {
  if (!step.startedAt || step.attempt < 1) return null;
  const startMs = Date.parse(step.startedAt);
  if (!Number.isFinite(startMs)) return null;
  let latest = startMs;
  for (const event of run.events) {
    if (event.stepId !== step.id) continue;
    if (!PROGRESS_EVENT_TYPES.has(event.type)) continue;
    const at = Date.parse(event.at);
    if (!Number.isFinite(at) || at < startMs) continue;
    if (at > latest) latest = at;
  }
  for (const artifact of step.artifacts || []) {
    if (artifact.attempt !== step.attempt) continue;
    const at = Date.parse(artifact.createdAt);
    if (!Number.isFinite(at) || at < startMs) continue;
    if (at > latest) latest = at;
  }
  return latest;
}

function continuationOwnsTurn(
  status: ContinuationState['status'] | undefined,
): boolean {
  return !!status && CONTINUATION_OWNS_TURN.has(status);
}

/**
 * Deterministic safety net: fail orphan agent attempts that stayed `running`
 * with no wait, no in-flight continuation, and no progress for the lease.
 * Returns the same object when nothing changes.
 */
export function reconcileOrphanRunning(
  current: Run,
  options: OrphanReconcileOptions = {},
): Run {
  if (!['active', 'paused'].includes(current.status)) return current;
  if (options.agentWaiting) return current;
  if (continuationOwnsTurn(options.continuationStatus)) return current;

  const now = options.now ?? Date.now();
  const leaseMs = options.leaseMs ?? ORPHAN_RUNNING_LEASE_MS;
  const stale = current.steps.filter((step) => {
    if (step.kind !== 'agent' || step.status !== 'running') return false;
    const progressAt = lastAttemptProgressAt(current, step);
    return progressAt !== null && now - progressAt > leaseMs;
  });
  if (!stale.length) return current;

  const run = structuredClone(current);
  const at = new Date(now).toISOString();
  for (const prior of stale) {
    const step = run.steps.find((s) => s.id === prior.id)!;
    step.status = 'failed';
    step.result = ORPHAN_ABANDON_MESSAGE;
    step.completedAt = at;
    run.events.push({
      sequence: (run.events.at(-1)?.sequence || 0) + 1,
      type: ORPHAN_ABANDON_EVENT,
      actor: ORPHAN_ABANDON_ACTOR,
      at,
      stepId: step.id,
      message: ORPHAN_ABANDON_MESSAGE,
    });
  }
  run.revision += 1;
  run.updatedAt = at;
  refreshRun(run);
  return run;
}
