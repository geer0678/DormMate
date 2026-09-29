;(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports
  const messageApi = isNode ? require('../miniprogram/utils/mqttMessage') : root.DormMateMqttMessage
  const mqttClient = isNode ? null : root.mqtt
  const api = factory(messageApi, mqttClient, root)
  if (isNode) module.exports = api
  if (typeof window !== 'undefined') window.DormMateMqttTransport = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function (messageApi, defaultMqtt, root) {
  'use strict'
  if (!messageApi || !messageApi.ALL_NODES_FILTER) throw new Error('DormMate MQTT 消息模块未加载')

  const DEFAULT_URL = 'ws://127.0.0.1:9001'
  const STATES = Object.freeze({
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    RECONNECTING: 'reconnecting',
    ERROR: 'error'
  })

  function createMqttTransport({
    mqtt = defaultMqtt,
    url = DEFAULT_URL,
    onMessage = () => undefined,
    onStatus = () => undefined,
    clientId
  } = {}) {
    let client = null
    let generation = 0
    let state = null

    function report(nextState, error) {
      state = nextState
      try {
        onStatus({ state: nextState, error: error ? String(error.message || error) : null })
      } catch (_) {}
    }

    function start() {
      if (client) return true
      report(STATES.CONNECTING)
      if (!mqtt || typeof mqtt.connect !== 'function') {
        report(STATES.ERROR, new Error('MQTT.js 浏览器库未加载'))
        return false
      }

      const token = ++generation
      try {
        const id = clientId || 'dormmate-dashboard-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
        client = mqtt.connect(url, {
          clientId: id,
          clean: true,
          connectTimeout: 10000,
          reconnectPeriod: 1000,
          resubscribe: false
        })
        if (!client || typeof client.on !== 'function' || typeof client.subscribe !== 'function') {
          client = null
          report(STATES.ERROR, new Error('MQTT.js 未返回有效客户端'))
          return false
        }
      } catch (error) {
        client = null
        report(STATES.ERROR, error)
        return false
      }

      const active = () => generation === token && client !== null
      client.on('connect', () => {
        if (!active()) return
        report(STATES.CONNECTED)
        try {
          client.subscribe(messageApi.ALL_NODES_FILTER, { qos: 1 }, error => {
            if (active() && error) report(STATES.ERROR, error)
          })
        } catch (error) {
          if (active()) report(STATES.ERROR, error)
        }
      })
      client.on('reconnect', () => { if (active()) report(STATES.RECONNECTING) })
      client.on('close', () => { if (active()) report(STATES.DISCONNECTED) })
      client.on('offline', () => { if (active()) report(STATES.DISCONNECTED) })
      client.on('error', error => { if (active()) report(STATES.ERROR, error) })
      client.on('message', (topic, payload) => {
        if (!active()) return
        try { onMessage(topic, payload) }
        catch (error) {
          try { onStatus({ state, error: String(error.message || error), topic }) }
          catch (_) {}
        }
      })
      return true
    }

    function stop() {
      generation++
      const current = client
      client = null
      if (current && typeof current.end === 'function') {
        try { current.end(true) }
        catch (_) {}
      }
      report(STATES.DISCONNECTED)
    }

    return {
      start,
      stop,
      get state() { return state },
      get connected() { return Boolean(client && client.connected) }
    }
  }

  return { DEFAULT_URL, STATES, createMqttTransport }
})
