// Diagnostic tooling only: modifies a disposable, exact-revision CI checkout.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SOURCE_REVISION = 'a89e33350b17fca5e39a8b8062e216b6aea32fe2';
export const SOURCE_HASH =
  '9f0f67bebd86426310d1ad39d64a832cfd96c83ebf6db7e44d65e6304ee8bf83';
const SOURCE_FILE = 'src/adapters/runtime-upgrade.ts';
const STAGES =
  'powershell-ready|listener-query-finished|process-query-finished|owner-query-finished|json-finished';

function replaceOnce(source, needle, replacement) {
  assert.equal(
    source.split(needle).length,
    2,
    'Diagnostic source shape changed',
  );
  return source.replace(needle, replacement);
}

export function candidateSource(source) {
  assert.equal(
    createHash('sha256').update(source).digest('hex'),
    SOURCE_HASH,
    'Diagnostic source identity changed',
  );
  const original = /const script = `([^`]+)`;/.exec(source);
  assert.ok(original, 'Diagnostic source shape changed');
  const marker = (stage) =>
    `[Console]::Error.WriteLine(('HYPERION_OWNER_STAGE ${stage} '+[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())); `;
  let script = original[1];
  for (const [needle, stage] of [
    ['$ids=@(Get-NetTCPConnection', 'powershell-ready'],
    ['if($ids.Count -ne 1)', 'listener-query-finished'],
    ['$sid=(Invoke-CimMethod', 'process-query-finished'],
    ['@{pid=[int]$p.ProcessId', 'owner-query-finished'],
  ])
    script = replaceOnce(script, needle, marker(stage) + needle);
  script += '; ' + marker('json-finished');
  let candidate = replaceOnce(
    source,
    original[0],
    'const script = `' + script + '`;',
  );
  const start = candidate.indexOf('    const { stdout } = await exec(');
  const end =
    candidate.indexOf('    return JSON.parse(stdout) as Owner;', start) +
    '    return JSON.parse(stdout) as Owner;'.length;
  assert.ok(start >= 0 && end > start, 'Diagnostic source shape changed');
  const originalBlock = candidate.slice(start, end);
  assert.ok(originalBlock.includes("'powershell.exe'"));
  assert.ok(originalBlock.includes('{ timeout: 10000, windowsHide: true }'));
  const instrumentedBlock = `    const probeStarted = performance.now();
    let probeStderr = '';
    let probeStatus = 'failure';
    const reportProbe = (line: string) => {
      try { console.error(line); } catch { /* Diagnostics cannot replace an error. */ }
    };
    reportProbe('HYPERION_OWNER_PARENT begin ' + Date.now());
    try {
${originalBlock
  .replace('const { stdout }', 'const { stdout, stderr }')
  .replace(
    '    return JSON.parse(stdout) as Owner;',
    "    probeStderr = typeof stderr === 'string' ? stderr : '';\n    probeStatus = 'success';\n    return JSON.parse(stdout) as Owner;",
  )
  .split('\n')
  .map((line) => '  ' + line)
  .join('\n')}
    } catch (error) {
      probeStatus = 'failure';
      try {
        if (typeof error === 'object' && error !== null &&
            'stderr' in error && typeof error.stderr === 'string')
          probeStderr = error.stderr;
      } catch { /* Keep the original error, even for unusual error objects. */ }
      throw error;
    } finally {
      for (const line of probeStderr.split(/\\r?\\n/)) {
        if (/^HYPERION_OWNER_STAGE (${STAGES}) \\d{13}$/.test(line))
          reportProbe(line);
      }
      reportProbe('HYPERION_OWNER_PARENT end ' + Date.now() +
        ' elapsed_ms=' + Math.round(performance.now() - probeStarted) +
        ' status=' + probeStatus);
    }`;
  candidate =
    candidate.slice(0, start) + instrumentedBlock + candidate.slice(end);
  // Neither stdout parsing nor timeout/options/identity/termination code changes.
  assert.equal(
    candidate.split('return JSON.parse(stdout) as Owner;').length,
    2,
  );
  assert.equal(
    candidate.split('{ timeout: 10000, windowsHide: true }').length,
    2,
  );
  return candidate;
}

const stageLine = new RegExp(`^HYPERION_OWNER_STAGE (${STAGES}) \\d{13}$`);
const parentLine =
  /^HYPERION_OWNER_PARENT (begin \d{13}|end \d{13} elapsed_ms=\d{1,9} status=(success|failure))$/;

export function sanitizedLine(line) {
  const text = line.replace(/^# /, '').replace(/\r$/, '');
  if (stageLine.test(text) || parentLine.test(text)) return text;
  const count =
    /^(?:ℹ |# )?(tests|pass|fail|cancelled|skipped|todo) (\d+)$/.exec(text);
  if (count) return `HYPERION_DIAGNOSTIC_COUNT ${count[1]} ${count[2]}`;
  return undefined;
}

export function outputFilter(emit) {
  let pending = '';
  let discarding = false;
  return {
    write(chunk) {
      for (const part of chunk.split(/(\n)/)) {
        if (part === '\n') {
          if (!discarding) {
            const safe = sanitizedLine(pending);
            if (safe) emit(safe);
          }
          pending = '';
          discarding = false;
        } else if (!discarding) {
          pending += part;
          if (pending.length > 8192) {
            pending = '';
            discarding = true;
          }
        }
      }
    },
    end() {
      if (!discarding) {
        const safe = sanitizedLine(pending);
        if (safe) emit(safe);
      }
      pending = '';
    },
  };
}

export async function runNpmPhase(phase, args, options = {}) {
  const emit = options.emit || ((line) => console.log(line));
  const npmCli =
    options.npmCli ||
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const started = performance.now();
  emit(`HYPERION_DIAGNOSTIC_PHASE ${phase} begin ${Date.now()}`);
  const child = spawn(process.execPath, [npmCli, ...args], {
    cwd: options.cwd || process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  const outputs = [child.stdout, child.stderr].map((stream) => {
    const filter = outputFilter(emit);
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => filter.write(chunk));
    return filter;
  });
  let spawnFailed = false;
  child.on('error', () => {
    spawnFailed = true;
  });
  const result = await new Promise((done) =>
    child.on('close', (code, signal) => done({ code, signal })),
  );
  outputs.forEach((filter) => filter.end());
  const status = spawnFailed
    ? 'spawn-failed'
    : result.code === 0
      ? 'success'
      : 'failure';
  const exit = Number.isInteger(result.code) ? result.code : 1;
  emit(
    `HYPERION_DIAGNOSTIC_PHASE ${phase} end ${Date.now()} elapsed_ms=${Math.round(performance.now() - started)} status=${status} exit=${exit} exit_available=${Number.isInteger(result.code)}`,
  );
  return exit;
}

async function runCi() {
  assert.deepEqual(process.argv.slice(2), ['--run-ci']);
  assert.equal(process.platform, 'win32');
  assert.equal(process.version, 'v24.21.0');
  assert.equal(process.env.CI, 'true');
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_REPOSITORY, '0vas/hyperion');
  assert.equal(
    process.env.GITHUB_REF,
    'refs/heads/diagnostics/windows-owner-a89e333',
  );
  assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1');
  const git = (args) =>
    execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  assert.equal(git(['rev-parse', 'HEAD']), SOURCE_REVISION);
  assert.equal(git(['status', '--porcelain', '--untracked-files=no']), '');
  const source = readFileSync(SOURCE_FILE, 'utf8');
  const candidate = candidateSource(source);
  writeFileSync(SOURCE_FILE, candidate);
  console.log(`HYPERION_DIAGNOSTIC_SOURCE ${SOURCE_REVISION}`);
  console.log('HYPERION_DIAGNOSTIC instrumentation-only; not a product gate');
  try {
    for (const [phase, args] of [
      ['npm-ci', ['ci']],
      ['typecheck', ['run', 'typecheck']],
      ['full-unit', ['test']],
    ]) {
      const exit = await runNpmPhase(phase, args);
      if (exit !== 0) {
        process.exitCode = exit;
        return;
      }
    }
  } finally {
    // Preserve the test exit status and leave no instrumented source behind.
    try {
      writeFileSync(SOURCE_FILE, source);
    } catch {
      console.log('HYPERION_DIAGNOSTIC cleanup-failed');
      if (!process.exitCode) process.exitCode = 1;
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  runCi().catch(() => {
    // Never emit assertion values, paths, commands, or original process errors.
    console.log('HYPERION_DIAGNOSTIC setup-or-runner-failed');
    if (!process.exitCode) process.exitCode = 1;
  });
}
