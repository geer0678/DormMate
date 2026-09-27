const { normalizeAll, mergeRecords } = require('./records')
const KEY = 'dormmate_history_v3'
const LEGACY_KEYS = ['dormmate_history_v2', 'history', 'dormMateHistory']

function load(wxApi) {
  const saved = wxApi.getStorageSync(KEY)
  if (saved !== '' && saved !== undefined && saved !== null) {
    if (Array.isArray(saved) && saved.every(item => item && item.recordId && ['web', 'miniprogram'].includes(item.source))) return saved
    return mergeRecords([], normalizeAll(saved)).records
  }
  let records = []
  for (const key of LEGACY_KEYS) {
    let old = wxApi.getStorageSync(key)
    if (!old) continue
    if (typeof old === 'string') {
      try { old = JSON.parse(old) } catch (error) { throw new Error('旧历史格式损坏；原数据已保留') }
    }
    if (Array.isArray(old) && old.length) records = mergeRecords(records, normalizeAll(old)).records
  }
  if (records.length) save(wxApi, records)
  return records
}
function save(wxApi, records) {
  // Persist first. The caller only updates the visible result after this succeeds.
  wxApi.setStorageSync(KEY, records)
}
module.exports = { KEY, LEGACY_KEYS, load, save }

