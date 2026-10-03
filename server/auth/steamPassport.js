const passport = require("passport");
const SteamStrategy = require("passport-steam").Strategy;
const { config, isSteamAuthConfigured } = require("../config");
const { upsertFromProvider } = require("../services/userStore");

let installed = false;

function steamAvatar(profile) {
    const photos = profile?.photos;
    if (!Array.isArray(photos) || !photos.length) return "";
    const full = photos.find((p) => /full/i.test(String(p?.value || ""))) || photos[photos.length - 1];
    return full?.value ? String(full.value) : "";
}

function installSteamStrategy() {
    if (installed) return;
    if (!isSteamAuthConfigured()) {
        console.warn(
            "[auth] Steam OpenID désactivé : définis STEAM_WEB_API_KEY, STEAM_RETURN_URL, STEAM_REALM dans .env"
        );
        return;
    }

    passport.use(
        new SteamStrategy(
            {
                returnURL: config.steam.returnUrl,
                realm: config.steam.realm,
                apiKey: config.steam.apiKey,
                passReqToCallback: true
            },
            (req, identifier, profile, done) => {
                const steamId = profile && profile.id ? String(profile.id) : "";
                if (!steamId) return done(null, false);
                const linkUserId = req.session?.linkUserId || null;
                const result = upsertFromProvider(
                    "steam",
                    {
                        id: steamId,
                        displayName: profile.displayName || null,
                        avatarUrl: steamAvatar(profile)
                    },
                    linkUserId
                );
                if (result.conflict) {
                    req.session.authFlash = "conflict";
                    return done(null, false);
                }
                if (!result.user) return done(null, false);
                req.session.authFlash = result.linked ? "linked" : "ok";
                return done(null, { id: result.user.id });
            }
        )
    );
    installed = true;
}

module.exports = {
    installSteamStrategy,
    isSteamAuthConfigured
};
