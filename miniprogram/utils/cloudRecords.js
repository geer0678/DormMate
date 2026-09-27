const { formatTime } = require('./dormmate')

function call(wxApi, data) {
  return wxApi.cloud.callFunction({ name: 'environmentRecords', data }).then(response => {
    const result = response.result
    if (!result || !result.success) throw new Error(result && result.error || '云端请求失败')
    return result
  })
}

function fromCloud(record) {
  const raw = record.createdAt && (record.createdAt.$date || record.createdAt)
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) throw new Error('云端记录时间无效')
  return {
    id: record.recordId, recordId: record.recordId, time: formatTime(date),
    temperature: record.temperature, humidity: record.humidity,
    status: record.status, advice: record.advice, source: record.source
  }
}

async function list(wxApi) {
  const all = []
  let offset = 0
  do {
    const page = await call(wxApi, { action: 'list', offset, limit: 100 })
    all.push(...page.records.map(fromCloud))
    offset = page.nextOffset
  } while (offset !== null)
  return all
}

function add(wxApi, record) {
  return call(wxApi, { action: 'add', recordId: record.id, source: 'miniprogram',
    temperature: record.temperature, humidity: record.humidity })
}

module.exports = { list, add, fromCloud }
