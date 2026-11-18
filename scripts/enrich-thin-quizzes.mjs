/**
 * Enrichit les quiz « légers » avec des entrées réelles (pas d’invention).
 * Usage: node scripts/enrich-thin-quizzes.mjs
 *
 * Plafonds volontaires : on n’aligne pas reptiles/nuages sur les oiseaux —
 * le vivier photo-distinct réaliste est trop petit.
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
  const others = names.filter((n) => n !== correct);
  return others
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

function fold(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

/** @returns {{difficulte:string, nom_commun:string, nom_scientifique:string, indice:string, description:string, explication:string, imageQuery?:string}} */
function q(difficulte, nom_commun, nom_scientifique, indice, description, explication, imageQuery) {
  const row = { difficulte, nom_commun, nom_scientifique, indice, description, explication };
  if (imageQuery) row.imageQuery = imageQuery;
  return row;
}

function loadQuiz(file) {
  return JSON.parse(readFileSync(join(dataDir, file), "utf8"));
}

function rebuildOptions(quiz) {
  const allNames = quiz.groupes.flatMap((g) => g.questions.map((x) => x.nom_commun));
  for (const group of quiz.groupes) {
    const names = group.questions.map((x) => x.nom_commun);
    group.questions = group.questions.map((item, index) => {
      const qid = item.id || `${group.id}${index + 1}`;
      let distractors = pickDistractors(names, item.nom_commun, qid);
      if (distractors.length < 3) distractors = pickDistractors(allNames, item.nom_commun, qid);
      const options = shuffleOptions([item.nom_commun, ...distractors].slice(0, 4), qid);
      return { ...item, id: qid, groupe: group.id, options };
    });
  }
  return quiz;
}

function mergeGroup(quiz, groupId, additions) {
  const group = quiz.groupes.find((g) => g.id === groupId);
  if (!group) throw new Error(`missing group ${groupId} in ${quiz.id}`);
  const have = new Set(
    group.questions.flatMap((x) => [fold(x.nom_scientifique), fold(x.nom_commun)].filter(Boolean)),
  );
  let added = 0;
  for (const row of additions) {
    const keys = [fold(row.nom_scientifique), fold(row.nom_commun)].filter(Boolean);
    if (keys.some((k) => have.has(k))) continue;
    for (const k of keys) have.add(k);
    group.questions.push({ ...row, groupe: groupId });
    added += 1;
  }
  // renumber ids stably within group
  group.questions.forEach((item, index) => {
    item.id = `${groupId}${index + 1}`;
    item.groupe = groupId;
  });
  return added;
}

function countQuiz(quiz) {
  return quiz.groupes.reduce((s, g) => s + g.questions.length, 0);
}

function writeQuiz(quiz) {
  rebuildOptions(quiz);
  const file = `${quiz.id}.json`;
  writeFileSync(join(dataDir, file), `${JSON.stringify(quiz, null, 2)}\n`, "utf8");
  const n = countQuiz(quiz);
  console.log(`wrote ${file} (${n} questions)`);
  return n;
}

// --- Additions (espèces / objets réels, photo-identifiables) ---

const mammalAdds = {
  carnivores: [
    q("facile", "Loup gris", "Canis lupus", "Canidé sauvage en meute", "Canidé gris à queue touffue, oreilles dressées, allure de grand chien sauvage.", "Loup gris : Prédateur de grand gibier, en reprise dans les Alpes et l’Est."),
    q("moyen", "Ours brun", "Ursus arctos", "Grand plantigrade montagnard", "Grand mammifère brun, museau allongé, bosse d’épaule marquée.", "Ours brun : Omnivore des Pyrénées ; population très limitée."),
    q("moyen", "Putois", "Mustela putorius", "Mustélidé sombre au masque clair", "Mustélidé brun-noir, bande claire sur le museau, queue courte.", "Putois : Prédateur de rongeurs et amphibiens, plutôt nocturne."),
    q("difficile", "Raton laveur", "Procyon lotor", "Masque noir, queue annelée", "Procyonidé au masque facial noir et à la queue rayée.", "Raton laveur : Espèce introduite, en expansion en France."),
    q("difficile", "Chien viverrin", "Nyctereutes procyonoides", "Allure de petit raton, queue unicolore", "Canidé trapu au masque sombre, queue touffue sans anneaux nets.", "Chien viverrin : Introduit, plutôt nocturne et discret."),
  ],
  ongules: [
    q("facile", "Bison d'Europe", "Bison bonasus", "Grand bovidé sauvage", "Immense bovidé brun, bosse marquée, crinière courte.", "Bison d'Europe : Réintroduit dans quelques espaces ; le plus grand herbivore terrestre d’Europe."),
    q("moyen", "Cerf sika", "Cervus nippon", "Cerf tacheté introduit", "Cervidé souvent encore tacheté à l’âge adulte, plus petit que le cerf élaphe.", "Cerf sika : Introduit, présents dans quelques massifs."),
  ],
  rongeurs: [
    q("facile", "Rat surmulot", "Rattus norvegicus", "Grand rat des villes", "Rongeur robuste, museau émoussé, queue plus courte que le corps.", "Rat surmulot : Commensal des humains, excellent nageur."),
    q("facile", "Mulot sylvestre", "Apodemus sylvaticus", "Petit rongeur à grandes oreilles", "Petit muridé fauve, ventre blanc, yeux et oreilles grands.", "Mulot sylvestre : Très commun des haies et jardins."),
    q("moyen", "Rat noir", "Rattus rattus", "Rat à longue queue", "Rongeur plus élancé, queue plus longue que le corps, oreilles grandes.", "Rat noir : Plus arboricole que le surmulot ; entrepôts, greniers."),
    q("moyen", "Campagnol des champs", "Microtus arvalis", "Petit rongeur à queue courte", "Petit campagnol au pelage brun, oreilles peu visibles, queue courte.", "Campagnol des champs : Rongeur des prairies, pullulations possibles."),
    q("moyen", "Écureuil gris", "Sciurus carolinensis", "Écureuil gris introduit", "Sciuridé gris (parfois noirâtre), sans pinceaux d’oreilles.", "Écureuil gris : Introduit, concurrence l’écureuil roux."),
    q("difficile", "Crossope aquatique", "Neomys fodiens", "Musaraigne aquatique", "Petite insectivore sombre, ventre clair, adaptée à la nage.", "Crossope aquatique : Musaraigne des berges, venimeuse à faible dose."),
    q("difficile", "Lérot", "Eliomys quercinus", "Petit loir masqué", "Gliridé au masque noir autour des yeux, queue longue bicolore.", "Lérot : Nocturne, souvent près des habitations en été."),
    q("difficile", "Musaraigne couronnée", "Sorex coronatus", "Très petite insectivore pointue", "Minuscule insectivore au museau pointu, dents rouges à la pointe.", "Musaraigne couronnée : Commune des milieux herbeux ; pas un rongeur."),
  ],
  chiropteres: [
    q("moyen", "Pipistrelle de Kuhl", "Pipistrellus kuhlii", "Petite chauve-souris claire", "Petite pipistrelle souvent claire, marge alaire claire fréquente.", "Pipistrelle de Kuhl : Fréquente le sud et les zones urbanisées."),
    q("moyen", "Murin de Daubenton", "Myotis daubentonii", "Chasse au ras de l’eau", "Murin aux pieds grands, chasse les insectes au-dessus de l’eau.", "Murin de Daubenton : Lié aux rivières et plans d’eau."),
    q("difficile", "Barbastelle d'Europe", "Barbastella barbastellus", "Oreilles larges jointes", "Chauve-souris sombre aux oreilles larges se touchant sur le front.", "Barbastelle d'Europe : Forestière, sensible à la gestion des boisements."),
    q("difficile", "Petit rhinolophe", "Rhinolophus hipposideros", "Fer à cheval minuscule", "Petit rhinolophe au fer à cheval nasal, enveloppé dans ses ailes au repos.", "Petit rhinolophe : Espèce cavernicole / bâtiments, en déclin."),
    q("difficile", "Noctule commune", "Nyctalus noctula", "Grande chauve-souris rapide", "Grande chauve-souris fauve, ailes étroites, vol rapide en hauteur.", "Noctule commune : Souvent dans les arbres creux et niches urbaines."),
  ],
  marins: [
    q("moyen", "Globicephale noir", "Globicephala melas", "Dauphin-pilote à tête ronde", "Cétacé noir à front bombé (« melon »), nageoire dorsale recourbée.", "Globicephale noir : Observé au large des côtes atlantiques."),
    q("difficile", "Cachalot", "Physeter macrocephalus", "Énorme tête carrée", "Grand cétacé à tête massive carrée, évent unique décalé.", "Cachalot : Présent au large ; le plus grand des odontocètes."),
  ],
};

