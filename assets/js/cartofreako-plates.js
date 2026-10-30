const collection = JSON.parse(document.getElementById('plate-review-data').textContent);
const cards = [...document.querySelectorAll('.pair')];
const search = document.getElementById('plate-search');
const count = document.getElementById('plate-count');
const scopeButtons = [...document.querySelectorAll('[data-select-scope]')];
let scope = 'both';

function filter() {
  const query = search.value.trim().toLowerCase();
  let shown = 0;
  for (const card of cards) {
    card.hidden = !card.dataset.search.includes(query);
    if (!card.hidden) shown++;
    for (const figure of card.querySelectorAll('[data-plate-scope]')) {
      figure.hidden = scope !== 'both' && figure.dataset.plateScope !== scope;
    }
  }
  document.getElementById('plates').classList.toggle('single-scope', scope !== 'both');
  count.textContent = `${shown} of ${cards.length} subjects · ${shown * (scope === 'both' ? 2 : 1)} plates shown`;
  document.getElementById('empty').hidden = shown > 0;
}
search.addEventListener('input', filter);
for (const button of scopeButtons) button.addEventListener('click', () => {
  scope = button.dataset.selectScope;
  for (const candidate of scopeButtons) candidate.setAttribute('aria-pressed', String(candidate === button));
  filter();
});

const notes = document.getElementById('collection-notes');
const status = document.getElementById('notes-status');
const key = `cartofreako-notes:${collection.id}:${collection.manifest_sha256}`;
try { notes.value = localStorage.getItem(key) || ''; } catch {}
function readReview(id) {
  try {
    const saved = JSON.parse(localStorage.getItem(`review:${id}`) || 'null');
    const plate = collection.plates.find(plate => plate.artifact_id === id);
    return saved && plate && saved.proxy_sha256 === plate.sha256 && saved.source_sha256 === plate.source_sha256 ? saved : null;
  } catch { return null; }
}
function refreshDecisions() {
  for (const node of document.querySelectorAll('[data-review-state]')) {
    const review = readReview(node.dataset.reviewState);
    node.textContent = review?.decision && review.decision !== 'UNREVIEWED' ? review.decision : 'Awaiting review';
  }
}
function saveNotes() {
  try {
    localStorage.setItem(key, notes.value);
    status.textContent = 'Collection notes saved in this browser.';
  } catch { status.textContent = 'Browser storage unavailable. Download the review to keep these notes.'; }
}
document.getElementById('save-collection-notes').addEventListener('click', saveNotes);
document.getElementById('download-collection-review').addEventListener('click', () => {
  saveNotes();
  const reviews = collection.plates.map(plate => {
    const saved = readReview(plate.artifact_id);
    return { review_id: plate.artifact_id, scope: plate.scope, subject: plate.stem,
      proxy_sha256: plate.sha256, source_sha256: plate.source_sha256,
      decision: saved?.decision || 'UNREVIEWED', note: saved?.note || '',
      saved_at: saved?.saved_at || null };
  });
  const record = { schema_version: 'cartofreako-plate-review-batch-1', collection: collection.id,
    source_repository: collection.source_repository, source_commit: collection.source_commit,
    manifest_sha256: collection.manifest_sha256, review_url: location.href,
    note: notes.value, at: new Date().toISOString(), reviews };
  const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = collection.id + '.review.json';
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  status.textContent = `Downloaded collection notes and ${reviews.filter(r => r.decision !== 'UNREVIEWED' || r.note).length} saved plate reviews.`;
});
window.addEventListener('pageshow', refreshDecisions);
window.addEventListener('focus', refreshDecisions);
window.addEventListener('storage', refreshDecisions);
filter(); refreshDecisions();
