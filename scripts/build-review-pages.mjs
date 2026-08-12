#!/usr/bin/env node
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
catalog.items = catalog.items.filter(item => item.artifact_id !== hltId);
catalog.items.push(hlt);
catalog.generated_at = new Date().toISOString();
await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n");

const escape = value => String(value ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;"}[c]));
const page = item => {
  const reviewId = JSON.stringify(item.artifact_id);
  const proxySha = JSON.stringify(item.sha256);
  const sourceSha = JSON.stringify(item.source_media?.sha256 || item.sha256);
  const media =
    item.media_kind === "video"
      ? `<video controls preload="metadata" src="/${escape(item.published_path)}"><p>Your browser cannot play this proxy. <a href="/${escape(item.published_path)}">Download it</a>.</p></video>`
      : `<img src="/${escape(item.published_path)}" alt="${escape(item.alt)}">`;
  const reviewScript = `<script>
(function () {
  const reviewId = ${reviewId};
  const proxySha = ${proxySha};
  const sourceSha = ${sourceSha};
  const reviewUrl = location.href;
  const repo = "bdekoz/situationshipin.space";
  const form = document.getElementById("review-form");
  const status = document.getElementById("review-status");
  const decision = form.elements.decision;
  const note = form.elements.note;
  const key = "review:" + reviewId;
  function saved() {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (error) { return null; }
  }
  function packageReview() {
    const previous = saved() || {};
    return {
      schema_version: "izzi-web-review-1",
      review_id: reviewId,
      review_url: reviewUrl,
      decision: decision.value,
      note: note.value,
      proxy_sha256: proxySha,
      source_sha256: sourceSha,
      saved_at: previous.saved_at || null,
      at: new Date().toISOString()
    };
  }
  function saveNow() {
    const record = packageReview();
    record.saved_at = record.at;
    localStorage.setItem(key, JSON.stringify(record));
    status.textContent = "Saved locally in this browser. " + new Date(record.at).toLocaleString();
  }
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    saveNow();
  });
  document.getElementById("review-download").addEventListener("click", function () {
    saveNow();
    const record = packageReview();
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = reviewId + ".review.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    status.textContent = "Downloaded review JSON.";
  });
  document.getElementById("review-issue").addEventListener("click", function () {
    saveNow();
    const record = packageReview();
    const body = [
      "## Review package",
      "",
      "- **Review ID:** " + record.review_id,
      "- **Review URL:** " + record.review_url,
      "- **Decision:** " + record.decision,
      "- **Notes:**",
      "",
      record.note || "_no notes_",
      "",
      "- **Proxy SHA-256:** " + record.proxy_sha256,
      "- **Source SHA-256:** " + record.source_sha256,
      "- **Saved at:** " + record.saved_at
    ].join("\\n");
    const url =
      "https://github.com/" + repo + "/issues/new?title=" +
      encodeURIComponent("Review: ${escape(item.title)}") +
      "&body=" + encodeURIComponent(body);
    window.open(url, "_blank", "noopener");
  });
  document.getElementById("review-clear").addEventListener("click", function () {
    localStorage.removeItem(key);
    decision.value = "UNREVIEWED";
    note.value = "";
    status.textContent = "Cleared local review.";
  });
  const previous = saved();
  if (previous && typeof previous === "object") {
    if (previous.decision) decision.value = previous.decision;
    if (previous.note) note.value = previous.note;
    status.textContent = "Restored previously saved review.";
  }
})();
</script>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="description" content="${escape(item.title)} review page"><title>${escape(item.title)} — situationshipin.space</title><link rel="stylesheet" href="../../../../assets/css/review.css"><style>body{background:#fcfbf7;color:#14171a} .review-page{max-width:72rem;margin:auto;padding:2rem 1rem 5rem}.review-hero{border-left:.55rem solid #173a55;padding:1rem 1.25rem;background:#eef1f2}.review-media{margin:2rem 0;padding:1rem;background:#f5f6f4;border:1px solid #9da8af}.review-media img,.review-media video{display:block;max-width:100%;max-height:72vh;margin:auto}.review-form{display:grid;gap:1rem;max-width:48rem}.review-form textarea,.review-form select,.review-form button{min-height:3rem;padding:.7rem;font:inherit}.review-form textarea,.review-form select{border:2px solid #4d565d;background:#fff;color:#14171a}.review-form button{width:max-content;background:#173a55;color:#fff;border:0;padding:.8rem 1.2rem;font-weight:700}.review-form .review-actions{display:flex;gap:.75rem;flex-wrap:wrap}.review-form button.secondary{background:#4d565d}.eyebrow{color:#173a55}.meta{font-family:ui-monospace,monospace;font-size:.85rem;overflow-wrap:anywhere}</style></head><body><main class="review-page"><p><a href="/">← Review catalog</a></p><div class="review-hero"><p class="eyebrow">${escape(item.style || "house-style")} · artifact review</p><h1>${escape(item.title)}</h1><p>${escape(item.description)}</p></div><section class="review-media" aria-labelledby="media-title"><h2 id="media-title">Review the artifact</h2>${media}<p class="meta">Review ID: ${escape(item.artifact_id)}<br>Proxy SHA-256: ${escape(item.sha256)}<br>Canonical source SHA-256: ${escape(item.source_media?.sha256 || item.sha256)}<br>Canonical source publication: ${item.source_media?.published === false ? "local only" : "published"}</p></section><section aria-labelledby="feedback-title"><h2 id="feedback-title">Human review</h2><form class="review-form" id="review-form"><label>Decision<select name="decision"><option>UNREVIEWED</option><option>KEEP</option><option>KEEP-PARTS</option><option>REVISE</option><option>REJECT</option><option>DISCUSS</option></select></label><label>Motion and audio notes<textarea name="note" rows="7" placeholder="What should change, or what should be kept?"></textarea></label><div class="review-actions"><button type="submit">Save local review</button><button type="button" id="review-download">Download review JSON</button><button type="button" id="review-issue">Open GitHub issue draft</button><button type="button" id="review-clear" class="secondary">Clear saved review</button></div><output id="review-status" role="status"></output></form>${reviewScript}</section></main></body></html>`;
};
for (const item of catalog.items) {
  const id = item.artifact_id.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const dir = join(root, "review", id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "index.html"), page(item));
  await writeFile(join(dir, "manifest.json"), JSON.stringify({ schema_version: "situationship-review-page-1", review_id: id, artifact_id: item.artifact_id, style: item.style || "house-style", source_media: item.source_media || null, proxy: item.media_kind === "video" ? { path: "/" + item.published_path, sha256: item.sha256 } : null }, null, 2) + "\n");
}
console.log(JSON.stringify({ artifact_count: catalog.items.length, hlt_review_url: `https://situationshipin.space/review/${hltId}/`, proxy_sha256: proxyHash }));
