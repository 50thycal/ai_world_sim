import { statfsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

export const MIN_FREE_BYTES = 32 * 1024 * 1024;
const INPUT_ENCODING = 'deflate-base64-v1';

// Keep queryable request metadata as JSON; losslessly compress only the large input.
// Scientific API/export callers always receive the original record shape.
export function encodeRecord(record) {
  if (record.kind !== 'request' || !record.input) return JSON.stringify(record);
  const { input, ...metadata } = record;
  return JSON.stringify({ ...metadata, inputEncoding: INPUT_ENCODING,
    inputCompressed: deflateSync(JSON.stringify(input)).toString('base64') });
}
export function decodeRecord(value) {
  const record = JSON.parse(value);
  if (record.inputEncoding !== INPUT_ENCODING) return record;
  const { inputEncoding, inputCompressed, ...metadata } = record;
  return { ...metadata, input: JSON.parse(inflateSync(Buffer.from(inputCompressed, 'base64')).toString('utf8')) };
}
export function diskSpace(path, read = statfsSync) {
  try {
    const fs = read(path, { bigint: true });
    return { totalBytes: Number(fs.blocks * fs.bsize), availableBytes: Number(fs.bavail * fs.bsize) };
  } catch { return { totalBytes: null, availableBytes: null }; }
}
export function requireStorage(space) {
  if (space.availableBytes === null || !Number.isFinite(space.availableBytes)) {
    const error = new Error('Storage availability could not be checked; paused before starting more work.');
    error.diagnosticCode = 'storage_unavailable'; throw error;
  }
  if (space.availableBytes < MIN_FREE_BYTES) {
    const error = new Error('Persistent storage has less than 32 MiB free; increase capacity or archive safely before resuming.');
    error.diagnosticCode = 'storage_low'; throw error;
  }
}
export function storageStatus(path, db, read = diskSpace) {
  const size = file => { try { return statSync(file).size; } catch { return 0; } };
  const space = read(dirname(path));
  const pageSize = db.prepare('PRAGMA page_size').get().page_size;
  return { ...space, minimumFreeBytes: MIN_FREE_BYTES,
    ready: Number.isFinite(space.availableBytes) && space.availableBytes >= MIN_FREE_BYTES,
    databaseBytes: size(path), walBytes: size(path + '-wal'),
    reusableDatabaseBytes: db.prepare('PRAGMA freelist_count').get().freelist_count * pageSize };
}
