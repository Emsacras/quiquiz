/**
 * Bassins de photos du quiz, validation admin et liste noire.
 * Les photos validées sont téléchargées dans data-runtime/quiz-images/.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { config } = require("../config");

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const WIKIDATA = "https://www.wikidata.org/w/api.php";
const SERVE_CAP = 10;
const CANDIDATE_CAP = 40;
const POOL_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const USER_AGENT = "QuiQuiz/1.0 (educational species quiz; https://quiquiz.fr)";

const FILE_REJECT =
    /distribution|r[ée]partition|verbreitung|locator|drawing|illustration|diagram|schematic|lithograph|engraving|gravure|spectrogram|sonogram|skeleton|skull|painting|artwork|cladogram|\bmaps?\b|\brange\b|\bicon\b|\blogo\b|\beggs?\b|\bnests?\b|\bcartes?\b|\bkarte\b|\bstamp\b|\bfossil\b|\bplate\b/i;

const SUBCAT_REJECT =
    /distribution|r[ée]partition|verbreitung|\bmaps?\b|\bcartes?\b|\beggs?\b|\bnests?\b|skeleton|skull|fossil|anatomy|artwork|\bin art\b|stamp|icon|logo|diagram|cultural|\bvideos?\b|\baudio\b|\bcalls?\b|\bsongs?\b|sonogram|spectrogram/i;

const inflight = new Map();

function runtimeDir() {
    return config.runtimeDataDir;
}

function blacklistFile() {
    return path.join(runtimeDir(), "quiz-blacklist.json");
}

function validatedFile() {
    return path.join(runtimeDir(), "quiz-validated.json");
}

function imagesRoot() {
    return path.join(runtimeDir(), "quiz-images");
}

function safeSpeciesDir(name) {
    return (
        String(name || "")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 80) || "species"
    );
}

function poolFile(name) {
    return path.join(runtimeDir(), "quiz-pools", `${safeSpeciesDir(name)}.json`);
}

function normalizeName(scientificName) {
    return String(scientificName || "")
        .trim()
        .replace(/\s+/g, " ");
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
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
}

function isHttps(value) {
    return typeof value === "string" && value.startsWith("https://");
}

function isPhotoTitle(title) {
    if (typeof title !== "string" || !title.startsWith("File:")) return false;
    const file = title.slice(5);
    if (!/\.(jpe?g|png)$/i.test(file)) return false;
    return !FILE_REJECT.test(file);
}

const MAP_FILE_REJECT =
    /province|department|d[ée]partement|arrondissement|municip|communes?\b|county|oblast|canton|district|electoral|election|[ée]lection|population|language|religion|climate|satellite|relief|orthophoto|historical|history|histoire|flag map|locator map of|highlighted|globe scheme|subdivisions?|\bregions?\b|r[ée]gions?\b|states of|borders of (states|provinces|regions|departments|communes)|gemeinden|kommunen|prefectur|\badm\b|overseas territories|maploc|basemap|physical map|topograph/i;

function isMapTitle(title) {
    if (typeof title !== "string" || !title.startsWith("File:")) return false;
    const file = title.slice(5);
    if (!/\.(jpe?g|png|svg)$/i.test(file)) return false;
    return !MAP_FILE_REJECT.test(file);
}

function isModerationTitle(title) {
    return isPhotoTitle(title) || isMapTitle(title);
}

function extForTitle(title, contentType, sourceUrl) {
    const type = String(contentType || "").toLowerCase();
    const src = String(sourceUrl || "");
    if (type.includes("png") || /\.png(\?|$)/i.test(src)) return "png";
    if (type.includes("jpeg") || type.includes("jpg") || /\.jpe?g(\?|$)/i.test(src)) return "jpg";
    if (/\.png$/i.test(String(title || ""))) return "png";
    if (/\.svg$/i.test(String(title || ""))) return "png";
    return "jpg";
}

function mediaPublicUrl(localRel) {
    const parts = String(localRel || "")
        .split(/[/\\]/)
        .filter(Boolean);
    if (parts.length !== 2) return "";
    return `/api/media/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
}

function readBlacklistEntries() {
    const data = readJson(blacklistFile(), []);
    if (!Array.isArray(data)) return [];
    const out = [];
    const seen = new Set();
    for (const entry of data) {
        let title = "";
        let url = "";
        let name = "";
        let savedAt = 0;
        if (typeof entry === "string") {
            title = entry.trim();
        } else if (entry && typeof entry === "object") {
            title = String(entry.title || "").trim();
            url = isHttps(entry.url) ? entry.url : "";
            name = normalizeName(entry.name || "");
            savedAt = Number(entry.savedAt) || 0;
        }
        if (!isModerationTitle(title) || seen.has(title)) continue;
        seen.add(title);
        out.push({ title, url, name, savedAt });
    }
    return out;
}

function writeBlacklistEntries(entries) {
    writeJson(
        blacklistFile(),
        entries.map((entry) => ({
            title: entry.title,
            url: entry.url || "",
            name: entry.name || "",
            savedAt: entry.savedAt || Date.now()
        }))
    );
}

function blacklistTitleSet() {
    return new Set(readBlacklistEntries().map((entry) => entry.title));
}

function readValidatedStore() {
    const data = readJson(validatedFile(), {});
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

function writeValidatedStore(store) {
    writeJson(validatedFile(), store);
}

function validatedEntriesFor(name) {
    const store = readValidatedStore();
    const list = store[name];
    if (!Array.isArray(list)) return [];
    return list.filter(
        (entry) =>
            entry &&
            isModerationTitle(entry.title) &&
            typeof entry.local === "string" &&
            entry.local.includes("/")
    );
}

function absoluteLocalPath(localRel) {
    const parts = String(localRel || "")
        .split(/[/\\]/)
        .filter(Boolean);
    if (parts.length !== 2) return "";
    if (!/^[a-z0-9-]{1,80}$/.test(parts[0])) return "";
    if (!/^[a-f0-9]{8,40}\.(jpe?g|png)$/i.test(parts[1])) return "";
    return path.join(imagesRoot(), parts[0], parts[1]);
}

function deleteLocalFile(localRel) {
    const abs = absoluteLocalPath(localRel);
    if (!abs) return;
    try {
        fs.unlinkSync(abs);
    } catch {
        /* déjà absent */
    }
}

