import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createRun,
  planSchema,
  transition,
  type Run,
} from '../src/domain/workflow.js';
import {
  normalizeRequiredBindings,
  validateProcess,
} from '../src/domain/process.js';
const agent = { role: 'agent' as const, id: 'codex' };
const human = { role: 'human' as const, id: 'user' };
const field = (name: string) => ({ name, type: 'boolean', required: true });

/** Agent-authored shape that used to fail create: required input, optional producer output. */
function folderSizeStylePlan() {
  return {
    title: 'Folder size report (Excel)',
    profile: 'bpmn-lite' as const,
    request: 'Use Hyperion for create a excel of my folders and their size',
    jobs: [{ id: 'report', title: 'Build folder size Excel report' }],
    steps: [
      { id: 'start', kind: 'start' as const, title: 'Start' },
      {
        id: 'clarify_scope',
        kind: 'manual' as const,
        jobId: 'report',
        title: 'Clarify folder scope',
        dependencies: ['start'],
        interaction: {
          question: 'Which folders should I measure?',
          context: 'Need target folders and access method.',
          next: 'Then scan and total sizes.',
        },
        outputs: [
          {
            name: 'folder_scope',
            type: 'string' as const,
            required: true,
            description: 'Folders and access method',
          },
        ],
      },
      {
        id: 'scan_folders',
        kind: 'agent' as const,
        jobId: 'report',
        title: 'Scan folders and measure sizes',
        dependencies: ['clarify_scope'],
        inputs: [
          {
            name: 'folder_scope',
            type: 'string' as const,
            required: true,
            source: { stepId: 'clarify_scope', output: 'folder_scope' },
          },
        ],
        outputs: [
          {
            name: 'folder_sizes',
            type: 'array' as const,
            description: 'List of {folder, size_bytes}',
          },
        ],
      },
      {
        id: 'build_excel',
        kind: 'agent' as const,
        jobId: 'report',
        title: 'Build Excel file',
        dependencies: ['scan_folders'],
        inputs: [
          {
            name: 'folder_sizes',
            type: 'array' as const,
            required: true,
            source: { stepId: 'scan_folders', output: 'folder_sizes' },
          },
        ],
        outputs: [
          {
            name: 'xlsx_file',
            type: 'string' as const,
            required: true,
            description: 'Path or link to the Excel file',
          },
        ],
      },
      {
        id: 'end',
        kind: 'end' as const,
        title: 'End',
        dependencies: ['build_excel'],
      },
    ],
  };
}
export function processPlan(type = 'inclusive', reversed = false) {
  const steps = [
    { id: 'start', title: 'Inicio', kind: 'start' },
    {
      id: 'choice',
      title: 'Elegir revisiones',
      kind: 'manual',
      dependencies: ['start'],
      outputs: [field('docs'), field('code')],
    },
    {
      id: 'split',
      title: 'Elegir rutas',
      kind: 'gateway',
      dependencies: ['choice'],
      gateway: {
        type,
        direction: 'split',
        routes:
          type === 'parallel'
            ? [{ target: 'docs' }, { target: 'code' }]
            : [
                {
                  target: 'docs',
                  when: { stepId: 'choice', output: 'docs', equals: true },
                },
                {
                  target: 'code',
                  when: { stepId: 'choice', output: 'code', equals: true },
                },
                { target: 'fallback' },
              ],
        ...(type === 'parallel' ? {} : { defaultTarget: 'fallback' }),
      },
    },
    {
      id: 'docs',
      title: 'Revisar documentación',
      kind: 'agent',
      dependencies: ['split'],
      inputs: [
        {
          name: 'enabled',
          type: 'boolean',
          required: true,
          source: { stepId: 'choice', output: 'docs' },
        },
      ],
      outputs: [{ name: 'report', type: 'string', required: true }],
    },
    {
      id: 'code',
      title: 'Revisar código',
      kind: 'agent',
      dependencies: ['split'],
    },
    {
      id: 'join',
      title: 'Unir rutas',
      kind: 'gateway',
      dependencies:
        type === 'parallel' ? ['docs', 'code'] : ['docs', 'code', 'fallback'],
      gateway: { type, direction: 'join', splitId: 'split' },
    },
    {
      id: 'approve',
      title: 'Aprobar',
      kind: 'approval',
      dependencies: ['join'],
    },
    { id: 'end', title: 'Fin', kind: 'end', dependencies: ['approve'] },
  ];
  if (type !== 'parallel')
    steps.push({
      id: 'fallback',
      title: 'Sin revisiones seleccionadas',
      kind: 'agent',
      dependencies: ['split'],
    });
  return {
    title: 'Proceso',
    profile: 'bpmn-lite',
    steps: reversed ? steps.reverse() : steps,
  };
}
const state = (r: Run, id: string) => r.steps.find((s) => s.id === id)!;
const choose = (type: string, docs: boolean, code: boolean) =>
  transition(
    createRun(processPlan(type), 'codex'),
    {
      type: 'submit',
      stepId: 'choice',
      message: 'Mi selección',
      outputs: { docs, code },
    },
    human,
  );
