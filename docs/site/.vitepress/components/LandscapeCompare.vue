<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue';
import { useData } from 'vitepress';

const props = defineProps<{ compact?: boolean }>();
const { lang } = useData();
const en = computed(() => lang.value !== 'es');

type Card = {
  id: string;
  chatTitle: string;
  chatLines: { side: 'agent' | 'user'; text: string }[];
  flow: string[];
  decisionIndex: number;
};

const cards = computed<Card[]>(() =>
  en.value
    ? [
        {
          id: 'brief',
          chatTitle: 'Brief in chat',
          chatLines: [
            { side: 'agent', text: 'What’s the goal?' },
            { side: 'user', text: 'Ship the preview installers.' },
            { side: 'agent', text: 'I’ll draft steps…' },
          ],
          flow: ['Start', 'Plan', 'Decision?', 'Build', 'End'],
          decisionIndex: 2,
        },
        {
          id: 'gate',
          chatTitle: 'Long thread',
          chatLines: [
            { side: 'user', text: 'Approve the macOS path?' },
            { side: 'agent', text: 'Waiting on your call.' },
            { side: 'user', text: 'Hold — check digests.' },
          ],
          flow: ['Job', 'Agent', 'You', 'Evidence', 'Next'],
          decisionIndex: 2,
        },
        {
          id: 'evidence',
          chatTitle: 'Tools firing',
          chatLines: [
            { side: 'agent', text: 'Running checks…' },
            { side: 'user', text: 'Did it finish?' },
            { side: 'agent', text: 'Still scrolling…' },
          ],
          flow: ['Ready', 'Run', 'Gate', 'Log', 'Done'],
          decisionIndex: 2,
        },
        {
          id: 'handoff',
          chatTitle: 'Handoff lost',
          chatLines: [
            { side: 'user', text: 'Who owns the next step?' },
            { side: 'agent', text: 'I thought you did.' },
            { side: 'user', text: 'The thread forgot.' },
          ],
          flow: ['Ask', 'Canvas', 'Decide', 'Resume', 'Keep'],
          decisionIndex: 2,
        },
      ]
    : [
        {
          id: 'brief',
          chatTitle: 'Pedido en el chat',
          chatLines: [
            { side: 'agent', text: '¿Cuál es el objetivo?' },
            { side: 'user', text: 'Publicar los instaladores.' },
            { side: 'agent', text: 'Te propongo pasos…' },
          ],
          flow: ['Inicio', 'Plan', '¿Decisión?', 'Build', 'Fin'],
          decisionIndex: 2,
        },
        {
          id: 'gate',
          chatTitle: 'Hilo largo',
          chatLines: [
            { side: 'user', text: '¿Apruebo macOS?' },
            { side: 'agent', text: 'Espero tu decisión.' },
            { side: 'user', text: 'Espera — revisa digests.' },
          ],
          flow: ['Trabajo', 'Agente', 'Tú', 'Evidencia', 'Siguiente'],
          decisionIndex: 2,
        },
        {
          id: 'evidence',
          chatTitle: 'Herramientas',
          chatLines: [
            { side: 'agent', text: 'Ejecutando checks…' },
            { side: 'user', text: '¿Terminó?' },
            { side: 'agent', text: 'Sigue el scroll…' },
          ],
          flow: ['Listo', 'Correr', 'Puerta', 'Log', 'Hecho'],
          decisionIndex: 2,
        },
        {
          id: 'handoff',
          chatTitle: 'Relevo perdido',
          chatLines: [
            { side: 'user', text: '¿Quién sigue?' },
            { side: 'agent', text: 'Creí que eras tú.' },
            { side: 'user', text: 'El hilo olvidó.' },
          ],
          flow: ['Pedir', 'Canvas', 'Decidir', 'Retomar', 'Conservar'],
          decisionIndex: 2,
        },
      ],
);

const stage = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const offset = ref(0);
const visibleState = ref(0);
const hovering = ref(false);
const dragging = ref(false);
const reduced = ref(true);
const narrow = ref(false);

const AUTO_SPEED = 0.55;
const HOVER_SPEED = 0.18;
const CARD_GAP = 28;
let mediaMotion: MediaQueryList | undefined;
let mediaNarrow: MediaQueryList | undefined;
let raf = 0;
let lastTs = 0;
let velocity = 0;
let dragOriginX = 0;
let dragOriginOffset = 0;
let cardSpan = 320;
let loopWidth = 1400;
const crossed = new Set<string>();

const syncMotion = () => {
  reduced.value = mediaMotion?.matches ?? true;
};
const syncNarrow = () => {
  narrow.value = mediaNarrow?.matches ?? false;
};

