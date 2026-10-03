const express = require("express");
const { requireUser } = require("../middleware/requireUser");
const { config } = require("../config");
const {
    getUser,
    publicUser,
    getProgress,
    saveProgress,
    setDisplayName,
    unlinkProvider,
    steamIdOf
} = require("../services/userStore");

function createProfileRoutes() {
    const router = express.Router();
    router.use(express.json({ limit: "256kb" }));

    router.get("/me", (req, res) => {
        const userId = req.user && req.user.id != null ? String(req.user.id) : "";
        if (!userId) {
            res.json({ user: null, isAdmin: false });
            return;
        }
        const user = getUser(userId);
        if (!user) {
            res.json({ user: null, isAdmin: false });
            return;
        }
        const steamId = steamIdOf(userId);
        res.json({
            user: publicUser(user),
            isAdmin: Boolean(steamId && config.adminSteamIds.includes(steamId))
        });
    });

    router.get("/me/progress", requireUser, (req, res) => {
        const progress = getProgress(req.user.id);
        if (!progress) {
            res.status(404).json({ error: "missing" });
            return;
        }
        res.set("Cache-Control", "no-store");
        res.json({ progress });
    });

    router.put("/me/progress", requireUser, (req, res) => {
        const result = saveProgress(req.user.id, req.body?.progress || req.body || {});
        if (!result.ok) {
            res.status(400).json({ error: result.error || "save" });
            return;
        }
        res.json({ ok: true, progress: result.progress });
    });

    router.post("/me/display-name", requireUser, (req, res) => {
        const result = setDisplayName(req.user.id, req.body?.displayName);
        if (!result.ok) {
            res.status(400).json({ error: result.error || "name" });
            return;
        }
        res.json({ ok: true, user: publicUser(result.user) });
    });

    router.post("/me/unlink", requireUser, (req, res) => {
        const result = unlinkProvider(req.user.id, String(req.body?.provider || ""));
        if (!result.ok) {
            res.status(400).json({ error: result.error || "unlink" });
            return;
        }
        res.json({ ok: true, user: publicUser(result.user) });
    });

    return router;
}

module.exports = { createProfileRoutes };
