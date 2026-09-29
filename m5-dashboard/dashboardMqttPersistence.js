;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.DormMateDashboardMqttPersistence = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'
  function createMqttPersistence({ save, refresh, maxRemembered = 500 } = {}) {
    if (typeof save !== 'function' || typeof refresh !== 'function') throw new Error('MQTT 云端同步函数缺失')
    const completed = new Set(), inFlight = new Map()
    function persist(record) {
      const id = record && record.recordId
      if (!id || !record.nodeId || !record.time) return Promise.reject(new Error('MQTT 记录缺少统一字段'))
      if (completed.has(id)) return Promise.resolve({ saved: true, duplicate: true })
      if (inFlight.has(id)) return inFlight.get(id)
      const pending = (async () => {
        const result = await save({ recordId: id, source: 'mqtt', nodeId: record.nodeId,
          measuredAt: record.time, temperature: record.temperature, humidity: record.humidity })
        completed.add(id)
        if (completed.size > maxRemembered) completed.delete(completed.values().next().value)
        let refreshed = false
        try { refreshed = Boolean((await refresh({ afterPending: true })).success) } catch (_) {}
        return { saved: true, duplicate: Boolean(result.duplicated), refreshed }
      })()
      inFlight.set(id, pending)
      pending.finally(() => { inFlight.delete(id) }).catch(() => {})
      return pending
    }
    return { persist }
  }
  return { createMqttPersistence }
})
