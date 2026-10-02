import configureWorkspaceZoom from '../../../src/lib/configure-workspace-zoom';

const makeWorkspace = () => {
    const workspace = {resizesEnabled: true, scrollX: 0};
    workspace.resizeContents = jest.fn(() => {
        if (workspace.resizesEnabled) workspace.scrollX = Math.min(workspace.scrollX, 100);
    });
    workspace.setResizesEnabled = jest.fn(enabled => {
        const reenabled = !workspace.resizesEnabled && enabled;
        workspace.resizesEnabled = enabled;
        if (reenabled) workspace.resizeContents();
    });
    workspace.zoom = jest.fn((_x, _y, amount) => {
        // Blockly stores canvas translation until setScale removes the flyout offset.
        workspace.scrollX = 350;
        workspace.resizeContents();
        workspace.scrollX -= 350;
        return amount;
    });
    return workspace;
};

describe('configureWorkspaceZoom', () => {
    test('does not clip canvas translation before it becomes a viewport scroll offset', () => {
        const workspace = makeWorkspace();
        const zoom = workspace.zoom;
        configureWorkspaceZoom(workspace);

        expect(workspace.zoom(600, 300, 1)).toBe(1);

        expect(zoom).toHaveBeenCalledWith(600, 300, 1);
        expect(zoom.mock.contexts[0]).toBe(workspace);
        expect(workspace.scrollX).toBe(0);
        expect(workspace.resizesEnabled).toBe(true);
        expect(workspace.resizeContents).toHaveBeenCalledTimes(2);
    });

    test('preserves resizing disabled by an outer workspace operation', () => {
        const workspace = makeWorkspace();
        workspace.resizesEnabled = false;
        configureWorkspaceZoom(workspace);

        workspace.zoom(600, 300, -1);

        expect(workspace.scrollX).toBe(0);
        expect(workspace.resizesEnabled).toBe(false);
        expect(workspace.resizeContents).toHaveBeenCalledTimes(1);
    });

    test('restores resizing and propagates a zoom failure', () => {
        const workspace = makeWorkspace();
        const failure = new Error('Zoom failed');
        workspace.zoom = jest.fn(() => {
            throw failure;
        });
        configureWorkspaceZoom(workspace);

        expect(() => workspace.zoom(600, 300, 1)).toThrow(failure);

        expect(workspace.resizesEnabled).toBe(true);
        expect(workspace.resizeContents).toHaveBeenCalledTimes(1);
    });
});
