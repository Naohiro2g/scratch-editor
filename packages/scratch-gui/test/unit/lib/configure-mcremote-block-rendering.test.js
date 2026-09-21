import configureMcRemoteBlockRendering from '../../../src/lib/configure-mcremote-block-rendering';

const makeScratchBlocks = () => {
    class Renderer {
        makeRenderInfo_ (block) {
            return block.renderInfo;
        }
    }

    const Types = {
        isField: element => element.kind === 'field',
        isInput: element => element.kind === 'input',
        isInputRow: row => row.kind === 'input-row',
        isSpacer: element => element.kind === 'spacer'
    };

    return {
        blockRendering: {Types},
        registry: {
            Type: {RENDERER: 'renderer'},
            getClass: jest.fn((type, name) => {
                if (name === 'scratch_classic') return Renderer;
                return null;
            })
        }
    };
};

const makeRenderInfo = (bump, labelText = 'x :') => {
    const leadingSpacer = {kind: 'spacer', width: 8};
    const coordinateLabel = {
        kind: 'field',
        field: {getText: () => labelText},
        width: 7
    };
    const inputSpacer = {kind: 'spacer', width: 8};
    const coordinateInput = {kind: 'input', width: 40};
    const row = {
        kind: 'input-row',
        elements: [leadingSpacer, coordinateLabel, inputSpacer, coordinateInput]
    };
    const renderInfo = {
        constants_: {MEDIUM_PADDING: 8},
        rows: [row],
        adjustXPosition_: jest.fn(() => {
            inputSpacer.width += bump;
        })
    };

    return {renderInfo, leadingSpacer, inputSpacer};
};

describe('configureMcRemoteBlockRendering', () => {
    test('keeps a leading x label with its input while preserving notch clearance', () => {
        const ScratchBlocks = makeScratchBlocks();
        const {renderInfo, leadingSpacer, inputSpacer} = makeRenderInfo(17);

        configureMcRemoteBlockRendering(ScratchBlocks);
        const Renderer = ScratchBlocks.registry.getClass('renderer', 'scratch_classic');
        const info = new Renderer().makeRenderInfo_({type: 'mcremote_setBlock', renderInfo});
        info.adjustXPosition_();

        expect(leadingSpacer.width).toBe(25);
        expect(inputSpacer.width).toBe(2);
    });

    test('does not change a reporter row without a notch adjustment', () => {
        const ScratchBlocks = makeScratchBlocks();
        const {renderInfo, leadingSpacer, inputSpacer} = makeRenderInfo(0);

        configureMcRemoteBlockRendering(ScratchBlocks);
        const Renderer = ScratchBlocks.registry.getClass('renderer', 'scratch_classic');
        const info = new Renderer().makeRenderInfo_({type: 'mcremote_getBlock', renderInfo});
        info.adjustXPosition_();

        expect(leadingSpacer.width).toBe(8);
        expect(inputSpacer.width).toBe(2);
    });

    test.each([
        ['mcremote_strikeLightning', '雷を x :'],
        ['mcremote_setSign', '看板 x :'],
        ['mcremote_setPlayerXYZ', 'プレイヤーを x :'],
        ['mcremote_getHeightBelow', 'の y :'],
        ['mcremote_setBlocks', 'から x :']
    ])('compacts a coordinate at the end of a longer label on %s', (blockType, labelText) => {
        const ScratchBlocks = makeScratchBlocks();
        const {renderInfo, inputSpacer} = makeRenderInfo(0, labelText);

        configureMcRemoteBlockRendering(ScratchBlocks);
        const Renderer = ScratchBlocks.registry.getClass('renderer', 'scratch_classic');
        const info = new Renderer().makeRenderInfo_({type: blockType, renderInfo});
        info.adjustXPosition_();

        expect(inputSpacer.width).toBe(2);
    });

    test('leaves particle spacing unchanged', () => {
        const ScratchBlocks = makeScratchBlocks();
        const {renderInfo, inputSpacer} = makeRenderInfo(0, 'パーティクルを x :');

        configureMcRemoteBlockRendering(ScratchBlocks);
        const Renderer = ScratchBlocks.registry.getClass('renderer', 'scratch_classic');
        const info = new Renderer().makeRenderInfo_({type: 'mcremote_spawnParticle', renderInfo});
        info.adjustXPosition_();

        expect(inputSpacer.width).toBe(8);
    });

    test('removes the space before the first build-origin comma', () => {
        const ScratchBlocks = makeScratchBlocks();
        const coordinateInput = {kind: 'input', width: 40};
        const commaSpacer = {kind: 'spacer', width: 8};
        const commaLabel = {
            kind: 'field',
            field: {getText: () => ',  0,  '},
            width: 30
        };
        const renderInfo = {
            constants_: {MEDIUM_PADDING: 8},
            rows: [{kind: 'input-row', elements: [coordinateInput, commaSpacer, commaLabel]}],
            adjustXPosition_: jest.fn()
        };

        configureMcRemoteBlockRendering(ScratchBlocks);
        const Renderer = ScratchBlocks.registry.getClass('renderer', 'scratch_classic');
        const info = new Renderer().makeRenderInfo_({type: 'mcremote_setBuildOrigin', renderInfo});
        info.adjustXPosition_();

        expect(commaSpacer.width).toBe(0);
    });

    test('does not change non-McRemote blocks', () => {
        const ScratchBlocks = makeScratchBlocks();
        const {renderInfo, leadingSpacer, inputSpacer} = makeRenderInfo(17);

        configureMcRemoteBlockRendering(ScratchBlocks);
        const Renderer = ScratchBlocks.registry.getClass('renderer', 'scratch_classic');
        const info = new Renderer().makeRenderInfo_({type: 'motion_movesteps', renderInfo});
        info.adjustXPosition_();

        expect(leadingSpacer.width).toBe(8);
        expect(inputSpacer.width).toBe(25);
    });
});
