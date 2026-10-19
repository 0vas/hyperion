#!/usr/bin/env node
import { ensureServer } from './bootstrap.js';
const startup = await ensureServer();
process.env.HYPERION_URL = startup.url;
await import('./mcp.js');
