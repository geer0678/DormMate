// 只生成离线教学样本；不连接 MQTT 或 CloudBase。
const fs = require('node:fs')
const path = require('node:path')
const { analyzeEnvironment } = require('../miniprogram/utils/dormmate')

const columns = ['nodeId', 'temperature', 'humidity', 'status', 'time', 'source']
const start = Date.parse('2026-09-28T08:00:00+08:00')
function row(index, temperature, humidity, source) {
  return { nodeId: 'dorm-a', temperature, humidity,
    status: analyzeEnvironment(temperature, humidity).status,
    time: new Date(start + index * 30 * 60_000).toISOString(), source }
}
const history = Array.from({ length: 40 }, (_, i) => row(i,
  Number((23 + (i * 7 % 37) / 10).toFixed(1)),
  48 + (i * 13 % 21), '模拟历史样本'))
const measurements = [
  [24.5, 58], [25.1, 60], [29, 72], [32, 85], [16, 35], [25, 54],
  [27, 68], [30.2, 58], [24, 78], [23.8, 55], [18.1, 42], [26, 40]
].map(([temperature, humidity], i) => row(40 + i, temperature, humidity, '模拟待测样本'))
function writeCsv(name, rows) {
  const content = [columns.join(','), ...rows.map(value => columns.map(key => value[key]).join(','))].join('\n') + '\n'
  fs.writeFileSync(path.join(__dirname, '..', 'data', name), content, 'utf8')
}
writeCsv('task_c_history.csv', history)
writeCsv('task_c_evaluation.csv', measurements)
console.log('Task C：已生成 dorm-a 40 条模拟历史样本和 12 条模拟待测样本。')
