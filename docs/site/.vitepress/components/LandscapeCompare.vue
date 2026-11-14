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
          'One card: as you scroll the page, chat shatters through the beam and reassembles as a Hyperion path. Drag is optional. Decorative — not a live agent run.',
        aria: 'Illustration: one card crosses a center scanner. Page scroll advances the cut from chat into a Hyperion canvas with fragment shatter and reassembly; scrolling back restores chat. Optional drag. Decorative; not a live agent run.',
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
          'Una sola tarjeta: al hacer scroll en la página, el chat se fragmenta en el haz y se recompone como recorrido Hyperion. Arrastre opcional. Decorativo — no es una ejecución en vivo.',
        aria: 'Ilustración: una sola tarjeta cruza un escáner central. El scroll de la página avanza el corte del chat al canvas Hyperion con fragmentación y reensamblaje; al subir se recupera el chat. Arrastre opcional. Decorativo; no es una ejecución en vivo.',
      },
);

type Shard = {
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  vx: number;
  vy: number;
  vr: number;
  life: number;
  maxLife: number;
  kind: 'break' | 'form';
  tone: number;
};

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
let prevCut = 0;
let shards: Shard[] = [];
let shardSeed = 0;

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

/**
 * Page-scroll progress from the stage’s natural travel through the viewport.
 * No tall sticky spacer — immersion stays continuous with surrounding page content.
 */