function toValidatedPublic(entry) {
    return {
        title: entry.title,
        url: mediaPublicUrl(entry.local),
        validated: true,
        sourceUrl: isHttps(entry.sourceUrl) ? entry.sourceUrl : ""
    };
}

function readPool(name) {
    const data = readJson(poolFile(name), null);
    if (!data || data.name !== name || !Array.isArray(data.items)) return null;
    return data;
}

function writePool(name, items) {
    writeJson(poolFile(name), { name, savedAt: Date.now(), items });
}

function filterItems(items, blacklist) {
    const blocked = blacklist instanceof Set ? blacklist : new Set(blacklist || []);
    const seen = new Set();
    const out = [];
    for (const item of items || []) {
        if (!item || !isPhotoTitle(item.title) || !isHttps(item.url)) continue;
        if (blocked.has(item.title) || seen.has(item.title)) continue;
        seen.add(item.title);
        out.push({ title: item.title, url: item.url });
    }
    return out.slice(0, CANDIDATE_CAP);
}

function mergeItems(previous, incoming) {
    const seen = new Set();
    const out = [];
    for (const item of [...(incoming || []), ...(previous || [])]) {
        if (!item || !isPhotoTitle(item.title) || !isHttps(item.url) || seen.has(item.title)) continue;
        seen.add(item.title);
        out.push({ title: item.title, url: item.url });
        if (out.length >= CANDIDATE_CAP) break;
    }
    return out;
}

function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

async function commonsJson(params) {
    const url = new URL(COMMONS);
    url.searchParams.set("format", "json");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
    if (!response.ok) throw new Error(`commons ${response.status}`);
    return response.json();
}

async function listMembers(categoryTitle, cmtype, limit) {
    const titles = [];
    let cont = "";
    while (titles.length < limit) {
        const params = {
            action: "query",
            list: "categorymembers",
            cmtitle: categoryTitle,
            cmtype,
            cmlimit: "50"
        };
        if (cont) params.cmcontinue = cont;
        const data = await commonsJson(params);
        for (const member of data?.query?.categorymembers || []) {
            if (typeof member.title === "string") titles.push(member.title);
            if (titles.length >= limit) break;
        }
        cont = data?.continue?.cmcontinue || "";
        if (!cont) break;
    }
    return titles;
}

