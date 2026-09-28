'use strict'

;(function () {
  const simulation = window.DormMateMqttSimulation
  const { createDashboardStore } = window.DormMateDashboardStore
  const { createMqttTransport, STATES } = window.DormMateMqttTransport
  const { createDashboardFeed, MODES } = window.DormMateDashboardFeed
  const palette = getComputedStyle(document.documentElement)
  const stores = { mqtt: createDashboardStore({ maxHistory: 50 }), simulation: createDashboardStore({ maxHistory: 50 }) }
  const nodeSwitcher = document.getElementById('nodeSwitcher')
  const nodeButtons = new Map()
  const ui = {
    nodeHeading: document.getElementById('nodeHeading'),
    statusValue: document.getElementById('statusValue'),
    recordTime: document.getElementById('recordTime'),
    temperatureValue: document.getElementById('temperatureValue'),
    humidityValue: document.getElementById('humidityValue'),
    temperatureRange: document.getElementById('temperatureRange'),
    humidityRange: document.getElementById('humidityRange'),
    temperatureChart: document.getElementById('temperatureChart'),
    humidityChart: document.getElementById('humidityChart'),
    historyCount: document.getElementById('historyCount'),
    feedStatus: document.getElementById('feedStatus'),
    modeIndicator: document.getElementById('modeIndicator'),
    modeLabel: document.getElementById('modeLabel'),
    connectionStatus: document.getElementById('connectionStatus'),
    modeToggle: document.getElementById('modeToggle'),
    introNote: document.getElementById('introNote')
  }
  let feed
  let connectionState = STATES.CONNECTING

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
        feed.store.selectNode(nodeId)
        render()
      })
      nodeSwitcher.append(button)
      nodeButtons.set(nodeId, { button, status })
    })
  }

  function timeLabel(value) {
    return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  function rangeLabel(history, field, suffix) {
    if (!history.length) return '--'
    const values = history.map(record => record[field])
    const min = Math.min(...values), max = Math.max(...values)
    return (min === max ? min.toFixed(1) : min.toFixed(1) + '–' + max.toFixed(1)) + suffix
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
      context.fillText(timeLabel(history[index].time), pointX(index), height - 7)
    })
  }

  function render() {
    if (!feed) return
    const store = feed.store
    const snapshot = store.snapshot()
    simulation.NODES.forEach(({ nodeId }) => {
      const item = nodeButtons.get(nodeId)
      const history = store.getHistory(nodeId)
      item.button.setAttribute('aria-pressed', String(nodeId === snapshot.selectedNodeId))
      item.status.textContent = history.length ? history[history.length - 1].status : '等待数据'
    })
    ui.nodeHeading.textContent = snapshot.selectedNodeId
    ui.historyCount.textContent = snapshot.history.length + ' / ' + snapshot.maxHistory + ' 条记录'
    if (!snapshot.current) {
      ui.statusValue.textContent = '等待数据'
      ui.recordTime.textContent = '--'
      ui.temperatureValue.textContent = '--'
      ui.humidityValue.textContent = '--'
    } else {
      ui.statusValue.textContent = snapshot.current.status
      ui.recordTime.textContent = new Date(snapshot.current.time).toLocaleString('zh-CN')
      ui.recordTime.dateTime = snapshot.current.time
      ui.temperatureValue.textContent = snapshot.current.temperature.toFixed(1)
      ui.humidityValue.textContent = snapshot.current.humidity.toFixed(0)
    }
    ui.temperatureRange.textContent = rangeLabel(snapshot.history, 'temperature', ' ℃')
    ui.humidityRange.textContent = rangeLabel(snapshot.history, 'humidity', ' %')
    drawChart(ui.temperatureChart, snapshot.history, 'temperature', palette.getPropertyValue('--temperature').trim(), '℃')
    drawChart(ui.humidityChart, snapshot.history, 'humidity', palette.getPropertyValue('--humidity').trim(), '%')
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

  window.addEventListener('resize', render)
  window.addEventListener('pagehide', () => {
    feed.destroy()
    transport.stop()
  }, { once: true })
  transport.start()
})()
