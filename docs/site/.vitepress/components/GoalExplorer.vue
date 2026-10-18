<script setup lang="ts">
import { computed, ref } from 'vue';
import { useData, withBase } from 'vitepress';
import DocIcon from './DocIcon.vue';
import {
  goalCases,
  type BranchId,
  type GoalCase,
  type GoalEdge,
  type GoalNode,
  type NodeKind,
} from './goal-cases';

const { lang } = useData();
const en = computed(() => lang.value !== 'es');
const selected = ref(0);
const choice = ref<'A' | 'B' | null>(null);
const copyState = ref('');

const cases = computed(() => goalCases);
const activeCase = computed(() => cases.value[selected.value]);

const active = computed(() => {
  const item = activeCase.value;
  return en.value ? item.en : item.es;
});

const choices = computed(() =>
  activeCase.value.choices.map((c) => ({
    branch: c.branch,
    ...(en.value ? c.en : c.es),
  })),
);

const draftLabels = {
  A: { es: 'Borrador para el equipo', en: 'Draft for the team' },
  B: { es: 'Borrador para clientes', en: 'Draft for customers' },
} as const;

function graphFor(item: GoalCase): { nodes: GoalNode[]; edges: GoalEdge[] } {
  if (item.topology === 'parallel-or-sequence') {
    if (choice.value === 'A' && item.sequenceNodes && item.sequenceEdges) {
      return { nodes: item.sequenceNodes, edges: item.sequenceEdges };
    }
    if (choice.value === 'B' && item.parallelNodes && item.parallelEdges) {
      return { nodes: item.parallelNodes, edges: item.parallelEdges };
    }
  }
  return { nodes: item.nodes, edges: item.edges };
}

const graph = computed(() => graphFor(activeCase.value));

type FlowNode = {
  id: string;
  kind: NodeKind;
  label: string;
  role: string;
  state: 'trunk' | 'active' | 'alt' | 'pending' | 'decision';
};

function nodeRole(kind: NodeKind): string {
  if (kind === 'human') return en.value ? 'You' : 'Tú';
  if (kind === 'start' || kind === 'end') return '';
  if (
    kind === 'exclusive' ||
    kind === 'parallelSplit' ||
    kind === 'parallelJoin'
  ) {
    return '';
  }
  return en.value ? 'Agent' : 'Agente';
}

function humanReviewRole(): string {
  return en.value ? 'You review' : 'Tú revisas';
}

function edgeBranch(edge: GoalEdge): BranchId {
  return edge.branch ?? 'always';
}

function nodeState(
  item: GoalCase,
  node: GoalNode,
  edges: GoalEdge[],
): FlowNode['state'] {
  if (item.topology === 'linear-decision') {
    if (node.id === 'audience') return 'decision';
    if (node.id === 'draft' && choice.value) return 'active';
    return 'trunk';
  }

  if (item.topology === 'parallel-or-sequence') {
    if (!choice.value) {
      if (node.kind === 'exclusive') return 'decision';
      return 'trunk';
    }
    return 'active';
  }

  if (node.kind === 'exclusive') return 'decision';
  const idsA = new Set(
    edges.filter((e) => edgeBranch(e) === 'A').flatMap((e) => [e.from, e.to]),
  );
  const idsB = new Set(
    edges.filter((e) => edgeBranch(e) === 'B').flatMap((e) => [e.from, e.to]),
  );
  const onlyA = idsA.has(node.id) && !idsB.has(node.id);
  const onlyB = idsB.has(node.id) && !idsA.has(node.id);
  if (!onlyA && !onlyB) return 'trunk';
  if (!choice.value) return 'pending';
  if (onlyA) return choice.value === 'A' ? 'active' : 'alt';
  return choice.value === 'B' ? 'active' : 'alt';
}

const flowNodes = computed((): FlowNode[] => {
  const item = activeCase.value;
  const { nodes, edges } = graph.value;
  return nodes.map((node) => {
    let label = en.value ? node.en : node.es;
    if (
      item.topology === 'linear-decision' &&
      node.id === 'draft' &&
      choice.value
    ) {
      label = draftLabels[choice.value][en.value ? 'en' : 'es'];
    }
    let role = nodeRole(node.kind);
    if (node.kind === 'human' && node.id !== 'audience') {
      role = humanReviewRole();
    }
    return {
      id: node.id,
      kind: node.kind,
      label,
      role,
      state: nodeState(item, node, edges),
    };
  });
});

