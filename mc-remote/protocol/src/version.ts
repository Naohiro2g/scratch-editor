/**
 * Protocol semver advertised in the `hello` handshake (wire-format-design §6.1).
 *
 * This is the clean protocol contract version. The package/distribution channel
 * suffix (e.g. the `b5` of `2200.0.0b5`) is never put on the wire; compatibility
 * is negotiated on the major/minor of this value alone (versioning-design §8).
 */
export const PROTOCOL_VERSION = '22.0.0'
