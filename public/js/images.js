/**
 * Photos d'espèces via Wikimedia Commons.
 * Ajouter une catégorie de quiz ne demande aucun changement ici :
 * chaque question fournit seulement son nom scientifique.
 *
 * 1. Fichiers de Category:{Nom_scientifique} sur Commons
 * 2. Si la catégorie est pauvre, quelques sous-catégories (mâle, femelle, etc.)
 * 3. Si le nom est un synonyme, catégorie Commons indiquée par Wikidata (P373)
 * 4. Sinon, une image de secours via le résumé Wikipédia (fr, puis en)
 *
 * Les chants suivent le même chemin Commons, dans les catégories audio de l'espèce.
 *
 * La liste d'URL est mise en cache 30 jours. Le choix affiché reste aléatoire.
 * Sur QuiQuiz, le bassin serveur (jusqu'à 10 photos) est lu en premier.
 * Les photos validées (locales) y sont prioritaires. Ce cache ne remplace pas le bassin.
 */

const COMMONS = "https://commons.wikimedia.org/w/api.php";
const WIKIDATA = "https://www.wikidata.org/w/api.php";
const CACHE_PREFIX = "birdquiz:images:";
const CACHE_VERSION = 1;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_GAP_MS = 180;
const MAX_IMAGES = 15;

const FILE_REJECT =
  /distribution|r[ée]partition|verbreitung|locator|drawing|illustration|diagram|schematic|lithograph|engraving|gravure|spectrogram|sonogram|skeleton|skull|painting|artwork|cladogram|\bmaps?\b|\brange\b|\bicon\b|\blogo\b|\beggs?\b|\bnests?\b|\bcartes?\b|\bkarte\b|\bstamp\b|\bfossil\b|\bplate\b/i;

const FISH_UNSAFE =
  /\bmorts?\b|morte|carcass|carcasse|\bdead\b|specimen|sp[ée]cimen|museum|mus[ée]e|taxiderm|market|march[ée]|poissonnerie|food|cuisine|\bdish(?:es)?\b|\bplats?\b|sushi|\bfilets?\b|\bfrit(?:e|es|s)?\b|\bfried\b|fum[ée]|s[ée]ch|dried|smoked|aquarium|\bzoos?\b|captiv|fish[\s_-]?tank/i;

const SUBCAT_REJECT =
  /distribution|r[ée]partition|verbreitung|\bmaps?\b|\bcartes?\b|\beggs?\b|\bnests?\b|skeleton|skull|fossil|anatomy|artwork|\bin art\b|stamp|icon|logo|diagram|cultural|\bvideos?\b|\baudio\b|\bcalls?\b|\bsongs?\b|sonogram|spectrogram/i;

const speciesQueue = [];
const pending = new Map();
const memoryPools = new Map();
let safeFish = false;
let outlineMaps = false;

const MAP_FILE_REJECT =
  /province|department|d[ée]partement|arrondissement|municip|communes?\b|county|oblast|canton|district|electoral|election|[ée]lection|population|language|religion|climate|satellite|relief|orthophoto|historical|history|histoire|flag map|locator map of|highlighted|globe scheme|subdivisions?|\bregions?\b|r[ée]gions?\b|states of|borders of (states|provinces|regions|departments|communes)|gemeinden|kommunen|prefectur|\badm\b|overseas territories|maploc|basemap|physical map|topograph/i;

const MAP_FILE_PREFER =
  /\bcontour\b|\bsilhouette\b|\bkoort\b|black contour|blank map(?! of communes)|ohne\b|no[_ ]?(labels?|text|names?|cities|departments?)|without[_ ]?(labels?|text|names?|borders)|simple map/i;

export function setSafeFish(enabled) {
  safeFish = Boolean(enabled);
}

export function setOutlineMaps(enabled) {
  outlineMaps = Boolean(enabled);
}

function poolKey(scientificName) {
  if (outlineMaps) return `map:${scientificName}`;
  if (safeFish) return `safe:${scientificName}`;
  return scientificName;
}
const titleByUrl = new Map();
const metaByUrl = new Map();
const rejectedTitles = new Set();
let pumping = false;
let lastRequestAt = 0;

function servedFromQuizApi() {
  return typeof location !== "undefined" && !location.protocol.startsWith("file");
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function creditFromExtmetadata(extmetadata, title) {
  const meta = extmetadata || {};
  const license = stripHtml(meta.LicenseShortName?.value || "");
  const artist = stripHtml(meta.Artist?.value || meta.Credit?.value || "");
  const licenseUrl = String(meta.LicenseUrl?.value || "").trim();
  const commonsPage = title
    ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(title).replace(/\s+/g, "_"))}`
    : "";
  return {
    artist: artist.slice(0, 200),
    license: license.slice(0, 80),
    licenseUrl: licenseUrl.startsWith("https://") ? licenseUrl : "",
    commonsPage,
  };
}

function rememberItems(items) {
  for (const item of items || []) {
    if (!item?.url) continue;
    if (item.title) titleByUrl.set(item.url, item.title);
    const prev = metaByUrl.get(item.url) || {};
    metaByUrl.set(item.url, {
      title: item.title || prev.title || titleForUrl(item.url),
      url: item.url,
      validated: Boolean(item.validated ?? prev.validated),
      sourceUrl: item.sourceUrl || prev.sourceUrl || "",
      artist: item.artist || prev.artist || "",
      license: item.license || prev.license || "",
      licenseUrl: item.licenseUrl || prev.licenseUrl || "",
      commonsPage: item.commonsPage || prev.commonsPage || "",
    });
  }
}

function commonsTitleFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const thumb = path.match(/\/wikipedia\/commons\/thumb\/[^/]+\/[^/]+\/([^/]+)\//);
    const plain = path.match(/\/wikipedia\/commons\/[^/]+\/[^/]+\/([^/]+)$/);
    const file = decodeURIComponent((thumb || plain)?.[1] || "").replace(/_/g, " ");
    if (!file || !/\.(jpe?g|png)$/i.test(file)) return "";
    return `File:${file}`;
  } catch {
    return "";
  }
}

export function titleForUrl(url) {
  if (titleByUrl.has(url)) return titleByUrl.get(url);
  return commonsTitleFromUrl(url);
}

export function metaForUrl(url) {
  if (metaByUrl.has(url)) return metaByUrl.get(url);
  const title = titleForUrl(url);
  return {
    title,
    url,
    validated: Boolean(url && String(url).startsWith("/api/media/")),
    sourceUrl: "",
    artist: "",
    license: "",
    licenseUrl: "",
    commonsPage: title
      ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`
      : "",
  };
}

