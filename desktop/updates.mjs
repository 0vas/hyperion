import { parseCalVer } from './release-version.cjs';
import { createHash, randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';

const releasesURL =
  'https://api.github.com/repos/0vas/hyperion/releases?per_page=30';
const channels = new Set(['preview', 'beta', 'stable']);
const eligibleChannels = {
  preview: new Set(['preview', 'beta', 'stable']),
  beta: new Set(['beta', 'stable']),
  stable: new Set(['stable']),
};
function version(value) {
  const calendar = parseCalVer(value);
  if (calendar) return calendar;
  const match =
    /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-zA-Z.-]+))?$/.exec(
      value,
    );
  return match
    ? { numbers: match.slice(1, 4).map(Number), pre: match[4] }
    : null;
}
function compare(a, b) {
  if (a.calver || b.calver)
    return a.calver && b.calver ? a.timestamp - b.timestamp : a.calver ? 1 : -1;
  for (let i = 0; i < 3; i++)
    if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] - b.numbers[i];
  if (!a.pre || !b.pre) return a.pre ? -1 : b.pre ? 1 : 0;
  const x = a.pre.split('.'),
    y = b.pre.split('.');
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    const xn = /^\d+$/.test(x[i]),
      yn = /^\d+$/.test(y[i]);
    if (xn && yn) return Number(x[i]) - Number(y[i]);
    if (xn !== yn) return xn ? -1 : 1;
    return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}
function explicitChannel(release, value) {
  const match = new RegExp(
    `^Hyperion\\s+${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(Preview|Beta|Stable)$`,
    'i',
  ).exec(String(release.name || '').trim());
  return match?.[1].toLowerCase() || null;
}
function releaseChannel(release, next) {
  if (typeof release.prerelease !== 'boolean') return null;
  const label = explicitChannel(release, release.tag_name.replace(/^v/, ''));
  if (label) {
    // Preview and Beta releases must be marked prerelease. A stable release
    // must not be: the two independent signals prevent accidental promotion.
    if ((label === 'stable') === Boolean(release.prerelease)) return null;
    return label;
  }
  // Public CalVer tags do not encode a channel. Require the reviewed release
  // name so a GitHub prerelease alone cannot be mistaken for Beta or Preview.
  if (next.calver) return null;
  // Keep legacy SemVer updates working; their prerelease suffix is explicit.
  if (Boolean(next.pre) !== Boolean(release.prerelease)) return null;
  return next.pre ? 'preview' : 'stable';
}
function installedChannel(channel, installed) {
  const normalized = String(channel || '').toLowerCase();
  if (channels.has(normalized)) return normalized;
  return installed.pre ? 'preview' : 'stable';
}
function validAsset(asset, tag) {
  return (
    asset &&
    Number.isSafeInteger(asset.size) &&
    asset.size > 0 &&
    asset.size <= 600 * 1024 * 1024 &&
    /^sha256:[a-f0-9]{64}$/.test(asset.digest || '') &&
    asset.browser_download_url ===
      `https://github.com/0vas/hyperion/releases/download/${tag}/${asset.name}` &&
    /^Hyperion-[\da-zA-Z.-]+-(?:mac-(?:arm64|x64)\.dmg|win-x64\.exe)$/.test(
      asset.name,
    )
  );
}
export function selectRelease(releases, current, platform, arch, channel) {
  const installed = version(current);
  if (!installed) throw new Error('Versión instalada inválida.');
  if (!Array.isArray(releases))
    throw new Error('Respuesta de GitHub inválida.');
  const suffix =
    platform === 'darwin' && ['arm64', 'x64'].includes(arch)
      ? `mac-${arch}.dmg`
      : platform === 'win32' && arch === 'x64'
        ? 'win-x64.exe'
        : null;
  if (!suffix) return null;
  const installedOn = installedChannel(channel, installed);
  return (
    releases
      .flatMap((release) => {
        const next = version(release.tag_name || '');
        const nextChannel = next && releaseChannel(release, next);
        if (
          release.draft ||
          !next ||
          compare(next, installed) <= 0 ||
          !nextChannel ||
          !eligibleChannels[installedOn].has(nextChannel)
        )
          return [];
        const name = `Hyperion-${release.tag_name.replace(/^v/, '')}-${suffix}`;
        const asset = release.assets?.find(
          (a) => a.name === name && validAsset(a, release.tag_name),
        );
        return asset
          ? [
              {
                version: release.tag_name.replace(/^v/, ''),
                tag: release.tag_name,
                asset,
                channel: nextChannel,
              },
            ]
          : [];
      })
      .sort((a, b) => compare(version(b.version), version(a.version)))[0] ||
    null
  );
}
export async function checkForUpdate(
  current,
  platform,
  arch,
  fetcher = fetch,
  channel,
) {
  const response = await fetcher(releasesURL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'Hyperion-Desktop',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `GitHub respondió ${response.status}. Inténtalo más tarde.`,
    );
  return selectRelease(await response.json(), current, platform, arch, channel);
}
export async function downloadUpdate(
  update,
  destination,
  { fetcher = fetch, signal, onProgress = () => {} } = {},
) {
  if (!validAsset(update?.asset, update?.tag))
    throw new Error('Instalador no válido.');
  const combined = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(15 * 60 * 1000)])
    : AbortSignal.timeout(15 * 60 * 1000);
  combined.throwIfAborted();
  const temporary = `${destination}.${randomUUID()}.partial`;
  let file;
  try {
    const response = await fetcher(update.asset.browser_download_url, {
      signal: combined,
    });
    if (!response.ok || !response.body)
      throw new Error(
        `No se pudo descargar el instalador (${response.status}).`,
      );
    file = await open(temporary, 'wx', 0o600);
    const hash = createHash('sha256');
    let size = 0;
    for await (const chunk of response.body) {
      combined.throwIfAborted();
      size += chunk.length;
      if (size > update.asset.size)
        throw new Error('El tamaño del instalador no coincide.');
      hash.update(chunk);
      await file.writeFile(chunk);
      onProgress(size / update.asset.size);
    }
    combined.throwIfAborted();
    if (
      size !== update.asset.size ||
      `sha256:${hash.digest('hex')}` !== update.asset.digest
    )
      throw new Error('La integridad del instalador no coincide con GitHub.');
    await file.sync();
    await file.close();
    file = undefined;
    await rename(temporary, destination);
    return destination;
  } finally {
    await file?.close();
    await rm(temporary, { force: true });
  }
}
