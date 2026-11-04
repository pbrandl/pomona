// One file per area of the app; keys must match i18n/de (npm test checks).
import core from './core.js'
import agent from './agent.js'
import ui from './ui.js'

export default { ...core, agent, ...ui }
