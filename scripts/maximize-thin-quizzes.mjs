/**
 * Maximise les quiz encore « ouverts » avec des entrées réelles.
 * Usage: node scripts/maximize-thin-quizzes.mjs
 *
 * Hors scope volontaire : reptiles, nuages, traces (viviers déjà saturés).
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
      const qid = `${group.id}${index + 1}`;
      let distractors = pickDistractors(names, item.nom_commun, qid);
      if (distractors.length < 3) distractors = pickDistractors(allNames, item.nom_commun, qid);
      const options = shuffleOptions([item.nom_commun, ...distractors].slice(0, 4), qid);
      return { ...item, id: qid, groupe: group.id, options };
    });
  }
  return quiz;
}

function mergeGroup(quiz, groupId, additions, haveGlobal) {
  const group = quiz.groupes.find((g) => g.id === groupId);
  if (!group) throw new Error(`missing group ${groupId} in ${quiz.id}`);
  const have = haveGlobal || new Set(
    quiz.groupes.flatMap((g) =>
      g.questions.flatMap((x) => [fold(x.nom_scientifique), fold(x.nom_commun)].filter(Boolean)),
    ),
  );
  let added = 0;
  for (const row of additions) {
    const keys = [fold(row.nom_scientifique), fold(row.nom_commun)].filter(Boolean);
    if (keys.some((k) => have.has(k))) continue;
    for (const k of keys) have.add(k);
    group.questions.push({ ...row, groupe: groupId });
    added += 1;
  }
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
  writeFileSync(join(dataDir, `${quiz.id}.json`), `${JSON.stringify(quiz, null, 2)}\n`, "utf8");
  const n = countQuiz(quiz);
  console.log(`wrote ${quiz.id} (${n})`);
  return n;
}

function enrichFile(file, byGroup, { cleanup } = {}) {
  const quiz = loadQuiz(file);
  if (cleanup) cleanup(quiz);
  const have = new Set(
    quiz.groupes.flatMap((g) =>
      g.questions.flatMap((x) => [fold(x.nom_scientifique), fold(x.nom_commun)].filter(Boolean)),
    ),
  );
  let totalAdded = 0;
  for (const [groupId, rows] of Object.entries(byGroup)) {
    totalAdded += mergeGroup(quiz, groupId, rows, have);
  }
  const n = writeQuiz(quiz);
  return { id: quiz.id, added: totalAdded, total: n };
}

/** Retire de légumineuses les entrées déjà présentes ailleurs (doublons mal placés). */
function cleanupFruits(quiz) {
  const leg = quiz.groupes.find((g) => g.id === "legumineuses");
  if (!leg) return;
  const elsewhere = new Set(
    quiz.groupes
      .filter((g) => g.id !== "legumineuses")
      .flatMap((g) => g.questions.flatMap((x) => [fold(x.nom_scientifique), fold(x.nom_commun)])),
  );
  const before = leg.questions.length;
  leg.questions = leg.questions.filter(
    (x) => !elsewhere.has(fold(x.nom_scientifique)) && !elsewhere.has(fold(x.nom_commun)),
  );
  if (leg.questions.length !== before) {
    console.log(`  cleaned legumineuses: ${before} → ${leg.questions.length}`);
  }
}

