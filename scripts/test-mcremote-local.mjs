import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {basename, delimiter, join, resolve} from 'node:path';
import WebSocket from 'ws';

const [input] = process.argv.slice(2);
const archive = resolve(input);
const identity = JSON.parse(await readFile(archive.replace(/\.zip$/, '.artifact.json')));
assert.equal(identity.os, 'linux');
assert.equal(identity.arch, 'x64');
const bytes = await readFile(archive);
assert.equal(identity.bytes, bytes.length);
assert.equal(identity.sha256, createHash('sha256').update(bytes)
    .digest('hex'));
const directory = await mkdtemp(join(tmpdir(), 'scratch local-テスト-'));
const connections = new Set();
let child;
let socket;
const tcp = createServer(connection => {
    connections.add(connection);
    connection.on('close', () => connections.delete(connection));
    let buffer = '';
    connection.on('data', data => {
        buffer += data;
        if (buffer.includes('\n')) {
            const request = JSON.parse(buffer.trim());
            assert.equal(request.method, 'hello');
            assert.equal(request.params.protocol, '23.2.0');
            connection.write(
                `${JSON.stringify({
                    jsonrpc: '2.0',
                    id: request.id,
                    result: {protocol: '23.2.0', test: 'deterministic-stub'}
                })}\n`
            );
            buffer = '';
        }
    });
});
const unusedPort = async () => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise(resolveClose => probe.close(resolveClose));
    return port;
};
try {
    execFileSync('unzip', ['-q', archive, '-d', directory]);
    const root = join(directory, basename(archive, '.zip'));
    const bundleIdentity = JSON.parse(await readFile(join(root, 'identity.json')));
    assert.equal(bundleIdentity.version, '2320.0.0b10');
    const source = await readFile(join(root, bundleIdentity.source.archive));
    assert.equal(createHash('sha256').update(source)
        .digest('hex'), bundleIdentity.source.archive_sha256);
    tcp.listen(0, '127.0.0.1');
    await once(tcp, 'listening');
    const target = {host: '127.0.0.1', port: tcp.address().port};
    await writeFile(join(root, 'settings.json'), JSON.stringify(target));
    const webPort = await unusedPort();
    const bridgePort = await unusedPort();
    const wireScopePort = await unusedPort();
    const url = `http://127.0.0.1:${webPort}`;
    const testBin = join(directory, 'test-bin');
    const browserMarker = join(directory, 'browser-opened.txt');
    await mkdir(testBin);
    await writeFile(join(testBin, 'xdg-open'),
        '#!/bin/sh\nprintf "%s" "$1" > "$MCREMOTE_BROWSER_TEST_MARKER"\n', {mode: 0o755});
    child = spawn(join(root, 'start-mc-remote.sh'), [], {
        cwd: root,
        env: {
            ...process.env,
            PATH: `${testBin}${delimiter}${process.env.PATH}`,
            MCREMOTE_BROWSER_TEST_MARKER: browserMarker,
            MCREMOTE_LOCAL_WEB_PORT: String(webPort),
            MCREMOTE_LOCAL_BRIDGE_PORT: String(bridgePort),
            MCREMOTE_LOCAL_WIRESCOPE_PORT: String(wireScopePort)
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', data => {
        output += data;
    });
    child.stderr.on('data', data => {
        output += data;
    });
    const startup = new Promise((resolveReady, reject) => {
        const timer = setTimeout(() => reject(new Error(`Launcher timeout: ${output}`)), 10000);
        child.once('error', reject);
        child.once('exit', () => reject(new Error(`Launcher exited: ${output}`)));
        child.stdout.on('data', () => {
            if (output.includes(`mc-remote Scratch: ${url}`)) {
                clearTimeout(timer);
                resolveReady();
            }
        });
    });
    await startup;
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            assert.equal(await readFile(browserMarker, 'utf8'), url);
            break;
        } catch (error) {
            if (error.code !== 'ENOENT' || attempt === 99) throw error;
            await new Promise(resolveWait => setTimeout(resolveWait, 10));
        }
    }
    const page = await fetch(url);
    assert.match(await page.text(), /保存してScratchを開く/);
    assert.equal((await fetch(`${url}/editor/`)).status, 200);
    assert.equal((await fetch(`${url}/editor/gui.js`)).status, 200);
    const config = await (await fetch(`${url}/editor/mc-remote-runtime-config.json`)).json();
    assert.equal(config.connection_enabled, true);
    assert.equal(config.default_sandbox, target.host);
    assert.equal(config.wirescope_url, `http://127.0.0.1:${wireScopePort}/`);
    assert.notEqual(new URL(config.wirescope_url).origin, new URL(url).origin);
    const wireScopeManifest = JSON.parse(await readFile(join(root, 'wirescope-app.manifest.json')));
    const wireScopeArchive = await readFile(join(root, 'wirescope-app.zip'));
    assert.equal(createHash('sha256').update(wireScopeArchive)
        .digest('hex'), bundleIdentity.tooling.wirescope_archive_sha256);
    assert.equal(wireScopeManifest.archive.sha256, bundleIdentity.tooling.wirescope_archive_sha256);
    for (const asset of wireScopeManifest.assets) {
        const response = await fetch(new URL(asset.path, config.wirescope_url));
        assert.equal(response.status, 200);
        const data = Buffer.from(await response.arrayBuffer());
        assert.equal(data.length, asset.bytes);
        assert.equal(createHash('sha256').update(data)
            .digest('hex'), asset.sha256);
    }
    const wireScopePage = await fetch(config.wirescope_url);
    assert.match(await wireScopePage.text(), /WireScope/);
    assert.equal(wireScopePage.headers.get('cross-origin-opener-policy'), null);
    socket = new WebSocket(config.bridge_url, 'mcremote.bridge.one-shot.v1', {origin: url});
    await once(socket, 'open');
    const response = once(socket, 'message');
    socket.send(JSON.stringify({jsonrpc: '2.0', id: 1, method: 'hello', params: {protocol: '23.2.0'}}));
    assert.deepEqual(JSON.parse((await response)[0]), {
        jsonrpc: '2.0',
        id: 1,
        result: {protocol: '23.2.0', test: 'deterministic-stub'}
    });
    socket.close();
    await once(socket, 'close');
    const exit = once(child, 'exit');
    child.kill('SIGTERM');
    await exit;
    assert.equal(child.exitCode, 0);
    for (const port of [webPort, bridgePort, wireScopePort]) {
        const probe = createServer();
        probe.listen(port, '127.0.0.1');
        await once(probe, 'listening');
        await new Promise(resolveClose => probe.close(resolveClose));
    }
    console.log('Scratch Local Linux ZIP: hash/source, Japanese/spaced path, bundled Node startup PASS');
    console.log('HTTP GUI/config, distinct loopback WireScope/pinned assets, fixed Bridge WS→TCP PASS');
    console.log('Graceful exit and Scratch/Bridge/WireScope port release PASS');
    console.log('Minecraft/pairing/OS download warnings are not tested by this deterministic stub.');
} finally {
    if (socket) socket.terminate();
    if (child && child.exitCode === null) {
        child.kill('SIGKILL');
        await once(child, 'exit');
    }
    for (const connection of connections) connection.destroy();
    tcp.close();
    await rm(directory, {recursive: true, force: true});
}
