#!/usr/bin/env node
import { isAbsolute } from 'node:path';
import { registerAgent } from '../server/config.js';
import { HyperionClient } from './client.js';

// Desktop already owns a running service. Never bootstrap/fallback into another
// instance when a chat-side MCP process cannot authenticate to that service.
const directory = process.env.HYPERION_DATA_DIR;
const url = process.env.HYPERION_URL;
const agentId = process.env.HYPERION_AGENT_ID;
if (!directory || !isAbsolute(directory) || !url || !agentId)
  throw new Error(
    'Desktop chat requires explicit workspace, service and harness.',
  );
registerAgent(agentId, directory);
// A token inherited from an unrelated external integration must not override the
// workspace credential selected above. Credentials never enter the renderer.
delete process.env.HYPERION_TOKEN;
await new HyperionClient({ directory, url, agentId }).authCheck();
// Use the full agent MCP surface, not a second chat-only permission model.
// Engine roles still exclude human commands and enforce coordinator ownership.
await import('./mcp.js');
