// This phase runs to completion before any MQTT.js dependency is evaluated.
const root = globalThis
if (typeof root.self === 'undefined') root.self = root
if (typeof root.window === 'undefined') root.window = root
if (typeof root.global === 'undefined') root.global = root
require('abortcontroller-polyfill/dist/abortcontroller-polyfill-only')
// polyfillNode injects the official navigator shim as a free binding.
if (typeof root.navigator === 'undefined') root.navigator = navigator
if (typeof root.AbortController !== 'function' || typeof root.AbortSignal !== 'function' ||
    typeof self.AbortController !== 'function' || typeof window.AbortController !== 'function' ||
    typeof navigator === 'undefined') throw new Error('MQTT.js 微信小程序 bootstrap 未完成')
