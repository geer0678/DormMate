;(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports
  const mqttMessage = isNode ? require('../miniprogram/utils/mqttMessage') : root.DormMateMqttMessage
  const simulation = isNode ? require('../miniprogram/utils/mqttSimulation') : root.DormMateMqttSimulation
  const api = factory(mqttMessage, simulation)
  if (isNode) module.exports = api
  if (typeof window !== 'undefined') window.DormMateDashboardStore = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function (mqttMessage, simulation) {
  'use strict'
  if (!mqttMessage || !simulation) throw new Error('DormMate Dashboard 共享模块未加载')

  const NODE_IDS = Object.freeze(simulation.NODES.map(node => node.nodeId))

  function createDashboardStore({ maxHistory = 50 } = {}) {
    if (!Number.isInteger(maxHistory) || maxHistory < 1 || maxHistory > 50) {
      throw new Error('每个节点最多保留 1～50 条历史')
    }
    const histories = Object.create(null)
    NODE_IDS.forEach(nodeId => { histories[nodeId] = [] })
    const recordIds = mqttMessage.createRecordIdDeduplicator()
    let selectedNodeId = NODE_IDS[0]

    function getHistory(nodeId = selectedNodeId) {
      const history = histories[nodeId]
      return Array.isArray(history) ? history.map(record => ({ ...record })) : []
    }

    function ingest(topic, payload) {
      let checked
      try { checked = mqttMessage.validateMessage(topic, payload) }
      catch (error) { return { accepted: false, error: error.message || '消息无效' } }
      if (!checked.valid) return { accepted: false, error: checked.error }
      const record = checked.data
      const history = histories[record.nodeId]
      if (!Array.isArray(history)) return { accepted: false, error: 'Dashboard 不支持节点 ' + record.nodeId }
      if (recordIds.has(record.recordId)) return { accepted: false, duplicate: true, error: 'recordId 已处理' }

      const next = history.concat({ ...record }).sort((a, b) =>
        Date.parse(a.time) - Date.parse(b.time) || a.recordId.localeCompare(b.recordId))
      const retained = next.slice(-maxHistory)
      if (!retained.some(item => item.recordId === record.recordId)) {
        return { accepted: false, stale: true, error: '记录早于当前保留窗口' }
      }
      if (!recordIds.accept(record.recordId)) return { accepted: false, duplicate: true, error: 'recordId 已处理' }
      const retainedIds = new Set(retained.map(item => item.recordId))
      history.forEach(item => { if (!retainedIds.has(item.recordId)) recordIds.forget(item.recordId) })
      histories[record.nodeId] = retained
      return { accepted: true, nodeId: record.nodeId, record: { ...record } }
    }

    function selectNode(nodeId) {
      if (!Object.prototype.hasOwnProperty.call(histories, nodeId)) return false
      selectedNodeId = nodeId
      return true
    }

    function snapshot() {
      const history = getHistory(selectedNodeId)
      return {
        selectedNodeId,
        current: history.length ? history[history.length - 1] : null,
        history,
        nodeIds: NODE_IDS.slice(),
        maxHistory
      }
    }

    const store = { ingest, selectNode, getHistory, snapshot, nodeIds: NODE_IDS.slice(), maxHistory }
    Object.defineProperties(store, {
      histories: { enumerable: true, get: () => Object.fromEntries(NODE_IDS.map(nodeId => [nodeId, getHistory(nodeId)])) },
      selectedNodeId: { enumerable: true, get: () => selectedNodeId }
    })
    return store
  }

  return { NODE_IDS, createDashboardStore }
})
