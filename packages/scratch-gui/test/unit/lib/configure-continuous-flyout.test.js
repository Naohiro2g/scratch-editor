import configureContinuousFlyout from '../../../src/lib/configure-continuous-flyout';

const makeScratchBlocks = () => {
    const baseFlyoutPrototype = {
        onMouseDown: jest.fn()
    };
    const verticalFlyoutPrototype = Object.create(baseFlyoutPrototype);
    verticalFlyoutPrototype.wheel_ = jest.fn();
    const continuousFlyoutPrototype = Object.create(verticalFlyoutPrototype);
    continuousFlyoutPrototype.show = jest.fn();
    const checkableContinuousFlyoutPrototype = Object.create(continuousFlyoutPrototype);

    return {
        ScratchBlocks: {
            CheckableContinuousFlyout: {
                prototype: checkableContinuousFlyoutPrototype
            }
        },
        baseFlyoutPrototype,
        verticalFlyoutPrototype,
        continuousFlyoutPrototype,
        checkableContinuousFlyoutPrototype
    };
};

describe('configureContinuousFlyout', () => {
    test('uses a fixed 350px flyout width', () => {
        const {ScratchBlocks, checkableContinuousFlyoutPrototype} = makeScratchBlocks();

        configureContinuousFlyout(ScratchBlocks);

        expect(checkableContinuousFlyoutPrototype.getWidth()).toBe(350);
    });

    test('a wheel operation cancels category auto-scroll before scrolling', () => {
        const {ScratchBlocks, verticalFlyoutPrototype, checkableContinuousFlyoutPrototype} = makeScratchBlocks();
        const flyout = Object.create(checkableContinuousFlyoutPrototype);
        const event = {};
        flyout.scrollTarget = 400;

        configureContinuousFlyout(ScratchBlocks);
        flyout.wheel_(event);

        expect(flyout.scrollTarget).toBeUndefined();
        expect(verticalFlyoutPrototype.wheel_).toHaveBeenCalledWith(event);
    });

    test('a flyout drag cancels category auto-scroll before dragging', () => {
        const {ScratchBlocks, baseFlyoutPrototype, checkableContinuousFlyoutPrototype} = makeScratchBlocks();
        const flyout = Object.create(checkableContinuousFlyoutPrototype);
        const event = {};
        flyout.scrollTarget = 400;

        configureContinuousFlyout(ScratchBlocks);
        flyout.onMouseDown(event);

        expect(flyout.scrollTarget).toBeUndefined();
        expect(baseFlyoutPrototype.onMouseDown).toHaveBeenCalledWith(event);
    });

    test('rerendering cancels a stale category auto-scroll target', () => {
        const {ScratchBlocks, continuousFlyoutPrototype, checkableContinuousFlyoutPrototype} = makeScratchBlocks();
        const flyout = Object.create(checkableContinuousFlyoutPrototype);
        const definition = {};
        flyout.scrollTarget = 400;

        configureContinuousFlyout(ScratchBlocks);
        flyout.show(definition);

        expect(flyout.scrollTarget).toBeUndefined();
        expect(continuousFlyoutPrototype.show).toHaveBeenCalledWith(definition);
    });
});
