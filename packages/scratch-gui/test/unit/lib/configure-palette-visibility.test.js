import {MetricsManager, Scrollbar, utils} from 'blockly/core';

import configurePaletteVisibility from '../../../src/lib/configure-palette-visibility';

const panel = width => ({getWidth: () => width, position: jest.fn(), setVisible: jest.fn(), getFocusableElement: () => document.createElement('div')});

test('collapsing releases toolbox and flyout width and stays collapsed across toolbox updates', () => {
    const toolbox = panel(60);
    const flyout = panel(300);
    const workspace = {
        scrollX: 0,
        scrollY: 0,
        getMetricsManager: () => ({getScrollMetrics: jest.fn()}),
        getMetrics: () => ({absoluteLeft: toolbox.getWidth() + flyout.getWidth(), absoluteTop: 0}),
        getToolbox: () => toolbox,
        getFlyout: () => flyout,
        resize: jest.fn()
    };
    const toolboxVisibility = toolbox.setVisible;
    const flyoutVisibility = flyout.setVisible;
    const setCollapsed = configurePaletteVisibility(workspace);
    setCollapsed(true, false);
    expect(toolbox.getWidth()).toBe(0);
    expect(flyout.getWidth()).toBe(0);
    expect(toolboxVisibility).toHaveBeenLastCalledWith(false);
    expect(flyoutVisibility).toHaveBeenLastCalledWith(false);
    flyout.setVisible(true);
    expect(flyoutVisibility).toHaveBeenLastCalledWith(false);
    expect(workspace.resize).toHaveBeenCalledTimes(1);
    setCollapsed(false, false);
    expect(toolbox.getWidth()).toBe(60);
    expect(flyout.getWidth()).toBe(300);
    expect(toolboxVisibility).toHaveBeenLastCalledWith(true);
    expect(flyoutVisibility).toHaveBeenLastCalledWith(true);
    expect(workspace.resize).toHaveBeenCalledTimes(2);
});


test('closing slides before releasing width; reversal cancels stale closing completion', async () => {
    window.matchMedia = jest.fn(() => ({matches: false}));
    const finished = [];
    const elements = [document.createElement('div'), document.createElement('div')];
    elements.forEach(element => {
        element.animate = jest.fn(() => {
            let resolve;
            const promise = new Promise(done => {
                resolve = done;
            });
            finished.push(resolve);
            return {finished: promise, cancel: jest.fn()};
        });
    });
    const toolbox = {...panel(60), getFocusableElement: () => elements[0]};
    const flyout = {...panel(300),
        getFocusableElement: () => {
            throw new Error('Flyouts are not directly focusable');
        },
        getWorkspace: () => ({getParentSvg: () => elements[1]})};
    const workspace = {
        scrollX: 0,
        scrollY: 0,
        getMetricsManager: () => ({getScrollMetrics: jest.fn()}),
        getMetrics: () => ({absoluteLeft: toolbox.getWidth() + flyout.getWidth(), absoluteTop: 0}),
        getToolbox: () => toolbox,
        getFlyout: () => flyout,
        resize: jest.fn()
    };
    const toggle = configurePaletteVisibility(workspace);
    toggle(true);
    expect(toolbox.getWidth()).toBe(60);
    expect(elements[0].animate.mock.calls[0][0][1].translate).toBe('-360px');
    const closing = elements[0].animate.mock.results[0].value;
    toggle(false);
    expect(closing.cancel).toHaveBeenCalled();
    finished.forEach(resolve => resolve());
    await Promise.resolve();
    await Promise.resolve();
    expect(toolbox.getWidth()).toBe(60);
    toggle(true);
    finished.slice(-2).forEach(resolve => resolve());
    await Promise.resolve();
    await Promise.resolve();
    expect(toolbox.getWidth()).toBe(0);
    toggle(false);
    expect(toolbox.getWidth()).toBe(60);
    toggle.dispose();
});


test('reduced motion applies visibility immediately', () => {
    window.matchMedia = jest.fn(() => ({matches: true}));
    const toolbox = panel(60);
    const flyout = panel(300);
    const workspace = {
        scrollX: 0,
        scrollY: 0,
        getMetricsManager: () => ({getScrollMetrics: jest.fn()}),
        getMetrics: () => ({absoluteLeft: toolbox.getWidth() + flyout.getWidth(), absoluteTop: 0}),
        getToolbox: () => toolbox,
        getFlyout: () => flyout,
        resize: jest.fn()
    };
    const toggle = configurePaletteVisibility(workspace);
    toggle(true);
    expect(toolbox.getWidth()).toBe(0);
    expect(flyout.getWidth()).toBe(0);
    expect(workspace.resize).toHaveBeenCalledTimes(1);
});