const treeAdds = {
  feuillus: [
    q("facile", "Chêne sessile", "Quercus petraea", "Chêne à glands sans long pédoncule", "Grand chêne au fût droit, glands sessiles ou presque.", "Chêne sessile : Essence majeure des forêts françaises."),
    q("facile", "Noisetier", "Corylus avellana", "Arbrisseau à chatons et noisettes", "Arbrisseau des haies, chatons pendants, fruits en cupule.", "Noisetier : Très commun des lisières et bocages."),
    q("facile", "Saule marsault", "Salix caprea", "Saule à gros chatons soyeux", "Petit arbre / arbrisseau, chatons ovales duveteux au printemps.", "Saule marsault : Pioneer des milieux ouverts et bords de chemins."),
    q("moyen", "Chêne pubescent", "Quercus pubescens", "Chêne du sud, feuilles duvetées", "Chêne méditerranéen-atlantique, jeunes pousses et dessous de feuilles poilus.", "Chêne pubescent : Typique des collines calcaires du sud et de l’ouest."),
    q("moyen", "Érable plane", "Acer platanoides", "Érable à lobes pointus", "Érable à feuilles palmées pointues, fleurs jaune-vert précoces.", "Érable plane : Fréquent en ville et forêts mixtes."),
    q("moyen", "Érable champêtre", "Acer campestre", "Petit érable des haies", "Petit érable à feuilles lobées arrondies, samares horizontales.", "Érable champêtre : Essence des haies bocagères."),
    q("moyen", "Saule blanc", "Salix alba", "Grand saule des rivières", "Grand saule au feuillage argenté, fréquent au bord des cours d’eau.", "Saule blanc : Typique des ripisylves."),
    q("difficile", "Alisier torminal", "Sorbus torminalis", "Feuilles lobées, fruits brunâtres", "Sorbus à feuilles découpées, fruits bruns à maturité.", "Alisier torminal : Essence précieuse des forêts calcaires."),
    q("difficile", "Cormier", "Sorbus domestica", "Sorbier à fruits piriformes", "Arbre proche des sorbiers, fruits en forme de petite poire.", "Cormier : Devenu rare hors vergers et quelques forêts."),
    q("difficile", "Tilleul à petites feuilles", "Tilia cordata", "Tilleul à feuilles cordiformes petites", "Tilleul aux feuilles plus petites que le tilleul à grandes feuilles.", "Tilleul à petites feuilles : Essence forestière et d’alignement."),
  ],
  coniferes: [
    q("facile", "Pin maritime", "Pinus pinaster", "Grand pin des Landes", "Pin à long tronc, écorce profonde, aiguilles longues par deux.", "Pin maritime : Essence emblématique des landes atlantiques."),
    q("facile", "Pin d'Alep", "Pinus halepensis", "Pin clair du Midi", "Pin méditerranéen au tronc souvent tortueux, aiguilles fines claires.", "Pin d'Alep : Très présent sur le littoral méditerranéen."),
    q("moyen", "Pin noir d'Autriche", "Pinus nigra", "Pin sombre à écorce grisâtre", "Pin à aiguilles longues sombres, écorce en plaques gris-brun.", "Pin noir : Souvent planté, aussi en reboisement."),
    q("moyen", "Sapin de Vancouver", "Abies grandis", "Sapin introduit à aiguilles plates odorantes", "Grand sapin d’ornement / plantation, aiguilles plates très odorantes.", "Sapin de Vancouver : Introduit, plantations et parcs."),
    q("difficile", "Genévrier cade", "Juniperus oxycedrus", "Genévrier méditerranéen à baies rougeâtres", "Genévrier épineux du Midi, cônes charnus rouge-brun.", "Genévrier cade : Garrigues et maquis."),
    q("difficile", "If commun", "Taxus baccata", "Déjà listé parfois — aiguilles plates, arille rouge", "Conifère toxique à arille rouge charnu entourant la graine.", "If commun : Haies, parcs, quelques peuplements naturels."),
  ],
  mediterraneens: [
    q("facile", "Pin pignon", "Pinus pinea", "Synonyme usuel du pin parasol", "Pin au houppier en parasol, cônes gros et graines comestibles.", "Pin pignon : Autre nom usuel du pin parasol."),
    q("moyen", "Chêne kermès", "Quercus coccifera", "Petit chêne épineux de garrigue", "Arbrisseau à feuilles persistantes dentées-épineuses.", "Chêne kermès : Garrigues méditerranéennes."),
    q("moyen", "Filaire à feuilles étroites", "Phillyrea angustifolia", "Arbuste persistant des maquis", "Arbuste à feuilles étroites opposées, proche des oliviers sauvages.", "Filaire : Maquis et garrigues."),
    q("difficile", "Pistachier lentisque", "Pistacia lentiscus", "Arbuste résineux du Midi", "Arbuste persistant, feuilles paripennées, odeur résineuse.", "Lentisque : Typique du maquis méditerranéen."),
    q("difficile", "Arbousier", "Arbutus unedo", "Déjà parfois listé — fruits granulés", "Arbuste à écorce s’exfoliant, fruits rouge granulés.", "Arbousier : Maquis et forêts claires du sud."),
  ],
  fruitiers: [
    q("facile", "Cerisier cultivé", "Prunus avium", "Cerisier des vergers (douce)", "Arbre à fleurs blanches, fruits rouges à queue courte.", "Cerisier : Forme cultivée proche du merisier."),
    q("facile", "Prunier", "Prunus domestica", "Fruits à noyau allongés", "Arbre fruitier à prunes, écorce souvent rugueuse.", "Prunier : Vergers et jardins."),
    q("moyen", "Cognassier", "Cydonia oblonga", "Fruits duveteux parfumés", "Petit arbre à grandes fleurs, fruits jaunes duveteux.", "Cognassier : Fruitiers anciens, gelées et pâtisseries."),
    q("moyen", "Néflier commun", "Mespilus germanica", "Nèfles à sépales persistants", "Arbre à nèfles brunâtres couronnées de sépales.", "Néflier commun : Ancien fruitier, distinct du néflier du Japon."),
    q("moyen", "Sorbier des oiseleurs", "Sorbus aucuparia", "Grappes de baies orange", "Arbre à feuilles composées, grappes de baies orangées.", "Sorbier des oiseleurs : Montagne et lisières ; fruits pour oiseaux."),
    q("difficile", "Cormier", "Sorbus domestica", "Fruitier rare à cormes", "Grand sorbier à fruits piriformes astringents crus.", "Cormier : Ancien fruitier forestier devenu rare."),
    q("difficile", "Jujubier", "Ziziphus jujuba", "Petit fruitier méditerranéen", "Arbuste épineux à fruits ovoïdes brun-rouge.", "Jujubier : Cultivé dans le Midi."),
  ],
};

