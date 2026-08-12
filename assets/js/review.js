"use strict";

const CATALOG_URL = "data/review-items.json";
const ISSUE_URL = "https://github.com/bdekoz/situationshipin.space/issues/new";
const OUTPUT_DECISIONS = [
  ["KEEP", "Keep"],
  ["KEEP-PARTS", "Keep parts"],
  ["MORE-LIKE", "More like this"],
  ["REVISE", "Revise"],
  ["REJECT", "Reject"],
  ["DISCUSS", "Discuss"]
];
const AESTHETIC_DECISIONS = [
  ["POSITIVE", "Accept"],
  ["NEGATIVE", "Reject"],
  ["HOLD", "Hold"],
  ["EXCLUDE", "Exclude"]
];
const TAGS = [
  ["composition", "Composition"],
  ["color", "Color"],
  ["texture", "Texture"],
  ["lighting", "Lighting"],
  ["spatial-form", "Spatial form"],
  ["atmosphere", "Atmosphere"],
  ["subject", "Subject"],
  ["motion", "Motion"],
  ["typography", "Typography"],
  ["legibility", "Legibility"],
  ["accessibility", "Accessibility"],
  ["provenance", "Provenance"],
  ["technical-defect", "Technical defect"]
];

const state = {
  catalog: null,
  feedback: { reviewer: "", reviews: {} },
  storageAvailable: true,
  category: "proofs",
  page: 1,
  pageSize: 10
};

const elements = {};

document.addEventListener("DOMContentLoaded", initialize);

