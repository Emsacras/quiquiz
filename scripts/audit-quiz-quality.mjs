/**
 * Audit classification + difficulté. Usage: node scripts/audit-quiz-quality.mjs
 */
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");

function load(file) {
  return JSON.parse(readFileSync(join(dataDir, file), "utf8"));
}

function eachQuestion(quiz, fn) {
  for (const g of quiz.groupes || []) {
    for (const x of g.questions || []) fn(x, g, quiz);
  }
}

const issues = [];

function issue(kind, file, detail) {
  issues.push({ kind, file, detail });
}

// --- Mammifères : ragondin/genette dans marins ---
{
  const q = load("mammiferes-france.json");
  eachQuestion(q, (x, g) => {
    if (g.id === "marins" && ["Ragondin", "Genette commune"].includes(x.nom_commun)) {
      issue("class", "mammiferes-france.json", `${x.nom_commun} dans « marins » → devrait être ${x.nom_commun === "Ragondin" ? "rongeurs" : "carnivores"}`);
    }
  });
}

// --- Minéraux : pyrite n'est pas un oxyde ---
{
  const q = load("rochers-mineraux.json");
  eachQuestion(q, (x, g) => {
    if (x.nom_commun === "Pyrite" && g.id === "oxydes") {
      issue("class", "rochers-mineraux.json", "Pyrite (sulfure) classée dans oxydes → métaux/sulfures");
    }
    if (g.id === "metaux" && ["Fluorine", "Gypse", "Halite", "Barite", "Soufre", "Graphite"].includes(x.nom_commun)) {
      // label is "Métaux et autres" — note only
      issue("note", "rochers-mineraux.json", `${x.nom_commun} dans « Métaux et autres » (OK si fourre-tout, idéal: sulfates/halogénures)`);
    }
  });
}

// --- Fruits : okra pas légumineuse ---
{
  const q = load("fruits-legumes.json");
  eachQuestion(q, (x, g) => {
    if (x.nom_commun === "Okra" && g.id === "legumineuses") {
      issue("class", "fruits-legumes.json", "Okra (Malvacée) dans légumineuses → fruits / autres");
    }
    if (["Tomate", "Concombre", "Courgette", "Aubergine", "Poivron"].includes(x.nom_commun) && g.id === "fruits") {
      issue("note", "fruits-legumes.json", `${x.nom_commun} en fruits (botanique OK, culinaire = légume)`);
    }
  });
}

// --- Coquillages : escargot terrestre ---
{
  const q = load("coquillages.json");
  eachQuestion(q, (x, g) => {
    if (/helix|escargot de bourgogne/i.test(`${x.nom_commun} ${x.nom_scientifique}`)) {
      issue("class", "coquillages.json", `${x.nom_commun} terrestre dans quiz coquillages (grève)`);
    }
  });
}

// --- Arbres : doublons sci ---
{
  const q = load("arbres-france.json");
  const bySci = new Map();
  eachQuestion(q, (x, g) => {
    const k = (x.nom_scientifique || "").toLowerCase();
    if (!k) return;
    if (!bySci.has(k)) bySci.set(k, []);
    bySci.get(k).push(`${g.id}:${x.nom_commun}`);
  });
  for (const [k, v] of bySci) {
    if (v.length > 1) issue("dup", "arbres-france.json", `${k} → ${v.join(" + ")}`);
  }
}

// --- Fossiles doublons ---
{
  const q = load("fossiles.json");
  const byName = new Map();
  eachQuestion(q, (x, g) => {
    const k = x.nom_commun.toLowerCase();
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(g.id);
  });
  for (const [k, v] of byName) {
    if (v.length > 1) issue("dup", "fossiles.json", `${k} dans ${v.join(" + ")}`);
  }
}

// --- Feuilles : frêne en simples ET composees? ---
{
  const q = load("feuilles-arbres.json");
  const bySci = new Map();
  eachQuestion(q, (x, g) => {
    const k = `${(x.nom_scientifique || "").toLowerCase()}|${x.nom_commun.toLowerCase()}`;
    if (!bySci.has(k)) bySci.set(k, []);
    bySci.get(k).push(g.id);
  });
  for (const [k, v] of bySci) {
    if (new Set(v).size > 1) issue("dup", "feuilles-arbres.json", `${k} → ${v.join(" + ")}`);
  }
  eachQuestion(q, (x, g) => {
    if (g.id === "simples" && /fraxinus|frêne$/i.test(`${x.nom_commun} ${x.nom_scientifique}`)) {
      issue("class", "feuilles-arbres.json", `${x.nom_commun} en « simples » alors que feuille composée (foliole)`);
    }
  });
}