const finish = (r: Run, id: string) =>
  transition(
    transition(r, { type: 'start', stepId: id }, agent),
    {
      type: 'complete',
      stepId: id,
      message: 'Revisión real',
      ...(id === 'docs'
        ? { outputs: { report: 'Documentación revisada' } }
        : {}),
    },
    agent,
  );

test('inclusive joins wait for exactly the activated branches, including fallback', () => {
  for (const [docs, code] of [
    [true, false],
    [false, true],
    [true, true],
    [false, false],
  ]) {
    let run = choose('inclusive', docs!, code!);
    const selected = docs
      ? ['docs', ...(code ? ['code'] : [])]
      : code
        ? ['code']
        : ['fallback'];
    assert.deepEqual(state(run, 'split').selectedBranches, selected);
    for (const id of ['docs', 'code', 'fallback'])
      assert.equal(
        state(run, id).status,
        selected.includes(id) ? 'ready' : 'skipped',
      );
    for (const [index, id] of selected.entries()) {
      assert.equal(state(run, 'approve').status, 'blocked');
      run = finish(run, id);
      assert.equal(
        state(run, 'join').status,
        index === selected.length - 1 ? 'completed' : 'blocked',
      );
    }
    run = transition(run, { type: 'approve', stepId: 'approve' }, human);
    assert.equal(state(run, 'end').status, 'completed');
    assert.equal(run.status, 'completed');
  }
});
test('exclusive selects one route in declared order; skipped work cannot start', () => {
  let run = choose('exclusive', true, true);
  assert.deepEqual(state(run, 'split').selectedBranches, ['docs']);
  assert.throws(() =>
    transition(run, { type: 'start', stepId: 'code' }, agent),
  );
  run = finish(run, 'docs');
  assert.equal(state(run, 'approve').status, 'waiting');
});
test('parallel branches both execute; structural nodes never require an agent command', () => {
  let run = choose('parallel', false, false);
  assert.equal(state(run, 'start').status, 'completed');
  assert.equal(state(run, 'code').status, 'ready');
  assert.throws(() =>
    transition(run, { type: 'start', stepId: 'split' }, agent),
  );
  run = finish(run, 'docs');
  assert.equal(state(run, 'approve').status, 'blocked');
  run = finish(run, 'code');
  assert.equal(state(run, 'approve').status, 'waiting');
});
test('typed outputs and resolved inputs are enforced before progressing', () => {
  const initial = createRun(processPlan(), 'codex');
  for (const outputs of [
    { docs: true },
    { docs: 'yes', code: false },
    { docs: true, code: false, secret: 'undeclared' },
  ])
    assert.throws(() =>
      transition(
        initial,
        { type: 'submit', stepId: 'choice', message: 'Test', outputs },
        human,
      ),
    );
  let run = choose('inclusive', true, false);
  assert.deepEqual(state(run, 'docs').inputValues, { enabled: true });
  run = transition(run, { type: 'start', stepId: 'docs' }, agent);
  assert.throws(() =>
    transition(
      run,
      { type: 'complete', stepId: 'docs', message: 'Missing typed output' },
      agent,
    ),
  );
  const traced = transition(
    run,
    {
      type: 'log',
      stepId: 'docs',
      message: 'Read contribution guide',
      trace: { kind: 'action', tool: 'read_file' },
    },
    agent,
  );
  assert.equal(traced.events.at(-1)?.trace?.kind, 'action');
  assert.throws(() =>
    transition(
      run,
      {
        type: 'log',
        stepId: 'docs',
        message: 'private',
        trace: { kind: 'chain_of_thought' },
      },
      agent,
    ),
  );
  assert.throws(() =>
    transition(
      run,
      { type: 'start', stepId: 'code', outputs: { report: 'Injected' } },
      agent,
    ),
  );
});
test('malformed processes, cross-branch wiring and invalid data references are rejected', () => {
  const variants = [
    (p: any) => (p.steps = p.steps.filter((s: any) => s.id !== 'end')),
    (p: any) =>
      (p.steps.find((s: any) => s.id === 'join').gateway.type = 'parallel'),
    (p: any) =>
      (p.steps.find((s: any) => s.id === 'code').dependencies = ['docs']),
    (p: any) =>
      (p.steps.find((s: any) => s.id === 'docs').inputs[0].source.stepId =
        'code'),
    (p: any) =>
      (p.steps.find((s: any) => s.id === 'docs').inputs[0].type = 'string'),
    (p: any) =>
      (p.steps.find(
        (s: any) => s.id === 'split',
      ).gateway.routes[0].when.output = 'missing'),
  ];
  for (const edit of variants) {
    const p = processPlan();
    edit(p);
    assert.throws(() => createRun(p, 'codex'));
  }
});
test('process evaluation is independent of array order and pauses before automatic routing', () => {
  let run = createRun(processPlan('inclusive', true), 'codex');
  assert.equal(state(run, 'choice').status, 'waiting');
  run = transition(
    run,
    {
      type: 'submit',
      stepId: 'choice',
      message: 'select',
      outputs: { docs: true, code: false },
    },
    human,
  );
  run = transition(run, { type: 'start', stepId: 'docs' }, agent);
  run = transition(run, { type: 'pause' }, human);
  run = transition(
    run,
    {
      type: 'complete',
      stepId: 'docs',
      message: 'done',
      outputs: { report: 'OK' },
    },
    agent,
  );
  assert.equal(run.status, 'paused');
  assert.equal(state(run, 'join').status, 'blocked');
  run = transition(run, { type: 'resume' }, human);
  assert.equal(state(run, 'approve').status, 'waiting');
});

