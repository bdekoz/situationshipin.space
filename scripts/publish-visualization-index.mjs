#!/usr/bin/env node
// Publish the izzi generative visualization family as an aggregated review
// index on situationshipin.space (generation-visualization-20260814).
//
// Usage:
//   node scripts/publish-visualization-index.mjs \
//     --izzi-commit <40-hex> --artifacts-dir <dir with .svg/.png per member>

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const FAMILY = "generation-visualization-20260814";
const ARTIFACT_ID = "generation-visualization-20260814";
const MEDIA_DIR = "review/media/visualization";

const MEMBERS = [
  { name: "visualization-line", title: "Visualization — line graph", description: "Line graph re-created from the alpha60-results week series (make_line_graph pipeline, accessibility contract).", alt: "Line graph of a weekly downloads series." },
  { name: "visualization-line-2", title: "Visualization — line graph 2", description: "Second line-graph variation from the alpha60-results week series.", alt: "Line graph variation 2." },
  { name: "visualization-line-3", title: "Visualization — line graph 3", description: "Third line-graph variation from the alpha60-results week series.", alt: "Line graph variation 3." },
  { name: "visualization-line-4", title: "Visualization — line graph 4", description: "Fourth line-graph variation from the alpha60-results week series.", alt: "Line graph variation 4." },
  { name: "visualization-grid", title: "Visualization — grid", description: "Deterministic grid of cumulative unique-BTIHA entries from the alpha60-results data.", alt: "Grid of cumulative collection entries." },
  { name: "visualization-grid-1x8", title: "Visualization — grid 1×8", description: "Single-row eight-column grid variant from the alpha60-results cumulative data.", alt: "Single-row eight-column cumulative grid." },
  { name: "visualization-kusama", title: "Visualization — kusama", description: "Radial kusama view of mmrl cast-lead attribute values (kusama_ids_orbit_low).", alt: "Radial kusama attribute visualization." },
  { name: "visualization-kusama-2", title: "Visualization — kusama 2", description: "Second kusama radial variation from the mmrl metadata.", alt: "Kusama variation 2." },
  { name: "visualization-kusama-3", title: "Visualization — kusama 3", description: "Third kusama radial variation from the mmrl metadata.", alt: "Kusama variation 3." },
  { name: "visualization-kusama-4", title: "Visualization — kusama 4", description: "Fourth kusama radial variation from the mmrl metadata.", alt: "Kusama variation 4." },
  { name: "visualization-chord", title: "Visualization — chord", description: "First-pass bipartite chord layout of media-object to attribute pairs from mmrl metadata.", alt: "Bipartite chord visualization." },
];

