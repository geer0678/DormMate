// esbuild inject binds free global names used by MQTT.js and @jspm/core.
// WeChat modules do not necessarily expose globalThis properties as free names.
export const self = globalThis
export const window = globalThis
export const global = globalThis