/** Layout stages for rendering forks / parallel lanes. */
type Stage =
  | { type: 'node'; node: FlowNode }
  | { type: 'fork'; branches: FlowNode[][] }
  | { type: 'parallel'; lanes: FlowNode[] };

const stages = computed((): Stage[] => {
  const item = activeCase.value;
  const nodes = flowNodes.value;
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

  if (item.topology === 'linear-decision') {
    return nodes.map((node) => ({ type: 'node', node }));
  }

  if (item.topology === 'parallel-or-sequence') {
    if (choice.value === 'B') {
      const result: Stage[] = [];
      for (const id of ['start', 'define', 'split']) {
        if (byId[id]) result.push({ type: 'node', node: byId[id] });
      }
      result.push({
        type: 'parallel',
        lanes: ['rev_code', 'rev_tests', 'rev_docs']
          .map((id) => byId[id])
          .filter(Boolean),
      });
      for (const id of ['join', 'resolve', 'end']) {
        if (byId[id]) result.push({ type: 'node', node: byId[id] });
      }
      return result;
    }
    return nodes.map((node) => ({ type: 'node', node }));
  }

  // exclusive-mid and exclusive-asymmetric
  const result: Stage[] = [];
  const aEdges = item.edges.filter((e) => edgeBranch(e) === 'A');
  const bEdges = item.edges.filter((e) => edgeBranch(e) === 'B');
  const gwIndex = nodes.findIndex((n) => n.kind === 'exclusive');
  for (let i = 0; i < gwIndex; i++) {
    result.push({ type: 'node', node: nodes[i] });
  }
  if (gwIndex >= 0) result.push({ type: 'node', node: nodes[gwIndex] });

  const sharedIds = new Set(
    item.topology === 'exclusive-mid' ? ['review', 'end'] : [],
  );
  const branchA = chainFromGateway(aEdges[0]?.to, byId, aEdges, sharedIds);
  const branchB = chainFromGateway(bEdges[0]?.to, byId, bEdges, sharedIds);
  result.push({ type: 'fork', branches: [branchA, branchB] });

  if (item.topology === 'exclusive-mid') {
    if (byId.review) result.push({ type: 'node', node: byId.review });
    if (byId.end) result.push({ type: 'node', node: byId.end });
  }

  return result;
});

function chainFromGateway(
  startId: string | undefined,
  byId: Record<string, FlowNode>,
  edges: GoalEdge[],
  sharedIds: Set<string>,
): FlowNode[] {
  const out: FlowNode[] = [];
  let current: string | undefined = startId;
  while (current && byId[current] && !sharedIds.has(current)) {
    out.push(byId[current]);
    current = edges.find((e) => e.from === current)?.to;
  }
  return out;
}

const gatewayChip = computed(() => {
  const item = activeCase.value;
  const loc = active.value;
  if (item.topology === 'parallel-or-sequence' && choice.value === 'A') {
    return loc.gatewayLabelA ?? loc.gatewayLabel;
  }
  if (item.topology === 'parallel-or-sequence' && choice.value === 'B') {
    return loc.gatewayLabelB ?? loc.gatewayLabel;
  }
  return loc.gatewayLabel;
});

const settledChoice = computed(() =>
  choice.value
    ? (choices.value.find((c) => c.branch === choice.value) ?? null)
    : null,
);

function select(index: number) {
  selected.value = index;
  choice.value = null;
  copyState.value = '';
}

function pick(branch: 'A' | 'B') {
  choice.value = branch;
}

async function copy() {
  try {
    await navigator.clipboard.writeText(active.value.prompt);
    copyState.value = en.value ? 'Copied' : 'Copiado';
  } catch {
    copyState.value = en.value
      ? 'Select and copy the request above.'
      : 'Selecciona y copia la petición de arriba.';
  }
}

function kindIcon(kind: NodeKind): string {
  if (kind === 'start' || kind === 'end') return 'check';
  if (kind === 'human') return 'user';
  if (kind === 'exclusive') return 'flow';
  if (kind === 'parallelSplit' || kind === 'parallelJoin') return 'connect';
  return activeCase.value.icon;
}

function statusPill(state: FlowNode['state'], kind: NodeKind): string | null {
  if (kind === 'start' || kind === 'end') return null;
  if (
    kind === 'exclusive' ||
    kind === 'parallelSplit' ||
    kind === 'parallelJoin'
  )
    return null;
  if (state === 'decision') return en.value ? 'Your turn' : 'Tu turno';
  if (state === 'alt') return en.value ? 'Skipped' : 'Omitido';
  if (state === 'pending') return en.value ? 'Pending' : 'Pendiente';
  if (state === 'active' || (state === 'trunk' && choice.value))
    return en.value ? 'Completed' : 'Completado';
  return null;
}