async function resolveItems(fileTitles) {
    const items = [];
    for (let index = 0; index < fileTitles.length; index += 8) {
        const batch = fileTitles.slice(index, index + 8).filter(isPhotoTitle);
        if (!batch.length) continue;
        let data;
        try {
            data = await commonsJson({
                action: "query",
                titles: batch.join("|"),
                prop: "imageinfo",
                iiprop: "url|mime|size"
            });
        } catch {
            continue;
        }
        for (const page of Object.values(data?.query?.pages || {})) {
            const info = page?.imageinfo?.[0];
            const title = page?.title;
            if (!info || !isPhotoTitle(title)) continue;
            if (info.mime && !/^image\/(jpeg|png)$/i.test(info.mime)) continue;
            const chosen = isHttps(info.url) ? info.url : info.thumburl;
            if (!isHttps(chosen)) continue;
            items.push({ title, url: chosen });
        }
    }
    return items;
}

async function categoryItems(scientificName, cap) {
    const category = `Category:${scientificName.trim().replace(/\s+/g, "_")}`;
    let files = (await listMembers(category, "file", cap)).filter(isPhotoTitle);
    if (files.length < 20) {
        const subs = (await listMembers(category, "subcat", 30))
            .filter((title) => !SUBCAT_REJECT.test(String(title).replace(/^Category:/i, "")))
            .slice(0, 6);
        for (const sub of subs) {
            if (files.length >= cap) break;
            const nested = (await listMembers(sub, "file", 20)).filter(isPhotoTitle);
            files = [...new Set([...files, ...nested])];
        }
    }
    return resolveItems(files.slice(0, cap));
}

async function wikidataCategory(scientificName) {
    const epithet = scientificName.trim().split(/\s+/).pop().toLowerCase();
    const searchUrl = new URL(WIKIDATA);
    searchUrl.searchParams.set("action", "wbsearchentities");
    searchUrl.searchParams.set("search", scientificName);
    searchUrl.searchParams.set("language", "en");
    searchUrl.searchParams.set("type", "item");
    searchUrl.searchParams.set("limit", "5");
    searchUrl.searchParams.set("format", "json");
    const searchResponse = await fetch(searchUrl, { headers: { "User-Agent": USER_AGENT } });
    if (!searchResponse.ok) return "";
    const search = await searchResponse.json();
    const hit = (search.search || []).find((item) => {
        const description = String(item.description || "").toLowerCase();
        const blob = `${item.label || ""} ${description}`.toLowerCase();
        return blob.includes(epithet);
    });
    if (!hit?.id) return "";
    const claimsUrl = new URL(WIKIDATA);
    claimsUrl.searchParams.set("action", "wbgetclaims");
    claimsUrl.searchParams.set("entity", hit.id);
    claimsUrl.searchParams.set("property", "P373");
    claimsUrl.searchParams.set("format", "json");
    const claimsResponse = await fetch(claimsUrl, { headers: { "User-Agent": USER_AGENT } });
    if (!claimsResponse.ok) return "";
    const claims = await claimsResponse.json();
    const value = claims?.claims?.P373?.[0]?.mainsnak?.datavalue?.value;
    return typeof value === "string" ? value : "";
}

async function fetchCommonsItems(scientificName) {
    let items = await categoryItems(scientificName, CANDIDATE_CAP);
    if (items.length >= 12) return items.slice(0, CANDIDATE_CAP);
    const parts = scientificName.trim().split(/\s+/);
    if (parts.length > 2) {
        const shortItems = await categoryItems(parts.slice(0, 2).join(" "), CANDIDATE_CAP);
        items = mergeItems(items, shortItems);
    }
    if (items.length < 12) {
        try {
            const alias = await wikidataCategory(scientificName);
            const aliasName = alias.replace(/_/g, " ").trim();
            if (aliasName && aliasName.toLowerCase() !== scientificName.trim().toLowerCase()) {
                const aliasItems = await categoryItems(aliasName, CANDIDATE_CAP);
                items = mergeItems(items, aliasItems);
            }
        } catch {
            /* Wikidata facultatif */
        }
    }
    return items.slice(0, CANDIDATE_CAP);
}

