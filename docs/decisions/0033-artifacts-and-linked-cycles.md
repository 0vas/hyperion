# ADR 0033: Step artifacts and linked conversation cycles

Status: accepted in source. Date: 2026-10-12.

## Context

A file path in a log is not a deliverable that the person can access. A conversation can continue after the process has completed, but reopening a terminal run would rewrite the meaning of its history.

## Decision

Store immutable artifact metadata on the producing step/attempt and bytes in a separate SQLite table. Upload, snapshot, event and idempotency receipt commit together. Enforce coordinator ownership, bounded content, authenticated access and inert previews. Preserve artifacts across retries; reject stale attempts. Allow append-only artifact registration for completed agent work without reopening it. Typed I/O retains its existing role.

Create a separate run only in response to a new user request. Store its immutable origin reference and a transactional relationship row. Project reciprocal links into read responses and SSE, without modifying the parent's snapshot/revision. The graph connects terminal and initial navigation cards outside the process DAG. Relevant context is supplied explicitly; parent data is not indiscriminately copied. A new coordinator can own the child without gaining mutation rights on the parent.

## Consequences

Local deliverables remain downloadable after the original source file changes. Database size grows with uploads; limits are 10 MiB/file, 100 files/step, 32 direct continuations/parent. Remote links remain external and may expire. HTML/SVG may use an inert sandboxed iframe preview (`sandbox=""`, no scripts or network) with a source toggle; this is not a full browser and must not be described as executable app hosting. The desktop uses the same authenticated endpoints.

A linked cycle is neither retry nor durable harness resumption. A UI request draft must be passed to a connected agent to plan the next run. No native connector is implied. Unit/HTTP/MCP/browser tests cover persistence, authorization, attempts, idempotency, inert previews and reciprocal navigation.
