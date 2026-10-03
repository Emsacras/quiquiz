const { config } = require("../config");
const { steamIdOf } = require("../services/userStore");

/**
 * Session joueur requise ; Steam ID du profil doit figurer dans `ADMIN_STEAM_IDS`.
 */
function requireAdminSteam(req, res, next) {
    const userId = req.user && req.user.id != null ? String(req.user.id) : "";
    // Compat anciennes sessions { steamId } le temps d’une migration douce.
    const legacySteam = req.user && req.user.steamId != null ? String(req.user.steamId) : "";
    const steamId = (userId ? steamIdOf(userId) : "") || legacySteam;
    if (!steamId) {
        return res.status(401).json({
            error: "Unauthorized",
            hint: "Connexion Steam requise (GET /auth/steam?returnTo=admin)."
        });
    }
    if (!config.adminSteamIds.includes(steamId)) {
        return res.status(403).json({ error: "forbidden" });
    }
    next();
}

module.exports = { requireAdminSteam };