test('palette resizing keeps scripts at the same horizontal screen position', () => {
    const toolbox = panel(60);
    const flyout = panel(300);
    const workspace = {
        scrollX: 25,
        scrollY: -10,
        getToolbox: () => toolbox,
        getFlyout: () => flyout,
        getMetricsManager: () => ({getScrollMetrics: jest.fn()}),
        getMetrics: () => ({absoluteLeft: toolbox.getWidth() + flyout.getWidth(), absoluteTop: 0}),
        resize: jest.fn()
    };
    const originalX = workspace.scrollX + workspace.getMetrics().absoluteLeft;
    workspace.resize.mockImplementation(() => {
        expect(workspace.scrollX + workspace.getMetrics().absoluteLeft).toBe(originalX);
        expect(workspace.scrollY).toBe(-10);
    });
    const toggle = configurePaletteVisibility(workspace);
    toggle(true, false);
    toggle(false, false);
});

test.each([
    ['left', 0, 400],
    ['right', 900, -290],
    ['far right', 1600, -800]
])('palette resizing preserves scripts at the %s edge through Blockly scrollbar updates', (_edge, contentLeft, scrollX) => {
    let toolboxWidth = 60;
    let toolboxVisible = true;
    const toolbox = {
        ...panel(60),
        getWidth: () => toolboxWidth,
        setVisible: visible => {
            toolboxVisible = visible;
        },
        position: () => {
            toolboxWidth = toolboxVisible ? 60 : 0;
        }
    };
    const flyout = panel(300);
    const workspace = {
        scale: 0.75,
        scrollX,
        scrollY: -10,
        getToolbox: () => toolbox,
        getFlyout: () => flyout,
        isMovableHorizontally: () => true,
        isMovableVertically: () => true,
        getBlocksBoundingBox: () => ({left: contentLeft, right: contentLeft + 1600, top: 100, bottom: 300})
    };
    const metrics = new MetricsManager(workspace);
    metrics.getSvgMetrics = () => ({width: 1200, height: 800});
    metrics.getToolboxMetrics = () => ({width: toolbox.getWidth(), height: 800, position: utils.toolbox.Position.LEFT});
    metrics.getFlyoutMetrics = () => ({width: flyout.getWidth(), height: 800, position: utils.toolbox.Position.LEFT});
    workspace.getMetricsManager = () => metrics;
    workspace.getMetrics = () => metrics.getMetrics();
    // Use Blockly's handle sizing, clamping and scroll-ratio conversion.
    const scrollbar = Object.create(Scrollbar.prototype);
    Object.assign(scrollbar, {
        workspace,
        horizontal: true,
        pair: true,
        margin: 0.5,
        oldHostMetrics: null,
        svgHandle: document.createElement('div'),
        svgBackground: document.createElement('div'),
        outerSvg: document.createElement('div'),
        position: {x: 0, y: 0},
        origin: {x: 0, y: 0}
    });
    workspace.setMetrics = ({x}) => {
        const current = workspace.getMetrics();
        workspace.scrollX = -(current.scrollLeft + ((current.scrollWidth - current.viewWidth) * x));
    };
    workspace.resize = () => {
        // Blockly measures the toolbox DOM width while laying out the workspace.
        toolbox.position();
        scrollbar.resize();
    };
    const originalX = workspace.scrollX + workspace.getMetrics().absoluteLeft;
    const toggle = configurePaletteVisibility(workspace);
    for (let i = 0; i < 3; i++) {
        toggle(true, false);
        expect(workspace.scrollX + workspace.getMetrics().absoluteLeft).toBeCloseTo(originalX);
        workspace.resize();
        expect(workspace.scrollX + workspace.getMetrics().absoluteLeft).toBeCloseTo(originalX);
        toggle(false, false);
        expect(workspace.scrollX + workspace.getMetrics().absoluteLeft).toBeCloseTo(originalX);
        workspace.resize();
        expect(workspace.scrollX + workspace.getMetrics().absoluteLeft).toBeCloseTo(originalX);
        expect(workspace.scrollY).toBe(-10);
    }
    // The user can move scripts into the space freed by the collapsed palette.
    toggle(true, false);
    workspace.scrollX = -contentLeft * workspace.scale;
    const movedX = workspace.scrollX;
    toggle(false, false);
    expect(workspace.scrollX + workspace.getMetrics().absoluteLeft).toBeCloseTo(movedX);
    const pixels = metrics.getScrollMetrics();
    const coordinates = metrics.getScrollMetrics(true);
    expect(coordinates.left).toBeCloseTo(pixels.left / workspace.scale);
    expect(coordinates.width).toBeCloseTo(pixels.width / workspace.scale);
});
