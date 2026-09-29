'use strict'

const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const test = require('node:test')
const messageApi = require('../utils/mqttMessage')
const { createDashboardStore } = require('../../m5-dashboard/dashboardStore')
const { createDashboardFeed, MODES } = require('../../m5-dashboard/dashboardFeed')
const { createMqttTransport, DEFAULT_URL, STATES } = require('../../m5-dashboard/mqttTransport')

function makeMessage(nodeId, recordId, temperature, humidity, time = '2026-09-28T12:30:00.000Z') {
  return messageApi.createMessage({ nodeId, recordId, temperature, humidity, time })
}

class FakeClient extends EventEmitter {
  constructor() {
    super()
    this.subscriptions = []
    this.ended = []
    this.connected = false
  }

  subscribe(topic, options, callback) {
    this.subscriptions.push({ topic, options })
    if (callback) callback(null, [{ topic, qos: options.qos }])
  }

  end(force) { this.ended.push(force) }
}

test('MQTT transport connects to WebSocket, reports states and resubscribes after reconnect', () => {
  const client = new FakeClient()
  const states = []
  const connectCalls = []
  const mqtt = { connect(url, options) { connectCalls.push({ url, options }); return client } }
  const transport = createMqttTransport({ mqtt, onStatus: event => states.push(event.state) })

  assert.equal(transport.start(), true)
  assert.equal(transport.state, STATES.CONNECTING)
  assert.equal(connectCalls[0].url, DEFAULT_URL)
  assert.equal(connectCalls[0].options.resubscribe, false)
  assert.equal(connectCalls[0].options.reconnectPeriod, 1000)
  client.emit('connect')
  assert.equal(transport.state, STATES.CONNECTED)
  assert.deepEqual(client.subscriptions[0], { topic: messageApi.ALL_NODES_FILTER, options: { qos: 1 } })
  client.emit('close')
  assert.equal(transport.state, STATES.DISCONNECTED)
  client.emit('reconnect')
  assert.equal(transport.state, STATES.RECONNECTING)
  client.emit('error', new Error('socket unavailable'))
  assert.equal(transport.state, STATES.ERROR)
  client.emit('connect')
  assert.equal(client.subscriptions.length, 2)
  transport.stop()
  assert.deepEqual(client.ended, [true])
  assert.equal(transport.state, STATES.DISCONNECTED)
  client.emit('connect')
  assert.equal(client.subscriptions.length, 2)
  assert.ok(states.includes(STATES.CONNECTING))
  assert.ok(states.includes(STATES.CONNECTED))
  assert.ok(states.includes(STATES.DISCONNECTED))
  assert.ok(states.includes(STATES.RECONNECTING))
  assert.ok(states.includes(STATES.ERROR))
})

test('MQTT messages enter the existing DashboardStore validator and stay isolated by node', () => {
  const store = createDashboardStore()
  const results = []
  const client = new FakeClient()
  const transport = createMqttTransport({
    mqtt: { connect: () => client },
    onMessage: (topic, payload) => results.push(store.ingest(topic, payload))
  })
  transport.start()
  client.emit('connect')

  const dormA = makeMessage('dorm-a', 'mqtt-dorm-a-001', 31, 78)
  const dormB = makeMessage('dorm-b', 'mqtt-dorm-b-001', 25, 55)
  const dormC = makeMessage('dorm-c', 'mqtt-dorm-c-001', 24, 80)
  for (const message of [dormA, dormB, dormC]) {
    client.emit('message', messageApi.topicForNode(message.nodeId), Buffer.from(JSON.stringify(message)))
  }
  client.emit('message', messageApi.topicForNode('dorm-a'), Buffer.from(JSON.stringify(dormA)))
  client.emit('message', messageApi.topicForNode('dorm-b'), Buffer.from('{invalid json'))
  client.emit('message', messageApi.topicForNode('dorm-c'), Buffer.from(JSON.stringify(dormA)))
  client.emit('message', messageApi.topicForNode('dorm-c'), Buffer.from(JSON.stringify({ ...dormC, status: '正常' })))

  assert.deepEqual(store.nodeIds.map(nodeId => store.getHistory(nodeId).length), [1, 1, 1])
  assert.deepEqual(store.nodeIds.map(nodeId => store.getHistory(nodeId)[0].status), ['偏热偏湿', '正常', '偏湿'])
  assert.equal(results.filter(result => result.accepted).length, 3)
  assert.equal(results[3].duplicate, true)
  assert.equal(results[4].accepted, false)
  assert.equal(results[5].accepted, false)
  assert.equal(results[6].accepted, false)
  transport.stop()
})

test('MQTT mode never starts the simulation timer; switching modes isolates both Stores', () => {
  const stores = { mqtt: createDashboardStore(), simulation: createDashboardStore() }
  const timers = []
  const cleared = []
  const feed = createDashboardFeed({
    stores,
    intervalMs: 1800,
    setIntervalFn(callback, interval) { timers.push({ callback, interval }); return timers.length },
    clearIntervalFn(id) { cleared.push(id) }
  })

  assert.equal(feed.mode, MODES.MQTT)
  assert.equal(feed.store, stores.mqtt)
  assert.equal(feed.simulationTimerActive, false)
  assert.equal(timers.length, 0)
  assert.equal(feed.ingestMqtt(messageApi.topicForNode('dorm-b'), JSON.stringify(makeMessage('dorm-b', 'feed-mqtt-001', 25, 55))).accepted, true)
  assert.equal(stores.simulation.getHistory('dorm-b').length, 0)

  assert.equal(feed.setMode(MODES.SIMULATION), true)
  assert.equal(feed.store, stores.simulation)
  assert.equal(feed.simulationTimerActive, true)
  assert.equal(timers.length, 1)
  assert.equal(timers[0].interval, 1800)
  assert.deepEqual(feed.nodeIds.map(nodeId => stores.simulation.getHistory(nodeId).length), [1, 1, 1])
  timers[0].callback()
  assert.deepEqual(feed.nodeIds.map(nodeId => stores.simulation.getHistory(nodeId).length), [2, 2, 2])

  assert.equal(feed.setMode(MODES.MQTT), true)
  assert.deepEqual(cleared, [1])
  assert.equal(feed.simulationTimerActive, false)
  const before = feed.nodeIds.map(nodeId => stores.simulation.getHistory(nodeId).length)
  timers[0].callback()
  assert.deepEqual(feed.nodeIds.map(nodeId => stores.simulation.getHistory(nodeId).length), before)
  assert.equal(feed.store, stores.mqtt)
  assert.equal(stores.mqtt.getHistory('dorm-b').length, 1)
  assert.equal(stores.simulation.getHistory('dorm-b').length, 2)
  feed.destroy()
})
