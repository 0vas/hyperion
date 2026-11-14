<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
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
const track = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const offset = ref(0);
const visibleState = ref(0);
const hovering = ref(false);
const dragging = ref(false);
const reduced = ref(true);
const narrow = ref(false);

const AUTO_SPEED = 0.62;
const HOVER_SPEED = 0.2;
const CARD_GAP = 36;
const FADE = 26;
let mediaMotion: MediaQueryList | undefined;
let mediaNarrow: MediaQueryList | undefined;
let raf = 0;
let lastTs = 0;
let velocity = 0;
let dragOriginX = 0;
let dragOriginOffset = 0;
let cardWidth = 360;
let loopWidth = 1600;
const crossed = new Set<string>();
type CutSample = {
  id: string;
  cut: number;
  width: number;
  left: number;
  top: number;
  height: number;
  steps: number;
};
const samples: CutSample[] = [];

const syncMotion = () => {
  reduced.value = mediaMotion?.matches ?? true;
};
const syncNarrow = () => {
  narrow.value = mediaNarrow?.matches ?? false;
};

const measure = () => {
  const sample = stage.value?.querySelector(
    '.scanner-slot',
  ) as HTMLElement | null;
  if (!sample) return;
  cardWidth = sample.offsetWidth;
  loopWidth = (cardWidth + CARD_GAP) * cards.value.length;
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

const applyCuts = () => {
  const root = stage.value;
  if (!root) return;
  const stageRect = root.getBoundingClientRect();
  const beamX = stageRect.left + stageRect.width / 2;
  samples.length = 0;

  for (const slot of root.querySelectorAll<HTMLElement>('.scanner-slot')) {
    const rect = slot.getBoundingClientRect();
    const width = rect.width || cardWidth;
    const cut = Math.max(0, Math.min(width, beamX - rect.left));
    const chat = slot.querySelector<HTMLElement>('.chat-face');
    const flow = slot.querySelector<HTMLElement>('.flow-face');
    if (!chat || !flow) continue;

    if (cut <= 0.5) {
      chat.style.clipPath = 'none';
      chat.style.webkitMaskImage = '';
      chat.style.maskImage = '';
      flow.style.visibility = 'hidden';
      flow.style.clipPath = 'inset(0 100% 0 0)';
    } else {
      chat.style.clipPath = `inset(0 0 0 ${cut}px round 0 16px 16px 0)`;
      const fade = `linear-gradient(90deg, transparent ${cut}px, #000 ${cut + FADE}px)`;
      chat.style.webkitMaskImage = fade;
      chat.style.maskImage = fade;
      flow.style.visibility = 'visible';
      flow.style.clipPath = `inset(0 ${Math.max(0, width - cut)}px 0 0)`;
    }

    const id = slot.dataset.id || '';
    const steps = Number(slot.dataset.steps || 3);
    samples.push({
      id,
      cut,
      width,
      left: rect.left - stageRect.left,
      top: rect.top - stageRect.top,
      height: rect.height,
      steps,
    });

    if (cut >= width - 2 && id && !crossed.has(id)) {
      crossed.add(id);
      visibleState.value += steps;
    }
    if (cut < width * 0.35) crossed.delete(id);
  }
};

const paintDissolve = (ts: number) => {
  const canvas = canvasEl.value;
  const root = stage.value;
  if (!canvas || !root) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = root.clientWidth;
  const height = root.clientHeight;
  if (
    canvas.width !== Math.floor(width * dpr) ||
    canvas.height !== Math.floor(height * dpr)
  ) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const beam = width / 2;
  ctx.strokeStyle = '#FF5A1F';
  ctx.lineWidth = 2;
  ctx.globalAlpha = reduced.value ? 0.55 : 0.92;
  ctx.beginPath();
  ctx.moveTo(beam, 0);
  ctx.lineTo(beam, height);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (reduced.value) return;

  const glow = ctx.createLinearGradient(beam - 36, 0, beam + 36, 0);
  glow.addColorStop(0, 'rgba(255,90,31,0)');
  glow.addColorStop(0.45, 'rgba(255,90,31,0.16)');
  glow.addColorStop(0.5, 'rgba(255,90,31,0.5)');
  glow.addColorStop(0.55, 'rgba(255,90,31,0.16)');
  glow.addColorStop(1, 'rgba(255,90,31,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(beam - 36, 0, 72, height);

  for (const sample of samples) {
    if (sample.cut <= 1 || sample.cut >= sample.width - 1) continue;
    const edgeX = sample.left + sample.cut;
    for (let i = 0; i < 70; i++) {
      const seed = i * 19.7 + sample.cut * 0.13 + Math.floor(ts / 36);
      const px = edgeX + (hash(seed) - 0.5) * 28;
      const py = sample.top + hash(seed + 4.2) * sample.height;
      const size = hash(seed + 8) > 0.8 ? 3 : 1.5;
      const alpha = 0.22 + hash(seed + 11) * 0.55;
      ctx.fillStyle = `rgba(255,${90 + Math.floor(hash(seed + 2) * 90)},31,${alpha})`;
      ctx.fillRect(Math.floor(px), Math.floor(py), size, size);
    }
    for (let i = 0; i < 8; i++) {
      const seed = i * 53.1 + ts * 0.018 + sample.cut;
      const sparkY =
        sample.top +
        ((hash(seed) + ts * 0.00018 * (0.35 + hash(seed + 1))) % 1) *
          sample.height;
      const sparkX = edgeX + (hash(seed + 6) - 0.5) * 12;
      ctx.fillStyle = `rgba(255,220,180,${0.35 + hash(seed + 9) * 0.5})`;
      ctx.fillRect(sparkX, sparkY, 2, 5);
    }
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
    if (velocity) {
      offset.value = wrapOffset(offset.value - velocity * (dt / 16));
    }
  }
  applyCuts();
  paintDissolve(ts);
  raf = requestAnimationFrame(tick);
};

const scrubBy = (deltaPx: number) => {
  offset.value = wrapOffset(offset.value + deltaPx);
  velocity = deltaPx * 0.08;
};

const onPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  dragging.value = true;
  dragOriginX = event.clientX;
  dragOriginOffset = offset.value;
  velocity = 0;
  try {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  } catch {
    /* synthetic events may omit capture */
  }
};

const onPointerMove = (event: PointerEvent) => {
  if (!dragging.value) return;
  const delta = event.clientX - dragOriginX;
  offset.value = wrapOffset(dragOriginOffset + delta);
  velocity = event.movementX * 0.4;
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
  // Scroll forward (down/right) advances chat→flow (cards move left).
  // Reverse rebuilds the chat face.
  scrubBy(-dominant * 0.7);
};

const ariaLabel = computed(() =>
  en.value
    ? 'Illustration: one Hyperion card crosses a center scanner. Right of the beam it is chat; through the dissolve it becomes the same work as a guided flow. Scroll or drag forward to transform; reverse to restore chat. Decorative; not a live agent run.'
    : 'Ilustración: una tarjeta Hyperion cruza un escáner central. A la derecha del haz es chat; al disolverse se vuelve el mismo trabajo como flujo guiado. Avanza con scroll o arrastre para transformar; al revés recuperas el chat. Decorativo; no es una ejecución en vivo.',
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
  offset.value = wrapOffset(-(cardWidth + CARD_GAP) * 0.15);
  window.addEventListener('resize', measure);
  (
    window as Window & {
      __hyperionScanner?: { scrubBy: (deltaPx: number) => void };
    }
  ).__hyperionScanner = { scrubBy };
  raf = requestAnimationFrame(tick);
});

