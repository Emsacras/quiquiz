/**
 * Génère : coquillages, traces-animaux + patch catalogue.
 * Usage: node scripts/build-shells-tracks.mjs
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

function item(difficulte, nom_commun, nom_scientifique, imageQuery, indice, description, explication) {
  return { difficulte, nom_commun, nom_scientifique, imageQuery, indice, description, explication };
}

function buildQuiz({ id, categorie, description, groups }) {
  const allNames = groups.flatMap((g) => g.items.map((i) => i.nom_commun));
  const groupes = groups.map((group) => {
    const names = group.items.map((x) => x.nom_commun);
    const questions = group.items.map((entry, index) => {
      const qid = `${group.id}${index + 1}`;
      let distractors = pickDistractors(names, entry.nom_commun, qid);
      if (distractors.length < 3) distractors = pickDistractors(allNames, entry.nom_commun, qid);
      const options = shuffleOptions([entry.nom_commun, ...distractors].slice(0, 4), qid);
      const q = {
        id: qid,
        difficulte: entry.difficulte,
        nom_commun: entry.nom_commun,
        nom_scientifique: entry.nom_scientifique,
        groupe: group.id,
        options,
        indice: entry.indice,
        description: entry.description,
        explication: entry.explication,
      };
      if (entry.imageQuery) q.imageQuery = entry.imageQuery;
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

const coquillages = buildQuiz({
  id: "coquillages",
  categorie: "Coquillages",
  description: "Reconnais les coquillages de la grève et de la mer (spirales, bivalves, divers).",
  groups: [
    {
      id: "gasteropodes",
      label: "Gastéropodes",
      items: [
        item("facile", "Patelle", "Patella vulgata", "limpet shell", "Chapeau chinois collé au rocher", "Coquille conique basse, souvent sur les rochers battus.", "Patelle : Gastéropode collé aux rochers."),
        item("facile", "Bigorneau", "Littorina littorea", "periwinkle shell", "Petite spirale sombre", "Petite coquille spiralée sombre des estrans.", "Bigorneau : Petit gastéropode des zones de marée."),
        item("facile", "Buccin", "Buccinum undatum", "whelk shell", "Grosse spirale côtelée", "Grande coquille spiralée, souvent échouée après tempête.", "Buccin : Gros bulot des mers froides."),
        item("facile", "Escargot de mer", "Nucella lapillus", "dog whelk shell", "Spirale pointue des rochers", "Coquille fusiforme des rivages rocheux.", "Pourpre / nucelle : Gastéropode prédateur des estrans."),
        item("moyen", "Ormeau", "Haliotis tuberculata", "abalone shell", "Oreille nacrée percée", "Coquille en oreille, intérieur nacré, trous respiratoires.", "Ormeau : Gastéropode à coquille nacrée."),
        item("moyen", "Crépidule", "Crepidula fornicata", "slipper limpet", "Sabot / pantoufle", "Coquille en forme de pantoufle, souvent empilée.", "Crépidule : Gastéropode en « pantoufle »."),
        item("moyen", "Natice", "Euspira catena", "necklace shell", "Boule lisse globuleuse", "Coquille presque sphérique, très lisse.", "Natice : Gastéropode prédateur des sables."),
        item("moyen", "Turritelle", "Turritella communis", "turritella shell", "Tour très allongée", "Spirale très haute et étroite, en tour.", "Turritelle : Coquille en longue tour."),
        item("moyen", "Cône", "Conus", "cone shell", "Cône pointu coloré", "Coquille conique, souvent à motifs, tipique des mers chaudes.", "Cône : Gastéropode venimeux tropical."),
        item("difficile", "Porcelaine", "Cypraea", "cowrie shell", "Œuf brillant sans spire visible", "Coquille ovoïde très lisse, ouverture dentée en dessous.", "Porcelaine : Coquillage brillant des mers chaudes."),
        item("difficile", "Triton", "Charonia", "triton shell", "Grande trompe spiralée", "Très grande coquille spiralée, autrefois utilisée en trompe.", "Triton : Grand gastéropode des mers chaudes."),
        item("difficile", "Murex", "Murex", "murex shell", "Épines / ailes sur la spirale", "Coquille spiralée ornée d’épines ou de lamelles.", "Murex : Gastéropode épineux, pourpre antique."),
        item("difficile", "Janthine", "Janthina", "violet snail shell", "Spirale violette fragile", "Petite coquille violette, flottante en haute mer.", "Janthine : Escargot violet pélagique."),
        item("difficile", "Cauris monétaire", "Monetaria moneta", "money cowrie", "Petite porcelaine bombée", "Petite cauri autrefois utilisée comme monnaie.", "Cauris : Petite porcelaine « monétaire »."),
      ],
    },
    {
      id: "bivalves",
      label: "Bivalves",
      items: [
        item("facile", "Moule", "Mytilus edulis", "mussel shell", "Valve allongée bleutée", "Valve sombre allongée, souvent en groupes sur les pieux.", "Moule : Bivalve fixé par des filaments."),
        item("facile", "Huître", "Ostrea edulis", "oyster shell", "Valve irrégulière feuilletée", "Coquille irrégulière, feuillets calcaires empilés.", "Huître : Bivalve irrégulier des estran."),
        item("facile", "Coque", "Cerastoderma edule", "cockle shell", "Côtes rayonnantes serrées", "Valve ronde à côtes marquées, typique du sable.", "Coque : Bivalve côtelé des sables."),
        item("facile", "Palourde", "Ruditapes philippinarum", "clam shell", "Ovale lisse, charnière nette", "Valve ovale, surface plutôt lisse, fouisseuse.", "Palourde : Bivalve des sables et vases."),
        item("moyen", "Praire", "Venus verrucosa", "warty venus shell", "Ovale à stries concentriques", "Valve ovale épaisse, stries concentriques marquées.", "Praire : Bivalve des fonds sableux."),
        item("moyen", "Pétoncle", "Aequipecten opercularis", "queen scallop shell", "Éventail à oreillettes", "Valve en éventail avec deux « oreilles » près de la charnière.", "Pétoncle : Petit peigne / coquille Saint-Jacques."),
        item("moyen", "Saint-Jacques", "Pecten maximus", "scallop shell", "Grand éventail classique", "Grande valve en éventail, symbole des pèlerins.", "Coquille Saint-Jacques : Grand peigne."),
        item("moyen", "Couteau", "Ensis", "razor clam shell", "Allongé comme un rasoir", "Valve très allongée, droite ou légèrement courbe.", "Couteau : Bivalve fouisseur allongé."),
        item("moyen", "Amande de mer", "Glycymeris", "dog cockle shell", "Ronde épaisse", "Valve presque circulaire, épaisse et lourde.", "Amande de mer : Bivalve rond des sables."),
        item("difficile", "Huître perlière", "Pinctada", "pearl oyster shell", "Valve nacrée irrégulière", "Coquille irrégulière à intérieur nacré, perles.", "Huître perlière : Bivalve nacré tropical."),
        item("difficile", "Tridacne", "Tridacna", "giant clam shell", "Énorme valve ondulée", "Très grande valve ondulée des récifs tropicaux.", "Tridacne : Bénitier géant."),
        item("difficile", "Spisule", "Spisula", "surf clam shell", "Triangle ovale, fouisseur", "Valve triangulaire-ovale des zones de ressac.", "Spisule : Bivalve des sables battus."),
        item("difficile", "Lutraire", "Lutraria", "otter shell", "Allongée, bouts ouverts", "Valve allongée aux extrémités légèrement béantes.", "Lutraire : Bivalve fouisseur allongé."),
        item("difficile", "Modiole", "Modiolus", "horse mussel shell", "Moule plus renflée", "Proche de la moule, plus ventrue, souvent plus au large.", "Modiole : Grande moule des fonds."),
      ],
    },
    {
      id: "divers",
      label: "Divers & tests",
      items: [
        item("facile", "Test d’oursin", "Echinoidea", "sea urchin test", "Boule calcaire à plaques", "Squelette sphérique d’oursin sans piquants.", "Test d’oursin : Carcasse calcaire échouée."),
        item("facile", "Opercule", "Operculum", "snail operculum", "« Ongle » qui ferme la coquille", "Plaque cornée ou calcaire qui ferme l’ouverture.", "Opercule : Couvercle de certains gastéropodes."),
        item("facile", "Tube de serpule", "Serpulidae", "serpulid tube", "Petit tuyau calcaire collé", "Tube calcaire blanc fixé aux rochers ou coquilles.", "Serpule : Tube de ver marin."),
        item("moyen", "Nautile", "Nautilus", "nautilus shell", "Spirale cloisonnée nacrée", "Grande spirale à cloisons, intérieur nacré.", "Nautile : Céphalopode à coquille externe."),
        item("moyen", "Spirule", "Spirula spirula", "spirula shell", "Petite spirale ouverte", "Petite spirale plane, souvent blanche, échouée.", "Spirule : Coquille interne de céphalopode."),
        item("moyen", "Os de seiche", "Sepia officinalis", "cuttlebone", "Plaque blanche poreuse", "Squelette interne blanc et poreux de la seiche.", "Os de seiche : Flotteur interne de seiche."),
        item("moyen", "Bec de calmar", "Teuthida", "squid beak", "Petit bec corné", "Pièce cornée en forme de bec de perroquet.", "Bec de calmar : Mandibule de céphalopode."),
        item("moyen", "Dentale", "Dentalium", "tusk shell", "Dent / défense creuse", "Tube légèrement courbe en forme de défense d’éléphant.", "Dentale : Scaphopode en tube."),
        item("difficile", "Argonaute", "Argonauta", "paper nautilus shell", "Barque fine transparent", "Coquille très fine en forme de barque (femelle).", "Argonaute : « Nautile de papier »."),
        item("difficile", "Balane", "Balanus", "barnacle shell", "Volcans collés au support", "Petites coquilles coniques fixées, plaques calcaires.", "Balane : Crustacé fixé (pas un mollusque)."),
        item("difficile", "Poulpe (coquille interne)", "Octopus", "octopus stylets", "Petites baguettes internes", "Restes cornés internes, peu visibles, parfois échoués.", "Stylet de poulpe : Vestige interne."),
        item("difficile", "Violets (tunique)", "Microcosmus", "sea squirt tunic", "Sac rugueux orange/brun", "Tunique coriace d’ascidie, souvent sur les quais.", "Violet : Ascidie comestible / échouée."),
        item("difficile", "Corail (fragment)", "Anthozoa", "coral fragment beach", "Branche calcaire poreuse", "Fragment calcaire de corail sur la plage.", "Corail : Squelette colonial échoué."),
        item("difficile", "Bryozoaire", "Bryozoa", "bryozoan colony", "Dentelle calcaire en croûte", "Colonies en dentelle ou croûte sur les coquillages.", "Bryozoaire : Colonie en dentelle marine."),
      ],
    },
  ],
});

const traces = buildQuiz({
  id: "traces-animaux",
  categorie: "Traces d’animaux",
  description: "Reconnais qui est passé : empreintes, crottes, nids et autres indices.",
  groups: [
    {
      id: "empreintes-mam",
      label: "Empreintes de mammifères",
      items: [
        item("facile", "Empreinte de chien", "Canis familiaris", "dog paw print mud", "Coussinets + griffes visibles", "Empreinte à 4 doigts avec griffes marquées, coussinet central.", "Chien : Griffes souvent visibles, piste irregular."),
        item("facile", "Empreinte de chat", "Felis catus", "cat paw print mud", "Ronde, griffes rétractées", "Empreinte ronde sans griffes (rétractées), 4 doigts.", "Chat : Pas de griffes sur la piste."),
        item("facile", "Empreinte de sanglier", "Sus scrofa", "wild boar track", "Sabots fendus larges", "Deux sabots larges, souvent avec ergots derrière.", "Sanglier : Sabot double large, ergots fréquents."),
        item("facile", "Empreinte de chevreuil", "Capreolus capreolus", "roe deer track", "Petits sabots en cœur", "Deux sabots fins formant un cœur allongé.", "Chevreuil : Petite piste cervidé."),
        item("moyen", "Empreinte de cerf", "Cervus elaphus", "red deer track", "Grands sabots de cervidé", "Sabots plus grands et plus larges que le chevreuil.", "Cerf : Grande piste de cervidé."),
        item("moyen", "Empreinte de renard", "Vulpes vulpes", "fox track snow", "4 doigts, piste alignée", "Proche du chien mais plus ovale, piste souvent en ligne.", "Renard : Empreinte canine légère, piste droite."),
        item("moyen", "Empreinte de blaireau", "Meles meles", "badger paw print", "Plantigrade large", "Empreinte large, 5 doigts et griffes longues.", "Blaireau : Large patte plantigrade."),
        item("moyen", "Empreinte de lièvre", "Lepus europaeus", "hare track snow", "Grands pieds arrière", "Deux grands pieds arrière dépassant les antérieurs.", "Lièvre : Bond avec empreintes arrière longues."),
        item("moyen", "Empreinte de loutre", "Lutra lutra", "otter track mud", "Palmé, 5 doigts", "Doigts palmés, souvent près de l’eau.", "Loutre : Piste palmée au bord de l’eau."),
        item("difficile", "Empreinte de loup", "Canis lupus", "wolf track snow", "Grande piste canine", "Plus grande qu’un chien moyen, coussinets marqués.", "Loup : Grande empreinte canine sauvage."),
        item("difficile", "Empreinte d’ours", "Ursus arctos", "bear paw print mud", "Très large, 5 doigts", "Énorme patte plantigrade à 5 doigts.", "Ours : Empreinte massive."),
        item("difficile", "Empreinte de castor", "Castor fiber", "beaver track mud", "Pieds palmés + queue", "Pieds arrière palmés, parfois traînée de queue.", "Castor : Piste palmée près des cours d’eau."),
        item("difficile", "Empreinte de martre", "Martes martes", "marten track snow", "Petite mustélidé en 2-2", "Petites empreintes souvent groupées par bonds.", "Martre : Petite piste de mustélidé arboricole."),
        item("difficile", "Empreinte de sanglier juvénile", "Sus scrofa juvenile", "wild boar piglet track", "Petits sabots fendus", "Comme le sanglier, mais nettement plus petits.", "Marcassin : Petite piste de sanglier."),
      ],
    },
    {
      id: "empreintes-autres",
      label: "Oiseaux & autres",
      items: [
        item("facile", "Empreinte de canard", "Anas platyrhynchos", "duck footprint mud", "Palmé en triangle", "Trois doigts palmés vers l’avant.", "Canard : Empreinte palmée classique."),
        item("facile", "Empreinte de pigeon", "Columba livia", "pigeon footprint", "3 doigts avant, 1 arrière", "Piste d’oiseau marcheur, doigt arrière marqué.", "Pigeon : Empreinte d’oiseau terrestre."),
        item("facile", "Empreinte de héron", "Ardea cinerea", "heron footprint mud", "Très longs doigts", "Grands doigts longs, souvent en zone humide.", "Héron : Longue empreinte d’échassier."),
        item("moyen", "Empreinte de faisan", "Phasianus colchicus", "pheasant footprint", "3 doigts, piste de gallinacé", "Doigts assez longs, marche au sol.", "Faisan : Piste de galliforme."),
        item("moyen", "Empreinte de goéland", "Larus", "gull footprint sand", "Palmé sur le sable", "Doigts palmés, fréquente sur la plage.", "Goéland : Empreinte palmée littorale."),
        item("moyen", "Empreinte de bécasse", "Scolopax rusticola", "woodcock footprint", "Doigts fins en forêt", "Petite piste d’échassier en sous-bois humide.", "Bécasse : Empreinte fine de limicole forestier."),
        item("moyen", "Empreinte de grenouille", "Anura", "frog footprint mud", "Petits bonds, pieds palmés", "Petites empreintes groupées, sometimes palmées.", "Grenouille : Petite piste d’amphibien."),
        item("moyen", "Empreinte de tortue", "Testudo", "tortoise track sand", "Trainée + pattes", "Pistes de pattes avec trainée centrale possible.", "Tortue : Empreinte lente, parfois trainée."),
        item("difficile", "Empreinte de pic", "Picidae", "woodpecker footprint bark", "Sur écorce / vertical", "Traces de griffes sur tronc, rarement au sol.", "Pic : Indices sur l’écorce plus que sur le sol."),
        item("difficile", "Empreinte de cormoran", "Phalacrocorax", "cormorant footprint", "Palmé, doigt arrière inclus", "Palme complète incluant le doigt arrière.", "Cormoran : Totipalme (4 doigts reliés)."),
        item("difficile", "Empreinte de ragondin", "Myocastor coypus", "coypu track mud", "5 doigts, près de l’eau", "Grande piste de rongeur semi-aquatique.", "Ragondin : Empreinte de gros rongeur aquatique."),
        item("difficile", "Empreinte de vipère", "Vipera", "snake track sand", "Sillon sinueux", "Trace sinueuse sans pattes, dans sable ou poussière.", "Serpent : Sillage ondulé."),
        item("difficile", "Empreinte d’écureuil", "Sciurus vulgaris", "squirrel track snow", "4 pattes groupées en bond", "Empreintes groupées, antérieurs plus petits.", "Écureuil : Bonds avec 4 empreintes groupées."),
        item("difficile", "Empreinte de hérisson", "Erinaceus europaeus", "hedgehog track mud", "Petits doigts nombreux", "Petite piste plantigrade à doigts courts.", "Hérisson : Petite empreinte d’insectivore."),
      ],
    },
    {
      id: "autres-indices",
      label: "Autres indices",
      items: [
        item("facile", "Crotte de sanglier", "Sus scrofa scat", "wild boar scat", "Boudins sombres en tas", "Excréments en boudins, souvent fibreux.", "Crotte de sanglier : Indice fréquent en forêt."),
        item("facile", "Fiente d’oiseau", "Bird droppings", "bird dropping leaf", "Tache blanche / gris", "Déjection claire, souvent sur feuilles ou voitures.", "Fiente : Indice simple de présence d’oiseaux."),
        item("facile", "Nid d’oiseau", "Bird nest", "bird nest tree", "Coupe de brindilles", "Assemblage de brindilles / mousses dans un arbre.", "Nid : Construction pour les œufs / oisillons."),
        item("moyen", "Terrier de renard", "Vulpes vulpes den", "fox den entrance", "Trou avec déblais", "Entrée de terrier, terre remuée, restes possibles.", "Terrier : Gîte souterrain."),
        item("moyen", "Crotte de renard", "Vulpes vulpes scat", "fox scat trail", "Boudin effilé à bout pointu", "Crotte allongée, souvent sur un plot bien visible.", "Crotte de renard : Marquage de territoire."),
        item("moyen", "Pomme de pin rongée", "Sciurus / woodpecker pinecone", "chewed pine cone", "Écailles arrachées", "Cône démoli pour les graines, travail de rongeur ou pic.", "Cône rongé : Repas d’écureuil / oiseau."),
        item("moyen", "Bois frotté", "Deer rub tree", "deer rub bark", "Écorce frottée / cassée", "Tronc écorcé par les bois d’un cervidé.", "Frottis : Marque de cervidé."),
        item("moyen", "Pelote de réjection", "Owl pellet", "owl pellet", "Boule de poils et os", "Masse régurgitée contenant poils, os, plumes.", "Pelote : Rejet d’un rapace nocturne."),
        item("difficile", "Coulée de limace", "Slug trail", "slug slime trail", "Filet argenté brillant", "Trainée de mucus séché sur une surface.", "Coulée : Passage de limace / escargot."),
        item("difficile", "Galerie de scolyte", "Bark beetle gallery", "bark beetle gallery", "Labyrinthe sous l’écorce", "Traces en galeries sous l’écorce d’un arbre mort.", "Scolyte : Galeries d’insectes xylophages."),
        item("difficile", "Plume au sol", "Bird feather ground", "feather on ground", "Plume isolée", "Plume tombée, indice d’espèce selon forme et couleur.", "Plume : Indice simple mais utile."),
        item("difficile", "Restes de repas (coquille)", "Snail shell predation", "broken snail shell thrush", "Coquille d’escargot cassée", "Coquilles brisées sur une pierre (« enclume »).", "Restes : Repas de grive / prédateur."),
        item("difficile", "Passage / coulée", "Animal trail vegetation", "animal trail forest", "Sentier bas dans la végétation", "Chemin tassé utilisé régulièrement par la faune.", "Coulée : Sentier d’animaux sauvages."),
        item("difficile", "Écorçage de castor", "Beaver gnawed tree", "beaver chewed tree", "Tronc taillé en pointe", "Bois taillé en crayon, copeaux au pied.", "Castor : Arbres rongés caractéristiques."),
      ],
    },
  ],
});

const nShells = writeQuiz(coquillages);
const nTracks = writeQuiz(traces);

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

function ensureChild(parent, child) {
  if (!parent.children) parent.children = [];
  const existing = parent.children.find((c) => c.id === child.id);
  if (existing) Object.assign(existing, child);
  else parent.children.push(child);
}

const biologie = findNode(catalog.domains, "biologie");
const animaux = findNode(catalog.domains, "animaux");

if (biologie) {
  ensureChild(biologie, {
    id: "coquillages",
    nom: "Coquillages",
    fichier: "data/coquillages.json",
    description: `Coquillages de la grève et de la mer (${nShells} entrées).`,
    regions: ["france", "monde"],
  });
}

if (animaux) {
  ensureChild(animaux, {
    id: "traces-animaux",
    nom: "Traces d’animaux",
    fichier: "data/traces-animaux.json",
    description: `Empreintes, crottes, nids et autres indices (${nTracks} entrées).`,
    regions: ["france", "monde"],
  });
}

writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log("updated catalog.json");
