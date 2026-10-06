const BADGES_KEY = "quiquiz:badges:v1";
const STREAK_KEY = "quiquiz:streak:v1";
const DAILY_PREFIX = "quiquiz:daily:";
const STATS_KEY = "quiquiz:stats:v1";
/** { "YYYY-MM-DD": ["categoryId", ...] } — défis du jour réussis sans faute. */
const DAILY_PERFECT_LOG_KEY = "quiquiz:daily-perfect-log:v1";

const PASTILLE_COLORS = ["accent", "ok", "tassel", "bec", "letter-a", "letter-b", "letter-c", "letter-d"];

/** Succès de base (sans image — glyphe CSS). Pose mascotte retirée. */
const GLOBAL_BADGES = [
  {
    id: "first_play",
    group: "global",
    label: "Première partie",
    description: "Termine n’importe quel quiz.",
    glyph: "1",
    tint: "accent",
  },
  {
    id: "perfect",
    group: "global",
    label: "Sans faute",
    description: "Termine un quiz avec 100 %.",
    glyph: "SF",
    tint: "ok",
  },
  {
    id: "perfect_5",
    group: "global",
    label: "Cinq sans faute",
    description: "Cumule 5 parties parfaites.",
    glyph: "5×",
    tint: "ok",
  },
  {
    id: "perfect_25",
    group: "global",
    label: "Vingt-cinq sans faute",
    description: "Cumule 25 parties parfaites.",
    glyph: "25",
    tint: "ok",
  },
  {
    id: "streak_3",
    group: "global",
    label: "Série de 3 jours",
    description: "Joue 3 jours d’affilée.",
    glyph: "3J",
    tint: "tassel",
  },
  {
    id: "streak_7",
    group: "global",
    label: "Série de 7 jours",
    description: "Joue 7 jours d’affilée.",
    glyph: "7J",
    tint: "tassel",
  },
  {
    id: "first_chant",
    group: "global",
    label: "Oreille fine",
    description: "Termine une partie en mode chant.",
    glyph: "♪",
    tint: "bec",
  },
  {
    id: "first_texte",
    group: "global",
    label: "Plume libre",
    description: "Termine une partie en texte libre.",
    glyph: "Aa",
    tint: "accent",
  },
  {
    id: "first_paire",
    group: "global",
    label: "Œil double",
    description: "Termine une partie en mode paire.",
    glyph: "2",
    tint: "accent",
  },
  {
    id: "first_groupes",
    group: "global",
    label: "Range-tout",
    description: "Termine une partie en mode groupes.",
    glyph: "Gp",
    tint: "accent",
  },
  {
    id: "explorer_3",
    group: "global",
    label: "Explorateur",
    description: "Joue dans 3 quiz différents.",
    glyph: "3Q",
    tint: "bec",
  },
  {
    id: "explorer_all",
    group: "global",
    label: "Tour du catalogue",
    description: "Joue au moins une fois dans chaque quiz du catalogue.",
    glyph: "★",
    tint: "tassel",
  },
];

/** @type {Map<string, { id: string, nom: string }>} */
const categoryMeta = new Map();
/** @type {Record<string, object>} */
let badgeDefs = Object.fromEntries(GLOBAL_BADGES.map((b) => [b.id, b]));

function categoryBadgeDefs(categoryId, nom) {
  const label = String(nom || categoryId).trim() || categoryId;
  const short = label
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return [
    {
      id: `cat_play:${categoryId}`,
      group: "category",
      categoryId,
      label: `${label} · première partie`,
      description: `Termine une partie dans « ${label} ».`,
      glyph: short || "Q",
      tint: "accent",
    },
    {
      id: `cat_perfect:${categoryId}`,
      group: "category",
      categoryId,
      label: `${label} · sans faute`,
      description: `Termine un quiz parfait dans « ${label} ».`,
      glyph: "SF",
      tint: "ok",
    },
  ];
}

function rebuildBadgeDefs() {
  const list = [...GLOBAL_BADGES];
  for (const meta of categoryMeta.values()) {
    list.push(...categoryBadgeDefs(meta.id, meta.nom));
  }
  badgeDefs = Object.fromEntries(list.map((b) => [b.id, b]));
}

