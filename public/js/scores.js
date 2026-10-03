const PREFIX = "birdquiz:score:";

function storageKey(categoryId, difficulty, mode) {
  const base = `${PREFIX}${categoryId}:${difficulty}`;
  if (!mode || mode === "qcm") return base;
  return `${base}:${mode}`;
}

export function getBest(categoryId, difficulty, mode) {
  try {
    const raw = localStorage.getItem(storageKey(categoryId, difficulty, mode));
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

export function recordScore(categoryId, difficulty, score, total, mode) {
  const previous = getBest(categoryId, difficulty, mode);
  const ratio = total > 0 ? score / total : 0;
  const previousRatio = previous ? previous.score / previous.total : -1;
  const improved =
    !previous || ratio > previousRatio || (ratio === previousRatio && score > previous.score);
  const best = improved ? { score, total } : previous;

  if (improved) {
    try {
      localStorage.setItem(storageKey(categoryId, difficulty, mode), JSON.stringify(best));
    } catch {
      // Le quiz reste jouable si le navigateur bloque le stockage.
    }
  }

  return { improved, best, previous };
}
