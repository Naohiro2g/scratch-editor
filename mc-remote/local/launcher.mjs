import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {access, readFile, realpath, rename, stat, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createConnection, createServer as createTcpServer} from 'node:net';
import {dirname, extname, join, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {once} from 'node:events';

const defaultTarget = {host: '127.0.0.1', port: 25575};
const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
};

export const validateTarget = target => {
    if (
        !target ||
        typeof target !== 'object' ||
        Array.isArray(target) ||
        Object.keys(target).some(key => !['host', 'port'].includes(key)) ||
        typeof target.host !== 'string' ||
        !/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|[a-f0-9]*:[a-f0-9:]+)$/i.test(target.host) ||
        target.host.length > 253 ||
        !Number.isInteger(target.port) ||
        target.port < 1 ||
        target.port > 65535
    ) {
        throw new Error('接続先はホスト名またはIPアドレス、ポートは1〜65535の整数を指定してください。');
    }
    return {host: target.host, port: target.port};
};

const readTarget = async root => {
    try {
        return validateTarget(JSON.parse(await readFile(join(root, 'settings.json'), 'utf8')));
    } catch (error) {
        if (error.code === 'ENOENT') return {...defaultTarget};
        throw new Error(`settings.jsonを読み取れません: ${error.message}`, {cause: error});
    }
};

const sendJson = (response, status, value) => {
    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify(value));
};

const serveFile = async (request, response, root, relative) => {
    let file;
    try {
        file = await realpath(resolve(root, decodeURIComponent(relative) || 'index.html'));
        if (!file.startsWith(`${root}${sep}`) || !(await stat(file)).isFile()) {
            return sendJson(response, 404, {error: '見つかりません。'});
        }
    } catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes(error.code) || error instanceof URIError) {
            return sendJson(response, 404, {error: '見つかりません。'});
        }
        throw error;
    }
    response.writeHead(200, {'Content-Type': mime[extname(file)] || 'application/octet-stream'});
    if (request.method === 'HEAD') return response.end();
    createReadStream(file)
        .on('error', error => response.destroy(error))
        .pipe(response);
};

