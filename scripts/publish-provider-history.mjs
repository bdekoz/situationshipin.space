#!/usr/bin/env node
// Publish the three selected August trials from the verified local archive.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({ options: {
  approve: { type: "string" }, "izzi-root": { type: "string" }, "proxy-dir": { type: "string" }
}});
if (values.approve !== "PROJECT-APPROVED" || !values["izzi-root"] || !values["proxy-dir"]) {
  throw new Error("Usage: node scripts/publish-provider-history.mjs --approve PROJECT-APPROVED --izzi-root DIR --proxy-dir DIR");
}
const izzi = resolve(values["izzi-root"]), proxyDir = resolve(values["proxy-dir"]);
const archivePath = "resources.static/here-lies-trouble/provider-input-archive.20261027.json";
const archive = JSON.parse(await readFile(resolve(izzi, archivePath), "utf8"));
const proxies = archive.review_derivatives;
if (!Array.isArray(proxies)) throw new Error("The archive receipt lacks selected review derivatives");
const catalogPath = resolve(root, "data/review-items.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const family = "here-lies-trouble-provider-archive";
const specs = [
  ["griffith-j1", "hlt-archive-20260816-griffith-j1", "Griffith Park — first canary", "August 16 historical motion trial, with the original local changed-voice mux. Full clip retained in a compact 270×480 review copy."],
  ["griffith-j2", "hlt-archive-20260816-griffith-j2", "Griffith Park — second canary", "August 16 historical continuation trial, with the original local changed-voice mux. Full clip retained in a compact 270×480 review copy."],
  ["runyon-30s", "hlt-archive-20260817-runyon-30s", "Runyon Canyon — 30-second trial", "August 17 historical two-job chain. The vendor-generated dialogue was rejected because it does not follow the source transcript. This review copy preserves that historical result; it is not an accepted episode master."]
];
const items = [], media = [];
for (const [name, id, title, description] of specs) {
  const proxy = proxies.find(p => p.name === name);
  const original = archive.files.find(f => f.archive_path === proxy?.source_path);
  if (!original) throw new Error(`No archived source for ${name}`);
  const source = await readFile(resolve(izzi, original.archive_path));
  const bytes = await readFile(resolve(proxyDir, `${name}.review.mp4`));
  if (source.length !== original.bytes || hash(source) !== original.sha256
      || proxy.source_sha256 !== original.sha256 || proxy.source_bytes !== original.bytes
      || bytes.length !== proxy.bytes || hash(bytes) !== proxy.sha256) {
    throw new Error(`Archive or proxy checksum changed: ${name}`);
  }
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", resolve(proxyDir, `${name}.review.mp4`)], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error(probe.stderr);
  const metadata = JSON.parse(probe.stdout), video = metadata.streams.find(s => s.codec_type === "video");
  if (video?.width !== proxy.width || video?.height !== proxy.height || video.codec_name !== "h264"
      || !metadata.streams.some(s => s.codec_type === "audio" && s.codec_name === "aac")
      || Math.abs(Number(metadata.format.duration) - proxy.duration_seconds) > 0.05) {
    throw new Error(`Proxy geometry, duration or codecs changed: ${name}`);
  }
  const item = {
    artifact_id: id, title, description, alt: description, family,
    generation_class: "historical-provider-trial", feedback_round: "archive-20261027",
    media_kind: "video", review_scope: "HISTORICAL-TRIAL-REVIEW", review_mode: "output",
    source_path: original.archive_path, published_path: `review/media/${family}/${id}.review.mp4`,
    sha256: proxy.sha256, bytes: proxy.bytes, width: proxy.width, height: proxy.height,
    duration_seconds: proxy.duration_seconds, technical_state: "ARCHIVED-TRIAL-REVIEW-PROXY",
    human_review_state: "UNREVIEWED", baseline_state: "NOT-PROMOTED", review_category: "proofs",
    source_media: { path: original.archive_path, sha256: original.sha256, bytes: original.bytes, published: false },
    review_publication: {
      decision: "APPROVED", scope: "EXISTING-ARTIFACT-REVIEW", approved_on: "2026-10-27",
      authority: "Explicit project-owner request", instruction: "ok, do 1-4",
      artifact_id: id, source_sha256: original.sha256, proxy_sha256: proxy.sha256,
      creative_acceptance: false, further_production_authorized: false
    }
  };
  items.push(item);
  media.push([item.published_path, bytes]);
}
const indexId = "hlt-provider-trials-archive-20260816-17";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Here Lies Trouble — historical provider trials</title><style>body{font:18px/1.6 system-ui,sans-serif;color:#222;background:#eee;margin:0}main{max-width:48rem;margin:auto;padding:1.5rem}article{padding:1rem 1.5rem;background:#fff;border:1px solid #ccc;margin:1rem 0}h1{line-height:1.2}h2{font-size:1.2rem}a{color:#333;text-decoration-thickness:2px}small{font-size:.85rem}</style></head><body><main><h1>Here Lies Trouble — historical provider trials</h1><p>Three complete clips from the August 16–17, 2026 trials remain available as compact review copies. The full-resolution originals and 15 other trial files are preserved in the local archive.</p>${items.map(item => `<article><h2><a href="/review/${item.artifact_id}/" target="_top">${item.title}</a></h2><p>${item.description}</p><small>${item.duration_seconds.toFixed(2)} seconds · ${Math.round(item.bytes / 1024)} KiB · H.264 / AAC</small></article>`).join("")}<p>The temporary provider-input URLs were retired on October 27, 2026. The <a href="/data/provider-staging.json" target="_top">archive receipts</a> record the former paths and original checksums.</p><p><a href="/review/here-lies-trouble-stage-4/" target="_top">Open the current Stage 4 review</a></p></main></body></html>\n`;
const indexBytes = Buffer.from(html);
items.push({
  artifact_id: indexId, title: "Here Lies Trouble — historical provider trials",
  description: "Preserved review copies of the Griffith Park canaries and Runyon Canyon 30-second trial, August 16–17, 2026.",
  alt: "Historical provider trial review index", family, generation_class: "historical-provider-trial-index",
  feedback_round: "archive-20261027", media_kind: "index", format: "html",
  review_scope: "HISTORICAL-TRIAL-REVIEW", review_mode: "output", source_path: archivePath,
  published_path: `review/media/${family}/index.html`, sha256: hash(indexBytes), bytes: indexBytes.length,
  width: 1200, height: 900, index_members: items.map(item => item.artifact_id),
  technical_state: "ARCHIVE-INDEX-VERIFIED", human_review_state: "UNREVIEWED",
  baseline_state: "NOT-PROMOTED", review_category: "proofs"
});
media.push([items.at(-1).published_path, indexBytes]);
const replacements = new Set(items.map(item => item.artifact_id));
// Include temporary inputs in the shared budget before writing anything.
const { bytes: stagingBytes, failures } = await (await import("./provider-staging.mjs")).inspectStaging(root);
if (failures.length) throw new Error(failures.join("\n"));
let payloadBytes = stagingBytes;
for (const item of [...catalog.items.filter(item => !replacements.has(item.artifact_id)), ...items]) {
  if (item.bytes > 16 * 1024 * 1024) throw new Error(`Oversized artifact: ${item.artifact_id}`);
  payloadBytes += item.bytes + (item.plan_pdf?.bytes || 0) + (item.review_assets || []).reduce((n, asset) => n + asset.bytes, 0);
  if (item.frame_manifest_path) {
    const frames = JSON.parse(await readFile(resolve(root, item.frame_manifest_path), "utf8"));
    payloadBytes += frames.frames.reduce((n, frame) => n + frame.bytes, 0);
  }
}
if (payloadBytes > 192 * 1024 * 1024) throw new Error("Historical review copies exceed the shared 192 MiB site budget");
for (const [path, bytes] of media) {
  await mkdir(dirname(resolve(root, path)), { recursive: true });
  await writeFile(resolve(root, path), bytes);
}
for (const item of items) {
  const prior = catalog.items.find(i => i.artifact_id === item.artifact_id);
  item.added_at = prior?.added_at || new Date().toISOString();
  const directory = resolve(root, "review", item.artifact_id);
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, "index.html"), renderReviewPage(item));
  await writeFile(resolve(directory, "manifest.json"), renderReviewManifest(item));
}
catalog.items = [...catalog.items.filter(item => !replacements.has(item.artifact_id)), ...items];
catalog.generated_at = new Date().toISOString();
await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
console.log(JSON.stringify({ published: items.map(item => item.artifact_id), artifact_payload_bytes: payloadBytes }));
