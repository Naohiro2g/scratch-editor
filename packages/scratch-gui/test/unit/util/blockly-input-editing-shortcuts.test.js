import allowNativeBlocklyInputEditingShortcut from '../../../src/lib/blockly-input-editing-shortcuts';

describe('Blockly input editing shortcuts', () => {
    let input;

    beforeEach(() => {
        input = document.createElement('input');
        input.className = 'blocklyHtmlInput';
        document.body.appendChild(input);
        document.addEventListener('keydown', allowNativeBlocklyInputEditingShortcut, true);
    });

    afterEach(() => {
        document.removeEventListener('keydown', allowNativeBlocklyInputEditingShortcut, true);
        input.remove();
    });

    test.each([
        ['copy', 'c', {ctrlKey: true}],
        ['paste', 'v', {ctrlKey: true}],
        ['cut', 'x', {ctrlKey: true}],
        ['select all', 'a', {ctrlKey: true}],
        ['copy on macOS', 'c', {metaKey: true}]
    ])('%s reaches the browser without Blockly cancelling it', (_action, key, flags) => {
        const upstreamHandler = jest.fn(event => event.preventDefault());
        input.addEventListener('keydown', upstreamHandler);
        const event = new KeyboardEvent('keydown', Object.assign({bubbles: true, cancelable: true, key}, flags));
        input.dispatchEvent(event);
        expect(upstreamHandler).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    test('ordinary numeric input still reaches Blockly', () => {
        const upstreamHandler = jest.fn();
        input.addEventListener('keydown', upstreamHandler);
        input.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, key: '1'}));
        expect(upstreamHandler).toHaveBeenCalledTimes(1);
    });
});
