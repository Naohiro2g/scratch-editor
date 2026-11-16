import {readFileSync} from 'node:fs';
import path from 'node:path';
import {runInNewContext} from 'node:vm';
const directory = path.resolve(__dirname, '../../../../../mc-remote/block-reference');
const setup = () => {
    const card = (id, kind, targets) =>
        `<article id="${id}" class="block-card" data-kind="${kind}" data-targets="${targets}" data-search="${id}"></article>`;
    const template = readFileSync(path.join(directory, 'page.html'), 'utf8')
        .replace('<!-- BLOCK_SECTIONS -->',
            `<section data-section="block">${card('stone', 'command', 'unity')}${card('height', 'reporter', '')}</section>` +
            `<section data-section="sound">${card('sound', 'command', '')}</section>`);
    const page = document.implementation.createHTMLDocument('Blocks');
    page.documentElement.innerHTML = template;
    const browser = new EventTarget();
    const location = {hash: ''};
    HTMLElement.prototype.scrollIntoView = jest.fn();
    runInNewContext(readFileSync(path.join(directory, 'page.js'), 'utf8'),
        {document: page, window: browser, location});
    return {document: page, browser, location};
};

test('Unity filter composes with search and clearing search retains the target filter', () => {
    const {document} = setup();
    document.getElementById('unity-only').click();
    expect(document.getElementById('stone').hidden).toBe(false);
    expect(document.getElementById('height').hidden).toBe(true);
    expect(document.getElementById('sound').hidden).toBe(true);
    const search = document.getElementById('search');
    search.value = 'absent';
    search.dispatchEvent(new Event('input'));
    expect(document.getElementById('empty-results').hidden).toBe(false);
    document.getElementById('clear-search').click();
    expect(document.getElementById('unity-only').checked).toBe(true);
    expect(document.getElementById('stone').hidden).toBe(false);
});

test('a block permalink reveals its block even when the Unity filter excluded it', () => {
    const {document, browser, location} = setup();
    document.getElementById('unity-only').click();
    location.hash = '#sound';
    browser.dispatchEvent(new Event('hashchange'));
    expect(document.getElementById('unity-only').checked).toBe(false);
    expect(document.getElementById('sound').hidden).toBe(false);
});
