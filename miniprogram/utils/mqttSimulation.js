'use strict'

const { randomUUID } = require('node:crypto')
const { createMessage } = require('./mqttMessage')

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

function createNodeMessage(nodeId, sequence, options = {}) {
  const node = NODE_MAP.get(nodeId)
  if (!node) throw new Error('不支持的模拟节点: ' + nodeId)
  if (!Number.isInteger(sequence) || sequence < 0) throw new Error('sequence 必须是非负整数')
  const variation = VARIATIONS[sequence % VARIATIONS.length]
  return createMessage({
    nodeId,
    temperature: node.temperature + variation.temperature,
    humidity: node.humidity + variation.humidity,
    recordId: options.recordId === undefined ? randomUUID() : options.recordId,
    time: options.time === undefined ? new Date().toISOString() : options.time
  })
}

module.exports = { NODES, VARIATIONS, createNodeMessage }