const scrollProgress = () => {
  const el = stage.value;
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const vh = Math.max(1, window.innerHeight);
  const start = vh * 0.78;
  const end = vh * 0.22;
  return Math.min(1, Math.max(0, (start - rect.top) / (start - end)));
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

const spawnShards = (
  edgeX: number,
  cardTop: number,
  cardH: number,
  delta: number,
) => {
  if (reduced.value) return;
  const active = Math.abs(delta) >= 0.2;
  // Keep a low ambient composition rate while the cut is mid-transform.
  const ambient =
    !active &&
    cut.value > 8 &&
    cut.value < cardWidth.value - 8 &&
    hash(cut.value * 0.17 + shardSeed) > 0.72;
  if (!active && !ambient) return;
  const breaking = active ? delta > 0 : true;
  const burst = active
    ? Math.min(28, 6 + Math.ceil(Math.abs(delta) * 0.85))
    : 4;
  for (let i = 0; i < burst; i++) {
    shardSeed += 1;
    const seed = shardSeed * 19.7 + cut.value * 0.13;
    const y = cardTop + 10 + hash(seed) * Math.max(20, cardH - 20);
    const w = 14 + hash(seed + 2) * 42;
    const h = 9 + hash(seed + 3) * 28;
    if (breaking) {
      shards.push({
        x: edgeX - 4,
        y,
        w,
        h,
        rot: (hash(seed + 4) - 0.5) * 0.9,
        vx: 1.2 + hash(seed + 5) * 5.5,
        vy: (hash(seed + 6) - 0.45) * 3.2,
        vr: (hash(seed + 7) - 0.5) * 0.18,
        life: 0,
        maxLife: 26 + hash(seed + 8) * 38,
        kind: 'break',
        tone: hash(seed + 9),
      });
      shards.push({
        x: edgeX + 6 + hash(seed + 10) * 28,
        y: y + (hash(seed + 11) - 0.5) * 16,
        w: 8 + hash(seed + 12) * 22,
        h: 6 + hash(seed + 13) * 16,
        rot: (hash(seed + 14) - 0.5) * 1.2,
        vx: -(0.8 + hash(seed + 15) * 3.4),
        vy: (hash(seed + 16) - 0.5) * 2.4,
        vr: (hash(seed + 17) - 0.5) * 0.14,
        life: 0,
        maxLife: 22 + hash(seed + 18) * 34,
        kind: 'form',
        tone: hash(seed + 19),
      });
    } else {
      shards.push({
        x: edgeX + 2,
        y,
        w,
        h,
        rot: (hash(seed + 4) - 0.5) * 0.9,
        vx: -(1.2 + hash(seed + 5) * 5.5),
        vy: (hash(seed + 6) - 0.45) * 3.2,
        vr: (hash(seed + 7) - 0.5) * 0.18,
        life: 0,
        maxLife: 26 + hash(seed + 8) * 38,
        kind: 'break',
        tone: hash(seed + 9),
      });
      shards.push({
        x: edgeX - 10 - hash(seed + 10) * 30,
        y: y + (hash(seed + 11) - 0.5) * 16,
        w: 8 + hash(seed + 12) * 22,
        h: 6 + hash(seed + 13) * 16,
        rot: (hash(seed + 14) - 0.5) * 1.2,
        vx: 0.8 + hash(seed + 15) * 3.4,
        vy: (hash(seed + 16) - 0.5) * 2.4,
        vr: (hash(seed + 17) - 0.5) * 0.14,
        life: 0,
        maxLife: 22 + hash(seed + 18) * 34,
        kind: 'form',
        tone: hash(seed + 19),
      });
    }
  }
  if (shards.length > 220) shards = shards.slice(-160);
};

const stepShards = (dt: number) => {
  const next: Shard[] = [];
  for (const shard of shards) {
    shard.life += dt / 16;
    const t = shard.life / shard.maxLife;
    if (t >= 1) continue;
    const drag = shard.kind === 'form' ? 0.94 : 0.985;
    shard.x += shard.vx * (dt / 16);
    shard.y += shard.vy * (dt / 16);
    shard.rot += shard.vr * (dt / 16);
    shard.vx *= drag;
    shard.vy = shard.vy * drag + (shard.kind === 'break' ? 0.04 : -0.02);
    next.push(shard);
  }
  shards = next;
};

const paintShards = (ctx: CanvasRenderingContext2D) => {
  for (const shard of shards) {
    const t = shard.life / shard.maxLife;
    const alpha =
      shard.kind === 'form'
        ? Math.min(1, t * 2.4) * (1 - t) * 1
        : (1 - t) * (0.72 + shard.tone * 0.28);
    if (alpha <= 0.02) continue;
    const fill =
      shard.kind === 'break'
        ? `rgba(${238 + Math.floor(shard.tone * 14)},${226 + Math.floor(shard.tone * 12)},${208},`
        : `rgba(${242 + Math.floor(shard.tone * 10)},${214 + Math.floor(shard.tone * 18)},${168},`;
    ctx.save();
    ctx.translate(shard.x + shard.w / 2, shard.y + shard.h / 2);
    ctx.rotate(shard.rot);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `${fill}${Math.min(1, alpha + 0.15)})`;
    ctx.strokeStyle = `rgba(255,90,31,${0.28 + (1 - t) * 0.45})`;
    ctx.lineWidth = 1.25;
    const rw = shard.w;
    const rh = shard.h;
    ctx.beginPath();
    ctx.moveTo(-rw / 2, -rh / 2 + 2);
    ctx.lineTo(-rw / 2 + 3, -rh / 2);
    ctx.lineTo(rw / 2, -rh / 2 + hash(shard.tone * 40) * 3);
    ctx.lineTo(rw / 2 - 2, rh / 2);
    ctx.lineTo(-rw / 2 + hash(shard.tone * 70) * 4, rh / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (shard.kind === 'form' && shard.w > 16) {
      ctx.fillStyle = `rgba(149,104,44,${0.25 * (1 - t)})`;
      ctx.fillRect(-rw / 4, -2, rw / 2, 3);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
};

const paintDissolve = (ts: number, dt: number) => {
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
  const edgeX = cardLeft + c;
  const delta = c - prevCut;
  prevCut = c;

  if (!reduced.value && c > 1 && c < cw - 1) {
    spawnShards(edgeX, cardTop, cardH, delta);
    stepShards(dt);
  } else if (reduced.value) {
    shards = [];
  } else {
    stepShards(dt);
  }

  ctx.strokeStyle = HOT;
  ctx.lineWidth = 2;
  ctx.globalAlpha = reduced.value ? 0.55 : 0.98;
  ctx.beginPath();
  ctx.moveTo(beam, 0);
  ctx.lineTo(beam, height);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (reduced.value) return;

  const hazeW = 52 + transform * 36;
  const haze = ctx.createLinearGradient(beam - hazeW, 0, beam + hazeW, 0);
  haze.addColorStop(0, 'rgba(255,90,31,0)');
  haze.addColorStop(0.38, 'rgba(255,90,31,0.26)');
  haze.addColorStop(0.5, 'rgba(255,90,31,0.7)');
  haze.addColorStop(0.62, 'rgba(255,90,31,0.26)');
  haze.addColorStop(1, 'rgba(255,90,31,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(beam - hazeW, 0, hazeW * 2, height);

  paintShards(ctx);

  if (c <= 1 || c >= cw - 1) return;

  // Fine ash at the cut — secondary to fragment composition.
  for (let i = 0; i < 160; i++) {
    const seed = i * 17.3 + Math.floor(c) * 0.37 + Math.floor(ts / 40);
    const drift = (hash(seed + 11) - 0.35) * (14 + transform * 26);
    const px = edgeX + (hash(seed) - 0.5) * 16 + drift;
    const py = cardTop + hash(seed + 4.1) * cardH;
    const twinkle = 0.5 + 0.5 * Math.sin(ts * 0.022 + seed);
    const alpha = (0.22 + hash(seed + 9) * 0.5) * twinkle;
    const size = hash(seed + 8) > 0.8 ? 2.6 : 1;
    ctx.fillStyle = `rgba(255,${80 + Math.floor(hash(seed + 3) * 120)},28,${alpha})`;
    ctx.fillRect(Math.floor(px), Math.floor(py), size, size);
  }

  for (let i = 0; i < 28; i++) {
    const seed = i * 41.7 + ts * 0.025;
    const sparkY =
      ((hash(seed) + ts * 0.00022 * (0.35 + hash(seed + 1))) % 1) * height;
    const sparkX = beam + (hash(seed + 5) - 0.5) * 20;
    ctx.fillStyle = `rgba(255,230,200,${0.35 + hash(seed + 8) * 0.5})`;
    ctx.fillRect(sparkX, sparkY, 2, 7);
  }
};

const scrubBy = (deltaPx: number) => {
  scrollLocked.value = true;
  cut.value = clampCut(cut.value - deltaPx);
  window.setTimeout(() => {
    scrollLocked.value = false;
  }, 80);
};

let lastTs = 0;
const tick = (ts: number) => {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(32, ts - lastTs);
  lastTs = ts;
  applyFaces();
  paintDissolve(ts, dt);
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
  prevCut = cut.value;
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

    <div class="scanner-immersion" data-scrub="page">
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

    <figcaption>{{ copy.caption }}</figcaption>
  </figure>
</template>
