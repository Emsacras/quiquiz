/**
 * QuiQuiz — quiz photo autonome (frontend statique + API bassin/admin Steam).
 */
const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const { config, isSteamAuthConfigured } = require("./config");
const { passport, installSteamStrategy } = require("./auth/steamPassport");
const { createQuizRoutes, createQuizAdminRoutes } = require("./routes/quizRoutes");

fs.mkdirSync(config.runtimeDataDir, { recursive: true });
fs.mkdirSync(path.join(config.runtimeDataDir, "quiz-pools"), { recursive: true });
fs.mkdirSync(path.join(config.runtimeDataDir, "quiz-images"), { recursive: true });

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

installSteamStrategy();
app.use(passport.initialize());
app.use(passport.session());

app.get("/admin/session", (req, res) => {
    const steamId = req.user && req.user.steamId != null ? String(req.user.steamId) : "";
    res.json({
        isAdmin: Boolean(steamId && config.adminSteamIds.includes(steamId)),
        steamId: steamId || null
    });
});

app.get("/auth/steam", (req, res, next) => {
    if (!isSteamAuthConfigured()) {
        res.status(503).json({ error: "steam_auth_disabled" });
        return;
    }
    passport.authenticate("steam")(req, res, next);
});

app.get(
    "/auth/steam/return",
    (req, res, next) => {
        if (!isSteamAuthConfigured()) {
            res.redirect("/admin/?auth=failed");
            return;
        }
        passport.authenticate("steam", { failureRedirect: "/admin/?auth=failed" })(req, res, next);
    },
    (req, res) => {
        res.redirect("/admin/?auth=ok");
    }
);

app.post("/auth/logout", (req, res) => {
    req.logout(() => {
        req.session.destroy(() => {
            res.clearCookie("quiquiz.sid");
            res.json({ ok: true });
        });
    });
});

app.use("/api", createQuizRoutes());
app.use("/api/admin/photos", createQuizAdminRoutes());

app.use(express.static(config.publicRoot, { extensions: ["html"] }));

app.get("/admin", (req, res) => {
    res.sendFile(path.join(config.publicRoot, "admin", "index.html"));
});

app.listen(config.port, () => {
    console.log(`[quiquiz] http://localhost:${config.port}/`);
    console.log(`[quiquiz] admin http://localhost:${config.port}/admin/`);
});
