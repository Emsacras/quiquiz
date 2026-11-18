const express = require("express");
const { requireUser } = require("../middleware/requireUser");
const { createRoom, getRoomMeta } = require("../realtime/duelHub");
const { buildDuelPack } = require("../services/duelPackService");

function createDuelRoutes() {
    const router = express.Router();
    router.use(express.json({ limit: "64kb" }));

    router.post("/duels", requireUser, (req, res) => {
        const result = createRoom({
            userId: req.user.id,
            config: {
                categoryId: req.body?.categoryId,
                difficulty: req.body?.difficulty || "melange",
                questionCount: req.body?.questionCount || 10
            }
        });
        if (!result.ok) {
            res.status(400).json({ error: result.error || "create" });
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

    router.get("/duels/preview-pack", requireUser, (req, res) => {
        const built = buildDuelPack({
            categoryId: req.query.categoryId,
            difficulty: req.query.difficulty || "melange",
            questionCount: Number(req.query.questionCount) || 10,
            seed: "preview"
        });
        if (!built.ok) {
            res.status(400).json({ error: built.error || "pack" });
            return;
        }
        res.json({ ok: true, count: built.pack.length, label: built.label });
    });

    return router;
}

module.exports = { createDuelRoutes };
