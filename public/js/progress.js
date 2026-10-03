const BADGES_KEY = "quiquiz:badges:v1";
const STREAK_KEY = "quiquiz:streak:v1";
const DAILY_PREFIX = "quiquiz:daily:";

const BADGE_DEFS = {
  first_play: { id: "first_play", label: "Première partie", pose: "assets/mascot/love.png" },
  perfect: { id: "perfect", label: "Sans faute", pose: "assets/mascot/victory.png" },
  first_chant: { id: "first_chant", label: "Oreille fine", pose: "assets/mascot/investigator.png" },
  daily_ok: { id: "daily_ok", label: "Défi du jour", pose: "assets/mascot/flexing-cool.png" },
  streak_3: { id: "streak_3", label: "Série de 3 jours", pose: "assets/mascot/victory.png" },
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function listBadges() {
  const owned = new Set(readJson(BADGES_KEY, []));
  return Object.values(BADGE_DEFS).map((def) => ({
    ...def,
    unlocked: owned.has(def.id),
  }));
}

export function unlockBadge(id) {
  const owned = readJson(BADGES_KEY, []);
  if (owned.includes(id)) return null;
  const def = BADGE_DEFS[id];
  if (!def) return null;
  owned.push(id);
  writeJson(BADGES_KEY, owned);
  return def;
}

export function recordPlayDay() {
  const today = utcDateKey();
  const data = readJson(STREAK_KEY, { last: "", count: 0 });
  if (data.last === today) return { count: data.count, unlocked: null };
  const yesterday = utcDateKey(new Date(Date.now() - 86400000));
  const count = data.last === yesterday ? Number(data.count || 0) + 1 : 1;
  writeJson(STREAK_KEY, { last: today, count });
  let unlocked = null;
  if (count >= 3) unlocked = unlockBadge("streak_3");
  return { count, unlocked };
}

export function getStreak() {
  const data = readJson(STREAK_KEY, { last: "", count: 0 });
  const today = utcDateKey();
  const yesterday = utcDateKey(new Date(Date.now() - 86400000));
  if (data.last !== today && data.last !== yesterday) return 0;
  return Number(data.count || 0);
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seededShuffle(items, seedStr) {
  const copy = [...items];
  let seed = hashSeed(seedStr);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function dailySeed(categoryId, date = utcDateKey()) {
  return `${date}:${categoryId}`;
}

export function getDailyResult(categoryId, date = utcDateKey()) {
  return readJson(`${DAILY_PREFIX}${date}:${categoryId}`, null);
}

/** Réserve la tentative du jour (une seule, même en cas d’abandon). */
export function claimDailyAttempt(categoryId, total, date = utcDateKey()) {
  if (getDailyResult(categoryId, date)) return false;
  const n = Math.max(0, Number(total) || 0);
  writeJson(`${DAILY_PREFIX}${date}:${categoryId}`, {
    score: 0,
    total: n,
    at: Date.now(),
    status: "started",
  });
  return true;
}

export function saveDailyResult(categoryId, score, total, date = utcDateKey()) {
  const payload = {
    score: Math.max(0, Number(score) || 0),
    total: Math.max(0, Number(total) || 0),
    at: Date.now(),
    status: "done",
  };
  writeJson(`${DAILY_PREFIX}${date}:${categoryId}`, payload);
  if (payload.total > 0 && payload.score / payload.total >= 0.7) {
    return unlockBadge("daily_ok");
  }
  return null;
}

/** Si une partie a été interrompue (rechargement), clôture la tentative. */
export function finalizeStaleDailyAttempt(categoryId, date = utcDateKey()) {
  const current = getDailyResult(categoryId, date);
  if (!current || current.status !== "started") return current;
  writeJson(`${DAILY_PREFIX}${date}:${categoryId}`, {
    score: Math.max(0, Number(current.score) || 0),
    total: Math.max(0, Number(current.total) || 0),
    at: Date.now(),
    status: "done",
  });
  return getDailyResult(categoryId, date);
}

export function onQuizFinished({ mode, score, total, isDaily }) {
  const unlocked = [];
  const first = unlockBadge("first_play");
  if (first) unlocked.push(first);
  if (total > 0 && score === total) {
    const perfect = unlockBadge("perfect");
    if (perfect) unlocked.push(perfect);
  }
  if (mode === "chant") {
    const chant = unlockBadge("first_chant");
    if (chant) unlocked.push(chant);
  }
  const streak = recordPlayDay();
  if (streak.unlocked) unlocked.push(streak.unlocked);
  if (isDaily) {
    /* daily badge handled in saveDailyResult */
  }
  return unlocked;
}
