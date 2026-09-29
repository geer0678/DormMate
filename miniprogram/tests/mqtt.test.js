'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const mqttMessage = require('../utils/mqttMessage')
const { NODES, createNodeMessage } = require('../utils/mqttSimulation')
const { startPublishers } = require('../scripts/mqtt-publishers')

const fixedTime = '2026-09-28T12:30:00.000Z'

test('Publisher Topic 使用单节点路径；+ 只允许出现在全节点订阅 Filter', () => {
  for (const { nodeId } of NODES) {
    const topic = mqttMessage.topicForNode(nodeId)
    assert.equal(topic, 'dormmate/' + nodeId + '/env')
    assert.equal(mqttMessage.nodeIdFromTopic(topic), nodeId)
    assert.deepEqual(mqttMessage.validateSubscriptionFilter(topic), { valid: true, nodeId, wildcard: false })
  }
  assert.deepEqual(mqttMessage.validateSubscriptionFilter('dormmate/+/env'), { valid: true, nodeId: null, wildcard: true })
  assert.throws(() => mqttMessage.topicForNode('+'))
  assert.equal(mqttMessage.nodeIdFromTopic('dormmate/+/env'), null)
  assert.equal(mqttMessage.validateSubscriptionFilter('dormmate/a/+/env').valid, false)
})

test('三节点输出字段合法且复用九状态规则的已验收结果', () => {
  const expected = { 'dorm-a': '偏热偏湿', 'dorm-b': '正常', 'dorm-c': '偏湿' }
  for (const { nodeId } of NODES) {
    const message = createNodeMessage(nodeId, 0, { recordId: '123e4567-e89b-42d3-a456-426614174000', time: fixedTime })
    const topic = mqttMessage.topicForNode(nodeId)
    assert.deepEqual(Object.keys(message), mqttMessage.REQUIRED_FIELDS)
    assert.equal(message.schemaVersion, 1)
    assert.equal(message.nodeId, nodeId)
    assert.equal(message.status, expected[nodeId])
    assert.equal(mqttMessage.validateMessage(topic, JSON.stringify(message)).valid, true)
  }
})

test('坏 JSON、非法 Topic/JSON nodeId、状态伪造、时间及传感器数值都被拒绝', () => {
  assert.equal(mqttMessage.validateMessage('dormmate/dorm-a/env', '{broken').valid, false)
  assert.equal(mqttMessage.validateMessage('dormmate/+/env', '{}').valid, false)
  const message = createNodeMessage('dorm-a', 0, { recordId: '123e4567-e89b-42d3-a456-426614174000', time: fixedTime })
  assert.match(mqttMessage.validateMessage('dormmate/dorm-b/env', JSON.stringify(message)).error, /不一致/)
  assert.equal(mqttMessage.validateMessage('dormmate/dorm-a/env', JSON.stringify({ ...message, nodeId: '+' })).valid, false)
  assert.match(mqttMessage.validateMessage('dormmate/dorm-a/env', JSON.stringify({ ...message, status: '偏热' })).error, /九状态/)
  assert.equal(mqttMessage.validateMessage('dormmate/dorm-a/env', JSON.stringify({ ...message, time: '2026-02-30T12:00:00Z' })).valid, false)
  assert.equal(mqttMessage.validateMessage('dormmate/dorm-a/env', JSON.stringify({ ...message, humidity: 101 })).valid, false)
  assert.throws(() => createNodeMessage('dorm-d', 0))
})

test('重复 recordId 只接收一次；模拟节点的持续样本拥有唯一 ID 且不串节点', () => {
  const dedupe = mqttMessage.createRecordIdDeduplicator()
  const ids = new Set()
  for (const { nodeId } of NODES) {
    for (let sequence = 0; sequence < 8; sequence++) {
      const message = createNodeMessage(nodeId, sequence, { time: fixedTime })
      const checked = mqttMessage.validateMessage(mqttMessage.topicForNode(nodeId), JSON.stringify(message))
      assert.equal(checked.valid, true)
      assert.equal(dedupe.accept(checked.data.recordId), true)
      assert.equal(dedupe.accept(checked.data.recordId), false)
      assert.equal(ids.has(checked.data.recordId), false)
      ids.add(checked.data.recordId)
      assert.equal(checked.data.nodeId, nodeId)
    }
  }
  assert.equal(ids.size, 24)
  assert.equal(dedupe.size, 24)
  assert.equal(dedupe.accept('../bad-id'), false)
})

test('三个独立 MQTT.js 客户端连接后持续发布到各自 Topic', () => {
  const clients = []
  const ticks = []
  const cleared = []
  const published = []
  const fakeMqtt = {
    connect(url, options) {
      const client = new EventEmitter()
      client.connected = false
      client.publish = (topic, payload, settings, callback) => {
        published.push({ client, topic, message: JSON.parse(payload), settings })
        callback(null)
      }
      client.end = () => { client.ended = true }
      clients.push({ url, options, client })
      return client
    }
  }
  let id = 0
  const running = startPublishers({
    mqtt: fakeMqtt,
    brokerUrl: 'mqtt://test-broker:1883',
    intervalMs: 1000,
    now: () => new Date(fixedTime),
    createId: () => 'simulated-record-' + String(++id).padStart(4, '0'),
    logger: { log() {}, warn() {}, error() {} },
    setInterval(callback, interval) { ticks.push({ callback, interval }); return ticks.length },
    clearInterval(timer) { cleared.push(timer) }
  })
  assert.equal(clients.length, 3)
  assert.equal(new Set(clients.map(item => item.options.clientId)).size, 3)
  assert.deepEqual(running.publishers.map(item => item.topic), NODES.map(node => mqttMessage.topicForNode(node.nodeId)))
  clients.forEach(({ client }) => { client.connected = true; client.emit('connect') })
  ticks.forEach(({ callback }) => callback())
  assert.equal(published.length, 6)
  assert.equal(new Set(published.map(item => item.message.recordId)).size, 6)
  published.forEach(item => {
    assert.equal(item.topic, mqttMessage.topicForNode(item.message.nodeId))
    assert.equal(item.settings.qos, 1)
    assert.equal(mqttMessage.validateMessage(item.topic, JSON.stringify(item.message)).valid, true)
  })
  running.stop()
  assert.equal(cleared.length, 3)
  assert.equal(clients.every(item => item.client.ended), true)
})
