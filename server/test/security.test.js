const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const express = require("express");
const sharp = require("sharp");

const runtime = fs.mkdtempSync(path.join(os.tmpdir(), "quiquiz-sec-"));
process.env.RUNTIME_DATA_DIR = runtime;
process.env.SESSION_SECRET = "test-only-session-secret";
process.env.NODE_ENV = "test";

const { assessUrl, fetchAllowlisted, isBlockedIp, reencodeRaster } = require("../services/safeImageFetch");
const { issueImageGrant, recordedCorrectAnswer, takeImageGrant } = require("../services/imageGrant");
const { confirmImage } = require("../services/quizPoolService");
const { createQuizRoutes } = require("../routes/quizRoutes");
const { securityHeaders } = require("../http/securityHeaders");
const { quietErrorHandler } = require("../http/errorHandler");
const { createRateLimit } = require("../http/rateLimit");
const { removeAuditProbes, AUDIT_TITLE, REPORT_TITLE } = require("../services/auditProbeCleanup");

function listen(app) {
    return new Promise((resolve) => {
        const server = http.createServer(app);
        server.listen(0, "127.0.0.1", () => resolve(server));
    });
}

function close(server) {
    return new Promise((resolve) => server.close(resolve));
}

test("blocks loopback, private, and link-local addresses", () => {
    for (const ip of [
        "127.0.0.1",
        "0.0.0.0",
        "10.1.2.3",
        "172.16.0.1",
        "172.31.255.255",
        "192.168.1.20",
        "169.254.169.254",
        "100.64.1.1",
        "255.255.255.255",
        "::1",
        "fe80::1",
        "fc00::1",
        "fd00:ec2::254",
        "::ffff:127.0.0.1",
        "::ffff:10.0.0.1",
        "2002:7f00:1::",
        "2001:db8::1"
    ]) {
        assert.equal(isBlockedIp(ip), true, ip);
    }
    assert.equal(isBlockedIp("8.8.8.8"), false);
    assert.equal(isBlockedIp("1.1.1.1"), false);
});

test("accepts only https urls on the image host allowlist", () => {
    assert.equal(assessUrl("http://upload.wikimedia.org/a.jpg"), null);
    assert.equal(assessUrl("https://127.0.0.1/a.jpg"), null);
    assert.equal(assessUrl("https://user:pass@upload.wikimedia.org/a.jpg"), null);
    assert.equal(assessUrl("https://upload.wikimedia.org:4443/a.jpg"), null);
    assert.equal(assessUrl("https://evil.example/a.jpg"), null);
    assert.ok(assessUrl("https://upload.wikimedia.org/wikipedia/commons/a.jpg"));
    assert.ok(assessUrl("https://flagcdn.com/w1280/fr.png"));
});

test("does not follow a redirect off the allowlist or onto a private address", async () => {
    let calls = 0;
    await assert.rejects(
        () =>
            fetchAllowlisted("https://upload.wikimedia.org/a.jpg", {
                resolve: async () => [{ address: "1.1.1.1", family: 4 }],
                request: async () => {
                    calls += 1;
                    return {
                        status: 302,
                        headers: { location: "http://127.0.0.1/secret" },
                        body: Buffer.alloc(0)
                    };
                }
            }),
        /url/
    );
    assert.equal(calls, 1);

    calls = 0;
    await assert.rejects(
        () =>
            fetchAllowlisted("https://upload.wikimedia.org/a.jpg", {
                resolve: async (hostname) => {
                    if (calls > 0) return [{ address: "10.0.0.8", family: 4 }];
                    return [{ address: "1.1.1.1", family: 4 }];
                },
                request: async () => {
                    calls += 1;
                    return {
                        status: 302,
                        headers: { location: "https://commons.wikimedia.org/next.jpg" },
                        body: Buffer.alloc(0)
                    };
                }
            }),
        /address/
    );
    assert.equal(calls, 1);
});

