const NODE_IDS = Object.freeze(['dorm-a', 'dorm-b', 'dorm-c'])

const VISUALS = Object.freeze({
  waiting: { label: '等待数据', tone: 'waiting', description: '当前宿舍尚无有效记录，场景不会沿用其他宿舍状态。' },
  normal: { label: '正常', tone: 'normal', description: '环境状态正常，空间维持柔和的日常光线。' },
  hot: { label: '偏热', tone: 'hot', description: '空间呈现暖色光线，风扇加速运行。' },
  humid: { label: '偏湿', tone: 'humid', description: '窗面转为潮湿色调，水汽粒子出现并缓慢上升。' },
  cold: { label: '偏冷', tone: 'cold', description: '空间光线转冷，风扇保持低速。' },
  'hot-humid': { label: '偏热偏湿', tone: 'hot', description: '暖色空间与水汽粒子同时出现，风扇加速运行。' },
  'hot-dry': { label: '偏热偏干', tone: 'hot', description: '暖色光线突出高温状态，风扇加速运行。' },
  'cold-humid': { label: '偏冷偏湿', tone: 'cold', description: '冷色空间叠加水汽粒子，表示低温高湿。' },
  'cold-dry': { label: '偏冷偏干', tone: 'cold', description: '空间光线转冷，风扇保持低速。' },
  unknown: { label: '状态未知', tone: 'unknown', description: '当前状态文字不在 M5 已有状态集合中。' }
})

function mapStatusToScene(status) {
  if (typeof status !== 'string') return 'unknown'
  const value = status.trim()
  if (value === '正常') return 'normal'
  const hot = value.includes('偏热')
  const cold = value.includes('偏冷')
  const humid = value.includes('偏湿')
  if (hot) return humid ? 'hot-humid' : value.includes('偏干') ? 'hot-dry' : 'hot'
  if (cold) return humid ? 'cold-humid' : value.includes('偏干') ? 'cold-dry' : 'cold'
  if (humid) return 'humid'
  return 'unknown'
}

function resolveNodeSceneState({ nodeId, record = null } = {}) {
  if (!NODE_IDS.includes(nodeId)) return { nodeId: '', status: '等待数据', visual: 'waiting', ...VISUALS.waiting, hasData: false }
  if (!record || (record.nodeId && record.nodeId !== nodeId)) {
    return { nodeId, status: '等待数据', visual: 'waiting', ...VISUALS.waiting, hasData: false }
  }
  const status = typeof record.status === 'string' ? record.status.trim() : ''
  if (!status) return { nodeId, status: '状态未知', visual: 'unknown', ...VISUALS.unknown, hasData: true }
  const visual = mapStatusToScene(status)
  return { nodeId, status, visual, ...VISUALS[visual], hasData: true,
    temperature: Number.isFinite(Number(record.temperature)) ? Number(record.temperature) : null,
    humidity: Number.isFinite(Number(record.humidity)) ? Number(record.humidity) : null,
    measuredAt: record.measuredAt || record.time || '', source: record.source || record.rawSource || '' }
}

export { NODE_IDS, VISUALS, mapStatusToScene, resolveNodeSceneState }
