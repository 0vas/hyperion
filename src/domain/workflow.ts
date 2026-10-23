import type { Artifact } from './artifacts.js';
import type { ContinuationState } from './continuation.js';
import { z } from 'zod';
import type { AvailableContext } from './context.js';
import { validateJobs } from './jobs.js';

import {
  identifier,
  inputSchema,
  portSchema,
  gatewaySchema,
  outputValuesSchema,
  traceSchema,
} from './contracts.js';
import {
  validateProcess,
  normalizeRequiredBindings,
  refreshProcess,
  resolveInputs,
  validateOutputs,
} from './process.js';
export const stepSchema = z
  .object({
    id: identifier,
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4000).default(''),
    kind: z.enum(['agent', 'manual', 'approval', 'start', 'end', 'gateway']),
    jobId: identifier.optional(),
    interaction: z
      .object({
        question: z.string().trim().min(1).max(500),
        context: z.string().trim().min(1).max(1000),
        next: z.string().trim().min(1).max(1000),
      })
      .strict()
      .optional(),
    phase: z.string().trim().min(1).max(100).optional(),
    inputs: z.array(inputSchema).max(30).optional(),
    outputs: z.array(portSchema).max(30).optional(),
    gateway: gatewaySchema.optional(),
    dependencies: z.array(identifier).max(100).default([]),
  })
  .strict();
export const planSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    profile: z.literal('bpmn-lite').optional(),
    context: z.record(identifier, z.json()).optional(),
    request: z.string().trim().min(1).max(8000).optional(),
    description: z.string().trim().max(4000).default(''),
    jobs: z
      .array(
        z
          .object({
            id: identifier,
            title: z.string().trim().min(1).max(160),
            description: z.string().trim().max(1000).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30)
      .optional(),
    steps: z.array(stepSchema).min(1).max(100),
  })
  .strict();
