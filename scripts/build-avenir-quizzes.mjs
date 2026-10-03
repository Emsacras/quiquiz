/**
 * Génère les 7 quiz « à venir » + capitales/drapeaux dérivés de pays-monde.
 * Usage: node scripts/build-avenir-quizzes.mjs
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
  const ranked = others
    .map((n) => ({ n, k: hash(`${seed}|${n}`) }))
    .sort((a, b) => a.k - b.k);
  return ranked.slice(0, 3).map((x) => x.n);
}

function shuffleOptions(options, seed) {
  return [...options]
    .map((n, i) => ({ n, k: hash(`${seed}|opt|${i}|${n}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.n);
}

function buildQuiz({ id, categorie, description, groups }) {
  const groupes = groups.map((group) => {
    const names = group.items.map((item) => item.nom_commun);
    const questions = group.items.map((item, index) => {
      const qid = `${group.id}${index + 1}`;
      let distractors = pickDistractors(names, item.nom_commun, qid);
      if (distractors.length < 3) {
        const pool = groups.flatMap((g) => g.items.map((i) => i.nom_commun));
        distractors = pickDistractors(pool, item.nom_commun, qid);
      }
      const options = shuffleOptions([item.nom_commun, ...distractors].slice(0, 4), qid);
      return {
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

const insectes = buildQuiz({
  id: "insectes-france",
  categorie: "Insectes de France",
  description: "Coléoptères, papillons, abeilles et autres insectes courants de France.",
  groups: [
    {
      id: "coleopteres",
      label: "Coléoptères",
      items: [
        { difficulte: "facile", nom_commun: "Coccinelle à sept points", nom_scientifique: "Coccinella septempunctata", indice: "Rouge à 7 points noirs", description: "Coléoptère hémisphérique rouge vif, sept points noirs sur les élytres.", explication: "Coccinelle à sept points : Rouge à points noirs, prédatrice de pucerons, très familière des jardins." },
        { difficulte: "facile", nom_commun: "Hanneton commun", nom_scientifique: "Melolontha melolontha", indice: "Gros scarabée brun du soir", description: "Scarabée brun massif, antennes en éventail, vol lourd au crépuscule.", explication: "Hanneton commun : Gros scarabée brun, antennes lamellées. Les adultes sortent en masse au printemps." },
        { difficulte: "facile", nom_commun: "Lucane cerf-volant", nom_scientifique: "Lucanus cervus", indice: "Mandibules en bois de cerf", description: "Très grand coléoptère noir-brun ; le mâle a d’énormes mandibules palmées.", explication: "Lucane cerf-volant : Plus grand coléoptère d’Europe. Le mâle porte des mandibules en forme de bois de cerf." },
        { difficulte: "moyen", nom_commun: "Carabe doré", nom_scientifique: "Carabus auratus", indice: "Vert métallique brillant", description: "Carabe allongé au vert métallique doré, souvent sous les pierres humides.", explication: "Carabe doré : Prédateur vert métallique des jardins et lisières, actif surtout la nuit." },
        { difficulte: "moyen", nom_commun: "Cétoine dorée", nom_scientifique: "Cetonia aurata", indice: "Vert cuivré sur les fleurs", description: "Scarabée vert métallique qui se nourrit de pollen et de pétales.", explication: "Cétoine dorée : Scarabée brillant des fleurs, souvent pris pour un scarabée « bijou »." },
        { difficulte: "moyen", nom_commun: "Capricorne du chêne", nom_scientifique: "Cerambyx cerdo", indice: "Longues antennes, corps noir", description: "Grand longicorne noir, antennes très longues, lié aux chênes âgés.", explication: "Capricorne du chêne : Longicorne imposant des vieux chênes ; protégé en Europe." },
        { difficulte: "difficile", nom_commun: "Bupreste du pin", nom_scientifique: "Buprestis octoguttata", indice: "Élytres bleus à taches jaunes", description: "Bupreste allongé, bleu-vert métallique à taches jaunes, sur les pins.", explication: "Bupreste du pin : Coléoptère xylophage des pins, aux reflets métalliques et taches claires." },
        { difficulte: "difficile", nom_commun: "Silphe noir", nom_scientifique: "Silpha atrata", indice: "Plat, noir, nécrophage", description: "Coléoptère noir aplati, souvent près de cadavres ou de champignons.", explication: "Silphe noir : Nécrophage discret, corps plat et antennes coudées." },
        { difficulte: "difficile", nom_commun: "Geotrupe stercoraire", nom_scientifique: "Geotrupes stercorarius", indice: "Scarabaeidé bleu-noir des bouses", description: "Scarabée trapu bleu-noir métallique, actif autour des crottins.", explication: "Geotrupe stercoraire : « Bousier » des prairies, reflets bleutés sous la lumière." },
        { difficulte: "moyen", nom_commun: "Dytique bordé", nom_scientifique: "Dytiscus marginalis", indice: "Gros nageur jaune-brun", description: "Grand coléoptère aquatique ovale, bord jaune sur le thorax et les élytres.", explication: "Dytique bordé : Prédateur aquatique puissant des mares et étangs." },
        { difficulte: "facile", nom_commun: "Charançon du chêne", nom_scientifique: "Curculio glandium", indice: "Long rostre sur gland", description: "Petit charançon brun au rostre très long, pond dans les glands.", explication: "Charançon du chêne : Son long « museau » perce les glands pour y pondre." },
        { difficulte: "moyen", nom_commun: "Staphylin odorant", nom_scientifique: "Ocypus olens", indice: "Élytres courts, abdomen mobile", description: "Grand staphylin noir, élytres courts laissant voir un abdomen flexible.", explication: "Staphylin odorant : Prédateur nocturne ; lève l’abdomen en menace et dégage une odeur." },
      ],
    },
    {
      id: "lepidopteres",
      label: "Lépidoptères",
      items: [
        { difficulte: "facile", nom_commun: "Paon-du-jour", nom_scientifique: "Aglais io", indice: "Ocelles bleus sur ailes", description: "Papillon aux ailes rouge-brun marquées de grands ocelles bleutés.", explication: "Paon-du-jour : Ocelles « yeux de paon » sur les ailes, très commun au jardin." },
        { difficulte: "facile", nom_commun: "Vulcain", nom_scientifique: "Vanessa atalanta", indice: "Bandes rouges et blanches", description: "Ailes noires traversées d’une bande rouge, taches blanches à l’apex.", explication: "Vulcain : Migrateur familier, attire par les fruits murissants et le buddleia." },
        { difficulte: "facile", nom_commun: "Piéride du chou", nom_scientifique: "Pieris brassicae", indice: "Blanc à taches noires", description: "Papillon blanc à nervures sombres et taches noires sur les ailes antérieures.", explication: "Piéride du chou : Très fréquente ; chenilles sur choux et crucifères." },
        { difficulte: "moyen", nom_commun: "Flambé", nom_scientifique: "Iphiclides podalirius", indice: "Queues et bandes jaunes", description: "Grand papillon jaune pâle à bandes noires et longues queues aux ailes postérieures.", explication: "Flambé : Papilionidé des vergers et lisières, queues élégantes." },
        { difficulte: "moyen", nom_commun: "Machaon", nom_scientifique: "Papilio machaon", indice: "Jaune et noir, point rouge", description: "Grand papillon jaune rayé de noir, ocelle rouge sur l’aile postérieure.", explication: "Machaon : Classic des prairies ; chenille sur ombellifères (fenouil, carotte sauvage)." },
        { difficulte: "moyen", nom_commun: "Citron", nom_scientifique: "Gonepteryx rhamni", indice: "Ailes en feuille jaune", description: "Ailes jaune citron (mâle) en forme de feuille, sans taches voyantes.", explication: "Citron : Hivernant précoce, souvent le premier papillon du printemps." },
        { difficulte: "difficile", nom_commun: "Petit nacré", nom_scientifique: "Issoria lathonia", indice: "Dessous argenté nacré", description: "Nymphalidé orange à taches noires ; dessous marqué de taches nacrées.", explication: "Petit nacré : Migrateur des friches et cultures, dessous très caractéristique." },
        { difficulte: "difficile", nom_commun: "Sylvain azuré", nom_scientifique: "Limenitis reducta", indice: "Bandes blanches sur fond brun", description: "Ailes brun-noir traversées de bandes blanches, reflets bleutés.", explication: "Sylvain azuré : Forestier du sud et de l’est, vols planés entre les clairières." },
        { difficulte: "difficile", nom_commun: "Zygène de la filipendule", nom_scientifique: "Zygaena filipendulae", indice: "Rouge et noir métallique", description: "Petite zygène noire à taches rouges, antennes épaisses, vol lourd.", explication: "Zygène de la filipendule : Aposématique (couleurs d’avertissement), sur prairies fleuries." },
        { difficulte: "moyen", nom_commun: "Moro-sphinx", nom_scientifique: "Macroglossum stellatarum", indice: "Vol du colibri devant fleurs", description: "Sphinx diurne au vol stationnaire, longue trompe, ailes floues en mouvement.", explication: "Moro-sphinx : « Colibri européen », butine en vol sur buddleia et pétunias." },
        { difficulte: "facile", nom_commun: "Belle-dame", nom_scientifique: "Vanessa cardui", indice: "Orange saumon migrateur", description: "Ailes orange saumon tachetées de noir et de blanc, migrateur mondial.", explication: "Belle-dame : Migrateur abondant certaines années, chenille sur chardons." },
        { difficulte: "moyen", nom_commun: "Robert-le-Diable", nom_scientifique: "Polygonia c-album", indice: "Ailes découpées en C blanc", description: "Ailes découpées irrégulièrement, dessous brun avec un C blanc.", explication: "Robert-le-Diable : Contour irrégulier et C blanc sous l’aile postérieure." },
      ],
    },
    {
      id: "hymenopteres",
      label: "Hyménoptères",
      items: [
        { difficulte: "facile", nom_commun: "Abeille domestique", nom_scientifique: "Apis mellifera", indice: "Ouvrière rayée du rucher", description: "Abeille socialisée, abdomen rayé, corbeilles de pollen sur les pattes.", explication: "Abeille domestique : Pollinisateur majeur, colonies en ruche." },
        { difficulte: "facile", nom_commun: "Bourdon terrestre", nom_scientifique: "Bombus terrestris", indice: "Gros, jaune-noir, cul blanc", description: "Bourdon trapu, bandes jaunes et extrémité blanche de l’abdomen.", explication: "Bourdon terrestre : Très commun ; butine tôt le matin, même par temps frais." },
        { difficulte: "facile", nom_commun: "Guêpe commune", nom_scientifique: "Vespula vulgaris", indice: "Noir et jaune, taille fine", description: "Guêpe sociale jaune et noire, face marquée, nid papier.", explication: "Guêpe commune : Nest souvent dans le sol ou les combles ; attirée par le sucre." },
        { difficulte: "moyen", nom_commun: "Frelon européen", nom_scientifique: "Vespa crabro", indice: "Plus grand, roux et jaune", description: "Grande guêpe sociale, thorax roux, abdomen jaune à bandes noires.", explication: "Frelon européen : Plus grand Vespidae d’Europe, moins agressif que sa réputation." },
        { difficulte: "moyen", nom_commun: "Frelon asiatique", nom_scientifique: "Vespa velutina", indice: "Presque noir, pattes jaunes", description: "Frelon sombre, quatrième segment abdominal jaune orangé, pattes jaunes.", explication: "Frelon asiatique : Espèce invasive ; prédateur des abeilles domestiques." },
        { difficulte: "moyen", nom_commun: "Fourmi rousse des bois", nom_scientifique: "Formica rufa", indice: "Dômes d’aiguilles en forêt", description: "Fourmi rougeâtre construisant de grands dômes de végétaux en forêt.", explication: "Fourmi rousse des bois : Colonies impressionnantes, utile contre certains ravageurs." },
        { difficulte: "difficile", nom_commun: "Osmie cornue", nom_scientifique: "Osmia cornuta", indice: "Abeille solitaire des tiges", description: "Abeille solitaire trapue, mâle cornu, niche dans les cavités.", explication: "Osmie cornue : Pollinisatrice précoce des fruitiers, souvent dans les hôtels à insectes." },
        { difficulte: "difficile", nom_commun: "Sirex géant", nom_scientifique: "Urocerus gigas", indice: "Longue tarière, jaune-noir", description: "Grande « guêpe du bois » jaune et noire, tarière des femelles très longue.", explication: "Sirex géant : Symphyte des conifères ; la tarière pond dans le bois." },
        { difficulte: "difficile", nom_commun: "Chrysis ignite", nom_scientifique: "Chrysis ignita", indice: "Guêpe-coucou métallique", description: "Petite guêpe parasitoïde au corps rouge-vert métallique brillant.", explication: "Chrysis ignita : Guêpe-coucou aux reflets de joyau, parasite d’autres hyménoptères." },
        { difficulte: "moyen", nom_commun: "Tenthrède de la rose", nom_scientifique: "Arge ochropus", indice: "Larves sur rosiers", description: "Symphyte dont les larves défolient les rosiers en groupe.", explication: "Tenthrède de la rose : « Fausse chenille » des rosiers, souvent confondue avec un papillon." },
      ],
    },
    {
      id: "dipteres",
      label: "Diptères",
      items: [
        { difficulte: "facile", nom_commun: "Mouche domestique", nom_scientifique: "Musca domestica", indice: "Grise, près des maisons", description: "Mouche grise commune, yeux composés rouges, fréquente les habitations.", explication: "Mouche domestique : Cosmopolite, associée aux déchets et aliments." },
        { difficulte: "facile", nom_commun: "Syrphe ceinturé", nom_scientifique: "Episyrphus balteatus", indice: "Fausse guêpe des fleurs", description: "Syrphe à abdomen rayé noir et jaune orange, mime une guêpe.", explication: "Syrphe ceinturé : Mimétisme de guêpe ; larves prédatrices de pucerons." },
        { difficulte: "moyen", nom_commun: "Taon des bovins", nom_scientifique: "Tabanus bovinus", indice: "Gros, yeux bariolés", description: "Grand diptère piqueur, corps robuste, yeux souvent irisés.", explication: "Taon des bovins : Femelles hématophages, douloureux près des troupeaux." },
        { difficulte: "moyen", nom_commun: "Tipule des prairies", nom_scientifique: "Tipula paludosa", indice: "Longues pattes, « cousin »", description: "Grand diptère frêle aux très longues pattes, confondu avec un moustique géant.", explication: "Tipule des prairies : Inoffensive ; larves (« vers gris ») dans les pelouses." },
        { difficulte: "difficile", nom_commun: "Bombyle du lierre", nom_scientifique: "Bombylius major", indice: "Poilu, trompe longue", description: "Diptère duveteux au vol stationnaire, longue trompe pour butiner.", explication: "Bombyle du lierre : Aspect de bourdon miniature, parasitoïde d’abeilles solitaires." },
        { difficulte: "difficile", nom_commun: "Asile frelon", nom_scientifique: "Asilus crabroniformis", indice: "Prédateur jaune-noir", description: "Asilidé trapu jaune et noir, chasse d’autres insectes au sol.", explication: "Asile frelon : Mouche prédatrice impressionnante des landes et pelouses sèches." },
        { difficulte: "moyen", nom_commun: "Moustique commun", nom_scientifique: "Culex pipiens", indice: "Fin, pique le soir", description: "Petit diptère piqueur, corps fin, repos ailes repliées le long du corps.", explication: "Moustique commun : Espèce urbaine abondante ; femelles hématophages." },
        { difficulte: "facile", nom_commun: "Mouche à fruits", nom_scientifique: "Drosophila melanogaster", indice: "Minuscule sur fruits mûrs", description: "Très petite mouche jaunâtre attirée par fruits et vinaigre.", explication: "Mouche à fruits : Modèle de labo ; envahit cuisines dès que les fruits fermentent." },
      ],
    },
    {
      id: "autres",
      label: "Autres insectes",
      items: [
        { difficulte: "facile", nom_commun: "Criquet migrateur", nom_scientifique: "Locusta migratoria", indice: "Grand orthoptère sauteur", description: "Grand criquet aux ailes longues, formes solitaire ou grégaire.", explication: "Criquet migrateur : Orthoptère puissant ; plus rare sous forme grégaire en France." },
        { difficulte: "facile", nom_commun: "Mante religieuse", nom_scientifique: "Mantis religiosa", indice: "Pattes ravisseuses jointes", description: "Insecte allongé vert ou brun, pattes antérieures pliées en « prière ».", explication: "Mante religieuse : Prédatrice ambuscade ; femelle parfois cannibale." },
        { difficulte: "moyen", nom_commun: "Perce-oreille commun", nom_scientifique: "Forficula auricularia", indice: "Pinces à l’abdomen", description: "Dermaptère brun, cerques en pinces à l’extrémité de l’abdomen.", explication: "Perce-oreille commun : Nocturne, se cache le jour sous écorces et pots." },
        { difficulte: "moyen", nom_commun: "Libellule déprimée", nom_scientifique: "Libellula depressa", indice: "Abdomen plat, mâle bleu", description: "Libellule au corps large et aplati ; mâle bleuté, femelle jaunâtre.", explication: "Libellule déprimée : Fréquente mares ensoleillées ; abdomen « déprimé » caractéristique." },
        { difficulte: "difficile", nom_commun: "Agrion élégant", nom_scientifique: "Ischnura elegans", indice: "Petit damselfly bicolore", description: "Petit zygoptère fin, thorax vert-bleu, abdomen souvent bicolore.", explication: "Agrion élégant : Demoiselle courante des eaux calmes, formes colorées variables." },
        { difficulte: "difficile", nom_commun: "Phrygane commune", nom_scientifique: "Phryganea grandis", indice: "Fourreau de débris", description: "Trichoptère dont la larve construit un fourreau de débris végétaux.", explication: "Phrygane commune : « Porte-bois » aquatique ; adultes ressemblent à des papillons ternes." },
        { difficulte: "moyen", nom_commun: "Cigale plébéienne", nom_scientifique: "Lyristes plebejus", indice: "Chant d’été méditerranéen", description: "Grande cigale brune, chant strident des pins et garrigues du sud.", explication: "Cigale plébéienne : Symbole de l’été méridional ; larves souterraines longues." },
        { difficulte: "facile", nom_commun: "Puceron vert du pêcher", nom_scientifique: "Myzus persicae", indice: "Colonies sur jeunes pousses", description: "Petit puceron vert à rose, colonies denses sous les feuilles.", explication: "Puceron vert du pêcher : Ravageur polyphage ; base alimentaire de nombreuses coccinelles." },
        { difficulte: "difficile", nom_commun: "Empuse pennée", nom_scientifique: "Empusa pennata", indice: "Mante couronnée du sud", description: "Mante élancée à crête céphalique, prothorax allongé, sud de la France.", explication: "Empuse pennée : Plus rare que la mante religieuse, silhouette très graphique." },
        { difficulte: "moyen", nom_commun: "Gerris lacustre", nom_scientifique: "Gerris lacustris", indice: "Patineur à la surface", description: "Punaise allongée qui « marche » sur l’eau grâce à ses longues pattes.", explication: "Gerris lacustre : Patineur des mares, se nourrit d’insectes tombés à la surface." },
      ],
    },
  ],
});

const mammiferes = buildQuiz({
  id: "mammiferes-france",
  categorie: "Mammifères de France",
  description: "Carnivores, ongulés, rongeurs, chauves-souris et mammifères marins de France.",
  groups: [
    {
      id: "carnivores",
      label: "Carnivores",
      items: [
        { difficulte: "facile", nom_commun: "Renard roux", nom_scientifique: "Vulpes vulpes", indice: "Queue touffue, robe rousse", description: "Canidé roux à queue touffue souvent tipée de blanc, très adaptable.", explication: "Renard roux : Carnivore opportuniste des campagnes et périurbains." },
        { difficulte: "facile", nom_commun: "Blaireau européen", nom_scientifique: "Meles meles", indice: "Masque noir et blanc", description: "Mustélidé trapu, tête blanche à bandes noires, vie en clans.", explication: "Blaireau européen : Fouisseur nocturne ; terriers complexes (blaireautières)." },
        { difficulte: "facile", nom_commun: "Loutre d'Europe", nom_scientifique: "Lutra lutra", indice: "Aquatique, queue épaisse", description: "Mustélidé aquatique au pelage brun, queue épaisse, nage fluide.", explication: "Loutre d'Europe : Indicateur de rivières riches en poissons ; en reprise." },
        { difficulte: "moyen", nom_commun: "Martre des pins", nom_scientifique: "Martes martes", indice: "Bavette jaune, forestière", description: "Mustélidé arboricole, gorge jaune crème, queue longue et touffue.", explication: "Martre des pins : Agile grimpeuse des forêts de conifères et mixtes." },
        { difficulte: "moyen", nom_commun: "Fouine", nom_scientifique: "Martes foina", indice: "Bavette blanche, près des maisons", description: "Proche de la martre mais bavette blanche bifide, plus anthropophile.", explication: "Fouine : Fréquente combles et hangars ; se distingue par la gorge blanche." },
        { difficulte: "moyen", nom_commun: "Chat forestier", nom_scientifique: "Felis silvestris", indice: "Queue annelée épaisse", description: "Félin sauvage gris-brun, queue touffue annelée à bout noir arrondi.", explication: "Chat forestier : Plus massif que le chat haret ; queue caractéristique." },
        { difficulte: "difficile", nom_commun: "Lynx boréal", nom_scientifique: "Lynx lynx", indice: "Pinceaux d’oreilles, courte queue", description: "Grand félin tacheté, oreilles à pinceaux, queue courte tipée de noir.", explication: "Lynx boréal : Réintroduit dans l’est ; discret et surtout nocturne." },
        { difficulte: "difficile", nom_commun: "Vison d'Europe", nom_scientifique: "Mustela lutreola", indice: "Mustélidé rare des zones humides", description: "Petit mustélidé brun sombre, lèvre supérieure blanche, très menacé.", explication: "Vison d'Europe : Parmi les mammifères les plus menacés d’Europe." },
        { difficulte: "moyen", nom_commun: "Hermine", nom_scientifique: "Mustela erminea", indice: "Noir au bout de la queue", description: "Petit mustélidé ; en hiver robe blanche avec bout de queue toujours noir.", explication: "Hermine : Chasse campagnols ; queue noire même en livrée blanche." },
        { difficulte: "facile", nom_commun: "Belette", nom_scientifique: "Mustela nivalis", indice: "Plus petite, pas de noir en queue", description: "Plus petit carnivore d’Europe, corps très allongé, queue courte sans noir.", explication: "Belette : Minuscule et nerveuse ; se faufile dans les galeries de rongeurs." },
      ],
    },
    {
      id: "ongules",
      label: "Ongulés",
      items: [
        { difficulte: "facile", nom_commun: "Chevreuil", nom_scientifique: "Capreolus capreolus", indice: "Petit cervidé, miroir blanc", description: "Petit cervidé élégant, croupe blanche (« miroir »), bois courts chez le mâle.", explication: "Chevreuil : Très abondant ; aboiement sec en alerte." },
        { difficulte: "facile", nom_commun: "Cerf élaphe", nom_scientifique: "Cervus elaphus", indice: "Grands bois, brame d’automne", description: "Grand cervidé ; mâle porte des bois ramifiés et brame à l’automne.", explication: "Cerf élaphe : Plus grand cervidé de France métropolitaine." },
        { difficulte: "facile", nom_commun: "Sanglier", nom_scientifique: "Sus scrofa", indice: "Corps massif, soies sombres", description: "Suidé massif au groin discöïde, soies sombres, vie en compagnies.", explication: "Sanglier : Omnivore ; labours de sol typiques (boutis)." },
        { difficulte: "moyen", nom_commun: "Chamois", nom_scientifique: "Rupicapra rupicapra", indice: "Crochets, bandeau facial", description: "Bovidé de montagne, cornes en crochet, bandeau noir sur le visage.", explication: "Chamois : Agile sur les pentes ; Alpes et massifs élevés." },
        { difficulte: "moyen", nom_commun: "Bouquetin des Alpes", nom_scientifique: "Capra ibex", indice: "Cornes en sabre annelées", description: "Caprin de falaise, mâles aux très longues cornes annelées arquées.", explication: "Bouquetin des Alpes : Sauvé de l’extinction ; falaises alpines." },
        { difficulte: "moyen", nom_commun: "Mouflon méditerranéen", nom_scientifique: "Ovis aries musimon", indice: "Cornes en spirale, selle claire", description: "Ovin sauvage introduit, mâles à cornes spiralées et selle claire.", explication: "Mouflon méditerranéen : Présent en Corse et massifs continentaux." },
        { difficulte: "difficile", nom_commun: "Daim", nom_scientifique: "Dama dama", indice: "Bois aplatis en palette", description: "Cervidé tacheté, mâles aux bois palmés en forme de palette.", explication: "Daim : Souvent en parcs ; taches claires plus marquées l’été." },
        { difficulte: "difficile", nom_commun: "Isard", nom_scientifique: "Rupicapra pyrenaica", indice: "Chamois des Pyrénées", description: "Proche du chamois, endémique pyrénéen, robe plus claire en hiver.", explication: "Isard : Emblème des Pyrénées, cousin du chamois alpin." },
      ],
    },
    {
      id: "rongeurs",
      label: "Rongeurs et insectivores",
      items: [
        { difficulte: "facile", nom_commun: "Écureuil roux", nom_scientifique: "Sciurus vulgaris", indice: "Queue en panache, arboricole", description: "Rongeur arboricole roux à noir, grandes oreilles, queue touffue.", explication: "Écureuil roux : Diurne ; cache des noisettes pour l’hiver." },
        { difficulte: "facile", nom_commun: "Hérisson d'Europe", nom_scientifique: "Erinaceus europaeus", indice: "Dos de piquants", description: "Insectivore au dos couvert de piquants, se roule en boule.", explication: "Hérisson d'Europe : Allié du jardin ; mange limaces et insectes." },
        { difficulte: "facile", nom_commun: "Lapin de garenne", nom_scientifique: "Oryctolagus cuniculus", indice: "Oreilles moyennes, vie en terrier", description: "Léporidé social fouisseur, oreilles plus courtes que le lièvre.", explication: "Lapin de garenne : Vit en colonies ; oreilles sans bout noir marqué." },
        { difficulte: "moyen", nom_commun: "Lièvre d'Europe", nom_scientifique: "Lepus europaeus", indice: "Oreilles longues tipées de noir", description: "Plus grand que le lapin, oreilles longues à bout noir, gîte au sol.", explication: "Lièvre d'Europe : Solitaire, course rapide en terrain ouvert." },
        { difficulte: "moyen", nom_commun: "Castor d'Europe", nom_scientifique: "Castor fiber", indice: "Queue plate, barrages", description: "Grand rongeur aquatique, queue plate écailleuse, ingénieur des cours d’eau.", explication: "Castor d'Europe : Abat des arbres et crée des zones humides." },
        { difficulte: "moyen", nom_commun: "Muscardin", nom_scientifique: "Muscardinus avellanarius", indice: "Petit, roux, queue touffue", description: "Petit gliridé roux orangé, queue touffue, niche dans les fourrés.", explication: "Muscardin : Hibernant discret des haies et lisières." },
        { difficulte: "difficile", nom_commun: "Campagnol amphibie", nom_scientifique: "Arvicola sapidus", indice: "Gros campagnol des berges", description: "Campagnol de grande taille lié aux berges, nageur habile.", explication: "Campagnol amphibie : Menacé ; dépend de rivières bien végétalisées." },
        { difficulte: "difficile", nom_commun: "Crocidure musette", nom_scientifique: "Crocidura russula", indice: "Musaraigne à dents blanches", description: "Petite musaraigne à dents blanches, museau pointu, très active.", explication: "Crocidure musette : Insectivore ; dents blanches contrairement aux musaraignes rousses." },
        { difficulte: "moyen", nom_commun: "Loir gris", nom_scientifique: "Glis glis", indice: "Gris, queue longue touffue", description: "Gliridé gris argenté, grands yeux, queue touffue, nocturne.", explication: "Loir gris : Fréquente les combles ; hibernation longue." },
        { difficulte: "facile", nom_commun: "Taupe d'Europe", nom_scientifique: "Talpa europaea", indice: "Velours noir, taupinières", description: "Insectivore fouisseur au pelage noir velouté, pattes antérieures élargies.", explication: "Taupe d'Europe : Galeries et taupinières dans les prairies humides." },
      ],
    },
    {
      id: "chiropteres",
      label: "Chiroptères",
      items: [
        { difficulte: "facile", nom_commun: "Pipistrelle commune", nom_scientifique: "Pipistrellus pipistrellus", indice: "Petite, chasse près des lampadaires", description: "Très petite chauve-souris brune, fréquente villages et lisières.", explication: "Pipistrelle commune : La plus abondante ; chasse petits insectes en vol." },
        { difficulte: "moyen", nom_commun: "Grand rhinolophe", nom_scientifique: "Rhinolophus ferrumequinum", indice: "Nez en fer à cheval", description: "Chauve-souris au nez en fer à cheval, oreilles sans tragus libre.", explication: "Grand rhinolophe : Sensible au dérangement ; hiverne en grottes." },
        { difficulte: "moyen", nom_commun: "Oreillard roux", nom_scientifique: "Plecotus auritus", indice: "Oreilles énormes", description: "Chauve-souris aux oreilles très longues, presque jointes à la base.", explication: "Oreillard roux : Cueille les insectes posés sur le feuillage (gleaning)." },
        { difficulte: "difficile", nom_commun: "Grand murin", nom_scientifique: "Myotis myotis", indice: "Grande, museau clair", description: "Grande Myotis au museau rose, oreilles longues, chasse au sol.", explication: "Grand murin : Colonies en combles ; capture des coléoptères au sol." },
        { difficulte: "difficile", nom_commun: "Molosse de Cestoni", nom_scientifique: "Tadarida teniotis", indice: "Queue libre hors membrane", description: "Grande chauve-souris aux oreilles larges, queue dépassant la membrane.", explication: "Molosse de Cestoni : Espèce méditerranéenne, vol rapide en altitude." },
        { difficulte: "moyen", nom_commun: "Sérotine commune", nom_scientifique: "Eptesicus serotinus", indice: "Robuste, brune, urbaine", description: "Chauve-souris robuste brun sombre, fréquente les bâtiments.", explication: "Sérotine commune : Chasse hannetons et papillons de nuit près des villages." },
      ],
    },
    {
      id: "marins",
      label: "Marins et autres",
      items: [
        { difficulte: "facile", nom_commun: "Grand dauphin", nom_scientifique: "Tursiops truncatus", indice: "Bec court, gris, côtier", description: "Dauphin robuste au bec court, gris, fréquent près des côtes.", explication: "Grand dauphin : Observé sur les façades atlantique et méditerranéenne." },
        { difficulte: "moyen", nom_commun: "Marsouin commun", nom_scientifique: "Phocoena phocoena", indice: "Petit, sans bec marqué", description: "Petit cétacé sans bec proéminent, nageoire triangulaire.", explication: "Marsouin commun : Discret ; Manche et Atlantique nord." },
        { difficulte: "moyen", nom_commun: "Phoque veau-marin", nom_scientifique: "Phoca vitulina", indice: "Tête de chien, baies du nord", description: "Phoque aux narines en V, face « de chien », repos sur bancs de sable.", explication: "Phoque veau-marin : Colonies en baie de Somme et Manche." },
        { difficulte: "difficile", nom_commun: "Phoque gris", nom_scientifique: "Halichoerus grypus", indice: "Profil romain, plus grand", description: "Phoque plus grand, profil convexe (« nez romain »), taches irrégulières.", explication: "Phoque gris : Bretagne et Manche ; se distingue du veau-marin au profil." },
        { difficulte: "facile", nom_commun: "Dauphin commun", nom_scientifique: "Delphinus delphis", indice: "Sablier jaune sur le flanc", description: "Dauphin élancé au motif en sablier beige-jaune sur les flancs.", explication: "Dauphin commun : Bancs rapides au large des façades maritimes." },
        { difficulte: "moyen", nom_commun: "Ragondin", nom_scientifique: "Myocastor coypus", indice: "Gros rongeur aquatique introduit", description: "Gros rongeur semi-aquatique, moustaches blanches, queue ronde.", explication: "Ragondin : Introduit d’Amérique ; souvent confondu avec le castor (queue différente)." },
        { difficulte: "difficile", nom_commun: "Genette commune", nom_scientifique: "Genetta genetta", indice: "Queue annelée, tachetée", description: "Viverridé tacheté à longue queue annelée, surtout dans le sud-ouest.", explication: "Genette commune : Nocturne et arboricole ; silhouette de « petit félin tacheté »." },
      ],
    },
  ],
});

const arbres = buildQuiz({
  id: "arbres-france",
  categorie: "Arbres de France",
  description: "Feuillus, conifères, méditerranéens et fruitiers / ornement courant en France.",
  groups: [
    {
      id: "feuillus",
      label: "Feuillus",
      items: [
        { difficulte: "facile", nom_commun: "Chêne pédonculé", nom_scientifique: "Quercus robur", indice: "Glands portés par un long pédoncule", description: "Grand feuillu, feuilles lobées, glands sur un pédoncule allongé.", explication: "Chêne pédonculé : Essence emblématique des forêts et bocages." },
        { difficulte: "facile", nom_commun: "Hêtre", nom_scientifique: "Fagus sylvatica", indice: "Écorce lisse grise, feuilles ovales", description: "Tronc lisse gris argenté, feuilles ovales à bord ondulé, faînes.", explication: "Hêtre : Domine les hêtraies ; ombre dense au sol." },
        { difficulte: "facile", nom_commun: "Bouleau verruqueux", nom_scientifique: "Betula pendula", indice: "Écorce blanche, rameaux pendants", description: "Écorce blanche marquée de noir, ramilles pendantes, petites feuilles.", explication: "Bouleau verruqueux : Pionnier des sols pauvres et clairières." },
        { difficulte: "moyen", nom_commun: "Frêne commun", nom_scientifique: "Fraxinus excelsior", indice: "Bourgeons noirs, feuilles composées", description: "Grand arbre aux feuilles composées imparipennées, bourgeons noirs.", explication: "Frêne commun : Essence des sols frais ; menacé par la chalarose." },
        { difficulte: "moyen", nom_commun: "Érable sycomore", nom_scientifique: "Acer pseudoplatanus", indice: "Samares en hélicoptère", description: "Grand érable, feuilles à 5 lobes, fruits en double samare.", explication: "Érable sycomore : Fréquent en ville et lisières ; samares hélicoïdes." },
        { difficulte: "moyen", nom_commun: "Tilleul à grandes feuilles", nom_scientifique: "Tilia platyphyllos", indice: "Fleurs odorantes, bractée", description: "Grand feuillu, feuilles cordiformes, fleurs en cymes avec bractée.", explication: "Tilleul à grandes feuilles : Floraison parfumée, appréciée des abeilles." },
        { difficulte: "difficile", nom_commun: "Orme champêtre", nom_scientifique: "Ulmus minor", indice: "Feuilles asymétriques à la base", description: "Feuilles asymétriques à la base, écorce fissurée, souvent taillé en haie.", explication: "Orme champêtre : Décimé par la graphiose ; formes résistantes en haies." },
        { difficulte: "difficile", nom_commun: "Charme", nom_scientifique: "Carpinus betulus", indice: "Tronc cannelé, feuilles doubles dents", description: "Tronc musclé cannelé, feuilles ovales doublement dentées.", explication: "Charme : Souvent en charmilles ; bois très dur." },
        { difficulte: "moyen", nom_commun: "Peuplier tremble", nom_scientifique: "Populus tremula", indice: "Feuilles qui tremblent", description: "Feuilles orbiculaires au pétiole aplati, frémissent au moindre vent.", explication: "Peuplier tremble : Pionnier ; feuillage toujours en mouvement." },
        { difficulte: "facile", nom_commun: "Châtaignier", nom_scientifique: "Castanea sativa", indice: "Bogue épineuse, feuilles dentées", description: "Grand arbre, longues feuilles dentées, fruits dans une bogue épineuse.", explication: "Châtaignier : Cultivé pour ses fruits ; forêts du Massif central et du sud." },
        { difficulte: "difficile", nom_commun: "Aulne glutineux", nom_scientifique: "Alnus glutinosa", indice: "Chatons un bois de rivière", description: "Arbre des berges, chatons, « cônes » ligneux persistants.", explication: "Aulne glutineux : Fixe les berges ; racines souvent dans l’eau." },
        { difficulte: "moyen", nom_commun: "Merisier", nom_scientifique: "Prunus avium", indice: "Fleurs blanches, fruits rouges", description: "Grand prunus forestier, fleurs blanches en corymbes, cerises petites.", explication: "Merisier : Ancêtre des cerisiers cultivés ; excellent bois." },
      ],
    },
    {
      id: "coniferes",
      label: "Conifères",
      items: [
        { difficulte: "facile", nom_commun: "Pin sylvestre", nom_scientifique: "Pinus sylvestris", indice: "Écorce orangée en cime", description: "Pin à écorce saumonée en haut du tronc, aiguilles par deux.", explication: "Pin sylvestre : Très répandu ; cime souvent asymétrique." },
        { difficulte: "facile", nom_commun: "Sapin pectiné", nom_scientifique: "Abies alba", indice: "Aiguilles plates en peigne", description: "Aiguilles plates disposées en peigne, cônes dressés qui se désarticulent.", explication: "Sapin pectiné : Essence des montagnes ; cônes dressés contrairement à l’épicéa." },
        { difficulte: "facile", nom_commun: "Épicéa commun", nom_scientifique: "Picea abies", indice: "Cônes pendants, aiguilles pointues", description: "Conifère à aiguilles pointues sur coussinets, cônes pendants.", explication: "Épicéa commun : Souvent planté ; cônes qui tombent entiers." },
        { difficulte: "moyen", nom_commun: "Mélèze d'Europe", nom_scientifique: "Larix decidua", indice: "Conifère qui perd ses aiguilles", description: "Seul grand conifère européen caduc, aiguilles en fascicules souples.", explication: "Mélèze d'Europe : Jaunit et perd ses aiguilles en automne." },
        { difficulte: "moyen", nom_commun: "If commun", nom_scientifique: "Taxus baccata", indice: "Arilles rouges, bois toxique", description: "Conifère sombre, « baies » rouges (arilles), bois et feuillage toxiques.", explication: "If commun : Longévité extrême ; arilles rouges non toxiques, graines toxiques." },
        { difficulte: "moyen", nom_commun: "Genévrier commun", nom_scientifique: "Juniperus communis", indice: "Aiguilles piquantes, baies bleues", description: "Arbuste à aiguilles acérées par trois, cônes charnus bleuâtres.", explication: "Genévrier commun : Landés et pelouses ; « baies » utilisées en cuisine." },
        { difficulte: "difficile", nom_commun: "Pin à crochets", nom_scientifique: "Pinus uncinata", indice: "Pin de montagne, cônes crochus", description: "Pin montagnard, cônes asymétriques à écailles crochues.", explication: "Pin à crochets : Pyrénées et Alpes ; forme des peuplements d’altitude." },
        { difficulte: "difficile", nom_commun: "Douglas", nom_scientifique: "Pseudotsuga menziesii", indice: "Cônes à bractées trifides", description: "Grand conifère introduit, cônes pendants à bractées en « queue de souris ».", explication: "Douglas : Plantation forestière majeure ; bractées trifides typiques." },
        { difficulte: "moyen", nom_commun: "Cèdre de l'Atlas", nom_scientifique: "Cedrus atlantica", indice: "Aiguilles en rosettes, ports étalé", description: "Grand cèdre à aiguilles courtes en bouquets, cime tabulaire avec l’âge.", explication: "Cèdre de l'Atlas : Ornement et reboisement ; parfum résineux." },
        { difficulte: "facile", nom_commun: "Cyprès sempervirens", nom_scientifique: "Cupressus sempervirens", indice: "Colonne sombre méditerranéenne", description: "Conifère colonnaire vert sombre, symbole des cimetières et jardins du sud.", explication: "Cyprès sempervirens : Silhouette en fuseau très reconnaissable." },
      ],
    },
    {
      id: "mediterraneens",
      label: "Méditerranéens",
      items: [
        { difficulte: "facile", nom_commun: "Olivier", nom_scientifique: "Olea europaea", indice: "Feuilles argentées, olives", description: "Arbre tortueux au feuillage persistant gris-vert, fruits oléagineux.", explication: "Olivier : Emblème méditerranéen ; cultures en terrasses." },
        { difficulte: "facile", nom_commun: "Chêne vert", nom_scientifique: "Quercus ilex", indice: "Feuilles persistantes coriaces", description: "Chêne sempervirent, feuilles coriaces parfois épineuses, glands.", explication: "Chêne vert : Yeuse des garrigues et collines calcaires." },
        { difficulte: "moyen", nom_commun: "Chêne-liège", nom_scientifique: "Quercus suber", indice: "Écorce de liège épaisse", description: "Chêne à écorce liégeuse très épaisse, feuilles persistantes.", explication: "Chêne-liège : Récolté pour le liège ; Maures et Corse." },
        { difficulte: "moyen", nom_commun: "Pin parasol", nom_scientifique: "Pinus pinea", indice: "Cime en ombrelle, pignons", description: "Pin à cime étalée en parasol, gros cônes à pignons comestibles.", explication: "Pin parasol : Silhouette côtière emblématique du Midi." },
        { difficulte: "difficile", nom_commun: "Arbousier", nom_scientifique: "Arbutus unedo", indice: "Fruits granuleux orange-rouge", description: "Arbre ou arbuste, feuilles persistantes, fruits granulés orange à rouge.", explication: "Arbousier : « Fraisier en arbre » des maquis ; fleurs et fruits ensemble." },
        { difficulte: "difficile", nom_commun: "Micocoulier de Provence", nom_scientifique: "Celtis australis", indice: "Fruits noirs, feuilles asymétriques", description: "Arbre des places du sud, feuilles asymétriques, petites drupes noires.", explication: "Micocoulier de Provence : Ombrage urbain méditerranéen." },
        { difficulte: "moyen", nom_commun: "Figuier", nom_scientifique: "Ficus carica", indice: "Feuilles palmées, sycones", description: "Feuilles larges lobées, latex, fruits charnus (sycones).", explication: "Figuier : Cultivé et subspontané dans le Midi." },
        { difficulte: "facile", nom_commun: "Laurier-sauce", nom_scientifique: "Laurus nobilis", indice: "Feuilles aromatiques de cuisine", description: "Arbuste persistant aromatique, feuilles utilisées en cuisine.", explication: "Laurier-sauce : Haies et jardins du sud ; ne pas confondre avec le laurier-rose." },
      ],
    },
    {
      id: "fruitiers",
      label: "Fruitiers et ornement",
      items: [
        { difficulte: "facile", nom_commun: "Pommier cultivé", nom_scientifique: "Malus domestica", indice: "Fleurs roses, pommes", description: "Arbre fruitier, fleurs blanc-rose, fruits charnus à pépins.", explication: "Pommier cultivé : Verger classique ; milliers de variétés." },
        { difficulte: "facile", nom_commun: "Poirier cultivé", nom_scientifique: "Pyrus communis", indice: "Fleurs blanches, poires", description: "Fruitier à fleurs blanches, fruits piriformes.", explication: "Poirier cultivé : Verger et jardins ; bois également prisé." },
        { difficulte: "moyen", nom_commun: "Noyer commun", nom_scientifique: "Juglans regia", indice: "Grandes feuilles composées, noix", description: "Grand arbre, feuilles composées odorantes, fruit dans une brou.", explication: "Noyer commun : Noix comestibles ; bois précieux." },
        { difficulte: "moyen", nom_commun: "Amandier", nom_scientifique: "Prunus dulcis", indice: "Floraison très précoce", description: "Prunus à floraison blanche très précoce, fruits à coque.", explication: "Amandier : Fleuri parfois dès janvier-février dans le Midi." },
        { difficulte: "difficile", nom_commun: "Néflier du Japon", nom_scientifique: "Eriobotrya japonica", indice: "Grandes feuilles, fruits d’hiver", description: "Persistant aux grandes feuilles ridées, grappes de fruits orange.", explication: "Néflier du Japon : Ornement et fruitier doux du climat doux." },
        { difficulte: "difficile", nom_commun: "Plaqueminier", nom_scientifique: "Diospyros kaki", indice: "Kakis orange en automne", description: "Arbre aux fruits orange persistants après la chute des feuilles.", explication: "Plaqueminier : Kakis décoratifs et comestibles à maturité." },
        { difficulte: "moyen", nom_commun: "Marronnier d'Inde", nom_scientifique: "Aesculus hippocastanum", indice: "Candes florales, marrons", description: "Grand ornement, feuilles palmées, fleurs en candélabres, marrons.", explication: "Marronnier d'Inde : Alignements urbains ; marrons non comestibles (≠ châtaigne)." },
        { difficulte: "facile", nom_commun: "Platane commun", nom_scientifique: "Platanus × hispanica", indice: "Écorce en puzzle, boules", description: "Écorce qui s’exfolie en plaques, feuilles lobées, fruits en boules.", explication: "Platane commun : Roi des avenues ; tolère la taille sévère." },
        { difficulte: "difficile", nom_commun: "Catalpa", nom_scientifique: "Catalpa bignonioides", indice: "Grandes feuilles, gousses longues", description: "Grandes feuilles cordiformes, fleurs blanches, longues gousses pendantes.", explication: "Catalpa : Ornement de parcs ; gousses comme des « haricots »." },
        { difficulte: "moyen", nom_commun: "Robinier faux-acacia", nom_scientifique: "Robinia pseudoacacia", indice: "Épines, grappes blanches", description: "Feuilles composées, épines, grappes de fleurs blanches parfumées.", explication: "Robinier faux-acacia : Introduit ; colonise friches, miel réputé." },
      ],
    },
  ],
});

const fruits = buildQuiz({
  id: "fruits-legumes",
  categorie: "Fruits et légumes",
  description: "Fruits, légumes-feuilles, racines et légumineuses du quotidien à reconnaître.",
  groups: [
    {
      id: "fruits",
      label: "Fruits",
      items: [
        { difficulte: "facile", nom_commun: "Pomme", nom_scientifique: "Malus domestica", indice: "Fruit à pépins du verger", description: "Fruit charnu à pépins, peau colorée variable, chair croquante.", explication: "Pomme : Fruit le plus cultivé des climats tempérés." },
        { difficulte: "facile", nom_commun: "Banane", nom_scientifique: "Musa acuminata", indice: "Doigt jaune courbé", description: "Fruit allongé jaune à maturité, chair fondante sans pépins visibles.", explication: "Banane : Baie tropicale consommée non climactérique en magasin." },
        { difficulte: "facile", nom_commun: "Orange", nom_scientifique: "Citrus × sinensis", indice: "Agrume orange rond", description: "Agrume sphérique à peau orange, quartiers juteux.", explication: "Orange : Agrume de table et de jus le plus courant." },
        { difficulte: "moyen", nom_commun: "Kiwi", nom_scientifique: "Actinidia deliciosa", indice: "Peau duveteuse brune", description: "Baie ovale à peau brune duveteuse, chair verte à petites graines.", explication: "Kiwi : Cultivé aussi en France ; riche en vitamine C." },
        { difficulte: "moyen", nom_commun: "Grenade", nom_scientifique: "Punica granatum", indice: "Couronne, grains rouges", description: "Fruit couronné, peau coriace, graines juteuses rouge rubis.", explication: "Grenade : Grains (arilles) comestibles ; symbole méditerranéen." },
        { difficulte: "moyen", nom_commun: "Mangue", nom_scientifique: "Mangifera indica", indice: "Fruit tropical à gros noyau", description: "Fruit ovoïde à peau colorée, chair orange autour d’un gros noyau plat.", explication: "Mangue : Fruit tropical à la chair parfumée." },
        { difficulte: "difficile", nom_commun: "Goyave", nom_scientifique: "Psidium guajava", indice: "Peau fine, graines centrales", description: "Baie ronde à ovale, chair rose ou blanche remplie de graines dures.", explication: "Goyave : Parfum intense ; peau souvent consommée." },
        { difficulte: "difficile", nom_commun: "Fruit de la passion", nom_scientifique: "Passiflora edulis", indice: "Coque ridée, pulpe acidulée", description: "Baie à coque pourpre ou jaune, pulpe gélatineuse autour des graines.", explication: "Fruit de la passion : Pulpe acidulée très aromatique." },
        { difficulte: "moyen", nom_commun: "Figue", nom_scientifique: "Ficus carica", indice: "Sycone doux pourpre ou vert", description: "« Fruit » charnu (sycone) à peau fine, chair rose sucrée.", explication: "Figue : En réalité une inflorescence charnue." },
        { difficulte: "facile", nom_commun: "Fraise", nom_scientifique: "Fragaria × ananassa", indice: "Rouge, akènes en surface", description: "Faux-fruit rouge parsemé d’akènes, chair juteuse.", explication: "Fraise : Les « graines » sont les vrais fruits (akènes)." },
        { difficulte: "difficile", nom_commun: "Kaki", nom_scientifique: "Diospyros kaki", indice: "Orange, astringent si vert", description: "Baie orange lisse, très astringente avant pleine maturité.", explication: "Kaki : Se mange blet ou en variétés non astringentes." },
        { difficulte: "moyen", nom_commun: "Ananas", nom_scientifique: "Ananas comosus", indice: "Couronne de feuilles, œil", description: "Syncarpe écailleux surmonté d’une couronne de feuilles.", explication: "Ananas : Fruit composé tropical ; couronne plantable." },
      ],
    },
    {
      id: "feuilles",
      label: "Légumes-feuilles",
      items: [
        { difficulte: "facile", nom_commun: "Laitue", nom_scientifique: "Lactuca sativa", indice: "Pomme ou feuilles tendres", description: "Légume-feuille en pomme ou à feuilles lâches, saveur douce.", explication: "Laitue : Base des salades ; nombreuses formes (batavia, romaine…)." },
        { difficulte: "facile", nom_commun: "Épinard", nom_scientifique: "Spinacia oleracea", indice: "Feuilles vert foncé tendres", description: "Feuilles vert foncé, lisses ou cloquées, riches en fer perçu.", explication: "Épinard : Cuisiné chaud ou cru ; ne pas confondre avec la tétragone." },
        { difficulte: "facile", nom_commun: "Chou cabus", nom_scientifique: "Brassica oleracea var. capitata", indice: "Pomme dense de feuilles", description: "Chou à pomme compacte de feuilles lisses ou cloquées.", explication: "Chou cabus : Pomme ronde classique du potager." },
        { difficulte: "moyen", nom_commun: "Blette", nom_scientifique: "Beta vulgaris var. cicla", indice: "Côtes blanches ou colorées", description: "Grandes feuilles à côtes charnues blanches, jaunes ou rouges.", explication: "Blette : On mange côtes et limbes ; cousine de la betterave." },
        { difficulte: "moyen", nom_commun: "Roquette", nom_scientifique: "Eruca vesicaria", indice: "Goût poivré, feuilles découpées", description: "Feuilles allongées découpées, saveur piquante." , explication: "Roquette : Salade poivrée ; floraison à 4 pétales jaunes." },
        { difficulte: "difficile", nom_commun: "Mâche", nom_scientifique: "Valerianella locusta", indice: "Petites rosettes d’hiver", description: "Petites feuilles en rosette tendre, culture d’automne-hiver.", explication: "Mâche : Salade d’hiver douce, aussi appelée doucette." },
        { difficulte: "difficile", nom_commun: "Pourpier", nom_scientifique: "Portulaca oleracea", indice: "Feuilles charnues rampantes", description: "Plante rampante aux feuilles charnues ovales, légèrement acidulée.", explication: "Pourpier : Adventice comestible, riche en oméga-3." },
        { difficulte: "moyen", nom_commun: "Chou kale", nom_scientifique: "Brassica oleracea var. sabellica", indice: "Feuilles frisées non pommées", description: "Chou non pommé aux feuilles très frisées, vertes ou pourpres.", explication: "Chou kale : Résistant au froid ; mode « santé » récente." },
        { difficulte: "facile", nom_commun: "Persil", nom_scientifique: "Petroselinum crispum", indice: "Aromate frisé ou plat", description: "Aromate en feuilles frisées ou plates, parfum caractéristique.", explication: "Persil : Condiment universel du potager." },
        { difficulte: "moyen", nom_commun: "Basilic", nom_scientifique: "Ocimum basilicum", indice: "Feuilles tendres parfumées", description: "Aromate annuel aux feuilles tendres très parfumées.", explication: "Basilic : Allié de la tomate ; craint le froid." },
      ],
    },
    {
      id: "racines",
      label: "Racines et tubercules",
      items: [
        { difficulte: "facile", nom_commun: "Carotte", nom_scientifique: "Daucus carota", indice: "Racine orange allongée", description: "Racine pivotante orange (souvent), feuillage fin découpé.", explication: "Carotte : Racine sucrée ; sauvage blanche et fibreuse." },
        { difficulte: "facile", nom_commun: "Pomme de terre", nom_scientifique: "Solanum tuberosum", indice: "Tubercule amidonné", description: "Tubercule souterrain à « yeux », chair blanche à jaune.", explication: "Pomme de terre : Tubercule, pas une racine ; base alimentaire." },
        { difficulte: "facile", nom_commun: "Oignon", nom_scientifique: "Allium cepa", indice: "Bulbe tuniqué pungent", description: "Bulbe formé de tuniques, odeur sulfurée au tranchage.", explication: "Oignon : Bulbe de base en cuisine ; vert ou sec." },
        { difficulte: "moyen", nom_commun: "Betterave", nom_scientifique: "Beta vulgaris", indice: "Racine rouge sang", description: "Racine charnue rouge intense, feuilles aussi comestibles.", explication: "Betterave : Sucrière ou potagère ; couleur due aux bétalaïnes." },
        { difficulte: "moyen", nom_commun: "Navet", nom_scientifique: "Brassica rapa", indice: "Racine blanche à collet violet", description: "Racine globuleuse blanche souvent lavée de violet au collet.", explication: "Navet : Légume d’hiver doux à légèrement piquant." },
        { difficulte: "moyen", nom_commun: "Radis", nom_scientifique: "Raphanus sativus", indice: "Petit, croquant, piquant", description: "Petite racine croquante rose à rouge, goût piquant.", explication: "Radis : Culture rapide ; nombreuses formes allongées ou rondes." },
        { difficulte: "difficile", nom_commun: "Panais", nom_scientifique: "Pastinaca sativa", indice: "Racine crème, goût sucré", description: "Racine pivotante crème, plus sucrée que la carotte après le froid.", explication: "Panais : Cousin de la carotte ; parfum de noisette." },
        { difficulte: "difficile", nom_commun: "Topinambour", nom_scientifique: "Helianthus tuberosus", indice: "Tubercule bosselé du soleil", description: "Tubercule irrégulier du tournesol vivace, goût d’artichaut.", explication: "Topinambour : Vivace envahissant ; riche en inuline." },
        { difficulte: "moyen", nom_commun: "Ail", nom_scientifique: "Allium sativum", indice: "Bulbe en caïeux", description: "Bulbe composé de gousses (caïeux) très odorantes.", explication: "Ail : Condiment majeur ; caïeux plantés un à un." },
        { difficulte: "facile", nom_commun: "Patate douce", nom_scientifique: "Ipomoea batatas", indice: "Tubercule orangé sucré", description: "Tubercule souvent orange, peau rose à cuivre, chair sucrée.", explication: "Patate douce : Convolvulacée tropicale, ≠ pomme de terre." },
      ],
    },
    {
      id: "legumineuses",
      label: "Légumineuses et autres",
      items: [
        { difficulte: "facile", nom_commun: "Haricot vert", nom_scientifique: "Phaseolus vulgaris", indice: "Gousse longue tendre", description: "Gousse allongée consommée immature, graines encore petites.", explication: "Haricot vert : Gousse mangée entière avant maturité des graines." },
        { difficulte: "facile", nom_commun: "Petit pois", nom_scientifique: "Pisum sativum", indice: "Graines rondes en gousse", description: "Gousse contenant des graines sphériques sucrées.", explication: "Petit pois : Graines mangées fraîches ou sèches (pois cassés)." },
        { difficulte: "moyen", nom_commun: "Lentille", nom_scientifique: "Lens culinaris", indice: "Petites graines lenticulaires", description: "Petites graines plates en forme de lentille, diverses couleurs.", explication: "Lentille : Légumineuse sèche à cuisson rapide." },
        { difficulte: "moyen", nom_commun: "Pois chiche", nom_scientifique: "Cicer arietinum", indice: "Graine bosselée beige", description: "Graine beige irrégulière, base du houmous et des falafels.", explication: "Pois chiche : Légumineuse méditerranéenne et asiatique." },
        { difficulte: "difficile", nom_commun: "Fève", nom_scientifique: "Vicia faba", indice: "Grosses graines aplaties", description: "Grosses graines aplaties dans une gousse épaisse, vertes ou sèches.", explication: "Fève : Légumineuse ancienne ; se mange fraîche ou sèche." },
        { difficulte: "difficile", nom_commun: "Fenouil bulbeux", nom_scientifique: "Foeniculum vulgare", indice: "Bulbe anisé blanc", description: "« Bulbe » blanc croquant au goût d’anis, feuillage plumeux.", explication: "Fenouil bulbeux : Base charnue des feuilles ; parfum anisé." },
        { difficulte: "moyen", nom_commun: "Courgette", nom_scientifique: "Cucurbita pepo", indice: "Fruit allongé vert tendre", description: "Fruit allongé à peau tendre, fleur jaune comestible.", explication: "Courgette : Cucurbitacée récoltée immature." },
        { difficulte: "facile", nom_commun: "Tomate", nom_scientifique: "Solanum lycopersicum", indice: "Baie rouge (souvent) du potager", description: "Baie charnue rouge, jaune ou noire, intérieur à loges et graines.", explication: "Tomate : Botaniquement un fruit, culinairement un légume." },
        { difficulte: "moyen", nom_commun: "Aubergine", nom_scientifique: "Solanum melongena", indice: "Fruit violet brillant", description: "Baie allongée ou ronde à peau violet sombre luisante.", explication: "Aubergine : Solanée du soleil ; chair spongieuse." },
        { difficulte: "difficile", nom_commun: "Okra", nom_scientifique: "Abelmoschus esculentus", indice: "Gousse cannelée mucilagineuse", description: "Gousse verte cannelée, mucilagineuse à la cuisson.", explication: "Okra : Aussi appelé gombo ; cuisine créole et africaine." },
      ],
    },
  ],
});

const mineraux = buildQuiz({
  id: "rochers-mineraux",
  categorie: "Rochers et minéraux",
  description: "Silicates, carbonates, oxydes, gemmes et métaux à reconnaître en spécimen.",
  groups: [
    {
      id: "silicates",
      label: "Silicates",
      items: [
        { difficulte: "facile", nom_commun: "Quartz", nom_scientifique: "Quartz", indice: "Cristaux hexagonaux, dureté 7", description: "Cristal souvent prismatique hexagonal, vitreux, raye le verre.", explication: "Quartz : Silice pure ; améthyste et citrine en sont des variétés." },
        { difficulte: "facile", nom_commun: "Feldspath orthose", nom_scientifique: "Orthoclase", indice: "Rose à blanc, clivages", description: "Minéral rose saumon à blanc, clivages nets, constitutif du granite.", explication: "Feldspath orthose : Donne sa teinte rose à de nombreux granites." },
        { difficulte: "moyen", nom_commun: "Mica muscovite", nom_scientifique: "Muscovite", indice: "Paillettes argentées flexibles", description: "Feuillets argentés flexibles et élastiques, éclat nacré.", explication: "Mica muscovite : Se délite en lamelles ; isolant électrique historique." },
        { difficulte: "moyen", nom_commun: "Olivine", nom_scientifique: "Forsterite", indice: "Vert olive dans les basaltes", description: "Minéral vert olive des roches basiques, grains dans le basalte.", explication: "Olivine : Péridot en gemme ; composant du manteau terrestre." },
        { difficulte: "difficile", nom_commun: "Grenat almandin", nom_scientifique: "Almandine", indice: "Cristaux dodécaédriques rouge sombre", description: "Cristaux isométriques rouge-brun sombre, dureté élevée.", explication: "Grenat almandin : Fréquent en schistes et gneiss ; gemme ou abrasif." },
        { difficulte: "difficile", nom_commun: "Tourmaline", nom_scientifique: "Schorl", indice: "Prismes striés noirs", description: "Prismes allongés striés verticalement, souvent noirs (schorl).", explication: "Tourmaline : Groupe complexe ; schorl noir le plus commun." },
        { difficulte: "moyen", nom_commun: "Améthyste", nom_scientifique: "Amethyst", indice: "Quartz violet", description: "Variété violette du quartz, géodes fréquentes.", explication: "Améthyste : Quartz coloré par des traces de fer ; gemme populaire." },
        { difficulte: "facile", nom_commun: "Silex", nom_scientifique: "Flint", indice: "Concassé, cortex blanc", description: "Nodules de silice opaque, cortex blanc, cassure conchoïdale.", explication: "Silex : Silice des craies ; outil préhistorique par excellence." },
        { difficulte: "difficile", nom_commun: "Épidote", nom_scientifique: "Epidote", indice: "Vert pistache prismatique", description: "Cristaux prismatiques vert pistache, fréquents en roches métamorphiques.", explication: "Épidote : Vert caractéristique des falaises et filons altérés." },
        { difficulte: "moyen", nom_commun: "Talc", nom_scientifique: "Talc", indice: "Très tendre, toucher savonneux", description: "Minéral blanc à verdâtre, dureté 1, toucher gras.", explication: "Talc : Le plus tendre de l’échelle de Mohs ; base du talc cosmétique." },
      ],
    },
    {
      id: "carbonates",
      label: "Carbonates",
      items: [
        { difficulte: "facile", nom_commun: "Calcite", nom_scientifique: "Calcite", indice: "Effervescente à l’acide", description: "Cristaux rhomboédriques, effervescence vive à l’acide dilué.", explication: "Calcite : Carbonate de calcium ; constitue calcaires et marbres." },
        { difficulte: "facile", nom_commun: "Aragonite", nom_scientifique: "Aragonite", indice: "Aiguilles, nacre des coquilles", description: "Polymorphe du CaCO₃ en aiguilles ou fibres ; coquilles et perles.", explication: "Aragonite : Moins stable que la calcite à surface ; fréquente en milieu marin." },
        { difficulte: "moyen", nom_commun: "Dolomie", nom_scientifique: "Dolomite", indice: "Effervescence faible à froid", description: "Carbonate de Ca et Mg, effervescence faible sauf si pulvérisé.", explication: "Dolomie : Constitue les dolomies ; se distingue de la calcite à l’acide." },
        { difficulte: "moyen", nom_commun: "Malachite", nom_scientifique: "Malachite", indice: "Vert bandé cuivreux", description: "Carbonate de cuivre vert vif, souvent bandé concentrique.", explication: "Malachite : Minerai et pierre ornementale du cuivre." },
        { difficulte: "difficile", nom_commun: "Azurite", nom_scientifique: "Azurite", indice: "Bleu profond cuivreux", description: "Carbonate de cuivre bleu intense, souvent associé à la malachite.", explication: "Azurite : Bleu caractéristique des zones d’oxydation du cuivre." },
        { difficulte: "difficile", nom_commun: "Sidèrite", nom_scientifique: "Siderite", indice: "Carbonate de fer brun", description: "Carbonate de fer rhomboédrique, beige à brun, dense.", explication: "Sidèrite : Ancien minerai de fer ; densité remarquable." },
        { difficulte: "moyen", nom_commun: "Magnésite", nom_scientifique: "Magnesite", indice: "Carbonate de magnésium", description: "Carbonate de Mg blanc à beige, peu effervescent à froid.", explication: "Magnésite : Source de magnésie ; aspect porcelaine." },
        { difficulte: "facile", nom_commun: "Calcaire", nom_scientifique: "Limestone", indice: "Roche sédimentaire effervescente", description: "Roche sédimentaire riche en calcite, effervescente, fossiles fréquents.", explication: "Calcaire : Roche dominante des plateaux ; base du ciment." },
      ],
    },
    {
      id: "oxydes",
      label: "Oxydes et hydroxydes",
      items: [
        { difficulte: "facile", nom_commun: "Hématite", nom_scientifique: "Hematite", indice: "Trait rouge sang", description: "Oxyde de fer, trait rouge caractéristique, éclat métallique ou terreux.", explication: "Hématite : Minerai de fer ; trait rouge même si le spécimen est noir." },
        { difficulte: "facile", nom_commun: "Magnétite", nom_scientifique: "Magnetite", indice: "Attire l’aimant", description: "Oxyde de fer noir, fortement magnétique, cristaux octaédriques.", explication: "Magnétite : Aimant naturel ; minerai de fer dense." },
        { difficulte: "moyen", nom_commun: "Pyrite", nom_scientifique: "Pyrite", indice: "Or des fous, cubes", description: "Sulfure (souvent classé avec les métalliques) en cubes laitonés.", explication: "Pyrite : « Or des fous » ; éclat métallique jaune laiton." },
        { difficulte: "moyen", nom_commun: "Goethite", nom_scientifique: "Goethite", indice: "Rouille fibreuse brune", description: "Hydroxyde de fer brun à ocre, formes fibreuses ou massives.", explication: "Goethite : Constituant majeur des limonites et rouilles." },
        { difficulte: "difficile", nom_commun: "Rutile", nom_scientifique: "Rutile", indice: "Aiguilles rouge-brun dans quartz", description: "Oxyde de titane en aiguilles rougeâtres, souvent inclus dans le quartz.", explication: "Rutile : Source de titane ; inclusions « cheveux de Vénus »." },
        { difficulte: "difficile", nom_commun: "Cassitérite", nom_scientifique: "Cassiterite", indice: "Minerai d’étain dense", description: "Oxyde d’étain brun-noir, très dense, éclat adamantin.", explication: "Cassitérite : Principal minerai d’étain historique." },
        { difficulte: "moyen", nom_commun: "Corindon", nom_scientifique: "Corundum", indice: "Dureté 9, rubis/saphir", description: "Oxyde d’aluminium très dur ; rubis rouge, saphir bleu.", explication: "Corindon : Dureté 9 ; abrasif et gemmes précieuses." },
        { difficulte: "facile", nom_commun: "Limonite", nom_scientifique: "Limonite", indice: "Ocre jaune-brun terreux", description: "Mélange d’hydroxydes de fer ocre, aspect terreux.", explication: "Limonite : Pigment ocre ; altération courante des sulfures." },
      ],
    },
    {
      id: "gemmes",
      label: "Gemmes",
      items: [
        { difficulte: "facile", nom_commun: "Diamant", nom_scientifique: "Diamond", indice: "Dureté 10, vif éclat", description: "Carbone cristallisé, dureté maximale, éclat adamantin.", explication: "Diamant : Plus dur minéral ; kimberlites et placers." },
        { difficulte: "facile", nom_commun: "Émeraude", nom_scientifique: "Emerald", indice: "Béryl vert vif", description: "Variété verte du béryl, couleur due au chrome ou vanadium.", explication: "Émeraude : Béryl vert ; inclusions fréquentes (« jardin »)." },
        { difficulte: "moyen", nom_commun: "Saphir", nom_scientifique: "Sapphire", indice: "Corindon bleu", description: "Corindon bleu (autres couleurs hors rouge aussi appelées saphirs).", explication: "Saphir : Corindon coloré ; le rouge est réservé au rubis." },
        { difficulte: "moyen", nom_commun: "Topaze", nom_scientifique: "Topaz", indice: "Prismes, dureté 8", description: "Cristaux prismatiques souvent champagne à bleus, dureté 8.", explication: "Topaze : Silicate d’aluminium fluoré ; gemme classique." },
        { difficulte: "difficile", nom_commun: "Tanzanite", nom_scientifique: "Tanzanite", indice: "Zoisite bleue-violette", description: "Zoisite bleue-violette rare, pléochroïsme fort.", explication: "Tanzanite : Connue surtout en Tanzanie ; pléochroïsme bleu/violet/bordeaux." },
        { difficulte: "difficile", nom_commun: "Péridot", nom_scientifique: "Peridot", indice: "Olivine gemme vert pistache", description: "Olivine gemme vert pistache à olive, éclat vitreux.", explication: "Péridot : Olivine de qualité gemme ; parfois en météorites." },
        { difficulte: "moyen", nom_commun: "Opale", nom_scientifique: "Opal", indice: "Jeux de couleurs", description: "Silice hydratée amorphe, jeux de couleurs (opalescence).", explication: "Opale : Non cristalline ; précieuse si iridescente." },
        { difficulte: "facile", nom_commun: "Turquoise", nom_scientifique: "Turquoise", indice: "Bleu-vert opaque", description: "Phosphate bleu-vert opaque, veiné de noir parfois.", explication: "Turquoise : Gemme opaque des zones arides ; bijoux anciens." },
      ],
    },
    {
      id: "metaux",
      label: "Métaux et autres",
      items: [
        { difficulte: "facile", nom_commun: "Or natif", nom_scientifique: "Gold", indice: "Jaune dense, malléable", description: "Métal jaune dense, malléable, ne s’oxyde pas.", explication: "Or natif : Métal natif ; pépites et paillettes en filons ou placers." },
        { difficulte: "facile", nom_commun: "Cuivre natif", nom_scientifique: "Copper", indice: "Rouge-orangé métallique", description: "Métal rouge-orangé, souvent en masses irrégulières oxydées en vert.", explication: "Cuivre natif : Métal natif ; patine verte (malachite) en surface." },
        { difficulte: "moyen", nom_commun: "Galène", nom_scientifique: "Galena", indice: "Gris plomb, cubes", description: "Sulfure de plomb gris métallique, clivages cubiques parfaits.", explication: "Galène : Principal minerai de plomb ; dense et brillante." },
        { difficulte: "moyen", nom_commun: "Sphalérite", nom_scientifique: "Sphalerite", indice: "Minerai de zinc brun", description: "Sulfure de zinc brun à noir, éclat résineux à adamantin.", explication: "Sphalérite : Principal minerai de zinc ; souvent avec la galène." },
        { difficulte: "difficile", nom_commun: "Cinabre", nom_scientifique: "Cinnabar", indice: "Rouge vermillon, mercure", description: "Sulfure de mercure rouge vermillon, dense et toxique.", explication: "Cinabre : Minerai de mercure ; pigment historique (vermillon)." },
        { difficulte: "difficile", nom_commun: "Fluorine", nom_scientifique: "Fluorite", indice: "Cubes colorés, fluorescence", description: "Halogénure en cubes souvent violets ou verts, fluorescence UV.", explication: "Fluorine : Dureté 4 ; cubes et fluorescence célèbres." },
        { difficulte: "moyen", nom_commun: "Gypse", nom_scientifique: "Gypsum", indice: "Très tendre, « rose des sables »", description: "Sulfate hydraté tendre, cristaux en fer de lance ou rose des sables.", explication: "Gypse : Dureté 2 ; source du plâtre." },
        { difficulte: "facile", nom_commun: "Soufre", nom_scientifique: "Sulfur", indice: "Jaune vif, odeur", description: "Élément jaune vif, cristaux pyramidaux, odeur d’œuf pourri chauffé.", explication: "Soufre : Natif autour des volcans et sources chaudes." },
        { difficulte: "difficile", nom_commun: "Graphite", nom_scientifique: "Graphite", indice: "Noir gras, écrit sur papier", description: "Carbone noir opaque, toucher gras, trace noire sur le papier.", explication: "Graphite : Polymorphe du carbone ; mine des crayons." },
        { difficulte: "moyen", nom_commun: "Halite", nom_scientifique: "Halite", indice: "Sel gemme, goût salé", description: "Chlorure de sodium en cubes, goût salé, soluble.", explication: "Halite : Sel gemme des évaporites ; clivage cubique." },
      ],
    },
  ],
});

writeQuiz(insectes);
writeQuiz(mammiferes);
writeQuiz(arbres);
writeQuiz(fruits);
writeQuiz(mineraux);

// Capitales + drapeaux depuis pays-monde
const pays = JSON.parse(readFileSync(join(dataDir, "pays-monde.json"), "utf8"));

/** Capitale : { fr: nom joué, en: clé recherche Commons/Wikipedia }. */
function cap(fr, en = fr) {
  return { fr, en };
}

