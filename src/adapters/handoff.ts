import type { Run } from '../domain/workflow.js';
import type { HyperionClient } from './client.js';
import { appendHarnessLog } from './harness-log.js';

/** Advice is recomputed from state, never recorded as completed work. */
export function handoff(run: Run) {
  if (run.status !== 'active')
    return {
      action: run.status,
      instruction:
        'Respect this state. Do not start work while paused or after the run ends.',
    };
  const ready = run.steps
    .filter((s) => s.kind === 'agent' && s.status === 'ready')
    .map((s) => s.id);
  if (ready.length)
    return {
      action: 'execute',
      stepIds: ready,
      instruction:
        'Read the saved inputs, start ready tasks and execute their real work NOW in this turn. Do not ask the user to repeat their answer or send another message.',
    };
  if (run.steps.some((s) => s.status === 'running'))
    return {
      action: 'inspect',
      instruction:
        'Continue your active work or reconcile the running execution. Do not start a duplicate attempt.',
    };
  if (run.continuation?.status === 'waiting')
    return {
      action: 'suspended',
      instruction:
        'The durable connector owns resumption. Show the canvas URL and end this turn. Do not keep a model waiting or ask for another chat message. Delivery is not execution.',
    };
  if (run.steps.some((s) => s.status === 'waiting'))
    return {
      action: 'wait',
      tool: 'hyperion_wait',
      arguments: {
        runId: run.id,
        afterRevision: run.revision,
        timeoutSeconds: 30,
      },
      cli: ['follow', run.id],
      instruction:
        'Show the canvas URL in a progress message and keep this turn open. Wait for the canvas response; renew unchanged waits. A timeout is not an answer. Do not end with “avísame” or require a second chat message.',
    };
  return {
    action: 'inspect',
    instruction:
      'Inspect failed or blocked tasks and their logs. Do not invent progress or retry external effects blindly.',
  };
}
export const withHandoff = (run: Run) => ({ ...run, agentNext: handoff(run) });
/** The CLI's bounded invocation has ended; it no longer owns a wait. */
export function withGuideResult(run: Run) {
  const result = withHandoff(run);
  if (result.agentNext.action !== 'wait') return result;
  appendHarnessLog('connector_absent', {
    runId: run.id,
    context: 'guide_ended',
  });
  return {
    ...result,
    agentNext: {
      action: 'disconnected',
      instruction:
        'The bounded guide has ended. No resumable connector is assigned. Report this once, with the saved canvas URL, and do not renew unchanged waits indefinitely. Do not claim to be connected or to resume a closed chat automatically. Read current state before any later continuation; saved answers never need to be repeated.',
    },
  };
}
type Progress = {
  event: 'waiting';
  runId: string;
  url: string;
  agentNext: ReturnType<typeof handoff>;
};

/** Keep the invoking tool alive across short waits; the host still executes ready work. */
export async function followHumanInput(
  client: HyperionClient,
  initial: Run,
  onProgress: (progress: Progress) => void | Promise<void>,
  { waitSeconds = 30, maxSeconds = 600 } = {},
): Promise<Run> {
  if (
    !Number.isFinite(waitSeconds) ||
    waitSeconds <= 0 ||
    waitSeconds > 55 ||
    !Number.isFinite(maxSeconds) ||
    maxSeconds < 0 ||
    maxSeconds > 600
  )
    throw new Error('Invalid guided wait limits');
  // A retried create may return an old idempotent receipt. Always follow current state.
  let run = await client.get(initial.id);
  const deadline = performance.now() + maxSeconds * 1000;
  let announcedRevision: number | undefined;
  while (handoff(run).action === 'wait') {
    const remaining = (deadline - performance.now()) / 1000;
    if (remaining <= 0) {
      appendHarnessLog('wait_expired', {
        runId: run.id,
        afterRevision: run.revision,
        revision: run.revision,
        context: 'guide_deadline',
      });
      return client.get(run.id);
    }
    if (announcedRevision !== run.revision) {
      appendHarnessLog('wait_armed', {
        runId: run.id,
        afterRevision: run.revision,
        timeoutSeconds: Math.min(
          waitSeconds,
          Math.max(0, (deadline - performance.now()) / 1000),
        ),
      });
      await onProgress({
        event: 'waiting',
        runId: run.id,
        url: client.link(run),
        agentNext: handoff(run),
      });
      announcedRevision = run.revision;
    }
    const armedRevision = run.revision;
    const timeoutSeconds = Math.min(
      waitSeconds,
      Math.max(0, (deadline - performance.now()) / 1000),
    );
    run = await client.wait(run.id, armedRevision, timeoutSeconds);
    if (
      run.revision <= armedRevision &&
      run.status === 'active' &&
      run.continuation?.status !== 'waiting' &&
      handoff(run).action === 'wait'
    )
      appendHarnessLog('wait_expired', {
        runId: run.id,
        afterRevision: armedRevision,
        revision: run.revision,
      });
  }
  return run;
}