function isGateway(kind: NodeKind) {
  return (
    kind === 'exclusive' || kind === 'parallelSplit' || kind === 'parallelJoin'
  );
}

function edgeClass(si: number): string {
  if (choice.value === null) return 'is-pending';
  return 'is-active';
}
</script>
<template>
  <section
    class="goal-explorer"
    :aria-label="en ? 'Explore use cases' : 'Explora los casos de uso'"
  >
    <div class="goal-categories">
      <button
        v-for="(item, i) in cases"
        :key="i"
        :aria-pressed="selected === i"
        @click="select(i)"
      >
        <DocIcon :name="item.icon" /><span>{{
          en ? item.en.title : item.es.title
        }}</span>
      </button>
    </div>
    <div class="goal-body">
      <header class="goal-heading">
        <span class="goal-kicker">{{
          en
            ? 'ONE REQUEST, DIFFERENT PATHS'
            : 'UNA PETICIÓN, DISTINTOS CAMINOS'
        }}</span>
        <h3>{{ active.summary }}</h3>
      </header>
      <div class="goal-request">
        <p class="goal-prompt">{{ active.prompt }}</p>
        <button class="demo-secondary" @click="copy">
          <DocIcon name="chat" />{{
            en ? 'Copy request' : 'Copiar petición'
          }}</button
        ><span class="goal-copy-status" role="status">{{ copyState }}</span>
      </div>
      <div class="goal-preview">
        <div class="goal-preview-title">
          <DocIcon name="flow" /><span>{{
            en ? 'Illustrative plan' : 'Plan ilustrativo'
          }}</span
          ><span>{{
            en ? 'Simulation · not running' : 'Simulación · no ejecuta'
          }}</span>
        </div>
        <p class="goal-scroll-hint">
          {{
            en
              ? 'Scroll the plan horizontally'
              : 'Desliza el plan en horizontal'
          }}
        </p>
        <div
          class="goal-flow"
          :class="{ 'is-settled': choice !== null }"
          role="region"
          tabindex="0"
          :aria-label="
            en ? 'Example process graph' : 'Grafo de ejemplo del proceso'
          "
        >
          <template v-for="(stage, si) in stages" :key="si">
            <div
              v-if="stage.type === 'node' && stage.node.kind === 'start'"
              class="goal-event kind-start"
            >
              <span class="goal-event-ring" aria-hidden="true"></span>
              <strong>{{ stage.node.label }}</strong>
            </div>
            <div
              v-else-if="stage.type === 'node' && stage.node.kind === 'end'"
              class="goal-event kind-end"
            >
              <span class="goal-event-ring" aria-hidden="true"></span>
              <strong>{{ stage.node.label }}</strong>
            </div>
            <div
              v-else-if="stage.type === 'node' && isGateway(stage.node.kind)"
              class="goal-gateway"
              :class="[`kind-${stage.node.kind}`, `state-${stage.node.state}`]"
            >
              <span class="goal-gateway-diamond" aria-hidden="true">
                <svg viewBox="0 0 48 48" width="44" height="44">
                  <polygon
                    points="24,2 46,24 24,46 2,24"
                    fill="currentColor"
                    fill-opacity="0.18"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                  <text
                    x="24"
                    y="28"
                    text-anchor="middle"
                    font-size="16"
                    font-weight="700"
                    fill="currentColor"
                  >
                    {{
                      stage.node.kind === 'exclusive'
                        ? '×'
                        : stage.node.kind === 'parallelSplit'
                          ? '+'
                          : '='
                    }}
                  </text>
                </svg>
              </span>
              <strong class="goal-gateway-label">{{ stage.node.label }}</strong>
              <span class="goal-gateway-chip">{{ gatewayChip }}</span>
            </div>
            <div
              v-else-if="stage.type === 'node'"
              class="goal-node"
              :class="[`kind-${stage.node.kind}`, `state-${stage.node.state}`]"
            >
              <div class="goal-node-head">
                <span class="goal-node-icon"
                  ><DocIcon :name="kindIcon(stage.node.kind)"
                /></span>
                <span
                  v-if="statusPill(stage.node.state, stage.node.kind)"
                  class="goal-status-pill"
                  :class="`pill-${stage.node.state}`"
                  >{{ statusPill(stage.node.state, stage.node.kind) }}</span
                >
              </div>
              <strong>{{ stage.node.label }}</strong>
              <span v-if="stage.node.role" class="goal-node-role">{{
                stage.node.role
              }}</span>
            </div>
            <div
              v-else-if="stage.type === 'fork'"
              class="goal-fork"
              :class="{ 'is-settled': choice !== null }"
            >
              <div
                v-for="(branch, bi) in stage.branches"
                :key="bi"
                class="goal-fork-lane"
                :class="{
                  'is-active-branch': choice === (bi === 0 ? 'A' : 'B'),
                  'is-alt-branch':
                    choice !== null && choice !== (bi === 0 ? 'A' : 'B'),
                  'is-pending-branch': choice === null,
                }"
              >
                <template v-for="(node, ni) in branch" :key="node.id">
                  <div
                    class="goal-node"
                    :class="[`kind-${node.kind}`, `state-${node.state}`]"
                  >
                    <div class="goal-node-head">
                      <span class="goal-node-icon"
                        ><DocIcon :name="kindIcon(node.kind)"
                      /></span>
                      <span
                        v-if="statusPill(node.state, node.kind)"
                        class="goal-status-pill"
                        :class="`pill-${node.state}`"
                        >{{ statusPill(node.state, node.kind) }}</span
                      >
                    </div>
                    <strong>{{ node.label }}</strong>
                    <span v-if="node.role" class="goal-node-role">{{
                      node.role
                    }}</span>
                  </div>
                  <span
                    v-if="ni < branch.length - 1"
                    class="goal-edge"
                    :class="
                      choice === null
                        ? 'is-pending'
                        : choice === (bi === 0 ? 'A' : 'B')
                          ? 'is-active'
                          : 'is-pending'
                    "
                    aria-hidden="true"
                  ></span>
                </template>
              </div>
            </div>
            <div v-else-if="stage.type === 'parallel'" class="goal-parallel">
              <div
                v-for="node in stage.lanes"
                :key="node.id"
                class="goal-node state-active kind-agent"
              >
                <div class="goal-node-head">
                  <span class="goal-node-icon"
                    ><DocIcon :name="kindIcon(node.kind)"
                  /></span>
                  <span class="goal-status-pill pill-active">{{
                    en ? 'Completed' : 'Completado'
                  }}</span>
                </div>
                <strong>{{ node.label }}</strong>
                <span class="goal-node-role">{{ node.role }}</span>
              </div>
            </div>
            <span
              v-if="si < stages.length - 1"
              class="goal-edge"
              :class="edgeClass(si)"
              aria-hidden="true"
            ></span>
          </template>
        </div>
        <div class="goal-decision">
          <p>
            <DocIcon name="user" /><strong>{{ active.question }}</strong>
          </p>
          <p v-if="choice === null" class="goal-choice-hint">
            {{
              en
                ? 'Choose to see which branch the plan follows.'
                : 'Elige para ver qué rama sigue el plan.'
            }}
          </p>
          <div class="goal-choices">
            <button
              v-for="option in choices"
              :key="option.branch"
              :aria-pressed="choice === option.branch"
              @click="pick(option.branch)"
            >
              <DocIcon :name="choice === option.branch ? 'check' : 'play'" />{{
                option.label
              }}
            </button>
          </div>
          <div aria-live="polite" aria-atomic="true">
            <div v-if="settledChoice" class="goal-output">
              <DocIcon name="data" />
              <div>
                <strong>{{
                  en
                    ? 'Your decision shapes the plan'
                    : 'Tu decisión orienta el plan'
                }}</strong>
                <p>{{ settledChoice.output }}</p>
              </div>
            </div>
          </div>
        </div>
        <footer class="goal-preview-footer">
          <small>{{
            en
              ? 'Sample data. Does not run tools or connect to an agent.'
              : 'Datos de ejemplo. No ejecuta herramientas ni conecta con un agente.'
          }}</small
          ><button v-if="choice !== null" @click="choice = null">
            <DocIcon name="reset" />{{
              en ? 'Reset example' : 'Reiniciar ejemplo'
            }}
          </button>
        </footer>
      </div>
      <div class="goal-requires">
        <DocIcon name="connect" />
        <div>
          <strong>{{
            en ? 'To use it with your AI' : 'Para usarlo con tu IA'
          }}</strong>
          <p>{{ active.requires }}</p>
          <a :href="withBase(`${en ? '/en' : ''}/guia/integraciones.html`)"
            >{{
              en ? 'Check available connections' : 'Ver conexiones disponibles'
            }}<DocIcon name="arrow"
          /></a>
        </div>
      </div>
    </div>
  </section>
</template>
