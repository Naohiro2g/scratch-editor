/**
 * Defer content resizing until zoom has converted canvas translation to scroll offsets.
 * Flyout reflow can otherwise clamp the translation before the toolbox offset is removed.
 * @param {object} workspace Blockly workspace
 */
const configureWorkspaceZoom = function (workspace) {
    const zoom = workspace.zoom;
    workspace.zoom = function (x, y, amount) {
        const resizesEnabled = this.resizesEnabled;
        this.setResizesEnabled(false);
        try {
            return zoom.call(this, x, y, amount);
        } finally {
            this.setResizesEnabled(resizesEnabled);
        }
    };
};

export default configureWorkspaceZoom;
