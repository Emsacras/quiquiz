/**
 * Génère : bébés animaux, feuilles d’arbres, nuages, constellations, fossiles.
 * Usage: node scripts/build-new-quizzes.mjs
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

function buildQuiz({ id, categorie, description, groups }) {
  const allNames = groups.flatMap((g) => g.items.map((i) => i.nom_commun));
  const groupes = groups.map((group) => {
    const names = group.items.map((item) => item.nom_commun);
    const questions = group.items.map((item, index) => {
      const qid = `${group.id}${index + 1}`;
      let distractors = pickDistractors(names, item.nom_commun, qid);
      if (distractors.length < 3) distractors = pickDistractors(allNames, item.nom_commun, qid);
      const options = shuffleOptions([item.nom_commun, ...distractors].slice(0, 4), qid);
      const q = {
        id: qid,
        difficulte: item.difficulte,
        nom_commun: item.nom_commun,
        nom_scientifique: item.nom_scientifique,
        groupe: group.id,
        options,
        indice: item.indice,
        description: item.description,
        explication: item.explication,
      };
      if (item.imageQuery) q.imageQuery = item.imageQuery;
      return q;
    });
    return { id: group.id, label: group.label, questions };
  });
  return { id, categorie, description, groupes };
}

function writeQuiz(quiz) {
  const path = join(dataDir, `${quiz.id}.json`);
  writeFileSync(path, `${JSON.stringify(quiz, null, 2)}\n`, "utf8");
  const n = quiz.groupes.reduce((s, g) => s + g.questions.length, 0);
  console.log(`wrote ${quiz.id} (${n} questions)`);
}

const bebes = buildQuiz({
  id: "bebes-animaux",
  categorie: "Bébés animaux",
  description: "Une photo de petit : retrouve le nom du bébé (poussin, veau, chaton…).",
  groups: [
    {
      id: "ferme",
      label: "Ferme",
      items: [
        { difficulte: "facile", nom_commun: "Poussin", nom_scientifique: "Gallus gallus domesticus", imageQuery: "chick", indice: "Petit jaune du poulailler", description: "Jeune oiseau couvert de duvet, issu de la poule domestique.", explication: "Poussin : Bébé de la poule." },
        { difficulte: "facile", nom_commun: "Veau", nom_scientifique: "Bos taurus", imageQuery: "calf", indice: "Petit de la vache", description: "Jeune bovin encore dépendant du lait maternel.", explication: "Veau : Bébé de la vache (ou du taureau)." },
        { difficulte: "facile", nom_commun: "Agneau", nom_scientifique: "Ovis aries", imageQuery: "lamb", indice: "Petit du mouton", description: "Jeune ovin à la toison encore fine.", explication: "Agneau : Bébé du mouton." },
        { difficulte: "facile", nom_commun: "Porcelet", nom_scientifique: "Sus domesticus", imageQuery: "piglet", indice: "Petit du cochon", description: "Jeune porc au museau rose et au corps trapu.", explication: "Porcelet : Bébé du porc." },
        { difficulte: "moyen", nom_commun: "Poulain", nom_scientifique: "Equus caballus", imageQuery: "foal", indice: "Petit du cheval", description: "Jeune cheval aux longues pattes, encore proche de sa mère.", explication: "Poulain : Bébé du cheval (pouliche si femelle)." },
        { difficulte: "moyen", nom_commun: "Chevreau", nom_scientifique: "Capra hircus", imageQuery: "kid goat", indice: "Petit de la chèvre", description: "Jeune caprin vif, souvent cornu plus tard.", explication: "Chevreau : Bébé de la chèvre." },
        { difficulte: "moyen", nom_commun: "Caneton", nom_scientifique: "Anas platyrhynchos domesticus", imageQuery: "duckling", indice: "Petit du canard", description: "Jeune canard au duvet jaune, bon nageur.", explication: "Caneton : Bébé du canard." },
        { difficulte: "difficile", nom_commun: "Oison", nom_scientifique: "Anser anser domesticus", imageQuery: "gosling", indice: "Petit de l’oie", description: "Jeune oie au duvet gris-jaune.", explication: "Oison : Bébé de l’oie." },
        { difficulte: "difficile", nom_commun: "Dindonneau", nom_scientifique: "Meleagris gallopavo", imageQuery: "turkey poult", indice: "Petit de la dinde", description: "Jeune dindon encore couvert de duvet.", explication: "Dindonneau : Bébé de la dinde / du dindon." },
      ],
    },
    {
      id: "compagnie",
      label: "Compagnie",
      items: [
        { difficulte: "facile", nom_commun: "Chaton", nom_scientifique: "Felis catus", imageQuery: "kitten", indice: "Petit du chat", description: "Jeune chat aux yeux grands et aux oreilles encore molles.", explication: "Chaton : Bébé du chat." },
        { difficulte: "facile", nom_commun: "Chiot", nom_scientifique: "Canis familiaris", imageQuery: "puppy", indice: "Petit du chien", description: "Jeune chien joueur, encore en croissance.", explication: "Chiot : Bébé du chien." },
        { difficulte: "moyen", nom_commun: "Lapereau", nom_scientifique: "Oryctolagus cuniculus", imageQuery: "baby rabbit", indice: "Petit du lapin", description: "Jeune lapin au pelage doux, oreilles encore courtes.", explication: "Lapereau : Bébé du lapin." },
        { difficulte: "moyen", nom_commun: "Tortillon", nom_scientifique: "Serinus canaria", imageQuery: "canary chick", indice: "Petit du canari", description: "Jeune canari encore au nid ou tout juste sorti.", explication: "Tortillon : Bébé du canari (aussi dit « canarillon »)." },
        { difficulte: "difficile", nom_commun: "Souriceau", nom_scientifique: "Mus musculus", imageQuery: "baby mouse", indice: "Petit de la souris", description: "Très jeune souris, souvent rose et sans poils au tout début.", explication: "Souriceau : Bébé de la souris." },
        { difficulte: "difficile", nom_commun: "Ratton", nom_scientifique: "Rattus norvegicus", imageQuery: "baby rat", indice: "Petit du rat", description: "Jeune rat encore dépendant du nid.", explication: "Ratton : Bébé du rat." },
      ],
    },
    {
      id: "sauvage",
      label: "Sauvage",
      items: [
        { difficulte: "facile", nom_commun: "Ourson", nom_scientifique: "Ursus arctos", imageQuery: "bear cub", indice: "Petit de l’ours", description: "Jeune ours au pelage duveteux.", explication: "Ourson : Bébé de l’ours." },
        { difficulte: "facile", nom_commun: "Lionceau", nom_scientifique: "Panthera leo", imageQuery: "lion cub", indice: "Petit du lion", description: "Jeune lion encore tacheté, sans crinière.", explication: "Lionceau : Bébé du lion." },
        { difficulte: "moyen", nom_commun: "Renardeau", nom_scientifique: "Vulpes vulpes", imageQuery: "fox cub", indice: "Petit du renard", description: "Jeune renard au museau pointu et au pelage sombre.", explication: "Renardeau : Bébé du renard." },
        { difficulte: "moyen", nom_commun: "Louveteau", nom_scientifique: "Canis lupus", imageQuery: "wolf pup", indice: "Petit du loup", description: "Jeune loup élevé au sein de la meute.", explication: "Louveteau : Bébé du loup." },
        { difficulte: "moyen", nom_commun: "Faon", nom_scientifique: "Cervus elaphus", imageQuery: "fawn", indice: "Petit du cerf / de la biche", description: "Jeune cervidé au pelage tacheté.", explication: "Faon : Bébé du cerf (ou de la biche)." },
        { difficulte: "difficile", nom_commun: "Marcassin", nom_scientifique: "Sus scrofa", imageQuery: "wild boar piglet", indice: "Petit du sanglier", description: "Jeune sanglier rayé de clair sur le flanc.", explication: "Marcassin : Bébé du sanglier." },
        { difficulte: "difficile", nom_commun: "Levraut", nom_scientifique: "Lepus europaeus", imageQuery: "baby hare", indice: "Petit du lièvre", description: "Jeune lièvre né déjà velu et les yeux ouverts.", explication: "Levraut : Bébé du lièvre." },
        { difficulte: "difficile", nom_commun: "Blanchet", nom_scientifique: "Phoca vitulina", imageQuery: "seal pup", indice: "Petit du phoque", description: "Jeune phoque au pelage clair, sur la grève.", explication: "Blanchet (ou blanchon) : Bébé du phoque." },
      ],
    },
  ],
});

const feuilles = buildQuiz({
  id: "feuilles-arbres",
  categorie: "Feuilles d’arbres",
  description: "Reconnais l’arbre uniquement grâce à sa feuille (pas le tronc ni le fruit).",
  groups: [
    {
      id: "lobées",
      label: "Lobées / découpées",
      items: [
        { difficulte: "facile", nom_commun: "Chêne pédonculé", nom_scientifique: "Quercus robur", imageQuery: "leaf", indice: "Lobes arrondis, sans pointes", description: "Feuille lobée à lobes arrondis, limbe coriace.", explication: "Chêne pédonculé : Feuille lobée classique des chênaies." },
        { difficulte: "facile", nom_commun: "Érable sycomore", nom_scientifique: "Acer pseudoplatanus", imageQuery: "leaf", indice: "Cinq lobes palmés", description: "Feuille palmée à cinq lobes dentés.", explication: "Érable sycomore : Feuille palmée, samares en « hélicoptère »." },
        { difficulte: "moyen", nom_commun: "Platane", nom_scientifique: "Platanus × hispanica", imageQuery: "leaf", indice: "Grands lobes pointus", description: "Grande feuille palmée à lobes aigus, nervures marquées.", explication: "Platane : Feuille large des alignements urbains." },
        { difficulte: "moyen", nom_commun: "Figuier", nom_scientifique: "Ficus carica", imageQuery: "leaf", indice: "3 à 5 lobes profonds", description: "Feuille épaisse, lobes profonds, face rugueuse.", explication: "Figuier : Feuille caractéristique du bassin méditerranéen." },
        { difficulte: "difficile", nom_commun: "Liquidambar", nom_scientifique: "Liquidambar styraciflua", imageQuery: "leaf", indice: "Étoile à 5–7 pointes", description: "Feuille étoilée à lobes pointus, belles couleurs d’automne.", explication: "Liquidambar : Feuille étoilée des parcs." },
        { difficulte: "difficile", nom_commun: "Tulipier de Virginie", nom_scientifique: "Liriodendron tulipifera", imageQuery: "leaf", indice: "Feuille « en selle » tronquée", description: "Feuille à limbe tronqué au sommet, forme unique.", explication: "Tulipier : Feuille inimitables, sommets comme coupés." },
      ],
    },
    {
      id: "simples",
      label: "Simples ovales",
      items: [
        { difficulte: "facile", nom_commun: "Hêtre", nom_scientifique: "Fagus sylvatica", imageQuery: "leaf", indice: "Ovale, bord ondulé", description: "Feuille ovale à bord légèrement ondulé, nervures parallèles.", explication: "Hêtre : Feuille lisse, tipique des hêtraies." },
        { difficulte: "facile", nom_commun: "Bouleau verruqueux", nom_scientifique: "Betula pendula", imageQuery: "leaf", indice: "Petite, triangulaire-dentée", description: "Petite feuille dentée, base souvent en coin.", explication: "Bouleau : Petite feuille dentée des clairières." },
        { difficulte: "moyen", nom_commun: "Tilleul", nom_scientifique: "Tilia cordata", imageQuery: "leaf", indice: "Cœur asymétrique", description: "Feuille cordiforme, base asymétrique, pointe fine.", explication: "Tilleul : Feuille en cœur, parfum des fleurs." },
        { difficulte: "moyen", nom_commun: "Orme champêtre", nom_scientifique: "Ulmus minor", imageQuery: "leaf", indice: "Base très asymétrique", description: "Feuille doublement dentée, base fortement inégale.", explication: "Orme : Base de feuille très asymétrique." },
        { difficulte: "difficile", nom_commun: "Charme", nom_scientifique: "Carpinus betulus", imageQuery: "leaf", indice: "Nervures très marquées, double dent", description: "Feuille ovale plissée, double denture régulière.", explication: "Charme : Feuille plissée des haies et forêts." },
        { difficulte: "difficile", nom_commun: "Aulne glutineux", nom_scientifique: "Alnus glutinosa", imageQuery: "leaf", indice: "Sommet échancré", description: "Feuille arrondie au sommet souvent échancré.", explication: "Aulne : Feuille à sommet tronqué / échancré, bords d’eau." },
      ],
    },
    {
      id: "composees",
      label: "Composées / aiguilles",
      items: [
        { difficulte: "facile", nom_commun: "Frêne commun", nom_scientifique: "Fraxinus excelsior", imageQuery: "leaf", indice: "Foliooles opposées", description: "Feuille composée imparipennée, nombreuses folioles.", explication: "Frêne : Feuille composée typique." },
        { difficulte: "facile", nom_commun: "Robinier", nom_scientifique: "Robinia pseudoacacia", imageQuery: "leaf", indice: "Folioles ovales arrondies", description: "Feuille composée à folioles ovales, souvent épineuse à la base.", explication: "Robinier (acacia) : Feuille composée des bords de route." },
        { difficulte: "moyen", nom_commun: "Noyer", nom_scientifique: "Juglans regia", imageQuery: "leaf", indice: "Grandes folioles aromatiques", description: "Feuille composée à grandes folioles odorantes.", explication: "Noyer : Feuille composée forte odeur." },
        { difficulte: "moyen", nom_commun: "Pin sylvestre", nom_scientifique: "Pinus sylvestris", imageQuery: "needles", indice: "Aiguilles par 2", description: "Aiguilles groupées par deux, assez courtes.", explication: "Pin sylvestre : Aiguilles géminées." },
        { difficulte: "difficile", nom_commun: "Mélèze", nom_scientifique: "Larix decidua", imageQuery: "needles", indice: "Aiguilles en rosettes, caduques", description: "Aiguilles souples en touffes sur les rameaux courts.", explication: "Mélèze : Seul conifère européen à perdre ses aiguilles." },
        { difficulte: "difficile", nom_commun: "Sapin pectiné", nom_scientifique: "Abies alba", imageQuery: "needles", indice: "Aiguilles plates en peigne", description: "Aiguilles aplaties disposées en peigne, face inférieure claire.", explication: "Sapin : Aiguilles pectinées, non piquantes." },
      ],
    },
  ],
});

const nuages = buildQuiz({
  id: "nuages",
  categorie: "Nuages",
  description: "Reconnais les principaux types de nuages (classification internationale).",
  groups: [
    {
      id: "bas",
      label: "Étages bas",
      items: [
        { difficulte: "facile", nom_commun: "Cumulus", nom_scientifique: "Cumulus", imageQuery: "cloud", indice: "Chou-fleur blanc", description: "Nuage blanc bourgeonnant à base plate, beau temps souvent.", explication: "Cumulus : Nuage de beau temps en « chou-fleur »." },
        { difficulte: "facile", nom_commun: "Stratus", nom_scientifique: "Stratus", imageQuery: "cloud", indice: "Voile gris bas", description: "Couche grise uniforme, bas dans le ciel, bruine possible.", explication: "Stratus : Couche basse uniforme." },
        { difficulte: "moyen", nom_commun: "Stratocumulus", nom_scientifique: "Stratocumulus", imageQuery: "cloud", indice: "Dalles grises/blanches", description: "Bancs ou dalles de nuages bas, peu d’averses.", explication: "Stratocumulus : Galettes nuageuses basses." },
        { difficulte: "moyen", nom_commun: "Nimbostratus", nom_scientifique: "Nimbostratus", imageQuery: "cloud", indice: "Pluie continue", description: "Épaisse couche sombre donnant pluie ou neige prolongée.", explication: "Nimbostratus : Nuage de pluie durable." },
        { difficulte: "difficile", nom_commun: "Cumulus congestus", nom_scientifique: "Cumulus congestus", imageQuery: "cloud", indice: "Tour en croissance", description: "Cumulus très développé verticalement, avant orage parfois.", explication: "Cumulus congestus : Tour nuageuse en croissance." },
      ],
    },
    {
      id: "moyen",
      label: "Étages moyens",
      items: [
        { difficulte: "facile", nom_commun: "Altocumulus", nom_scientifique: "Altocumulus", imageQuery: "cloud", indice: "Moutons du ciel", description: "Bancs de petits flocons ou galettes à moyenne altitude.", explication: "Altocumulus : « Moutons » à moyenne altitude." },
        { difficulte: "moyen", nom_commun: "Altostratus", nom_scientifique: "Altostratus", imageQuery: "cloud", indice: "Voile laiteux", description: "Voile grisâtre à travers lequel le Soleil apparaît flou.", explication: "Altostratus : Voile moyen, Soleil terne." },
        { difficulte: "difficile", nom_commun: "Altocumulus lenticularis", nom_scientifique: "Altocumulus lenticularis", imageQuery: "lenticular cloud", indice: "Soucoupe / lentille", description: "Nuage lenticulaire stationnaire, souvent en montagne.", explication: "Altocumulus lenticularis : Forme en lentille au-dessus des reliefs." },
        { difficulte: "difficile", nom_commun: "Altocumulus castellanus", nom_scientifique: "Altocumulus castellanus", imageQuery: "cloud", indice: "Tours dentelées", description: "Altocumulus aux sommets en créneaux, signe d’instabilité.", explication: "Castellanus : Créneaux annonçant parfois l’orage." },
      ],
    },
    {
      id: "haut",
      label: "Étages hauts & orage",
      items: [
        { difficulte: "facile", nom_commun: "Cirrus", nom_scientifique: "Cirrus", imageQuery: "cirrus cloud", indice: "Filaments blancs", description: "Nuages fins fibreux de cristaux de glace, très hauts.", explication: "Cirrus : Filaments de glace en altitude." },
        { difficulte: "facile", nom_commun: "Cumulonimbus", nom_scientifique: "Cumulonimbus", imageQuery: "cumulonimbus", indice: "Enclume d’orage", description: "Immense tour orageuse, sommet souvent en enclume.", explication: "Cumulonimbus : Nuage d’orage." },
        { difficulte: "moyen", nom_commun: "Cirrostratus", nom_scientifique: "Cirrostratus", imageQuery: "cirrostratus", indice: "Halo autour du Soleil", description: "Voile blanc transparent, halo solaire ou lunaire fréquent.", explication: "Cirrostratus : Voile haut avec halo." },
        { difficulte: "moyen", nom_commun: "Cirrocumulus", nom_scientifique: "Cirrocumulus", imageQuery: "cirrocumulus", indice: "Grain de riz / écaille", description: "Petits flocons blancs très hauts, ciel « pommelé » fin.", explication: "Cirrocumulus : Écailles très hautes." },
        { difficulte: "difficile", nom_commun: "Cumulonimbus capillatus", nom_scientifique: "Cumulonimbus capillatus", imageQuery: "cumulonimbus anvil", indice: "Sommet fibreux", description: "Cumulonimbus à sommet fibreux / enclume bien formée.", explication: "Capillatus : Orage mature à enclume fibreuse." },
        { difficulte: "difficile", nom_commun: "Contrail (traînée)", nom_scientifique: "Cirrus aviaticus", imageQuery: "contrail", indice: "Trace d’avion", description: "Traînée de condensation d’avion, parfois persistante.", explication: "Contrail : Traînée d’avion, parfois classée avec les cirrus." },
      ],
    },
  ],
});

const constellations = buildQuiz({
  id: "constellations",
  categorie: "Constellations",
  description: "Reconnais les constellations sur une carte du ciel ou un schéma.",
  groups: [
    {
      id: "boreales",
      label: "Boréales célèbres",
      items: [
        { difficulte: "facile", nom_commun: "Grande Ourse", nom_scientifique: "Ursa Major", imageQuery: "constellation", indice: "Casserole à 7 étoiles", description: "Asterisme en casserole, guide vers l’étoile polaire.", explication: "Grande Ourse : La « casserole » du nord." },
        { difficulte: "facile", nom_commun: "Petite Ourse", nom_scientifique: "Ursa Minor", imageQuery: "constellation", indice: "Porte l’étoile polaire", description: "Petite casserole dont l’extrémité est Polaris.", explication: "Petite Ourse : Contient l’étoile polaire." },
        { difficulte: "facile", nom_commun: "Orion", nom_scientifique: "Orion", imageQuery: "constellation", indice: "Ceinture à 3 étoiles", description: "Chasseur avec ceinture alignée de trois étoiles.", explication: "Orion : Constellation d’hiver très visible." },
        { difficulte: "moyen", nom_commun: "Cassiopée", nom_scientifique: "Cassiopeia", imageQuery: "constellation", indice: "W ou M", description: "Cinq étoiles formant un W (ou M) caractéristique.", explication: "Cassiopée : Le W circumpolaire." },
        { difficulte: "moyen", nom_commun: "Cygnus", nom_scientifique: "Cygnus", imageQuery: "constellation", indice: "Croix du Nord", description: "Forme de cygne / croix le long de la Voie lactée.", explication: "Cygnus : La Croix du Nord." },
        { difficulte: "difficile", nom_commun: "Céphée", nom_scientifique: "Cepheus", imageQuery: "constellation", indice: "Maison / pentagone", description: "Constellation proche de Cassiopée, forme de maison.", explication: "Céphée : Roi mythique, près de Cassiopée." },
      ],
    },
    {
      id: "zodiaque",
      label: "Zodiaque",
      items: [
        { difficulte: "facile", nom_commun: "Lion", nom_scientifique: "Leo", imageQuery: "constellation", indice: "Sickle / point d’interrogation", description: "Tête du lion en faucille, étoile Régulus.", explication: "Lion (Leo) : Constellation printanière du zodiaque." },
        { difficulte: "facile", nom_commun: "Scorpion", nom_scientifique: "Scorpius", imageQuery: "constellation", indice: "Queue courbée, Antarès", description: "Forme de scorpion, étoile rouge Antarès.", explication: "Scorpion : Zodiaque d’été austral / bas sur l’horizon." },
        { difficulte: "moyen", nom_commun: "Gémeaux", nom_scientifique: "Gemini", imageQuery: "constellation", indice: "Castor et Pollux", description: "Deux étoiles brillantes côte à côte, les jumeaux.", explication: "Gémeaux : Castor et Pollux." },
        { difficulte: "moyen", nom_commun: "Taureau", nom_scientifique: "Taurus", imageQuery: "constellation", indice: "V des Hyades", description: "Tête en V (Hyades) et Pléiades proches.", explication: "Taureau : V des Hyades + Pléiades." },
        { difficulte: "difficile", nom_commun: "Verseau", nom_scientifique: "Aquarius", imageQuery: "constellation", indice: "Verseur d’eau", description: "Constellation étendue du verseur, peu d’étoiles très brillantes.", explication: "Verseau : Zodiaque d’automne." },
        { difficulte: "difficile", nom_commun: "Capricorne", nom_scientifique: "Capricornus", imageQuery: "constellation", indice: "Triangle / corne", description: "Constellation en triangle allongé du zodiaque.", explication: "Capricorne : Zodiaque d’hiver." },
      ],
    },
    {
      id: "autres",
      label: "Autres classiques",
      items: [
        { difficulte: "facile", nom_commun: "Cocher", nom_scientifique: "Auriga", imageQuery: "constellation", indice: "Pentagone avec Capella", description: "Pentagone brillant dominé par Capella.", explication: "Cocher (Auriga) : Capella, hiver boréal." },
        { difficulte: "moyen", nom_commun: "Aigle", nom_scientifique: "Aquila", imageQuery: "constellation", indice: "Altaïr au centre", description: "Constellation avec Altaïr, pointe du Triangle d’été.", explication: "Aigle : Altaïr, Triangle d’été." },
        { difficulte: "moyen", nom_commun: "Lyre", nom_scientifique: "Lyra", imageQuery: "constellation", indice: "Véga très brillante", description: "Petite constellation dominée par Véga.", explication: "Lyre : Véga, une des plus brillantes du ciel." },
        { difficulte: "moyen", nom_commun: "Persée", nom_scientifique: "Perseus", imageQuery: "constellation", indice: "Entre Cassiopée et le Cocher", description: "Constellation riche en amas, héros mythique.", explication: "Persée : Entre Cassiopée et Auriga." },
        { difficulte: "difficile", nom_commun: "Andromède", nom_scientifique: "Andromeda", imageQuery: "constellation", indice: "Proche de la galaxie M31", description: "Chaîne d’étoiles, abrite la galaxie d’Andromède.", explication: "Andromède : Constellation + galaxie célèbre." },
        { difficulte: "difficile", nom_commun: "Hercule", nom_scientifique: "Hercules", imageQuery: "constellation", indice: "Keystone (clé de voûte)", description: "Grand héros, asterisme en trapèze (Keystone).", explication: "Hercule : Trapèze du Keystone." },
      ],
    },
  ],
});

const fossiles = buildQuiz({
  id: "fossiles",
  categorie: "Fossiles",
  description: "Reconnais des fossiles emblématiques (animaux, plantes, traces).",
  groups: [
    {
      id: "invertebres",
      label: "Invertébrés",
      items: [
        { difficulte: "facile", nom_commun: "Ammonite", nom_scientifique: "Ammonoidea", imageQuery: "fossil", indice: "Spirale côtelée", description: "Coquille spirale fossile de céphalopode.", explication: "Ammonite : Céphalopode fossile en spirale." },
        { difficulte: "facile", nom_commun: "Trilobite", nom_scientifique: "Trilobita", imageQuery: "fossil", indice: "Trois lobes, segmenté", description: "Arthropode marin segmenté en trois lobes longitudinaux.", explication: "Trilobite : Arthropode paléozoïque emblématique." },
        { difficulte: "moyen", nom_commun: "Bélemnite", nom_scientifique: "Belemnitida", imageQuery: "fossil", indice: "Rostrum en « balle »", description: "Rostrum interne en forme de balle / cigare.", explication: "Bélemnite : Céphalopode, rostrum fossilisé." },
        { difficulte: "moyen", nom_commun: "Oursin fossile", nom_scientifique: "Echinoidea", imageQuery: "fossil echinoid", indice: "Test rond à plaques", description: "Test calcaire d’échinide, souvent dans la craie.", explication: "Oursin fossile : Fréquent dans la craie." },
        { difficulte: "difficile", nom_commun: "Graptolite", nom_scientifique: "Graptolithina", imageQuery: "graptolite fossil", indice: "Traits / dentelles sur schiste", description: "Colonies en lignes ou zigzags sur schistes noirs.", explication: "Graptolite : Fossile stratigraphique du Paléozoïque." },
        { difficulte: "difficile", nom_commun: "Crinoïde", nom_scientifique: "Crinoidea", imageQuery: "crinoid fossil", indice: "Tige en « empilement »", description: "Segments de tige en colonne, « lys de mer ».", explication: "Crinoïde : Échinoderme fixe, tige fossilisée." },
      ],
    },
    {
      id: "vertebres",
      label: "Vertébrés",
      items: [
        { difficulte: "facile", nom_commun: "Dent de requin", nom_scientifique: "Lamniformes", imageQuery: "shark tooth fossil", indice: "Triangle tranchant", description: "Dent triangulaire fossilisée, émail brillant.", explication: "Dent de requin : Fossile très courant." },
        { difficulte: "facile", nom_commun: "Os de dinosaure", nom_scientifique: "Dinosauria", imageQuery: "dinosaur bone fossil", indice: "Os massif pétrifié", description: "Fragment osseux fossilisé de grand reptile.", explication: "Os de dinosaure : Vertébré mésozoïque." },
        { difficulte: "moyen", nom_commun: "Ichthyosaure", nom_scientifique: "Ichthyosauria", imageQuery: "ichthyosaur fossil", indice: "Reptile marin en forme de dauphin", description: "Squelette de reptile marin hydrodynamique.", explication: "Ichthyosaure : Reptile marin du Mésozoïque." },
        { difficulte: "moyen", nom_commun: "Ptérosaure", nom_scientifique: "Pterosauria", imageQuery: "pterosaur fossil", indice: "Aile membraneuse fossile", description: "Reptile volant, longs doigts soutenant l’aile.", explication: "Ptérosaure : Reptile volant (pas un dinosaure)." },
        { difficulte: "difficile", nom_commun: "Archaeopteryx", nom_scientifique: "Archaeopteryx", imageQuery: "archaeopteryx fossil", indice: "Plumes + dents", description: "Fossile à plumes et caractères reptiliens.", explication: "Archaeopteryx : Fossile « entre » dinosaure et oiseau." },
        { difficulte: "difficile", nom_commun: "Mégalodon (dent)", nom_scientifique: "Otodus megalodon", imageQuery: "megalodon tooth", indice: "Énorme dent dentelée", description: "Très grande dent de requin fossile.", explication: "Mégalodon : Dent géante de requin éteint." },
      ],
    },
    {
      id: "plantes-traces",
      label: "Plantes & traces",
      items: [
        { difficulte: "facile", nom_commun: "Empreinte de fougère", nom_scientifique: "Pteridophyta", imageQuery: "fern fossil", indice: "Feuille découpée sur schiste", description: "Empreinte de fronde de fougère sur roche.", explication: "Fougère fossile : Très fréquente au Carbonifère." },
        { difficulte: "moyen", nom_commun: "Tronc silicifié", nom_scientifique: "Petrified wood", imageQuery: "petrified wood", indice: "Bois devenu pierre", description: "Bois dont la matière a été remplacée par de la silice.", explication: "Bois pétrifié : Structure du bois encore visible." },
        { difficulte: "moyen", nom_commun: "Empreinte de pas", nom_scientifique: "Ichnite", imageQuery: "dinosaur footprint fossil", indice: "Trace de marche", description: "Empreinte de pas fossilisée dans un sédiment.", explication: "Ichnite : Trace fossile (comportement)." },
        { difficulte: "difficile", nom_commun: "Coprolithe", nom_scientifique: "Coprolite", imageQuery: "coprolite", indice: "Excrément fossilisé", description: "Matière fécale fossilisée, parfois avec restes de repas.", explication: "Coprolithe : Crotte fossile, précieuse pour la paléoécologie." },
        { difficulte: "difficile", nom_commun: "Ambre (inclusion)", nom_scientifique: "Amber", imageQuery: "amber insect fossil", indice: "Insecte dans la résine", description: "Résine fossilisée piégeant parfois un insecte.", explication: "Ambre : Résine fossilisée, inclusions célèbres." },
        { difficulte: "difficile", nom_commun: "Stromatolite", nom_scientifique: "Stromatolite", imageQuery: "stromatolite", indice: "Couches en chou-fleur / dôme", description: "Structure laminée produite par des tapis microbiens.", explication: "Stromatolite : Parmi les plus anciens indices de vie." },
      ],
    },
  ],
});

writeQuiz(bebes);
writeQuiz(feuilles);
writeQuiz(nuages);
writeQuiz(constellations);
writeQuiz(fossiles);

// Patch catalog.json
const catalogPath = join(dataDir, "catalog.json");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));

function findNode(nodes, id) {
  for (const n of nodes || []) {
    if (n.id === id) return n;
    const nested = findNode(n.children, id);
    if (nested) return nested;
  }
  return null;
}

const animaux = findNode(catalog.domains, "animaux");
const plantes = findNode(catalog.domains, "plantes");
const terre = findNode(catalog.domains, "sciences-terre");

if (animaux && !animaux.children.some((c) => c.id === "bebes-animaux")) {
  animaux.children.push({
    id: "bebes-animaux",
    nom: "Bébés animaux",
    fichier: "data/bebes-animaux.json",
    description: "Photo d’un petit : retrouve le nom du bébé.",
    regions: ["monde"],
  });
}

if (plantes && !plantes.children.some((c) => c.id === "feuilles-arbres")) {
  plantes.children.push({
    id: "feuilles-arbres",
    nom: "Feuilles d’arbres",
    fichier: "data/feuilles-arbres.json",
    description: "Reconnaître un arbre uniquement par sa feuille.",
    regions: ["france", "monde"],
  });
}

if (terre) {
  if (!terre.children.some((c) => c.id === "nuages")) {
    terre.children.push({
      id: "nuages",
      nom: "Nuages",
      fichier: "data/nuages.json",
      description: "Types de nuages : cumulus, cirrus, cumulonimbus…",
      regions: ["monde"],
    });
  }
  if (!terre.children.some((c) => c.id === "constellations")) {
    terre.children.push({
      id: "constellations",
      nom: "Constellations",
      fichier: "data/constellations.json",
      description: "Reconnaître les constellations sur une carte du ciel.",
      regions: ["monde"],
    });
  }
  if (!terre.children.some((c) => c.id === "fossiles")) {
    terre.children.push({
      id: "fossiles",
      nom: "Fossiles",
      fichier: "data/fossiles.json",
      description: "Ammonites, trilobites, dents et empreintes fossiles.",
      regions: ["monde"],
    });
  }
  terre.description = "Rochers, minéraux, nuages, constellations, fossiles…";
}

writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log("updated catalog.json");
