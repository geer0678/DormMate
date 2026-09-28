'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const messages = require('../utils/mqttMessage')
const simulation = require('../utils/mqttSimulation')
const { createDashboardStore } = require('../../m5-dashboard/dashboardStore')

function sample(nodeId, recordId, time = '2026-09-28T12:00:00.000Z', sequence = 0) {
  return simulation.createNodeMessage(nodeId, sequence, { recordId, time })
}

function send(store, message, topic = messages.topicForNode(message.nodeId)) {
  return store.ingest(topic, JSON.stringify(message))
}

test('三个节点分别建立历史，节点记录不会串线', () => {
  const store = createDashboardStore()
  for (const { nodeId } of simulation.NODES) {
    assert.equal(send(store, sample(nodeId, 'record-' + nodeId + '-0001')).accepted, true)
  }
  assert.deepEqual(Object.keys(store.histories), ['dorm-a', 'dorm-b', 'dorm-c'])
  assert.deepEqual(store.histories['dorm-a'].map(record => record.nodeId), ['dorm-a'])
  assert.deepEqual(store.histories['dorm-b'].map(record => record.nodeId), ['dorm-b'])
  assert.deepEqual(store.histories['dorm-c'].map(record => record.nodeId), ['dorm-c'])
})

test('切换节点只读取所选节点历史', () => {
  const store = createDashboardStore()
  send(store, sample('dorm-a', 'record-dorma-0001'))
  send(store, sample('dorm-b', 'record-dormb-0001'))
  send(store, sample('dorm-c', 'record-dormc-0001'))
  assert.equal(store.snapshot().selectedNodeId, 'dorm-a')
  assert.equal(store.snapshot().current.nodeId, 'dorm-a')
  assert.equal(store.selectNode('dorm-b'), true)
  assert.equal(store.snapshot().current.nodeId, 'dorm-b')
  assert.equal(store.snapshot().history.length, 1)
  assert.equal(store.selectNode('dorm-c'), true)
  assert.equal(store.snapshot().current.nodeId, 'dorm-c')
  assert.equal(store.selectNode('dorm-x'), false)
})

test('重复 recordId、错误 JSON、错误 Topic 与不支持节点均安全拒绝', () => {
  const store = createDashboardStore()
  const message = sample('dorm-a', 'record-dedupe-0001')
  assert.equal(send(store, message).accepted, true)
  assert.equal(send(store, message).duplicate, true)
  assert.equal(store.histories['dorm-a'].length, 1)
  assert.equal(store.ingest(messages.topicForNode('dorm-a'), '{broken').accepted, false)
  assert.equal(store.ingest('dormate/+/env', JSON.stringify(message)).accepted, false)
  const unsupported = { ...message, nodeId: 'dorm-x' }
  assert.equal(store.ingest('dormmate/dorm-x/env', JSON.stringify(unsupported)).accepted, false)
  assert.equal(store.histories['dorm-a'].length, 1)
  assert.equal(store.histories['dorm-b'].length, 0)
  assert.equal(store.histories['dorm-c'].length, 0)
})

test('三节点当前状态继续使用共享九状态规则', () => {
  const expected = { 'dorm-a': '偏热偏湿', 'dorm-b': '正常', 'dorm-c': '偏湿' }
  const store = createDashboardStore()
  for (const { nodeId } of simulation.NODES) {
    const reading = sample(nodeId, 'record-status-' + nodeId)
    assert.equal(reading.status, expected[nodeId])
    assert.equal(send(store, reading).accepted, true)
    store.selectNode(nodeId)
    assert.equal(store.snapshot().current.status, expected[nodeId])
  }
})

test('历史按时间排序并限制为每节点最多 50 条', () => {
  const store = createDashboardStore({ maxHistory: 3 })
  const times = [
    '2026-09-28T12:02:00.000Z',
    '2026-09-28T12:00:00.000Z',
    '2026-09-28T12:03:00.000Z',
    '2026-09-28T12:01:00.000Z'
  ]
  const records = times.map((time, index) => sample('dorm-a', 'record-order-' + String(index).padStart(4, '0'), time, index))
  records.forEach(record => send(store, record))
  const history = store.getHistory('dorm-a')
  assert.equal(history.length, 3)
  assert.deepEqual(history.map(record => record.time), [times[3], times[0], times[2]])
  assert.equal(send(store, records[1]).stale, true)
  assert.deepEqual(store.getHistory('dorm-a').map(record => record.time), [times[3], times[0], times[2]])
  assert.equal(store.getHistory('dorm-b').length, 0)
  assert.throws(() => createDashboardStore({ maxHistory: 51 }))
})