const insectAdds = {
  coleopteres: [
    q("facile", "Coccinelle asiatique", "Harmonia axyridis", "Coccinelle variable souvent à M noir", "Coccinelle très variable, souvent M noir sur le pronotum.", "Coccinelle asiatique : Introduite, très fréquente."),
    q("facile", "Taupin des moissons", "Agriotes lineatus", "Coléoptère allongé des céréales", "Élatéridé brun allongé ; larve = ver fil-de-fer.", "Taupin : Ravageur des cultures ; « saute » sur le dos."),
    q("moyen", "Scarabée rhinocéros", "Oryctes nasicornis", "Grand scarabée cornu", "Grand scarabée ; mâle avec corne thoracique.", "Scarabée rhinocéros : Larves dans compost / bois mort."),
    q("moyen", "Cétoine grise", "Oxythyrea funesta", "Petite cétoine noire ponctuée", "Petite cétoine noire à taches blanches, sur fleurs.", "Cétoine grise : Communes sur fleurs au printemps."),
    q("moyen", "Cantharide commune", "Cantharis fusca", "Malachine noir et rouge", "Coléoptère mou, élytres noirs, thorax souvent rougeâtre.", "Cantharide : Prédateur utile sur la végétation."),
    q("moyen", "Clairon des ruches", "Trichodes alvearius", "Clairon rouge et noir", "Coléoptère rouge à bandes noires, sur fleurs.", "Clairon : Larves liées aux nids d’abeilles solitaires."),
    q("moyen", "Hister unicolor", "Hister unicolor", "Petit coléoptère brillant noir", "Petit histeridé compact, brillant, lié aux cadavres / fumier.", "Hister : Charognard / prédateur de larves."),
    q("difficile", "Carabe à reflets", "Carabus intricatus", "Grand carabe bleu-vert", "Grand carabe aux reflets bleutés / verdâtres.", "Carabe intricatus : Forestier, plutôt atlantique."),
    q("difficile", "Bupreste à neuf taches", "Buprestis novemmaculata", "Bupreste du pin tacheté", "Bupreste aux élytres jaunes tachetées de noir.", "Bupreste : Lié aux pins ; spectaculaire."),
    q("difficile", "Longicorne tissé", "Acanthocinus aedilis", "Longicorne aux antennes très longues", "Cerambycidé gris ; mâle aux antennes démesurées.", "Acanthocinus : Bois de pin ; antennes record."),
    q("difficile", "Gnorime", "Gnorimus nobilis", "Cétoine verte des fleurs", "Cétoine vert métallique des fleurs d’été.", "Gnorimus nobilis : Espèce des prairies fleuries."),
    q("facile", "Coccinelle à damier", "Propylea quatuordecimpunctata", "Petite coccinelle jaune à damier", "Petite coccinelle jaune à taches noires en damier.", "Propylea : Très commune au jardin."),
    q("moyen", "Malachius bipustulatus", "Malachius bipustulatus", "Malachine vert à taches rouges", "Petit coléoptère vert métallique à taches rouges apicales.", "Malachius : Sur fleurs au printemps."),
    q("moyen", "Anthrenus", "Anthrenus verbasci", "Petite « mite » des tapis (coléoptère)", "Petit dermestidé tacheté ; larves des textiles / collections.", "Anthrenus : Ravageur des lainages et insectariums."),
    q("difficile", "Lucane petit cerf", "Dorcus parallelipipedus", "Petit lucane noir", "Lucanidé noir mat, plus petit que le cerf-volant.", "Dorcus : Bois mort des forêts."),
  ],
  lepidopteres: [
    q("facile", "Piéride du navet", "Pieris napi", "Blanc verdâtre veiné dessous", "Papillon blanc ; dessous des ailes veiné de vert.", "Piéride du navet : Prairies et lisières."),
    q("facile", "Myrtil", "Maniola jurtina", "Brun à ocelle unique", "Satyriné brun avec un ocelle noir à point blanc.", "Myrtil : Très commun des prairies."),
    q("facile", "Tircis", "Pararge aegeria", "Brun tacheté de crème", "Satyriné des sous-bois, taches crème sur fond brun.", "Tircis : Clairières et allées forestières."),
    q("moyen", "Grande tortue", "Nymphalis polychloros", "Grand nymphalide orangé", "Grand papillon orange-brun à bord découpé.", "Grande tortue : Orties et ormes ; plus rare que la Petite."),
    q("moyen", "Petite tortue", "Aglais urticae", "Orange à bord noir découpé", "Nymphalide orange vif à bordure noire dentelée.", "Petite tortue : Chenille sur ortie."),
    q("moyen", "Souci", "Colias croceus", "Jaune orangé migrant", "Piéride jaune-orange ; mâle sans tache noire centrale.", "Souci : Migrateur, fin d’été."),
    q("moyen", "Azuré commun", "Polyommatus icarus", "Petit bleu des prairies", "Mâle bleu vif dessus ; femelle brune à lunules orange.", "Azuré commun : Très répandu."),
    q("moyen", "Argus bleu", "Lysandra bellargus", "Bleu électrique calcaire", "Mâle bleu très vif ; pelouses calcaires.", "Argus bleu : Spécialiste des pelouses sèches."),
    q("difficile", "Apollon", "Parnassius apollo", "Grand blanc à ocelles rouges", "Papilionidé montagnard blanc à ocelles rouges.", "Apollon : Protégé, pelouses alpines."),
    q("difficile", "Damier de la succise", "Euphydryas aurinia", "Damier orange des tourbières", "Nymphalide orange à damier sombre.", "Damier de la succise : Protégé, milieux humides."),
    q("difficile", "Sphinx du liseron", "Agrius convolvuli", "Grand sphinx gris migrateur", "Grand hétérocère gris, longue trompe, migrateur.", "Sphinx du liseron : Visiteur nocturne des jardins."),
    q("difficile", "Bombyx du chêne", "Lasiocampa quercus", "Grosse chenille / papillon fauve", "Grand bombyx ; femelle plus claire, mâle brun.", "Bombyx du chêne : Chenille urticante-ish, polyphage."),
  ],
  hymenopteres: [
    q("facile", "Fourmi noire des jardins", "Lasius niger", "Petite fourmi noire courante", "Petite fourmi noire des trottoirs et jardins.", "Lasius niger : Très commune en milieu urbain."),
    q("facile", "Bourdon des prés", "Bombus pratorum", "Petit bourdon à queue orangée", "Petit bourdon ; extrémité de l’abdomen souvent orangée.", "Bourdon des prés : Précoce au printemps."),
    q("moyen", "Abeille maçonne", "Osmia bicornis", "Osmie rousse des nichoirs", "Abeille solitaire rousse, niche dans cavités / tubes.", "Osmie rousse : Très utilisée en nichoirs à abeilles."),
    q("moyen", "Guêpe germanique", "Vespula germanica", "Guêpe à trois points noirs", "Proche de la guêpe commune ; face à points caractéristiques.", "Guêpe germanique : Nids souvent souterrains."),
    q("moyen", "Bembex", "Bembix rostrata", "Guêpe fouisseuse à face jaune", "Guêpe solitaire au large bandeau facial jaune, sur sable.", "Bembex : Chasse des diptères pour ses larves."),
    q("difficile", "Chalicodome des murailles", "Megachile parietina", "Abeille maçonne des murs", "Grande abeille solitaire construisant des nids de mortier.", "Chalicodome : Murs ensoleillés du sud."),
    q("difficile", "Sapyga", "Sapyga quinquepunctata", "Petit hyménoptère noir tacheté", "Parasitoïde noir à taches jaunes / blanches.", "Sapyga : Parasite d’abeilles solitaires."),
    q("difficile", "Pimpla", "Pimpla rufipes", "Ichneumon noir à pattes rousses", "Grand ichneumon noir, pattes souvent rougeâtres.", "Pimpla : Parasitoïde de chenilles / chrysalides."),
  ],
  dipteres: [
    q("facile", "Syrphe pyrastre", "Scaeva pyrastri", "Syrphe à lunules (souvent déjà)", "Syrphe aux marques blanches en croissant.", "Syrphe pyrastre : Mimétique utile au jardin."),
    q("facile", "Mouche verte", "Lucilia sericata", "Mouche métallique verte", "Calliphoridé vert brillant, sur matières organiques.", "Lucilia : Aussi utilisée en maggot therapy."),
    q("moyen", "Volucelle transparente", "Volucella pellucens", "Gros syrphe à bande blanche", "Grand syrphe noir à large bande blanche translucide.", "Volucella : Fréquente les fleurs ; larves dans nids de guêpes."),
    q("moyen", "Chironomé", "Chironomus plumosus", "Petit moustique non piqueur", "Diptère grêle type « cousin » ; mâles en essaims.", "Chironome : Larves en eaux riches ; adultes ne piquent pas."),
    q("moyen", "Stratiome", "Stratiomys chameleon", "Diptère plat jaune et noir", "Diptère aplati mimant une guêpe, près de l’eau.", "Stratiome : Larves aquatiques."),
    q("difficile", "Empis tessellatus", "Empis tessellata", "Mouche danseuse sombre", "Diptère prédateur allongé, pattes longues.", "Empis : Chasse d’autres insectes en vol."),
  ],
  autres: [
    q("difficile", "Panorpe", "Panorpa communis", "Mécoptère à « queue de scorpion »", "Insecte à face en bec ; mâle avec bulbe terminal en massue.", "Panorpe : Mécoptère des haies et lisières."),
    q("facile", "Cigale de l'Orne", "Cicada orni", "Cigale méditerranéenne commune", "Cigale au corps robuste, chant estival du Midi.", "Cicada orni : Emblématique des soirs du sud."),
    q("facile", "Puceron lanigère", "Eriosoma lanigerum", "Pucerons blancs cotonneux", "Colonies blanc-cotonneuses sur pommiers.", "Puceron lanigère : Ravageur des vergers."),
    q("moyen", "Orthétrum réticulé", "Orthetrum cancellatum", "Libellule au mâle bleu-pruiné", "Libellule ; mâle abdomen bleu pruiné, femelle jaunâtre.", "Orthétrum : Plans d’eau ensoleillés."),
    q("moyen", "Leste vert", "Lestes viridis", "Demoiselle vert métallique", "Zygoptère vert brillant, ailes écartées au repos.", "Leste vert : Souvent sur arbres près de l’eau."),
    q("moyen", "Criquet mélodieux", "Gomphocerippus rufus", "Criquet à antennes en massue", "Criquet aux antennes épaissies à l’extrémité.", "Criquet mélodieux : Lisières et friches."),
    q("moyen", "Decticelle bariolée", "Roeseliana roeselii", "Sauterelle à bande claire", "Ensifère brune à bande latérale claire nette.", "Decticelle : Prairies et friches."),
    q("difficile", "Mante empuse", "Empusa fasciata", "Empuse orientale rare", "Proche d’Empusa pennata, plus orientale / sud-est.", "Empusa fasciata : Méditerranéenne orientale."),
    q("difficile", "Gerris", "Aquarius najas", "Patineur d’eau plus grand", "Hétéroptère marcheur d’eau, plus grand que Gerris lacustre.", "Aquarius najas : Surfaces d’eau calme."),
    q("difficile", "Nèpe cendrée", "Nepa cinerea", "Punaise d’eau à « queue »", "Hétéroptère aquatique plat, siphon respiratoire long.", "Nèpe : Fonds vaseux des mares."),
    q("difficile", "Ranâtre", "Ranatra linearis", "Punaise-bâton aquatique", "Hétéroptère très allongé, allure de bâton dans l’eau.", "Ranâtre : Chasse à l’affût sous l’eau."),
  ],
};

