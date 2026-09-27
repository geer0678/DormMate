// Canonical server-side DormMate 9-state rules. Client mirrors must pass the
// same contract vectors before a client-sync phase is accepted.
const STATUS = {
  cold_dry: ['偏冷偏干', '当前环境温度较低且空气偏干，建议注意保暖，并适当增加空气湿度。'],
  cold_normal: ['偏冷', '当前温度偏低，湿度适宜，建议增加保暖措施。'],
  cold_humid: ['偏冷偏湿', '当前环境低温高湿，建议加强保暖并保持通风。'],
  normal_dry: ['偏干', '当前温度适宜，但空气偏干，建议适当增加湿度。'],
  normal_normal: ['正常', '当前温湿度适宜，请继续保持良好通风。'],
  normal_humid: ['偏湿', '当前温度适宜，但湿度较高，建议加强通风或除湿。'],
  hot_dry: ['偏热偏干', '当前温度较高且空气偏干，建议适当降温。'],
  hot_normal: ['偏热', '当前温度较高，建议保持空气流通并降低温度。'],
  hot_humid: ['偏热偏湿', '当前环境高温高湿，容易产生闷热感，建议加强通风并降低湿度。']
}

function parseMeasurement(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function validateEnvironment(temperatureInput, humidityInput) {
  const temperature = parseMeasurement(temperatureInput)
  const humidity = parseMeasurement(humidityInput)
  if (temperature === null || humidity === null) {
    return { valid: false, error: '请输入有效的温度和湿度' }
  }
  if (temperature < 0 || temperature > 50 || humidity < 0 || humidity > 100) {
    return { valid: false, error: '温度应在0～50℃，湿度应在0～100%' }
  }
  return { valid: true, temperature, humidity }
}

function analyzeEnvironment(temperature, humidity) {
  const valid = validateEnvironment(temperature, humidity)
  if (!valid.valid) throw new Error(valid.error)
  const temperatureBand = valid.temperature < 18 ? 'cold' : valid.temperature >= 30 ? 'hot' : 'normal'
  const humidityBand = valid.humidity < 40 ? 'dry' : valid.humidity >= 75 ? 'humid' : 'normal'
  const result = STATUS[temperatureBand + '_' + humidityBand]
  return { status: result[0], advice: result[1] }
}

module.exports = { STATUS, validateEnvironment, analyzeEnvironment }
