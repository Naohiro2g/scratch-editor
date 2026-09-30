import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

import yauzl from 'yauzl';

const manifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const englishPath = 'assets/minecraft/lang/en_us.json';
const outputDirectory = fileURLToPath(new URL('../src/lib/mcremote-block-names/', import.meta.url));
const sourcesPath = `${outputDirectory}/sources.json`;

const download = async (url, expectedSha1) => {
    const response = await fetch(url, {signal: AbortSignal.timeout(60000)});
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha1 = createHash('sha1').update(bytes)
        .digest('hex');
    if (expectedSha1 && sha1 !== expectedSha1) {
        throw new Error(`SHA-1 mismatch: ${url}`);
    }
    return bytes;
};

const readEnglish = bytes => new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, {lazyEntries: true}, (error, zip) => {
        if (error) {
            reject(error);
            return;
        }
        zip.on('error', reject);
        zip.on('end', () => reject(new Error(`Client archive is missing ${englishPath}`)));
        zip.on('entry', entry => {
            if (entry.fileName !== englishPath) {
                zip.readEntry();
                return;
            }
            zip.openReadStream(entry, (streamError, stream) => {
                if (streamError) {
                    zip.close();
                    reject(streamError);
                    return;
                }
                const chunks = [];
                stream.on('data', chunk => chunks.push(chunk));
                stream.on('error', reject);
                stream.on('end', () => {
                    zip.close();
                    resolve(Buffer.concat(chunks));
                });
            });
        });
        zip.readEntry();
    });
});

const versions = process.argv.slice(2);
if (versions.length === 0) {
    throw new Error('Usage: node scripts/update-mcremote-block-names.mjs <mc-version> [<mc-version> ...]');
}
const manifest = JSON.parse(await download(manifestUrl));
const sources = existsSync(sourcesPath) ? JSON.parse(await readFile(sourcesPath, 'utf8')) : {};
await mkdir(outputDirectory, {recursive: true});

for (const version of versions) {
    const release = manifest.versions.find(candidate => candidate.id === version);
    if (!release) throw new Error(`Minecraft version is not in the official manifest: ${version}`);
    const metadata = JSON.parse(await download(release.url, release.sha1));
    const index = JSON.parse(await download(metadata.assetIndex.url, metadata.assetIndex.sha1));
    const japaneseAsset = index.objects['minecraft/lang/ja_jp.json'];
    if (!japaneseAsset) throw new Error(`Japanese language asset is missing for Minecraft ${version}`);
    const japaneseUrl = `https://resources.download.minecraft.net/${japaneseAsset.hash.slice(0, 2)}/${
        japaneseAsset.hash}`;
    const japanese = JSON.parse(await download(japaneseUrl, japaneseAsset.hash));
    const client = metadata.downloads.client;
    const englishBytes = await readEnglish(await download(client.url, client.sha1));
    const english = JSON.parse(englishBytes);
    const blockNames = {};

    // Only direct block names are retained; dotted suffixes contain descriptions and banner patterns.
    for (const key of Object.keys(english).sort()) {
        const match = /^block\.minecraft\.([a-z0-9_]+)$/.exec(key);
        if (!match) continue;
        if (typeof english[key] !== 'string' || !english[key]) {
            throw new Error(`Invalid English block name: ${key}`);
        }
        const names = {en: english[key]};
        if (Object.prototype.hasOwnProperty.call(japanese, key)) {
            if (typeof japanese[key] !== 'string' || !japanese[key]) {
                throw new Error(`Invalid Japanese block name: ${key}`);
            }
            names.ja = japanese[key];
        }
        blockNames[`minecraft:${match[1]}`] = names;
    }
    if (Object.keys(blockNames).length === 0) throw new Error(`No block names found for Minecraft ${version}`);
    await writeFile(`${outputDirectory}/${version}.json`, `${JSON.stringify(blockNames, null, 2)}\n`);
    sources[version] = {
        versionMetadata: {url: release.url, sha1: release.sha1},
        assetIndex: {url: metadata.assetIndex.url, sha1: metadata.assetIndex.sha1},
        en: {
            url: client.url,
            sha1: client.sha1,
            path: englishPath,
            entrySha256: createHash('sha256').update(englishBytes)
                .digest('hex')
        },
        ja: {url: japaneseUrl, sha1: japaneseAsset.hash}
    };
    console.log(`Minecraft ${version}: ${Object.keys(blockNames).length} block names`);
}
await writeFile(sourcesPath, `${JSON.stringify(sources, null, 2)}\n`);