test("re-encodes a png and drops trailing bytes", async () => {
    const png = await sharp({
        create: { width: 2, height: 2, channels: 3, background: { r: 10, g: 20, b: 30 } }
    })
        .png()
        .toBuffer();
    const dirty = Buffer.concat([png, Buffer.from("PROBE-TEXT-NOT-AN-IMAGE")]);
    const encoded = await reencodeRaster(dirty);
    assert.equal(encoded.ext, "png");
    assert.equal(encoded.buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(encoded.buffer.includes(Buffer.from("PROBE-TEXT-NOT-AN-IMAGE")), false);
    await assert.rejects(() => reencodeRaster(Buffer.from("<html><script>alert(1)</script></html>")), /not-image/);
});

test("issues a grant only after a recorded correct answer", () => {
    assert.equal(recordedCorrectAnswer("Turdus merula", "Merle noir"), true);
    assert.equal(recordedCorrectAnswer("Turdus merula", "Mésange bleue"), false);
    assert.equal(recordedCorrectAnswer("Italy", "Italie"), true);

    const bad = issueImageGrant({
        name: "Turdus merula",
        title: "File:Example.jpg",
        answer: "Corneille noire"
    });
    assert.equal(bad.ok, false);

    const issued = issueImageGrant({
        name: "Turdus merula",
        title: "File:Example.jpg",
        answer: "Merle noir"
    });
    assert.equal(issued.ok, true);
    const expected = { name: "Turdus merula", title: "File:Example.jpg" };
    assert.equal(takeImageGrant(issued.token, expected).ok, true);
    assert.equal(takeImageGrant(issued.token, expected).ok, false);

    const expired = issueImageGrant({
        name: "Turdus merula",
        title: "File:Other.jpg",
        answer: "Merle noir",
        ttlMs: -1000
    });
    assert.equal(takeImageGrant(expired.token, { name: "Turdus merula", title: "File:Other.jpg" }).ok, false);
});

test("confirm-image ignores a caller url when the token is missing", async () => {
    let hit = false;
    const trap = http.createServer((req, res) => {
        hit = true;
        res.end("no");
    });
    await new Promise((resolve) => trap.listen(0, "127.0.0.1", resolve));
    const port = trap.address().port;
    try {
        const result = await confirmImage({
            name: "Turdus merula",
            title: "File:Example.jpg",
            url: `http://127.0.0.1:${port}/secret`,
            token: "not-a-token",
            ip: "203.0.113.10"
        });
        assert.equal(result.ok, false);
        assert.equal(result.error, "token");
        assert.equal(hit, false);
    } finally {
        await close(trap);
    }
});

test("a commons file url on a loopback host is not fetched", async () => {
    let sockets = 0;
    const trap = http.createServer((req, res) => {
        sockets += 1;
        res.end("no");
    });
    await new Promise((resolve) => trap.listen(0, "127.0.0.1", resolve));
    const previous = global.fetch;
    global.fetch = async () =>
        new Response(
            JSON.stringify({
                query: {
                    pages: {
                        1: {
                            title: "File:Loop.jpg",
                            imageinfo: [
                                {
                                    url: "https://127.0.0.1/secret.jpg",
                                    mime: "image/jpeg",
                                    size: 128
                                }
                            ]
                        }
                    }
                }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
        );
    try {
        const issued = issueImageGrant({
            name: "Turdus merula",
            title: "File:Loop.jpg",
            answer: "Merle noir"
        });
        assert.equal(issued.ok, true);
        const result = await confirmImage({
            name: "Turdus merula",
            title: "File:Loop.jpg",
            token: issued.token,
            ip: "203.0.113.11"
        });
        assert.equal(result.ok, false);
        assert.equal(result.error, "download");
        assert.equal(sockets, 0);
    } finally {
        global.fetch = previous;
        await close(trap);
    }
});

test("reports and blocked titles require a player session", async () => {
    const app = express();
    app.use("/api", createQuizRoutes());
    const server = await listen(app);
    try {
        const port = server.address().port;
        const report = await fetch(`http://127.0.0.1:${port}/api/reports`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: "Turdus merula", title: "File:Example.jpg" })
        });
        assert.equal(report.status, 401);
        const blocked = await fetch(`http://127.0.0.1:${port}/api/blocked-titles`);
        assert.equal(blocked.status, 401);
    } finally {
        await close(server);
    }
});

test("error responses omit stacks and the powered-by header", async () => {
    process.env.NODE_ENV = "";
    const app = express();
    app.disable("x-powered-by");
    app.set("trust proxy", 1);
    app.use(securityHeaders);
    app.get("/boom", () => {
        throw new Error("marker-/var/www/quiquiz");
    });
    app.use(quietErrorHandler);
    const server = await listen(app);
    try {
        const port = server.address().port;
        const res = await fetch(`http://127.0.0.1:${port}/boom`, {
            headers: { "x-forwarded-proto": "https" }
        });
        const body = await res.text();
        assert.equal(res.status, 500);
        assert.equal(res.headers.get("x-powered-by"), null);
        assert.equal(res.headers.get("x-content-type-options"), "nosniff");
        assert.equal(res.headers.get("x-frame-options"), "DENY");
        assert.equal(res.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
        assert.match(res.headers.get("permissions-policy") || "", /camera=\(\)/);
        assert.match(res.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
        assert.match(res.headers.get("strict-transport-security") || "", /max-age=/);
        assert.equal(body.includes("/var/www/quiquiz"), false);
        assert.equal(body.includes("marker-"), false);
        assert.equal(body.includes("node_modules"), false);
    } finally {
        await close(server);
    }
});

test("rate limit eventually answers 429", async () => {
    const app = express();
    app.use(createRateLimit({ windowMs: 60_000, max: 2 }));
    app.get("/", (_req, res) => res.json({ ok: true }));
    const server = await listen(app);
    try {
        const port = server.address().port;
        const url = `http://127.0.0.1:${port}/`;
        assert.equal((await fetch(url)).status, 200);
        assert.equal((await fetch(url)).status, 200);
        assert.equal((await fetch(url)).status, 429);
    } finally {
        await close(server);
    }
});

test("audit probes are blacklisted and removed from disk", () => {
    const images = path.join(runtime, "quiz-images", "merle-noir");
    fs.mkdirSync(images, { recursive: true });
    const media = path.join(images, "9e1b9832a42fa595.png");
    fs.writeFileSync(media, Buffer.from("not-a-real-image"));
    fs.writeFileSync(
        path.join(runtime, "quiz-validated.json"),
        JSON.stringify({
            "Merle noir": [
                {
                    title: AUDIT_TITLE,
                    local: "merle-noir/9e1b9832a42fa595.png",
                    sourceUrl: "",
                    savedAt: 1
                }
            ]
        })
    );
    fs.writeFileSync(
        path.join(runtime, "quiz-reports.json"),
        JSON.stringify({
            items: [{ title: REPORT_TITLE, name: "Merle noir", url: "", savedAt: 1 }]
        })
    );
    const result = removeAuditProbes();
    assert.equal(result.ok, true);
    assert.equal(fs.existsSync(media), false);
    const reports = JSON.parse(fs.readFileSync(path.join(runtime, "quiz-reports.json"), "utf8"));
    assert.equal(
        reports.items.some((item) => item.title === REPORT_TITLE),
        false
    );
    const blacklist = JSON.parse(fs.readFileSync(path.join(runtime, "quiz-blacklist.json"), "utf8"));
    assert.equal(
        blacklist.some((item) => item.title === AUDIT_TITLE),
        true
    );
});
