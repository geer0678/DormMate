// The build script puts the complete bootstrap before this MQTT.js phase.
const root = globalThis
if (typeof root.AbortController !== 'function' || typeof self.AbortController !== 'function' ||
    typeof window.AbortController !== 'function' || typeof root.navigator === 'undefined') {
  throw new Error('MQTT.js 微信小程序运行时初始化失败')
}
module.exports = require('../node_modules/mqtt/build/index.js')
