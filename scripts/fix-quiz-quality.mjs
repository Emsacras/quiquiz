/**
 * Corrige classification + difficultés flagrantes.
 * Usage: node scripts/fix-quiz-quality.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "public", "data");

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickDistractors(names, correct, seed) {
  return names
    .filter((n) => n !== correct)
    .map((n) => ({ n, k: hash(`${seed}|${n}`) }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 3)
    .map((x) => x.n);
}

function shuffleOptions(options, seed) {
  return [...options]
    .map((n, i) => ({ n, k: hash(`${seed}|opt|${i}|${n}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.n);
}

function rebuildOptions(quiz) {
  const allNames = quiz.groupes.flatMap((g) => g.questions.map((x) => x.nom_commun));
  for (const group of quiz.groupes) {
    const names = group.questions.map((x) => x.nom_commun);
    group.questions = group.questions.map((item, index) => {
      const qid = `${group.id}${index + 1}`;
      let distractors = pickDistractors(names, item.nom_commun, qid);
      if (distractors.length < 3) distractors = pickDistractors(allNames, item.nom_commun, qid);
      return {
        ...item,
        id: qid,
        groupe: group.id,
        options: shuffleOptions([item.nom_commun, ...distractors].slice(0, 4), qid),
      };
    });
  }
}

function load(file) {
  return JSON.parse(readFileSync(join(dataDir, file), "utf8"));
}

function save(file, quiz) {
  if (quiz.groupes?.[0]?.questions) rebuildOptions(quiz);
  writeFileSync(join(dataDir, file), `${JSON.stringify(quiz, null, 2)}\n`, "utf8");
  console.log("wrote", file);
}

function moveByName(quiz, nomCommun, toGroupId) {
  let item = null;
  for (const g of quiz.groupes) {
    const idx = g.questions.findIndex((x) => x.nom_commun === nomCommun);
    if (idx >= 0) {
      [item] = g.questions.splice(idx, 1);
      break;
    }
  }
  if (!item) {
    console.warn("missing", nomCommun);
    return false;
  }
  const dest = quiz.groupes.find((g) => g.id === toGroupId);
  if (!dest) throw new Error(toGroupId);
  dest.questions.push(item);
  console.log(`  move ${nomCommun} → ${toGroupId}`);
  return true;
}

function removeByName(quiz, nomCommun, groupId = null) {
  for (const g of quiz.groupes) {
    if (groupId && g.id !== groupId) continue;
    const before = g.questions.length;
    g.questions = g.questions.filter((x) => x.nom_commun !== nomCommun);
    if (g.questions.length !== before) {
      console.log(`  remove ${nomCommun} from ${g.id}`);
      return true;
    }
  }
  console.warn("remove miss", nomCommun);
  return false;
}

function setDiff(quiz, nomCommun, difficulte) {
  for (const g of quiz.groupes) {
    for (const x of g.questions) {
      if (x.nom_commun === nomCommun && x.difficulte !== difficulte) {
        console.log(`  diff ${nomCommun}: ${x.difficulte} → ${difficulte}`);
        x.difficulte = difficulte;
        return true;
      }
    }
  }
  return false;
}

function setDiffBird(groupFile, nomCommun, difficulte) {
  const path = join(dataDir, "oiseaux", groupFile);
  const g = JSON.parse(readFileSync(path, "utf8"));
  let ok = false;
  for (const x of g.questions) {
    if (x.nom_commun === nomCommun && x.difficulte !== difficulte) {
      console.log(`  bird ${groupFile} ${nomCommun}: ${x.difficulte} → ${difficulte}`);
      x.difficulte = difficulte;
      ok = true;
    }
  }
  if (ok) writeFileSync(path, `${JSON.stringify(g, null, 2)}\n`, "utf8");
  return ok;
}

// --- Mammifères ---
{
  const q = load("mammiferes-france.json");
  moveByName(q, "Ragondin", "rongeurs");
  moveByName(q, "Genette commune", "carnivores");
  setDiff(q, "Noctule commune", "moyen");
  setDiff(q, "Pipistrelle de Kuhl", "facile");
  setDiff(q, "Sérotine commune", "facile");
  const marins = q.groupes.find((g) => g.id === "marins");
  if (marins) marins.label = "Marins";
  save("mammiferes-france.json", q);
}

// --- Minéraux ---
{
  const q = load("rochers-mineraux.json");
  moveByName(q, "Pyrite", "metaux");
  // dedupe if Iron pyrite variant exists
  const metaux = q.groupes.find((g) => g.id === "metaux");
  if (metaux) {
    metaux.label = "Métaux, sulfures et autres";
    const seen = new Set();
    metaux.questions = metaux.questions.filter((x) => {
      const k = x.nom_commun.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  save("rochers-mineraux.json", q);
}

// --- Fruits ---
{
  const q = load("fruits-legumes.json");
  moveByName(q, "Okra", "fruits");
  // Fenouil bulbeux = légume bulbe/feuille OK; brocoli = inflorescence → garder feuilles
  setDiff(q, "Carambole", "difficile");
  setDiff(q, "Fruit du dragon", "difficile");
  setDiff(q, "Tamarin", "difficile");
  setDiff(q, "Manioc", "difficile");
  setDiff(q, "Igname", "difficile");
  save("fruits-legumes.json", q);
}

// --- Coquillages : retirer escargot terrestre ---
{
  const q = load("coquillages.json");
  removeByName(q, "Escargot de Bourgogne");
  save("coquillages.json", q);
}

// --- Feuilles : frêne mal placé en simples ---
{
  const q = load("feuilles-arbres.json");
  removeByName(q, "Frêne", "simples");
  save("feuilles-arbres.json", q);
}

// --- Arbres : cormier en double ---
{
  const q = load("arbres-france.json");
  removeByName(q, "Cormier", "feuillus");
  // Cerisier cultivé : préciser pour le distinguer du merisier
  for (const g of q.groupes) {
    for (const x of g.questions) {
      if (x.nom_commun === "Cerisier cultivé") {
        x.nom_scientifique = "Prunus avium (cultivar)";
      }
    }
  }
  setDiff(q, "Alisier torminal", "difficile");
  setDiff(q, "Cormier", "difficile");
  setDiff(q, "Charme-houblon", "difficile");
  save("arbres-france.json", q);
}

// --- Fossiles : coprolithe en double ---
{
  const q = load("fossiles.json");
  removeByName(q, "Coprolithe", "vertebres");
  save("fossiles.json", q);
}

// --- Reptiles : vipère aspic assez connue ---
{
  const q = load("reptiles-france.json");
  setDiff(q, "Vipère aspic", "moyen");
  setDiff(q, "Couleuvre à échelons", "moyen");
  setDiff(q, "Lézard ocellé", "moyen");
  save("reptiles-france.json", q);
}

// --- Insectes ---
{
  const q = load("insectes-france.json");
  setDiff(q, "Gasteruption", "difficile");
  setDiff(q, "Sapyga", "difficile");
  setDiff(q, "Pimpla", "difficile");
  setDiff(q, "Conops", "difficile");
  setDiff(q, "Diopsis", "difficile");
  setDiff(q, "Thècle du chêne", "difficile");
  setDiff(q, "Lucine", "difficile");
  setDiff(q, "Coccinelle à sept points", "facile");
  setDiff(q, "Abeille domestique", "facile");
  setDiff(q, "Paon-du-jour", "facile");
  save("insectes-france.json", q);
}

// --- Oiseaux FR : classification rapaces + difficultés ---
{
  const jardinPath = join(dataDir, "oiseaux", "jardin.json");
  const rapacesPath = join(dataDir, "oiseaux", "rapaces.json");
  const jardin = JSON.parse(readFileSync(jardinPath, "utf8"));
  const rapaces = JSON.parse(readFileSync(rapacesPath, "utf8"));
  const moveNames = ["Buse variable", "Milan noir", "Faucon crécerelle"];
  const moving = [];
  jardin.questions = jardin.questions.filter((x) => {
    if (!moveNames.includes(x.nom_commun)) return true;
    const copy = { ...x, groupe: "rapaces" };
    if (copy.nom_commun === "Milan noir") copy.difficulte = "moyen";
    if (copy.nom_commun === "Buse variable" || copy.nom_commun === "Faucon crécerelle") copy.difficulte = "facile";
    moving.push(copy);
    return false;
  });
  for (const x of moving) {
    if (!rapaces.questions.some((r) => r.nom_commun === x.nom_commun)) {
      rapaces.questions.push(x);
      console.log(`  bird move ${x.nom_commun} jardin → rapaces (${x.difficulte})`);
    }
  }
  writeFileSync(jardinPath, `${JSON.stringify(jardin, null, 2)}\n`, "utf8");
  writeFileSync(rapacesPath, `${JSON.stringify(rapaces, null, 2)}\n`, "utf8");
}

setDiffBird("jardin.json", "Corneille noire", "moyen");
setDiffBird("jardin.json", "Choucas des tours", "moyen");
setDiffBird("montagne.json", "Mésange nonnette", "moyen");
setDiffBird("montagne.json", "Mésange huppée", "moyen");
setDiffBird("montagne.json", "Mésange noire", "moyen");
setDiffBird("littoral.json", "Goéland argenté", "facile");
setDiffBird("eau.json", "Cygne tuberculé", "facile");

// --- Nuages ---
{
  const q = load("nuages.json");
  setDiff(q, "Asperitas", "difficile");
  setDiff(q, "Kelvin-Helmholtz", "difficile");
  setDiff(q, "Altocumulus volutus", "difficile");
  setDiff(q, "Cumulus", "facile");
  setDiff(q, "Cirrus", "facile");
  save("nuages.json", q);
}

// --- Bébés : blanchon/blanchet proches ---
{
  const q = load("bebes-animaux.json");
  // Blanchon = harp seal, Blanchet = harbor seal pup — OK distinct
  setDiff(q, "Pigeonneau", "moyen");
  setDiff(q, "Perroqueteau", "difficile");
  save("bebes-animaux.json", q);
}

console.log("done");
