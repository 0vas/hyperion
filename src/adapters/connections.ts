import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAgent } from '../server/config.js';

/** Paths owned by this installation, never taken from a client configuration. */
export function ownedMcpRuntimePaths() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  return {
    executable: process.execPath,
    launcher: resolve(root, 'dist/adapters/mcp-launcher.js'),
    adapter: resolve(root, 'dist/adapters/mcp.js'),
  };
}

/** Pure expected entry; only explicit setup may register credentials or export it. */
export function buildMcpServer(
  agentId: string,
  directory: string,
  autoStart: boolean,
  url: string,
) {
  const paths = ownedMcpRuntimePaths();
  return {
    type: 'stdio',
    command: paths.executable,
    args: [autoStart ? paths.launcher : paths.adapter],
    env: {
      ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
      HYPERION_AGENT_ID: agentId,
      HYPERION_DATA_DIR: resolve(directory),
      HYPERION_URL: url,
    },
  };
}

export function generateConnection(
  agentId: string,
  directory?: string,
  autoStart = false,
  url = process.env.HYPERION_URL || 'http://127.0.0.1:4317',
) {
  const credentials = registerAgent(agentId, directory);
  const config = {
    mcpServers: {
      hyperion: buildMcpServer(agentId, credentials.directory, autoStart, url),
    },
  };
  const outputDirectory = resolve(credentials.directory, 'connections');
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const configFile = resolve(outputDirectory, `${agentId}.mcp.json`);
  writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', {
    mode: 0o600,
  });
  return {
    agentId,
    configFile,
    config,
    note: 'Merge this server into your client configuration. No client configuration was overwritten; no credentials are included in this file.',
  };
}