async function loadCandidatePool(name) {
    const blacklist = blacklistTitleSet();
    const stored = readPool(name);
    const fresh = stored && Date.now() - Number(stored.savedAt) < POOL_TTL_MS && stored.items.length > 0;
    if (fresh) return filterItems(stored.items, blacklist);

    let incoming = [];
    try {
        incoming = await fetchCommonsItems(name);
    } catch (error) {
        console.warn("[quiz-pool]", name, error && error.message ? error.message : error);
    }
    const merged = mergeItems(stored?.items || [], incoming);
    if (merged.length) writePool(name, merged);
    else if (stored?.items?.length) return filterItems(stored.items, blacklist);
    return filterItems(merged, blacklist);
}

function getCandidatePool(scientificName) {
    const name = normalizeName(scientificName);
    if (!name || name.length > 120) return Promise.resolve([]);
    if (inflight.has(name)) return inflight.get(name);
    const task = loadCandidatePool(name).finally(() => inflight.delete(name));
    inflight.set(name, task);
    return task;
}

async function getPool(scientificName, options = {}) {
    const name = normalizeName(scientificName);
    if (!name || name.length > 120) return [];

    const validated = validatedEntriesFor(name)
        .map(toValidatedPublic)
        .filter((item) => item.url);
    if (options && options.validatedOnly) {
        return shuffle(validated).slice(0, SERVE_CAP);
    }
    if (validated.length >= SERVE_CAP) {
        return shuffle(validated).slice(0, SERVE_CAP);
    }

    const blocked = blacklistTitleSet();
    const validatedTitles = new Set(validated.map((item) => item.title));
    const candidates = await getCandidatePool(name);
    const fillers = shuffle(
        candidates.filter((item) => !validatedTitles.has(item.title) && !blocked.has(item.title))
    ).slice(0, SERVE_CAP - validated.length);

    return [
        ...shuffle(validated),
        ...fillers.map((item) => ({ title: item.title, url: item.url, validated: false }))
    ];
}

async function downloadLocalImage(name, title, sourceUrl) {
    const response = await fetch(sourceUrl, {
        headers: { "User-Agent": USER_AGENT, Accept: "image/*,*/*" },
        redirect: "follow"
    });
    if (!response.ok) throw new Error(`download ${response.status}`);
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.startsWith("image/")) {
        throw new Error("not-image");
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new Error("size");
    const dirName = safeSpeciesDir(name);
    const hash = crypto.createHash("sha1").update(title).digest("hex").slice(0, 16);
    const filename = `${hash}.${extForTitle(title, contentType, sourceUrl)}`;
    const absDir = path.join(imagesRoot(), dirName);
    fs.mkdirSync(absDir, { recursive: true });
    const abs = path.join(absDir, filename);
    fs.writeFileSync(abs, buffer);
    return `${dirName}/${filename}`;
}

function removeFromBlacklist(title) {
    const clean = String(title || "").trim();
    const next = readBlacklistEntries().filter((entry) => entry.title !== clean);
    writeBlacklistEntries(next);
}

function removeValidatedByTitle(title) {
    const clean = String(title || "").trim();
    const store = readValidatedStore();
    let removed = null;
    for (const [name, list] of Object.entries(store)) {
        if (!Array.isArray(list)) continue;
        const idx = list.findIndex((entry) => entry && entry.title === clean);
        if (idx < 0) continue;
        removed = { name, entry: list[idx] };
        list.splice(idx, 1);
        if (!list.length) delete store[name];
        else store[name] = list;
        break;
    }
    if (removed) {
        writeValidatedStore(store);
        if (removed.entry?.local) deleteLocalFile(removed.entry.local);
    }
    return removed;
}

