const VirtualMachine = require('./virtual-machine');

const ArgumentType = require('./extension-support/argument-type');
const BlockType = require('./extension-support/block-type');
const MCREMOTE_CLIENT_VERSION = require('./extensions/scratch3_mcremote/client-version');

module.exports = VirtualMachine;

// TODO: ESM named exports will save us all
module.exports.ArgumentType = ArgumentType;
module.exports.BlockType = BlockType;
// A plain string constant, not the McRemote extension class itself, so importing it never
// eagerly loads that extension (extension-manager.js loads it lazily, only when connected).
module.exports.MCREMOTE_CLIENT_VERSION = MCREMOTE_CLIENT_VERSION;