function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }
function argumentsMap(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) values[key] = true;
    else { values[key] = next; index += 1; }
  }
  return values;
}
function pngDimensions(bytes) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function renderIndexHtml({ title, description, members, commit, indexDir }) {
  const escape = (value) => String(value ?? "").replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rows = members.map((member) => {
    const thumbSrc = relative(indexDir, member.mediaPath).split(sep).join("/");
    return [
    `<li class="pass">`,
    `<a class="thumb" href="../../${member.artifact_id}/"><img src="${thumbSrc}" alt="" loading="lazy" decoding="async"></a>`,
    `<div class="pass-body">`,
    `<h3><a href="../../${member.artifact_id}/">${escape(member.title)}</a></h3>`,
    `<p>${escape(member.description)}</p>`,
    `<p class="meta">${escape(member.artifact_id)}</p>`,
    `</div>`,
    `</li>`,
  ].join("\n");
  }).join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="description" content="${escape(description)}">
    <title>${escape(title)} — situationshipin.space</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,sans-serif;margin:0;background:#fcfbf7;color:#14171a;line-height:1.45}
      main{max-width:72rem;margin:auto;padding:2rem 1rem 5rem}
      h1{font-size:1.6rem;margin:0 0 .4rem}
      .sub{color:#4d565d;margin:0 0 1.5rem}
      ul.passes{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(15rem,1fr));gap:1rem}
      li.pass{display:grid;grid-template-columns:6rem minmax(0,1fr);gap:.8rem;align-items:start;background:#f5f6f4;border:1px solid #9da8af;padding:.8rem}
      .thumb img{display:block;width:6rem;height:auto;border:1px solid #9da8af}
      li.pass h3{margin:0 0 .25rem;font-size:1rem}
      li.pass p{margin:0 0 .25rem;color:#4d565d;font-size:.85rem}
      .meta{font-family:ui-monospace,monospace;font-size:.72rem;overflow-wrap:anywhere}
      a{color:#173a55}
    </style>
  </head>
  <body>
    <main>
      <p><a href="/">← Review catalog</a></p>
      <h1>${escape(title)}</h1>
      <p class="sub">${escape(description)}</p>
      <p class="sub">Izzi generation commit: <code>${escape(commit)}</code> · ${members.length} passes</p>
      <ul class="passes">
${rows}
      </ul>
    </main>
  </body>
</html>
`;
}

async function main() {
  const values = argumentsMap(process.argv.slice(2));
  const izziCommit = values["izzi-commit"];
  const artifactsDir = values["artifacts-dir"] ? resolve(values["artifacts-dir"]) : null;
  if (!izziCommit || !/^[0-9a-f]{40}$/.test(izziCommit) || !artifactsDir) {
    console.error("usage: node scripts/publish-visualization-index.mjs --izzi-commit <40-hex> --artifacts-dir <dir>");
    process.exitCode = 1;
    return;
  }

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const members = [];
  for (const spec of MEMBERS) {
    const pngPath = `${MEDIA_DIR}/${spec.name}.png`;
    await mkdir(join(repositoryRoot, MEDIA_DIR), { recursive: true });
    await copyFile(join(artifactsDir, `${spec.name}.png`), join(repositoryRoot, pngPath));
    const pngBytes = await readFile(join(repositoryRoot, pngPath));
    const { width, height } = pngDimensions(pngBytes);
    const item = {
      artifact_id: spec.name,
      title: spec.title,
      description: spec.description,
      alt: spec.alt,
      family: FAMILY,
      generation_class: "visualization",
      feedback_round: FAMILY,
      media_kind: "image",
      review_scope: "GENERATION-VISUALIZATION-20260814",
      review_mode: "output",
      source_path: `izzi ${izziCommit} outputs/review/feedback/visual/visualization/${spec.name}.svg`,
      published_path: pngPath,
      sha256: sha256(pngBytes),
      bytes: pngBytes.length,
      width, height,
      format: "png",
      technical_state: "VERIFIED",
      human_review_state: "UNREVIEWED",
      baseline_state: "NOT-PROMOTED",
      review_category: "proofs",
      style: "house-style",
      added_at: new Date().toISOString(),
    };
    members.push({ artifact_id: item.artifact_id, title: item.title, description: item.description, mediaPath: pngPath, item });
    const pageDir = join(repositoryRoot, "review", item.artifact_id);
    await mkdir(pageDir, { recursive: true });
    await writeFile(join(pageDir, "index.html"), renderReviewPage(item));
    await writeFile(join(pageDir, "manifest.json"), renderReviewManifest(item));
  }

  const title = "Generative Visualization 20260814";
  const description = "One aggregated entry for the 2026-08-14 izzi generative visualization family: line graph, grid, kusama, and chord artifacts from the alpha60-results and mmrl-metadata data pipeline. Open the index to reach each individual review page.";
  const indexHtml = renderIndexHtml({
    title, description, members, commit: izziCommit,
    indexDir: join("review", "media", FAMILY),
  });
  const indexPath = join(repositoryRoot, "review/media", FAMILY, `${ARTIFACT_ID}.index.html`);
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, indexHtml);
  const indexBytes = Buffer.from(indexHtml, "utf8");

  const entry = {
    artifact_id: ARTIFACT_ID,
    title, description,
    alt: "Index of the 4 generative visualization review artifacts from 2026-08-14.",
    family: FAMILY,
    generation_class: "visualization-index",
    feedback_round: FAMILY,
    media_kind: "index",
    review_scope: "GENERATION-VISUALIZATION-20260814",
    review_mode: "output",
    source_path: `izzi ${izziCommit} outputs/review/feedback/visual/visualization (family aggregate)`,
    published_path: `review/media/${FAMILY}/${ARTIFACT_ID}.index.html`,
    sha256: sha256(indexBytes),
    bytes: indexBytes.length,
    format: "html",
    generation_commit: izziCommit,
    generation_state: "CURRENT",
    index_members: members.map((member) => member.artifact_id),
    technical_state: "VISUALIZATION-INDEX",
    human_review_state: "UNREVIEWED",
    baseline_state: "NOT-PROMOTED",
    review_category: "proofs",
    added_at: new Date().toISOString(),
  };

  catalog.items = catalog.items.filter((item) => item.artifact_id !== ARTIFACT_ID);
  catalog.items.push(entry);
  catalog.items.sort((left, right) =>
    String(right.added_at || "").localeCompare(String(left.added_at || "")));
  catalog.generated_at = new Date().toISOString();
  catalog.source_commit = izziCommit;
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    status: "PUBLISHED", artifact_id: ARTIFACT_ID, izzi_commit: izziCommit,
    member_count: members.length, index_sha256: sha256(indexBytes),
    members: members.map((member) => member.artifact_id),
  }, null, 2));
}

await main();