const insectAdds = {
  coleopteres: [
    q("facile", "Coccinelle à deux points", "Adalia bipunctata", "Petite coccinelle à 2 points", "Petite coccinelle rouge (ou noire) le plus souvent à deux points.", "Coccinelle à deux points : Très variable, commune au jardin."),
    q("facile", "Carabe des bois", "Carabus nemoralis", "Carabe violacé des sous-bois", "Grand carabe sombre à reflets, actif au sol la nuit.", "Carabe des bois : Prédateur de limaces et vers."),
    q("moyen", "Lepture cordigère", "Stictoleptura cordigera", "Longicorne jaune et noir", "Longicorne aux élytres jaunes marqués de noir, sur les fleurs.", "Lepture cordigère : Fréquente les ombelles en été."),
    q("moyen", "Oedemère noble", "Oedemera nobilis", "Mâle aux cuisses postérieures gonflées", "Coléoptère vert métallique ; mâle avec cuisses arrière très épaisses.", "Oedemère noble : Commun sur les fleurs au soleil."),
    q("moyen", "Rhizophage noir", "Rhizophagus fenestralis", "Petit coléoptère sous écorces", "Petit coléoptère allongé des écorces et bois mort.", "Rhizophage : Lié au bois en décomposition."),
    q("difficile", "Cicindèle champêtre", "Cicindela campestris", "Cicindèle verte rapide", "Coléoptère vert vif à taches blanches, course très rapide au sol.", "Cicindèle champêtre : Chasseur diurne des sols sableux."),
    q("difficile", "Agril du troène", "Agrilus derasofasciatus", "Bupreste étroit des arbustes", "Petit bupreste allongé, métallique, lié aux ligneux.", "Agrilus : Nombreuses espèces proches ; celui des troènes / fusains."),
    q("difficile", "Ténébrion meunier", "Tenebrio molitor", "Ver de farine adulte", "Coléoptère noir mat des denrées ; larve = ver de farine.", "Ténébrion meunier : Commensal des stocks de céréales."),
    q("difficile", "Lepture tachetée", "Rutpela maculata", "Longicorne jaune tacheté de noir", "Longicorne aux élytres jaunes à taches noires, sur fleurs.", "Lepture tachetée : Estivale, butine les ombellifères."),
  ],
  lepidopteres: [
    q("facile", "Piéride de la rave", "Pieris rapae", "Petit papillon blanc à un point", "Papillon blanc avec un (femelle) ou peu de points noirs sur l’aile.", "Piéride de la rave : Très commune ; chenille sur crucifères."),
    q("facile", "Aurore", "Anthocharis cardamines", "Mâle à pointe orange", "Piéride : mâle avec apex orange vif sur l’aile antérieure.", "Aurore : Printanière des prairies et lisières."),
    q("moyen", "Tabac d'Espagne", "Argynnis paphia", "Grand nacré des forêts", "Grand papillon orange chiqueté de noir, dessous marbré d’argent.", "Tabac d'Espagne : Clairières et forêts claires."),
    q("moyen", "Paon de nuit", "Saturnia pyri", "Grand papillon nocturne ocellé", "Très grand hétérocère brun aux ocelles marqués.", "Grand paon de nuit : Le plus grand papillon d’Europe."),
    q("moyen", "Cuivré commun", "Lycaena phlaeas", "Petit papillon cuivré", "Petit lycène aux ailes antérieures cuivrées bordées de sombre.", "Cuivré commun : Prairies et friches sèches."),
    q("difficile", "Lucine", "Hamearis lucina", "Damier orangé des sous-bois", "Petit papillon orangé à damier sombre, lié aux primevères.", "Lucine : Sous-bois clairs, chenille sur Primula."),
    q("difficile", "Thècle du chêne", "Favonius quercus", "Thècle pourpré des chênaies", "Petit papillon discret ; mâle à reflet pourpre dessus.", "Thècle du chêne : Canopée des chênes, difficile à observer."),
    q("difficile", "Zygène de la coronille", "Zygaena ephialtes", "Zygène variable noir/rouge/blanc", "Zygène aux motifs très variables (rouge, blanc, noir).", "Zygène de la coronille : Pelouses sèches à légumineuses."),
    q("difficile", "Écaille chinée", "Euplagia quadripunctaria", "Écaille rose et léopard", "Hétérocère aux ailes antérieures léopardées, postérieures roses.", "Écaille chinée : Espèce protégée, gorges fraîches (ex. Vallée des Papillons)."),
  ],
  hymenopteres: [
    q("facile", "Bourdon des champs", "Bombus pascuorum", "Bourdon fauve courant", "Bourdon au thorax et abdomen plutôt fauves, très commun.", "Bourdon des champs : Butineur des jardins et friches."),
    q("moyen", "Abeille charpentière", "Xylocopa violacea", "Grande abeille violette", "Grande abeille noir-violacé brillant, vol puissant.", "Abeille charpentière : Niche dans le bois mort ; impressionnante mais peu agressive."),
    q("moyen", "Guêpe poliste", "Polistes dominula", "Guêpe au nid ouvert", "Guêpe au corps élancé, nid en parapluie sans enveloppe épaisse.", "Poliste : Nids souvent sous les avant-toits."),
    q("difficile", "Gasteruption", "Gasteruption jaculator", "Ichneumon à abdomen très long", "Hyménoptère noir à abdomen extrêmement allongé, sur les fleurs.", "Gasteruption : Parasitoïde discret, taille fine."),
    q("difficile", "Scolie des jardins", "Megascolia maculata", "Grosse guêpe du Midi tachetée", "Très grosse guêpe sombre à taches jaunes, vol lourd.", "Scolie : Parasitoïde de larves de cétoines ; Midi."),
  ],
  dipteres: [
    q("facile", "Syrphe porte-plume", "Scaeva pyrastri", "Syrphe à lunules blanches", "Syrphe aux marques blanches en lunules sur l’abdomen.", "Scaeva pyrastri : Mimétique des guêpes, utile aux jardins."),
    q("moyen", "Eristale gluante", "Eristalis tenax", "Syrphe « fausse abeille »", "Syrphe trapu brun-orange mimant une abeille.", "Eristale : Larve en « ver à queue de rat » dans eaux stagnantes."),
    q("moyen", "Bombyle discontinu", "Bombylius discolor", "Mouche duveteuse à longue trompe", "Diptère très velu, longue trompe, vol stationnaire devant les fleurs.", "Bombyle : Parasitoïde d’abeilles solitaires au stade larvaire."),
    q("difficile", "Conops", "Conops quadrifasciatus", "Diptère élancé mime de guêpe", "Diptère jaune et noir très allongé, abdomen courbé.", "Conops : Parasitoïde d’hyménoptères."),
  ],
  autres: [
    q("facile", "Demoiselle aquatique", "Calopteryx splendens", "Caloptéryx à ailes colorées", "Odonate au corps métallique ; mâle aux ailes en grande partie bleutées.", "Caloptéryx éclatant : Berges de rivières calmes."),
    q("facile", "Criquet duetiste", "Chorthippus biguttulus", "Petit criquet chanteur", "Petit criquet brun des herbes ; chant en « décharges ».", "Criquet duetiste : Très commun des prairies."),
    q("moyen", "Anax empereur", "Anax imperator", "Grande libellule bleue", "Très grande libellule ; mâle abdomen surtout bleu.", "Anax empereur : Plans d’eau, excellent voilier."),
    q("moyen", "Sauterelle verte", "Tettigonia viridissima", "Grande sauterelle verte", "Grande ensifère verte, antennes très longues, chant puissant.", "Sauterelle verte : Haies et friches ; omnivore."),
    q("moyen", "Forficule", "Forficula auricularia", "Perce-oreille commun", "Insecte allongé à pince abdominale (cerques).", "Perce-oreille : Utile au jardin, se cache le jour."),
    q("difficile", "Mante religieuse", "Mantis religiosa", "Déjà connue — rapaces avant", "Dictyoptère allongé aux pattes ravisseuses.", "Mante religieuse : Emblématique des friches ensoleillées."),
    q("difficile", "Aeschne bleue", "Aeshna cyanea", "Grande libellule d’automne", "Grande libellule verte et bleue, active tard en saison.", "Aeschne bleue : Jardins et lisières en fin d’été."),
    q("difficile", "Empuse pennée", "Empusa pennata", "Mante crêtée du Midi", "Proche des mantes, crête sur la tête, allure très découpée.", "Empuse : Méditerranéenne, plus rare que la mante."),
  ],
};

