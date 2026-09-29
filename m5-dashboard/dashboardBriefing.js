;(function (root, factory) {
  const simulation = typeof module !== 'undefined' && module.exports
    ? require('../miniprogram/utils/mqttSimulation')
    : root.DormMateMqttSimulation
  const api = factory(simulation)
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.DormMateDashboardBriefing = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function (simulation) {
  'use strict'

  const NORMAL_STATUS = '正常'
  const PRIORITY_RANK = Object.freeze({ '优先处理': 0, '关注': 1, '普通': 2 })
  const NODE_IDS = Object.freeze((simulation?.NODES || []).map(node => node.nodeId))
  const STATUS_BASIS = Object.freeze({
    '正常': '温度和湿度均处于现有规则的适宜区间。',
    '偏热': '当前温度被现有规则判为偏热。',
    '偏冷': '当前温度被现有规则判为偏冷。',
    '偏湿': '当前湿度被现有规则判为偏高。',
    '偏干': '当前湿度被现有规则判为偏低。',
    '偏热偏湿': '当前温度被现有规则判为偏热，湿度被判为偏高。',
    '偏热偏干': '当前温度被现有规则判为偏热，湿度被判为偏低。',
    '偏冷偏湿': '当前温度被现有规则判为偏冷，湿度被判为偏高。',
    '偏冷偏干': '当前温度被现有规则判为偏冷，湿度被判为偏低。'
  })

  function formatTemperature(value) {
    if (value === null || value === undefined || value === '') return '—'
    const number = Number(value)
    return Number.isFinite(number) ? number.toFixed(1) : '—'
  }

  function formatHumidity(value) {
    if (value === null || value === undefined || value === '') return '—'
    const number = Number(value)
    return Number.isFinite(number) ? number.toFixed(1).replace(/\.0$/, '') : '—'
  }

  function formatTime(record) {
    if (!record) return '—'
    if (record.timeUnknown) return record.recordTime ? record.recordTime + '（测量时间未提供）' : '测量时间未提供'
    const value = record.measuredAt || record.time || record.recordTime
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('zh-CN') : '测量时间未提供'
  }

  function readingLabel(reading) {
    if (!reading) return '尚未验证'
    return (reading.status || '状态未提供') + ' · ' + formatTemperature(reading.temperature) + '℃ / ' + formatHumidity(reading.humidity) + '%'
  }

  function buildCurrentSummary({ nodeId = '', record = null, activeIssue = null } = {}) {
    if (!record || (nodeId && record.nodeId && record.nodeId !== nodeId)) {
      const selectedNode = nodeId || '当前宿舍'
      return {
        hasData: false, nodeId: selectedNode, temperature: '—', humidity: '—',
        status: '等待数据', advice: '', source: '—', updatedAt: '—',
        summarySentence: selectedNode + ' 暂无有效环境数据，收到数据后显示摘要。',
        reason: '该宿舍暂无数据，暂不能解释状态判断。', speechText: ''
      }
    }
    const selectedNode = nodeId || record.nodeId || '当前宿舍'
    const temperature = formatTemperature(record.temperature)
    const humidity = formatHumidity(record.humidity)
    const status = record.status || '状态未提供'
    const advice = record.advice || ''
    const source = record.sourceLabel || record.source || '未标注'
    const updatedAt = formatTime(record)
    const issueSentence = activeIssue?.state === 'processing' ? '该宿舍的问题仍在处理和恢复验证中。'
      : activeIssue?.state === 'open' ? '该宿舍仍有待处理的环境问题。' : ''
    const summarySentence = selectedNode + ' 当前 ' + temperature + '℃ / ' + humidity + '%，环境状态为“' + status + '”。' +
      advice + issueSentence
    const reason = 'DormMate 现有九状态规则判定为“' + status + '”。' + (STATUS_BASIS[status] || '') +
      (activeIssue?.priorityReason ? ' 当前问题优先级依据：' + activeIssue.priorityReason : '')
    const speechText = selectedNode + ' 当前温度 ' + temperature + ' 摄氏度，湿度 ' + humidity + '%，环境状态为' + status + '。' +
      '数据来源：' + source + '。最近更新时间：' + updatedAt + '。' + advice + issueSentence
    return {
      hasData: true, nodeId: selectedNode, temperature, humidity, status, advice,
      source, updatedAt, summarySentence, reason, speechText,
      priority: activeIssue?.priority || '', priorityReason: activeIssue?.priorityReason || ''
    }
  }

  function buildDormOverview({ nodeIds = NODE_IDS, histories = {}, activeIssues = {} } = {}) {
    const dorms = nodeIds.map(nodeId => {
      const history = Array.isArray(histories[nodeId])
        ? histories[nodeId].filter(record => record.nodeId === nodeId) : []
      const record = history.length ? history[history.length - 1] : null
      const issue = activeIssues[nodeId] && activeIssues[nodeId].state !== 'resolved' ? activeIssues[nodeId] : null
      const status = record?.status || '等待数据'
      let attention = '等待数据'
      if (issue) attention = issue.priority || '关注'
      else if (record) attention = status === NORMAL_STATUS ? '正常' : '关注'
      const issueState = !issue ? '无待处理问题' : issue.state === 'processing'
        ? '处理中 · ' + (issue.priority || '关注')
        : '待处理 · ' + (issue.priority || '关注')
      return {
        nodeId, hasData: Boolean(record), record, status,
        temperature: record ? formatTemperature(record.temperature) : '—',
        humidity: record ? formatHumidity(record.humidity) : '—',
        attention, issueState, issue, priorityReason: issue?.priorityReason || ''
      }
    })

    const active = dorms.filter(room => room.issue).sort((left, right) =>
      (PRIORITY_RANK[left.issue.priority] ?? 3) - (PRIORITY_RANK[right.issue.priority] ?? 3) ||
      nodeIds.indexOf(left.nodeId) - nodeIds.indexOf(right.nodeId))
    const known = dorms.filter(room => room.hasData)
    const abnormal = known.filter(room => room.status !== NORMAL_STATUS)
    let focus
    if (active.length) {
      const first = active[0]
      focus = {
        nodeIds: active.filter(room => room.issue.priority === first.issue.priority).map(room => room.nodeId),
        priority: first.issue.priority || '关注',
        message: '当前优先关注 ' + first.nodeId + '：Task A 优先级为“' + (first.issue.priority || '关注') + '”。' +
          (first.issue.priorityReason || '')
      }
    } else if (abnormal.length === 1) {
      focus = { nodeIds: [abnormal[0].nodeId], priority: '关注', message: '当前需要关注 ' + abnormal[0].nodeId + '：状态为“' + abnormal[0].status + '”。' }
    } else if (abnormal.length > 1) {
      focus = {
        nodeIds: abnormal.map(room => room.nodeId), priority: '关注',
        message: '需要关注 ' + abnormal.map(room => room.nodeId).join('、') + '；当前没有活动 Task A 优先级事件可进一步排序。'
      }
    } else if (known.length === dorms.length && known.length > 0) {
      focus = { nodeIds: [], priority: '正常', message: '三个宿舍当前均为正常。' }
    } else {
      focus = { nodeIds: [], priority: '等待数据', message: '部分宿舍尚无数据，暂不能确定当前重点。' }
    }
    return { dorms, focus }
  }

  function eventActivityTime(event) {
    return Date.parse(event.resolvedAt || event.lastObservedAt || event.actionStartedAt || event.detectedAt) || 0
  }

  function buildRecentEvents(events = [], { now = Date.now(), sourceMode, limit = 5 } = {}) {
    const nowMs = typeof now === 'number' ? now : Date.parse(now)
    const cutoff = nowMs - 24 * 60 * 60 * 1000
    const recent = events.filter(event => {
      if (sourceMode && event.sourceMode !== sourceMode) return false
      const active = event.state === 'open' || event.state === 'processing'
      const timestamps = [event.detectedAt, event.actionStartedAt, event.resolvedAt].map(value => Date.parse(value) || 0)
      return active || timestamps.some(timestamp => timestamp >= cutoff && timestamp <= nowMs)
    }).sort((left, right) => eventActivityTime(right) - eventActivityTime(left)).slice(0, limit)
      .map(event => {
        const stateLabel = event.state === 'resolved' ? '已恢复' : event.state === 'processing' ? '处理中' : '待处理'
        let detail
        if (event.state === 'resolved') {
          detail = '措施：' + (event.action || '未记录') + '；处理前：' + readingLabel(event.before) +
            '；处理后：' + readingLabel(event.after) + '；' + (event.result || '事件已恢复。')
        } else if (event.state === 'processing') {
          detail = '措施：' + (event.action || '未记录') + '；当前：' + readingLabel(event.current) +
            '；' + (event.result || '等待后续数据验证。')
        } else {
          detail = '当前：' + readingLabel(event.current || event.before) + '；' + (event.priorityReason || event.result || '等待处理。')
        }
        return {
          eventId: event.eventId, nodeId: event.nodeId, issueStatus: event.issueStatus || '环境异常',
          priority: event.priority || '普通', state: event.state, stateLabel,
          description: event.issueDescription || '', detail,
          time: event.resolvedAt || event.actionStartedAt || event.detectedAt || ''
        }
      })
    return {
      period: (sourceMode === 'simulation' ? '本机模拟事件 · ' : '') + '最近 24 小时及仍未结束的事件',
      empty: recent.length === 0,
      message: recent.length ? '显示 ' + recent.length + ' 条已有事件。' : '最近 24 小时暂无需要处理的环境事件。',
      events: recent
    }
  }

  function direction(first, last) {
    if (last > first) return '上升'
    if (last < first) return '下降'
    return '持平'
  }

  function buildTrendSummary(history = [], { currentStatus = '', events = [] } = {}) {
    const valid = history.filter(record => Number.isFinite(Number(record.temperature)) && Number.isFinite(Number(record.humidity)))
    if (valid.length < 3) return { sufficient: false, count: valid.length, message: '历史数据不足，暂不生成趋势结论。', recovered: false }
    const samples = valid.slice(-5)
    const first = samples[0], last = samples[samples.length - 1]
    const temperatureDirection = direction(Number(first.temperature), Number(last.temperature))
    const humidityDirection = direction(Number(first.humidity), Number(last.humidity))
    const temperature = formatTemperature(first.temperature) + '℃ 到 ' + formatTemperature(last.temperature) + '℃（' + temperatureDirection + '）'
    const humidity = formatHumidity(first.humidity) + '% 到 ' + formatHumidity(last.humidity) + '%（' + humidityDirection + '）'
    const sampleIds = new Set(samples.map(record => record.recordId).filter(Boolean))
    const recovered = currentStatus === NORMAL_STATUS && events.some(event =>
      event.nodeId === last.nodeId && event.state === 'resolved' && event.after?.status === NORMAL_STATUS &&
      sampleIds.has(event.after.recordId))
    return {
      sufficient: true, count: samples.length, temperatureDirection, humidityDirection, recovered,
      message: '最近 ' + samples.length + ' 条记录中，温度从 ' + temperature + '，湿度从 ' + humidity + '。' +
        (recovered ? '当前状态为正常，处理记录也显示已恢复。' : '')
    }
  }

  return { NODE_IDS, NORMAL_STATUS, buildCurrentSummary, buildDormOverview, buildRecentEvents, buildTrendSummary }
})
