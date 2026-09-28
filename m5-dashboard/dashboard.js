'use strict'

;(function () {
  const simulation = window.DormMateMqttSimulation
  const messages = window.DormMateMqttMessage
  const palette = getComputedStyle(document.documentElement)
  const { createDashboardStore } = window.DormMateDashboardStore
  const store = createDashboardStore({ maxHistory: 50 })
  const nodeSwitcher = document.getElementById('nodeSwitcher')
  const nodeButtons = new Map()
  const sequenceByNode = Object.fromEntries(simulation.NODES.map(node => [node.nodeId, 0]))
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
    feedStatus: document.getElementById('feedStatus')
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
        store.selectNode(nodeId)
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

  function appendSimulatedSamples() {
    simulation.NODES.forEach(({ nodeId }) => {
      try {
        const message = simulation.createNodeMessage(nodeId, sequenceByNode[nodeId]++)
        const result = store.ingest(messages.topicForNode(nodeId), JSON.stringify(message))
        if (!result.accepted && !result.duplicate) ui.feedStatus.textContent = '模拟消息已忽略：' + result.error
      } catch (error) {
        ui.feedStatus.textContent = '模拟数据暂时不可用：' + error.message
      }
    })
    render()
  }

  makeNodeButtons()
  appendSimulatedSamples()
  window.addEventListener('resize', render)
  window.setInterval(appendSimulatedSamples, 1800)
})()
