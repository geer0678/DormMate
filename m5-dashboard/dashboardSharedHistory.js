;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.DormMateDashboardSharedHistory = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'
  const SOURCE_LABELS = { web: 'Web', miniprogram: '小程序', mqtt: '实时 MQTT' }

  function displayRecord(record) {
    return {
      recordId: record.recordId || record.id,
      time: record.measuredAt ? record.time : record.time + '（未提供测量时间）',
      nodeId: record.nodeId || '未标注',
      temperature: record.temperature,
      humidity: record.humidity,
      status: record.status,
      source: SOURCE_LABELS[record.source] || record.source || '未标注',
      rawNodeId: record.nodeId || '',
      measuredAt: record.measuredAt || '',
      recordTime: record.time || '',
      advice: record.advice || '',
      rawSource: record.source || ''
    }
  }

  function createSharedHistory({ list, onChange = () => {} } = {}) {
    if (typeof list !== 'function') throw new Error('共享历史读取函数缺失')
    let records = []
    let pending = null
    async function refresh({ afterPending = false } = {}) {
      if (afterPending && pending) await pending
      if (pending) return pending
      pending = (async () => {
        try {
          const latest = await list()
          if (!Array.isArray(latest)) throw new Error('共享历史响应无效')
          records = latest.map(displayRecord)
          onChange({ records: records.slice(), error: null })
          return { success: true, records: records.slice() }
        } catch (error) {
          onChange({ records: records.slice(), error: error.message || String(error) })
          return { success: false, error }
        } finally { pending = null }
      })()
      return pending
    }
    return { refresh, get records() { return records.slice() } }
  }
  return { displayRecord, createSharedHistory }
})
