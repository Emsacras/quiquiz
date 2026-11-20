/**
 * Réponse générique. La trace reste dans le journal du process, pas dans le corps HTTP.
 */
function quietErrorHandler(err, req, res, next) {
    if (res.headersSent) {
        next(err);
        return;
    }
    const status = Number(err && (err.status || err.statusCode));
    const code = status >= 400 && status < 600 ? status : 500;
    const message = err && err.message ? err.message : "error";
    console.error(`[http] ${code} ${message}`);
    res.status(code);
    res.set("Cache-Control", "no-store");
    const accept = String(req.headers.accept || "");
    if (String(req.path || "").startsWith("/api/") || accept.includes("application/json")) {
        res.json({ error: "server" });
        return;
    }
    res.type("text/plain; charset=utf-8").send(code === 404 ? "Introuvable" : "Erreur interne");
}

module.exports = { quietErrorHandler };
