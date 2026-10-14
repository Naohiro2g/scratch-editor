import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {createServer, request} from 'node:http';
import {once} from 'node:events';
import {browserCommands, createLocalServer, validateTarget} from './launcher.mjs';

test('target accepts loopback/LAN hostnames and rejects URLs, lists and invalid ports', () => {
    for (const host of ['127.0.0.1', '192.168.1.2', 'minecraft.local', '::1']) {
        assert.deepEqual(validateTarget({host, port: 25575}), {host, port: 25575});
    }
    for (const host of ['', 'http://localhost', 'server,other', 'a\nb', '-host', 'a/b']) {
        assert.throws(() => validateTarget({host, port: 25575}));
    }
    for (const port of [0, 65536, 1.5, '25575']) {
        assert.throws(() => validateTarget({host: 'localhost', port}));
    }
    assert.throws(() => validateTarget({host: 'localhost', port: 25575, token: 'secret'}));
});

const setup = async t => {
    const root = await mkdtemp(join(tmpdir(), 'scratch-local-'));
    t.after(() => rm(root, {recursive: true, force: true}));
    await mkdir(join(root, 'data/scratch'), {recursive: true});
    await mkdir(join(root, 'data/wirescope/assets'), {recursive: true});
    await writeFile(join(root, 'data/wirescope/index.html'), '<h1>WireScope</h1>');
    await writeFile(join(root, 'data/wirescope/assets/app.js'), 'console.log("WireScope");');
    await writeFile(join(root, 'data/scratch/index.html'), '<h1>Scratch</h1>');
    await writeFile(join(root, 'data/scratch/worker.js'), 'self.onmessage = () => {};');
    await writeFile(join(root, 'data/identity.json'), JSON.stringify({version: '2320.0.0b10'}));
    const calls = [];
    const server = await createLocalServer({
        root,
        webPort: 0,
        bridgePort: 8602,
        wireScopePort: 0,
        startBridge: async target => {
            calls.push(target);
            return async () => {};
        }
    });
    t.after(() => server.close());
    return {root, server, calls, url: server.url};
};

test('serves editor and runtime settings on loopback and preserves pairing storage origin', async t => {
    const {url} = await setup(t);
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
    const editor = await fetch(`${url}/editor/`);
    assert.equal(await editor.text(), '<h1>Scratch</h1>');
    const worker = await fetch(`${url}/editor/worker.js`);
    assert.match(worker.headers.get('content-type'), /javascript/);
    const r = await fetch(`${url}/editor/mc-remote-runtime-config.json`);
    const config = await r.json();
    assert.equal(config.bridge_url, 'ws://127.0.0.1:8602');
    assert.equal(config.default_sandbox, '127.0.0.1');
    assert.equal(config.connection_enabled, true);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal((await fetch(`${url}/identity.json`)).status, 200);
    assert.equal((await (await fetch(`${url}/target`)).json()).saved, false);
});

test('changing target updates both Bridge and editor and persists only host/port', async t => {
    const {url, root, calls} = await setup(t);
    const r = await fetch(`${url}/target`, {
        method: 'POST',
        headers: {'Origin': url, 'Content-Type': 'application/json'},
        body: JSON.stringify({host: 'minecraft.local', port: 25576})
    });
    assert.equal(r.status, 200);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.at(-1), {host: 'minecraft.local', port: 25576});
    assert.deepEqual(JSON.parse(await readFile(join(root, 'settings.json'))), calls.at(-1));
    assert.equal((await (await fetch(`${url}/target`)).json()).saved, true);
    const config = await (await fetch(`${url}/editor/mc-remote-runtime-config.json`)).json();
    assert.equal(config.default_sandbox, 'minecraft.local');
});

test('first launch opens setup, and saved settings open setup followed by the editor with McRemote', async t => {
    const {url, root, server} = await setup(t);
    assert.deepEqual(server.openUrls, [url]);
    await server.close();
    await writeFile(join(root, 'settings.json'), JSON.stringify({host: 'minecraft.local', port: 25576}));
    const restarted = await createLocalServer({
        root,
        webPort: 0,
        bridgePort: 8602,
        wireScopePort: 0,
        startBridge: async () => async () => {}
    });
    t.after(() => restarted.close());
    assert.deepEqual(restarted.openUrls, [
        `${restarted.url}/?scratch=opening`, `${restarted.url}/editor/?extension=mcremote`
    ]);
    assert.equal((await (await fetch(`${restarted.url}/target`)).json()).port, 25576);
});

test('opens each URL through the OS browser handler in order', () => {
    const urls = ['http://127.0.0.1:8601/', 'http://127.0.0.1:8601/editor/?extension=mcremote'];
    assert.deepEqual(browserCommands('darwin', urls), [['open', urls]]);
    assert.deepEqual(browserCommands('win32', urls), urls.map(url => [
        'cmd.exe', ['/d', '/c', `start "" "${url}"`]
    ]));
    assert.deepEqual(browserCommands('linux', urls), urls.map(url => ['xdg-open', [url]]));
});

test('serves setup and editor tab helpers without exposing the application directory', async t => {
    const {url} = await setup(t);
    for (const name of ['setup.mjs', 'editor-tab.mjs']) {
        const response = await fetch(`${url}/${name}`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /javascript/);
    }
    for (const name of ['extension-card.png', 'connect-block.png']) {
        const response = await fetch(`${url}/guide-images/${name}`);
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /image\/png/);
    }
    assert.equal((await fetch(`${url}/launcher.mjs`)).status, 404);
    assert.equal((await fetch(`${url}/guide-images/launcher.mjs`)).status, 404);
});