async function initialize() {
  cacheElements();
  bindGlobalEvents();
  testStorage();

  try {
    const response = await fetch(CATALOG_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Catalog request returned HTTP ${response.status}.`);
    }
    const catalog = await response.json();
    validateCatalog(catalog);
    await hydrateFrameManifests(catalog);
    state.catalog = catalog;
    loadFeedback();
    populateFilters();
    updateMetrics();
    const initialCategory = document.body.dataset.reviewCategory;
    if (initialCategory === "proofs" || initialCategory === "style-processing") {
      setCategory(initialCategory);
    } else {
      renderCatalog();
    }
    elements.grid.setAttribute("aria-busy", "false");
  } catch (error) {
    elements.grid.setAttribute("aria-busy", "false");
    showCatalogError(error instanceof Error ? error.message : String(error));
  }
}

function cacheElements() {
  const ids = [
    "artifact-grid", "artifact-template", "catalog-error", "empty-state",
    "result-count", "filter-form", "search-filter", "family-filter",
    "class-filter", "decision-filter", "hide-images", "storage-status",
    "metric-items", "metric-families", "metric-bytes", "metric-reviewed",
    "feedback-count", "reviewer-label", "download-feedback", "import-feedback",
    "open-issue-dialog", "reset-feedback", "handoff-status", "issue-dialog",
    "public-acknowledgement", "continue-to-github", "reset-dialog", "confirm-reset",
    "previous-page", "next-page", "page-status", "category-proofs",
    "category-style-processing", "category-proofs-count",
    "category-style-processing-count", "results-eyebrow", "results-title",
    "results-description", "issue-scope-description"
  ];
  ids.forEach((id) => {
    elements[toCamel(id)] = document.getElementById(id);
  });
  elements.grid = elements.artifactGrid;
  elements.template = elements.artifactTemplate;
}

function bindGlobalEvents() {
  elements.filterForm.addEventListener("input", () => {
    state.page = 1;
    renderCatalog();
  });
  elements.filterForm.addEventListener("reset", () => {
    window.setTimeout(() => {
      document.body.classList.remove("compact-view");
      state.page = 1;
      renderCatalog();
    }, 0);
  });
  elements.hideImages.addEventListener("change", () => {
    document.body.classList.toggle("compact-view", elements.hideImages.checked);
  });
  elements.reviewerLabel.addEventListener("input", () => {
    state.feedback.reviewer = elements.reviewerLabel.value;
    saveFeedback("Reviewer label saved locally.");
    updateFeedbackSummary();
  });
  elements.downloadFeedback.addEventListener("click", downloadFeedback);
  elements.importFeedback.addEventListener("change", importFeedback);
  elements.openIssueDialog.addEventListener("click", () => {
    elements.publicAcknowledgement.checked = false;
    elements.continueToGithub.disabled = true;
    elements.issueScopeDescription.textContent = state.category === "style-processing"
      ? "This prepares a public issue for reviewed images on the current ten-thumbnail page. It downloads the exact hash-identified JSON package for attachment and includes a suggested Codex handoff prompt. Nothing is submitted until you review GitHub's draft and press its final button."
      : "This prepares a public issue for the reviewed proof set. It downloads the exact hash-identified JSON package for attachment and includes a suggested Codex handoff prompt. Nothing is submitted until you review GitHub's draft and press its final button.";
    showDialog(elements.issueDialog);
  });
  elements.publicAcknowledgement.addEventListener("change", () => {
    elements.continueToGithub.disabled = !elements.publicAcknowledgement.checked;
  });
  elements.continueToGithub.addEventListener("click", openGitHubIssue);
  elements.resetFeedback.addEventListener("click", () => showDialog(elements.resetDialog));
  elements.confirmReset.addEventListener("click", resetFeedback);
  elements.previousPage.addEventListener("click", () => changePage(-1));
  elements.nextPage.addEventListener("click", () => changePage(1));
  if (elements.categoryProofs) {
    elements.categoryProofs.addEventListener("click", () => setCategory("proofs"));
  }
  if (elements.categoryStyleProcessing) {
    elements.categoryStyleProcessing.addEventListener(
      "click",
      () => setCategory("style-processing")
    );
  }
}

function decisionsFor(item) {
  return item.review_mode === "aesthetic" ? AESTHETIC_DECISIONS : OUTPUT_DECISIONS;
}

function decisionAllowed(item, value) {
  return decisionsFor(item).some(([candidate]) => candidate === value);
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
}

function testStorage() {
  try {
    const probe = "situationship-review-storage-probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    elements.storageStatus.textContent = "Draft decisions save in this browser.";
  } catch (_error) {
    state.storageAvailable = false;
    elements.storageStatus.textContent = "Local storage is unavailable; download before leaving.";
  }
}

function validateCatalog(catalog) {
  if (!catalog || catalog.schema_version !== "1.0" || !Array.isArray(catalog.items)) {
    throw new Error("The catalog has an unsupported or incomplete schema.");
  }
  const ids = new Set();
  for (const item of catalog.items) {
    const required = [
      "artifact_id", "title", "family", "generation_class", "published_path",
      "sha256", "bytes", "width", "height", "alt"
    ];
    const missing = required.filter((key) => item[key] === undefined || item[key] === "");
    if (missing.length) {
      throw new Error(`Catalog item is missing: ${missing.join(", ")}.`);
    }
    if (ids.has(item.artifact_id)) {
      throw new Error(`Duplicate artifact ID: ${item.artifact_id}.`);
    }
    ids.add(item.artifact_id);
  }
}

async function hydrateFrameManifests(catalog) {
  const videoItems = catalog.items.filter((item) => item.frame_manifest_path);
  await Promise.all(videoItems.map(async (item) => {
    const response = await fetch(item.frame_manifest_path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Frame manifest for ${item.artifact_id} returned HTTP ${response.status}.`);
    }
    const manifest = await response.json();
    if (manifest.schema_version !== "izzi-review-filmstrip-1") {
      throw new Error(`Frame manifest schema changed for ${item.artifact_id}.`);
    }
    if (manifest.source_media.sha256 !== item.source_media.sha256
        || manifest.source_media.path !== item.source_path
        || manifest.filmstrip.sha256 !== item.sha256) {
      throw new Error(`Frame manifest lineage differs for ${item.artifact_id}.`);
    }
    if (!Array.isArray(manifest.frames) || manifest.frames.length !== 10) {
      throw new Error(`Frame manifest must contain exactly ten samples for ${item.artifact_id}.`);
    }
    const base = item.frame_manifest_path.slice(0, item.frame_manifest_path.lastIndexOf("/") + 1);
    let priorTime = -1;
    item.frames = manifest.frames.map((frame, index) => {
      if (frame.ordinal !== index + 1 || frame.time_seconds <= priorTime) {
        throw new Error(`Frame order or sample time changed for ${item.artifact_id}.`);
      }
      priorTime = frame.time_seconds;
      return { ...frame, published_path: `${base}${frame.path}` };
    });
    item.sample_method = manifest.sampling.method;
    item.safe_end_seconds = manifest.sampling.safe_end_seconds;
  }));
}

function storageKey() {
  return `situationship-review:${state.catalog.portal_build}`;
}

function loadFeedback() {
  if (!state.storageAvailable) {
    return;
  }
  try {
    const stored = localStorage.getItem(storageKey());
    if (!stored) {
      return;
    }
    const parsed = JSON.parse(stored);
    state.feedback = normalizeFeedback(parsed);
    elements.reviewerLabel.value = state.feedback.reviewer;
  } catch (_error) {
    state.feedback = { reviewer: "", reviews: {} };
    elements.storageStatus.textContent = "A damaged local draft was ignored; start or import a review.";
  }
}

