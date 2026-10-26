/**
 * Host-configured ResumeConnector payload for outbound send (connectorSchema).
 * Never invent id/sessionId/capabilities in the UI — only read what the host
 * (Desktop bridge or test fixture) already configured outside model plans.
 */
export function readHostResumeConnector(): unknown {
  if (typeof window === 'undefined') return undefined;
  return window.hyperionDesktop?.resumeConnector;
}
