/**
 * Session joueur requise (Passport user.id).
 */
function requireUser(req, res, next) {
    const id = req.user && req.user.id != null ? String(req.user.id) : "";
    if (!id) {
        return res.status(401).json({ error: "Unauthorized", hint: "Connexion Steam ou Google requise." });
    }
    next();
}

module.exports = { requireUser };