const fruitAdds = {
  fruits: [
    q("facile", "Poire", "Pyrus communis", "Fruit piriforme du verger", "Fruit à pépins, forme de poire, chair juteuse.", "Poire : Fruit de verger classique."),
    q("facile", "Pêche", "Prunus persica", "Drupe veloutée", "Fruit à noyau, peau duveteuse, chair fondante.", "Pêche : Variétés blanches ou jaunes."),
    q("facile", "Prune", "Prunus domestica", "Drupe ovale à peau lisse", "Fruit à noyau ovale, couleurs variables.", "Prune : Fraîche ou séchée (pruneau)."),
    q("facile", "Melon", "Cucumis melo", "Gros fruit sucré d’été", "Grosse baie à écorce souvent brodée, chair orange/verte.", "Melon : Cucurbitacée sucrée d’été."),
    q("facile", "Pastèque", "Citrullus lanatus", "Gros fruit rouge à graines", "Très gros fruit à écorce verte, chair rouge juteuse.", "Pastèque : Très désaltérante."),
    q("moyen", "Nectarine", "Prunus persica var. nucipersica", "Pêche à peau lisse", "Comme la pêche mais peau lisse non duveteuse.", "Nectarine : Mutation de la pêche."),
    q("moyen", "Clémentine", "Citrus × clementina", "Petit agrume facile à peler", "Petit agrume orangé, souvent sans pépins.", "Clémentine : Hybride mandarine × orange."),
    q("moyen", "Mandarine", "Citrus reticulata", "Agrume plat facile à éplucher", "Agrume aplati, peau lâche, quartiers parfumés.", "Mandarine : Agrume d’hiver."),
    q("moyen", "Litchi", "Litchi chinensis", "Fruit à coque rose rugueuse", "Coque rose-rouge, chair blanche autour d’un noyau.", "Litchi : Tropical, saison courte."),
    q("moyen", "Noix de coco", "Cocos nucifera", "Grosse drupe à lait", "Fruit à fibre extérieure, coque dure, eau et chair blanche.", "Noix de coco : Palmier tropical."),
    q("moyen", "Avocat", "Persea americana", "Fruit à gros noyau crémeux", "Baie à gros noyau, chair verte beurrée.", "Avocat : Culinaire, riche en lipides."),
    q("moyen", "Papaye", "Carica papaya", "Fruit tropical oblong orange", "Gros fruit oblong, chair orange, graines noires centrales.", "Papaye : Tropical, enzyme papaïne."),
    q("difficile", "Groseille", "Ribes rubrum", "Petites baies en grappes", "Petites baies translucides rouges (ou blanches) en grappes.", "Groseille : Arbuste de jardin."),
    q("difficile", "Cassis", "Ribes nigrum", "Baies noires aromatiques", "Petites baies noires en grappes, parfum fort.", "Cassis : Crèmes et liqueurs."),
    q("difficile", "Myrtille", "Vaccinium myrtillus", "Petite baie bleue des landes", "Petite baie bleue-noir, chair teintante.", "Myrtille : Landes et sous-bois acides."),
    q("difficile", "Mûre", "Rubus fruticosus", "Baie composée sombre des haies", "Fruit composé noir à maturité, sur ronces.", "Mûre : Haies et friches."),
    q("difficile", "Framboise", "Rubus idaeus", "Baie composée rouge creuse", "Fruit composé rouge qui se détache du réceptacle.", "Framboise : Jardins et lisières."),
    q("difficile", "Datte", "Phoenix dactylifera", "Fruit du palmier-dattier", "Drupe allongée brun-sucrée, un noyau allongé.", "Datte : Oasis et import."),
    q("difficile", "Carambole", "Averrhoa carambola", "Fruit étoilé en coupe", "Fruit côtelé jaune ; tranches en étoile.", "Carambole : Tropical décoratif en cuisine."),
    q("difficile", "Fruit du dragon", "Hylocereus undatus", "Pitaya à peau écailleuse", "Fruit à peau rose écailleuse, chair blanche ou rouge.", "Pitaya : Cactée grimpante."),
  ],
  feuilles: [
    q("facile", "Chou de Bruxelles", "Brassica oleracea var. gemmifera", "Petites pommes sur tige", "Nombreuses petites pommes le long d’une tige.", "Choux de Bruxelles : Légume d’hiver."),
    q("facile", "Céleri branche", "Apium graveolens var. dulce", "Côtes croquantes vertes", "Longues côtes feuillues croquantes.", "Céleri branche : Cru ou cuit."),
    q("moyen", "Chou-fleur", "Brassica oleracea var. botrytis", "Inflorescence blanche dense", "Tête blanche d’inflorescences charnues.", "Chou-fleur : Cousin du brocoli."),
    q("moyen", "Endive", "Cichorium intybus var. foliosum", "Chicon blanc serré", "Pomme allongée blanche, amère légère.", "Endive : Forcée à l’obscurité."),
    q("moyen", "Cresson", "Nasturtium officinale", "Feuilles piquantes aquatiques", "Petites feuilles rondes, goût poivré, saturées d’eau.", "Cresson : Ruisseaux et cultures."),
    q("moyen", "Coriandre", "Coriandrum sativum", "Feuilles découpées aromatiques", "Feuillage finement découpé, parfum caractéristique.", "Coriandre : Herbe et graines."),
    q("difficile", "Oseille", "Rumex acetosa", "Feuilles acidulées", "Feuilles oblongues acidulées, nervure centrale marquée.", "Oseille : Soupes et sauces."),
    q("difficile", "Estragon", "Artemisia dracunculus", "Feuilles étroites anisées", "Feuilles linéaires au goût anisé-poivré.", "Estragon : Aromate des sauces."),
    q("difficile", "Menthe", "Mentha spicata", "Feuilles odorantes dentées", "Feuilles opposées dentées, forte odeur mentholée.", "Menthe : Nombreux cultivars."),
    q("difficile", "Thym", "Thymus vulgaris", "Petites feuilles méditerranéennes", "Sous-arbrisseau à toutes petites feuilles aromatiques.", "Thym : Garrigue et cuisine."),
  ],
  racines: [
    q("facile", "Échalote", "Allium cepa var. aggregatum", "Petit bulbe rose agrégé", "Bulbes multiples rose-cuivré, goût plus fin que l’oignon.", "Échalote : Fond de sauce."),
    q("facile", "Poireau", "Allium porrum", "Fût blanc et vert", "Long fût blanc, feuilles plates vertes.", "Poireau : Légume d’hiver."),
    q("moyen", "Gingembre", "Zingiber officinale", "Rhizome noueux piquant", "Rhizome irrégulier beige, chair jaune piquante.", "Gingembre : Aromate tropical."),
    q("moyen", "Curcuma", "Curcuma longa", "Rhizome orange vif", "Rhizome orange intense, base du curry.", "Curcuma : Colorant et épice."),
    q("moyen", "Rutabaga", "Brassica napus subsp. rapifera", "Grosse racine jaune", "Racine charnue souvent jaune à collet violet.", "Rutabaga : Légume ancien d’hiver."),
    q("difficile", "Raifort", "Armoracia rusticana", "Racine blanche très piquante", "Longue racine blanche au piquant fort.", "Raifort : Condiment râpé."),
    q("difficile", "Igname", "Dioscorea alata", "Gros tubercule tropical", "Gros tubercule amidonné à peau rude.", "Igname : Base alimentaire tropicale."),
    q("difficile", "Manioc", "Manihot esculenta", "Tubercule à peau brune", "Tubercule allongé ; doit être préparé (cyanure).", "Manioc : Cassave, tapioca."),
  ],
  legumineuses: [
    q("facile", "Haricot rouge", "Phaseolus vulgaris (rouge)", "Graines rouges sèches", "Graines rouge sombre réniformes, chili / potages.", "Haricot rouge : Variété de Phaseolus vulgaris."),
    q("facile", "Haricot blanc", "Phaseolus vulgaris (blanc)", "Graines blanches sèches", "Graines blanc-crème, cassoulet et soupes.", "Haricot blanc : Lingot, coco, etc."),
    q("moyen", "Flageolet", "Phaseolus vulgaris (flageolet)", "Petit haricot vert pâle", "Petites graines vert pâle, récoltées semi-sèches.", "Flageolet : Accompagnement classique."),
    q("moyen", "Pois cassé", "Pisum sativum (cassé)", "Pois secs fendus", "Pois secs fendus en deux, soupes.", "Pois cassés : Légumineuse sèche."),
    q("moyen", "Haricot mungo", "Vigna radiata", "Petites graines vertes", "Petites graines vertes ; germes fréquents.", "Haricot mungo : Germes de soja verts (souvent)."),
    q("difficile", "Lupin", "Lupinus albus", "Grosses graines plates", "Grosses graines aplaties, amères si non préparées.", "Lupin : Snack méditerranéen après dessalage."),
    q("difficile", "Arachide", "Arachis hypogaea", "Gousse souterraine", "Gousse ridée formée sous terre, graines oléagineuses.", "Arachide : Légumineuse, pas une vraie noix."),
    q("difficile", "Tamarin", "Tamarindus indica", "Gousse brune acidulée", "Gousse brune à pulpe acidulée autour des graines.", "Tamarin : Condiment et boissons tropicales."),
  ],
};

