const SRS_KEY = "quiquiz:srs:v1";
const DAY_MS = 24 * 60 * 60 * 1000;

function readStore() {
  try {
    const raw = localStorage.getItem(SRS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(SRS_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function cardKey(categoryId, scientificName) {
  return `${categoryId}::${scientificName}`;
}

export function upsertMissedCards(categoryId, missed) {
  if (!categoryId || !Array.isArray(missed) || !missed.length) return;
  const store = readStore();
  const now = Date.now();
  for (const item of missed) {
    const scientificName = item.nom_scientifique || item.scientificName;
    const commonName = item.nom_commun || item.commonName;
    if (!scientificName) continue;
    const key = cardKey(categoryId, scientificName);
    store[key] = {
      categoryId,
      scientificName,
      commonName: commonName || scientificName,
      due: now,
      intervalDays: 0,
    };
  }
  writeStore(store);
}

export function dueCards(categoryId, limit = 20) {
  const store = readStore();
  const now = Date.now();
  return Object.values(store)
    .filter((card) => card.categoryId === categoryId && Number(card.due || 0) <= now)
    .sort((a, b) => Number(a.due) - Number(b.due))
    .slice(0, limit);
}

export function dueCount(categoryId) {
  return dueCards(categoryId, 500).length;
}

export function markCardAgain(categoryId, scientificName) {
  const store = readStore();
  const key = cardKey(categoryId, scientificName);
  const card = store[key];
  if (!card) return;
  card.intervalDays = 0;
  card.due = Date.now();
  store[key] = card;
  writeStore(store);
}

export function markCardOk(categoryId, scientificName) {
  const store = readStore();
  const key = cardKey(categoryId, scientificName);
  const card = store[key];
  if (!card) return;
  const next = card.intervalDays <= 0 ? 1 : 3;
  card.intervalDays = next;
  card.due = Date.now() + next * DAY_MS;
  store[key] = card;
  writeStore(store);
}
