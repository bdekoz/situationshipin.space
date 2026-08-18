#!/usr/bin/env node
// Publish the additive S1-S2 surface-tension plates as a review family on
// situationshipin.space (generation-surface-tension-20260817-v2).
//
// Usage:
//   node scripts/publish-surface-tension-v2-index.mjs \
//     --izzi-commit <40-hex> --artifacts-dir <dir with surface-tension-s*.png>

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const FAMILY = "generation-surface-tension-20260817-v2";
const ARTIFACT_ID = "generation-surface-tension-20260817-v2-index";
const MEDIA_DIR = "review/media/surface-tension-v2";

const MEMBERS = [
  { name: "surface-tension-s1-01-crossed-folds", title: "S1 crossed folds", description: "Four tuned folded membranes with a close beat." },
  { name: "surface-tension-s1-02-tilted-chain", title: "S1 tilted chain", description: "Six anisotropic sources in a destabilized chain." },
  { name: "surface-tension-s1-03-boundary-veil", title: "S1 boundary veil", description: "Glitch membrane draped across the canvas boundary." },
  { name: "surface-tension-s2-01-pattern-ring", title: "S2 pattern ring", description: "Phased ring of related level-set sources." },
  { name: "surface-tension-s2-02-pattern-lattice", title: "S2 pattern lattice", description: "Staggered source lattice with bounded variation." },
  { name: "surface-tension-s2-03-pattern-rotating-array", title: "S2 rotating array", description: "Wave-modulated rotating source array." },
  { name: "surface-tension-s2-04-object-clusters", title: "S2 object clusters", description: "Core-and-lobe object membranes with bounded jitter." },
  { name: "surface-tension-s2-05-surface-field", title: "S2 surface field", description: "Anisotropic field sharing tilt, aspect, and a strength envelope." },
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
    console.error("usage: node scripts/publish-surface-tension-v2-index.mjs --izzi-commit <40-hex> --artifacts-dir <dir>");
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
    !/^surface-tension-s[12]-/.test(item.artifact_id || ""));
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
      alt: `${spec.title}, 360 by 640 surface-tension preview.`,
      family: FAMILY,
      generation_class: "surface-tension",
      feedback_round: FAMILY,
      media_kind: "image",
      review_scope: "GENERATION-SURFACE-TENSION-20260817-V2",
      review_mode: "output",
      source_path: `izzi ${izziCommit} outputs/ad-hoc/surface-tension.v1/svg/${spec.name}.svg`,
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

  const title = "Surface Tension Capability 20260817 v2";
  const description = "Additive S1-S2 tuning and extension of the izzi surface-tension vocabulary: eight deterministic plates covering tuned membranes and pattern, object, and surface-field source compositions.";
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
    alt: "Index of the 8 additive izzi surface-tension review plates from 2026-08-17.",
    family: FAMILY,
    generation_class: "surface-tension-index",
    feedback_round: FAMILY,
    media_kind: "index",
    review_scope: "GENERATION-SURFACE-TENSION-20260817-V2",
    review_mode: "output",
    source_path: `izzi ${izziCommit} outputs/ad-hoc/surface-tension.v1 (S1-S2 additive plates)`,
    published_path: `review/media/${FAMILY}/${ARTIFACT_ID}.index.html`,
    sha256: sha256(indexBytes),
    bytes: indexBytes.length,
    format: "html",
    generation_commit: izziCommit,
    generation_state: "CURRENT",
    index_members: members.map((member) => member.artifact_id),
    technical_state: "SURFACE-TENSION-INDEX",
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