const mammalAdds = {
  carnivores: [
    q("moyen", "Vison d'Amérique", "Neogale vison", "Mustélidé introduit semi-aquatique", "Mustélidé brun foncé, plus courant que le vison d’Europe.", "Vison d'Amérique : Évadé d’élevages, impact sur la faune."),
    q("difficile", "Chat domestique haretté", "Felis catus", "Chat redevenu sauvage", "Chat domestique vivant en indépendance, impact sur la faune.", "Chat haret : Très présent ; prédateur opportuniste."),
  ],
  ongules: [
    q("moyen", "Hydropote", "Hydropotes inermis", "Petit cervidé sans bois introduit", "Petit cervidé sans bois ; mâles à crocs ; introduit localement.", "Hydropote : Présent en quelques secteurs (ex. Loire)."),
  ],
  rongeurs: [
    q("facile", "Écureuil de Corée", "Eutamias sibiricus", "Petit tamia rayé introduit", "Petit sciuridé rayé, introduit / échappé.", "Tamia de Sibérie : Animaleries et foyers localisés."),
    q("facile", "Rat musqué", "Ondatra zibethicus", "Gros rongeur semi-aquatique", "Rongeur aquatique à queue latéralement aplatie, plus petit que le castor.", "Rat musqué : Introduit, berges et marais."),
    q("moyen", "Campagnol roussâtre", "Clethrionomys glareolus", "Campagnol forestier roux", "Petit campagnol au dos roussâtre, milieux boisés.", "Campagnol roussâtre : Sous-bois et haies."),
    q("moyen", "Mulot à collier", "Apodemus flavicollis", "Grand mulot à plastron", "Mulot plus grand, tache jaune souvent sur la poitrine.", "Mulot à collier : Forêts, plus arboricole."),
    q("moyen", "Souris grise", "Mus musculus", "Petite souris commensale", "Petite souris au pelage gris-brun, près des humains.", "Souris grise : Commensale mondiale."),
    q("moyen", "Musaraigne pygmée", "Sorex minutus", "Très petite musaraigne", "Minuscule insectivore, plus petite que la couronnée.", "Musaraigne pygmée : Prairies et litières."),
    q("difficile", "Putois d'étape", "Mustela eversmanii", "Non — skip"),
    q("difficile", "Desman des Pyrénées", "Galemys pyrenaicus", "Semi-aquatique à trompe", "Petit mammifère aquatique à trompe mobile, Pyrénées.", "Desman : Endémique pyrénéen, menacé."),
    q("difficile", "Hérisson oriental", "Erinaceus roumanicus", "Hérisson d’Europe de l’Est", "Proche du hérisson d’Europe, plutôt Est ; mentions rares."),
  ],
  chiropteres: [
    q("moyen", "Pipistrelle de Nathusius", "Pipistrellus nathusii", "Pipistrelle migratrice", "Petite pipistrelle ; grande migratrice européenne.", "Pipistrelle de Nathusius : Couloirs de migration."),
    q("moyen", "Murin de Natterer", "Myotis nattereri", "Murin à bord alaire frangé", "Murin aux poils raides sur le bord de l’uropatagium.", "Murin de Natterer : Forêts et bâtiments."),
    q("moyen", "Oreillard gris", "Plecotus austriacus", "Oreillard aux grandes oreilles", "Proche de l’oreillard roux, plutôt milieux ouverts / sud.", "Oreillard gris : Combles et cavités."),
    q("difficile", "Minioptère de Schreibers", "Miniopterus schreibersii", "Chauve-souris cavernicole grégaire", "Ailes longues et étroites, colonies cavernicoles importantes.", "Minioptère : Sensible au dérangement des grottes."),
    q("difficile", "Murin à oreilles échancrées", "Myotis emarginatus", "Murin au bord d’oreille échancré", "Oreille avec échancrure nette sur le bord externe.", "Murin à oreilles échancrées : Bâtiments et grottes."),
    q("difficile", "Grande noctule", "Nyctalus lasiopterus", "Très grande noctule", "La plus grande chauve-souris d’Europe, rare.", "Grande noctule : Canopée, parfois prédation d’oiseaux."),
  ],
  marins: [
    q("moyen", "Dauphin bleu et blanc", "Stenella coeruleoalba", "Petit dauphin rayé", "Petit delphinidé à rayures claires sur le flanc.", "Dauphin bleu et blanc : Large distribution au large."),
    q("moyen", "Rorqual commun", "Balaenoptera physalus", "Grand rorqual à gorge plissée", "Deuxième plus grand animal ; sillon ventral, nageoire dorsale.", "Rorqual commun : Observé au large des côtes."),
    q("difficile", "Orque", "Orcinus orca", "Grand delphinidé noir et blanc", "Noir et blanc contrasté, grande nageoire dorsale.", "Orque : Observations occasionnelles au large."),
    q("difficile", "Phoque moine", "Monachus monachus", "Phoque méditerranéen rare", "Phoque brun, face claire ; extrêmement rare en Méditerranée.", "Phoque moine : Espèce menacée."),
  ],
};

// Remove bad placeholder entries from mammalAdds before use
mammalAdds.rongeurs = mammalAdds.rongeurs.filter((x) => x.nom_commun !== "Putois d'étape");
mammalAdds.rongeurs = mammalAdds.rongeurs.map((x) => {
  if (x.nom_commun === "Hérisson oriental") {
    return q("difficile", "Hérisson oriental", "Erinaceus roumanicus", "Hérisson d’Europe de l’Est", "Proche du hérisson d’Europe, répartition plutôt orientale.", "Hérisson oriental : Mentions en marge Est européenne.");
  }
  return x;
});

