/**
 * Client duels live 1v1 (WebSocket) + helpers amis.
 */
import {
  creditHref,
  creditLabel,
  flagCdnUrl,
  getSpeciesImages,
  metaForUrl,
  pickRandomImage,
} from "./images.js";
import { getCachedMe } from "./profile.js";

const PLACEHOLDER = "assets/placeholder.svg";
const OPTION_LETTERS = ["a", "b", "c", "d"];

let ws = null;
let wsReady = null;
let handlers = new Set();
let pendingChallenge = null;

const duelUi = {
  phase: "idle", // idle | lobby | play | result | join
  code: "",
  seat: null,
  duel: null,
  question: null,
  questionIndex: 0,
  questionTotal: 0,
  timeoutMs: 30000,
  answered: false,
  opponentAnswered: false,
  reveal: null,
  error: "",
  notice: "",
  guestName: "",
  guestToken: "",
  finished: null,
  categoryId: "",
  difficulty: "melange",
  questionCount: 10,
  groupIds: [],
  busy: false,
  imageUrl: "",
  imageCredit: "",
  imageCreditHref: "",
  myAnswerIndex: null,
  questionStartedAt: 0,
  hintVisible: false,
};

const WS_TIMEOUT_MS = 8000;
let remountTimer = null;
let uiListener = null;
let questionTimerId = null;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key === "html") el.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "checked" || key === "disabled" || key === "hidden" || key === "selected") {
      el[key] = Boolean(value);
    } else if (key === "value") el.value = value;
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

function wsUrl() {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

function emit(msg) {
  for (const fn of handlers) {
    try {
      fn(msg);
    } catch {
      /* ignore */
    }
  }
  scheduleUiRefresh();
}

export function onDuelEvent(fn) {
  handlers.add(fn);
  return () => handlers.delete(fn);
}

export function getPendingChallenge() {
  return pendingChallenge;
}

export function clearPendingChallenge() {
  pendingChallenge = null;
}

function ensureWs() {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(ws);
  if (ws && ws.readyState === WebSocket.CONNECTING && wsReady) return wsReady;

  wsReady = new Promise((resolve, reject) => {
    let settled = false;
    let socket;
    try {
      socket = new WebSocket(wsUrl());
    } catch (error) {
      wsReady = null;
      reject(error);
      return;
    }
    ws = socket;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        if (ws === socket) ws = null;
        wsReady = null;
        reject(err);
        return;
      }
      resolve(value);
    };

    const timer = setTimeout(() => finish(new Error("ws_timeout")), WS_TIMEOUT_MS);
    socket.addEventListener("open", () => finish(null, socket));
    socket.addEventListener("error", () => finish(new Error("ws")));
    socket.addEventListener("close", () => {
      if (ws === socket) ws = null;
      if (!settled) finish(new Error("ws_closed"));
      else wsReady = null;
    });
    socket.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      handleServerMessage(msg);
      emit(msg);
    });
  });
  return wsReady;
}

function send(type, payload = {}) {
  return ensureWs().then((socket) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("ws");
    socket.send(JSON.stringify({ type, ...payload }));
  });
}

function scheduleUiRefresh() {
  if (!uiListener) return;
  if (remountTimer) return;
  remountTimer = setTimeout(() => {
    remountTimer = null;
    try {
      uiListener();
    } catch {
      /* ignore */
    }
  }, 40);
}

function handleServerMessage(msg) {
  const type = msg?.type;
  if (type === "duel:created" || type === "duel:joined") {
    duelUi.code = msg.code || msg.duel?.code || duelUi.code;
    duelUi.duel = msg.duel || duelUi.duel;
    duelUi.seat = msg.duel?.you || duelUi.seat;
    duelUi.phase = "lobby";
    if (msg.guestToken) {
      duelUi.guestToken = msg.guestToken;
      try {
        sessionStorage.setItem(`quiquiz:duelGuest:${duelUi.code}`, msg.guestToken);
      } catch {
        /* ignore */
      }
    }
    duelUi.error = "";
  }
  if (type === "duel:state") {
    duelUi.duel = msg.duel || duelUi.duel;
    if (msg.duel?.you) duelUi.seat = msg.duel.you;
    if (msg.duel?.status === "playing" && duelUi.phase === "lobby") duelUi.phase = "play";
    if (msg.duel?.status === "finished") duelUi.phase = "result";
  }
  if (type === "duel:start") {
    duelUi.phase = "play";
    duelUi.duel = msg.duel || duelUi.duel;
    duelUi.answered = false;
    duelUi.opponentAnswered = false;
    duelUi.reveal = null;
  }
  if (type === "duel:question") {
    duelUi.phase = "play";
    duelUi.question = msg.question;
    duelUi.questionIndex = msg.index;
    duelUi.questionTotal = msg.total;
    duelUi.timeoutMs = msg.timeoutMs || 30000;
    duelUi.answered = false;
    duelUi.opponentAnswered = false;
    duelUi.reveal = null;
    duelUi.imageUrl = "";
    duelUi.imageCredit = "";
    duelUi.imageCreditHref = "";
    duelUi.myAnswerIndex = null;
    duelUi.hintVisible = false;
    duelUi.questionStartedAt = Date.now();
    startQuestionClock();
    loadDuelImage(msg.question);
  }
  if (type === "duel:opponentAnswered") {
    duelUi.opponentAnswered = true;
  }
  if (type === "duel:reveal") {
    stopQuestionClock();
    duelUi.reveal = msg;
    duelUi.duel = {
      ...(duelUi.duel || {}),
      host: msg.host,
      guest: msg.guest,
    };
  }
  if (type === "duel:finished") {
    stopQuestionClock();
    duelUi.phase = "result";
    duelUi.finished = msg;
    duelUi.duel = msg.duel || duelUi.duel;
  }
  if (type === "duel:error") {
    duelUi.error = msg.message || msg.error || "Erreur duel";
  }
  if (type === "friend:challenge") {
    pendingChallenge = msg;
  }
}