/** Enregistre les quiz du catalogue pour les succès par catégorie. */
export function configureAchievementCategories(entries) {
  categoryMeta.clear();
  for (const entry of entries || []) {
    const id = String(entry?.id || "").trim();
    if (!id) continue;
    categoryMeta.set(id, { id, nom: String(entry.nom || entry.categorie || id) });
  }
  rebuildBadgeDefs();
}

/** Ajoute / met à jour un quiz (sessions fusionnées, etc.). */
export function ensureCategoryAchievement(categoryId, nom) {
  const id = String(categoryId || "").trim();
  if (!id) return;
  categoryMeta.set(id, { id, nom: String(nom || id) });
  rebuildBadgeDefs();
}

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

function readStats() {
  const data = readJson(STATS_KEY, {});
  return {
    perfectCount: Math.max(0, Number(data.perfectCount) || 0),
    playedCategories: Array.isArray(data.playedCategories)
      ? data.playedCategories.filter((id) => typeof id === "string")
      : [],
  };
}

function writeStats(stats) {
  writeJson(STATS_KEY, stats);
}

export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function listBadges() {
  const owned = new Set(readJson(BADGES_KEY, []));
  return Object.values(badgeDefs).map((def) => ({
    ...def,
    unlocked: owned.has(def.id),
  }));
}

export function listBadgesByGroup() {
  const all = listBadges();
  return {
    global: all.filter((b) => b.group === "global"),
    category: all.filter((b) => b.group === "category"),
  };
}

function normalizePerfectLog(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [date, list] of Object.entries(raw)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const ids = Array.isArray(list)
      ? [...new Set(list.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
    if (ids.length) out[date] = ids;
  }
  return out;
}

/** Reconstruit le journal depuis les résultats de défi stockés (migration). */
function hydratePerfectLogFromDailyResults(log) {
  const next = { ...log };
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(DAILY_PREFIX)) continue;
      const short = key.slice(DAILY_PREFIX.length);
      const colon = short.indexOf(":");
      if (colon < 0) continue;
      const date = short.slice(0, colon);
      const categoryId = short.slice(colon + 1);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !categoryId) continue;
      const data = readJson(key, null);
      if (!data || data.status === "started") continue;
      const score = Number(data.score) || 0;
      const total = Number(data.total) || 0;
      if (total <= 0 || score !== total) continue;
      const list = Array.isArray(next[date]) ? next[date] : [];
      if (!list.includes(categoryId)) next[date] = [...list, categoryId];
    }
  } catch {
    /* ignore */
  }
  return next;
}

export function getDailyPerfectLog() {
  const stored = normalizePerfectLog(readJson(DAILY_PERFECT_LOG_KEY, {}));
  const merged = hydratePerfectLogFromDailyResults(stored);
  if (JSON.stringify(merged) !== JSON.stringify(stored)) writeJson(DAILY_PERFECT_LOG_KEY, merged);
  return merged;
}

export function setDailyPerfectLog(log) {
  writeJson(DAILY_PERFECT_LOG_KEY, normalizePerfectLog(log));
}

export function pastilleTintForCategory(categoryId) {
  const idx = hashSeed(String(categoryId || "")) % PASTILLE_COLORS.length;
  return PASTILLE_COLORS[idx];
}

export function categoryLabel(categoryId) {
  return categoryMeta.get(categoryId)?.nom || categoryId;
}

function recordDailyPerfect(categoryId, date = utcDateKey()) {
  const id = String(categoryId || "").trim();
  if (!id) return;
  const log = getDailyPerfectLog();
  const list = Array.isArray(log[date]) ? log[date] : [];
  if (list.includes(id)) return;
  log[date] = [...list, id];
  writeJson(DAILY_PERFECT_LOG_KEY, log);
}

/** Jours du mois (lundi → dimanche) pour le calendrier défis. */
export function buildDailyPerfectMonth(year, monthIndex, log = getDailyPerfectLog()) {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  // Lundi = 0 … Dimanche = 6
  const startPad = (first.getUTCDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push({ empty: true });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const quizzes = Array.isArray(log[date]) ? log[date] : [];
    cells.push({
      empty: false,
      day,
      date,
      quizzes: quizzes.map((categoryId) => ({
        categoryId,
        label: categoryLabel(categoryId),
        tint: pastilleTintForCategory(categoryId),
      })),
    });
  }
  while (cells.length % 7 !== 0) cells.push({ empty: true });
  return cells;
}

