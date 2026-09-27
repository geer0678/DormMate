Component({
  properties: {
    records: { type: Array, value: [], observer() { if (this._ready) this.draw() } }
  },
  data: { chartError: '' },
  lifetimes: {
    ready() { this._ready = true; this.draw() },
    detached() { this._ready = false }
  },
  pageLifetimes: { resize() { this.draw() } },
  methods: {
    draw() {
      if (!this._ready) return
      this.createSelectorQuery().select('#trend').fields({ node: true, size: true }).exec(result => {
        if (!this._ready) return
        const field = result && result[0]
        if (!field || !field.node || !field.width) { this.setData({ chartError: '图表暂不可用，请重新打开分析页' }); return }
        this.setData({ chartError: '' })
        const canvas = field.node
        const ctx = canvas.getContext('2d')
        const ratio = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio
        const w = field.width, h = field.height
        canvas.width = w * ratio; canvas.height = h * ratio
        ctx.scale(ratio, ratio)
        ctx.clearRect(0, 0, w, h)
        const left = 28, right = w - 30, top = 16, bottom = h - 32
        ctx.font = '10px sans-serif'
        for (let tick = 0; tick <= 5; tick++) {
          const y = bottom - tick / 5 * (bottom - top)
          ctx.strokeStyle = '#e7edf5'; ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke()
          ctx.fillStyle = '#2563eb'; ctx.textAlign = 'right'; ctx.fillText(String(tick * 10), left - 5, y + 4)
          ctx.fillStyle = '#0f8b80'; ctx.textAlign = 'left'; ctx.fillText(String(tick * 20), right + 5, y + 4)
        }
        const records = this.data.records
        if (!records.length) return
        const xAt = i => records.length === 1 ? (left + right) / 2 : left + i / (records.length - 1) * (right - left)
        const series = (key, max, color) => {
          ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath()
          records.forEach((record, i) => {
            const x = xAt(i), y = bottom - record[key] / max * (bottom - top)
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          })
          ctx.stroke()
          records.forEach((record, i) => {
            const y = bottom - record[key] / max * (bottom - top)
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(xAt(i), y, 2.5, 0, Math.PI * 2); ctx.fill()
          })
        }
        series('temperature', 50, '#2563eb'); series('humidity', 100, '#0f8b80')
        ctx.fillStyle = '#718096'
        ctx.textAlign = 'left'; ctx.fillText(records[0].time.slice(5, 16), left, h - 10)
        if (records.length > 1) {
          ctx.textAlign = 'right'; ctx.fillText(records[records.length - 1].time.slice(5, 16), right, h - 10)
        }
      })
    }
  }
})

