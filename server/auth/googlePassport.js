const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { config, isGoogleAuthConfigured } = require("../config");
const { upsertFromProvider } = require("../services/userStore");

let installed = false;

function googleAvatar(profile) {
    const photos = profile?.photos;
    if (!Array.isArray(photos) || !photos.length) return "";
    return photos[0]?.value ? String(photos[0].value) : "";
}

function installGoogleStrategy() {
    if (installed) return;
    if (!isGoogleAuthConfigured()) {
        console.warn(
            "[auth] Google OAuth désactivé : définis GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL dans .env"
        );
        return;
    }

    passport.use(
        new GoogleStrategy(
            {
                clientID: config.google.clientId,
                clientSecret: config.google.clientSecret,
                callbackURL: config.google.callbackUrl,
                passReqToCallback: true
            },
            (req, accessToken, refreshToken, profile, done) => {
                const googleId = profile && profile.id ? String(profile.id) : "";
                if (!googleId) return done(null, false);
                const linkUserId = req.session?.linkUserId || null;
                const result = upsertFromProvider(
                    "google",
                    {
                        id: googleId,
                        displayName: profile.displayName || profile.emails?.[0]?.value || null,
                        avatarUrl: googleAvatar(profile)
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
    installGoogleStrategy,
    isGoogleAuthConfigured
};
