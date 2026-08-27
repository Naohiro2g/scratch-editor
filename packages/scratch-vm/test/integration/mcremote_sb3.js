/**
 * McRemote `.sb3`/`.sprite3` compatibility fixture (scratch-editor save-track
 * entry gate, Phase 1). Confirms McRemote extension blocks/fields round-trip
 * through standard sb3 serialization unchanged, that a sprite carrying
 * McRemote blocks can be imported into a project that hasn't loaded the
 * extension yet, and that runtime-only connection/session state never
 * reaches serialized project JSON.
 */
const path = require('path');
const tap = require('tap');
const makeTestStorage = require('../fixtures/make-test-storage');
const readFileToBuffer = require('../fixtures/readProjectFile').readFileToBuffer;
const VirtualMachine = require('../../src/index');
const dispatch = require('../../src/dispatch/central-dispatch');

const projectUri = path.resolve(__dirname, '../fixtures/mcremote.sb3');
const project = readFileToBuffer(projectUri);

const spriteUri = path.resolve(__dirname, '../fixtures/mcremote.sprite3');
const sprite = readFileToBuffer(spriteUri);

const test = tap.test;

test('importing sb3 project with McRemote blocks', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(project).then(() => {
        const sprite1 = vm.runtime.targets[1];
        t.equal(sprite1.getName(), 'Sprite1');

        const blocks = sprite1.blocks._blocks;
        const byOpcode = opcode => Object.values(blocks).find(b => b.opcode === opcode);

        // Plain STRING/NUMBER inputs (the setBlock/setBlocks catalog-picker
        // value) round-trip as ordinary block fields, not extension state.
        const setBlock = byOpcode('mcremote_setBlock');
        t.equal(blocks[setBlock.inputs.BLOCK.block].fields.TEXT.value, 'grass_block');
        t.equal(blocks[setBlock.inputs.X.block].fields.NUM.value, '10');

        const setBlocks = byOpcode('mcremote_setBlocks');
        t.equal(blocks[setBlocks.inputs.BLOCK.block].fields.TEXT.value, 'oak_planks');

        // Menu-backed inputs (acceptReporters: true) round-trip as a real
        // shadow block referencing the menu, not a plain field.
        const setWorld = byOpcode('mcremote_setWorld');
        const worldShadow = blocks[setWorld.inputs.WORLD.block];
        t.equal(worldShadow.opcode, 'mcremote_menu_worlds');
        t.equal(worldShadow.fields.worlds.value, 'the_end');

        const setPlayerPos = byOpcode('mcremote_setPlayerPos');
        t.equal(blocks[setPlayerPos.inputs.WORLD.block].fields.worlds.value, 'overworld');

        // A non-menu dropdown (acceptReporters: false) round-trips as a plain
        // field on the block itself.
        const playerAttribute = byOpcode('mcremote_playerAttribute');
        t.equal(playerAttribute.fields.PROPERTY.value, 'x');

        // An McRemote reporter nested into another McRemote command's input
        // round-trips as a real block reference (no shadow needed).
        const postToChat = byOpcode('mcremote_postToChat');
        t.equal(blocks[postToChat.inputs.MSG.block].opcode, 'mcremote_pairCommand');

        // connectTo is hideFromPalette but still a normal serializable block.
        const connectTo = byOpcode('mcremote_connectTo');
        t.equal(blocks[connectTo.inputs.NAME.block].fields.TEXT.value, 'myserver');

        // Top-level orphan reporters (not attached to any script) round-trip.
        t.ok(byOpcode('mcremote_getBlock'));
        t.ok(byOpcode('mcremote_pairCode'));

        // whenPaired hat starts its own script.
        const whenPaired = byOpcode('mcremote_whenPaired');
        t.equal(blocks[whenPaired.next].opcode, 'mcremote_setPlayerXYZ');

        t.equal(vm.extensionManager.isExtensionLoaded('mcremote'), true);

        vm.quit();
        t.end();
    });
});

test('sb3 output never includes runtime connection/session state', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    vm.loadProject(project).then(() => {
        const serviceName = vm.extensionManager._loadedExtensions.get('mcremote');
        const mcremoteInstance = dispatch.services[serviceName];

        // Simulate live connection/session state the way the extension holds
        // it at runtime (plain instance fields, never written to a block).
        mcremoteInstance._connectionTarget = {
            sandboxRoute: 'wss://secret-sandbox.example/route',
            label: 'SECRET_SANDBOX_LABEL'
        };
        mcremoteInstance._helloInfo = {
            token: 'FAKE_BEARER_TOKEN_ABC123',
            playerUuid: 'FAKE-PLAYER-UUID-0000'
        };

        const savedJson = vm.toJSON();

        for (const secret of [
            'wss://secret-sandbox.example',
            'SECRET_SANDBOX_LABEL',
            'FAKE_BEARER_TOKEN_ABC123',
            'FAKE-PLAYER-UUID-0000'
        ]) {
            t.notOk(savedJson.includes(secret), `saved project JSON must not contain ${secret}`);
        }

        // The extension is only ever recorded in the extensions array by ID.
        const parsed = JSON.parse(savedJson);
        t.same(parsed.extensions, ['mcremote']);

        vm.quit();
        t.end();
    });
});

test('importing sprite3 with McRemote blocks auto-loads the extension', t => {
    const vm = new VirtualMachine();
    vm.attachStorage(makeTestStorage());

    const defaultProjectUri = path.resolve(__dirname, '../fixtures/default.sb3');
    const defaultProject = readFileToBuffer(defaultProjectUri);

    vm.loadProject(defaultProject).then(() => {
        t.equal(vm.extensionManager.isExtensionLoaded('mcremote'), false);

        return vm.addSprite(sprite).then(() => {
            t.equal(vm.extensionManager.isExtensionLoaded('mcremote'), true);

            const importedTarget = vm.runtime.targets[vm.runtime.targets.length - 1];
            const opcodes = Object.values(importedTarget.blocks._blocks).map(b => b.opcode);
            t.ok(opcodes.includes('mcremote_setBlock'));
            t.ok(opcodes.includes('mcremote_menu_worlds'));

            vm.quit();
            t.end();
        });
    });
});