export const commandSchema = z
  .object({
    type: z.enum([
      'start',
      'complete',
      'fail',
      'log',
      'approve',
      'reject',
      'submit',
      'retry',
      'pause',
      'resume',
      'cancel',
      'revise',
    ]),
    plan: planSchema.optional(),
    stepId: identifier.optional(),
    message: z.string().trim().max(8000).optional(),
    outputs: outputValuesSchema.optional(),
    trace: traceSchema.optional(),
    attempt: z.number().int().positive().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
    commandId: z.string().min(1).max(128).optional(),
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;
export type Command = z.infer<typeof commandSchema>;
export type Principal = { role: 'agent' | 'human'; id: string };
export type StepStatus =
  | 'blocked'
  | 'ready'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'skipped';
export type Step = Plan['steps'][number] & {
  artifacts?: Artifact[];
  availableContext?: AvailableContext;
  status: StepStatus;
  selectedBranches?: string[];
  inputValues?: Record<string, unknown>;
  outputValues?: Record<string, unknown>;
  attempt: number;
  result?: string;
  startedAt?: string;
  completedAt?: string;
};
export type RunEvent = {
  trace?: z.infer<typeof traceSchema>;
  sequence: number;
  type: string;
  actor: string;
  at: string;
  stepId?: string;
  message: string;
};
export type PlanChange = {
  revision: number;
  at: string;
  actor: string;
  reason: string;
  previousPlan: Plan;
  nextPlan: Plan;
  added: string[];
  removed: string[];
  changed: string[];
};
export type RunLink = {
  id: string;
  title: string;
  request?: string;
  status: Run['status'];
};
export type Run = {
  /** Immutable provenance of a new cycle. The completed parent is never reopened. */
  origin?: { runId: string; revision: number; title: string };
  /** Read projection: does not change the parent's revision or execution history. */
  links?: { previous?: RunLink; next: RunLink[] };
  /** Live transport presence; never persisted as workflow state. */
  continuation?: ContinuationState;
  agentWaiting?: boolean;
  agentPresenceAt?: number;
  planChanges?: PlanChange[];
  context?: Plan['context'];
  jobs?: Plan['jobs'];
  profile?: 'bpmn-lite';
  request?: string;
  id: string;
  title: string;
  description: string;
  coordinator: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled' | 'rejected';
  revision: number;
  createdAt: string;
  updatedAt: string;
  steps: Step[];
  events: RunEvent[];
};
export class WorkflowError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
function requireCondition(
  ok: unknown,
  code: string,
  message: string,
  status = 409,
): asserts ok {
  if (!ok) throw new WorkflowError(code, message, status);
}
function refresh(run: Run) {
  if (run.profile === 'bpmn-lite') {
    refreshProcess(run);
    return;
  }
  for (const step of run.steps) {
    if (!['blocked', 'ready', 'waiting'].includes(step.status)) continue;
    const enabled = step.dependencies.every(
      (id) => run.steps.find((s) => s.id === id)!.status === 'completed',
    );
    if (enabled) step.inputValues = resolveInputs(run, step);
    step.status = enabled
      ? step.kind === 'agent'
        ? 'ready'
        : 'waiting'
      : 'blocked';
  }
  if (run.steps.every((step) => step.status === 'completed'))
    run.status = 'completed';
}
export function createRun(input: unknown, coordinator: string): Run {
  const plan = normalizeRequiredBindings(planSchema.parse(input));
  const byId = new Map(plan.steps.map((step) => [step.id, step]));
  requireCondition(
    byId.size === plan.steps.length,
    'INVALID_PLAN',
    'Duplicate step IDs',
    400,
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string) {
    requireCondition(
      !visiting.has(id),
      'INVALID_PLAN',
      'Dependency cycle detected',
      400,
    );
    if (visited.has(id)) return;
    const step = byId.get(id);
    requireCondition(step, 'INVALID_PLAN', `Missing dependency: ${id}`, 400);
    requireCondition(
      new Set(step.dependencies).size === step.dependencies.length,
      'INVALID_PLAN',
      'Duplicate dependencies',
      400,
    );
    visiting.add(id);
    step.dependencies.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  plan.steps.forEach((step) => visit(step.id));
  validateProcess(plan);
  try {
    validateJobs(plan);
  } catch (error) {
    throw new WorkflowError(
      'INVALID_PLAN',
      error instanceof Error ? error.message : 'Invalid jobs',
      400,
    );
  }
  const now = new Date().toISOString();
  const run: Run = {
    ...plan,
    id: crypto.randomUUID(),
    coordinator,
    status: 'active',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    steps: plan.steps.map((step) => ({
      ...step,
      status: 'blocked',
      attempt: 0,
    })),
    events: [
      {
        sequence: 1,
        type: 'created',
        actor: coordinator,
        at: now,
        message: 'Plan registrado. Esperando ejecución.',
      },
    ],
  };
  refresh(run);
  return run;
}
export function transition(
  current: Run,
  input: unknown,
  actor: Principal,
): Run {
  const command = commandSchema.parse(input);
  const { type, stepId } = command;
  requireCondition(
    command.attempt === undefined || ['complete', 'fail', 'log'].includes(type),
    'INVALID_COMMAND',
    'Attempt belongs to an execution result',
    400,
  );
  let message = command.message || '';
  requireCondition(
    !command.plan || type === 'revise',
    'INVALID_COMMAND',
    'Plan belongs to a revision',
    400,
  );
  requireCondition(
    !command.outputs || ['complete', 'submit', 'approve'].includes(type),
    'INVALID_COMMAND',
    'Outputs belong to task completion',
    400,
  );
  requireCondition(
    !command.trace || type === 'log',
    'INVALID_COMMAND',
    'Trace belongs to a log command',
    400,
  );
  requireCondition(
    !['completed', 'cancelled', 'rejected'].includes(current.status),
    'TERMINAL',
    'Run is terminal',
  );
  if (command.expectedRevision !== undefined)
    requireCondition(
      command.expectedRevision === current.revision,
      'REVISION_CONFLICT',
      'Revision changed; reload before deciding',
    );
  if (actor.role === 'agent')
    requireCondition(
      actor.id === current.coordinator,
      'FORBIDDEN',
      'Only the designated coordinator may execute this run',
      403,
    );
  const humanActions = [
    'approve',
    'reject',
    'submit',
    'pause',
    'resume',
    'cancel',
  ];
  if (humanActions.includes(type))
    requireCondition(
      actor.role === 'human',
      'FORBIDDEN',
      'This action requires a human',
      403,
    );
  if (['start', 'complete', 'fail', 'log', 'revise'].includes(type))
    requireCondition(
      actor.role === 'agent',
      'FORBIDDEN',
      'This action requires an agent',
      403,
    );
  if (current.status === 'paused')
    requireCondition(
      ['resume', 'cancel', 'complete', 'fail', 'log', 'revise'].includes(type),
      'PAUSED',
      'Run is paused',
    );
  const run = structuredClone(current);
  const now = new Date().toISOString();
  run.updatedAt = now;
  if (type === 'revise') {
    requireCondition(
      !stepId && command.plan,
      'INVALID_COMMAND',
      'Provide a complete plan without stepId',
      400,
    );
    requireCondition(
      command.expectedRevision !== undefined,
      'REVISION_REQUIRED',
      'Plan revision requires expectedRevision',
      400,
    );
    requireCondition(
      message.length > 0,
      'EVIDENCE_REQUIRED',
      'A reason for the revision is required',
      400,
    );
    revisePlan(run, command.plan, message, now, actor.id);
  } else if (['pause', 'resume', 'cancel'].includes(type)) {
    requireCondition(
      !stepId,
      'INVALID_COMMAND',
      'Run commands must not include a step ID',
      400,
    );
    if (type === 'pause') {
      requireCondition(
        run.status === 'active',
        'INVALID_STATE',
        'Run must be active',
      );
      run.status = 'paused';
    }
    if (type === 'resume') {
      requireCondition(
        run.status === 'paused',
        'INVALID_STATE',
        'Run must be paused',
      );
      run.status = 'active';
    }
    if (type === 'cancel') run.status = 'cancelled';
  } else {
    const step = run.steps.find((s) => s.id === stepId);
    requireCondition(step, 'NOT_FOUND', 'Step not found', 404);
    if (['start', 'complete', 'fail', 'log', 'retry'].includes(type))
      requireCondition(
        step.kind === 'agent',
        'INVALID_KIND',
        'This action requires an agent step',
      );
    if (
      type === 'submit' &&
      !message &&
      step.outputs?.length &&
      Object.keys(command.outputs || {}).length
    )
      message = 'Decisión guardada en los datos del paso.';
    if (['complete', 'fail', 'submit', 'reject', 'log'].includes(type))
      requireCondition(
        message.length > 0,
        'EVIDENCE_REQUIRED',
        'A non-empty result or explanation is required',
        400,
      );
    switch (type) {
      case 'start':
        requireCondition(
          step.status === 'ready',
          'NOT_READY',
          'Step must be ready',
        );
        step.status = 'running';
        step.attempt += 1;
        step.startedAt = now;
        break;
      case 'complete':
      case 'fail':
      case 'log':
        requireCondition(
          step.status === 'running',
          'NOT_RUNNING',
          'Step must be running',
        );
        requireCondition(
          command.attempt === step.attempt ||
            (command.attempt === undefined && step.attempt === 1),
          'STALE_ATTEMPT',
          'Send the attempt returned by start; an earlier attempt cannot update this task',
        );
        if (type === 'complete')
          step.outputValues = validateOutputs(step, command.outputs);
        if (type !== 'log') {
          step.status = type === 'complete' ? 'completed' : 'failed';
          step.result = message;
          step.completedAt = now;
        }
        break;
      case 'submit':
      case 'approve':
      case 'reject':
        requireCondition(
          step.kind === (type === 'submit' ? 'manual' : 'approval'),
          'INVALID_KIND',
          'Wrong human action for step kind',
        );
        requireCondition(
          step.status === 'waiting',
          'NOT_WAITING',
          'Step must be waiting for human input',
        );
        if (type !== 'reject')
          step.outputValues = validateOutputs(step, command.outputs);
        step.status = type === 'reject' ? 'rejected' : 'completed';
        step.result = message || 'Aprobado por el usuario';
        step.completedAt = now;
        if (type === 'reject') run.status = 'rejected';
        break;
      case 'retry':
        requireCondition(
          ['failed', 'ready', 'running'].includes(step.status),
          'NOT_RETRYABLE',
          'Only a failed, ready or running agent step can be retried',
        );
        message ||=
          step.status === 'running'
            ? `Recuperación solicitada. Intento ${step.attempt} invalidado; revisar acciones externas antes de repetirlas.`
            : 'Se solicitó al agente retomar esta tarea.';
        step.status = 'blocked';
        delete step.result;
        delete step.outputValues;
        delete step.startedAt;
        delete step.completedAt;
        break;
    }
  }
  run.revision += 1;
  run.updatedAt = now;
  run.events.push({
    sequence: (run.events.at(-1)?.sequence || 0) + 1,
    type,
    actor: actor.id,
    at: now,
    ...(stepId ? { stepId } : {}),
    message,
    ...(command.trace ? { trace: command.trace } : {}),
  });
  if (!['cancelled', 'rejected'].includes(run.status)) refresh(run);
  return run;
}

function definition(step: Step): Plan['steps'][number] {
  return stepSchema.parse(
    Object.fromEntries(
      Object.keys(stepSchema.shape)
        .filter((key) => Object.hasOwn(step, key))
        .map((key) => [key, step[key as keyof Step]]),
    ),
  );
}
export function planFromRun(run: Run): Plan {
  return planSchema.parse(
    Object.fromEntries(
      Object.keys(planSchema.shape)
        .filter((key) => Object.hasOwn(run, key))
        .map((key) => [
          key,
          key === 'steps' ? run.steps.map(definition) : run[key as keyof Run],
        ]),
    ),
  );
}
const equalPlanPart = (a: unknown, b: unknown) => {
  const normalize = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(normalize)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, v]) => [key, normalize(v)]),
          )
        : value;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
};
function revisePlan(
  run: Run,
  next: Plan,
  reason: string,
  at: string,
  actor: string,
) {
  requireCondition(
    !run.steps.some((s) => s.status === 'running'),
    'RUNNING_TASKS',
    'Wait for running tasks to finish before revising',
  );
  const previous = planFromRun(run);
  for (const key of ['request', 'context', 'profile'] as const)
    requireCondition(
      equalPlanPart(previous[key], next[key]),
      'PROTECTED_CONTEXT',
      `Preserve the original ${key}; pass new requirements in future task inputs`,
    );
  const protectedSteps = run.steps.filter(
    (s) =>
      ['completed', 'skipped', 'waiting'].includes(s.status) || s.attempt > 0,
  );
  for (const step of protectedSteps) {
    requireCondition(
      equalPlanPart(
        definition(step),
        next.steps.find((s) => s.id === step.id),
      ),
      'PROTECTED_STEP',
      `Preserve executed or presented step: ${step.id}`,
    );
    if (step.jobId)
      requireCondition(
        equalPlanPart(
          previous.jobs?.find((j) => j.id === step.jobId),
          next.jobs?.find((j) => j.id === step.jobId),
        ),
        'PROTECTED_JOB',
        `Preserve executed job: ${step.jobId}`,
      );
  }
  const validated = createRun(next, run.coordinator);
  const protectedIds = new Set(protectedSteps.map((s) => s.id));
  const added = next.steps
    .filter((s) => !previous.steps.some((p) => p.id === s.id))
    .map((s) => s.id);
  const removed = previous.steps
    .filter((s) => !next.steps.some((p) => p.id === s.id))
    .map((s) => s.id);
  const changed = next.steps
    .filter((s) =>
      previous.steps.some((p) => p.id === s.id && !equalPlanPart(p, s)),
    )
    .map((s) => s.id);
  requireCondition(
    !equalPlanPart(previous, next),
    'NO_CHANGE',
    'The plan has no changes',
    400,
  );
  requireCondition(
    next.steps.some((s) => !protectedIds.has(s.id)),
    'NO_FUTURE_WORK',
    'A revised plan must retain future work',
    400,
  );
  run.planChanges ||= [];
  run.planChanges.push({
    revision: run.revision + 1,
    at,
    actor,
    reason,
    previousPlan: previous,
    nextPlan: next,
    added,
    removed,
    changed,
  });
  run.title = next.title;
  run.description = next.description;
  if (next.jobs) run.jobs = next.jobs;
  else delete run.jobs;
  run.steps = validated.steps.map((s) =>
    protectedIds.has(s.id)
      ? run.steps.find((old) => old.id === s.id)!
      : { ...definition(s), status: 'blocked', attempt: 0 },
  );
  run.status = 'paused';
}
