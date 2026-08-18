#!/usr/bin/env node
import { renderReviewPage, renderReviewManifest } from "./review-page.mjs";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(new URL("..", import.meta.url).pathname);
const catalogPath = join(root, "data/review-items.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const proxy = "review/media/here-lies-trouble/here-lies-trouble-episode-01-frogtown.v2.audio-canary.review.mp4";
const proxyBytes = await readFile(join(root, proxy));
const proxyHash = createHash("sha256").update(proxyBytes).digest("hex");
const source = {
  path: "outputs/review/feedback/visual/here-lies-trouble/neon-addict-stage-01/episode-01-local-trial/here-lies-trouble-episode-01-frogtown.v2.audio-canary.mkv",
  sha256: "65919a746572475fb7b96621cbc858887da5ac9248a47f474a960ec08e000b61",
  bytes: 76513965, duration_seconds: 168, width: 720, height: 1280,
  codec: "h264/flac", frame_rate: "30/1", published: false
};
const hltId = "here-lies-trouble-episode-01-frogtown-v2-audio-canary-65919a746572";
const hlt = {
  artifact_id: hltId,
  title: "Here Lies Trouble — Episode 1 — Frogtown v2 audio canary",
  description: "Full-episode local motion and cleaned stereo-audio review proxy. Review walking motion, animal conversation, Frogtown environmental texture, and the natural river ambience.",
  alt: "Vertical animated Frogtown episode review proxy with four animal characters exploring a river setting.",
  family: "here-lies-trouble", generation_class: "episode-local-trial", feedback_round: "neon-addict-stage-01-v2",
  media_kind: "video", review_scope: "LOCAL-FULL-EPISODE-CANARY", review_mode: "output",
  source_path: source.path, source_media: source,
  published_path: proxy, sha256: proxyHash, bytes: proxyBytes.length, width: 360, height: 640,
  duration_seconds: 168, technical_state: "BROWSER-PROXY-RENDERED-FROM-CANONICAL-MKV",
  human_review_state: "UNREVIEWED", baseline_state: "NOT-PROMOTED", review_category: "proofs",
  style: "randoma11y-accent", style_pair: { foreground: "#581c87", background: "#faf5ff", date: "2026-08-11", contrast_ratio: 10.135063065476164 }
};
hlt.added_at = new Date().toISOString();
catalog.items = catalog.items.filter(item => item.artifact_id !== hltId);
catalog.items.push(hlt);
catalog.items.sort((left, right) =>
  String(right.added_at || "").localeCompare(String(left.added_at || ""))
);
catalog.generated_at = new Date().toISOString();
await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n");


for (const item of catalog.items) {
  const id = item.artifact_id.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const dir = join(root, "review", id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "index.html"),
    renderReviewPage(item, catalog.source_repository_local_root)
  );
  await writeFile(join(dir, "manifest.json"), renderReviewManifest(item));
}
console.log(JSON.stringify({ artifact_count: catalog.items.length, hlt_review_url: `https://situationshipin.space/review/${hltId}/`, proxy_sha256: proxyHash }));