onUnmounted(() => {
  cancelAnimationFrame(raf);
  mediaMotion?.removeEventListener('change', syncMotion);
  mediaNarrow?.removeEventListener('change', syncNarrow);
  window.removeEventListener('resize', measure);
  delete (
    window as Window & {
      __hyperionScanner?: { scrubBy: (deltaPx: number) => void };
    }
  ).__hyperionScanner;
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
            ? 'Scroll or drag · reverse restores chat · hover slows'
            : 'Scroll o arrastra · al revés vuelve el chat · el cursor frena'
        }}
      </p>
    </div>

    <div
      ref="stage"
      class="scanner-stage"
      data-scanner="distill"
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

      <div
        ref="track"
        class="scanner-track"
        aria-hidden="true"
        :style="{ transform: `translate3d(${offset}px,0,0)` }"
      >
        <template v-for="copy in 2" :key="`copy-${copy}`">
          <div
            v-for="card in cards"
            :key="`${copy}-${card.id}`"
            class="scanner-slot"
            :data-id="`${copy}-${card.id}`"
            :data-steps="String(card.flow.length)"
          >
            <article class="scanner-card chat-face">
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
            <article class="scanner-card flow-face">
              <p class="card-label">
                {{ en ? 'Hyperion canvas' : 'Canvas Hyperion' }}
              </p>
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
          </div>
        </template>
      </div>
    </div>

    <figcaption>
      {{
        en
          ? 'One card at a time: right of the beam is chat; through the scanner the same work becomes a Hyperion path. Scroll forward to transform; reverse restores chat. The counter is an illustration, not a live run.'
          : 'Una tarjeta a la vez: a la derecha del haz es chat; al cruzar el escáner el mismo trabajo se vuelve un recorrido Hyperion. Avanza para transformar; al revés recuperas el chat. El contador es ilustración, no una ejecución en vivo.'
      }}
    </figcaption>
  </figure>
</template>
