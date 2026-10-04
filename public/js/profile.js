/**
 * Profil joueur : auth Steam/Google + sync progress (scores, badges, daily, SRS).
 */
const SCORE_PREFIX = "quiquiz:score:";
const BADGES_KEY = "quiquiz:badges:v1";
const STREAK_KEY = "quiquiz:streak:v1";
const DAILY_PREFIX = "quiquiz:daily:";
const SRS_KEY = "quiquiz:srs:v1";

let cachedMe = null;
let providers = { steam: false, google: false, googleDetail: null };
let syncTimer = null;
let lastSyncLabel = "";

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

export function getCachedMe() {
  return cachedMe;
}

export function getProviders() {
  return providers;
}

export function getSyncStatus() {
  return lastSyncLabel;
}

export async function fetchProviders() {
  try {
    const res = await fetch("/auth/providers", { headers: { Accept: "application/json" } });
    if (!res.ok) return providers;
    const data = await res.json();
    providers = {
      steam: Boolean(data.steam),
      google: Boolean(data.google),
      googleDetail: data.googleDetail || null,
    };
  } catch {
    /* ignore */
  }
  return providers;
}

export async function fetchMe() {
  try {
    const res = await fetch("/api/me", {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!res.ok) {
      cachedMe = null;
      return null;
    }
    const data = await res.json();
    cachedMe = data.user || null;
    return cachedMe;
  } catch {
    cachedMe = null;
    return null;
  }
}

export function loginSteam() {
  location.href = "/auth/steam?returnTo=profil";
}

export function loginGoogle() {
  location.href = "/auth/google?returnTo=profil";
}

export async function logout() {
  try {
    await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    /* ignore */
  }
  cachedMe = null;
  lastSyncLabel = "";
}

export async function saveDisplayName(displayName) {
  const res = await fetch("/api/me/display-name", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ displayName }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || "name" };
  cachedMe = data.user || cachedMe;
  return { ok: true, user: cachedMe };
}

export async function unlinkProvider(provider) {
  const res = await fetch("/api/me/unlink", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ provider }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || "unlink" };
  cachedMe = data.user || cachedMe;
  return { ok: true, user: cachedMe };
}

function collectLocalScores() {
  const scores = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(SCORE_PREFIX)) continue;
      const short = key.slice(SCORE_PREFIX.length);
      const data = readJson(key, null);
      if (!data || !Number.isInteger(data.score) || !Number.isInteger(data.total) || data.total <= 0) {
        continue;
      }
      scores[short] = { score: data.score, total: data.total };
    }
  } catch {
    /* ignore */
  }
  return scores;
}

function collectLocalDaily() {
  const daily = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(DAILY_PREFIX)) continue;
      const short = key.slice(DAILY_PREFIX.length);
      const data = readJson(key, null);
      if (!data || typeof data !== "object") continue;
      daily[short] = data;
    }
  } catch {
    /* ignore */
  }
  return daily;
}

export function collectLocalProgress() {
  return {
    scores: collectLocalScores(),
    badges: readJson(BADGES_KEY, []).filter((b) => typeof b === "string"),
    streak: readJson(STREAK_KEY, { last: "", count: 0 }),
    daily: collectLocalDaily(),
    srs: readJson(SRS_KEY, {}),
    syncedAt: Date.now(),
  };
}

function betterScore(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ra = a.total > 0 ? a.score / a.total : -1;
  const rb = b.total > 0 ? b.score / b.total : -1;
  if (ra > rb) return a;
  if (rb > ra) return b;
  return a.score >= b.score ? a : b;
}

function mergeDailyEntry(a, b) {
  if (!a) return b;
  if (!b) return a;
  const rank = (e) => (e.status === "done" ? 2 : e.status === "started" ? 1 : 0);
  if (rank(a) !== rank(b)) return rank(a) > rank(b) ? a : b;
  const sa = a.total > 0 ? a.score / a.total : -1;
  const sb = b.total > 0 ? b.score / b.total : -1;
  if (sa !== sb) return sa >= sb ? a : b;
  return Number(a.at || 0) >= Number(b.at || 0) ? a : b;
}

function mergeStreak(a, b) {
  const left = a && typeof a === "object" ? a : { last: "", count: 0 };
  const right = b && typeof b === "object" ? b : { last: "", count: 0 };
  if (!left.last) return right;
  if (!right.last) return left;
  if (left.last === right.last) {
    return { last: left.last, count: Math.max(Number(left.count) || 0, Number(right.count) || 0) };
  }
  return left.last > right.last ? left : right;
}

