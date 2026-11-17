#!/usr/bin/env node
// Publish a verified atlas-optional review round, retaining the previous media and reviews.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admittedPath, escape, sha, validatePacket, verifyAssets } from './cartofreako-atlas-packet.mjs';
import { renderReviewManifest, renderReviewPage } from './review-page.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(Array.from({ length: (process.argv.length - 2) / 2 }, (_, i) =>
  [process.argv[2 + i * 2], process.argv[3 + i * 2]]));
if (args['--approve'] !== 'PROJECT-APPROVED' || !args['--prepared'] || !args['--collection']) {
  throw new Error('Usage: publish-cartofreako-atlas.mjs --approve PROJECT-APPROVED --prepared DIR --collection ID');
}
const id = args['--collection'];
if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid collection identity');
const prepared = resolve(args['--prepared']);
const packet = JSON.parse(await readFile(join(prepared, 'plates.json'), 'utf8'));
const subjects = validatePacket(packet);
await verifyAssets(prepared, packet);
const catalogPath = join(root, 'data/review-items.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
if (catalog.items.some(item => item.artifact_id === id)) throw new Error('Use a fresh collection ID for changed media');
const previous = catalog.items.find(item => item.artifact_id === 'cartofreako-setouchi-2028-20261030');
const added = new Date().toISOString();
const media = `review/media/${id}`;
const assets = [];
const members = new Map();

for (const sheet of packet.plates) {
  sheet.artifact_id = `${id}-${sheet.scope}-${sheet.stem}${sheet.kind === 'legend' ? '-legend' : ''}`;
  sheet.published_path = `${media}/${sheet.file}`;
  sheet.thumbnail_path = `${media}/${sheet.thumbnail.file}`;
  const label = sheet.scope === 'world' ? 'World' : 'Japan';
  const suffix = sheet.kind === 'legend' ? ' / Legend & sources' : ' / Map';
  const item = {
    artifact_id: sheet.artifact_id, title: `${label} / ${sheet.title}${suffix}`,
    description: `${sheet.note}. Review the ${sheet.kind === 'legend' ? 'legend typography, keys, explanations and source notes' : 'current plate colors, line weights, layering and labels'}.`,
    alt: `${label}: ${sheet.title}${suffix}`, family: id, generation_class: 'cartofreako-plate',
    feedback_round: id, media_kind: 'image', review_scope: 'CARTOFREAKO-WORLD-JAPAN-PLATES',
    review_mode: 'output', source_repository: packet.source_repository, source_commit: packet.source_commit,
    source_path: sheet.source_path,
    source_artifact: { repository: packet.source_repository, path: sheet.source_path,
      sha256: sheet.source_sha256, bytes: sheet.source_bytes, format: sheet.source_format, published: false },
    source_build: { build_id: packet.source_build_id, dataset_id: packet.source_dataset_id,
      implementation_revision: packet.source_build_revision, implementation_dirty: packet.source_build_dirty,
      receipt_sha256: packet.source_delivery_manifest_sha256 },
    published_path: sheet.published_path, sha256: sheet.sha256, bytes: sheet.bytes,
    width: sheet.dimensions[0], height: sheet.dimensions[1], format: 'webp',
    technical_state: 'CHECKSUM-VERIFIED-LOSSLESS-REVIEW-DERIVATIVE', human_review_state: 'UNREVIEWED',
    baseline_state: 'NOT-PROMOTED', review_category: 'proofs', style: 'cartofreako', added_at: added,
  };
  members.set(`${sheet.stem}/${sheet.scope}/${sheet.kind}`, { sheet, item });
}

// All files and their hashes were checked before any public files are changed.
for (const source of packet.plates.flatMap(sheet => [sheet, sheet.thumbnail]).concat(packet.source_records || [])) {
  const path = `${media}/${source.file}`;
  await mkdir(dirname(join(root, path)), { recursive: true });
  await copyFile(admittedPath(prepared, source.file), join(root, path));
  assets.push({ path, sha256: source.sha256, bytes: source.bytes,
    ...(source.dimensions ? { width: source.dimensions[0], height: source.dimensions[1] } : {}),
    format: source.file.endsWith('.webp') ? 'webp' : 'json' });
}
const packetPath = `${media}/plates.json`;
const packetBytes = Buffer.from(JSON.stringify({ ...packet, collection_id: id, published_at: added }, null, 2) + '\n');
await writeFile(join(root, packetPath), packetBytes);
assets.push({ path: packetPath, sha256: sha(packetBytes), bytes: packetBytes.length, format: 'json' });

for (const { sheet, item } of members.values()) {
  const subject = subjects.get(sheet.stem);
  const links = [`<a href="/review/${id}/#${sheet.stem}">All subjects</a>`];
  for (const scope of subject.scopes) {
    for (const kind of ['map', 'legend']) {
      const member = members.get(`${sheet.stem}/${scope}/${kind}`);
      if (member.item.artifact_id !== item.artifact_id) {
        links.push(`<a href="/review/${member.item.artifact_id}/">${scope === 'world' ? 'World' : 'Japan'} ${kind === 'legend' ? 'legend &amp; sources' : 'map'}</a>`);
      }
    }
  }
  let page = renderReviewPage(item).replace('<p><a href="/">← Review catalog</a></p>',
    `<nav aria-label="Sheet companions"><p>${links.join(' · ')}</p></nav>`);
  page = page.replace('<h2 id="media-title">Review the artifact</h2>',
    `<h2 id="media-title">Review the ${sheet.kind}</h2><p><a href="/${sheet.published_path}" target="_blank" rel="noopener">Open full review image to zoom ↗</a></p>`);
  page = page.replace('Motion and audio notes', 'Map and legend notes');
  page = page.replace('</style>', '.review-media img{height:auto}.review-page nav p{overflow-wrap:anywhere}</style>');
  await mkdir(join(root, 'review', item.artifact_id), { recursive: true });
  await writeFile(join(root, 'review', item.artifact_id, 'index.html'), page);
  await writeFile(join(root, 'review', item.artifact_id, 'manifest.json'), renderReviewManifest(item));
}

const state = { id, source_repository: packet.source_repository, source_commit: packet.source_commit,
  manifest_sha256: sha(packetBytes), plates: packet.plates.map(sheet => ({
    artifact_id: sheet.artifact_id, stem: sheet.stem, scope: sheet.scope, kind: sheet.kind,
    sha256: sheet.sha256, source_sha256: sheet.source_sha256 })) };
const figure = (subject, scope, kind) => {
  const { sheet } = members.get(`${subject.stem}/${scope}/${kind}`);
  const label = kind === 'legend' ? 'Legend &amp; sources' : 'Map';
  return `<figure><a href="/review/${sheet.artifact_id}/"><img src="/${sheet.thumbnail_path}" width="${sheet.thumbnail.dimensions[0]}" height="${sheet.thumbnail.dimensions[1]}" alt="${scope === 'world' ? 'World' : 'Japan'} ${kind}: ${escape(subject.title)}" loading="lazy" decoding="async"></a><figcaption><strong>${label}</strong><span class="plate-state" data-review-state="${sheet.artifact_id}">Awaiting review</span><a href="/review/${sheet.artifact_id}/">Review &amp; notes</a><a href="/${sheet.published_path}" target="_blank" rel="noopener">Zoom image ↗</a></figcaption></figure>`;
};
const cards = [...subjects.values()].map(subject => {
  const columns = subject.scopes.map(scope => `<section class="sheet-column" data-plate-scope="${scope}" data-sheet-count="2"><h3>${scope === 'world' ? 'World' : 'Japan'}</h3>${figure(subject, scope, 'map')}<details><summary>Open legend and source sheet</summary>${figure(subject, scope, 'legend')}</details></section>`).join('\n');
  const coverage = subject.scopes.length === 1 ? '<p class="small">World-only in this review: the source variant pairs World with India and has no Japan sheet.</p>' : '';
  return `<article class="pair" id="${subject.stem}" data-search="${escape((subject.title + ' ' + subject.note + ' ' + subject.stem).toLowerCase())}"><h2>${String(subject.ordinal).padStart(2, '0')} / ${escape(subject.title)}</h2><p class="pair-note">${escape(subject.note)}</p>${coverage}<div class="pair-grid">${columns}</div></article>`;
}).join('\n');
const title = 'Cartofreako / Current atlas-optional / World & Japan';
const previousLink = previous ? `<a href="/review/${previous.artifact_id}/">Previous October 30 review round</a> · ` : '';
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(title)} — situationshipin.space</title><link rel="stylesheet" href="/assets/css/cartofreako-plates.css"><script src="/assets/js/cartofreako-plates.js" type="module"></script></head>
<body><main><header><p><a href="/proofs.html">← Proofs</a></p><p class="eyebrow">Cartofreako · Atlas-optional · review edition ${escape(packet.review_date)}</p><h1>One world, Japan in detail</h1><p class="intro">${packet.subject_count} subjects, ${packet.map_count} maps and ${packet.legend_count} legend/source sheets. Compare World and Japan, expand each legend, zoom the complete image, and leave a separate review for each sheet.</p><p class="small">Current wine/amber maps and A3 v3 legends from the completed November 11 data edition. All available World/Japan optional ocean and climate variants are included. Nine World/India variants contribute their World sheets only. Source observation dates and qualifications remain on the legend sheets.</p><p class="small">This is a new review round requested in <a href="${escape(packet.request_issue)}">issue #83</a>. Earlier feedback stays bound to the original October images.</p></header>
<section class="toolbar" aria-label="Find sheets"><label>Find a subject<input id="plate-search" type="search" placeholder="Petroleum, mineral, marine heatwave, season…"></label><div class="scope-controls" role="group" aria-label="Geographic scope"><button type="button" data-select-scope="both" aria-pressed="true">World + Japan</button><button type="button" data-select-scope="world" aria-pressed="false">World</button><button type="button" data-select-scope="japan" aria-pressed="false">Japan</button></div><p id="plate-count" class="status" role="status">${packet.subject_count} subjects · ${packet.plates.length} sheets</p></section>
<p id="empty" hidden>No subjects match. Try a different search.</p><div id="plates">${cards}</div>
<section class="global-notes" aria-labelledby="collection-notes-title"><h2 id="collection-notes-title">Notes across the collection</h2><p class="small">Reviews stay in this browser. Download one JSON file to return your saved sheet reviews and collection notes.</p><label for="collection-notes">Overall comments</label><textarea id="collection-notes" placeholder="What should change across this atlas?"></textarea><div class="actions"><button class="action" type="button" id="save-collection-notes">Save collection notes</button><button class="action" type="button" id="download-collection-review">Download all saved reviews</button><output id="notes-status" role="status"></output></div></section>
<footer><p>${previousLink}<a href="/${packetPath}">Source and image manifest</a> · <a href="https://github.com/bdekoz/cartofreako/blob/${packet.source_commit}/docs/pages/getting-started/generation-styles.md">Saved generation styles</a></p><p class="small provenance">Dataset ${escape(packet.source_dataset_id)} · completed build ${escape(packet.source_build_id)} · ${packet.plates.length} checksum-verified sheet derivatives. Optional print PDFs rendered with Poppler; full print masters remain in Cartofreako. Technical publication opens a new review round.</p></footer>
<script id="plate-review-data" type="application/json">${JSON.stringify(state).replace(/</g, '\\u003c')}</script></main></body></html>\n`;
const collectionPath = `review/${id}/index.html`;
await mkdir(dirname(join(root, collectionPath)), { recursive: true });
await writeFile(join(root, collectionPath), html);
const bytes = Buffer.from(html);
const entry = {
  artifact_id: id, title,
  description: `${packet.subject_count} current atlas-optional subjects: ${packet.map_count} World/Japan maps and ${packet.legend_count} separate legends, including optional variants. Revised for issue #83.`,
  alt: 'Current atlas-optional World/Japan maps and A3 legend comparison gallery', family: 'cartofreako',
  generation_class: 'cartofreako-plate-index', feedback_round: id, media_kind: 'index',
  review_scope: 'CARTOFREAKO-WORLD-JAPAN-PLATES', review_mode: 'output', review_category: 'proofs',
  source_repository: packet.source_repository, source_commit: packet.source_commit,
  source_path: packet.source_delivery, source_manifest_sha256: packet.source_delivery_manifest_sha256,
  published_path: collectionPath, sha256: sha(bytes), bytes: bytes.length, format: 'html',
  generation_commit: packet.source_build_revision, generation_state: 'CURRENT',
  index_members: packet.plates.map(sheet => sheet.artifact_id), review_assets: assets,
  technical_state: 'CHECKSUM-VERIFIED-REVIEW-COLLECTION', human_review_state: 'UNREVIEWED', baseline_state: 'NOT-PROMOTED',
  style: 'cartofreako', added_at: added,
  publication_request: { authority: 'Explicit project-owner request', approved_on: packet.review_date,
    instruction: packet.publication_instruction, issue_url: packet.request_issue,
    scope: 'All completed atlas-optional World/Japan maps and companion legend/source sheets' },
};
await writeFile(join(root, 'review', id, 'manifest.json'), renderReviewManifest(entry));
if (previous) {
  const path = join(root, previous.published_path);
  let old = await readFile(path, 'utf8');
  old = old.replace('<header>', `<header><p class="revision-notice"><strong>Earlier review round.</strong> <a href="/review/${id}/">Open the current atlas-optional maps and legends →</a></p>`);
  await writeFile(path, old);
  previous.sha256 = sha(Buffer.from(old)); previous.bytes = Buffer.byteLength(old);
  previous.generation_state = 'SUPERSEDED'; previous.superseded_by = id;
  await writeFile(join(root, 'review', previous.artifact_id, 'manifest.json'), renderReviewManifest(previous));
}
catalog.items.unshift(entry);
catalog.generated_at = added;
await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({ collection: id, subjects: subjects.size, sheets: packet.plates.length,
  review_url: `https://situationshipin.space/review/${id}/`,
  added_payload_bytes: bytes.length + assets.reduce((n, asset) => n + asset.bytes, 0) }, null, 2));
