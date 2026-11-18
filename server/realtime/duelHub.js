/**
 * Hub WebSocket des duels synchronisés 1v1.
 */
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { getUser, publicUser, appendDuelHistory, areFriends } = require("../services/userStore");
const { buildDuelPack, publicQuestion } = require("../services/duelPackService");

const ANSWER_TIMEOUT_MS = 30_000;
const ROOM_TTL_MS = 45 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** @type {Map<string, object>} */
const rooms = new Map();
/** @type {Map<string, import('ws').WebSocket>} userId → ws */
const onlineByUser = new Map();
/** @type {WeakMap<import('ws').WebSocket, object>} */
const socketMeta = new WeakMap();

function makeCode(len = 6) {
    let out = "";
    const bytes = crypto.randomBytes(len);
    for (let i = 0; i < len; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return out;
}

function send(ws, type, payload = {}) {
    if (!ws || ws.readyState !== 1) return;
    try {
        ws.send(JSON.stringify({ type, ...payload }));
    } catch {
        /* ignore */
    }
}

function playerPublic(p) {
    if (!p) return null;
    return {
        id: p.userId || null,
        guestToken: p.isGuest ? p.guestToken : null,
        displayName: p.displayName,
        isGuest: Boolean(p.isGuest),
        ready: Boolean(p.ready),
        score: p.score || 0,
        totalMs: p.totalMs || 0,
        answered: Boolean(p.answered)
    };
}

function roomPublic(room, forPlayer = null) {
    const meKey = forPlayer?.seat || null;
    return {
        code: room.code,
        status: room.status,
        label: room.label,
        config: room.config,
        host: playerPublic(room.host),
        guest: playerPublic(room.guest),
        questionIndex: room.questionIndex,
        questionCount: room.pack?.length || 0,
        you: meKey,
        winner: room.winner || null
    };
}

function bothReady(room) {
    return Boolean(room.host?.ready && room.guest?.ready);
}

function clearAnswerTimer(room) {
    if (room.answerTimer) {
        clearTimeout(room.answerTimer);
        room.answerTimer = null;
    }
}

function broadcast(room, type, payload = {}) {
    for (const seat of ["host", "guest"]) {
        const p = room[seat];
        if (p?.ws) send(p.ws, type, payload);
    }
}

function broadcastState(room) {
    for (const seat of ["host", "guest"]) {
        const p = room[seat];
        if (p?.ws) send(p.ws, "duel:state", { duel: roomPublic(room, p) });
    }
}

function seatOf(room, meta) {
    if (!meta) return null;
    if (room.host && meta.seat === "host" && room.host.ws === meta.ws) return "host";
    if (room.guest && meta.seat === "guest" && room.guest.ws === meta.ws) return "guest";
    if (meta.userId && room.host?.userId === meta.userId) return "host";
    if (meta.userId && room.guest?.userId === meta.userId) return "guest";
    if (meta.guestToken && room.guest?.guestToken === meta.guestToken) return "guest";
    return null;
}

function opponentSeat(seat) {
    return seat === "host" ? "guest" : "host";
}

function finishRoom(room, reason = "complete") {
    clearAnswerTimer(room);
    room.status = "finished";
    const host = room.host;
    const guest = room.guest;
    let winner = "draw";
    if (host && guest) {
        if (host.score > guest.score) winner = "host";
        else if (guest.score > host.score) winner = "guest";
        else if (host.totalMs < guest.totalMs) winner = "host";
        else if (guest.totalMs < host.totalMs) winner = "guest";
    } else if (reason === "forfeit" && host && !guest) {
        winner = "host";
    } else if (reason === "forfeit" && guest && !host) {
        winner = "guest";
    }
    room.winner = winner;

    const resultPayload = {
        duel: roomPublic(room),
        reason,
        host: playerPublic(host),
        guest: playerPublic(guest),
        winner
    };
    broadcast(room, "duel:finished", resultPayload);

    if (host?.userId && !host.isGuest) {
        appendDuelHistory(host.userId, {
            at: Date.now(),
            opponentName: guest?.displayName || "Adversaire",
            opponentId: guest?.userId || null,
            score: host.score,
            opponentScore: guest?.score || 0,
            totalMs: host.totalMs,
            opponentTotalMs: guest?.totalMs || 0,
            result: winner === "host" ? "win" : winner === "guest" ? "loss" : "draw",
            categoryId: room.config.categoryId,
            label: room.label
        });
    }
    if (guest?.userId && !guest.isGuest) {
        appendDuelHistory(guest.userId, {
            at: Date.now(),
            opponentName: host?.displayName || "Adversaire",
            opponentId: host?.userId || null,
            score: guest.score,
            opponentScore: host?.score || 0,
            totalMs: guest.totalMs,
            opponentTotalMs: host?.totalMs || 0,
            result: winner === "guest" ? "win" : winner === "host" ? "loss" : "draw",
            categoryId: room.config.categoryId,
            label: room.label
        });
    }

    setTimeout(() => {
        if (rooms.get(room.code) === room && room.status === "finished") rooms.delete(room.code);
    }, 5 * 60 * 1000);
}

function startQuestion(room) {
    clearAnswerTimer(room);
    if (!room.pack?.length) return finishRoom(room);
    if (room.questionIndex >= room.pack.length) return finishRoom(room);

    for (const seat of ["host", "guest"]) {
        const p = room[seat];
        if (!p) continue;
        p.answered = false;
        p.answerIndex = null;
        p.elapsedMs = 0;
    }
    room.questionStartedAt = Date.now();
    const q = room.pack[room.questionIndex];
    const payload = {
        index: room.questionIndex,
        total: room.pack.length,
        question: publicQuestion(q),
        timeoutMs: ANSWER_TIMEOUT_MS
    };
    broadcast(room, "duel:question", payload);
    broadcastState(room);

    room.answerTimer = setTimeout(() => {
        forceReveal(room);
    }, ANSWER_TIMEOUT_MS + 250);
}

function forceReveal(room) {
    if (room.status !== "playing") return;
    for (const seat of ["host", "guest"]) {
        const p = room[seat];
        if (!p || p.answered) continue;
        p.answered = true;
        p.answerIndex = -1;
        p.elapsedMs = ANSWER_TIMEOUT_MS;
        p.totalMs += ANSWER_TIMEOUT_MS;
    }
    doReveal(room);
}

function doReveal(room) {
    clearAnswerTimer(room);
    const q = room.pack[room.questionIndex];
    if (!q) return finishRoom(room);

    for (const seat of ["host", "guest"]) {
        const p = room[seat];
        if (!p) continue;
        const correct = p.answerIndex === q.correctIndex;
        if (correct) p.score += 1;
        p.lastCorrect = correct;
    }

    broadcast(room, "duel:reveal", {
        index: room.questionIndex,
        correctIndex: q.correctIndex,
        nom_commun: q.nom_commun,
        host: playerPublic(room.host),
        guest: playerPublic(room.guest)
    });
    broadcastState(room);

    room.questionIndex += 1;
    setTimeout(() => {
        if (room.status !== "playing") return;
        if (room.questionIndex >= room.pack.length) finishRoom(room);
        else startQuestion(room);
    }, 1600);
}

function maybeReveal(room) {
    if (room.host?.answered && room.guest?.answered) doReveal(room);
}

function createRoom({ userId, config }) {
    const user = getUser(userId);
    if (!user) return { ok: false, error: "auth" };
    const built = buildDuelPack({
        categoryId: config.categoryId,
        difficulty: config.difficulty || "melange",
        questionCount: config.questionCount || 10
    });
    if (!built.ok) return { ok: false, error: built.error || "pack" };

    let code = makeCode();
    while (rooms.has(code)) code = makeCode();

    const room = {
        code,
        status: "lobby",
        createdAt: Date.now(),
        config: {
            categoryId: String(config.categoryId || ""),
            difficulty: String(config.difficulty || "melange"),
            questionCount: built.pack.length
        },
        seed: built.seed,
        label: built.label,
        pack: built.pack,
        questionIndex: 0,
        questionStartedAt: 0,
        answerTimer: null,
        winner: null,
        host: {
            seat: "host",
            userId: user.id,
            displayName: user.displayName || "Joueur",
            isGuest: false,
            guestToken: null,
            ready: false,
            score: 0,
            totalMs: 0,
            answered: false,
            answerIndex: null,
            elapsedMs: 0,
            ws: null
        },
        guest: null
    };
    rooms.set(code, room);
    return { ok: true, room };
}

function getRoomMeta(code) {
    const room = rooms.get(String(code || "").toUpperCase());
    if (!room) return null;
    return {
        code: room.code,
        status: room.status,
        label: room.label,
        config: room.config,
        hostName: room.host?.displayName || "Hôte",
        hasGuest: Boolean(room.guest),
        questionCount: room.pack?.length || 0
    };
}

function attachWs(ws, meta) {
    socketMeta.set(ws, meta);
    if (meta.userId) onlineByUser.set(meta.userId, ws);
    ws.on("close", () => onDisconnect(ws));
    ws.on("message", (raw) => onMessage(ws, raw));
    send(ws, "duel:hello", {
        authenticated: Boolean(meta.userId),
        userId: meta.userId || null
    });
}

function onDisconnect(ws) {
    const meta = socketMeta.get(ws);
    if (meta?.userId && onlineByUser.get(meta.userId) === ws) {
        onlineByUser.delete(meta.userId);
    }
    if (!meta?.roomCode) return;
    const room = rooms.get(meta.roomCode);
    if (!room) return;
    const seat = seatOf(room, { ...meta, ws });
    if (!seat) return;
    const player = room[seat];
    if (player) player.ws = null;

    if (room.status === "lobby") {
        if (seat === "guest") {
            room.guest = null;
            broadcastState(room);
        } else if (seat === "host") {
            broadcast(room, "duel:error", { error: "host_left", message: "L’hôte a quitté le lobby." });
            rooms.delete(room.code);
        }
        return;
    }

    if (room.status === "playing") {
        // Forfait si déconnexion pendant la partie
        const other = room[opponentSeat(seat)];
        if (other) {
            room.winner = opponentSeat(seat) === "host" ? "host" : "guest";
            // Boost other as winner via forfeit
            if (seat === "host") room.winner = "guest";
            else room.winner = "host";
        }
        finishRoom(room, "forfeit");
    }
}

function handleCreate(ws, meta, payload) {
    if (!meta.userId) {
        send(ws, "duel:error", { error: "auth", message: "Connecte-toi pour créer un duel." });
        return;
    }
    const result = createRoom({
        userId: meta.userId,
        config: {
            categoryId: payload?.categoryId,
            difficulty: payload?.difficulty || "melange",
            questionCount: payload?.questionCount || 10
        }
    });
    if (!result.ok) {
        send(ws, "duel:error", { error: result.error || "create", message: "Impossible de créer le duel." });
        return;
    }
    const room = result.room;
    room.host.ws = ws;
    meta.roomCode = room.code;
    meta.seat = "host";
    socketMeta.set(ws, meta);
    send(ws, "duel:created", { code: room.code, duel: roomPublic(room, room.host) });
    broadcastState(room);
}

function handleJoin(ws, meta, payload) {
    const code = String(payload?.code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
        send(ws, "duel:error", { error: "not_found", message: "Duel introuvable." });
        return;
    }
    if (room.status !== "lobby") {
        send(ws, "duel:error", { error: "started", message: "Ce duel a déjà commencé." });
        return;
    }

    // Rejoin host
    if (meta.userId && room.host?.userId === meta.userId) {
        room.host.ws = ws;
        meta.roomCode = room.code;
        meta.seat = "host";
        socketMeta.set(ws, meta);
        send(ws, "duel:joined", { duel: roomPublic(room, room.host) });
        broadcastState(room);
        return;
    }

    if (room.guest && meta.userId && room.guest.userId === meta.userId) {
        room.guest.ws = ws;
        meta.roomCode = room.code;
        meta.seat = "guest";
        socketMeta.set(ws, meta);
        send(ws, "duel:joined", { duel: roomPublic(room, room.guest) });
        broadcastState(room);
        return;
    }

    if (room.guest) {
        send(ws, "duel:error", { error: "full", message: "Ce duel est déjà complet." });
        return;
    }

    if (meta.userId && room.host?.userId === meta.userId) {
        send(ws, "duel:error", { error: "self", message: "Tu es déjà l’hôte." });
        return;
    }

    let displayName;
    let isGuest = false;
    let guestToken = null;
    let userId = null;

    if (meta.userId) {
        const user = getUser(meta.userId);
        displayName = user?.displayName || "Joueur";
        userId = meta.userId;
    } else {
        isGuest = true;
        guestToken = crypto.randomBytes(12).toString("hex");
        const raw = String(payload?.displayName || "").trim().replace(/\s+/g, " ").slice(0, 40);
        displayName = raw.length >= 2 ? raw : `Invité-${code.slice(0, 4)}`;
        meta.guestToken = guestToken;
    }

    room.guest = {
        seat: "guest",
        userId,
        displayName,
        isGuest,
        guestToken,
        ready: false,
        score: 0,
        totalMs: 0,
        answered: false,
        answerIndex: null,
        elapsedMs: 0,
        ws
    };
    meta.roomCode = room.code;
    meta.seat = "guest";
    socketMeta.set(ws, meta);
    send(ws, "duel:joined", { duel: roomPublic(room, room.guest), guestToken });
    broadcastState(room);
}

function handleReady(ws, meta, payload) {
    const room = rooms.get(meta.roomCode);
    if (!room || room.status !== "lobby") return;
    const seat = seatOf(room, { ...meta, ws });
    if (!seat) return;
    room[seat].ready = Boolean(payload?.ready !== false);
    broadcastState(room);
    if (bothReady(room) && room.host && room.guest) {
        room.status = "playing";
        room.questionIndex = 0;
        room.host.score = 0;
        room.host.totalMs = 0;
        room.guest.score = 0;
        room.guest.totalMs = 0;
        broadcast(room, "duel:start", {
            duel: roomPublic(room),
            questionCount: room.pack.length
        });
        startQuestion(room);
    }
}

function handleAnswer(ws, meta, payload) {
    const room = rooms.get(meta.roomCode);
    if (!room || room.status !== "playing") return;
    const seat = seatOf(room, { ...meta, ws });
    if (!seat) return;
    const player = room[seat];
    if (player.answered) return;

    const optionIndex = Number(payload?.optionIndex);
    const elapsed = Math.max(0, Math.min(ANSWER_TIMEOUT_MS, Date.now() - room.questionStartedAt));
    player.answered = true;
    player.answerIndex = Number.isInteger(optionIndex) ? optionIndex : -1;
    player.elapsedMs = elapsed;
    player.totalMs += elapsed;

    const other = room[opponentSeat(seat)];
    if (other?.ws) {
        send(other.ws, "duel:opponentAnswered", { seat });
    }
    broadcastState(room);
    maybeReveal(room);
}

function handleLeave(ws, meta) {
    onDisconnect(ws);
    meta.roomCode = null;
    meta.seat = null;
}

function handleFriendChallenge(ws, meta, payload) {
    if (!meta.userId) {
        send(ws, "duel:error", { error: "auth", message: "Connecte-toi pour défier un ami." });
        return;
    }
    const friendId = String(payload?.friendId || "");
    if (!areFriends(meta.userId, friendId)) {
        send(ws, "duel:error", { error: "friends", message: "Vous n’êtes pas amis." });
        return;
    }
    const result = createRoom({
        userId: meta.userId,
        config: {
            categoryId: payload?.categoryId,
            difficulty: payload?.difficulty || "melange",
            questionCount: payload?.questionCount || 10
        }
    });
    if (!result.ok) {
        send(ws, "duel:error", { error: result.error || "create", message: "Impossible de créer le duel." });
        return;
    }
    const room = result.room;
    room.host.ws = ws;
    meta.roomCode = room.code;
    meta.seat = "host";
    socketMeta.set(ws, meta);
    send(ws, "duel:created", { code: room.code, duel: roomPublic(room, room.host) });
    broadcastState(room);

    const friendWs = onlineByUser.get(friendId);
    const host = getUser(meta.userId);
    if (friendWs) {
        send(friendWs, "friend:challenge", {
            code: room.code,
            from: publicUser(host),
            label: room.label,
            config: room.config
        });
    }
}

function onMessage(ws, raw) {
    let msg;
    try {
        msg = JSON.parse(String(raw));
    } catch {
        return;
    }
    const meta = socketMeta.get(ws) || {};
    const type = String(msg?.type || "");
    switch (type) {
        case "duel:create":
            handleCreate(ws, meta, msg);
            break;
        case "duel:join":
            handleJoin(ws, meta, msg);
            break;
        case "duel:ready":
            handleReady(ws, meta, msg);
            break;
        case "duel:answer":
            handleAnswer(ws, meta, msg);
            break;
        case "duel:leave":
            handleLeave(ws, meta);
            break;
        case "friend:challenge":
            handleFriendChallenge(ws, meta, msg);
            break;
        case "ping":
            send(ws, "pong", {});
            break;
        default:
            break;
    }
}

function pruneRooms() {
    const now = Date.now();
    for (const [code, room] of rooms) {
        if (now - room.createdAt > ROOM_TTL_MS) {
            clearAnswerTimer(room);
            rooms.delete(code);
        }
    }
}
setInterval(pruneRooms, 60_000).unref?.();

/**
 * @param {import('http').Server} server
 * @param {{ sessionMiddleware: Function, passport: import('passport').PassportStatic }} deps
 */
function attachDuelHub(server, { sessionMiddleware, passport }) {
    const wss = new WebSocketServer({ noServer: true });

    function runMiddleware(middleware, req, res) {
        return new Promise((resolve, reject) => {
            middleware(req, res, (err) => (err ? reject(err) : resolve()));
        });
    }

    server.on("upgrade", async (req, socket, head) => {
        try {
            const url = new URL(req.url || "", "http://localhost");
            if (url.pathname !== "/ws") {
                socket.destroy();
                return;
            }
            const fakeRes = {
                getHeader() {
                    return undefined;
                },
                setHeader() {},
                end() {}
            };
            await runMiddleware(sessionMiddleware, req, fakeRes);
            await runMiddleware(passport.initialize(), req, fakeRes);
            await runMiddleware(passport.session(), req, fakeRes);

            wss.handleUpgrade(req, socket, head, (ws) => {
                const userId = req.user && req.user.id != null ? String(req.user.id) : "";
                attachWs(ws, {
                    userId: userId || null,
                    guestToken: null,
                    roomCode: null,
                    seat: null,
                    ws
                });
            });
        } catch {
            try {
                socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
            } catch {
                /* ignore */
            }
            socket.destroy();
        }
    });

    return { wss, getRoomMeta, rooms, onlineByUser };
}

module.exports = { attachDuelHub, getRoomMeta, createRoom };
