'use strict'

const { randomUUID } = require('node:crypto')
const { NODES, createNodeMessage } = require('../utils/mqttSimulation')
const { topicForNode } = require('../utils/mqttMessage')

function startPublishers(options = {}) {
  const mqtt = options.mqtt || require('mqtt')
  const brokerUrl = options.brokerUrl || process.env.MQTT_URL || 'mqtt://127.0.0.1:1883'
  const intervalMs = options.intervalMs === undefined ? Number(process.env.MQTT_INTERVAL_MS || 3000) : options.intervalMs
  const now = options.now || (() => new Date())
  const createId = options.createId || randomUUID
  const logger = options.logger || console
  const setTimer = options.setInterval || setInterval
  const clearTimer = options.clearInterval || clearInterval
  if (!Number.isInteger(intervalMs) || intervalMs < 250) throw new Error('发布间隔必须是不小于 250ms 的整数')
  if (!mqtt || typeof mqtt.connect !== 'function') throw new Error('需要可用的 MQTT.js connect()')

  const publishers = NODES.map(({ nodeId }) => {
    const topic = topicForNode(nodeId)
    const client = mqtt.connect(brokerUrl, {
      clientId: 'dormmate-m5-' + nodeId + '-' + process.pid,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 1000
    })
    let sequence = 0
    const publish = () => {
      if (!client.connected) return
      const message = createNodeMessage(nodeId, sequence++, { recordId: createId(), time: now().toISOString() })
      const payload = JSON.stringify(message)
      client.publish(topic, payload, { qos: 1, retain: false }, error => {
        if (error) logger.error('[MQTT] 发布失败 ' + topic + ': ' + error.message)
        else logger.log('[MQTT] ' + topic + ' ' + payload)
      })
    }
    client.on('connect', () => {
      logger.log('[MQTT] 已连接 ' + nodeId + ' → ' + topic)
      publish()
    })
    client.on('error', error => logger.error('[MQTT] ' + nodeId + ': ' + error.message))
    client.on('offline', () => logger.warn('[MQTT] 节点离线 ' + nodeId + '，等待自动重连'))
    return { nodeId, topic, client, timer: setTimer(publish, intervalMs) }
  })

  let stopped = false
  return {
    publishers,
    stop() {
      if (stopped) return
      stopped = true
      publishers.forEach(({ client, timer }) => {
        clearTimer(timer)
        client.end(false)
      })
    }
  }
}

if (require.main === module) {
  let running
  try {
    running = startPublishers()
    console.log('[MQTT] 正在连接 ' + (process.env.MQTT_URL || 'mqtt://127.0.0.1:1883') + '；按 Ctrl+C 停止')
  } catch (error) {
    console.error('[MQTT] 无法启动 Publisher: ' + error.message)
    process.exitCode = 1
  }
  if (running) {
    const stop = () => { running.stop(); process.exitCode = 0 }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  }
}

module.exports = { startPublishers }
