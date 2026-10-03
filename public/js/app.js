import {
  creditHref,
  creditLabel,
  getSexImages,
  getSpeciesAudio,
  getSpeciesImages,
  getVernacularImage,
  metaForUrl,
  pickRandomImage,
  preloadSpecies,
  preloadSpeciesAudio,
  setCapitalImages,
  setFlagImages,
  setFruitImages,
  setMineralImages,
  setOutlineMaps,
  setSafeFish,
} from "./images.js";
import { getBest, recordScore } from "./scores.js";
import { startOnboarding } from "./onboarding.js";
import { loadAdminSession, syncPhotoModFromImg } from "./admin-mod.js";
import { attachReportControl, hydrateReportedTitles } from "./report.js";
import { dueCards, dueCount, markCardAgain, markCardOk, upsertMissedCards } from "./learning.js";
import {
  dailySeed,
  getDailyResult,
  getStreak,
  listBadges,
  onQuizFinished,
  saveDailyResult,
  seededShuffle,
} from "./progress.js";
import { onHashChange, parseHash, setHashRoute } from "./router.js";
import {
  collectLeaves,
  findNodeById,
  findNodeByPath,
  flattenCatalogLeaves,
  isFolder,
  isLeaf,
  leafDisplayLabel,
  leavesForRegion,
  listRegions,
  normalizeCatalog,
  parseRegionSessionId,
  playableLeaves,
  regionSessionId,
} from "./catalog-nav.js";

const OPTION_LETTERS = ["a", "b", "c", "d"];

const MASCOT = {
  idle: "assets/mascot/cui-cui.png",
  think: "assets/mascot/cui-cui-think.png",
  love: "assets/mascot/love.png",
  point: "assets/mascot/point-left.png",
  investigator: "assets/mascot/investigator.png",
  victory: "assets/mascot/victory.png",
  cool: "assets/mascot/flexing-cool.png",
  sleepy: "assets/mascot/sleepy.png",
  fail: "assets/mascot/fail.png",
};

function mascotImg(src, className = "results-mascot", width = "120") {
  return h("img", {
    class: className,
    src,
    alt: "",
    width,
    height: width,
    decoding: "async",
  });
}

function resultsMascot(percent, perfect) {
  if (perfect) return MASCOT.love;
  if (percent >= 80) return MASCOT.victory;
  if (percent >= 50) return MASCOT.cool;
  return MASCOT.sleepy;
}

function feedbackHead(correct) {
  return h(
    "div",
    { class: "feedback-head" },
    mascotImg(correct ? MASCOT.victory : MASCOT.fail, "feedback-mascot", "56"),
    h("h2", { text: correct ? "Bonne réponse" : "Mauvaise réponse" }),
  );
}

function updateShownCredit(url) {
  const credit = document.querySelector("[data-credit]");
  if (!credit || !url) return;
  const meta = metaForUrl(url);
  const label = creditLabel(meta, quizCopy().media === "carte" ? "carte" : "photo");
  const href = creditHref(meta);
  credit.replaceChildren();
  if (href) {
    credit.append(
      h("a", {
        class: "credit-link",
        href,
        target: "_blank",
        rel: "noopener noreferrer",
        text: label,
      }),
    );
  } else {
    credit.textContent = label;
  }
}

function attachPlayerMediaTools(frame, img, scientificName, onSkip) {
  if (!frame || !img || !scientificName) return;
  const url = img.currentSrc || img.src;
  syncPhotoModFromImg(frame, img, scientificName, ({ action }) => {
    if (action === "blacklist") onSkip?.();
  });
  attachReportControl(frame, {
    name: scientificName,
    url,
    title: img.dataset.photoTitle || metaForUrl(url).title,
    categoryId: state.category?.id || "",
    onReported: () => onSkip?.(),
  });
  updateShownCredit(url);
}

function showBadgeToasts(badges) {
  if (!badges?.length) return;
  const host = document.getElementById("badge-toasts") || (() => {
    const node = h("div", { id: "badge-toasts", class: "badge-toasts", "aria-live": "polite" });
    document.body.append(node);
    return node;
  })();
  for (const badge of badges) {
    const toast = h(
      "div",
      { class: "badge-toast" },
      mascotImg(badge.pose || MASCOT.victory, "badge-toast-mascot", "48"),
      h("div", null, h("strong", { text: "Badge débloqué" }), h("p", { text: badge.label })),
    );
    host.append(toast);
    setTimeout(() => toast.remove(), 4200);
  }
}

function badgesStrip() {
  const badges = listBadges();
  const streak = getStreak();
  return h(
    "section",
    { class: "badges-strip" },
    h("p", { class: "meta", text: streak ? `Série : ${streak} jour${streak > 1 ? "s" : ""}` : "Série : 0 jour" }),
    h(
      "div",
      { class: "badge-list" },
      badges.map((badge) =>
        h("span", {
          class: badge.unlocked ? "badge-pill is-on" : "badge-pill",
          text: badge.label,
          title: badge.unlocked ? "Débloqué" : "Verrouillé",
        }),
      ),
    ),
  );
}

function syncRouteFromScreen() {
  if (!state.category) {
    setHashRoute({ name: "home" });
    return;
  }
  if (screen === "levels" || screen === "preparing" || screen === "quiz" || screen === "results") {
    setHashRoute({ name: "levels", categoryId: state.category.id });
    return;
  }
  if (screen === "reference") {
    setHashRoute({ name: "reference", categoryId: state.category.id });
    return;
  }
  if (screen === "fiche" && state.fiche) {
    setHashRoute({
      name: "fiche",
      categoryId: state.category.id,
      scientificName: state.fiche.nom_scientifique,
    });
    return;
  }
  if (screen === "revise") {
    setHashRoute({ name: "revise", categoryId: state.category.id });
  }
}

function catalogDomains() {
  return Array.isArray(state.catalog?.domains) ? state.catalog.domains : [];
}

function rememberCategory(category) {
  if (!category?.id) return category;
  const index = state.categories.findIndex((item) => item.id === category.id);
  if (index >= 0) state.categories[index] = category;
  else state.categories.push(category);
  return category;
}

async function buildMergedCategory(sessionId, sessionLabel, leaves, description = "") {
  const playable = playableLeaves(leaves);
  if (!playable.length) return null;
  if (playable.length === 1) {
    const single = await loadCategory(playable[0].fichier);
    return single || null;
  }

  const groupes = [];
  const questions = [];
  for (const leaf of playable) {
    const loaded = await loadCategory(leaf.fichier);
    if (!loaded?.questions?.length) continue;
    const groupId = leaf.id;
    const mediaKind = mediaKindForQuizId(loaded.id);
    const tagged = loaded.questions.map((question) => ({
      ...question,
      groupe: groupId,
      sourceQuizId: loaded.id,
      mediaKind,
    }));
    groupes.push({
      id: groupId,
      label: leafDisplayLabel(leaf),
      defaut: true,
      questions: tagged,
    });
    questions.push(...tagged);
  }
  if (!questions.length) return null;
  return {
    id: sessionId,
    categorie: sessionLabel,
    description: description || "",
    groupes,
    questions,
    _merged: true,
  };
}

async function openMergedLeaves(sessionId, sessionLabel, leaves, description = "") {
  try {
    const playable = playableLeaves(leaves);
    if (!playable.length) {
      state.notice = "Aucun quiz jouable ici pour le moment.";
      mount();
      return;
    }
    if (playable.length === 1) {
      await openQuizFile(playable[0].fichier);
      return;
    }
    const merged = await buildMergedCategory(sessionId, sessionLabel, leaves, description);
    if (!merged) {
      state.notice = "Impossible de fusionner ces quiz.";
      mount();
      return;
    }
    rememberCategory(merged);
    openCategory(merged);
  } catch {
    state.notice = "Impossible de charger ces quiz.";
    mount();
  }
}

async function ensureCategoryById(categoryId) {
  if (!categoryId) return null;
  const resolvedId = CATALOG_ID_ALIASES[categoryId] || categoryId;
  let category = state.categories.find(
    (item) => item.id === categoryId || item.id === resolvedId
  );
  if (category) return category;

  const regionId = parseRegionSessionId(categoryId);
  if (regionId) {
    const leaves = leavesForRegion(catalogDomains(), regionId);
    const meta = listRegions(catalogDomains()).find((item) => item.id === regionId);
    const merged = await buildMergedCategory(
      categoryId,
      meta?.nom || regionId,
      leaves,
      meta?.description || ""
    );
    if (merged?._merged) return rememberCategory(merged);
    if (merged) return rememberCategory(merged);
  }

  const folder = findNodeById(catalogDomains(), categoryId);
  if (folder && isFolder(folder)) {
    const leaves = collectLeaves(folder);
    const merged = await buildMergedCategory(
      folder.id,
      folder.nom,
      leaves,
      folder.description || ""
    );
    if (merged?._merged) return rememberCategory(merged);
    if (merged) return rememberCategory(merged);
  }

  for (const entry of flattenCatalogLeaves(state.catalog)) {
    const loaded = await loadCategory(entry.fichier);
    if (loaded?.id === categoryId || loaded?.id === resolvedId) {
      return rememberCategory(loaded);
    }
    if (entry.id === categoryId || CATALOG_ID_ALIASES[entry.id] === loaded?.id) {
      return rememberCategory(loaded);
    }
  }
  return null;
}

function optionButtons(options, onPick) {
  return (options || []).map((option, index) => {
    const letter = OPTION_LETTERS[index] || "a";
    return h(
      "button",
      {
        class: "option",
        type: "button",
        "data-answer": option,
        onClick: () => onPick(option),
      },
      h("span", {
        class: `option-letter option-letter--${letter}`,
        text: letter.toUpperCase(),
        "aria-hidden": "true",
      }),
      h("span", { class: "option-label", text: option }),
    );
  });
}

const LEVELS = [
  { id: "facile", label: "Facile" },
  { id: "moyen", label: "Moyen" },
  { id: "difficile", label: "Difficile" },
  { id: "melange", label: "Mélange" },
];

const LEVEL_QCM_CAP = 16;

const LEVEL_LABEL = {
  facile: "Facile",
  moyen: "Moyen",
  difficile: "Difficile",
  melange: "Mélange",
};

const MODES = [
  { id: "qcm", label: "Choix multiple" },
  { id: "texte", label: "Texte libre" },
  { id: "description", label: "Description" },
  { id: "groupes", label: "Ranger par groupe" },
  { id: "paire", label: "Même espèce" },
  { id: "variantes", label: "Variantes" },
  { id: "sexes", label: "Mâle ou femelle" },
  { id: "chant", label: "Chant" },
  { id: "relier", label: "Relier" },
];

const CORE_MODES = ["qcm", "texte", "description", "groupes", "relier"];
const BIO_MODES = [...CORE_MODES, "paire"];
const BIRD_MODES = [...BIO_MODES, "variantes", "sexes", "chant"];

/** Modes autorisés par kind (allowlist). */
const MODES_BY_KIND = {
  oiseaux: BIRD_MODES,
  reptiles: BIO_MODES,
  poissons: BIO_MODES,
  insectes: BIO_MODES,
  mammiferes: BIO_MODES,
  plantes: BIO_MODES,
  champignons: BIO_MODES,
  fruits: BIO_MODES,
  mineraux: BIO_MODES,
  capitales: BIO_MODES,
  pays: CORE_MODES,
  drapeaux: CORE_MODES,
  mixed: CORE_MODES,
};

const CATALOG_ID_ALIASES = {
  capitales: "capitales-monde",
  drapeaux: "drapeaux-monde",
  insectes: "insectes-france",
  mammiferes: "mammiferes-france",
  arbres: "arbres-france",
  "fruits-legumes": "fruits-legumes",
  "rochers-mineraux": "rochers-mineraux",
  "pays-monde-quiz": "pays-monde",
  plantes: "plantes-france",
  champignons: "champignons-france",
  reptiles: "reptiles-france",
  poissons: "poissons-france",
};

function mediaKindForQuizId(quizId) {
  switch (String(quizId || "")) {
    case "pays-monde":
      return "map";
    case "drapeaux-monde":
      return "flag";
    case "capitales-monde":
      return "capital";
    case "rochers-mineraux":
      return "mineral";
    case "fruits-legumes":
      return "fruit";
    default:
      return "species";
  }
}

function quizKind(category = state.category) {
  if (category?._merged || String(category?.id || "").startsWith("region-")) {
    return "mixed";
  }
  switch (category?.id) {
    case "pays-monde":
      return "pays";
    case "capitales-monde":
      return "capitales";
    case "drapeaux-monde":
      return "drapeaux";
    case "champignons-france":
      return "champignons";
    case "plantes-france":
    case "arbres-france":
      return "plantes";
    case "fruits-legumes":
      return "fruits";
    case "poissons-france":
      return "poissons";
    case "reptiles-france":
      return "reptiles";
    case "insectes-france":
      return "insectes";
    case "mammiferes-france":
      return "mammiferes";
    case "rochers-mineraux":
      return "mineraux";
    case "oiseaux-francais":
    case "oiseaux-royaume-uni":
      return "oiseaux";
    default:
      return "oiseaux";
  }
}

function modesForKind(kind) {
  return MODES_BY_KIND[kind] || CORE_MODES;
}

function imageOptionsForQuestion(question, category = state.category) {
  const kind =
    question?.mediaKind ||
    mediaKindForQuizId(question?.sourceQuizId) ||
    mediaKindForQuizId(category?.id) ||
    (quizKind(category) === "capitales"
      ? "capital"
      : quizKind(category) === "drapeaux"
        ? "flag"
        : quizKind(category) === "pays"
          ? "map"
          : quizKind(category) === "mineraux"
            ? "mineral"
            : quizKind(category) === "fruits"
              ? "fruit"
              : "species");
  return {
    kind,
    country: question?.paysEn || question?.pays || "",
    commonName: question?.nom_commun || "",
  };
}

function imageSearchName(question) {
  return String(question?.nom_scientifique || question?.nom_commun || "").trim();
}

function preloadQuizQuestions(questions, priorityQuestion = null) {
  const list = [...(questions || [])].filter(Boolean);
  if (priorityQuestion) {
    list.sort((a, b) => (a === priorityQuestion ? -1 : b === priorityQuestion ? 1 : 0));
  }
  for (const question of list) {
    const name = imageSearchName(question);
    if (!name) continue;
    getSpeciesImages(name, imageOptionsForQuestion(question)).catch(() => {});
  }
}

const LEVEL_COPY = {
  facile: "Jusqu’à 16 questions · les plus reconnaissables.",
  moyen: "Jusqu’à 16 questions · il faut y regarder de plus près.",
  difficile: "Jusqu’à 16 questions · espèces ou formes proches.",
  melange: "Toutes les entrées du pool · une seule fois chacune · arrêt possible.",
};

