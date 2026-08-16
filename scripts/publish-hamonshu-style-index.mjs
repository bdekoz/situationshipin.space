#!/usr/bin/env node
// Publish the izzi hamonshu Pages documents as a style-processing review
// family on situationshipin.space (resource-hamonshu-20260815).
//
// Each Pages document becomes one media_kind:index aggregate plus one
// image-reference review page per page image. Compact JPEG proxies are
// derived from the full-resolution PNG exports; the PNGs stay local and
// are recorded as source_image lineage (published: false).
//
// Invited reviewer: coolart@avis.ne.jp (recorded on every item).
//
// Usage:
//   node scripts/publish-hamonshu-style-index.mjs \
//     --proxies <dir of hamonshu_<d>-<NNN>.jpg> \
//     --source-root <izzi resources/hamonshu> \
//     --izzi-commit <40-hex> \
//     [--dry-run]

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, stat, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve, sep, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");

const FAMILY = "hamonshu-20260815";
const REVIEW_SCOPE = "HAMONSHU-STYLE-PROCESSING-20260815";
const INVITED_REVIEWER = "coolart@avis.ne.jp";
const MEDIA_DIR = "review/izzi/2026-08-15/resources/hamonshu";
const INDEX_DIR = "review/media/resource-hamonshu-20260815";
const PAGE_WIDTH = 3479;
const PAGE_HEIGHT = 5058;

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

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