function normalizeFeedback(candidate) {
  const normalized = { reviewer: "", reviews: {} };
  if (!candidate || typeof candidate !== "object") {
    return normalized;
  }
  normalized.reviewer = typeof candidate.reviewer === "string" ? candidate.reviewer.slice(0, 80) : "";
  const reviews = candidate.reviews && typeof candidate.reviews === "object" ? candidate.reviews : {};
  const allowedTags = new Set(TAGS.map(([value]) => value));
  for (const item of state.catalog.items) {
    const review = reviews[item.artifact_id];
    if (!review || typeof review !== "object") {
      continue;
    }
    const decision = decisionAllowed(item, review.decision) ? review.decision : "";
    const tags = Array.isArray(review.tags)
      ? review.tags.filter((tag) => allowedTags.has(tag))
      : [];
    const frameReviews = {};
    const suppliedFrames = Array.isArray(review.frame_reviews)
      ? Object.fromEntries(review.frame_reviews.map((frame) => [String(frame.ordinal), frame]))
      : (review.frame_reviews && typeof review.frame_reviews === "object" ? review.frame_reviews : {});
    for (const frame of item.frames || []) {
      const frameReview = suppliedFrames[String(frame.ordinal)];
      if (!frameReview || typeof frameReview !== "object") {
        continue;
      }
      const frameDecision = OUTPUT_DECISIONS.some(([value]) => value === frameReview.decision)
        ? frameReview.decision
        : "";
      const frameTags = Array.isArray(frameReview.tags)
        ? frameReview.tags.filter((tag) => allowedTags.has(tag))
        : [];
      const frameNote = typeof frameReview.note === "string" ? frameReview.note.slice(0, 600) : "";
      if (frameDecision || frameTags.length || frameNote.trim()) {
        frameReviews[String(frame.ordinal)] = {
          decision: frameDecision,
          tags: [...new Set(frameTags)],
          note: frameNote,
          reviewed_at: typeof frameReview.reviewed_at === "string" ? frameReview.reviewed_at : ""
        };
      }
    }
    normalized.reviews[item.artifact_id] = {
      decision,
      tags: [...new Set(tags)],
      note: typeof review.note === "string" ? review.note.slice(0, 1200) : "",
      reviewed_at: typeof review.reviewed_at === "string" ? review.reviewed_at : "",
      frame_reviews: frameReviews
    };
  }
  return normalized;
}

function populateFilters() {
  resetOptions(elements.familyFilter, "All families");
  resetOptions(elements.classFilter, "All classes");
  addOptions(elements.familyFilter, uniqueValues("family", categoryItems()));
  addOptions(elements.classFilter, uniqueValues("generation_class", categoryItems()));
}

function resetOptions(select, label) {
  const option = document.createElement("option");
  option.value = "all";
  option.textContent = label;
  select.replaceChildren(option);
}

function categoryItems() {
  return state.catalog.items.filter((item) => item.review_category === state.category);
}

function uniqueValues(key, items = state.catalog.items) {
  return [...new Set(items.map((item) => item[key]).filter(Boolean))].sort();
}

function addOptions(select, values) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = humanize(value);
    select.append(option);
  }
}

function updateMetrics() {
  elements.metricItems.textContent = String(state.catalog.items.length);
  elements.metricFamilies.textContent = String(uniqueValues("family").length);
  elements.metricBytes.textContent = formatBytes(
    state.catalog.items.reduce(
      (sum, item) => sum + item.bytes + (item.frames || []).reduce((frameSum, frame) => frameSum + frame.bytes, 0),
      0
    )
  );
  if (elements.categoryProofsCount) {
    elements.categoryProofsCount.textContent = String(
      state.catalog.items.filter((item) => item.review_category === "proofs").length
    );
  }
  if (elements.categoryStyleProcessingCount) {
    elements.categoryStyleProcessingCount.textContent = String(
      state.catalog.items.filter((item) => item.review_category === "style-processing").length
    );
  }
  updateFeedbackSummary();
}

function setCategory(category) {
  state.category = category;
  state.page = 1;
  elements.searchFilter.value = "";
  elements.decisionFilter.value = "all";
  if (elements.categoryProofs) {
    elements.categoryProofs.setAttribute("aria-pressed", String(category === "proofs"));
  }
  if (elements.categoryStyleProcessing) {
    elements.categoryStyleProcessing.setAttribute(
      "aria-pressed",
      String(category === "style-processing")
    );
  }
  if (category === "style-processing") {
    elements.resultsEyebrow.textContent = "human-selected aesthetic themes";
    elements.resultsTitle.textContent = "Style processing";
    elements.resultsDescription.textContent =
      "Classify dashboard thumbnails as positive, negative, held, or excluded aesthetic evidence.";
  } else {
    elements.resultsEyebrow.textContent = "selected izzi outputs";
    elements.resultsTitle.textContent = "Proofs for inspection";
    elements.resultsDescription.textContent =
      "Inspect generated artifacts and bounded temporal previews without promoting a baseline.";
  }
  populateFilters();
  renderCatalog();
}

function renderCatalog() {
  if (!state.catalog) {
    return;
  }
  const items = filteredItems();
  const pageCount = Math.max(1, Math.ceil(items.length / state.pageSize));
  state.page = Math.min(Math.max(state.page, 1), pageCount);
  const firstIndex = (state.page - 1) * state.pageSize;
  const pageItems = items.slice(firstIndex, firstIndex + state.pageSize);
  elements.grid.dataset.category = state.category;
  elements.grid.replaceChildren(...pageItems.map(renderCard));
  elements.emptyState.hidden = items.length !== 0;
  const shownStart = items.length ? firstIndex + 1 : 0;
  const shownEnd = firstIndex + pageItems.length;
  const categoryTotal = categoryItems().length;
  const noun = state.category === "style-processing" ? "references" : "proofs";
  elements.resultCount.textContent = items.length === categoryTotal
    ? `Showing ${shownStart}–${shownEnd} of ${items.length} ${noun}`
    : `Showing ${shownStart}–${shownEnd} of ${items.length} matching · ${categoryTotal} ${noun}`;
  elements.pageStatus.textContent = `Page ${state.page} of ${pageCount}`;
  elements.previousPage.disabled = state.page <= 1 || items.length === 0;
  elements.nextPage.disabled = state.page >= pageCount || items.length === 0;
  updateFeedbackSummary();
}

