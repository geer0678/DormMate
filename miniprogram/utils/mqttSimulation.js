;(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports
  const mqttMessage = isNode ? require('./mqttMessage') : root.DormMateMqttMessage
  const nodeRandomUUID = isNode ? require('node:crypto').randomUUID : null
  const api = factory(mqttMessage, root, nodeRandomUUID)
  if (isNode) module.exports = api
  if (typeof window !== 'undefined') window.DormMateMqttSimulation = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function (mqttMessage, root, nodeRandomUUID) {
  'use strict'
  if (!mqttMessage || typeof mqttMessage.createMessage !== 'function') throw new Error('DormMate MQTT 消息模块未加载')

const { createMessage } = mqttMessage
const VARIATIONS = Object.freeze([
  Object.freeze({ temperature: 0, humidity: 0 }),
  Object.freeze({ temperature: 0.2, humidity: -1 }),
  Object.freeze({ temperature: -0.1, humidity: 1 }),
  Object.freeze({ temperature: 0.1, humidity: -2 })
])
const NODES = Object.freeze([
  Object.freeze({ nodeId: 'dorm-a', temperature: 31, humidity: 78 }),
  Object.freeze({ nodeId: 'dorm-b', temperature: 25, humidity: 55 }),
  Object.freeze({ nodeId: 'dorm-c', temperature: 24, humidity: 80 })
])
const NODE_MAP = new Map(NODES.map(node => [node.nodeId, node]))

function newRecordId() {
  if (nodeRandomUUID) return nodeRandomUUID()
  const cryptoApi = root.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('')
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20)
  }
  throw new Error('当前浏览器缺少安全随机数支持')
}

function createNodeMessage(nodeId, sequence, options = {}) {
  const node = NODE_MAP.get(nodeId)
  if (!node) throw new Error('不支持的模拟节点: ' + nodeId)
  if (!Number.isInteger(sequence) || sequence < 0) throw new Error('sequence 必须是非负整数')
  const variation = VARIATIONS[sequence % VARIATIONS.length]
  return createMessage({
    nodeId,
    temperature: node.temperature + variation.temperature,
    humidity: node.humidity + variation.humidity,
    recordId: options.recordId === undefined ? newRecordId() : options.recordId,
    time: options.time === undefined ? new Date().toISOString() : options.time
  })
}

return { NODES, VARIATIONS, createNodeMessage }
})
