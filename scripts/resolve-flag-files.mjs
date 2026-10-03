/**
 * Vérifie les titres Commons « Flag of … » pour chaque pays de drapeaux-monde.json
 * et écrit le champ commonsFile (fichier SVG officiel quand il existe).
 *
 * Usage: node scripts/resolve-flag-files.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUIZ_PATH = path.join(ROOT, "public", "data", "drapeaux-monde.json");
const COMMONS = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "QuiQuiz/1.0 (flag resolver; educational quiz; contact: local)";
const BATCH = 40;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function commonsQuery(params, attempt = 0) {
  const url = `${COMMONS}?${new URLSearchParams({ format: "json", origin: "*", ...params })}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 8) throw new Error(`commons ${res.status}`);
    const wait = 1500 * (attempt + 1);
    console.warn(`rate/limit ${res.status}, retry in ${wait}ms…`);
    await sleep(wait);
    return commonsQuery(params, attempt + 1);
  }
  if (!res.ok) throw new Error(`commons ${res.status}`);
  return res.json();
}

async function existingTitleSet(titles) {
  const found = new Set();
  for (let i = 0; i < titles.length; i += BATCH) {
    const batch = titles.slice(i, i + BATCH);
    const data = await commonsQuery({
      action: "query",
      titles: batch.join("|"),
      prop: "imageinfo",
      iiprop: "mime",
    });
    for (const page of Object.values(data?.query?.pages || {})) {
      if (page?.title && page.missing === undefined && page.imageinfo?.[0]) {
        found.add(page.title);
      }
    }
    await sleep(400);
  }
  return found;
}

const quiz = JSON.parse(readFileSync(QUIZ_PATH, "utf8"));
const questions = [];
for (const group of quiz.groupes || []) {
  for (const question of group.questions || []) {
    questions.push(question);
  }
}

const candidateByName = new Map();
const allTitles = [];
for (const question of questions) {
  const name = String(question.nom_scientifique || "").trim();
  if (!name) continue;
  const candidates = [`File:Flag of ${name}.svg`, `File:Flag of the ${name}.svg`];
  candidateByName.set(name, candidates);
  for (const title of candidates) allTitles.push(title);
}

console.log(`Checking ${allTitles.length} titles for ${candidateByName.size} countries…`);
const existing = await existingTitleSet([...new Set(allTitles)]);

let ok = 0;
let missing = 0;
const missingNames = [];
for (const question of questions) {
  const name = String(question.nom_scientifique || "").trim();
  const candidates = candidateByName.get(name) || [];
  const file = candidates.find((title) => existing.has(title)) || "";
  if (file) {
    question.commonsFile = file;
    ok += 1;
  } else {
    delete question.commonsFile;
    missing += 1;
    missingNames.push(name);
  }
}

writeFileSync(QUIZ_PATH, `${JSON.stringify(quiz, null, 2)}\n`, "utf8");
console.log(`Done. commonsFile set: ${ok}, missing: ${missing}`);
if (missingNames.length) {
  console.log("Missing:", missingNames.join(", "));
}
