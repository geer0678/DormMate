const { analyzeEnvironment, validateEnvironment } = require('./rules')

const COLLECTION = 'environment_records'
const SOURCES = new Set(['web', 'miniprogram', 'mqtt'])
const MAX_PAGE_SIZE = 100
const RECORD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/
const NODE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function validMeasuredAt(value) {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value)
  if (!match) return false
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) return false
  if (match[8] && (Number(match[8]) > 23 || Number(match[9]) > 59)) return false
  return Number.isFinite(Date.parse(value))
}

function fail(code, error) {
  return { success: false, code, error }
}

function isDuplicateRecordId(error) {
  if (!error) return false
  const code = String(error.code == null ? '' : error.code).toUpperCase()
  const message = String(error.message || error.errMsg || error)
  return code === 'DATABASE_DUPLICATE_WRITE' || code === 'DUPLICATE_KEY' || code === '-502007' ||
    /DATABASE_DUPLICATE_WRITE|duplicate key|E11000/i.test(message)
}

function createEnvironmentRecordsHandler(cloud) {
  const db = cloud.database()
  const collection = db.collection(COLLECTION)

  async function findByRecordId(recordId) {
    const result = await collection.where({ recordId }).limit(1).get()
    return result && Array.isArray(result.data) ? result.data[0] || null : null
  }

  async function add(event) {
    const { recordId, source } = event
    if (typeof recordId !== 'string' || !RECORD_ID_PATTERN.test(recordId)) {
      return fail('INVALID_RECORD_ID', 'recordId 格式无效')
    }
    if (!SOURCES.has(source)) return fail('INVALID_SOURCE', 'source 只允许 web、miniprogram 或 mqtt')
    if (event.nodeId !== undefined && (typeof event.nodeId !== 'string' || !NODE_ID_PATTERN.test(event.nodeId))) {
      return fail('INVALID_NODE_ID', 'nodeId 格式无效')
    }
    if (event.measuredAt !== undefined && !validMeasuredAt(event.measuredAt)) {
      return fail('INVALID_MEASURED_AT', 'measuredAt 必须是有效的 ISO 8601 时间')
    }
    if (source === 'mqtt' && (!event.nodeId || !event.measuredAt)) {
      return fail('INVALID_MQTT_RECORD', 'MQTT 记录缺少 nodeId 或 measuredAt')
    }

    const measured = validateEnvironment(event.temperature, event.humidity)
    if (!measured.valid) return fail('INVALID_MEASUREMENT', measured.error)
    const state = analyzeEnvironment(measured.temperature, measured.humidity)
    const record = {
      recordId,
      temperature: measured.temperature,
      humidity: measured.humidity,
      status: state.status,
      advice: state.advice,
      source,
      ...(event.nodeId ? { nodeId: event.nodeId } : {}),
      ...(event.measuredAt ? { measuredAt: event.measuredAt } : {}),
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
      schemaVersion: 1
    }

    try {
      const result = await collection.add({ data: record })
      return { success: true, duplicated: false, record: { ...record, _id: result._id } }
    } catch (error) {
      if (!isDuplicateRecordId(error)) throw error
      // The UNIQUE database index is the concurrency boundary. A collision is
      // an idempotent success only after we retrieve the committed document.
      const existing = await findByRecordId(recordId)
      if (existing) return { success: true, duplicated: true, record: existing }
      throw error
    }
  }

  async function list(event) {
    const offset = Number.isInteger(event.offset) && event.offset >= 0 ? event.offset : 0
    const requestedLimit = Number.isInteger(event.limit) && event.limit > 0 ? event.limit : MAX_PAGE_SIZE
    const limit = Math.min(requestedLimit, MAX_PAGE_SIZE)
    const result = await collection.orderBy('createdAt', 'desc').orderBy('recordId', 'asc')
      .skip(offset).limit(limit).get()
    const records = result && Array.isArray(result.data) ? result.data : []
    return { success: true, records, nextOffset: records.length === limit ? offset + records.length : null }
  }

  return async function handle(event = {}) {
    try {
      switch (event.action) {
        case 'add': return await add(event)
        case 'list': return await list(event)
        default: return fail('INVALID_ACTION', '不支持的操作')
      }
    } catch (error) {
      console.error('[environmentRecords]', event.action, error)
      return fail('INTERNAL_ERROR', '云端数据操作失败，请稍后重试')
    }
  }
}

module.exports = { COLLECTION, MAX_PAGE_SIZE, isDuplicateRecordId, createEnvironmentRecordsHandler }