function quizCopy(category = state.category) {
  const kind = quizKind(category);
  if (kind === "pays") {
    return {
      kind,
      unit: "pays",
      units: "pays",
      groupLegend: "Continents",
      groupsHelp: "La difficulté ne change pas. Seuls les continents cochés entrent dans la partie.",
      levelsHelp: "Choisis un mode, coche les continents, puis un niveau.",
      levels: { ...LEVEL_COPY },
      modes: {
        qcm: { label: "Choix multiple", blurb: "Une carte, quatre pays." },
        texte: {
          label: "Texte libre",
          blurb: "Une carte, tu écris le nom. Les suggestions viennent des pays de la partie.",
        },
        description: {
          label: "Description",
          blurb: "Pas de carte : un texte décrit le contour, puis quatre choix.",
        },
        groupes: {
          label: "Ranger par continent",
          blurb: "Jusqu'à six cartes à classer dans les continents cochés.",
        },
        paire: { label: "Même pays", blurb: "Deux cartes : est-ce le même pays ?" },
        relier: {
          label: "Relier",
          blurb: "Clique une carte : elle s'affiche en grand, puis tu choisis son nom.",
        },
      },
      media: "carte",
      loading: "Chargement de la carte…",
      alt: "Contour de pays à identifier",
      badMedia: "Mauvaise carte",
      mediaSignaled: "Carte signalée",
      noMedia: "Pas de carte pour ce nom.",
      unavailable: "Image indisponible",
      creditCommons: "Carte : Wikimedia Commons",
      creditWiki: "Carte : Wikipédia",
      creditList: "Cartes : Wikimedia Commons",
      otherMedia: "Autres cartes",
      nameField: "Nom du pays",
      sameItemPrompt: "Ces deux cartes montrent-elles le même pays ?",
      sortLede: "Choisis le continent de chaque carte, puis valide.",
      pairAria: "Même pays",
      compareAlt: "Contour de pays à comparer",
      preparingTitle: "Préparation des cartes",
      preparingPair: "On tire des cartes pour comparer les pays.",
      preparingDefault: "On prépare les cartes de la partie.",
      pairFail: "Pas assez de cartes différentes pour ce mode.",
      resultsPerfectGroupes: "Toutes les cartes sont dans le bon continent.",
      resultsPerfect: "Tous les pays ont été reconnus.",
      referenceEmpty: "Aucun pays à afficher.",
      referenceLede: "Les pays par continent. Ouvre une fiche pour la carte et les critères.",
      ficheNoMedia: "Pas de carte pour ce pays.",
      groupWord: "continent",
      linkLede: "Clique une carte : elle s'affiche en grand, puis tu choisis son nom.",
      footer: "© 2026 Emsacras",
    };
  }
  if (kind === "capitales") {
    return {
      kind,
      unit: "capitale",
      units: "capitales",
      groupLegend: "Continents",
      groupsHelp: "Seuls les continents cochés entrent dans la partie.",
      levelsHelp: "Choisis un mode, coche les continents, puis un niveau.",
      levels: { ...LEVEL_COPY },
      modes: {
        qcm: { label: "Choix multiple", blurb: "Une photo de ville, quatre capitales." },
        texte: {
          label: "Texte libre",
          blurb: "Une photo, tu écris le nom de la capitale.",
        },
        description: {
          label: "Description",
          blurb: "Un texte indique le pays, puis quatre capitales.",
        },
        groupes: {
          label: "Ranger par continent",
          blurb: "Jusqu'à six photos à classer dans les continents cochés.",
        },
        paire: { label: "Même capitale", blurb: "Deux photos : est-ce la même capitale ?" },
        relier: {
          label: "Relier",
          blurb: "Clique une photo : elle s'affiche en grand, puis tu choisis la capitale.",
        },
      },
      media: "photo",
      loading: "Chargement de la photo…",
      alt: "Capitale à identifier",
      badMedia: "Mauvaise photo",
      mediaSignaled: "Photo signalée",
      noMedia: "Pas de photo pour cette capitale.",
      unavailable: "Image indisponible",
      creditCommons: "Photo : Wikimedia Commons",
      creditWiki: "Photo : Wikipédia",
      creditList: "Photos : Wikimedia Commons",
      otherMedia: "Autres photos",
      nameField: "Nom de la capitale",
      sameItemPrompt: "Ces deux photos montrent-elles la même capitale ?",
      sortLede: "Choisis le continent de chaque photo, puis valide.",
      pairAria: "Même capitale",
      compareAlt: "Capitale à comparer",
      preparingTitle: "Préparation des photos",
      preparingPair: "On tire des photos pour comparer les capitales.",
      preparingDefault: "On prépare les photos de la partie.",
      pairFail: "Pas assez de photos différentes pour ce mode.",
      resultsPerfectGroupes: "Toutes les photos sont dans le bon continent.",
      resultsPerfect: "Toutes les capitales ont été reconnues.",
      referenceEmpty: "Aucune capitale à afficher.",
      referenceLede: "Les capitales par continent. Ouvre une fiche pour la photo.",
      ficheNoMedia: "Pas de photo pour cette capitale.",
      groupWord: "continent",
      linkLede: "Clique une photo : elle s'affiche en grand, puis tu choisis la capitale.",
      footer: "© 2026 Emsacras",
    };
  }
  if (kind === "drapeaux") {
    return {
      kind,
      unit: "pays",
      units: "pays",
      groupLegend: "Continents",
      groupsHelp: "Seuls les continents cochés entrent dans la partie.",
      levelsHelp: "Choisis un mode, coche les continents, puis un niveau.",
      levels: { ...LEVEL_COPY },
      modes: {
        qcm: { label: "Choix multiple", blurb: "Un drapeau, quatre pays." },
        texte: {
          label: "Texte libre",
          blurb: "Un drapeau, tu écris le nom du pays.",
        },
        description: {
          label: "Description",
          blurb: "Un texte décrit le drapeau, puis quatre pays.",
        },
        groupes: {
          label: "Ranger par continent",
          blurb: "Jusqu'à six drapeaux à classer dans les continents cochés.",
        },
        paire: { label: "Même pays", blurb: "Deux drapeaux : est-ce le même pays ?" },
        relier: {
          label: "Relier",
          blurb: "Clique un drapeau : il s'affiche en grand, puis tu choisis le pays.",
        },
      },
      media: "drapeau",
      loading: "Chargement du drapeau…",
      alt: "Drapeau à identifier",
      badMedia: "Mauvais drapeau",
      mediaSignaled: "Drapeau signalé",
      noMedia: "Pas de drapeau pour ce pays.",
      unavailable: "Image indisponible",
      creditCommons: "Drapeau : Wikimedia Commons",
      creditWiki: "Drapeau : Wikipédia",
      creditList: "Drapeaux : Wikimedia Commons",
      otherMedia: "Autres drapeaux",
      nameField: "Nom du pays",
      sameItemPrompt: "Ces deux drapeaux montrent-ils le même pays ?",
      sortLede: "Choisis le continent de chaque drapeau, puis valide.",
      pairAria: "Même pays",
      compareAlt: "Drapeau à comparer",
      preparingTitle: "Préparation des drapeaux",
      preparingPair: "On tire des drapeaux pour comparer les pays.",
      preparingDefault: "On prépare les drapeaux de la partie.",
      pairFail: "Pas assez de drapeaux différents pour ce mode.",
      resultsPerfectGroupes: "Tous les drapeaux sont dans le bon continent.",
      resultsPerfect: "Tous les drapeaux ont été reconnus.",
      referenceEmpty: "Aucun drapeau à afficher.",
      referenceLede: "Les drapeaux par continent. Ouvre une fiche pour le drapeau.",
      ficheNoMedia: "Pas de drapeau pour ce pays.",
      groupWord: "continent",
      linkLede: "Clique un drapeau : il s'affiche en grand, puis tu choisis le pays.",
      footer: "© 2026 Emsacras",
    };
  }
  if (kind === "champignons") {
    return {
      kind,
      unit: "espèce",
      units: "espèces",
      groupLegend: "Groupes",
      groupsHelp: "La difficulté ne change pas. Seules les espèces cochées entrent dans la partie.",
      levelsHelp: "Choisis un mode, coche les groupes, puis un niveau.",
      levels: { ...LEVEL_COPY },
      modes: {
        qcm: { label: "Choix multiple", blurb: "Une photo, quatre noms." },
        texte: {
          label: "Texte libre",
          blurb: "Une photo, tu écris le nom. Les suggestions viennent des espèces de la partie.",
        },
        description: {
          label: "Description",
          blurb: "Pas de photo : un texte décrit le champignon, puis quatre choix.",
        },
        groupes: {
          label: "Ranger par groupe",
          blurb: "Jusqu'à six photos à classer dans les groupes cochés.",
        },
        paire: { label: "Même espèce", blurb: "Deux photos : est-ce la même espèce ?" },
        relier: {
          label: "Relier",
          blurb: "Clique une photo : elle s'affiche en grand, puis tu choisis son nom.",
        },
      },
      media: "photo",
      loading: "Chargement de la photo…",
      alt: "Champignon à identifier",
      badMedia: "Mauvaise photo",
      mediaSignaled: "Photo signalée",
      noMedia: "Pas de photo pour ce nom.",
      unavailable: "Image indisponible",
      creditCommons: "Photo : Wikimedia Commons",
      creditWiki: "Photo : Wikipédia",
      creditList: "Photos : Wikimedia Commons",
      otherMedia: "Autres photos",
      nameField: "Nom de l'espèce",
      sameItemPrompt: "Ces deux photos montrent-elles la même espèce ?",
      sortLede: "Choisis le groupe de chaque photo, puis valide.",
      pairAria: "Même espèce",
      compareAlt: "Champignon à comparer",
      preparingTitle: "Préparation des photos",
      preparingPair: "On tire des photos pour comparer les espèces.",
      preparingDefault: "On prépare les photos de la partie.",
      pairFail: "Pas assez de photos différentes pour ce mode.",
      resultsPerfectGroupes: "Toutes les photos sont dans le bon groupe.",
      resultsPerfect: "Toutes les espèces ont été reconnues.",
      referenceEmpty: "Aucune espèce à afficher.",
      referenceLede: "Les espèces par groupe. Ouvre une fiche pour les photos et les critères.",
      ficheNoMedia: "Pas de photo pour cette espèce.",
      groupWord: "groupe",
      linkLede: "Clique une photo : elle s'affiche en grand, puis tu choisis son nom.",
      footer: "© 2026 Emsacras",
    };
  }

  const subject =
    kind === "plantes"
      ? {
          description: "Pas de photo : un texte décrit la plante, puis quatre choix.",
          alt: "Plante à identifier",
          unit: "espèce",
          units: "espèces",
          nameField: "Nom de l'espèce",
        }
      : kind === "fruits"
        ? {
            description: "Pas de photo : un texte décrit le fruit ou légume, puis quatre choix.",
            alt: "Fruit ou légume à identifier",
            unit: "aliment",
            units: "aliments",
            nameField: "Nom de l'aliment",
          }
        : kind === "poissons"
          ? {
              description: "Pas de photo : un texte décrit le poisson, puis quatre choix.",
              alt: "Poisson à identifier",
              unit: "espèce",
              units: "espèces",
              nameField: "Nom de l'espèce",
            }
          : kind === "reptiles"
            ? {
                description: "Pas de photo : un texte décrit le reptile, puis quatre choix.",
                alt: "Reptile à identifier",
                unit: "espèce",
                units: "espèces",
                nameField: "Nom de l'espèce",
              }
            : kind === "insectes"
              ? {
                  description: "Pas de photo : un texte décrit l'insecte, puis quatre choix.",
                  alt: "Insecte à identifier",
                  unit: "espèce",
                  units: "espèces",
                  nameField: "Nom de l'espèce",
                }
              : kind === "mammiferes"
                ? {
                    description: "Pas de photo : un texte décrit le mammifère, puis quatre choix.",
                    alt: "Mammifère à identifier",
                    unit: "espèce",
                    units: "espèces",
                    nameField: "Nom de l'espèce",
                  }
                : kind === "mineraux"
                  ? {
                      description: "Pas de photo : un texte décrit le minéral, puis quatre choix.",
                      alt: "Minéral à identifier",
                      unit: "espèce",
                      units: "espèces",
                      nameField: "Nom du minéral",
                    }
                  : kind === "mixed"
                    ? {
                        description: "Pas de photo : un texte décrit l’élément, puis quatre choix.",
                        alt: "Élément à identifier",
                        unit: "entrée",
                        units: "entrées",
                        nameField: "Nom",
                      }
                    : {
                        description: "Pas de photo : un texte décrit l'oiseau, puis quatre choix.",
                        alt: "Oiseau à identifier",
                        unit: "espèce",
                        units: "espèces",
                        nameField: "Nom de l'espèce",
                      };

  return {
    kind,
    unit: subject.unit,
    units: subject.units,
    groupLegend: "Groupes",
    groupsHelp: "Seules les entrées des groupes cochés entrent dans la partie.",
    levelsHelp: "Choisis un mode, coche les groupes, puis un niveau.",
    levels: { ...LEVEL_COPY },
    modes: {
      qcm: { label: "Choix multiple", blurb: "Une photo, quatre noms." },
      texte: {
        label: "Texte libre",
        blurb: "Une photo, tu écris le nom. Les suggestions viennent des espèces de la partie.",
      },
      description: { label: "Description", blurb: subject.description },
      groupes: {
        label: "Ranger par groupe",
        blurb: "Jusqu'à six photos à classer dans les groupes cochés.",
      },
      paire: { label: "Même espèce", blurb: "Deux photos : est-ce la même entrée ?" },
      variantes: {
        label: "Variantes",
        blurb: "Deux photos d'espèces proches, tirées chacune au hasard. Le même nom peut revenir deux fois.",
      },
      sexes: {
        label: "Mâle ou femelle",
        blurb: "Le nom est donné. Deux photos tirées au hasard : les deux peuvent être des mâles, ou des femelles.",
      },
      chant: {
        label: "Chant",
        blurb: "D'abord le chant, puis une photo très pixelisée qui s'éclaircit.",
      },
      relier: {
        label: "Relier",
        blurb: "Clique une photo : elle s'affiche en grand, puis tu choisis son nom.",
      },
    },
    media: "photo",
    loading: "Chargement de la photo…",
    alt: subject.alt,
    badMedia: "Mauvaise photo",
    mediaSignaled: "Photo signalée",
    noMedia: "Pas de photo pour ce nom.",
    unavailable: "Image indisponible",
    creditCommons: "Photo : Wikimedia Commons",
    creditWiki: "Photo : Wikipédia",
    creditList: "Photos : Wikimedia Commons",
    otherMedia: "Autres photos",
    nameField: subject.nameField,
    sameItemPrompt: "Ces deux photos montrent-elles la même entrée ?",
    sortLede: "Choisis le groupe de chaque photo, puis valide.",
    pairAria: "Même entrée",
    compareAlt: subject.alt.replace("à identifier", "à comparer"),
    preparingTitle: "Préparation des photos",
    preparingPair: "On tire des photos pour comparer les espèces.",
    preparingDefault: "On prépare les photos de la partie.",
    pairFail: "Pas assez de photos différentes pour ce mode.",
    resultsPerfectGroupes: "Toutes les photos sont dans le bon groupe.",
    resultsPerfect: "Toutes les espèces ont été reconnues.",
    referenceEmpty: "Aucune espèce à afficher.",
    referenceLede: "Les espèces par groupe. Ouvre une fiche pour les photos et les critères.",
    ficheNoMedia: "Pas de photo pour cette espèce.",
    groupWord: "groupe",
    linkLede: "Clique une photo : elle s'affiche en grand, puis tu choisis son nom.",
    footer: "© 2026 Emsacras",
  };
}

function availableModes(category = state.category) {
  const copy = quizCopy(category);
  const allowed = new Set(modesForKind(quizKind(category)));
  return MODES.filter((mode) => allowed.has(mode.id)).map((mode) => ({
    id: mode.id,
    label: copy.modes[mode.id]?.label || mode.label || mode.id,
    blurb: copy.modes[mode.id]?.blurb || "",
  }));
}

const SITE_FOOTER = "© 2026 Emsacras";

function updateFooter() {
  const node = document.querySelector(".site-footer p");
  if (!node) return;
  node.textContent = SITE_FOOTER;
}

function ficheHref(question) {
  const categoryId = state.category?.id;
  const scientificName = question?.nom_scientifique;
  if (!categoryId || !scientificName) return "";
  const hash = `#/fiche/${categoryId}/${encodeURIComponent(scientificName)}`;
  return `${location.origin}${location.pathname}${location.search}${hash}`;
}

function ficheLinkButton(question, label = "Voir la fiche") {
  const href = ficheHref(question);
  if (!href) return null;
  return h("a", {
    class: "btn secondary fiche-link",
    href,
    target: "_blank",
    rel: "noopener noreferrer",
    text: label,
  });
}

const VOLUME_KEY = "birdquiz:volume";

const CHANT_LOOKS = [
  null,
  { cells: 8, blur: 18 },
  { cells: 16, blur: 10 },
  { cells: 28, blur: 5 },
  { cells: 48, blur: 2 },
  { cells: 0, blur: 0 },
];

const CHANT_LABELS = ["", "Très pixelisé", "Pixelisé", "Flou", "Presque net", "Photo nette"];

const VARIANT_FAMILIES = [
  ["Pic épeiche", "Pic mar", "Pic épeichette"],
  ["Mésange bleue", "Mésange charbonnière"],
  ["Mésange boréale", "Mésange nonnette", "Mésange noire", "Mésange huppée"],
  ["Pigeon ramier", "Pigeon biset", "Pigeon colombin", "Tourterelle turque"],
  ["Corneille noire", "Corbeau freux", "Choucas des tours", "Grand corbeau"],
  ["Chocard à bec jaune", "Crave à bec rouge"],
  ["Goéland argenté", "Goéland brun", "Goéland marin", "Goéland cendré"],
  ["Mouette rieuse", "Mouette tridactyle", "Mouette mélanocéphale"],
  ["Sterne pierregarin", "Sterne caugek", "Sterne arctique", "Sterne naine"],
  ["Merle noir", "Grive musicienne", "Grive litorne", "Merle à plastron"],
  ["Pouillot véloce", "Pouillot fitis"],
  ["Roitelet huppé", "Roitelet triple-bandeau"],
  ["Fauvette à tête noire", "Fauvette des jardins", "Fauvette grisette", "Fauvette mélanocéphale", "Fauvette pitchou"],
  ["Moineau domestique", "Moineau friquet"],
  ["Canard colvert", "Canard chipeau", "Canard souchet", "Sarcelle d'hiver", "Sarcelle d'été"],
  ["Fuligule milouin", "Fuligule morillon", "Fuligule milouinan", "Nette rousse"],
  ["Cygne tuberculé", "Cygne chanteur"],
  ["Aigrette garzette", "Grande aigrette"],
  ["Grèbe huppé", "Grèbe castagneux", "Grèbe à cou noir"],
  ["Busard des roseaux", "Busard Saint-Martin", "Busard cendré"],
  ["Milan royal", "Milan noir"],
  ["Hibou moyen-duc", "Hibou des marais", "Hibou grand-duc"],
  ["Chouette hulotte", "Chouette de Tengmalm", "Chevêche d'Athéna"],
  ["Épervier d'Europe", "Autour des palombes"],
  ["Pipit farlouse", "Pipit des arbres", "Pipit spioncelle"],
  ["Bergeronnette grise", "Bergeronnette des ruisseaux"],
  ["Accenteur mouchet", "Accenteur alpin"],
  ["Traquet motteux", "Traquet oreillard", "Tarier des prés"],
  ["Courlis cendré", "Courlis corlieu"],
  ["Pingouin torda", "Guillemot de Troïl", "Mergule nain"],
  ["Grand cormoran", "Cormoran huppé"],
  ["Harle bièvre", "Harle huppé"],
  ["Bernache cravant", "Bernache du Canada"],
  ["Faucon crécerelle", "Faucon hobereau", "Faucon pèlerin"],
  ["Buse variable", "Bondrée apivore"],
  ["Pinson des arbres", "Verdier d'Europe", "Serin cini", "Tarin des aulnes"],
  ["Marouette ponctuée", "Marouette poussin", "Râle d'eau"],
];

const DIMORPHIC = new Set([
  "Merle noir",
  "Moineau domestique",
  "Pinson des arbres",
  "Bouvreuil pivoine",
  "Verdier d'Europe",
  "Linotte mélodieuse",
  "Tarin des aulnes",
  "Serin cini",
  "Bruant jaune",
  "Canard colvert",
  "Sarcelle d'hiver",
  "Sarcelle d'été",
  "Canard souchet",
  "Canard chipeau",
  "Fuligule milouin",
  "Fuligule morillon",
  "Fuligule milouinan",
  "Nette rousse",
  "Harle bièvre",
  "Harle huppé",
  "Macreuse noire",
  "Faucon crécerelle",
  "Busard Saint-Martin",
  "Busard cendré",
  "Busard des roseaux",
  "Épervier d'Europe",
  "Pic épeiche",
  "Pic épeichette",
  "Pic vert",
  "Loriot d'Europe",
  "Rougequeue noir",
  "Tarier des prés",
  "Fauvette à tête noire",
]);

const MODE_LABEL = Object.fromEntries(
  MODES.map((mode) => [mode.id, mode.label || mode.id]),
);

function modeLabel(modeId, category = state.category) {
  return quizCopy(category).modes[modeId]?.label || MODE_LABEL[modeId] || modeId;
}

const PLACEHOLDER = "assets/placeholder.svg";
const SAFE_FISH_KEY = "birdquiz:safe-fish";

function loadSafeFish() {
  try {
    return localStorage.getItem(SAFE_FISH_KEY) === "1";
  } catch {
    return false;
  }
}

function syncSafeFish() {
  setSafeFish(state.category?.id === "poissons-france" && state.safeFish);
}

function syncOutlineMaps() {
  setOutlineMaps(state.category?.id === "pays-monde");
}

function syncFlagImages() {
  setFlagImages(state.category?.id === "drapeaux-monde");
}

function syncCapitalImages() {
  setCapitalImages(state.category?.id === "capitales-monde");
}

function syncMineralImages() {
  setMineralImages(state.category?.id === "rochers-mineraux");
}

function syncFruitImages() {
  setFruitImages(state.category?.id === "fruits-legumes");
}

function syncImagePolicy() {
  syncSafeFish();
  syncOutlineMaps();
  syncFlagImages();
  syncCapitalImages();
  syncMineralImages();
  syncFruitImages();
}

function saveSafeFish(enabled) {
  state.safeFish = Boolean(enabled);
  try {
    localStorage.setItem(SAFE_FISH_KEY, state.safeFish ? "1" : "0");
  } catch {
    // Le quiz reste jouable si le stockage est bloqué.
  }
  syncSafeFish();
}

const state = {
  categories: [],
  category: null,
  difficulty: null,
  mode: "qcm",
  selectedGroups: [],
  notice: "",
  prepToken: 0,
  questions: [],
  index: 0,
  score: 0,
  missed: [],
  revealed: false,
  outcome: null,
  error: "",
  pointTotal: 0,
  fiche: null,
  referenceGroup: "",
  catalog: null,
  nav: { axis: "", path: [], regionId: "" },
  safeFish: loadSafeFish(),
  isDaily: false,
  reviseQueue: [],
  reviseIndex: 0,
  reviseRevealed: false,
  pendingBadges: [],
};

let screen = "loading";

