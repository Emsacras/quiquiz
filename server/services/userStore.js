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
        progress: normalizeProgress(user.progress)
    };
}

function normalizeProgress(raw) {
    const base = emptyProgress();
    if (!raw || typeof raw !== "object") return base;
    base.scores = raw.scores && typeof raw.scores === "object" ? raw.scores : {};
    base.badges = Array.isArray(raw.badges) ? raw.badges.filter((b) => typeof b === "string").slice(0, 50) : [];
    base.streak =
        raw.streak && typeof raw.streak === "object"
            ? { last: String(raw.streak.last || ""), count: Math.max(0, Number(raw.streak.count) || 0) }
            : { last: "", count: 0 };
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
        progress: emptyProgress()
    };
    return saveUser(user);
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
    normalizeProgress
};
