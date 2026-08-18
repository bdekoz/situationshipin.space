#!/usr/bin/env node
// Shared renderer for situationshipin.space artifact review pages and
// manifests. Used by build-review-pages.mjs and publish-video-proof.mjs so
// every review surface stays byte-identical in structure.

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );

function reviewScript(item) {
  const reviewId = JSON.stringify(item.artifact_id);
  const proxySha = JSON.stringify(item.sha256);
  const sourceSha = JSON.stringify(item.source_media?.sha256 || item.sha256);
  return `<script>
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
  function gridReview() {
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const name = localStorage.key(index);
        if (!name || !name.startsWith("situationship-review:")) continue;
        const parsed = JSON.parse(localStorage.getItem(name) || "null");
        const review = parsed && parsed.reviews ? parsed.reviews[reviewId] : null;
        if (review) return review;
      }
    } catch (error) { /* ignore unreadable stores */ }
    return null;
  }
  const pageDecisions = ["KEEP", "KEEP-PARTS", "REVISE", "REJECT", "DISCUSS"];
  function packageReview() {
    const previous = saved() || {};
    const grid = gridReview() || {};
    const gridNote = typeof grid.note === "string" ? grid.note : "";
    const mergedNote = note.value.trim() ? note.value : gridNote;
    const mergedDecision = decision.value !== "UNREVIEWED"
      ? decision.value
      : (pageDecisions.includes(grid.decision) ? grid.decision : decision.value);
    return {
      schema_version: "izzi-web-review-1",
      review_id: reviewId,
      review_url: reviewUrl,
      decision: mergedDecision,
      note: mergedNote,
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
  } else {
    const grid = gridReview() || {};
    const gridNote = typeof grid.note === "string" ? grid.note : "";
    if (pageDecisions.includes(grid.decision)) decision.value = grid.decision;
    if (gridNote) note.value = gridNote;
    if (grid.decision || gridNote) {
      status.textContent = "Restored review comments from the situationshipin.space catalog grid.";
    }
  }
})();
</script>`;
}

function localFullResolutionPath(item, localRoot) {
  if (item.media_kind !== "video" && item.media_kind !== "video-filmstrip") {
    return null;
  }
  const raw = item.source_media?.path || item.source_path || "";
  if (!raw) return null;
  let path = raw;
  const prefixed = /^izzi [0-9a-f]{7,40} (.+)$/.exec(path);
  if (prefixed) path = prefixed[1];
  if (path.startsWith("/")) return path;
  if (!localRoot) return null;
  return `${String(localRoot).replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function renderReviewPage(item, localRoot = "") {
  const media =
    item.media_kind === "video"
      ? `<video controls preload="metadata" src="/${escape(item.published_path)}"><p>Your browser cannot play this proxy. <a href="/${escape(item.published_path)}">Download it</a>.</p></video>`
      : item.media_kind === "audio"
        ? `<audio controls preload="metadata" src="/${escape(item.published_path)}"><p>Your browser cannot play this audio. <a href="/${escape(item.published_path)}">Download it</a>.</p></audio>`
      : item.media_kind === "plan"
        ? planMedia(item)
      : item.media_kind === "index"
        ? indexMedia(item)
      : `<img src="/${escape(item.published_path)}" alt="${escape(item.alt)}">`;
  const planMeta = item.media_kind === "plan"
    ? `Review ID: ${escape(item.artifact_id)}<br>Document SHA-256: ${escape(item.sha256)}<br>Plan stage: ${escape(item.plan_stage || "PLAN-DRAFT")}<br>Canonical source: ${escape(item.source_path || "not supplied")}`
    : item.media_kind === "index"
      ? `Review ID: ${escape(item.artifact_id)}<br>Index SHA-256: ${escape(item.sha256)}<br>Index members: ${escape(String(item.index_members?.length || 0))}<br>Generation commit: ${escape(item.generation_commit || "not supplied")}`
      : `Review ID: ${escape(item.artifact_id)}<br>Proxy SHA-256: ${escape(item.sha256)}<br>Canonical source SHA-256: ${escape(item.source_media?.sha256 || item.sha256)}<br>Canonical source publication: ${item.source_media?.published === false ? "local only" : "published"}`;
  const fullResPath = localFullResolutionPath(item, localRoot);
  const fullResMeta = fullResPath
    ? `<br>Full-resolution local file: <a href="${encodeURI(`file://${fullResPath}`)}">${escape(fullResPath)}</a>`
    : "";
  const noteLabel = item.media_kind === "plan"
    ? "Plan notes"
    : item.media_kind === "index"
      ? "Index notes"
      : "Motion and audio notes";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="description" content="${escape(item.title)} review page"><title>${escape(item.title)} — situationshipin.space</title><link rel="stylesheet" href="../../../../assets/css/review.css"><style>body{background:#fcfbf7;color:#14171a} .review-page{max-width:72rem;margin:auto;padding:2rem 1rem 5rem}.review-hero{border-left:.55rem solid #173a55;padding:1rem 1.25rem;background:#eef1f2}.review-media{margin:2rem 0;padding:1rem;background:#f5f6f4;border:1px solid #9da8af}.review-media img,.review-media video{display:block;max-width:100%;max-height:72vh;margin:auto}.review-media audio{display:block;width:100%;max-width:36rem;margin:1rem auto}.review-media object,.review-media iframe{display:block;width:100%;min-height:70vh;border:1px solid #9da8af;background:#fff}.review-media .plan-document-link{display:inline-block;font-weight:700;color:#173a55;padding:.7rem 1rem;border:2px solid #173a55;background:#fff;text-decoration:none}.review-form{display:grid;gap:1rem;max-width:48rem}.review-form textarea,.review-form select,.review-form button{min-height:3rem;padding:.7rem;font:inherit}.review-form textarea,.review-form select{border:2px solid #4d565d;background:#fff;color:#14171a}.review-form button{width:max-content;background:#173a55;color:#fff;border:0;padding:.8rem 1.2rem;font-weight:700}.review-form .review-actions{display:flex;gap:.75rem;flex-wrap:wrap}.review-form button.secondary{background:#4d565d}.eyebrow{color:#173a55}.meta{font-family:ui-monospace,monospace;font-size:.85rem;overflow-wrap:anywhere}</style></head><body><main class="review-page"><p><a href="/">← Review catalog</a></p><div class="review-hero"><p class="eyebrow">${escape(item.style || "house-style")} · ${item.media_kind === "plan" ? "plan review" : item.media_kind === "index" ? (item.generation_class === "voice-bank-index" ? "voice bank index" : "generation index") : "artifact review"}</p><h1>${escape(item.title)}</h1><p>${escape(item.description)}</p></div><section class="review-media" aria-labelledby="media-title"><h2 id="media-title">Review the artifact</h2>${media}<p class="meta">${planMeta}${fullResMeta}</p></section><section aria-labelledby="feedback-title"><h2 id="feedback-title">Human review</h2><form class="review-form" id="review-form"><label>Decision<select name="decision"><option>UNREVIEWED</option><option>KEEP</option><option>KEEP-PARTS</option><option>REVISE</option><option>REJECT</option><option>DISCUSS</option></select></label><label>${noteLabel}<textarea name="note" rows="7" placeholder="What should change, or what should be kept?"></textarea></label><div class="review-actions"><button type="submit">Save local review</button><button type="button" id="review-download">Download review JSON</button><button type="button" id="review-issue">Open GitHub issue draft</button><button type="button" id="review-clear" class="secondary">Clear saved review</button></div><output id="review-status" role="status"></output></form>${reviewScript(item)}</section></main></body></html>`;
}

