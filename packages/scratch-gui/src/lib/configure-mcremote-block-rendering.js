const RENDERER_NAMES = ['scratch_classic', 'scratch_catblocks'];
const CONFIGURED_PROPERTY = 'mcremoteLeadingCoordinateConfigured_';
const COORDINATE_INPUT_PADDING = 2;
const COORDINATE_LABEL = /\b[xyz] :$/;
const STANDALONE_COORDINATE_LABEL = /^[xyz] :$/;

const moveNotchSpacingBeforeLeadingCoordinate = function (renderInfo, Types) {
    const row = renderInfo.rows.find(candidate => Types.isInputRow(candidate));
    if (!row) return;

    const firstFieldOrInputIndex = row.elements.findIndex(element =>
        Types.isField(element) || Types.isInput(element)
    );
    const label = row.elements[firstFieldOrInputIndex];
    if (!label || !Types.isField(label) || label.field.getText() !== 'x :') return;

    const inputIndex = row.elements.findIndex((element, index) =>
        index > firstFieldOrInputIndex && Types.isInput(element)
    );
    if (inputIndex < 0) return;

    const leadingSpacer = row.elements[firstFieldOrInputIndex - 1];
    const inputSpacer = row.elements[inputIndex - 1];
    if (!Types.isSpacer(leadingSpacer) || !Types.isSpacer(inputSpacer)) return;

    const notchAdjustment = inputSpacer.width - renderInfo.constants_.MEDIUM_PADDING;
    if (notchAdjustment <= 0) return;

    // Zelos clears the previous-connection notch by moving only the first
    // input. Move that clearance before the short axis label so `x` and its
    // input stay together without overlapping the notch.
    leadingSpacer.width += notchAdjustment;
    inputSpacer.width -= notchAdjustment;
};

const compactCoordinateInputSpacing = function (renderInfo, Types, blockType) {
    for (const row of renderInfo.rows) {
        if (!Types.isInputRow(row)) continue;

        for (let index = 0; index < row.elements.length - 2; index++) {
            const label = row.elements[index];
            const spacer = row.elements[index + 1];
            const input = row.elements[index + 2];
            const coordinateLabel = blockType === 'mcremote_spawnParticle' ?
                STANDALONE_COORDINATE_LABEL : COORDINATE_LABEL;
            if (Types.isField(label) && coordinateLabel.test(label.field.getText()) &&
                Types.isSpacer(spacer) && Types.isInput(input)) {
                spacer.width = COORDINATE_INPUT_PADDING;
            }
        }
    }
};

const compactBuildOriginCommaSpacing = function (renderInfo, Types, blockType) {
    if (blockType !== 'mcremote_setBuildOrigin') return;

    for (const row of renderInfo.rows) {
        if (!Types.isInputRow(row)) continue;

        for (let index = 0; index < row.elements.length - 2; index++) {
            const input = row.elements[index];
            const spacer = row.elements[index + 1];
            const label = row.elements[index + 2];
            if (Types.isInput(input) && Types.isSpacer(spacer) && Types.isField(label) &&
                label.field.getText().startsWith(',')) {
                spacer.width = 0;
                return;
            }
        }
    }
};

/**
 * Keep a leading coordinate label next to its input on McRemote stack blocks.
 * @param {object} ScratchBlocks Scratch Blocks module
 */
const configureMcRemoteBlockRendering = function (ScratchBlocks) {
    const {Types} = ScratchBlocks.blockRendering;

    for (const rendererName of RENDERER_NAMES) {
        const Renderer = ScratchBlocks.registry.getClass(
            ScratchBlocks.registry.Type.RENDERER,
            rendererName
        );
        if (!Renderer) continue;

        const rendererPrototype = Renderer.prototype;
        if (Object.prototype.hasOwnProperty.call(rendererPrototype, CONFIGURED_PROPERTY)) continue;

        const makeRenderInfo = rendererPrototype.makeRenderInfo_;
        rendererPrototype.makeRenderInfo_ = function (block) {
            const renderInfo = makeRenderInfo.call(this, block);
            if (!block.type.startsWith('mcremote_')) return renderInfo;

            const adjustXPosition = renderInfo.adjustXPosition_;
            renderInfo.adjustXPosition_ = function () {
                adjustXPosition.call(this);
                moveNotchSpacingBeforeLeadingCoordinate(this, Types);
                compactCoordinateInputSpacing(this, Types, block.type);
                compactBuildOriginCommaSpacing(this, Types, block.type);
            };
            return renderInfo;
        };
        rendererPrototype[CONFIGURED_PROPERTY] = true;
    }
};

export default configureMcRemoteBlockRendering;
