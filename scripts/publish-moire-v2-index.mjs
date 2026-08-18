#!/usr/bin/env node
// Publish the additive M1-M3 moire plates as a review family on
// situationshipin.space (generation-moire-20260817-v2).
//
// Usage:
//   node scripts/publish-moire-v2-index.mjs \
//     --izzi-commit <40-hex> --artifacts-dir <dir with moire-m*.png>

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const FAMILY = "generation-moire-20260817-v2";
const ARTIFACT_ID = "generation-moire-20260817-v2-index";
const MEDIA_DIR = "review/media/moire-v2";

const MEMBERS = [
  { name: "moire-m1-01-fine-linear-grid", title: "M1 fine linear grid", description: "Fine near-vertical line families with a close beat." },
  { name: "moire-m1-02-stepped-elliptic-field", title: "M1 stepped elliptic field", description: "Dense ellipses with per-ring aspect stepping." },
  { name: "moire-m1-03-radial-aperture", title: "M1 radial aperture", description: "Dense rays with an open angular aperture." },
  { name: "moire-m1-04-interference-texture", title: "M1 interference texture", description: "Tuned line interference with restrained waves." },
  { name: "moire-m1-05-destabilized-texture", title: "M1 destabilized texture", description: "Seed-driven destabilized line texture." },
  { name: "moire-m1-06-glitch-texture", title: "M1 glitch texture", description: "Bounded experimental glitch displacement." },
  { name: "moire-m2-01-dot-grid", title: "M2 dot grid", description: "Closed dot motifs on a rotatable cell lattice." },
  { name: "moire-m2-02-negative-positive", title: "M2 negative-positive", description: "Inversion and parity selected compact and expanded motifs." },
  { name: "moire-m2-03-square-grid", title: "M2 square grid", description: "Closed square motifs on a skewed cell lattice." },
  { name: "moire-m2-04-slanted-line-grid", title: "M2 slanted line grid", description: "Parallel lines with a common shear angle." },
  { name: "moire-m2-05-rotated-line-grid", title: "M2 rotated line grid", description: "Lines with a per-line angular increment." },
  { name: "moire-m2-06-variable-grid", title: "M2 variable grid", description: "Parallel lines with a center-to-edge density gradient." },
  { name: "moire-m3-01-line-dot-hybrid", title: "M3 line-dot hybrid", description: "Two-family line and dot lattice beat." },
  { name: "moire-m3-02-orbit-square-hybrid", title: "M3 orbit-square hybrid", description: "Concentric and square lattice superposition." },
  { name: "moire-m3-03-radial-slant-hybrid", title: "M3 radial-slant hybrid", description: "Radial rays over a slanted line grid." },
  { name: "moire-m3-04-grid-interference", title: "M3 grid interference", description: "Motif-grid interference at capped amounts." },
  { name: "moire-m3-05-grid-destabilization", title: "M3 grid destabilization", description: "Motif-grid destabilization within bounded amounts." },
  { name: "moire-m3-06-polarity-glitch", title: "M3 polarity glitch", description: "Negative-positive polarity under experimental glitch." },
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

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
    console.error("usage: node scripts/publish-moire-v2-index.mjs --izzi-commit <40-hex> --artifacts-dir <dir>");
    process.exitCode = 1;
    return;
  }

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const members = [];
  for (const spec of MEMBERS) {
    await rm(join(repositoryRoot, "review", spec.name), { recursive: true, force: true });
    await rm(join(repositoryRoot, MEDIA_DIR, `${spec.name}.png`), { force: true });
  }
  catalog.items = catalog.items.filter((item) =>
    !/^moire-m[123]-/.test(item.artifact_id || ""));
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
      alt: `${spec.title}, 360 by 640 moire preview.`,
      family: FAMILY,
      generation_class: "moire",
      feedback_round: FAMILY,
      media_kind: "image",
      review_scope: "GENERATION-MOIRE-20260817-V2",
      review_mode: "output",
      source_path: `izzi ${izziCommit} outputs/ad-hoc/moire.v1/svg/${spec.name}.svg`,
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

  const title = "Moire Capability 20260817 v2";
  const description = "Additive M1-M3 tuning and extension of the izzi moire vocabulary: eighteen deterministic plates covering tuned line, concentric, radial, grid, and hybrid fields.";
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
    alt: "Index of the 18 additive izzi moire review plates from 2026-08-17.",
    family: FAMILY,
    generation_class: "moire-index",
    feedback_round: FAMILY,
    media_kind: "index",
    review_scope: "GENERATION-MOIRE-20260817-V2",
    review_mode: "output",
    source_path: `izzi ${izziCommit} outputs/ad-hoc/moire.v1 (M1-M3 additive plates)`,
    published_path: `review/media/${FAMILY}/${ARTIFACT_ID}.index.html`,
    sha256: sha256(indexBytes),
    bytes: indexBytes.length,
    format: "html",
    generation_commit: izziCommit,
    generation_state: "CURRENT",
    index_members: members.map((member) => member.artifact_id),
    technical_state: "MOIRE-INDEX",
    human_review_state: "UNREVIEWED",
    baseline_state: "NOT-PROMOTED",
    review_category: "proofs",
    added_at: new Date().toISOString(),
  };

  const entryPageDir = join(repositoryRoot, "review", ARTIFACT_ID);
  await mkdir(entryPageDir, { recursive: true });
  await writeFile(join(entryPageDir, "index.html"), renderReviewPage(entry));
  await writeFile(join(entryPageDir, "manifest.json"), renderReviewManifest(entry));

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
  }, null, 2));
}

await main();
