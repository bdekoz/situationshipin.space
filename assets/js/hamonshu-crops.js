/* Human category names only. Drafts stay in this browser until exported. */
(() => {
  "use strict";
  const packet = JSON.parse(document.getElementById("crop-data").textContent);
  const key = `hamonshu-categories:${packet.plan_sha256}`;
  const byId = new Map(packet.crops.map(crop => [crop.id, crop]));
  const cards = [...document.querySelectorAll(".crop")];
  const fields = new Map(cards.map(card => [card.dataset.id, {
    card, category: card.querySelector(".category-name"), note: card.querySelector(".review-note")
  }]));
  const el = id => document.getElementById(id);
  const status = (message, error = false) => {
    el("status").textContent = message;
    el("status").classList.toggle("error", error);
  };
  let drafts = {};

  function categoryValid(value) {
    return typeof value === "string" && value.length <= 120
      && !/[\/\\\x00-\x1f\x7f]/.test(value)
      && ![".", "..", "uncategorized"].includes(value)
      && !value.startsWith("_");
  }

  function validate(review, allowDraft = false) {
    if (review?.schema !== "izzi.hamonshu-categories/1" || review.volume !== 1
        || review.plan_sha256 !== packet.plan_sha256
        || typeof review.reviewer !== "string" || review.reviewer.length > 200
        || !Array.isArray(review.crops) || review.crops.length !== byId.size) {
      throw new Error("This file does not match this Book 1 crop packet.");
    }
    const seen = new Set();
    for (const row of review.crops) {
      const original = byId.get(row.id);
      if (!original || seen.has(row.id) || row.sha256 !== original.sha256
          || row.pixel_sha256 !== original.pixel_sha256
          || typeof row.category !== "string" || row.category.length > 120
          || (!allowDraft && !categoryValid(row.category)) || typeof row.note !== "string"
          || row.note.length > 2000) {
        throw new Error("A crop, category name, or source hash is invalid; nothing was loaded.");
      }
      seen.add(row.id);
    }
    return review;
  }

  function payload() {
    return {
      schema: "izzi.hamonshu-categories/1", volume: 1,
      plan_sha256: packet.plan_sha256, reviewer: el("reviewer").value.trim(),
      review_url: location.href.split("#")[0], exported_at: new Date().toISOString(),
      crops: packet.crops.map(crop => ({
        id: crop.id, sha256: crop.sha256, pixel_sha256: crop.pixel_sha256,
        category: (drafts[crop.id]?.category || "").trim(),
        note: drafts[crop.id]?.note || ""
      }))
    };
  }

  function updateProgress() {
    const count = Object.values(drafts).filter(row => row.category.trim()).length;
    el("progress").textContent = `${count} of ${byId.size} crops categorized`;
  }

  function save() {
    updateProgress();
    try {
      localStorage.setItem(key, JSON.stringify(payload()));
      status("Draft saved in this browser. Download your classifications to share them.");
    } catch {
      status("Browser storage is unavailable or full. Download your classifications before leaving.", true);
    }
  }

  function categoryOptions() {
    const names = [...new Set(Object.values(drafts).map(row => row.category.trim()).filter(Boolean))].sort();
    el("category-names").replaceChildren(...names.map(name => new Option(name, name)));
    const selected = el("category-filter").value;
    el("category-filter").replaceChildren(new Option("All categories", ""),
      new Option("Uncategorized", "__unassigned"), ...names.map(name => new Option(name, name)));
    el("category-filter").value = names.includes(selected) || selected === "__unassigned" ? selected : "";
  }

  function filter() {
    const search = el("find").value.toLocaleLowerCase();
    const scan = el("scan").value;
    const category = el("category-filter").value;
    let shown = 0;
    for (const card of cards) {
      const draft = drafts[card.dataset.id] || {category: "", note: ""};
      const name = draft.category.trim();
      const text = `${card.textContent} ${name} ${draft.note}`.toLocaleLowerCase();
      card.hidden = (scan && card.dataset.scan !== scan) || !text.includes(search)
        || (category === "__unassigned" ? Boolean(name) : category && name !== category);
      if (!card.hidden) shown++;
    }
    el("count").textContent = `${shown} crops shown`;
  }

  function load(review, allowDraft = false) {
    validate(review, allowDraft);
    drafts = Object.fromEntries(review.crops.map(row => [row.id, {category: row.category, note: row.note}]));
    el("reviewer").value = review.reviewer;
    for (const [id, inputs] of fields) {
      inputs.category.value = drafts[id].category;
      inputs.note.value = drafts[id].note;
      inputs.category.setCustomValidity(categoryValid(inputs.category.value.trim()) ? ""
        : "Use a category name of up to 120 characters, without slashes or a leading underscore.");
    }
    updateProgress(); categoryOptions(); filter();
  }

  for (const [id, inputs] of fields) {
    for (const input of [inputs.category, inputs.note]) {
      input.addEventListener("input", () => {
        drafts[id] = {category: inputs.category.value, note: inputs.note.value};
        inputs.category.setCustomValidity(categoryValid(inputs.category.value.trim()) ? ""
          : "Use a category name of up to 120 characters, without slashes or a leading underscore.");
        save();
      });
      input.addEventListener("change", () => { categoryOptions(); filter(); });
    }
  }
  for (const id of ["find", "scan", "category-filter"]) el(id).addEventListener("input", filter);
  el("reviewer").addEventListener("input", save);
  el("download").addEventListener("click", () => {
    try {
      for (const {category} of fields.values()) if (!category.reportValidity()) return;
      const review = validate(payload());
      const url = URL.createObjectURL(new Blob([JSON.stringify(review, null, 2) + "\n"], {type: "application/json"}));
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "hamonshu-book-1-categories.json";
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status("Classifications downloaded. Send the JSON file back to Benjamin for grouping the original crops.");
    } catch (error) { status(error.message, true); }
  });
  el("import").addEventListener("change", async event => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) throw new Error("Review file is too large (maximum 1 MiB).");
      const review = validate(JSON.parse(await file.text()));
      load(review); save();
    } catch (error) { status(error.message, true); }
    finally { event.target.value = ""; }
  });
  try {
    const previous = localStorage.getItem(key);
    if (previous) { load(JSON.parse(previous), true); status("Restored your draft from this browser."); }
    else status("Names and notes save in this browser. Download the JSON file to share them.");
  } catch { status("Saved draft could not be restored. You can still categorize and download a new review.", true); }
  updateProgress(); categoryOptions(); filter();
})();