test('serves WireScope at a distinct loopback origin and exposes its URL to Scratch', async t => {
    const {url, server} = await setup(t);
    const config = await (await fetch(`${url}/editor/mc-remote-runtime-config.json`)).json();
    const wireScope = new URL(config.wirescope_url);
    assert.equal(wireScope.protocol, 'http:');
    assert.equal(wireScope.hostname, '127.0.0.1');
    assert.notEqual(wireScope.origin, new URL(url).origin);
    const page = await fetch(wireScope);
    assert.equal(await page.text(), '<h1>WireScope</h1>');
    assert.equal(page.headers.get('cross-origin-opener-policy'), null);
    const asset = await fetch(new URL('/assets/app.js', wireScope));
    assert.match(asset.headers.get('content-type'), /javascript/);
    assert.equal(await asset.text(), 'console.log("WireScope");');
    assert.equal((await fetch(new URL('/settings.json', wireScope))).status, 404);
    assert.equal((await fetch(new URL('/editor/', wireScope))).status, 404);
    assert.equal((await fetch(wireScope, {method: 'POST'})).status, 405);
    const rejectedHost = await new Promise((resolve, reject) => {
        request(wireScope, {headers: {Host: 'other.example'}}, response => {
            response.resume();
            resolve(response.statusCode);
        })
            .on('error', reject)
            .end();
    });
    assert.equal(rejectedHost, 403);
    assert.equal((await fetch(`${wireScope.origin}/..%2fidentity.json`)).status, 404);
    await server.close();
    const probe = createServer();
    probe.listen(Number(wireScope.port), '127.0.0.1');
    await once(probe, 'listening');
    await new Promise(resolveClose => probe.close(resolveClose));
});

test('occupied WireScope port aborts startup, releases Scratch and preserves existing service', async t => {
    const {root, url, server} = await setup(t);
    await server.close();
    const occupied = createServer((incoming, response) => response.end('existing service'));
    occupied.listen(0, '127.0.0.1');
    await once(occupied, 'listening');
    t.after(() => new Promise(resolveClose => occupied.close(resolveClose)));
    await assert.rejects(createLocalServer({
        root,
        webPort: Number(new URL(url).port),
        bridgePort: 8602,
        wireScopePort: occupied.address().port,
        startBridge: async () => assert.fail('Bridge must not start without WireScope')
    }), {code: 'EADDRINUSE'});
    const probe = createServer();
    probe.listen(Number(new URL(url).port), '127.0.0.1');
    await once(probe, 'listening');
    await new Promise(resolveClose => probe.close(resolveClose));
    assert.equal(await (await fetch(`http://127.0.0.1:${occupied.address().port}`)).text(), 'existing service');
});

test('refuses cross-origin writes, rebinding hosts, unknown fields and private files', async t => {
    const {url, calls} = await setup(t);
    const body = JSON.stringify({host: 'other.local', port: 25575});
    for (const origin of [null, 'https://other.example']) {
        const headers = {'Content-Type': 'application/json', ...(origin ? {Origin: origin} : {})};
        assert.equal((await fetch(`${url}/target`, {method: 'POST', headers, body})).status, 403);
    }
    const status = await new Promise((resolve, reject) => {
        request(url, {headers: {Host: 'other.example'}}, response => {
            response.resume();
            resolve(response.statusCode);
        })
            .on('error', reject)
            .end();
    });
    assert.equal(status, 403);
    assert.equal((await fetch(`${url}/settings.json`)).status, 404);
    assert.equal((await fetch(`${url}/editor/%2e%2e%2fsettings.json`)).status, 404);
    assert.equal(
        (
            await fetch(`${url}/target`, {
                method: 'POST',
                headers: {'Origin': url, 'Content-Type': 'application/json'},
                body: body.replace('25575}', '25575,"token":"x"}')
            })
        ).status,
        400
    );
    assert.equal(calls.length, 1);
});

test('restores target after restart and leaves broken user settings visible', async t => {
    const {root, server} = await setup(t);
    await server.close();
    await writeFile(join(root, 'settings.json'), '{bad json');
    await assert.rejects(
        createLocalServer({root, webPort: 0, bridgePort: 8602, startBridge: async () => async () => {}}),
        /settings.json/
    );
});

test('stops the replacement Bridge when shutdown occurs during a target change', async t => {
    const {root, server} = await setup(t);
    await server.close();
    let releaseStart;
    let changed;
    const starting = new Promise(resolve => {
        changed = resolve;
    });
    const release = new Promise(resolve => {
        releaseStart = resolve;
    });
    const stopped = [];
    const local = await createLocalServer({
        root,
        webPort: 0,
        bridgePort: 8602,
        wireScopePort: 0,
        startBridge: async target => {
            if (target.host === 'other.local') {
                changed();
                await release;
            }
            return async () => {
                stopped.push(target.host);
            };
        }
    });
    t.after(() => local.close());
    const update = fetch(`${local.url}/target`, {
        method: 'POST',
        headers: {'Origin': local.url, 'Content-Type': 'application/json'},
        body: JSON.stringify({host: 'other.local', port: 25575})
    });
    await starting;
    const shutdown = local.close();
    releaseStart();
    await shutdown;
    await update.catch(() => {});
    assert.deepEqual(stopped, ['127.0.0.1', 'other.local']);
});