const fruitAdds = {
  fruits: [
    q("facile", "Orange", "Citrus × sinensis", "Agrume orange rond", "Agrume sphérique à peau orange, quartiers juteux.", "Orange : Agrume le plus consommé."),
    q("facile", "Citron", "Citrus limon", "Agrume jaune acide", "Fruit jaune ovale, très acide, peau souvent rugueuse.", "Citron : Cuisine et boissons."),
    q("facile", "Raisin", "Vitis vinifera", "Grappes de baies", "Baies en grappe, peau fine, chair juteuse.", "Raisin : Table ou vin selon variétés."),
    q("facile", "Cerise", "Prunus avium", "Petite drupe rouge", "Petit fruit à noyau, rouge à noir selon variétés.", "Cerise : Fruit de début d’été."),
    q("moyen", "Pamplemousse", "Citrus × paradisi", "Gros agrume amer-doux", "Gros agrume jaune-rose, chair plus amère que l’orange.", "Pamplemousse : Petit-déjeuner et jus."),
    q("moyen", "Abricot", "Prunus armeniaca", "Drupe orange veloutée", "Fruit orange à sillon, peau souvent veloutée.", "Abricot : Verger du sud et fruits secs."),
    q("moyen", "Figue", "Ficus carica", "Fruit poire doux à peau fine", "Sycone en forme de poire, chair rose à graines fines.", "Figue : Méditerranéenne, fraîche ou séchée."),
    q("moyen", "Grenade", "Punica granatum", "Fruit à grains rouges", "Fruit couronné de sépales, plein d’arilles juteux.", "Grenade : Grains comestibles, jus coloré."),
    q("difficile", "Kaki", "Diospyros kaki", "Fruit orange du plaqueminier", "Gros fruit orange tomaté, astringent avant maturité complète.", "Kaki : Automne ; blettir ou variétés non astringentes."),
    q("difficile", "Coing", "Cydonia oblonga", "Fruit duveteux du cognassier", "Fruit jaune parfumé, dur cru, excellent cuit.", "Coing : Gelées et pâtisseries."),
    q("difficile", "Nèfle du Japon", "Eriobotrya japonica", "Fruit orange précoce", "Petits fruits orange en grappes, noyaux gros.", "Nèfle du Japon : Maturité en fin d’hiver / printemps."),
    q("difficile", "Fruit de la passion", "Passiflora edulis", "Baie à coque sombre", "Fruit ovoïde pourpre ou jaune, pulpe aromatique à graines.", "Fruit de la passion : Tropical / serres ; parfum intense."),
    q("facile", "Tomate", "Solanum lycopersicum", "Baie rouge culinaire", "Fruit charnu rouge (ou jaune), sépales verts persistants.", "Tomate : Botaniquement un fruit, cuisinée comme légume."),
    q("moyen", "Concombre", "Cucumis sativus", "Fruit allongé vert", "Fruit allongé vert à peau souvent verruqueuse ou lisse.", "Concombre : Frais, en salade."),
    q("moyen", "Courgette", "Cucurbita pepo", "Jeune courge verte", "Fruit cylindrique vert, récolté immature.", "Courgette : Variété de courge récoltée jeune."),
    q("moyen", "Aubergine", "Solanum melongena", "Fruit violet allongé", "Fruit violet brillant (souvent), chair claire.", "Aubergine : Cuisine méditerranéenne."),
    q("moyen", "Poivron", "Capsicum annuum", "Fruit creux coloré", "Fruit creux à paroi épaisse, vert / jaune / rouge.", "Poivron : Même espèce que certains piments doux."),
  ],
  feuilles: [
    q("facile", "Laitue", "Lactuca sativa", "Salade en pomme ou feuilles", "Feuilles tendres en rosette ou pomme selon type.", "Laitue : Base des salades."),
    q("facile", "Épinard", "Spinacia oleracea", "Feuilles vert foncé", "Feuilles triangulaires-lobées, vert soutenu.", "Épinard : Cru ou cuit."),
    q("moyen", "Blette", "Beta vulgaris subsp. cicla", "Côtes et feuilles", "Larges côtes blanches ou colorées, feuilles vertes.", "Blette : Proche de la betterave, cuisinée pour côtes et feuilles."),
    q("moyen", "Chou kale", "Brassica oleracea var. sabellica", "Chou frisé non pommé", "Feuilles frisées dressées, sans pomme dense.", "Kale : Chou à feuilles, résistant au froid."),
    q("moyen", "Brocoli", "Brassica oleracea var. italica", "Inflorescence verte dense", "Tête d’inflorescences vertes charnues.", "Brocoli : Chou sélectionné pour ses fleurs."),
    q("difficile", "Mâche", "Valerianella locusta", "Petites rosettes tendres", "Petites feuilles en rosette, douce, d’automne-hiver.", "Mâche : Salade de saison froide."),
    q("difficile", "Roquette", "Eruca vesicaria", "Feuilles découpées piquantes", "Feuilles pennées au goût poivré.", "Roquette : Mesclun et pizzas."),
    q("difficile", "Fenouil bulbeux", "Foeniculum vulgare var. azoricum", "Bulbe à côtes anisées", "Base feuillée renflée, goût anisé.", "Fenouil : Légume et aromate."),
  ],
  racines: [
    q("facile", "Carotte", "Daucus carota subsp. sativus", "Racine orange allongée", "Racine pivotante orange (souvent), feuillage finement découpé.", "Carotte : Légume-racine de base."),
    q("facile", "Pomme de terre", "Solanum tuberosum", "Tubercule amidonné", "Tubercule souterrain à « yeux », chair variable.", "Pomme de terre : Base alimentaire mondiale."),
    q("facile", "Oignon", "Allium cepa", "Bulbe tuniqué", "Bulbe en tuniques papyracées, odeur alliacée.", "Oignon : Aromate universel."),
    q("moyen", "Ail", "Allium sativum", "Bulbe à caïeux", "Bulbe composé de gousses (caïeux) sous tunique.", "Ail : Aromate majeur."),
    q("moyen", "Betterave", "Beta vulgaris", "Racine rouge globuleuse", "Racine charnue souvent rouge intense, feuilles aussi comestibles.", "Betterave : Sucrière ou potagère."),
    q("difficile", "Radis noir", "Raphanus sativus var. niger", "Longue racine noire piquante", "Racine allongée à peau noire, chair blanche piquante.", "Radis noir : Condiment et légume d’hiver."),
    q("difficile", "Céleri-rave", "Apium graveolens var. rapaceum", "Racine noueuse beige", "Base hypertrophiée beige, feuilles type céleri.", "Céleri-rave : Rémoulades et soupes."),
    q("difficile", "Topinambour", "Helianthus tuberosus", "Tubercule noueux", "Tubercule irrégulier beige, saveur d’artichaut.", "Topinambour : Asteracée, tubercules d’hiver."),
    q("difficile", "Panais", "Pastinaca sativa", "Racine blanche de type carotte", "Racine pivotante crème, parfum sucré-épicé.", "Panais : Légume ancien de saison froide."),
  ],
  legumineuses: [
    q("facile", "Haricot vert", "Phaseolus vulgaris", "Gousse allongée verte", "Gousse comestible récoltée immature, graines encore petites.", "Haricot vert : Légumineuse mangée en gousse."),
    q("facile", "Petit pois", "Pisum sativum", "Graines rondes en gousse", "Gousse contenant des graines sphériques vertes.", "Pois : Frais, cassés ou chiches selon espèces proches."),
    q("moyen", "Lentille", "Lens culinaris", "Petites graines aplaties", "Petites graines lenticulaires sèches, couleurs variables.", "Lentille : Légumineuse sèche de base."),
    q("moyen", "Pois chiche", "Cicer arietinum", "Graine beige bosselée", "Graine irrégulière beige, base des houmous.", "Pois chiche : Méditerranéen / oriental."),
    q("difficile", "Fève", "Vicia faba", "Grosses graines aplaties", "Grosses graines aplaties en gousse épaisse.", "Fève : Fraîche au printemps ou sèche."),
    q("difficile", "Soja", "Glycine max", "Graines crème en gousse poilue", "Gousses poilues, graines utilisées pour tofu et sauces.", "Soja : Légumineuse oléoprotéagineuse."),
  ],
};

