/**
 * Single source of truth for the McRemote Scratch client's diagnostic/display
 * version label (e.g. `2321.1.0`), bumped for each Scratch McRemote release.
 * Kept in its own file, separate from the extension module itself,
 * so it can be imported (by scratch-vm's package entry, and from there by
 * scratch-gui) without eagerly loading the McRemote extension class.
 * @type {string}
 */
module.exports = '2321.1.0';
