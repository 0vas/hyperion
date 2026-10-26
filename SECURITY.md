# Security policy

Hyperion v0.1 is a **local, single-user preview**. Only the current development version receives fixes.

## Trust boundary

The server listens on `127.0.0.1` and rejects unexpected Host/Origin and cross-site requests. Browser sessions and agent credentials use separate roles. Strict input validation, request limits, revision checks and command deduplication protect the workflow contract.

This does not isolate Hyperion from a program or agent running with the same OS user's full privileges. Such a program can read local files, obtain a browser session or operate the browser. Approval enforcement is a cooperative application boundary, not a sandbox against a malicious local agent.

Do not expose the server publicly, put it behind an Internet tunnel, or treat it as a multi-user service. A remote deployment needs authenticated identities, authorization per run, TLS, secure cookie configuration, rate limits and an executor trust model.

## Data

`.hyperion/` contains credentials, user responses, result evidence and SQLite history. It is excluded from Git and created with restrictive directory/file permissions on POSIX. Keep backups private; do not place secrets in step logs. No telemetry or AI API calls are built in. Dependencies are installed from npm.

A paused or cancelled workflow does not kill external processes or undo their effects. A disconnected executor may leave a step marked running. Reconcile the external action before retrying it.

## Connection conflict previews

The development source projects an allowlisted summary of a conflicting client entry before JSON delivery to the authenticated human-only connection inventory. This fix is not yet part of a published installer. The preview is read-only: it does not change the client file, conflict classification, replacement confirmation, backup, or preservation of other servers.

- HTTP(S) URLs show only their normalized origin (scheme, host and port). Userinfo, the entire path, all query parameters and the fragment are removed. This applies to the entry URL, `HYPERION_URL`, positional URL arguments and supported URL options. Malformed URLs, whitespace/backslash ambiguity and other schemes are withheld.
- Arguments retain only a supported prefix: local path-shaped arguments, HTTP(S) origins, `--stdio`, and split or `=` values for `--agent`, `--agent-id`, `--client`, `--data-dir`, `--cwd`, `--url`, `--server-url`, `--base-url`, and `--endpoint`. IDs must be lowercase identifiers; directories must be path-shaped. At the first unsupported argument, invalid value or non-string item, that item and the entire remaining tail become `••••`. This also withholds credential flags, header/authorization forms, environment assignments and shell scripts without guessing their arity. Useful values after an unsupported item will therefore also be hidden.
- Environment variable names are shown only when they use ordinary identifier syntax. Values are omitted except for a validated `HYPERION_AGENT_ID`, path-shaped `HYPERION_DATA_DIR`, the projected `HYPERION_URL`, and `ELECTRON_RUN_AS_NODE` set to `0` or `1`. Invalid allowed values become `••••`.
- Commands must be an executable basename or local path; working directories and skill paths must be local paths. Path projection accepts POSIX absolute paths with a single leading slash, `./` or `../` relative paths, and drive-qualified Windows paths, including spaces. Network paths and protocol-relative URLs are withheld, as are control characters, shell/URL metacharacters and embedded option text. Transport types are restricted to `stdio`, `http`, `sse`, and `streamable-http`; only the known owner `hyperion` is shown. Other values become `••••`. Display truncation happens after this projection.

This is not a universal secret detector or shell parser. Executable/path names, URL hosts and allowed client IDs are treated as public metadata; an arbitrary secret disguised as one of those values cannot be recognized reliably. Do not put credentials in those fields or share raw configurations. The amber comparison cue compares the displayed projection, including allowed environment values; hidden credentials and truncated differences are not a complete configuration diff. Authentication and the local single-user trust boundary still apply.

## Owned runtime file checks

In development source, connection inventory builds expected entries without registering credentials or writing exports. Only explicit setup keeps those writes. The human-only inventory additionally checks the generated executable and launcher paths owned by the running Hyperion installation. It checks for regular files, opens them read-only, rechecks the descriptors and closes them without reading contents. Saved client commands, arguments, environment and working directories cannot select runtime-check targets and are never executed. No child process, network probe, log reader or new listener is involved.

The preflight returns bounded file-result codes and a UTC timestamp, without raw errors, new paths, log contents or secrets. Human authentication and existing Host/Origin/no-store controls precede inspection. A missing file or permission error is an observation under Hyperion's identity; other I/O errors remain unknown. File readability does not prove executability, Windows security acceptance, MCP initialization, tool-call success or tools loaded by Claude. This is a filesystem snapshot within the existing trusted local-user boundary, not protection against local file replacement or another program with that user's privileges. It does not automatically repair or replace files. These diagnostics are not yet included in a published installer.

## Reporting

Do not disclose vulnerabilities or credentials in public issues. Use the repository's private vulnerability reporting feature if enabled; otherwise arrange a private channel with the repository owner through their GitHub profile before sending sensitive details. Include the affected revision, reproduction steps, impact, and a minimal sanitized example.

## Artifact storage and preview boundary

Only the run coordinator registers step artifacts. Files are capped at 10 MiB (14 MiB encoded request), with 100 metadata entries per step. Authentication, origin checks, attempt matching and idempotent receipts apply. SQLite stores immutable bytes separately; the HTTP endpoint never resolves a submitted filesystem path. CLI/MCP read only the specific local file explicitly supplied to the tool. Remote HTTP(S) links are stored without fetching them; credentials in URLs and other URL schemes are rejected.

Downloads are scoped to run/artifact IDs and require the local session or agent credential. HTML/SVG download responses are attachments with a sandbox CSP and `nosniff`. On the canvas, `text/html` and `image/svg+xml` open in a sandboxed `iframe` (`srcDoc`, empty `sandbox=""`, Preview/Source toggle and inert caption)—not as same-origin documents and not as malware-safe execution. Plain-text previews use escaped React content, not HTML injection. Supported raster previews remain sandboxed. External links open in the system browser from Desktop. Artifact content is not malware-scanned; registering a file is evidence of its existence, not an endorsement of its safety.

Linked cycles create independent runs in the same trusted OS-user boundary. They do not transfer coordinator rights, copy all parent context or reopen a completed run. Neither a new cycle nor its graph link resumes an external harness automatically.

## Local runtime upgrades

The launcher may stop an older server only after authenticating with the configured local agent credential and verifying the loopback listening process, current OS-user ownership and exact executable/server command. It rechecks that identity immediately before signalling. This is a trusted single-OS-user boundary, not protection against malicious code already running as that user. It never blindly kills a process by port or downgrades a newer server. A consistent, integrity-checked SQLite backup is required first; backups contain workflow data and are stored locally with restrictive permissions. Credentials are preserved, not embedded in process arguments. Startup is serialized; workflow state and external tasks are not restarted. On Windows, committed WAL transactions survive termination of the verified server process.