function normalizeFileTitle(title) {
  let value = String(title || "").trim().replace(/_/g, " ");
  if (!value) return "";
  if (/^file:/i.test(value)) value = `File:${value.slice(5).trim()}`;
  return value.replace(/\s+/g, " ");
}

export function markTitleRejected(title) {
  const clean = normalizeFileTitle(title);
  if (clean) rejectedTitles.add(clean);
  // Invalide le cache mémoire pour ne plus resservir l’image blacklistée.
  for (const [key, pool] of memoryPools) {
    const filtered = applyRejections(pool);
    if (filtered.urls?.length) memoryPools.set(key, filtered);
    else memoryPools.delete(key);
  }
}

export function invalidateSpeciesImages(scientificName) {
  const name = String(scientificName || "").trim();
  if (!name) {
    memoryPools.clear();
    return;
  }
  memoryPools.delete(poolKey(name));
  // variantes de clé safe/map
  memoryPools.delete(`safe:${name}`);
  memoryPools.delete(`map:${name}`);
}

export function creditLabel(meta, kind = "photo") {
  const prefix = kind === "carte" ? "Carte" : "Photo";
  if (!meta) return `${prefix} : Wikimedia Commons`;
  const bits = [];
  if (meta.artist) bits.push(meta.artist);
  if (meta.license) bits.push(meta.license);
  if (bits.length) return `${prefix} : ${bits.join(" · ")}`;
  return `${prefix} : Wikimedia Commons`;
}

export function creditHref(meta) {
  if (!meta) return "";
  return meta.commonsPage || meta.licenseUrl || meta.sourceUrl || "";
}

function isPoolImageUrl(url) {
  return (
    typeof url === "string" &&
    (url.startsWith("https://") || url.startsWith("/api/media/"))
  );
}

function applyRejections(result) {
  const items = (result.items || [])
    .map((item) => ({
      ...item,
      title: normalizeFileTitle(item.title || titleForUrl(item.url)),
    }))
    .filter(
      (item) =>
        item?.url &&
        isPoolImageUrl(item.url) &&
        item.title &&
        !rejectedTitles.has(item.title),
    )
    .map((item) => ({
      title: item.title,
      url: item.url,
      validated: Boolean(item.validated),
      sourceUrl: item.sourceUrl || "",
      artist: item.artist || "",
      license: item.license || "",
      licenseUrl: item.licenseUrl || "",
      commonsPage: item.commonsPage || "",
    }));
  const urls = (result.urls || []).filter((url) => {
    if (!isPoolImageUrl(url)) return false;
    const title = normalizeFileTitle(titleForUrl(url));
    // Sans titre résolvable, on ne ressert pas (évite de contourner la blacklist).
    if (!title) return false;
    return !rejectedTitles.has(title);
  });
  const known = new Set(items.map((item) => item.url));
  for (const url of urls) {
    if (!known.has(url)) {
      items.push({ title: normalizeFileTitle(titleForUrl(url)), url, validated: false });
    }
  }
  rememberItems(items);
  return { urls: items.map((item) => item.url), items, source: result.source || "commons" };
}

let blockedTitlesLoaded = false;
let blockedTitlesPromise = null;
let blockedTitlesAt = 0;