async function validatePhoto({ name, title, url }) {
    const species = normalizeName(name);
    const cleanTitle = String(title || "").trim();
    const sourceUrl = String(url || "").trim();
    if (!species || species.length > 120) return { ok: false, error: "name" };
    if (!isModerationTitle(cleanTitle) || cleanTitle.length > 300) return { ok: false, error: "title" };
    if (!isHttps(sourceUrl)) return { ok: false, error: "url" };

    removeFromBlacklist(cleanTitle);
    removeValidatedByTitle(cleanTitle);

    let local;
    try {
        local = await downloadLocalImage(species, cleanTitle, sourceUrl);
    } catch (error) {
        console.warn("[quiz-validate]", error && error.message ? error.message : error);
        return { ok: false, error: "download" };
    }

    const store = readValidatedStore();
    const list = Array.isArray(store[species]) ? store[species] : [];
    list.push({
        title: cleanTitle,
        sourceUrl,
        local,
        savedAt: Date.now()
    });
    store[species] = list;
    writeValidatedStore(store);

    return {
        ok: true,
        item: {
            name: species,
            title: cleanTitle,
            url: mediaPublicUrl(local),
            sourceUrl,
            validated: true,
            savedAt: Date.now()
        }
    };
}

function blacklistPhoto({ name, title, url }) {
    const cleanTitle = String(title || "").trim();
    if (!isModerationTitle(cleanTitle) || cleanTitle.length > 300) return { ok: false, error: "title" };
    removeValidatedByTitle(cleanTitle);
    const list = readBlacklistEntries();
    if (!list.some((entry) => entry.title === cleanTitle)) {
        list.push({
            title: cleanTitle,
            url: isHttps(url) ? String(url).trim() : "",
            name: normalizeName(name || ""),
            savedAt: Date.now()
        });
        writeBlacklistEntries(list);
    }
    return { ok: true };
}

async function restoreValidatedFromBlacklist({ title }) {
    const cleanTitle = String(title || "").trim();
    const entry = readBlacklistEntries().find((item) => item.title === cleanTitle);
    if (!entry) return { ok: false, error: "missing" };
    if (!entry.url || !entry.name) return { ok: false, error: "incomplete" };
    return validatePhoto({ name: entry.name, title: entry.title, url: entry.url });
}

function listValidated() {
    const store = readValidatedStore();
    const items = [];
    for (const [name, list] of Object.entries(store)) {
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
            if (!entry || !isModerationTitle(entry.title) || !entry.local) continue;
            items.push({
                name,
                title: entry.title,
                url: mediaPublicUrl(entry.local),
                sourceUrl: isHttps(entry.sourceUrl) ? entry.sourceUrl : "",
                savedAt: Number(entry.savedAt) || 0,
                validated: true
            });
        }
    }
    items.sort((a, b) => String(a.name).localeCompare(String(b.name), "fr") || String(a.title).localeCompare(String(b.title)));
    return items;
}

function listBlacklist() {
    return readBlacklistEntries()
        .map((entry) => ({
            title: entry.title,
            url: entry.url || "",
            name: entry.name || "",
            savedAt: entry.savedAt || 0
        }))
        .sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

async function listCandidates(scientificName) {
    const name = normalizeName(scientificName);
    if (!name || name.length > 120) return { name: "", validated: [], candidates: [] };
    const validated = validatedEntriesFor(name).map((entry) => ({
        ...toValidatedPublic(entry),
        name,
        savedAt: Number(entry.savedAt) || 0
    }));
    const validatedTitles = new Set(validated.map((item) => item.title));
    const blocked = blacklistTitleSet();
    const pool = await getCandidatePool(name);
    const candidates = pool
        .filter((item) => !validatedTitles.has(item.title) && !blocked.has(item.title))
        .map((item) => ({ title: item.title, url: item.url, validated: false, name }));
    return { name, validated, candidates };
}

function resolveMediaFile(speciesDir, filename) {
    const dir = String(speciesDir || "");
    const file = String(filename || "");
    if (!/^[a-z0-9-]{1,80}$/.test(dir)) return null;
    if (!/^[a-f0-9]{8,40}\.(jpe?g|png)$/i.test(file)) return null;
    const root = path.resolve(imagesRoot());
    const abs = path.resolve(root, dir, file);
    if (!abs.startsWith(root + path.sep)) return null;
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
    return abs;
}

module.exports = {
    SERVE_CAP,
    getPool,
    getCandidatePool,
    listCandidates,
    validatePhoto,
    blacklistPhoto,
    restoreValidatedFromBlacklist,
    listValidated,
    listBlacklist,
    removeFromBlacklist,
    resolveMediaFile
};

