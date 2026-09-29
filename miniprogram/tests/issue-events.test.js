'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createDashboardIssueEvents, STORAGE_KEY } = require('../../m5-dashboard/dashboardIssueEvents')
const dashboardRoot = path.resolve(__dirname, '../../m5-dashboard')

function makeStorage() {
  const values = new Map()
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) { values.set(key, String(value)) },
    value(key = STORAGE_KEY) { return values.get(key) }
  }
}

function record(nodeId, recordId, status, measuredAt, overrides = {}) {
  return {
    nodeId, recordId, status,
    measuredAt: new Date(measuredAt).toISOString(),
    temperature: status === '正常' ? 25 : 32,
    humidity: status === '正常' ? 55 : 82,
    advice: status === '正常' ? '继续保持通风。' : '建议开启风扇并通风。',
    ...overrides
  }
}

function setup(start = Date.parse('2026-09-29T03:00:00.000Z')) {
  let time = start
  const storage = makeStorage()
  return {
    storage,
    setTime(value) { time = value },
    now() { return time },
    manager: createDashboardIssueEvents({ storage, now: () => time })
  }
}

test('异常数据创建事件并保存完整 before、问题描述和优先级原因', () => {
  const context = setup()
  const result = context.manager.observeReading(record('dorm-a', 'mqtt-a-001', '偏热偏湿', context.now()), 'mqtt')
  assert.equal(result.accepted, true)
  assert.equal(result.created, true)
  assert.equal(result.event.nodeId, 'dorm-a')
  assert.equal(result.event.state, 'open')
  assert.equal(result.event.before.temperature, 32)
  assert.equal(result.event.before.humidity, 82)
  assert.match(result.event.issueDescription, /偏热偏湿/)
  assert.match(result.event.issueDescription, /开启风扇并通风/)
  assert.equal(result.event.priority, '优先处理')
  assert.match(result.event.priorityReason, /持续时间、异常次数/)
  assert.ok(context.storage.value())
})

test('优先级先比较持续时间，再比较异常次数，最后按固定 nodeId 顺序', () => {
  const context = setup()
  const base = context.now()
  context.manager.observeReading(record('dorm-a', 'a-1', '偏热', base - 20000), 'mqtt')
  context.manager.observeReading(record('dorm-b', 'b-1', '偏湿', base - 10000), 'mqtt')
  context.manager.observeReading(record('dorm-c', 'c-1', '偏冷', base - 10000), 'mqtt')
  let events = context.manager.getEvents({ sourceMode: 'mqtt' })
  assert.equal(events.find(item => item.nodeId === 'dorm-a').priority, '优先处理')
  assert.equal(events.find(item => item.nodeId === 'dorm-b').priority, '关注')
  assert.equal(events.find(item => item.nodeId === 'dorm-c').priority, '普通')

  context.manager.observeReading(record('dorm-c', 'c-2', '偏冷偏干', base - 9000), 'mqtt')
  events = context.manager.getEvents({ sourceMode: 'mqtt' })
  assert.equal(events.find(item => item.nodeId === 'dorm-a').priority, '优先处理', '更长的持续异常高于次数')

  const countTie = setup(base)
  countTie.manager.observeReading(record('dorm-c', 'c-10', '偏冷', base), 'mqtt')
  countTie.manager.observeReading(record('dorm-b', 'b-10', '偏湿', base), 'mqtt')
  countTie.manager.observeReading(record('dorm-c', 'c-11', '偏冷偏干', base + 1), 'mqtt')
  events = countTie.manager.getEvents({ sourceMode: 'mqtt' })
  assert.equal(events.find(item => item.nodeId === 'dorm-c').priority, '优先处理', '同持续时间时异常次数较多者靠前')
  assert.equal(events.find(item => item.nodeId === 'dorm-b').priority, '关注')

  const nodeTie = setup(base)
  nodeTie.manager.observeReading(record('dorm-c', 'c-20', '偏冷', base), 'mqtt')
  nodeTie.manager.observeReading(record('dorm-b', 'b-20', '偏湿', base), 'mqtt')
  events = nodeTie.manager.getEvents({ sourceMode: 'mqtt' })
  assert.equal(events.find(item => item.nodeId === 'dorm-b').priority, '优先处理', '同持续时间和次数按 dorm-b 早于 dorm-c')
})