export const createLocalServer = async ({root, webPort, bridgePort, wireScopePort, startBridge}) => {
    let target = await readTarget(root);
    let stopBridge;
    let changing = false;
    let changeComplete;
    let closed = false;
    let handle;
    const scratchRoot = await realpath(join(root, 'scratch'));
    const wireScopeRoot = await realpath(join(root, 'wirescope'));
    const page = await readFile(join(dirname(fileURLToPath(import.meta.url)), 'setup.html'));
    const server = createServer((request, response) => {
        handle(request, response).catch(error => {
            console.error(`Scratch Local: ${request.method} ${request.url}: ${error.message}`);
            if (response.headersSent) response.destroy(error);
            else sendJson(response, 500, {error: '処理に失敗しました。起動画面のエラーを確認してください。'});
        });
    });
    const wireScope = createServer((request, response) => {
        const port = wireScope.address().port;
        if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) {
            return sendJson(response, 403, {error: '接続元が不正です。'});
        }
        if (!['GET', 'HEAD'].includes(request.method)) {
            return sendJson(response, 405, {error: '対応していない操作です。'});
        }
        const pathname = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
        serveFile(request, response, wireScopeRoot, pathname.slice(1)).catch(error => {
            console.error(`Scratch Local WireScope: ${request.method} ${request.url}: ${error.message}`);
            if (response.headersSent) response.destroy(error);
            else sendJson(response, 500, {error: '処理に失敗しました。起動画面のエラーを確認してください。'});
        });
    });
    let url;
    let wireScopeUrl;
    handle = async (request, response) => {
        const port = server.address().port;
        const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
        if (!origins.includes(`http://${request.headers.host}`)) {
            return sendJson(response, 403, {error: '接続元が不正です。'});
        }
        const pathname = new URL(request.url, url).pathname;
        if (closed) return sendJson(response, 503, {error: '終了中です。'});
        if (request.method === 'POST' && pathname === '/target') {
            if (!origins.includes(request.headers.origin)) {
                return sendJson(response, 403, {error: '接続元が不正です。'});
            }
            if (request.headers['content-type'] !== 'application/json') {
                return sendJson(response, 415, {error: 'JSONで指定してください。'});
            }
            if (changing) return sendJson(response, 409, {error: '接続先を変更中です。'});
            let next;
            try {
                let body = '';
                for await (const chunk of request) {
                    body += chunk;
                    if (Buffer.byteLength(body) > 2048) {
                        return sendJson(response, 413, {error: '入力が長すぎます。'});
                    }
                }
                next = validateTarget(JSON.parse(body));
            } catch (error) {
                return sendJson(response, 400, {error: error.message});
            }
            changing = true;
            let finishChange;
            changeComplete = new Promise(resolveChange => {
                finishChange = resolveChange;
            });
            try {
                await stopBridge();
                stopBridge = await startBridge(next, origins);
                await writeFile(join(root, 'settings.json.tmp'), `${JSON.stringify(next, null, 2)}\n`, {
                    mode: 0o600
                });
                await rename(join(root, 'settings.json.tmp'), join(root, 'settings.json'));
                target = next;
                return sendJson(response, 200, target);
            } catch (error) {
                if (stopBridge) await stopBridge();
                stopBridge = await startBridge(target, origins);
                throw error;
            } finally {
                changing = false;
                finishChange();
                changeComplete = null;
            }
        }
        if (!['GET', 'HEAD'].includes(request.method)) {
            return sendJson(response, 405, {error: '対応していない操作です。'});
        }
        if (pathname === '/target') return sendJson(response, 200, target);
        if (pathname === '/identity.json') {
            return sendJson(response, 200, JSON.parse(await readFile(join(root, 'identity.json'))));
        }
        if (pathname === '/editor/mc-remote-runtime-config.json') {
            return sendJson(response, 200, {
                schema_version: 1,
                connection_enabled: true,
                bridge_url: `ws://127.0.0.1:${bridgePort}`,
                wirescope_url: wireScopeUrl,
                default_sandbox: target.host,
                connection_targets: [
                    {id: 'local', label: `Minecraft — ${target.host}`, sandbox: target.host}
                ],
                storage_persist_enabled: true
            });
        }
        if (pathname === '/') {
            response.writeHead(200, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store'
            });
            if (request.method === 'HEAD') return response.end();
            return response.end(page);
        }
        if (!pathname.startsWith('/editor/')) return sendJson(response, 404, {error: '見つかりません。'});
        return serveFile(request, response, scratchRoot, pathname.slice('/editor/'.length));
    };
    server.listen(webPort, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${server.address().port}`;
    const close = async () => {
        if (closed) return;
        closed = true;
        if (changeComplete) await changeComplete;
        if (stopBridge) await stopBridge();
        await Promise.all([server, wireScope].map(service => {
            if (!service.listening) return Promise.resolve();
            service.closeAllConnections();
            return new Promise(resolveClose => service.close(resolveClose));
        }));
    };
    try {
        wireScope.listen(wireScopePort, '127.0.0.1');
        await once(wireScope, 'listening');
        wireScopeUrl = `http://127.0.0.1:${wireScope.address().port}/`;
        stopBridge = await startBridge(target, [url, `http://localhost:${server.address().port}`]);
    } catch (error) {
        await close();
        throw error;
    }
    return {url, close};
};

