import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const escape = text => String(text ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function admittedPath(root, file) {
  if (typeof file !== 'string' || file.startsWith('/') || file.split('/').includes('..')) {
    throw new Error('Unsafe packet path');
  }
  const path = resolve(root, file);
  if (!path.startsWith(resolve(root) + sep)) throw new Error('Packet path escapes preparation directory');
  return path;
}

export function validatePacket(packet) {
  if (packet.schema_version !== 'cartofreako-atlas-review-2'
      || packet.source_repository !== 'bdekoz/cartofreako'
      || !/^[a-f0-9]{40}$/.test(packet.source_commit)
      || !/^[a-f0-9]{64}$/.test(packet.source_delivery_manifest_sha256)) {
    throw new Error('Missing verified atlas build identity');
  }
  if (!Array.isArray(packet.subjects) || !packet.subjects.length || !Array.isArray(packet.plates)) {
    throw new Error('Missing subjects or sheets');
  }
  const subjects = new Map();
  for (const subject of packet.subjects) {
    if (!/^[a-z0-9-]+$/.test(subject.stem) || subjects.has(subject.stem)
        || !Number.isInteger(subject.ordinal) || subject.ordinal < 1) throw new Error('Invalid subject identity');
    subjects.set(subject.stem, { ...subject, sheets: new Map() });
  }
  for (const sheet of packet.plates) {
    const subject = subjects.get(sheet.stem);
    if (!subject || !['world', 'japan'].includes(sheet.scope) || !['map', 'legend'].includes(sheet.kind)) {
      throw new Error('Invalid sheet identity');
    }
    const key = `${sheet.scope}/${sheet.kind}`;
    if (subject.sheets.has(key)) throw new Error('Duplicate sheet identity');
    const expected = `${sheet.scope}/${sheet.stem}${sheet.kind === 'legend' ? '-legend' : ''}.webp`;
    if (sheet.file !== expected || sheet.thumbnail?.file !== expected.replace('.webp', '.thumb.webp')) {
      throw new Error('Unexpected sheet filename');
    }
    if (!['png', 'pdf'].includes(sheet.source_format) || !/^[a-f0-9]{64}$/.test(sheet.source_sha256)
        || !Number.isSafeInteger(sheet.source_bytes) || sheet.source_bytes < 1) throw new Error('Missing source identity');
    for (const asset of [sheet, sheet.thumbnail]) {
      if (!/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes)
          || asset.bytes < 1 || asset.bytes > 16 * 1024 * 1024
          || !Array.isArray(asset.dimensions) || asset.dimensions.length !== 2
          || asset.dimensions.some(n => !Number.isInteger(n) || n < 1 || n > 3840)) {
        throw new Error('Invalid bounded review image');
      }
    }
    subject.sheets.set(key, sheet);
  }
  for (const subject of subjects.values()) {
    if (!subject.sheets.has('world/map')) throw new Error('Missing World sheet');
    const scopes = ['world', 'japan'].filter(scope => subject.sheets.has(`${scope}/map`));
    if (JSON.stringify(scopes) !== JSON.stringify(subject.scopes)) throw new Error('Geographic coverage differs');
    for (const scope of ['world', 'japan']) {
      if (subject.sheets.has(`${scope}/map`) !== subject.sheets.has(`${scope}/legend`)) {
        throw new Error('Missing map/legend companion');
      }
    }
  }
  const count = kind => packet.plates.filter(sheet => sheet.kind === kind).length;
  if (packet.subject_count !== subjects.size || packet.map_count !== count('map')
      || packet.legend_count !== count('legend')) throw new Error('Sheet counts differ');
  return subjects;
}

export async function verifyAssets(directory, packet) {
  const records = packet.plates.flatMap(sheet => [sheet, sheet.thumbnail]).concat(packet.source_records || []);
  for (const asset of records) {
    const bytes = await readFile(admittedPath(directory, asset.file));
    if (bytes.length !== asset.bytes || sha(bytes) !== asset.sha256 || bytes.length > 16 * 1024 * 1024) {
      throw new Error('Prepared asset hash or size differs: ' + asset.file);
    }
  }
}