test('开始处理记录 action，但只有两批后续连续正常数据才能标记 resolved 并保存 after', () => {
  const context = setup()
  const base = context.now()
  const detected = context.manager.observeReading(record('dorm-a', 'a-before', '偏热偏湿', base), 'mqtt')
  const started = context.manager.startProcessing(detected.event.eventId, '开启风扇并通风')
  assert.equal(started.accepted, true)
  assert.equal(started.event.state, 'processing')
  assert.equal(started.event.action, '开启风扇并通风')
  assert.equal(started.event.after, null)
  assert.match(started.event.result, /等待处理后的新数据/)

  context.setTime(base + 1000)
  const first = context.manager.observeReading(record('dorm-a', 'a-normal-1', '正常', base + 1000), 'mqtt')
  assert.equal(first.event.state, 'processing')
  assert.equal(first.event.recoverySamples, 1)
  assert.equal(first.event.after, null)

  context.setTime(base + 2000)
  const second = context.manager.observeReading(record('dorm-a', 'a-normal-2', '正常', base + 2000), 'mqtt')
  assert.equal(second.resolved, true)
  assert.equal(second.event.state, 'resolved')
  assert.equal(second.event.after.status, '正常')
  assert.equal(second.event.after.temperature, 25)
  assert.equal(second.event.after.humidity, 55)
  assert.equal(second.event.actionStartedAt, new Date(base).toISOString())
  assert.equal(second.event.resolvedAt, new Date(base + 2000).toISOString())
  assert.match(second.event.result, /连续 2 批数据为正常/)
})

test('重复 recordId 不重复累计，同一节点持续异常只保留一个未结事件', () => {
  const context = setup()
  const base = context.now()
  const first = record('dorm-a', 'a-repeat-1', '偏热', base)
  context.manager.observeReading(first, 'mqtt')
  const duplicate = context.manager.observeReading(first, 'mqtt')
  assert.equal(duplicate.duplicate, true)
  context.manager.observeReading(record('dorm-a', 'a-repeat-2', '偏热偏湿', base + 1000), 'mqtt')
  const events = context.manager.getEvents({ sourceMode: 'mqtt', nodeId: 'dorm-a' })
  assert.equal(events.length, 1)
  assert.equal(events[0].abnormalCount, 2)
})

test('恢复计数遇到后续异常会归零，并且不同节点事件互不影响', () => {
  const context = setup()
  const base = context.now()
  const a = context.manager.observeReading(record('dorm-a', 'a-episode', '偏热', base), 'mqtt')
  context.manager.startProcessing(a.event.eventId, '开启风扇并通风')
  context.setTime(base + 1000)
  context.manager.observeReading(record('dorm-b', 'b-normal', '正常', base + 1000), 'mqtt')
  let issueA = context.manager.getActive('dorm-a', 'mqtt')
  assert.equal(issueA.state, 'processing')
  assert.equal(issueA.recoverySamples, 0)

  context.manager.observeReading(record('dorm-a', 'a-normal-1', '正常', base + 1000), 'mqtt')
  context.setTime(base + 2000)
  const abnormalAgain = context.manager.observeReading(record('dorm-a', 'a-again', '偏热', base + 2000), 'mqtt')
  assert.equal(abnormalAgain.event.recoverySamples, 0)
  context.setTime(base + 3000)
  context.manager.observeReading(record('dorm-a', 'a-normal-2', '正常', base + 3000), 'mqtt')
  context.setTime(base + 4000)
  const resolved = context.manager.observeReading(record('dorm-a', 'a-normal-3', '正常', base + 4000), 'mqtt')
  assert.equal(resolved.event.state, 'resolved')
  assert.equal(context.manager.getEvents({ sourceMode: 'mqtt', nodeId: 'dorm-b' }).length, 0)
})

