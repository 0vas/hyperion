import { matchesPort } from './value-types.js';
import { WorkflowError, type Plan, type Run, type Step } from './workflow.js';
import { matchesType } from './contracts.js';
const check = (ok: unknown, message: string): void => {
  if (!ok) throw new WorkflowError('INVALID_PLAN', message, 400);
};
export const automatic = (step: Pick<Step, 'kind'>) =>
  ['start', 'end', 'gateway'].includes(step.kind);

/**
 * Promote producer outputs to required when a required input binds them.
 * Repairs common agent-authored plans before validateProcess; does not invent ports
 * or relax branch-skip rules. Idempotent; clones so callers keep their object.
 */
export function normalizeRequiredBindings(plan: Plan): Plan {
  const next = structuredClone(plan);
  const byId = new Map(next.steps.map((step) => [step.id, step]));
  for (const step of next.steps) {
    for (const input of step.inputs || []) {
      if (!input.required || !input.source) continue;
      const output = byId
        .get(input.source.stepId)
        ?.outputs?.find((port) => port.name === input.source!.output);
      if (output && output.required !== true) output.required = true;
    }
  }
  return next;
}

export function validateProcess(plan: Plan) {
  const byId = new Map(plan.steps.map((s) => [s.id, s]));
  const next = (id: string) =>
    plan.steps.filter((s) => s.dependencies.includes(id));
  const cache = new Map<string, Set<string>>();
  const ancestors = (id: string): Set<string> => {
    if (cache.has(id)) return cache.get(id)!;
    const result = new Set(
      byId.get(id)!.dependencies.flatMap((dep) => [dep, ...ancestors(dep)]),
    );
    cache.set(id, result);
    return result;
  };
  // Conditional branch membership is also used to reject required data that may be skipped.
  const membership = new Map<string, Map<string, string>>();
  for (const s of plan.steps) {
    check(
      new Set((s.inputs || []).map((p) => p.name)).size ===
        (s.inputs || []).length,
      `Duplicate input on ${s.id}`,
    );
    check(
      new Set((s.outputs || []).map((p) => p.name)).size ===
        (s.outputs || []).length,
      `Duplicate output on ${s.id}`,
    );
    check(
      s.kind === 'gateway' ? Boolean(s.gateway) : !s.gateway,
      `Gateway definition mismatch: ${s.id}`,
    );
    if (automatic(s))
      check(
        !(s.inputs || []).length && !(s.outputs || []).length,
        'Structural nodes cannot declare task ports',
      );
  }
  if (plan.profile === 'bpmn-lite') {
    const starts = plan.steps.filter((s) => s.kind === 'start');
    const ends = plan.steps.filter((s) => s.kind === 'end');
    check(
      starts.length === 1 && ends.length === 1,
      'A process needs exactly one start and one end',
    );
    for (const s of plan.steps) {
      check(
        s.dependencies.length ===
          (s.kind === 'start'
            ? 0
            : s.gateway?.direction === 'join'
              ? s.dependencies.length
              : 1),
        `Invalid incoming flows: ${s.id}`,
      );
      check(
        next(s.id).length ===
          (s.kind === 'end'
            ? 0
            : s.gateway?.direction === 'split'
              ? next(s.id).length
              : 1),
        `Invalid outgoing flows: ${s.id}`,
      );
    }
    const visited = new Set<string>();
    const walk = (from: string, stop: string): string[] => {
      let id = from;
      const members: string[] = [];
      while (id !== stop) {
        const s = byId.get(id)!;
        check(s && !visited.has(id), `Crossed or repeated branch: ${id}`);
        visited.add(id);
        members.push(id);
        check(s.kind !== 'end', `Branch escapes its matching join: ${id}`);
        if (s.kind === 'gateway') {
          const g = s.gateway!;
          check(g.direction === 'split', `Unexpected join: ${id}`);
          const joins = plan.steps.filter(
            (j) => j.gateway?.direction === 'join' && j.gateway.splitId === id,
          );
          check(joins.length === 1, `Split ${id} needs one matching join`);
          const join = joins[0]!;
          check(join.gateway!.type === g.type, 'Split/join types must match');
          const routes = g.routes || [];
          const targets = routes.map((r) => r.target);
          check(
            !g.splitId &&
              routes.length >= 2 &&
              new Set(targets).size === targets.length,
            'Invalid split routes',
          );
          check(
            next(id).length === targets.length &&
              next(id).every((n) => targets.includes(n.id)),
            'Routes must match outgoing flows',
          );
          check(
            join.dependencies.length === targets.length,
            'Each branch needs one incoming flow at its join',
          );
          check(
            !join.gateway!.routes && !join.gateway!.defaultTarget,
            'Join cannot have routing conditions',
          );
          if (g.type === 'parallel')
            check(
              !g.defaultTarget && routes.every((r) => !r.when),
              'Parallel routes are unconditional',
            );
          else {
            check(
              Boolean(g.defaultTarget && targets.includes(g.defaultTarget)),
              'Conditional split needs a default route',
            );
            check(
              routes.every((r) => r.when || r.target === g.defaultTarget),
              'Non-default routes need conditions',
            );
            check(
              routes.every((r) => r.target !== g.defaultTarget || !r.when),
              'Default routes must not have a condition',
            );
          }
          for (const route of routes) {
            check(
              route.target !== join.id,
              'Empty branches are outside this profile',
            );
            const branch = walk(route.target, join.id);
            check(
              branch.filter((n) => join.dependencies.includes(n)).length === 1,
              'Branch must enter its join exactly once',
            );
            members.push(...branch);
            if (g.type !== 'parallel')
              for (const n of branch) {
                const contexts = membership.get(n) || new Map();
                contexts.set(id, route.target);
                membership.set(n, contexts);
              }
          }
          check(!visited.has(join.id), 'Join reused by multiple blocks');
          visited.add(join.id);
          members.push(join.id);
          id = next(join.id)[0]!.id;
        } else id = next(id)[0]!.id;
      }
      return members;
    };
    walk(starts[0]!.id, ends[0]!.id);
    visited.add(ends[0]!.id);
    check(visited.size === plan.steps.length, 'Unreachable process nodes');
  } else
    check(
      plan.steps.every((s) => !automatic(s)),
      'Structural nodes require profile bpmn-lite',
    );
  for (const s of plan.steps) {
    const preceding = ancestors(s.id);
    const sourcePort = (
      ref: { stepId: string; output: string },
      required: boolean,
      inputName: string,
    ) => {
      check(
        preceding.has(ref.stepId),
        `Data source must precede ${s.id}: ${ref.stepId}`,
      );
      const port = byId
        .get(ref.stepId)
        ?.outputs?.find((p) => p.name === ref.output);
      check(port, `Unknown output ${ref.stepId}.${ref.output}`);
      if (required) {
        check(
          port!.required,
          `Required input ${s.id}.${inputName} needs required source output ${ref.stepId}.${ref.output}`,
        );
        for (const [split, branch] of membership.get(ref.stepId) || [])
          check(
            membership.get(s.id)?.get(split) === branch,
            `Required source may be skipped: ${s.id}`,
          );
      }
      return port!;
    };
    for (const p of s.inputs || []) {
      check(
        [
          p.source !== undefined,
          p.value !== undefined,
          p.contextKey !== undefined,
        ].filter(Boolean).length <= 1,
        'An input must use one source: output, context or literal',
      );
      if (p.source)
        check(
          sourcePort(p.source, p.required, p.name).type === p.type,
          `Input type mismatch: ${s.id}.${p.name}`,
        );
      else if (p.contextKey) {
        const value = plan.context?.[p.contextKey];
        check(
          value === undefined ? !p.required : matchesPort(p, value),
          `Invalid context input: ${s.id}.${p.name}`,
        );
      } else
        check(
          p.value === undefined ? !p.required : matchesPort(p, p.value),
          `Invalid input literal: ${s.id}.${p.name}`,
        );
    }
    for (const r of s.gateway?.routes || [])
      if (r.when) {
        const port = sourcePort(r.when, false, 'when');
        check(
          matchesType(port.type, r.when.equals),
          `Condition type mismatch on ${s.id}`,
        );
      }
  }
}
export function resolveInputs(run: Run, step: Step) {
  const entries = (step.inputs || []).flatMap((p) => {
    const source = p.source
      ? run.steps.find((s) => s.id === p.source!.stepId)?.outputValues
      : undefined;
    const value = p.source
      ? source && Object.hasOwn(source, p.source.output)
        ? source[p.source.output]
        : undefined
      : p.contextKey
        ? run.context?.[p.contextKey]
        : p.value;
    if (value === undefined && !p.required) return [];
    if (!matchesPort(p, value))
      throw new WorkflowError(
        'INVALID_INPUT',
        `Missing or invalid input ${step.id}.${p.name}`,
        400,
      );
    return [[p.name, value]];
  });
  return Object.fromEntries(entries);
}
export function validateOutputs(
  step: Step,
  values: Record<string, unknown> | undefined,
) {
  const ports = step.outputs || [];
  const data = values || {};
  for (const name of Object.keys(data))
    if (!ports.some((p) => p.name === name))
      throw new WorkflowError(
        'INVALID_OUTPUT',
        `Undeclared output: ${name}`,
        400,
      );
  for (const port of ports) {
    const present = Object.hasOwn(data, port.name);
    if (
      (port.required && !present) ||
      (present && !matchesPort(port, data[port.name]))
    )
      throw new WorkflowError(
        'INVALID_OUTPUT',
        `Missing or invalid output: ${port.name} (${port.type})`,
        400,
      );
  }
  return data;
}
export function refreshProcess(run: Run) {
  if (run.status !== 'active') return;
  const byId = new Map(run.steps.map((s) => [s.id, s]));
  const record = (step: Step) =>
    run.events.push({
      sequence: (run.events.at(-1)?.sequence || 0) + 1,
      type: 'route',
      actor: 'hyperion',
      at: run.updatedAt,
      stepId: step.id,
      message: step.result || 'Rama omitida por las condiciones del proceso',
    });
  let changed = true;
  while (changed) {
    changed = false;
    for (const step of run.steps) {
      if (step.status !== 'blocked') continue;
      const deps = step.dependencies.map((id) => byId.get(id)!);
      if (!deps.every((s) => ['completed', 'skipped'].includes(s.status)))
        continue;
      const isJoin = step.gateway?.direction === 'join';
      const activated = deps.map(
        (s) =>
          s.status === 'completed' &&
          (s.gateway?.direction !== 'split' ||
            s.selectedBranches?.includes(step.id)),
      );
      const enabled =
        !deps.length ||
        (isJoin ? activated.some(Boolean) : activated.every(Boolean));
      if (!enabled) {
        step.status = 'skipped';
        record(step);
        changed = true;
        continue;
      }
      if (automatic(step)) {
        if (step.gateway?.direction === 'split') {
          const g = step.gateway;
          const routes = g.routes!;
          const candidates =
            g.type === 'parallel'
              ? routes
              : routes.filter((r) => {
                  if (!r.when) return false;
                  const values = byId.get(r.when.stepId)?.outputValues;
                  return (
                    values &&
                    Object.hasOwn(values, r.when.output) &&
                    values[r.when.output] === r.when.equals
                  );
                });
          step.selectedBranches = candidates.length
            ? (g.type === 'exclusive'
                ? candidates.slice(0, 1)
                : candidates
              ).map((r) => r.target)
            : [g.defaultTarget!];
        }
        step.status = 'completed';
        step.completedAt = run.updatedAt;
        step.result = step.selectedBranches
          ? `Rutas activadas: ${step.selectedBranches.join(', ')}`
          : step.kind === 'start'
            ? 'Proceso iniciado'
            : step.kind === 'end'
              ? 'Proceso finalizado'
              : 'Ramas activas reunidas';
        record(step);
      } else {
        step.inputValues = resolveInputs(run, step);
        step.status = step.kind === 'agent' ? 'ready' : 'waiting';
      }
      changed = true;
    }
  }
  if (run.steps.every((s) => ['completed', 'skipped'].includes(s.status)))
    run.status = 'completed';
}
