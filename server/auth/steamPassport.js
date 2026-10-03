const passport = require("passport");
const SteamStrategy = require("passport-steam").Strategy;
const { config, isSteamAuthConfigured } = require("../config");

let installed = false;

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
                apiKey: config.steam.apiKey
            },
            (identifier, profile, done) => {
                const steamId = profile && profile.id ? String(profile.id) : "";
                if (!steamId) return done(null, false);
                return done(null, {
                    steamId,
                    displayName: profile.displayName || null
                });
            }
        )
    );
    installed = true;
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user || false));

module.exports = {
    passport,
    installSteamStrategy,
    isSteamAuthConfigured
};
