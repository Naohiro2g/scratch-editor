import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {closeSync, openSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {delimiter, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import yauzl from 'yauzl';

const helper = fileURLToPath(new URL('./mcremote/ExtractCreativeTabs.java', import.meta.url));
const namesDirectory = fileURLToPath(new URL('../src/lib/mcremote-block-names/', import.meta.url));
const outputDirectory = fileURLToPath(new URL('../src/lib/mcremote-block-aliases/', import.meta.url));
const supportedVersions = new Set(['1.21.11', '26.2', '26.3']);
const englishPath = 'assets/minecraft/lang/en_us.json';
const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes)
    .digest('hex');

const options = {cache: resolve('.cache/mcremote-block-aliases'), javaHome: null, versions: []};
const args = process.argv.slice(2);
while (args.length) {
    const argument = args.shift();
    if (argument === '--cache-dir' || argument === '--java-home') {
        const value = args.shift();
        if (!value) throw new Error(`${argument} requires a directory`);
        options[argument === '--cache-dir' ? 'cache' : 'javaHome'] = resolve(value);
    } else if (supportedVersions.has(argument)) options.versions.push(argument);
    else throw new Error(`Unsupported Minecraft version or option: ${argument}`);
}
if (options.versions.length === 0) {
    throw new Error('Usage: node scripts/update-mcremote-block-aliases.mjs ' +
        '[--java-home JDK25] [--cache-dir DIR] <mc-version> ...');
}
const executable = name => options.javaHome ? join(options.javaHome, 'bin', name) : name;
const javaVersion = execFileSync(executable('javac'), ['-version'], {encoding: 'utf8'});
if (!/^javac (?:2[5-9]|[3-9]\d)\./.test(javaVersion)) {
    throw new Error('Creative category extraction requires JDK 25 or later');
}

const readVerified = async (url, sha1, destination) => {
    let bytes;
    try {
        bytes = await readFile(destination);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        const response = await fetch(url, {signal: AbortSignal.timeout(60000)});
        if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
        bytes = Buffer.from(await response.arrayBuffer());
        await mkdir(resolve(destination, '..'), {recursive: true});
        await writeFile(destination, bytes);
    }
    if (digest(bytes, 'sha1') !== sha1) throw new Error(`SHA-1 mismatch: ${url}`);
    return bytes;
};

const readEnglish = bytes => new Promise((accept, reject) => {
    yauzl.fromBuffer(bytes, {lazyEntries: true}, (error, zip) => {
        if (error) return reject(error);
        zip.on('error', reject);
        zip.on('end', () => reject(new Error(`Client archive is missing ${englishPath}`)));
        zip.on('entry', entry => {
            if (entry.fileName !== englishPath) return zip.readEntry();
            zip.openReadStream(entry, (streamError, stream) => {
                if (streamError) return reject(streamError);
                const chunks = [];
                stream.on('data', chunk => chunks.push(chunk));
                stream.on('error', reject);
                stream.on('end', () => {
                    zip.close();
                    accept(Buffer.concat(chunks));
                });
            });
        });
        zip.readEntry();
    });
});

const readMappings = text => {
    const mapping = {classes: {}, methods: {}, fields: {}};
    let owner;
    for (const line of text.split('\n')) {
        if (!line || line.startsWith('#')) continue;
        if (!line.startsWith(' ')) {
            const [name, actual] = line.replace(/:$/, '').split(' -> ');
            owner = name;
            mapping.classes[owner] = actual;
            continue;
        }
        const [signature, actual] = line.trim().replace(/^\d+:\d+:/, '')
            .split(' -> ');
        const method = / ([\w$<>]+)\(/.exec(signature);
        if (method) {
            const key = `${owner}.${method[1]}`;
            if (!(key in mapping.methods)) mapping.methods[key] = actual;
        } else mapping.fields[`${owner}.${signature.split(' ').at(-1)}`] = actual;
    }
    return mapping;
};

const namesSources = JSON.parse(await readFile(join(namesDirectory, 'sources.json'), 'utf8'));
await mkdir(outputDirectory, {recursive: true});
let sources;
try {
    sources = JSON.parse(await readFile(join(outputDirectory, 'sources.json'), 'utf8'));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
    sources = {};
}

for (const version of options.versions) {
    const origin = namesSources[version];
    const directory = join(options.cache, version);
    await mkdir(directory, {recursive: true});
    const metadata = JSON.parse(await readVerified(origin.versionMetadata.url, origin.versionMetadata.sha1,
        join(directory, 'version.json')));
    const client = await readVerified(metadata.downloads.client.url, metadata.downloads.client.sha1,
        join(directory, 'client.jar'));
    const englishBytes = await readEnglish(client);
    const english = JSON.parse(englishBytes);
    const japanese = JSON.parse(await readVerified(origin.ja.url, origin.ja.sha1, join(directory, 'ja.json')));
    const mappings = metadata.downloads.client_mappings;
    const mapping = mappings ? readMappings((await readVerified(mappings.url, mappings.sha1,
        join(directory, 'client-mappings.txt'))).toString()) : {classes: {}, methods: {}, fields: {}};
    const mappingPath = join(directory, 'mappings.json');
    await writeFile(mappingPath, JSON.stringify(mapping));
    const libraries = metadata.libraries.map(library => library.downloads?.artifact).filter(Boolean);
    const classpath = [join(directory, 'client.jar')];
    for (const artifact of libraries) {
        const destination = join(options.cache, 'libraries', artifact.path);
        await readVerified(artifact.url, artifact.sha1, destination);
        classpath.push(destination);
    }
    const classes = join(directory, 'extractor');
    await mkdir(classes, {recursive: true});
    execFileSync(executable('javac'), ['-d', classes, '-cp', classpath.join(delimiter), helper]);
    const tabsPath = join(directory, 'tabs.json');
    const logPath = join(directory, 'extract.log');
    const descriptor = openSync(logPath, 'w');
    try {
        execFileSync(executable('java'), ['-Djava.awt.headless=true', '-cp',
            [classes, ...classpath].join(delimiter),
            'mc_remote.tools.ExtractCreativeTabs', mappingPath, tabsPath, version],
        {stdio: ['ignore', descriptor, descriptor]});
    } catch {
        throw new Error(`Creative category extraction failed for ${version}; see ${logPath}`);
    } finally {
        closeSync(descriptor);
    }
    const tabsBytes = await readFile(tabsPath);
    const tabs = JSON.parse(tabsBytes);
    const aliases = new Map();
    for (const tab of tabs) {
        const labels = [english[tab.translationKey], japanese[tab.translationKey]];
        if (labels.some(label => typeof label !== 'string' || !label)) {
            throw new Error(`Missing creative category label: ${version} ${tab.translationKey}`);
        }
        for (const block of tab.blocks) {
            if (!/^minecraft:[a-z0-9_]+$/.test(block)) throw new Error(`Unexpected block ID: ${block}`);
            if (!aliases.has(block)) aliases.set(block, new Set());
            for (const label of labels) aliases.get(block).add(label);
        }
    }
    if (aliases.size === 0) throw new Error(`No creative block categories extracted for ${version}`);
    const data = Object.fromEntries([...aliases].sort(([left], [right]) => left < right ? -1 : 1)
        .map(([id, labels]) => [id, [...labels].sort()]));
    const bytes = Buffer.from(`${JSON.stringify(data, null, 2)}\n`);
    await writeFile(join(outputDirectory, `${version}.json`), bytes);
    sources[version] = {
        versionMetadata: origin.versionMetadata,
        client: metadata.downloads.client,
        mappings: mappings || null,
        en: {path: englishPath, sha256: digest(englishBytes)},
        ja: origin.ja,
        extraction: {features: 'DEFAULT_FLAGS',
            operatorItems: true,
            tabType: 'CATEGORY',
            tags: 'vanilla server data',
            blockMapping: 'Block.asItem',
            helperSha256: digest(await readFile(helper)),
            membershipSha256: digest(tabsBytes)},
        categories: tabs.map(({id, translationKey}) => ({id, translationKey})),
        blocks: aliases.size,
        bytes: bytes.length,
        sha256: digest(bytes)
    };
    console.log(`Minecraft ${version}: ${tabs.length} creative categories, ${aliases.size} blocks`);
}
await writeFile(join(outputDirectory, 'sources.json'), `${JSON.stringify(sources, null, 2)}\n`);
