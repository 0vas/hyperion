import { promises as fs } from 'node:fs';
import { ownedMcpRuntimePaths } from './connections.js';

export type RuntimeFileCode =
  | 'readable_file'
  | 'missing'
  | 'not_regular_file'
  | 'read_denied'
  | 'check_failed';

export type OwnedRuntimePreflight = {
  scope: 'expected_mcp_files';
  checkedAt: string;
  executable: { code: RuntimeFileCode };
  launcher: { code: RuntimeFileCode };
  mcpInitialization: 'not_checked';
  toolCall: 'not_checked';
  chatTools: 'unknown';
};

type FileStat = { isFile(): boolean };
type ReadHandle = { stat(): Promise<FileStat>; close(): Promise<void> };
/** Internal I/O seam for synthetic tests; never supplied by an HTTP request. */
export type RuntimeFileSystem = {
  stat(path: string): Promise<FileStat>;
  open(path: string, flags: 'r'): Promise<ReadHandle>;
};

function failureCode(error: unknown): RuntimeFileCode {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return 'missing';
  if (code === 'EACCES' || code === 'EPERM') return 'read_denied';
  return 'check_failed';
}

async function inspectFile(path: string, io: RuntimeFileSystem) {
  let code: RuntimeFileCode = 'check_failed';
  let handle: ReadHandle | undefined;
  try {
    // Reject directories/devices before opening. Recheck the opened descriptor
    // because the filesystem may change between observations.
    if (!(await io.stat(path)).isFile()) code = 'not_regular_file';
    else {
      handle = await io.open(path, 'r');
      code = (await handle.stat()).isFile()
        ? 'readable_file'
        : 'not_regular_file';
    }
  } catch (error) {
    code = failureCode(error);
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        code = 'check_failed';
      }
    }
  }
  return { code };
}

/** Readability under Hyperion's identity now, not execution or client health. */
export async function inspectOwnedMcpRuntime(
  io: RuntimeFileSystem = fs,
): Promise<OwnedRuntimePreflight> {
  const paths = ownedMcpRuntimePaths();
  const [executable, launcher] = await Promise.all([
    inspectFile(paths.executable, io),
    inspectFile(paths.launcher, io),
  ]);
  return {
    scope: 'expected_mcp_files',
    checkedAt: new Date().toISOString(),
    executable,
    launcher,
    mcpInitialization: 'not_checked',
    toolCall: 'not_checked',
    chatTools: 'unknown',
  };
}