function setDuelImage(url) {
  duelUi.imageUrl = url || "";
  if (!url || url.includes("placeholder")) {
    duelUi.imageCredit = "";
    duelUi.imageCreditHref = "";
    return;
  }
  const meta = metaForUrl(url);
  duelUi.imageCredit = creditLabel(meta, "photo");
  duelUi.imageCreditHref = creditHref(meta) || "";
}

async function loadDuelImage(question) {
  if (!question) return;
  const token = `${question.id}:${duelUi.questionIndex}`;
  try {
    if (question.iso2 && flagCdnUrl) {
      const url = flagCdnUrl(question.iso2);
      if (url && token === `${duelUi.question?.id}:${duelUi.questionIndex}`) {
        setDuelImage(url);
        emit({ type: "duel:ui" });
        return;
      }
    }
    const name = question.nom_scientifique || question.imageQuery || "";
    if (!name) return;
    const result = await getSpeciesImages(name, {
      commonsFile: question.commonsFile || "",
      imageQuery: question.imageQuery || "",
    });
    const url = pickRandomImage(result.urls || [], result.items || []);
    if (token === `${duelUi.question?.id}:${duelUi.questionIndex}` && url) {
      setDuelImage(url);
      emit({ type: "duel:ui" });
    }
  } catch {
    /* ignore */
  }
}

function stopQuestionClock() {
  if (questionTimerId) {
    clearInterval(questionTimerId);
    questionTimerId = null;
  }
}

function startQuestionClock() {
  stopQuestionClock();
  questionTimerId = setInterval(() => {
    if (duelUi.phase !== "play" || duelUi.answered || duelUi.reveal) {
      stopQuestionClock();
      return;
    }
    const el = document.querySelector("[data-duel-timer]");
    const bar = document.querySelector("[data-duel-timer-bar]");
    if (!el && !bar) return;
    const elapsed = Math.max(0, Date.now() - (duelUi.questionStartedAt || Date.now()));
    const left = Math.max(0, (duelUi.timeoutMs || 30000) - elapsed);
    if (el) el.textContent = formatCountdown(left);
    if (bar) {
      const pct = Math.max(0, Math.min(100, (left / (duelUi.timeoutMs || 30000)) * 100));
      bar.style.width = `${pct}%`;
      bar.classList.toggle("is-urgent", left <= 5000);
    }
  }, 200);
}

function formatCountdown(ms) {
  const sec = Math.ceil(Math.max(0, ms) / 1000);
  return `${sec}s`;
}

export function getDuelUi() {
  return duelUi;
}

export function resetDuelUi(partial = {}) {
  Object.assign(duelUi, {
    phase: "idle",
    code: "",
    seat: null,
    duel: null,
    question: null,
    questionIndex: 0,
    questionTotal: 0,
    timeoutMs: 30000,
    answered: false,
    opponentAnswered: false,
    reveal: null,
    error: "",
    notice: "",
    finished: null,
    imageUrl: "",
    imageCredit: "",
    imageCreditHref: "",
    myAnswerIndex: null,
    questionStartedAt: 0,
    hintVisible: false,
    ...partial,
  });
  if (partial.phase && partial.phase !== "play") stopQuestionClock();
}

export async function createDuel({
  categoryId,
  difficulty = "melange",
  questionCount = 10,
  groupIds = [],
}) {
  const me = getCachedMe();
  duelUi.busy = true;
  duelUi.error = "";
  duelUi.notice = "Création du duel…";
  duelUi.categoryId = categoryId;
  duelUi.difficulty = difficulty;
  duelUi.questionCount = questionCount;
  duelUi.groupIds = Array.isArray(groupIds) ? groupIds : [];
  scheduleUiRefresh();

  try {
    // HTTP d’abord (auth cookie fiable), puis attache WS en hôte.
    const res = await fetch("/api/duels", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        categoryId,
        difficulty,
        questionCount,
        groupIds: duelUi.groupIds,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.error || "create");
    }
    const code = String(data.code || "").toUpperCase();
    if (!code) throw new Error("create");

    duelUi.phase = "lobby";
    duelUi.code = code;
    duelUi.seat = "host";
    duelUi.duel = {
      code,
      status: "lobby",
      label: data.duel?.label || "",
      config: data.duel?.config || { categoryId, difficulty, questionCount, groupIds },
      questionCount: data.duel?.questionCount || questionCount,
      you: "host",
      host: {
        displayName: me?.displayName || "Toi",
        ready: false,
        score: 0,
        totalMs: 0,
      },
      guest: null,
    };
    duelUi.notice = "Connexion temps réel…";
    scheduleUiRefresh();

    await send("duel:join", { code });
    duelUi.notice = "";
  } catch (error) {
    const msg = String(error?.message || "");
    if (msg === "ws" || msg === "ws_timeout" || msg === "ws_closed") {
      duelUi.error =
        "Duel créé mais WebSocket inaccessible (/ws). Vérifie nginx Upgrade, puis recharge.";
    } else if (msg === "empty" || /sous-catégories/i.test(msg)) {
      duelUi.error = "Aucune question pour ces sous-catégories / difficulté.";
    } else if (msg === "auth" || msg === "Unauthorized") {
      duelUi.error = "Connecte-toi pour créer un duel.";
    } else {
      duelUi.error = msg && msg !== "create" ? msg : "Impossible de créer le duel.";
    }
    if (!duelUi.code) {
      duelUi.phase = "idle";
      duelUi.duel = null;
    }
    throw error;
  } finally {
    duelUi.busy = false;
    scheduleUiRefresh();
  }
}

