/**
 * Profils joueurs (JSON sous data-runtime/users/).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { config } = require("../config");

const usersDir = () => path.join(config.runtimeDataDir, "users");
const indexFile = () => path.join(usersDir(), "index.json");
const userFile = (id) => path.join(usersDir(), `${id}.json`);

function ensureDirs() {
    fs.mkdirSync(usersDir(), { recursive: true });
}

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJson(file, data) {
    ensureDirs();
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 0));
    fs.renameSync(tmp, file);
}

function emptyProgress() {
    return {
        scores: {},
        badges: [],
        streak: { last: "", count: 0 },
        dailyPerfectLog: {},
        stats: { perfectCount: 0, playedCategories: [] },
        daily: {},
        srs: {},
        syncedAt: 0
    };
}

function readIndex() {
    const data = readJson(indexFile(), { steam: {}, google: {} });
    return {
        steam: data.steam && typeof data.steam === "object" ? data.steam : {},
        google: data.google && typeof data.google === "object" ? data.google : {}
    };
}

function writeIndex(index) {
    writeJson(indexFile(), index);
}

function emptyFriends() {
    return { incoming: [], outgoing: [], accepted: [] };
}

function normalizeIdList(list, max = 200) {
    if (!Array.isArray(list)) return [];
    return [...new Set(list.map((id) => String(id || "").trim()).filter(Boolean))].slice(0, max);
}

function normalizeFriends(raw) {
    const base = emptyFriends();
    if (!raw || typeof raw !== "object") return base;
    return {
        incoming: normalizeIdList(raw.incoming),
        outgoing: normalizeIdList(raw.outgoing),
        accepted: normalizeIdList(raw.accepted)
    };
}

function normalizeDuelHistory(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((item) => item && typeof item === "object")
        .slice(0, 20)
        .map((item) => ({
            at: Number(item.at) || Date.now(),
            opponentName: String(item.opponentName || "Adversaire").slice(0, 40),
            opponentId: item.opponentId ? String(item.opponentId) : null,
            score: Math.max(0, Number(item.score) || 0),
            opponentScore: Math.max(0, Number(item.opponentScore) || 0),
            totalMs: Math.max(0, Number(item.totalMs) || 0),
            opponentTotalMs: Math.max(0, Number(item.opponentTotalMs) || 0),
            result: ["win", "loss", "draw"].includes(item.result) ? item.result : "draw",
            categoryId: String(item.categoryId || "").slice(0, 64),
            label: String(item.label || "").slice(0, 80)
        }));
}

function sanitizeUser(user) {
    if (!user || typeof user !== "object") return null;
    return {
        id: String(user.id || ""),
        displayName: String(user.displayName || "").slice(0, 40),
        avatarUrl: String(user.avatarUrl || "").slice(0, 500),
        steamId: user.steamId ? String(user.steamId) : null,
        googleId: user.googleId ? String(user.googleId) : null,
        createdAt: Number(user.createdAt) || Date.now(),
        updatedAt: Number(user.updatedAt) || Date.now(),
        progress: normalizeProgress(user.progress),
        friends: normalizeFriends(user.friends),
        duelHistory: normalizeDuelHistory(user.duelHistory)
    };
}

function normalizeProgress(raw) {
    const base = emptyProgress();
    if (!raw || typeof raw !== "object") return base;
    base.scores = raw.scores && typeof raw.scores === "object" ? raw.scores : {};
    base.badges = Array.isArray(raw.badges)
        ? raw.badges.filter((b) => typeof b === "string").slice(0, 400)
        : [];
    base.streak =
        raw.streak && typeof raw.streak === "object"
            ? { last: String(raw.streak.last || ""), count: Math.max(0, Number(raw.streak.count) || 0) }
            : { last: "", count: 0 };
    base.dailyPerfectLog = (() => {
        const src = raw.dailyPerfectLog && typeof raw.dailyPerfectLog === "object" ? raw.dailyPerfectLog : {};
        const out = {};
        for (const [date, list] of Object.entries(src)) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(list)) continue;
            const ids = [...new Set(list.map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 40);
            if (ids.length) out[date] = ids;
        }
        return out;
    })();
    const stats = raw.stats && typeof raw.stats === "object" ? raw.stats : {};
    base.stats = {
        perfectCount: Math.max(0, Number(stats.perfectCount) || 0),
        playedCategories: Array.isArray(stats.playedCategories)
            ? stats.playedCategories.filter((id) => typeof id === "string").slice(0, 200)
            : []
    };
    base.daily = raw.daily && typeof raw.daily === "object" ? raw.daily : {};
    base.srs = raw.srs && typeof raw.srs === "object" ? raw.srs : {};
    base.syncedAt = Number(raw.syncedAt) || 0;
    return base;
}

function getUser(id) {
    const clean = String(id || "").trim();
    if (!/^[a-f0-9-]{8,64}$/i.test(clean)) return null;
    return sanitizeUser(readJson(userFile(clean), null));
}

function saveUser(user) {
    const clean = sanitizeUser(user);
    if (!clean || !clean.id) throw new Error("invalid_user");
    clean.updatedAt = Date.now();
    writeJson(userFile(clean.id), clean);
    const index = readIndex();
    if (clean.steamId) index.steam[clean.steamId] = clean.id;
    if (clean.googleId) index.google[clean.googleId] = clean.id;
    // Nettoie les anciennes entrées pointant vers cet id si provider retiré.
    for (const [sid, uid] of Object.entries(index.steam)) {
        if (uid === clean.id && sid !== clean.steamId) delete index.steam[sid];
    }
    for (const [gid, uid] of Object.entries(index.google)) {
        if (uid === clean.id && gid !== clean.googleId) delete index.google[gid];
    }
    writeIndex(index);
    return clean;
}

function findByProvider(provider, providerId) {
    const id = String(providerId || "").trim();
    if (!id) return null;
    const index = readIndex();
    const userId = provider === "steam" ? index.steam[id] : provider === "google" ? index.google[id] : null;
    if (!userId) return null;
    return getUser(userId);
}

function createUser({ displayName, avatarUrl, steamId, googleId }) {
    const user = {
        id: crypto.randomUUID(),
        displayName: String(displayName || "Joueur").slice(0, 40),
        avatarUrl: String(avatarUrl || "").slice(0, 500),
        steamId: steamId ? String(steamId) : null,
        googleId: googleId ? String(googleId) : null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        progress: emptyProgress(),
        friends: emptyFriends(),
        duelHistory: []
    };
    return saveUser(user);
}

function listUsers() {
    ensureDirs();
    const out = [];
    for (const name of fs.readdirSync(usersDir())) {
        if (!name.endsWith(".json") || name === "index.json") continue;
        const user = getUser(name.replace(/\.json$/i, ""));
        if (user) out.push(user);
    }
    return out;
}

function searchUsers(query, excludeId = "", limit = 12) {
    const q = String(query || "")
        .trim()
        .toLowerCase();
    if (q.length < 2) return [];
    const exclude = String(excludeId || "");
    return listUsers()
        .filter((user) => user.id !== exclude && user.displayName.toLowerCase().includes(q))
        .slice(0, Math.max(1, Math.min(30, limit)))
        .map((user) => publicUser(user));
}

function friendLists(userId) {
    const user = getUser(userId);
    if (!user) return null;
    const mapPublic = (ids) =>
        ids.map((id) => publicUser(getUser(id))).filter(Boolean);
    return {
        incoming: mapPublic(user.friends.incoming),
        outgoing: mapPublic(user.friends.outgoing),
        accepted: mapPublic(user.friends.accepted)
    };
}

function requestFriend(fromId, toId) {
    const from = getUser(fromId);
    const to = getUser(toId);
    if (!from || !to) return { ok: false, error: "missing" };
    if (from.id === to.id) return { ok: false, error: "self" };
    if (from.friends.accepted.includes(to.id)) return { ok: false, error: "already" };
    if (from.friends.outgoing.includes(to.id)) return { ok: false, error: "pending" };
    if (from.friends.incoming.includes(to.id)) {
        return acceptFriend(from.id, to.id);
    }
    from.friends.outgoing = normalizeIdList([...from.friends.outgoing, to.id]);
    to.friends.incoming = normalizeIdList([...to.friends.incoming, from.id]);
    saveUser(from);
    saveUser(to);
    return { ok: true, friends: friendLists(from.id) };
}

function acceptFriend(userId, fromId) {
    const user = getUser(userId);
    const other = getUser(fromId);
    if (!user || !other) return { ok: false, error: "missing" };
    if (!user.friends.incoming.includes(other.id)) return { ok: false, error: "pending" };
    user.friends.incoming = user.friends.incoming.filter((id) => id !== other.id);
    other.friends.outgoing = other.friends.outgoing.filter((id) => id !== user.id);
    user.friends.accepted = normalizeIdList([...user.friends.accepted, other.id]);
    other.friends.accepted = normalizeIdList([...other.friends.accepted, user.id]);
    saveUser(user);
    saveUser(other);
    return { ok: true, friends: friendLists(user.id) };
}

function declineFriend(userId, fromId) {
    const user = getUser(userId);
    const other = getUser(fromId);
    if (!user || !other) return { ok: false, error: "missing" };
    user.friends.incoming = user.friends.incoming.filter((id) => id !== other.id);
    other.friends.outgoing = other.friends.outgoing.filter((id) => id !== user.id);
    saveUser(user);
    saveUser(other);
    return { ok: true, friends: friendLists(user.id) };
}

function removeFriend(userId, otherId) {
    const user = getUser(userId);
    const other = getUser(otherId);
    if (!user || !other) return { ok: false, error: "missing" };
    user.friends.accepted = user.friends.accepted.filter((id) => id !== other.id);
    user.friends.outgoing = user.friends.outgoing.filter((id) => id !== other.id);
    user.friends.incoming = user.friends.incoming.filter((id) => id !== other.id);
    other.friends.accepted = other.friends.accepted.filter((id) => id !== user.id);
    other.friends.outgoing = other.friends.outgoing.filter((id) => id !== user.id);
    other.friends.incoming = other.friends.incoming.filter((id) => id !== user.id);
    saveUser(user);
    saveUser(other);
    return { ok: true, friends: friendLists(user.id) };
}

function appendDuelHistory(userId, entry) {
    const user = getUser(userId);
    if (!user) return;
    user.duelHistory = normalizeDuelHistory([entry, ...(user.duelHistory || [])]);
    saveUser(user);
}

function areFriends(aId, bId) {
    const a = getUser(aId);
    return Boolean(a && a.friends.accepted.includes(String(bId || "")));
}

/**
 * Connecte ou lie un provider.
 * @returns {{ user, created, linked, conflict }}
 */
