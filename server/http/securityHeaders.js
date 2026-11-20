const CSP = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https://upload.wikimedia.org https://commons.wikimedia.org https://flagcdn.com https://*.wikimedia.org https://*.wikipedia.org",
    "media-src 'self' https://upload.wikimedia.org https://commons.wikimedia.org https://*.wikimedia.org",
    "connect-src 'self' https://commons.wikimedia.org https://www.wikidata.org https://upload.wikimedia.org https://*.wikipedia.org https://fonts.googleapis.com https://fonts.gstatic.com",
    "worker-src 'self'",
    "manifest-src 'self'"
].join("; ");

function securityHeaders(req, res, next) {
    res.set("X-Content-Type-Options", "nosniff");
    res.set("X-Frame-Options", "DENY");
    res.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    res.set("Content-Security-Policy", CSP);
    if (req.secure) {
        res.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
}

module.exports = { securityHeaders, CSP };
