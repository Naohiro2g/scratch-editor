const fs = require('node:fs/promises');
const path = require('node:path');
const {createRequire} = require('node:module');
const {execFileSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const referenceDirectory = path.join(root, 'mc-remote/block-reference');
const requireGui = createRequire(path.join(root, 'packages/scratch-gui/package.json'));
const {chromium} = requireGui('@playwright/test');
const escapeHtml = value => String(value).replace(/[&<>"']/g, character =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));

const typeNames = {command: '命令', reporter: '値を返す', Boolean: '条件', hat: 'イベント'};
const argumentTypes = {number: '数値', string: '文字列', list: 'リスト', variable: '変数'};
const protocolCategories = {
    connection: 'connection',
    build: 'build',
    block: 'block',
    sign: 'sign',
    player: 'player',
    entity: 'entity',
    particle: 'effect',
    sound: 'effect',
    lightning: 'effect',
    chat: 'chat',
    event: 'event'
};

const renderArgument = argument => {
    const options = argument.options ? argument.options.map(item =>
        `${escapeHtml(item.text)} <code>${escapeHtml(item.value)}</code>`).join(' / ') : '';
    const defaultLabel = typeof argument.defaultLabel === 'undefined' ? '—' :
        argument.defaultLabel === '' ? '空欄' : escapeHtml(argument.defaultLabel);
    return `<tr><th scope="row">${escapeHtml(argument.label)}</th><td>${escapeHtml(argument.typeLabel)}</td>` +
        `<td>${defaultLabel}</td><td>${options || '—'}</td></tr>`;
};

const renderBlock = block => {
    const search = [block.title, block.text, block.opcode, block.description, ...(block.methods || []),
        ...block.arguments.flatMap(argument => [argument.label,
            ...(argument.options || []).flatMap(option => [option.text, option.value])])].join(' ');
    const argumentsTable = block.arguments.length ? `<details class="inputs"><summary>入力・選択肢 ` +
        `<span>${block.arguments.length}項目</span></summary><div class="table-scroll"><table>` +
        `<thead><tr><th scope="col">入力</th><th scope="col">種類</th><th scope="col">最初の値</th>` +
        `<th scope="col">選択肢</th></tr></thead><tbody>${block.arguments.map(renderArgument).join('')}</tbody>` +
        `</table></div></details>` : '<p class="no-inputs">入力項目はありません。</p>';
    const notes = block.notes ? `<ul class="notes">${block.notes.map(note =>
        `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : '';
    const related = block.related && block.related.length ? `<div class="related"><span>一緒に使う</span>${
        block.related.map(item => `<a href="#${escapeHtml(item.opcode)}">${escapeHtml(item.title)}</a>`).join('')
    }</div>` : '';
    const methods = block.methods && block.methods.length ? `<div class="protocol"><span>通信API</span> ${
        block.methods.map(method => {
            const category = method.startsWith('auth.') ? 'auth' : protocolCategories[block.category];
            return `<a href="https://mc-remote.com/api/#${category}"><code>${escapeHtml(method)}</code></a>`;
        }).join(' ')}</div>` : '';
    return `<article id="${escapeHtml(block.opcode)}" class="block-card" data-search="${escapeHtml(search)}" ` +
        `data-kind="${escapeHtml(block.blockType)}"><div class="card-heading"><h3>${escapeHtml(block.title)}</h3>` +
        `<div><span class="kind kind-${escapeHtml(block.blockType)}">${typeNames[block.blockType]}</span>` +
        `<a class="permalink" href="#${escapeHtml(block.opcode)}" aria-label="${escapeHtml(block.title)}へのリンク">#</a>` +
        `</div></div><div class="block-image" tabindex="0" aria-label="ブロック画像。長い画像は横にスクロールできます">` +
        `<img src="images/${escapeHtml(block.opcode)}.svg" alt="${escapeHtml(block.text)}" ` +
        `width="${block.imageWidth}" height="${block.imageHeight}" loading="lazy"></div>` +
        `<p class="description">${escapeHtml(block.description)}</p>${
            block.result ? `<p class="result"><span>返す値</span> ${escapeHtml(block.result)}</p>` : ''
        }${notes}${argumentsTable}${related}${methods}</article>`;
};

const renderPage = (template, data) => {
    const categories = Object.entries(data.categories);
    const navigation = categories.map(([id, name]) => {
        const count = data.blocks.filter(block => block.category === id).length;
        return `<button type="button" data-category="${id}" aria-pressed="false">` +
            `<span>${escapeHtml(name)}</span><span class="category-count">${count}</span></button>`;
    }).join('');
    const sections = categories.map(([id, name]) => `<section class="block-section" data-section="${id}" ` +
        `aria-labelledby="heading-${id}"><h2 id="heading-${id}">${escapeHtml(name)}</h2>${
            data.blocks.filter(block => block.category === id).map(renderBlock)
                .join('')}</section>`).join('');
    return template.replace('<!-- CATEGORY_NAVIGATION -->', navigation)
        .replace('<!-- BLOCK_SECTIONS -->', sections)
        .replaceAll('{{BLOCK_COUNT}}', String(data.blocks.length))
        .replaceAll('{{RELEASE}}', escapeHtml(data.release))
        .replace('{{SOURCE_COMMIT}}', escapeHtml(data.sourceCommit));
};

const main = async function () {
    const options = Object.fromEntries(process.argv.slice(2).map(argument => {
        const separator = argument.indexOf('=');
        if (separator < 0) throw new Error(`Use --name=value: ${argument}`);
        return [argument.slice(0, separator), argument.slice(separator + 1)];
    }));
    for (const option of Object.keys(options)) {
        if (!['--editor-url', '--source-ref', '--output'].includes(option)) {
            throw new Error(`Unknown option: ${option}`);
        }
    }
    if (!options['--editor-url']) {
        throw new Error('--editor-url is required; serve the selected release editor first.');
    }
    const sourceRef = options['--source-ref'] || 'v2320.0.0b8';
    const sourceCommit = execFileSync('git', ['rev-parse', `${sourceRef}^{commit}`],
        {cwd: root, encoding: 'utf8'}).trim();
    const sourcePaths = ['packages/scratch-vm/src', 'packages/scratch-gui/src/lib/mcremote-l10n.js',
        'packages/scratch-gui/src/lib/configure-mcremote-block-rendering.js'];
    const difference = execFileSync('git', ['diff', sourceCommit, '--', ...sourcePaths], {cwd: root, encoding: 'utf8'});
    if (difference) throw new Error('Block sources differ from --source-ref. Use a checkout of the selected source.');
    const versionSource = execFileSync('git', ['show',
        `${sourceCommit}:packages/scratch-vm/src/extensions/scratch3_mcremote/client-version.js`],
    {cwd: root, encoding: 'utf8'});
    const version = /module\.exports\s*=\s*['"]([^'"]+)['"]/.exec(versionSource)[1];
    const content = JSON.parse(await fs.readFile(path.join(referenceDirectory, 'content.json'), 'utf8'));
    const browser = await chromium.launch({headless: true});
    let exported;
    try {
        const page = await browser.newPage({locale: 'ja-JP', viewport: {width: 1600, height: 1100}});
        await page.addInitScript(() => {
            window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
                supportsFiber: true,
                inject: () => 1,
                onCommitFiberRoot: (_id, fiberRoot) => {
                    window.__blockReferenceRoot = fiberRoot;
                },
                onCommitFiberUnmount: () => {}
            };
        });
        const editorUrl = new URL(options['--editor-url']);
        editorUrl.searchParams.set('extension', 'mcremote');
        await page.goto(editorUrl.href, {waitUntil: 'domcontentloaded'});
        await page.waitForFunction(() => {
            const findBlocks = node => {
                if (!node) return null;
                const instance = node.stateNode;
                if (instance && instance.workspace && instance.ScratchBlocks) return instance;
                return findBlocks(node.child) || findBlocks(node.sibling);
            };
            const app = window.__blockReferenceRoot && findBlocks(window.__blockReferenceRoot.current);
            if (!app || !app.ScratchBlocks.Blocks.mcremote_setBlock) return false;
            window.__blockReferenceApp = app;
            return true;
        }, null, {timeout: 30000});
        exported = await page.evaluate(async () => {
            const app = window.__blockReferenceApp;
            const vm = app.props.vm;
            vm.disableMcRemoteConnection();
            if (vm.getLocale() !== 'ja') throw new Error('The source editor must use Japanese (ja).');
            const category = vm.runtime._blockInfo.find(item => item.id === 'mcremote');
            const blocks = category.blocks.filter(block => block.info.opcode && !block.info.hideFromPalette);
            const workspace = app.workspace;
            const Blockly = app.ScratchBlocks;
            workspace.setScale(1);
            await document.fonts.ready;

            // Use the editor's actual SVG, as the backpack thumbnail exporter does.
            const exportSvg = async block => {
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                const original = block.getSvgRoot();
                const bounds = original.getBBox();
                const clone = original.cloneNode(true);
                const properties = ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight',
                    'font-style', 'opacity', 'paint-order'];
                const originals = [original, ...original.querySelectorAll('*')];
                const clones = [clone, ...clone.querySelectorAll('*')];
                originals.forEach((node, index) => {
                    const style = getComputedStyle(node);
                    for (const property of properties) {
                        clones[index].style.setProperty(property, style.getPropertyValue(property));
                    }
                    // DOM IDs are instance-specific; the block SVG has no internal ID references.
                    clones[index].removeAttribute('id');
                    clones[index].removeAttribute('data-id');
                });
                for (const image of clone.querySelectorAll('image')) {
                    const href = image.getAttribute('href') || image.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                    if (href && !href.startsWith('data:')) {
                        const response = await fetch(new URL(href, document.baseURI));
                        if (!response.ok) throw new Error(`Cannot embed block image: ${response.status} ${href}`);
                        const dataUrl = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result);
                            reader.onerror = reject;
                            response.blob().then(blob => reader.readAsDataURL(blob), reject);
                        });
                        image.setAttribute('href', dataUrl);
                        image.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
                    }
                }
                const padding = 8;
                const width = Math.ceil(bounds.width + (padding * 2));
                const height = Math.ceil(bounds.height + (padding * 2));
                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                svg.setAttribute('width', width);
                svg.setAttribute('height', height);
                svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
                clone.setAttribute('transform', `translate(${padding - bounds.x} ${padding - bounds.y})`);
                svg.appendChild(clone);
                return {svg: new XMLSerializer().serializeToString(svg), width, height};
            };
            const makeBlock = (opcode, changes = {}) => {
                const entry = blocks.find(block => block.info.opcode === opcode);
                const xml = new DOMParser().parseFromString(entry.xml, 'text/xml').documentElement;
                for (const [name, value] of Object.entries(changes)) {
                    const valueElement = [...xml.children].find(child =>
                        child.tagName === 'value' && child.getAttribute('name') === name);
                    if (valueElement) {
                        const field = valueElement.querySelector('field');
                        if (field) field.textContent = value;
                        else {
                            const text = xml.ownerDocument.createElement('field');
                            text.setAttribute('name', 'TEXT');
                            text.textContent = value;
                            valueElement.firstElementChild.appendChild(text);
                        }
                    } else {
                        const field = [...xml.children].find(child =>
                            child.tagName === 'field' && child.getAttribute('name') === name);
                        if (!field) throw new Error(`Unknown example input ${opcode}.${name}`);
                        field.textContent = value;
                    }
                }
                return Blockly.Xml.domToBlock(xml, workspace);
            };
            const result = [];
            for (const entry of blocks) {
                const block = makeBlock(entry.info.opcode);
                const image = await exportSvg(block);
                result.push({info: entry.info, image});
                block.dispose(false);
            }
            const sound = makeBlock('playSound', {SOUND: 'block.note_block.harp', Y: '63'});
            const soundOptions = makeBlock('soundOptions', {VOLUME: '0.5', HEIGHT: 'N12'});
            sound.getInput('OPTIONS').connection.connect(soundOptions.outputConnection);
            sound.render();
            const soundExample = await exportSvg(sound);
            sound.dispose(false);
            const blockInfo = makeBlock('blockInfoId');
            const getBlock = makeBlock('getBlock', {Y: '63'});
            blockInfo.getInput('BLOCK_INFO').connection.connect(getBlock.outputConnection);
            blockInfo.render();
            const blockExample = await exportSvg(blockInfo);
            blockInfo.dispose(false);
            return {blocks: result,
                menus: category.menuInfo,
                examples: {'sound-example': soundExample, 'block-info-example': blockExample}};
        });
    } finally {
        await browser.close();
    }
    const visibleOpcodes = new Set(exported.blocks.map(block => block.info.opcode));
    for (const opcode of Object.keys(content.blocks)) {
        if (!visibleOpcodes.has(opcode)) throw new Error(`Description has no visible block: ${opcode}`);
    }
    const data = {
        release: version,
        sourceRef,
        sourceCommit,
        locale: 'ja',
        categories: content.categories,
        blocks: exported.blocks.map(({info, image}) => {
            const description = content.blocks[info.opcode];
            if (!description) throw new Error(`Missing description: ${info.opcode}`);
            if (!content.categories[description.category]) throw new Error(`Unknown category: ${description.category}`);
            const argumentOrder = [...info.text.matchAll(/\[([A-Z_0-9]+)\]/g)].map(match => match[1]);
            const args = argumentOrder.filter(name => info.arguments[name].type !== 'image').map(name => {
                const argument = info.arguments[name];
                const menu = argument.menu && exported.menus[argument.menu];
                if (!content.arguments[name]) throw new Error(`Missing argument label: ${info.opcode}.${name}`);
                const defaultValue = typeof argument.defaultValue === 'undefined' && menu ?
                    menu.items[0].value : argument.defaultValue;
                const defaultOption = menu && menu.items.find(item => String(item.value) === String(defaultValue));
                return {name,
                    label: content.arguments[name],
                    type: argument.type,
                    typeLabel: menu ? '選択肢' : argumentTypes[argument.type],
                    defaultValue,
                    defaultLabel: defaultOption ? defaultOption.text : defaultValue,
                    ...(menu ? {options: menu.items, acceptReporters: menu.acceptReporters} : {})};
            });
            return {opcode: info.opcode,
                text: info.text.replace(/\s*\[PICKER\]/g, ''),
                blockType: info.blockType,
                ...description,
                arguments: args,
                imageWidth: image.width,
                imageHeight: image.height,
                related: (description.related || []).map(opcode => {
                    if (!visibleOpcodes.has(opcode)) throw new Error(`Unknown related block: ${opcode}`);
                    return {opcode, title: content.blocks[opcode].title};
                })};
        })
    };
    const output = path.resolve(options['--output'] || path.join(referenceDirectory, 'site'));
    await fs.mkdir(path.join(output, 'images'), {recursive: true});
    for (const {info, image} of exported.blocks) {
        await fs.writeFile(path.join(output, 'images', `${info.opcode}.svg`), image.svg);
    }
    for (const [name, image] of Object.entries(exported.examples)) {
        await fs.writeFile(path.join(output, 'images', `${name}.svg`), image.svg);
    }
    await fs.writeFile(path.join(output, 'blocks.json'), `${JSON.stringify(data, null, 2)}\n`);
    const template = await fs.readFile(path.join(referenceDirectory, 'page.html'), 'utf8');
    await fs.writeFile(path.join(output, 'index.html'), renderPage(template, data));
    for (const file of ['style.css', 'page.js']) {
        await fs.copyFile(path.join(referenceDirectory, file), path.join(output, file));
    }
    const exampleCount = Object.keys(exported.examples).length;
    console.log(`Generated ${data.blocks.length} blocks and ${exampleCount} examples: ${output}`);
};

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
