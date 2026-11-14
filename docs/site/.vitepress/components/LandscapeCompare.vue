<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useData } from 'vitepress';

const props = defineProps<{ compact?: boolean }>();
const { lang } = useData();
const en = computed(() => lang.value !== 'es');

const card = computed(() =>
  en.value
    ? {
        chatTitle: 'Brief in chat',
        chatLines: [
          { side: 'agent' as const, text: 'What’s the goal?' },
          { side: 'user' as const, text: 'Ship the preview installers.' },
          { side: 'agent' as const, text: 'I’ll draft the path…' },
        ],
        flow: ['Start', 'Plan', 'Decision?', 'Build', 'End'],
        decisionIndex: 2,
      }
    : {
        chatTitle: 'Pedido en el chat',
        chatLines: [
          { side: 'agent' as const, text: '¿Cuál es el objetivo?' },
          { side: 'user' as const, text: 'Publicar los instaladores.' },
          { side: 'agent' as const, text: 'Te propongo el recorrido…' },
        ],
        flow: ['Inicio', 'Plan', '¿Decisión?', 'Build', 'Fin'],
        decisionIndex: 2,
      },
);

const stage = ref<HTMLElement | null>(null);
const slot = ref<HTMLElement | null>(null);
const chatEl = ref<HTMLElement | null>(null);
const flowEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);

/** Cut across the single card: 0 = all chat (right of beam), cw = all flow (left). */
const cut = ref(0);
const cardWidth = ref(520);
const hovering = ref(false);
const dragging = ref(false);
const reduced = ref(true);

const AUTO_SPEED = 0.55;
const HOVER_FACTOR = 0.35;
const FADE = 26;
const HOT = '#FF5A1F';

let mediaMotion: MediaQueryList | undefined;
let raf = 0;
let lastTs = 0;
let velocity = 0;
let dragOriginX = 0;
let dragOriginCut = 0;

const syncMotion = () => {
  reduced.value = mediaMotion?.matches ?? true;
};

const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

const clampCut = (value: number) => {
  const max = Math.max(1, cardWidth.value);
  return Math.max(0, Math.min(max, value));
};

const measure = () => {
  if (!slot.value) return;
  cardWidth.value = slot.value.offsetWidth || 520;
  cut.value = clampCut(cut.value);
};

const applyFaces = () => {
  const chat = chatEl.value;
  const flow = flowEl.value;
  const cw = cardWidth.value;
  const c = cut.value;
  if (!chat || !flow || !cw) return;

  if (c <= 0.5) {
    chat.style.clipPath = 'none';
    chat.style.webkitMaskImage = '';
    chat.style.maskImage = '';
    flow.style.visibility = 'hidden';
    flow.style.clipPath = 'inset(0 100% 0 0)';
  } else {
    // Hard cut on the left edge; keep radius only on the intact right side.
    chat.style.clipPath = `inset(0 0 0 ${c}px round 0 18px 18px 0)`;
    const fade = `linear-gradient(90deg, transparent ${c}px, #000 ${c + FADE}px)`;
    chat.style.webkitMaskImage = fade;
    chat.style.maskImage = fade;
    flow.style.visibility = 'visible';
    // Flow fills exactly the cut region with a hard right edge at the beam.
    flow.style.clipPath = `inset(0 ${Math.max(0, cw - c)}px 0 0 round 18px 0 0 18px)`;
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
  const cw = cardWidth.value;
  const c = cut.value;
  const cardLeft = beam - c;
  const cardTop = slot.value
    ? slot.value.getBoundingClientRect().top - root.getBoundingClientRect().top
    : height * 0.08;
  const cardH = slot.value?.offsetHeight || height * 0.84;

  ctx.strokeStyle = HOT;
  ctx.lineWidth = 2;
  ctx.globalAlpha = reduced.value ? 0.55 : 0.95;
  ctx.beginPath();
  ctx.moveTo(beam, 0);
  ctx.lineTo(beam, height);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (reduced.value) return;

  const haze = ctx.createLinearGradient(beam - 48, 0, beam + 48, 0);
  haze.addColorStop(0, 'rgba(255,90,31,0)');
  haze.addColorStop(0.42, 'rgba(255,90,31,0.22)');
  haze.addColorStop(0.5, 'rgba(255,90,31,0.62)');
  haze.addColorStop(0.58, 'rgba(255,90,31,0.22)');
  haze.addColorStop(1, 'rgba(255,90,31,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(beam - 48, 0, 96, height);

  if (c <= 1 || c >= cw - 1) return;
  const edgeX = cardLeft + c;

  for (let i = 0; i < 220; i++) {
    const seed = i * 17.3 + Math.floor(c) * 0.37 + Math.floor(ts / 48);
    const px = edgeX + (hash(seed) - 0.5) * 28;
    const py = cardTop + hash(seed + 4.1) * cardH;
    const twinkle = 0.55 + 0.45 * Math.sin(ts * 0.02 + seed);
    const alpha = (0.3 + hash(seed + 9) * 0.55) * twinkle;
    const size = hash(seed + 8) > 0.78 ? 3 : hash(seed + 2) > 0.5 ? 2 : 1;
    ctx.fillStyle = `rgba(255,${88 + Math.floor(hash(seed + 3) * 100)},31,${alpha})`;
    ctx.fillRect(Math.floor(px), Math.floor(py), size, size);
  }

  for (let i = 0; i < 18; i++) {
    const seed = i * 41.7 + ts * 0.02;
    const sparkY =
      ((hash(seed) + ts * 0.0002 * (0.35 + hash(seed + 1))) % 1) * height;
    const sparkX = beam + (hash(seed + 5) - 0.5) * 18;
    ctx.fillStyle = `rgba(255,225,190,${0.35 + hash(seed + 8) * 0.55})`;
    ctx.fillRect(sparkX, sparkY, 2, 7);
  }
};

const scrubBy = (deltaPx: number) => {
  cut.value = clampCut(cut.value - deltaPx);
  velocity = -deltaPx * 0.12;
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
      const target = hovering.value ? AUTO_SPEED * HOVER_FACTOR : AUTO_SPEED;
      velocity += (target - velocity) * 0.08;
    }
    if (velocity) cut.value = clampCut(cut.value + velocity * (dt / 16));
    if (
      !dragging.value &&
      !reduced.value &&
      cut.value >= cardWidth.value - 0.5
    ) {
      if (Math.abs(velocity) < 0.08) cut.value = 0;
    }
  }

  applyFaces();
  paintDissolve(ts);
  raf = requestAnimationFrame(tick);
};

const onPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  dragging.value = true;
  dragOriginX = event.clientX;
  dragOriginCut = cut.value;
  velocity = 0;
  try {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  } catch {
    /* synthetic */
  }
};

const onPointerMove = (event: PointerEvent) => {
  if (!dragging.value) return;
  const delta = event.clientX - dragOriginX;
  cut.value = clampCut(dragOriginCut - delta);
  velocity = -event.movementX * 0.35;
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
  scrubBy(-dominant * 0.55);
};

const ariaLabel = computed(() =>
  en.value
    ? 'Illustration: one card crosses a center scanner. Right of the beam it is chat; through the dissolve it becomes the same work as a Hyperion flow. Scroll or drag forward to transform; reverse restores chat. Decorative; not a live agent run.'
    : 'Ilustración: una sola tarjeta cruza un escáner central. A la derecha del haz es chat; al disolverse se vuelve el mismo trabajo como flujo Hyperion. Avanza con scroll o arrastre; al revés recuperas el chat. Decorativo; no es una ejecución en vivo.',
);

onMounted(async () => {
  mediaMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  syncMotion();
  mediaMotion.addEventListener('change', syncMotion);
  await nextTick();
  measure();
  cut.value = cardWidth.value * 0.42;
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
  window.removeEventListener('resize', measure);
  delete (
    window as Window & {
      __hyperionScanner?: { scrubBy: (deltaPx: number) => void };
    }
  ).__hyperionScanner;
});
</script>

<template>
  <figure
    class="landscape-diagram landscape-compare scanner-compare one-card"
    :class="{
      compact: props.compact,
      'motion-ready': !reduced,
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
      data-cards="1"
      @pointerenter="hovering = true"
      @pointerleave="hovering = false"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
    >
      <div class="scanner-beam" aria-hidden="true"></div>
      <canvas ref="canvasEl" class="scanner-fx" aria-hidden="true"></canvas>

      <div
        ref="slot"
        class="scanner-slot single"
        aria-hidden="true"
        :style="{
          transform: `translate3d(-${cut}px, 0, 0)`,
        }"
      >
        <article ref="chatEl" class="scanner-card chat-face">
          <p class="card-label">Chat</p>
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
        <article ref="flowEl" class="scanner-card flow-face">
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
    </div>

    <figcaption>
      {{
        en
          ? 'One card: right of the beam is chat; through the scanner the same work becomes a Hyperion path. Scroll forward to transform; reverse restores chat. Decorative motion — not a live agent run.'
          : 'Una sola tarjeta: a la derecha del haz es chat; al cruzar el escáner el mismo trabajo se vuelve un recorrido Hyperion. Avanza para transformar; al revés recuperas el chat. Movimiento decorativo — no es una ejecución en vivo.'
      }}
    </figcaption>
  </figure>
</template>
