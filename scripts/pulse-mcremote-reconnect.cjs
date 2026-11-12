/* Run only with an operator-provided private input file; never commit that file. */
const fs = require('fs');
const assert = require('assert/strict');
const readline = require('readline');
const McRemote = require('../packages/scratch-vm/src/extensions/scratch3_mcremote');
const Runtime = require('../packages/scratch-vm/src/engine/runtime');

const main = async () => {
    const inputPath = process.argv[2];
    if (!inputPath) throw new Error('private input file required');
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    if (input.tokenFile && !fs.existsSync(input.tokenFile)) {
        console.log('HUMAN_ACTION_REQUIRED: pair in Scratch first; provide its session token in a private file.');
        process.exitCode = 3;
        return;
    }
    assert.equal(typeof input.bridgeUrl, 'string');
    assert.equal(typeof input.sandboxRoute, 'string');
    if (!process.argv.includes('--hello-only')) {
        assert.ok(Array.isArray(input.position) && input.position.length === 3 && input.position.every(Number.isInteger));
    }
    const token = input.tokenFile ? fs.readFileSync(input.tokenFile, 'utf8').trim() : '';
    global.WebSocket = class extends require('ws') {
        constructor (url, protocols) {
            super(url, protocols, {origin: input.origin || 'http://127.0.0.1:8601'});
        }
    };
    const values = new Map();
    global.localStorage = {getItem: key => values.get(key) || null,
        setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)};
    const connectionEvents = [];
    let displayedPairCommand = '';
    const blocks = new McRemote({
        getMcRemoteRuntimeConfig: () => ({bridgeUrl: input.bridgeUrl, defaultSandbox: input.sandboxRoute,
            connectionEnabled: true}),
        emit: (type, event) => {
            if (type === Runtime.MCREMOTE_CONNECTION_EVENT) connectionEvents.push(event);
            if (process.argv.includes('--pair') && type === Runtime.MCREMOTE_OBSERVATION_UPDATE &&
                event.pairCommand && event.pairCommand !== displayedPairCommand) {
                displayedPairCommand = event.pairCommand;
                console.log(`HUMAN_ACTION: ${displayedPairCommand}`);
            }
        }
    });
    if (token) blocks._saveSessionToken(token);
    // The operator performs approval. This pulse stops before requesting it.
    if (!process.argv.includes('--pair')) {
        blocks._pair = () => { throw new Error('human_action_required'); };
    }
    let original;
    let attemptedWrite = false;
    let restored = false;
    const recoveryPath = `${inputPath}.recovery.json`;
    try {
        await blocks.connect();
        console.log('PASS hello');
        if (process.argv.includes('--hello-only')) return;
        original = await blocks._request('world.getBlock', input.position);
        fs.writeFileSync(recoveryPath, JSON.stringify({position: input.position, original}), {mode: 0o600});
        attemptedWrite = true;
        await blocks._request('world.setBlock', [...input.position, {block_id: 'minecraft:stone', state: {}}]);
        const actual = await blocks._request('world.getBlock', input.position);
        assert.deepEqual(actual, {block_id: 'minecraft:stone', state: {}});
        console.log('PASS setBlock/getBlock');
        await blocks._request('world.setBlock', [...input.position, original]);
        assert.deepEqual(await blocks._request('world.getBlock', input.position), original);
        restored = true;
        console.log('PASS cleanup');
        if (process.argv.includes('--reconnect')) {
            const terminal = readline.createInterface({input: process.stdin, output: process.stdout});
            await new Promise(resolve => terminal.question(
                'HUMAN_ACTION: stop and restart Paper; press Enter after it is ready.\n', resolve));
            terminal.close();
            assert.deepEqual(await blocks._request('world.getBlock', input.position), original);
            assert.ok(connectionEvents.some(event => event.type === 'reconnected' && event.eventLoss));
            console.log('PASS reconnect/epoch/event-loss notification');
        }
        fs.unlinkSync(recoveryPath);
    } finally {
        if (attemptedWrite && !restored) {
            console.log('CLEANUP_REQUIRED: restore using the private recovery file after checking the connection.');
        }
        if (blocks._socket) blocks._socket.close();
    }
};

main().catch(error => {
    // Error messages and stacks can contain endpoints or server-returned player data.
    console.log(error.message === 'human_action_required' ? 'HUMAN_ACTION_REQUIRED: pairing approval required.' :
        'FAIL pulse; inspect privately. No request is automatically replayed.');
    process.exitCode = 1;
});
