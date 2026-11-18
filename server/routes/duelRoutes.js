const express = require("express");
const { requireUser } = require("../middleware/requireUser");
const { createRoom, getRoomMeta } = require("../realtime/duelHub");
const { buildDuelPack, listQuizGroups } = require("../services/duelPackService");

function createDuelRoutes() {
    const router = express.Router();
    router.use(express.json({ limit: "64kb" }));

    router.get("/duels/groups", (req, res) => {
        const result = listQuizGroups(req.query.categoryId);
        if (!result.ok) {
            res.status(400).json({ error: result.error || "category", groups: [] });
            return;
        }
        res.json({ ok: true, label: result.label, groups: result.groups });
    });

    router.post("/duels", requireUser, (req, res) => {
        const result = createRoom({
            userId: req.user.id,
            config: {
                categoryId: req.body?.categoryId,
                difficulty: req.body?.difficulty || "melange",
                questionCount: req.body?.questionCount || 10,
                groupIds: req.body?.groupIds
            }
        });
        if (!result.ok) {
            res.status(400).json({
                error: result.error || "create",
                message:
                    result.error === "empty"
                        ? "Aucune question pour ces sous-catégories / difficulté."
                        : "Impossible de créer le duel."
            });
            return;
        }
        res.json({
            ok: true,
            code: result.room.code,
            duel: {
                code: result.room.code,
                status: result.room.status,
                label: result.room.label,
                config: result.room.config,
                questionCount: result.room.pack.length
            }
        });
    });

    router.get("/duels/:code", (req, res) => {
        const meta = getRoomMeta(req.params.code);
        if (!meta) {
            res.status(404).json({ error: "not_found" });
            return;
        }
        res.json({ duel: meta });
    });

    return router;
}

module.exports = { createDuelRoutes };
