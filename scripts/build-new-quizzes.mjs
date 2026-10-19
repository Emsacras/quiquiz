/**
 * Génère : bébés animaux, feuilles d’arbres, nuages, fossiles.
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
  return n;
}

function item(difficulte, nom_commun, nom_scientifique, imageQuery, indice, description, explication) {
  return { difficulte, nom_commun, nom_scientifique, imageQuery, indice, description, explication };
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
        item("facile", "Poussin", "Gallus gallus domesticus", "chick", "Petit jaune du poulailler", "Jeune oiseau couvert de duvet, issu de la poule domestique.", "Poussin : Bébé de la poule."),
        item("facile", "Veau", "Bos taurus", "calf", "Petit de la vache", "Jeune bovin encore dépendant du lait maternel.", "Veau : Bébé de la vache (ou du taureau)."),
        item("facile", "Agneau", "Ovis aries", "lamb", "Petit du mouton", "Jeune ovin à la toison encore fine.", "Agneau : Bébé du mouton."),
        item("facile", "Porcelet", "Sus domesticus", "piglet", "Petit du cochon", "Jeune porc au museau rose et au corps trapu.", "Porcelet : Bébé du porc."),
        item("facile", "Poulain", "Equus caballus", "foal", "Petit du cheval", "Jeune cheval aux longues pattes, encore proche de sa mère.", "Poulain : Bébé du cheval (pouliche si femelle)."),
        item("moyen", "Chevreau", "Capra hircus", "kid goat", "Petit de la chèvre", "Jeune caprin vif, souvent cornu plus tard.", "Chevreau : Bébé de la chèvre."),
        item("moyen", "Caneton", "Anas platyrhynchos domesticus", "duckling", "Petit du canard", "Jeune canard au duvet jaune, bon nageur.", "Caneton : Bébé du canard."),
        item("moyen", "Ânon", "Equus asinus", "donkey foal", "Petit de l’âne", "Jeune âne aux grandes oreilles, encore près de sa mère.", "Ânon : Bébé de l’âne."),
        item("moyen", "Cygneau", "Cygnus olor", "cygnet", "Petit du cygne", "Jeune cygne au duvet gris, souvent en famille sur l’eau.", "Cygneau : Bébé du cygne."),
        item("moyen", "Lapereau", "Oryctolagus cuniculus domesticus", "baby rabbit farm", "Petit du lapin de clapier", "Jeune lapin élevé en élevage, oreilles encore courtes.", "Lapereau : Bébé du lapin."),
        item("difficile", "Oison", "Anser anser domesticus", "gosling", "Petit de l’oie", "Jeune oie au duvet gris-jaune.", "Oison : Bébé de l’oie."),
        item("difficile", "Dindonneau", "Meleagris gallopavo", "turkey poult", "Petit de la dinde", "Jeune dindon encore couvert de duvet.", "Dindonneau : Bébé de la dinde / du dindon."),
        item("difficile", "Pintadeau", "Numida meleagris", "guinea fowl chick", "Petit de la pintade", "Jeune pintade tachetée, très vif dès le jeune âge.", "Pintadeau : Bébé de la pintade."),
        item("difficile", "Paonneau", "Pavo cristatus", "peachick", "Petit du paon", "Jeune paon sans grande queue, déjà un peu cresté.", "Paonneau : Bébé du paon."),
        item("difficile", "Mulard", "Cairina moschata × Anas", "muscovy duckling", "Caneton de mule", "Jeune canard issu d’un croisement (canard de Barbarie × colvert).", "Mulard : Caneton hybride d’élevage."),
      ],
    },
    {
      id: "compagnie",
      label: "Compagnie",
      items: [
        item("facile", "Chaton", "Felis catus", "kitten", "Petit du chat", "Jeune chat aux yeux grands et aux oreilles encore molles.", "Chaton : Bébé du chat."),
        item("facile", "Chiot", "Canis familiaris", "puppy", "Petit du chien", "Jeune chien joueur, encore en croissance.", "Chiot : Bébé du chien."),
        item("facile", "Lapereau nain", "Oryctolagus cuniculus", "baby rabbit", "Petit lapin de compagnie", "Jeune lapin nain au pelage doux.", "Lapereau : Bébé du lapin de compagnie."),
        item("moyen", "Cobaye", "Cavia porcellus", "baby guinea pig", "Petit cochon d’Inde", "Jeune cobaye déjà velu, yeux ouverts dès la naissance.", "Petit cobaye : Bébé du cochon d’Inde."),
        item("moyen", "Hamster", "Mesocricetus auratus", "baby hamster", "Petit hamster", "Très jeune hamster, souvent encore au nid.", "Petit hamster : Bébé du hamster."),
        item("moyen", "Tortillon", "Serinus canaria", "canary chick", "Petit du canari", "Jeune canari encore au nid ou tout juste sorti.", "Tortillon : Bébé du canari (aussi dit « canarillon »)."),
        item("moyen", "Fureton", "Mustela putorius furo", "baby ferret", "Petit du furet", "Jeune furet au museau pointu, encore joueur et souple.", "Fureton : Bébé du furet."),
        item("difficile", "Souriceau", "Mus musculus", "baby mouse", "Petit de la souris", "Très jeune souris, souvent rose et sans poils au tout début.", "Souriceau : Bébé de la souris."),
        item("difficile", "Ratton", "Rattus norvegicus", "baby rat", "Petit du rat", "Jeune rat encore dépendant du nid.", "Ratton : Bébé du rat."),
        item("difficile", "Gerbillon", "Meriones unguiculatus", "baby gerbil", "Petit de la gerbille", "Jeune gerbille au long pelage et à la queue touffue.", "Petit gerbillon : Bébé de la gerbille."),
        item("difficile", "Perrucheau", "Melopsittacus undulatus", "budgerigar chick", "Petit de la perruche", "Jeune perruche ondulée encore au nid, duvet clair.", "Perrucheau : Bébé de la perruche."),
        item("difficile", "Jeune tortue", "Testudo hermanni", "baby tortoise", "Petit de la tortue", "Très jeune tortue à la carapace encore molle.", "Jeune tortue : Bébé de la tortue terrestre."),
      ],
    },
    {
      id: "sauvage",
      label: "Sauvage",
      items: [
        item("facile", "Ourson", "Ursus arctos", "bear cub", "Petit de l’ours", "Jeune ours au pelage duveteux.", "Ourson : Bébé de l’ours."),
        item("facile", "Lionceau", "Panthera leo", "lion cub", "Petit du lion", "Jeune lion encore tacheté, sans crinière.", "Lionceau : Bébé du lion."),
        item("facile", "Éléphanteau", "Loxodonta africana", "elephant calf", "Petit de l’éléphant", "Jeune éléphant aux grandes oreilles, près de sa mère.", "Éléphanteau : Bébé de l’éléphant."),
        item("moyen", "Renardeau", "Vulpes vulpes", "fox cub", "Petit du renard", "Jeune renard au museau pointu et au pelage sombre.", "Renardeau : Bébé du renard."),
        item("moyen", "Louveteau", "Canis lupus", "wolf pup", "Petit du loup", "Jeune loup élevé au sein de la meute.", "Louveteau : Bébé du loup."),
        item("moyen", "Faon", "Cervus elaphus", "fawn", "Petit du cerf / de la biche", "Jeune cervidé au pelage tacheté.", "Faon : Bébé du cerf (ou de la biche)."),
        item("moyen", "Tigreau", "Panthera tigris", "tiger cub", "Petit du tigre", "Jeune tigre déjà rayé, encore joueur.", "Tigreau : Bébé du tigre."),
        item("moyen", "Girafon", "Giraffa camelopardalis", "giraffe calf", "Petit de la girafe", "Jeune girafe aux longues pattes, déjà tacheté.", "Girafon : Bébé de la girafe."),
        item("moyen", "Petit dauphin", "Tursiops truncatus", "dolphin calf", "Petit du dauphin", "Jeune dauphin nageant près de sa mère.", "Petit dauphin : Bébé du dauphin."),
        item("difficile", "Marcassin", "Sus scrofa", "wild boar piglet", "Petit du sanglier", "Jeune sanglier rayé de clair sur le flanc.", "Marcassin : Bébé du sanglier."),
        item("difficile", "Levraut", "Lepus europaeus", "baby hare", "Petit du lièvre", "Jeune lièvre né déjà velu et les yeux ouverts.", "Levraut : Bébé du lièvre."),
        item("difficile", "Blanchet", "Phoca vitulina", "seal pup", "Petit du phoque", "Jeune phoque au pelage clair, sur la grève.", "Blanchet (ou blanchon) : Bébé du phoque."),
        item("difficile", "Baleineau", "Balaenoptera musculus", "whale calf", "Petit de la baleine", "Jeune cétacé de grande taille, encore allaité.", "Baleineau : Bébé de la baleine."),
        item("difficile", "Loutron", "Lutra lutra", "otter pup", "Petit de la loutre", "Jeune loutre au pelage dense, près de l’eau.", "Loutron : Bébé de la loutre."),
        item("difficile", "Panthéreau", "Panthera pardus", "leopard cub", "Petit de la panthère", "Jeune léopard / panthère déjà tacheté.", "Panthéreau : Bébé de la panthère."),
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
        item("facile", "Chêne pédonculé", "Quercus robur", "oak leaf", "Lobes arrondis, sans pointes", "Feuille lobée à lobes arrondis, limbe coriace.", "Chêne pédonculé : Feuille lobée classique des chênaies."),
        item("facile", "Érable sycomore", "Acer pseudoplatanus", "sycamore maple leaf", "Cinq lobes palmés", "Feuille palmée à cinq lobes dentés.", "Érable sycomore : Feuille palmée, samares en « hélicoptère »."),
        item("facile", "Érable plane", "Acer platanoides", "norway maple leaf", "Lobes pointus, sinus en U", "Feuille palmée à lobes aigus, latex blanc à la cassée.", "Érable plane : Lobes plus pointus que le sycomore."),
        item("facile", "Vigne", "Vitis vinifera", "grape vine leaf", "Grande feuille palmée dentée", "Feuille large à lobes inégaux, nervures marquées.", "Vigne : Feuille palmée du raisin."),
        item("moyen", "Platane", "Platanus × hispanica", "plane tree leaf", "Grands lobes pointus", "Grande feuille palmée à lobes aigus, nervures marquées.", "Platane : Feuille large des alignements urbains."),
        item("moyen", "Figuier", "Ficus carica", "fig leaf", "3 à 5 lobes profonds", "Feuille épaisse, lobes profonds, face rugueuse.", "Figuier : Feuille caractéristique du bassin méditerranéen."),
        item("moyen", "Chêne rouge", "Quercus rubra", "red oak leaf", "Lobes pointus en pointe", "Feuille lobée à lobes aigus (contrairement au chêne pédonculé).", "Chêne rouge : Lobes terminés en pointe."),
        item("moyen", "Érable champêtre", "Acer campestre", "field maple leaf", "Petits lobes arrondis", "Petite feuille palmée à lobes arrondis, des haies.", "Érable champêtre : Petite feuille des bocages."),
        item("moyen", "Lierre", "Hedera helix", "ivy leaf", "3 à 5 lobes (jeune)", "Feuille de lierre grimpant, lobes nets sur les rameaux stériles.", "Lierre : Feuille lobée des tiges grimpantes."),
        item("difficile", "Liquidambar", "Liquidambar styraciflua", "sweetgum leaf", "Étoile à 5–7 pointes", "Feuille étoilée à lobes pointus, belles couleurs d’automne.", "Liquidambar : Feuille étoilée des parcs."),
        item("difficile", "Tulipier de Virginie", "Liriodendron tulipifera", "tulip tree leaf", "Feuille « en selle » tronquée", "Feuille à limbe tronqué au sommet, forme unique.", "Tulipier : Feuille inimitable, sommet comme coupé."),
        item("difficile", "Chêne sessile", "Quercus petraea", "sessile oak leaf", "Lobes réguliers, pétiole long", "Feuille lobée proche du pédonculé, pétiole plus long.", "Chêne sessile : Feuille à pétiole net, glands sans pédoncule."),
        item("difficile", "Mûrier blanc", "Morus alba", "mulberry leaf", "Lobes irréguliers variables", "Feuille souvent lobée de façon irrégulière, base cordiforme.", "Mûrier : Forme de feuille très variable."),
        item("difficile", "Passiflore", "Passiflora caerulea", "passionflower leaf", "Doigts étroits profonds", "Feuille profondément découpée en longs lobes.", "Passiflore : Feuille digitées des jardins."),
      ],
    },
    {
      id: "simples",
      label: "Simples ovales",
      items: [
        item("facile", "Hêtre", "Fagus sylvatica", "beech leaf", "Ovale, bord ondulé", "Feuille ovale à bord légèrement ondulé, nervures parallèles.", "Hêtre : Feuille lisse, typique des hêtraies."),
        item("facile", "Bouleau verruqueux", "Betula pendula", "birch leaf", "Petite, triangulaire-dentée", "Petite feuille dentée, base souvent en coin.", "Bouleau : Petite feuille dentée des clairières."),
        item("facile", "Châtaignier", "Castanea sativa", "chestnut leaf", "Longue, dents en scie", "Grande feuille allongée, bord fortement denté.", "Châtaignier : Feuille longue à dents aiguës."),
        item("facile", "Merisier", "Prunus avium", "wild cherry leaf", "Ovale, dents fines", "Feuille ovale dentée, face un peu mate.", "Merisier : Feuille du cerisier sauvage."),
        item("moyen", "Tilleul", "Tilia cordata", "lime leaf", "Cœur asymétrique", "Feuille cordiforme, base asymétrique, pointe fine.", "Tilleul : Feuille en cœur, parfum des fleurs."),
        item("moyen", "Orme champêtre", "Ulmus minor", "elm leaf", "Base très asymétrique", "Feuille doublement dentée, base fortement inégale.", "Orme : Base de feuille très asymétrique."),
        item("moyen", "Peuplier tremble", "Populus tremula", "aspen leaf", "Ronde, pétiole plat", "Feuille quasi ronde, tremble au moindre vent.", "Tremble : Feuille ronde à pétiole aplati."),
        item("moyen", "Saule blanc", "Salix alba", "willow leaf", "Très allongée, étroite", "Feuille longue et étroite, face inférieure soyeuse.", "Saule blanc : Feuille lancéolée des rives."),
        item("moyen", "Noisetier", "Corylus avellana", "hazel leaf", "Ronde, double dent", "Feuille large presque ronde, pointe courte, double denture.", "Noisetier : Feuille des fourrés et haies."),
        item("difficile", "Charme", "Carpinus betulus", "hornbeam leaf", "Nervures très marquées, double dent", "Feuille ovale plissée, double denture régulière.", "Charme : Feuille plissée des haies et forêts."),
        item("difficile", "Aulne glutineux", "Alnus glutinosa", "alder leaf", "Sommet échancré", "Feuille arrondie au sommet souvent échancré.", "Aulne : Feuille à sommet tronqué / échancré, bords d’eau."),
        item("difficile", "Cornouiller sanguin", "Cornus sanguinea", "dogwood leaf", "Ovale, nervures arquées", "Feuille ovale à nervures qui se rejoignent vers la pointe.", "Cornouiller : Nervures arquées caractéristiques."),
        item("difficile", "Fusain d’Europe", "Euonymus europaeus", "spindle leaf", "Ovale fine, bords fins", "Petite feuille ovale-lancéolée, bord finement denté.", "Fusain : Feuille des haies, fruits roses à l’automne."),
        item("difficile", "Troène", "Ligustrum vulgare", "privet leaf", "Petite, semi-persistante", "Petite feuille ovale lisse, souvent brillante.", "Troène : Petite feuille des haies taillées."),
      ],
    },
    {
      id: "composees",
      label: "Composées / aiguilles",
      items: [
        item("facile", "Frêne commun", "Fraxinus excelsior", "ash leaf", "Folioles opposées", "Feuille composée imparipennée, nombreuses folioles.", "Frêne : Feuille composée typique."),
        item("facile", "Robinier", "Robinia pseudoacacia", "black locust leaf", "Folioles ovales arrondies", "Feuille composée à folioles ovales, souvent épineuse à la base.", "Robinier (acacia) : Feuille composée des bords de route."),
        item("facile", "Marronnier", "Aesculus hippocastanum", "horse chestnut leaf", "Doigts palmés (5–7)", "Grande feuille digitées, folioles en éventail.", "Marronnier : Feuille palmée composée des parcs."),
        item("facile", "Pin sylvestre", "Pinus sylvestris", "scots pine needles", "Aiguilles par 2", "Aiguilles groupées par deux, assez courtes.", "Pin sylvestre : Aiguilles géminées."),
        item("moyen", "Noyer", "Juglans regia", "walnut leaf", "Grandes folioles aromatiques", "Feuille composée à grandes folioles odorantes.", "Noyer : Feuille composée à forte odeur."),
        item("moyen", "Sorbier des oiseleurs", "Sorbus aucuparia", "rowan leaf", "Folioles dentées nombreuses", "Feuille composée à folioles dentées, baies rouges plus tard.", "Sorbier : Feuille composée des lisières."),
        item("moyen", "Sureau noir", "Sambucus nigra", "elder leaf", "Folioles opposées odorantes", "Feuille composée, odeur forte quand on la froisse.", "Sureau : Feuille composée des lisières."),
        item("moyen", "Épicéa commun", "Picea abies", "spruce needles", "Aiguilles sur coussinets", "Aiguilles courtes sur toute la rameau, piquantes.", "Épicéa : Aiguilles isolées sur coussinets."),
        item("moyen", "Pin noir", "Pinus nigra", "black pine needles", "Aiguilles par 2, longues", "Aiguilles géminées plus longues et plus raides que le sylvestre.", "Pin noir : Longues aiguilles par deux."),
        item("difficile", "Mélèze", "Larix decidua", "larch needles", "Aiguilles en rosettes, caduques", "Aiguilles souples en touffes sur les rameaux courts.", "Mélèze : Seul conifère européen à perdre ses aiguilles."),
        item("difficile", "Sapin pectiné", "Abies alba", "silver fir needles", "Aiguilles plates en peigne", "Aiguilles aplaties disposées en peigne, face inférieure claire.", "Sapin : Aiguilles pectinées, non piquantes."),
        item("difficile", "Douglas", "Pseudotsuga menziesii", "douglas fir needles", "Aiguilles souples, odeur citronnée", "Aiguilles plates, odorantes, non en peigne strict.", "Douglas : Aiguilles souples, cône à bractées trifides."),
        item("difficile", "If commun", "Taxus baccata", "yew needles", "Aiguilles plates sombres", "Aiguilles plates vert très sombre, baies rouges (arille).", "If : Aiguilles plates, toxique sauf l’arille."),
        item("difficile", "Cèdre de l’Atlas", "Cedrus atlantica", "cedar needles", "Aiguilles en bouquets courts", "Aiguilles courtes groupées en rosettes sur rameaux courts.", "Cèdre : Aiguilles en bouquets, conifère des parcs."),
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
        item("facile", "Cumulus", "Cumulus", "cumulus cloud", "Chou-fleur blanc", "Nuage blanc bourgeonnant à base plate, beau temps souvent.", "Cumulus : Nuage de beau temps en « chou-fleur »."),
        item("facile", "Stratus", "Stratus", "stratus cloud", "Voile gris bas", "Couche grise uniforme, bas dans le ciel, bruine possible.", "Stratus : Couche basse uniforme."),
        item("facile", "Stratocumulus", "Stratocumulus", "stratocumulus", "Dalles grises/blanches", "Bancs ou dalles de nuages bas, peu d’averses.", "Stratocumulus : Galettes nuageuses basses."),
        item("facile", "Brouillard", "Fog", "fog landscape", "Sol invisible, air blanc", "Gouttelettes en suspension au ras du sol, visibilité réduite.", "Brouillard : Stratus au niveau du sol."),
        item("moyen", "Nimbostratus", "Nimbostratus", "nimbostratus", "Pluie continue", "Épaisse couche sombre donnant pluie ou neige prolongée.", "Nimbostratus : Nuage de pluie durable."),
        item("moyen", "Cumulus humilis", "Cumulus humilis", "cumulus humilis", "Petits choux plats", "Cumulus aplatis, peu développés verticalement.", "Cumulus humilis : Beau temps, faible extension verticale."),
        item("moyen", "Cumulus mediocris", "Cumulus mediocris", "cumulus mediocris", "Choux un peu plus hauts", "Cumulus de développement moyen, plus hauts que larges parfois.", "Cumulus mediocris : Étape entre humilis et congestus."),
        item("moyen", "Stratus fractus", "Stratus fractus", "stratus fractus", "Lambeaux bas déchirés", "Fragments de stratus déchirés, souvent sous la pluie.", "Stratus fractus : Lambeaux bas sous précipitations."),
        item("moyen", "Cumulus fractus", "Cumulus fractus", "cumulus fractus", "Chiffons blancs déchirés", "Cumulus en lambeaux, contours déchirés.", "Cumulus fractus : Cumulus fragmentés."),
        item("difficile", "Cumulus congestus", "Cumulus congestus", "cumulus congestus", "Tour en croissance", "Cumulus très développé verticalement, avant orage parfois.", "Cumulus congestus : Tour nuageuse en croissance."),
        item("difficile", "Stratocumulus castellanus", "Stratocumulus castellanus", "stratocumulus castellanus", "Créneaux bas", "Stratocumulus aux sommets en petites tours.", "Stratocumulus castellanus : Créneaux sur une couche basse."),
        item("difficile", "Stratocumulus lenticularis", "Stratocumulus lenticularis", "stratocumulus lenticularis", "Lentille basse", "Banc lenticulaire bas, souvent près des reliefs.", "Stratocumulus lenticularis : Lentille à basse altitude."),
        item("difficile", "Arcus (ligne de grain)", "Arcus", "shelf cloud", "Mur / étagère sous l’orage", "Nuage bas en forme d’étagère ou de rouleau devant l’orage.", "Arcus : Nuage accessoire de grain orageux."),
        item("difficile", "Tuba (ébauche)", "Tuba", "funnel cloud", "Entonnoir sous le nuage", "Colonnette conique sous un cumulus orageux, sans toucher le sol.", "Tuba : Ébauche de trombe / tornade."),
      ],
    },
    {
      id: "moyen",
      label: "Étages moyens",
      items: [
        item("facile", "Altocumulus", "Altocumulus", "altocumulus", "Moutons du ciel", "Bancs de petits flocons ou galettes à moyenne altitude.", "Altocumulus : « Moutons » à moyenne altitude."),
        item("facile", "Altostratus", "Altostratus", "altostratus", "Voile laiteux", "Voile grisâtre à travers lequel le Soleil apparaît flou.", "Altostratus : Voile moyen, Soleil terne."),
        item("moyen", "Altocumulus undulatus", "Altocumulus undulatus", "altocumulus undulatus", "Vagues / ondulations", "Altocumulus disposés en vagues parallèles.", "Altocumulus undulatus : Ciel ondulé."),
        item("moyen", "Altocumulus floccus", "Altocumulus floccus", "altocumulus floccus", "Touffes ouatées", "Touffes cumuliformes à moyenne altitude, base souvent déchirée.", "Altocumulus floccus : Flocons ouatés moyens."),
        item("moyen", "Altostratus translucidus", "Altostratus translucidus", "altostratus translucidus", "Soleil encore visible", "Altostratus assez fin pour laisser voir le Soleil flou.", "Translucidus : Voile moyen encore translucide."),
        item("moyen", "Altostratus opacus", "Altostratus opacus", "altostratus opacus", "Soleil masqué", "Altostratus assez épais pour cacher complètement le Soleil.", "Opacus : Voile moyen opaque."),
        item("difficile", "Altocumulus lenticularis", "Altocumulus lenticularis", "lenticular cloud", "Soucoupe / lentille", "Nuage lenticulaire stationnaire, souvent en montagne.", "Altocumulus lenticularis : Forme en lentille au-dessus des reliefs."),
        item("difficile", "Altocumulus castellanus", "Altocumulus castellanus", "altocumulus castellanus", "Tours dentelées", "Altocumulus aux sommets en créneaux, signe d’instabilité.", "Castellanus : Créneaux annonçant parfois l’orage."),
        item("difficile", "Altocumulus stratiformis", "Altocumulus stratiformis", "altocumulus stratiformis", "Nappe de moutons", "Vaste nappe d’altocumulus en couche.", "Stratiformis : Couche étendue d’altocumulus."),
        item("difficile", "Asperitas", "Asperitas", "asperitas cloud", "Vagues renversées", "Dessous de nuage fortement ondulé, aspect de mer agitée.", "Asperitas : Ondulations spectaculaires sous la couche."),
        item("difficile", "Kelvin-Helmholtz", "Fluctus", "kelvin helmholtz clouds", "Vagues qui déferlent", "Petites vagues en crêtes qui semblent déferler en altitude.", "Fluctus (Kelvin-Helmholtz) : Vagues de cisaillement."),
        item("difficile", "Virga", "Virga", "virga rain", "Traînes qui n’atteignent pas le sol", "Précipitations qui s’évaporent avant d’arriver au sol.", "Virga : Pluie ou neige suspendue sous le nuage."),
      ],
    },
    {
      id: "haut",
      label: "Étages hauts & orage",
      items: [
        item("facile", "Cirrus", "Cirrus", "cirrus cloud", "Filaments blancs", "Nuages fins fibreux de cristaux de glace, très hauts.", "Cirrus : Filaments de glace en altitude."),
        item("facile", "Cumulonimbus", "Cumulonimbus", "cumulonimbus", "Enclume d’orage", "Immense tour orageuse, sommet souvent en enclume.", "Cumulonimbus : Nuage d’orage."),
        item("facile", "Cirrostratus", "Cirrostratus", "cirrostratus", "Halo autour du Soleil", "Voile blanc transparent, halo solaire ou lunaire fréquent.", "Cirrostratus : Voile haut avec halo."),
        item("moyen", "Cirrocumulus", "Cirrocumulus", "cirrocumulus", "Grain de riz / écaille", "Petits flocons blancs très hauts, ciel « pommelé » fin.", "Cirrocumulus : Écailles très hautes."),
        item("moyen", "Cirrus uncinus", "Cirrus uncinus", "cirrus uncinus", "Crochets / virgules", "Cirrus en forme de crochets ou de filaments recourbés.", "Cirrus uncinus : Filaments en crochet."),
        item("moyen", "Cirrus fibratus", "Cirrus fibratus", "cirrus fibratus", "Fils presque droits", "Cirrus en fibres presque rectilignes, sans crochets.", "Cirrus fibratus : Fibres hautes assez droites."),
        item("moyen", "Cirrus spissatus", "Cirrus spissatus", "cirrus spissatus", "Cirrus épais, grisâtre", "Cirrus denses, parfois assez épais pour voiler le Soleil.", "Cirrus spissatus : Cirrus denses, souvent issus d’enclumes."),
        item("moyen", "Cumulonimbus calvus", "Cumulonimbus calvus", "cumulonimbus calvus", "Sommet encore « chauve »", "Cumulonimbus sans enclume fibreuse nette, sommet arrondi.", "Calvus : Orage jeune, sans capillatus."),
        item("difficile", "Cumulonimbus capillatus", "Cumulonimbus capillatus", "cumulonimbus anvil", "Sommet fibreux", "Cumulonimbus à sommet fibreux / enclume bien formée.", "Capillatus : Orage mature à enclume fibreuse."),
        item("difficile", "Contrail (traînée)", "Cirrus aviaticus", "contrail", "Trace d’avion", "Traînée de condensation d’avion, parfois persistante.", "Contrail : Traînée d’avion, parfois classée avec les cirrus."),
        item("difficile", "Mammatus", "Mammatus", "mammatus clouds", "Poches sous l’enclume", "Poches arrondies pendant sous un cumulonimbus.", "Mammatus : Mamelles sous l’enclume d’orage."),
        item("difficile", "Pileus", "Pileus", "pileus cloud", "Calotte sur la tour", "Petit nuage en calotte au-dessus d’un cumulus en croissance.", "Pileus : Capuchon au-dessus d’une tour convective."),
        item("difficile", "Incus (enclume)", "Incus", "anvil cloud", "Enclume étalée", "Sommet de cumulonimbus étalé en enclume par les vents d’altitude.", "Incus : Enclume du cumulonimbus mature."),
        item("difficile", "Circumhorizontal (arc)", "Circumhorizontal arc", "circumhorizontal arc", "Arc coloré horizontal", "Arc aux couleurs de l’arc-en-ciel bas sur l’horizon, dans les cirrus.", "Arc circumhorizontal : Halo coloré dans les cristaux de glace."),
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
        item("facile", "Ammonite", "Ammonoidea", "ammonite fossil", "Spirale côtelée", "Coquille spirale fossile de céphalopode.", "Ammonite : Céphalopode fossile en spirale."),
        item("facile", "Trilobite", "Trilobita", "trilobite fossil", "Trois lobes, segmenté", "Arthropode marin segmenté en trois lobes longitudinaux.", "Trilobite : Arthropode paléozoïque emblématique."),
        item("facile", "Bivalve fossile", "Bivalvia", "fossil bivalve", "Deux valves symétriques", "Coquille à deux valves, souvent dans les calcaires.", "Bivalve fossile : Mollusque à coquille double."),
        item("facile", "Gastéropode fossile", "Gastropoda", "fossil gastropod", "Spirale conique", "Coquille en spirale conique de mollusque.", "Gastéropode fossile : Escargot / coquillage spiralé."),
        item("moyen", "Bélemnite", "Belemnitida", "belemnite fossil", "Rostrum en « balle »", "Rostrum interne en forme de balle / cigare.", "Bélemnite : Céphalopode, rostrum fossilisé."),
        item("moyen", "Oursin fossile", "Echinoidea", "fossil echinoid", "Test rond à plaques", "Test calcaire d’échinide, souvent dans la craie.", "Oursin fossile : Fréquent dans la craie."),
        item("moyen", "Corail fossile", "Anthozoa", "fossil coral", "Structure en colonies / calices", "Squelette calcaire de corail, massif ou branchu.", "Corail fossile : Constructeur de récifs anciens."),
        item("moyen", "Brachiopode", "Brachiopoda", "brachiopod fossil", "Deux valves inégales", "Coquille à plan de symétrie perpendiculaire à la charnière.", "Brachiopode : Très abondant au Paléozoïque."),
        item("moyen", "Nautile fossile", "Nautilida", "nautilus fossil", "Spirale lisse cloisonnée", "Coquille spiralée à cloisons simples, proche du nautile actuel.", "Nautile fossile : Céphalopode à cloisons simples."),
        item("difficile", "Graptolite", "Graptolithina", "graptolite fossil", "Traits / dentelles sur schiste", "Colonies en lignes ou zigzags sur schistes noirs.", "Graptolite : Fossile stratigraphique du Paléozoïque."),
        item("difficile", "Crinoïde", "Crinoidea", "crinoid fossil", "Tige en « empilement »", "Segments de tige en colonne, « lys de mer ».", "Crinoïde : Échinoderme fixe, tige fossilisée."),
        item("difficile", "Orthocère", "Orthocerida", "orthoceras fossil", "Cône droit cloisonné", "Céphalopode à coquille droite et cloisonnée.", "Orthocère : Céphalopode droit du Paléozoïque."),
        item("difficile", "Éponge fossile", "Porifera", "fossil sponge", "Masse poreuse / réseau", "Squelette poreux d’éponge, parfois en silex.", "Éponge fossile : Animal filtreur fossilisé."),
        item("difficile", "Trilobite enroulé", "Trilobita (enrolled)", "enrolled trilobite", "Boule segmentée", "Trilobite fossilisé en position de défense enroulée.", "Trilobite enroulé : Attitude de protection fossilisée."),
      ],
    },
    {
      id: "vertebres",
      label: "Vertébrés",
      items: [
        item("facile", "Dent de requin", "Lamniformes", "shark tooth fossil", "Triangle tranchant", "Dent triangulaire fossilisée, émail brillant.", "Dent de requin : Fossile très courant."),
        item("facile", "Os de dinosaure", "Dinosauria", "dinosaur bone fossil", "Os massif pétrifié", "Fragment osseux fossilisé de grand reptile.", "Os de dinosaure : Vertébré mésozoïque."),
        item("facile", "Poisson fossile", "Osteichthyes", "fossil fish", "Squelette de poisson aplati", "Poisson entier ou en empreinte sur une dalle.", "Poisson fossile : Vertébré aquatique fréquent."),
        item("moyen", "Ichthyosaure", "Ichthyosauria", "ichthyosaur fossil", "Reptile marin en forme de dauphin", "Squelette de reptile marin hydrodynamique.", "Ichthyosaure : Reptile marin du Mésozoïque."),
        item("moyen", "Ptérosaure", "Pterosauria", "pterosaur fossil", "Aile membraneuse fossile", "Reptile volant, longs doigts soutenant l’aile.", "Ptérosaure : Reptile volant (pas un dinosaure)."),
        item("moyen", "Plésiosaure", "Plesiosauria", "plesiosaur fossil", "Long cou, quatre nageoires", "Reptile marin à long cou et membres en pagaies.", "Plésiosaure : Reptile marin du Mésozoïque."),
        item("moyen", "Dent de mammouth", "Mammuthus", "mammoth tooth fossil", "Molaire à lames", "Grande molaire à plaques d’émail, herbivore.", "Dent de mammouth : Proboscidien de l’ère glaciaire."),
        item("moyen", "Défense d’ivoire", "Mammuthus / Elephantidae", "mammoth tusk fossil", "Longue défense courbée", "Défense allongée fossilisée ou subfossile.", "Défense : Ivoire de proboscidien."),
        item("difficile", "Archaeopteryx", "Archaeopteryx", "archaeopteryx fossil", "Plumes + dents", "Fossile à plumes et caractères reptiliens.", "Archaeopteryx : Fossile « entre » dinosaure et oiseau."),
        item("difficile", "Mégalodon (dent)", "Otodus megalodon", "megalodon tooth", "Énorme dent dentelée", "Très grande dent de requin fossile.", "Mégalodon : Dent géante de requin éteint."),
        item("difficile", "Mosasaure", "Mosasauridae", "mosasaur fossil", "Grand reptile marin denté", "Squelette de grand reptile marin du Crétacé.", "Mosasaure : Prédateur marin du Crétacé."),
        item("difficile", "Tortue fossile", "Testudines", "fossil turtle", "Carapace fossilisée", "Carapace ou squelette de tortue pétrifié.", "Tortue fossile : Reptile à carapace."),
        item("difficile", "Amphibien fossile", "Temnospondyli", "amphibian fossil", "Tête plate, membres courts", "Squelette d’amphibien ancien, souvent à large crâne.", "Amphibien fossile : Vertébré des marécages anciens."),
        item("difficile", "Crâne de primate", "Primates", "primate skull fossil", "Crâne à orbites frontales", "Crâne fossilisé de primate (dont hominidés).", "Crâne de primate : Vertébré proche de la lignée humaine."),
      ],
    },
    {
      id: "plantes-traces",
      label: "Plantes & traces",
      items: [
        item("facile", "Empreinte de fougère", "Pteridophyta", "fern fossil", "Feuille découpée sur schiste", "Empreinte de fronde de fougère sur roche.", "Fougère fossile : Très fréquente au Carbonifère."),
        item("facile", "Tronc silicifié", "Petrified wood", "petrified wood", "Bois devenu pierre", "Bois dont la matière a été remplacée par de la silice.", "Bois pétrifié : Structure du bois encore visible."),
        item("facile", "Empreinte de pas", "Ichnite", "dinosaur footprint fossil", "Trace de marche", "Empreinte de pas fossilisée dans un sédiment.", "Ichnite : Trace fossile (comportement)."),
        item("moyen", "Cône fossile", "Coniferophyta", "fossil pine cone", "Cône de conifère pétrifié", "Cône ou empreinte de cône de conifère.", "Cône fossile : Reproduction des conifères anciens."),
        item("moyen", "Calamites", "Calamites", "calamites fossil", "Tige articulée de prêle géante", "Tige segmentée de prêle arborescente du Carbonifère.", "Calamites : Ancêtre géant des prêles."),
        item("moyen", "Lépidodendron", "Lepidodendron", "lepidodendron fossil", "Écorce en losanges", "Écorce fossilisée à motifs losangiques d’arbre-échelle.", "Lépidodendron : Arbre du Carbonifère à écorce caractéristique."),
        item("moyen", "Feuille de ginkgo", "Ginkgo", "ginkgo fossil leaf", "Éventail nervuré", "Feuille en éventail fossilisée, proche du ginkgo actuel.", "Ginkgo fossile : Feuille en éventail."),
        item("difficile", "Coprolithe", "Coprolite", "coprolite", "Excrément fossilisé", "Matière fécale fossilisée, parfois avec restes de repas.", "Coprolithe : Crotte fossile, précieuse pour la paléoécologie."),
        item("difficile", "Ambre (inclusion)", "Amber", "amber insect fossil", "Insecte dans la résine", "Résine fossilisée piégeant parfois un insecte.", "Ambre : Résine fossilisée, inclusions célèbres."),
        item("difficile", "Stromatolite", "Stromatolite", "stromatolite", "Couches en chou-fleur / dôme", "Structure laminée produite par des tapis microbiens.", "Stromatolite : Parmi les plus anciens indices de vie."),
        item("difficile", "Gastrolithe", "Gastrolith", "gastrolith stones", "Cailloux polis d’estomac", "Pierres polies avalées pour broyer les aliments.", "Gastrolithe : Cailloux digestifs fossilisés."),
        item("difficile", "Terrier fossile", "Burrow fossil", "fossil burrow", "Tube / galerie dans la roche", "Trace de galerie creusée par un animal dans le sédiment.", "Terrier fossile : Trace de comportement (ichnofossile)."),
        item("difficile", "Racine fossilisée", "Stigmaria", "stigmaria fossil", "Racines / bases d’arbre", "Système racinaire fossilisé d’arbres du Carbonifère.", "Stigmaria : Racines de lépidodendrons."),
        item("difficile", "Piste de reptile", "Tetrapod trackway", "reptile trackway fossil", "Suite d’empreintes alignées", "Série d’empreintes formant une piste de marche.", "Piste : Séquence d’empreintes fossilisées."),
      ],
    },
  ],
});

const counts = {
  bebes: writeQuiz(bebes),
  feuilles: writeQuiz(feuilles),
  nuages: writeQuiz(nuages),
  fossiles: writeQuiz(fossiles),
};

// Patch catalog.json descriptions with counts
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

const patch = [
  ["bebes-animaux", `Photo d’un petit : retrouve le nom du bébé (${counts.bebes} entrées).`],
  ["feuilles-arbres", `Reconnaître un arbre uniquement par sa feuille (${counts.feuilles} entrées).`],
  ["nuages", `Types de nuages : cumulus, cirrus, cumulonimbus… (${counts.nuages} entrées).`],
  ["fossiles", `Ammonites, trilobites, dents et empreintes fossiles (${counts.fossiles} entrées).`],
];

for (const [id, description] of patch) {
  const node = findNode(catalog.domains, id);
  if (node) node.description = description;
}

writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log("updated catalog.json");
