'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const messages = require('../utils/mqttMessage')
const simulation = require('../utils/mqttSimulation')
const { createDashboardStore } = require('../../m5-dashboard/dashboardStore')
const { createSharedHistory } = require('../../m5-dashboard/dashboardSharedHistory')
const { toCsv } = require('../../m5-dashboard/dashboardCsv')
const { createMqttPersistence } = require('../../m5-dashboard/dashboardMqttPersistence')
const { createNodeView, filterSharedHistory } = require('../../m5-dashboard/dashboardNodeView')

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

test('保存后刷新等待旧请求结束，再重新读取最新共享记录', async () => {
  let completeFirst, calls = 0
  const history = createSharedHistory({ list: () => {
    calls++
    return calls === 1 ? new Promise(resolve => { completeFirst = resolve }) : [
      { recordId: 'web-dorm-b-0001', nodeId: 'dorm-b', measuredAt: '2026-09-29T00:00:00Z',
        time: '2026-09-29 08:00:00', temperature: 24, humidity: 50, status: '正常', source: 'web' }
    ]
  } })
  const initial = history.refresh()
  const afterSave = history.refresh({ afterPending: true })
  completeFirst([])
  await initial
  const updated = await afterSave
  assert.equal(calls, 2)
  assert.equal(updated.success, true)
  assert.equal(updated.records.length, 1)
  assert.equal(updated.records[0].nodeId, 'dorm-b')
})

test('共享 CSV 保留节点、测量时间与来源，缺失字段留空并转义文本', () => {
  const { displayRecord } = require('../../m5-dashboard/dashboardSharedHistory')
  const csv = toCsv([
    displayRecord({ recordId: 'web-dorm-b-0001', nodeId: 'dorm-b', measuredAt: '2026-09-29T00:00:00Z',
      time: '2026-09-29 08:00:00', temperature: 24, humidity: 50, status: '正常', advice: '通风，保持"适宜"', source: 'web' }),
    displayRecord({ recordId: 'legacy-0001', time: '2026-09-29 08:01:00', temperature: 25,
      humidity: 55, status: '正常', source: 'miniprogram' })
  ])
  assert.ok(csv.startsWith('\uFEFF"recordId","nodeId","measuredAt"'))
  assert.match(csv, /"web-dorm-b-0001","dorm-b","2026-09-29T00:00:00Z"/)
  assert.match(csv, /"通风，保持""适宜"""/)
  assert.match(csv, /"legacy-0001","","","2026-09-29 08:01:00"/)
  assert.match(csv, /"miniprogram"\r\n$/)
})

test('MQTT 同一 recordId 只同步一次；云端失败后允许重试', async () => {
  const saved = [], record = { recordId: 'mqtt-dorm-b-0001', nodeId: 'dorm-b', time: '2026-09-29T00:00:00Z', temperature: 24, humidity: 50 }
  let fail = true, refreshed = 0
  const persistence = createMqttPersistence({ save: async data => {
    saved.push(data)
    if (fail) { fail = false; throw new Error('temporary network error') }
    return { duplicated: false }
  }, refresh: async () => { refreshed++; return { success: true } } })
  await assert.rejects(persistence.persist(record), /temporary network error/)
  const [first, duplicate] = await Promise.all([persistence.persist(record), persistence.persist(record)])
  assert.equal(first.saved, true)
  assert.equal(duplicate.saved, true)
  assert.equal((await persistence.persist(record)).duplicate, true)
  assert.equal(saved.length, 2)
  assert.equal(refreshed, 1)
  assert.deepEqual(saved[1], { recordId: record.recordId, nodeId: 'dorm-b', source: 'mqtt',
    measuredAt: record.time, temperature: 24, humidity: 50 })
})

test('节点视图按 nodeId 合并云端与 MQTT 历史，保留未标注旧记录并隔离模拟数据', () => {
  const cloud = [
    { recordId: 'web-b-0001', rawNodeId: 'dorm-b', measuredAt: '2026-09-29T00:00:00Z', recordTime: '2026-09-29 08:00:00',
      temperature: 24, humidity: 50, status: '正常', advice: '通风', rawSource: 'web', source: 'Web' },
    { recordId: 'legacy-0001', rawNodeId: '', measuredAt: '', recordTime: '2026-09-29 08:01:00',
      temperature: 29, humidity: 60, status: '正常', rawSource: 'web', source: 'Web' },
    { recordId: 'mqtt-b-0001', rawNodeId: 'dorm-b', measuredAt: '2026-09-29T00:02:00Z', recordTime: '2026-09-29 08:02:00',
      temperature: 25, humidity: 55, status: '正常', advice: '云端版本', rawSource: 'mqtt', source: '实时 MQTT' }
  ]
  const mqtt = [
    { recordId: 'mqtt-b-0001', nodeId: 'dorm-b', time: '2026-09-29T00:02:00Z', temperature: 25, humidity: 55, status: '正常' },
    { recordId: 'mqtt-c-0001', nodeId: 'dorm-c', time: '2026-09-29T00:03:00Z', temperature: 28, humidity: 65, status: '正常' }
  ]
  const dormB = createNodeView({ nodeId: 'dorm-b', cloudRecords: cloud, mqttRecords: mqtt })
  assert.deepEqual(dormB.map(record => record.recordId), ['web-b-0001', 'mqtt-b-0001'])
  assert.equal(dormB[1].advice, '云端版本')
  assert.equal(dormB[1].sourceLabel, '实时 MQTT')
  assert.equal(dormB.some(record => record.recordId === 'legacy-0001'), false)
  assert.deepEqual(createNodeView({ nodeId: 'dorm-c', cloudRecords: cloud, mqttRecords: mqtt }).map(record => record.recordId), ['mqtt-c-0001'])
  const simulationView = createNodeView({ nodeId: 'dorm-b', cloudRecords: cloud, mqttRecords: mqtt, mode: 'simulation',
    simulationRecords: [{ recordId: 'sim-b-0001', nodeId: 'dorm-b', time: '2026-09-29T00:04:00Z', temperature: 21, humidity: 45 }] })
  assert.deepEqual(simulationView.map(record => record.recordId), ['sim-b-0001'])
  assert.equal(simulationView[0].sourceLabel, '模拟演示（仅本地）')
  assert.equal(simulationView[0].timeUnknown, false)
  const unknown = createNodeView({ nodeId: 'dorm-a', cloudRecords: cloud })
  assert.equal(unknown.length, 0)
  assert.equal(cloud.find(record => record.recordId === 'legacy-0001').rawNodeId, '')
  assert.deepEqual(filterSharedHistory(cloud, 'dorm-b').map(record => record.recordId), ['web-b-0001', 'mqtt-b-0001'])
  assert.equal(filterSharedHistory(cloud, 'dorm-b', 'all').some(record => record.recordId === 'legacy-0001'), true)
})
