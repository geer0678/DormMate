// Python 批量调用唯一现有九状态规则，不在分析脚本中复制阈值。
const { analyzeEnvironment } = require('../miniprogram/utils/dormmate')
const fs = require('node:fs')
const records = JSON.parse(fs.readFileSync(0, 'utf8'))
process.stdout.write(JSON.stringify(records.map(({ temperature, humidity }) =>
  analyzeEnvironment(temperature, humidity).status)))