function currentPageItems() {
  const items = filteredItems();
  const firstIndex = (state.page - 1) * state.pageSize;
  return items.slice(firstIndex, firstIndex + state.pageSize);
}

function changePage(offset) {
  state.page += offset;
  renderCatalog();
  document.getElementById("results-title").focus({ preventScroll: true });
  document.getElementById("results-title").scrollIntoView({ behavior: "smooth", block: "start" });
}

function filteredItems() {
  const search = elements.searchFilter.value.trim().toLowerCase();
  const family = elements.familyFilter.value;
  const generationClass = elements.classFilter.value;
  const decision = elements.decisionFilter.value;

  return categoryItems().filter((item) => {
    const review = state.feedback.reviews[item.artifact_id];
    const currentDecision = review && review.decision ? review.decision : "UNREVIEWED";
    const haystack = [
      item.title, item.description, item.family, item.generation_class,
      item.feedback_round, item.source_group, item.source_path
    ].join(" ").toLowerCase();
    return (!search || haystack.includes(search))
      && (family === "all" || item.family === family)
      && (generationClass === "all" || item.generation_class === generationClass)
      && (decision === "all" || currentDecision === decision);
  });
}

function renderCard(item) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".artifact-card");
  const review = state.feedback.reviews[item.artifact_id] || emptyReview();
  card.dataset.artifactId = item.artifact_id;
  card.dataset.decision = review.decision || "UNREVIEWED";
  card.dataset.reviewMode = item.review_mode || "artifact";

  const link = card.querySelector(".artifact-image-link");
  const reviewPageId = item.artifact_id.replace(/[^a-zA-Z0-9._-]+/g, "-");
  link.href = `/review/${reviewPageId}/`;
  link.setAttribute("aria-label", `Open exact review page: ${item.title}`);
  if (item.review_mode === "aesthetic") {
    link.setAttribute("aria-label", `Classify aesthetic reference: ${item.title}`);
    card.querySelector(".open-label").textContent = "Classify image";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      card.classList.add("classification-active");
      card.querySelector(".decision-options input")?.focus();
    });
  }

  const image = card.querySelector(".artifact-image");
  image.src = item.published_path;
  image.alt = item.alt;
  image.width = item.width;
  image.height = item.height;
  image.addEventListener("error", () => {
    image.alt = `Image unavailable. ${item.alt}`;
    card.classList.add("image-failed");
    card.querySelector(".open-label").textContent = "Proof image unavailable";
  });

  card.querySelector(".artifact-kicker").textContent = [
    humanize(item.family), item.source_group ? humanize(item.source_group) : "",
    humanize(item.generation_class), item.feedback_round
  ].filter(Boolean).join(" · ");
  card.querySelector(".artifact-title").textContent = item.title;
  card.querySelector(".artifact-description").textContent = item.description;

  const states = card.querySelector(".state-row");
  states.append(
    makePill(item.technical_state, "pill-technical"),
    makePill(item.review_scope, "pill-preview"),
    makePill(item.baseline_state, "")
  );
  if (item.accessibility_state) {
    states.append(makePill(item.accessibility_state, ""));
  }

  const metadata = card.querySelector(".artifact-metadata");
  addMetadata(metadata, "Artifact ID", item.artifact_id);
  addMetadata(metadata, "Izzi source", item.source_path);
  if (item.source_state) {
    addMetadata(metadata, "Repository state", humanize(item.source_state));
  }
  if (item.source_group) {
    addMetadata(metadata, "Source group", humanize(item.source_group));
  }
  addMetadata(metadata, "SHA-256", item.sha256);
  addMetadata(metadata, "Dimensions", `${item.width} × ${item.height}`);
  addMetadata(metadata, "File size", `${formatBytes(item.bytes)} (${item.bytes.toLocaleString()} bytes)`);
  addMetadata(metadata, "Source commit", state.catalog.source_commit);
  if (item.source_media) {
    addMetadata(metadata, "Source MKV SHA-256", item.source_media.sha256);
    addMetadata(metadata, "Source MKV size", `${formatBytes(item.source_media.bytes)} (${item.source_media.bytes.toLocaleString()} bytes)`);
    addMetadata(metadata, "Source duration", formatTimestamp(item.source_media.duration_seconds));
    addMetadata(metadata, "Source video", `${item.source_media.width} × ${item.source_media.height}, ${item.source_media.codec}, ${item.source_media.frame_rate}`);
    addMetadata(metadata, "Source MKV published", item.source_media.published ? "Yes" : "No — preview derivatives only");
  }
  if (item.source_image) {
    addMetadata(metadata, "Source image SHA-256", item.source_image.sha256);
    addMetadata(metadata, "Source image size", `${formatBytes(item.source_image.bytes)} (${item.source_image.bytes.toLocaleString()} bytes)`);
    addMetadata(metadata, "Source dimensions", `${item.source_image.width} × ${item.source_image.height}`);
    addMetadata(metadata, "Source format", item.source_image.format.toUpperCase());
    addMetadata(metadata, "Source original published", item.source_image.published ? "Yes" : "No — compact review derivative only");
  }

  if (item.frames && item.frames.length) {
    const frameReview = card.querySelector(".frame-review");
    frameReview.hidden = false;
    const frameGrid = frameReview.querySelector(".frame-grid");
    frameGrid.append(...item.frames.map((frame) => renderFrame(item, frame, review)));
  }

  const decisionOptions = card.querySelector(".decision-options");
  card.querySelector(".decision-fieldset legend").textContent = item.review_mode === "aesthetic"
    ? "Aesthetic evidence decision"
    : "Clip or proof decision";
  for (const [value, label] of decisionsFor(item)) {
    decisionOptions.append(makeChoice("radio", `decision-${item.artifact_id}`, value, label, review.decision === value));
  }

  const tagOptions = card.querySelector(".tag-options");
  for (const [value, label] of TAGS) {
    tagOptions.append(makeChoice("checkbox", `tag-${item.artifact_id}-${value}`, value, label, review.tags.includes(value)));
  }

  const textarea = card.querySelector("textarea");
  textarea.value = review.note;
  const saveState = card.querySelector(".save-state");
  saveState.textContent = review.reviewed_at ? `Local draft updated ${formatDate(review.reviewed_at)}` : "Not reviewed";

  card.addEventListener("change", () => captureCard(card));
  textarea.addEventListener("input", () => captureCard(card));
  return card;
}