const treeAdds = {
  feuillus: [
    q("facile", "Peuplier noir", "Populus nigra", "Grand peuplier des rivières", "Grand peuplier ; souvent forme italica en alignement.", "Peuplier noir : Ripisylves et alignements."),
    q("facile", "Bouleau pubescent", "Betula pubescens", "Bouleau des milieux humides", "Bouleau à jeunes rameaux pubescents, landes humides.", "Bouleau pubescent : Plus hygrophile que le verruqueux."),
    q("moyen", "Chêne chevelu", "Quercus cerris", "Chêne à cupule moussue", "Chêne aux glands à cupule « chevelue ».", "Chêne chevelu : Introduit / sud-est."),
    q("moyen", "Orme de montagne", "Ulmus glabra", "Grand orme montagnard", "Orme aux feuilles grandes, base très asymétrique.", "Orme de montagne : Vallées et montagnes."),
    q("moyen", "Frêne oxyphylle", "Fraxinus angustifolia", "Frêne du sud à folioles étroites", "Frêne méditerranéen / sud-ouest, folioles plus étroites.", "Frêne oxyphylle : Ripisylves du sud."),
    q("moyen", "Aulne blanc", "Alnus incana", "Aulne montagnard", "Aulne à face inférieure claire, montagnes et graviers.", "Aulne blanc : Alpes et Pyrénées surtout."),
    q("difficile", "Poirier sauvage", "Pyrus pyraster", "Poirier épineux sauvage", "Petit arbre épineux, fruits petits durs.", "Poirier sauvage : Lisières et haies."),
    q("difficile", "Pommier sauvage", "Malus sylvestris", "Petit pommier des haies", "Petit arbre, fruits petits acides.", "Pommier sauvage : Ancêtre partiel des cultivés."),
    q("difficile", "Troène commun", "Ligustrum vulgare", "Arbuste des haies", "Arbuste à feuilles semi-persistantes, baies noires.", "Troène : Haies et lisières."),
    q("difficile", "Fusain d'Europe", "Euonymus europaeus", "Arbuste à fruits roses", "Arbuste ; fruits roses à graines orange.", "Fusain : Haies ; bois pour fusains à dessiner."),
  ],
  coniferes: [
    q("facile", "Thuya géant", "Thuja plicata", "Grand thuya d’ornement", "Grand cupressacé à feuillage en éventail odorant.", "Thuya géant : Alignements et haies."),
    q("moyen", "Cyprès de Lawson", "Chamaecyparis lawsoniana", "Faux cyprès d’ornement", "Cupressacé à rameaux aplatis, nombreux cultivars.", "Cyprès de Lawson : Parcs et haies."),
    q("moyen", "Pin laricio", "Pinus nigra subsp. laricio", "Pin de Corse / Calabre", "Pin au fût droit, aiguilles longues, montagne méditerranéenne.", "Pin laricio : Corse et reboisements."),
    q("difficile", "Sapin de Nordmann", "Abies nordmanniana", "Sapin de Noël courant", "Sapin à aiguilles non piquantes, base du pétiole discale.", "Sapin de Nordmann : Très planté comme sapin de Noël."),
    q("difficile", "Épicéa de Sitka", "Picea sitchensis", "Épicéa côtier introduit", "Grand épicéa atlantique introduit, aiguilles piquantes.", "Épicéa de Sitka : Plantations océaniques."),
  ],
  mediterraneens: [
    q("facile", "Palmier-dattier", "Phoenix dactylifera", "Palmier des oasis / Midi", "Grand palmier à stipe annelé, régimes de dattes.", "Palmier-dattier : Ornemental sur le littoral."),
    q("moyen", "Palmier de Chine", "Trachycarpus fortunei", "Palmier rustique à stipe fibreux", "Palmier à stipe couvert de fibres, assez rustique.", "Palmier de Chine : Jardins du Midi et Atlantique doux."),
    q("moyen", "Eucalyptus", "Eucalyptus globulus", "Grand arbre à écorce s’exfoliant", "Feuilles odorantes, écorce qui s’exfolie, introduit.", "Eucalyptus : Plantations et Midi."),
    q("difficile", "Myrte commun", "Myrtus communis", "Arbuste aromatique du maquis", "Arbuste persistant aromatique, baies bleu-noir.", "Myrte : Maquis méditerranéen."),
    q("difficile", "Laurier-rose", "Nerium oleander", "Arbuste toxique fleuri", "Arbuste à fleurs en cymes, feuilles lancéolées toxiques.", "Laurier-rose : Ornamental méditerranéen."),
  ],
  fruitiers: [
    q("facile", "Olivier de Bohême", "Elaeagnus angustifolia", "Arbre argenté à « olives »", "Feuillage argenté, fruits jaunâtres farineux.", "Olivier de Bohême : Alignements et friches."),
    q("moyen", "Mûrier noir", "Morus nigra", "Mûrier à fruits sombres", "Arbre à fruits composés noir-pourpre juteux.", "Mûrier noir : Anciens jardins."),
    q("moyen", "Figuier de Barbarie", "Opuntia ficus-indica", "Cactus à raquettes fruitées", "Cactée à cladodes ; fruits ovoïdes épineux.", "Figuier de Barbarie : Midi et naturalisé."),
    q("difficile", "Arbre de Judée", "Cercis siliquastrum", "Fleurs roses sur le tronc", "Cauliflorie rose au printemps, feuilles cordiformes.", "Arbre de Judée : Ornamental méditerranéen."),
    q("difficile", "Paulownia", "Paulownia tomentosa", "Grandes feuilles et fleurs violettes", "Grandes feuilles cordiformes, panicules violettes.", "Paulownia : Introduit, croissance rapide."),
  ],
};

const mineralAdds = {
  silicates: [
    q("facile", "Mica biotite", "Biotite", "Mica noir flexible", "Phyllosilicate noir, feuillets flexibles.", "Biotite : Courante dans granites et schistes.", "biotite mica"),
    q("moyen", "Pyroxène", "Augite", "Silicate sombre des basaltes", "Cristaux sombres trapus des roches basiques.", "Augite : Pyroxène fréquent des basaltes.", "augite pyroxene"),
    q("moyen", "Amphibole", "Hornblende", "Silicate noir prismatique", "Prismes noirs allongés, clivages à ~120°.", "Hornblende : Amphibole des roches magmatiques.", "hornblende amphibole"),
    q("difficile", "Zircon", "Zircon", "Petit cristal prismatique dense", "Nésosilicate très dense, souvent brun/rougeâtre.", "Zircon : Datation U-Pb ; gemme hyacinthe.", "zircon crystal"),
    q("difficile", "Béryl", "Beryl", "Prismes hexagonaux (émeraude/aigue)", "Silicate hexagonal ; variétés émeraude, aigue-marine.", "Béryl : Famille de l’émeraude.", "beryl crystal"),
    q("difficile", "Sodalite", "Sodalite", "Bleu royal opaque", "Tectosilicate bleu utilisé en ornement.", "Sodalite : Souvent associée au lapis.", "sodalite mineral"),
  ],
  carbonates: [
    q("moyen", "Rhodochrosite", "Rhodochrosite", "Rose bandé manganésien", "Carbonate de manganèse rose, souvent bandé.", "Rhodochrosite : Gemme ornementale.", "rhodochrosite"),
    q("difficile", "Smithsonite", "Smithsonite", "Carbonate de zinc", "Carbonate de Zn, souvent botryoïdal coloré.", "Smithsonite : Minerai secondaire de zinc.", "smithsonite"),
  ],
  oxydes: [
    q("facile", "Spinelle", "Spinel", "Oxide gemme octaédrique", "Cristaux octaédriques, couleurs variées.", "Spinelle : Longtemps confondu avec le rubis.", "spinel crystal"),
    q("moyen", "Chromite", "Chromite", "Oxide de chrome noir", "Oxide noir dense des roches ultramafiques.", "Chromite : Principal minerai de chrome.", "chromite mineral"),
    q("difficile", "Ilménite", "Ilmenite", "Oxide de fer-titane", "Noir métallique, source de titane.", "Ilménite : Sables noirs et roches basiques.", "ilmenite mineral"),
  ],
  gemmes: [
    q("facile", "Jade", "Jadeite", "Vert translucide sculpté", "Silicate vert (jadéite ou néphrite) pour sculptures.", "Jade : Ornemental depuis des millénaires.", "jade gemstone"),
    q("moyen", "Aigue-marine", "Aquamarine", "Béryl bleu-vert pâle", "Variété bleue du béryl, cristaux prismatiques.", "Aigue-marine : Gemme de la famille du béryl.", "aquamarine gem"),
    q("moyen", "Grenat pyrope", "Pyrope", "Grenat rouge sang", "Grenat magnésien rouge vif.", "Pyrope : Grenats des roches ultramafiques.", "pyrope garnet"),
    q("difficile", "Alexandrite", "Alexandrite", "Change de couleur", "Variété de chrysobéryl : vert au jour, rouge à la lampe.", "Alexandrite : Gemme rare à changement de couleur.", "alexandrite gem"),
  ],
  metaux: [
    q("facile", "Pyrite", "Iron pyrite", "Déjà parfois — or des fous", "Sulfure de fer en cubes / pentagones, jaune laiton.", "Pyrite : « Or des fous ».", "pyrite cube"),
    q("moyen", "Chalcopyrite", "Chalcopyrite", "Sulfure de cuivre doré", "Jaune doré ternissant souvent irisé.", "Chalcopyrite : Principal minerai de cuivre.", "chalcopyrite"),
    q("moyen", "Barite", "Barite", "Sulfate de baryum dense", "Cristaux souvent tabulaire, très denses.", "Barytine : Charge industrielle et spécimens.", "barite crystal"),
    q("difficile", "Wolframite", "Wolframite", "Minerai de tungstène", "Oxide/ tungstate noir dense monoclinal.", "Wolframite : Source historique de tungstène.", "wolframite"),
    q("difficile", "Molybénite", "Molybdenite", "Sulfure gris bleuté gras", "Feuillets gris-bleu à toucher gras, marque le papier.", "Molybénite : Minerai de molybdène.", "molybdenite"),
  ],
};