const measure = () => {
  const sample = stage.value?.querySelector('.scanner-card') as HTMLElement | null;
  if (!sample) return;
  cardSpan = sample.offsetWidth + CARD_GAP;
  loopWidth = cardSpan * cards.value.length;
};

const wrapOffset = (value: number) => {
  if (!loopWidth) return value;
  let next = value % loopWidth;
  if (next > 0) next -= loopWidth;
  return next;
};

const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

const updateCounter = () => {
  const root = stage.value;
  if (!root || !loopWidth) return;
  const mid = root.getBoundingClientRect().left + root.clientWidth / 2;
  for (const card of root.querySelectorAll<HTMLElement>('.scanner-card[data-id]')) {
    const rect = card.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const id = card.dataset.id || '';
    if (center < mid - 8 && !crossed.has(id)) {
      crossed.add(id);
      visibleState.value += card.dataset.steps
        ? Number(card.dataset.steps)
        : 3;
    }
    if (center > mid + 40) crossed.delete(id);
  }
};

const paintDissolve = (ts: number) => {
  const canvas = canvasEl.value;
  const root = stage.value;
  if (!canvas || !root) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = root.clientWidth;
  const height = root.clientHeight;
  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  if (reduced.value) return;

  const x = width / 2;
  const hot = '#FF5A1F';
  const glow = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
  glow.addColorStop(0, 'rgba(255,90,31,0)');
  glow.addColorStop(0.45, 'rgba(255,90,31,0.18)');
  glow.addColorStop(0.5, 'rgba(255,90,31,0.55)');
  glow.addColorStop(0.55, 'rgba(255,90,31,0.18)');
  glow.addColorStop(1, 'rgba(255,90,31,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 40, 0, 80, height);

  ctx.strokeStyle = hot;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.globalAlpha = 1;

  for (let i = 0; i < 90; i++) {
    const seed = i * 17.13 + Math.floor(ts / 40);
    const px = x + (hash(seed) - 0.5) * 54;
    const py = hash(seed + 3.1) * height;
    const size = hash(seed + 7) > 0.82 ? 3 : 1.5;
    const alpha = 0.25 + hash(seed + 9) * 0.55;
    ctx.fillStyle = `rgba(255,${90 + Math.floor(hash(seed + 2) * 80)},31,${alpha})`;
    ctx.fillRect(Math.floor(px), Math.floor(py), size, size);
  }
  for (let i = 0; i < 12; i++) {
    const seed = i * 41.7 + ts * 0.02;
    const sparkY = ((hash(seed) + (ts * 0.00015) * (0.4 + hash(seed + 1))) % 1) * height;
    const sparkX = x + (hash(seed + 5) - 0.5) * 18;
    ctx.fillStyle = `rgba(255,220,180,${0.35 + hash(seed + 8) * 0.5})`;
    ctx.fillRect(sparkX, sparkY, 2, 6);
  }
};

const tick = (ts: number) => {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(32, ts - lastTs);
  lastTs = ts;
  if (!dragging.value) {
    if (reduced.value) {
      velocity *= 0.86;
      if (Math.abs(velocity) < 0.02) velocity = 0;
    } else {
      const target = hovering.value ? HOVER_SPEED : AUTO_SPEED;
      velocity += (target - velocity) * 0.08;
    }
    if (velocity) offset.value = wrapOffset(offset.value - velocity * (dt / 16));
  }
  updateCounter();
  paintDissolve(ts);
  raf = requestAnimationFrame(tick);
};

const onPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  dragging.value = true;
  dragOriginX = event.clientX;
  dragOriginOffset = offset.value;
  velocity = 0;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
};

const onPointerMove = (event: PointerEvent) => {
  if (!dragging.value) return;
  const delta = event.clientX - dragOriginX;
  offset.value = wrapOffset(dragOriginOffset + delta);
  velocity = event.movementX * 0.35;
};

const onPointerUp = (event: PointerEvent) => {
  if (!dragging.value) return;
  dragging.value = false;
  try {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  } catch {
    /* already released */
  }
};

const onWheel = (event: WheelEvent) => {
  if (!stage.value) return;
  const dominant =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;
  if (!dominant) return;
  event.preventDefault();
  offset.value = wrapOffset(offset.value - dominant * 0.65);
  velocity = 0;
};

const ariaLabel = computed(() =>
  en.value
    ? 'Illustration: chat cards drift left through a center scanner and become Hyperion canvas steps with a visible-state counter. Decorative motion; not a live agent run.'
    : 'Ilustración: tarjetas de chat cruzan un escáner central y se vuelven pasos del canvas de Hyperion, con contador de estado visible. Movimiento decorativo; no es una ejecución en vivo.',
);

