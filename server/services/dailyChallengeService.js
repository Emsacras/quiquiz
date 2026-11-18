/**
 * Défi du jour global : même catégorie + même seed pour tous (UTC), classement score puis temps.
 */
const fs = require("fs");
const path = require("path");
const { config } = require("../config");
const { seededShuffle, hashSeed } = require("./seededShuffle");
const { buildDuelPack, resolveQuizFile } = require("./duelPackService");
const { getUser, publicUser } = require("./userStore");

const QUESTION_COUNT = 10;

function utcDateKey(d = new Date()) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return fallback;
    }
}

function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 0));
    fs.renameSync(tmp, file);
}

function collectLeaves(nodes, out = []) {
    for (const node of nodes || []) {
        if (node.fichier && !node.aVenir) out.push(node);
        if (node.children) collectLeaves(node.children, out);
    }
    return out;
}

function playableLeaves() {
    const catalogPath = path.join(config.publicRoot, "data", "catalog.json");
    const catalog = readJson(catalogPath, { domains: [] });
    const leaves = collectLeaves(catalog.domains || []);
    return leaves
        .map((leaf) => {
            const id = String(leaf.id || "")
                .trim();
            const fromFile = String(leaf.fichier || "")
                .replace(/^data\//, "")
                .replace(/\.json$/i, "");
            const categoryId = id || fromFile;
            if (!categoryId) return null;
            const file = resolveQuizFile(categoryId);
            if (!file || !fs.existsSync(file)) return null;
            return {
                id: categoryId,
                label: String(leaf.nom || leaf.categorie || categoryId),
                fichier: leaf.fichier
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.id.localeCompare(b.id, "en"));
}

function pickCategoryForDate(date = utcDateKey()) {
    const leaves = playableLeaves();
    if (!leaves.length) return null;
    const shuffled = seededShuffle(leaves, `daily-cat:${date}`);
    return shuffled[0];
}

function boardFile(date) {
    return path.join(config.runtimeDataDir, "daily", `${date}.json`);
}

function loadBoard(date) {
    const data = readJson(boardFile(date), null);
    if (data && Array.isArray(data.entries)) return data;
    return { date, entries: [] };
}

function saveBoard(board) {
    writeJson(boardFile(board.date), {
        date: board.date,
        entries: board.entries
    });
}

function compareEntries(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    if (a.totalMs !== b.totalMs) return a.totalMs - b.totalMs;
    return a.at - b.at;
}

function sortedEntries(entries) {
    return [...entries].sort(compareEntries);
}

function getDailyMeta(date = utcDateKey()) {
    const leaf = pickCategoryForDate(date);
    if (!leaf) return { ok: false, error: "empty" };
    const seed = `${date}:${leaf.id}`;
    const preview = buildDuelPack({
        categoryId: leaf.id,
        difficulty: "melange",
        questionCount: QUESTION_COUNT,
        seed
    });
    if (!preview.ok) return { ok: false, error: preview.error || "pack" };
    return {
        ok: true,
        date,
        categoryId: leaf.id,
        label: preview.label || leaf.label,
        seed,
        questionCount: preview.pack.length
    };
}

function getLeaderboard(date = utcDateKey(), limit = 50) {
    const board = loadBoard(date);
    const meta = getDailyMeta(date);
    const entries = sortedEntries(board.entries).slice(0, Math.max(1, Math.min(100, limit)));
    return {
        ok: true,
        date,
        categoryId: meta.ok ? meta.categoryId : null,
        label: meta.ok ? meta.label : null,
        entries: entries.map((entry, index) => ({
            rank: index + 1,
            userId: entry.userId,
            displayName: entry.displayName,
            avatarUrl: entry.avatarUrl || "",
            score: entry.score,
            total: entry.total,
            totalMs: entry.totalMs,
            at: entry.at
        }))
    };
}

function submitDailyResult({ userId, score, total, totalMs, date = utcDateKey() }) {
    const user = getUser(userId);
    if (!user) return { ok: false, error: "auth" };
    const meta = getDailyMeta(date);
    if (!meta.ok) return { ok: false, error: meta.error || "meta" };

    const board = loadBoard(date);
    if (board.entries.some((entry) => entry.userId === user.id)) {
        return {
            ok: false,
            error: "already",
            leaderboard: getLeaderboard(date),
            mine: board.entries.find((entry) => entry.userId === user.id) || null
        };
    }

    const entry = {
        userId: user.id,
        displayName: user.displayName || "Joueur",
        avatarUrl: user.avatarUrl || "",
        score: Math.max(0, Math.min(Number(total) || 0, Number(score) || 0)),
        total: Math.max(1, Number(total) || meta.questionCount || QUESTION_COUNT),
        totalMs: Math.max(0, Math.min(60 * 60 * 1000, Number(totalMs) || 0)),
        at: Date.now(),
        categoryId: meta.categoryId,
        seed: meta.seed
    };
    board.date = date;
    board.entries.push(entry);
    saveBoard(board);

    const leaderboard = getLeaderboard(date);
    const mineRank =
        leaderboard.entries.find((item) => item.userId === user.id)?.rank || null;
    return { ok: true, entry, rank: mineRank, leaderboard };
}

function myDailyEntry(userId, date = utcDateKey()) {
    if (!userId) return null;
    const board = loadBoard(date);
    return board.entries.find((entry) => entry.userId === String(userId)) || null;
}

module.exports = {
    utcDateKey,
    getDailyMeta,
    getLeaderboard,
    submitDailyResult,
    myDailyEntry,
    QUESTION_COUNT,
    hashSeed
};
