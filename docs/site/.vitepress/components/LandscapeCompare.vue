<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useData } from 'vitepress';

const props = defineProps<{ compact?: boolean }>();
const { lang } = useData();
const en = computed(() => lang.value !== 'es');

const copy = computed(() =>
  en.value
    ? {
        chatTitle: 'Ship the preview installers',
        chatMeta: 'Agent · chat',
        chatLines: [
          {
            side: 'agent' as const,
            text: 'What’s the goal for this session?',
          },
          {
            side: 'user' as const,
            text: 'Ship the preview installers for macOS and Windows.',
          },
          {
            side: 'agent' as const,
            text: 'I’ll turn that into a visible path — plan, your gate, then build.',
          },
          {
            side: 'user' as const,
            text: 'Hold the macOS path until digests check out.',
          },
        ],
        composer: 'Ask follow-up…',
        flowTitle: 'Preview installers',
        flowMeta: 'Hyperion · canvas',
        nodes: [
          { label: 'Start', state: 'done' as const, role: '' },
          { label: 'Plan release', state: 'done' as const, role: 'Agent' },
          {
            label: 'Approve macOS?',
            state: 'wait' as const,
            role: 'You',
            decision: true,
          },
          { label: 'Build artifacts', state: 'next' as const, role: 'Agent' },
          { label: 'End', state: 'next' as const, role: '' },
        ],
        evidence: 'Evidence · digests pending your call',
        footChat: 'The thread is the map',
        footFlow: 'The process is the map',
        hint: 'Scroll the page · drag optional · reverse restores chat',
        kicker: 'Guided as a process',
        caption:
          'One card: as you scroll the page, chat dissolves through the beam into the same work as a Hyperion path. Drag is optional. Decorative — not a live agent run.',
        aria: 'Illustration: one card crosses a center scanner. Page scroll advances the cut from chat into a Hyperion canvas; scrolling back restores chat. Optional drag. Decorative; not a live agent run.',
      }
    : {
        chatTitle: 'Publicar los instaladores',
        chatMeta: 'Agente · chat',
        chatLines: [
          {
            side: 'agent' as const,
            text: '¿Cuál es el objetivo de esta sesión?',
          },
          {
            side: 'user' as const,
            text: 'Publicar los instaladores preview de macOS y Windows.',
          },
          {
            side: 'agent' as const,
            text: 'Lo convierto en un recorrido visible — plan, tu puerta y luego el build.',
          },
          {
            side: 'user' as const,
            text: 'Pausa macOS hasta que cuadren los digests.',
          },
        ],
        composer: 'Escribe un seguimiento…',
        flowTitle: 'Instaladores preview',
        flowMeta: 'Hyperion · canvas',
        nodes: [
          { label: 'Inicio', state: 'done' as const, role: '' },
          { label: 'Plan de release', state: 'done' as const, role: 'Agente' },
          {
            label: '¿Apruebo macOS?',
            state: 'wait' as const,
            role: 'Tú',
            decision: true,
          },
          { label: 'Build artefactos', state: 'next' as const, role: 'Agente' },
          { label: 'Fin', state: 'next' as const, role: '' },
        ],
        evidence: 'Evidencia · digests pendientes de tu decisión',
        footChat: 'El hilo es el mapa',
        footFlow: 'El proceso es el mapa',
        hint: 'Scroll de la página · arrastre opcional · al revés vuelve el chat',
        kicker: 'Guiado como proceso',
        caption:
          'Una sola tarjeta: al hacer scroll en la página, el chat se disuelve en el haz y el mismo trabajo aparece como recorrido Hyperion. Arrastre opcional. Decorativo — no es una ejecución en vivo.',
        aria: 'Ilustración: una sola tarjeta cruza un escáner central. El scroll de la página avanza el corte del chat al canvas Hyperion; al subir se recupera el chat. Arrastre opcional. Decorativo; no es una ejecución en vivo.',
      },
);

const track = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);
const slot = ref<HTMLElement | null>(null);
const chatEl = ref<HTMLElement | null>(null);
const flowEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);