const shellAdds = {
  gasteropodes: [
    q("facile", "Escargot de Bourgogne", "Helix pomatia", "Gros escargot terrestre", "Grande coquille hélice claire, terrestre comestible.", "Escargot de Bourgogne : Terrestre ; souvent sur la grève de collections."),
    q("facile", "Haliotide", "Haliotis tuberculata", "Oreille de mer", "Coquille ovale à série de trous, nacre intérieure.", "Ormeau / haliotide : Rocher battu."),
    q("moyen", "Gibbule", "Gibbula umbilicalis", "Petit top trochidé", "Petite coquille conique ombiliquée des estrans.", "Gibbule : Rochers du médiolittoral."),
    q("moyen", "Calliostome", "Calliostoma zizyphinum", "Trochus coloré", "Coquille conique à bandes colorées.", "Calliostome : Estran rocheux."),
    q("moyen", "Nasse réticulée atlantique", "Tritia neritea", "Petite nasse des sables vaseux", "Petite nasse des sables et vases littorales.", "Tritia neritea : Charognarde des estrans."),
    q("difficile", "Cymbium", "Cymbium olla", "Grande volute méditerranéenne", "Grande coquille ventrue lisse du plateau continental.", "Cymbium : Méditerranée."),
    q("difficile", "Ranelle", "Charonia lampas", "Gros triton / ranelle", "Très grande coquille spiralée, Méditerranée / Atlantique sud.", "Ranelle : Grand prédateur de fond."),
    q("difficile", "Simnie", "Simnia spelta", "Petite ovulidé sur gorgones", "Petite coquille lisse allongée, sur gorgones.", "Simnie : Associée aux gorgones."),
  ],
  bivalves: [
    q("facile", "Huître creuse", "Magallana gigas", "Huître japonaise d’élevage", "Huître à coquille plus allongée / irrégulière que la plate.", "Huître creuse : Espèce d’élevage dominante."),
    q("facile", "Telline", "Donax trunculus", "Petit bivalve des sables", "Petites valves triangulaires colorées des plages.", "Telline : Sables battus."),
    q("moyen", "Mactre", "Mactra stultorum", "Bivalve lisse des sables", "Valves assez lisses, sables subtidaux.", "Mactre : Sables fins."),
    q("moyen", "Glycymère", "Glycymeris glycymeris", "Amande de mer ronde", "Valves presque circulaires, robustes.", "Glycymère : Graviers et sables."),
    q("difficile", "Panope", "Panopea glycymeris", "Très grand bivalve fouisseur", "Grand bivalve aux siphons longs, profondément enfoui.", "Panope : Atlantique / Méditerranée."),
    q("difficile", "Lima", "Lima lima", "Bivalve à côtes épineuses", "Valves à côtes souvent épineuses, nage parfois.", "Lima : Fonds rocheux."),
  ],
  divers: [
    q("facile", "Étoile de mer (ossicule)", "Asterias rubens", "Plaque calcaire d’échinoderme", "Petit ossicule / plaque calcaire d’étoile.", "Ossicule : Fragment d’échinoderme sur la grève."),
    q("moyen", "Poulpe (bec)", "Octopus vulgaris", "Bec corné de céphalopode", "Bec en « bec de perroquet » de poulpe.", "Bec de poulpe : Parfois échoué."),
    q("moyen", "Velelle", "Velella velella", "Voile chitineux échoué", "Petite « méduse » à voile, échouages massifs possibles.", "Velelle : Hydrozoaire de surface."),
    q("difficile", "Spirastrella (éponge)", "Spirastrella cunctatrix", "Fragment d’éponge colorée", "Éponge encroûtante ; fragments sur la grève.", "Éponge : Squelette siliceux / corné."),
    q("difficile", "Balane géante", "Balanus perforatus", "Grande balane volcaniforme", "Grande balane volcaniforme des rochers battus.", "Balanus perforatus : Méditerranée / Atlantique sud."),
  ],
};

const leafAdds = {
  lobées: [
    q("facile", "Vigne-vierge", "Parthenocissus quinquefolia", "Feuille à 5 folioles", "Palmé à cinq folioles dentées, rouge d’automne.", "Vigne-vierge : Façades et clôtures."),
    q("moyen", "Chêne tauzin", "Quercus pyrenaica", "Feuille lobée duvetée", "Chêne atlantique à feuilles profondément lobées, duvetées.", "Chêne tauzin : Sud-ouest atlantique."),
    q("moyen", "Érable négundo", "Acer negundo", "Feuille composée d’érable", "Érable atypique à feuilles composées.", "Érable négundo : Introduit, bords de cours d’eau."),
    q("difficile", "Ginkgo", "Ginkgo biloba", "Feuille en éventail", "Feuille unique en éventail, nervures dichotomes.", "Ginkgo : Fossile vivant des parcs."),
  ],
  simples: [
    q("facile", "Laurier-cerise", "Prunus laurocerasus", "Grande feuille persistante lustrée", "Feuille oblongue lustrée persistante, toxique.", "Laurier-cerise : Haies très fréquentes."),
    q("facile", "Photinia", "Photinia × fraseri", "Jeunes feuilles rouges", "Feuilles persistantes ; jeunes pousses rouge vif.", "Photinia : Haies ornementales."),
    q("moyen", "Houx", "Ilex aquifolium", "Feuille épineuse persistante", "Feuille coriace à bord épineux, baies rouges.", "Houx : Sous-bois et haies."),
    q("moyen", "Magnolia", "Magnolia grandiflora", "Grande feuille persistante du sud", "Grande feuille lustrée, dessous souvent roux.", "Magnolia : Parcs du Midi et Atlantique."),
    q("moyen", "Catalpa", "Catalpa bignonioides", "Très grande feuille cordiforme", "Feuille très large cordiforme, verticilles.", "Catalpa : Alignements et parcs."),
    q("difficile", "Liquidambar (feuille)", "Liquidambar styraciflua", "Étoile à 5–7 lobes", "Feuille étoilée, couleurs d’automne.", "Liquidambar : Déjà connu en lobées parfois."),
    q("difficile", "Paulownia (feuille)", "Paulownia tomentosa", "Très grande feuille duveteuse", "Feuille cordiforme géante, face duveteuse.", "Paulownia : Croissance rapide."),
  ],
  composees: [
    q("facile", "Sureau", "Sambucus nigra", "Folioles dentées, baies noires", "Feuille imparipennée, folioles dentées.", "Sureau noir : Lisières ; ombelles de fleurs."),
    q("moyen", "Acacia (mimosa)", "Acacia dealbata", "Folioles bipennées argentées", "Feuillage bipenné fin, fleurs jaunes d’hiver.", "Mimosa : Côte d’Azur naturalisé."),
    q("moyen", "Févier", "Gleditsia triacanthos", "Déjà parfois — folioles nombreuses", "Feuille pennée / bipennée, gousses longues.", "Févier d'Amérique : Ornemental."),
    q("difficile", "Mahonia", "Mahonia aquifolium", "Folioles épineuses persistantes", "Feuille composée à folioles épineuses type houx.", "Mahonia : Haies et sous-bois ornementaux."),
    q("difficile", "Aralia", "Aralia elata", "Grandes feuilles doublement composées", "Très grandes feuilles bipennées, port érigé.", "Aralia : Ornemental d’origine asiatique."),
  ],
};