test('nested gateway blocks omit whole branches and reject unsafe required data after a conditional join', () => {
  const p = processPlan('inclusive');
  const nested: any[] = [
    {
      id: 'inner',
      title: 'Parallel block',
      kind: 'gateway',
      dependencies: ['split'],
      gateway: {
        type: 'parallel',
        direction: 'split',
        routes: [{ target: 'left' }, { target: 'right' }],
      },
    },
    { id: 'left', title: 'Left', kind: 'agent', dependencies: ['inner'] },
    { id: 'right', title: 'Right', kind: 'agent', dependencies: ['inner'] },
    {
      id: 'innerJoin',
      title: 'Parallel join',
      kind: 'gateway',
      dependencies: ['left', 'right'],
      gateway: { type: 'parallel', direction: 'join', splitId: 'inner' },
    },
  ];
  const split = p.steps.find((s) => s.id === 'split')!;
  assert.ok(split.gateway && 'routes' in split.gateway);
  split.gateway.routes![1]!.target = 'inner';
  p.steps.find((s) => s.id === 'code')!.dependencies = ['innerJoin'];
  p.steps.push(...nested);
  let run = transition(
    createRun(p, 'codex'),
    {
      type: 'submit',
      stepId: 'choice',
      message: 'docs only',
      outputs: { docs: true, code: false },
    },
    human,
  );
  for (const id of ['inner', 'left', 'right', 'innerJoin', 'code'])
    assert.equal(state(run, id).status, 'skipped');
  run = finish(run, 'docs');
  assert.equal(state(run, 'approve').status, 'waiting');
  const unsafe = processPlan();
  Object.assign(
    unsafe.steps.find((s) => s.id === 'approve')!,
    {
      inputs: [
        {
          name: 'report',
          type: 'string',
          required: true,
          source: { stepId: 'docs', output: 'report' },
        },
      ],
    },
  );
  assert.throws(() => createRun(unsafe, 'codex'), /skipped/);
});

test('a default sequence flow has no condition of its own', () => {
  const p = processPlan();
  const split = p.steps.find((s) => s.id === 'split')!;
  assert.ok(split.gateway && 'routes' in split.gateway);
  Object.assign(split.gateway.routes!.at(-1)!, {
    when: { stepId: 'choice', output: 'docs', equals: true },
  });
  assert.throws(() => createRun(p, 'codex'), /default/i);
});

