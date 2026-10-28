/**
 * Desktop setWindowOpenHandler policy (Track I).
 * Never navigate the primary BrowserWindow to blob:/data:/artifact HTML.
 */

export function classifyWindowOpenUrl(url, serviceOrigin) {
  if (!url || typeof url !== 'string') return { action: 'deny' };
  if (/^(blob:|data:)/i.test(url)) return { action: 'deny', reason: 'blob' };
  try {
    const parsed = new URL(url);
    if (/^https?:$/i.test(parsed.protocol)) {
      if (serviceOrigin && parsed.origin === serviceOrigin) {
        // Same-origin Hyperion SPA navigations OK; artifact document traps are not.
        if (
          /\/artifacts\//i.test(parsed.pathname) ||
          parsed.searchParams.get('preview') === '1'
        )
          return { action: 'deny', reason: 'artifact' };
        return { action: 'load-primary', reason: 'spa' };
      }
      return { action: 'open-external', reason: 'remote' };
    }
  } catch {
    return { action: 'deny', reason: 'invalid' };
  }
  return { action: 'deny', reason: 'unknown' };
}
