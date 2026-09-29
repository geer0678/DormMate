'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const { EventEmitter } = require('node:events')
const config = require('../config/mqtt')
const rules = require('../utils/dormmate')
const contract = require('../utils/mqttMessage')
const realtime = require('../utils/mqttRealtime')
const cloudRecords = require('../utils/cloudRecords')

function harness() {
  const clients = []
  const received = []
  const states = []
  const mqtt = { connect(url, options) {
    const client = new EventEmitter()
    client.url = url; client.options = options; client.connected = false
    client.subscriptions = []; client.published = []
    client.subscribe = (topic, opts, callback) => { client.subscriptions.push({ topic, opts }); callback() }
    client.publish = (topic, payload, opts, callback) => { client.published.push({ topic, payload, opts }); callback() }
    client.end = () => { client.connected = false }
    clients.push(client)
    return client
  } }
  const bridge = realtime.createBridge({ mqtt, url: config.webUrl, nodeId: config.nodeId,
    topicFilter: config.topicFilter, onMessage: (record, data) => received.push({ record, data }),
    onStatus: state => states.push(state.state) })
  bridge.start()
  const client = clients[0]
  client.connected = true
  client.emit('connect')
  return { bridge, client, received, states }
}
const sample = (temperature, humidity, id = 'web-12345678-abcdefgh') => ({ id, temperature, humidity })
const emit = (client, data, topic = contract.topicForNode(data.nodeId)) => client.emit('message', topic, JSON.stringify(data))