async function ensureBlockedTitles(force = false) {
  if (!servedFromQuizApi()) return;
  if (!force && blockedTitlesLoaded && Date.now() - blockedTitlesAt < 30_000) return;
  if (blockedTitlesPromise) return blockedTitlesPromise;
  blockedTitlesPromise = (async () => {
    try {
      const response = await fetch("/api/blocked-titles", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      for (const title of data.titles || []) {
        const clean = normalizeFileTitle(title);
        if (clean.startsWith("File:")) rejectedTitles.add(clean);
      }
      blockedTitlesAt = Date.now();
      blockedTitlesLoaded = true;
    } catch {
      /* blacklist serveur facultative */
    } finally {
      blockedTitlesPromise = null;
    }
  })();
  return blockedTitlesPromise;
}

async function fetchServerPool(scientificName, options = {}) {
  const params = new URLSearchParams({ name: scientificName });
  if (options.validatedOnly) params.set("validatedOnly", "1");
  const response = await fetch(`/api/pool?${params}`);
  if (!response.ok) throw new Error("pool");
  const data = await response.json();
  return applyRejections({ urls: [], items: data.items || [], source: "pool" });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isHttps(value) {
  return typeof value === "string" && value.startsWith("https://");
}

function cacheKey(scientificName) {
  return `${CACHE_PREFIX}${scientificName.trim()}`;
}

function readCache(scientificName) {
  try {
    const raw = localStorage.getItem(cacheKey(scientificName));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.v !== CACHE_VERSION || !Array.isArray(data.urls)) return null;
    const urls = data.urls.filter(isHttps);
    if (!urls.length) return null;
    return {
      urls,
      source: data.source === "wikipedia" ? "wikipedia" : "commons",
      fresh: Date.now() - Number(data.savedAt) < CACHE_TTL_MS,
    };
  } catch {
    return null;
  }
}

function writeCache(scientificName, result) {
  try {
    localStorage.setItem(
      cacheKey(scientificName),
      JSON.stringify({
        v: CACHE_VERSION,
        urls: result.urls,
        source: result.source,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Cache facultatif.
  }
}

function apiUrl(endpoint, params) {
  const url = new URL(endpoint);
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function throttledJson(url) {
  const wait = Math.max(0, lastRequestAt + REQUEST_GAP_MS - Date.now());
  if (wait) await sleep(wait);
  lastRequestAt = Date.now();

  let response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (response.status === 429) {
    await sleep(4000);
    lastRequestAt = Date.now();
    response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function categoryTitleFor(scientificName) {
  return `Category:${scientificName.trim().replace(/\s+/g, "_")}`;
}

function isPhotoTitle(title) {
  if (typeof title !== "string") return false;
  const name = title.replace(/^File:/i, "");
  if (!/\.(jpe?g|png)$/i.test(name)) return false;
  return !FILE_REJECT.test(name);
}

function isUsefulSubcategory(title) {
  if (typeof title !== "string") return false;
  return !SUBCAT_REJECT.test(title.replace(/^Category:/i, ""));
}

const SEX_SKIP =
  /juvenile|immature|juv[ée]nile|pullus|\bchicks?\b|nestling|downy|eclipse|subadult|1st winter|first winter|hybrid|leucis|\bpairs?\b|\bcouples?\b|museum|specimen|illustrat|captive|\bdead\b|low quality/i;

function sexKind(label) {
  const name = String(label || "")
    .replace(/^(File|Category):/i, "")
    .replace(/[_./-]+/g, " ");
  if (SEX_SKIP.test(name)) return null;
  const male = /(?:^|[^a-zàâäéèêëïîôùûüç])(?:males?|mâles?)(?:[^a-zàâäéèêëïîôùûüç]|$)|\u2642/i.test(name);
  const female = /(?:^|[^a-zàâäéèêëïîôùûüç])(?:females?|femelles?)(?:[^a-zàâäéèêëïîôùûüç]|$)|\u2640/i.test(name);
  if (male === female) return null;
  return male ? "male" : "female";
}

async function listMembers(categoryTitle, cmtype, limit, pages) {
  const titles = [];
  let cont = null;
  const pageCap = pages ?? (cmtype === "file" ? 2 : 1);

  for (let page = 0; page < pageCap; page += 1) {
    const data = await throttledJson(
      apiUrl(COMMONS, {
        action: "query",
        list: "categorymembers",
        cmtitle: categoryTitle,
        cmtype,
        cmlimit: String(limit),
        cmcontinue: cont,
      }),
    );
    const members = data?.query?.categorymembers ?? [];
    for (const member of members) {
      if (typeof member.title === "string") titles.push(member.title);
    }
    cont = data?.continue?.cmcontinue ?? null;
    if (!cont) break;
    if (cmtype === "file" && titles.filter(isPhotoTitle).length >= 12) break;
  }

  return titles;
}

async function collectTitles(scientificName) {
  const found = new Set();
  const files = await listMembers(categoryTitleFor(scientificName), "file", 30);
  files.filter(isPhotoTitle).forEach((title) => found.add(title));

  if (found.size < 8) {
    const subcats = (await listMembers(categoryTitleFor(scientificName), "subcat", 20)).filter(
      isUsefulSubcategory,
    );
    for (const subcat of subcats.slice(0, 5)) {
      if (found.size >= 18) break;
      const nested = await listMembers(subcat, "file", 12);
      nested.filter(isPhotoTitle).forEach((title) => found.add(title));
    }
  }

  return shuffle([...found]).slice(0, MAX_IMAGES);
}

async function resolveUrls(fileTitles) {
  const urls = [];

  for (let index = 0; index < fileTitles.length; index += 8) {
    const batch = fileTitles.slice(index, index + 8);
    let data;
    try {
      data = await throttledJson(
        apiUrl(COMMONS, {
          action: "query",
          titles: batch.join("|"),
          prop: "imageinfo",
          iiprop: "url|mime|size|extmetadata",
          iiextmetadatafilter: "LicenseShortName|Artist|Credit|LicenseUrl",
          iiurlwidth: "1400",
        }),
      );
    } catch {
      continue;
    }

    const pages = Object.values(data?.query?.pages ?? {});
    for (const page of pages) {
      const info = page?.imageinfo?.[0];
      if (!info) continue;
      if (info.mime && !/^image\/(jpeg|png)$/i.test(info.mime)) continue;
      if (info.width && info.height && Math.min(info.width, info.height) < 180) continue;

      const originalOk = isHttps(info.url) && /\.(jpe?g|png)(\?|$)/i.test(info.url);
      const tooHeavy = typeof info.size === "number" && info.size > 1_800_000;
      const chosen = originalOk && !tooHeavy ? info.url : info.thumburl || info.url;
      if (!isHttps(chosen)) continue;
      urls.push(chosen);
      rememberItems([
        {
          title: page.title,
          url: chosen,
          ...creditFromExtmetadata(info.extmetadata, page.title),
        },
      ]);
    }
  }

  return [...new Set(urls)];
}

function isUnsafeFishText(value) {
  return FISH_UNSAFE.test(String(value || "").replace(/_/g, " "));
}

async function listSafeFileTitles(categoryTitle, limit) {
  const titles = [];
  let cont = null;

  for (let page = 0; page < 6 && titles.length < limit; page += 1) {
    const data = await throttledJson(
      apiUrl(COMMONS, {
        action: "query",
        list: "categorymembers",
        cmtitle: categoryTitle,
        cmtype: "file",
        cmlimit: "50",
        cmcontinue: cont,
      }),
    );
    for (const member of data?.query?.categorymembers ?? []) {
      if (!isPhotoTitle(member.title) || isUnsafeFishText(member.title)) continue;
      titles.push(member.title);
      if (titles.length >= limit) break;
    }
    cont = data?.continue?.cmcontinue ?? null;
    if (!cont) break;
  }

  return titles;
}

async function collectSafeTitles(scientificName) {
  const found = [];
  const seen = new Set();
  const add = (titles) => {
    for (const title of titles) {
      if (seen.has(title) || found.length >= 24) continue;
      seen.add(title);
      found.push(title);
    }
  };

  add(await listSafeFileTitles(categoryTitleFor(scientificName), 24));
  if (found.length < 8) {
    const subcats = (await listMembers(categoryTitleFor(scientificName), "subcat", 40)).filter(
      (title) => isUsefulSubcategory(title) && !isUnsafeFishText(title),
    );
    for (const subcat of subcats.slice(0, 8)) {
      if (found.length >= 16) break;
      add(await listSafeFileTitles(subcat, 12));
    }
  }

  return found;
}

async function resolveSafeItems(fileTitles) {
  const items = [];

  for (let index = 0; index < fileTitles.length; index += 8) {
    const batch = fileTitles.slice(index, index + 8);
    let data;
    try {
      data = await throttledJson(
        apiUrl(COMMONS, {
          action: "query",
          titles: batch.join("|"),
          prop: "imageinfo|categories",
          iiprop: "url|mime|size|extmetadata",
          iiextmetadatafilter: "LicenseShortName|Artist|Credit|LicenseUrl",
          iiurlwidth: "1400",
          cllimit: "500",
        }),
      );
    } catch {
      continue;
    }

    const pages = Object.values(data?.query?.pages ?? {});
    for (const page of pages) {
      const labels = [
        page.title,
        ...(Array.isArray(page?.categories) ? page.categories.map((category) => category?.title) : []),
      ];
      if (labels.some(isUnsafeFishText)) continue;

      const info = page?.imageinfo?.[0];
      if (!info) continue;
      if (info.mime && !/^image\/(jpeg|png)$/i.test(info.mime)) continue;
      if (info.width && info.height && Math.min(info.width, info.height) < 180) continue;

      const originalOk = isHttps(info.url) && /\.(jpe?g|png)(\?|$)/i.test(info.url);
      const tooHeavy = typeof info.size === "number" && info.size > 1_800_000;
      const chosen = originalOk && !tooHeavy ? info.url : info.thumburl || info.url;
      if (!isHttps(chosen) || !page.title) continue;
      items.push({ title: page.title, url: chosen, ...creditFromExtmetadata(info.extmetadata, page.title) });
    }
  }

  return items;
}

function mergeFishItems(current, extra) {
  const seen = new Set(current.map((item) => item.title));
  const merged = [...current];
  for (const item of extra) {
    if (seen.has(item.title)) continue;
    seen.add(item.title);
    merged.push(item);
  }
  return merged;
}

async function safeFishItems(scientificName) {
  try {
    const titles = await collectSafeTitles(scientificName);
    if (!titles.length) return [];
    return await resolveSafeItems(titles);
  } catch {
    return [];
  }
}

async function fetchSafeFishImages(scientificName) {
  let items = await safeFishItems(scientificName);
  if (items.length < 4) {
    const shortName = binomialName(scientificName);
    if (shortName) items = mergeFishItems(items, await safeFishItems(shortName));
  }
  if (items.length < 4) {
    const alias = await commonsCategoryFromWikidata(scientificName);
    if (alias && !sameTaxonName(alias, scientificName)) {
      items = mergeFishItems(items, await safeFishItems(alias.replace(/_/g, " ")));
    }
  }
  return applyRejections({ urls: [], items: items.slice(0, MAX_IMAGES), source: "commons" });
}

function isMapTitle(title) {
  if (typeof title !== "string" || !/^File:/i.test(title)) return false;
  const name = title.replace(/^File:/i, "");
  if (!/\.(jpe?g|png|svg)$/i.test(name)) return false;
  return !MAP_FILE_REJECT.test(name);
}

function mapCategoryCandidates(countryName) {
  const name = countryName.trim().replace(/_/g, " ");
  const underscored = name.replace(/\s+/g, "_");
  return [
    `Category:SVG blank maps of ${name}`,
    `Category:Blank SVG maps of ${name}`,
    `Category:SVG blank maps of the ${name}`,
    `Category:Blank maps of ${name}`,
    `Category:Outline maps of ${name}`,
    `Category:SVG maps of ${name}`,
    `Category:Location maps of ${name}`,
    `Category:SVG_blank_maps_of_${underscored}`,
    `Category:Blank_maps_of_${underscored}`,
  ];
}

async function listMapFileTitles(categoryTitle, limit) {
  const titles = [];
  let cont = null;
  for (let page = 0; page < 4 && titles.length < limit; page += 1) {
    let data;
    try {
      data = await throttledJson(
        apiUrl(COMMONS, {
          action: "query",
          list: "categorymembers",
          cmtitle: categoryTitle,
          cmtype: "file",
          cmlimit: "50",
          cmcontinue: cont,
        }),
      );
    } catch {
      break;
    }
    for (const member of data?.query?.categorymembers ?? []) {
      if (!isMapTitle(member.title)) continue;
      titles.push(member.title);
      if (titles.length >= limit) break;
    }
    cont = data?.continue?.cmcontinue ?? null;
    if (!cont) break;
  }
  return titles;
}

async function searchMapTitles(countryName) {
  const queries = [
    `${countryName} blank map`,
    `${countryName} outline map`,
    `${countryName} location map`,
  ];
  const found = [];
  const seen = new Set();
  for (const query of queries) {
    let data;
    try {
      data = await throttledJson(
        apiUrl(COMMONS, {
          action: "query",
          list: "search",
          srsearch: `${query} filetype:bitmap|drawing`,
          srnamespace: "6",
          srlimit: "12",
        }),
      );
    } catch {
      continue;
    }
    for (const hit of data?.query?.search ?? []) {
      if (!isMapTitle(hit.title) || seen.has(hit.title)) continue;
      seen.add(hit.title);
      found.push(hit.title);
    }
    if (found.length >= 12) break;
  }
  return found;
}

function mapTitleScore(title, countryName) {
  const blob = title.replace(/^File:/i, "").toLowerCase().replace(/_/g, " ");
  const country = countryName.trim().toLowerCase();
  const short = country.replace(/^the\s+/, "");
  let score = 0;
  if (blob.includes(country) || blob.includes(short)) score += 4;
  if (MAP_FILE_PREFER.test(title)) score += 3;
  if (/\bblank\b/.test(blob)) score += 1;
  if (/\b(sea|ocean|gulf|basin|aegean|mediterranean|caribbean)\b/.test(blob) && !blob.includes(short)) score -= 4;
  return score;
}

async function collectMapTitles(countryName) {
  const found = [];
  const seen = new Set();
  const add = (titles) => {
    for (const title of titles) {
      if (seen.has(title) || found.length >= 30) continue;
      seen.add(title);
      found.push(title);
    }
  };

  for (const category of mapCategoryCandidates(countryName)) {
    if (found.length >= 16) break;
    add(await listMapFileTitles(category, 24));
  }
  if (found.length < 6) add(await searchMapTitles(countryName));

  const ranked = [...found].sort((left, right) => mapTitleScore(right, countryName) - mapTitleScore(left, countryName));
  const country = countryName.trim().toLowerCase();
  const short = country.replace(/^the\s+/, "");
  const named = ranked.filter((title) => {
    const blob = title.replace(/^File:/i, "").toLowerCase().replace(/_/g, " ");
    return blob.includes(country) || blob.includes(short);
  });
  return (named.length ? named : ranked).slice(0, MAX_IMAGES);
}

async function resolveMapItems(fileTitles) {
  const items = [];
  for (let index = 0; index < fileTitles.length; index += 8) {
    const batch = fileTitles.slice(index, index + 8);
    let data;
    try {
      data = await throttledJson(
        apiUrl(COMMONS, {
          action: "query",
          titles: batch.join("|"),
          prop: "imageinfo",
          iiprop: "url|mime|size|extmetadata",
          iiextmetadatafilter: "LicenseShortName|Artist|Credit|LicenseUrl",
          iiurlwidth: "1400",
        }),
      );
    } catch {
      continue;
    }
    const pages = Object.values(data?.query?.pages ?? {});
    for (const page of pages) {
      if (!isMapTitle(page?.title || "")) continue;
      const info = page?.imageinfo?.[0];
      if (!info) continue;
      const mimeOk = !info.mime || /^image\/(jpeg|png|svg\+xml)$/i.test(info.mime);
      if (!mimeOk) continue;
      if (info.width && info.height && Math.min(info.width, info.height) < 120) continue;

      const isSvg = /svg/i.test(info.mime || "") || /\.svg(\?|$)/i.test(info.url || "");
      const originalOk = isHttps(info.url) && /\.(jpe?g|png)(\?|$)/i.test(info.url);
      const tooHeavy = typeof info.size === "number" && info.size > 2_500_000;
      const chosen = isSvg || !originalOk || tooHeavy ? info.thumburl || info.url : info.url;
      if (!isHttps(chosen) || !page.title) continue;
      items.push({ title: page.title, url: chosen, ...creditFromExtmetadata(info.extmetadata, page.title) });
    }
  }
  return items;
}

async function fetchOutlineMapImages(countryName) {
  try {
    const titles = await collectMapTitles(countryName);
    if (!titles.length) return { urls: [], items: [], source: "none" };
    const items = await resolveMapItems(titles);
    return applyRejections({ urls: [], items: items.slice(0, MAX_IMAGES), source: "commons" });
  } catch {
    return { urls: [], items: [], source: "none" };
  }
}

async function urlsFromCommons(scientificName) {
  try {
    const titles = await collectTitles(scientificName);
    if (!titles.length) return [];
    return await resolveUrls(titles);
  } catch {
    return [];
  }
}

function binomialName(scientificName) {
  const parts = scientificName.trim().split(/\s+/);
  if (parts.length <= 2) return null;
  return parts.slice(0, 2).join(" ");
}

function sameTaxonName(left, right) {
  const normalize = (value) => value.trim().toLowerCase().replace(/[_\s]+/g, " ");
  return normalize(left) === normalize(right);
}

async function commonsCategoryFromWikidata(scientificName) {
  try {
    const epithet = scientificName.trim().split(/\s+/).pop().toLowerCase();
    const search = await throttledJson(
      apiUrl(WIKIDATA, {
        action: "wbsearchentities",
        search: scientificName,
        language: "en",
        type: "item",
        limit: "5",
      }),
    );
    const hit = (search.search ?? []).find((item) => {
      const description = String(item.description || "").toLowerCase();
      const blob = `${item.label || ""} ${description} ${item.match?.text || ""}`.toLowerCase();
      const looksLikeSpecies = /species|espèce|espece|taxon|bird|oiseau|fungus|mushroom|champignon|bolete|agaric/.test(
        description,
      );
      return looksLikeSpecies && blob.includes(epithet);
    });
    if (!hit?.id) return null;

    const claims = await throttledJson(
      apiUrl(WIKIDATA, {
        action: "wbgetclaims",
        entity: hit.id,
        property: "P373",
      }),
    );
    const value = claims?.claims?.P373?.[0]?.mainsnak?.datavalue?.value;
    if (typeof value !== "string" || !value.toLowerCase().includes(epithet)) return null;
    return value;
  } catch {
    return null;
  }
}

async function wikipediaImage(lang, scientificName) {
  const title = encodeURIComponent(scientificName.trim().replace(/\s+/g, "_"));
  try {
    const data = await throttledJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`);
    if (data?.type === "disambiguation") return null;
    const original = data?.originalimage?.source;
    const thumb = data?.thumbnail?.source;
    if (isHttps(original) && /\.(jpe?g|png)(\?|$)/i.test(original)) return original;
    if (isHttps(thumb)) return thumb;
    if (isHttps(original)) return original;
    return null;
  } catch {
    return null;
  }
}

async function fetchSpeciesImages(scientificName) {
  const direct = await urlsFromCommons(scientificName);
  if (direct.length) return { urls: direct, source: "commons" };

  const shortName = binomialName(scientificName);
  if (shortName) {
    const retry = await urlsFromCommons(shortName);
    if (retry.length) return { urls: retry, source: "commons" };
  }

  const alias = await commonsCategoryFromWikidata(scientificName);
  if (alias && !sameTaxonName(alias, scientificName) && !(shortName && sameTaxonName(alias, shortName))) {
    const aliasUrls = await urlsFromCommons(alias);
    if (aliasUrls.length) return { urls: aliasUrls, source: "commons" };
  }

  for (const lang of ["fr", "en"]) {
    const url = await wikipediaImage(lang, scientificName);
    if (url) return { urls: [url], source: "wikipedia" };
  }

  return { urls: [], source: "none" };
}

function boostSpecies(scientificName) {
  const key = poolKey(scientificName);
  const index = speciesQueue.findIndex((item) => item.key === key);
  if (index > 0) {
    const [item] = speciesQueue.splice(index, 1);
    speciesQueue.unshift(item);
  }
}

function enqueueSpecies(scientificName) {
  const name = scientificName.trim();
  const key = poolKey(name);
  const safe = safeFish;
  const maps = outlineMaps;
  if (!name) return Promise.resolve({ urls: [], source: "none" });
  const remembered = memoryPools.get(key);
  if (remembered?.urls?.length) {
    // Toujours refiltrer : une blacklist/validation peut être intervenue depuis.
    const filtered = applyRejections(remembered);
    if (filtered.urls?.length) {
      memoryPools.set(key, filtered);
      return Promise.resolve(filtered);
    }
    memoryPools.delete(key);
  }

  if (!safe && !maps && !servedFromQuizApi()) {
    const cached = readCache(name);
    if (cached?.fresh) {
      const result = applyRejections({ urls: cached.urls, source: cached.source });
      memoryPools.set(key, result);
      return Promise.resolve(result);
    }
  }
  if (pending.has(key)) return pending.get(key);

  const promise = new Promise((resolve, reject) => {
    speciesQueue.push({ name, key, safe, maps, resolve, reject });
    pumpSpecies();
  });
  pending.set(key, promise);
  return promise;
}

async function pumpSpecies() {
  if (pumping) return;
  pumping = true;

  while (speciesQueue.length) {
    const job = speciesQueue.shift();
    try {
      if (job.safe) {
        const result = await fetchSafeFishImages(job.name);
        if (result.urls?.length) memoryPools.set(job.key, result);
        else memoryPools.delete(job.key);
        job.resolve(result);
        continue;
      }
      if (job.maps) {
        await ensureBlockedTitles();
        if (servedFromQuizApi()) {
          try {
            const pooled = await fetchServerPool(job.name, { validatedOnly: true });
            if (pooled.urls.length) {
              memoryPools.set(job.key, pooled);
              job.resolve(pooled);
              continue;
            }
          } catch {
            /* repli contours Commons */
          }
        }
        const result = await fetchOutlineMapImages(job.name);
        if (result.urls?.length) memoryPools.set(job.key, result);
        else memoryPools.delete(job.key);
        job.resolve(result);
        continue;
      }
      if (servedFromQuizApi()) {
        try {
          await ensureBlockedTitles();
          const pooled = await fetchServerPool(job.name);
          if (pooled.urls.length) {
            memoryPools.set(job.key, pooled);
            job.resolve(pooled);
            continue;
          }
        } catch {
          // Repli sur Commons si l'API est injoignable.
        }
      }
      const fresh = readCache(job.name);
      let result;
      if (fresh?.fresh) {
        result = { urls: fresh.urls, source: fresh.source };
      } else {
        result = await fetchSpeciesImages(job.name);
        if (result.urls.length) writeCache(job.name, result);
        else if (fresh?.urls?.length) result = { urls: fresh.urls, source: fresh.source };
      }
      result = applyRejections(result);
      if (result.urls?.length) memoryPools.set(job.key, result);
      else memoryPools.delete(job.key);
      job.resolve(result);
    } catch (error) {
      if (job.safe || job.maps) {
        job.reject(error);
        continue;
      }
      const stale = readCache(job.name);
      if (stale?.urls?.length) {
        const result = applyRejections({ urls: stale.urls, source: stale.source });
        memoryPools.set(job.key, result);
        job.resolve(result);
      } else job.reject(error);
    } finally {
      pending.delete(job.key);
    }
  }

  pumping = false;
}

function readSexCache(scientificName) {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}sex:${scientificName.trim()}`);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.v !== CACHE_VERSION) return null;
    if (Date.now() - Number(data.savedAt) >= CACHE_TTL_MS) return null;
    const male = (data.male || []).filter(isHttps);
    const female = (data.female || []).filter(isHttps);
    if (!male.length || !female.length) return null;
    return { male, female };
  } catch {
    return null;
  }
}

function writeSexCache(scientificName, result) {
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}sex:${scientificName.trim()}`,
      JSON.stringify({
        v: CACHE_VERSION,
        male: result.male,
        female: result.female,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Cache facultatif.
  }
}

async function titlesForSexCategories(categoryTitles, sex) {
  const found = [];
  const keep = (title) => {
    if (!isPhotoTitle(title) || SEX_SKIP.test(title)) return false;
    const kind = sexKind(title);
    return !kind || kind === sex;
  };
  for (const categoryTitle of categoryTitles.slice(0, 3)) {
    const photos = (await listMembers(categoryTitle, "file", 15)).filter(keep);
    found.push(...photos);
    if (found.length >= 6) break;
    if (found.length < 3) {
      const nested = (await listMembers(categoryTitle, "subcat", 8))
        .filter((title) => isUsefulSubcategory(title) && !SEX_SKIP.test(title))
        .slice(0, 2);
      for (const sub of nested) {
        const more = (await listMembers(sub, "file", 8)).filter(keep);
        found.push(...more);
      }
    }
  }
  return [...new Set(found)].slice(0, 8);
}

async function sexUrlsFor(scientificName) {
  const buckets = { male: [], female: [] };
  const subcats = await listMembers(categoryTitleFor(scientificName), "subcat", 50, 2);
  for (const title of subcats) {
    const sex = sexKind(title);
    if (sex) buckets[sex].push(title);
  }
  for (const sex of ["male", "female"]) {
    const direct = categoryTitleFor(`${scientificName} (${sex})`);
    if (!buckets[sex].includes(direct)) buckets[sex].push(direct);
  }

  const fileTitles = { male: [], female: [] };
  for (const sex of ["male", "female"]) {
    fileTitles[sex] = await titlesForSexCategories(buckets[sex], sex);
  }

  if (!fileTitles.male.length || !fileTitles.female.length) {
    const files = await listMembers(categoryTitleFor(scientificName), "file", 40, 2);
    for (const title of files) {
      const sex = sexKind(title);
      if (!sex || !isPhotoTitle(title)) continue;
      if (fileTitles[sex].length >= 8) continue;
      fileTitles[sex].push(title);
    }
  }

  return {
    male: await resolveUrls([...new Set(fileTitles.male)].slice(0, 8)),
    female: await resolveUrls([...new Set(fileTitles.female)].slice(0, 8)),
  };
}

async function fetchSexImages(scientificName) {
  const direct = await sexUrlsFor(scientificName);
  if (direct.male.length && direct.female.length) return direct;

  const alias = await commonsCategoryFromWikidata(scientificName);
  if (!alias || sameTaxonName(alias, scientificName)) return direct;
  const aliasName = alias.replace(/_/g, " ");
  if (sameTaxonName(aliasName, scientificName)) return direct;
  const extra = await sexUrlsFor(aliasName);
  return {
    male: direct.male.length ? direct.male : extra.male,
    female: direct.female.length ? direct.female : extra.female,
  };
}

const sexPending = new Map();

export function getSexImages(scientificName) {
  const name = String(scientificName || "").trim();
  if (!name) return Promise.resolve({ male: [], female: [] });
  const cached = readSexCache(name);
  if (cached) return Promise.resolve(cached);
  if (sexPending.has(name)) return sexPending.get(name);

  const promise = fetchSexImages(name)
    .then((result) => {
      if (result.male.length && result.female.length) writeSexCache(name, result);
      return result;
    })
    .finally(() => {
      sexPending.delete(name);
    });
  sexPending.set(name, promise);
  return promise;
}

const AUDIO_REJECT = /sonogram|spectrogram|diagram/i;
const AUDIO_SOFT_MAX = 2_000_000;
const AUDIO_HARD_MAX = 8_000_000;

function isAudioTitle(title) {
  if (typeof title !== "string") return false;
  const name = title.replace(/^File:/i, "");
  if (!/\.(mp3|ogg|oga|wav)$/i.test(name)) return false;
  return !AUDIO_REJECT.test(name);
}

function isAudioCategory(title) {
  if (typeof title !== "string") return false;
  const name = title.replace(/^Category:/i, "");
  if (AUDIO_REJECT.test(name)) return false;
  return /audio files|birdsong|bird song|\bcalls?\b|\bsongs?\b|vocali[sz]/i.test(name);
}

async function audioTitlesFor(scientificName) {
  const found = [];
  const subcats = await listMembers(categoryTitleFor(scientificName), "subcat", 50, 2);
  const audioCats = subcats.filter(isAudioCategory).slice(0, 3);
  for (const categoryTitle of audioCats) {
    const files = await listMembers(categoryTitle, "file", 20);
    files.filter(isAudioTitle).forEach((title) => found.push(title));
    if (found.length >= 8) break;
  }
  if (found.length < 4) {
    const files = await listMembers(categoryTitleFor(scientificName), "file", 40, 2);
    files.filter(isAudioTitle).forEach((title) => found.push(title));
  }
  return [...new Set(found)].slice(0, 12);
}

async function resolveAudioUrls(fileTitles) {
  const light = [];
  const heavy = [];

  for (let index = 0; index < fileTitles.length; index += 8) {
    const batch = fileTitles.slice(index, index + 8);
    let data;
    try {
      data = await throttledJson(
        apiUrl(COMMONS, {
          action: "query",
          titles: batch.join("|"),
          prop: "imageinfo",
          iiprop: "url|mime|size|extmetadata",
          iiextmetadatafilter: "LicenseShortName|Artist|Credit|LicenseUrl",
        }),
      );
    } catch {
      continue;
    }

    const pages = Object.values(data?.query?.pages ?? {});
    for (const page of pages) {
      const info = page?.imageinfo?.[0];
      if (!info || !isHttps(info.url)) continue;
      const mimeOk = !info.mime || /^audio\/(mpeg|ogg|vorbis|wav|wave|x-wav)$/i.test(info.mime) || info.mime === "application/ogg";
      const extensionOk = /\.(mp3|ogg|oga|wav)(\?|$)/i.test(info.url);
      if (!mimeOk || !extensionOk) continue;
      if (AUDIO_REJECT.test(info.url)) continue;
      const size = typeof info.size === "number" ? info.size : 0;
      if (size && size <= AUDIO_SOFT_MAX) light.push(info.url);
      else if (!size || size <= AUDIO_HARD_MAX) heavy.push(info.url);
    }
  }

  const chosen = light.length ? light : heavy;
  return [...new Set(chosen)];
}

async function fetchSpeciesAudio(scientificName) {
  const direct = await resolveAudioUrls(await audioTitlesFor(scientificName));
  if (direct.length) return direct;

  const alias = await commonsCategoryFromWikidata(scientificName);
  if (!alias || sameTaxonName(alias, scientificName)) return [];
  const aliasName = alias.replace(/_/g, " ");
  if (sameTaxonName(aliasName, scientificName)) return [];
  return resolveAudioUrls(await audioTitlesFor(aliasName));
}

const audioPending = new Map();

export function getSpeciesAudio(scientificName) {
  const name = String(scientificName || "").trim();
  if (!name) return Promise.resolve([]);
  const key = `audio:${name}`;
  const cached = readCache(key);
  if (cached?.fresh) return Promise.resolve(cached.urls);
  if (audioPending.has(name)) return audioPending.get(name);

  const promise = fetchSpeciesAudio(name)
    .then((urls) => {
      if (urls.length) writeCache(key, { urls, source: "commons" });
      return urls;
    })
    .finally(() => {
      audioPending.delete(name);
    });
  audioPending.set(name, promise);
  return promise;
}

export function preloadSpeciesAudio(names, priorityName) {
  const unique = [...new Set(names.map((name) => String(name || "").trim()).filter(Boolean))];
  const ordered = priorityName
    ? [priorityName, ...unique.filter((name) => name !== priorityName)]
    : unique;
  for (const name of ordered) getSpeciesAudio(name).catch(() => {});
}

export async function getVernacularImage(commonName) {
  const name = String(commonName || "").trim();
  if (!name) return null;
  const key = `nom:${name}`;
  const cached = readCache(key);
  if (cached?.fresh && cached.urls[0]) return cached.urls[0];
  const url = await wikipediaImage("fr", name);
  if (!url) return null;
  writeCache(key, { urls: [url], source: "wikipedia" });
  return url;
}

export function getSpeciesImages(scientificName) {
  const promise = enqueueSpecies(scientificName);
  boostSpecies(scientificName.trim());
  return promise;
}

export function preloadSpecies(names, priorityName) {
  const unique = [...new Set(names.map((name) => String(name || "").trim()).filter(Boolean))];
  const ordered = priorityName
    ? [priorityName, ...unique.filter((name) => name !== priorityName)]
    : unique;

  for (const name of ordered) {
    const task = enqueueSpecies(name);
    if (name === priorityName) boostSpecies(name);
    task.catch(() => {});
  }
}

export function pickRandomImage(urls, items) {
  const validated = (items || [])
    .filter((item) => item?.validated && item.url)
    .map((item) => item.url);
  const pool = validated.length ? validated : urls || [];
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
