'use strict'

;(function () {
  const simulation = window.DormMateMqttSimulation
  const { createDashboardStore } = window.DormMateDashboardStore
  const { createMqttTransport, STATES } = window.DormMateMqttTransport
  const { createDashboardFeed, MODES } = window.DormMateDashboardFeed
  const { createSharedHistory } = window.DormMateDashboardSharedHistory
  const { createMqttPersistence } = window.DormMateDashboardMqttPersistence
  const { createNodeView, filterSharedHistory } = window.DormMateDashboardNodeView
  const { createDashboardIssueEvents } = window.DormMateDashboardIssueEvents
  const palette = getComputedStyle(document.documentElement)
  const stores = { mqtt: createDashboardStore({ maxHistory: 50 }), simulation: createDashboardStore({ maxHistory: 50 }) }
  const issueEvents = createDashboardIssueEvents()
  const nodeSwitcher = document.getElementById('nodeSwitcher')
  const nodeButtons = new Map()
  const ui = {
    nodeHeading: document.getElementById('nodeHeading'),
    statusValue: document.getElementById('statusValue'),
    currentAdvice: document.getElementById('currentAdvice'),
    currentSource: document.getElementById('currentSource'),
    recordTime: document.getElementById('recordTime'),
    temperatureValue: document.getElementById('temperatureValue'),
    humidityValue: document.getElementById('humidityValue'),
    temperatureRange: document.getElementById('temperatureRange'),
    humidityRange: document.getElementById('humidityRange'),
    temperatureChart: document.getElementById('temperatureChart'),
    humidityChart: document.getElementById('humidityChart'),
    historyCount: document.getElementById('historyCount'),
    feedStatus: document.getElementById('feedStatus'),
    mqttSyncStatus: document.getElementById('mqttSyncStatus'),
    modeIndicator: document.getElementById('modeIndicator'),
    modeLabel: document.getElementById('modeLabel'),
    connectionStatus: document.getElementById('connectionStatus'),
    modeToggle: document.getElementById('modeToggle'),
    introNote: document.getElementById('introNote'),
    sharedHistoryBody: document.getElementById('sharedHistoryBody'),
    sharedStatus: document.getElementById('sharedStatus'),
    historyScope: document.getElementById('historyScope'),
    refreshSharedHistory: document.getElementById('refreshSharedHistory'),
    exportSharedCsv: document.getElementById('exportSharedCsv'),
    recordForm: document.getElementById('recordForm'),
    entryNodeId: document.getElementById('entryNodeId'),
    entryTemperature: document.getElementById('entryTemperature'),
    entryHumidity: document.getElementById('entryHumidity'),
    analyzeEntryButton: document.getElementById('analyzeEntryButton'),
    entryAnalysis: document.getElementById('entryAnalysis'),
    saveRecordButton: document.getElementById('saveRecordButton'),
    saveRecordStatus: document.getElementById('saveRecordStatus'),
    simulateSampleButton: document.getElementById('simulateSampleButton'),
    simulationSampleStatus: document.getElementById('simulationSampleStatus'),
    issueModeLabel: document.getElementById('issueModeLabel'),
    issueSummary: document.getElementById('issueSummary'),
    activeIssueList: document.getElementById('activeIssueList'),
    issueHistoryCount: document.getElementById('issueHistoryCount'),
    issueHistoryList: document.getElementById('issueHistoryList'),
    simulationTimerToggle: document.getElementById('simulationTimerToggle')
  }
  const sharedHistory = createSharedHistory({ list: () => getCloudHistory(), onChange: renderSharedHistory })
  const mqttPersistence = createMqttPersistence({ save: saveCloudRecord, refresh: options => sharedHistory.refresh(options) })
  let feed
  let connectionState = STATES.CONNECTING
  let sharedHistoryError = null

  function visibleHistory(nodeId) {
    return createNodeView({ nodeId, cloudRecords: sharedHistory.records, mqttRecords: stores.mqtt.getHistory(nodeId),
      simulationRecords: stores.simulation.getHistory(nodeId), mode: feed.mode, maxHistory: 50 }).map(record => {
      const analysis = window.DormMateRules.analyzeEnvironment(record.temperature, record.humidity)
      return { ...record, status: record.status || analysis.status, advice: record.advice || analysis.advice }
    })
  }

  function makeNodeButtons() {
    simulation.NODES.forEach(({ nodeId }) => {
      const button = document.createElement('button')
      const name = document.createElement('span')
      const status = document.createElement('span')
      button.type = 'button'
      button.className = 'node-button'
      button.setAttribute('aria-pressed', 'false')
      name.className = 'node-name'
      name.textContent = nodeId
      status.className = 'node-status'
      status.textContent = '等待数据'
      button.append(name, status)
      button.addEventListener('click', () => {
        stores.mqtt.selectNode(nodeId)
        stores.simulation.selectNode(nodeId)
        render()
        renderSharedHistory({ records: sharedHistory.records, error: sharedHistoryError })
      })
      nodeSwitcher.append(button)
      nodeButtons.set(nodeId, { button, status })
    })
  }

  function timeLabel(value) {
    if (value && value.timeUnknown) return '未提供测量时间'
    if (value && typeof value === 'object') value = value.time
    return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  function rangeLabel(history, field, suffix) {
    if (!history.length) return '--'
    const values = history.map(record => record[field])
    const min = Math.min(...values), max = Math.max(...values)
    return (min === max ? min.toFixed(1) : min.toFixed(1) + '–' + max.toFixed(1)) + suffix
  }

  function renderSharedHistory({ records, error }) {
    sharedHistoryError = error
    ui.exportSharedCsv.disabled = records.length === 0
    ui.sharedHistoryBody.replaceChildren()
    const nodeId = feed ? feed.store.snapshot().selectedNodeId : simulation.NODES[0].nodeId
    const shown = filterSharedHistory(records, nodeId, ui.historyScope.value)
    shown.forEach(record => {
      const row = document.createElement('tr')
      row.dataset.recordId = record.recordId
      ;[record.time, record.nodeId, record.temperature + '℃', record.humidity + '%', record.status, record.source].forEach(value => {
        const cell = document.createElement('td')
        cell.textContent = value
        row.appendChild(cell)
      })
      ui.sharedHistoryBody.appendChild(row)
    })
    ui.sharedStatus.textContent = error
      ? '共享历史读取失败：' + error
      : ui.historyScope.value === 'all'
        ? '全部共享记录：' + shown.length + ' 条' + (records.some(record => !record.rawNodeId) ? '；未标注宿舍的旧记录也包含在内。' : '')
        : nodeId + ' 的共享记录：' + shown.length + ' 条'
    if (feed) render()
  }

  function drawChart(canvas, history, field, color, unit) {
    const bounds = canvas.getBoundingClientRect()
    const width = Math.max(250, Math.floor(bounds.width))
    const height = Math.max(170, Math.floor(bounds.height))
    const ratio = window.devicePixelRatio || 1
    const context = canvas.getContext('2d')
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)

    const left = 50, right = 12, top = 13, bottom = 30
    const plotWidth = width - left - right, plotHeight = height - top - bottom
    const values = history.map(record => record[field])
    let minimum = values.length ? Math.min(...values) : 0
    let maximum = values.length ? Math.max(...values) : 1
    const pad = maximum === minimum ? (field === 'temperature' ? 1 : 4) : (maximum - minimum) * .18
    minimum -= pad
    maximum += pad

    context.font = '11px Bahnschrift, "Microsoft YaHei UI", sans-serif'
    context.textAlign = 'right'
    context.textBaseline = 'middle'
    for (let i = 0; i <= 3; i++) {
      const y = top + plotHeight * i / 3
      const value = maximum - (maximum - minimum) * i / 3
      context.strokeStyle = palette.getPropertyValue('--chart-grid').trim()
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(left, y)
      context.lineTo(width - right, y)
      context.stroke()
      context.fillStyle = palette.getPropertyValue('--chart-label').trim()
      context.fillText(value.toFixed(1) + unit, left - 8, y)
    }

    if (!history.length) return
    const pointX = index => left + (history.length === 1 ? plotWidth / 2 : plotWidth * index / (history.length - 1))
    const pointY = value => top + plotHeight * (maximum - value) / (maximum - minimum)
    context.strokeStyle = color
    context.lineWidth = 2.5
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.beginPath()
    history.forEach((record, index) => {
      const x = pointX(index), y = pointY(record[field])
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.stroke()
    context.fillStyle = color
    history.forEach((record, index) => {
      context.beginPath()
      context.arc(pointX(index), pointY(record[field]), index === history.length - 1 ? 3.5 : 2, 0, Math.PI * 2)
      context.fill()
    })

    const labelIndices = Array.from(new Set([0, Math.floor((history.length - 1) / 2), history.length - 1]))
    context.fillStyle = palette.getPropertyValue('--chart-label').trim()
    context.textBaseline = 'alphabetic'
    labelIndices.forEach((index, position) => {
      context.textAlign = labelIndices.length === 1 ? 'center' : position === 0 ? 'left' : position === labelIndices.length - 1 ? 'right' : 'center'
      context.fillText(timeLabel(history[index]), pointX(index), height - 7)
    })
  }

  function eventTime(value) {
    if (!value) return '尚未记录'
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('zh-CN') : String(value)
  }

  function appendDefinitionList(parent, items, className) {
    const list = document.createElement('dl')
    list.className = className
    items.forEach(([label, value]) => {
      const item = document.createElement('div')
      const term = document.createElement('dt')
      const detail = document.createElement('dd')
      term.textContent = label
      detail.textContent = value || '—'
      item.append(term, detail)
      list.append(item)
    })
    parent.append(list)
  }

  function readingLabel(reading) {
    if (!reading) return '尚未验证'
    return reading.status + ' · ' + reading.temperature.toFixed(1) + '℃ / ' + reading.humidity.toFixed(1) + '%'
  }

  function makeIssuePriority(priority, reason) {
    const badge = document.createElement('span')
    badge.className = 'issue-priority'
    badge.dataset.priority = priority
    badge.textContent = priority
    badge.title = reason
    return badge
  }

  function renderIssuePanel() {
    if (!feed) return
    const sourceMode = feed.mode
    const allEvents = issueEvents.getEvents()
    const active = allEvents.filter(event => event.sourceMode === sourceMode && event.state !== 'resolved')
      .sort((left, right) => {
        const rank = { '优先处理': 0, '关注': 1, '普通': 2 }
        return (rank[left.priority] ?? 3) - (rank[right.priority] ?? 3) || left.nodeId.localeCompare(right.nodeId)
      })
    ui.issueModeLabel.textContent = sourceMode === MODES.SIMULATION ? '模拟事件 · 仅本机保存' : '实时 MQTT 事件'
    ui.issueSummary.textContent = active.length
      ? active[0].nodeId + ' 当前为“' + active[0].priority + '”：' + active[0].priorityReason
      : '当前数据源没有待处理异常；新数据会按现有九状态规则自动检查。'
    if (issueEvents.persistenceError) ui.issueSummary.textContent += ' ' + issueEvents.persistenceError

    ui.activeIssueList.replaceChildren()
    if (!active.length) {
      const empty = document.createElement('p')
      empty.className = 'issue-empty'
      empty.textContent = sourceMode === MODES.SIMULATION
        ? '模拟数据尚未形成待处理异常；该模式产生的事件只保存在本机。'
        : '暂未发现待处理异常。'
      ui.activeIssueList.append(empty)
    }
    active.forEach(issue => {
      const card = document.createElement('article')
      card.className = 'issue-card'
      card.dataset.state = issue.state
      const header = document.createElement('div')
      header.className = 'issue-card-head'
      const title = document.createElement('h3')
      title.textContent = issue.nodeId + ' · ' + issue.issueStatus
      header.append(title, makeIssuePriority(issue.priority, issue.priorityReason))
      card.append(header)
      const description = document.createElement('p')
      description.className = 'issue-description'
      description.textContent = issue.issueDescription
      card.append(description)
      appendDefinitionList(card, [
        ['温度', issue.current.temperature.toFixed(1) + '℃'],
        ['湿度', issue.current.humidity.toFixed(1) + '%'],
        ['状态', issue.current.status],
        ['发现时间', eventTime(issue.detectedAt)]
      ], 'issue-reading-grid')
      if (issue.state === 'open') {
        const actionRow = document.createElement('div')
        actionRow.className = 'issue-action-row'
        const label = document.createElement('label')
        label.textContent = '处理措施'
        const select = document.createElement('select')
        select.setAttribute('aria-label', issue.nodeId + ' 处理措施')
        ;['开启风扇并通风', '开窗通风', '开启除湿并通风', '加强保暖并减少通风'].forEach(action => {
          const option = document.createElement('option')
          option.value = action
          option.textContent = action
          select.append(option)
        })
        label.append(select)
        const button = document.createElement('button')
        button.type = 'button'
        button.dataset.issueEventId = issue.eventId
        button.textContent = '开始处理'
        actionRow.append(label, button)
        card.append(actionRow)
      } else {
        const progress = document.createElement('p')
        progress.className = 'issue-processing-note'
        progress.textContent = '处理中：' + issue.action + '；恢复验证 ' + issue.recoverySamples + '/' + issueEvents.recoverySamples + ' 批正常数据。点击操作不会直接结案。'
        card.append(progress)
      }
      ui.activeIssueList.append(card)
    })

    ui.issueHistoryCount.textContent = allEvents.length + ' 条'
    ui.issueHistoryList.replaceChildren()
    if (!allEvents.length) {
      const empty = document.createElement('p')
      empty.className = 'issue-empty'
      empty.textContent = '发现异常后，完整处理过程会保存在这里。'
      ui.issueHistoryList.append(empty)
      return
    }
    allEvents.forEach(issue => {
      const card = document.createElement('article')
      card.className = 'issue-history-card'
      card.dataset.state = issue.state
      const header = document.createElement('div')
      header.className = 'issue-history-head'
      const title = document.createElement('h4')
      title.textContent = issue.nodeId + ' · ' + issue.issueStatus
      const state = document.createElement('span')
      state.className = 'issue-history-state'
      state.textContent = issue.state === 'resolved' ? '已恢复' : issue.state === 'processing' ? '处理中' : '待处理'
      header.append(title, state)
      card.append(header, makeIssuePriority(issue.priority, issue.priorityReason))
      const description = document.createElement('p')
      description.className = 'issue-description'
      description.textContent = issue.issueDescription
      card.append(description)
      appendDefinitionList(card, [
        ['宿舍', issue.nodeId],
        ['数据来源', issue.source],
        ['优先级原因', issue.priorityReason],
        ['处理措施', issue.action || '未记录'],
        ['处理前', readingLabel(issue.before)],
        ['处理后', readingLabel(issue.after)],
        ['发现时间', eventTime(issue.detectedAt)],
        ['处理开始', eventTime(issue.actionStartedAt)],
        ['处理结束', eventTime(issue.resolvedAt)]
      ], 'issue-history-fields')
      const result = document.createElement('p')
      result.className = 'issue-result'
      result.textContent = '结果：' + issue.result
      card.append(result)
      ui.issueHistoryList.append(card)
    })
  }

  function render() {
    if (!feed) return
    const store = feed.store
    const snapshot = store.snapshot()
    simulation.NODES.forEach(({ nodeId }) => {
      const item = nodeButtons.get(nodeId)
      const nodeHistory = visibleHistory(nodeId)
      item.button.setAttribute('aria-pressed', String(nodeId === snapshot.selectedNodeId))
      item.status.textContent = nodeHistory.length ? nodeHistory[nodeHistory.length - 1].status : '等待数据'
    })
    const history = visibleHistory(snapshot.selectedNodeId)
    const current = history.length ? history[history.length - 1] : null
    let currentStatus = ''
    ui.nodeHeading.textContent = snapshot.selectedNodeId
    ui.entryNodeId.textContent = snapshot.selectedNodeId
    ui.historyCount.textContent = history.length + ' / 50 条记录'
    if (!current) {
      ui.statusValue.textContent = '等待数据'
      ui.currentAdvice.textContent = '收到数据后显示建议。'
      ui.currentSource.textContent = '数据来源：--'
      ui.recordTime.textContent = '--'
      ui.temperatureValue.textContent = '--'
      ui.humidityValue.textContent = '--'
    } else {
      const analysis = window.DormMateRules.analyzeEnvironment(current.temperature, current.humidity)
      currentStatus = current.status || analysis.status
      ui.statusValue.textContent = currentStatus
      ui.currentAdvice.textContent = current.advice || analysis.advice
      ui.currentSource.textContent = '数据来源：' + current.sourceLabel
      ui.recordTime.textContent = current.timeUnknown
        ? (current.recordTime || '--') + '（未提供测量时间）'
        : new Date(current.time).toLocaleString('zh-CN')
      ui.recordTime.dateTime = current.timeUnknown ? '' : current.time
      ui.temperatureValue.textContent = current.temperature.toFixed(1)
      ui.humidityValue.textContent = current.humidity.toFixed(0)
    }
    ui.temperatureRange.textContent = rangeLabel(history, 'temperature', ' ℃')
    ui.humidityRange.textContent = rangeLabel(history, 'humidity', ' %')
    drawChart(ui.temperatureChart, history, 'temperature', palette.getPropertyValue('--temperature').trim(), '℃')
    drawChart(ui.humidityChart, history, 'humidity', palette.getPropertyValue('--humidity').trim(), '%')
    const dashboardState = {
      nodeId: snapshot.selectedNodeId,
      mode: feed.mode,
      record: current ? { ...current, nodeId: current.nodeId || snapshot.selectedNodeId, status: currentStatus } : null,
      issue: issueEvents.getActive(snapshot.selectedNodeId, feed.mode)
    }
    renderIssuePanel()
    window.DormMateDashboardState = dashboardState
    window.dispatchEvent(new CustomEvent('dormmate:dashboard-state', { detail: dashboardState }))
  }

  function updateModeUi() {
    const usingMqtt = feed.mode === MODES.MQTT
    ui.modeIndicator.dataset.mode = feed.mode
    ui.modeLabel.textContent = usingMqtt ? '实时 MQTT' : '模拟数据模式'
    ui.modeToggle.textContent = usingMqtt ? '切换到模拟演示' : '切回实时 MQTT'
    ui.introNote.textContent = usingMqtt
      ? '通过 WebSocket 接收 dormmate/+/env，切换节点查看各自的实时记录与趋势。'
      : '本地模拟样本持续刷新，切换节点查看各自独立的记录与趋势。'
    ui.simulateSampleButton.disabled = usingMqtt
    ui.simulationTimerToggle.hidden = usingMqtt
    ui.simulationTimerToggle.textContent = feed.simulationPaused ? '继续自动模拟刷新' : '暂停自动模拟刷新'
    if (usingMqtt) ui.simulationSampleStatus.textContent = '请切换到模拟模式后注入样本；样本只进入本机模拟 Store，不写 CloudBase。'
    else ui.simulationSampleStatus.textContent = feed.simulationPaused
      ? '随机模拟刷新已暂停；可手动注入 dorm-a 的异常和恢复样本。'
      : '随机模拟刷新运行中；为验证恢复流程，请先暂停刷新再注入样本。'
  }

  const connectionLabels = {
    [STATES.CONNECTING]: '连接中',
    [STATES.CONNECTED]: '已连接',
    [STATES.DISCONNECTED]: '已断开',
    [STATES.RECONNECTING]: '重连中',
    [STATES.ERROR]: '连接错误'
  }

  function updateConnection(status) {
    connectionState = status.state
    ui.connectionStatus.dataset.state = status.state
    ui.connectionStatus.textContent = 'MQTT ' + (connectionLabels[status.state] || '状态未知')
    ui.connectionStatus.title = status.error || ''
    if (status.state === STATES.CONNECTED) ui.feedStatus.textContent = '已连接 ws://127.0.0.1:9001，并订阅 dormmate/+/env。'
    else if (status.state === STATES.CONNECTING) ui.feedStatus.textContent = '正在连接 ws://127.0.0.1:9001…'
    else if (status.state === STATES.DISCONNECTED) ui.feedStatus.textContent = 'MQTT 已断开，客户端将尝试恢复连接。'
    else if (status.state === STATES.RECONNECTING) ui.feedStatus.textContent = 'MQTT 正在重连…'
    else if (status.state === STATES.ERROR) ui.feedStatus.textContent = 'MQTT 连接错误：' + (status.error || '未知错误') + '。可切换到模拟模式继续演示。'
  }

  feed = createDashboardFeed({
    stores,
    onChange: render,
    onRecord: (record, source) => {
      const analysis = window.DormMateRules.analyzeEnvironment(record.temperature, record.humidity)
      issueEvents.observeReading({ ...record, status: record.status || analysis.status, advice: record.advice || analysis.advice }, source)
    },
    onInvalid: (result, source) => {
      ui.feedStatus.textContent = (source === MODES.MQTT ? '已忽略无效 MQTT 消息：' : '已忽略模拟消息：') + (result.error || '消息无效')
    }
  })

  makeNodeButtons()
  updateModeUi()
  render()

  const transport = createMqttTransport({
    mqtt: window.mqtt,
    onMessage: (topic, payload) => {
      const result = feed.ingestMqtt(topic, payload)
      if (result.accepted) ui.feedStatus.textContent = '已接收 ' + topic + '，节点历史已更新。'
      if (result.accepted || result.duplicate) {
        const checked = result.accepted ? { valid: true, data: result.record } : window.DormMateMqttMessage.validateMessage(topic, payload)
        if (checked.valid) mqttPersistence.persist(checked.data).then(saved => {
          ui.mqttSyncStatus.textContent = saved.refreshed === false
            ? 'MQTT 记录已保存；共享历史刷新失败，请手动刷新。'
            : saved.duplicate ? '重复 recordId 已合并，未新增云记录。' : 'MQTT 记录已保存到共享历史。'
        }).catch(error => { ui.mqttSyncStatus.textContent = 'MQTT 云端保存失败：' + (error.message || String(error)) })
      }
      return result
    },
    onStatus: updateConnection
  })

  ui.modeToggle.addEventListener('click', () => {
    const nextMode = feed.mode === MODES.MQTT ? MODES.SIMULATION : MODES.MQTT
    if (feed.setMode(nextMode)) {
      updateModeUi()
      render()
      if (nextMode === MODES.SIMULATION) ui.feedStatus.textContent = '模拟数据已启动，每 1.8 秒更新一次。'
      else if (connectionState === STATES.CONNECTED) ui.feedStatus.textContent = 'MQTT 已连接并订阅 dormmate/+/env。'
      else ui.feedStatus.textContent = '等待 MQTT 恢复；可随时切回模拟演示。'
    }
  })
  ui.simulationTimerToggle.addEventListener('click', () => {
    const paused = !feed.simulationPaused
    if (feed.setSimulationPaused(paused)) updateModeUi()
  })
  ui.refreshSharedHistory.addEventListener('click', () => { sharedHistory.refresh() })
  ui.historyScope.addEventListener('change', () => renderSharedHistory({ records: sharedHistory.records, error: sharedHistoryError }))
  ui.exportSharedCsv.addEventListener('click', () => {
    const records = sharedHistory.records
    if (!records.length) return
    const blob = new Blob([window.DormMateDashboardCsv.toCsv(records)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'DormMate-shared-history-' + new Date().toISOString().slice(0, 10) + '.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })
  ui.activeIssueList.addEventListener('click', event => {
    const button = event.target.closest('[data-issue-event-id]')
    if (!button) return
    const card = button.closest('.issue-card')
    const action = card && card.querySelector('select')
    const result = issueEvents.startProcessing(button.dataset.issueEventId, action && action.value)
    if (!result.accepted) {
      ui.issueSummary.textContent = result.error
      return
    }
    render()
  })
  function analyzeEntry() {
    const measured = window.DormMateRules.validateEnvironment(ui.entryTemperature.value, ui.entryHumidity.value)
    if (!measured.valid) { ui.entryAnalysis.textContent = measured.error; return null }
    const analysis = window.DormMateRules.analyzeEnvironment(measured.temperature, measured.humidity)
    ui.entryAnalysis.textContent = '状态：' + analysis.status + '；建议：' + analysis.advice
    return measured
  }
  ui.analyzeEntryButton.addEventListener('click', analyzeEntry)
  ui.simulateSampleButton.addEventListener('click', () => {
    if (feed.mode !== MODES.SIMULATION) return
    if (!feed.simulationPaused) {
      ui.simulationSampleStatus.textContent = '请先暂停自动模拟刷新，避免随机样本打断恢复验证。'
      return
    }
    const measured = window.DormMateRules.validateEnvironment(ui.entryTemperature.value, ui.entryHumidity.value)
    if (!measured.valid) {
      ui.simulationSampleStatus.textContent = measured.error
      return
    }
    const nodeId = feed.store.snapshot().selectedNodeId
    const message = window.DormMateMqttMessage.createMessage({
      nodeId, temperature: measured.temperature, humidity: measured.humidity,
      recordId: 'task-a-sim-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
      time: new Date().toISOString()
    })
    const result = feed.ingestSimulation(message)
    ui.simulationSampleStatus.textContent = result.accepted
      ? nodeId + ' 已注入本地模拟样本：' + result.record.status + ' · ' + result.record.temperature + '℃ / ' + result.record.humidity + '%；未写入 CloudBase。'
      : '模拟样本未注入：' + (result.error || '数据无效')
  })
  ui.recordForm.addEventListener('submit', async event => {
    event.preventDefault()
    if (ui.saveRecordButton.disabled) return
    const measured = analyzeEntry()
    if (!measured) return
    const nodeId = feed.store.snapshot().selectedNodeId
    const record = {
      recordId: 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12),
      nodeId, measuredAt: new Date().toISOString(), source: 'web',
      temperature: measured.temperature, humidity: measured.humidity
    }
    ui.saveRecordButton.disabled = true
    ui.saveRecordStatus.textContent = '正在保存 ' + nodeId + ' 的共享记录…'
    try {
      await saveCloudRecord(record)
      const refreshed = await sharedHistory.refresh({ afterPending: true })
      ui.saveRecordStatus.textContent = refreshed.success
        ? nodeId + ' 的记录已保存并更新共享历史。'
        : nodeId + ' 的记录已保存；历史刷新失败，请使用手动刷新。'
    } catch (error) {
      ui.saveRecordStatus.textContent = '保存失败：' + (error.message || String(error))
    } finally { ui.saveRecordButton.disabled = false }
  })

  window.addEventListener('resize', render)
  window.addEventListener('pagehide', () => {
    feed.destroy()
    transport.stop()
  }, { once: true })
  transport.start()
  sharedHistory.refresh()
})()
