import configurePaletteNavigation from '../../../src/lib/configure-palette-navigation';

const setup = () => {
    const root = document.createElement('div');
    const category = document.createElement('div');
    const label = document.createElement('span');
    category.appendChild(label);
    root.appendChild(category);
    document.body.appendChild(root);
    let dragging = false;
    const item = {isSelectable: () => true, getDiv: () => category};
    const workspace = {
        isDragging: () => dragging,
        getToolbox: () => ({getFocusableElement: () => root,
            getToolboxItems: () => [item],
            getSelectedItem: () => item})
    };
    const expand = jest.fn();
    const toggle = jest.fn();
    const dispose = configurePaletteNavigation(workspace, {expand, toggle});
    return {root,
        label,
        expand,
        toggle,
        dispose,
        drag: value => {
            dragging = value;
        }};
};

afterEach(() => {
    document.body.innerHTML = '';
});

test('category activation opens before its normal handler and also works for the selected category', () => {
    const {root, label, expand, toggle, dispose} = setup();
    root.addEventListener('pointerdown', () => expect(expand).toHaveBeenCalled());
    label.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true, button: 0}));
    label.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true, button: 0}));
    expect(expand).toHaveBeenCalledTimes(2);
    label.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, button: 0}));
    expect(toggle).not.toHaveBeenCalled();
    dispose();
});

test('only blank-space double click toggles; controls and scrollbar do not', () => {
    const {root, toggle, dispose} = setup();
    root.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, button: 0}));
    expect(toggle).toHaveBeenCalledTimes(1);
    const button = document.createElement('button'); root.appendChild(button);
    button.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, button: 0}));
    expect(toggle).toHaveBeenCalledTimes(1);
    Object.defineProperties(root, {
        scrollHeight: {value: 1000}, clientHeight: {value: 800}, clientWidth: {value: 50}, offsetWidth: {value: 60}
    });
    root.getBoundingClientRect = () => ({left: 0, right: 60});
    root.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, button: 0, clientX: 55}));
    expect(toggle).toHaveBeenCalledTimes(1);
    dispose();
});

test('dragging and dropping cannot activate a category or toggle; keyboard selection opens', () => {
    const {root, label, expand, toggle, drag, dispose} = setup();
    drag(true);
    label.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true, button: 0}));
    root.dispatchEvent(new MouseEvent('dblclick', {bubbles: true, button: 0}));
    expect(expand).not.toHaveBeenCalled(); expect(toggle).not.toHaveBeenCalled();
    drag(false);
    label.dispatchEvent(new MouseEvent('pointerup', {bubbles: true, button: 0}));
    label.click();
    expect(expand).not.toHaveBeenCalled();
    root.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    expect(expand).toHaveBeenCalledTimes(1);
    dispose();
    root.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    expect(expand).toHaveBeenCalledTimes(1);
});