test('Web 与小程序共享单一配置、Topic/JSON 契约和九状态结果', () => {
  assert.equal(config.nodeId, 'dorm-a')
  assert.equal(config.topicFilter, contract.ALL_NODES_FILTER)
  assert.match(config.webUrl, /^ws:\/\//)
  assert.match(config.miniUrl, /^wx:\/\//)
  for (const [temperature, humidity, status] of [[31, 78, '偏热偏湿'], [25, 55, '正常'], [24, 80, '偏湿']]) {
    const data = contract.createMessage({ nodeId: config.nodeId, temperature, humidity,
      recordId: sample(temperature, humidity).id, time: '2026-09-28T12:30:00.000Z' })
    assert.equal(data.status, status)
    assert.equal(contract.validateMessage(contract.topicForNode(config.nodeId), JSON.stringify(data)).valid, true)
    assert.equal(realtime.toDisplayRecord(data).advice, rules.analyzeEnvironment(temperature, humidity).advice)
  }
})

test('页面重开只重试待同步记录，不重写已经存在的 MQTT 云记录', () => {
  const data = contract.createMessage({ nodeId: config.nodeId, temperature: 25, humidity: 55,
    recordId: 'mqtt-dorm-a-12345678', time: '2026-09-28T12:30:00.000Z' })
  const record = realtime.toDisplayRecord(data)
  assert.equal(realtime.restorePending(record), null)
  assert.equal(realtime.restorePending({ ...record, syncPending: true }).measuredAt, data.time)
  const legacy = { ...record, measuredAt: undefined }
  assert.equal(contract.isIso8601(realtime.restorePending(legacy).measuredAt), true)
})

test('CloudBase 成功后才发布 QoS 1；CloudBase 失败或幂等重复不发布', async () => {
  const { bridge, client } = harness()
  const order = []
  const original = client.publish
  client.publish = (...args) => { order.push('mqtt'); original(...args) }
  const record = sample(31, 78)
  const result = await realtime.saveThenPublish(record, async () => { order.push('cloud'); return { success: true } }, bridge)
  assert.deepEqual(order, ['cloud', 'mqtt'])
  assert.equal(result.published, true)
  assert.equal(client.published[0].topic, contract.topicForNode(config.nodeId))
  assert.equal(client.published[0].opts.qos, 1)
  assert.equal(JSON.parse(client.published[0].payload).recordId, record.id)
  assert.equal(JSON.parse(client.published[0].payload).status, '偏热偏湿')
  await assert.rejects(realtime.saveThenPublish(record, async () => { throw new Error('cloud failed') }, bridge), /cloud failed/)
  assert.equal(client.published.length, 1)
  const duplicate = await realtime.saveThenPublish(record, async () => ({ duplicated: true }), bridge)
  assert.equal(duplicate.published, false)
  assert.equal(client.published.length, 1)
})

test('MQTT 故障不抹掉 CloudBase 保存结果', async () => {
  const { bridge, client } = harness()
  client.connected = false
  const offline = await realtime.saveThenPublish(sample(25, 55), async () => ({ success: true }), bridge)
  assert.equal(offline.saved.success, true)
  assert.equal(offline.published, false)
  client.connected = true
  client.publish = () => { throw new Error('socket failed') }
  const failed = await realtime.saveThenPublish(sample(25, 55), async () => ({ success: true }), bridge)
  assert.equal(failed.saved.success, true)
  assert.match(failed.publishError.message, /socket failed/)
})

test('接收只更新实时状态且 recordId 去重；非法 JSON、节点和伪造状态被丢弃', () => {
  const { client, received } = harness()
  const data = contract.createMessage({ nodeId: config.nodeId, temperature: 31, humidity: 78,
    recordId: 'miniprogram-1234-abcdefgh', time: '2026-09-28T12:30:00.000Z' })
  emit(client, data)
  emit(client, data)
  client.emit('message', contract.topicForNode(config.nodeId), '{bad')
  emit(client, data, contract.topicForNode('dorm-b'))
  emit(client, { ...data, status: '偏热' })
  assert.equal(received.length, 1)
  assert.equal(received[0].record.recordId, data.recordId)
  assert.equal(received[0].record.status, '偏热偏湿')
  assert.equal(received[0].record.nodeId, config.nodeId)
})

test('重连后恢复订阅和状态；自发消息回显不重复接收', () => {
  const { bridge, client, received, states } = harness()
  bridge.publishSaved(sample(24, 80))
  const item = client.published[0]
  client.emit('message', item.topic, item.payload)
  assert.equal(received.length, 0)
  client.emit('close')
  client.emit('reconnect')
  client.emit('connect')
  assert.deepEqual(states, ['connecting', 'connected', 'disconnected', 'reconnecting', 'connected'])
  assert.equal(client.subscriptions.length, 2)
  assert.deepEqual(client.subscriptions.map(item => item.topic), [config.topicFilter, config.topicFilter])
  bridge.stop()
  assert.equal(bridge.state, 'disconnected')
})

test('旧 CloudBase 数据无 nodeId 仍可读取；两端 MQTT 接收链路接入云写入', async () => {
  const old = { recordId: 'web-12345678-abcdefgh', temperature: 25, humidity: 55,
    status: '正常', advice: '旧记录', source: 'web', createdAt: '2026-09-28T12:30:00.000Z' }
  assert.equal(cloudRecords.fromCloud(old).recordId, old.recordId)
  assert.equal(cloudRecords.fromCloud(old).nodeId, undefined)
  const sources = [path.resolve(__dirname, '../../script.js'), path.resolve(__dirname, '../pages/index/index.js')]
  for (const file of sources) {
    const source = fs.readFileSync(file, 'utf8')
    assert.match(source, /mqttRealtime\.saveThenPublish|DormMateMqttRealtime\.saveThenPublish/)
    assert.match(source, /onMessage:/)
  }
  assert.match(fs.readFileSync(sources[0], 'utf8'), /await saveCloudRecord\(record\)/)
  assert.match(fs.readFileSync(sources[1], 'utf8'), /await cloudRecords\.add\(wx, record\)/)
})

test('小程序 vendored MQTT.js 导出 connect，包含微信 Socket transport', () => {
  const vendor = require('../vendor/mqtt.min')
  assert.equal(typeof vendor.connect, 'function')
  const bundled = fs.readFileSync(path.resolve(__dirname, '../vendor/mqtt.min.js'), 'utf8')
  assert.match(bundled, /connectSocket/)
})

test('小程序 MQTT.js 实际选择 wx.connectSocket，使用 MQTT WebSocket 子协议', () => {
  const oldWx = global.wx
  const sockets = []
  global.wx = { connectSocket(options) {
    sockets.push(options)
    return { onOpen() {}, onMessage() {}, onClose() {}, onError() {},
      close({ success } = {}) { if (success) success() }, send({ success } = {}) { if (success) success() } }
  } }
  try {
    const vendor = require('../vendor/mqtt.min')
    const client = vendor.connect(config.miniUrl, { clientId: 'dormmate-test',
      forceNativeWebSocket: true, timerVariant: 'native', reconnectPeriod: 0, connectTimeout: 100 })
    assert.equal(sockets[0].url, 'ws://127.0.0.1:9001/')
    assert.deepEqual(sockets[0].protocols, ['mqtt'])
    client.end(true)
  } finally { global.wx = oldWx }
})

test('小程序 bundle 在无 AbortController、self、window、navigator 的环境可初始化并走 wx transport', () => {
  const calls = []
  // 微信模块中的 globalThis 属性不一定成为 self/window 自由变量；global 也可能是另一个对象。
  const sandbox = { globalThis: {}, global: {}, module: { exports: {} },
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    wx: { connectSocket(options) {
      calls.push(options)
      return { onOpen() {}, onMessage() {}, onClose() {}, onError() {},
        close({ success } = {}) { if (success) success() }, send({ success } = {}) { if (success) success() } }
    } } }
  assert.equal(sandbox.globalThis.AbortController, undefined)
  assert.equal(sandbox.self, undefined)
  assert.equal(sandbox.navigator, undefined)
  const bundled = fs.readFileSync(path.resolve(__dirname, '../vendor/mqtt.min.js'), 'utf8')
  const browserIife = fs.readFileSync(path.resolve(__dirname, '../node_modules/mqtt/dist/mqtt.min.js'), 'utf8')
  assert.equal(bundled.startsWith(browserIife), false)
  const phases = bundled.split('/* DormMate MQTT.js client phase */')
  assert.equal(phases.length, 2)
  vm.runInNewContext(phases[0], sandbox, { filename: 'mqtt-mini-bootstrap.js' })
  assert.equal(typeof sandbox.globalThis.AbortController, 'function')
  assert.equal(typeof sandbox.globalThis.AbortSignal, 'function')
  assert.equal(typeof sandbox.globalThis.navigator, 'object')
  assert.equal(typeof sandbox.globalThis.self.AbortController, 'function')
  assert.equal(typeof sandbox.globalThis.window.AbortController, 'function')
  assert.equal(typeof sandbox.module.exports.connect, 'undefined')
  vm.runInNewContext(phases[1], sandbox, { filename: 'mqtt-mini-client.js' })
  assert.equal(typeof sandbox.module.exports.connect, 'function')
  let settings
  const mqtt = { connect(url, options) {
    settings = options
    return sandbox.module.exports.connect(url, { ...options, reconnectPeriod: 0, connectTimeout: 100 })
  } }
  const bridge = realtime.createBridge({ mqtt, url: config.miniUrl, nodeId: config.nodeId,
    clientId: 'dormmate-vm-test' })
  assert.equal(bridge.start(), true)
  assert.equal(settings.timerVariant, 'native')
  assert.equal(settings.forceNativeWebSocket, true)
  assert.equal(calls[0].url, 'ws://127.0.0.1:9001/')
  assert.deepEqual(Array.from(calls[0].protocols), ['mqtt'])
  bridge.stop()
  const fullSandbox = { globalThis: {}, global: {}, module: { exports: {} },
    console, setTimeout, clearTimeout, setInterval, clearInterval, wx: sandbox.wx }
  vm.runInNewContext(bundled, fullSandbox, { filename: 'mqtt-mini-bundle.js' })
  assert.equal(typeof fullSandbox.globalThis.AbortController, 'function')
  assert.equal(typeof fullSandbox.module.exports.connect, 'function')
})

test('小程序桥接器明确传入 wx URL、原生计时器和微信 transport 选项', () => {
  const options = []
  const mqtt = { connect(url, settings) {
    options.push({ url, settings })
    const client = new EventEmitter()
    client.end = () => {}
    return client
  } }
  const bridge = realtime.createBridge({ mqtt, url: config.miniUrl, nodeId: config.nodeId })
  bridge.start()
  assert.equal(options[0].url, config.miniUrl)
  assert.equal(options[0].settings.timerVariant, 'native')
  assert.equal(options[0].settings.forceNativeWebSocket, true)
  bridge.stop()
})

function loadWeb(save, getHistory = async () => []) {
  const elements = new Map()
  function element(id) {
    if (!elements.has(id)) elements.set(id, { id, value: '', textContent: '', innerHTML: '',
      listeners: {}, addEventListener(name, callback) { this.listeners[name] = callback },
      appendChild() {}, removeChild() {}, click() {} })
    return elements.get(id)
  }
  const values = new Map()
  let bridgeOptions
  let mqttPublishes = 0
  const bridge = { start() {}, publishSaved() { mqttPublishes++; return true } }
  const context = { console, Date, Math, setTimeout() {}, setInterval() {}, Blob: class {}, URL: { createObjectURL() {} },
    localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
    document: { getElementById: element, createElement: () => element('created'), body: element('body'),
      addEventListener() {}, hidden: false },
    window: { DormMateMqttConfig: config, mqtt: {} }, DormMateRules: rules,
    getCloudHistory: getHistory, saveCloudRecord: save,
    DormMateMqttRealtime: { saveThenPublish: realtime.saveThenPublish, restorePending: realtime.restorePending,
      createBridge(options) { bridgeOptions = options; return bridge } } }
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../script.js'), 'utf8'), context)
  return { element, values, get mqttPublishes() { return mqttPublishes }, get bridgeOptions() { return bridgeOptions } }
}

test('Web 页面保存后发布；MQTT 接收即时更新并幂等写云', async () => {
  let cloudWrites = 0
  const cloudRows = []
  const web = loadWeb(async record => {
    cloudWrites++
    const { syncPending, ...saved } = record
    if (!cloudRows.some(item => item.id === record.id)) cloudRows.unshift({ ...saved, source: record.source || 'web' })
    return { success: true }
  }, async () => cloudRows.slice())
  web.element('temperature').value = '31'
  web.element('humidity').value = '78'
  await web.element('analyzeButton').listeners.click()
  assert.equal(cloudWrites, 1)
  assert.equal(web.mqttPublishes, 1)
  assert.equal(web.element('result').innerHTML.includes('偏热偏湿'), true)
  const message = contract.createMessage({ nodeId: config.nodeId, recordId: 'miniprogram-1234-abcdefgh',
    temperature: 25, humidity: 55, time: '2026-09-28T12:30:00.000Z' })
  const record = realtime.toDisplayRecord(message)
  await web.bridgeOptions.onMessage(record)
  await web.bridgeOptions.onMessage(record)
  assert.equal(web.element('temperature').value, 25)
  assert.match(web.element('result').textContent, /正常/)
  assert.equal(JSON.parse(web.values.get('dormMateHistory')).length, 2)
  assert.equal(cloudWrites, 2)
  const failed = loadWeb(async () => { throw new Error('cloud failed') })
  failed.element('temperature').value = '31'
  failed.element('humidity').value = '78'
  await failed.element('analyzeButton').listeners.click()
  assert.equal(failed.mqttPublishes, 0)
})

test('小程序页面 MQTT 接收写云；本机创建记录由 CloudBase 成功后发布', async () => {
  const filename = path.resolve(__dirname, '../pages/index/index.js')
  const realRequire = createRequire(filename)
  const rows = []
  const order = []
  let onMessage
  const bridge = { start() {}, stop() {}, publishSaved() { order.push('mqtt'); return true } }
  const wxApi = { connectSocket() {}, getStorageSync() { return '' }, setStorageSync() {},
    cloud: { callFunction({ data }) {
      if (data.action === 'list') return Promise.resolve({ result: { success: true, records: rows, nextOffset: null } })
      order.push('cloud')
      rows.unshift({ recordId: data.recordId, temperature: data.temperature, humidity: data.humidity,
        status: rules.analyzeEnvironment(data.temperature, data.humidity).status,
        advice: rules.analyzeEnvironment(data.temperature, data.humidity).advice,
        createdAt: new Date().toISOString(), source: data.source })
      return Promise.resolve({ result: { success: true } })
    } } }
  let definition
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require(id) {
      if (id === '../../utils/mqttRealtime') return { ...realtime,
        createBridge(options) { onMessage = options.onMessage; return bridge } }
      if (id === '../../utils/speech') return { createSpeech: () => ({ available: false, speak() {}, destroy() {} }) }
      return realRequire(id)
    }, wx: wxApi, Page(value) { definition = value }, console, Date, Math,
    setInterval() { return 1 }, clearInterval() {}
  })
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch) } }
  page.onLoad()
  await new Promise(setImmediate)
  const incoming = contract.createMessage({ nodeId: config.nodeId, temperature: 31, humidity: 78,
    recordId: 'web-12345678-abcdefgh', time: '2026-09-28T12:30:00.000Z' })
  await onMessage(realtime.toDisplayRecord(incoming))
  assert.equal(page.data.status, '偏热偏湿')
  assert.equal(page.data.currentNodeId, config.nodeId)
  assert.deepEqual(order, ['cloud'])
  page.inputTemperature({ detail: { value: '25' } })
  page.inputHumidity({ detail: { value: '55' } })
  await page.updateEnvironment()
  assert.deepEqual(order, ['cloud', 'cloud', 'mqtt'])
  assert.equal(page.data.status, '正常')
  page.onUnload()
})
