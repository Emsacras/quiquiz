const express = require("express");
const { requireUser } = require("../middleware/requireUser");
const {
    friendLists,
    requestFriend,
    acceptFriend,
    declineFriend,
    removeFriend,
    searchUsers,
    getUser
} = require("../services/userStore");

function createFriendRoutes() {
    const router = express.Router();
    router.use(express.json({ limit: "64kb" }));

    router.get("/friends", requireUser, (req, res) => {
        const friends = friendLists(req.user.id);
        if (!friends) {
            res.status(404).json({ error: "missing" });
            return;
        }
        const user = getUser(req.user.id);
        res.json({ friends, duelHistory: user?.duelHistory || [] });
    });

    router.get("/users/search", requireUser, (req, res) => {
        const results = searchUsers(req.query.q, req.user.id, 12);
        res.json({ users: results });
    });

    router.post("/friends/request", requireUser, (req, res) => {
        const result = requestFriend(req.user.id, req.body?.userId);
        if (!result.ok) {
            res.status(400).json({ error: result.error || "request" });
            return;
        }
        res.json({ ok: true, friends: result.friends });
    });

    router.post("/friends/accept", requireUser, (req, res) => {
        const result = acceptFriend(req.user.id, req.body?.userId);
        if (!result.ok) {
            res.status(400).json({ error: result.error || "accept" });
            return;
        }
        res.json({ ok: true, friends: result.friends });
    });

    router.post("/friends/decline", requireUser, (req, res) => {
        const result = declineFriend(req.user.id, req.body?.userId);
        if (!result.ok) {
            res.status(400).json({ error: result.error || "decline" });
            return;
        }
        res.json({ ok: true, friends: result.friends });
    });

    router.delete("/friends/:userId", requireUser, (req, res) => {
        const result = removeFriend(req.user.id, req.params.userId);
        if (!result.ok) {
            res.status(400).json({ error: result.error || "remove" });
            return;
        }
        res.json({ ok: true, friends: result.friends });
    });

    return router;
}

module.exports = { createFriendRoutes };
