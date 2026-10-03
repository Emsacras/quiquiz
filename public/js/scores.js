const PREFIX = "quiquiz:score:";
const LEGACY_PREFIX = "birdquiz:score:";

function storageKey(categoryId, difficulty, mode, prefix = PREFIX) {
  const base = `${prefix}${categoryId}:${difficulty}`;
  if (!mode || mode === "qcm") return base;
  return `${base}:${mode}`;
}

function readBest(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Number.isInteger(data?.score) || !Number.isInteger(data?.total) || data.total <= 0) {
      return null;
    }
    return { score: data.score, total: data.total };
  } catch {
    return null;
  }
}

export function getBest(categoryId, difficulty, mode) {
  const current = readBest(storageKey(categoryId, difficulty, mode, PREFIX));
  if (current) return current;
  const legacy = readBest(storageKey(categoryId, difficulty, mode, LEGACY_PREFIX));
  if (legacy) {
    try {
      localStorage.setItem(storageKey(categoryId, difficulty, mode, PREFIX), JSON.stringify(legacy));
    } catch {
      /* ignore */
    }
  }
  return legacy;
}

export function recordScore(categoryId, difficulty, score, total, mode) {
  const previous = getBest(categoryId, difficulty, mode);
  const ratio = total > 0 ? score / total : 0;
  const previousRatio = previous ? previous.score / previous.total : -1;
  const improved =
    !previous || ratio > previousRatio || (ratio === previousRatio && score > previous.score);
  const best = improved ? { score, total } : previous;

  if (improved) {
    try {
      localStorage.setItem(storageKey(categoryId, difficulty, mode, PREFIX), JSON.stringify(best));
    } catch {
      // Le quiz reste jouable si le navigateur bloque le stockage.
    }
  }

  return { improved, best, previous };
}
