// Bare entry point (used by the Pear worker). Same code as Node, with Node
// builtins mapped to their bare-* equivalents, the way WDK's own modules do it.
import 'bare-node-runtime/global'

export * from './pomona.js' with { imports: 'bare-node-runtime/imports' }
export * from './rpc.js' with { imports: 'bare-node-runtime/imports' }