const fossilAdds = {
  invertebres: [
    q("facile", "Nummulite", "Nummulites", "Foraminifère en pièce de monnaie", "Disques calcaires de grands foraminifères tertiaires.", "Nummulite : Calcaires nummulitiques (ex. Égypte, Pyrénées)."),
    q("moyen", "Rudiste", "Hippurites", "Bivalve récifal mésozoïque", "Bivalve à valves inégales formant des bioconstructions.", "Rudiste : Crétacé des mers chaudes."),
    q("moyen", "Goniatite", "Goniatites", "Ammonïde paléozoïque", "Coquille spiralée à sutures en zigzag simples.", "Goniatite : Ancêtre relatif des ammonites."),
    q("difficile", "Cystoïde", "Cystoidea", "Échinoderme en sac", "Échinoderme fossile en forme de sac / calice.", "Cystoïde : Paléozoïque."),
    q("difficile", "Eurypteride", "Eurypterida", "« Scorpion de mer » géant", "Arthropode aquatique souvent grand, Silurien-Dévonien.", "Eurypteride : Prédateurs aquatiques paléozoïques."),
  ],
  vertebres: [
    q("moyen", "Dent de mosasaure", "Mosasauridae", "Dent conique de reptile marin", "Dent robuste conique de grand squamate marin.", "Mosasaure : Prédateur marin du Crétacé."),
    q("moyen", "Vertèbre de poisson", "Osteichthyes", "Disque vertébral de poisson", "Vertèbre fossile de poisson osseux.", "Vertèbre de poisson : Très fréquente."),
    q("difficile", "Œuf de dinosaure", "Dinosauria (ootaxa)", "Coquille d’œuf fossilisée", "Fragment ou œuf complet à coquille sculptée.", "Œuf de dinosaure : Sites de ponte fossilisés."),
    q("difficile", "Mégalocéros (bois)", "Megaloceros giganteus", "Bois géant de cerf géant", "Fragment de bois immense du cerf géant quaternaire.", "Mégalocéros : Pléistocène européen."),
  ],
  "plantes-traces": [
    q("moyen", "Sigillaire", "Sigillaria", "Tronc à cicatrices verticales", "Lycophyte arborescente à cicatrices foliaires en files.", "Sigillaire : Carbonifère, cousine du Lépidodendron."),
    q("moyen", "Glossopteris", "Glossopteris", "Feuille entier du Gondwana", "Feuille allongée à réseau de nervures, Permien gondwanien.", "Glossopteris : Symbole de la dérive des continents."),
    q("difficile", "Stigmaria", "Stigmaria ficoides", "Racines de lycophytes", "Axes racinaires fossiles du Carbonifère.", "Stigmaria : Base des arbres lépidodendracés."),
    q("difficile", "Coprolithe de poisson", "Fish coprolite", "Fiente fossile spiralée", "Coprolithe souvent spiralé attribué à des poissons.", "Coprolithe : Trace d’alimentation."),
  ],
};

const babyAdds = {
  ferme: [
    q("facile", "Pigeonneau", "Columba livia domestica", "Petit du pigeon", "Jeune pigeon encore au nid.", "Pigeonneau : Bébé du pigeon domestique."),
    q("moyen", "Lapereau de clapier", "Oryctolagus cuniculus domesticus", "Petit lapin d’élevage", "Jeune lapin d’élevage.", "Lapereau : Bébé du lapin."),
    q("difficile", "Cailleteau", "Coturnix coturnix", "Petit de la caille", "Très jeune caille au duvet tacheté.", "Cailleteau : Bébé de la caille."),
    q("difficile", "Perdreau", "Perdix perdix", "Petit de la perdrix", "Jeune perdrix encore dépendant des parents.", "Perdreau : Bébé de la perdrix."),
  ],
  compagnie: [
    q("facile", "Chaton", "Felis catus", "Petit du chat", "Jeune chat.", "Chaton : Bébé du chat."),
    q("moyen", "Lapereau nain", "Oryctolagus cuniculus", "Petit lapin nain", "Jeune lapin de compagnie.", "Lapereau : Bébé du lapin nain."),
    q("difficile", "Jeune furet", "Mustela putorius furo", "Petit du furet", "Jeune furet joueur.", "Fureton : Bébé du furet."),
    q("difficile", "Perroqueteau", "Psittacus erithacus", "Petit du perroquet", "Jeune perroquet encore duveté.", "Perroqueteau : Bébé du perroquet."),
  ],
  sauvage: [
    q("facile", "Ourson polaire", "Ursus maritimus", "Petit de l’ours blanc", "Jeune ours polaire au pelage blanc.", "Ourson polaire : Bébé de l’ours blanc."),
    q("moyen", "Bébé panda", "Ailuropoda melanoleuca", "Petit du panda géant", "Très petit à la naissance, noir et blanc ensuite.", "Bébé panda : Bébé du panda géant."),
    q("moyen", "Petit kangourou", "Macropus rufus", "Joey dans la poche", "Jeune marsupial dans la poche maternelle.", "Joey : Bébé du kangourou."),
    q("difficile", "Petit manchot", "Aptenodytes forsteri", "Poussin de manchot", "Jeune manchot au duvet duveteux.", "Poussin de manchot : Bébé du manchot."),
    q("difficile", "Petit crocodile", "Crocodylus niloticus", "Jeune crocodile", "Très jeune crocodile déjà denté.", "Jeune crocodile : Bébé du crocodile."),
    q("difficile", "Aiglon", "Aquila chrysaetos", "Petit de l’aigle", "Jeune aigle au nid.", "Aiglon : Bébé de l’aigle."),
  ],
};

const insectWave2 = {
  coleopteres: [
    q("moyen", "Carabe violet", "Carabus violaceus", "Grand carabe aux reflets violets", "Grand carabe sombre à reflets violacés.", "Carabe violet : Forestier nocturne."),
    q("moyen", "Cétoine morio", "Protaetia morio", "Cétoine noirâtre mate", "Cétoine sombre mate, sur fruits / fleurs.", "Protaetia morio : Midi et zones chaudes."),
    q("difficile", "Prione tanneur", "Prionus coriarius", "Très grand longicorne brun", "Énorme cerambycidé brun, antennes dentées chez le mâle.", "Prione : Bois mort ; impressionnant."),
  ],
  lepidopteres: [
    q("facile", "Fadet commun", "Coenonympha pamphilus", "Petit satyriné fauve", "Petit papillon fauve à ocelle discret.", "Fadet commun : Prairies très répandu."),
    q("moyen", "Demi-deuil", "Melanargia galathea", "Blanc damier noir", "Satyriné blanc à damier noir caractéristique.", "Demi-deuil : Prairies fleuries."),
    q("moyen", "Cuivré fuligineux", "Lycaena tityrus", "Cuivré sombre", "Lycène ; mâle brun-cuivré sombre.", "Cuivré fuligineux : Prairies."),
    q("difficile", "Diane", "Zerynthia polyxena", "Papillon jaune à motifs noirs/rouges", "Papilionidé printanier sur aristoloches.", "Diane : Midi et est ; protégée localement."),
    q("difficile", "Sphinx tête-de-mort", "Acherontia atropos", "Grand sphinx à motif crâne", "Grand hétérocère ; thorax à dessin évoquant un crâne.", "Sphinx tête-de-mort : Migrateur rare, ruches."),
  ],
  hymenopteres: [
    q("moyen", "Bourdon terrestre à bande", "Bombus lucorum", "Bourdon à bandes jaunes", "Bourdon à bandes jaunes et queue blanche (groupe lucorum).", "Bombus lucorum : Très commun."),
    q("difficile", "Ammophile des sables", "Ammophila sabulosa", "Guêpe fouisseuse à long pétiole", "Guêpe solitaire très allongée, transporte des chenilles.", "Ammophile : Sables et sols meubles."),
  ],
  dipteres: [
    q("moyen", "Syrphe ceinturé des orties", "Episyrphus balteatus", "Déjà connu parfois", "Syrphe à bandes abdominales fines.", "Episyrphus : Ultra-commun."),
    q("difficile", "Diopsis", "Sphyracephala europaea", "Mouche à yeux pédonculés (rare)", "Diptère aux yeux au bout de pédoncules.", "Sphyracephala : Rare en Europe."),
  ],
  autres: [
    q("facile", "Cigale rouge", "Tibicina haematodes", "Cigale à veines rougeâtres", "Cigale aux nervures alaires teintées de rouge.", "Tibicina : Midi."),
    q("moyen", "Caloptéryx vierge", "Calopteryx virgo", "Demoiselle aux ailes très sombres", "Mâle aux ailes presque entièrement bleu-noir.", "Caloptéryx vierge : Ruisseaux ombragés."),
    q("moyen", "Sympétrum sanguin", "Sympetrum sanguineum", "Libellule rougeâtre d’automne", "Libellule ; mâle abdomen rougeâtre en fin de saison.", "Sympétrum : Plans d’eau, fin d’été."),
    q("difficile", "Mante religieuse brune", "Iris oratoria", "Mante méditerranéenne ocellée", "Mante aux ailes postérieures ocellées.", "Iris oratoria : Midi méditerranéen."),
  ],
};