export async function joinDuel(code, displayName = "") {
  const clean = String(code || "").trim().toUpperCase();
  resetDuelUi({
    phase: "join",
    code: clean,
    guestName: displayName,
  });
  await send("duel:join", { code: clean, displayName });
}

export async function setReady(ready = true) {
  await send("duel:ready", { ready });
}

export async function answerDuel(optionIndex) {
  if (duelUi.answered || duelUi.reveal) return;
  duelUi.answered = true;
  duelUi.myAnswerIndex = optionIndex;
  stopQuestionClock();
  scheduleUiRefresh();
  await send("duel:answer", { optionIndex });
}

export async function leaveDuel() {
  try {
    await send("duel:leave", {});
  } catch {
    /* ignore */
  }
  resetDuelUi();
}

export async function challengeFriend({
  friendId,
  categoryId,
  difficulty = "melange",
  questionCount = 10,
  groupIds = [],
}) {
  // Crée via HTTP puis notifie via WS si l’ami est en ligne.
  await createDuel({ categoryId, difficulty, questionCount, groupIds });
  try {
    await send("friend:challenge", {
      friendId,
      categoryId,
      difficulty,
      questionCount,
      groupIds,
      code: duelUi.code,
    });
  } catch {
    /* le lien reste utilisable */
  }
}

export async function fetchQuizGroups(categoryId) {
  const res = await fetch(`/api/duels/groups?categoryId=${encodeURIComponent(categoryId || "")}`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.groups) ? data.groups : [];
}

export async function fetchDuelMeta(code) {
  const res = await fetch(`/api/duels/${encodeURIComponent(code)}`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.duel || null;
}

export async function fetchFriends() {
  const res = await fetch("/api/friends", {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!res.ok) return null;
  return res.json();
}

export async function searchUsers(q) {
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.users || [];
}

export async function requestFriend(userId) {
  const res = await fetch("/api/friends/request", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ userId }),
  });
  return res.json().catch(() => ({ ok: false }));
}

export async function acceptFriend(userId) {
  const res = await fetch("/api/friends/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ userId }),
  });
  return res.json().catch(() => ({ ok: false }));
}

export async function declineFriend(userId) {
  const res = await fetch("/api/friends/decline", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ userId }),
  });
  return res.json().catch(() => ({ ok: false }));
}

