/**
 * Compteur fixe en mémoire, un seul process (voir deploy/DEPLOY.md).
 */
function createRateLimit({ windowMs, max, plain = false }) {
    const hits = new Map();

    return function rateLimit(req, res, next) {
        const now = Date.now();
        const key = req.ip || "anon";
        let bucket = hits.get(key);
        if (!bucket || now - bucket.start >= windowMs) {
            bucket = { start: now, count: 0 };
            hits.set(key, bucket);
        }
        bucket.count += 1;
        if (hits.size > 5000) {
            for (const [id, entry] of hits) {
                if (now - entry.start >= windowMs) hits.delete(id);
            }
        }
        if (bucket.count <= max) {
            next();
            return;
        }
        const retry = Math.max(1, Math.ceil((bucket.start + windowMs - now) / 1000));
        res.set("Retry-After", String(retry));
        res.status(429);
        if (plain) {
            res.type("text/plain; charset=utf-8").send("Trop de tentatives. Réessaie plus tard.");
            return;
        }
        res.json({ error: "rate" });
    };
}

module.exports = { createRateLimit };