const mammalWave2 = {
  rongeurs: [
    q("facile", "Écureuil roux (déjà)", "Sciurus vulgaris x", "skip", "skip", "skip"),
    q("moyen", "Campagnol terrestre", "Arvicola amphibius", "Gros campagnol des prairies", "Grand campagnol fouisseur des prairies humides.", "Campagnol terrestre : Galeries superficielles."),
    q("moyen", "Crocidure leucode", "Crocidura leucodon", "Musaraigne bicolore", "Musaraigne à limite nette dos/ventre.", "Crocidure leucode : Jardins et haies."),
    q("difficile", "Putois des steppes", "Mustela eversmanii", "skip", "skip", "skip"),
  ],
  chiropteres: [
    q("moyen", "Pipistrelle pygmée", "Pipistrellus pygmaeus", "Très petite pipistrelle", "Très petite ; longtemps confondue avec la commune.", "Pipistrelle pygmée : Souvent près de l’eau."),
    q("difficile", "Sérotine bicolore", "Vespertilio murinus", "Sérotine à pelage bicolore", "Dos sombre, ventre clair contrasté.", "Sérotine bicolore : Migrateur, bâtiments."),
    q("difficile", "Murin de Bechstein", "Myotis bechsteinii", "Murin forestier à grandes oreilles", "Grandes oreilles, strictement forestier.", "Murin de Bechstein : Cavités d’arbres."),
  ],
  marins: [
    q("difficile", "Lagénorhynque à bec blanc", "Lagenorhynchus albirostris", "Dauphin boréal au large", "Delphinidé à bec clair, eaux fraîches au large.", "Lagénorhynque : Manche / Atlantique nord."),
  ],
};

mammalWave2.rongeurs = mammalWave2.rongeurs.filter((x) => !x.explication.includes("skip") && x.indice !== "skip");

const treeWave2 = {
  feuillus: [
    q("moyen", "Chêne rouge d'Amérique", "Quercus rubra", "Chêne introduit à lobes pointus", "Chêne à lobes aigus, rouge d’automne.", "Chêne rouge : Planté, naturalisé localement."),
    q("moyen", "Érable argenté", "Acer saccharinum", "Érable à feuilles découpées argentées", "Feuilles très découpées, dessous argenté.", "Érable argenté : Parcs et alignements."),
    q("difficile", "Micocoulier de Provence", "Celtis australis", "Déjà parfois", "Feuille asymétrique, fruits noirâtres.", "Micocoulier : Midi."),
    q("difficile", "Charme-houblon", "Ostrya carpinifolia", "Proche du charme, fruits en cônes", "Feuilles type charme ; fruits en chatons en cône.", "Charme-houblon : Sud-est."),
  ],
  coniferes: [
    q("moyen", "Séquoia toujours vert", "Sequoia sempervirens", "Géant des parcs", "Très grand conifère à feuillage persistant.", "Séquoia sempervirens : Parcs remarquables."),
    q("difficile", "Cryptoméria", "Cryptomeria japonica", "Cèdre du Japon", "Conifère à aiguilles en alène, écorce fibreuse.", "Cryptoméria : Plantations et parcs."),
  ],
  fruitiers: [
    q("moyen", "Grenadier", "Punica granatum", "Arbuste à fruits grenades", "Arbuste méditerranéen à fleurs rouge vif.", "Grenadier : Midi et bacs."),
    q("difficile", "Asiminier", "Asimina triloba", "Fruitier américain rare", "Grandes feuilles ; fruits type « banane nordique ».", "Asiminier : Collectionneurs / parcs."),
  ],
};

const leafWave2 = {
  simples: [
    q("moyen", "Bambou (feuille)", "Phyllostachys aurea", "Feuille linéaire de graminée arborescente", "Feuille allongée de bambou, nervure parallèle.", "Bambou : Naturalisé localement."),
    q("difficile", "Eucalyptus (feuille)", "Eucalyptus globulus", "Feuille falciforme odorante", "Feuille en faucille, forte odeur de cinéole.", "Eucalyptus : Midi."),
  ],
  composees: [
    q("moyen", "Noyer noir", "Juglans nigra", "Folioles nombreuses aromatiques", "Feuille imparipennée à nombreuses folioles.", "Noyer noir : Parcs, introduit."),
    q("difficile", "Ailante", "Ailanthus altissima", "Grandes feuilles à glandes", "Folioles avec dents basales glanduleuses ; odeur forte.", "Ailante : Invasif urbain."),
  ],
};

const mineralWave2 = {
  silicates: [
    q("moyen", "Labradorite", "Labradorite", "Feldspath à reflets bleus", "Plagioclase aux irisations bleues (labradorescence).", "Labradorite : Ornement et spécimens.", "labradorite"),
    q("difficile", "Prehnite", "Prehnite", "Vert pomme botryoïdal", "Silicate vert souvent en masses mamelonnées.", "Prehnite : Fentes hydrothermales.", "prehnite"),
  ],
  gemmes: [
    q("moyen", "Citrine", "Citrine", "Quartz jaune", "Variété jaune du quartz.", "Citrine : Gemme ; souvent améthyste chauffée.", "citrine quartz"),
    q("difficile", "Spinelle rouge", "Red spinel", "Rouge vif octaédrique", "Spinelle rouge longtemps pris pour du rubis.", "Spinelle rouge : Gemme historique.", "red spinel"),
  ],
  metaux: [
    q("moyen", "Stibine", "Stibnite", "Sulfure d’antimoine en aiguilles", "Prismes/aiguilles gris métalliques d’antimoine.", "Stibine : Minerai d’antimoine.", "stibnite"),
  ],
};

const shellWave2 = {
  gasteropodes: [
    q("moyen", "Littorine obtuse", "Littorina obtusata", "Petite littorine globuleuse", "Petite coquille globuleuse des algues de l’estran.", "Littorina obtusata : Zone des fucales."),
    q("difficile", "Fusus", "Aporrhais pespelecani", "Pied de pélican", "Coquille à expansions digitatives de l’ouverture.", "Aporrhais : Sables vaseux subtidaux."),
  ],
  bivalves: [
    q("moyen", "Myes", "Mya arenaria", "Grande mye des vases", "Grand bivalve fouisseur des vases estuariennes.", "Mye : Introduite / estuaires."),
    q("difficile", "Pinne marine", "Pinna nobilis", "Grande nacre méditerranéenne", "Très grande coquille triangulaire des herbiers.", "Pinne : Protégée en Méditerranée."),
  ],
};

const results = [];
results.push(enrichFile("insectes-france.json", insectAdds));
results.push(enrichFile("insectes-france.json", insectWave2));
results.push(enrichFile("fruits-legumes.json", fruitAdds, { cleanup: cleanupFruits }));
results.push(enrichFile("mammiferes-france.json", mammalAdds));
results.push(enrichFile("mammiferes-france.json", mammalWave2));
results.push(enrichFile("arbres-france.json", treeAdds));
results.push(enrichFile("arbres-france.json", treeWave2));
results.push(enrichFile("rochers-mineraux.json", mineralAdds));
results.push(enrichFile("rochers-mineraux.json", mineralWave2));
results.push(enrichFile("coquillages.json", shellAdds));
results.push(enrichFile("coquillages.json", shellWave2));
results.push(enrichFile("feuilles-arbres.json", leafAdds));
results.push(enrichFile("feuilles-arbres.json", leafWave2));
results.push(enrichFile("fossiles.json", fossilAdds));
results.push(enrichFile("bebes-animaux.json", babyAdds));

console.log("\nSummary (last write per quiz):");
const seen = new Map();
for (const r of results) seen.set(r.id, r);
for (const r of seen.values()) console.log(`- ${r.id}: total ${r.total} (last +${r.added})`);
