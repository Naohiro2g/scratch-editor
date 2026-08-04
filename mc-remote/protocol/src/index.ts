/**
 * `@mc-remote/protocol` — the McRemote wire contract as TypeScript types and
 * constants. A dependency-free leaf: a mirror of mc-remote-knowledge 10-protocol
 * (the SSOT) shared by the bridge and the live observer. The scratch-vm
 * extension does not import this package; it keeps the same constants inline
 * because it is baked into scratch-vm at build time.
 */
export * from './version.ts'
export * from './envelope.ts'
export * from './methods.ts'
export * from './commands.ts'
export * from './errors.ts'
export * from './hello.ts'
export * from './catalog.ts'
