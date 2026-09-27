import {pathToFileURL} from 'node:url';

export const titleFromScratchReleaseTag = tag => {
    if (!/^v\d{4,}\.\d+\.\d+[a-z0-9.-]*$/.test(tag || '')) {
        throw new Error('Expected a Scratch release tag: v<mc-remote-version>');
    }
    return `mc-remote Scratch ${tag.slice(1)}`;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        console.log(titleFromScratchReleaseTag(process.argv[2]));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
