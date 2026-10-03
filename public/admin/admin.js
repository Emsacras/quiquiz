import {
  getSpeciesImages,
  pickRandomImage,
  setOutlineMaps,
  setSafeFish,
} from "../js/images.js";

const QUIZ_BASE = "/";
const PLACEHOLDER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect fill="#0e110e" width="100%" height="100%"/><text x="50%" y="50%" fill="#6b7066" font-size="14" text-anchor="middle" dy=".3em">…</text></svg>`
  );

const gate = document.getElementById("gate");
const app = document.getElementById("app");
const panel = document.getElementById("panel");
const nav = document.getElementById("nav");

const state = {
  tab: "browse",
  view: "home", // home | category | species
  catalog: null,
  quizEntries: [],
  category: null,
  species: null,
  validatedByName: new Map(),
  categoryByFile: new Map(),
  nameToCategoryIds: null,
  scrollGroupId: "",
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function post(path, body) {
  return api(`/api/admin/photos/${path}`, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function openLightbox(url, caption = "") {
  const root = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImg");
  const cap = document.getElementById("lightboxCaption");
  if (!root || !img || !url || url === PLACEHOLDER) return;
  img.src = url;
  img.alt = caption || "Aperçu";
  if (cap) cap.textContent = caption || "";
  root.hidden = false;
  root.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  const root = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImg");
  if (!root) return;
  root.hidden = true;
  root.classList.add("hidden");
  if (img) img.removeAttribute("src");
  document.body.style.overflow = "";
}

function bindZoom(img, url, caption) {
  if (!img || !url || url === PLACEHOLDER) return;
  img.classList.add("is-zoomable");
  img.title = "Cliquer pour agrandir";
  img.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openLightbox(url, caption);
  });
}

function quizUrl(file) {
  const clean = String(file || "").replace(/^\.\//, "").replace(/^\/+/, "");
  return new URL(clean, window.location.origin + QUIZ_BASE).pathname;
}

function flattenCatalogEntries(catalog) {
  const out = [];
  for (const theme of catalog?.themes || []) {
    if (theme.fichier) {
      out.push({
        id: theme.id,
        nom: theme.nom,
        description: theme.description || "",
        fichier: theme.fichier,
        kicker: theme.nom,
      });
      continue;
    }
    for (const branch of theme.branches || []) {
      if (branch.fichier) {
        out.push({
          id: branch.id,
          nom: branch.nom,
          description: branch.description || "",
          fichier: branch.fichier,
          kicker: theme.nom,
        });
        continue;
      }
      for (const lieu of branch.lieux || []) {
        if (!lieu.fichier) continue;
        out.push({
          id: `${branch.id}-${lieu.id}`,
          nom: `${branch.nom} · ${lieu.nom}`,
          description: lieu.description || branch.description || "",
          fichier: lieu.fichier,
          kicker: theme.nom,
        });
      }
    }
  }
  return out;
}

function normalizeSpeciesKey(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ");
}

async function loadCategory(file) {
  const key = String(file || "");
  if (state.categoryByFile.has(key)) return state.categoryByFile.get(key);

  const response = await fetch(quizUrl(file));
  if (!response.ok) throw new Error(file);
  const category = await response.json();
  if (Array.isArray(category.groupes) && typeof category.groupes[0] === "string") {
    const groupes = [];
    const questions = [];
    for (const groupFile of category.groupes) {
      const groupResponse = await fetch(quizUrl(groupFile));
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
  } else if (Array.isArray(category.groupes) && category.groupes[0]?.questions) {
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
  const result = category.questions?.length ? category : null;
  state.categoryByFile.set(key, result);
  return result;
}

async function ensureSpeciesCategoryIndex() {
  if (state.nameToCategoryIds) return state.nameToCategoryIds;
  const map = new Map();
  await Promise.all(
    state.quizEntries.map(async (entry) => {
      try {
        const category = await loadCategory(entry.fichier);
        if (!category) return;
        for (const question of category.questions || []) {
          const name = normalizeSpeciesKey(question.nom_scientifique);
          if (!name) continue;
          const list = map.get(name) || [];
          if (!list.includes(entry.id)) list.push(entry.id);
          map.set(name, list);
        }
      } catch (error) {
        console.warn(error);
      }
    })
  );
  state.nameToCategoryIds = map;
  return map;
}

function groupItemsByCategory(items) {
  const index = state.nameToCategoryIds || new Map();
  const buckets = new Map();
  for (const entry of state.quizEntries) {
    buckets.set(entry.id, {
      id: entry.id,
      label: entry.nom,
      kicker: entry.kicker || "",
      items: [],
    });
  }
  const other = {
    id: "__other__",
    label: "Sans catégorie",
    kicker: "",
    items: [],
  };

  const sortedItems = [...items].sort(
    (a, b) =>
      normalizeSpeciesKey(a.name).localeCompare(normalizeSpeciesKey(b.name), "fr") ||
      String(a.title || "").localeCompare(String(b.title || ""), "fr")
  );

  for (const item of sortedItems) {
    const name = normalizeSpeciesKey(item.name);
    const catIds = index.get(name) || [];
    const catId = catIds.find((id) => buckets.has(id));
    if (catId) buckets.get(catId).items.push(item);
    else other.items.push(item);
  }

  const groups = state.quizEntries
    .map((entry) => buckets.get(entry.id))
    .filter((group) => group?.items?.length);
  if (other.items.length) groups.push(other);
  return groups;
}

function renderCategoryFolders(title, items, renderRow) {
  const section = el("section", "list-section");
  section.appendChild(el("h2", "list-title", `${title} (${items.length})`));
  if (!items.length) {
    section.appendChild(
      el("p", "empty", title === "Validées" ? "Aucune photo validée." : "Aucune photo blacklistée.")
    );
    return section;
  }

  const groups = groupItemsByCategory(items);
  for (const group of groups) {
    const details = el("details", "folder");
    const summary = el("summary", "folder-summary");
    const labels = el("span", "folder-labels");
    if (group.kicker) labels.appendChild(el("span", "folder-kicker", group.kicker));
    labels.appendChild(el("span", "folder-label", group.label));
    summary.appendChild(labels);
    summary.appendChild(el("span", "folder-count", String(group.items.length)));
    details.appendChild(summary);
    const queue = el("div", "queue folder-body");
    for (const item of group.items) queue.appendChild(renderRow(item));
    details.appendChild(queue);
    section.appendChild(details);
  }
  return section;
}

async function refreshValidatedIndex() {
  const { res, data } = await api("/api/admin/photos/validated");
  const map = new Map();
  if (res.ok) {
    for (const item of data.items || []) {
      const key = String(item.name || "").trim();
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
  }
  state.validatedByName = map;
}

function validatedCount(scientificName) {
  return (state.validatedByName.get(String(scientificName || "").trim()) || []).length;
}

function setNav(parts) {
  nav.replaceChildren();
  parts.forEach((part, index) => {
    if (index) nav.appendChild(document.createTextNode(" · "));
    if (part.onClick) {
      const btn = el("button", "linkish", part.label);
      btn.type = "button";
      btn.addEventListener("click", part.onClick);
      nav.appendChild(btn);
    } else {
      nav.appendChild(el("span", "", part.label));
    }
  });
}

function sortedGroupBirds(group) {
  return [...(group.questions || [])].sort((left, right) =>
    String(left.nom_commun || "").localeCompare(String(right.nom_commun || ""), "fr", {
      sensitivity: "base",
    })
  );
}

function applyImagePolicy(category) {
  const id = category?.id || category?._entry?.id || "";
  // Même politique que le jeu : contours pour les pays, photos classiques sinon.
  setOutlineMaps(id === "pays-monde");
  setSafeFish(false);
}

async function loadThumb(img, scientificName) {
  try {
    applyImagePolicy(state.category);
    const result = await getSpeciesImages(scientificName);
    img.src = pickRandomImage(result.urls || [], result.items || []) || PLACEHOLDER;
  } catch {
    img.src = PLACEHOLDER;
  }
}

async function loadGameCandidates(scientificName) {
  applyImagePolicy(state.category);
  const result = await getSpeciesImages(scientificName);
  return (result.items || [])
    .filter((item) => item?.url && item?.title)
    .map((item) => ({
      title: item.title,
      url: item.url,
      validated: Boolean(item.validated),
      name: scientificName,
    }));
}

function photoCard(item, speciesName, onChanged) {
  const card = el("div", "photo-card");
  const img = document.createElement("img");
  img.alt = "";
  img.loading = "lazy";
  const url = item.url || item.sourceUrl || PLACEHOLDER;
  img.src = url;
  bindZoom(img, url, item.title || "");
  card.appendChild(img);

  const meta = el("div", "meta");
  meta.textContent = [item.validated ? "Validée (locale)" : "Candidate", item.title || ""]
    .filter(Boolean)
    .join("\n");
  card.appendChild(meta);

  const actions = el("div", "actions");
  if (item.validated) {
    const blacklistBtn = el("button", "btn danger", "Blacklist");
    blacklistBtn.type = "button";
    blacklistBtn.addEventListener("click", async () => {
      blacklistBtn.disabled = true;
      const r = await post("blacklist", {
        name: speciesName,
        title: item.title,
        url: item.sourceUrl || item.url || "",
      });
      if (r.res.ok) onChanged();
      else {
        window.alert(r.data.error || `Erreur ${r.res.status}`);
        blacklistBtn.disabled = false;
      }
    });
    actions.appendChild(blacklistBtn);
  } else {
    const approve = el("button", "btn primary", "Valider");
    approve.type = "button";
    approve.addEventListener("click", async () => {
      approve.disabled = true;
      const r = await post("validate", {
        name: speciesName,
        title: item.title,
        url: item.url,
      });
      if (r.res.ok) onChanged();
      else {
        window.alert(r.data.error || `Erreur ${r.res.status}`);
        approve.disabled = false;
      }
    });
    const reject = el("button", "btn danger", "Blacklist");
    reject.type = "button";
    reject.addEventListener("click", async () => {
      reject.disabled = true;
      const r = await post("blacklist", {
        name: speciesName,
        title: item.title,
        url: item.url,
      });
      if (r.res.ok) onChanged();
      else {
        window.alert(r.data.error || `Erreur ${r.res.status}`);
        reject.disabled = false;
      }
    });
    actions.appendChild(approve);
    actions.appendChild(reject);
  }
  card.appendChild(actions);
  return card;
}

function renderHome() {
  state.view = "home";
  state.category = null;
  state.species = null;
  setNav([{ label: "Quiz" }]);
  panel.replaceChildren();
  panel.appendChild(
    el("p", "hint", "Choisis un quiz, puis une espèce — comme la page référence.")
  );
  const cards = el("div", "cards");
  for (const entry of state.quizEntries) {
    const btn = el("button", "card");
    btn.type = "button";
    btn.appendChild(el("span", "card-kicker", entry.kicker || "Quiz"));
    btn.appendChild(el("strong", "", entry.nom));
    if (entry.description) btn.appendChild(el("span", "meta", entry.description));
    btn.addEventListener("click", () => void openCategory(entry));
    cards.appendChild(btn);
  }
  if (!state.quizEntries.length) {
    panel.appendChild(el("p", "empty", "Aucun quiz trouvé dans le catalogue."));
  } else {
    panel.appendChild(cards);
  }
}

async function openCategory(entry) {
  panel.replaceChildren(el("p", "status", `Chargement de ${entry.nom}…`));
  setNav([
    { label: "Quiz", onClick: () => renderHome() },
    { label: entry.nom },
  ]);
  try {
    const category = await loadCategory(entry.fichier);
    if (!category) {
      panel.replaceChildren(el("p", "empty", "Ce quiz ne contient pas d’espèces."));
      return;
    }
    category._entry = entry;
    state.category = category;
    state.view = "category";
    state.species = null;
    applyImagePolicy(category);
    await refreshValidatedIndex();
    renderCategory();
  } catch (error) {
    console.warn(error);
    panel.replaceChildren(el("p", "empty", "Impossible de charger ce quiz."));
  }
}

function renderCategory() {
  const category = state.category;
  if (!category) {
    renderHome();
    return;
  }
  state.view = "category";
  state.species = null;
  const entry = category._entry;
  setNav([
    { label: "Quiz", onClick: () => renderHome() },
    { label: entry?.nom || category.categorie || category.id },
  ]);

  panel.replaceChildren();
  panel.appendChild(
    el(
      "p",
      "hint",
      "Les espèces par groupe. Ouvre une fiche pour valider ou blacklist les photos."
    )
  );

  for (const group of category.groupes || []) {
    const birds = sortedGroupBirds(group);
    const section = el("section", "group-block");
    section.id = `groupe-${group.id}`;
    section.appendChild(el("h2", "", group.label || group.id));
    section.appendChild(
      el("p", "meta", `${birds.length} espèce${birds.length > 1 ? "s" : ""}`)
    );
    const grid = el("div", "ref-grid");
    for (const question of birds) {
      const card = el("button", "ref-card");
      card.type = "button";
      const img = document.createElement("img");
      img.className = "ref-thumb";
      img.alt = question.nom_commun || "";
      img.src = PLACEHOLDER;
      img.loading = "lazy";
      card.appendChild(img);
      card.appendChild(el("strong", "", question.nom_commun || question.nom_scientifique));
      card.appendChild(el("span", "latin", question.nom_scientifique || ""));
      const count = validatedCount(question.nom_scientifique);
      card.appendChild(
        el(
          "span",
          count ? "badge" : "badge warn",
          count ? `${count} validée${count > 1 ? "s" : ""}` : "À modérer"
        )
      );
      card.addEventListener("click", () => void openSpecies(question));
      grid.appendChild(card);
      void loadThumb(img, question.nom_scientifique);
    }
    section.appendChild(grid);
    panel.appendChild(section);
  }

  if (state.scrollGroupId) {
    const groupId = state.scrollGroupId;
    state.scrollGroupId = "";
    requestAnimationFrame(() => {
      document.getElementById(`groupe-${groupId}`)?.scrollIntoView({ block: "start" });
    });
  }
}

async function openSpecies(question) {
  state.species = question;
  state.view = "species";
  state.scrollGroupId = question.groupe || "";
  const entry = state.category?._entry;
  setNav([
    { label: "Quiz", onClick: () => renderHome() },
    {
      label: entry?.nom || state.category?.categorie || "Quiz",
      onClick: () => renderCategory(),
    },
    { label: question.nom_commun || question.nom_scientifique },
  ]);
  await renderSpecies();
}

async function renderSpecies() {
  const question = state.species;
  if (!question) {
    renderCategory();
    return;
  }
  const name = String(question.nom_scientifique || "").trim();
  panel.replaceChildren();

  const head = el("div", "species-head");
  head.appendChild(el("h2", "", question.nom_commun || name));
  head.appendChild(el("p", "latin", name));
  const status = el("p", "hint", "Chargement des photos…");
  head.appendChild(status);
  panel.appendChild(head);

  const grid = el("div", "photo-grid");
  panel.appendChild(grid);

  const reload = () => void renderSpecies();

  try {
    applyImagePolicy(state.category);
    const isMaps = state.category?.id === "pays-monde";
    let validated = [];
    let candidates = [];

    if (isMaps) {
      // Même recherche contours que le mode de jeu (pas le bassin photo espèces).
      const [valRes, gameItems, bl] = await Promise.all([
        api(`/api/admin/photos/validated`),
        loadGameCandidates(name),
        api("/api/admin/photos/blacklist"),
      ]);
      validated = (valRes.data.items || []).filter(
        (item) => String(item.name || "").trim() === name
      );
      const validatedTitles = new Set(validated.map((item) => item.title));
      const blocked = new Set((bl.data.items || []).map((item) => item.title).filter(Boolean));
      candidates = gameItems.filter(
        (item) => !item.validated && !validatedTitles.has(item.title) && !blocked.has(item.title)
      );
      status.textContent = `${validated.length} validée(s) · ${candidates.length} candidate(s) · recherche contours (jeu)`;
    } else {
      const { res, data } = await api(
        `/api/admin/photos/candidates?name=${encodeURIComponent(name)}`
      );
      if (!res.ok) {
        status.textContent = `Erreur ${res.status}`;
        return;
      }
      validated = Array.isArray(data.validated) ? data.validated : [];
      candidates = Array.isArray(data.candidates) ? data.candidates : [];
      status.textContent = `${validated.length} validée(s) · ${candidates.length} candidate(s)`;
    }

    for (const item of validated) {
      grid.appendChild(photoCard(item, name, reload));
    }
    for (const item of candidates) {
      grid.appendChild(photoCard(item, name, reload));
    }
    if (!validated.length && !candidates.length) {
      grid.appendChild(el("p", "empty", "Aucune photo trouvée pour cette espèce."));
    }
    await refreshValidatedIndex();
  } catch (error) {
    console.warn(error);
    status.textContent = "Impossible de charger les photos.";
  }
}

function listPhotoRow(item, buttons) {
  const row = el("div", "row");
  const img = document.createElement("img");
  img.className = "thumb";
  img.alt = "";
  img.loading = "lazy";
  const url = item.url || item.sourceUrl || PLACEHOLDER;
  img.src = url;
  bindZoom(img, url, [item.name, item.title].filter(Boolean).join(" · "));
  row.appendChild(img);
  const meta = el("div", "meta");
  meta.textContent = [
    item.name ? `Espèce : ${item.name}` : "",
    item.title || "",
    item.validated ? "Validée (locale)" : "",
  ]
    .filter(Boolean)
    .join("\n");
  row.appendChild(meta);
  const actions = el("div", "actions");
  buttons.forEach((btn) => actions.appendChild(btn));
  row.appendChild(actions);
  return row;
}

async function renderReports() {
  setNav([{ label: "Signalements joueurs" }]);
  panel.replaceChildren(el("p", "status", "Chargement des signalements…"));
  try {
    const { res, data } = await api("/api/admin/photos/reports");
    if (!res.ok) {
      panel.replaceChildren(el("p", "empty", `Erreur signalements (${res.status})`));
      return;
    }
    const items = Array.isArray(data.items) ? data.items : [];
    panel.replaceChildren();
    panel.appendChild(
      el(
        "p",
        "hint",
        "Photos signalées par les joueurs. Blacklist pour tous, ou Ignorer pour retirer de la file."
      )
    );
    panel.appendChild(el("h2", "list-title", `File (${items.length})`));
    const queue = el("div", "queue");
    if (!items.length) {
      queue.appendChild(el("p", "empty", "Aucun signalement en attente."));
    } else {
      for (const item of items) {
        const blacklistBtn = el("button", "btn danger", "Blacklist");
        blacklistBtn.type = "button";
        blacklistBtn.addEventListener("click", async () => {
          const r = await post("blacklist", {
            name: item.name,
            title: item.title,
            url: item.url || "",
          });
          if (r.res.ok) {
            await api("/api/admin/photos/reports/dismiss", {
              method: "POST",
              body: JSON.stringify({ title: item.title }),
            });
            void renderReports();
          } else window.alert(r.data.error || `Erreur ${r.res.status}`);
        });
        const dismissBtn = el("button", "btn", "Ignorer");
        dismissBtn.type = "button";
        dismissBtn.addEventListener("click", async () => {
          const r = await api("/api/admin/photos/reports/dismiss", {
            method: "POST",
            body: JSON.stringify({ title: item.title }),
          });
          if (r.res.ok) void renderReports();
          else window.alert(r.data.error || `Erreur ${r.res.status}`);
        });
        queue.appendChild(listPhotoRow(item, [blacklistBtn, dismissBtn]));
      }
    }
    panel.appendChild(queue);
  } catch (error) {
    console.warn(error);
    panel.replaceChildren(el("p", "empty", "Impossible de charger les signalements."));
  }
}

async function renderLists() {
  setNav([{ label: "Listes globales" }]);
  panel.replaceChildren(el("p", "status", "Chargement des listes…"));
  try {
    const [val, bl] = await Promise.all([
      api("/api/admin/photos/validated"),
      api("/api/admin/photos/blacklist"),
      ensureSpeciesCategoryIndex(),
    ]);
    if (!val.res.ok || !bl.res.ok) {
      panel.replaceChildren(
        el("p", "empty", `Erreur listes (${val.res.status} / ${bl.res.status})`)
      );
      return;
    }
    const validated = Array.isArray(val.data.items) ? val.data.items : [];
    const blocked = Array.isArray(bl.data.items) ? bl.data.items : [];
    panel.replaceChildren();
    panel.appendChild(
      el(
        "p",
        "hint",
        "Photos regroupées par quiz. Clique un dossier pour le déplier ou le replier."
      )
    );

    panel.appendChild(
      renderCategoryFolders("Validées", validated, (item) => {
        const blacklistBtn = el("button", "btn danger", "Blacklist");
        blacklistBtn.type = "button";
        blacklistBtn.addEventListener("click", async () => {
          const r = await post("blacklist", {
            name: item.name,
            title: item.title,
            url: item.sourceUrl || "",
          });
          if (r.res.ok) void renderLists();
          else window.alert(r.data.error || `Erreur ${r.res.status}`);
        });
        return listPhotoRow(item, [blacklistBtn]);
      })
    );

    panel.appendChild(
      renderCategoryFolders("Blacklist", blocked, (item) => {
        const restoreBtn = el("button", "btn primary", "Valider");
        restoreBtn.type = "button";
        restoreBtn.disabled = !(item.name && item.url);
        restoreBtn.addEventListener("click", async () => {
          restoreBtn.disabled = true;
          const r = await post("restore-validated", { title: item.title });
          if (r.res.ok) void renderLists();
          else {
            window.alert(r.data.error || `Erreur ${r.res.status}`);
            restoreBtn.disabled = false;
          }
        });
        const dropBtn = el("button", "btn", "Retirer");
        dropBtn.type = "button";
        dropBtn.addEventListener("click", async () => {
          const r = await post("unblacklist", { title: item.title });
          if (r.res.ok) void renderLists();
          else window.alert(r.data.error || `Erreur ${r.res.status}`);
        });
        return listPhotoRow(item, [restoreBtn, dropBtn]);
      })
    );
  } catch (error) {
    console.warn(error);
    panel.replaceChildren(el("p", "empty", "Impossible de charger les listes."));
  }
}

function setTab(which) {
  state.tab = which;
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === which);
  });
  if (which === "lists") {
    void renderLists();
    return;
  }
  if (which === "reports") {
    void renderReports();
    return;
  }
  if (state.view === "species" && state.species) void renderSpecies();
  else if (state.view === "category" && state.category) renderCategory();
  else renderHome();
}

async function boot() {
  const lightbox = document.getElementById("lightbox");
  if (lightbox) {
    lightbox.querySelector(".lightbox-backdrop")?.addEventListener("click", closeLightbox);
    lightbox.querySelector(".lightbox-close")?.addEventListener("click", closeLightbox);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !lightbox.hidden) closeLightbox();
    });
  }

  try {
    const { res, data } = await api("/admin/session");
    if (!res.ok || !data.isAdmin) {
      gate.replaceChildren();
      gate.appendChild(
        el(
          "p",
          "status",
          "Accès réservé. Connecte-toi via Steam avec le compte administrateur."
        )
      );
      const link = el("p", "hint");
      const a = document.createElement("a");
      a.href = "/auth/steam";
      a.textContent = "Connexion Steam";
      link.appendChild(a);
      gate.appendChild(link);
      return;
    }

    const catalogRes = await fetch(quizUrl("data/catalog.json"));
    if (!catalogRes.ok) throw new Error("catalog");
    state.catalog = await catalogRes.json();
    state.quizEntries = flattenCatalogEntries(state.catalog);
    await refreshValidatedIndex();

    gate.classList.add("hidden");
    app.classList.remove("hidden");
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => setTab(tab.dataset.tab));
    });
    setTab("browse");
  } catch (error) {
    console.warn(error);
    gate.replaceChildren(el("p", "status", "Impossible de démarrer l’admin quiz."));
  }
}

void boot();
