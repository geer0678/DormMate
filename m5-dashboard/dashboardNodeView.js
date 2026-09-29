;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.DormMateDashboardNodeView = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'
  const SOURCE_LABELS = { web: 'Web', miniprogram: '小程序', mqtt: '实时 MQTT', simulation: '模拟演示（仅本地）' }
  function normalize(record, fallbackSource = 'cloud') {
    const temperature = Number(record.temperature), humidity = Number(record.humidity)
    if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) return null
    const measuredAt = record.measuredAt || ''
    const recordTime = record.recordTime || record.time || ''
    const timestamp = Date.parse(measuredAt || recordTime)
    return {
      recordId: record.recordId || record.id || '', nodeId: record.rawNodeId || record.nodeId || '',
      temperature, humidity, status: record.status || '', advice: record.advice || '',
      source: record.rawSource || record.source || fallbackSource,
      sourceLabel: SOURCE_LABELS[record.rawSource || record.source || fallbackSource] || record.source || fallbackSource,
      measuredAt, recordTime, time: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '',
      timeUnknown: !measuredAt, timestamp: Number.isFinite(timestamp) ? timestamp : 0
    }
  }
  function createNodeView({ nodeId, cloudRecords = [], mqttRecords = [], simulationRecords = [], mode = 'mqtt', maxHistory = 50 } = {}) {
    if (mode === 'simulation') {
      return simulationRecords.map(record => normalize({ ...record, measuredAt: record.time, source: 'simulation', rawSource: 'simulation' }, 'simulation'))
        .filter(Boolean).slice(-maxHistory)
    }
    const byId = new Map()
    cloudRecords.forEach(record => {
      if ((record.rawNodeId || record.nodeId) !== nodeId) return
      const item = normalize(record)
      if (item && item.recordId) byId.set(item.recordId, item)
    })
    mqttRecords.forEach(record => {
      if (record.nodeId !== nodeId) return
      const item = normalize({ ...record, measuredAt: record.time, rawSource: 'mqtt' }, 'mqtt')
      if (item && item.recordId && !byId.has(item.recordId)) byId.set(item.recordId, item)
    })
    return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp || a.recordId.localeCompare(b.recordId)).slice(-maxHistory)
  }
  function filterSharedHistory(records, nodeId, scope = 'current') {
    return scope === 'all' ? records.slice() : records.filter(record => (record.rawNodeId || record.nodeId) === nodeId)
  }
  return { normalize, createNodeView, filterSharedHistory }
})
