;(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports
  const message = isNode ? require('./mqttMessage') : root.DormMateMqttMessage
  const rules = isNode ? require('./dormmate') : root.DormMateRules
  const api = factory(message, rules)
  if (isNode) module.exports = api
  if (typeof window !== 'undefined') window.DormMateMqttRealtime = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function (message, rules) {
  'use strict'
  const STATES = { connecting: '连接中', connected: '已连接', disconnected: '已断开', reconnecting: '重连中', error: '连接错误' }

  function toDisplayRecord(data) {
    const date = new Date(data.time)
    return { id: data.recordId, recordId: data.recordId, nodeId: data.nodeId, measuredAt: data.time,
      time: rules.formatTime(date), temperature: data.temperature, humidity: data.humidity,
      status: data.status, advice: rules.analyzeEnvironment(data.temperature, data.humidity).advice, source: 'mqtt' }
  }

  function restorePending(record) {
    if (!record || !record.nodeId || !(record.recordId || record.id)) return null
    if (record.syncPending !== true && !(record.source === 'mqtt' && !record.measuredAt)) return null
    if (message.isIso8601(record.measuredAt)) return record
    const date = new Date(String(record.time || '').replace(' ', 'T'))
    return Number.isNaN(date.getTime()) ? null : { ...record, measuredAt: date.toISOString() }
  }

  function createBridge({ mqtt, url, nodeId, topicFilter = message.ALL_NODES_FILTER,
    onMessage = () => {}, onStatus = () => {}, clientId } = {}) {
    message.topicForNode(nodeId)
    if (!message.validateSubscriptionFilter(topicFilter).valid) throw new Error('订阅 Topic Filter 格式无效')
    const seen = message.createRecordIdDeduplicator()
    let client = null
    let generation = 0
    let state = 'disconnected'
    function report(next, error) {
      state = next
      onStatus({ state: next, label: STATES[next], error: error ? String(error.message || error) : null })
    }
    function start() {
      if (client) return true
      report('connecting')
      if (!mqtt || typeof mqtt.connect !== 'function') { report('error', 'MQTT.js 未加载'); return false }
      const token = ++generation
      try {
        client = mqtt.connect(url, { clientId: clientId || 'dormmate-' + Math.random().toString(36).slice(2, 12),
          clean: true, connectTimeout: 10000, reconnectPeriod: 1000, resubscribe: false,
          timerVariant: 'native', forceNativeWebSocket: /^wxs?:\/\//.test(url) })
        if (!client || typeof client.on !== 'function') throw new Error('MQTT.js 客户端无效')
      } catch (error) { client = null; report('error', error); return false }
      const active = () => client && generation === token
      client.on('connect', () => {
        if (!active()) return
        report('connected')
        try { client.subscribe(topicFilter, { qos: 1 }, error => { if (active() && error) report('error', error) }) }
        catch (error) { report('error', error) }
      })
      client.on('reconnect', () => { if (active()) report('reconnecting') })
      client.on('offline', () => { if (active()) report('disconnected') })
      client.on('close', () => { if (active()) report('disconnected') })
      client.on('error', error => { if (active()) report('error', error) })
      client.on('message', (topic, payload) => {
        if (!active()) return
        const checked = message.validateMessage(topic, payload)
        if (!checked.valid || !seen.accept(checked.data.recordId)) return
        try { onMessage(toDisplayRecord(checked.data), checked.data) }
        catch (error) { report('error', error) }
      })
      return true
    }
    function publishSaved(record) {
      if (!client || !client.connected) return false
      const data = message.createMessage({ nodeId, recordId: record.recordId || record.id,
        temperature: record.temperature, humidity: record.humidity, time: record.measuredAt || new Date().toISOString() })
      const topic = message.topicForNode(nodeId)
      client.publish(topic, JSON.stringify(data), { qos: 1 }, error => { if (error) report('error', error) })
      seen.accept(data.recordId)
      return true
    }
    function stop() {
      generation++
      const previous = client
      client = null
      if (previous && typeof previous.end === 'function') previous.end(true)
      report('disconnected')
    }
    return { start, stop, publishSaved, get state() { return state }, get connected() { return Boolean(client && client.connected) } }
  }

  async function saveThenPublish(record, save, bridge) {
    const saved = await save(record)
    if (!saved || saved.success === false) throw new Error('CloudBase 保存失败')
    if (saved && saved.duplicated) return { saved, published: false, duplicate: true }
    try { return { saved, published: Boolean(bridge && bridge.publishSaved(record)) } }
    catch (publishError) { return { saved, published: false, publishError } }
  }
  return { STATES, toDisplayRecord, restorePending, createBridge, saveThenPublish }
})
