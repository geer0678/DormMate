;(function (root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.DormMateDashboardCsv = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'
  const FIELDS = ['recordId', 'nodeId', 'measuredAt', 'recordTime', 'temperature', 'humidity', 'status', 'advice', 'source']
  function cell(value) {
    let text = value === undefined || value === null ? '' : String(value)
    if (/^[=+@-]/.test(text)) text = "'" + text
    return '"' + text.replace(/"/g, '""') + '"'
  }
  function toCsv(records) {
    const rows = [FIELDS]
    records.forEach(record => rows.push([
      record.recordId, record.rawNodeId, record.measuredAt, record.recordTime,
      record.temperature, record.humidity, record.status, record.advice, record.rawSource
    ]))
    return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n') + '\r\n'
  }
  return { FIELDS, toCsv }
})
