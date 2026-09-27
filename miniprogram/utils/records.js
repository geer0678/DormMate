const { analyzeEnvironment, validateEnvironment } = require('./dormmate')
const LIMIT = 5000
const STATES = ['正常', '偏冷偏干', '偏冷', '偏冷偏湿', '偏干', '偏湿', '偏热偏干', '偏热', '偏热偏湿']

function normalize(record, index) {
  if (!record || typeof record !== 'object') throw new Error('第 ' + (index + 1) + ' 条记录格式不正确')
  const valid = validateEnvironment(record.temperature, record.humidity)
  if (!valid.valid) throw new Error('第 ' + (index + 1) + ' 条记录：' + valid.error)
  const time = String(record.time || '').trim().replace(/\//g, '-')
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(time)) {
    throw new Error('第 ' + (index + 1) + ' 条记录缺少有效时间（YYYY-MM-DD HH:mm:ss）')
  }
  const parts = time.match(/\d+/g).map(Number)
  const d = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5] || 0)
  if (d.getFullYear() !== parts[0] || d.getMonth() + 1 !== parts[1] || d.getDate() !== parts[2] ||
      d.getHours() !== parts[3] || d.getMinutes() !== parts[4] || d.getSeconds() !== (parts[5] || 0)) {
    throw new Error('第 ' + (index + 1) + ' 条记录的日期或时间无效')
  }
  const canonicalTime = time.replace('T', ' ') + (time.length === 16 ? ':00' : '')
  const result = analyzeEnvironment(valid.temperature, valid.humidity)
  return {
    id: canonicalTime + '|' + valid.temperature + '|' + valid.humidity,
    time: canonicalTime, temperature: valid.temperature, humidity: valid.humidity,
    status: result.status, advice: result.advice
  }
}

function normalizeAll(list) {
  if (!Array.isArray(list)) throw new Error('历史数据必须是数组')
  if (list.length > LIMIT) throw new Error('最多导入 ' + LIMIT + ' 条，请拆分文件')
  return list.map(normalize)
}

function mergeRecords(current, incoming) {
  // Same second and readings represent the same exported observation.
  const map = new Map()
  current.concat(incoming).forEach(record => map.set(record.id, record))
  const records = Array.from(map.values()).sort((a, b) => b.time.localeCompare(a.time))
  if (records.length > LIMIT) throw new Error('本机最多保留 ' + LIMIT + ' 条，请先导出并清理旧记录')
  return { records, added: records.length - current.length, duplicate: incoming.length - (records.length - current.length) }
}

function statistics(records) {
  const count = records.length
  const distribution = STATES.map(status => ({ status, count: 0, percent: 0, width: 0 }))
  let t = 0, h = 0, minT = Infinity, maxT = -Infinity, minH = Infinity, maxH = -Infinity
  records.forEach(record => {
    t += record.temperature; h += record.humidity
    minT = Math.min(minT, record.temperature); maxT = Math.max(maxT, record.temperature)
    minH = Math.min(minH, record.humidity); maxH = Math.max(maxH, record.humidity)
    distribution.find(item => item.status === record.status).count++
  })
  const maxCount = Math.max(1, ...distribution.map(item => item.count))
  distribution.forEach(item => {
    item.percent = count ? (item.count / count * 100).toFixed(1) : '0.0'
    item.width = item.count / maxCount * 100
  })
  const abnormal = count - distribution[0].count
  return {
    count, abnormal, normal: count - abnormal,
    averageTemperature: count ? (t / count).toFixed(2) : '--',
    averageHumidity: count ? (h / count).toFixed(2) : '--',
    minTemperature: count ? minT : '--', maxTemperature: count ? maxT : '--',
    minHumidity: count ? minH : '--', maxHumidity: count ? maxH : '--',
    abnormalRate: count ? (abnormal / count * 100).toFixed(2) : '--',
    distribution
  }
}

function report(records) {
  const s = statistics(records)
  return [
    'DormMate 宿舍环境分析报告',
    '数据来源：本机小程序历史；状态与建议按统一九状态规则重算。',
    '记录总数：' + s.count,
    '温度：平均 ' + s.averageTemperature + '℃，最低 ' + s.minTemperature + '℃，最高 ' + s.maxTemperature + '℃',
    '湿度：平均 ' + s.averageHumidity + '%，最低 ' + s.minHumidity + '%，最高 ' + s.maxHumidity + '%',
    '正常记录：' + s.normal + '；异常记录：' + s.abnormal + '；异常占比：' + s.abnormalRate + '%',
    '', '九状态分布：',
    ...s.distribution.map(item => item.status + '：' + item.count + ' 条'),
    '', '重点关注记录（全部非正常记录，按时间从早到晚）：',
    ...records.slice().reverse().filter(record => record.status !== '正常').map(record =>
      record.time + ' | ' + record.temperature + '℃ | ' + record.humidity + '% | ' + record.status + ' | ' + record.advice)
  ].join('\r\n')
}
module.exports = { LIMIT, STATES, normalize, normalizeAll, mergeRecords, statistics, report }

