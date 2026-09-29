;(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports
  const simulation = isNode ? require('../miniprogram/utils/mqttSimulation') : root.DormMateMqttSimulation
  const messageApi = isNode ? require('../miniprogram/utils/mqttMessage') : root.DormMateMqttMessage
  const api = factory(simulation, messageApi, root)
  if (isNode) module.exports = api
  if (typeof window !== 'undefined') window.DormMateDashboardFeed = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function (simulation, messageApi, root) {
  'use strict'
  if (!simulation || !messageApi) throw new Error('Dashboard 数据源共享模块未加载')

  const MODES = Object.freeze({ MQTT: 'mqtt', SIMULATION: 'simulation' })

  function createDashboardFeed({
    stores,
    intervalMs = 1800,
    setIntervalFn = root.setInterval,
    clearIntervalFn = root.clearInterval,
    onChange = () => undefined,
    onRecord = () => undefined,
    onInvalid = () => undefined
  } = {}) {
    if (!stores || !stores[MODES.MQTT] || !stores[MODES.SIMULATION]) {
      throw new Error('必须分别提供 MQTT 与模拟数据 Store')
    }
    if (!Number.isInteger(intervalMs) || intervalMs < 100) throw new Error('模拟间隔必须不少于 100ms')

    let mode = MODES.MQTT
    let simulationTimer = null
    let simulationPaused = false
    const sequenceByNode = Object.fromEntries(simulation.NODES.map(node => [node.nodeId, 0]))

    function notifyChange() {
      try { onChange({ mode, store: stores[mode] }) }
      catch (_) {}
    }

    function reportInvalid(result, source) {
      if (!result || result.duplicate) return
      try { onInvalid(result, source) }
      catch (_) {}
    }

    function reportRecord(result, source) {
      if (!result || !result.accepted || !result.record) return
      try { onRecord({ ...result.record }, source) }
      catch (_) {}
    }

    function ingestSimulation(message, shouldNotify = true) {
      let result
      try { result = stores[MODES.SIMULATION].ingest(messageApi.topicForNode(message && message.nodeId), JSON.stringify(message)) }
      catch (error) { result = { accepted: false, error: error.message || '模拟消息无效' } }
      if (result.accepted) {
        reportRecord(result, MODES.SIMULATION)
        if (shouldNotify && mode === MODES.SIMULATION) notifyChange()
      } else reportInvalid(result, MODES.SIMULATION)
      return result
    }

    function appendSimulatedSamples(shouldNotify = true) {
      if (mode !== MODES.SIMULATION || simulationPaused) return []
      const results = []
      simulation.NODES.forEach(({ nodeId }) => {
        try {
          const message = simulation.createNodeMessage(nodeId, sequenceByNode[nodeId]++)
          const result = ingestSimulation(message, false)
          results.push(result)
        } catch (error) {
          const result = { accepted: false, error: error.message || '模拟消息无效' }
          results.push(result)
          reportInvalid(result, MODES.SIMULATION)
        }
      })
      if (shouldNotify && results.some(result => result.accepted)) notifyChange()
      return results
    }

    function ingestMqtt(topic, payload) {
      let result
      try { result = stores[MODES.MQTT].ingest(topic, payload) }
      catch (error) { result = { accepted: false, error: error.message || 'MQTT 消息无效' } }
      if (result.accepted) {
        reportRecord(result, MODES.MQTT)
        if (mode === MODES.MQTT) notifyChange()
      } else {
        reportInvalid(result, MODES.MQTT)
      }
      return result
    }

    function setMode(nextMode) {
      if (nextMode !== MODES.MQTT && nextMode !== MODES.SIMULATION) return false
      if (nextMode === mode) return true

      if (nextMode === MODES.MQTT) {
        if (simulationTimer !== null) clearIntervalFn(simulationTimer)
        simulationTimer = null
        simulationPaused = false
        mode = MODES.MQTT
      } else {
        mode = MODES.SIMULATION
        simulationPaused = false
        appendSimulatedSamples(false)
        simulationTimer = setIntervalFn(appendSimulatedSamples, intervalMs)
      }
      notifyChange()
      return true
    }

    function destroy() {
      if (simulationTimer !== null) clearIntervalFn(simulationTimer)
      simulationTimer = null
      simulationPaused = false
    }

    function setSimulationPaused(paused) {
      if (mode !== MODES.SIMULATION) return false
      const next = Boolean(paused)
      if (next === simulationPaused) return true
      simulationPaused = next
      if (simulationTimer !== null) clearIntervalFn(simulationTimer)
      simulationTimer = next ? null : setIntervalFn(appendSimulatedSamples, intervalMs)
      return true
    }

    const feed = { ingestMqtt, ingestSimulation: message => ingestSimulation(message), setMode, setSimulationPaused,
      appendSimulatedSamples, destroy, nodeIds: simulation.NODES.map(node => node.nodeId) }
    Object.defineProperties(feed, {
      mode: { enumerable: true, get: () => mode },
      store: { enumerable: true, get: () => stores[mode] },
      simulationPaused: { enumerable: true, get: () => simulationPaused },
      simulationTimerActive: { enumerable: true, get: () => simulationTimer !== null }
    })
    return feed
  }

  return { MODES, createDashboardFeed }
})
