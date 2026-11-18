/**
 * Client duels live 1v1 (WebSocket) + helpers amis.
 */
import { flagCdnUrl, getSpeciesImages, pickRandomImage } from "./images.js";
import { getCachedMe } from "./profile.js";

const PLACEHOLDER = "assets/placeholder.svg";

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
};

const WS_TIMEOUT_MS = 8000;
let remountTimer = null;
let uiListener = null;

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
    loadDuelImage(msg.question);
  }
  if (type === "duel:opponentAnswered") {
    duelUi.opponentAnswered = true;
  }
  if (type === "duel:reveal") {
    duelUi.reveal = msg;
    duelUi.duel = {
      ...(duelUi.duel || {}),
      host: msg.host,
      guest: msg.guest,
    };
  }
  if (type === "duel:finished") {
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

async function loadDuelImage(question) {
  if (!question) return;
  const token = `${question.id}:${duelUi.questionIndex}`;
  try {
    if (question.iso2 && flagCdnUrl) {
      const url = flagCdnUrl(question.iso2);
      if (url) {
        if (token === `${duelUi.question?.id}:${duelUi.questionIndex}`) {
          duelUi.imageUrl = url;
          emit({ type: "duel:ui" });
        }
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
      duelUi.imageUrl = url;
      emit({ type: "duel:ui" });
    }
  } catch {
    /* ignore */
  }
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
    ...partial,
  });
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
  if (duelUi.answered) return;
  duelUi.answered = true;
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

  const initialCat = duelUi.categoryId || ctx.defaultCategoryId || leaves[0]?.id || "";
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
  const diffSelect = h(
    "select",
    { class: "duel-select", "aria-label": "Difficulté" },
    h("option", {
      value: "melange",
      text: "Mélange",
      selected: (duelUi.difficulty || "melange") === "melange",
    }),
    h("option", {
      value: "facile",
      text: "Facile",
      selected: duelUi.difficulty === "facile",
    }),
    h("option", {
      value: "moyen",
      text: "Moyen",
      selected: duelUi.difficulty === "moyen",
    }),
    h("option", {
      value: "difficile",
      text: "Difficile",
      selected: duelUi.difficulty === "difficile",
    }),
  );
  const countSelect = h(
    "select",
    { class: "duel-select", "aria-label": "Nombre de questions" },
    ...[5, 8, 10, 12, 16].map((n) =>
      h("option", {
        value: String(n),
        text: `${n} questions`,
        selected: n === (Number(duelUi.questionCount) || 10),
      }),
    ),
  );

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
    class: "btn",
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
      class: "btn",
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
      class: "btn",
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
  const nodes = [
    h(
      "div",
      { class: "duel-scorebar" },
      h("span", {
        text: `${me?.displayName || "Toi"} ${me?.score ?? 0}`,
      }),
      h("span", {
        class: "meta",
        text: `Q ${(duelUi.questionIndex || 0) + 1}/${duelUi.questionTotal || "?"}`,
      }),
      h("span", {
        text: `${opp?.displayName || "Adv."} ${opp?.score ?? 0}`,
      }),
    ),
    h("p", {
      class: "meta",
      text: duelUi.answered
        ? duelUi.opponentAnswered || reveal
          ? "Révélation…"
          : "En attente de l’adversaire…"
        : duelUi.opponentAnswered
          ? "L’adversaire a répondu — à toi !"
          : `Temps max ${(duelUi.timeoutMs / 1000) | 0} s`,
    }),
  ];

  if (duelUi.imageUrl) {
    nodes.push(
      h(
        "figure",
        { class: "duel-frame" },
        h("img", {
          src: duelUi.imageUrl,
          alt: "À identifier",
          onError: (e) => {
            e.currentTarget.src = PLACEHOLDER;
          },
        }),
      ),
    );
  } else {
    nodes.push(
      h("p", {
        class: "lede",
        text: q?.indice ? `Indice : ${q.indice}` : "Choisis la bonne réponse",
      }),
    );
  }

  if (q?.options?.length) {
    nodes.push(
      h(
        "div",
        { class: "options duel-choices" },
        q.options.map((opt, index) => {
          const cls =
            reveal && index === reveal.correctIndex ? "option is-correct" : "option";
          return h("button", {
            class: cls,
            type: "button",
            text: opt,
            disabled: duelUi.answered || Boolean(reveal),
            onClick: () => answerDuel(index),
          });
        }),
      ),
    );
  }

  if (reveal) {
    nodes.push(
      h("p", {
        class: "note",
        text: `Réponse : ${reveal.nom_commun || "—"} · Temps toi ${formatMs(me?.totalMs)} · adv. ${formatMs(opp?.totalMs)}`,
      }),
    );
  }

  return nodes;
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
      class: "btn",
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

/**
 * Section Amis pour le profil.
 */
export function mountFriendsSection(ctx) {
  const wrap = h("section", { class: "friends-panel" }, h("p", { class: "meta", text: "Chargement des amis…" }));

  (async () => {
    const data = await fetchFriends();
    if (!data?.friends) {
      wrap.replaceChildren(h("p", { class: "note", text: "Impossible de charger les amis." }));
      return;
    }
    renderFriends(wrap, data, ctx);
  })();

  return wrap;
}

function renderFriends(wrap, data, ctx) {
  const { friends, duelHistory = [] } = data;
  const searchInput = h("input", {
    class: "profile-name-input",
    type: "search",
    placeholder: "Chercher un pseudo…",
    "aria-label": "Recherche joueur",
  });
  const searchOut = h("div", { class: "friends-search-out" });

  const refresh = async () => {
    const next = await fetchFriends();
    if (next?.friends) renderFriends(wrap, next, ctx);
  };

  searchInput.addEventListener("input", async () => {
    const q = searchInput.value.trim();
    if (q.length < 2) {
      searchOut.replaceChildren();
      return;
    }
    const users = await searchUsers(q);
    searchOut.replaceChildren(
      ...users.map((u) =>
        h(
          "div",
          { class: "friends-row" },
          h("span", { text: u.displayName }),
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
      ),
    );
  });

  const listBlock = (title, items, actions) =>
    h(
      "div",
      { class: "friends-block" },
      h("h3", { text: title }),
      items.length
        ? items.map((u) =>
            h(
              "div",
              { class: "friends-row" },
              u.avatarUrl
                ? h("img", { class: "friends-avatar", src: u.avatarUrl, alt: "", width: "32", height: "32" })
                : h("span", { class: "friends-avatar is-placeholder", text: (u.displayName || "?").slice(0, 1) }),
              h("span", { text: u.displayName }),
              ...(actions(u) || []),
            ),
          )
        : h("p", { class: "meta", text: "Personne pour l’instant." }),
    );

  wrap.replaceChildren(
    h("h2", { text: "Amis" }),
    h("p", { class: "meta", text: "Ajoute des amis et défie-les en duel live." }),
    searchInput,
    searchOut,
    listBlock("Demandes reçues", friends.incoming || [], (u) => [
      h("button", {
        class: "text-btn",
        type: "button",
        text: "Accepter",
        onClick: async () => {
          await acceptFriend(u.id);
          await refresh();
        },
      }),
      h("button", {
        class: "text-btn",
        type: "button",
        text: "Refuser",
        onClick: async () => {
          await declineFriend(u.id);
          await refresh();
        },
      }),
    ]),
    listBlock("Demandes envoyées", friends.outgoing || [], () => []),
    listBlock("Amis", friends.accepted || [], (u) => [
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
    duelHistory.length
      ? h(
          "div",
          { class: "friends-block" },
          h("h3", { text: "Derniers duels" }),
          ...duelHistory.slice(0, 8).map((entry) =>
            h("p", {
              class: "meta",
              text: `${entry.result === "win" ? "Victoire" : entry.result === "loss" ? "Défaite" : "Nul"} vs ${entry.opponentName} · ${entry.score}-${entry.opponentScore} · ${entry.label || ""}`,
            }),
          ),
        )
      : null,
  );
}

/** Précharge la socket (présence / défis). */
export function warmDuelSocket() {
  if (getCachedMe()) ensureWs().catch(() => {});
}