test('模拟恢复不能结案 MQTT 事件，模拟事件只保存在独立本地事件日志', () => {
  const context = setup()
  const base = context.now()
  const mqtt = context.manager.observeReading(record('dorm-c', 'mqtt-c-1', '偏湿', base), 'mqtt')
  context.manager.startProcessing(mqtt.event.eventId, '开窗通风')
  context.setTime(base + 1000)
  context.manager.observeReading(record('dorm-c', 'sim-c-1', '正常', base + 1000), 'simulation')
  context.setTime(base + 2000)
  context.manager.observeReading(record('dorm-c', 'sim-c-2', '正常', base + 2000), 'simulation')
  assert.equal(context.manager.getActive('dorm-c', 'mqtt').state, 'processing')
  assert.equal(context.manager.getEvents({ sourceMode: 'simulation' }).length, 0)

  const simulated = context.manager.observeReading(record('dorm-b', 'sim-b-1', '偏冷', base), 'simulation')
  assert.equal(simulated.event.source, '模拟演示（仅本地）')
  assert.equal(context.manager.getEvents({ sourceMode: 'simulation', nodeId: 'dorm-b' }).length, 1)
  assert.equal(context.storage.value().includes('environmentRecords'), false)
})

test('恢复验证必须是处理开始后的连续数据，异常会重置计数', () => {
  const context = setup()
  const base = context.now()
  const created = context.manager.observeReading(record('dorm-a', 'a-reset', '偏热', base), 'mqtt')
  context.manager.startProcessing(created.event.eventId, '通风')
  context.setTime(base + 1000)
  context.manager.observeReading(record('dorm-a', 'a-reset-normal-1', '正常', base + 1000), 'mqtt')
  context.setTime(base + 2000)
  const abnormal = context.manager.observeReading(record('dorm-a', 'a-reset-abnormal', '偏热偏干', base + 2000), 'mqtt')
  assert.equal(abnormal.event.recoverySamples, 0)
  context.setTime(base + 3000)
  context.manager.observeReading(record('dorm-a', 'a-reset-normal-2', '正常', base + 3000), 'mqtt')
  context.setTime(base + 4000)
  const recovered = context.manager.observeReading(record('dorm-a', 'a-reset-normal-3', '正常', base + 4000), 'mqtt')
  assert.equal(recovered.event.state, 'resolved')
})

test('Dashboard 和 M6 共用事件状态；事件模块不创建 CloudBase 或第二套 MQTT 链路', () => {
  const html = fs.readFileSync(path.join(dashboardRoot, 'index.html'), 'utf8')
  const dashboard = fs.readFileSync(path.join(dashboardRoot, 'dashboard.js'), 'utf8')
  const scene = fs.readFileSync(path.join(dashboardRoot, 'm6-3d/sceneController.mjs'), 'utf8')
  const eventModule = fs.readFileSync(path.join(dashboardRoot, 'dashboardIssueEvents.js'), 'utf8')
  assert.ok(html.indexOf('dashboardIssueEvents.js') < html.indexOf('dashboard.js'))
  assert.match(html, /id="activeIssueList"/)
  assert.match(html, /id="issueHistoryList"/)
  assert.match(html, /id="simulateSampleButton"/)
  assert.match(html, /id="simulationTimerToggle"/)
  assert.match(dashboard, /onRecord: \(record, source\)/)
  assert.match(dashboard, /issueEvents\.getActive\(nodeId, feed\.mode\)/)
  assert.match(dashboard, /issue: activeIssues\[snapshot\.selectedNodeId\]/)
  assert.match(dashboard, /startProcessing\(button\.dataset\.issueEventId/)
  assert.match(scene, /context\.issue && context\.issue\.state === 'processing'/)
  assert.match(scene, /处理中 · /)
  assert.doesNotMatch(eventModule, /cloudbase|saveCloudRecord|mqtt\.connect/)
})
