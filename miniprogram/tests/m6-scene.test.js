'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createDashboardStore } = require('../../m5-dashboard/dashboardStore')
const simulation = require('../utils/mqttSimulation')
const messages = require('../utils/mqttMessage')

const dashboardRoot = path.resolve(__dirname, '../../m5-dashboard')

test('M6 状态模块可在 Node 环境独立加载', async () => {
  const module = await import(pathToFileURL(path.join(dashboardRoot, 'm6-3d/sceneState.mjs')))
  assert.equal(typeof module.mapStatusToScene, 'function')
  assert.equal(typeof module.resolveNodeSceneState, 'function')
})

test('M5 已有状态文字映射到正常、偏热和偏湿视觉类别', async () => {
  const { mapStatusToScene } = await import(pathToFileURL(path.join(dashboardRoot, 'm6-3d/sceneState.mjs')))
  assert.equal(mapStatusToScene('正常'), 'normal')
  assert.equal(mapStatusToScene('偏热'), 'hot')
  assert.equal(mapStatusToScene('偏热偏湿'), 'hot-humid')
  assert.equal(mapStatusToScene('偏湿'), 'humid')
  assert.equal(mapStatusToScene('偏冷偏湿'), 'cold-humid')
})

test('未知状态可安全显示，不会抛出异常', async () => {
  const { resolveNodeSceneState } = await import(pathToFileURL(path.join(dashboardRoot, 'm6-3d/sceneState.mjs')))
  assert.equal(resolveNodeSceneState({ nodeId: 'dorm-a', record: { nodeId: 'dorm-a', status: '未知状态' } }).visual, 'unknown')
  assert.equal(resolveNodeSceneState({ nodeId: 'dorm-a', record: { nodeId: 'dorm-a' } }).visual, 'unknown')
})

test('节点切换严格隔离，无数据宿舍不会继承上一个状态', async () => {
  const { resolveNodeSceneState } = await import(pathToFileURL(path.join(dashboardRoot, 'm6-3d/sceneState.mjs')))
  const hot = resolveNodeSceneState({ nodeId: 'dorm-a', record: { nodeId: 'dorm-a', status: '偏热' } })
  const empty = resolveNodeSceneState({ nodeId: 'dorm-b', record: null })
  const mismatched = resolveNodeSceneState({ nodeId: 'dorm-c', record: { nodeId: 'dorm-a', status: '偏热' } })
  assert.equal(hot.visual, 'hot')
  assert.equal(empty.visual, 'waiting')
  assert.equal(empty.nodeId, 'dorm-b')
  assert.equal(mismatched.visual, 'waiting')
})

test('读取 M5 Store 不改变原记录，切到空宿舍明确显示等待', async () => {
  const { resolveNodeSceneState } = await import(pathToFileURL(path.join(dashboardRoot, 'm6-3d/sceneState.mjs')))
  const store = createDashboardStore()
  const message = simulation.createNodeMessage('dorm-b', 0)
  const result = store.ingest(messages.topicForNode('dorm-b'), JSON.stringify(message))
  assert.equal(result.accepted, true)
  store.selectNode('dorm-b')
  const before = store.snapshot()
  const sceneState = resolveNodeSceneState({ nodeId: before.selectedNodeId, record: before.current })
  assert.equal(sceneState.nodeId, 'dorm-b')
  assert.deepEqual(store.snapshot(), before)
  store.selectNode('dorm-c')
  assert.equal(resolveNodeSceneState({ nodeId: store.snapshot().selectedNodeId, record: store.snapshot().current }).visual, 'waiting')
})

test('M6 只消费 Dashboard 状态事件，不创建 MQTT 或 CloudBase 写链路', () => {
  const html = fs.readFileSync(path.join(dashboardRoot, 'index.html'), 'utf8')
  const dashboard = fs.readFileSync(path.join(dashboardRoot, 'dashboard.js'), 'utf8')
  const controller = fs.readFileSync(path.join(dashboardRoot, 'm6-3d/sceneController.mjs'), 'utf8')
  assert.match(html, /m6-3d\/sceneController\.mjs/)
  assert.match(dashboard, /dormmate:dashboard-state/)
  assert.match(dashboard, /issueEvents\.getActive\(nodeId, feed\.mode\)/)
  assert.match(dashboard, /issue: activeIssues\[snapshot\.selectedNodeId\]/)
  assert.match(controller, /OrbitControls/)
  assert.match(controller, /new THREE\.WebGLRenderer/)
  assert.match(controller, /function updateScene\(status, context = \{\}\)/)
  assert.match(controller, /updateScene\(button\.dataset\.sceneStatus, \{ nodeId: activeNodeId, demo: true \}\)/)
  assert.match(controller, /本地演示 · /)
  assert.match(controller, /context\.issue && context\.issue\.state === 'processing'/)
  assert.match(controller, /处理中 · /)
  assert.doesNotMatch(controller, /mqtt\.connect|saveCloudRecord|fetch\(/)
})

test('Three.js、OrbitControls 和 M6 的本地模块依赖全部存在', () => {
  const html = fs.readFileSync(path.join(dashboardRoot, 'index.html'), 'utf8')
  const importMapTag = html.match(/<script type="importmap">([\s\S]*?)<\/script>/)
  assert.ok(importMapTag, '缺少浏览器 import map')
  const importMap = JSON.parse(importMapTag[1])
  const visited = new Set()
  function visitModule(filePath) {
    const absolutePath = path.resolve(filePath)
    assert.ok(fs.existsSync(absolutePath), `模块资源缺失：${path.relative(dashboardRoot, absolutePath)}`)
    if (visited.has(absolutePath)) return
    visited.add(absolutePath)
    const source = fs.readFileSync(absolutePath, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const imports = [...source.matchAll(/(?:\bfrom\s*|\bimport\s*\()\s*['"]([^'"]+)['"]/g)]
    imports.forEach((match) => {
      const specifier = match[1]
      let dependency
      if (specifier.startsWith('.') || specifier.startsWith('/')) dependency = path.resolve(path.dirname(absolutePath), specifier)
      else {
        assert.ok(importMap.imports[specifier], `裸模块 ${specifier} 未映射到本地资源`)
        dependency = path.resolve(dashboardRoot, importMap.imports[specifier])
      }
      visitModule(dependency)
    })
  }
  visitModule(path.join(dashboardRoot, 'm6-3d/sceneController.mjs'))
  assert.ok(visited.has(path.join(dashboardRoot, 'vendor/three/three.core.min.js')))
  assert.ok(visited.has(path.join(dashboardRoot, 'vendor/three/OrbitControls.js')))
})

function pathToFileURL(filePath) {
  return require('node:url').pathToFileURL(filePath).href
}
