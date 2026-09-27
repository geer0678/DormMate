const { normalizeAll } = require('./records')

function parseRows(text) {
  const rows = []
  let row = [], value = '', quoted = false, closed = false
  const source = String(text).replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { value += '"'; i++ } else { quoted = false; closed = true }
      } else { value += char }
    } else if (char === ',' || char === '\n' || char === '\r') {
      row.push(value); value = ''; closed = false
      if (char !== ',') {
        if (row.some(cell => cell.trim() !== '')) rows.push(row)
        row = []
        if (char === '\r' && source[i + 1] === '\n') i++
      }
    } else if (char === '"' && !value && !closed) {
      quoted = true
    } else {
      if (closed || char === '"') throw new Error('CSV 引号格式错误')
      value += char
    }
  }
  if (quoted) throw new Error('CSV 有未闭合的双引号')
  row.push(value)
  if (row.some(cell => cell.trim() !== '')) rows.push(row)
  return rows
}

function parseImport(text) {
  const source = String(text).replace(/^\uFEFF/, '').trim()
  if (!source) throw new Error('导入内容为空')
  if (/^[\[{]/.test(source)) {
    let data
    try { data = JSON.parse(source) } catch (error) { throw new Error('JSON 格式错误') }
    return normalizeAll(Array.isArray(data) ? data : Array.isArray(data.history) ? data.history : [data])
  }
  const rows = parseRows(source)
  const headers = rows.shift().map(value => value.trim())
  if (new Set(headers).size !== headers.length) throw new Error('CSV 表头不能重复')
  for (const key of ['time', 'temperature', 'humidity']) {
    if (!headers.includes(key)) throw new Error('CSV 缺少 ' + key + ' 列')
  }
  if (!rows.length) throw new Error('CSV 没有数据记录')
  return normalizeAll(rows.map((cells, index) => {
    if (cells.length !== headers.length) throw new Error('CSV 第 ' + (index + 2) + ' 行列数不一致')
    const record = {}
    headers.forEach((key, i) => { record[key] = cells[i] })
    return record
  }))
}

function toCSV(records) {
  const columns = ['time', 'temperature', 'humidity', 'status', 'advice']
  const quote = value => '"' + String(value).replace(/"/g, '""') + '"'
  return '\uFEFF' + columns.join(',') + '\r\n' +
    records.slice().reverse().map(record => columns.map(key => quote(record[key])).join(',')).join('\r\n') + '\r\n'
}
module.exports = { parseRows, parseImport, toCSV }

