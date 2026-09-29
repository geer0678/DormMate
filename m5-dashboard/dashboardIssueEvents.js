;(function (root, factory) {
  const simulation = typeof module !== 'undefined' && module.exports
    ? require('../miniprogram/utils/mqttSimulation')
    : root.DormMateMqttSimulation
  const api = factory(simulation, root)
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.DormMateDashboardIssueEvents = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function (simulation, root) {
  'use strict'

  const STORAGE_KEY = 'dormmate.task-a.issue-events.v1'
  const NORMAL_STATUS = '正常'
  const RECOVERY_SAMPLES = 2
  const SOURCE_MODES = Object.freeze(['mqtt', 'simulation'])
  const NODE_ORDER = Object.freeze((simulation && simulation.NODES || []).map(node => node.nodeId))
  const PRIORITIES = Object.freeze(['优先处理', '关注', '普通'])

  function getDefaultStorage() {
    try { return root.localStorage || null }
    catch (_) { return null }
  }

  function safeTime(value, fallback) {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(fallback).toISOString()
  }

  function createDashboardIssueEvents({ storage = getDefaultStorage(), now = Date.now, recoverySamples = RECOVERY_SAMPLES } = {}) {
    if (!Number.isInteger(recoverySamples) || recoverySamples < 2) throw new Error('恢复验证至少需要两批连续正常数据')
    let events = []
    let seenRecordIds = []
    let persistenceError = storage ? '' : '浏览器本地存储不可用'

    try {
      const saved = storage && JSON.parse(storage.getItem(STORAGE_KEY) || 'null')
      if (saved && saved.version === 1) {
        events = Array.isArray(saved.events) ? saved.events.filter(event => event && event.eventId && event.nodeId && event.state) : []
        seenRecordIds = Array.isArray(saved.seenRecordIds) ? saved.seenRecordIds.filter(value => typeof value === 'string').slice(-1000) : []
      }
    } catch (error) {
      persistenceError = '事件记录读取失败：' + (error && error.message || '本地数据无效')
    }

    function persist() {
      if (!storage) return false
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, events, seenRecordIds: seenRecordIds.slice(-1000) }))
        persistenceError = ''
        return true
      } catch (error) {
        persistenceError = '事件记录保存失败：' + (error && error.message || '本地存储不可用')
        return false
      }
    }

    function currentTime() {
      const value = Number(now())
      return Number.isFinite(value) ? value : Date.now()
    }

    function copy(value) {
      return value ? JSON.parse(JSON.stringify(value)) : value
    }

    function normalizeReading(record, sourceMode) {
      if (!record || !SOURCE_MODES.includes(sourceMode)) return null
      const nodeId = String(record.nodeId || '')
      const recordId = String(record.recordId || '')
      const temperature = Number(record.temperature)
      const humidity = Number(record.humidity)
      const status = String(record.status || '')
      if (!NODE_ORDER.includes(nodeId) || !recordId || !status || !Number.isFinite(temperature) || !Number.isFinite(humidity)) return null
      return {
        recordId, nodeId, temperature, humidity, status,
        advice: String(record.advice || ''),
        measuredAt: safeTime(record.measuredAt || record.time, currentTime()),
        source: sourceMode === 'simulation' ? '模拟演示（仅本地）' : '实时 MQTT'
      }
    }

    function activeFor(nodeId, sourceMode) {
      return events.find(event => event.nodeId === nodeId && event.sourceMode === sourceMode && event.state !== 'resolved') || null
    }

    function durationMs(event, at = currentTime()) {
      const start = Date.parse(event.detectedAt)
      return Number.isFinite(start) ? Math.max(0, at - start) : 0
    }

    function durationLabel(milliseconds) {
      const totalSeconds = Math.floor(milliseconds / 1000)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      return minutes ? minutes + ' 分 ' + seconds + ' 秒' : seconds + ' 秒'
    }

    function recalculatePriority(sourceMode) {
      const at = currentTime()
      const active = events.filter(event => event.sourceMode === sourceMode && event.state !== 'resolved')
        .sort((left, right) => durationMs(right, at) - durationMs(left, at) ||
          right.abnormalCount - left.abnormalCount ||
          NODE_ORDER.indexOf(left.nodeId) - NODE_ORDER.indexOf(right.nodeId))
      let changed = false
      active.forEach((event, index) => {
        const priority = PRIORITIES[Math.min(index, PRIORITIES.length - 1)]
        const reason = '连续异常 ' + durationLabel(durationMs(event, at)) + '，累计 ' + event.abnormalCount + ' 条；按持续时间、异常次数排序，同值按宿舍固定顺序，当前第 ' + (index + 1) + ' 位。'
        if (event.priority !== priority || event.priorityReason !== reason) changed = true
        event.priority = priority
        event.priorityReason = reason
      })
      return changed
    }

    function describeProblem(reading) {
      const detail = reading.status + '：温度 ' + reading.temperature.toFixed(1) + '℃、湿度 ' + reading.humidity.toFixed(1) + '%。'
      return reading.advice ? detail + '建议：' + reading.advice : detail
    }

    function observeReading(record, sourceMode) {
      const reading = normalizeReading(record, sourceMode)
      if (!reading) return { accepted: false, error: '事件记录缺少有效 nodeId、recordId、温湿度或状态' }
      let event = activeFor(reading.nodeId, sourceMode)
      const parsedAt = Date.parse(reading.measuredAt)
      if (event && event.state === 'processing' && parsedAt <= Date.parse(event.actionStartedAt)) {
        return { accepted: true, ignored: true, event: copy(event) }
      }
      const changesIssue = reading.status !== NORMAL_STATUS || Boolean(event && event.state === 'processing')
      if (!changesIssue) return { accepted: true, ignored: true, event: copy(event) }
      const dedupeKey = sourceMode + ':' + reading.recordId
      if (seenRecordIds.includes(dedupeKey)) return { accepted: false, duplicate: true, event: null }
      seenRecordIds.push(dedupeKey)
      if (seenRecordIds.length > 1000) seenRecordIds = seenRecordIds.slice(-1000)

      let created = false, resolved = false, updated = false
      if (reading.status === NORMAL_STATUS) {
        event.current = reading
        event.lastObservedAt = reading.measuredAt
        event.recoverySamples += 1
        updated = true
        if (event.recoverySamples >= recoverySamples) {
          event.state = 'resolved'
          event.after = reading
          event.resolvedAt = reading.measuredAt
          event.result = '已恢复：处理开始后连续 ' + recoverySamples + ' 批数据为正常。'
          resolved = true
        } else {
          event.result = '验证中：已收到 ' + event.recoverySamples + '/' + recoverySamples + ' 批正常数据。'
        }
      } else if (event) {
        event.current = reading
        event.lastObservedAt = reading.measuredAt
        event.issueStatus = reading.status
        event.issueDescription = describeProblem(reading)
        event.abnormalCount += 1
        if (event.state === 'processing') {
          event.recoverySamples = 0
          event.result = '仍需处理：后续数据再次异常，恢复验证已重新计数。'
        }
        updated = true
      } else {
        event = {
          eventId: 'issue-' + sourceMode + '-' + reading.nodeId + '-' + reading.recordId,
          sourceMode, nodeId: reading.nodeId, state: 'open',
          source: reading.source,
          issueStatus: reading.status, issueDescription: describeProblem(reading),
          detectedAt: reading.measuredAt, lastObservedAt: reading.measuredAt,
          abnormalCount: 1, recoverySamples: 0,
          before: reading, current: reading, after: null,
          action: '', actionStartedAt: '', resolvedAt: '',
          priority: '普通', priorityReason: '', result: '待开始处理'
        }
        events.push(event)
        created = true
      }

      recalculatePriority(sourceMode)
      persist()
      return { accepted: true, created, updated, resolved, event: copy(event) }
    }

    function startProcessing(eventId, action) {
      const event = events.find(item => item.eventId === eventId)
      const cleanAction = String(action || '').trim().slice(0, 120)
      if (!event || event.state !== 'open' || !cleanAction) return { accepted: false, error: '请选择一条待处理异常并填写处理措施' }
      event.state = 'processing'
      event.action = cleanAction
      event.actionStartedAt = new Date(currentTime()).toISOString()
      event.recoverySamples = 0
      event.result = '处理中：等待处理后的新数据验证效果。'
      recalculatePriority(event.sourceMode)
      const saved = persist()
      return { accepted: true, saved, event: copy(event) }
    }

    function getEvents({ sourceMode, nodeId } = {}) {
      return events.filter(event => (!sourceMode || event.sourceMode === sourceMode) && (!nodeId || event.nodeId === nodeId))
        .slice().sort((left, right) => Date.parse(right.detectedAt) - Date.parse(left.detectedAt))
        .map(copy)
    }

    function getActive(nodeId, sourceMode) {
      const event = activeFor(nodeId, sourceMode)
      return copy(event)
    }

    return {
      observeReading, startProcessing, getEvents, getActive,
      get persistenceError() { return persistenceError },
      get storageKey() { return STORAGE_KEY },
      get recoverySamples() { return recoverySamples }
    }
  }

  return { STORAGE_KEY, NORMAL_STATUS, RECOVERY_SAMPLES, PRIORITIES, createDashboardIssueEvents }
})
