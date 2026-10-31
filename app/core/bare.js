/**
 * Bare entry of the Pomona core (used by the Pear worker). Same code as Node,
 * with Node builtins mapped to their bare-* modules, as WDK's own packages do.
 * @module core/bare
 */
import 'bare-node-runtime/global'

export * from './index.js' with { imports: 'bare-node-runtime/imports' }
