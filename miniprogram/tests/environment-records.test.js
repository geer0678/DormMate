const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const rules = require('../cloudfunctions/environmentRecords/rules')
const { createEnvironmentRecordsHandler, isDuplicateRecordId } = require('../cloudfunctions/environmentRecords/core')
const setup = require('../cloudbase/environment-records-setup.json')

const expectedStatuses = [
  ['偏冷偏干', '偏冷', '偏冷偏湿'],
  ['偏干', '正常', '偏湿'],
  ['偏热偏干', '偏热', '偏热偏湿']
]
const temperatures = [17, 25, 31]
const humidities = [30, 50, 80]

test('9 个指定输入点由云端规则返回既有九状态结果', () => {
  temperatures.forEach((temperature, ti) => humidities.forEach((humidity, hi) => {
    assert.equal(rules.analyzeEnvironment(temperature, humidity).status, expectedStatuses[ti][hi])
  }))
})

test('云端再次校验温湿度；字符串数值可用，布尔值、非有限数及越界值拒绝', () => {
  assert.deepEqual(rules.validateEnvironment('31.5', '78'), { valid: true, temperature: 31.5, humidity: 78 })
  for (const [temperature, humidity] of [[NaN, 50], [Infinity, 50], [true, 50], ['', 50], [-0.1, 30], [51, 30], [25, -1], [25, 101]]) {
    assert.equal(rules.validateEnvironment(temperature, humidity).valid, false)
  }
})

test('setup 明确配置客户端只读规则及数据库层 recordId UNIQUE 索引', () => {
  assert.deepEqual(setup.securityRules, { read: 'auth != null', write: false })
  const unique = setup.indexes.find(index => index.name === 'recordId_unique')
  assert.deepEqual(unique, { name: 'recordId_unique', fields: [{ name: 'recordId', direction: 'ASC' }], unique: true })
  const functionRules = require('../cloudbase/functions.security-rules.json')
  assert.deepEqual(functionRules, {
    '*': { invoke: false },
    speechRecognition: { invoke: 'auth != null' },
    environmentRecords: { invoke: 'auth != null' }
  })
})

function memoryCloud({ duplicateOnAdd = false } = {}) {
  const rows = new Map()
  let nextId = 1
  let failNext = duplicateOnAdd
  const collection = {
    where(query) {
      return {
        limit() { return this },
        async get() { return { data: [...rows.values()].filter(row => row.recordId === query.recordId) } }
      }
    },
    async add({ data }) {
      if (failNext) {
        failNext = false
        const error = new Error('DATABASE_DUPLICATE_WRITE')
        error.code = 'DATABASE_DUPLICATE_WRITE'
        throw error
      }
      if ([...rows.values()].some(row => row.recordId === data.recordId)) {
        const error = new Error('duplicate key')
        error.code = 'DATABASE_DUPLICATE_WRITE'
        throw error
      }
      const _id = 'auto-' + nextId++
      rows.set(_id, { ...data, _id })
      return { _id }
    },
    orderBy() { return this },
    skip() { return this },
    limit() { return this },
    async get() { return { data: [...rows.values()] } },
    doc(_id) {
      return {
        async update({ data }) { rows.set(_id, { ...rows.get(_id), ...data }) },
        async remove() { rows.delete(_id) }
      }
    }
  }
  return { database: () => ({ collection: () => collection, serverDate: () => 'SERVER_DATE' }), rows }
}

test('新增时忽略客户端 status/advice，存储服务器计算结果和服务器时间', async () => {
  const cloud = memoryCloud()
  const handler = createEnvironmentRecordsHandler(cloud)
  const result = await handler({ action: 'add', recordId: 'web-1234567890', source: 'web', temperature: 31, humidity: 78,
    status: '正常', advice: '客户端伪造' })
  assert.equal(result.success, true)
  assert.equal(result.duplicated, false)
  assert.equal(result.record.status, '偏热偏湿')
  assert.equal(result.record.advice, rules.analyzeEnvironment(31, 78).advice)
  assert.equal(result.record.createdAt, 'SERVER_DATE')
  assert.equal(result.record.updatedAt, 'SERVER_DATE')
  assert.equal(result.record._id, 'auto-1')
})

test('唯一索引冲突回查 recordId 并返回幂等成功原记录', async () => {
  const cloud = memoryCloud({ duplicateOnAdd: true })
  cloud.rows.set('preexisting-auto-id', {
    _id: 'preexisting-auto-id', recordId: 'web-1234567890', temperature: 24, humidity: 60,
    status: '正常', advice: 'existing advice', source: 'web', createdAt: 'old-server-time', updatedAt: 'old-server-time', schemaVersion: 1
  })
  const handler = createEnvironmentRecordsHandler(cloud)
  const result = await handler({ action: 'add', recordId: 'web-1234567890', source: 'web', temperature: 24, humidity: 60 })
  assert.deepEqual(result, { success: true, duplicated: true, record: cloud.rows.get('preexisting-auto-id') })
})

test('recordId 唯一索引冲突识别 CloudBase 常见错误码与 E11000', () => {
  assert.equal(isDuplicateRecordId({ code: 'DATABASE_DUPLICATE_WRITE' }), true)
  assert.equal(isDuplicateRecordId({ code: -502007 }), true)
  assert.equal(isDuplicateRecordId(new Error('E11000 duplicate key error')), true)
  assert.equal(isDuplicateRecordId(new Error('network timeout')), false)
})

test('来源枚举、recordId 和不支持的操作在写库前拒绝', async () => {
  const cloud = memoryCloud()
  const handler = createEnvironmentRecordsHandler(cloud)
  assert.equal((await handler({ action: 'add', recordId: 'web-1234567890', source: 'android', temperature: 25, humidity: 50 })).code, 'INVALID_SOURCE')
  assert.equal((await handler({ action: 'add', recordId: '../record', source: 'web', temperature: 25, humidity: 50 })).code, 'INVALID_RECORD_ID')
  assert.equal((await handler({ action: 'add', recordId: 'web-1234567890', source: 'web', temperature: 51, humidity: 50 })).code, 'INVALID_MEASUREMENT')
  assert.equal((await handler({ action: 'unknown' })).code, 'INVALID_ACTION')
  assert.equal(cloud.rows.size, 0)
})

test('云函数配置不开放 HTTP OpenAPI 写入口', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../cloudfunctions/environmentRecords/config.json'), 'utf8'))
  assert.deepEqual(config.permissions.openapi, [])
})