export const runBridge = async ({root, port, target, origins, onExit}) => {
    const probe = createTcpServer();
    probe.listen(port, '127.0.0.1');
    await once(probe, 'listening');
    await new Promise(resolveClose => probe.close(resolveClose));
    const child = spawn(process.execPath, [join(root, 'bridge/dist/main.js')], {
        cwd: join(root, 'bridge'),
        stdio: ['ignore', 'inherit', 'inherit'],
        env: {
            ...process.env,
            BRIDGE_WS_HOST: '127.0.0.1',
            BRIDGE_WS_PORT: String(port),
            BRIDGE_ORIGIN_ALLOWLIST: origins.join(','),
            BRIDGE_SANDBOX_ALLOWLIST: target.host,
            BRIDGE_DEFAULT_SANDBOX: target.host,
            BRIDGE_SANDBOX_PORT: String(target.port)
        }
    });
    let stopped = false;
    let failed;
    child.on('error', error => {
        failed = error;
    });
    child.on('exit', (code, signal) => {
        if (!stopped) {
            failed = new Error(`Bridgeが停止しました（code=${code}, signal=${signal}）。`);
            onExit(failed);
        }
    });
    const stop = async () => {
        if (stopped) return;
        stopped = true;
        if (child.exitCode !== null || child.signalCode !== null || failed) return;
        const exit = once(child, 'exit');
        child.kill('SIGTERM');
        const force = setTimeout(() => child.kill('SIGKILL'), 2000);
        try {
            await exit;
        } finally {
            clearTimeout(force);
        }
    };
    try {
        for (let attempt = 0; attempt < 100; attempt++) {
            if (failed) throw failed;
            const ready = await new Promise(resolveReady => {
                const socket = createConnection({host: '127.0.0.1', port});
                socket.once('connect', () => {
                    socket.destroy();
                    resolveReady(true);
                });
                socket.once('error', () => {
                    socket.destroy();
                    resolveReady(false);
                });
            });
            if (ready) return stop;
            await new Promise(resolveWait => setTimeout(resolveWait, 50));
        }
        throw new Error('Bridgeの起動を確認できませんでした。');
    } catch (error) {
        await stop();
        throw error;
    }
};

const main = async () => {
    let local;
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const webPort = Number(process.env.MCREMOTE_LOCAL_WEB_PORT || 8601);
    const bridgePort = Number(process.env.MCREMOTE_LOCAL_BRIDGE_PORT || 8602);
    const wireScopePort = Number(process.env.MCREMOTE_LOCAL_WIRESCOPE_PORT || 8603);
    const ports = [webPort, bridgePort, wireScopePort];
    for (const port of ports) {
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error('localhostのポートは1〜65535の整数を指定してください。');
        }
    }
    if (new Set(ports).size !== ports.length) {
        throw new Error('Scratch、Bridge、WireScopeには別のポートを指定してください。');
    }
    await access(join(root, 'identity.json'));
    const server = await createLocalServer({
        root,
        webPort,
        bridgePort,
        wireScopePort,
        startBridge: (target, origins) =>
            runBridge({
                root,
                port: bridgePort,
                target,
                origins,
                onExit: error => {
                    console.error(`Scratch Local: ${error.message}`);
                    process.exitCode = 1;
                    if (local) {
                        void local
                            .close()
                            .catch(problem =>
                                console.error(`Scratch Local: 終了できません: ${problem.message}`)
                            );
                    }
                }
            })
    });
    local = server;
    console.log(`mc-remote Scratch: ${server.url}\n終了するには、この画面でCtrl+Cを押してください。`);
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, () => {
            void server
                .close()
                .catch(error => console.error(`Scratch Local: 終了できません: ${error.message}`));
        });
    }
    if (process.argv.includes('--open')) {
        const command =
            process.platform === 'win32' ?
                'explorer.exe' :
                process.platform === 'darwin' ?
                    'open' :
                    'xdg-open';
        const browser = spawn(command, [server.url], {stdio: 'ignore'});
        browser.on('error', error =>
            console.warn(
                `Scratch Local: ${command}: ${error.message}; ${server.url}をブラウザで開いてください。`
            )
        );
    }
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    main().catch(error => {
        console.error(`Scratch Local: 起動できません: ${error.message}`);
        process.exitCode = 1;
    });
}
