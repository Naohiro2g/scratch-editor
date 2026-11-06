import configureContinuousFlyout from '../../../src/lib/configure-continuous-flyout';

const makeScratchBlocks = () => {
    const baseFlyoutPrototype = {
        onMouseDown: jest.fn()
    };
    const verticalFlyoutPrototype = Object.create(baseFlyoutPrototype);
    verticalFlyoutPrototype.wheel_ = jest.fn();
    const continuousFlyoutPrototype = Object.create(verticalFlyoutPrototype);
    continuousFlyoutPrototype.show = jest.fn();
    continuousFlyoutPrototype.scrollTo = jest.fn();
    const checkableContinuousFlyoutPrototype = Object.create(continuousFlyoutPrototype);
    checkableContinuousFlyoutPrototype.scrollTo = function (position) {
        return continuousFlyoutPrototype.scrollTo.call(this, Math.ceil(position));
    };

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
    test('uses current scrollbar bounds when scrolling to a category after layout changes', () => {
        const {ScratchBlocks, continuousFlyoutPrototype, checkableContinuousFlyoutPrototype} = makeScratchBlocks();
        const flyout = Object.create(checkableContinuousFlyoutPrototype);
        let measuredHeight = 8000;
        let scrollTop = 0;
        const workspace = {
            scrollbar: {
                resize: () => {
                    measuredHeight = 7991.9;
                },
                setY (position) {
                    scrollTop = position * 7991.9 / measuredHeight;
                }
            }
        };
        flyout.getWorkspace = () => workspace;
        continuousFlyoutPrototype.scrollTo.mockImplementation(workspace.scrollbar.setY);

        configureContinuousFlyout(ScratchBlocks);
        flyout.scrollTo(5800.1);

        expect(scrollTop).toBe(5801);
        expect(continuousFlyoutPrototype.scrollTo.mock.contexts[0]).toBe(flyout);
    });

    test('refreshes category scrolling after later layout changes and repeated configuration', () => {
        const {ScratchBlocks, continuousFlyoutPrototype, checkableContinuousFlyoutPrototype} = makeScratchBlocks();
        const flyout = Object.create(checkableContinuousFlyoutPrototype);
        let actualHeight = 7991.9;
        let measuredHeight = 8000;
        let scrollTop = 0;
        const workspace = {
            scrollbar: {
                resize: () => {
                    measuredHeight = actualHeight;
                },
                setY (position) {
                    scrollTop = position * actualHeight / measuredHeight;
                }
            }
        };
        flyout.getWorkspace = () => workspace;
        continuousFlyoutPrototype.scrollTo.mockImplementation(workspace.scrollbar.setY);

        configureContinuousFlyout(ScratchBlocks);
        flyout.scrollTo(5800);
        actualHeight = 9200;
        configureContinuousFlyout(ScratchBlocks);
        flyout.scrollTo(7000);

        expect(scrollTop).toBe(7000);
        expect(continuousFlyoutPrototype.scrollTo).toHaveBeenCalledTimes(2);
    });

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