function enrichFile(file, byGroup) {
  const quiz = loadQuiz(file);
  let totalAdded = 0;
  for (const [groupId, rows] of Object.entries(byGroup)) {
    totalAdded += mergeGroup(quiz, groupId, rows);
  }
  const n = writeQuiz(quiz);
  return { id: quiz.id, added: totalAdded, total: n };
}

const results = [];
results.push(enrichFile("mammiferes-france.json", mammalAdds));
results.push(enrichFile("arbres-france.json", treeAdds));
results.push(enrichFile("insectes-france.json", insectAdds));
results.push(enrichFile("fruits-legumes.json", fruitAdds));

// Modest cloud additions (WMO / phenomena réels)
results.push(
  enrichFile("nuages.json", {
    bas: [
      q("moyen", "Stratocumulus stratiformis", "Stratocumulus stratiformis", "Couche basse en dalles", "Nappe basse de dalles ou rouleaux, gris ou blanchâtres.", "Stratocumulus stratiformis : Forme la plus fréquente de stratocumulus.", "stratocumulus cloud sheet"),
      q("difficile", "Cumulus congestus", "Cumulus congestus", "Tour déjà haute sans enclume", "Cumulus très développé verticalement, sommet encore cauliflore.", "Cumulus congestus : Stade avant cumulonimbus.", "cumulus congestus"),
    ],
    moyen: [
      q("difficile", "Altocumulus volutus", "Altocumulus volutus", "Rouleau isolé en altitude", "Nuage en tube allongé, espèce rare d’altocumulus.", "Altocumulus volutus : Rouleau ; à ne pas confondre avec arcus bas.", "altocumulus volutus"),
    ],
    haut: [
      q("moyen", "Cirrus floccus", "Cirrus floccus", "Touffes élevées à trainée", "Petites touffes de cirrus souvent avec virga.", "Cirrus floccus : Étages élevés, structure en flocons.", "cirrus floccus"),
      q("difficile", "Cirrocumulus undulatus", "Cirrocumulus undulatus", "Moutons élevés ondulés", "Banc de cirrocumulus arrangés en ondulations.", "Cirrocumulus undulatus : Très haut, sans ombre propre.", "cirrocumulus undulatus"),
    ],
  }),
);

