/**
 * Jeton court signé après une réponse juste, vérifiée sur les quiz du serveur.
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { config } = require("../config");

const GRANT_TTL_MS = 10 * 60 * 1000;
const indexes = new Map();
const usedNonces = new Map();

function foldName(value) {
    return String(value || "")
        .normalize("NFC")
        .trim()
        .replace(/\s+/g, " ")
        .toLocaleLowerCase("fr");
}

function collectQuestions(node, index) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
        for (const item of node) collectQuestions(item, index);
        return;
    }
    if (typeof node.nom_commun === "string") {
        const answer = foldName(node.nom_commun);
        if (answer) {
            for (const key of [node.nom_scientifique, node.nom_commun]) {
                const id = foldName(key);
                if (!id) continue;
                let answers = index.get(id);
                if (!answers) {
                    answers = new Set();
                    index.set(id, answers);
                }
                answers.add(answer);
            }
        }
    }
    for (const value of Object.values(node)) {
        if (value && typeof value === "object") collectQuestions(value, index);
    }
}

function answerIndex(root) {
    const dir = root || config.publicRoot;
    const dataDir = path.join(dir, "data");
    if (indexes.has(dataDir)) return indexes.get(dataDir);
    const index = new Map();
    const files = [];
    const walk = (current) => {
        let entries = [];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            const abs = path.join(current, entry.name);
            if (entry.isDirectory()) walk(abs);
            else if (entry.isFile() && entry.name.endsWith(".json")) files.push(abs);
        }
    };
    walk(dataDir);
    for (const file of files) {
        try {
            collectQuestions(JSON.parse(fs.readFileSync(file, "utf8")), index);
        } catch {
            /* fichier de quiz illisible : ignoré */
        }
    }
    indexes.set(dataDir, index);
    return index;
}

function recordedCorrectAnswer(name, answer, root) {
    const id = foldName(name);
    const given = foldName(answer);
    if (!id || !given) return false;
    const answers = answerIndex(root).get(id);
    return Boolean(answers && answers.has(given));
}

function signBody(body) {
    return crypto.createHmac("sha256", config.sessionSecret).update(body).digest("base64url");
}

function issueImageGrant({ name, title, answer, ttlMs = GRANT_TTL_MS, root }) {
    const species = String(name || "").trim();
    const cleanTitle = String(title || "").trim();
    if (!species || species.length > 120) return { ok: false, error: "name" };
    if (!cleanTitle || cleanTitle.length > 300) return { ok: false, error: "title" };
    if (!recordedCorrectAnswer(species, answer, root)) return { ok: false, error: "answer" };
    const payload = {
        name: species,
        title: cleanTitle,
        exp: Date.now() + ttlMs,
        nonce: crypto.randomBytes(16).toString("hex")
    };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return { ok: true, token: `${body}.${signBody(body)}` };
}

function pruneNonces(now) {
    if (usedNonces.size < 4000) return;
    for (const [nonce, exp] of usedNonces) {
        if (exp < now) usedNonces.delete(nonce);
    }
}

function takeImageGrant(token, expected, now = Date.now()) {
    if (typeof token !== "string" || token.length < 20 || token.length > 2500) return { ok: false };
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return { ok: false };
    const body = token.slice(0, dot);
    const mac = token.slice(dot + 1);
    const expectedMac = signBody(body);
    const left = Buffer.from(mac);
    const right = Buffer.from(expectedMac);
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return { ok: false };
    let payload;
    try {
        payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    } catch {
        return { ok: false };
    }
    if (!payload || typeof payload.exp !== "number" || payload.exp < now) return { ok: false };
    if (typeof payload.nonce !== "string" || !/^[a-f0-9]{32}$/.test(payload.nonce)) return { ok: false };
    if (payload.name !== expected.name || payload.title !== expected.title) return { ok: false };
    if (usedNonces.has(payload.nonce)) return { ok: false };
    usedNonces.set(payload.nonce, payload.exp);
    pruneNonces(now);
    return { ok: true };
}

module.exports = {
    issueImageGrant,
    recordedCorrectAnswer,
    takeImageGrant
};