export function countDailyPerfectEntries(log = getDailyPerfectLog()) {
  return Object.values(log).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
}

export function unlockBadge(id) {
  const owned = readJson(BADGES_KEY, []);
  if (owned.includes(id)) return null;
  const def = badgeDefs[id];
  if (!def) return null;
  owned.push(id);
  writeJson(BADGES_KEY, owned);
  return { ...def };
}

export function recordPlayDay() {
  const today = utcDateKey();
  const data = readJson(STREAK_KEY, { last: "", count: 0 });
  if (data.last === today) return { count: data.count, unlocked: [] };
  const yesterday = utcDateKey(new Date(Date.now() - 86400000));
  const count = data.last === yesterday ? Number(data.count || 0) + 1 : 1;
  writeJson(STREAK_KEY, { last: today, count });
  const unlocked = [];
  if (count >= 3) {
    const b = unlockBadge("streak_3");
    if (b) unlocked.push(b);
  }
  if (count >= 7) {
    const b = unlockBadge("streak_7");
    if (b) unlocked.push(b);
  }
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

/**
 * Clôture le défi du jour. Un sans-faute ajoute une pastille au calendrier.
 * @returns {object[]} badges débloqués (vide — le calendrier remplace les succès défi)
 */
export function saveDailyResult(categoryId, score, total, date = utcDateKey()) {
  const payload = {
    score: Math.max(0, Number(score) || 0),
    total: Math.max(0, Number(total) || 0),
    at: Date.now(),
    status: "done",
  };
  writeJson(`${DAILY_PREFIX}${date}:${categoryId}`, payload);
  if (payload.total > 0 && payload.score === payload.total) {
    recordDailyPerfect(categoryId, date);
  }
  return [];
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

function modeBadgeId(mode) {
  if (mode === "chant") return "first_chant";
  if (mode === "texte") return "first_texte";
  if (mode === "paire") return "first_paire";
  if (mode === "groupes") return "first_groupes";
  return "";
}

export function onQuizFinished({ mode, score, total, isDaily, categoryId }) {
  const unlocked = [];
  const first = unlockBadge("first_play");
  if (first) unlocked.push(first);

  const catId = String(categoryId || "").trim();
  if (catId) {
    const catPlay = unlockBadge(`cat_play:${catId}`);
    if (catPlay) unlocked.push(catPlay);

    const stats = readStats();
    if (!stats.playedCategories.includes(catId)) {
      stats.playedCategories.push(catId);
      writeStats(stats);
    }
    if (stats.playedCategories.length >= 3) {
      const explorer = unlockBadge("explorer_3");
      if (explorer) unlocked.push(explorer);
    }
    if (categoryMeta.size > 0 && stats.playedCategories.length >= categoryMeta.size) {
      const all = unlockBadge("explorer_all");
      if (all) unlocked.push(all);
    }
  }

  if (total > 0 && score === total) {
    const perfect = unlockBadge("perfect");
    if (perfect) unlocked.push(perfect);
    if (catId) {
      const catPerfect = unlockBadge(`cat_perfect:${catId}`);
      if (catPerfect) unlocked.push(catPerfect);
    }
    const stats = readStats();
    stats.perfectCount = Number(stats.perfectCount || 0) + 1;
    writeStats(stats);
    if (stats.perfectCount >= 5) {
      const b = unlockBadge("perfect_5");
      if (b) unlocked.push(b);
    }
    if (stats.perfectCount >= 25) {
      const b = unlockBadge("perfect_25");
      if (b) unlocked.push(b);
    }
  }

  const modeId = modeBadgeId(mode);
  if (modeId) {
    const modeBadge = unlockBadge(modeId);
    if (modeBadge) unlocked.push(modeBadge);
  }

  const streak = recordPlayDay();
  unlocked.push(...(streak.unlocked || []));

  if (isDaily) {
    /* daily accomplishments handled in saveDailyResult */
  }
  return unlocked.filter(Boolean);
}