export async function removeFriend(userId) {
  const res = await fetch(`/api/friends/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  return res.json().catch(() => ({ ok: false }));
}

function inviteUrl(code) {
  return `${location.origin}${location.pathname}#/duel/${code}`;
}

function formatMs(ms) {
  const n = Math.max(0, Number(ms) || 0);
  return `${(n / 1000).toFixed(1)} s`;
}

function mePlayer(duel) {
  if (!duel) return null;
  return duel.you === "guest" ? duel.guest : duel.host;
}

function oppPlayer(duel) {
  if (!duel) return null;
  return duel.you === "guest" ? duel.host : duel.guest;
}

/**
 * Bind un callback UI (une seule fois côté app) — évite les boucles de remount.
 */
export function bindDuelUi(listener) {
  uiListener = typeof listener === "function" ? listener : null;
  return () => {
    if (uiListener === listener) uiListener = null;
    if (remountTimer) {
      clearTimeout(remountTimer);
      remountTimer = null;
    }
  };
}

/**
 * Rend l’UI duel dans `view` via helpers injectés depuis app.js.
 * Ne resouscrit pas le WS à chaque paint.
 */
export function renderDuelView(ctx) {
  const { view, renderTop, goHome, openProfile, leaves = [] } = ctx;

  renderTop({
    kicker: "1 contre 1",
    title: "Duel live",
    onBack: async () => {
      await leaveDuel();
      if (duelUi.categoryId && typeof ctx.backToLevels === "function") ctx.backToLevels();
      else goHome();
    },
    backLabel: "Retour",
    onMenu: async () => {
      await leaveDuel();
      goHome();
    },
    menuLabel: "Menu",
  });

  const nodes = [];
  if (duelUi.error) nodes.push(h("p", { class: "note", text: duelUi.error }));
  if (duelUi.notice) nodes.push(h("p", { class: "note", text: duelUi.notice }));

  if (duelUi.phase === "idle" || (duelUi.phase === "lobby" && !duelUi.duel && !duelUi.code)) {
    nodes.push(...renderCreateLobby(ctx, leaves));
  } else if (duelUi.phase === "join" && !duelUi.duel) {
    nodes.push(...renderJoinForm(ctx));
  } else if (duelUi.phase === "result" || duelUi.finished) {
    nodes.push(...renderResult(ctx, openProfile));
  } else if (duelUi.phase === "play") {
    nodes.push(...renderPlay());
  } else {
    nodes.push(...renderLobby());
  }

  view.replaceChildren(...nodes.filter(Boolean));
}

/** @deprecated alias */
export function mountDuelView(ctx) {
  renderDuelView(ctx);
  return bindDuelUi(() => ctx.onNeedRemount?.());
}

/** Match quiz JSON id / catalog short id / fichier stem to a duel leaf option. */
function resolveDuelLeafId(preferred, leaves) {
  const id = String(preferred || "").trim();
  if (!leaves?.length) return "";
  if (!id) return leaves[0]?.id || "";
  if (leaves.some((leaf) => leaf.id === id)) return id;
  const byFile = leaves.find((leaf) => {
    const fromFile = String(leaf.fichier || "")
      .replace(/^data\//, "")
      .replace(/\.json$/i, "");
    return fromFile === id;
  });
  if (byFile) return byFile.id;
  return leaves[0]?.id || "";
}

function renderCreateLobby(ctx, leaves) {
  const me = getCachedMe();
  if (!me) {
    return [
      h("p", {
        class: "lede",
        text: "Connecte-toi pour créer un duel. Ton adversaire pourra rejoindre avec le lien, même sans compte.",
      }),
      h("button", {
        class: "btn",
        type: "button",
        text: "Ouvrir mon compte",
        onClick: () => ctx.openProfile(),
      }),
    ];
  }

  const preferredCat = duelUi.categoryId || ctx.defaultCategoryId || "";
  // Catalog leaf id (ex. "poissons") ≠ quiz JSON id (ex. "poissons-france").
  const initialCat = resolveDuelLeafId(preferredCat, leaves);
  duelUi.categoryId = initialCat;

  const catSelect = h(
    "select",
    { class: "duel-select", "aria-label": "Catégorie" },
    ...leaves.map((leaf) =>
      h("option", {
        value: leaf.id,
        text: leaf.nom || leaf.categorie || leaf.id,
        selected: leaf.id === initialCat,
      }),
    ),
  );
  // Les options `selected` ne suffisent pas toujours en construction DOM → forcer.
  if (initialCat) catSelect.value = initialCat;

  const initialDiff = ["melange", "facile", "moyen", "difficile"].includes(duelUi.difficulty)
    ? duelUi.difficulty
    : "melange";
  const diffSelect = h(
    "select",
    { class: "duel-select", "aria-label": "Difficulté" },
    h("option", {
      value: "melange",
      text: "Mélange",
      selected: initialDiff === "melange",
    }),
    h("option", {
      value: "facile",
      text: "Facile",
      selected: initialDiff === "facile",
    }),
    h("option", {
      value: "moyen",
      text: "Moyen",
      selected: initialDiff === "moyen",
    }),
    h("option", {
      value: "difficile",
      text: "Difficile",
      selected: initialDiff === "difficile",
    }),
  );
  diffSelect.value = initialDiff;

  const initialCount = [5, 8, 10, 12, 16].includes(Number(duelUi.questionCount))
    ? Number(duelUi.questionCount)
    : 10;
  const countSelect = h(
    "select",
    { class: "duel-select", "aria-label": "Nombre de questions" },
    ...[5, 8, 10, 12, 16].map((n) =>
      h("option", {
        value: String(n),
        text: `${n} questions`,
        selected: n === initialCount,
      }),
    ),
  );
  countSelect.value = String(initialCount);

  const groupsBox = h("div", { class: "duel-groups-list", text: "Chargement des sous-catégories…" });
  const selected = new Set(
    Array.isArray(duelUi.groupIds) && duelUi.groupIds.length ? duelUi.groupIds.map(String) : [],
  );

  async function loadGroups(categoryId) {
    groupsBox.replaceChildren(h("p", { class: "meta", text: "Chargement…" }));
    const groups = await fetchQuizGroups(categoryId);
    if (!groups.length) {
      selected.clear();
      duelUi.groupIds = [];
      groupsBox.replaceChildren(
        h("p", { class: "meta", text: "Pas de sous-catégories : tout le quiz sera utilisé." }),
      );
      return;
    }
    if (!selected.size) groups.forEach((g) => selected.add(String(g.id)));
    else {
      for (const id of [...selected]) {
        if (!groups.some((g) => String(g.id) === id)) selected.delete(id);
      }
      if (!selected.size) groups.forEach((g) => selected.add(String(g.id)));
    }
    duelUi.groupIds = [...selected];

    const paint = () => {
      groupsBox.replaceChildren(
        ...groups.map((g) => {
          const id = String(g.id);
          const input = h("input", {
            type: "checkbox",
            checked: selected.has(id),
            onChange: (event) => {
              if (event.currentTarget.checked) selected.add(id);
              else selected.delete(id);
              if (!selected.size) {
                event.currentTarget.checked = true;
                selected.add(id);
              }
              duelUi.groupIds = [...selected];
            },
          });
          return h(
            "label",
            { class: "duel-group-option" },
            input,
            h("span", { text: g.label }),
            h("span", { class: "meta", text: `${g.count}` }),
          );
        }),
      );
    };
    paint();
  }

  catSelect.addEventListener("change", () => {
    selected.clear();
    duelUi.groupIds = [];
    void loadGroups(catSelect.value);
  });
  void loadGroups(initialCat);

  const createBtn = h("button", {
    class: "btn duel-primary-cta",
    type: "button",
    text: duelUi.busy ? "Création…" : "Créer le duel",
    disabled: duelUi.busy,
    onClick: async () => {
      if (duelUi.busy) return;
      duelUi.error = "";
      try {
        await createDuel({
          categoryId: catSelect.value,
          difficulty: diffSelect.value,
          questionCount: Number(countSelect.value) || 10,
          groupIds: [...selected],
        });
      } catch {
        /* message déjà posé dans createDuel */
      }
    },
  });

  return [
    h("p", {
      class: "lede",
      text: "Même série QCM pour les deux. On avance quand les deux ont répondu. Égalité → temps cumulé.",
    }),
    h(
      "div",
      { class: "duel-form" },
      h("label", { class: "field-label", text: "Catégorie" }),
      catSelect,
      h("label", { class: "field-label", text: "Difficulté" }),
      diffSelect,
      h("label", { class: "field-label", text: "Longueur" }),
      countSelect,
      h(
        "details",
        { class: "duel-groups" },
        h("summary", { text: "Sous-catégories (optionnel)" }),
        h("p", {
          class: "meta",
          text: "Décoche les groupes que tu ne veux pas. Au moins un reste actif.",
        }),
        groupsBox,
      ),
      createBtn,
    ),
  ];
}

function renderJoinForm(ctx) {
  const me = getCachedMe();
  const nameInput = h("input", {
    class: "profile-name-input",
    type: "text",
    maxlength: "40",
    value: duelUi.guestName || (me?.displayName || `Invité-${(duelUi.code || "QUIZ").slice(0, 4)}`),
    "aria-label": "Pseudo",
  });
  return [
    h("p", {
      class: "lede",
      text: me
        ? `Rejoindre le duel ${duelUi.code} ?`
        : `Rejoins le duel ${duelUi.code} en invité (pas besoin de compte).`,
    }),
    me
      ? null
      : h(
          "div",
          { class: "duel-form" },
          h("label", { class: "field-label", text: "Pseudo" }),
          nameInput,
        ),
    h("button", {
      class: "btn duel-primary-cta",
      type: "button",
      text: "Rejoindre",
      onClick: async () => {
        duelUi.error = "";
        try {
          await joinDuel(duelUi.code, me ? "" : nameInput.value);
        } catch {
          duelUi.error = "Impossible de rejoindre.";
        }
        scheduleUiRefresh();
      },
    }),
  ];
}

function renderLobby() {
  const duel = duelUi.duel;
  const code = duel?.code || duelUi.code;
  const link = inviteUrl(code);
  const me = mePlayer(duel);
  const opp = oppPlayer(duel);
  return [
    h("p", { class: "lede", text: duel?.label ? `Duel · ${duel.label}` : "Lobby duel" }),
    h(
      "div",
      { class: "duel-invite" },
      h("p", { class: "meta", text: "Lien d’invitation" }),
      h("input", {
        class: "duel-link-input",
        type: "text",
        readonly: true,
        value: link,
        "aria-label": "Lien d’invitation",
        onFocus: (e) => e.currentTarget.select(),
      }),
      h("button", {
        class: "btn secondary",
        type: "button",
        text: "Copier le lien",
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(link);
            duelUi.notice = "Lien copié.";
          } catch {
            duelUi.notice = "Copie manuelle : sélectionne le champ.";
          }
          emit({ type: "duel:ui" });
        },
      }),
    ),
    h(
      "div",
      { class: "duel-players" },
      h(
        "div",
        { class: "duel-player" },
        h("strong", { text: me?.displayName || "Toi" }),
        h("span", { class: "meta", text: me?.ready ? "Prêt" : "En attente…" }),
      ),
      h(
        "div",
        { class: "duel-player" },
        h("strong", { text: opp?.displayName || "Adversaire…" }),
        h("span", {
          class: "meta",
          text: opp ? (opp.ready ? "Prêt" : "Pas prêt") : "En attente du lien",
        }),
      ),
    ),
    h("button", {
      class: "btn duel-primary-cta",
      type: "button",
      text: me?.ready ? "Annuler prêt" : "Je suis prêt",
      disabled: !opp,
      onClick: async () => {
        await setReady(!me?.ready);
      },
    }),
  ];
}

