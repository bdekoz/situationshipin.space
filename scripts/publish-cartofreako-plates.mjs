#!/usr/bin/env node
// Publish an already prepared, hash-bound world/Japan review packet.
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReviewManifest, renderReviewPage } from './review-page.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) =>
  [process.argv[2 + i * 2], process.argv[3 + i * 2]]));
if (args['--approve'] !== 'PROJECT-APPROVED' || !args['--prepared']) {
  throw new Error('Usage: publish-cartofreako-plates.mjs --approve PROJECT-APPROVED --prepared DIR [--collection ID]');
}
const prepared = resolve(args['--prepared']);
const id = args['--collection'] || 'cartofreako-setouchi-2028-20261030';
if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid collection ID');
const packet = JSON.parse(await readFile(join(prepared, 'plates.json'), 'utf8'));
if (packet.source_repository !== 'bdekoz/cartofreako' || !/^[a-f0-9]{40}$/.test(packet.source_commit)) {
  throw new Error('Missing Cartofreako source identity');
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const escape = text => String(text ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const media = `review/media/${id}`;
const collectionPath = `review/${id}/index.html`;
const catalogPath = join(root, 'data/review-items.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const added = catalog.items.find(item => item.artifact_id === id)?.added_at || new Date().toISOString();
const pairs = new Map();
const supporting = [];
const members = [];

// Verify every input before copying or changing the portal catalog.
for (const plate of packet.plates) {
  if (!['world', 'japan'].includes(plate.scope) || !/^[a-z0-9-]+$/.test(plate.stem)) throw new Error('Invalid plate identity');
  const pair = pairs.get(plate.stem) || { title: plate.title, note: plate.note, ordinal: plate.ordinal };
  if (pair[plate.scope]) throw new Error('Duplicate plate: ' + plate.stem);
  pair[plate.scope] = plate; pairs.set(plate.stem, pair);
  for (const asset of [plate, plate.thumbnail]) {
    if (asset.file !== `${plate.scope}/${plate.stem}${asset === plate ? '' : '.thumb'}.webp`) throw new Error('Unexpected asset path');
    const bytes = await readFile(join(prepared, asset.file));
    if (sha(bytes) !== asset.sha256 || bytes.length !== asset.bytes || bytes.length > 16 * 1024 * 1024) throw new Error('Invalid review image: ' + asset.file);
  }
}
if (!pairs.size || [...pairs.values()].some(pair => !pair.world || !pair.japan)) throw new Error('Incomplete world/Japan pairs');

for (const plate of packet.plates) {
  for (const asset of [plate, plate.thumbnail]) {
    const path = `${media}/${asset.file}`;
    await mkdir(dirname(join(root, path)), { recursive: true });
    await copyFile(join(prepared, asset.file), join(root, path));
    supporting.push({ path, sha256: asset.sha256, bytes: asset.bytes, width: asset.dimensions[0], height: asset.dimensions[1], format: 'webp' });
  }
  plate.artifact_id = `${id}-${plate.scope}-${plate.stem}`;
  plate.published_path = `${media}/${plate.file}`;
  plate.thumbnail_path = `${media}/${plate.thumbnail.file}`;
  const item = {
    artifact_id: plate.artifact_id, title: `${plate.scope === 'world' ? 'World' : 'Japan'} / ${plate.title}`,
    description: `${plate.note} Review colors, line weights, layering, labels and the visible key.`,
    alt: `${plate.scope === 'world' ? 'World' : 'Japan detail'} plate: ${plate.title}`,
    family: id, generation_class: 'cartofreako-plate', feedback_round: id,
    media_kind: 'image', review_scope: 'CARTOFREAKO-WORLD-JAPAN-PLATES', review_mode: 'output',
    source_repository: packet.source_repository, source_commit: packet.source_commit,
    source_path: plate.source_path,
    source_artifact: { repository: packet.source_repository, path: plate.source_path,
      sha256: plate.source_sha256, bytes: plate.source_bytes, dimensions: plate.source_dimensions,
      format: 'png', published: false },
    published_path: plate.published_path, sha256: plate.sha256, bytes: plate.bytes,
    width: plate.dimensions[0], height: plate.dimensions[1], format: 'webp',
    technical_state: 'CHECKSUM-VERIFIED-LOSSLESS-REVIEW-DERIVATIVE', human_review_state: 'UNREVIEWED',
    baseline_state: 'NOT-PROMOTED', review_category: 'proofs', style: 'cartofreako', added_at: added,
  };
  members.push({ plate, item });
}

const packetPath = `${media}/plates.json`;
const packetBytes = Buffer.from(JSON.stringify({ ...packet, collection_id: id, published_at: added }, null, 2) + '\n');
await writeFile(join(root, packetPath), packetBytes);
supporting.push({ path: packetPath, sha256: sha(packetBytes), bytes: packetBytes.length, format: 'json' });
const ordered = [...pairs.values()].sort((a, b) => a.ordinal - b.ordinal);
for (let i = 0; i < members.length; i++) {
  const { plate, item } = members[i];
  const peer = pairs.get(plate.stem)[plate.scope === 'world' ? 'japan' : 'world'];
  const neighbors = [members[i - 1], members[i + 1]].filter(Boolean);
  const nav = `<nav aria-label="Plate review navigation"><p><a href="/review/${id}/#${plate.stem}">← All world &amp; Japan plates</a> · <a href="/review/${peer.artifact_id}/">${plate.scope === 'world' ? 'Japan detail' : 'World companion'}</a></p><p>${neighbors.map(({ item: next }) => `<a href="/review/${next.artifact_id}/">${escape(next.title)}</a>`).join(' · ')}</p></nav>`;
  let html = renderReviewPage(item).replace('<p><a href="/">← Review catalog</a></p>', nav);
  html = html.replace('<h2 id="media-title">Review the artifact</h2>',
    `<h2 id="media-title">Review the plate</h2><p><a href="/${plate.published_path}" target="_blank" rel="noopener">Open 3840-pixel image to zoom ↗</a></p>`);
  html = html.replace('</style>', '.review-media img{height:auto}.review-page nav p{overflow-wrap:anywhere}</style>');
  await mkdir(join(root, 'review', item.artifact_id), { recursive: true });
  await writeFile(join(root, 'review', item.artifact_id, 'index.html'), html);
  await writeFile(join(root, 'review', item.artifact_id, 'manifest.json'), renderReviewManifest(item));
}

const title = 'Cartofreako / Setouchi 2028 / World & Japan';
const state = { id, source_repository: packet.source_repository, source_commit: packet.source_commit,
  manifest_sha256: sha(packetBytes), plates: members.map(({ plate }) => ({ artifact_id: plate.artifact_id,
    stem: plate.stem, scope: plate.scope, sha256: plate.sha256, source_sha256: plate.source_sha256 })) };
const figures = pair => ['world', 'japan'].map(scope => {
  const p = pair[scope]; const label = scope === 'world' ? 'World' : 'Japan';
  return `<figure data-plate-scope="${scope}"><a href="/review/${p.artifact_id}/"><img src="/${p.thumbnail_path}" width="${p.thumbnail.dimensions[0]}" height="${p.thumbnail.dimensions[1]}" alt="${label}: ${escape(p.title)}" loading="lazy" decoding="async"></a><figcaption><strong>${label}</strong><span class="plate-state" data-review-state="${p.artifact_id}">Awaiting review</span><a href="/review/${p.artifact_id}/">Review &amp; notes</a><a href="/${p.published_path}" target="_blank" rel="noopener">Zoom image ↗</a></figcaption></figure>`;
}).join('\n');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="description" content="${pairs.size} world and Japan plate pairs for Cartofreako / Setouchi 2028 review."><title>${escape(title)} — situationshipin.space</title><link rel="stylesheet" href="/assets/css/cartofreako-plates.css"><script src="/assets/js/cartofreako-plates.js" type="module"></script></head>
<body><main><header><p><a href="/proofs.html">← Review catalog / Proofs</a></p><p class="eyebrow">Cartofreako · Setouchi Triennale 2028 · review edition 2026-10-30</p><h1>One world, Japan in detail</h1><p class="intro">${pairs.size} subjects, ${members.length} plates. Compare each world map with its Japan companion, open an image to zoom, or choose “Review &amp; notes” to leave feedback.</p><p class="small">3840-pixel lossless review images from the latest complete plate set. Source dates and keys remain on each plate. The native swarm occupies separate 1080p/4K and 720p/SD subjects.</p></header>
<section class="toolbar" aria-label="Find plates"><label>Find a subject<input id="plate-search" type="search" placeholder="Fiber, water, swarm, petroleum, coral…"></label><div class="scope-controls" role="group" aria-label="Geographic scope"><button type="button" data-select-scope="both" aria-pressed="true">World + Japan</button><button type="button" data-select-scope="world" aria-pressed="false">World</button><button type="button" data-select-scope="japan" aria-pressed="false">Japan</button></div><p id="plate-count" class="status" role="status">${pairs.size} subjects · ${members.length} plates</p></section>
<p id="empty" hidden>No subjects match. Try a different search.</p><div id="plates">${ordered.map(pair => `<article class="pair" id="${pair.world.stem}" data-search="${escape((pair.title + ' ' + pair.note + ' ' + pair.world.stem).toLowerCase())}"><h2>${String(pair.ordinal).padStart(2, '0')} / ${escape(pair.title)}</h2><p class="pair-note">${escape(pair.note)}</p><div class="pair-grid">${figures(pair)}</div></article>`).join('\n')}</div>
<section class="global-notes" aria-labelledby="collection-notes-title"><h2 id="collection-notes-title">Notes across the collection</h2><p class="small">Plate reviews and collection notes stay in this browser. Download one JSON file to return all your saved feedback.</p><label for="collection-notes">Overall comments</label><textarea id="collection-notes" placeholder="What should change across the set?"></textarea><div class="actions"><button class="action" type="button" id="save-collection-notes">Save collection notes</button><button class="action" type="button" id="download-collection-review">Download all saved reviews</button><output id="notes-status" role="status"></output></div></section>
<footer><p><a href="/${packetPath}">Source and image manifest</a> · <a href="https://github.com/bdekoz/cartofreako/blob/${packet.source_commit}/docs/pages/getting-started/generation-styles.md">Saved generation styles</a> · <a href="/proofs.html">Other proofs</a></p><p class="small provenance">Cartofreako ${packet.source_commit.slice(0, 7)} · Verified against the Setouchi delivery manifest. Publication prepares the work for review.</p></footer>
<script id="plate-review-data" type="application/json">${JSON.stringify(state).replace(/</g, '\\u003c')}</script></main></body></html>\n`;
await mkdir(dirname(join(root, collectionPath)), { recursive: true });
await writeFile(join(root, collectionPath), html);
const bytes = Buffer.from(html);
const entry = {
  artifact_id: id, title, description: `${pairs.size} world/Japan pairs, ${members.length} latest plates: searchable comparisons, zoomable lossless images, individual notes and a combined review download.`,
  alt: 'World and Japan Cartofreako plate comparison gallery', family: 'cartofreako',
  generation_class: 'cartofreako-plate-index', feedback_round: id, media_kind: 'index',
  review_scope: 'CARTOFREAKO-WORLD-JAPAN-PLATES', review_mode: 'output', review_category: 'proofs',
  source_repository: packet.source_repository, source_commit: packet.source_commit,
  source_path: `${packet.source_delivery}/index.html`, source_manifest_sha256: packet.source_delivery_manifest_sha256,
  published_path: collectionPath, sha256: sha(bytes), bytes: bytes.length, format: 'html',
  generation_commit: packet.source_commit, generation_state: 'CURRENT',
  index_members: members.map(({ item }) => item.artifact_id), review_assets: supporting,
  technical_state: 'CHECKSUM-VERIFIED-REVIEW-COLLECTION', human_review_state: 'UNREVIEWED', baseline_state: 'NOT-PROMOTED',
  style: 'cartofreako', added_at: added,
  publication_request: { authority: 'Explicit project-owner request', approved_on: '2026-10-30',
    instruction: 'can you put the latest world and japan plates up on situationshipin.space for review?',
    scope: 'Publish the existing Cartofreako world and Japan plates for review' },
};
await writeFile(join(root, 'review', id, 'manifest.json'), renderReviewManifest(entry));
catalog.items = catalog.items.filter(item => item.artifact_id !== id);
catalog.items.unshift(entry);
catalog.generated_at = new Date().toISOString();
await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ collection: id, pairs: pairs.size, plates: members.length,
  review_url: `https://situationshipin.space/review/${id}/`,
  payload_bytes: bytes.length + supporting.reduce((n, a) => n + a.bytes, 0) }, null, 2));
