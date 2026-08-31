/**
 * Single source of truth for the McRemote Scratch client's diagnostic/display
 * version label (e.g. `2301.0.0b7`), bumped alongside each McRemote protocol
 * release. Kept in its own file, separate from the extension module itself,
 * so it can be imported (by scratch-vm's package entry, and from there by
 * scratch-gui) without eagerly loading the McRemote extension class.
 * @type {string}
 */
module.exports = '2301.0.0b7';
