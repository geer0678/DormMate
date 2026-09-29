'use strict'

;(function () {
  const simulation = window.DormMateMqttSimulation
  const { createDashboardStore } = window.DormMateDashboardStore
  const { createMqttTransport, STATES } = window.DormMateMqttTransport
  const { createDashboardFeed, MODES } = window.DormMateDashboardFeed
  const { createSharedHistory } = window.DormMateDashboardSharedHistory
  const { createMqttPersistence } = window.DormMateDashboardMqttPersistence
  const { createNodeView, filterSharedHistory } = window.DormMateDashboardNodeView
  const palette = getComputedStyle(document.documentElement)
  const stores = { mqtt: createDashboardStore({ maxHistory: 50 }), simulation: createDashboardStore({ maxHistory: 50 }) }
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
    saveRecordStatus: document.getElementById('saveRecordStatus')
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
      ui.statusValue.textContent = current.status || analysis.status
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
  }

  function updateModeUi() {
    const usingMqtt = feed.mode === MODES.MQTT
    ui.modeIndicator.dataset.mode = feed.mode
    ui.modeLabel.textContent = usingMqtt ? '实时 MQTT' : '模拟数据模式'
    ui.modeToggle.textContent = usingMqtt ? '切换到模拟演示' : '切回实时 MQTT'
    ui.introNote.textContent = usingMqtt
      ? '通过 WebSocket 接收 dormmate/+/env，切换节点查看各自的实时记录与趋势。'
      : '本地模拟样本持续刷新，切换节点查看各自独立的记录与趋势。'
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
  function analyzeEntry() {
    const measured = window.DormMateRules.validateEnvironment(ui.entryTemperature.value, ui.entryHumidity.value)
    if (!measured.valid) { ui.entryAnalysis.textContent = measured.error; return null }
    const analysis = window.DormMateRules.analyzeEnvironment(measured.temperature, measured.humidity)
    ui.entryAnalysis.textContent = '状态：' + analysis.status + '；建议：' + analysis.advice
    return measured
  }
  ui.analyzeEntryButton.addEventListener('click', analyzeEntry)
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
