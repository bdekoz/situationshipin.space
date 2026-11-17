import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { admittedPath, sha, validatePacket, verifyAssets } from './cartofreako-atlas-packet.mjs';

function fixture() {
  const subjects = [
    { stem: 'annual', ordinal: 1, scopes: ['world', 'japan'] },
    { stem: 'matched', ordinal: 2, scopes: ['world'] },
  ];
  const image = Buffer.from('bounded-image-fixture');
  const plates = subjects.flatMap(subject => subject.scopes.flatMap(scope => ['map', 'legend'].map(kind => {
    const file = `${scope}/${subject.stem}${kind === 'legend' ? '-legend' : ''}.webp`;
    const asset = { sha256: sha(image), bytes: image.length, dimensions: [100, 70] };
    return { stem: subject.stem, scope, kind, file, ...asset,
      thumbnail: { file: file.replace('.webp', '.thumb.webp'), ...asset },
      source_format: 'pdf', source_sha256: 'a'.repeat(64), source_bytes: 1000 };
  })));
  return { image, packet: { schema_version: 'cartofreako-atlas-review-2', source_repository: 'bdekoz/cartofreako',
    source_commit: 'b'.repeat(40), source_delivery_manifest_sha256: 'c'.repeat(64),
    subjects, plates, subject_count: 2, map_count: 3, legend_count: 3, source_records: [] } };
}

test('World-only source variants retain map/legend companions without inventing Japan', () => {
  const { packet } = fixture();
  const subjects = validatePacket(packet);
  assert.equal(subjects.size, 2);
  assert.equal(subjects.get('matched').sheets.size, 2);
  assert.equal(subjects.get('matched').sheets.has('japan/map'), false);
});

test('missing legends and duplicate identities fail before publication', () => {
  const { packet } = fixture();
  const missing = structuredClone(packet); missing.plates.pop();
  assert.throws(() => validatePacket(missing), /Missing map\/legend/);
  const duplicate = structuredClone(packet); duplicate.plates.push(duplicate.plates[0]);
  assert.throws(() => validatePacket(duplicate), /Duplicate sheet/);
});

test('India sheets, mismatched counts and unsafe filenames cannot enter this review', () => {
  const { packet } = fixture();
  const india = structuredClone(packet); india.plates[0].scope = 'india';
  assert.throws(() => validatePacket(india), /Invalid sheet identity/);
  assert.throws(() => validatePacket({ ...packet, map_count: 1 }), /counts differ/);
  const unsafe = structuredClone(packet); unsafe.plates[0].file = '../outside.webp';
  assert.throws(() => validatePacket(unsafe), /Unexpected sheet filename/);
  assert.throws(() => admittedPath('/tmp/prepared', '../outside.webp'), /Unsafe packet path/);
});

test('changed derivative or evidence bytes fail the packet checksum check', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'atlas-review-test-'));
  try {
    const { packet, image } = fixture();
    for (const sheet of packet.plates) {
      for (const asset of [sheet, sheet.thumbnail]) {
        const path = admittedPath(directory, asset.file);
        await mkdir(join(directory, sheet.scope), { recursive: true });
        await writeFile(path, image);
      }
    }
    await verifyAssets(directory, packet);
    await writeFile(admittedPath(directory, packet.plates[0].file), 'substituted bytes');
    await assert.rejects(verifyAssets(directory, packet), /hash or size differs/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
