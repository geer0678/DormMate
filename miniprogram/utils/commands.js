const COMMANDS = {
  '分析环境': 'analyze', '检测环境': 'analyze', '查看环境': 'analyze',
  '查看历史记录': 'history', '导出数据': 'export',
  '打开摄像头': 'cameraOn', '关闭摄像头': 'cameraOff',
  '播放建议': 'advice', '停止播放': 'stop'
}
function resolveCommand(text) {
  return COMMANDS[String(text).trim().replace(/[。！？!?，,]+$/, '')] || ''
}
module.exports = { resolveCommand }