function makePill(text, className) {
  const span = document.createElement("span");
  span.className = `pill ${className}`.trim();
  span.textContent = humanize(text);
  return span;
}

function addMetadata(list, term, value) {
  const dt = document.createElement("dt");
  const dd = document.createElement("dd");
  dt.textContent = term;
  dd.textContent = value;
  list.append(dt, dd);
}

function renderFrame(item, frame, artifactReview) {
  const frameReview = artifactReview.frame_reviews?.[String(frame.ordinal)] || emptyFrameReview();
  const article = document.createElement("article");
  article.className = "sample-frame";
  article.dataset.frameOrdinal = String(frame.ordinal);
  article.dataset.decision = frameReview.decision || "UNREVIEWED";

  const link = document.createElement("a");
  link.className = "sample-frame-link";
  link.href = frame.published_path;
  link.target = "_blank";
  link.rel = "noopener";
  link.setAttribute(
    "aria-label",
    `Open ${item.title}, frame ${frame.ordinal} at ${formatTimestamp(frame.time_seconds)}`
  );
  const image = document.createElement("img");
  image.src = frame.published_path;
  image.alt = `Frame ${frame.ordinal} of ${item.title}, sampled at ${formatTimestamp(frame.time_seconds)}.`;
  image.width = frame.width;
  image.height = frame.height;
  image.loading = "lazy";
  image.decoding = "async";
  link.append(image);

  const heading = document.createElement("h5");
  heading.textContent = `Frame ${frame.ordinal} · ${formatTimestamp(frame.time_seconds)}`;

  const decisionLabel = document.createElement("label");
  decisionLabel.textContent = "Frame decision";
  const decision = document.createElement("select");
  decision.className = "frame-decision";
  decision.setAttribute(
    "aria-label",
    `Decision for ${item.title}, frame ${frame.ordinal} at ${formatTimestamp(frame.time_seconds)}`
  );
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "No decision";
  decision.append(blank);
  for (const [value, label] of OUTPUT_DECISIONS) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = frameReview.decision === value;
    decision.append(option);
  }
  decisionLabel.append(decision);

  const details = document.createElement("details");
  details.className = "frame-details";
  const summary = document.createElement("summary");
  summary.textContent = "Frame tags and note";
  const tags = document.createElement("div");
  tags.className = "tag-options frame-tag-options";
  for (const [value, label] of TAGS) {
    tags.append(makeChoice(
      "checkbox",
      `frame-tag-${item.artifact_id}-${frame.ordinal}-${value}`,
      value,
      label,
      frameReview.tags.includes(value)
    ));
  }
  const noteLabel = document.createElement("label");
  noteLabel.textContent = "Frame note";
  const note = document.createElement("textarea");
  note.className = "frame-note";
  note.rows = 2;
  note.maxLength = 600;
  note.placeholder = "Name what changes here or what should be preserved…";
  note.value = frameReview.note;
  noteLabel.append(note);
  details.append(summary, tags, noteLabel);

  const saveState = document.createElement("p");
  saveState.className = "frame-save-state";
  saveState.setAttribute("role", "status");
  saveState.textContent = frameReview.reviewed_at
    ? `Updated ${formatDate(frameReview.reviewed_at)}`
    : "Frame not reviewed";

  article.append(link, heading, decisionLabel, details, saveState);
  article.addEventListener("change", () => captureFrame(item, frame, article));
  note.addEventListener("input", () => captureFrame(item, frame, article));
  return article;
}

