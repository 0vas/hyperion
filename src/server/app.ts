import { claimSchema } from '../domain/continuation.js';
import { presentRun } from '../domain/context.js';
import type { Run } from '../domain/workflow.js';
import { VERSION, RELEASE_CHANNEL } from '../version.js';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { z } from 'zod';
import { WorkflowError, type Principal } from '../domain/workflow.js';
import type { Store } from './store.js';
import {
  DESKTOP_CLIENTS,
  inspectDesktopConnectionsWithPreflight,
  type DesktopClientId,
} from '../adapters/connection-status.js';
import { setupDesktopClient } from '../adapters/desktop-setup.js';
import { defaultDirectory } from '../adapters/install.js';

type Options = {
  store: Store;
  agentToken: string;
  humanToken: string;
  agentId: string;
  directory?: string;
  publicDir?: string;
  getAgentTokens?: () => Record<string, string>;
};
const createSchema = z
  .object({
    plan: z.unknown(),
    commandId: z.string().min(1).max(128),
    parentRunId: z.string().uuid().optional(),
  })
  .strict();
const setupConnectionSchema = z
  .object({
    client: z.enum(DESKTOP_CLIENTS),
    replace: z.boolean().optional(),
  })
  .strict();
const equal = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
async function body(req: IncomingMessage, limit = 128 * 1024) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new WorkflowError('CONTENT_TYPE', 'Use application/json', 415);
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > limit)
      throw new WorkflowError(
        'TOO_LARGE',
        'Request exceeds the allowed size',
        413,
      );
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new WorkflowError('INVALID_JSON', 'Invalid JSON', 400);
  }
}
export function createApp(options: Options) {
  let baseUrl = '';
  const streams = new Set<ServerResponse>();
  const continuationViews = new Map<string, string>();
  const waits = new Map<string, Set<(run: Run) => void>>();
  let presenceAt = Date.now();
  const touchPresence = () => {
    presenceAt = Math.max(Date.now(), presenceAt + 1);
  };
  const present = (run: Run): Run => ({
    ...presentRun(run),
    links: options.store.links(run.id),
    agentWaiting: !!waits.get(run.id)?.size,
    continuation: options.store.continuations.state(run.id),
    agentPresenceAt: presenceAt,
  });
  const send = (res: ServerResponse, event: string, value: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
    if (res.writableLength > 4 * 1024 * 1024) {
      streams.delete(res);
      res.destroy(); // A slow consumer reconnects to a fresh snapshot.
    }
  };
  const publish = (run: Run) => {
    continuationViews.set(
      run.id,
      JSON.stringify(options.store.continuations.state(run.id)) || '',
    );
    for (const res of streams) send(res, 'run', present(run));
  };
  const refreshContinuations = (owner?: string) => {
    for (const run of options.store.list()) {
      const state = options.store.continuations.state(run.id);
      if (
        (!owner || run.coordinator === owner) &&
        state &&
        continuationViews.get(run.id) !== JSON.stringify(state)
      ) {
        touchPresence();
        publish(run);
      }
    }
  };
  const notify = (run: Run) => {
    publish(run);
    if (run.origin) {
      touchPresence();
      publish(options.store.get(run.origin.runId));
    }
    for (const listener of [...(waits.get(run.id) || [])]) listener(run);
  };
  /** Reconcile orphan leases on read projections (ADR 0035); notify when abandoned. */
  const readRun = (id: string): Run => {
    const { run, changed } = options.store.reconcileOrphans(id, {
      agentWaiting: !!waits.get(id)?.size,
    });
    if (changed) {
      touchPresence();
      notify(run);
    }
    return run;
  };
  const server = createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader(
      'content-security-policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    try {
      const actual = new URL(baseUrl);
      // Exact authority protects the loopback service against DNS rebinding.
      if (req.headers.host !== actual.host)
        throw new WorkflowError('HOST_DENIED', 'Untrusted Host', 403);
      if (req.headers.origin && req.headers.origin !== baseUrl)
        throw new WorkflowError(
          'ORIGIN_DENIED',
          'Cross-origin requests are not accepted',
          403,
        );
      if (req.headers['sec-fetch-site'] === 'cross-site')
        throw new WorkflowError(
          'ORIGIN_DENIED',
          'Cross-site requests are not accepted',
          403,
        );
      const url = new URL(req.url || '/', baseUrl);
      if (url.pathname === '/api/health' && req.method === 'GET') {
        json(res, 200, { ok: true, version: VERSION });
        return;
      }
      if (url.pathname === '/api/session' && req.method === 'GET') {
        res.setHeader(
          'set-cookie',
          `hyperion_session=${options.humanToken}; HttpOnly; SameSite=Strict; Path=/`,
        );
        json(res, 200, { role: 'human' });
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        const bearer = req.headers.authorization?.replace(/^Bearer /, '') || '';
        const cookie =
          req.headers.cookie
            ?.split(';')
            .map((c) => c.trim())
            .find((c) => c.startsWith('hyperion_session='))
            ?.slice('hyperion_session='.length) || '';
        const agents = options.getAgentTokens?.() || {
          [options.agentId]: options.agentToken,
        };
        const agent = Object.entries(agents).find(([, token]) =>
          equal(bearer, token),
        );
        let actor: Principal;
        if (agent) actor = { role: 'agent', id: agent[0] };
        else if (
          equal(bearer, options.humanToken) ||
          equal(cookie, options.humanToken)
        )
          actor = { role: 'human', id: 'local-user' };
        else
          throw new WorkflowError(
            'UNAUTHORIZED',
            'Authentication required',
            401,
          );
        if (url.pathname === '/api/events' && req.method === 'GET') {
          res.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8',
            connection: 'keep-alive',
            'x-accel-buffering': 'no',
          });
          streams.add(res);
          send(
            res,
            'snapshot',
            options.store.list().map((run) => present(readRun(run.id))),
          );
          const heartbeat = setInterval(() => {
            refreshContinuations();
            if (!res.write(': heartbeat\n\n')) res.destroy();
          }, 15000);
          heartbeat.unref();
          res.on('close', () => {
            clearInterval(heartbeat);
            streams.delete(res);
          });
          return;
        }
        if (url.pathname === '/api/connections' && req.method === 'GET') {
          if (actor.role !== 'human')
            throw new WorkflowError(
              'FORBIDDEN',
              'Only the human can inspect connections',
              403,
            );
          const directory =
            options.directory ||
            process.env.HYPERION_DATA_DIR ||
            defaultDirectory();
          json(
            res,
            200,
            await inspectDesktopConnectionsWithPreflight({
              directory,
              url: baseUrl || process.env.HYPERION_URL,
              version: VERSION,
              channel: RELEASE_CHANNEL,
            }),
          );
          return;
        }
        if (
          url.pathname === '/api/connections/setup' &&
          req.method === 'POST'
        ) {
          if (actor.role !== 'human')
            throw new WorkflowError(
              'FORBIDDEN',
              'Only the human can configure connections',
              403,
            );
          const data = setupConnectionSchema.parse(await body(req));
          const directory =
            options.directory ||
            process.env.HYPERION_DATA_DIR ||
            defaultDirectory();
          try {
            const result = await setupDesktopClient(
              data.client as DesktopClientId,
              {
                directory,
                url: baseUrl || process.env.HYPERION_URL,
                ...(data.replace ? { replace: true } : {}),
              },
            );
            json(res, 200, {
              ok: true,
              client: result.client,
              configFile: result.configFile,
              inventory: await inspectDesktopConnectionsWithPreflight({
                directory,
                url: baseUrl || process.env.HYPERION_URL,
                version: VERSION,
                channel: RELEASE_CHANNEL,
              }),
            });
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Setup failed';
            const conflict = /No se sobrescribió/.test(message);
            throw new WorkflowError(
              conflict ? 'CONNECTION_CONFLICT' : 'CONNECTION_SETUP',
              message,
              conflict ? 409 : 400,
            );
          }
          return;
        }
        if (url.pathname === '/api/runs' && req.method === 'GET') {
          json(
            res,
            200,
            options.store.list().map((run) => present(readRun(run.id))),
          );
          return;
        }
        if (url.pathname === '/api/runs' && req.method === 'POST') {
          const data = createSchema.parse(await body(req));
          const run = options.store.create(
            data.plan,
            actor,
            data.commandId,
            data.parentRunId,
          );
          touchPresence();
          publish(run);
          if (run.origin) publish(options.store.get(run.origin.runId));
          json(res, 201, present(run));
          return;
        }
        const artifactRoute =
          /^\/api\/runs\/([a-f0-9-]+)\/artifacts(?:\/([a-f0-9-]+))?$/.exec(
            url.pathname,
          );
        if (artifactRoute && !artifactRoute[2] && req.method === 'POST') {
          if (actor.role !== 'agent')
            throw new WorkflowError(
              'FORBIDDEN',
              'Only the coordinator can register artifacts',
              403,
            );
          const run = options.store.addArtifact(
            artifactRoute[1]!,
            await body(req, 14 * 1024 * 1024),
            actor,
          );
          notify(options.store.get(run.id));
          json(res, 200, present(run));
          return;
        }
        if (artifactRoute?.[2] && req.method === 'GET') {
          const { artifact, content } = options.store.artifactContent(
            artifactRoute[1]!,
            artifactRoute[2],
          );
          const image = [
            'image/png',
            'image/jpeg',
            'image/gif',
            'image/webp',
          ].includes(artifact.mediaType);
          // HTML/SVG and other active formats are downloads, never same-origin documents.
          res.setHeader(
            'content-security-policy',
            "sandbox; default-src 'none'; frame-ancestors 'none'",
          );
          res.setHeader(
            'content-type',
            image ? artifact.mediaType : 'application/octet-stream',
          );
          const disposition =
            image && url.searchParams.get('preview') === '1'
              ? 'inline'
              : 'attachment';
          res.setHeader(
            'content-disposition',
            `${disposition}; filename="artifact"; filename*=UTF-8''${encodeURIComponent(artifact.name).replace(/'/g, '%27')}`,
          );
          res.setHeader('content-length', content.length);
          res.end(content);
          return;
        }
        const suspension = /^\/api\/runs\/([a-f0-9-]+)\/suspend$/.exec(
          url.pathname,
        );
        if (suspension && req.method === 'POST') {
          options.store.continuations.suspend(
            suspension[1]!,
            await body(req),
            actor,
          );
          touchPresence();
          const run = options.store.get(suspension[1]!);
          notify(run);
          json(res, 200, present(run));
          return;
        }
        if (
          url.pathname === '/api/continuations/pending' &&
          req.method === 'POST'
        ) {
          const { connectorId } = claimSchema.parse(await body(req));
          json(
            res,
            200,
            options.store.continuations.pending(connectorId, actor),
          );
          return;
        }
        if (
          url.pathname === '/api/continuations/claim' &&
          req.method === 'POST'
        ) {
          const { connectorId } = claimSchema.parse(await body(req));
          const delivery = options.store.continuations.claim(
            connectorId,
            actor,
          );
          refreshContinuations(actor.id);
          json(res, 200, delivery);
          return;
        }
        const settlement = /^\/api\/continuations\/([a-f0-9-]+)\/settle$/.exec(
          url.pathname,
        );
        if (settlement && req.method === 'POST') {
          const result = options.store.continuations.settle(
            settlement[1]!,
            await body(req),
            actor,
          );
          touchPresence();
          publish(options.store.get(result.runId));
          json(res, 200, result.state);
          return;
        }
        const waiting = /^\/api\/runs\/([a-f0-9-]+)\/wait$/.exec(url.pathname);
        if (waiting && req.method === 'GET') {
          const run = readRun(waiting[1]!);
          if (actor.role !== 'agent' || actor.id !== run.coordinator)
            throw new WorkflowError(
              'FORBIDDEN',
              'Only the coordinator can wait for execution',
              403,
            );
          const query = z
            .object({
              afterRevision: z.coerce.number().int().nonnegative(),
              timeoutSeconds: z.coerce.number().min(0).max(55).default(30),
            })
            .strict()
            .parse(Object.fromEntries(url.searchParams));
          const changed = (value: Run) =>
            value.revision > query.afterRevision ||
            options.store.continuations.state(value.id)?.status === 'waiting' ||
            ['completed', 'cancelled', 'rejected'].includes(value.status);
          if (changed(run) || query.timeoutSeconds === 0) {
            json(res, 200, present(run));
            return;
          }
          const listeners = waits.get(run.id) || new Set<(run: Run) => void>();
          if (listeners.size >= 8)
            throw new WorkflowError(
              'TOO_MANY_WAITS',
              'Too many waits for this run',
              429,
            );
          let finished = false;
          const cleanup = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            listeners.delete(onChange);
            touchPresence();
            if (!listeners.size) waits.delete(run.id);
            publish(options.store.get(run.id));
          };
          const finish = (value: Run) => {
            if (finished) return;
            cleanup();
            json(res, 200, present(value));
          };
          const onChange = (value: Run) => {
            if (changed(value)) finish(value);
          };
          const timer = setTimeout(
            () => finish(options.store.get(run.id)),
            query.timeoutSeconds * 1000,
          );
          timer.unref();
          listeners.add(onChange);
          waits.set(run.id, listeners);
          touchPresence();
          res.once('close', cleanup);
          publish(run);
          return;
        }
        const match = /^\/api\/runs\/([a-f0-9-]+)(\/commands)?$/.exec(
          url.pathname,
        );
        if (match) {
          const id = match[1]!;
          if (!match[2] && req.method === 'GET') {
            json(res, 200, present(readRun(id)));
            return;
          }
          if (match[2] && req.method === 'POST') {
            const data = await body(req);
            if (
              actor.role === 'human' &&
              (!data ||
                typeof data !== 'object' ||
                !('expectedRevision' in data))
            )
              throw new WorkflowError(
                'REVISION_REQUIRED',
                'Human decisions require expectedRevision',
                400,
              );
            const run = options.store.command(id, data, actor);
            notify(options.store.get(id));
            json(res, 200, present(run));
            return;
          }
        }
        throw new WorkflowError('NOT_FOUND', 'API route not found', 404);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        throw new WorkflowError(
          'METHOD_NOT_ALLOWED',
          'Method not allowed',
          405,
        );
      const root = resolve(options.publicDir || 'dist/client');
      const filename =
        url.pathname === '/'
          ? 'index.html'
          : decodeURIComponent(url.pathname).slice(1);
      const file = resolve(root, filename);
      if (!file.startsWith(root + sep))
        throw new WorkflowError('NOT_FOUND', 'Not found', 404);
      const content = await readFile(file).catch(() => {
        throw new WorkflowError(
          'NOT_FOUND',
          'Build the UI with npm run build',
          404,
        );
      });
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
      };
      if (filename === 'index.html')
        res.setHeader(
          'set-cookie',
          `hyperion_session=${options.humanToken}; HttpOnly; SameSite=Strict; Path=/`,
        );
      res.writeHead(200, {
        'content-type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`,
      });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof z.ZodError) {
        json(res, 400, {
          error: 'VALIDATION',
          message: error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; '),
        });
        return;
      }
      if (error instanceof WorkflowError) {
        json(res, error.status, { error: error.code, message: error.message });
        return;
      }
      console.error('Hyperion request failed:', error);
      json(res, 500, { error: 'INTERNAL', message: 'Unexpected server error' });
    }
  });
  server.requestTimeout = 15000;
  return {
    listen(port: number): Promise<string> {
      return new Promise((done, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          const address = server.address();
          if (!address || typeof address === 'string') {
            reject(new Error('Invalid server address'));
            return;
          }
          baseUrl = `http://127.0.0.1:${address.port}`;
          done(baseUrl);
        });
      });
    },
    close(): Promise<void> {
      return new Promise((done, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : done()));
      });
    },
  };
}