function renderPlay() {
  const duel = duelUi.duel;
  const me = mePlayer(duel);
  const opp = oppPlayer(duel);
  const q = duelUi.question;
  const reveal = duelUi.reveal;
  const pos = (duelUi.questionIndex || 0) + 1;
  const total = duelUi.questionTotal || 1;
  const elapsed = Math.max(0, Date.now() - (duelUi.questionStartedAt || Date.now()));
  const left = Math.max(0, (duelUi.timeoutMs || 30000) - elapsed);
  const leftPct = Math.max(0, Math.min(100, (left / (duelUi.timeoutMs || 30000)) * 100));

  const statusText = reveal
    ? "Révélation"
    : duelUi.answered
      ? duelUi.opponentAnswered
        ? "Révélation…"
        : "En attente de l’adversaire…"
      : duelUi.opponentAnswered
        ? "L’adversaire a répondu — à toi !"
        : "À toi de jouer";

  const progressFill = h("span");
  progressFill.style.width = `${Math.round((pos / total) * 100)}%`;

  const timerBar = h("span", {
    class: left <= 5000 ? "duel-timer-fill is-urgent" : "duel-timer-fill",
    "data-duel-timer-bar": "true",
  });
  timerBar.style.width = `${leftPct}%`;

  const nodes = [
    h(
      "div",
      { class: "duel-hud" },
      h("div", { class: "progress-wrap" }, h("div", { class: "progress", "aria-hidden": "true" }, progressFill)),
      h(
        "div",
        { class: "duel-scorebar" },
        h(
          "div",
          { class: "duel-score is-me", title: me?.displayName || "Toi" },
          h("span", { class: "duel-score-name", text: me?.displayName || "Toi" }),
          h("strong", { text: String(me?.score ?? 0) }),
        ),
        h("div", { class: "duel-score-q meta", text: `${pos}/${total}` }),
        h(
          "div",
          { class: "duel-score is-opp", title: opp?.displayName || "Adv." },
          h("span", { class: "duel-score-name", text: opp?.displayName || "Adv." }),
          h("strong", { text: String(opp?.score ?? 0) }),
        ),
      ),
      h(
        "div",
        { class: "duel-timer", "aria-live": "polite" },
        h("div", { class: "duel-timer-track" }, timerBar),
        h(
          "p",
          { class: "duel-timer-meta" },
          h("strong", {
            "data-duel-timer": "true",
            text: duelUi.answered || reveal ? "—" : formatCountdown(left),
          }),
          h("span", { class: "duel-timer-status meta", text: statusText }),
          h("span", { class: "duel-timer-cumul meta", text: `Cumul ${formatMs(me?.totalMs)}` }),
        ),
      ),
    ),
  ];

  if (duelUi.imageUrl) {
    nodes.push(
      h(
        "div",
        { class: "frame", "data-frame": "true" },
        h("img", {
          "data-photo": "true",
          src: duelUi.imageUrl,
          alt: "À identifier — cliquer pour agrandir",
          onError: (e) => {
            e.currentTarget.src = PLACEHOLDER;
            e.currentTarget.removeAttribute("data-photo");
          },
        }),
      ),
      duelUi.imageCredit
        ? h(
            "p",
            { class: "credit" },
            duelUi.imageCreditHref
              ? h("a", {
                  class: "credit-link",
                  href: duelUi.imageCreditHref,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  text: duelUi.imageCredit,
                })
              : duelUi.imageCredit,
          )
        : null,
    );
  } else {
    nodes.push(
      h("div", { class: "frame is-loading", "data-frame": "true" },
        h("div", { class: "spinner", "aria-hidden": "true" }),
        h("p", { class: "frame-status", text: "Chargement de la photo…" }),
        h("img", {
          "data-photo": "true",
          src: PLACEHOLDER,
          alt: "",
          hidden: true,
        }),
      ),
    );
  }

  if (q?.indice) {
    nodes.push(
      h("div", { class: "duel-actions" },
        h("button", {
          class: "btn secondary",
          type: "button",
          text: duelUi.hintVisible ? "Indice affiché" : "Indice",
          disabled: duelUi.hintVisible || Boolean(reveal),
          onClick: () => {
            duelUi.hintVisible = true;
            scheduleUiRefresh();
          },
        }),
      ),
      duelUi.hintVisible || reveal
        ? h("p", { class: "hint", text: q.indice })
        : h("p", { class: "hint", hidden: true }),
    );
  }

  if (q?.options?.length) {
    nodes.push(
      h(
        "div",
        { class: "options", role: "group", "aria-label": "Réponses" },
        q.options.map((opt, index) => {
          const letter = OPTION_LETTERS[index] || "a";
          let cls = "option";
          if (reveal) {
            if (index === reveal.correctIndex) cls += " is-correct is-pop";
            else if (duelUi.myAnswerIndex === index) cls += " is-wrong is-shake";
          } else if (duelUi.answered && duelUi.myAnswerIndex === index) {
            cls += " is-selected";
          }
          return h(
            "button",
            {
              class: cls,
              type: "button",
              "data-duel-answer": String(index),
              disabled: duelUi.answered || Boolean(reveal),
              onClick: () => answerDuel(index),
            },
            h("span", {
              class: `option-letter option-letter--${letter}`,
              text: letter.toUpperCase(),
              "aria-hidden": "true",
            }),
            h("span", { class: "option-label", text: opt }),
          );
        }),
      ),
    );
  }

  if (reveal) {
    const myElapsed = me?.elapsedMs || 0;
    const oppElapsed = opp?.elapsedMs || 0;
    const myOk = me?.lastCorrect;
    nodes.push(
      h(
        "div",
        { class: myOk ? "feedback is-correct" : "feedback is-wrong" },
        h("strong", { text: myOk ? "Bien joué !" : "Raté" }),
        h("p", {
          text: `Réponse : ${reveal.nom_commun || "—"}`,
        }),
        h("p", {
          class: "meta",
          text: `Cette question · toi ${formatMs(myElapsed)} · adv. ${formatMs(oppElapsed)}`,
        }),
        h("p", {
          class: "meta",
          text: `Temps cumulé · toi ${formatMs(me?.totalMs)} · adv. ${formatMs(opp?.totalMs)}`,
        }),
      ),
    );
  }

  return nodes.filter(Boolean);
}

