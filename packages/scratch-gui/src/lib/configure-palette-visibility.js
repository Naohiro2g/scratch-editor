import {Toolbox} from 'blockly/core';

const DURATION_MS = 180;

/**
 * Keep Blockly's layout metrics in sync with the palette's visibility.
 * @param {object} workspace editor workspace.
 * @returns {function(boolean, boolean=): void} collapse or expand the palette; dispose cancels animations.
 */
const configurePaletteVisibility = workspace => {
    const metricsManager = workspace.getMetricsManager();
    const getScrollMetrics = metricsManager.getScrollMetrics;
    // Resizing the palette must not clamp the current viewport to the content bounds.
    metricsManager.getScrollMetrics = function (workspaceCoordinates, viewMetrics, contentMetrics) {
        const metrics = getScrollMetrics.call(this, workspaceCoordinates, viewMetrics, contentMetrics);
        const view = viewMetrics || this.getViewMetrics();
        const scale = workspaceCoordinates ? workspace.scale : 1;
        const left = Math.min(metrics.left, view.left / scale);
        const right = Math.max(metrics.left + metrics.width, (view.left + view.width) / scale);
        return {...metrics, left, width: right - left};
    };
    let collapsed = false;
    let animations = [];
    let generation = 0;
    const toolbox = workspace.getToolbox();
    const flyout = workspace.getFlyout();
    const getClientRect = toolbox.getClientRect;
    toolbox.getClientRect = function () {
        return collapsed ? Toolbox.prototype.getClientRect.call(this) : getClientRect.call(this);
    };
    const configurePanel = panel => {
        const getWidth = panel.getWidth;
        const setVisible = panel.setVisible;
        panel.getWidth = function () {
            return collapsed ? 0 : getWidth.call(this);
        };
        // Toolbox refreshes can show the flyout again after a sprite or locale change.
        panel.setVisible = function (visible) {
            setVisible.call(this, visible && !collapsed);
        };
    };
    configurePanel(flyout);
    const apply = value => {
        const before = workspace.getMetrics();
        const canvasX = workspace.scrollX + before.absoluteLeft;
        const canvasY = workspace.scrollY + before.absoluteTop;
        collapsed = value;
        flyout.setVisible(!collapsed);
        toolbox.position();
        const after = workspace.getMetrics();
        // Blockly adds the palette offset to the canvas translation.
        workspace.scrollX = canvasX - after.absoluteLeft;
        workspace.scrollY = canvasY - after.absoluteTop;
        workspace.resize();
    };
    const cancel = () => {
        generation++;
        animations.forEach(animation => animation.cancel());
        animations = [];
    };
    let targetCollapsed = false;
    const setCollapsed = (value, animate = true) => {
        const immediate = !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!animations.length && value === collapsed) return;
        if (!immediate && animations.length && value === targetCollapsed) return;
        targetCollapsed = value;
        const elements = [];
        if (!immediate) {
            elements.push(flyout.getWorkspace().getParentSvg());
        }
        const reversing = animations.length > 0;
        const starts = reversing ? elements.map(element => getComputedStyle(element).translate) : [];
        cancel();
        if (immediate) {
            apply(value);
            return;
        }
        if (value === collapsed && !reversing) return;
        if (!value) apply(false);
        const distance = flyout.getWidth() * (workspace.RTL ? 1 : -1);
        const currentGeneration = generation;
        animations = elements.map((element, index) => element.animate([
            {translate: reversing ? starts[index] : value ? '0px' : `${distance}px`},
            {translate: value ? `${distance}px` : '0px'}
        ], {duration: DURATION_MS, easing: 'ease-out'}));
        Promise.all(animations.map(animation => animation.finished)).then(() => {
            if (currentGeneration !== generation) return;
            animations = [];
            if (value) apply(true);
        }, () => {});
    };
    setCollapsed.dispose = () => {
        cancel();
        toolbox.getClientRect = getClientRect;
    };
    return setCollapsed;
};

export default configurePaletteVisibility;
