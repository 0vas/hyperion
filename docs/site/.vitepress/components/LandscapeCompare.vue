<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useData } from 'vitepress';

const props = defineProps<{ compact?: boolean }>();
const { lang } = useData();
const en = computed(() => lang.value !== 'es');

type FlowNode = {
  kind: 'start' | 'task' | 'end';
  label: string;
  role?: string;
  state?: 'done' | 'wait' | 'next';
  decision?: boolean;
  status?: string;
};

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
          { kind: 'start' as const, label: 'Start' },
          {
            kind: 'task' as const,
            label: 'Plan release',
            role: 'Agent',
            state: 'done' as const,
            status: 'Completed',
          },
          {
            kind: 'task' as const,
            label: 'Approve macOS?',
            role: 'You',
            state: 'wait' as const,
            decision: true,
            status: 'Your turn',
          },
          {
            kind: 'task' as const,
            label: 'Build artifacts',
            role: 'Agent',
            state: 'next' as const,
            status: 'Pending',
          },
          { kind: 'end' as const, label: 'End' },
        ] satisfies FlowNode[],
        evidence: 'Evidence · digests pending your call',
        footChat: 'The thread is the map',
        footFlow: 'The process is the map',
        hint: 'Scroll when the stage is in view · beam right→left · drag optional',
        kicker: 'Guided as a process',
        caption:
          'One card: once the stage sits in view, a slower beam sweeps right to left — chat becomes a full Hyperion canvas. Drag is optional. Decorative — not a live agent run.',
        aria: 'Illustration: a beam sweeps right to left across one card. After the stage reaches reading height, page scroll transforms chat into a full Hyperion canvas ending with the beam on the left; scrolling back restores chat. Optional drag. Decorative; not a live agent run.',
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
          { kind: 'start' as const, label: 'Inicio' },
          {
            kind: 'task' as const,
            label: 'Plan de release',
            role: 'Agente',
            state: 'done' as const,
            status: 'Completado',
          },
          {
            kind: 'task' as const,
            label: '¿Apruebo macOS?',
            role: 'Tú',
            state: 'wait' as const,
            decision: true,
            status: 'Tu turno',
          },
          {
            kind: 'task' as const,
            label: 'Build artefactos',
            role: 'Agente',
            state: 'next' as const,
            status: 'Pendiente',
          },
          { kind: 'end' as const, label: 'Fin' },
        ] satisfies FlowNode[],
        evidence: 'Evidencia · digests pendientes de tu decisión',
        footChat: 'El hilo es el mapa',
        footFlow: 'El proceso es el mapa',
        hint: 'Scroll cuando el escenario esté a la vista · haz derecha→izquierda · arrastre opcional',
        kicker: 'Guiado como proceso',
        caption:
          'Una sola tarjeta: cuando el escenario está a la altura de lectura, un haz más lento barre de derecha a izquierda y el chat se vuelve un canvas Hyperion completo. Arrastre opcional. Decorativo — no es una ejecución en vivo.',
        aria: 'Ilustración: un haz barre de derecha a izquierda sobre una sola tarjeta. Tras la altura de lectura, el scroll transforma el chat en un canvas Hyperion completo con el haz a la izquierda; al subir se recupera el chat. Arrastre opcional. Decorativo; no es una ejecución en vivo.',
      },
);