function renderResult(ctx, openProfile) {
  const fin = duelUi.finished || {};
  const duel = fin.duel || duelUi.duel;
  const me = mePlayer(duel) || (duelUi.seat === "guest" ? fin.guest : fin.host);
  const opp = oppPlayer(duel) || (duelUi.seat === "guest" ? fin.host : fin.guest);
  const winner = fin.winner || duel?.winner;
  const mySeat = duelUi.seat || duel?.you;
  let headline = "Match nul";
  if (winner === "draw") headline = "Match nul";
  else if (winner === mySeat) headline = "Victoire !";
  else if (winner) headline = "Défaite";
  if (fin.reason === "forfeit") headline += " (forfait)";

  const nodes = [
    h("h2", { class: "challenge-title", text: headline }),
    h("p", {
      class: "lede",
      text: `${me?.displayName || "Toi"} ${me?.score ?? 0} — ${opp?.displayName || "Adv."} ${opp?.score ?? 0}`,
    }),
    h("p", {
      class: "meta",
      text: `Temps cumulé : toi ${formatMs(me?.totalMs)} · adversaire ${formatMs(opp?.totalMs)}`,
    }),
    h("button", {
      class: "btn duel-primary-cta",
      type: "button",
      text: "Nouveau duel",
      onClick: () => {
        resetDuelUi({
          phase: "idle",
          categoryId: duelUi.categoryId || duel?.config?.categoryId || "",
        });
        scheduleUiRefresh();
      },
    }),
  ];

  if (me?.isGuest || (!getCachedMe() && duelUi.seat === "guest")) {
    nodes.push(
      h("p", {
        class: "note",
        text: "Crée un compte pour garder ton historique et défier des amis.",
      }),
      h("button", {
        class: "btn secondary",
        type: "button",
        text: "Créer un compte",
        onClick: () => openProfile(),
      }),
    );
  }
  return nodes;
}

