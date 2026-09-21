const FLYOUT_WIDTH = 350;

/**
 * Configure Scratch's continuous flyout for the editor.
 * @param {object} ScratchBlocks Scratch Blocks module
 */
const configureContinuousFlyout = function (ScratchBlocks) {
    const flyoutPrototype = ScratchBlocks.CheckableContinuousFlyout.prototype;
    const continuousFlyoutPrototype = Object.getPrototypeOf(flyoutPrototype);
    const verticalFlyoutPrototype = Object.getPrototypeOf(continuousFlyoutPrototype);
    const baseFlyoutPrototype = Object.getPrototypeOf(verticalFlyoutPrototype);

    flyoutPrototype.getWidth = () => FLYOUT_WIDTH;

    // The continuous-toolbox animation otherwise keeps writing its target
    // position after the user starts scrolling, which overrides manual input.
    flyoutPrototype.wheel_ = function (event) {
        delete this.scrollTarget;
        return verticalFlyoutPrototype.wheel_.call(this, event);
    };

    flyoutPrototype.onMouseDown = function (event) {
        delete this.scrollTarget;
        return baseFlyoutPrototype.onMouseDown.call(this, event);
    };

    flyoutPrototype.show = function (flyoutDefinition) {
        delete this.scrollTarget;
        return continuousFlyoutPrototype.show.call(this, flyoutDefinition);
    };
};

export default configureContinuousFlyout;