const CAPITALS = {
  France: cap("Paris"), Italie: cap("Rome"), Espagne: cap("Madrid"), Allemagne: cap("Berlin"),
  "Royaume-Uni": cap("Londres", "London"), Portugal: cap("Lisbonne", "Lisbon"),
  Belgique: cap("Bruxelles", "Brussels"), "Pays-Bas": cap("Amsterdam"), Suisse: cap("Berne", "Bern"),
  Autriche: cap("Vienne", "Vienna"), Suède: cap("Stockholm"), Norvège: cap("Oslo"),
  Danemark: cap("Copenhague", "Copenhagen"), Finlande: cap("Helsinki"),
  Pologne: cap("Varsovie", "Warsaw"), "Tchéquie": cap("Prague"), "République tchèque": cap("Prague"),
  Hongrie: cap("Budapest"), Grèce: cap("Athènes", "Athens"), Irlande: cap("Dublin"),
  Islande: cap("Reykjavik"), Roumanie: cap("Bucarest", "Bucharest"), Bulgarie: cap("Sofia"),
  Croatie: cap("Zagreb"), Serbie: cap("Belgrade"), Ukraine: cap("Kiev", "Kyiv"),
  Russie: cap("Moscou", "Moscow"), Turquie: cap("Ankara"),
  Égypte: cap("Le Caire", "Cairo"), Maroc: cap("Rabat"), Algérie: cap("Alger", "Algiers"),
  Tunisie: cap("Tunis"), "Afrique du Sud": cap("Pretoria"),
  Nigeria: cap("Abuja"), Kenya: cap("Nairobi"), Éthiopie: cap("Addis-Abeba", "Addis Ababa"),
  Ghana: cap("Accra"), Sénégal: cap("Dakar"), "Côte d'Ivoire": cap("Yamoussoukro"),
  Cameroun: cap("Yaoundé", "Yaounde"), Angola: cap("Luanda"), Mozambique: cap("Maputo"),
  Tanzanie: cap("Dodoma"), Ouganda: cap("Kampala"), Madagascar: cap("Antananarivo"),
  Chine: cap("Pékin", "Beijing"), Inde: cap("New Delhi"), Japon: cap("Tokyo"),
  "Corée du Sud": cap("Séoul", "Seoul"), "Corée du Nord": cap("Pyongyang"),
  Indonésie: cap("Jakarta"), Thaïlande: cap("Bangkok"), Vietnam: cap("Hanoï", "Hanoi"),
  Philippines: cap("Manille", "Manila"), Malaisie: cap("Kuala Lumpur"),
  Singapour: cap("Singapour", "Singapore"), Pakistan: cap("Islamabad"),
  Bangladesh: cap("Dacca", "Dhaka"), Iran: cap("Téhéran", "Tehran"), Irak: cap("Bagdad", "Baghdad"),
  "Arabie saoudite": cap("Riyad", "Riyadh"), Israël: cap("Jérusalem", "Jerusalem"),
  Liban: cap("Beyrouth", "Beirut"), Jordanie: cap("Amman"),
  "Émirats arabes unis": cap("Abou Dabi", "Abu Dhabi"), Qatar: cap("Doha"),
  Kazakhstan: cap("Astana"), Ouzbékistan: cap("Tachkent", "Tashkent"),
  Afghanistan: cap("Kaboul", "Kabul"), Népal: cap("Katmandou", "Kathmandu"),
  "Sri Lanka": cap("Sri Jayawardenapura Kotte"),
  "États-Unis": cap("Washington", "Washington, D.C."), Canada: cap("Ottawa"),
  Mexique: cap("Mexico", "Mexico City"), Brésil: cap("Brasília", "Brasilia"),
  Argentine: cap("Buenos Aires"), Chili: cap("Santiago"), Colombie: cap("Bogota"),
  Pérou: cap("Lima"), Venezuela: cap("Caracas"), Équateur: cap("Quito"),
  Bolivie: cap("Sucre"), Paraguay: cap("Asuncion"), Uruguay: cap("Montevideo"),
  Cuba: cap("La Havane", "Havana"), Australie: cap("Canberra"),
  "Nouvelle-Zélande": cap("Wellington"), Fidji: cap("Suva"),
  "Papouasie-Nouvelle-Guinée": cap("Port Moresby"), "Îles Salomon": cap("Honiara"),
  Vanuatu: cap("Port-Vila", "Port Vila"), Samoa: cap("Apia"), Tonga: cap("Nukuʻalofa", "Nuku'alofa"),
  Kiribati: cap("Tarawa-Sud", "South Tarawa"), "Îles Marshall": cap("Majuro"),
  Palaos: cap("Ngerulmud"), Nauru: cap("Yaren"), Tuvalu: cap("Funafuti"),
  Lituanie: cap("Vilnius"), Lettonie: cap("Riga"), Estonie: cap("Tallinn"),
  Slovaquie: cap("Bratislava"), Slovénie: cap("Ljubljana"),
  "Bosnie-Herzégovine": cap("Sarajevo"), Albanie: cap("Tirana"),
  "Macédoine du Nord": cap("Skopje"), Monténégro: cap("Podgorica"),
  Kosovo: cap("Pristina"), Moldavie: cap("Chișinău", "Chisinau"),
  Biélorussie: cap("Minsk"), Géorgie: cap("Tbilissi", "Tbilisi"),
  Arménie: cap("Erevan", "Yerevan"), Azerbaïdjan: cap("Bakou", "Baku"),
  Chypre: cap("Nicosie", "Nicosia"), Malte: cap("La Valette", "Valletta"),
  Luxembourg: cap("Luxembourg"), Andorre: cap("Andorre-la-Vieille", "Andorra la Vella"),
  Monaco: cap("Monaco"), "Saint-Marin": cap("Saint-Marin", "San Marino"),
  Vatican: cap("Cité du Vatican", "Vatican City"), Liechtenstein: cap("Vaduz"),
  Libye: cap("Tripoli"), Soudan: cap("Khartoum"), "Soudan du Sud": cap("Djouba", "Juba"),
  Somalie: cap("Mogadiscio", "Mogadishu"), Rwanda: cap("Kigali"), Burundi: cap("Gitega"),
  Malawi: cap("Lilongwe"), Zambie: cap("Lusaka"), Zimbabwe: cap("Harare"),
  Botswana: cap("Gaborone"), Namibie: cap("Windhoek"),
  "République démocratique du Congo": cap("Kinshasa"), Congo: cap("Brazzaville"),
  Gabon: cap("Libreville"), "Guinée équatoriale": cap("Malabo"), Tchad: cap("N'Djaména", "N'Djamena"),
  Niger: cap("Niamey"), Mali: cap("Bamako"), "Burkina Faso": cap("Ouagadougou"),
  Bénin: cap("Porto-Novo"), Togo: cap("Lomé", "Lome"), Guinée: cap("Conakry"),
  "Guinée-Bissau": cap("Bissau"), Gambie: cap("Banjul"), "Sierra Leone": cap("Freetown"),
  Libéria: cap("Monrovia"), Mauritanie: cap("Nouakchott"), "Érythrée": cap("Asmara"),
  Djibouti: cap("Djibouti"), "Cap-Vert": cap("Praia"),
  "São Tomé-et-Príncipe": cap("São Tomé", "Sao Tome"), Seychelles: cap("Victoria"),
  Maurice: cap("Port-Louis", "Port Louis"), Comores: cap("Moroni"),
  Mongolie: cap("Oulan-Bator", "Ulaanbaatar"), Corée: cap("Séoul", "Seoul"),
  Birmanie: cap("Naypyidaw"), Myanmar: cap("Naypyidaw"), Laos: cap("Vientiane"),
  Cambodge: cap("Phnom Penh"), Brunei: cap("Bandar Seri Begawan"),
  "Timor oriental": cap("Dili"), Yémen: cap("Sanaa"), Oman: cap("Mascate", "Muscat"),
  Koweït: cap("Koweït", "Kuwait City"), Bahreïn: cap("Manama"), Syrie: cap("Damas", "Damascus"),
  Palestine: cap("Ramallah"), Guatemala: cap("Guatemala", "Guatemala City"),
  Honduras: cap("Tegucigalpa"), "El Salvador": cap("San Salvador"), Nicaragua: cap("Managua"),
  "Costa Rica": cap("San José", "San Jose"), Panama: cap("Panama", "Panama City"),
  "République dominicaine": cap("Saint-Domingue", "Santo Domingo"),
  Haïti: cap("Port-au-Prince"), Jamaïque: cap("Kingston"),
  "Trinité-et-Tobago": cap("Port-d'Espagne", "Port of Spain"), Bahamas: cap("Nassau"),
  Barbade: cap("Bridgetown"), Belize: cap("Belmopan"), Guyana: cap("Georgetown"),
  Suriname: cap("Paramaribo"), Guyane: cap("Cayenne"),
};

