/**
 * QuiQuiz — quiz photo autonome (frontend statique + API bassin/admin + profil).
 */
const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const { config, isSteamAuthConfigured, isGoogleAuthConfigured } = require("./config");
const { passport, installPassport } = require("./auth/passport");
const { createQuizRoutes, createQuizAdminRoutes } = require("./routes/quizRoutes");
const { createProfileRoutes } = require("./routes/profileRoutes");
const { steamIdOf } = require("./services/userStore");

fs.mkdirSync(config.runtimeDataDir, { recursive: true });
fs.mkdirSync(path.join(config.runtimeDataDir, "quiz-pools"), { recursive: true });
fs.mkdirSync(path.join(config.runtimeDataDir, "quiz-images"), { recursive: true });
fs.mkdirSync(path.join(config.runtimeDataDir, "users"), { recursive: true });

const app = express();
if (config.trustProxy) app.set("trust proxy", 1);

app.use(
    session({
        name: "quiquiz.sid",
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.COOKIE_SECURE === "1",
            maxAge: 30 * 24 * 60 * 60 * 1000
        }
    })
);

installPassport();
app.use(passport.initialize());
app.use(passport.session());

function authRedirectTarget(req, status) {
    const returnTo = String(req.session?.authReturnTo || "profil");
    delete req.session.authReturnTo;
    delete req.session.linkUserId;
    const flash = status || req.session?.authFlash || "ok";
    delete req.session.authFlash;
    if (returnTo === "admin") {
        return `/admin/?auth=${encodeURIComponent(flash)}`;
    }
    return `/#profil?auth=${encodeURIComponent(flash)}`;
}

function beginAuth(req, returnToDefault) {
    const returnTo = String(req.query.returnTo || returnToDefault || "profil").slice(0, 40);
    req.session.authReturnTo = returnTo === "admin" ? "admin" : "profil";
    req.session.linkUserId = req.user && req.user.id ? String(req.user.id) : null;
    req.session.authFlash = null;
}

app.get("/admin/session", (req, res) => {
    const userId = req.user && req.user.id != null ? String(req.user.id) : "";
    const legacySteam = req.user && req.user.steamId != null ? String(req.user.steamId) : "";
    const steamId = (userId ? steamIdOf(userId) : "") || legacySteam;
    res.json({
        isAdmin: Boolean(steamId && config.adminSteamIds.includes(steamId)),
        steamId: steamId || null,
        userId: userId || null
    });
});

app.get("/auth/steam", (req, res, next) => {
    if (!isSteamAuthConfigured()) {
        res.status(503).json({ error: "steam_auth_disabled" });
        return;
    }
    beginAuth(req, "profil");
    req.session.save((err) => {
        if (err) return next(err);
        passport.authenticate("steam")(req, res, next);
    });
});

app.get(
    "/auth/steam/return",
    (req, res, next) => {
        if (!isSteamAuthConfigured()) {
            res.redirect(authRedirectTarget(req, "failed"));
            return;
        }
        passport.authenticate("steam", {
            failureRedirect: "/auth/failed?provider=steam"
        })(req, res, next);
    },
    (req, res) => {
        res.redirect(authRedirectTarget(req));
    }
);

app.get("/auth/google", (req, res, next) => {
    if (!isGoogleAuthConfigured()) {
        res.status(503).json({ error: "google_auth_disabled" });
        return;
    }
    beginAuth(req, "profil");
    req.session.save((err) => {
        if (err) return next(err);
        passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
    });
});

app.get(
    "/auth/google/callback",
    (req, res, next) => {
        if (!isGoogleAuthConfigured()) {
            res.redirect(authRedirectTarget(req, "failed"));
            return;
        }
        passport.authenticate("google", {
            failureRedirect: "/auth/failed?provider=google"
        })(req, res, next);
    },
    (req, res) => {
        res.redirect(authRedirectTarget(req));
    }
);

app.get("/auth/failed", (req, res) => {
    const status = req.session?.authFlash === "conflict" ? "conflict" : "failed";
    res.redirect(authRedirectTarget(req, status));
});

app.post("/auth/logout", (req, res) => {
    req.logout(() => {
        req.session.destroy(() => {
            res.clearCookie("quiquiz.sid");
            res.json({ ok: true });
        });
    });
});

app.get("/auth/providers", (_req, res) => {
    res.json({
        steam: isSteamAuthConfigured(),
        google: isGoogleAuthConfigured()
    });
});

app.use("/api", createProfileRoutes());
app.use("/api", createQuizRoutes());
app.use("/api/admin/photos", createQuizAdminRoutes());

app.use(express.static(config.publicRoot, { extensions: ["html"] }));

app.get("/admin", (req, res) => {
    res.sendFile(path.join(config.publicRoot, "admin", "index.html"));
});

const server = app.listen(config.port, () => {
    console.log(`[quiquiz] http://localhost:${config.port}/`);
    console.log(`[quiquiz] admin http://localhost:${config.port}/admin/`);
});
server.on("error", (error) => {
    console.error(`[quiquiz] listen failed: ${error.code || error.message}`);
    process.exit(1);
});