const top = document.querySelector("#top");
const view = document.querySelector("#view");

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "hidden") node.hidden = Boolean(value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const GROUPS_PREFIX = "birdquiz:groupes:";

function defaultGroupIds(category) {
  const ids = (category.groupes || []).filter((group) => group.defaut).map((group) => group.id);
  if (ids.length) return ids;
  return category.groupes?.[0] ? [category.groupes[0].id] : [];
}

function loadSelectedGroups(category) {
  try {
    const raw = localStorage.getItem(GROUPS_PREFIX + category.id);
    if (!raw) return defaultGroupIds(category);
    const known = new Set((category.groupes || []).map((group) => group.id));
    const ids = JSON.parse(raw).filter((id) => known.has(id));
    return ids.length ? ids : defaultGroupIds(category);
  } catch {
    return defaultGroupIds(category);
  }
}

function saveSelectedGroups(category, ids) {
  try {
    localStorage.setItem(GROUPS_PREFIX + category.id, JSON.stringify(ids));
  } catch {
    // Le quiz reste jouable si le stockage est bloqué.
  }
}

const MODE_PREFIX = "birdquiz:mode:";

function loadMode(category) {
  try {
    const raw = localStorage.getItem(MODE_PREFIX + category.id);
    if (availableModes(category).some((mode) => mode.id === raw)) return raw;
    if (raw && MODES.some((mode) => mode.id === raw)) {
      saveMode(category, "qcm");
    }
  } catch {
    // Le choix multiple reste le mode par défaut.
  }
  return "qcm";
}

function saveMode(category, mode) {
  try {
    localStorage.setItem(MODE_PREFIX + category.id, mode);
  } catch {
    // Le quiz reste jouable si le stockage est bloqué.
  }
}

function fold(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function groupLabel(groupId) {
  return state.category?.groupes?.find((group) => group.id === groupId)?.label || groupId;
}

function questionsFor(category, levelId) {
  const selected = new Set(state.selectedGroups || []);
  const pool = category.questions.filter((question) => !question.groupe || selected.has(question.groupe));
  if (levelId === "melange") return pool;
  return pool.filter((question) => question.difficulte === levelId);
}

/** Compteur affiché sur les cartes niveau (plafond 16 sauf mélange). */
function levelDisplayCount(rawCount, levelId) {
  const n = Number(rawCount) || 0;
  if (levelId === "melange") return n;
  return Math.min(n, LEVEL_QCM_CAP);
}

/** Pool jouable : mélange = tout ; sinon max 16 après mélange. */
function pickLevelQuestions(source, difficulty) {
  const shuffled = shuffle(source);
  if (difficulty === "melange") return shuffled;
  return shuffled.slice(0, LEVEL_QCM_CAP);
}

function variantRounds(category, levelId) {
  const selected = new Set(state.selectedGroups || []);
  const known = category.questions.filter((question) => !question.groupe || selected.has(question.groupe));
  const byName = new Map(known.map((question) => [fold(question.nom_commun), question]));
  const rounds = [];
  for (const names of VARIANT_FAMILIES) {
    const members = names.map((name) => byName.get(fold(name))).filter(Boolean);
    if (members.length < 2) continue;
    if (levelId !== "melange" && !members.some((member) => member.difficulte === levelId)) continue;
    rounds.push(members);
  }
  return rounds;
}

function sexCandidates(category, levelId) {
  const wanted = new Set([...DIMORPHIC].map((name) => fold(name)));
  return questionsFor(category, levelId).filter((question) => wanted.has(fold(question.nom_commun)));
}

function linkBoardSizes(count) {
  const sizes = [];
  let left = count;
  while (left >= 2) {
    const size = left <= 6 ? left : 5;
    sizes.push(size);
    left -= size;
  }
  return sizes;
}

function buildLinkBoards(source) {
  const birds = shuffle(source);
  const sizes = linkBoardSizes(birds.length);
  const boards = [];
  let index = 0;
  for (const size of sizes) {
    const slice = birds.slice(index, index + size);
    index += size;
    boards.push({
      members: slice.map((question) => ({
        nom_commun: question.nom_commun,
        nom_scientifique: question.nom_scientifique,
        explication: question.explication,
        chosen: "",
      })),
      names: shuffle(slice.map((question) => question.nom_commun)),
      pending: null,
    });
  }
  return boards;
}

function scoreTotal() {
  if (state.mode === "variantes" || state.mode === "sexes" || state.mode === "relier") {
    return state.pointTotal || state.questions.length;
  }
  return state.questions.length;
}

function normalizeQuestion(question) {
  const options = [...new Set([question.nom_commun, ...(question.options || [])])].slice(0, 4);
  return { ...question, options };
}

function currentQuestion() {
  return state.questions[state.index];
}

function show(parent, ...nodes) {
  parent.replaceChildren(...nodes.filter((node) => node instanceof Node));
}

function setScreen(next) {
  closePhoto();
  releaseLinkBoard();
  const screenChanged = screen !== next;
  screen = next;
  mount();
  syncRouteFromScreen();
  // Ne pas remonter en haut entre deux questions du même quiz.
  if (screenChanged) window.scrollTo(0, 0);
}

function goHome() {
  state.prepToken += 1;
  state.category = null;
  state.difficulty = null;
  state.questions = [];
  state.notice = "";
  state.nav = { axis: "", path: [], regionId: "" };
  syncImagePolicy();
  updateFooter(null);
  setScreen("home");
}

function openCategory(category) {
  state.category = category;
  state.selectedGroups = loadSelectedGroups(category);
  state.mode = loadMode(category);
  if (!availableModes(category).some((mode) => mode.id === state.mode)) {
    state.mode = "qcm";
    saveMode(category, "qcm");
  }
  state.notice = "";
  syncImagePolicy();
  updateFooter(category);
  setScreen("levels");
}

function selectMode(mode) {
  if (!availableModes().some((item) => item.id === mode)) return;
  state.mode = mode;
  state.notice = "";
  saveMode(state.category, mode);
  mount();
}

function toggleGroup(groupId, checked) {
  const next = new Set(state.selectedGroups);
  if (checked) next.add(groupId);
  else next.delete(groupId);
  if (!next.size) {
    mount();
    return;
  }
  const order = state.category.groupes.map((group) => group.id);
  state.selectedGroups = order.filter((id) => next.has(id));
  saveSelectedGroups(state.category, state.selectedGroups);
  mount();
}

function resetRound() {
  state.index = 0;
  state.score = 0;
  state.missed = [];
  state.revealed = false;
  state.outcome = null;
  state.notice = "";
}

function startQuiz(difficulty) {
  syncImagePolicy();
  const groupsBlocked = state.mode === "groupes" && state.selectedGroups.length < 2;
  const source = questionsFor(state.category, difficulty).map(normalizeQuestion);
  if (!source.length || groupsBlocked) return;
  state.isDaily = false;
  state.difficulty = difficulty;
  state.resultTotal = null;
  resetRound();

  if (state.mode === "groupes") {
    state.questions = shuffle(source)
      .slice(0, 6)
      .map((question) => ({ ...question, chosenGroup: "" }));
    setScreen("quiz");
    preloadQuizQuestions(state.questions, state.questions[0]);
    return;
  }

  const capped = pickLevelQuestions(source, difficulty);

  if (state.mode === "paire") {
    state.questions = [];
    state.pointTotal = 0;
    state.prepToken += 1;
    const token = state.prepToken;
    setScreen("preparing");
    buildPairs(capped, token);
    return;
  }

  if (state.mode === "variantes") {
    let rounds = variantRounds(state.category, difficulty);
    if (!rounds.length) return;
    if (difficulty !== "melange") rounds = shuffle(rounds).slice(0, LEVEL_QCM_CAP);
    state.questions = [];
    state.pointTotal = 0;
    state.prepToken += 1;
    const token = state.prepToken;
    setScreen("preparing");
    buildVariants(rounds, token);
    return;
  }

  if (state.mode === "sexes") {
    const candidates = pickLevelQuestions(
      sexCandidates(state.category, difficulty),
      difficulty
    );
    if (!candidates.length) return;
    state.questions = [];
    state.pointTotal = 0;
    state.prepToken += 1;
    const token = state.prepToken;
    setScreen("preparing");
    buildSexes(candidates, token);
    return;
  }

  if (state.mode === "relier") {
    const boards = buildLinkBoards(capped);
    if (!boards.length) return;
    state.questions = boards;
    state.pointTotal = boards.reduce((sum, board) => sum + board.members.length, 0);
    setScreen("quiz");
    preloadQuizQuestions(boards[0].members, boards[0].members[0]);
    return;
  }

  state.questions = capped.map((question) => ({
    ...question,
    options: shuffle(question.options),
  }));
  setScreen("quiz");
  if (state.mode !== "description") {
    preloadQuizQuestions(state.questions, state.questions[0]);
  }
  if (state.mode === "chant") {
    preloadSpeciesAudio(
      state.questions.slice(0, 2).map((question) => question.nom_scientifique),
      state.questions[0]?.nom_scientifique,
    );
  }
}

function restartQuiz() {
  startQuiz(state.difficulty);
}

function backToMenu() {
  state.prepToken += 1;
  state.questions = [];
  state.index = 0;
  state.score = 0;
  state.missed = [];
  state.revealed = false;
  state.outcome = null;
  setScreen("levels");
}

function answeredCount() {
  if (state.revealed) return state.index + 1;
  return state.index;
}

function finishQuiz(options = {}) {
  const early = Boolean(options.early);
  let total = scoreTotal();
  if (early) {
    total = answeredCount();
    if (total <= 0) {
      backToMenu();
      return;
    }
  }
  state.outcome = recordScore(
    state.category.id,
    state.difficulty,
    state.score,
    total,
    state.mode,
  );
  upsertMissedCards(state.category.id, state.missed);
  const unlocked = onQuizFinished({
    mode: state.mode,
    score: state.score,
    total,
    isDaily: state.isDaily,
  });
  if (state.isDaily) {
    const dailyBadge = saveDailyResult(state.category.id, state.score, total);
    if (dailyBadge) unlocked.push(dailyBadge);
  }
  state.pendingBadges = unlocked.filter(Boolean);
  state.resultTotal = total;
  setScreen("results");
}

function stopMelangeQuiz() {
  if (state.difficulty !== "melange" || state.isDaily) return;
  finishQuiz({ early: true });
}

function replayMissed() {
  if (!state.category || !state.missed.length) return;
  const names = [...new Set(state.missed.map((item) => item.nom_commun))];
  const pool = state.category.questions || [];
  const questions = names
    .map((name) => pool.find((q) => fold(q.nom_commun) === fold(name)))
    .filter(Boolean)
    .map((question) => {
      const distractors = shuffle(
        pool.filter((q) => fold(q.nom_commun) !== fold(question.nom_commun)).map((q) => q.nom_commun),
      ).slice(0, 3);
      return normalizeQuestion({
        ...question,
        options: shuffle([question.nom_commun, ...distractors]).slice(0, 4),
      });
    });
  if (!questions.length) {
    state.notice = "Pas assez d’espèces pour rejouer les erreurs.";
    setScreen("levels");
    return;
  }
  state.isDaily = false;
  state.mode = "qcm";
  state.difficulty = "melange";
  state.questions = shuffle(questions).map((question) => ({
    ...question,
    options: shuffle(question.options),
  }));
  state.index = 0;
  state.score = 0;
  state.missed = [];
  state.revealed = false;
  state.outcome = null;
  setScreen("quiz");
}

function startDailyChallenge() {
  const category = state.category;
  if (!category) return;
  const already = getDailyResult(category.id);
  if (already) {
    state.notice = `Défi du jour déjà joué : ${already.score}/${already.total}.`;
    setScreen("levels");
    return;
  }
  // Même série pour tous : pool complet du thème (pas les groupes cochés), ordre stable, seed date UTC + categoryId.
  const source = [...(category.questions || [])]
    .map(normalizeQuestion)
    .sort((a, b) =>
      String(a.nom_scientifique || a.nom_commun).localeCompare(
        String(b.nom_scientifique || b.nom_commun),
        "en",
      ),
    );
  if (source.length < 4) {
    state.notice = "Pas assez de questions pour le défi du jour.";
    setScreen("levels");
    return;
  }
  const seed = dailySeed(category.id);
  const picked = seededShuffle(source, seed).slice(0, Math.min(10, source.length));
  state.isDaily = true;
  state.mode = "qcm";
  state.difficulty = "melange";
  state.questions = picked.map((question, index) => ({
    ...question,
    options: seededShuffle(question.options || [question.nom_commun], `${seed}:opt:${index}`),
  }));
  state.index = 0;
  state.score = 0;
  state.missed = [];
  state.revealed = false;
  state.outcome = null;
  state.notice = "";
  setScreen("quiz");
}

function startRevise() {
  if (!state.category) return;
  const queue = dueCards(state.category.id, 20);
  if (!queue.length) {
    state.notice = "Rien à réviser pour le moment.";
    setScreen("levels");
    return;
  }
  state.reviseQueue = queue;
  state.reviseIndex = 0;
  state.reviseRevealed = false;
  setScreen("revise");
}

function goNext() {
  state.revealed = false;
  if (state.index + 1 >= state.questions.length) {
    finishQuiz();
    return;
  }
  state.index += 1;
  setScreen("quiz");
}

function choose(option) {
  if (screen !== "quiz" || state.revealed) return;
  if (state.mode !== "qcm" && state.mode !== "texte" && state.mode !== "description" && state.mode !== "chant") return;
  const question = currentQuestion();
  state.revealed = true;
  const correct = option === question.nom_commun;
  if (correct) state.score += 1;
  else {
    state.missed.push({
      nom_commun: question.nom_commun,
      nom_scientifique: question.nom_scientifique,
      explication: question.explication,
      given: option,
    });
  }
  paintReveal(option, correct);
}

function quizNames() {
  return [...new Set(state.questions.map((question) => question.nom_commun))];
}

function renderSuggestions(raw) {
  const box = document.querySelector("[data-suggestions]");
  if (!box || state.revealed) return;
  const query = fold(raw.trim());
  box.replaceChildren();
  if (!query) {
    box.hidden = true;
    return;
  }
  const matches = quizNames().filter((name) => fold(name).includes(query)).slice(0, 8);
  if (!matches.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  for (const name of matches) {
    box.append(
      h("button", {
        type: "button",
        class: "suggestion",
        text: name,
        onClick: () => submitText(name),
      }),
    );
  }
}

function submitText(raw) {
  if (screen !== "quiz" || state.revealed || state.mode !== "texte") return;
  const value = String(raw || "").trim();
  if (!value) return;
  const match = quizNames().find((name) => fold(name) === fold(value));
  choose(match || value);
}

function choosePair(answer) {
  if (screen !== "quiz" || state.revealed || state.mode !== "paire") return;
  const question = currentQuestion();
  state.revealed = true;
  const saidYes = answer === "oui";
  const correct = saidYes === question.same;
  if (correct) state.score += 1;
  else {
    state.missed.push({
      nom_commun: question.nom_commun,
      nom_scientifique: question.nom_scientifique,
      explication: question.explication,
      given: saidYes ? "Oui" : "Non",
    });
  }
  paintPairReveal(answer, correct);
}

function pickSortGroup(questionId, groupId) {
  if (state.revealed || state.mode !== "groupes") return;
  const question = state.questions.find((item) => item.id === questionId);
  if (!question) return;
  question.chosenGroup = groupId;
  const card = document.querySelector(`[data-sort="${CSS.escape(questionId)}"]`);
  if (!card) return;
  for (const chip of card.querySelectorAll("[data-group]")) {
    chip.classList.toggle("is-picked", chip.dataset.group === groupId);
  }
  const validate = document.querySelector("[data-validate]");
  if (validate) validate.disabled = state.questions.some((item) => !item.chosenGroup);
}

function validateSort() {
  if (screen !== "quiz" || state.revealed || state.mode !== "groupes") return;
  if (state.questions.some((question) => !question.chosenGroup)) return;
  state.revealed = true;
  let score = 0;
  for (const question of state.questions) {
    const correct = question.chosenGroup === question.groupe;
    if (correct) score += 1;
    else {
      state.missed.push({
        nom_commun: question.nom_commun,
        nom_scientifique: question.nom_scientifique,
        explication: `Bon ${quizCopy().groupWord} : ${groupLabel(question.groupe)}.`,
        given: groupLabel(question.chosenGroup),
      });
    }
    const card = document.querySelector(`[data-sort="${CSS.escape(question.id)}"]`);
    if (!card) continue;
    for (const chip of card.querySelectorAll("[data-group]")) {
      chip.disabled = true;
      if (chip.dataset.group === question.groupe) chip.classList.add("is-correct");
      else if (chip.dataset.group === question.chosenGroup) chip.classList.add("is-wrong");
    }
    const photo = card.querySelector("[data-photo]");
    if (photo) photo.alt = question.nom_commun;
    card.append(
      h("p", { class: "caption", text: `Bon ${quizCopy().groupWord} : ${groupLabel(question.groupe)}` }),
      h("p", { class: "latin", text: question.nom_commun }),
      imageSearchLink(question.nom_commun, question.nom_scientifique),
    );
  }
  state.score = score;
  const scoreNode = document.querySelector("[data-score]");
  if (scoreNode) scoreNode.textContent = String(score);
  const validate = document.querySelector("[data-validate]");
  validate?.remove();
  document.querySelector("[data-actions]")?.append(
    h("button", {
      class: "btn",
      type: "button",
      text: "Voir le résultat",
      onClick: finishQuiz,
    }),
  );
}

function skipQuestion() {
  if (screen !== "quiz" || state.revealed) return;
  const question = currentQuestion();
  state.missed.push({
    nom_commun: question.nom_commun,
    nom_scientifique: question.nom_scientifique,
    explication: question.explication,
    given: null,
  });
  goNext();
}

function showHint() {
  if (state.revealed) return;
  const box = document.querySelector("[data-hint]");
  const button = document.querySelector("[data-hint-btn]");
  if (!box) return;
  box.hidden = false;
  box.textContent = currentQuestion().indice;
  button?.remove();
}

function paintReveal(selected, correct) {
  if (state.mode === "chant") finishChantReveal();
  const question = currentQuestion();
  for (const button of document.querySelectorAll("[data-answer]")) {
    button.disabled = true;
    const value = button.dataset.answer;
    if (value === question.nom_commun) {
      button.classList.add("is-correct", "is-pop");
      button.append(h("small", { text: "Bonne réponse" }));
    } else if (value === selected) {
      button.classList.add("is-wrong", "is-shake");
      button.append(h("small", { text: "Ton choix" }));
    }
  }

  const input = document.querySelector("[data-answer-input]");
  if (input) input.disabled = true;
  const suggestions = document.querySelector("[data-suggestions]");
  if (suggestions) {
    suggestions.replaceChildren();
    suggestions.hidden = true;
  }

  const feedback = document.querySelector("[data-feedback]");
  feedback.className = correct ? "feedback is-correct" : "feedback is-wrong";
  feedback.replaceChildren(
    ...[
      feedbackHead(correct),
      h("p", {
        text: correct
          ? question.explication
          : `La bonne réponse est ${question.nom_commun}. ${question.explication}`,
      }),
      latinWithWiki(question.nom_commun, question.nom_scientifique),
      !correct ? ficheLinkButton(question) : null,
    ].filter((node) => node instanceof Node),
  );

  const photo = document.querySelector("[data-photo]");
  if (photo && photo.dataset.final !== "1") {
    photo.alt = question.nom_commun;
  }

  if (!correct && selected && selected !== question.nom_commun) {
    const listed = (question.options || []).some((option) => fold(option) === fold(selected));
    if (findSpecies(selected) || listed) showChoicePhoto(selected, question);
  }

  revealImageSearches(question, selected);

  const score = document.querySelector("[data-score]");
  if (score) score.textContent = String(state.score);

  const live = document.querySelector("[data-live]");
  if (live) {
    live.textContent = correct
      ? `Bonne réponse : ${question.nom_commun}.`
      : `Mauvaise réponse. La bonne réponse est ${question.nom_commun}.`;
  }

  document.querySelector("[data-pass]")?.setAttribute("hidden", "");
  document.querySelector("[data-hint-btn]")?.remove();

  const actions = document.querySelector("[data-actions]");
  const last = state.index + 1 >= state.questions.length;
  actions.replaceChildren(
    h("button", {
      class: "btn",
      type: "button",
      text: last ? "Voir le résultat" : "Question suivante",
      onClick: goNext,
    }),
  );
}

function imageSearchUrl(commonName, scientificName) {
  const query = [commonName, scientificName].filter(Boolean).join(" ");
  return `https://www.google.com/search?hl=fr&tbm=isch&q=${encodeURIComponent(query)}`;
}

function wikipediaTitle(commonName, scientificName) {
  if (quizKind() === "pays") return String(commonName || scientificName || "").trim();
  const scientific = String(scientificName || "").trim();
  if (scientific && !scientific.includes(" · ")) return scientific;
  return String(commonName || scientific.split(" · ")[0] || "").trim();
}

function wikipediaUrl(commonName, scientificName) {
  const title = wikipediaTitle(commonName, scientificName);
  if (!title) return "";
  return `https://fr.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
}

function wikipediaLink(commonName, scientificName) {
  const href = wikipediaUrl(commonName, scientificName);
  if (!href) return null;
  const title = wikipediaTitle(commonName, scientificName);
  return h("a", {
    class: "wiki-link",
    href,
    target: "_blank",
    rel: "noopener noreferrer",
    text: "Wikipédia",
    "aria-label": `Page Wikipédia : ${title}`,
  });
}

function latinWithWiki(commonName, scientificName, className = "latin") {
  const scientific = String(scientificName || "").trim();
  const link = wikipediaLink(commonName, scientificName);
  if (!scientific && !link) return null;
  return h(
    "p",
    { class: className },
    scientific ? h("span", { class: "latin-name", text: scientific }) : null,
    scientific && link ? h("span", { class: "latin-sep", text: " · " }) : null,
    link,
  );
}

function imageSearchLink(commonName, scientificName) {
  const mediaWord = quizCopy().otherMedia;
  const label = `${mediaWord} de ${commonName}`;
  return h("a", {
    class: "image-search",
    href: imageSearchUrl(commonName, scientificName),
    target: "_blank",
    rel: "noopener noreferrer",
    text: mediaWord,
    "aria-label": label,
  });
}

function attachImageSearch(frame, commonName, scientificName) {
  if (!frame) return;
  const link = imageSearchLink(commonName, scientificName);
  if (frame.parentElement?.classList.contains("pair")) {
    const wrap = h("div", { class: "photo-block" });
    frame.replaceWith(wrap);
    wrap.append(frame, link);
    return;
  }
  frame.after(link);
}

function revealImageSearches(question, selected) {
  const answerFrame = document.querySelector(".compare-col.is-answer [data-frame]");
  const choiceFrame = document.querySelector(".compare-col.is-choice [data-frame]");
  if (answerFrame || choiceFrame) {
    attachImageSearch(answerFrame, question.nom_commun, question.nom_scientifique);
    if (choiceFrame && selected) {
      const known = findSpecies(selected);
      attachImageSearch(choiceFrame, known?.nom_commun || selected, known?.nom_scientifique || "");
    }
    return;
  }
  const frame = document.querySelector("[data-frame]");
  if (frame) {
    attachImageSearch(frame, question.nom_commun, question.nom_scientifique);
    return;
  }
  const anchor = document.querySelector(".description-card") || document.querySelector("[data-feedback]");
  anchor?.after(imageSearchLink(question.nom_commun, question.nom_scientifique));
}

function findSpecies(commonName) {
  const folded = fold(commonName);
  return state.category?.questions?.find((question) => fold(question.nom_commun) === folded) || null;
}

function showChoicePhoto(selected, question) {
  const position = state.index + 1;
  const chosenFrame = photoFrame();
  const choiceLabel = `Ton choix : ${findSpecies(selected)?.nom_commun || selected}`;
  const answerLabel = `Bonne réponse : ${question.nom_commun}`;
  const existing = document.querySelector("[data-frame]");

  if (existing) {
    const compare = h("div", { class: "compare" });
    const next = existing.nextSibling;
    const parent = existing.parentNode;
    compare.append(
      h("figure", { class: "compare-col is-answer" }, h("figcaption", { text: answerLabel }), existing),
      h("figure", { class: "compare-col is-choice" }, h("figcaption", { text: choiceLabel }), chosenFrame),
    );
    parent.insertBefore(compare, next);
  } else {
    const correctFrame = photoFrame();
    const compare = h(
      "div",
      { class: "compare" },
      h("figure", { class: "compare-col is-answer" }, h("figcaption", { text: answerLabel }), correctFrame),
      h("figure", { class: "compare-col is-choice" }, h("figcaption", { text: choiceLabel }), chosenFrame),
    );
    const description = document.querySelector(".description-card");
    if (description) description.after(compare);
    else document.querySelector("[data-feedback]")?.before(compare);
    const stillCorrect = () => screen === "quiz" && state.index + 1 === position && correctFrame.isConnected;
    fillSpeciesFrame(
      correctFrame,
      imageSearchName(question),
      stillCorrect,
      () => {
        const img = correctFrame.querySelector("[data-photo]");
        if (img && stillCorrect()) img.alt = question.nom_commun;
      },
      imageOptionsForQuestion(question),
    );
  }

  const known = findSpecies(selected);
  const stillChosen = () => screen === "quiz" && state.index + 1 === position && chosenFrame.isConnected;
  if (known) {
    fillSpeciesFrame(
      chosenFrame,
      imageSearchName(known),
      stillChosen,
      () => {
        const img = chosenFrame.querySelector("[data-photo]");
        if (img && stillChosen()) img.alt = known.nom_commun;
      },
      imageOptionsForQuestion(known),
    );
    return;
  }

  fillVernacularFrame(chosenFrame, selected, stillChosen);
}

async function fillVernacularFrame(frame, commonName, stillHere) {
  let url = null;
  try {
    url = await getVernacularImage(commonName);
  } catch {
    url = null;
  }
  if (!stillHere()) return;
  if (!url) {
    const spinner = frame.querySelector("[data-spinner]");
    const status = frame.querySelector("[data-status]");
    if (spinner) spinner.hidden = true;
    frame.classList.remove("is-loading");
    if (status) status.textContent = quizCopy().noMedia;
    return;
  }
  const known = findSpecies(commonName);
  fillKnownFrame(frame, url, stillHere, known?.nom_scientifique || "");
  const img = frame.querySelector("[data-photo]");
  if (img) img.alt = commonName;
}

function renderTop({ kicker, title, score, onBack, backLabel }) {
  top.replaceChildren();
  const row = h("div", { class: "top-row" });
  const quizOn = screen !== "reference" && screen !== "fiche";
  const refOn = !quizOn;
  const showReference = Boolean(state.category);
  row.append(
    h(
      "button",
      { class: "brand", type: "button", onClick: goHome, "aria-label": "QuiQuiz — accueil" },
      mascotImg(MASCOT.idle, "brand-mark", "56"),
      h("span", { text: "QuiQuiz" }),
    ),
  );
  if (showReference) {
    row.append(
      h(
        "div",
        { class: "app-tabs", role: "tablist", "aria-label": "Sections" },
        h("button", {
          class: quizOn ? "app-tab is-selected" : "app-tab",
          type: "button",
          role: "tab",
          text: "Quiz",
          "aria-selected": quizOn ? "true" : "false",
          onClick: () => {
            if (!state.category || screen === "levels") return;
            state.prepToken += 1;
            setScreen("levels");
          },
        }),
        h("button", {
          class: refOn ? "app-tab is-selected" : "app-tab",
          type: "button",
          role: "tab",
          text: "Référence",
          "aria-selected": refOn ? "true" : "false",
          onClick: openReference,
        }),
      ),
    );
  }
  if (typeof score === "number") {
    row.append(
      h("p", { class: "score-pill" }, "Score ", h("strong", { "data-score": "true", text: String(score) })),
    );
  }
  top.append(row);
  if (onBack) {
    top.append(h("button", { class: "back-link", type: "button", text: backLabel || "Retour au menu", onClick: onBack }));
  }
  if (kicker) top.append(h("p", { class: "kicker", text: kicker }));
  if (title) top.append(h("h1", { text: title }));
}

async function openQuizFile(file) {
  try {
    const category = await loadCategory(file);
    if (!category) {
      state.notice = "Ce quiz ne contient pas encore de questions.";
      mount();
      return;
    }
    rememberCategory(category);
    openCategory(category);
  } catch {
    state.notice = "Impossible de charger ce quiz.";
    mount();
  }
}

function homeCard(entry, onClick, kicker = "") {
  const disabled = Boolean(entry.aVenir);
  return h(
    "button",
    {
      class: "card",
      type: "button",
      disabled: disabled ? true : undefined,
      onClick: disabled ? undefined : onClick,
    },
    h("span", { class: "card-kicker", text: entry.aVenir ? "À venir" : kicker || "Ouvrir" }),
    h("strong", { text: entry.nom }),
    h("span", { text: entry.description || (entry.aVenir ? "Pas encore de partie." : "") }),
  );
}

function homeSection(title, children) {
  return h(
    "section",
    { class: "home-section" },
    h("h2", { class: "home-section-title", text: title }),
    h("div", { class: "cards" }, ...children),
  );
}

function mountHomeRoot(domains) {
  const regions = listRegions(domains);
  renderTop({ title: "Choisis un parcours" });
  view.replaceChildren(
    ...[
      h("p", {
        class: "lede",
        text: "Par thème (biologie, géographie…) ou par pays — puis zoome ou joue tout le dossier.",
      }),
      badgesStrip(),
      state.notice ? h("p", { class: "note", text: state.notice }) : null,
      homeSection(
        "Par thème",
        domains.map((domain) =>
          homeCard(domain, () => {
            state.nav = { axis: "theme", path: [domain.id], regionId: "" };
            state.notice = "";
            mount();
          }, "Domaine"),
        ),
      ),
      regions.length
        ? homeSection(
            "Par pays / région",
            regions.map((region) =>
              homeCard(
                {
                  nom: region.nom,
                  description: `${region.count} quiz · ${region.description}`,
                },
                () => {
                  state.nav = { axis: "region", path: [], regionId: region.id };
                  state.notice = "";
                  mount();
                },
                "Région",
              ),
            ),
          )
        : null,
    ].filter((node) => node instanceof Node),
  );
}

function mountHomeRegion(domains) {
  const regionId = state.nav.regionId;
  const regions = listRegions(domains);
  const meta = regions.find((item) => item.id === regionId) || {
    id: regionId,
    nom: regionId,
    description: "",
  };
  const leaves = leavesForRegion(domains, regionId);
  const playable = playableLeaves(leaves);

  renderTop({
    kicker: "Par pays / région",
    title: meta.nom,
    onBack: () => {
      state.nav = { axis: "", path: [], regionId: "" };
      state.notice = "";
      mount();
    },
    backLabel: "Retour",
  });

  view.replaceChildren(
    ...[
      h("p", {
        class: "lede",
        text: meta.description || "Choisis un quiz, ou joue tous ceux de cette région.",
      }),
      state.notice ? h("p", { class: "note", text: state.notice }) : null,
      playable.length > 1
        ? h("button", {
            class: "btn home-play-all",
            type: "button",
            text: `Jouer tout · ${meta.nom}`,
            onClick: () =>
              void openMergedLeaves(
                regionSessionId(regionId),
                meta.nom,
                leaves,
                meta.description || ""
              ),
          })
        : null,
      h(
        "div",
        { class: "cards" },
        leaves.length
          ? leaves.map((leaf) =>
              homeCard(
                {
                  nom: leafDisplayLabel(leaf),
                  description: leaf.description,
                  aVenir: leaf.aVenir,
                },
                () => void openQuizFile(leaf.fichier),
                leaf.aVenir ? "À venir" : "Quiz",
              ),
            )
          : [h("p", { class: "note", text: "Aucun quiz pour cette région." })],
      ),
    ].filter((node) => node instanceof Node),
  );
}

function mountHomeTheme(domains) {
  const path = Array.isArray(state.nav.path) ? state.nav.path : [];
  const node = findNodeByPath(domains, path);
  if (!node) {
    state.nav = { axis: "", path: [], regionId: "" };
    mountHomeRoot(domains);
    return;
  }

  const parentPath = path.slice(0, -1);
  const crumbs = [];
  for (let i = 0; i < path.length; i += 1) {
    const part = findNodeByPath(domains, path.slice(0, i + 1));
    if (part) crumbs.push(part.nom);
  }

  renderTop({
    kicker: crumbs.slice(0, -1).join(" · ") || "Par thème",
    title: node.nom,
    onBack: () => {
      if (!parentPath.length) state.nav = { axis: "", path: [], regionId: "" };
      else state.nav = { axis: "theme", path: parentPath, regionId: "" };
      state.notice = "";
      mount();
    },
    backLabel: "Retour",
  });

  if (isLeaf(node)) {
    view.replaceChildren(
      ...[
        h("p", { class: "lede", text: node.description || "Ouvre ce quiz." }),
        state.notice ? h("p", { class: "note", text: state.notice }) : null,
        h(
          "div",
          { class: "cards" },
          homeCard(node, () => void openQuizFile(node.fichier), "Quiz"),
        ),
      ].filter((nodeEl) => nodeEl instanceof Node),
    );
    return;
  }

  const children = Array.isArray(node.children) ? node.children : [];
  const leaves = collectLeaves(node);
  const playable = playableLeaves(leaves);

  view.replaceChildren(
    ...[
      h("p", {
        class: "lede",
        text: node.description || "Entre dans une sous-catégorie, ou joue tout ce dossier.",
      }),
      state.notice ? h("p", { class: "note", text: state.notice }) : null,
      playable.length > 1
        ? h("button", {
            class: "btn home-play-all",
            type: "button",
            text: `Jouer tout · ${node.nom}`,
            onClick: () =>
              void openMergedLeaves(node.id, node.nom, leaves, node.description || ""),
          })
        : null,
      h(
        "div",
        { class: "cards" },
        children.map((child) =>
          homeCard(
            child,
            () => {
              if (isFolder(child)) {
                state.nav = {
                  axis: "theme",
                  path: [...path, child.id],
                  regionId: "",
                };
                state.notice = "";
                mount();
                return;
              }
              if (child.fichier) void openQuizFile(child.fichier);
            },
            isFolder(child) ? "Dossier" : child.aVenir ? "À venir" : "Quiz",
          ),
        ),
      ),
    ].filter((nodeEl) => nodeEl instanceof Node),
  );
}

function mountHome() {
  document.title = "QuiQuiz";
  const domains = catalogDomains();
  if (!domains.length) {
    renderTop({ title: "Choisis une catégorie" });
    view.replaceChildren(
      ...[
        h("p", {
          class: "lede",
          text: "Un quiz en images avec Cui-Cui — joué entièrement dans le navigateur.",
        }),
        state.notice ? h("p", { class: "note", text: state.notice }) : null,
        h(
          "div",
          { class: "cards" },
          state.categories.map((category) =>
            h(
              "button",
              { class: "card", type: "button", onClick: () => openCategory(category) },
              h("span", { class: "card-kicker", text: "Catégorie" }),
              h("strong", { text: category.categorie }),
              h("span", { text: category.description || "" }),
            ),
          ),
        ),
      ].filter((node) => node instanceof Node),
    );
    return;
  }

  if (state.nav.axis === "region" && state.nav.regionId) {
    mountHomeRegion(domains);
    return;
  }
  if (state.nav.axis === "theme" && state.nav.path?.length) {
    mountHomeTheme(domains);
    return;
  }
  mountHomeRoot(domains);
}

function mountLevels() {
  const category = state.category;
  const copy = quizCopy(category);
  const modes = availableModes(category);
  document.title = `${category.categorie} — QuiQuiz`;
  renderTop({ kicker: category.categorie, title: "Choisis un niveau" });
  const groups = category.groupes || [];
  const selectedMode = modes.find((mode) => mode.id === state.mode) || modes[0];
  const groupsBlocked = state.mode === "groupes" && state.selectedGroups.length < 2;
  const daily = getDailyResult(category.id);
  const reviseN = dueCount(category.id);
  const challengePanel = h(
    "section",
    { class: daily ? "challenge-panel is-done" : "challenge-panel" },
    h("div", { class: "challenge-panel-copy" },
      h("p", { class: "challenge-kicker", text: "Une fois par jour" }),
      h("h2", { class: "challenge-title", text: "Défi du jour" }),
      h("p", {
        class: "challenge-blurb",
        text: daily
          ? `Terminé · ${daily.score}/${daily.total}`
          : "10 questions mélangées · même série pour tout le monde.",
      }),
    ),
    h("button", {
      class: "challenge-cta",
      type: "button",
      text: daily ? "Déjà joué" : "Lancer le défi",
      disabled: Boolean(daily),
      onClick: () => startDailyChallenge(),
    }),
  );

  show(
    view,
    h("p", {
      class: "lede",
      text: copy.levelsHelp,
    }),
    badgesStrip(),
    challengePanel,
    h(
      "div",
      { class: "modes", role: "group", "aria-label": "Mode de jeu" },
      modes.map((mode) =>
        h("button", {
          class: mode.id === state.mode ? "mode is-selected" : "mode",
          type: "button",
          text: mode.label,
          "aria-pressed": mode.id === state.mode ? "true" : "false",
          onClick: () => selectMode(mode.id),
        }),
      ),
    ),
    h("p", { class: "meta mode-help", text: selectedMode.blurb }),
    groupsBlocked
      ? h("p", {
          class: "note",
          text:
            copy.kind === "pays" || copy.kind === "capitales" || copy.kind === "drapeaux"
              ? "Ranger par continent est indisponible tant qu'un seul continent est coché."
              : "Ranger par groupe est indisponible tant qu'un seul groupe est coché.",
        })
      : null,
    state.notice ? h("p", { class: "note", text: state.notice }) : null,
    h(
      "div",
      { class: "cards" },
      LEVELS.map((level) => {
        const rawCount =
          state.mode === "variantes"
            ? variantRounds(category, level.id).length
            : state.mode === "sexes"
              ? sexCandidates(category, level.id).length
              : state.mode === "relier"
                ? linkBoardSizes(
                    levelDisplayCount(questionsFor(category, level.id).length, level.id)
                  ).length
                : questionsFor(category, level.id).length;
        const count =
          state.mode === "groupes"
            ? rawCount
            : state.mode === "relier"
              ? rawCount
              : levelDisplayCount(rawCount, level.id);
        const best = getBest(category.id, level.id, state.mode);
        const questionLabel =
          state.mode === "groupes"
            ? rawCount === 0
              ? `Aucune ${copy.media}`
              : `${Math.min(rawCount, 6)} ${copy.media}${Math.min(rawCount, 6) > 1 ? "s" : ""}`
            : state.mode === "variantes"
              ? count === 0
                ? "Aucune série"
                : `${count} série${count > 1 ? "s" : ""}`
              : state.mode === "sexes"
                ? count === 0
                  ? `Aucun${copy.unit === "pays" ? "" : "e"} ${copy.unit}`
                  : `${count} ${count > 1 ? copy.units : copy.unit}`
                : state.mode === "relier"
                  ? count === 0
                    ? "Aucune série"
                    : `${count} série${count > 1 ? "s" : ""}`
                  : count === 0
                  ? "Aucune question"
                  : `${count} question${count > 1 ? "s" : ""}`;
        return h(
          "button",
          {
            class: "level",
            type: "button",
            disabled: (state.mode === "groupes" ? rawCount : count) === 0 || groupsBlocked,
            onClick: () => startQuiz(level.id),
          },
          h("strong", { text: level.label }),
          h("span", { text: copy.levels[level.id] }),
          h("span", { class: "meta", text: questionLabel }),
          best ? h("em", { text: `Record ${best.score}/${best.total}` }) : null,
        );
      }),
    ),
    groups.length
      ? h(
          "fieldset",
          { class: "groups" },
          h("legend", { text: copy.groupLegend }),
          h("p", {
            class: "meta",
            text: copy.groupsHelp,
          }),
          h(
            "div",
            { class: "group-list" },
            groups.map((group) => {
              const selected = state.selectedGroups.includes(group.id);
              const locked = selected && state.selectedGroups.length === 1;
              const n = group.questions.length;
              return h(
                "label",
                { class: "group-option" },
                h("input", {
                  type: "checkbox",
                  checked: selected,
                  disabled: locked,
                  onChange: (event) => toggleGroup(group.id, event.currentTarget.checked),
                }),
                h("span", { text: group.label }),
                h("span", {
                  class: "meta",
                  text: `${n} ${n > 1 ? copy.units : copy.unit}`,
                }),
              );
            }),
          ),
        )
      : null,
    state.category?.id === "poissons-france"
      ? h(
          "fieldset",
          { class: "groups" },
          h("legend", { text: "Photos" }),
          h(
            "label",
            { class: "group-option" },
            h("input", {
              type: "checkbox",
              checked: state.safeFish,
              onChange: (event) => saveSafeFish(event.currentTarget.checked),
            }),
            h("span", { text: "Poissons vivants" }),
          ),
          h("p", {
            class: "meta",
            text: "Uniquement des poissons vivants dans leur milieu, pas de poissons morts, de marché, de plat ou d'aquarium.",
          }),
        )
      : null,
    h(
      "section",
      { class: reviseN ? "revise-panel" : "revise-panel is-empty" },
      h(
        "div",
        { class: "revise-panel-copy" },
        h("h2", { class: "revise-title", text: "Réviser" }),
        h("p", {
          class: "revise-blurb",
          text: reviseN
            ? `${reviseN} carte${reviseN > 1 ? "s" : ""} à revoir (erreurs et révisions dues).`
            : "Rien à réviser pour l’instant — joue une partie pour alimenter ta file.",
        }),
      ),
      h("button", {
        class: "revise-cta",
        type: "button",
        text: reviseN ? `Réviser (${reviseN})` : "Réviser",
        disabled: !reviseN,
        onClick: () => startRevise(),
      }),
    ),
  );
}

function quizKicker() {
  return `${state.category.categorie} · ${LEVEL_LABEL[state.difficulty]} · ${modeLabel(state.mode)}`;
}

function photoFrame() {
  const copy = quizCopy();
  return h(
    "div",
    { class: "frame is-loading", "data-frame": "true" },
    h("div", { class: "spinner", "data-spinner": "true" }),
    h("p", { class: "frame-status", "data-status": "true", text: copy.loading }),
    h("img", {
      "data-photo": "true",
      alt: copy.alt,
      hidden: true,
      decoding: "async",
    }),
  );
}

function progressBar(position, total) {
  const bar = h("span");
  bar.style.width = `${Math.round((position / total) * 100)}%`;
  return h("div", { class: "progress-wrap" }, h("div", { class: "progress", "aria-hidden": "true" }, bar));
}

function mountQuiz() {
  if (state.mode === "groupes") {
    mountSortQuiz();
    return;
  }
  if (state.mode === "paire") {
    mountPairQuiz();
    return;
  }
  if (state.mode === "variantes") {
    mountVariantQuiz();
    return;
  }
  if (state.mode === "sexes") {
    mountSexQuiz();
    return;
  }
  if (state.mode === "chant") {
    mountChantQuiz();
    return;
  }
  if (state.mode === "relier") {
    mountLinkQuiz();
    return;
  }
  mountClassicQuiz();
}

function loadVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw == null || raw === "") return 0.8;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0 && value <= 1) return value;
  } catch {
    // Le volume par défaut reste utilisable.
  }
  return 0.8;
}

function saveVolume(level) {
  try {
    localStorage.setItem(VOLUME_KEY, String(level));
  } catch {
    // Le quiz reste jouable si le stockage est bloqué.
  }
}

function applyChantVolume() {
  const level = loadVolume();
  const audio = document.querySelector("[data-chant-audio]");
  if (audio) audio.volume = level;
  return level;
}

function loadCrossOriginImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image"));
    image.src = url;
  });
}

function drawContain(ctx, image, width, height) {
  const ratio = image.naturalWidth / Math.max(1, image.naturalHeight);
  let drawWidth = width;
  let drawHeight = width / ratio;
  if (drawHeight > height) {
    drawHeight = height;
    drawWidth = height * ratio;
  }
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

let chantPicture = null;
let chantPictureUrl = "";
let chantPictureFailed = false;

function paintChantPixels(stage) {
  const look = CHANT_LOOKS[stage];
  const canvas = document.querySelector("[data-chant-canvas]");
  const frame = document.querySelector("[data-chant-frame]");
  const label = document.querySelector("[data-chant-stage]");
  if (label && !state.revealed) label.textContent = CHANT_LABELS[stage] || "";
  if (!look) return;
  if (stage >= CHANT_LOOKS.length - 1) {
    showChantSharp();
    return;
  }
  const ctx = canvas?.getContext?.("2d");
  if (!canvas || !ctx || !chantPicture) {
    if (chantPictureFailed) showChantFallback(stage);
    return;
  }
  canvas.hidden = false;
  const fallback = document.querySelector("[data-chant-fallback]");
  if (fallback) {
    fallback.hidden = true;
    fallback.removeAttribute("data-photo");
  }
  if (frame) frame.classList.remove("is-loading");
  const status = frame?.querySelector("[data-status]");
  if (status) status.textContent = "";
  canvas.style.filter = look.blur ? `blur(${look.blur}px)` : "";
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const tiny = document.createElement("canvas");
  tiny.width = look.cells;
  tiny.height = Math.max(1, Math.round(look.cells * (height / width)));
  const tinyCtx = tiny.getContext("2d");
  tinyCtx.imageSmoothingEnabled = true;
  drawContain(tinyCtx, chantPicture, tiny.width, tiny.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tiny, 0, 0, width, height);
}

function showChantFallback(stage) {
  const look = CHANT_LOOKS[stage];
  const canvas = document.querySelector("[data-chant-canvas]");
  const fallback = document.querySelector("[data-chant-fallback]");
  const frame = document.querySelector("[data-chant-frame]");
  if (canvas) canvas.hidden = true;
  if (!fallback || !chantPictureUrl || !look) return;
  fallback.hidden = false;
  fallback.removeAttribute("data-photo");
  fallback.alt = quizCopy().alt;
  if (fallback.getAttribute("src") !== chantPictureUrl) fallback.src = chantPictureUrl;
  fallback.style.filter = look.blur ? `blur(${look.blur}px)` : "";
  if (frame) frame.classList.remove("is-loading");
  const status = frame?.querySelector("[data-status]");
  if (status) status.textContent = "";
}

function showChantSharp() {
  const canvas = document.querySelector("[data-chant-canvas]");
  const fallback = document.querySelector("[data-chant-fallback]");
  const frame = document.querySelector("[data-chant-frame]");
  const label = document.querySelector("[data-chant-stage]");
  if (canvas) {
    canvas.hidden = true;
    canvas.style.filter = "";
  }
  if (!fallback) return;
  if (!chantPictureUrl) {
    fallback.hidden = false;
    fallback.alt = "Image indisponible";
    fallback.src = PLACEHOLDER;
    fallback.removeAttribute("data-photo");
    return;
  }
  fallback.hidden = false;
  fallback.style.filter = "";
  fallback.alt = state.revealed ? currentQuestion()?.nom_commun || "Photo nette" : "Photo nette";
  if (fallback.getAttribute("src") !== chantPictureUrl) fallback.src = chantPictureUrl;
  fallback.setAttribute("data-photo", "true");
  if (frame) frame.classList.remove("is-loading");
  const status = frame?.querySelector("[data-status]");
  if (status) status.textContent = "";
  if (label) label.textContent = state.revealed ? "" : "Photo nette";
}

function revealChantStep() {
  if (screen !== "quiz" || state.revealed || state.mode !== "chant") return;
  const question = currentQuestion();
  const next = Math.min(CHANT_LOOKS.length - 1, (question.chantStage || 0) + 1);
  question.chantStage = next;
  paintChantPixels(next);
  const button = document.querySelector("[data-chant-step]");
  if (!button) return;
  if (next >= CHANT_LOOKS.length - 1) button.remove();
  else button.textContent = "Éclaircir";
}

function finishChantReveal() {
  const audio = document.querySelector("[data-chant-audio]");
  if (audio) audio.pause();
  document.querySelector("[data-chant-step]")?.remove();
  const play = document.querySelector("[data-chant-play]");
  if (play) play.disabled = true;
  const question = currentQuestion();
  if (question) question.chantStage = CHANT_LOOKS.length - 1;
  if (chantPicture || chantPictureUrl) showChantSharp();
}

function toggleChant() {
  const audio = document.querySelector("[data-chant-audio]");
  const button = document.querySelector("[data-chant-play]");
  if (!audio?.src || audio.disabled) return;
  applyChantVolume();
  if (audio.paused) {
    audio.play().then(() => {
      if (button) button.textContent = "Pause";
    }).catch(() => {});
    return;
  }
  audio.pause();
  if (button) button.textContent = "Écouter";
}

function onChantVolume(event) {
  const level = Number(event.currentTarget.value) / 100;
  saveVolume(level);
  applyChantVolume();
}

async function loadChant(question, position) {
  const still = () => screen === "quiz" && state.mode === "chant" && state.index + 1 === position;
  chantPicture = null;
  chantPictureUrl = "";
  chantPictureFailed = false;
  let audioUrls = [];
  let imageResult = { urls: [] };
  try {
    [audioUrls, imageResult] = await Promise.all([
      getSpeciesAudio(question.nom_scientifique),
      getSpeciesImages(imageSearchName(question), imageOptionsForQuestion(question)),
    ]);
  } catch {
    audioUrls = [];
    imageResult = { urls: [] };
  }
  if (!still()) return;

  const audioUrl = pickRandomImage(audioUrls);
  const imageUrl = pickRandomImage(imageResult.urls || [], imageResult.items || []);
  const audio = document.querySelector("[data-chant-audio]");
  const play = document.querySelector("[data-chant-play]");
  const volumeWrap = document.querySelector("[data-volume-wrap]");
  const missing = document.querySelector("[data-chant-missing]");
  const credit = document.querySelector("[data-credit]");
  if (audioUrl && audio) {
    audio.src = audioUrl;
    applyChantVolume();
    if (play) play.disabled = false;
    if (volumeWrap) volumeWrap.hidden = false;
    if (credit) credit.textContent = "Chant : Wikimedia Commons";
  } else if (missing) {
    missing.hidden = false;
    if (play) play.hidden = true;
    if (volumeWrap) volumeWrap.hidden = true;
  }

  const upcoming = state.questions[position];
  if (upcoming) preloadSpeciesAudio([upcoming.nom_scientifique]);

  if (!imageUrl) {
    const status = document.querySelector("[data-chant-frame] [data-status]");
    if (status) status.textContent = "Image indisponible. Tu peux répondre quand même.";
    const frame = document.querySelector("[data-chant-frame]");
    if (frame) frame.classList.remove("is-loading");
    return;
  }
  chantPictureUrl = imageUrl;
  try {
    chantPicture = await loadCrossOriginImage(imageUrl);
    chantPictureFailed = false;
  } catch {
    chantPicture = null;
    chantPictureFailed = true;
  }
  if (!still()) return;
  if ((question.chantStage || 0) > 0) paintChantPixels(question.chantStage);
}

function mountChantQuiz() {
  const question = currentQuestion();
  const total = state.questions.length;
  const position = state.index + 1;
  question.chantStage = 0;
  chantPicture = null;
  chantPictureUrl = "";
  chantPictureFailed = false;
  document.title = `Question ${position} sur ${total} — QuiQuiz`;
  renderTop({
    kicker: quizKicker(),
    title: `Question ${position} sur ${total}`,
    score: state.score,
    onBack: backToMenu,
  });

  const audio = h("audio", { "data-chant-audio": "true", preload: "none" });
  audio.addEventListener("ended", () => {
    const button = document.querySelector("[data-chant-play]");
    if (button) button.textContent = "Écouter";
  });

  const frame = h(
    "div",
    { class: "frame is-loading", "data-frame": "true", "data-chant-frame": "true" },
    h("canvas", { "data-chant-canvas": "true", width: "960", height: "720", hidden: true }),
    h("img", {
      "data-chant-fallback": "true",
      "data-species": question.nom_scientifique,
      alt: quizCopy().alt,
      hidden: true,
      decoding: "async",
    }),
    h("p", { class: "frame-status", "data-status": "true", text: "Écoute le chant, puis demande la photo." }),
  );

  show(
    view,
    progressBar(position, total),
    h(
      "div",
      { class: "chant-player" },
      audio,
      h("button", {
        class: "btn",
        type: "button",
        text: "Écouter",
        disabled: true,
        "data-chant-play": "true",
        onClick: toggleChant,
      }),
      h(
        "label",
        { class: "volume", "data-volume-wrap": "true", hidden: true },
        h("span", { text: "Volume" }),
        Object.assign(
          h("input", {
            type: "range",
            min: "0",
            max: "100",
            "aria-label": "Volume",
            onInput: onChantVolume,
          }),
          { value: String(Math.round(loadVolume() * 100)) },
        ),
      ),
    ),
    h("p", {
      class: "note",
      "data-chant-missing": "true",
      hidden: true,
      text: "Pas de chant trouvé pour cette espèce.",
    }),
    frame,
    h("p", { class: "chant-stage-label", "data-chant-stage": "true" }),
    h("p", { class: "credit", "data-credit": "true", text: quizCopy().creditCommons }),
    h(
      "div",
      { class: "options", role: "group", "aria-label": "Réponses" },
      ...optionButtons(question.options, choose),
    ),
    h("div", { "data-feedback": "true" }),
    h(
      "div",
      { class: "quiz-actions", "data-actions": "true" },
      h("button", {
        class: "btn secondary",
        type: "button",
        text: "Voir la photo",
        "data-chant-step": "true",
        onClick: revealChantStep,
      }),
    ),
    h("p", { class: "sr-only", "data-live": "true", "aria-live": "polite" }),
  );

  loadChant(question, position);
}

function mountClassicQuiz() {
  const question = currentQuestion();
  const total = state.questions.length;
  const position = state.index + 1;
  const showPhoto = state.mode !== "description";
  document.title = `Question ${position} sur ${total} — QuiQuiz`;
  renderTop({
    kicker: quizKicker(),
    title: `Question ${position} sur ${total}`,
    score: state.score,
    onBack: backToMenu,
  });

  const frame = showPhoto
    ? photoFrame()
    : h("p", { class: "description-card", text: question.description || "" });

  const actions = h("div", { class: "quiz-actions", "data-actions": "true" });
  if (showPhoto) {
    actions.append(
      h("button", {
        class: "btn secondary",
        type: "button",
        text: "Passer",
        hidden: true,
        "data-pass": "true",
        onClick: skipQuestion,
      }),
    );
  }
  actions.append(
    h("button", {
      class: "btn secondary",
      type: "button",
      text: "Indice",
      "data-hint-btn": "true",
      onClick: showHint,
    }),
  );
  if (state.difficulty === "melange" && !state.isDaily && !state.revealed) {
    actions.append(
      h("button", {
        class: "btn secondary",
        type: "button",
        text: "Arrêter",
        title: "Sauvegarde le score actuel et termine la partie",
        onClick: stopMelangeQuiz,
      }),
    );
  }

  const answer =
    state.mode === "texte"
      ? h(
          "div",
          { class: "answer-field" },
          h(
            "label",
            { class: "field-label", text: quizCopy().nameField },
            h("input", {
              type: "text",
              "data-answer-input": "true",
              autocomplete: "off",
              "aria-label": quizCopy().nameField,
              onInput: (event) => renderSuggestions(event.currentTarget.value),
              onKeydown: (event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                submitText(event.currentTarget.value);
              },
            }),
          ),
          h("div", { class: "suggestions", "data-suggestions": "true", hidden: true }),
        )
      : h(
          "div",
          { class: "options", role: "group", "aria-label": "Réponses" },
          ...optionButtons(question.options, choose),
        );

  show(
    view,
    progressBar(position, total),
    state.difficulty === "melange"
      ? h("p", { class: "pill", text: LEVEL_LABEL[question.difficulte] || question.difficulte })
      : null,
    frame,
    showPhoto ? h("p", { class: "credit", "data-credit": "true" }) : null,
    h("p", { class: "hint", "data-hint": "true", hidden: true }),
    answer,
    h("div", { "data-feedback": "true" }),
    actions,
    h("p", { class: "sr-only", "data-live": "true", "aria-live": "polite" }),
  );

  if (showPhoto) loadPhoto(question, position);
  if (state.mode === "texte") document.querySelector("[data-answer-input]")?.focus();
}

function mountSortQuiz() {
  const copy = quizCopy();
  const title = copy.modes.groupes?.label || "Ranger par groupe";
  document.title = `${title} — QuiQuiz`;
  renderTop({
    kicker: quizKicker(),
    title,
    score: state.score,
    onBack: backToMenu,
  });

  const cards = state.questions.map((question) => {
    const frame = photoFrame();
    const card = h(
      "article",
      { class: "sort-card", "data-sort": question.id },
      frame,
      h(
        "div",
        {
          class: "chips",
          role: "group",
          "aria-label": `${copy.groupWord[0].toUpperCase()}${copy.groupWord.slice(1)} de cette ${copy.media}`,
        },
        state.selectedGroups.map((groupId) =>
          h("button", {
            class: "chip",
            type: "button",
            text: groupLabel(groupId),
            "data-group": groupId,
            onClick: () => pickSortGroup(question.id, groupId),
          }),
        ),
      ),
    );
    fillSpeciesFrame(
      frame,
      imageSearchName(question),
      () => screen === "quiz" && frame.isConnected,
      undefined,
      imageOptionsForQuestion(question),
    );
    return card;
  });

  const actions = h(
    "div",
    { class: "quiz-actions", "data-actions": "true" },
    h("button", {
      class: "btn",
      type: "button",
      text: "Valider",
      disabled: true,
      "data-validate": "true",
      onClick: validateSort,
    }),
  );

  show(
    view,
    h("p", { class: "lede", text: copy.sortLede }),
    h("div", { class: "sort-grid" }, cards),
    h("p", { class: "credit", text: copy.creditList }),
    actions,
  );
}

function mountPairQuiz() {
  const question = currentQuestion();
  const total = state.questions.length;
  const position = state.index + 1;
  document.title = `Question ${position} sur ${total} — QuiQuiz`;
  renderTop({
    kicker: quizKicker(),
    title: `Question ${position} sur ${total}`,
    score: state.score,
    onBack: backToMenu,
  });

  const left = photoFrame();
  const right = photoFrame();
  show(
    view,
    progressBar(position, total),
    h("p", { class: "lede", text: quizCopy().sameItemPrompt }),
    h("div", { class: "pair" }, left, right),
    h("p", { class: "credit", text: quizCopy().creditList }),
    h(
      "div",
      { class: "pair-actions", role: "group", "aria-label": quizCopy().pairAria },
      h("button", {
        class: "option",
        type: "button",
        text: "Oui",
        "data-pair": "oui",
        onClick: () => choosePair("oui"),
      }),
      h("button", {
        class: "option",
        type: "button",
        text: "Non",
        "data-pair": "non",
        onClick: () => choosePair("non"),
      }),
    ),
    h("div", { "data-feedback": "true" }),
    h("div", { class: "quiz-actions", "data-actions": "true" }),
    h("p", { class: "sr-only", "data-live": "true", "aria-live": "polite" }),
  );

  const still = () => screen === "quiz" && state.index + 1 === position;
  fillKnownFrame(left, question.left.url, still, question.left.nom_scientifique);
  fillKnownFrame(right, question.right.url, still, question.right.nom_scientifique);
}

function paintPairReveal(answer, correct) {
  const question = currentQuestion();
  for (const button of document.querySelectorAll("[data-pair]")) {
    button.disabled = true;
    const expected = question.same ? "oui" : "non";
    if (button.dataset.pair === expected) {
      button.classList.add("is-correct", "is-pop");
      button.append(h("small", { text: "Bonne réponse" }));
    } else if (button.dataset.pair === answer) {
      button.classList.add("is-wrong", "is-shake");
      button.append(h("small", { text: "Ton choix" }));
    }
  }

  const mediaPlural = quizCopy().media === "carte" ? "cartes" : "photos";
  const detail = question.same
    ? `Les deux ${mediaPlural} montrent ${question.left.nom_commun}.`
    : `À gauche : ${question.left.nom_commun}. À droite : ${question.right.nom_commun}.`;
  const feedback = document.querySelector("[data-feedback]");
  if (!feedback) return;
  feedback.className = correct ? "feedback is-correct" : "feedback is-wrong";
  const latinLine = question.same
    ? latinWithWiki(question.left.nom_commun, question.left.nom_scientifique)
    : h(
        "p",
        { class: "latin" },
        h("span", { class: "latin-name", text: question.left.nom_scientifique }),
        h("span", { class: "latin-sep", text: " · " }),
        wikipediaLink(question.left.nom_commun, question.left.nom_scientifique),
        h("br"),
        h("span", { class: "latin-name", text: question.right.nom_scientifique }),
        h("span", { class: "latin-sep", text: " · " }),
        wikipediaLink(question.right.nom_commun, question.right.nom_scientifique),
      );
  feedback.replaceChildren(
    ...[
      feedbackHead(correct),
      h("p", { text: detail }),
      latinLine,
      !correct
        ? ficheLinkButton(question.same ? question.left : question.left, "Voir la fiche (gauche)")
        : null,
      !correct && !question.same ? ficheLinkButton(question.right, "Voir la fiche (droite)") : null,
    ].filter((node) => node instanceof Node),
  );

  const frames = document.querySelectorAll(".pair [data-frame]");
  const leftPhoto = frames[0]?.querySelector("[data-photo]");
  const rightPhoto = frames[1]?.querySelector("[data-photo]");
  if (leftPhoto) leftPhoto.alt = question.left.nom_commun;
  if (rightPhoto) rightPhoto.alt = question.right.nom_commun;
  attachImageSearch(frames[0], question.left.nom_commun, question.left.nom_scientifique);
  const rightBird = question.same ? question.left : question.right;
  attachImageSearch(frames[1], rightBird.nom_commun, rightBird.nom_scientifique);

  const score = document.querySelector("[data-score]");
  if (score) score.textContent = String(state.score);
  const live = document.querySelector("[data-live]");
  if (live) live.textContent = detail;

  const last = state.index + 1 >= state.questions.length;
  document.querySelector("[data-actions]")?.replaceChildren(
    h("button", {
      class: "btn",
      type: "button",
      text: last ? "Voir le résultat" : "Question suivante",
      onClick: goNext,
    }),
  );
}

function pairMediaWord() {
  return quizCopy().media === "carte" ? "cartes" : "photos";
}

function pairQuestion(same, left, leftUrl, right, rightUrl) {
  const sameName = left.nom_commun === right.nom_commun;
  return {
    same,
    left: { nom_commun: left.nom_commun, nom_scientifique: left.nom_scientifique, url: leftUrl },
    right: { nom_commun: right.nom_commun, nom_scientifique: right.nom_scientifique, url: rightUrl },
    nom_commun: sameName ? left.nom_commun : `${left.nom_commun} / ${right.nom_commun}`,
    nom_scientifique: sameName
      ? left.nom_scientifique
      : `${left.nom_scientifique} · ${right.nom_scientifique}`,
    explication: sameName
      ? `Les deux ${pairMediaWord()} montrent ${left.nom_commun}.`
      : `À gauche ${left.nom_commun}, à droite ${right.nom_commun}.`,
  };
}

function assemblePairs(loaded, total) {
  const yesPool = loaded.filter((item) => item.urls.length >= 2);
  const anyPool = loaded.filter((item) => item.urls.length >= 1);
  const canYes = yesPool.length > 0;
  const canNo = anyPool.length >= 2;
  if (!canYes && !canNo) return [];

  let yesCount = 0;
  let noCount = 0;
  if (canYes && canNo) {
    yesCount = Math.floor(total / 2);
    noCount = total - yesCount;
  } else if (canYes) yesCount = total;
  else noCount = total;

  const pairs = [];
  const cursor = new Map();

  const takeYes = (item) => {
    const urls = item.urls;
    const start = cursor.get(item.nom_scientifique) || 0;
    for (let step = 0; step < urls.length; step += 1) {
      const leftUrl = urls[(start + step) % urls.length];
      const rightUrl = urls[(start + step + 1) % urls.length];
      if (leftUrl !== rightUrl) {
        cursor.set(item.nom_scientifique, start + step + 2);
        return [leftUrl, rightUrl];
      }
    }
    return null;
  };

  const takeOne = (item) => {
    const start = cursor.get(item.nom_scientifique) || 0;
    cursor.set(item.nom_scientifique, start + 1);
    return item.urls[start % item.urls.length];
  };

  const yesOrder = shuffle(yesPool);
  for (let index = 0; index < yesCount; index += 1) {
    const item = yesOrder[index % yesOrder.length];
    const photos = takeYes(item);
    if (!photos) continue;
    pairs.push(pairQuestion(true, item, photos[0], item, photos[1]));
  }

  const noOrder = shuffle(anyPool);
  for (let index = 0; pairs.length < yesCount + noCount && noOrder.length >= 2; index += 1) {
    const left = noOrder[index % noOrder.length];
    let right = noOrder[(index + 1) % noOrder.length];
    if (right.nom_scientifique === left.nom_scientifique) {
      right = noOrder[(index + 2) % noOrder.length];
    }
    if (right.nom_scientifique === left.nom_scientifique) break;
    pairs.push(pairQuestion(false, left, takeOne(left), right, takeOne(right)));
  }

  return pairs;
}

async function buildPairs(source, token) {
  const loaded = [];
  for (const question of source) {
    let result = { urls: [] };
    try {
      result = await getSpeciesImages(
        imageSearchName(question),
        imageOptionsForQuestion(question)
      );
    } catch {
      result = { urls: [] };
    }
    if (token !== state.prepToken || screen !== "preparing") return;
    const urls = [...new Set(result.urls || [])];
    if (urls.length) loaded.push({ ...question, urls: shuffle(urls) });
  }
  if (token !== state.prepToken || screen !== "preparing") return;

  const pairs = assemblePairs(loaded, source.length);
  if (!pairs.length) {
    state.notice = `${quizCopy().pairFail} Choisis un autre niveau, ou réessaie.`;
    setScreen("levels");
    return;
  }
  state.questions = shuffle(pairs);
  setScreen("quiz");
}

function sexLabel(sex) {
  return sex === "male" ? "mâle" : "femelle";
}

function paintVariantPicks() {
  const question = currentQuestion();
  for (const card of document.querySelectorAll("[data-member]")) {
    const member = question.members[Number(card.dataset.member)];
    for (const chip of card.querySelectorAll("[data-name]")) {
      chip.classList.toggle("is-picked", chip.dataset.name === member?.chosen);
    }
  }
  const validate = document.querySelector("[data-validate]");
  if (validate) validate.disabled = question.members.some((member) => !member.chosen);
}

function pickVariantName(memberIndex, name) {
  if (state.revealed || state.mode !== "variantes") return;
  const question = currentQuestion();
  const member = question.members[memberIndex];
  if (!member) return;
  member.chosen = member.chosen === name ? "" : name;
  paintVariantPicks();
}

function validateVariants() {
  if (screen !== "quiz" || state.revealed || state.mode !== "variantes") return;
  const question = currentQuestion();
  if (question.members.some((member) => !member.chosen)) return;
  state.revealed = true;
  let correctCount = 0;
  for (const [index, member] of question.members.entries()) {
    const correct = member.chosen === member.nom_commun;
    if (correct) correctCount += 1;
    else {
      state.missed.push({
        nom_commun: member.nom_commun,
        nom_scientifique: member.nom_scientifique,
        explication: member.explication,
        given: member.chosen,
      });
    }
    const card = document.querySelector(`[data-member="${index}"]`);
    if (!card) continue;
    for (const chip of card.querySelectorAll("[data-name]")) {
      chip.disabled = true;
      if (chip.dataset.name === member.nom_commun) chip.classList.add("is-correct");
      else if (chip.dataset.name === member.chosen) chip.classList.add("is-wrong");
    }
    const photo = card.querySelector("[data-photo]");
    if (photo) photo.alt = member.nom_commun;
    card.append(
      h("p", { class: "caption", text: member.nom_commun }),
      latinWithWiki(member.nom_commun, member.nom_scientifique),
      imageSearchLink(member.nom_commun, member.nom_scientifique),
    );
  }
  state.score += correctCount;
  const scoreNode = document.querySelector("[data-score]");
  if (scoreNode) scoreNode.textContent = String(state.score);
  const validate = document.querySelector("[data-validate]");
  validate?.remove();
  const last = state.index + 1 >= state.questions.length;
  const live = document.querySelector("[data-live]");
  if (live) {
    live.textContent =
      correctCount === question.members.length
        ? "Toute la série est juste."
        : `${correctCount} photo${correctCount > 1 ? "s" : ""} sur ${question.members.length}.`;
  }
  document.querySelector("[data-actions]")?.append(
    h("button", {
      class: "btn",
      type: "button",
      text: last ? "Voir le résultat" : "Série suivante",
      onClick: goNext,
    }),
  );
}

function mountVariantQuiz() {
  const question = currentQuestion();
  const total = state.questions.length;
  const position = state.index + 1;
  document.title = `Série ${position} sur ${total} — QuiQuiz`;
  renderTop({
    kicker: quizKicker(),
    title: `Série ${position} sur ${total}`,
    score: state.score,
    onBack: backToMenu,
  });

  const names = question.names;
  const cards = question.members.map((member, index) => {
    const frame = photoFrame();
    const card = h(
      "article",
      { class: "sort-card", "data-member": String(index) },
      frame,
      h(
        "div",
        { class: "chips", role: "group", "aria-label": "Nom de cette photo" },
        names.map((name) =>
          h("button", {
            class: "chip",
            type: "button",
            text: name,
            "data-name": name,
            onClick: () => pickVariantName(index, name),
          }),
        ),
      ),
    );
    fillKnownFrame(
      frame,
      member.url,
      () => screen === "quiz" && state.index + 1 === position && frame.isConnected,
      member.nom_scientifique,
    );
    return card;
  });

  show(
    view,
    progressBar(position, total),
    h("p", { class: "lede", text: "Deux photos tirées au hasard. Le même nom peut revenir deux fois." }),
    h("div", { class: "match-grid" }, cards),
    h("p", { class: "credit", text: quizCopy().creditList }),
    h(
      "div",
      { class: "quiz-actions", "data-actions": "true" },
      h("button", {
        class: "btn",
        type: "button",
        text: "Valider",
        disabled: true,
        "data-validate": "true",
        onClick: validateVariants,
      }),
    ),
    h("p", { class: "sr-only", "data-live": "true", "aria-live": "polite" }),
  );
}

function sexSentence(leftSex, rightSex) {
  if (leftSex === rightSex) {
    return leftSex === "male"
      ? "Les deux photos montrent un mâle."
      : "Les deux photos montrent une femelle.";
  }
  return leftSex === "male"
    ? "La première photo est un mâle, la seconde une femelle."
    : "La première photo est une femelle, la seconde un mâle.";
}

function paintSexPicks() {
  const question = currentQuestion();
  for (const column of document.querySelectorAll("[data-side]")) {
    const chosen = column.dataset.side === "left" ? question.leftChoice : question.rightChoice;
    for (const chip of column.querySelectorAll("[data-sex]")) {
      chip.classList.toggle("is-picked", chip.dataset.sex === chosen);
    }
  }
  const validate = document.querySelector("[data-validate]");
  if (validate) validate.disabled = !question.leftChoice || !question.rightChoice;
}

function pickSex(side, sex) {
  if (screen !== "quiz" || state.revealed || state.mode !== "sexes") return;
  const question = currentQuestion();
  const key = side === "left" ? "leftChoice" : "rightChoice";
  question[key] = question[key] === sex ? "" : sex;
  paintSexPicks();
}

function validateSex() {
  if (screen !== "quiz" || state.revealed || state.mode !== "sexes") return;
  const question = currentQuestion();
  if (!question.leftChoice || !question.rightChoice) return;
  state.revealed = true;
  const sides = [
    ["left", question.leftChoice, question.left.sex],
    ["right", question.rightChoice, question.right.sex],
  ];
  let correctCount = 0;
  for (const [, chosen, actual] of sides) {
    if (chosen === actual) correctCount += 1;
  }
  state.score += correctCount;
  if (correctCount < sides.length) {
    state.missed.push({
      nom_commun: question.nom_commun,
      nom_scientifique: question.nom_scientifique,
      explication: question.explication,
      given: `Première photo : ${sexLabel(question.leftChoice)}. Seconde : ${sexLabel(question.rightChoice)}.`,
    });
  }
  paintSexReveal(correctCount === sides.length, correctCount);
}

function paintSexReveal(correct, correctCount) {
  const question = currentQuestion();
  for (const column of document.querySelectorAll("[data-side]")) {
    const side = column.dataset.side;
    const actual = question[side].sex;
    const chosen = side === "left" ? question.leftChoice : question.rightChoice;
    for (const chip of column.querySelectorAll("[data-sex]")) {
      chip.disabled = true;
      if (chip.dataset.sex === actual) chip.classList.add("is-correct");
      else if (chip.dataset.sex === chosen && chosen !== actual) chip.classList.add("is-wrong");
    }
    const photo = column.querySelector("[data-photo]");
    const label = `${question.nom_commun}, ${sexLabel(actual)}`;
    if (photo) photo.alt = label;
    column.append(imageSearchLink(`${question.nom_commun} ${sexLabel(actual)}`, question.nom_scientifique));
  }

  const feedback = document.querySelector("[data-feedback]");
  feedback.className = correct ? "feedback is-correct" : "feedback is-wrong";
  feedback.replaceChildren(
    ...[
      feedbackHead(correct),
      h("p", { text: question.explication }),
      latinWithWiki(question.nom_commun, question.nom_scientifique),
      !correct ? ficheLinkButton(question) : null,
    ].filter((node) => node instanceof Node),
  );
  const score = document.querySelector("[data-score]");
  if (score) score.textContent = String(state.score);
  const live = document.querySelector("[data-live]");
  if (live) {
    live.textContent = correct
      ? "Les deux photos sont justes."
      : `${correctCount} photo${correctCount > 1 ? "s" : ""} sur 2.`;
  }
  document.querySelector("[data-validate]")?.remove();
  const last = state.index + 1 >= state.questions.length;
  document.querySelector("[data-actions]")?.append(
    h("button", {
      class: "btn",
      type: "button",
      text: last ? "Voir le résultat" : "Question suivante",
      onClick: goNext,
    }),
  );
}

function sexColumn(side, bird, position) {
  const frame = photoFrame();
  const column = h(
    "figure",
    { class: "sex-col", "data-side": side },
    frame,
    h(
      "div",
      { class: "chips", role: "group", "aria-label": "Sexe de cette photo" },
      h("button", {
        class: "chip",
        type: "button",
        text: "Mâle",
        "data-sex": "male",
        onClick: () => pickSex(side, "male"),
      }),
      h("button", {
        class: "chip",
        type: "button",
        text: "Femelle",
        "data-sex": "female",
        onClick: () => pickSex(side, "female"),
      }),
    ),
  );
  fillKnownFrame(
    frame,
    bird.url,
    () => screen === "quiz" && state.index + 1 === position && frame.isConnected,
    bird.nom_scientifique,
  );
  return column;
}

function mountSexQuiz() {
  const question = currentQuestion();
  const total = state.questions.length;
  const position = state.index + 1;
  document.title = `Question ${position} sur ${total} — QuiQuiz`;
  renderTop({
    kicker: quizKicker(),
    title: `Question ${position} sur ${total}`,
    score: state.score,
    onBack: backToMenu,
  });
  show(
    view,
    progressBar(position, total),
    h("p", { class: "lede", text: "Indique le sexe de chaque photo. Les deux peuvent être des mâles, ou des femelles." }),
    h("p", { class: "species-title", text: question.nom_commun }),
    h("div", { class: "pair" }, sexColumn("left", question.left, position), sexColumn("right", question.right, position)),
    h("p", { class: "credit", text: quizCopy().creditList }),
    h("div", { "data-feedback": "true" }),
    h(
      "div",
      { class: "quiz-actions", "data-actions": "true" },
      h("button", {
        class: "btn",
        type: "button",
        text: "Valider",
        disabled: true,
        "data-validate": "true",
        onClick: validateSex,
      }),
    ),
    h("p", { class: "sr-only", "data-live": "true", "aria-live": "polite" }),
  );
}

function drawSpeciesPhoto(ready, avoidUrl) {
  const candidates = [];
  for (const species of ready) {
    const urls = species.urls.filter((url) => url !== avoidUrl);
    if (urls.length) candidates.push({ species, urls });
  }
  if (!candidates.length) return null;
  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  return {
    nom_commun: chosen.species.nom_commun,
    nom_scientifique: chosen.species.nom_scientifique,
    explication: chosen.species.explication,
    url: chosen.urls[Math.floor(Math.random() * chosen.urls.length)],
    chosen: "",
  };
}

function drawSexPhoto(photos, avoidUrl) {
  const first = Math.random() < 0.5 ? "male" : "female";
  const order = first === "male" ? ["male", "female"] : ["female", "male"];
  for (const sex of order) {
    const urls = (photos[sex] || []).filter((url) => url && url !== avoidUrl);
    if (!urls.length) continue;
    return { sex, url: urls[Math.floor(Math.random() * urls.length)] };
  }
  return null;
}

async function buildVariants(rounds, token) {
  const questions = [];
  for (const members of shuffle(rounds)) {
    const status = document.querySelector(".frame-status");
    if (status) status.textContent = `Série ${questions.length + 1}…`;
    const ready = [];
    for (const member of members) {
      let result = { urls: [] };
      try {
        result = await getSpeciesImages(
          imageSearchName(member),
          imageOptionsForQuestion(member)
        );
      } catch {
        result = { urls: [] };
      }
      if (token !== state.prepToken || screen !== "preparing") return;
      const urls = [...new Set(result.urls || [])];
      if (urls.length) ready.push({ ...member, urls });
    }
    if (ready.length < 2) continue;
    const left = drawSpeciesPhoto(ready, null);
    const right = drawSpeciesPhoto(ready, left?.url);
    if (!left || !right) continue;
    questions.push({
      members: [left, right],
      names: shuffle(ready.map((member) => member.nom_commun)),
    });
  }
  if (token !== state.prepToken || screen !== "preparing") return;
  if (!questions.length) {
    state.notice = "Pas assez de photos pour ces espèces proches. Choisis un autre niveau, ou réessaie.";
    setScreen("levels");
    return;
  }
  state.questions = questions;
  state.pointTotal = questions.reduce((sum, question) => sum + question.members.length, 0);
  setScreen("quiz");
}

async function buildSexes(candidates, token) {
  const questions = [];
  for (const bird of shuffle(candidates)) {
    const status = document.querySelector(".frame-status");
    if (status) status.textContent = `${bird.nom_commun}…`;
    let photos = { male: [], female: [] };
    try {
      photos = await getSexImages(bird.nom_scientifique);
    } catch {
      photos = { male: [], female: [] };
    }
    if (token !== state.prepToken || screen !== "preparing") return;
    const maleUrls = [...new Set(photos.male || [])];
    const femaleUrls = [...new Set(photos.female || [])];
    if (!maleUrls.length || !femaleUrls.length) continue;
    const left = drawSexPhoto({ male: maleUrls, female: femaleUrls }, null);
    const right = drawSexPhoto({ male: maleUrls, female: femaleUrls }, left?.url);
    if (!left || !right) continue;
    questions.push({
      nom_commun: bird.nom_commun,
      nom_scientifique: bird.nom_scientifique,
      explication: `${sexSentence(left.sex, right.sex)} ${bird.explication || ""}`.trim(),
      left,
      right,
      leftChoice: "",
      rightChoice: "",
    });
  }
  if (token !== state.prepToken || screen !== "preparing") return;
  if (!questions.length) {
    state.notice = "Pas de couple mâle et femelle trouvé pour ce niveau. Choisis un autre niveau, ou réessaie.";
    setScreen("levels");
    return;
  }
  state.questions = questions;
  state.pointTotal = questions.length * 2;
  setScreen("quiz");
}

let linkPointerMove = null;
let linkFocusMove = null;
let linkResizeObserver = null;

function clearFocusPointer() {
  if (linkFocusMove) {
    window.removeEventListener("pointermove", linkFocusMove);
    linkFocusMove = null;
  }
}

function releaseLinkBoard() {
  if (linkPointerMove) {
    window.removeEventListener("pointermove", linkPointerMove);
    linkPointerMove = null;
  }
  linkResizeObserver?.disconnect();
  linkResizeObserver = null;
  clearFocusPointer();
  document.querySelector(".link-focus")?.remove();
  document.body.classList.remove("link-focus-open");
}

function linkNameNode(name) {
  for (const node of document.querySelectorAll("[data-link-name]")) {
    if (node.dataset.linkName === name) return node;
  }
  return null;
}

function syncLinkPointer() {
  if (linkPointerMove) {
    window.removeEventListener("pointermove", linkPointerMove);
    linkPointerMove = null;
  }
  if (screen !== "quiz" || state.mode !== "relier" || state.revealed) return;
  const question = currentQuestion();
  if (!question?.pending || question.focus != null) return;
  linkPointerMove = (event) => drawLinkLines(event);
  window.addEventListener("pointermove", linkPointerMove);
}

function drawLinkLines(pointerEvent) {
  const board = document.querySelector(".link-board");
  const svg = board?.querySelector(".link-lines");
  if (!board || !svg || screen !== "quiz" || state.mode !== "relier") return;
  const boardRect = board.getBoundingClientRect();
  if (boardRect.width < 1 || boardRect.height < 1) return;
  svg.setAttribute("viewBox", `0 0 ${boardRect.width} ${boardRect.height}`);
  svg.setAttribute("width", String(boardRect.width));
  svg.setAttribute("height", String(boardRect.height));

  const question = currentQuestion();
  const stacked = window.matchMedia("(min-width: 800px)").matches;
  const edgePoint = (node, role) => {
    const rect = node.getBoundingClientRect();
    if (stacked) {
      return {
        x: rect.left + rect.width / 2 - boardRect.left,
        y: (role === "bird" ? rect.bottom : rect.top) - boardRect.top,
      };
    }
    return {
      x: (role === "bird" ? rect.right : rect.left) - boardRect.left,
      y: rect.top + rect.height / 2 - boardRect.top,
    };
  };
  const lines = [];
  for (const [index, member] of question.members.entries()) {
    if (!member.chosen) continue;
    const bird = board.querySelector(`[data-bird="${index}"]`);
    const name = linkNameNode(member.chosen);
    if (!bird || !name) continue;
    let kind = "set";
    if (state.revealed) kind = member.chosen === member.nom_commun ? "ok" : "bad";
    lines.push({ from: edgePoint(bird, "bird"), to: edgePoint(name, "name"), kind });
  }

  const pending = question.pending;
  if (!state.revealed && pending && pointerEvent) {
    const source =
      pending.side === "bird"
        ? board.querySelector(`[data-bird="${pending.key}"]`)
        : linkNameNode(pending.key);
    const target = pointerEvent.target;
    const inside = target instanceof Node && source.contains(target);
    if (source && !inside) {
      lines.push({
        from: edgePoint(source, pending.side === "bird" ? "bird" : "name"),
        to: {
          x: pointerEvent.clientX - boardRect.left,
          y: pointerEvent.clientY - boardRect.top,
        },
        kind: "draft",
      });
    }
  }

  const svgNs = "http://www.w3.org/2000/svg";
  svg.replaceChildren(
    ...lines.flatMap((line) => {
      const path = document.createElementNS(svgNs, "line");
      path.setAttribute("x1", String(line.from.x));
      path.setAttribute("y1", String(line.from.y));
      path.setAttribute("x2", String(line.to.x));
      path.setAttribute("y2", String(line.to.y));
      path.setAttribute("class", `link-line is-${line.kind}`);
      return [path];
    }),
  );
}

function paintLink() {
  const question = currentQuestion();
  const pending = state.revealed ? null : question.pending;
  for (const card of document.querySelectorAll("[data-bird]")) {
    const index = Number(card.dataset.bird);
    const member = question.members[index];
    if (!member) continue;
    const correct = state.revealed && member.chosen === member.nom_commun;
    card.classList.toggle(
      "is-pending",
      question.focus === index || (pending?.side === "bird" && pending.key === index),
    );
    card.classList.toggle("is-linked", Boolean(member.chosen) && !state.revealed);
    card.classList.toggle("is-correct", Boolean(correct));
    card.classList.toggle("is-wrong", state.revealed && !correct);
    const photo = card.querySelector("[data-photo]");
    if (state.revealed && photo) photo.alt = member.nom_commun;
  }
  for (const chip of document.querySelectorAll("[data-link-name]")) {
    const name = chip.dataset.linkName;
    const owner = question.members.find((member) => member.chosen === name);
    const named = question.members.find((member) => member.nom_commun === name);
    chip.classList.toggle("is-pending", pending?.side === "name" && pending.key === name);
    chip.classList.toggle("is-linked", Boolean(owner) && !state.revealed);
    chip.classList.toggle("is-correct", Boolean(state.revealed && named && named.chosen === name));
    chip.classList.toggle("is-wrong", Boolean(state.revealed && owner && owner.nom_commun !== name));
  }
  const validate = document.querySelector("[data-validate]");
  if (validate) validate.disabled = question.members.some((member) => !member.chosen);
  document.querySelector(".link-board")?.classList.toggle("is-revealed", Boolean(state.revealed));
  syncLinkPointer();
  if (state.revealed) drawLinkLines();
  else {
    const svg = document.querySelector(".link-board .link-lines");
    if (svg) svg.replaceChildren();
  }
}

function usableLinkPhoto(img) {
  const src = img?.currentSrc || img?.src || "";
  if (!img || img.hidden || !img.naturalWidth || !src || src.includes("placeholder.svg")) return "";
  return src;
}

function closeLinkFocus() {
  clearFocusPointer();
  document.querySelector(".link-focus")?.remove();
  document.body.classList.remove("link-focus-open");
  if (screen === "quiz" && state.mode === "relier" && !state.revealed) {
    const question = currentQuestion();
    if (question) question.focus = null;
  }
}

function linkLockIcon() {
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("class", "link-lock");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const body = document.createElementNS(svgNs, "rect");
  body.setAttribute("x", "5");
  body.setAttribute("y", "11");
  body.setAttribute("width", "14");
  body.setAttribute("height", "10");
  body.setAttribute("rx", "2");
  const shackle = document.createElementNS(svgNs, "path");
  shackle.setAttribute("d", "M8 11V8a4 4 0 0 1 8 0v3");
  for (const node of [body, shackle]) {
    node.setAttribute("fill", "none");
    node.setAttribute("stroke", "currentColor");
    node.setAttribute("stroke-width", "2");
    node.setAttribute("stroke-linecap", "round");
  }
  svg.append(body, shackle);
  return svg;
}

function focusNameNode(name) {
  for (const node of document.querySelectorAll("[data-focus-name]")) {
    if (node.dataset.focusName === name) return node;
  }
  return null;
}

function drawFocusLines(pointerEvent) {
  const panel = document.querySelector(".link-focus-panel");
  const svg = panel?.querySelector(".link-focus-lines");
  const photo = panel?.querySelector(".link-focus-photo img");
  if (!panel || !svg || screen !== "quiz" || state.mode !== "relier") return;
  const panelRect = panel.getBoundingClientRect();
  if (panelRect.width < 1 || panelRect.height < 1) return;
  svg.setAttribute("viewBox", `0 0 ${panelRect.width} ${panelRect.height}`);
  svg.setAttribute("width", String(panelRect.width));
  svg.setAttribute("height", String(panelRect.height));
  if (!photo || photo.hidden) {
    svg.replaceChildren();
    return;
  }

  const question = currentQuestion();
  const member = question?.members?.[question.focus];
  const photoRect = photo.getBoundingClientRect();
  const from = {
    x: photoRect.left + photoRect.width / 2 - panelRect.left,
    y: photoRect.bottom - panelRect.top,
  };
  const lines = [];
  if (member?.chosen) {
    const name = focusNameNode(member.chosen);
    if (name) {
      const rect = name.getBoundingClientRect();
      lines.push({
        from,
        to: {
          x: rect.left + rect.width / 2 - panelRect.left,
          y: rect.top - panelRect.top,
        },
        kind: "set",
      });
    }
  }
  const target = pointerEvent?.target;
  const hovered = target instanceof Element ? target.closest("[data-focus-name]") : null;
  if (pointerEvent && !(target instanceof Node && photo.contains(target))) {
    const rect = hovered?.getBoundingClientRect();
    lines.push({
      from,
      to: rect
        ? {
            x: rect.left + rect.width / 2 - panelRect.left,
            y: rect.top - panelRect.top,
          }
        : {
            x: pointerEvent.clientX - panelRect.left,
            y: pointerEvent.clientY - panelRect.top,
          },
      kind: "draft",
    });
  }

  const svgNs = "http://www.w3.org/2000/svg";
  const dot = document.createElementNS(svgNs, "circle");
  dot.setAttribute("cx", String(from.x));
  dot.setAttribute("cy", String(from.y));
  dot.setAttribute("r", "6");
  dot.setAttribute("class", "link-focus-dot");
  svg.replaceChildren(
    dot,
    ...lines.map((line) => {
      const path = document.createElementNS(svgNs, "line");
      path.setAttribute("x1", String(line.from.x));
      path.setAttribute("y1", String(line.from.y));
      path.setAttribute("x2", String(line.to.x));
      path.setAttribute("y2", String(line.to.y));
      path.setAttribute("class", `link-line is-${line.kind}`);
      return path;
    }),
  );
}

function syncFocusPointer() {
  clearFocusPointer();
  if (!document.querySelector(".link-focus")) return;
  linkFocusMove = (event) => drawFocusLines(event);
  window.addEventListener("pointermove", linkFocusMove);
}

function chooseFocusName(name) {
  if (screen !== "quiz" || state.revealed || state.mode !== "relier") return;
  const question = currentQuestion();
  const member = question.members[question.focus];
  if (!member) return;
  if (member.chosen === name) member.chosen = "";
  else {
    for (const other of question.members) {
      if (other !== member && other.chosen === name) other.chosen = "";
    }
    member.chosen = name;
  }
  question.pending = null;
  question.focus = null;
  clearFocusPointer();
  document.querySelector(".link-focus")?.remove();
  document.body.classList.remove("link-focus-open");
  paintLink();
}

function openLinkFocus(index) {
  if (screen !== "quiz" || state.revealed || state.mode !== "relier") return;
  const question = currentQuestion();
  const member = question.members[index];
  if (!member) return;
  question.pending = null;
  question.focus = index;
  paintLink();

  const thumb = document.querySelector(`[data-bird="${index}"] [data-photo]`);
  const image = h("img", { alt: "", hidden: true });
  image.dataset.species = member.nom_scientifique;
  const status = h("p", { class: "link-focus-status", text: quizCopy().loading });
  const showPhoto = () => {
    const src = usableLinkPhoto(thumb);
    if (!src || !image.isConnected) return;
    image.src = src;
    image.hidden = false;
    status.hidden = true;
    requestAnimationFrame(() => drawFocusLines());
  };

  const panel = h(
    "div",
    { class: "link-focus-panel" },
    h("div", { class: "link-focus-photo" }, image, status),
    h(
      "div",
      { class: "link-focus-names", role: "group", "aria-label": "Noms" },
      question.names.map((name) => {
        const locked = question.members.some((item, itemIndex) => itemIndex !== index && item.chosen === name);
        return h(
          "button",
          {
            class: [
              "link-focus-name",
              member.chosen === name ? "is-current" : "",
              locked ? "is-locked" : "",
            ]
              .filter(Boolean)
              .join(" "),
            type: "button",
            "data-focus-name": name,
            "aria-label": locked ? `${name}, déjà relié à une autre photo` : name,
            onClick: () => chooseFocusName(name),
          },
          h("span", { text: name }),
          locked ? linkLockIcon() : null,
        );
      }),
    ),
  );
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "link-focus-lines");
  svg.setAttribute("aria-hidden", "true");
  panel.append(svg);

  const overlay = h(
    "div",
    { class: "link-focus", role: "dialog", "aria-modal": "true", "aria-label": "Choisir le nom de cette photo" },
    h("button", {
      class: "link-focus-backdrop",
      type: "button",
      "aria-label": "Fermer",
      onClick: () => {
        closeLinkFocus();
        paintLink();
      },
    }),
    panel,
    h("button", {
      class: "link-focus-close",
      type: "button",
      text: "Fermer",
      onClick: () => {
        closeLinkFocus();
        paintLink();
      },
    }),
  );

  document.querySelector(".link-focus")?.remove();
  document.body.append(overlay);
  document.body.classList.add("link-focus-open");
  showPhoto();
  thumb?.addEventListener("load", showPhoto);
  syncFocusPointer();
  requestAnimationFrame(() => drawFocusLines());
}

function pickLinkEnd(side, key) {
  if (screen !== "quiz" || state.revealed || state.mode !== "relier") return;
  const question = currentQuestion();
  const pending = question.pending;
  if (pending && pending.side === side && pending.key === key) {
    question.pending = null;
    paintLink();
    return;
  }
  if (pending && pending.side !== side) {
    const birdIndex = side === "bird" ? key : pending.key;
    const name = side === "name" ? key : pending.key;
    const member = question.members[birdIndex];
    if (!member) return;
    if (member.chosen === name) member.chosen = "";
    else {
      for (const other of question.members) {
        if (other !== member && other.chosen === name) other.chosen = "";
      }
      member.chosen = name;
    }
    question.pending = null;
    paintLink();
    return;
  }
  question.pending = { side, key };
  paintLink();
}

function validateLink() {
  if (screen !== "quiz" || state.revealed || state.mode !== "relier") return;
  const question = currentQuestion();
  if (question.members.some((member) => !member.chosen)) return;
  state.revealed = true;
  question.pending = null;
  let correctCount = 0;
  for (const [index, member] of question.members.entries()) {
    const correct = member.chosen === member.nom_commun;
    if (correct) correctCount += 1;
    else {
      state.missed.push({
        nom_commun: member.nom_commun,
        nom_scientifique: member.nom_scientifique,
        explication: member.explication,
        given: member.chosen,
      });
      const answer = document.querySelector(`[data-bird="${index}"]`)?.parentElement?.querySelector(".link-answer");
      if (answer) {
        answer.hidden = false;
        answer.textContent = member.nom_commun;
      }
    }
  }
  state.score += correctCount;
  const scoreNode = document.querySelector("[data-score]");
  if (scoreNode) scoreNode.textContent = String(state.score);
  document.querySelector("[data-validate]")?.remove();
  const live = document.querySelector("[data-live]");
  if (live) {
    live.textContent =
      correctCount === question.members.length
        ? "Toute la série est juste."
        : `${correctCount} photo${correctCount > 1 ? "s" : ""} sur ${question.members.length}.`;
  }
  const last = state.index + 1 >= state.questions.length;
  document.querySelector("[data-actions]")?.append(
    h("button", {
      class: "btn",
      type: "button",
      text: last ? "Voir le résultat" : "Série suivante",
      onClick: goNext,
    }),
  );
  paintLink();
  requestAnimationFrame(() => drawLinkLines());
}

function mountLinkQuiz() {
  const question = currentQuestion();
  const total = state.questions.length;
  const position = state.index + 1;
  document.title = `Série ${position} sur ${total} — QuiQuiz`;
  renderTop({
    kicker: quizKicker(),
    title: `Série ${position} sur ${total}`,
    score: state.score,
    onBack: backToMenu,
  });

  const board = h("div", { class: "link-board" });
  board.style.setProperty("--count", String(question.members.length));
  question.members.forEach((member, index) => {
    const frame = photoFrame();
    const card = h(
      "button",
      {
        class: "link-bird",
        type: "button",
        "data-bird": String(index),
        onClick: () => openLinkFocus(index),
      },
      frame,
    );
    board.append(
        h(
          "div",
          { class: "link-bird-wrap", style: `--slot: ${index + 1}` },
          card,
          h("span", { class: "link-answer", hidden: true }),
        ),
    );
    fillSpeciesFrame(
      frame,
      imageSearchName(member),
      () => screen === "quiz" && state.index + 1 === position && frame.isConnected,
      undefined,
      imageOptionsForQuestion(member),
    );
  });
  question.names.forEach((name, index) => {
    board.append(
      h("button", {
        class: "link-name",
        type: "button",
        text: name,
        "data-link-name": name,
        style: `--slot: ${index + 1}`,
        onClick: () => pickLinkEnd("name", name),
      }),
    );
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "link-lines");
  svg.setAttribute("aria-hidden", "true");
  board.append(svg);

  show(
    view,
    progressBar(position, total),
    h("p", {
      class: "lede",
      text: "Touche une photo : elle s’ouvre en grand, puis choisis son nom. Valide quand tout est relié.",
    }),
    board,
    h("p", { class: "credit", text: quizCopy().creditList }),
    h(
      "div",
      { class: "quiz-actions", "data-actions": "true" },
      h("button", {
        class: "btn",
        type: "button",
        text: "Valider",
        disabled: true,
        "data-validate": "true",
        onClick: validateLink,
      }),
    ),
    h("p", { class: "sr-only", "data-live": "true", "aria-live": "polite" }),
  );

  linkResizeObserver = new ResizeObserver(() => {
    if (state.revealed) drawLinkLines();
    drawFocusLines();
  });
  linkResizeObserver.observe(board);
  paintLink();

  const upcoming = state.questions[state.index + 1];
  if (upcoming) {
    preloadSpecies(
      upcoming.members.map((member) => member.nom_scientifique),
      upcoming.members[0]?.nom_scientifique,
    );
  }
}

function mountPreparing() {
  const copy = quizCopy();
  document.title = "Préparation — QuiQuiz";
  renderTop({
    kicker: quizKicker(),
    title: copy.preparingTitle,
    onBack: backToMenu,
  });
  const lines =
    state.mode === "variantes"
      ? ["Deux photos tirées au hasard parmi des espèces proches.", "Chargement des photos des espèces proches…"]
      : state.mode === "sexes"
        ? ["Deux photos tirées au hasard. Les deux peuvent montrer le même sexe.", "Recherche des photos de mâle et de femelle…"]
        : [copy.preparingPair, copy.preparingDefault];
  const frame = h(
    "div",
    { class: "frame is-loading" },
    h("div", { class: "spinner" }),
    h("p", { class: "frame-status", text: lines[1] }),
  );
  view.replaceChildren(
    h(
      "div",
      { class: "prep-hero" },
      mascotImg(MASCOT.investigator, "prep-mascot", "96"),
      h("p", { class: "lede", text: lines[0] }),
    ),
    frame,
  );
}

async function loadPhoto(question, position) {
  const frame = document.querySelector("[data-frame]");
  if (!frame) return;
  const stillHere = () => screen === "quiz" && state.index + 1 === position && frame.isConnected;
  await fillSpeciesFrame(
    frame,
    imageSearchName(question),
    stillHere,
    ({ failed, source }) => {
      if (!stillHere()) return;
      const credit = document.querySelector("[data-credit]");
      const status = frame.querySelector("[data-status]");
      if (failed) {
        if (status) {
          status.textContent = "Image indisponible. Tu peux répondre quand même, ou passer.";
        }
        const pass = document.querySelector("[data-pass]");
        if (pass && !state.revealed) pass.hidden = false;
        return;
      }
      if (credit) {
        const copy = quizCopy();
        credit.textContent = source === "wikipedia" ? copy.creditWiki : copy.creditCommons;
      }
    },
    imageOptionsForQuestion(question),
  );
}

async function fillSpeciesFrame(frame, scientificName, stillHere, onReady, imageOptions = {}) {
  let result = { urls: [], source: "none" };
  try {
    result = await getSpeciesImages(scientificName, imageOptions);
  } catch {
    result = { urls: [], source: "none" };
  }
  if (!stillHere()) return;
  const img = frame.querySelector("[data-photo]");
  const spinner = frame.querySelector("[data-spinner]");
  const status = frame.querySelector("[data-status]");
  if (!img) return;
  img.dataset.species = scientificName;

  const showPlaceholder = () => {
    if (!stillHere()) return;
    img.dataset.final = "1";
    img.hidden = false;
    img.alt = "Image indisponible";
    img.src = PLACEHOLDER;
    if (spinner) spinner.hidden = true;
    frame.classList.remove("is-loading");
    if (status) status.textContent = "Image indisponible.";
    onReady?.({ failed: true, source: result.source });
  };

  const validatedUrls = (result.items || [])
    .filter((item) => item?.validated && item.url)
    .map((item) => item.url);
  const urls = shuffle(validatedUrls.length ? validatedUrls : result.urls || []);
  if (!urls.length) {
    showPlaceholder();
    return;
  }

  let cursor = 0;
  const tryNext = () => {
    if (!stillHere()) return;
    if (cursor >= urls.length) {
      showPlaceholder();
      return;
    }
    img.hidden = true;
    img.alt = quizCopy().alt;
    img.src = urls[cursor];
    cursor += 1;
  };

  img.addEventListener("error", () => {
    if (img.dataset.final === "1") return;
    tryNext();
  });
  img.addEventListener("load", () => {
    if (!stillHere() || img.dataset.final === "1") return;
    if (img.naturalWidth === 0) {
      tryNext();
      return;
    }
    img.hidden = false;
    if (spinner) spinner.hidden = true;
    frame.classList.remove("is-loading");
    if (status) status.textContent = "";
    const shownUrl = img.currentSrc || img.src;
    const meta = metaForUrl(shownUrl);
    img.dataset.photoTitle = meta.title || "";
    img.dataset.validated = meta.validated ? "1" : "";
    if (meta.sourceUrl) img.dataset.sourceUrl = meta.sourceUrl;
    attachPlayerMediaTools(frame, img, scientificName, () => tryNext());
    onReady?.({ failed: false, source: result.source });
  });

  tryNext();
}

function fillKnownFrame(frame, url, stillHere, scientificName = "") {
  const img = frame.querySelector("[data-photo]");
  const spinner = frame.querySelector("[data-spinner]");
  const status = frame.querySelector("[data-status]");
  if (!img) return;
  if (scientificName) img.dataset.species = scientificName;

  const fail = () => {
    if (!stillHere()) return;
    img.dataset.final = "1";
    img.hidden = false;
    img.alt = "Image indisponible";
    img.src = PLACEHOLDER;
    if (spinner) spinner.hidden = true;
    frame.classList.remove("is-loading");
    if (status) status.textContent = "Image indisponible.";
    frame.querySelector("[data-admin-mod]")?.remove();
  };

  img.addEventListener("error", () => {
    if (img.dataset.final === "1") return;
    fail();
  });
  img.addEventListener("load", () => {
    if (!stillHere() || img.dataset.final === "1") return;
    if (img.naturalWidth === 0) {
      fail();
      return;
    }
    img.hidden = false;
    if (spinner) spinner.hidden = true;
    frame.classList.remove("is-loading");
    if (status) status.textContent = "";
    const shownUrl = img.currentSrc || img.src;
    const meta = metaForUrl(shownUrl);
    img.dataset.photoTitle = meta.title || "";
    img.dataset.validated = meta.validated ? "1" : "";
    if (meta.sourceUrl) img.dataset.sourceUrl = meta.sourceUrl;
    attachPlayerMediaTools(frame, img, scientificName || img.dataset.species || "", () => {
      fail();
      if (status) status.textContent = quizCopy().mediaSignaled;
    });
  });

  img.alt = quizCopy().compareAlt;
  img.src = url;
}

function mountResults() {
  const total =
    Number.isInteger(state.resultTotal) && state.resultTotal > 0
      ? state.resultTotal
      : scoreTotal();
  const outcome = state.outcome;
  document.title = "Résultat — QuiQuiz";
  renderTop({
    kicker: quizKicker(),
    title: "Résultat",
  });

  const percent = total ? Math.round((state.score / total) * 100) : 0;
  const perfect = total > 0 && state.score === total;
  const mascotPose = resultsMascot(percent, perfect);
  const recordLine = outcome?.improved
    ? "Nouveau record pour ce mode."
    : outcome?.best
      ? `Meilleur score : ${outcome.best.score}/${outcome.best.total}`
      : "";

  const missed = state.missed.length
    ? h(
        "section",
        { class: "missed" },
        h("h2", { text: "À revoir" }),
        state.missed.map((item) =>
          h(
            "article",
            { class: "missed-card" },
            h("h3", { text: item.nom_commun }),
            latinWithWiki(item.nom_commun, item.nom_scientifique),
            h("p", {
              text: item.given ? `Ta réponse : ${item.given}` : "Question passée, sans réponse.",
            }),
            h("p", { text: item.explication }),
            ficheLinkButton(item),
          ),
        ),
      )
    : h("p", {
        class: "lede",
        text:
          state.mode === "groupes"
            ? `Aucune erreur. ${quizCopy().resultsPerfectGroupes}`
            : state.mode === "paire"
              ? "Aucune erreur. Toutes les paires ont été reconnues."
              : state.mode === "variantes"
                ? `Aucune erreur. Chaque ${quizCopy().media} a été reliée au bon nom.`
                : state.mode === "sexes"
                  ? "Aucune erreur. Mâles et femelles ont été reconnus."
                  : state.mode === "relier"
                    ? `Aucune erreur. Chaque ${quizCopy().media} a été reliée au bon nom.`
                    : `Aucune erreur. ${quizCopy().resultsPerfect}`,
      });

  show(
    view,
    h(
      "div",
      { class: "results-hero" },
      mascotImg(mascotPose, "results-mascot", "120"),
      h(
        "div",
        { class: "results-score-wrap" },
        h("p", { class: "score-xl", text: `${state.score}/${total}` }),
        h("p", { class: "percent", text: `${percent} %` }),
        recordLine ? h("p", { class: "record", text: recordLine }) : null,
        state.isDaily ? h("p", { class: "record", text: "Défi du jour" }) : null,
      ),
    ),
    missed,
    h(
      "div",
      { class: "actions" },
      state.missed.length
        ? h("button", {
            class: "btn",
            type: "button",
            text: "Rejouer mes erreurs",
            onClick: replayMissed,
          })
        : null,
      h("button", { class: "btn secondary", type: "button", text: "Recommencer", onClick: restartQuiz }),
      h("button", {
        class: "btn secondary",
        type: "button",
        text: "Menu du thème",
        onClick: backToMenu,
      }),
      h("button", {
        class: "btn secondary",
        type: "button",
        text: "Changer de catégorie",
        onClick: goHome,
      }),
    ),
  );
  if (state.pendingBadges?.length) {
    showBadgeToasts(state.pendingBadges);
    state.pendingBadges = [];
  }
}

function referenceCategory() {
  return state.category || state.categories[0] || null;
}

function sortedGroupBirds(group) {
  return [...(group.questions || [])].sort((left, right) =>
    left.nom_commun.localeCompare(right.nom_commun, "fr", { sensitivity: "base" }),
  );
}

function similarSpecies(question) {
  const family = VARIANT_FAMILIES.find((names) => names.some((name) => fold(name) === fold(question.nom_commun)));
  if (!family) return [];
  return family
    .map((name) => findSpecies(name))
    .filter((item) => item && fold(item.nom_commun) !== fold(question.nom_commun));
}

function openReference() {
  state.prepToken += 1;
  const category = referenceCategory();
  if (!category) return;
  state.category = category;
  state.fiche = null;
  syncImagePolicy();
  updateFooter(category);
  setScreen("reference");
}

function openFiche(question) {
  state.fiche = question;
  state.referenceGroup = question.groupe || "";
  setScreen("fiche");
}

function backToReference() {
  state.fiche = null;
  setScreen("reference");
}

async function loadThumb(img, scientificName, still) {
  let result = { urls: [] };
  try {
    result = await getSpeciesImages(scientificName);
  } catch {
    result = { urls: [] };
  }
  if (!still()) return;
  const url = pickRandomImage(result.urls || [], result.items || []);
  img.hidden = false;
  img.alt = img.alt || "";
  img.src = url || PLACEHOLDER;
  img.addEventListener(
    "error",
    () => {
      if (img.getAttribute("src") !== PLACEHOLDER) img.src = PLACEHOLDER;
    },
    { once: true },
  );
}

function referenceCard(question) {
  const img = h("img", {
    alt: question.nom_commun,
    hidden: true,
    decoding: "async",
    loading: "lazy",
  });
  const card = h(
    "button",
    { class: "ref-card", type: "button", onClick: () => openFiche(question) },
    h("div", { class: "frame ref-thumb" }, img),
    h("strong", { text: question.nom_commun }),
    h("span", { class: "latin", text: question.nom_scientifique }),
  );
  const still = () => screen === "reference" && img.isConnected;
  const observe = () => {
    if (!("IntersectionObserver" in window)) {
      loadThumb(img, question.nom_scientifique, still);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        loadThumb(img, question.nom_scientifique, still);
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(card);
  };
  requestAnimationFrame(observe);
  return card;
}

function mountReference() {
  const category = referenceCategory();
  document.title = "Référence — QuiQuiz";
  renderTop({ title: "Référence" });
  if (!category) {
    view.replaceChildren(h("p", { class: "lede", text: quizCopy().referenceEmpty }));
    return;
  }
  state.category = category;
  syncImagePolicy();
  updateFooter(category);
  const copy = quizCopy(category);
  const sections = (category.groupes || []).map((group) => {
    const birds = sortedGroupBirds(group);
    const n = birds.length;
    return h(
      "section",
      { class: "ref-group", id: `groupe-${group.id}` },
      h("h2", { text: group.label }),
      h("p", { class: "meta", text: `${n} ${n > 1 ? copy.units : copy.unit}` }),
      h("div", { class: "ref-grid" }, birds.map((question) => referenceCard(question))),
    );
  });
  show(
    view,
    h("p", { class: "lede", text: copy.referenceLede }),
    ...sections,
  );
  if (state.referenceGroup) {
    const groupId = state.referenceGroup;
    requestAnimationFrame(() => {
      if (screen !== "reference") return;
      document.getElementById(`groupe-${groupId}`)?.scrollIntoView({ block: "start" });
    });
  }
}

function mountFiche() {
  const question = state.fiche;
  if (!question) {
    setScreen("reference");
    return;
  }
  const category = referenceCategory();
  state.category = category;
  syncImagePolicy();
  updateFooter(category);
  const groupName = category?.groupes?.find((group) => group.id === question.groupe)?.label || "";
  document.title = `${question.nom_commun} — Référence`;
  renderTop({
    kicker: groupName,
    title: question.nom_commun,
    onBack: backToReference,
    backLabel: "Retour à la liste",
  });

  const gallery = h("div", { class: "ref-gallery", "data-gallery": "true" });
  const similars = similarSpecies(question);
  show(
    view,
    latinWithWiki(question.nom_commun, question.nom_scientifique, "latin fiche-latin"),
    gallery,
    imageSearchLink(question.nom_commun, question.nom_scientifique),
    h("section", { class: "fiche-block" },
      h("h2", { text: "Le reconnaître" }),
      question.description ? h("p", { text: question.description }) : null,
      question.explication ? h("p", { text: question.explication }) : null,
    ),
    similars.length
      ? h(
          "section",
          { class: "fiche-block" },
          h("h2", { text: "Ne pas confondre" }),
          h(
            "div",
            { class: "similar-list" },
            similars.map((item) =>
              h(
                "button",
                { class: "similar-card", type: "button", onClick: () => openFiche(item) },
                h("strong", { text: item.nom_commun }),
                h("span", { class: "latin", text: item.nom_scientifique }),
                item.description ? h("span", { text: item.description }) : null,
              ),
            ),
          ),
        )
      : null,
  );

  const still = () => screen === "fiche" && state.fiche?.nom_scientifique === question.nom_scientifique;
  loadFicheGallery(gallery, question, still);
}

async function loadFicheGallery(gallery, question, still) {
  let result = { urls: [] };
  try {
    result = await getSpeciesImages(
      imageSearchName(question),
      imageOptionsForQuestion(question)
    );
  } catch {
    result = { urls: [] };
  }
  if (!still()) return;
  const urls = [...new Set(result.urls || [])].slice(0, 6);
  if (!urls.length) {
    gallery.replaceChildren(h("p", { class: "meta", text: quizCopy().ficheNoMedia }));
    return;
  }
  gallery.replaceChildren(
    ...urls.map((url) => {
      const meta = metaForUrl(url);
      const frame = h(
        "div",
        { class: "frame" },
        h("img", {
          "data-photo": "true",
          "data-species": question.nom_scientifique,
          "data-photo-title": meta.title || "",
          "data-validated": meta.validated ? "1" : "",
          "data-source-url": meta.sourceUrl || "",
          alt: question.nom_commun,
          decoding: "async",
          src: url,
        }),
      );
      const img = frame.querySelector("img");
      const shot = h("div", { class: "ref-shot" }, frame);
      img.addEventListener(
        "error",
        () => {
          img.src = PLACEHOLDER;
          img.alt = "Image indisponible";
          img.removeAttribute("data-photo");
          frame.querySelector("[data-admin-mod]")?.remove();
        },
        { once: true },
      );
      const wire = () => {
        if (!still()) return;
        attachPlayerMediaTools(frame, img, question.nom_scientifique, () => shot.remove());
      };
      img.addEventListener("load", wire, { once: true });
      if (img.complete && img.naturalWidth) wire();
      return shot;
    }),
  );
}

function mountRevise() {
  const category = state.category;
  const card = state.reviseQueue[state.reviseIndex];
  document.title = "Réviser — QuiQuiz";
  renderTop({
    kicker: category?.categorie || "Révision",
    title: "Réviser",
    onBack: backToMenu,
  });
  if (!card) {
    show(
      view,
      h("p", { class: "lede", text: "Session de révision terminée." }),
      h("button", { class: "btn", type: "button", text: "Retour aux niveaux", onClick: backToMenu }),
    );
    return;
  }

  const frame = photoFrame();
  const answer = h("div", { class: "revise-answer", hidden: !state.reviseRevealed },
    h("h2", { text: card.commonName }),
    h("p", { class: "latin", text: card.scientificName }),
  );
  const actions = state.reviseRevealed
    ? h(
        "div",
        { class: "actions" },
        h("button", {
          class: "btn secondary",
          type: "button",
          text: "Encore",
          onClick: () => {
            markCardAgain(category.id, card.scientificName);
            state.reviseIndex += 1;
            state.reviseRevealed = false;
            mountRevise();
          },
        }),
        h("button", {
          class: "btn",
          type: "button",
          text: "OK",
          onClick: () => {
            markCardOk(category.id, card.scientificName);
            state.reviseIndex += 1;
            state.reviseRevealed = false;
            mountRevise();
          },
        }),
      )
    : h("button", {
        class: "btn",
        type: "button",
        text: "Voir la réponse",
        onClick: () => {
          state.reviseRevealed = true;
          mountRevise();
        },
      });

  show(
    view,
    h("p", {
      class: "lede",
      text: `Carte ${state.reviseIndex + 1} / ${state.reviseQueue.length}`,
    }),
    frame,
    h("p", { class: "credit", "data-credit": "true" }),
    answer,
    actions,
  );
  const reviseQuestion = {
    nom_scientifique: card.scientificName,
    nom_commun: card.commonName || card.scientificName,
  };
  fillSpeciesFrame(
    frame,
    imageSearchName(reviseQuestion),
    () => screen === "revise" && state.reviseQueue[state.reviseIndex]?.scientificName === card.scientificName,
    undefined,
    imageOptionsForQuestion(reviseQuestion),
  );
}

function mountError() {
  document.title = "QuiQuiz";
  renderTop({ title: "QuiQuiz" });
  view.replaceChildren(h("p", { class: "lede", text: state.error }));
}

function mount() {
  if (screen === "home") mountHome();
  else if (screen === "levels") mountLevels();
  else if (screen === "preparing") mountPreparing();
  else if (screen === "quiz") mountQuiz();
  else if (screen === "results") mountResults();
  else if (screen === "reference") mountReference();
  else if (screen === "fiche") mountFiche();
  else if (screen === "revise") mountRevise();
  else if (screen === "error") mountError();
  else {
    renderTop({ title: "QuiQuiz" });
    view.replaceChildren(h("p", { class: "lede", text: "Chargement…" }));
  }
}

async function applyRoute(route) {
  if (!route || route.name === "home") {
    if (screen !== "home") goHome();
    return;
  }
  const category = await ensureCategoryById(route.categoryId);
  if (!category) {
    goHome();
    return;
  }
  state.category = category;
  state.selectedGroups = loadSelectedGroups(category);
  state.mode = loadMode(category);
  syncImagePolicy();
  updateFooter(category);
  if (route.name === "levels" || route.name === "quiz-entry") {
    setScreen("levels");
    return;
  }
  if (route.name === "reference") {
    setScreen("reference");
    return;
  }
  if (route.name === "revise") {
    startRevise();
    return;
  }
  if (route.name === "fiche") {
    const species = category.questions?.find(
      (q) => fold(q.nom_scientifique) === fold(route.scientificName),
    );
    if (species) openFiche(species);
    else setScreen("reference");
  }
}

const GENERIC_ALT = new Set([
  "",
  "Oiseau à identifier",
  "Oiseau à comparer",
  "Champignon à identifier",
  "Champignon à comparer",
  "Plante à identifier",
  "Plante à comparer",
  "Poisson à identifier",
  "Poisson à comparer",
  "Reptile à identifier",
  "Reptile à comparer",
  "Contour de pays à identifier",
  "Contour de pays à comparer",
  "Image indisponible",
]);

function isPhotoOpen() {
  const modal = document.querySelector("[data-lightbox]");
  return Boolean(modal && !modal.hidden);
}

function closePhoto() {
  const modal = document.querySelector("[data-lightbox]");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove("lightbox-open");
}

function openPhoto(src, alt) {
  let modal = document.querySelector("[data-lightbox]");
  if (!modal) {
    modal = h(
      "div",
      { class: "lightbox", "data-lightbox": "true", hidden: true, role: "dialog", "aria-modal": "true", "aria-label": "Photo agrandie" },
      h("button", { class: "lightbox-backdrop", type: "button", "aria-label": "Fermer", onClick: closePhoto }),
      h(
        "figure",
        { class: "lightbox-figure" },
        h("img", { "data-lightbox-img": "true", alt: "" }),
        h("figcaption", { "data-lightbox-caption": "true" }),
      ),
      h("button", { class: "lightbox-close", type: "button", text: "Fermer", onClick: closePhoto }),
    );
    document.body.append(modal);
  }
  const img = modal.querySelector("[data-lightbox-img]");
  const caption = modal.querySelector("[data-lightbox-caption]");
  img.src = src;
  img.alt = alt || "Photo agrandie";
  const label = GENERIC_ALT.has(alt) ? "" : alt;
  caption.textContent = label;
  caption.hidden = !label;
  modal.hidden = false;
  document.body.classList.add("lightbox-open");
  modal.querySelector(".lightbox-close")?.focus();
}

document.addEventListener("click", (event) => {
  const img = event.target.closest?.("[data-photo]");
  if (!img) return;
  if (state.mode === "relier" && screen === "quiz" && !state.revealed) return;
  const src = img.currentSrc || img.src;
  if (img.hidden || !img.naturalWidth || !src || src.includes("placeholder.svg")) return;
  openPhoto(src, img.alt);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !document.querySelector(".link-focus")) return;
  event.preventDefault();
  closeLinkFocus();
  if (screen === "quiz" && state.mode === "relier") paintLink();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !isPhotoOpen()) return;
  event.preventDefault();
  closePhoto();
});

document.addEventListener("keydown", (event) => {
  if (isPhotoOpen()) return;
  if (screen !== "quiz" || state.revealed) return;
  if (state.mode !== "qcm" && state.mode !== "description" && state.mode !== "chant") return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const index = Number(event.key) - 1;
  if (index < 0 || index > 3) return;
  const button = document.querySelectorAll("[data-answer]")[index];
  if (!button) return;
  event.preventDefault();
  choose(button.dataset.answer);
});

async function loadCategory(file) {
  const response = await fetch(file);
  if (!response.ok) throw new Error(file);
  const category = await response.json();
  if (Array.isArray(category.groupes) && typeof category.groupes[0] === "string") {
    const groupes = [];
    const questions = [];
    for (const groupFile of category.groupes) {
      const groupResponse = await fetch(groupFile);
      if (!groupResponse.ok) throw new Error(groupFile);
      const group = await groupResponse.json();
      const tagged = (group.questions || []).map((question) => ({
        ...question,
        groupe: question.groupe || group.id,
      }));
      groupes.push({
        id: group.id,
        label: group.label,
        defaut: Boolean(group.defaut),
        questions: tagged,
      });
      questions.push(...tagged);
    }
    category.groupes = groupes;
    category.questions = questions;
  } else if (Array.isArray(category.groupes) && category.groupes[0] && typeof category.groupes[0] === "object") {
    const questions = [];
    for (const group of category.groupes) {
      const tagged = (group.questions || []).map((question) => ({
        ...question,
        groupe: question.groupe || group.id,
      }));
      group.questions = tagged;
      questions.push(...tagged);
    }
    category.questions = questions;
  }
  if (!category.questions?.length) return null;
  return category;
}

async function boot() {
  updateFooter();
  hydrateReportedTitles();
  await loadAdminSession();
  try {
    const catalogResponse = await fetch("data/catalog.json");
    if (!catalogResponse.ok) throw new Error("catalog");
    const catalog = await catalogResponse.json();
    if (Array.isArray(catalog)) {
      const categories = [];
      for (const file of catalog) {
        const category = await loadCategory(file);
        if (category) categories.push(category);
      }
      if (!categories.length) throw new Error("empty");
      state.categories = categories;
    } else {
      state.catalog = normalizeCatalog(catalog);
      const france = await loadCategory("data/oiseaux-francais.json");
      state.categories = france ? [france] : [];
      if (!state.categories.length) throw new Error("empty");
    }
    screen = "home";
  } catch {
    state.error =
      "Impossible de charger les quiz. Ouvre ce dossier avec un serveur local, par exemple python -m http.server, puis recharge la page.";
    screen = "error";
  }

  const initial = parseHash();
  if (initial.name !== "home" && screen !== "error") {
    await applyRoute(initial);
  } else {
    mount();
    if (screen === "home") startOnboarding();
  }

  onHashChange((route) => {
    void applyRoute(route);
  });

  if ("serviceWorker" in navigator) {
    const ok =
      location.protocol === "https:" ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1";
    if (ok) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }
}

boot();
