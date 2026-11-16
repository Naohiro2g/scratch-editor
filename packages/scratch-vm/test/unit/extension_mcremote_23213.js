const test = require('tap').test;
const Runtime = require('../../src/engine/runtime');
const McRemote = require('../../src/extensions/scratch3_mcremote');

const make = () => new McRemote(new Runtime());

test('pairing blocks remain registered and executable but are absent from the palette', t => {
    const extension = make();
    const blocks = extension.getInfo().blocks.filter(block => typeof block === 'object');
    for (const opcode of ['pairCode', 'pairCommand', 'whenPaired']) {
        t.equal(blocks.find(block => block.opcode === opcode).hideFromPalette, true, opcode);
        t.type(extension[opcode], 'function');
    }
    extension._setPairCode('123456');
    t.equal(extension.pairCode(), '123-456');
    t.equal(extension.pairCommand(), '/mcremote pair 123-456');
    t.equal(extension.whenPaired(), true);
    t.end();
});

test('palette keeps topic operations and their reporters together in the agreed order', t => {
    const opcodes = make().getInfo().blocks.filter(block => typeof block === 'object' &&
        !block.hideFromPalette).map(block => block.opcode);
    const sequence = ['postToChat', 'getHeight', 'setBlock', 'setBlocks', 'getBlock', 'getBlocks',
        'setPlayerXYZ', 'setPlayerDirection', 'playerAttribute', 'playerDirection',
        'spawnEntity', 'entityDirection', 'setSign', 'getSign', 'spawnParticle',
        'playSound', 'strikeLightning', 'whenPickaxePoke'];
    for (let i = 1; i < sequence.length; i++) {
        t.ok(opcodes.indexOf(sequence[i - 1]) < opcodes.indexOf(sequence[i]),
            `${sequence[i - 1]} before ${sequence[i]}`);
    }
    t.end();
});

test('observer keeps public server identity and actionable bounds without private error fields', t => {
    const extension = make();
    extension._recordHelloInfo({protocol: '23.3.0',
        dimension: 'minecraft:overworld',
        origin: [0, 0, 0],
        server: {name: 'mc-remote-unity-sandbox', version: '2321.3.0', secret: 'private'}});
    t.same(extension._helloInfo.server, {name: 'mc-remote-unity-sandbox', version: '2321.3.0'});
    const error = Object.assign(new Error('too many blocks'), {method: 'world.setBlocks',
        reason: 'block_count_limit_exceeded',
        data: {reason: 'block_count_limit_exceeded',
            limit: 32768,
            requested: 40000,
            secret: 'private'}});
    const summary = extension._errorInfo(error);
    t.equal(summary.method, 'world.setBlocks');
    t.same(summary.data, {limit: 32768, requested: 40000});
    t.end();
});

test('a serialized legacy project loads and executes all three hidden pairing blocks', async t => {
    const VirtualMachine = require('../../src/virtual-machine');
    const vm = new VirtualMachine();
    const {ScratchStorage: Storage, AssetType, DataFormat} = require('@scratch/scratch-storage');
    const storage = new Storage();
    vm.attachStorage(storage);
    const FakeRenderer = require('../fixtures/fake-renderer');
    const renderer = new FakeRenderer();
    renderer.draw = () => {};
    vm.attachRenderer(renderer);
    const asset = storage.createAsset(AssetType.ImageVector, DataFormat.SVG,
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'), null, true);
    t.teardown(() => vm.quit());
    const extension = new McRemote(vm.runtime);
    const service = vm.extensionManager._registerInternalExtension(extension);
    vm.extensionManager._loadedExtensions.set('mcremote', service);
    const block = (opcode, parent, next, inputs = {}, fields = {}) =>
        ({opcode, parent, next, inputs, fields, shadow: false, topLevel: parent === null});
    const project = {targets: [{isStage: true,
        name: 'Stage',
        variables: {
            code: ['code', ''], command: ['command', '']
        },
        lists: {},
        broadcasts: {},
        blocks: {
            hat: block('mcremote_whenPaired', null, 'setCode'),
            setCode: block('data_setvariableto', 'hat', 'setCommand', {VALUE: [2, 'codeValue']},
                {VARIABLE: ['code', 'code']}),
            codeValue: block('mcremote_pairCode', 'setCode', null),
            setCommand: block('data_setvariableto', 'setCode', null, {VALUE: [2, 'commandValue']},
                {VARIABLE: ['command', 'command']}),
            commandValue: block('mcremote_pairCommand', 'setCommand', null)
        },
        costumes: [{name: 'backdrop',
            assetId: asset.assetId,
            md5ext: `${asset.assetId}.svg`,
            dataFormat: 'svg',
            bitmapResolution: 1,
            rotationCenterX: 0,
            rotationCenterY: 0}],
        sounds: [],
        currentCostume: 0,
        volume: 100,
        layerOrder: 0}],
    extensions: ['mcremote'],
    monitors: [],
    meta: {semver: '3.0.0'}};
    await new Promise((resolve, reject) => require('scratch-parser')(JSON.stringify(project), false, error => {
        if (error) reject(error);
        else resolve();
    }));
    await vm.loadProject(JSON.stringify(project));
    const stage = vm.runtime.getTargetForStage();
    t.equal(stage.blocks.getBlock('hat').opcode, 'mcremote_whenPaired');
    extension._setPairCode('123456');
    t.equal(vm.runtime._primitives.mcremote_pairCode({}, {target: stage}), '123-456', 'legacy reporter primitive');
    extension._firePairingComplete();
    t.equal(vm.runtime.threads.length, 1, 'legacy hat starts a thread');
    vm.runtime.currentStepTime = Runtime.THREAD_STEP_INTERVAL;
    vm.runtime._step();
    t.equal(stage.variables.code.value, '123-456');
    t.equal(stage.variables.command.value, '/mcremote pair 123-456');
});


test('world utilities and entity/player groups follow the agreed reading order', t => {
    const blocks = make().getInfo().blocks;
    const index = opcode => blocks.findIndex(block => block && block.opcode === opcode);
    t.equal(blocks[index('getHeightBelow') + 1], '---');
    t.equal(blocks[index('flushBuildCommands') + 1].opcode, 'isMcRemoteError');
    t.equal(blocks[index('isMcRemoteError') + 1].opcode, 'catalogToList');
    const opcodes = blocks.filter(block => typeof block === 'object' && !block.hideFromPalette)
        .map(block => block.opcode);
    t.same(opcodes.slice(opcodes.indexOf('spawnEntity'), opcodes.indexOf('setSign')), [
        'spawnEntity', 'getNearbyEntities', 'entityInfo', 'removeEntity',
        'setEntityPose', 'setEntityDirection', 'getEntityPose', 'entityPoseInfo', 'entityDirection'
    ]);
    t.same(opcodes.slice(opcodes.indexOf('setPlayerXYZ'), opcodes.indexOf('spawnEntity')), [
        'setPlayerXYZ', 'setPlayerPos', 'setPlayerDirection', 'setPlayerPose', 'playerAttribute', 'playerDirection'
    ]);
    t.end();
});


test('receiver labels describe the learner while preserving protocol values', t => {
    const menus = make().getInfo().menus;
    for (const name of ['particleReceivers', 'soundReceivers']) {
        t.same(menus[name].items.map(item => item.value), ['world', 'self']);
        t.equal(menus[name].items[1].text, 'only me');
    }
    t.end();
});
