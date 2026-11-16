/**
 * Connect explicit category gestures to the palette state without treating block drops as clicks.
 * @param {object} workspace Blockly workspace.
 * @param {object} actions expand and toggle callbacks.
 * @param {function(): void} actions.expand open the flyout.
 * @param {function(): void} actions.toggle toggle the flyout.
 * @returns {function(): void} remove the gesture listeners.
 */
const configurePaletteNavigation = (workspace, {expand, toggle}) => {
    const toolbox = workspace.getToolbox();
    const root = toolbox.getFocusableElement();
    const categoryAt = target => toolbox.getToolboxItems().find(item =>
        item.isSelectable() && item.getDiv()?.contains(target));
    const pointerDown = event => {
        if (event.button === 0 && !workspace.isDragging() && categoryAt(event.target)) expand();
    };
    const keyDown = event => {
        if (!workspace.isDragging() && ['Enter', ' ', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) &&
            (categoryAt(event.target) || toolbox.getSelectedItem())) expand();
    };
    const doubleClick = event => {
        if (event.button !== 0 || workspace.isDragging() || categoryAt(event.target)) return;
        if (event.target.closest('button, input, select, [role="button"], [role="scrollbar"]')) return;
        if (root.scrollHeight > root.clientHeight) {
            const rect = root.getBoundingClientRect();
            const gutter = root.offsetWidth - root.clientWidth;
            if (workspace.RTL ? event.clientX < rect.left + gutter : event.clientX >= rect.right - gutter) return;
        }
        event.preventDefault();
        toggle();
    };
    root.addEventListener('pointerdown', pointerDown, true);
    root.addEventListener('keydown', keyDown, true);
    root.addEventListener('dblclick', doubleClick);
    return () => {
        root.removeEventListener('pointerdown', pointerDown, true);
        root.removeEventListener('keydown', keyDown, true);
        root.removeEventListener('dblclick', doubleClick);
    };
};

export default configurePaletteNavigation;
