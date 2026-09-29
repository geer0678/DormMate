const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const mini = require('../utils/cloudRecords')
const { createEnvironmentRecordsHandler } = require('../cloudfunctions/environmentRecords/core')

test('Web、小程序和 MQTT 共用一份云端历史与 recordId 去重', async () => {
  const rows = []
  const collection = {
    where({ recordId }) { return { limit() { return this }, async get() { return { data: rows.filter(row => row.recordId === recordId) } } } },
    async add({ data }) {
      if (rows.some(row => row.recordId === data.recordId)) throw new Error('E11000 duplicate key')
      rows.push({ ...data, _id: String(rows.length + 1) })
      return { _id: String(rows.length) }
    },
    orderBy() { return this }, skip(offset) { this.offset = offset; return this },
    limit(limit) { this.pageSize = limit; return this },
    async get() { return { data: rows.slice(this.offset, this.offset + this.pageSize) } }
  }
  const handler = createEnvironmentRecordsHandler({ database: () => ({ collection: () => collection,
    serverDate: () => new Date('2026-09-29T00:00:00.000Z') }) })
  const callFunction = async ({ data }) => ({ result: await handler(data) })
  let logins = 0
  const sdk = { init({ env }) {
    assert.equal(env, 'cloudbase-d6g6fprx873111e6a')
    return { auth() { return { async signInAnonymously() { logins++ }, async loginScope() { return 'anonymous' } } }, callFunction }
  } }
  const webContext = { window: { cloudbase: sdk }, cloudbase: sdk, Date, Error }
  vm.createContext(webContext)
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../cloudRecords.js'), 'utf8'), webContext)
  const web = expression => vm.runInContext(expression, webContext)
  const wx = { cloud: { callFunction } }

  await web('saveCloudRecord({ id: "web-12345678-test", temperature: 25, humidity: 55, measuredAt: "2026-09-28T12:00:00.000Z" })')
  const miniAfterWeb = await mini.list(wx)
  assert.equal(miniAfterWeb[0].source, 'web')
  assert.equal(miniAfterWeb[0].measuredAt, '2026-09-28T12:00:00.000Z')

  await mini.add(wx, { id: 'miniprogram-12345678-test', temperature: 31, humidity: 78,
    measuredAt: '2026-09-28T12:01:00.000Z' })
  const webAfterMini = await web('getCloudHistory()')
  assert.equal(webAfterMini.find(row => row.source === 'miniprogram').status, '偏热偏湿')

  const mqtt = { id: 'mqtt-dorm-b-12345678', recordId: 'mqtt-dorm-b-12345678', source: 'mqtt',
    nodeId: 'dorm-b', measuredAt: '2026-09-28T12:02:00.000Z', temperature: 24, humidity: 80 }
  const fromWeb = await web('saveCloudRecord(' + JSON.stringify(mqtt) + ')')
  const fromMini = await mini.add(wx, mqtt)
  assert.equal(fromWeb.duplicated, false)
  assert.equal(fromMini.duplicated, true)
  assert.equal(rows.length, 3)
  assert.equal((await mini.list(wx)).find(row => row.source === 'mqtt').nodeId, 'dorm-b')
  assert.equal((await web('getCloudHistory()')).find(row => row.source === 'mqtt').time, mini.fromCloud(rows[2]).time)
  const reloaded = { window: { cloudbase: sdk }, cloudbase: sdk, Date, Error }
  vm.createContext(reloaded)
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../cloudRecords.js'), 'utf8'), reloaded)
  assert.equal((await vm.runInContext('getCloudHistory()', reloaded)).length, 3)
  assert.equal(logins, 2, '每个独立 Web 页面上下文各进行一次匿名登录')
})