function difficulteFromPays(d) {
  return d === "facile" || d === "moyen" || d === "difficile" ? d : "moyen";
}

function buildFromPays({ id, categorie, description, mapQuestion }) {
  const groupes = pays.groupes.map((group) => {
    const mapped = [];
    for (const q of group.questions) {
      const item = mapQuestion(q);
      if (!item) continue;
      mapped.push(item);
    }
    const names = mapped.map((m) => m.nom_commun);
    const questions = mapped.map((item, index) => {
      const qid = `${group.id[0]}${id[0]}${index + 1}`;
      const distractors = pickDistractors(names, item.nom_commun, qid);
      const options = shuffleOptions([item.nom_commun, ...distractors].slice(0, 4), qid);
      const row = {
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
      if (item.pays) row.pays = item.pays;
      if (item.paysEn) row.paysEn = item.paysEn;
      return row;
    });
    return { id: group.id, label: group.label, questions };
  });
  return { id, categorie, description, groupes };
}

const capitales = buildFromPays({
  id: "capitales-monde",
  categorie: "Capitales du monde",
  description: "Retrouve la capitale à partir du pays. Coche les continents, puis un niveau.",
  mapQuestion: (q) => {
    const capital = CAPITALS[q.nom_commun];
    if (!capital) return null;
    return {
      difficulte: difficulteFromPays(q.difficulte),
      nom_commun: capital.fr,
      nom_scientifique: capital.en,
      pays: q.nom_commun,
      paysEn: q.nom_scientifique,
      indice: `Capitale · ${q.nom_commun}`,
      description: `Capitale de ${q.nom_commun}.`,
      explication: `${capital.fr} : capitale de ${q.nom_commun}.`,
    };
  },
});

// Rebuild capital distractors from capitals only (already done). Enrich options with country hint already in indice.
writeQuiz(capitales);

const drapeaux = buildFromPays({
  id: "drapeaux-monde",
  categorie: "Drapeaux du monde",
  description: "Reconnaître un pays à son drapeau. Coche les continents, puis un niveau.",
  mapQuestion: (q) => ({
    difficulte: difficulteFromPays(q.difficulte),
    nom_commun: q.nom_commun,
    nom_scientifique: q.nom_scientifique,
    indice: q.indice ? `Drapeau · ${q.indice}` : "Couleurs et emblème du drapeau",
    description: `Drapeau de ${q.nom_commun}.`,
    explication: `${q.nom_commun} : reconnaissable à son drapeau national.`,
  }),
});
writeQuiz(drapeaux);

console.log("done");