function upsertFromProvider(provider, profile, linkUserId = null) {
    const providerId = String(profile.id || "").trim();
    if (!providerId || (provider !== "steam" && provider !== "google")) {
        return { user: null, created: false, linked: false, conflict: false };
    }

    const existing = findByProvider(provider, providerId);
    const linkTarget = linkUserId ? getUser(linkUserId) : null;

    if (existing) {
        if (linkTarget && linkTarget.id !== existing.id) {
            return { user: null, created: false, linked: false, conflict: true };
        }
        let changed = false;
        if (profile.displayName && !existing.displayName) {
            existing.displayName = String(profile.displayName).slice(0, 40);
            changed = true;
        }
        if (profile.avatarUrl && profile.avatarUrl !== existing.avatarUrl) {
            existing.avatarUrl = String(profile.avatarUrl).slice(0, 500);
            changed = true;
        }
        if (changed) saveUser(existing);
        return { user: existing, created: false, linked: false, conflict: false };
    }

    if (linkTarget) {
        const field = provider === "steam" ? "steamId" : "googleId";
        if (linkTarget[field]) {
            return { user: null, created: false, linked: false, conflict: true };
        }
        linkTarget[field] = providerId;
        if (profile.displayName && !linkTarget.displayName) {
            linkTarget.displayName = String(profile.displayName).slice(0, 40);
        }
        if (profile.avatarUrl && !linkTarget.avatarUrl) {
            linkTarget.avatarUrl = String(profile.avatarUrl).slice(0, 500);
        }
        return { user: saveUser(linkTarget), created: false, linked: true, conflict: false };
    }

    const user = createUser({
        displayName: profile.displayName || "Joueur",
        avatarUrl: profile.avatarUrl || "",
        steamId: provider === "steam" ? providerId : null,
        googleId: provider === "google" ? providerId : null
    });
    return { user, created: true, linked: false, conflict: false };
}

