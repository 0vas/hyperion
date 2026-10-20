import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setupDesktopClient } from '../src/adapters/desktop-setup.js';

test('desktop connects Codex, Cursor, Claude Desktop and Antigravity without vendor CLIs and preserves existing configuration', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-desktop-setup-'));
  try {
    for (const [id, relative, original] of [
      [
        'codex',
        '.codex/config.toml',
        '# Keep my preferences\nmodel = "my-model"\n[mcp_servers.other]\ncommand = "keep-me"\n',
      ],
      [
        'antigravity',
        '.gemini/config/mcp_config.json',
        '{"preferences":{"keep":true},"mcpServers":{"other":{"command":"keep-me"}}}\n',
      ],
      [
        'cursor',
        '.cursor/mcp.json',
        '{"preferences":{"keep":true},"mcpServers":{"other":{"command":"keep-me"}}}\n',
      ],
      [
        'claude-desktop',
        'Library/Application Support/Claude/claude_desktop_config.json',
        '{"preferences":{"keep":true},"mcpServers":{"other":{"command":"keep-me"}}}\n',
      ],
    ] as const) {
      const file = join(home, relative);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, original);
      const options = {
        home,
        directory: join(home, 'data'),
        platform: 'darwin' as const,
        url: 'http://127.0.0.1:4341',
      };
      const result = await setupDesktopClient(id, options);
      assert.equal(result.configFile, file);
      const text = readFileSync(file, 'utf8');
      assert.match(text, /keep-me/);
      assert.match(text, /mcp-launcher\.js/);
      assert.match(text, /4341/);
      assert.equal(readFileSync(result.backupFile!, 'utf8'), original);
      if (id === 'codex') assert.ok(text.startsWith(original));
      else assert.equal(JSON.parse(text).preferences.keep, true);
      await setupDesktopClient(id, options);
      assert.equal(readFileSync(file, 'utf8'), text);
      assert.doesNotMatch(text, /agentToken|humanToken/);
      if (id === 'claude-desktop') {
        const skill = join(home, '.claude/skills/hyperion/SKILL.md');
        assert.match(readFileSync(skill, 'utf8'), /Usa Hyperion/);
        assert.match(
          readFileSync(skill, 'utf8'),
          /call Hyperion first|hyperion_create_run/,
        );
      }
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('desktop setup refuses conflicts and malformed configuration without changing user files', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-setup-conflict-'));
  try {
    for (const [id, relative, contents] of [
      [
        'codex',
        '.codex/config.toml',
        '[mcp_servers.hyperion]\ncommand="different"\n',
      ],
      ['codex', '.codex/config.toml', 'invalid TOML = ['],
      [
        'cursor',
        '.cursor/mcp.json',
        '{"mcpServers":{"hyperion":{"command":"different"}}}',
      ],
      ['cursor', '.cursor/mcp.json', '{"mcpServers":[]}'],
      ['antigravity', '.gemini/config/mcp_config.json', '{"mcpServers":[]}'],
      [
        'antigravity',
        '.gemini/config/mcp_config.json',
        '{"mcpServers":{"hyperion":{"command":"different"}}}',
      ],
      [
        'claude-desktop',
        'Library/Application Support/Claude/claude_desktop_config.json',
        'invalid JSON',
      ],
    ] as const) {
      const file = join(home, relative);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, contents);
      await assert.rejects(
        setupDesktopClient(id, {
          home,
          directory: join(home, 'data'),
          platform: 'darwin',
        }),
      );
      assert.equal(readFileSync(file, 'utf8'), contents);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Claude Desktop uses Windows roaming data and installs/refreshes the portable skill; Claude Code keeps skill-only setup', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-setup-platform-'));
  try {
    const result = await setupDesktopClient('claude-desktop', {
      home,
      directory: join(home, 'data'),
      platform: 'win32',
      appData: join(home, 'Roaming'),
      url: 'http://127.0.0.1:4341',
    });
    assert.equal(
      result.configFile,
      join(home, 'Roaming/Claude/claude_desktop_config.json'),
    );
    const desktopSkill = join(home, '.claude/skills/hyperion/SKILL.md');
    assert.match(readFileSync(desktopSkill, 'utf8'), /name: hyperion/);
    assert.equal(
      JSON.parse(
        readFileSync(join(dirname(desktopSkill), 'runtime.json'), 'utf8'),
      ).url,
      'http://127.0.0.1:4341',
    );
    // Matching MCP entry still refreshes the skill (hashes stay managed).
    await setupDesktopClient('claude-desktop', {
      home,
      directory: join(home, 'data'),
      platform: 'win32',
      appData: join(home, 'Roaming'),
      url: 'http://127.0.0.1:4341',
    });
    assert.match(readFileSync(desktopSkill, 'utf8'), /call Hyperion first/);
    const code = await setupDesktopClient('claude-code', {
      home,
      directory: join(home, 'data'),
      url: 'http://127.0.0.1:4341',
    });
    assert.equal(
      code.configFile,
      join(home, '.claude/skills/hyperion/SKILL.md'),
    );
    assert.match(readFileSync(code.configFile, 'utf8'), /name: hyperion/);
    assert.equal(
      JSON.parse(
        readFileSync(join(dirname(code.configFile), 'runtime.json'), 'utf8'),
      ).url,
      'http://127.0.0.1:4341',
    );
    await assert.rejects(
      setupDesktopClient('unknown', { home }),
      /cliente|client/i,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('confirmed replace overwrites a conflicting Cursor entry after backup', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-setup-replace-'));
  try {
    const file = join(home, '.cursor/mcp.json');
    mkdirSync(dirname(file), { recursive: true });
    const original =
      '{"mcpServers":{"hyperion":{"command":"different"},"other":{"command":"keep-me"}}}';
    writeFileSync(file, original);
    const options = {
      home,
      directory: join(home, 'data'),
      platform: 'darwin' as const,
      url: 'http://127.0.0.1:4341',
    };
    await assert.rejects(setupDesktopClient('cursor', options), /sobrescribió/);
    assert.equal(readFileSync(file, 'utf8'), original);
    const result = await setupDesktopClient('cursor', {
      ...options,
      replace: true,
    });
    assert.ok(result.backupFile);
    assert.equal(readFileSync(result.backupFile!, 'utf8'), original);
    const next = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(next.mcpServers.other.command, 'keep-me');
    assert.match(next.mcpServers.hyperion.args[0], /mcp-launcher\.js$/);
    assert.notEqual(next.mcpServers.hyperion.command, 'different');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('Antigravity setup uses its global MCP path on macOS, Windows and Linux', async () => {
  for (const platform of ['darwin', 'win32', 'linux'] as const) {
    const home = mkdtempSync(join(tmpdir(), 'hyperion-antigravity-'));
    try {
      const result = await setupDesktopClient('antigravity', {
        home,
        directory: join(home, 'data'),
        platform,
      });
      assert.equal(
        result.configFile,
        join(home, '.gemini/config/mcp_config.json'),
      );
      const server = JSON.parse(readFileSync(result.configFile, 'utf8'))
        .mcpServers.hyperion;
      assert.equal(server.env.HYPERION_AGENT_ID, 'antigravity');
      assert.equal(server.command, process.execPath);
      assert.equal(server.type, undefined);
      assert.match(server.args[0], /mcp-launcher\.js$/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }
});
