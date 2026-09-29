const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { viewForNode } = require('../../m5-dashboard/taskCBriefing')

const result = JSON.parse(fs.readFileSync(path.join(__dirname, '../../analysis/task_c_summary.json'), 'utf8'))

test('Task C dashboard uses the selected dorm-a result', () => {
  const view = viewForNode(result, 'dorm-a')
  assert.equal(view.available, true)
  assert.equal(view.training, 40)
  assert.equal(view.samples, 12)
  assert.equal(view.rule, 4)
  assert.equal(view.ml, 8)
  assert.equal(view.both + view.ruleOnly + view.mlOnly + view.normal, view.samples)
})

test('Task C never inherits dorm-a result for dorm-b or dorm-c', () => {
  for (const nodeId of ['dorm-b', 'dorm-c']) {
    const view = viewForNode(result, nodeId)
    assert.equal(view.available, false)
    assert.match(view.message, /样本不足/)
    assert.equal(view.rule, undefined)
  }
})

test('Task C summary reports missing data without inventing counts', () => {
  const view = viewForNode({ nodes: {} }, 'dorm-a')
  assert.equal(view.available, false)
  assert.match(view.message, /样本不足/)
})

test('Task C is an offline read-only addition to Dashboard', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../m5-dashboard/index.html'), 'utf8')
  const dashboard = fs.readFileSync(path.join(__dirname, '../../m5-dashboard/dashboard.js'), 'utf8')
  assert.match(html, /taskCBriefing\.js/)
  assert.match(html, /analysis\/report\.html#task-c-analysis/)
  assert.match(dashboard, /DormMateTaskCBriefing\?\.render\(snapshot\.selectedNodeId\)/)
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../../m5-dashboard/taskCBriefing.js'), 'utf8'),
    /saveCloudRecord|connectSocket|mqtt\.connect/)
})
