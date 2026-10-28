#!/usr/bin/env node
// Publish the three source-bound diagrams and their editable downloads.
// Usage: node scripts/publish-workflow-diagrams.mjs \
//   --izzi-commit <40-hex> --diagrams-dir <render-workflow-diagrams.py packet>

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FAMILY = "workflow-v2-diagrams";
const INDEX_ID = "workflow-v2-diagram-index";
const MEDIA = `review/media/${FAMILY}`;
const MEMBERS = [
  {
    name: "workflow-hardware-software-diagram",
    title: "Compute software",
    description: "A grayscale map with devp.ac and situationshipin.space aligned across the center. Custom Software contains FFmpeg / Inkscape / Ghostscript, Cartofreako, Izzi and Clusterops. Local Database contains Ipinfo between Custom Software and Local AI's media models, DeepSeek V4 Flash and Ornith 1.5. Hosted AI groups Motion generation, Image generation and Coding. Local connections are solid; hosted connections are dotted.",
  },
  {
    name: "devpac-compute-resources-diagram",
    title: "Compute hardware — rizal, ord and eureka",
    description: "Three grayscale rectangular Fedora 44 host boxes arranged in a triangle: rizal above eureka and ord. Each host lists its hardware and local model paths; Gold 20TB cold storage sits below the workers, connected to their horizontal USB4/Thunderbolt local link. Revised for issue #79.",
  },
  {
    name: "workflow-v2-loop-diagram",
    title: "Workflow",
    description: "PLAN, PRODUCE and REVISE share one horizontal row of gray boxes. The stage 1, stage 2, pilot and release arrows return beneath PRODUCE into the bottom of PLAN. Revised for issue #78.",
  },
];
const TITLE = "Workflow diagrams, hardware & local models";
const DESCRIPTION = "Three updated diagrams for the current Izzi workflow, including DeepSeek V4 Flash and Ornith 1.5 on eureka. Inventory: October 27, 2026.";
const CSS = `
.review-page .review-hero h1{font-size:clamp(2rem,4vw,3.5rem);line-height:1.08;letter-spacing:-.035em;max-width:none}
.review-page .review-media>h2,.review-page #feedback-title{font-size:1.6rem;letter-spacing:-.025em}
.workflow-index{font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.55;min-width:0;color:#172d40}
.workflow-index h2{font-size:1.45rem;margin:0 0 .6rem}.workflow-index p{margin:.5rem 0 1rem}
.workflow-index a,.workflow-downloads a{color:#173a55;text-underline-offset:.15em}
.workflow-index a:focus-visible,.workflow-downloads a:focus-visible{outline:3px solid #bd6428;outline-offset:3px}
.workflow-intro{padding:1rem 1.2rem;background:#e5f2ec;border-left:4px solid #286047;margin-bottom:1.4rem}
.workflow-index code{overflow-wrap:anywhere}.workflow-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1.2rem;list-style:none;margin:0;padding:0}
.workflow-card{padding:1rem;border:1px solid #adbcc8;border-radius:.35rem;background:#fff;min-width:0}
.workflow-card h3{font-size:1.1rem;margin:0 0 .6rem}.workflow-card p{font-size:.95rem}
.workflow-card .workflow-preview{display:flex;align-items:center;justify-content:center;background:#fff;height:19rem;border:1px solid #e0e6eb;margin:.8rem 0}
.workflow-card .workflow-preview img{display:block;width:100%;height:100%;max-height:none;object-fit:contain}
.workflow-links,.workflow-downloads{display:flex;flex-wrap:wrap;gap:.35rem 1rem;margin:1rem 0}
.workflow-links a,.workflow-downloads a{display:inline-block;padding:.35rem 0;font-weight:600}
.workflow-source{font-size:.85rem;overflow-wrap:anywhere;margin-top:1.5rem}
@media(max-width:760px){.workflow-cards{grid-template-columns:1fr}.workflow-card .workflow-preview{height:17rem}.workflow-intro{padding:.8rem}}
`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const escape = (value) => String(value ?? "").replace(/[&<>"]/g,
  (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

function argumentsMap(argv) {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!/^--(?:izzi-commit|izzi-root|diagrams-dir)$/.test(argv[i]) || !argv[i + 1]) {
      throw new Error("Expected --izzi-commit <40-hex> --diagrams-dir <render-packet>");
    }
    values[argv[i].slice(2)] = argv[i + 1];
  }
  return values;
}

function links(spec) {
  return `<nav class="workflow-links" aria-label="${escape(spec.title)} downloads">
<a href="/${MEDIA}/${spec.name}.svg" target="_blank" rel="noopener">Open SVG ↗</a>
<a href="/${MEDIA}/${spec.name}.png" download>PNG</a>
<a href="/${MEDIA}/${spec.name}.mermaid.txt" download="${spec.name}.mmd">Mermaid source</a>
<a href="/${MEDIA}/${spec.name}.config.json">Configuration</a>
<a href="/review/${spec.name}/">Review</a></nav>`;
}

function indexContent(commit) {
  const source = `https://github.com/bdekoz/izzi/blob/${commit}/docs/workflows.md`;
  return `<h2>Current hardware and local models</h2>
<div class="workflow-intro"><p><strong>Both new LLMs are on eureka.</strong> DeepSeek V4 Flash uses the ROCm <code>ds4</code> runner; Ornith 1.5 is installed as <code>ornith-1.5:35b</code> in Ollama. They share one 96 GiB GPU allocation.</p>
<p>DeepSeek’s saved October 21 inference and API trials passed. Its server is on demand and was not listening at inventory time; Ollama was listening. The diagrams show available local authoring choices. Model installation does not add automatic workflow routing.</p></div>
<ul class="workflow-cards">${MEMBERS.map((spec) => `<li class="workflow-card">
<h3><a href="/review/${spec.name}/">${escape(spec.title)}</a></h3>
<p>${escape(spec.description)}</p>
<a class="workflow-preview" href="/${MEDIA}/${spec.name}.svg" target="_blank" rel="noopener" aria-label="Open ${escape(spec.title)} as a zoomable SVG"><img src="/${MEDIA}/${spec.name}.png" alt="${escape(spec.description)}" loading="lazy" decoding="async"></a>
${links(spec)}</li>`).join("\n")}</ul>
<p class="workflow-source"><a href="${source}">Editable source: docs/workflows.md</a> · <a href="https://github.com/bdekoz/izzi/blob/${commit}/scripts/render-workflow-diagrams.py">Diagram renderer</a> · <a href="/${MEDIA}/local-model-inventory.20261027.json">Model and hardware inventory</a> · <a href="/${MEDIA}/render-manifest.json">Render receipt</a><br>Source commit: <code>${commit}</code>. The compute software, compute triangle and workflow loop use explicit SVG layouts. Updated diagrams await human review.</p>`;
}

function indexHtml(commit) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="description" content="${escape(DESCRIPTION)}"><title>${TITLE} — situationshipin.space</title><style>body{margin:0;background:#fcfbf7}main{max-width:80rem;margin:auto;padding:2rem 1rem 4rem}h1{font-size:2rem}${CSS}</style></head><body><main class="workflow-index"><p><a href="/">← Review catalog</a> · <a href="/review/${INDEX_ID}/">Review this diagram set</a></p><h1>${TITLE}</h1><p>${DESCRIPTION}</p>${indexContent(commit)}</main></body></html>\n`;
}

function reviewPage(item, commit) {
  let html = renderReviewPage(item).replace("</head>", `<style>${CSS}</style></head>`);
  if (item.artifact_id === INDEX_ID) {
    html = html.replace(/<iframe\b[^>]*><\/iframe>/, `<div class="workflow-index">${indexContent(commit)}</div>`)
      .replace("Open the generation index ↗", "Open diagrams in a full page ↗");
  } else {
    const spec = MEMBERS.find((member) => member.name === item.artifact_id);
    html = html.replace('<p class="meta">', `${links(spec)}<p><a href="/review/${INDEX_ID}/">All workflow diagrams</a> · <a href="https://github.com/bdekoz/izzi/blob/${commit}/docs/workflows.md">Editable documentation</a></p><p class="meta">`)
      .replace("Motion and audio notes", "Diagram notes");
  }
  return html;
}

async function main() {
  const values = argumentsMap(process.argv.slice(2));
  const commit = values["izzi-commit"];
  if (!/^[0-9a-f]{40}$/.test(commit || "") || !values["diagrams-dir"]) {
    throw new Error("Expected --izzi-commit <40-hex> --diagrams-dir <render-packet>");
  }
  const packet = resolve(values["diagrams-dir"]);
  const manifestBytes = await readFile(join(packet, "manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  const izziRoot = values["izzi-root"] ? resolve(values["izzi-root"]) : resolve(packet, "../../..");
  if (manifest.source.path !== "docs/workflows.md"
      || sha256(execFileSync("git", ["-C", izziRoot, "show", `${commit}:docs/workflows.md`])) !== manifest.source.sha256
      || sha256(execFileSync("git", ["-C", izziRoot, "show", `${commit}:resources.static/workflows/${manifest.inventory.path}`])) !== manifest.inventory.sha256) {
    throw new Error("The committed Izzi source or model inventory does not match this render packet");
  }
  if (manifest.schema_version !== "izzi-workflow-diagram-render-1"
      || manifest.renderer.mermaid !== "11.16.1" || manifest.renderer.mermaid_cli !== "11.16.0"
      || manifest.diagrams.map((diagram) => diagram.artifact_id).join() !== MEMBERS.map((spec) => spec.name).join()) {
    throw new Error("Unexpected diagram render packet");
  }
  // Verify the entire packet before writing any publication files.
  const verified = new Map();
  for (const receipt of [manifest.inventory, manifest.render_config, ...manifest.diagrams.flatMap((diagram) => [diagram.render_config, ...diagram.files])]) {
    if (!receipt.path || receipt.path !== receipt.path.split(/[\\/]/).pop()) throw new Error("Unsafe packet path");
    const bytes = await readFile(join(packet, receipt.path));
    if (bytes.length !== receipt.bytes || sha256(bytes) !== receipt.sha256) throw new Error(`Packet mismatch: ${receipt.path}`);
    verified.set(receipt.path, bytes);
  }
  for (const spec of MEMBERS) {
    for (const suffix of ["png", "svg", "mmd"]) {
      if (!verified.has(`${spec.name}.${suffix}`)) throw new Error(`Missing ${spec.name}.${suffix}`);
    }
  }
  const catalogPath = join(ROOT, "data/review-items.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const addedAt = new Date().toISOString();
  await mkdir(join(ROOT, MEDIA), { recursive: true });
  async function publish(name, bytes) {
    const path = `${MEDIA}/${name}`;
    await writeFile(join(ROOT, path), bytes);
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  }
  const common = {
    family: FAMILY, feedback_round: "workflow-v2-diagrams", review_scope: "WORKFLOW-V2-DIAGRAMS",
    review_mode: "output", source_path: `izzi ${commit} docs/workflows.md`, source_sha256: manifest.source.sha256,
    generation_commit: commit, generation_state: "CURRENT", human_review_state: "UNREVIEWED",
    baseline_state: "NOT-PROMOTED", review_category: "proofs", added_at: addedAt,
  };
  const updated = [];
  for (const spec of MEMBERS) {
    const png = verified.get(`${spec.name}.png`);
    const diagram = manifest.diagrams.find((entry) => entry.artifact_id === spec.name);
    if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Invalid PNG");
    const primary = await publish(`${spec.name}.png`, png);
    const svg = await publish(`${spec.name}.svg`, verified.get(`${spec.name}.svg`));
    const source = await publish(`${spec.name}.mermaid.txt`, verified.get(`${spec.name}.mmd`));
    const config = await publish(`${spec.name}.config.json`, verified.get(`${spec.name}.config.json`));
    updated.push({
      ...common, artifact_id: spec.name, title: spec.title, description: spec.description, alt: spec.description,
      generation_class: "workflow-diagram", media_kind: "image", published_path: primary.path,
      sha256: primary.sha256, bytes: primary.bytes, width: png.readUInt32BE(16), height: png.readUInt32BE(20),
      format: "png", technical_state: diagram.renderer === "izzi-fixed-svg-1" ? "RENDER-VERIFIED-FIXED-SVG-1" : "RENDER-VERIFIED-MERMAID-11.16.1", review_assets: [svg, source, config],
    });
  }
  const inventory = await publish(manifest.inventory.path, verified.get(manifest.inventory.path));
  const renderConfig = await publish(manifest.render_config.path, verified.get(manifest.render_config.path));
  const renderReceipt = await publish("render-manifest.json", manifestBytes);
  const index = await publish(`${INDEX_ID}.index.html`, Buffer.from(indexHtml(commit)));
  updated.push({
    ...common, artifact_id: INDEX_ID, title: TITLE, description: DESCRIPTION,
    alt: "Three diagrams: Compute software, compute hardware and Workflow.",
    generation_class: "workflow-diagram-index", media_kind: "index", published_path: index.path,
    sha256: index.sha256, bytes: index.bytes, format: "html", technical_state: "WORKFLOW-DIAGRAM-INDEX",
    index_members: MEMBERS.map((spec) => spec.name), review_assets: [inventory, renderConfig, renderReceipt],
  });
  for (const item of updated) {
    const directory = join(ROOT, "review", item.artifact_id);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "index.html"), reviewPage(item, commit));
    await writeFile(join(directory, "manifest.json"), renderReviewManifest(item));
  }
  // Replace current family members and drop retired ones; retain unrelated items and their order.
  const replacements = new Map(updated.map((item) => [item.artifact_id, item]));
  catalog.items = catalog.items.filter((item) => item.family !== FAMILY || replacements.has(item.artifact_id)).map((item) => {
    const replacement = replacements.get(item.artifact_id);
    replacements.delete(item.artifact_id);
    return replacement || item;
  });
  catalog.items.push(...replacements.values());
  catalog.generated_at = addedAt;
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
  console.log(JSON.stringify({status: "PREPARED", izzi_commit: commit, member_count: MEMBERS.length,
    review_url: `https://situationshipin.space/review/${INDEX_ID}/`}, null, 2));
}

await main();
