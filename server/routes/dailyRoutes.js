const express = require("express");
const { requireUser } = require("../middleware/requireUser");
const {
    utcDateKey,
    getDailyMeta,
    getLeaderboard,
    submitDailyResult,
    myDailyEntry
} = require("../services/dailyChallengeService");

function createDailyRoutes() {
    const router = express.Router();
    router.use(express.json({ limit: "32kb" }));

    router.get("/daily/today", (req, res) => {
        const date = String(req.query.date || utcDateKey()).slice(0, 10);
        const meta = getDailyMeta(date);
        if (!meta.ok) {
            res.status(400).json({ error: meta.error || "daily" });
            return;
        }
        const userId = req.user && req.user.id != null ? String(req.user.id) : "";
        const mine = userId ? myDailyEntry(userId, date) : null;
        res.json({
            daily: {
                date: meta.date,
                categoryId: meta.categoryId,
                label: meta.label,
                seed: meta.seed,
                questionCount: meta.questionCount
            },
            mine
        });
    });

    router.get("/daily/leaderboard", (req, res) => {
        const date = String(req.query.date || utcDateKey()).slice(0, 10);
        const limit = Number(req.query.limit) || 50;
        res.json(getLeaderboard(date, limit));
    });

    router.post("/daily/submit", requireUser, (req, res) => {
        const date = String(req.body?.date || utcDateKey()).slice(0, 10);
        const result = submitDailyResult({
            userId: req.user.id,
            score: req.body?.score,
            total: req.body?.total,
            totalMs: req.body?.totalMs,
            date
        });
        if (!result.ok && result.error === "already") {
            res.status(409).json(result);
            return;
        }
        if (!result.ok) {
            res.status(400).json({ error: result.error || "submit" });
            return;
        }
        res.json(result);
    });

    return router;
}

module.exports = { createDailyRoutes };
