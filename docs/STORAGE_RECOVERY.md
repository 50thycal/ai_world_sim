# Storage and startup recovery (app 0.8.1)

## Production evidence and its limits

On 2026-10-21 the v8 batch `be733920-bf3d-40d2-b635-f97741fb7548` paused in
member two, run `a59afaa3-780b-42fa-88fa-c9c4565f1bb0`, request
`0234be72-0141-4a27-9ba5-6138a085647c` (Bolt, request 676, tick 1344).
The worker exited with code 1 during `initialize`, about 162 ms into the request.
No thread/turn had started; no OOM kill was recorded. The previous version discarded stderr,
so the exact cause is unknown and cannot be reconstructed. This was not the earlier 90-second
inference timeout. Unknown exits remain terminal rather than being blindly retried.

Railway reported service DISK_USAGE_GB near 1.016 GB and a mounted volume size of 1024 MB.
The runtime reported 255 diagnostic write failures at the review snapshot. These are signs to
investigate storage pressure, not proof that all service disk usage belongs to the persistent
volume or that a full volume caused the worker exit. The old diagnostic counter omitted error
categories. This release measures available blocks on the actual data filesystem and exposes a
fixed SQLite write-error category, so the next deployment can resolve those uncertainties.

## Changes

- `/api/research/runtime` adds `storage`: actual filesystem total/available bytes, a 32 MiB
  minimum, `ready`, main database and WAL sizes, and reusable database pages. No paths or auth files.
- `diagnosticLastWriteError` distinguishes full, busy, locked, read-only, I/O and unknown write
  errors using numeric SQLite codes. Counters/categories are boot-local and retained after a failure.
- The runner checks available space before advancing work and before each model attempt. The Codex
  adapter checks its home filesystem before spawning. Low/unknown space pauses; neither is retried.
  The reserve permits a small pause/failure save, but is not a guarantee against external disk writers
  or a filesystem already completely full. Startup itself still needs room for SQLite/owner writes.
- Unexpected worker close waits for stderr to drain. Only fixed startup signatures become error
  categories; raw stderr, paths, accounts and credentials are never logged or saved. A bounded
  in-memory tail handles split chunks. OOM observations override retryable categories.
- Recognized temporary startup locks/resource-unavailable failures use the existing two-retry/
  twelve-extra-attempt policy. Auth/quota/rate/memory/storage/unknown errors pause. No usage is
  refunded, no replacement member is created, and saved proposals remain intact.
- New request inputs use lossless deflate in their SQLite JSON envelope. Metadata remains queryable;
  research pages, export and store readers restore the exact original input shape. Legacy rows remain
  readable. This is storage encoding only: world-v8, prompts, rules and review cadence are unchanged.
- WAL autocheckpoint is 128 pages and idle journal retention is 1 MiB. These are targets, not hard
  caps during large transactions or active readers. Original SQLite-full errors survive rollback.

The two reviewed v8 runs contained 2,116 captured request records. Re-encoding those records locally
reduced serialized record bytes from 42,597,219 to 20,325,432 (52%). This is a record-size measurement,
not a claim of a 52% smaller volume, reduced model tokens, or faster inference. Frames, Codex state,
indexes and other data also occupy storage.

## Deployment and restart

For deployment verification, app `/health` must report version `0.8.1` or later to confirm the PR #12 storage fixes are serving. A GitHub merge alone does not confirm deployment.

Merge/deploy normally; the service always starts paused. Inspect the new runtime storage fields
before resuming the existing member. If the actual data filesystem is low, enlarge the existing
Railway volume before resuming (5 GB is a reasonable initial capacity, then monitor growth). This
PR does not change the paid volume allocation. Never delete/recreate the volume or reset the batch
as a storage fix. No credential export or reconnect is needed unless an auth category is observed.

Compression applies to new requests. It does not shrink existing database files on deployment.
To reclaim historical request storage, use the optional offline maintenance command only after
stopping every process that accesses this database and making a verified volume backup:

```sh
npm run compact:evidence -- --offline-backup-confirmed /data/village.sqlite
```

The command requires free space of twice the current main database and WAL sizes plus 32 MiB, acquires an exclusive SQLite lock, compresses
legacy inputs in small transactions, checkpoints between batches, then runs SQLite VACUUM.
This deliberately requires extra capacity first; running VACUUM on a full volume can fail.
It preserves every record ID, run, failure, frame, batch and exact input. It never opens Codex auth
files or deletes historical runs. It can be rerun after interruption: already compressed inputs are
skipped. This is not a live HTTP maintenance endpoint; deploys never perform automatic compaction.

Verification includes mixed legacy/new exact-input reads, stable paginated evidence IDs, export,
reopen, idempotent offline compaction, low-space guards without purchased calls, actual SQLite-full
rollback, fake-worker startup category redaction, terminal disk-full behavior and bounded startup
lock recovery. Protocol tests do not establish the cause of the old production exit or successful
live recovery; verify the deployed runtime and next real requests after owner restart.
