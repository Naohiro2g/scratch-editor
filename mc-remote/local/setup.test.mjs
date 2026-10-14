import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {test} from 'node:test';
import {JSDOM} from 'jsdom';
import {setupPage} from './setup.mjs';
import {trackEditor} from './editor-tab.mjs';

const page = await readFile(new URL('./setup.html', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));

const setup = async (t, {opening = false, blocked = false, failSave = false, saved = false} = {}) => {
    const listeners = new Set();
    class Channel {
        constructor () {
            listeners.add(this);
        }
        postMessage (data) {
            for (const listener of listeners) {
                if (listener !== this) queueMicrotask(() => listener.onmessage?.({data}));
            }
        }
        close () {
            listeners.delete(this);
        }
    }
    const dom = new JSDOM(page, {url: `http://127.0.0.1:8601/${opening ? '?scratch=opening' : ''}`});
    const {window} = dom;
    window.BroadcastChannel = Channel;
    const calls = [];
    let releaseSave;
    const save = new Promise(resolve => {
        releaseSave = resolve;
    });
    window.fetch = async (url, options) => {
        calls.push({url, options});
        if (!options) {
            return {json: async () => url === '/identity.json' ?
                {version: '2320.0.0b10'} : {host: 'minecraft.local', port: 25575, saved}};
        }
        await save;
        return {ok: !failSave, json: async () => (failSave ? {error: '保存できません。'} : {})};
    };
    let opens = 0;
    let focused = 0;
    const child = {closed: false,
        location: {href: ''},
        focus: () => focused++,
        close () {
            this.closed = true;
        }};
    window.open = url => {
        opens++;
        child.location.href = url;
        return blocked ? null : child;
    };
    const ready = setupPage(window);
    await ready;
    t.after(() => window.close());
    const form = window.document.getElementById('target');
    const saveButton = window.document.getElementById('save-target');
    const openButton = window.document.getElementById('open-scratch');
    const submit = () => form.dispatchEvent(new window.Event('submit', {cancelable: true}));
    const open = () => openButton.click();
    const editor = () => {
        const other = new JSDOM('<h1>Scratch</h1>', {url: 'http://127.0.0.1:8601/editor/'});
        Object.defineProperty(other.window, 'crypto', {value: webcrypto});
        other.window.BroadcastChannel = Channel;
        other.window.focus = () => focused++;
        trackEditor(other.window);
        t.after(() => other.window.close());
        return other.window;
    };
    return {window,
        calls,
        releaseSave,
        child,
        saveButton,
        openButton,
        submit,
        open,
        editor,
        opens: () => opens,
        focused: () => focused};
};

test('saves a target once and opens Scratch only after saving', async t => {
    const fixture = await setup(t);
    assert.equal(fixture.window.document.getElementById('version').textContent, 'mc-remote Scratch 2320.0.0b10');
    assert.equal(fixture.window.document.querySelector('input[value="lan"]').checked, true);
    assert.equal(fixture.openButton.disabled, true);
    fixture.submit();
    fixture.submit();
    assert.equal(fixture.opens(), 0);
    assert.equal(fixture.saveButton.disabled, true);
    assert.equal(fixture.calls.filter(call => call.options).length, 1);
    fixture.releaseSave();
    await flush();
    assert.equal(fixture.openButton.disabled, false);
    fixture.open();
    assert.equal(fixture.opens(), 1);
    assert.equal(fixture.child.location.href, '/editor/?extension=mcremote');
    fixture.editor();
    await flush();
    fixture.open();
    assert.equal(fixture.opens(), 1);
    assert.equal(fixture.focused(), 1);
    assert.equal(fixture.calls.filter(call => call.options).length, 1);
});

test('choosing this PC fills loopback and LAN selection asks for a host', async t => {
    const {window} = await setup(t);
    const local = window.document.querySelector('input[value="this"]');
    const lan = window.document.querySelector('input[value="lan"]');
    const host = window.document.getElementById('host');
    local.checked = true;
    local.dispatchEvent(new window.Event('change'));
    assert.equal(host.value, '127.0.0.1');
    assert.equal(host.readOnly, true);
    lan.checked = true;
    lan.dispatchEvent(new window.Event('change'));
    assert.equal(host.value, '');
    assert.equal(host.readOnly, false);
});

test('editing a saved target requires another save before Scratch can open', async t => {
    const fixture = await setup(t, {saved: true});
    assert.equal(fixture.openButton.disabled, false);
    const host = fixture.window.document.getElementById('host');
    host.value = 'another.local';
    host.dispatchEvent(new fixture.window.Event('input'));
    assert.equal(fixture.openButton.disabled, true);
    assert.equal(fixture.saveButton.disabled, false);
});

test('recognizes an editor opened by the launcher, returns to it, and unlocks settings when closed', async t => {
    const fixture = await setup(t, {opening: true, saved: true});
    const status = fixture.window.document.getElementById('scratch-status');
    assert.equal(fixture.openButton.disabled, true);
    assert.equal(status.textContent, 'Scratchを開いています。開いたタブを確認してください。');
    const editor = fixture.editor();
    await flush();
    assert.equal(fixture.openButton.textContent, 'Scratchに戻る');
    assert.equal(fixture.window.document.getElementById('host').readOnly, true);
    assert.equal(status.textContent,
        'いずれかのタブでScratchが既に開いています。接続先を変えるときは、Scratchのタブを閉じてください。');
    assert.equal(status.classList.contains('editor-open'), true);
    fixture.open();
    await flush();
    assert.equal(fixture.opens(), 0);
    assert.equal(fixture.focused(), 1);
    editor.dispatchEvent(new editor.Event('pagehide'));
    await flush();
    assert.equal(fixture.openButton.textContent, '改造版のScratchを開く');
    assert.equal(fixture.window.document.getElementById('host').readOnly, false);
    assert.equal(status.classList.contains('editor-open'), false);
    assert.equal(fixture.calls.length, 2);
});

test('shows a blocked popup without saving or restarting Bridge', async t => {
    const fixture = await setup(t, {blocked: true, saved: true});
    fixture.open();
    await flush();
    assert.match(fixture.window.document.getElementById('error').textContent, /ポップアップ/);
    assert.equal(fixture.calls.length, 2);
    assert.equal(fixture.openButton.disabled, false);
});

test('leaves Scratch closed on a save error and allows another attempt', async t => {
    const fixture = await setup(t, {failSave: true});
    fixture.submit();
    fixture.releaseSave();
    await flush();
    assert.equal(fixture.opens(), 0);
    assert.equal(fixture.window.document.getElementById('error').textContent, '保存できません。');
    assert.equal(fixture.saveButton.disabled, false);
    assert.equal(fixture.openButton.disabled, true);
});