function makeChoice(type, name, value, labelText, checked) {
  const label = document.createElement("label");
  label.className = "choice";
  const input = document.createElement("input");
  input.type = type;
  input.name = name;
  input.value = value;
  input.checked = checked;
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(input, text);
  return label;
}

function captureCard(card) {
  const artifactId = card.dataset.artifactId;
  const selectedDecision = card.querySelector(".decision-options input:checked");
  const tags = [...card.querySelectorAll(".tag-options input:checked")].map((input) => input.value);
  const note = card.querySelector("textarea").value.slice(0, 1200);
  const existing = state.feedback.reviews[artifactId];
  const decision = selectedDecision ? selectedDecision.value : "";
  const frameReviews = existing?.frame_reviews || {};

  if (!decision && tags.length === 0 && !note.trim() && Object.keys(frameReviews).length === 0) {
    delete state.feedback.reviews[artifactId];
    card.dataset.decision = "UNREVIEWED";
    card.querySelector(".save-state").textContent = "Not reviewed";
  } else {
    const reviewedAt = new Date().toISOString();
    state.feedback.reviews[artifactId] = {
      decision,
      tags,
      note,
      reviewed_at: reviewedAt,
      frame_reviews: frameReviews
    };
    card.dataset.decision = decision || "UNREVIEWED";
    card.querySelector(".save-state").textContent = `Local draft updated ${formatDate(reviewedAt)}`;
  }

  saveFeedback(existing ? "Local draft updated." : "Local draft started.");
  updateFeedbackSummary();
}

function emptyReview() {
  return { decision: "", tags: [], note: "", reviewed_at: "", frame_reviews: {} };
}

function emptyFrameReview() {
  return { decision: "", tags: [], note: "", reviewed_at: "" };
}

function captureFrame(item, frame, frameElement) {
  const artifactId = item.artifact_id;
  const artifactReview = state.feedback.reviews[artifactId] || emptyReview();
  artifactReview.frame_reviews = artifactReview.frame_reviews || {};
  const decision = frameElement.querySelector(".frame-decision").value;
  const tags = [...frameElement.querySelectorAll(".frame-tag-options input:checked")]
    .map((input) => input.value);
  const note = frameElement.querySelector(".frame-note").value.slice(0, 600);
  const ordinal = String(frame.ordinal);

  if (!decision && tags.length === 0 && !note.trim()) {
    delete artifactReview.frame_reviews[ordinal];
    frameElement.dataset.decision = "UNREVIEWED";
    frameElement.querySelector(".frame-save-state").textContent = "Frame not reviewed";
  } else {
    const reviewedAt = new Date().toISOString();
    artifactReview.frame_reviews[ordinal] = {
      decision,
      tags,
      note,
      reviewed_at: reviewedAt
    };
    frameElement.dataset.decision = decision || "UNREVIEWED";
    frameElement.querySelector(".frame-save-state").textContent = `Updated ${formatDate(reviewedAt)}`;
  }

  const hasClipReview = artifactReview.decision
    || artifactReview.tags.length
    || artifactReview.note.trim();
  if (!hasClipReview && Object.keys(artifactReview.frame_reviews).length === 0) {
    delete state.feedback.reviews[artifactId];
  } else {
    state.feedback.reviews[artifactId] = artifactReview;
  }
  saveFeedback(`Frame ${frame.ordinal} draft updated locally.`);
  updateFeedbackSummary();
}

function saveFeedback(message) {
  if (state.storageAvailable) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(state.feedback));
    } catch (_error) {
      state.storageAvailable = false;
      elements.storageStatus.textContent = "Local save failed; download feedback before leaving.";
    }
  }
  elements.handoffStatus.textContent = message;
}

function meaningfulReviews(items = state.catalog.items) {
  return items.flatMap((item) => {
    const review = state.feedback.reviews[item.artifact_id];
    const frameCount = review ? Object.keys(review.frame_reviews || {}).length : 0;
    if (!review || (!review.decision && review.tags.length === 0 && !review.note.trim() && frameCount === 0)) {
      return [];
    }
    return [{ item, review }];
  });
}

