/**
 * Bassin de photos sous /api/ + modération admin sous /api/admin/photos/.
 */
const express = require("express");
const {
    getPool,
    listCandidates,
    validatePhoto,
    blacklistPhoto,
    restoreValidatedFromBlacklist,
    listValidated,
    listBlacklist,
    removeFromBlacklist,
    resolveMediaFile,
    addReport,
    listReports,
    dismissReport
} = require("../services/quizPoolService");
const { requireAdminSteam } = require("../middleware/requireAdminSteam");

function createQuizRoutes() {
    const router = express.Router();
    router.use(express.json({ limit: "8kb" }));

    router.post("/reports", (req, res) => {
        const result = addReport({
            name: req.body?.name,
            title: req.body?.title,
            url: req.body?.url,
            categoryId: req.body?.categoryId,
            ip: req.ip || req.headers["x-forwarded-for"] || ""
        });
        if (!result.ok) {
            res.status(result.error === "rate" ? 429 : 400).json({ error: result.error || "report" });
            return;
        }
        res.json({ ok: true, duplicate: Boolean(result.duplicate) });
    });

    router.get("/pool", async (req, res) => {
        const name = String(req.query.name || "").trim().replace(/\s+/g, " ");
        if (!name || name.length > 120) {
            res.status(400).json({ error: "name" });
            return;
        }
        try {
            const validatedOnly =
                String(req.query.validatedOnly || "") === "1" ||
                String(req.query.validatedOnly || "").toLowerCase() === "true";
            const kind = String(req.query.kind || "").trim().toLowerCase();
            const items = await getPool(name, { validatedOnly, kind });
            res.set("Cache-Control", "no-store");
            res.json({ name, items });
        } catch (error) {
            console.error("[quiz-pool]", error);
            res.status(502).json({ error: "pool" });
        }
    });

    router.get("/blocked-titles", (req, res) => {
        res.set("Cache-Control", "no-store");
        res.json({ titles: listBlacklist().map((entry) => entry.title) });
    });

    router.get("/media/:speciesDir/:filename", (req, res) => {
        const abs = resolveMediaFile(req.params.speciesDir, req.params.filename);
        if (!abs) {
            res.status(404).json({ error: "missing" });
            return;
        }
        res.set("Cache-Control", "public, max-age=31536000, immutable");
        res.sendFile(abs);
    });

    /** Proxy drapeau same-origin (évite blocages flagcdn côté navigateur). */
    router.get("/flag/:iso2", async (req, res) => {
        const iso = String(req.params.iso2 || "")
            .trim()
            .toLowerCase();
        if (!/^[a-z]{2}$/.test(iso)) {
            res.status(400).json({ error: "iso2" });
            return;
        }
        try {
            const upstream = await fetch(`https://flagcdn.com/w1280/${iso}.png`, {
                headers: { "User-Agent": "QuiQuiz/1.0 (https://quiquiz.fr)", Accept: "image/png,*/*" }
            });
            if (!upstream.ok) {
                res.status(502).json({ error: "flag" });
                return;
            }
            const buffer = Buffer.from(await upstream.arrayBuffer());
            if (!buffer.length) {
                res.status(502).json({ error: "flag" });
                return;
            }
            res.set("Cache-Control", "public, max-age=604800, immutable");
            res.set("Content-Type", upstream.headers.get("content-type") || "image/png");
            res.send(buffer);
        } catch (error) {
            console.error("[flag-proxy]", iso, error && error.message ? error.message : error);
            res.status(502).json({ error: "flag" });
        }
    });

    return router;
}

function createQuizAdminRoutes() {
    const router = express.Router();
    router.use(express.json({ limit: "16kb" }));
    router.use(requireAdminSteam);

    router.get("/candidates", async (req, res) => {
        const name = String(req.query.name || "").trim().replace(/\s+/g, " ");
        if (!name || name.length > 120) {
            res.status(400).json({ error: "name" });
            return;
        }
        try {
            const data = await listCandidates(name);
            res.set("Cache-Control", "no-store");
            res.json(data);
        } catch (error) {
            console.error("[quiz-admin-candidates]", error);
            res.status(502).json({ error: "candidates" });
        }
    });

    router.get("/validated", (req, res) => {
        res.set("Cache-Control", "no-store");
        res.json({ items: listValidated() });
    });

    router.get("/blacklist", (req, res) => {
        res.set("Cache-Control", "no-store");
        res.json({ items: listBlacklist() });
    });

    router.post("/validate", async (req, res) => {
        const result = await validatePhoto({
            name: req.body?.name,
            title: req.body?.title,
            url: req.body?.url
        });
        if (!result.ok) {
            res.status(400).json({ error: result.error || "validate" });
            return;
        }
        res.json(result);
    });

    router.post("/blacklist", (req, res) => {
        const result = blacklistPhoto({
            name: req.body?.name,
            title: req.body?.title,
            url: req.body?.url
        });
        if (!result.ok) {
            res.status(400).json({ error: result.error || "blacklist" });
            return;
        }
        res.json(result);
    });

    router.post("/restore-validated", async (req, res) => {
        const result = await restoreValidatedFromBlacklist({ title: req.body?.title });
        if (!result.ok) {
            res.status(400).json({ error: result.error || "restore" });
            return;
        }
        res.json(result);
    });

    router.post("/unblacklist", (req, res) => {
        const title = String(req.body?.title || "").trim();
        if (!title) {
            res.status(400).json({ error: "title" });
            return;
        }
        removeFromBlacklist(title);
        res.json({ ok: true });
    });

    router.get("/reports", (req, res) => {
        res.set("Cache-Control", "no-store");
        res.json({ items: listReports() });
    });

    router.post("/reports/dismiss", (req, res) => {
        const result = dismissReport(req.body?.title);
        if (!result.ok) {
            res.status(400).json({ error: result.error || "dismiss" });
            return;
        }
        res.json({ ok: true });
    });

    return router;
}

module.exports = { createQuizRoutes, createQuizAdminRoutes };
