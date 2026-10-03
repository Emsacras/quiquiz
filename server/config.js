const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ROOT = path.join(__dirname, "..");

const config = {
    port: Number(process.env.PORT) || 4789,
    publicRoot: path.join(ROOT, "public"),
    runtimeDataDir: process.env.RUNTIME_DATA_DIR || path.join(ROOT, "data-runtime"),
    sessionSecret: process.env.SESSION_SECRET || "change-me-quiquiz-session-secret",
    trustProxy: String(process.env.TRUST_PROXY || "1") === "1",
    adminSteamIds: (() => {
        const raw = process.env.ADMIN_STEAM_IDS || "76561198269405845";
        return raw
            .split(",")
            .map((s) => String(s).trim())
            .filter((s) => /^\d{5,20}$/.test(s));
    })(),
    steam: {
        apiKey: process.env.STEAM_WEB_API_KEY || "",
        returnUrl: process.env.STEAM_RETURN_URL || "http://localhost:4789/auth/steam/return",
        realm: process.env.STEAM_REALM || "http://localhost:4789/"
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
        callbackUrl: process.env.GOOGLE_CALLBACK_URL || "http://localhost:4789/auth/google/callback"
    }
};

function isSteamAuthConfigured() {
    return Boolean(config.steam.apiKey && config.steam.returnUrl && config.steam.realm);
}

function isGoogleAuthConfigured() {
    return Boolean(config.google.clientId && config.google.clientSecret && config.google.callbackUrl);
}

module.exports = { config, isSteamAuthConfigured, isGoogleAuthConfigured };
