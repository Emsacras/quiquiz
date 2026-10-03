const { config } = require("../config");

/**
 * Session Steam Passport requise ; Steam ID doit figurer dans `ADMIN_STEAM_IDS` (env, liste séparée par virgules).
 */
function requireAdminSteam(req, res, next) {
    const sessionId = req.user && req.user.steamId != null ? String(req.user.steamId) : "";
    if (!sessionId) {
        return res.status(401).json({
            error: "Unauthorized",
            hint: "Connexion Steam requise (GET /auth/steam)."
        });
    }
    if (!config.adminSteamIds.includes(sessionId)) {
        return res.status(403).json({ error: "forbidden" });
    }
    next();
}

module.exports = { requireAdminSteam };