const mineralAdds = {
  silicates: [
    q("facile", "Quartz fumé", "Smoky quartz", "Quartz brun translucide", "Variété de quartz brun à gris fumé, cristallisée.", "Quartz fumé : Variété de quartz colorée par irradiation naturelle.", "smoky quartz crystal"),
    q("moyen", "Améthyste", "Amethyst", "Quartz violet", "Quartz violet en géodes ou pointes.", "Améthyste : Variété violette du quartz.", "amethyst crystal"),
    q("difficile", "Épidote", "Epidote", "Vert pistache prismatique", "Silicate vert pistache à vert sombre, allongé.", "Épidote : Fréquente dans certaines roches métamorphiques.", "epidote crystal"),
    q("difficile", "Grenat almandin", "Almandine", "Grenat rouge sombre", "Nésosilicate rouge foncé, faces dodécaédriques.", "Almandin : Grenat ferreux des schistes et pegmatites.", "almandine garnet"),
  ],
  carbonates: [
    q("moyen", "Dolomie", "Dolomite", "Carbonate Mg-Ca", "Proche de la calcite, moins réactive à froid à l’acide dilué.", "Dolomie : Roche / minéral magnésien des dolomies.", "dolomite mineral"),
    q("difficile", "Malachite", "Malachite", "Vert bandé cuivreux", "Carbonate de cuivre vert, souvent bandes concentriques.", "Malachite : Minerai de cuivre secondaire, gemme ornementale.", "malachite mineral"),
  ],
  oxydes: [
    q("moyen", "Magnétite", "Magnetite", "Aimantée, noire", "Oxide de fer noir, naturellement magnétique.", "Magnétite : Minerai de fer, cristaux octaédriques.", "magnetite crystal"),
    q("difficile", "Rutile", "Rutile", "Aiguilles / prismes rouge-brun", "Oxide de titane, souvent en aiguilles dans le quartz.", "Rutile : Source de titane ; inclusions « flèches d’amour ».", "rutile crystal"),
  ],
  gemmes: [
    q("facile", "Turquoise", "Turquoise", "Bleu-vert opaque", "Phosphate cuivreux bleu-vert, cabochons.", "Turquoise : Gemme opaque classique.", "turquoise gemstone"),
    q("moyen", "Lapis-lazuli", "Lazurite", "Bleu outremer tacheté de pyrite", "Roche gemme bleue (lazurite) souvent ponctuée d’or de pyrite.", "Lapis-lazuli : Ornemental depuis l’Antiquité.", "lapis lazuli stone"),
    q("difficile", "Péridot", "Peridot", "Vert olive gemme", "Silicate de Mg-Fe vert olive, gemme = péridot.", "Péridot : Variété gemme de l’olivine.", "peridot gemstone"),
  ],
  metaux: [
    q("facile", "Cuivre natif", "Native copper", "Métal rouge malleable", "Métal rouge-orangé, malléable, patine verdâtre possible.", "Cuivre natif : Parfois en masses branchues.", "native copper mineral"),
    q("moyen", "Argent natif", "Native silver", "Métal blanc brillant", "Métal blanc, filamenteux ou en masses, ternit.", "Argent natif : Plus rare que le cuivre natif.", "native silver mineral"),
    q("difficile", "Or natif", "Native gold", "Métal jaune dense", "Métal jaune inaltérable, très dense, souvent en paillettes.", "Or natif : Filons et placers.", "native gold nugget"),
  ],
};

