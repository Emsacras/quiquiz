const passport = require("passport");
const { getUser } = require("../services/userStore");
const { installSteamStrategy } = require("./steamPassport");
const { installGoogleStrategy } = require("./googlePassport");

function installPassport() {
    installSteamStrategy();
    installGoogleStrategy();

    passport.serializeUser((user, done) => {
        done(null, { id: user && user.id != null ? String(user.id) : "" });
    });

    passport.deserializeUser((raw, done) => {
        const id = raw && raw.id != null ? String(raw.id) : "";
        if (!id) return done(null, false);
        const user = getUser(id);
        if (!user) return done(null, false);
        return done(null, { id: user.id });
    });
}

module.exports = { passport, installPassport };
