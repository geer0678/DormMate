;(function (root, factory) {
  const rules = typeof module !== 'undefined' && module.exports
    ? require('./dormmate')
    : root.DormMateRules
  const api = factory(rules)
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.DormMateMqttMessage = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rules) {
  'use strict'
  if (!rules || typeof rules.analyzeEnvironment !== 'function' || typeof rules.validateEnvironment !== 'function') {
    throw new Error('DormMate 九状态规则未加载')
  }

  const ALL_NODES_FILTER = 'dormmate/+/env'
  const NODE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
  const RECORD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
  const REQUIRED_FIELDS = ['schemaVersion', 'recordId', 'nodeId', 'temperature', 'humidity', 'status', 'time']

  function topicForNode(nodeId) {
    if (typeof nodeId !== 'string' || !NODE_ID_PATTERN.test(nodeId)) throw new Error('nodeId 格式无效')
    return 'dormmate/' + nodeId + '/env'
  }

  function nodeIdFromTopic(topic) {
    if (typeof topic !== 'string') return null
    const match = /^dormmate\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\/env$/.exec(topic)
    return match ? match[1] : null
  }

  function validateSubscriptionFilter(filter) {
    if (filter === ALL_NODES_FILTER) return { valid: true, nodeId: null, wildcard: true }
    const nodeId = nodeIdFromTopic(filter)
    return nodeId
      ? { valid: true, nodeId, wildcard: false }
      : { valid: false, error: '订阅 Topic Filter 格式无效' }
  }

  function isIso8601(value) {
    if (typeof value !== 'string') return false
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
    if (!match) return false
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
    const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6])
    const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
      31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return false
    if (match[8] && (Number(match[8]) > 23 || Number(match[9]) > 59)) return false
    return Number.isFinite(Date.parse(value))
  }

  function createMessage({ nodeId, temperature, humidity, recordId, time }) {
    topicForNode(nodeId)
    const measured = rules.validateEnvironment(temperature, humidity)
    if (!measured.valid) throw new Error(measured.error)
    if (typeof recordId !== 'string' || !RECORD_ID_PATTERN.test(recordId)) throw new Error('recordId 格式无效')
    if (!isIso8601(time)) throw new Error('time 必须是有效的 ISO 8601 时间')
    const state = rules.analyzeEnvironment(measured.temperature, measured.humidity)
    return {
      schemaVersion: 1,
      recordId,
      nodeId,
      temperature: measured.temperature,
      humidity: measured.humidity,
      status: state.status,
      time
    }
  }

  function payloadText(payload) {
    if (typeof payload === 'string') return payload
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(payload)) return payload.toString('utf8')
    if (typeof Uint8Array !== 'undefined' && payload instanceof Uint8Array && typeof TextDecoder !== 'undefined') {
      return new TextDecoder().decode(payload)
    }
    return null
  }

  function validateMessage(topic, payload) {
    const topicNodeId = nodeIdFromTopic(topic)
    if (!topicNodeId) return { valid: false, error: 'Publisher Topic 格式无效' }
    const text = payloadText(payload)
    if (text === null) return { valid: false, error: 'MQTT Payload 必须是 JSON 文本' }
    let value
    try { value = JSON.parse(text) } catch (_) { return { valid: false, error: 'MQTT Payload JSON 无效' } }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, error: 'MQTT JSON 必须是对象' }
    if (!REQUIRED_FIELDS.every(field => Object.prototype.hasOwnProperty.call(value, field))) {
      return { valid: false, error: 'MQTT JSON 缺少必需字段' }
    }
    if (value.schemaVersion !== 1) return { valid: false, error: 'schemaVersion 不受支持' }
    if (typeof value.nodeId !== 'string' || !NODE_ID_PATTERN.test(value.nodeId)) return { valid: false, error: 'nodeId 格式无效' }
    if (value.nodeId !== topicNodeId) return { valid: false, error: 'Topic nodeId 与 JSON nodeId 不一致' }
    if (typeof value.recordId !== 'string' || !RECORD_ID_PATTERN.test(value.recordId)) return { valid: false, error: 'recordId 格式无效' }
    const measured = rules.validateEnvironment(value.temperature, value.humidity)
    if (!measured.valid) return { valid: false, error: measured.error }
    if (!isIso8601(value.time)) return { valid: false, error: 'time 必须是有效的 ISO 8601 时间' }
    const state = rules.analyzeEnvironment(measured.temperature, measured.humidity)
    if (value.status !== state.status) return { valid: false, error: 'status 与九状态规则计算结果不一致' }
    const data = {}
    REQUIRED_FIELDS.forEach(field => { data[field] = value[field] })
    data.temperature = measured.temperature
    data.humidity = measured.humidity
    return { valid: true, data }
  }

  function createRecordIdDeduplicator() {
    const seen = new Set()
    return {
      has(recordId) { return seen.has(recordId) },
      accept(recordId) {
        if (typeof recordId !== 'string' || !RECORD_ID_PATTERN.test(recordId) || seen.has(recordId)) return false
        seen.add(recordId)
        return true
      },
      clear() { seen.clear() },
      get size() { return seen.size }
    }
  }

  return {
    ALL_NODES_FILTER,
    REQUIRED_FIELDS: REQUIRED_FIELDS.slice(),
    topicForNode,
    nodeIdFromTopic,
    validateSubscriptionFilter,
    isIso8601,
    createMessage,
    validateMessage,
    createRecordIdDeduplicator
  }
})