function planMedia(item) {
  const href = `/${escape(item.published_path)}`;
  const pdf = item.plan_pdf ? `/${escape(item.plan_pdf.path)}` : null;
  const links = [`<a class="plan-document-link" href="${href}" target="_blank" rel="noopener">Open the plan document ↗</a>`];
  if (pdf) {
    links.push(`<a class="plan-document-link" href="${pdf}" target="_blank" rel="noopener">Open the special-topics PDF ↗</a>`);
  }
  const preview = /\.pdf$/i.test(item.published_path)
    ? `<object data="${href}" type="application/pdf" aria-label="Plan document preview"><p>PDF preview unavailable in this browser. Use the link above.</p></object>`
    : "";
  return `<p>${links.join(" ")}</p>${preview}`;
}

function indexMedia(item) {
  const href = `/${escape(item.published_path)}`;
  const label =
    item.generation_class === "voice-bank-index"
      ? "voice bank"
      : "generation";
  return [
    `<p><a class="plan-document-link" href="${href}" target="_blank" rel="noopener">Open the ${label} index ↗</a></p>`,
    `<iframe src="${href}" title="${escape(item.title)} ${label} index" aria-label="${escape(item.title)} ${label} index"></iframe>`,
  ].join("");
}

export function renderReviewManifest(item) {
  const id = item.artifact_id.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return JSON.stringify(
    {
      schema_version: "situationship-review-page-1",
      review_id: id,
      artifact_id: item.artifact_id,
      style: item.style || "house-style",
      source_media: item.source_media || null,
      proxy:
        item.media_kind === "video" || item.media_kind === "audio"
          ? { path: "/" + item.published_path, sha256: item.sha256 }
          : null,
      document:
        item.media_kind === "plan" || item.media_kind === "index"
          ? {
              path: "/" + item.published_path,
              sha256: item.sha256,
              format: item.media_kind === "index" ? "html" : item.format || "markdown",
              plan_stage: item.plan_stage || null,
              plan_pdf: item.plan_pdf
                ? { path: "/" + item.plan_pdf.path, sha256: item.plan_pdf.sha256, format: "pdf" }
                : null,
            }
          : null,
    },
    null,
    2
  ) + "\n";
}