type Speck = {
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
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

/**
 * Scanned amount from the right: 0 = beam at right (full chat),
 * cw = beam at left (full Hyperion). Beam sweeps right → left.
 */
const cut = ref(0);
const cardWidth = ref(520);
const beamX = ref(520);
/** Beam X within the stage (card left + beamX). */
const beamLeft = ref(0);
const dragging = ref(false);
const reduced = ref(true);
const scrollLocked = ref(false);
const scrubArmed = ref(false);

const FADE = 28;
const HOT = '#FF5A1F';
/** Gate + longer travel so scrub feels a bit slower. */
const SCRUB_GATE = 0.42;
const SCRUB_END = -0.1;

let mediaMotion: MediaQueryList | undefined;
let raf = 0;
let dragOriginX = 0;
let dragOriginCut = 0;
let dragBias = 0;
let prevCut = 0;
let specks: Speck[] = [];
let speckSeed = 0;

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

const syncBeam = () => {
  beamX.value = Math.max(0, cardWidth.value - cut.value);
  const root = stage.value;
  const card = slot.value;
  if (!root || !card) {
    beamLeft.value = beamX.value;
    return;
  }
  const cardLeft =
    card.getBoundingClientRect().left - root.getBoundingClientRect().left;
  beamLeft.value = cardLeft + beamX.value;
};

const measure = () => {
  if (!slot.value) return;
  cardWidth.value = slot.value.offsetWidth || 520;
  cut.value = clampCut(cut.value);
  syncBeam();
};

/**
 * Page-scroll progress — gated until the stage sits at reading height
 * (hero no longer fills the view). Longer travel = slower scrub.
 */
const scrollProgress = () => {
  const el = stage.value;
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const vh = Math.max(1, window.innerHeight);
  const gate = vh * SCRUB_GATE;
  const end = vh * SCRUB_END;
  scrubArmed.value = rect.top <= gate;
  if (rect.top > gate) return 0;
  return Math.min(1, Math.max(0, (gate - rect.top) / Math.max(1, gate - end)));
};

const applyScrollCut = () => {
  if (dragging.value || scrollLocked.value) return;
  cut.value = clampCut(scrollProgress() * cardWidth.value + dragBias);
  syncBeam();
};

const applyFaces = () => {
  const chat = chatEl.value;
  const flow = flowEl.value;
  const cw = cardWidth.value;
  const bx = beamX.value;
  if (!chat || !flow || !cw) return;

  // Left of beam = chat (unscanned); right of beam = Hyperion (scanned).
  if (bx >= cw - 0.5) {
    chat.style.visibility = 'visible';
    chat.style.clipPath = 'none';
    chat.style.webkitMaskImage = '';
    chat.style.maskImage = '';
    flow.style.visibility = 'hidden';
    flow.style.clipPath = 'inset(0 0 0 100%)';
  } else if (bx <= 0.5) {
    chat.style.visibility = 'hidden';
    chat.style.clipPath = 'inset(0 100% 0 0)';
    chat.style.webkitMaskImage = '';
    chat.style.maskImage = '';
    flow.style.visibility = 'visible';
    flow.style.clipPath = 'none';
  } else {
    chat.style.visibility = 'visible';
    chat.style.clipPath = `inset(0 ${Math.max(0, cw - bx)}px 0 0 round 18px 0 0 18px)`;
    const fade = `linear-gradient(90deg, #000 ${Math.max(0, bx - FADE)}px, transparent ${bx}px)`;
    chat.style.webkitMaskImage = fade;
    chat.style.maskImage = fade;
    flow.style.visibility = 'visible';
    flow.style.clipPath = `inset(0 0 0 ${bx}px round 0 18px 18px 0)`;
  }
};

const spawnSpecks = (
  edgeX: number,
  cardTop: number,
  cardH: number,
  delta: number,
) => {
  if (reduced.value) return;
  const active = Math.abs(delta) >= 0.25;
  const ambient =
    !active &&
    cut.value > 8 &&
    cut.value < cardWidth.value - 8 &&
    hash(cut.value * 0.19 + speckSeed) > 0.55;
  if (!active && !ambient) return;
  // cut↑ = beam moves left (advance); chat breaks on the left, Hyperion forms on the right.
  const advancing = active ? delta > 0 : true;
  const burst = active ? Math.min(36, 8 + Math.ceil(Math.abs(delta) * 1.1)) : 5;
  for (let i = 0; i < burst; i++) {
    speckSeed += 1;
    const seed = speckSeed * 23.1 + cut.value * 0.11;
    const y = cardTop + 8 + hash(seed) * Math.max(16, cardH - 16);
    const size = 1.2 + hash(seed + 2) * 2.8;
    const outward = 0.6 + hash(seed + 3) * 2.4;
    const lateral = (hash(seed + 4) - 0.5) * 1.6;
    if (advancing) {
      specks.push({
        x: edgeX + (hash(seed + 5) - 0.5) * 4,
        y,
        size,
        vx: -outward,
        vy: lateral,
        life: 0,
        maxLife: 18 + hash(seed + 6) * 28,
        kind: 'break',
        tone: hash(seed + 7),
      });
      specks.push({
        x: edgeX + 4 + hash(seed + 8) * 10,
        y: y + (hash(seed + 9) - 0.5) * 8,
        size: 1 + hash(seed + 10) * 2.2,
        vx: outward * 0.85,
        vy: (hash(seed + 11) - 0.5) * 1.4,
        life: 0,
        maxLife: 16 + hash(seed + 12) * 24,
        kind: 'form',
        tone: hash(seed + 13),
      });
    } else {
      specks.push({
        x: edgeX + (hash(seed + 5) - 0.5) * 4,
        y,
        size,
        vx: outward,
        vy: lateral,
        life: 0,
        maxLife: 18 + hash(seed + 6) * 28,
        kind: 'break',
        tone: hash(seed + 7),
      });
      specks.push({
        x: edgeX - 4 - hash(seed + 8) * 10,
        y: y + (hash(seed + 9) - 0.5) * 8,
        size: 1 + hash(seed + 10) * 2.2,
        vx: -outward * 0.85,
        vy: (hash(seed + 11) - 0.5) * 1.4,
        life: 0,
        maxLife: 16 + hash(seed + 12) * 24,
        kind: 'form',
        tone: hash(seed + 13),
      });
    }
  }
  if (specks.length > 280) specks = specks.slice(-200);
};

const stepSpecks = (dt: number) => {
  const next: Speck[] = [];
  for (const speck of specks) {
    speck.life += dt / 16;
    if (speck.life / speck.maxLife >= 1) continue;
    speck.x += speck.vx * (dt / 16);
    speck.y += speck.vy * (dt / 16);
    speck.vx *= 0.97;
    speck.vy *= 0.97;
    next.push(speck);
  }
  specks = next;
};

const paintSpecks = (ctx: CanvasRenderingContext2D) => {
  for (const speck of specks) {
    const t = speck.life / speck.maxLife;
    const alpha =
      speck.kind === 'form'
        ? Math.min(1, t * 2.5) * (1 - t) * 0.9
        : (1 - t) * (0.45 + speck.tone * 0.45);
    if (alpha <= 0.03) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle =
      speck.kind === 'break'
        ? `rgba(255,${120 + Math.floor(speck.tone * 90)},55,${alpha})`
        : `rgba(255,${190 + Math.floor(speck.tone * 40)},160,${alpha})`;
    const s = speck.size;
    if (hash(speck.tone * 50) > 0.55) {
      ctx.beginPath();
      ctx.arc(speck.x, speck.y, s * 0.55, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(speck.x, speck.y, s, s * 0.7);
    }
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

  const cw = cardWidth.value;
  const c = cut.value;
  const bx = beamX.value;
  const slotRect = slot.value?.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const cardLeft = slotRect ? slotRect.left - rootRect.left : (width - cw) / 2;
  const cardTop = slotRect ? slotRect.top - rootRect.top : height * 0.08;
  const cardH = slot.value?.offsetHeight || height * 0.84;
  const transform = Math.min(1, Math.max(0, c / Math.max(1, cw)));
  const edgeX = cardLeft + bx;
  const delta = c - prevCut;
  prevCut = c;

  if (!reduced.value && c > 1 && c < cw - 1) {
    spawnSpecks(edgeX, cardTop, cardH, delta);
    stepSpecks(dt);
  } else if (reduced.value) {
    specks = [];
  } else {
    stepSpecks(dt);
  }

  ctx.strokeStyle = HOT;
  ctx.lineWidth = 2;
  ctx.globalAlpha = reduced.value ? 0.55 : 0.98;
  ctx.beginPath();
  ctx.moveTo(edgeX, 0);
  ctx.lineTo(edgeX, height);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (reduced.value) return;

  const hazeW = 40 + transform * 24;
  const haze = ctx.createLinearGradient(edgeX - hazeW, 0, edgeX + hazeW, 0);
  haze.addColorStop(0, 'rgba(255,90,31,0)');
  haze.addColorStop(0.4, 'rgba(255,90,31,0.2)');
  haze.addColorStop(0.5, 'rgba(255,90,31,0.58)');
  haze.addColorStop(0.6, 'rgba(255,90,31,0.2)');
  haze.addColorStop(1, 'rgba(255,90,31,0)');
  ctx.fillStyle = haze;
  ctx.fillRect(edgeX - hazeW, 0, hazeW * 2, height);

  paintSpecks(ctx);

  if (c <= 1 || c >= cw - 1) return;

  for (let i = 0; i < 120; i++) {
    const seed = i * 17.3 + Math.floor(c) * 0.37 + Math.floor(ts / 48);
    const px = edgeX + (hash(seed) - 0.5) * 14;
    const py = cardTop + hash(seed + 4.1) * cardH;
    const alpha = 0.18 + hash(seed + 9) * 0.4;
    ctx.fillStyle = `rgba(255,${90 + Math.floor(hash(seed + 3) * 100)},40,${alpha})`;
    ctx.fillRect(Math.floor(px), Math.floor(py), 1, 1);
  }
};

const scrubBy = (deltaPx: number) => {
  scrollLocked.value = true;
  cut.value = clampCut(cut.value - deltaPx);
  syncBeam();
  // Preserve programmatic scrub against the next scroll-linked apply.
  dragBias = cut.value - scrollProgress() * cardWidth.value;
  window.setTimeout(() => {
    scrollLocked.value = false;
  }, 80);
};

let lastTs = 0;
const tick = (ts: number) => {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(32, ts - lastTs);
  lastTs = ts;
  applyScrollCut();
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
  // Drag left advances (beam → left); drag right restores chat.
  const delta = event.clientX - dragOriginX;
  cut.value = clampCut(dragOriginCut - delta);
  syncBeam();
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
      'scrub-armed': scrubArmed,
    }"
    role="img"
    :aria-label="copy.aria"
  >
    <div class="scanner-chrome">
      <p class="scanner-kicker">{{ copy.kicker }}</p>
      <p class="scanner-hint" aria-hidden="true">{{ copy.hint }}</p>
    </div>

    <div
      class="scanner-immersion"
      data-scrub="page"
      data-scrub-gate="viewport"
      data-beam-dir="rtl"
    >
      <div
        ref="stage"
        class="scanner-stage"
        data-scanner="distill"
        data-cards="1"
        data-scrub="page"
        data-beam-dir="rtl"
        :data-scrub-armed="scrubArmed ? 'true' : 'false'"
        :data-beam-x="String(Math.round(beamX))"
        :data-scanned="String(Math.round(cut))"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <div
          class="scanner-beam"
          aria-hidden="true"
          :style="{ left: `${beamLeft}px` }"
        ></div>
        <canvas ref="canvasEl" class="scanner-fx" aria-hidden="true"></canvas>

        <div
          ref="slot"
          class="scanner-slot single"
          aria-hidden="true"
          :data-beam-x="String(Math.round(beamX))"
          :data-scanned="String(Math.round(cut))"
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
            <div class="sim-canvas-board">
              <ol class="sim-canvas-lane">
                <li
                  v-for="(node, index) in copy.nodes"
                  :key="node.label"
                  :class="[
                    `kind-${node.kind}`,
                    node.state,
                    {
                      decision: node.decision,
                      connector: index < copy.nodes.length - 1,
                    },
                  ]"
                >
                  <span v-if="node.kind === 'start'" class="sim-event start">
                    <i aria-hidden="true"></i>
                    <strong>{{ node.label }}</strong>
                  </span>
                  <span v-else-if="node.kind === 'end'" class="sim-event end">
                    <i aria-hidden="true"></i>
                    <strong>{{ node.label }}</strong>
                  </span>
                  <span v-else class="sim-task-card" :data-state="node.state">
                    <span class="sim-task-accent" aria-hidden="true"></span>
                    <span class="sim-task-top">
                      <small class="sim-task-num">0{{ index }}</small>
                      <small class="sim-task-status">{{ node.status }}</small>
                    </span>
                    <strong>{{ node.label }}</strong>
                    <small v-if="node.role" class="sim-task-role">{{
                      node.role
                    }}</small>
                  </span>
                </li>
              </ol>
            </div>
            <p class="sim-evidence">{{ copy.evidence }}</p>
            <p class="panel-foot">{{ copy.footFlow }}</p>
          </article>
        </div>
      </div>
    </div>

    <figcaption>{{ copy.caption }}</figcaption>
  </figure>
</template>
