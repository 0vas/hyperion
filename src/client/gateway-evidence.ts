import type { Step } from '../domain/workflow.js';

export type GatewayEvidenceRoute = {
  id: string;
  /** Omitted when the snapshot target is unavailable in this projection. */
  title?: string;
};

export type GatewaySafeValue = boolean | number | null;

export type GatewayObservedValue = {
  stepTitle: string;
  /** Present only for a primitive that is safe to show in the summary. */
  value?: GatewaySafeValue;
};

export type GatewayEvidence = {
  type: NonNullable<Step['gateway']>['type'];
  direction: NonNullable<Step['gateway']>['direction'];
  /** A split only has a recorded choice after the engine persisted it. */
  decisionKnown: boolean;
  activeRoutes: GatewayEvidenceRoute[];
  inactiveRoutes: GatewayEvidenceRoute[];
  /** Values present in the snapshot for declared split conditions. */
  observedValues: GatewayObservedValue[];
};

function routeTitle(steps: Step[], id: string): GatewayEvidenceRoute {
  return { id, title: steps.find((step) => step.id === id)?.title };
}

/** Keep internal route ids out of human-facing evidence when a target vanished. */
export function gatewayRouteDisplayTitle(
  route: GatewayEvidenceRoute,
  unavailableTitle: string,
): string {
  return route.title || unavailableTitle;
}

/** Do not turn arbitrary agent output into a public gateway-summary value. */
function safeSummaryValue(value: unknown): GatewaySafeValue | undefined {
  if (typeof value === 'boolean' || value === null) return value;
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * Projects gateway evidence already stored on the run into human-facing route
 * titles. This deliberately never evaluates conditions or infers a decision.
 */
export function gatewayEvidenceForStep(
  step: Step,
  steps: Step[],
): GatewayEvidence | undefined {
  const gateway = step.gateway;
  if (step.kind !== 'gateway' || !gateway) return undefined;

  if (gateway.direction === 'join') {
    const incoming = step.dependencies.map((id) => {
      const source = steps.find((candidate) => candidate.id === id);
      return source
        ? { id: source.id, title: source.title, status: source.status }
        : { id, title: undefined, status: undefined };
    });
    return {
      type: gateway.type,
      direction: gateway.direction,
      decisionKnown:
        incoming.length > 0 &&
        incoming.every((route) =>
          ['completed', 'skipped'].includes(route.status || ''),
        ),
      activeRoutes: incoming
        .filter((route) => route.status === 'completed')
        .map(({ id, title }) => ({ id, title })),
      inactiveRoutes: incoming
        .filter((route) => route.status === 'skipped')
        .map(({ id, title }) => ({ id, title })),
      observedValues: [],
    };
  }

  const decisionKnown = Array.isArray(step.selectedBranches);
  const selected = new Set(step.selectedBranches || []);
  const routes = gateway.routes || [];
  const observedValues: GatewayObservedValue[] = [];
  for (const route of routes) {
    const condition = route.when;
    if (!condition) continue;
    const source = steps.find((candidate) => candidate.id === condition.stepId);
    if (
      source?.outputValues &&
      Object.hasOwn(source.outputValues, condition.output)
    ) {
      const value = safeSummaryValue(source.outputValues[condition.output]);
      observedValues.push({
        stepTitle: source.title,
        ...(value === undefined ? {} : { value }),
      });
    }
  }
  return {
    type: gateway.type,
    direction: gateway.direction,
    decisionKnown,
    activeRoutes: decisionKnown
      ? routes
          .filter((route) => selected.has(route.target))
          .map((route) => routeTitle(steps, route.target))
      : [],
    inactiveRoutes: decisionKnown
      ? routes
          .filter((route) => !selected.has(route.target))
          .map((route) => routeTitle(steps, route.target))
      : [],
    observedValues,
  };
}
