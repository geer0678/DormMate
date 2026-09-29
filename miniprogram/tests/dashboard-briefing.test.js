'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const rules = require('../utils/dormmate')
const {
  NODE_IDS, buildCurrentSummary, buildDormOverview, buildRecentEvents, buildTrendSummary
} = require('../../m5-dashboard/dashboardBriefing')

const dashboardRoot = path.resolve(__dirname, '../../m5-dashboard')
const now = Date.parse('2026-09-29T12:00:00.000Z')

function record(nodeId, recordId, temperature, humidity, status = '正常', advice = '保持通风。') {
  return {
    nodeId, recordId, temperature, humidity, status, advice,
    source: 'web', sourceLabel: 'Web', time: new Date(now).toISOString()
  }
}

function event(nodeId, overrides = {}) {
  return {
    eventId: 'issue-' + nodeId, nodeId, sourceMode: 'simulation', state: 'open',
    issueStatus: '偏热', issueDescription: '温度偏热。', priority: '关注',
    priorityReason: '异常次数较多。', detectedAt: new Date(now - 20 * 60 * 1000).toISOString(),
    before: record(nodeId, nodeId + '-before', 31, 60, '偏热'),
    current: record(nodeId, nodeId + '-current', 31, 60, '偏热'),
    after: null, action: '', result: '待开始处理', ...overrides
  }
}

test('B 当前摘要准确使用所选 nodeId、温湿度、来源和测量时间', () => {
  const reading = record('dorm-a', 'a-1', 30.9, 79, '偏热偏湿', '加强通风并降低湿度。')
  const summary = buildCurrentSummary({ nodeId: 'dorm-a', record: reading })
  assert.equal(summary.nodeId, 'dorm-a')
  assert.equal(summary.temperature, '30.9')
  assert.equal(summary.humidity, '79')
  assert.equal(summary.source, 'Web')
  assert.match(summary.updatedAt, /2026/)
  assert.match(summary.summarySentence, /dorm-a 当前 30\.9℃ \/ 79%/)
})