function summarizeDuelHistory(history) {
  const list = Array.isArray(history) ? history : [];
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const entry of list) {
    if (entry?.result === "win") wins += 1;
    else if (entry?.result === "loss") losses += 1;
    else draws += 1;
  }
  const played = list.length;
  return {
    played,
    wins,
    losses,
    draws,
    winRate: played ? Math.round((wins / played) * 100) : 0,
  };
}

function formatDuelDate(at) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(at));
  } catch {
    return "";
  }
}

function resultLabel(result) {
  if (result === "win") return "Victoire";
  if (result === "loss") return "Défaite";
  return "Nul";
}

/**
 * Panneau Duels du compte (stats + amis + historique compact).
 */
export function mountFriendsSection(ctx) {
  const wrap = h("section", { class: "friends-panel" }, h("p", { class: "meta", text: "Chargement…" }));

  (async () => {
    const data = await fetchFriends();
    if (!data?.friends) {
      wrap.replaceChildren(h("p", { class: "note", text: "Impossible de charger les duels / amis." }));
      return;
    }
    renderFriends(wrap, data, ctx);
  })();

  return wrap;
}

function renderFriends(wrap, data, ctx) {
  const { friends, duelHistory = [] } = data;
  const stats = data.duelStats || summarizeDuelHistory(duelHistory);
  const incoming = friends.incoming || [];
  const outgoing = friends.outgoing || [];
  const accepted = friends.accepted || [];

  const searchInput = h("input", {
    class: "profile-name-input friends-search-input",
    type: "search",
    placeholder: "Chercher un pseudo…",
    "aria-label": "Recherche joueur",
  });
  const searchOut = h("div", { class: "friends-search-out" });

  const refresh = async () => {
    const next = await fetchFriends();
    if (next?.friends) renderFriends(wrap, next, ctx);
  };

  let searchTimer = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = searchInput.value.trim();
      if (q.length < 2) {
        searchOut.replaceChildren();
        return;
      }
      const users = await searchUsers(q);
      searchOut.replaceChildren(
        users.length
          ? users.map((u) =>
              h(
                "div",
                { class: "friends-row" },
                h("span", { class: "friends-name", text: u.displayName }),
                h("button", {
                  class: "text-btn",
                  type: "button",
                  text: "Ajouter",
                  onClick: async () => {
                    await requestFriend(u.id);
                    await refresh();
                  },
                }),
              ),
            )
          : h("p", { class: "meta", text: "Aucun joueur trouvé." }),
      );
    }, 220);
  });

  const friendRow = (u, actions) =>
    h(
      "div",
      { class: "friends-row" },
      u.avatarUrl
        ? h("img", { class: "friends-avatar", src: u.avatarUrl, alt: "", width: "32", height: "32" })
        : h("span", { class: "friends-avatar is-placeholder", text: (u.displayName || "?").slice(0, 1) }),
      h("span", { class: "friends-name", text: u.displayName }),
      h("div", { class: "friends-row-actions" }, ...(actions(u) || [])),
    );

  const historyPreview = duelHistory.slice(0, 5);
  const historyRest = duelHistory.slice(5, 20);

  wrap.replaceChildren(
    h(
      "div",
      { class: "duel-stats" },
      h("div", { class: "duel-stat" }, h("strong", { text: String(stats.played) }), h("span", { text: "Joués" })),
      h("div", { class: "duel-stat is-win" }, h("strong", { text: String(stats.wins) }), h("span", { text: "V" })),
      h("div", { class: "duel-stat is-loss" }, h("strong", { text: String(stats.losses) }), h("span", { text: "D" })),
      h("div", { class: "duel-stat" }, h("strong", { text: String(stats.draws) }), h("span", { text: "Nuls" })),
      h("div", { class: "duel-stat" }, h("strong", { text: `${stats.winRate}%` }), h("span", { text: "WR" })),
    ),
    h(
      "div",
      { class: "friends-block" },
      h("h3", { text: "Amis" }),
      h("p", { class: "meta", text: "Cherche un pseudo, ajoute, puis défie." }),
      searchInput,
      searchOut,
      incoming.length
        ? h(
            "div",
            { class: "friends-subblock" },
            h("h4", { text: `Demandes reçues (${incoming.length})` }),
            ...incoming.map((u) =>
              friendRow(u, () => [
                h("button", {
                  class: "text-btn",
                  type: "button",
                  text: "OK",
                  onClick: async () => {
                    await acceptFriend(u.id);
                    await refresh();
                  },
                }),
                h("button", {
                  class: "text-btn",
                  type: "button",
                  text: "Non",
                  onClick: async () => {
                    await declineFriend(u.id);
                    await refresh();
                  },
                }),
              ]),
            ),
          )
        : null,
      outgoing.length
        ? h(
            "details",
            { class: "friends-details" },
            h("summary", { text: `Demandes envoyées (${outgoing.length})` }),
            ...outgoing.map((u) => friendRow(u, () => [])),
          )
        : null,
      accepted.length
        ? accepted.map((u) =>
            friendRow(u, () => [
              h("button", {
                class: "btn secondary",
                type: "button",
                text: "Défier",
                onClick: () => ctx.onChallengeFriend?.(u),
              }),
              h("button", {
                class: "text-btn",
                type: "button",
                text: "Retirer",
                onClick: async () => {
                  await removeFriend(u.id);
                  await refresh();
                },
              }),
            ]),
          )
        : h("p", { class: "meta", text: "Pas encore d’amis." }),
    ),
    h(
      "details",
      { class: "friends-details duel-history", open: duelHistory.length > 0 && duelHistory.length <= 5 },
      h("summary", {
        text: duelHistory.length ? `Historique (${duelHistory.length})` : "Historique",
      }),
      duelHistory.length
        ? [
            ...historyPreview.map((entry) =>
              h(
                "div",
                { class: `duel-history-row is-${entry.result || "draw"}` },
                h("strong", { text: resultLabel(entry.result) }),
                h("span", {
                  text: `vs ${entry.opponentName} · ${entry.score}-${entry.opponentScore}`,
                }),
                h("span", {
                  class: "meta",
                  text: [formatMs(entry.totalMs), entry.label, formatDuelDate(entry.at)]
                    .filter(Boolean)
                    .join(" · "),
                }),
              ),
            ),
            historyRest.length
              ? h(
                  "details",
                  { class: "friends-details" },
                  h("summary", { text: `Plus anciennes (${historyRest.length})` }),
                  ...historyRest.map((entry) =>
                    h(
                      "div",
                      { class: `duel-history-row is-${entry.result || "draw"}` },
                      h("strong", { text: resultLabel(entry.result) }),
                      h("span", {
                        text: `vs ${entry.opponentName} · ${entry.score}-${entry.opponentScore}`,
                      }),
                      h("span", {
                        class: "meta",
                        text: [entry.label, formatDuelDate(entry.at)].filter(Boolean).join(" · "),
                      }),
                    ),
                  ),
                )
              : null,
          ]
        : h("p", { class: "meta", text: "Aucune partie enregistrée." }),
    ),
  );
}

function onDuelKeydown(event) {
  if (duelUi.phase !== "play" || duelUi.answered || duelUi.reveal) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  const index = Number(event.key) - 1;
  if (index < 0 || index > 3) return;
  const button = document.querySelector(`[data-duel-answer="${index}"]`);
  if (!button || button.disabled) return;
  event.preventDefault();
  answerDuel(index);
}

let duelKeysBound = false;

/** Précharge la socket (présence / défis). */
export function warmDuelSocket() {
  if (!duelKeysBound) {
    duelKeysBound = true;
    document.addEventListener("keydown", onDuelKeydown);
  }
  if (getCachedMe()) ensureWs().catch(() => {});
}