onMounted(async () => {
  mediaMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  mediaNarrow = window.matchMedia('(max-width: 767px)');
  syncMotion();
  syncNarrow();
  mediaMotion.addEventListener('change', syncMotion);
  mediaNarrow.addEventListener('change', syncNarrow);
  await nextTick();
  measure();
  offset.value = wrapOffset(-cardSpan * 0.35);
  window.addEventListener('resize', measure);
  raf = requestAnimationFrame(tick);
});

onUnmounted(() => {
  cancelAnimationFrame(raf);
  mediaMotion?.removeEventListener('change', syncMotion);
  mediaNarrow?.removeEventListener('change', syncNarrow);
  window.removeEventListener('resize', measure);
});

watch(cards, async () => {
  crossed.clear();
  visibleState.value = 0;
  await nextTick();
  measure();
});
</script>

<template>
  <figure
    class="landscape-diagram landscape-compare scanner-compare"
    :class="{
      compact: props.compact,
      'motion-ready': !reduced,
      narrow,
      dragging,
    }"
    role="img"
    :aria-label="ariaLabel"
  >
    <div class="scanner-chrome">
      <p class="scanner-kicker">
        {{ en ? 'Guided as a process' : 'Guiado como proceso' }}
      </p>
      <p class="scanner-hint" aria-hidden="true">
        {{
          en
            ? 'Drag · scroll sideways · hover to slow'
            : 'Arrastra · desplaza · pasa el cursor para frenar'
        }}
      </p>
    </div>

    <div
      ref="stage"
      class="scanner-stage"
      @pointerenter="hovering = true"
      @pointerleave="hovering = false"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
    >
      <div class="scanner-badge" aria-hidden="true">
        <span>{{ en ? 'Visible state' : 'Estado visible' }}</span>
        <strong>{{ visibleState }}</strong>
        <small>{{ en ? 'illustration' : 'ilustración' }}</small>
      </div>

      <div class="scanner-beam" aria-hidden="true"></div>
      <canvas ref="canvasEl" class="scanner-fx" aria-hidden="true"></canvas>

      <div class="scanner-lane chat-lane" aria-hidden="true">
        <div
          class="scanner-track"
          :style="{ transform: `translate3d(${offset}px,0,0)` }"
        >
          <template v-for="copy in 2" :key="`chat-${copy}`">
            <article
              v-for="card in cards"
              :key="`chat-${copy}-${card.id}`"
              class="scanner-card chat-face"
            >
              <p class="card-label">{{ en ? 'Chat' : 'Chat' }}</p>
              <p class="card-title">{{ card.chatTitle }}</p>
              <div class="chat-stack">
                <span
                  v-for="(line, index) in card.chatLines"
                  :key="index"
                  class="bubble"
                  :class="line.side"
                  >{{ line.text }}</span
                >
              </div>
              <p class="panel-foot">
                {{ en ? 'The thread is the map' : 'El hilo es el mapa' }}
              </p>
            </article>
          </template>
        </div>
      </div>

      <div class="scanner-lane flow-lane" aria-hidden="true">
        <div
          class="scanner-track"
          :style="{ transform: `translate3d(${offset}px,0,0)` }"
        >
          <template v-for="copy in 2" :key="`flow-${copy}`">
            <article
              v-for="card in cards"
              :key="`flow-${copy}-${card.id}`"
              class="scanner-card flow-face"
              :data-id="`${copy}-${card.id}`"
              :data-steps="String(card.flow.length)"
            >
              <p class="card-label">{{ en ? 'Hyperion canvas' : 'Canvas Hyperion' }}</p>
              <p class="card-title">{{ card.chatTitle }}</p>
              <ol class="mini-flow">
                <li
                  v-for="(step, index) in card.flow"
                  :key="step"
                  :class="{ decision: index === card.decisionIndex }"
                >
                  <span>{{ step }}</span>
                  <small v-if="index === card.decisionIndex">{{
                    en ? 'You' : 'Tú'
                  }}</small>
                </li>
              </ol>
              <p class="panel-foot">
                {{ en ? 'The process is the map' : 'El proceso es el mapa' }}
              </p>
            </article>
          </template>
        </div>
      </div>
    </div>

    <figcaption>
      {{
        en
          ? 'Right of the line: chat cards. Through the scanner: the same work as a Hyperion path with steps, your decision and evidence. Numbers are an illustration, not a live run.'
          : 'A la derecha de la línea: tarjetas de chat. Al cruzar el escáner: el mismo trabajo como recorrido Hyperion con pasos, tu decisión y evidencia. Los números son ilustración, no una ejecución en vivo.'
      }}
    </figcaption>
  </figure>
</template>
