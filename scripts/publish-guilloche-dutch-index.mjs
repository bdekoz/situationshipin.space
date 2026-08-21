#!/usr/bin/env node
// Publish the izzi Dutch lighthouse radiate guilloche 3x5 review plate as a
// review family on situationshipin.space (generation-guilloche-20260821-dutch).
//
// Usage:
//   node scripts/publish-guilloche-dutch-index.mjs \
//     --izzi-commit <40-hex> --artifacts-dir <dir with dutch-plate-*.png>

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const FAMILY = "generation-guilloche-20260821-dutch";
const ARTIFACT_ID = "generation-guilloche-20260821-dutch-index";
const MEDIA_DIR = "review/media/guilloche-dutch";

const COLUMN_WEIGHTS = ["0.25", "0.5", "1", "2", "4"];
const CELL_NAMES = [
  "reference", "reference", "reference", "reference", "reference",
  "midnight-gold", "oxblood-cyan", "forest-blush", "aubergine-mint",
  "indigo-sun",
  "registration-glitch", "asymmetric-widths", "extreme-parameters",
  "layer-rotation", "multiply-surprise",
];

const MEMBERS = [
  {
    name: "dutch-plate-grid-3x5",
    title: "3x5 review plate grid",
    description: "The full 2400x1440 Dutch lighthouse radiate review plate: rows reference, exploration, and wild treatments across stroke widths 0.25, 0.5, 1, 2, and 4.",
    alt: "Grid of fifteen Dutch guilloche radiate cells: three rows by five stroke-width columns.",
  },
];

for (let row = 1; row <= 3; row += 1)
  for (let column = 1; column <= 5; column += 1)
    {
      const index = (row - 1) * 5 + (column - 1);
      const slug = CELL_NAMES[index];
      const name = `dutch-plate-r${row}c${column}-${slug}`;
      let treatment;
      if (row === 1) treatment = "red/green reference";
      else if (row === 2)
        treatment = `${slug.replaceAll("-", " ")} color-pair exploration`;
      else treatment = `${slug.replaceAll("-", " ")} wild treatment`;
      MEMBERS.push({
        name,
        title: `Row ${row} Col ${column} - ${treatment}`,
        description: `${treatment} at ${COLUMN_WEIGHTS[column - 1]} point stroke on the 20% gray review background.`,
        alt: `Row ${row} column ${column} of the Dutch guilloche review plate, ${treatment}, ${COLUMN_WEIGHTS[column - 1]} point stroke.`,
      });
    }

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
      `<h3>${escape(member.title)}</h3>`,
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
    console.error("usage: node scripts/publish-guilloche-dutch-index.mjs --izzi-commit <40-hex> --artifacts-dir <dir>");
    process.exitCode = 1;
    return;
  }

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  for (const spec of MEMBERS)
    {
      await rm(join(repositoryRoot, "review", spec.name), { recursive: true, force: true });
      await rm(join(repositoryRoot, MEDIA_DIR, `${spec.name}.png`), { force: true });
    }
  catalog.items = catalog.items.filter((item) =>
    !/^dutch-plate-(grid-3x5|r\d+c\d+-[a-z0-9-]+)$/.test(item.artifact_id || ""));

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
      generation_class: "guilloche",
      feedback_round: FAMILY,
      media_kind: "image",
      review_scope: "GENERATION-GUILLOCHE-20260821-DUTCH",
      review_mode: "output",
      source_path: `izzi ${izziCommit} outputs/ad-hoc/guilloche.dutch/svg/${spec.name}.svg`,
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

  const title = "Guilloche Dutch Lighthouse Radiate 20260821";
  const description = "Stage-4 Dutch guilloche review: the sol-5.6 reference-guided two-layer lighthouse radiate as a 3x5 plate - row 1 red/green reference, row 2 seeded randoma11y color-pair explorations, row 3 wild glitch/extreme treatments - across stroke widths 0.25, 0.5, 1, 2, and 4. Prior round: generation-guilloche-20260816-index.";
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
    alt: "Index of the 16 izzi Dutch lighthouse radiate review plates from 2026-08-21.",
    family: FAMILY,
    generation_class: "guilloche-index",
    feedback_round: FAMILY,
    media_kind: "index",
    review_scope: "GENERATION-GUILLOCHE-20260821-DUTCH",
    review_mode: "output",
    source_path: `izzi ${izziCommit} outputs/ad-hoc/guilloche.dutch (3x5 review plate aggregate)`,
    published_path: `review/media/${FAMILY}/${ARTIFACT_ID}.index.html`,
    sha256: sha256(indexBytes),
    bytes: indexBytes.length,
    format: "html",
    generation_commit: izziCommit,
    generation_state: "CURRENT",
    index_members: members.map((member) => member.artifact_id),
    technical_state: "GUILLOCHE-DUTCH-INDEX",
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
