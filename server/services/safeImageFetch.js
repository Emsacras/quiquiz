/**
 * Téléchargement d'image : HTTPS, hôtes autorisés, IP publique après DNS, redirection manuelle.
 */
const dns = require("dns").promises;
const https = require("https");
const net = require("net");
const sharp = require("sharp");

const USER_AGENT = "QuiQuiz/1.0 (educational species quiz; https://quiquiz.fr)";
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
const MAX_REDIRECTS = 3;

const ALLOWED_HOSTS = new Set(["upload.wikimedia.org", "commons.wikimedia.org", "flagcdn.com"]);

function isBlockedV4(ip) {
    const parts = String(ip)
        .split(".")
        .map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return true;
    }
    const [a, b, c] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
    return false;
}

function ipv4FromParts(hi, lo) {
    if (!Number.isInteger(hi) || !Number.isInteger(lo)) return "";
    return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join(".");
}

function isBlockedIp(ip) {
    let value = String(ip || "")
        .trim()
        .toLowerCase()
        .replace(/^\[|\]$/g, "");
    if (!value) return true;
    if (value.includes("%")) value = value.split("%")[0];
    if (net.isIPv4(value)) return isBlockedV4(value);

    const dotted = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isBlockedV4(dotted[1]);

    const hexMapped = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) {
        const v4 = ipv4FromParts(parseInt(hexMapped[1], 16), parseInt(hexMapped[2], 16));
        return v4 ? isBlockedV4(v4) : true;
    }

    if (value === "::1" || value === "::") return true;
    const head = parseInt((value.split(":")[0] || "0").padStart(4, "0").slice(0, 4), 16);
    if (Number.isNaN(head)) return true;
    if (head >= 0xfc00 && head <= 0xfdff) return true;
    if (head >= 0xfe80 && head <= 0xfebf) return true;
    if (head >= 0xff00) return true;

    if (value === "2001:db8" || value.startsWith("2001:db8:") || value.startsWith("2001:0db8:")) return true;

    if (value.startsWith("2002:")) {
        const parts = value.split(":");
        const v4 = ipv4FromParts(parseInt(parts[1] || "", 16), parseInt(parts[2] || "", 16));
        if (v4 && isBlockedV4(v4)) return true;
    }

    if (value.startsWith("64:ff9b:")) {
        const parts = value.split(":").filter(Boolean);
        const tail = parts.slice(-2);
        const v4 = ipv4FromParts(parseInt(tail[0] || "", 16), parseInt(tail[1] || "", 16));
        if (v4 && isBlockedV4(v4)) return true;
    }

    return false;
}

function assessUrl(raw) {
    let url;
    try {
        url = new URL(String(raw));
    } catch {
        return null;
    }
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (url.port && url.port !== "443") return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!ALLOWED_HOSTS.has(host)) return null;
    if (net.isIP(host)) return null;
    return url;
}

function headerValue(headers, name) {
    const value = headers ? headers[name] || headers[name.toLowerCase()] : "";
    if (Array.isArray(value)) return String(value[0] || "");
    return String(value || "");
}

async function defaultResolve(hostname) {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => ({ address: record.address, family: record.family }));
}

function defaultRequest(url, address, family) {
    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                protocol: "https:",
                hostname: url.hostname,
                servername: url.hostname,
                port: 443,
                method: "GET",
                path: `${url.pathname}${url.search}`,
                headers: {
                    Host: url.host,
                    "User-Agent": USER_AGENT,
                    Accept: "image/jpeg,image/png"
                },
                lookup(_hostname, _options, callback) {
                    callback(null, address, family);
                },
                timeout: 12_000
            },
            (res) => {
                const chunks = [];
                let total = 0;
                let failed = false;
                res.on("data", (chunk) => {
                    if (failed) return;
                    total += chunk.length;
                    if (total > MAX_BYTES) {
                        failed = true;
                        res.destroy();
                        reject(new Error("size"));
                        return;
                    }
                    chunks.push(chunk);
                });
                res.on("end", () => {
                    if (failed) return;
                    resolve({
                        status: res.statusCode || 0,
                        headers: res.headers || {},
                        body: Buffer.concat(chunks)
                    });
                });
                res.on("error", (error) => {
                    if (!failed) reject(error);
                });
            }
        );
        req.on("timeout", () => {
            req.destroy();
            reject(new Error("timeout"));
        });
        req.on("error", reject);
        req.end();
    });
}

async function fetchAllowlisted(rawUrl, deps = {}, hops = 0) {
    if (hops > MAX_REDIRECTS) throw new Error("redirect");
    const url = assessUrl(rawUrl);
    if (!url) throw new Error("url");
    const resolve = deps.resolve || defaultResolve;
    let records;
    try {
        records = await resolve(url.hostname);
    } catch {
        throw new Error("dns");
    }
    if (!Array.isArray(records) || !records.length) throw new Error("dns");
    if (records.some((record) => isBlockedIp(record.address))) throw new Error("address");
    const chosen = records[0];
    const request = deps.request || defaultRequest;
    const response = await request(url, chosen.address, chosen.family || (net.isIPv4(chosen.address) ? 4 : 6));
    const status = Number(response.status) || 0;
    if (status >= 300 && status < 400) {
        const location = headerValue(response.headers, "location");
        if (!location) throw new Error("redirect");
        let next;
        try {
            next = new URL(location, url).toString();
        } catch {
            throw new Error("redirect");
        }
        return fetchAllowlisted(next, deps, hops + 1);
    }
    if (status !== 200) throw new Error("download");
    const body = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body || []);
    if (!body.length || body.length > MAX_BYTES) throw new Error("size");
    return { body };
}

async function reencodeRaster(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 24 || buffer.length > MAX_BYTES) {
        throw new Error("not-image");
    }
    let meta;
    try {
        meta = await sharp(buffer, {
            limitInputPixels: MAX_PIXELS,
            animated: false,
            pages: 1,
            failOn: "error"
        }).metadata();
    } catch {
        throw new Error("not-image");
    }
    const width = Number(meta.width) || 0;
    const height = Number(meta.height) || 0;
    if (!width || !height || width * height > MAX_PIXELS) throw new Error("image");
    try {
        if (meta.format === "jpeg") {
            const out = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: "error" })
                .rotate()
                .jpeg({ quality: 85, mozjpeg: false })
                .toBuffer();
            return { buffer: out, ext: "jpg" };
        }
        if (meta.format === "png") {
            const out = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: "error" })
                .rotate()
                .png({ compressionLevel: 9 })
                .toBuffer();
            return { buffer: out, ext: "png" };
        }
    } catch {
        throw new Error("not-image");
    }
    throw new Error("not-image");
}

module.exports = {
    ALLOWED_HOSTS,
    assessUrl,
    fetchAllowlisted,
    isBlockedIp,
    reencodeRaster
};