test('B 摘要直接沿用共享九状态结果和 advice，依据不另设阈值', () => {
  const analysis = rules.analyzeEnvironment(30.9, 79)
  const summary = buildCurrentSummary({ nodeId: 'dorm-b', record: record('dorm-b', 'b-1', 30.9, 79, analysis.status, analysis.advice) })
  assert.equal(summary.status, analysis.status)
  assert.equal(summary.advice, analysis.advice)
  assert.match(summary.reason, /现有九状态规则/)
  assert.match(summary.reason, new RegExp(analysis.status))
  assert.match(summary.reason, /温度被现有规则判为偏热，湿度被判为偏高/)
  assert.match(summary.summarySentence, new RegExp(analysis.advice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('B Task A 活动事件的现有优先级原因进入判断依据', () => {
  const issue = event('dorm-a', { priority: '优先处理', priorityReason: '持续 20 分钟且发生 3 次异常。' })
  const summary = buildCurrentSummary({ nodeId: 'dorm-a', record: issue.current, activeIssue: issue })
  assert.equal(summary.priority, '优先处理')
  assert.match(summary.reason, /持续 20 分钟且发生 3 次异常/)
  assert.match(summary.reason, /现有九状态规则/)
})

test('B 单批正常读数遇到仍在 processing 的事件时明确说明恢复验证未结束', () => {
  const processing = event('dorm-a', { state: 'processing', action: '开窗通风', priority: '关注' })
  const summary = buildCurrentSummary({ nodeId: 'dorm-a', record: record('dorm-a', 'a-recovery-1', 25, 53), activeIssue: processing })
  assert.equal(summary.status, '正常')
  assert.match(summary.summarySentence, /恢复验证中/)
  assert.match(summary.speechText, /恢复验证中/)
})

test('B 三宿舍总览逐节点显示当前状态和温湿度，不串台', () => {
  const overview = buildDormOverview({ histories: {
    'dorm-a': [record('dorm-a', 'a-1', 25, 53)],
    'dorm-b': [record('dorm-b', 'b-1', 31, 79, '偏热偏湿')],
    'dorm-c': [record('dorm-c', 'c-1', 16, 35, '偏冷偏干')]
  } })
  assert.deepEqual(overview.dorms.map(room => room.nodeId), NODE_IDS)
  assert.deepEqual(overview.dorms.map(room => room.status), ['正常', '偏热偏湿', '偏冷偏干'])
  assert.deepEqual(overview.dorms.map(room => room.temperature), ['25.0', '31.0', '16.0'])
  assert.deepEqual(overview.focus.nodeIds, ['dorm-b', 'dorm-c'])
})

test('B 空节点和错配记录保持空状态，不继承另一宿舍摘要', () => {
  const a = record('dorm-a', 'a-1', 25, 53)
  const summary = buildCurrentSummary({ nodeId: 'dorm-b', record: a })
  const overview = buildDormOverview({ histories: { 'dorm-a': [a], 'dorm-b': [a] } })
  assert.equal(summary.hasData, false)
  assert.equal(summary.nodeId, 'dorm-b')
  assert.equal(overview.dorms[1].hasData, false)
  assert.equal(overview.dorms[1].status, '等待数据')
})

test('B 总览直接使用 Task A 优先级与 processing 状态决定当前重点', () => {
  const issueA = event('dorm-a', { priority: '关注', priorityReason: '异常持续时间较短。' })
  const issueC = event('dorm-c', { priority: '优先处理', priorityReason: '异常持续时间最长。', state: 'processing', action: '开窗通风' })
  const overview = buildDormOverview({ histories: {
    'dorm-a': [issueA.current], 'dorm-b': [record('dorm-b', 'b-1', 25, 53)], 'dorm-c': [issueC.current]
  }, activeIssues: { 'dorm-a': issueA, 'dorm-c': issueC } })
  assert.equal(overview.focus.nodeIds[0], 'dorm-c')
  assert.equal(overview.focus.priority, '优先处理')
  assert.match(overview.focus.message, /异常持续时间最长/)
  assert.equal(overview.dorms[2].issueState, '处理中 · 优先处理')
})

test('B 近期事件摘要只显示当前模式真实事件，包含 before、after 和措施', () => {
  const resolved = event('dorm-a', {
    state: 'resolved', action: '开窗通风', after: record('dorm-a', 'a-after', 25, 53),
    resolvedAt: new Date(now - 5 * 60 * 1000).toISOString(), result: '连续 2 批正常数据，已恢复。'
  })
  const mqtt = event('dorm-b', { sourceMode: 'mqtt' })
  const digest = buildRecentEvents([resolved, mqtt], { now, sourceMode: 'simulation' })
  assert.equal(digest.events.length, 1)
  assert.equal(digest.events[0].nodeId, 'dorm-a')
  assert.equal(digest.events[0].stateLabel, '已恢复')
  assert.match(digest.events[0].detail, /开窗通风/)
  assert.match(digest.events[0].detail, /处理前：偏热/)
  assert.match(digest.events[0].detail, /处理后：正常/)
})

test('B 没有事件时有明确空状态，旧已结案事件不会伪装成近期事件', () => {
  const oldResolved = event('dorm-a', {
    state: 'resolved', detectedAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
    resolvedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()
  })
  const digest = buildRecentEvents([oldResolved], { now, sourceMode: 'simulation' })
  assert.equal(digest.empty, true)
  assert.equal(digest.events.length, 0)
  assert.match(digest.message, /暂无需要处理的环境事件/)
})

test('B 跨日仍在处理的真实事件保持可见', () => {
  const active = event('dorm-c', { state: 'processing', detectedAt: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(), action: '开启除湿并通风' })
  const digest = buildRecentEvents([active], { now, sourceMode: 'simulation' })
  assert.equal(digest.events.length, 1)
  assert.equal(digest.events[0].stateLabel, '处理中')
})

test('B 趋势记录不足时不生成结论', () => {
  const result = buildTrendSummary([record('dorm-a', 'a-1', 25, 53), record('dorm-a', 'a-2', 26, 52)])
  assert.equal(result.sufficient, false)
  assert.equal(result.message, '历史数据不足，暂不生成趋势结论。')
})

test('B 趋势只描述已有读数变化，恢复说明需要匹配当前样本里的 after recordId', () => {
  const history = [record('dorm-a', 'a-1', 25, 53), record('dorm-a', 'a-2', 27, 55), record('dorm-a', 'a-3', 25, 50)]
  const resolved = event('dorm-a', { state: 'resolved', after: record('dorm-a', 'a-3', 25, 50) })
  const result = buildTrendSummary(history, { currentStatus: '正常', events: [resolved] })
  assert.equal(result.sufficient, true)
  assert.equal(result.temperatureDirection, '持平')
  assert.equal(result.humidityDirection, '下降')
  assert.equal(result.recovered, true)
  assert.match(result.message, /25\.0℃ 到 25\.0℃/)
  assert.equal(buildTrendSummary(history, { currentStatus: '正常', events: [event('dorm-b', { state: 'resolved', after: history[2] })] }).recovered, false)
})

test('B 当前摘要与 M6 场景读取同一状态，且页面仍只发送一份 Dashboard 状态事件', async () => {
  const { resolveNodeSceneState } = await import(pathToFileURL(path.join(dashboardRoot, 'm6-3d/sceneState.mjs')))
  for (const status of ['正常', '偏热', '偏湿', '偏热偏湿', '偏冷偏干']) {
    const reading = record('dorm-b', 'b-' + status, 30, 70, status)
    const summary = buildCurrentSummary({ nodeId: 'dorm-b', record: reading })
    const scene = resolveNodeSceneState({ nodeId: 'dorm-b', record: reading })
    assert.equal(summary.status, scene.status)
    assert.equal(summary.nodeId, scene.nodeId)
  }
  const source = fs.readFileSync(path.join(dashboardRoot, 'dashboard.js'), 'utf8')
  assert.match(source, /record: stateRecord/)
  assert.match(source, /briefing: summary/)
  assert.match(source, /dormmate:dashboard-state/)
})

test('B 浏览器播报只使用现有 speechSynthesis API 的当前摘要', () => {
  const summary = buildCurrentSummary({ nodeId: 'dorm-c', record: record('dorm-c', 'c-1', 16, 35, '偏冷偏干', '适当保暖。') })
  assert.match(summary.speechText, /dorm-c 当前温度 16\.0 摄氏度，湿度 35%/)
  assert.match(summary.speechText, /偏冷偏干/)
  assert.match(summary.speechText, /适当保暖/)
  const source = fs.readFileSync(path.join(dashboardRoot, 'dashboard.js'), 'utf8')
  assert.match(source, /window\.speechSynthesis\.speak\(utterance\)/)
  assert.doesNotMatch(fs.readFileSync(path.join(dashboardRoot, 'dashboardBriefing.js'), 'utf8'), /fetch\(|mqtt\.connect|saveCloudRecord/)
})