// --- Bébés doublons conceptuels ---
{
  const q = load("bebes-animaux.json");
  const keys = [];
  eachQuestion(q, (x, g) => keys.push({ g: g.id, n: x.nom_commun, s: x.nom_scientifique, d: x.difficulte }));
  const fold = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i];
      const b = keys[j];
      if (fold(a.s) === fold(b.s) && a.s) {
        issue("dup", "bebes-animaux.json", `${a.n} (${a.g}) ~ ${b.n} (${b.g}) sci=${a.s}`);
      }
    }
  }
}

// --- Difficulté : règles de familiarité ---
const diffRules = [
  {
    file: "mammiferes-france.json",
    upFromFacile: [/murin de bechstein/i, /minioptère/i, /desman/i, /lagénorhynque/i, /phoque moine/i],
    downFromDifficile: [/^renard roux$/i, /^sanglier$/i, /^chevreuil$/i, /^écureuil roux$/i, /^hérisson/i, /^lapin de garenne$/i],
  },
  {
    file: "insectes-france.json",
    upFromFacile: [/gasteruption/i, /sapyga/i, /pimpla/i, /conops/i, /diopsis|sphyracephala/i, /thècle/i, /lucine/i],
    downFromDifficile: [/^coccinelle à sept points$/i, /^abeille domestique$/i, /^mouche domestique$/i, /^paon-du-jour$/i],
  },
  {
    file: "arbres-france.json",
    upFromFacile: [/alisier/i, /cormier/i, /asiminier/i, /charme-houblon/i],
    downFromDifficile: [/^chêne pédonculé$/i, /^hêtre$/i, /^olivier$/i, /^pin sylvestre$/i],
  },
  {
    file: "fruits-legumes.json",
    upFromFacile: [/carambole/i, /dragon|pitaya/i, /tamarin/i, /manioc/i, /igname/i],
    downFromDifficile: [/^pomme$/i, /^banane$/i, /^orange$/i, /^carotte$/i, /^pomme de terre$/i, /^tomate$/i, /^oignon$/i],
  },
  {
    file: "reptiles-france.json",
    upFromFacile: [/bonnal/i, /val d.aran/i, /aurelio/i, /bedriaga/i, /seoane/i],
    downFromDifficile: [/^lézard des murailles$/i],
  },
  {
    file: "nuages.json",
    upFromFacile: [/volutus/i, /asperitas/i, /kelvin/i],
    downFromDifficile: [/^cumulus$/i, /^stratus$/i, /^cirrus$/i],
  },
];

for (const r of diffRules) {
  const q = load(r.file);
  eachQuestion(q, (x, g) => {
    if (x.difficulte === "facile" && r.upFromFacile.some((re) => re.test(x.nom_commun))) {
      issue("diff", r.file, `${x.nom_commun} (${g.id}) est « facile » → remonter`);
    }
    if (x.difficulte === "difficile" && r.downFromDifficile.some((re) => re.test(x.nom_commun))) {
      issue("diff", r.file, `${x.nom_commun} (${g.id}) est « difficile » → trop dur`);
    }
  });
}

// Balance: groups with 0 facile or 0 difficile (info)
{
  const files = readdirSync(dataDir).filter((f) => f.endsWith(".json") && f !== "catalog.json");
  for (const file of files) {
    const q = load(file);
    if (!Array.isArray(q.groupes) || typeof q.groupes[0] === "string") continue;
    for (const g of q.groupes) {
      const qs = g.questions || [];
      if (qs.length < 5) continue;
      const by = { facile: 0, moyen: 0, difficile: 0 };
      for (const x of qs) by[x.difficulte] = (by[x.difficulte] || 0) + 1;
      if (by.facile === 0) issue("balance", file, `${g.id}: 0 facile / ${qs.length}`);
      if (by.difficile === 0) issue("balance", file, `${g.id}: 0 difficile / ${qs.length}`);
      const hardRatio = by.difficile / qs.length;
      if (hardRatio > 0.55 && qs.length >= 8) {
        issue("balance", file, `${g.id}: ${by.difficile}/${qs.length} difficile (${Math.round(hardRatio * 100)}%)`);
      }
    }
  }
}

const byKind = {};
for (const i of issues) {
  byKind[i.kind] = (byKind[i.kind] || 0) + 1;
}
console.log("Counts", byKind);
for (const kind of ["class", "dup", "diff", "balance", "note"]) {
  const rows = issues.filter((i) => i.kind === kind);
  if (!rows.length) continue;
  console.log(`\n=== ${kind} (${rows.length}) ===`);
  for (const r of rows) console.log(`- [${r.file}] ${r.detail}`);
}