const shellAdds = {
  gasteropodes: [
    q("facile", "Bigorneau", "Littorina littorea", "Petit gastéropode de estran", "Petite coquille spiralée sombre des rochers battus.", "Bigorneau : Très commun de l’Atlantique ; comestible.", "periwinkle shell littorina"),
    q("moyen", "Nasse réticulée", "Tritia reticulata", "Petite coquille réticulée", "Petit buccin à réseau de côtes, sable et vase.", "Nasse réticulée : Charognarde des estrans.", "netted dog whelk"),
    q("moyen", "Patelle", "Patella vulgata", "Chapeau chinois sur rocher", "Coquille conique non spiralée, fixée aux rochers.", "Patelle : Broute les algues du médiolittoral.", "common limpet shell"),
    q("difficile", "Porcelaine méditerranée", "Luria lurida", "Coquille lisse vernissée", "Petite porcelaine brun-olivâtre brillante.", "Porcelaine : Méditerranéenne, coquille émaillée.", "Luria lurida cowrie"),
    q("difficile", "Tonne", "Tonna galea", "Très grosse coquille ventrue", "Grande coquille fine à large ouverture, Méditerranée.", "Tonne : Grand gastéropode méditerranéen.", "Tonna galea shell"),
  ],
  bivalves: [
    q("facile", "Moule", "Mytilus edulis", "Bivalve noirâtre fixé", "Deux valves allongées sombres, byssus sur rochers / bouchots.", "Moule : Élevée et sauvage sur les côtes.", "blue mussel shell"),
    q("facile", "Huître plate", "Ostrea edulis", "Huître ronde européenne", "Valves irrégulières, forme plus ronde que la japonaise.", "Huître plate : Espèce native européenne.", "Ostrea edulis oyster"),
    q("moyen", "Palourde", "Ruditapes decussatus", "Bivalve fouisseur ovale", "Coquille ovale à sculpture en croisillons, sables vaseux.", "Palourde : Estrans et lagunes.", "carpet shell clam"),
    q("moyen", "Coque", "Cerastoderma edule", "Bivalve côtelé rond", "Valves renflées à côtes rayonnantes marquées.", "Coque : Sables et vases du littoral atlantique.", "common cockle shell"),
    q("difficile", "Pétoncle noir", "Mimachlamys varia", "Petite pétoncle variable", "Petite pectinidé à oreilles inégales, couleurs variables.", "Pétoncle noir : Rochers et graviers côtiers.", "variegated scallop"),
  ],
  divers: [
    q("moyen", "Sépiion", "Sepia officinalis", "Os de seiche", "Plaque calcaire interne blanche de la seiche.", "Sépiion : Souvent rejeté sur les plages.", "cuttlebone sepiion"),
    q("difficile", "Gladius de calmar", "Loligo vulgaris", "Plume interne cornée", "Structure interne translucide en plume des calmars.", "Gladius : Homologue interne de la coquille.", "squid gladius pen"),
  ],
};

const fossilAdds = {
  invertebres: [
    q("facile", "Ammonite", "Ammonoidea", "Spirale fossilisée", "Coquille spiralée cloisonnée, très fréquente au Secondaire.", "Ammonite : Céphalopode fossile emblématique.", "ammonite fossil"),
    q("moyen", "Bélemnite", "Belemnitida", "Rostrum en « balle »", "Fossile en forme de balle / cigare (rostrum de céphalopode).", "Bélemnite : Rostrum interne de coléoïdes mésozoïques.", "belemnite fossil"),
    q("moyen", "Trilobite", "Trilobita", "Arthropode en trois lobes", "Arthropode fossile du Paléozoïque, thorax segmenté.", "Trilobite : Disparu dès la fin du Permien.", "trilobite fossil"),
    q("difficile", "Graptolite", "Graptolithina", "Fossiles en zigzags / colonies", "Colonies fossiles en lignes dentelées sur schistes.", "Graptolite : Excellent fossile stratigraphique du Paléozoïque.", "graptolite fossil"),
  ],
  vertebres: [
    q("facile", "Dent de requin fossile", "Lamniformes", "Dent triangulaire fossilisée", "Dent triangulaire souvent gris-brun, fossile fréquent.", "Dent de requin : Préservation fréquente (émail).", "fossil shark tooth"),
    q("moyen", "Vertèbre d’ichtyosaure", "Ichthyosauria", "Disque vertébral marin", "Vertèbre en forme de disque de reptile marin mésozoïque.", "Ichtyosaure : Reptile marin en forme de dauphin.", "ichthyosaur vertebra fossil"),
    q("difficile", "Coprolithe", "Coprolite", "Fiente fossilisée", "Excrément fossilisé, forme variable, parfois osseuse à l’intérieur.", "Coprolithe : Trace fossile d’alimentation.", "coprolite fossil"),
  ],
  "plantes-traces": [
    q("moyen", "Fougère fossile", "Pecopteris", "Empreinte de fronde", "Empreinte de fronde de fougère sur schiste ou grès.", "Fougère fossile : Fréquente au Carbonifère.", "fossil fern pecopteris"),
    q("difficile", "Stigmaria", "Stigmaria", "Racines de lycophytes", "Axes racinaires fossiles des grands arbres du Carbonifère.", "Stigmaria : Système racinaire de Lepidodendron / Sigillaria.", "stigmaria fossil"),
  ],
};

