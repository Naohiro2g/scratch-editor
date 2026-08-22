import {Blocks} from '../../../src/containers/blocks.jsx';

describe('Blocks container onWorkspaceUpdate', () => {
    let instance;

    beforeEach(() => {
        // Minimal mock instance — just enough for onWorkspaceUpdate to run
        instance = {
            getToolboxXML: jest.fn().mockReturnValue(null),
            onWorkspaceMetricsChange: jest.fn(),
            toolboxUpdateChangeListener: jest.fn(),
            props: {
                vm: {editingTarget: null},
                workspaceMetrics: {targets: {}},
                updateToolboxState: jest.fn()
            },
            workspace: {
                removeChangeListener: jest.fn(),
                addChangeListener: jest.fn(),
                clearUndo: jest.fn()
            },
            ScratchBlocks: {
                Events: {
                    disable: jest.fn(),
                    enable: jest.fn()
                },
                utils: {
                    xml: {
                        textToDom: jest.fn().mockReturnValue(document.createElement('xml'))
                    }
                },
                clearWorkspaceAndLoadFromXml: jest.fn()
            }
        };
    });

    test('Events.enable() is called after a successful workspace load', () => {
        Blocks.prototype.onWorkspaceUpdate.call(instance, {xml: '<xml/>'});

        expect(instance.ScratchBlocks.Events.disable).toHaveBeenCalled();
        expect(instance.ScratchBlocks.Events.enable).toHaveBeenCalled();
    });

    test('Events.enable() is called even when clearWorkspaceAndLoadFromXml throws', () => {
        instance.ScratchBlocks.clearWorkspaceAndLoadFromXml.mockImplementation(() => {
            throw new Error('workspace load failed');
        });

        Blocks.prototype.onWorkspaceUpdate.call(instance, {xml: '<xml/>'});

        expect(instance.ScratchBlocks.Events.disable).toHaveBeenCalled();
        expect(instance.ScratchBlocks.Events.enable).toHaveBeenCalled();
    });

    test('Events.enable() is called even when textToDom throws', () => {
        instance.ScratchBlocks.utils.xml.textToDom.mockImplementation(() => {
            throw new Error('XML parse failed');
        });

        Blocks.prototype.onWorkspaceUpdate.call(instance, {xml: 'invalid xml'});

        expect(instance.ScratchBlocks.Events.disable).toHaveBeenCalled();
        expect(instance.ScratchBlocks.Events.enable).toHaveBeenCalled();
    });
});

describe('Blocks container McRemote block picker integration', () => {
    test('installs a clickable picker field on setBlock and setBlocks', () => {
        const openPicker = jest.fn();
        const setBlockDefinition = {init: jest.fn()};
        const setBlocksDefinition = {init: jest.fn()};
        const instance = {
            handleMcRemoteBlockPickerStart: openPicker,
            ScratchBlocks: {
                Blocks: {
                    mcremote_setBlock: setBlockDefinition,
                    mcremote_setBlocks: setBlocksDefinition
                }
            }
        };

        Blocks.prototype.installMcRemoteBlockPicker.call(instance, {id: 'mcremote'});
        const clickHandlers = [];
        const block = {
            getField: jest.fn().mockReturnValue({
                setOnClickHandler: handler => clickHandlers.push(handler)
            })
        };
        setBlockDefinition.init.call(block);
        setBlocksDefinition.init.call(block);

        expect(clickHandlers).toHaveLength(2);
        clickHandlers[0]();
        expect(openPicker).toHaveBeenCalledWith(block);
    });

    test('opens on two literal fields and applies both values in one Blockly event group', () => {
        const blockIdField = {
            getValue: jest.fn().mockReturnValue('stone'),
            setValue: jest.fn()
        };
        const stateField = {
            getValue: jest.fn().mockReturnValue(''),
            setValue: jest.fn()
        };
        const instance = {
            state: {mcRemoteBlockPicker: null},
            ScratchBlocks: {Events: {setGroup: jest.fn()}},
            setState: jest.fn(update => {
                instance.state = Object.assign({}, instance.state, update);
            }),
            handleMcRemoteBlockPickerClose: jest.fn()
        };
        const block = {
            getInput: jest.fn(name => ({
                connection: {targetBlock: () => ({
                    isShadow: () => true,
                    getField: () => (name === 'BLOCK' ? blockIdField : stateField)
                })}
            }))
        };

        Blocks.prototype.handleMcRemoteBlockPickerStart.call(instance, block);
        expect(instance.state.mcRemoteBlockPicker.initialBlockId).toBe('stone');
        expect(instance.state.mcRemoteBlockPicker.initialStateText).toBe('');
        Blocks.prototype.handleMcRemoteBlockPickerApply.call(instance, 'oak_log', 'axis=z');
        expect(blockIdField.setValue).toHaveBeenCalledWith('oak_log');
        expect(stateField.setValue).toHaveBeenCalledWith('axis=z');
        expect(instance.ScratchBlocks.Events.setGroup.mock.calls).toEqual([[true], [false]]);
        expect(instance.handleMcRemoteBlockPickerClose).toHaveBeenCalled();
    });

    test('does not expose a reporter as an editable picker field', () => {
        const instance = {
            setState: jest.fn()
        };
        const reporter = {
            isShadow: () => false,
            getField: jest.fn()
        };
        const stateField = {getValue: jest.fn().mockReturnValue(''), setValue: jest.fn()};
        const block = {
            getInput: name => ({connection: {targetBlock: () => (
                name === 'BLOCK' ? reporter : {isShadow: () => true, getField: () => stateField}
            )}})
        };

        Blocks.prototype.handleMcRemoteBlockPickerStart.call(instance, block);
        expect(instance.setState).toHaveBeenCalledWith({
            mcRemoteBlockPicker: {
                blockIdField: null,
                stateField,
                initialBlockId: '',
                initialStateText: ''
            }
        });
        expect(reporter.getField).not.toHaveBeenCalled();
    });
});