function mergeSrsCard(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ia = Number(a.intervalDays) || 0;
  const ib = Number(b.intervalDays) || 0;
  if (ia !== ib) {
    const winner = ia > ib ? a : b;
    return { ...winner };
  }
  const da = Number(a.due) || 0;
  const db = Number(b.due) || 0;
  if (ia > 0) return { ...(da >= db ? a : b) };
  return { ...(da <= db ? a : b) };
}

export function mergeProgress(local, remote) {
  const left = local || {};
  const right = remote || {};
  const scores = { ...(right.scores || {}) };
  for (const [key, value] of Object.entries(left.scores || {})) {
    scores[key] = betterScore(scores[key], value);
  }
  const badges = [...new Set([...(right.badges || []), ...(left.badges || [])])];
  const daily = { ...(right.daily || {}) };
  for (const [key, value] of Object.entries(left.daily || {})) {
    daily[key] = mergeDailyEntry(daily[key], value);
  }
  const srs = { ...(right.srs || {}) };
  for (const [key, value] of Object.entries(left.srs || {})) {
    srs[key] = mergeSrsCard(srs[key], value);
  }
  return {
    scores,
    badges,
    streak: mergeStreak(left.streak, right.streak),
    daily,
    srs,
    syncedAt: Date.now(),
  };
}

export function applyLocalProgress(progress) {
  if (!progress || typeof progress !== "object") return;
  const scores = progress.scores || {};
  const keep = new Set(Object.keys(scores).map((k) => SCORE_PREFIX + k));
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(SCORE_PREFIX) && !keep.has(key)) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  for (const [key, value] of Object.entries(scores)) {
    if (!value || !Number.isInteger(value.score) || !Number.isInteger(value.total)) continue;
    writeJson(SCORE_PREFIX + key, { score: value.score, total: value.total });
  }

  writeJson(BADGES_KEY, Array.isArray(progress.badges) ? progress.badges : []);
  writeJson(STREAK_KEY, progress.streak || { last: "", count: 0 });

  const daily = progress.daily || {};
  const dailyKeep = new Set(Object.keys(daily).map((k) => DAILY_PREFIX + k));
  try {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(DAILY_PREFIX) && !dailyKeep.has(key)) toRemove.push(key);
    }
    for (const key of toRemove) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  for (const [key, value] of Object.entries(daily)) {
    writeJson(DAILY_PREFIX + key, value);
  }

  writeJson(SRS_KEY, progress.srs && typeof progress.srs === "object" ? progress.srs : {});
}

async function pullRemoteProgress() {
  const res = await fetch("/api/me/progress", {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.progress || null;
}

async function pushProgress(progress) {
  const res = await fetch("/api/me/progress", {
    method: "PUT",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ progress }),
  });
  return res.ok;
}

export async function syncProgressNow() {
  if (!cachedMe) {
    lastSyncLabel = "";
    return { ok: false, reason: "guest" };
  }
  try {
    const remote = await pullRemoteProgress();
    const local = collectLocalProgress();
    const merged = mergeProgress(local, remote || {});
    applyLocalProgress(merged);
    const ok = await pushProgress(merged);
    lastSyncLabel = ok ? `Synchronisé · ${new Date().toLocaleTimeString("fr-FR")}` : "Échec de sync";
    return { ok, progress: merged };
  } catch {
    lastSyncLabel = "Échec de sync";
    return { ok: false, reason: "network" };
  }
}

export function scheduleProgressSync() {
  if (!cachedMe) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncProgressNow();
  }, 2000);
}

export function installProgressSyncHooks() {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (syncTimer) {
        clearTimeout(syncTimer);
        syncTimer = null;
      }
      void syncProgressNow();
    }
  });
  window.addEventListener("pagehide", () => {
    void syncProgressNow();
  });
}

export function authFlashFromLocation() {
  try {
    const hash = location.hash || "";
    const qIndex = hash.indexOf("?");
    if (qIndex < 0) return "";
    const params = new URLSearchParams(hash.slice(qIndex + 1));
    return String(params.get("auth") || "");
  } catch {
    return "";
  }
}

export function clearAuthFlashFromLocation() {
  const hash = location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex < 0) return;
  history.replaceState(null, "", hash.slice(0, qIndex) || "#profil");
}

export async function bootstrapProfile() {
  await fetchProviders();
  const me = await fetchMe();
  if (me) await syncProgressNow();
  return me;
}