test('automatic history preserves causal order even when the plan array is reversed', () => {
  let run = createRun(processPlan('exclusive', true), 'codex');
  assert.ok(run.events.some((e) => e.stepId === 'start'));
  run = transition(
    run,
    {
      type: 'submit',
      stepId: 'choice',
      message: 'select',
      outputs: { docs: true, code: false },
    },
    human,
  );
  const submit = run.events.findIndex((e) => e.type === 'submit');
  const split = run.events.findIndex((e) => e.stepId === 'split');
  assert.ok(split > submit);
  assert.equal(
    new Set(run.events.map((e) => e.sequence)).size,
    run.events.length,
  );
});

test('parallel phases with exclusive and inclusive blocks complete with every real branch selection', () => {
  for (const docs of [true, false])
    for (const code of [true, false]) {
      const plan = JSON.parse(
        readFileSync('examples/process-gateways.json', 'utf8'),
      );
      let run = transition(
        createRun(plan, 'codex'),
        {
          type: 'submit',
          stepId: 'scope',
          message: 'Scope',
          outputs: { docs, code },
        },
        human,
      );
      const ready = run.steps.filter((s) => s.status === 'ready');
      assert.equal(
        ready.length,
        1 + (docs ? 1 : 0) + (code ? 1 : 0) + (!docs && !code ? 1 : 0),
      );
      for (const task of ready) {
        run = transition(run, { type: 'start', stepId: task.id }, agent);
        run = transition(
          run,
          {
            type: 'complete',
            stepId: task.id,
            message: 'Executed test branch',
            outputs: { report: 'Evidence' },
          },
          agent,
        );
      }
      assert.equal(state(run, 'approve').status, 'waiting');
      run = transition(run, { type: 'approve', stepId: 'approve' }, human);
      assert.equal(run.status, 'completed');
    }
});

test('create normalizes required input bindings so agent plans with optional producer outputs succeed', () => {
  const plan = folderSizeStylePlan();
  const scanOut = plan.steps
    .find((s) => s.id === 'scan_folders')!
    .outputs!.find((o) => o.name === 'folder_sizes')!;
  assert.equal('required' in scanOut ? scanOut.required : undefined, undefined);
  const run = createRun(plan, 'codex');
  const promoted = run.steps
    .find((s) => s.id === 'scan_folders')!
    .outputs!.find((o) => o.name === 'folder_sizes')!;
  assert.equal(promoted.required, true);
  assert.equal(state(run, 'clarify_scope').status, 'waiting');
});

test('normalizeRequiredBindings is idempotent and does not invent or weaken ports', () => {
  const raw = planSchema.parse(folderSizeStylePlan());
  raw.steps
    .find((s) => s.id === 'scan_folders')!
    .outputs!.find((o) => o.name === 'folder_sizes')!.required = false;
  const once = normalizeRequiredBindings(structuredClone(raw));
  const twice = normalizeRequiredBindings(structuredClone(once));
  assert.deepEqual(once, twice);
  assert.equal(
    once.steps
      .find((s) => s.id === 'scan_folders')!
      .outputs!.find((o) => o.name === 'folder_sizes')!.required,
    true,
  );
  assert.equal(
    once.steps
      .find((s) => s.id === 'build_excel')!
      .outputs!.find((o) => o.name === 'xlsx_file')!.required,
    true,
  );
  const optionalConsumer = structuredClone(raw);
  optionalConsumer.steps.find(
    (s) => s.id === 'build_excel',
  )!.inputs![0]!.required = false;
  optionalConsumer.steps
    .find((s) => s.id === 'scan_folders')!
    .outputs!.find((o) => o.name === 'folder_sizes')!.required = false;
  const left = normalizeRequiredBindings(optionalConsumer);
  assert.equal(
    left.steps
      .find((s) => s.id === 'scan_folders')!
      .outputs!.find((o) => o.name === 'folder_sizes')!.required,
    false,
  );
});

test('INVALID_PLAN names consumer input and producer output when a required source is still optional', () => {
  const plan = planSchema.parse(folderSizeStylePlan());
  plan.steps
    .find((s) => s.id === 'scan_folders')!
    .outputs!.find((o) => o.name === 'folder_sizes')!.required = false;
  assert.throws(
    () => validateProcess(plan),
    /Required input build_excel\.folder_sizes needs required source output scan_folders\.folder_sizes/,
  );
});
