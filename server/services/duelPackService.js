/**
 * Pack QCM partagé pour duels (seed serveur).
 */
const fs = require("fs");
const path = require("path");
const { config } = require("../config");
const { seededShuffle } = require("./seededShuffle");

const LEVEL_CAP = 16;

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function collectLeaves(nodes, out = []) {
    for (const node of nodes || []) {
        if (node.fichier) out.push(node);
        if (node.children) collectLeaves(node.children, out);
    }
    return out;
}

function resolveQuizFile(categoryId) {
    const id = String(categoryId || "").trim();
    if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) return null;
    const catalogPath = path.join(config.publicRoot, "data", "catalog.json");
    const catalog = readJson(catalogPath);
    const leaves = collectLeaves(catalog.domains || []);
    const leaf = leaves.find((item) => {
        const fromFile = String(item.fichier || "")
            .replace(/^data\//, "")
            .replace(/\.json$/i, "");
        return item.id === id || fromFile === id;
    });
    if (!leaf?.fichier) {
        const direct = path.join(config.publicRoot, "data", `${id}.json`);
        if (fs.existsSync(direct)) return direct;
        return null;
    }
    const rel = String(leaf.fichier).replace(/^\/+/, "");
    return path.join(config.publicRoot, rel);
}

function loadGroup(groupRef) {
    if (!groupRef) return null;
    if (typeof groupRef === "object") return groupRef;
    const rel = String(groupRef).replace(/^\/+/, "");
    if (!rel.startsWith("data/") || rel.includes("..")) return null;
    const file = path.join(config.publicRoot, rel);
    if (!fs.existsSync(file)) return null;
    try {
        return readJson(file);
    } catch {
        return null;
    }
}

function allQuestions(quiz) {
    const out = [];
    for (const groupRef of quiz.groupes || []) {
        const group = loadGroup(groupRef);
        if (!group) continue;
        for (const q of group.questions || []) {
            out.push({ ...q, groupe: q.groupe || group.id });
        }
    }
    return out;
}

function filterDifficulty(pool, difficulty) {
    if (!difficulty || difficulty === "melange") return pool;
    return pool.filter((q) => q.difficulte === difficulty);
}

/**
 * @returns {{ ok: true, pack, label } | { ok: false, error: string }}
 */
function buildDuelPack({ categoryId, difficulty = "melange", questionCount = 10, seed }) {
    const file = resolveQuizFile(categoryId);
    if (!file || !fs.existsSync(file)) return { ok: false, error: "category" };
    let quiz;
    try {
        quiz = readJson(file);
    } catch {
        return { ok: false, error: "category" };
    }
    const pool = filterDifficulty(allQuestions(quiz), difficulty);
    if (!pool.length) return { ok: false, error: "empty" };

    const useSeed = String(seed || `${Date.now()}:${categoryId}:${difficulty}`);
    const shuffled = seededShuffle(pool, useSeed);
    const n = Math.min(
        Math.max(3, Math.min(LEVEL_CAP, Number(questionCount) || 10)),
        shuffled.length
    );
    const picked = shuffled.slice(0, n);

    const pack = picked.map((q, index) => {
        const options = seededShuffle(
            Array.isArray(q.options) && q.options.length
                ? [...q.options]
                : [q.nom_commun],
            `${useSeed}:opt:${index}`
        );
        const correctIndex = options.indexOf(q.nom_commun);
        return {
            id: String(q.id || `${index}`),
            nom_commun: q.nom_commun,
            nom_scientifique: q.nom_scientifique || "",
            imageQuery: q.imageQuery || "",
            indice: q.indice || "",
            description: q.description || "",
            options,
            correctIndex: correctIndex >= 0 ? correctIndex : 0,
            mediaKind: q.mediaKind || "",
            iso2: q.iso2 || "",
            commonsFile: q.commonsFile || "",
            pays: q.pays || "",
            paysEn: q.paysEn || "",
        };
    });

    return {
        ok: true,
        seed: useSeed,
        label: quiz.categorie || categoryId,
        pack,
    };
}

/** Pack client sans spoiler (sans correctIndex / nom_commun). */
function publicQuestion(q) {
    return {
        id: q.id,
        nom_scientifique: q.nom_scientifique,
        imageQuery: q.imageQuery,
        indice: q.indice,
        options: q.options,
        mediaKind: q.mediaKind,
        iso2: q.iso2,
        commonsFile: q.commonsFile,
        paysEn: q.paysEn,
    };
}

module.exports = { buildDuelPack, publicQuestion, resolveQuizFile };