function renderIndexHtml({ title, description, members, commit, indexDir }) {
  const escape = (value) =>
    String(value ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rows = members
    .map((member) => {
      const id = member.artifact_id;
      const thumbSrc = relative(indexDir, member.mediaPath).split(sep).join("/");
      return [
        `<li class="pass">`,
        `<a class="thumb" href="../../${id}/"><img src="${thumbSrc}" alt="" loading="lazy" decoding="async"></a>`,
        `<div class="pass-body">`,
        `<h3><a href="../../${id}/">${escape(member.title)}</a></h3>`,
        `<p>${escape(member.description)}</p>`,
        `<p class="meta">${escape(id)}</p>`,
        `</div>`,
        `</li>`,
      ].join("\n");
    })
    .join("\n");
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
      <p class="sub">Izzi generation commit: <code>${escape(commit)}</code> · ${members.length} pages</p>
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
  const proxiesDir = values["proxies"] ? resolve(values["proxies"]) : null;
  const sourceRoot = values["source-root"] ? resolve(values["source-root"]) : null;
  const izziCommit = values["izzi-commit"];
  const dryRun = Boolean(values["dry-run"]);
  if (!proxiesDir || !sourceRoot || !izziCommit || !/^[0-9a-f]{40}$/.test(izziCommit)) {
    console.error("usage: node scripts/publish-hamonshu-style-index.mjs --proxies <dir> --source-root <dir> --izzi-commit <40-hex> [--dry-run]");
    process.exitCode = 1;
    return;
  }

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const proxyFiles = (await readdir(proxiesDir))
    .filter((name) => /^hamonshu_[123]-\d{3}\.jpg$/.test(name))
    .sort();
  if (proxyFiles.length !== 86) {
    console.error(`expected 86 proxies, found ${proxyFiles.length}`);
    process.exitCode = 1;
    return;
  }

  const byDocument = { 1: [], 2: [], 3: [] };
  const members = [];

  for (const proxyName of proxyFiles) {
    const match = /^hamonshu_([123])-(\d{3})\.jpg$/.exec(proxyName);
    const document = match[1];
    const page = match[2];
    const mediaPath = `${MEDIA_DIR}/${proxyName}`;
    const mediaAbs = join(repositoryRoot, mediaPath);
    const proxyBytes = await readFile(mediaAbs);
    const { width, height } = readJpegDimensions(proxyBytes) || {};
    const pngPath = join(sourceRoot, `hamonshu_${document}.pages`, `hamonshu_${document}-${page}.png`);
    const pngBytes = await readFile(pngPath);
    const pngSha = sha256(pngBytes);
    const artifactId = `resource-${FAMILY}-${document}-${page}`;
    const description = `Hamonshu document ${document}, page ${page} from the izzi resources (style-processing review). Full-resolution source stays local; this is the compact review proxy. Invited reviewer: ${INVITED_REVIEWER}.`;
    const item = {
      artifact_id: artifactId,
      title: `Hamonshu ${document} — page ${page}`,
      description,
      alt: `Hamonshu document ${document}, page ${page}, rendered at review proxy size.`,
      family: FAMILY,
      generation_class: "style-processing",
      feedback_round: FAMILY,
      media_kind: "image-reference",
      review_scope: REVIEW_SCOPE,
      review_mode: "output",
      source_path: `resources/hamonshu/hamonshu_${document}.pages/hamonshu_${document}-${page}.png`,
      source_state: "WORKTREE-UNCOMMITTED",
      source_image: {
        path: `resources/hamonshu/hamonshu_${document}.pages/hamonshu_${document}-${page}.png`,
        sha256: pngSha,
        bytes: pngBytes.length,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        format: "png",
        published: false,
        repository_state: "WORKTREE-UNCOMMITTED",
      },
      published_path: mediaPath,
      sha256: sha256(proxyBytes),
      bytes: proxyBytes.length,
      width,
      height,
      format: "jpg",
      technical_state: "DERIVATIVE-VERIFIED",
      human_review_state: "UNREVIEWED",
      baseline_state: "NOT-PROMOTED",
      review_category: "style-processing",
      invited_reviewer: INVITED_REVIEWER,
      generation_commit: izziCommit,
      generation_state: "CURRENT",
      style: "house-style",
      added_at: new Date().toISOString(),
    };
    members.push({ artifact_id: artifactId, title: item.title, description: item.description, mediaPath, item });
    byDocument[document].push({ artifact_id: artifactId, title: item.title, description: item.description, mediaPath, item });
    const pageDir = join(repositoryRoot, "review", artifactId);
    if (!dryRun) {
      await mkdir(pageDir, { recursive: true });
      await writeFile(join(pageDir, "index.html"), renderReviewPage(item));
      await writeFile(join(pageDir, "manifest.json"), renderReviewManifest(item));
    }
  }

  const indexEntries = [];
  for (const document of ["1", "2", "3"]) {
    const docMembers = byDocument[document];
    const title = `Hamonshu ${document} — style-processing index`;
    const description = `One aggregated entry for Hamonshu document ${document} (${docMembers.length} pages) from the izzi resources, published for style-processing review. Invited reviewer: ${INVITED_REVIEWER}. Open the index to reach each individual review page.`;
    const indexHtml = renderIndexHtml({
      title,
      description,
      members: docMembers,
      commit: izziCommit,
      indexDir: INDEX_DIR,
    });
    const indexPath = join(repositoryRoot, INDEX_DIR, `hamonshu_${document}.index.html`);
    if (!dryRun) {
      await mkdir(dirname(indexPath), { recursive: true });
      await writeFile(indexPath, indexHtml);
    }
    const indexBytes = Buffer.from(indexHtml, "utf8");
    const indexSha = sha256(indexBytes);
    const indexId = `resource-${FAMILY}-${document}-index`;
    const entry = {
      artifact_id: indexId,
      title,
      description,
      alt: `Index of the ${docMembers.length} Hamonshu document ${document} pages published for style-processing review.`,
      family: FAMILY,
      generation_class: "style-processing-index",
      feedback_round: FAMILY,
      media_kind: "index",
      review_scope: REVIEW_SCOPE,
      review_mode: "output",
      source_path: `izzi ${izziCommit} resources/hamonshu/hamonshu_${document}.pages (document aggregate)`,
      published_path: `review/media/resource-hamonshu-20260815/hamonshu_${document}.index.html`,
      sha256: indexSha,
      bytes: indexBytes.length,
      format: "html",
      generation_commit: izziCommit,
      generation_state: "CURRENT",
      index_members: docMembers.map((member) => member.artifact_id),
      technical_state: "STYLE-PROCESSING-INDEX",
      human_review_state: "UNREVIEWED",
      baseline_state: "NOT-PROMOTED",
      review_category: "style-processing",
      invited_reviewer: INVITED_REVIEWER,
      added_at: new Date().toISOString(),
    };
    indexEntries.push(entry);
    if (!dryRun) {
      const pageDir = join(repositoryRoot, "review", indexId);
      await mkdir(pageDir, { recursive: true });
      await writeFile(join(pageDir, "index.html"), renderReviewPage(entry));
      await writeFile(join(pageDir, "manifest.json"), renderReviewManifest(entry));
    }
  }

  if (!dryRun) {
    catalog.items = catalog.items.filter(
      (item) => item.family !== FAMILY && !item.artifact_id.startsWith(`resource-${FAMILY}-`)
    );
    for (const member of members) catalog.items.push(member.item);
    for (const entry of indexEntries) catalog.items.push(entry);
    catalog.items.sort((left, right) =>
      String(right.added_at || "").localeCompare(String(left.added_at || ""))
    );
    catalog.generated_at = new Date().toISOString();
    catalog.source_commit = izziCommit;
    await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n", "utf8");
  }

  console.log(JSON.stringify({
    status: dryRun ? "DRY-RUN" : "PUBLISHED",
    family: FAMILY,
    izzi_commit: izziCommit,
    member_count: members.length,
    index_count: indexEntries.length,
    invited_reviewer: INVITED_REVIEWER,
    total_proxy_bytes: members.reduce((sum, member) => sum + member.item.bytes, 0),
  }, null, 2));
}

await main();
