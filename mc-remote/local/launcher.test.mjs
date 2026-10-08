import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {request} from 'node:http';
import {createLocalServer, validateTarget} from './launcher.mjs';

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
    await mkdir(join(root, 'scratch'));
    await writeFile(join(root, 'scratch/index.html'), '<h1>Scratch</h1>');
    await writeFile(join(root, 'scratch/worker.js'), 'self.onmessage = () => {};');
    await writeFile(join(root, 'identity.json'), JSON.stringify({version: '2320.0.0b10'}));
    const calls = [];
    const server = await createLocalServer({
        root,
        webPort: 0,
        bridgePort: 8602,
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
    const config = await (await fetch(`${url}/editor/mc-remote-runtime-config.json`)).json();
    assert.equal(config.default_sandbox, 'minecraft.local');
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
