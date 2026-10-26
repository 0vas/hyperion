import type { Artifact } from '../domain/artifacts';
import type { RunEvent, Step } from '../domain/workflow';
import { isSandboxedMarkup } from './artifact-preview';

export type EvidenceKind = 'artifact' | 'outputs' | 'log' | 'empty';

export type StepEvidence = {
  kind: EvidenceKind;
  artifact?: Artifact;
  extraArtifactCount: number;
  outputs?: Record<string, unknown>;
  logSummary?: string;
};

function typeScore(artifact: Artifact): number {
  if (artifact.url) return 4;
  if (isSandboxedMarkup(artifact.mediaType)) return 0;
  if (/^image\/(png|jpeg|gif|webp)$/.test(artifact.mediaType)) return 1;
  if (
    /^text\//.test(artifact.mediaType) ||
    artifact.mediaType === 'application/json'
  )
    return 2;
  return 3;
}

/** Prefer current-attempt sandboxed HTML/SVG, then image, then text, then other files. */
export function pickPreferredArtifact(
  artifacts: Artifact[] | undefined,
  attempt: number,
): Artifact | undefined {
  if (!artifacts?.length) return undefined;
  return [...artifacts].sort((a, b) => {
    const attemptDelta =
      (a.attempt === attempt ? 0 : 1) - (b.attempt === attempt ? 0 : 1);
    if (attemptDelta) return attemptDelta;
    const typeDelta = typeScore(a) - typeScore(b);
    if (typeDelta) return typeDelta;
    return b.createdAt.localeCompare(a.createdAt);
  })[0];
}

function latestPublicLog(
  events: RunEvent[],
  stepId: string,
): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event.stepId !== stepId || !event.message) continue;
    if (['log', 'complete', 'fail', 'submit', 'approve'].includes(event.type))
      return event.message;
  }
  return undefined;
}

/** Evidence-first projection for Resultado: artifact → outputs → log → empty. */
export function resolveStepEvidence(
  step: Step,
  events: RunEvent[],
): StepEvidence {
  const preferred = pickPreferredArtifact(step.artifacts, step.attempt);
  if (preferred) {
    return {
      kind: 'artifact',
      artifact: preferred,
      extraArtifactCount: Math.max(0, (step.artifacts?.length || 0) - 1),
    };
  }
  if (step.outputValues && Object.keys(step.outputValues).length > 0) {
    return {
      kind: 'outputs',
      outputs: step.outputValues,
      extraArtifactCount: 0,
    };
  }
  const logSummary = step.result || latestPublicLog(events, step.id);
  if (logSummary) {
    return { kind: 'log', logSummary, extraArtifactCount: 0 };
  }
  return { kind: 'empty', extraArtifactCount: 0 };
}