function unlinkProvider(userId, provider) {
    const user = getUser(userId);
    if (!user) return { ok: false, error: "missing" };
    const hasSteam = Boolean(user.steamId);
    const hasGoogle = Boolean(user.googleId);
    if (provider === "steam") {
        if (!hasSteam) return { ok: false, error: "not_linked" };
        if (!hasGoogle) return { ok: false, error: "last_provider" };
        user.steamId = null;
    } else if (provider === "google") {
        if (!hasGoogle) return { ok: false, error: "not_linked" };
        if (!hasSteam) return { ok: false, error: "last_provider" };
        user.googleId = null;
    } else {
        return { ok: false, error: "provider" };
    }
    return { ok: true, user: saveUser(user) };
}

function setDisplayName(userId, name) {
    const user = getUser(userId);
    if (!user) return { ok: false, error: "missing" };
    const clean = String(name || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 40);
    if (clean.length < 2) return { ok: false, error: "name" };
    user.displayName = clean;
    return { ok: true, user: saveUser(user) };
}

function getProgress(userId) {
    const user = getUser(userId);
    return user ? user.progress : null;
}

function saveProgress(userId, progress) {
    const user = getUser(userId);
    if (!user) return { ok: false, error: "missing" };
    user.progress = normalizeProgress({ ...progress, syncedAt: Date.now() });
    return { ok: true, user: saveUser(user), progress: user.progress };
}

function publicUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        steamLinked: Boolean(user.steamId),
        googleLinked: Boolean(user.googleId)
    };
}

function steamIdOf(userId) {
    const user = getUser(userId);
    return user?.steamId || null;
}

module.exports = {
    emptyProgress,
    getUser,
    findByProvider,
    createUser,
    upsertFromProvider,
    unlinkProvider,
    setDisplayName,
    getProgress,
    saveProgress,
    publicUser,
    steamIdOf,
    normalizeProgress,
    searchUsers,
    friendLists,
    requestFriend,
    acceptFriend,
    declineFriend,
    removeFriend,
    appendDuelHistory,
    areFriends
};
