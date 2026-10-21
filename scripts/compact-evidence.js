// Offline only: stop the service and back up its volume first. No auth files are opened.
import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { diskSpace, requireStorage, encodeRecord, MIN_FREE_BYTES } from '../src/storage.js';

export function compactEvidence(path) {
  // Refuse before opening/writing a near-full DB. VACUUM can need twice the database size.
  const beforeBytes = statSync(path).size;
  let walBytes = 0;
  try { walBytes = statSync(path + '-wal').size; } catch {}
  const space = diskSpace(dirname(path)); requireStorage(space);
  if (space.availableBytes < (beforeBytes + walBytes) * 2 + MIN_FREE_BYTES) throw Error('Compaction needs free space of twice the database size plus 32 MiB; increase volume capacity first.');
  const db = new DatabaseSync(path);
  let requests = 0;
  try {
    db.exec('PRAGMA busy_timeout=1000; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; COMMIT; PRAGMA wal_checkpoint(TRUNCATE)');
    const update = db.prepare('UPDATE records SET data=? WHERE id=?');
    let after = 0;
    for (;;) {
      const rows = db.prepare("SELECT id,data FROM records WHERE kind='request' AND id>? AND json_type(data,'$.input') IS NOT NULL ORDER BY id LIMIT 32").all(after);
      if (!rows.length) break;
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of rows) { update.run(encodeRecord(JSON.parse(row.data)), row.id); requests++; }
        db.exec('COMMIT');
      } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
      after = rows.at(-1).id;
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    }
    db.exec('VACUUM; PRAGMA wal_checkpoint(TRUNCATE)');
    return { requestsCompressed: requests, beforeBytes, afterBytes: statSync(path).size };
  } finally { db.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  if (process.argv.length !== 4 || process.argv[2] !== '--offline-backup-confirmed') {
    console.error('Stop the service, back up its volume, then use: npm run compact:evidence -- --offline-backup-confirmed /data/village.sqlite'); process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(compactEvidence(resolve(process.argv[3])))); }
    catch { console.error('Compaction stopped. Verify the offline backup, free space, and database access; no evidence is deleted.'); process.exitCode = 1; }
  }
}
