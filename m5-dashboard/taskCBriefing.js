;(function (root) {
  'use strict'
  let summary = null
  let loadError = ''
  let selectedNodeId = 'dorm-a'

  function viewForNode(data, nodeId) {
    const node = data?.nodes?.[nodeId]
    if (!node || !node.available) return {
      available: false, message: node?.message || '历史样本不足，暂不进行 ML 分析。'
    }
    const counts = node.counts
    return { available: true, samples: node.analyzedSamples, training: node.trainingSamples,
      rule: node.ruleAbnormal, ml: node.mlAbnormal, both: counts.both_abnormal,
      ruleOnly: counts.rule_only, mlOnly: counts.ml_only, normal: counts.both_normal,
      analyzedAt: data.generatedAt, source: data.dataSource }
  }

  function render(nodeId = selectedNodeId) {
    selectedNodeId = nodeId
    const rootElement = document.getElementById('taskCAnalysis')
    if (!rootElement) return
    const node = document.getElementById('taskCNode')
    const status = document.getElementById('taskCStatus')
    const metrics = document.getElementById('taskCMetrics')
    const source = document.getElementById('taskCSource')
    node.textContent = nodeId
    metrics.replaceChildren()
    if (loadError) { status.textContent = loadError; source.textContent = ''; return }
    if (!summary) { status.textContent = '正在读取离线分析结果…'; source.textContent = ''; return }
    const view = viewForNode(summary, nodeId)
    if (!view.available) { status.textContent = view.message; source.textContent = summary.dataSource || ''; return }
    status.textContent = '最近分析：' + new Date(view.analyzedAt).toLocaleString('zh-CN') +
      '；固定规则按现有范围判断，ML 根据历史分布判断偏离程度。'
    source.textContent = view.source
    ;[['训练历史', view.training], ['待判断', view.samples], ['Rule 异常', view.rule],
      ['ML 异常', view.ml], ['共同异常', view.both], ['仅 Rule', view.ruleOnly],
      ['仅 ML', view.mlOnly], ['共同正常', view.normal]].forEach(([label, value]) => {
      const item = document.createElement('div')
      const number = document.createElement('strong')
      const caption = document.createElement('span')
      number.textContent = String(value)
      caption.textContent = label
      item.append(number, caption)
      metrics.append(item)
    })
  }

  async function load(fetcher = fetch) {
    try {
      const response = await fetcher('../analysis/task_c_summary.json', { cache: 'no-store' })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      summary = await response.json()
      loadError = ''
    } catch (error) {
      loadError = '尚未加载离线分析结果；请运行 python run.py。' + (error.message ? '（' + error.message + '）' : '')
    }
    render()
  }
  const api = { viewForNode, render, load }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') {
    window.DormMateTaskCBriefing = api
    document.addEventListener('DOMContentLoaded', () => { load() }, { once: true })
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
