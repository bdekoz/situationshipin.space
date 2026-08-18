#!/usr/bin/env node
// Publish the workflow-v2 mermaid diagrams for portal inspection (W7).
// Both diagrams were render-verified locally against Mermaid v11.16.1 and
// are published as chrome-rendered PNGs plus one family index.
//
// Usage:
//   node scripts/publish-workflow-diagrams.mjs \
//     --izzi-commit <40-hex> --diagrams-dir <dir>

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = join(repositoryRoot, "data/review-items.json");
const FAMILY = "workflow-v2-diagrams";
const ARTIFACT_ID = "workflow-v2-diagram-index";
const MEDIA_DIR = "review/media/workflow-v2-diagrams";

const MEMBERS = [
  {
    name: "workflow-baseline-v1-diagram",
    title: "Workflow Baseline v1 — three-box",
    description:
      "Accepted section 5.1 three-box workflow: situationshipin.space to "
      + "devastation pacific:izzi to situationshipin.space, with "
      + "publish-video-proof.mjs carried in the bottom box.",
  },
  {
    name: "workflow-v2-loop-diagram",
    title: "Workflow v2 — plan to produce to review",
    description:
      "Plan, produce, and review loop with the four stage-labeled "
      + "review-to-plan feedback edges: stage-1, stage-2, pilot, release.",
  },
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
      ul.passes{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(16rem,1fr));gap:1rem}
      li.pass{display:grid;grid-template-columns:9rem minmax(0,1fr);gap:.8rem;align-items:start;background:#f5f6f4;border:1px solid #9da8af;padding:.8rem}
      .thumb img{display:block;width:9rem;height:auto;border:1px solid #9da8af;background:#fff}
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
      <p class="sub">Izzi generation commit: <code>${escape(commit)}</code> · render-verified Mermaid v11.16.1 · ${members.length} diagrams</p>
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
  const diagramsDir = values["diagrams-dir"] ? resolve(values["diagrams-dir"]) : null;
  if (!izziCommit || !/^[0-9a-f]{40}$/.test(izziCommit) || !diagramsDir) {
    console.error(
      "usage: node scripts/publish-workflow-diagrams.mjs "
      + "--izzi-commit <40-hex> --diagrams-dir <dir>"
    );
    process.exitCode = 1;
    return;
  }

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const members = [];
  for (const spec of MEMBERS) {
    await rm(join(repositoryRoot, "review", spec.name), { recursive: true, force: true });
    const pngPath = `${MEDIA_DIR}/${spec.name}.png`;
    await mkdir(join(repositoryRoot, MEDIA_DIR), { recursive: true });
    await copyFile(join(diagramsDir, `${spec.name}.png`), join(repositoryRoot, pngPath));
    const pngBytes = await readFile(join(repositoryRoot, pngPath));
    const { width, height } = pngDimensions(pngBytes);
    const item = {
      artifact_id: spec.name,
      title: spec.title,
      description: spec.description,
      alt: `${spec.title}, chrome-rendered mermaid diagram.`,
      family: FAMILY,
      generation_class: "workflow-diagram",
      feedback_round: "workflow-v2-diagrams",
      media_kind: "image",
      review_scope: "WORKFLOW-V2-DIAGRAMS",
      review_mode: "output",
      source_path: `izzi ${izziCommit} docs/workflows.md`,
      published_path: pngPath,
      sha256: sha256(pngBytes),
      bytes: pngBytes.length,
      width, height,
      format: "png",
      generation_commit: izziCommit,
      generation_state: "CURRENT",
      technical_state: "RENDER-VERIFIED-MERMAID-11.16.1",
      human_review_state: "UNREVIEWED",
      baseline_state: "NOT-PROMOTED",
      review_category: "proofs",
      added_at: new Date().toISOString(),
    };
    members.push({
      artifact_id: item.artifact_id,
      title: item.title,
      description: item.description,
      mediaPath: pngPath,
    });
    const pageDir = join(repositoryRoot, "review", item.artifact_id);
    await mkdir(pageDir, { recursive: true });
    await writeFile(join(pageDir, "index.html"), renderReviewPage(item));
    await writeFile(join(pageDir, "manifest.json"), renderReviewManifest(item));
    catalog.items = catalog.items.filter((entry) => entry.artifact_id !== item.artifact_id);
    catalog.items.push(item);
  }

  const title = "Workflow v2 Diagrams";
  const description =
    "Baseline v1 three-box workflow and workflow v2 plan-to-produce-to-review "
    + "loop, authored by gpt-5.6-sol and render-verified under Mermaid v11.16.1.";
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
    alt: "Index of the two workflow-v2 review diagrams.",
    family: FAMILY,
    generation_class: "workflow-diagram-index",
    feedback_round: "workflow-v2-diagrams",
    media_kind: "index",
    review_scope: "WORKFLOW-V2-DIAGRAMS",
    review_mode: "output",
    source_path: `izzi ${izziCommit} docs/workflows.md`,
    published_path: `review/media/${FAMILY}/${ARTIFACT_ID}.index.html`,
    sha256: sha256(indexBytes),
    bytes: indexBytes.length,
    format: "html",
    generation_commit: izziCommit,
    generation_state: "CURRENT",
    index_members: members.map((member) => member.artifact_id),
    technical_state: "WORKFLOW-DIAGRAM-INDEX",
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
    status: "PUBLISHED",
    artifact_id: ARTIFACT_ID,
    izzi_commit: izziCommit,
    member_count: members.length,
    review_url: `https://situationshipin.space/review/${ARTIFACT_ID}/`,
  }, null, 2));
}

await main();