/** Cut across the single card: 0 = all chat (right of beam), cw = all flow (left). */
const cut = ref(0);
const cardWidth = ref(520);
const dragging = ref(false);
const reduced = ref(true);
const scrollLocked = ref(false);

const FADE = 28;
const HOT = '#FF5A1F';

let mediaMotion: MediaQueryList | undefined;
let raf = 0;
let dragOriginX = 0;
let dragOriginCut = 0;
let dragBias = 0;

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

const scrollProgress = () => {
  const el = track.value;
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const travel = Math.max(1, rect.height - window.innerHeight);
  const scrolled = Math.min(Math.max(-rect.top, 0), travel);
  return scrolled / travel;
};

const applyScrollCut = () => {
  if (dragging.value || scrollLocked.value) return;
  cut.value = clampCut(scrollProgress() * cardWidth.value + dragBias);
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
    chat.style.clipPath = `inset(0 0 0 ${c}px round 0 18px 18px 0)`;
    const fade = `linear-gradient(90deg, transparent ${c}px, #000 ${c + FADE}px)`;
    chat.style.webkitMaskImage = fade;
    chat.style.maskImage = fade;
    flow.style.visibility = 'visible';
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
  const transform = Math.min(1, Math.max(0, c / Math.max(1, cw)));

  ctx.strokeStyle = HOT;
  ctx.lineWidth = 2;
  ctx.globalAlpha = reduced.value ? 0.55 : 0.98;
  ctx.beginPath();
  ctx.moveTo(beam, 0);
  ctx.lineTo(beam, height);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (reduced.value) return;

  const hazeW = 56 + transform * 28;
  const haze = ctx.createLinearGradient(beam - hazeW, 0, beam + hazeW, 0);
  haze.addColorStop(0, 'rgba(255,90,31,0)');
  haze.addColorStop(0.38, 'rgba(255,90,31,0.28)');
  haze.addColorStop(0.5, 'rgba(255,90,31,0.72)');
  haze.addColorStop(0.62, 'rgba(255,90,31,0.28)');
  haze.addColorStop(1, 'rgba(255,90,31,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(beam - hazeW, 0, hazeW * 2, height);

  if (c <= 1 || c >= cw - 1) return;
  const edgeX = cardLeft + c;
  const density = 380 + Math.floor(transform * 160);

  for (let i = 0; i < density; i++) {
    const seed = i * 17.3 + Math.floor(c) * 0.37 + Math.floor(ts / 40);
    const drift = (hash(seed + 11) - 0.35) * (18 + transform * 34);
    const px = edgeX + (hash(seed) - 0.5) * 22 + drift;
    const py = cardTop + hash(seed + 4.1) * cardH;
    const twinkle = 0.5 + 0.5 * Math.sin(ts * 0.022 + seed);
    const alpha = (0.28 + hash(seed + 9) * 0.62) * twinkle;
    const size = hash(seed + 8) > 0.82 ? 3.2 : hash(seed + 2) > 0.48 ? 2 : 1;
    ctx.fillStyle = `rgba(255,${80 + Math.floor(hash(seed + 3) * 120)},28,${alpha})`;
    ctx.fillRect(Math.floor(px), Math.floor(py), size, size);
  }

  for (let i = 0; i < 36; i++) {
    const seed = i * 41.7 + ts * 0.025;
    const sparkY =
      ((hash(seed) + ts * 0.00022 * (0.35 + hash(seed + 1))) % 1) * height;
    const sparkX = beam + (hash(seed + 5) - 0.5) * 22;
    ctx.fillStyle = `rgba(255,230,200,${0.4 + hash(seed + 8) * 0.55})`;
    ctx.fillRect(sparkX, sparkY, 2, 8);
  }

  // Soft “transform state” band: chat glyphs fade into node chips at the beam.
  ctx.globalAlpha = 0.35 + transform * 0.35;
  for (let i = 0; i < 12; i++) {
    const seed = i * 9.1 + Math.floor(c / 8);
    const y = cardTop + 18 + hash(seed) * (cardH - 36);
    const w = 10 + hash(seed + 2) * 18;
    const leftish = hash(seed + 3) > 0.5;
    ctx.fillStyle = leftish
      ? `rgba(255,120,60,${0.25 + hash(seed + 4) * 0.4})`
      : `rgba(255,210,170,${0.2 + hash(seed + 5) * 0.35})`;
    if (leftish) {
      ctx.fillRect(beam - 8 - w, y, w, 3);
    } else {
      ctx.beginPath();
      ctx.arc(beam + 10 + hash(seed + 6) * 10, y + 1, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
};

const scrubBy = (deltaPx: number) => {
  scrollLocked.value = true;
  cut.value = clampCut(cut.value - deltaPx);
  window.setTimeout(() => {
    scrollLocked.value = false;
  }, 80);
};

const tick = (ts: number) => {
  applyFaces();
  paintDissolve(ts);
  raf = requestAnimationFrame(tick);
};

const onPointerDown = (event: PointerEvent) => {
  if (event.button !== 0) return;
  dragging.value = true;
  dragOriginX = event.clientX;
  dragOriginCut = cut.value;
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
};

const onPointerUp = (event: PointerEvent) => {
  if (!dragging.value) return;
  dragging.value = false;
  dragBias = cut.value - scrollProgress() * cardWidth.value;
  try {
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  } catch {
    /* already released */
  }
};

const onScroll = () => {
  dragBias = 0;
  applyScrollCut();
};

const onResize = () => {
  measure();
  applyScrollCut();
};

onMounted(async () => {
  mediaMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  syncMotion();
  mediaMotion.addEventListener('change', syncMotion);
  await nextTick();
  measure();
  applyScrollCut();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);
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
  window.removeEventListener('scroll', onScroll);
  window.removeEventListener('resize', onResize);
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
    :aria-label="copy.aria"
  >
    <div class="scanner-chrome">
      <p class="scanner-kicker">{{ copy.kicker }}</p>
      <p class="scanner-hint" aria-hidden="true">{{ copy.hint }}</p>
    </div>

    <div ref="track" class="scanner-scroll-track" data-scrub="page">
      <div class="scanner-sticky">
        <div
          ref="stage"
          class="scanner-stage"
          data-scanner="distill"
          data-cards="1"
          data-scrub="page"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
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
            <article ref="chatEl" class="scanner-card chat-face sim-chat">
              <header class="sim-bar">
                <span class="sim-dot" aria-hidden="true"></span>
                <span class="sim-bar-meta">{{ copy.chatMeta }}</span>
                <span class="sim-bar-state">{{ en ? 'Thread' : 'Hilo' }}</span>
              </header>
              <p class="card-title">{{ copy.chatTitle }}</p>
              <div class="chat-stack sim-thread">
                <span
                  v-for="(line, index) in copy.chatLines"
                  :key="index"
                  class="bubble"
                  :class="line.side"
                  >{{ line.text }}</span
                >
              </div>
              <div class="sim-composer" aria-hidden="true">
                <span class="sim-composer-input">{{ copy.composer }}</span>
                <span class="sim-send">↑</span>
              </div>
              <p class="panel-foot">{{ copy.footChat }}</p>
            </article>

            <article ref="flowEl" class="scanner-card flow-face sim-canvas">
              <header class="sim-bar">
                <span class="sim-dot accent" aria-hidden="true"></span>
                <span class="sim-bar-meta">{{ copy.flowMeta }}</span>
                <span class="sim-bar-state wait">{{
                  en ? 'Your turn' : 'Tu turno'
                }}</span>
              </header>
              <p class="card-title">{{ copy.flowTitle }}</p>
              <ol class="sim-flow">
                <li
                  v-for="(node, index) in copy.nodes"
                  :key="node.label"
                  :class="[
                    node.state,
                    {
                      decision: node.decision,
                      connector: index < copy.nodes.length - 1,
                    },
                  ]"
                >
                  <span class="sim-node">
                    <strong>{{ node.label }}</strong>
                    <small v-if="node.role">{{ node.role }}</small>
                  </span>
                </li>
              </ol>
              <p class="sim-evidence">{{ copy.evidence }}</p>
              <p class="panel-foot">{{ copy.footFlow }}</p>
            </article>
          </div>
        </div>
      </div>
    </div>

    <figcaption>{{ copy.caption }}</figcaption>
  </figure>
</template>