function updateFeedbackSummary() {
  if (!state.catalog) {
    return;
  }
  const reviews = meaningfulReviews();
  const decisions = reviews.filter(({ review }) => review.decision).length;
  const frameReviews = reviews.reduce(
    (count, { review }) => count + Object.keys(review.frame_reviews || {}).length,
    0
  );
  elements.metricReviewed.textContent = String(decisions);
  elements.feedbackCount.textContent = reviews.length === 0
    ? "No feedback yet"
    : `${reviews.length} ${reviews.length === 1 ? "proof" : "proofs"} and ${frameReviews} ${frameReviews === 1 ? "frame" : "frames"} have local feedback`;
  const disabled = reviews.length === 0;
  elements.downloadFeedback.disabled = disabled;
  const issueItems = state.category === "style-processing"
    ? currentPageItems()
    : categoryItems();
  elements.openIssueDialog.disabled = meaningfulReviews(issueItems).length === 0;
  elements.resetFeedback.disabled = disabled && !state.feedback.reviewer;
}

function buildExport(publicAcknowledged = false, items = state.catalog.items, scope = "all") {
  return {
    schema_version: "1.0",
    portal_build: state.catalog.portal_build,
    catalog_sha256: state.catalog.catalog_sha256 || "SELF-HASH-UNAVAILABLE",
    source_repository: state.catalog.source_repository,
    source_commit: state.catalog.source_commit,
    reviewer: state.feedback.reviewer.trim(),
    exported_at: new Date().toISOString(),
    scope,
    reviews: meaningfulReviews(items).map(({ item, review }) => ({
      artifact_id: item.artifact_id,
      artifact_sha256: item.sha256,
      source_media_sha256: item.source_media?.sha256 || null,
      source_image_sha256: item.source_image?.sha256 || null,
      review_mode: item.review_mode || "artifact",
      decision: review.decision || "OBSERVATION-ONLY",
      tags: review.tags,
      note: review.note,
      reviewed_at: review.reviewed_at,
      public_submission_acknowledged: publicAcknowledged,
      frame_reviews: Object.entries(review.frame_reviews || {})
        .map(([ordinal, frameReview]) => {
          const frame = item.frames.find((candidate) => candidate.ordinal === Number(ordinal));
          return {
            ordinal: Number(ordinal),
            time_seconds: frame.time_seconds,
            frame_sha256: frame.sha256,
            decision: frameReview.decision || "OBSERVATION-ONLY",
            tags: frameReview.tags,
            note: frameReview.note,
            reviewed_at: frameReview.reviewed_at,
            public_submission_acknowledged: publicAcknowledged
          };
        })
        .sort((left, right) => left.ordinal - right.ordinal)
    }))
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

async function calculateReviewIdentifier(payload) {
  const stable = structuredClone(payload);
  delete stable.exported_at;
  delete stable.review_identifier;
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(stable)));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

async function attachReviewIdentifier(payload) {
  payload.review_identifier = await calculateReviewIdentifier(payload);
  return payload;
}

function downloadPayload(payload, filename) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadFeedback() {
  try {
    const payload = await attachReviewIdentifier(buildExport(false));
    downloadPayload(payload, `izzi-review-${state.catalog.portal_build}.json`);
    elements.handoffStatus.textContent = `Downloaded ${payload.reviews.length} review record(s).`;
  } catch (error) {
    elements.handoffStatus.textContent = `Download failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function importFeedback(event) {
  const [file] = event.target.files;
  event.target.value = "";
  if (!file) {
    return;
  }
  try {
    const imported = JSON.parse(await file.text());
    if (imported.schema_version !== "1.0" || imported.portal_build !== state.catalog.portal_build) {
      throw new Error("This review package belongs to a different schema or portal build.");
    }
    if (imported.review_identifier
        && imported.review_identifier !== await calculateReviewIdentifier(imported)) {
      throw new Error("The review identifier does not match the JSON package contents.");
    }
    const converted = { reviewer: imported.reviewer || "", reviews: {} };
    for (const review of imported.reviews || []) {
      const item = state.catalog.items.find((candidate) => candidate.artifact_id === review.artifact_id);
      if (!item || item.sha256 !== review.artifact_sha256) {
        throw new Error(`Artifact identity or hash does not match: ${review.artifact_id || "unknown"}.`);
      }
      if ((review.source_media_sha256 || null) !== (item.source_media?.sha256 || null)) {
        throw new Error(`Source media hash does not match: ${review.artifact_id}.`);
      }
      if ((review.source_image_sha256 || null) !== (item.source_image?.sha256 || null)) {
        throw new Error(`Source image hash does not match: ${review.artifact_id}.`);
      }
      for (const frameReview of review.frame_reviews || []) {
        const frame = item.frames?.find((candidate) => candidate.ordinal === frameReview.ordinal);
        if (!frame || frame.sha256 !== frameReview.frame_sha256
            || frame.time_seconds !== frameReview.time_seconds) {
          throw new Error(`Frame identity or sample time does not match: ${review.artifact_id} frame ${frameReview.ordinal}.`);
        }
      }
      converted.reviews[review.artifact_id] = review;
    }
    state.feedback = normalizeFeedback(converted);
    elements.reviewerLabel.value = state.feedback.reviewer;
    saveFeedback(`Imported ${Object.keys(state.feedback.reviews).length} review record(s).`);
    renderCatalog();
  } catch (error) {
    elements.handoffStatus.textContent = `Import failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function compactNote(note, maximum = 180) {
  const compact = String(note || "").replace(/\s+/g, " ").trim();
  return compact.length > maximum ? `${compact.slice(0, maximum - 1)}…` : compact;
}

function issueUrl(title, lines) {
  const parameters = new URLSearchParams({ title, body: lines.join("\n") });
  return `${ISSUE_URL}?${parameters}`;
}

async function openGitHubIssue() {
  if (!elements.publicAcknowledgement.checked) {
    return;
  }
  try {
    const issueItems = state.category === "style-processing"
      ? currentPageItems()
      : categoryItems();
    const scope = state.category === "style-processing"
      ? `style-processing-page-${state.page}`
      : "proofs";
    const payload = await attachReviewIdentifier(buildExport(true, issueItems, scope));
    if (!payload.reviews.length) {
      elements.issueDialog.close();
      elements.handoffStatus.textContent = "Review at least one item on this page before preparing its issue.";
      return;
    }

    const identifier = payload.review_identifier;
    const identifierShort = identifier.slice("sha256:".length, "sha256:".length + 12);
    const filename = `izzi-review-${identifierShort}.json`;
    downloadPayload(payload, filename);
    const suggestedPrompt =
      `Process the situationshipin.space review attached to this GitHub issue, identified by ${identifier}. `
      + `Validate portal build ${payload.portal_build} and every derivative, source-image, source-media, and frame hash before applying explicit decisions. `
      + "For style processing, update the review records and propose the next izzi-aesthetic-brief-1; treat HOLD, EXCLUDE, and unreviewed items as non-positive. "
      + "Do not infer baseline approval, provider-transfer authority, or permission to submit a generation job.";
    const heading = state.category === "style-processing"
      ? "Izzi style-processing review"
      : "Izzi artifact review";
    const decisionLines = payload.reviews.flatMap((review) => [
      `### ${review.artifact_id}`,
      `- Derivative SHA-256: \`${review.artifact_sha256}\``,
      `- Source SHA-256: \`${review.source_image_sha256 || review.source_media_sha256 || "not-applicable"}\``,
      `- Decision: **${review.decision}**`,
      `- Tags: ${review.tags.length ? review.tags.join(", ") : "none"}`,
      `- Note: ${compactNote(review.note) || "none"}`,
      ...review.frame_reviews.flatMap((frame) => [
        `  - Frame ${frame.ordinal} at ${formatTimestamp(frame.time_seconds)} · **${frame.decision}** · \`${frame.frame_sha256}\``
      ]),
      ""
    ]);
    const preamble = [
      `## ${heading}`,
      "",
      `Portal build: \`${payload.portal_build}\``,
      `Izzi source commit: \`${payload.source_commit}\``,
      `Review scope: \`${payload.scope}\``,
      `Review identifier: \`${identifier}\``,
      `Reviewer label: ${payload.reviewer || "not supplied"}`,
      "",
      `Attach the automatically downloaded \`${filename}\` before submitting this issue; its content hashes to the identifier above.`,
      "",
      "## Suggested Codex handoff",
      "",
      `> ${suggestedPrompt}`,
      "",
      "## Reviewed decisions",
      ""
    ];
    const footer = [
      "",
      "This issue was prepared by the static situationshipin.space review portal after an explicit public-submission acknowledgement. GitHub has not submitted it yet."
    ];
    const title = `[Izzi ${state.category === "style-processing" ? "style" : "proof"} review] ${payload.reviews.length} decision${payload.reviews.length === 1 ? "" : "s"} · ${identifierShort}`;
    let url = issueUrl(title, [...preamble, ...decisionLines, ...footer]);
    if (url.length > 7800) {
      const compactLines = payload.reviews.map((review) =>
        `- \`${review.artifact_id}\` — **${review.decision}** — ${review.frame_reviews.length} frame decision(s)`
      );
      url = issueUrl(title, [...preamble, ...compactLines, ...footer]);
    }
    elements.issueDialog.close();
    window.open(url, "_blank", "noopener");
    elements.handoffStatus.textContent = `Downloaded ${filename} and opened its public GitHub issue draft; attach the JSON before submitting.`;
  } catch (error) {
    elements.issueDialog.close();
    elements.handoffStatus.textContent = `Issue preparation failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function resetFeedback() {
  state.feedback = { reviewer: "", reviews: {} };
  elements.reviewerLabel.value = "";
  if (state.storageAvailable) {
    localStorage.removeItem(storageKey());
  }
  elements.resetDialog.close();
  elements.handoffStatus.textContent = "Local feedback reset for this portal build.";
  renderCatalog();
}

function showDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function showCatalogError(message) {
  elements.catalogError.hidden = false;
  elements.catalogError.textContent = `The review catalog could not be loaded: ${message}`;
  elements.resultCount.textContent = "Catalog unavailable";
}

function humanize(value) {
  if (!value) {
    return "Not specified";
  }
  return value.toLowerCase().replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function formatTimestamp(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