const leafAdds = {
  lobées: [
    q("facile", "Chêne vert", "Quercus ilex", "Feuille persistante dentée", "Feuille coriace persistante, bord parfois denté, dessous clair.", "Chêne vert : Feuille du Midi, sempervirente.", "holm oak leaf"),
    q("moyen", "Chêne pubescent", "Quercus pubescens", "Feuille lobée duvetée dessous", "Feuille lobée, jeune limbe et dessous poilus.", "Chêne pubescent : Collines calcaires.", "downy oak leaf"),
  ],
  simples: [
    q("facile", "Hêtre", "Fagus sylvatica", "Feuille ovale bord ondulé", "Feuille ovale à bord faiblement denticulé / ondulé, nervures parallèles.", "Hêtre : Feuille classique des hêtraies.", "beech leaf"),
    q("facile", "Bouleau", "Betula pendula", "Feuille triangulaire doublement dentée", "Feuille triangulaire à double denture, pétiole long.", "Bouleau verruqueux : Feuille légère des landes et friches.", "silver birch leaf"),
    q("moyen", "Charme", "Carpinus betulus", "Feuille ovale plissée", "Feuille ovale doublement dentée, limbe plissé entre nervures.", "Charme : Feuille « gaufrée » typique.", "hornbeam leaf"),
    q("moyen", "Frêne", "Fraxinus excelsior", "En réalité composée — limbe de foliole", "Foliole lancéolée dentée (feuille globalement composée).", "Frêne : Quiz feuille : on montre souvent une foliole.", "ash leaflet"),
    q("difficile", "Micocoulier", "Celtis australis", "Feuille asymétrique à la base", "Feuille lancéolée, base souvent asymétrique, trois nervures.", "Micocoulier : Midi et alignements.", "European hackberry leaf"),
  ],
  composees: [
    q("facile", "Robinier", "Robinia pseudoacacia", "Folioles ovales en paire", "Feuille imparipennée, folioles ovales, épines à la base.", "Robinier : Feuille composée des friches et bords de route.", "black locust leaf"),
    q("moyen", "Noyer", "Juglans regia", "Grandes folioles aromatiques", "Feuille imparipennée à grandes folioles, odeur forte froissée.", "Noyer : Foliole terminale souvent plus grande.", "walnut leaf"),
    q("difficile", "Févier d'Amérique", "Gleditsia triacanthos", "Folioles nombreuses, épines", "Feuille pennée / bipennée, longues épines ramifiées sur le tronc.", "Févier : Ornemental, gousses longues.", "honey locust leaf"),
  ],
};

const babyAdds = {
  ferme: [
    q("moyen", "Dindonneau", "Meleagris gallopavo", "Petit de la dinde", "Jeune dindon encore duveté.", "Dindonneau : Bébé de la dinde / du dindon.", "turkey poult"),
    q("difficile", "Pigeonneau", "Columba livia", "Petit du pigeon", "Jeune pigeon au nid, encore peu emplumé.", "Pigeonneau : Bébé du pigeon.", "squab pigeon chick"),
  ],
  compagnie: [
    q("moyen", "Lapereau", "Oryctolagus cuniculus", "Petit du lapin", "Jeune lapin aux oreilles encore courtes.", "Lapereau : Bébé du lapin.", "baby rabbit"),
    q("difficile", "Ouistiti jeune", "Callithrix jacchus", "Jeune petit primate", "Très jeune ouistiti, souvent porté sur le dos.", "Jeune ouistiti : Bébé de ouistiti (animaux de ménagerie).", "baby marmoset"),
  ],
  sauvage: [
    q("facile", "Renardeau", "Vulpes vulpes", "Petit du renard", "Jeune renard au museau pointu.", "Renardeau : Bébé du renard.", "fox cub"),
    q("moyen", "Marcassin", "Sus scrofa", "Petit du sanglier rayé", "Jeune sanglier à rayures claires.", "Marcassin : Bébé du sanglier.", "wild boar piglet"),
    q("moyen", "Faon", "Capreolus capreolus", "Petit cervidé tacheté", "Jeune chevreuil / cervidé au pelage tacheté.", "Faon : Bébé de chevreuil (aussi cerf).", "roe deer fawn"),
    q("difficile", "Blanchon", "Pagophilus groenlandicus", "Petit phoque blanc", "Jeune phoque au pelage blanc laineux.", "Blanchon : Bébé de phoque du Groenland (aussi dit blanchet).", "harp seal pup"),
  ],
};

results.push(enrichFile("rochers-mineraux.json", mineralAdds));
results.push(enrichFile("coquillages.json", shellAdds));
results.push(enrichFile("fossiles.json", fossilAdds));
results.push(enrichFile("feuilles-arbres.json", leafAdds));
results.push(enrichFile("bebes-animaux.json", babyAdds));

console.log("\nSummary:");
for (const r of results) console.log(`- ${r.id}: +${r.added} → ${r.total}`);
