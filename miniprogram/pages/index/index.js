const rules = require('../../utils/dormmate')
const records = require('../../utils/records')
const csv = require('../../utils/csv')
const storage = require('../../utils/storage')
const cloudRecords = require('../../utils/cloudRecords')
const { createSpeech } = require('../../utils/speech')
const { resolveCommand } = require('../../utils/commands')
const webHistory = require('../../data/web-history')
const PAGE_SIZE = 20

Page({
  data: {
    activeTab: 'environment',
    tabs: [{ key: 'environment', label: '环境' }, { key: 'history', label: '记录' },
      { key: 'analysis', label: '分析' }, { key: 'interaction', label: '交互' }],
    temperatureInput: '', humidityInput: '', temperature: '--', humidity: '--',
    status: '等待分析', advice: '输入现场温湿度，获取环境建议。', time: '--', tone: 'waiting',
    error: '', notice: '', stats: records.statistics([]), history: [], historyTotal: 0,
    historyLimit: PAGE_SIZE, onlyAbnormal: false, hasMore: false, trend: [], webRecordCount: webHistory.length,
    importText: '', importOpen: false, importBusy: false,
    exportedPath: '', exportedName: '', exportBusy: false,
    cameraOpen: false, cameraReady: false, cameraPosition: 'back', cameraStatus: '摄像头尚未开启',
    photoPath: '', takingPhoto: false, savingPhoto: false,
    speechAvailable: false, recognitionState: 'idle', speechStatus: '点击按钮开始说话',
    speechResult: '', ttsText: '当前温湿度适宜，请继续保持良好通风。',
    ttsStatus: '等待播报', autoSpeak: true, commandText: ''
  },

  onLoad() {
    this._alive = true; this._visible = true; this._history = []; this._storageBlocked = false
    try {
      this._history = storage.load(wx)
    } catch (error) {
      this._storageBlocked = true
      this.setData({ error: '历史读取失败，原数据已保留。请重新打开小程序；若仍失败，先备份开发者工具中的本地存储。' })
    }
    try {
      const preference = wx.getStorageSync('dormmate_auto_speak')
      if (typeof preference === 'boolean') this.setData({ autoSpeak: preference })
    } catch (error) {}
    this.refreshHistory()
    this.loadCloudHistory()
    if (this._history.length) this.showCurrent(this._history[0])
    this._speech = createSpeech(wx, {
      recognitionState: state => {
        const labels = { idle: '识别结束', starting: '正在启动麦克风', recording: '正在听你说话…', processing: '正在识别…' }
        this.setData({ recognitionState: state, speechStatus: labels[state] })
      },
      partial: text => this.setData({ speechResult: text }),
      recognized: text => {
        this.setData({ speechResult: text, speechStatus: '识别成功' })
        this.executeText(text)
      },
      error: message => this.setData({ speechStatus: message }),
      playback: message => this.setData({ ttsStatus: message })
    })
    this.setData({ speechAvailable: this._speech.available })
  },
  onShow() { this._visible = true; this.loadCloudHistory() },
  onHide() {
    this._visible = false
    this.stopCamera()
    if (this._speech) this._speech.suspend()
  },
  onUnload() {
    this._alive = false
    if (this._speech) this._speech.destroy()
  },

  setTab(event) { this.openTab(event.currentTarget.dataset.tab) },
  openTab(tab) {
    if (!this.data.tabs.some(item => item.key === tab)) return
    if (tab !== 'interaction') this.stopCamera()
    this.setData({ activeTab: tab })
    if (tab === 'history' || tab === 'analysis') this.loadCloudHistory()
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },
  inputTemperature(event) { this.setData({ temperatureInput: event.detail.value, error: '' }) },
  inputHumidity(event) { this.setData({ humidityInput: event.detail.value, error: '' }) },
  showCurrent(record) {
    this.setData({
      temperature: record.temperature, humidity: record.humidity, status: record.status,
      advice: record.advice, time: record.time, tone: record.status === '正常' ? 'normal' : 'attention',
      ttsText: record.advice
    })
  },
  refreshHistory() {
    const filtered = this.data.onlyAbnormal ? this._history.filter(item => item.status !== '正常') : this._history
    this.setData({
      stats: records.statistics(this._history), historyTotal: filtered.length,
      history: filtered.slice(0, this.data.historyLimit), hasMore: filtered.length > this.data.historyLimit,
      trend: this._history.slice(0, 30).reverse()
    })
  },
  async loadCloudHistory() {
    if (this._cloudLoad) return this._cloudLoad
    this._cloudLoad = (async () => {
      try {
        const shared = await cloudRecords.list(wx)
        if (!this._alive) return
        this._history = shared
        try { storage.save(wx, shared) } catch (error) { this.setData({ notice: '云端记录已加载，本机缓存保存失败' }) }
        this.refreshHistory()
      } catch (error) {
        if (this._alive) this.setData({ notice: '云端刷新失败，正在显示本机缓存：' + error.message })
      }
    })()
    try { return await this._cloudLoad } finally { this._cloudLoad = null }
  },
  commitHistory(next) {
    if (this._storageBlocked) throw new Error('历史尚未成功读取，为避免覆盖，请重新打开小程序后重试')
    storage.save(wx, next)
    this._history = next
    this.refreshHistory()
  },
  async updateEnvironment() {
    const validation = rules.validateEnvironment(this.data.temperatureInput, this.data.humidityInput)
    if (!validation.valid) { this.setData({ error: validation.error }); return }
    try {
      if (this._cloudLoad) await this._cloudLoad
      const record = records.normalize({
        time: rules.formatTime(new Date()), temperature: validation.temperature, humidity: validation.humidity
      }, 0)
      record.id = 'miniprogram-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12)
      await cloudRecords.add(wx, record)
      try {
        this._history = await cloudRecords.list(wx)
      } catch (error) {
        this._history = [record, ...this._history]
        this.setData({ notice: '云端已保存，刷新失败；请稍后刷新共享历史' })
      }
      try { storage.save(wx, this._history) } catch (error) {}
      this.refreshHistory()
      this.showCurrent(record)
      this.setData({ error: '', notice: '已保存到共享历史' })
      if (this.data.autoSpeak) this._speech.speak(record.advice)
    } catch (error) {
      this.setData({ error: '保存失败：' + error.message })
    }
  },
  filterHistory(event) {
    this.setData({ onlyAbnormal: event.detail.value, historyLimit: PAGE_SIZE })
    this.refreshHistory()
  },
  loadMore() {
    this.setData({ historyLimit: this.data.historyLimit + PAGE_SIZE })
    this.refreshHistory()
  },
  clearHistory() {
    if (!this._history.length) { this.toast('当前没有记录'); return }
    wx.showModal({
      title: '清空当前历史', content: '将删除当前显示的全部记录。建议先导出 CSV 备份。', confirmColor: '#bc3d35',
      success: result => {
        if (!result.confirm || !this._alive) return
        try {
          this.commitHistory([])
          this._speech.stop()
          this.setData({ temperature: '--', humidity: '--', status: '等待分析', tone: 'waiting',
            advice: '输入现场温湿度，获取环境建议。', time: '--', ttsText: '',
            exportedPath: '', exportedName: '', notice: '当前历史已清空' })
        } catch (error) { this.toast('清空失败，原记录已保留') }
      }
    })
  },

  toggleImport() { this.setData({ importOpen: !this.data.importOpen }) },
  inputImport(event) { this.setData({ importText: event.detail.value }) },
  importPasted() {
    try { this.confirmImport(csv.parseImport(this.data.importText)) } catch (error) { this.modal('无法导入', error.message) }
  },
  importWebSnapshot() {
    try { this.confirmImport(records.normalizeAll(webHistory)) } catch (error) { this.modal('无法导入', error.message) }
  },
  importFile() {
    if (this.data.importBusy) return
    if (!wx.chooseMessageFile) { this.modal('当前微信不支持文件选择', '请使用“粘贴数据”导入，或升级微信。'); return }
    this.setData({ importBusy: true })
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['csv', 'json'],
      success: result => {
        const file = result.tempFiles && result.tempFiles[0]
        if (!file) { this.setData({ importBusy: false }); return }
        if (file.size > 2 * 1024 * 1024) { this.setData({ importBusy: false }); this.modal('文件过大', '请选择不超过2MB的 CSV 或 JSON。'); return }
        wx.getFileSystemManager().readFile({
          filePath: file.path, encoding: 'utf8',
          success: result => {
            if (!this._alive) return
            this.setData({ importBusy: false })
            try { this.confirmImport(csv.parseImport(result.data)) } catch (error) { this.modal('无法导入', error.message) }
          },
          fail: () => { if (this._alive) { this.setData({ importBusy: false }); this.modal('读取失败', '请重新选择 UTF-8 编码的 CSV 或 JSON 文件。') } }
        })
      },
      fail: error => {
        this.setData({ importBusy: false })
        if (!/cancel/.test(error.errMsg || '')) this.modal('文件选择失败', '可将文件发到文件传输助手后重新选择，或使用粘贴导入。')
      }
    })
  },
  confirmImport(incoming) {
    if (this._storageBlocked) { this.modal('暂不能导入', '请先解决历史读取错误，原数据未改动。'); return }
    const key = item => item.time + '|' + item.temperature + '|' + item.humidity
    const existing = new Set(this._history.map(key))
    const fresh = incoming.filter(item => {
      const value = key(item)
      if (existing.has(value)) return false
      existing.add(value)
      return true
    })
    wx.showModal({
      title: '确认导入历史',
      content: '上传 ' + fresh.length + ' 条到共享历史，跳过重复 ' + (incoming.length - fresh.length) + ' 条。',
      success: async result => {
        if (!result.confirm || !this._alive) return
        try {
          for (const item of fresh) {
            await cloudRecords.add(wx, { ...item, id: 'miniprogram-import-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12) })
          }
          this._history = await cloudRecords.list(wx)
          try { storage.save(wx, this._history) } catch (error) {}
          this.refreshHistory()
          if (this._history.length) this.showCurrent(this._history[0])
          this.setData({ importText: '', importOpen: false, notice: '已上传 ' + fresh.length + ' 条到共享历史' })
          this.openTab('history')
        } catch (error) { await this.loadCloudHistory(); this.modal('导入未完成', error.message + '；已成功上传的记录保留在云端。') }
      }
    })
  },

  exportCSV() { this.exportData('dormmate.csv', csv.toCSV(this._history)) },
  exportReport() { this.exportData('dormmate-report.txt', '\uFEFF' + records.report(this._history)) },
  exportData(name, content) {
    if (!this._history.length) { this.toast('请先保存或导入环境记录'); return }
    if (this.data.exportBusy) return
    this.setData({ exportBusy: true, exportedPath: '', exportedName: '' })
    const filePath = wx.env.USER_DATA_PATH + '/' + name
    wx.getFileSystemManager().writeFile({
      filePath, data: content, encoding: 'utf8',
      success: () => {
        if (!this._alive) return
        this.setData({ exportBusy: false, exportedPath: filePath, exportedName: name, notice: '文件已生成，请点击“分享文件”保存到文件传输助手或聊天。' })
        this.openTab('history')
      },
      fail: () => {
        if (this._alive) this.setData({ exportBusy: false, notice: '文件保存失败，请检查空间；也可点击“复制 CSV”。' })
      }
    })
  },
  shareExport() {
    if (!this.data.exportedPath) return
    if (!wx.shareFileMessage) { this.modal('请使用手机微信', '当前环境不支持分享文件。开发者工具可在调试器的文件系统中取出导出文件，也可复制 CSV。'); return }
    wx.shareFileMessage({
      filePath: this.data.exportedPath, fileName: this.data.exportedName,
      fail: error => { if (!/cancel/.test(error.errMsg || '')) this.modal('分享失败', '文件已保留，请稍后重试。') }
    })
  },
  copyCSV() {
    if (!this._history.length) { this.toast('暂无记录'); return }
    wx.setClipboardData({ data: csv.toCSV(this._history), fail: () => this.toast('复制失败，请使用文件导出') })
  },

  startCamera() {
    this.openTab('interaction')
    if (this.data.cameraOpen) return
    const request = this._cameraRequest = (this._cameraRequest || 0) + 1
    this.setData({ cameraStatus: '正在请求摄像头权限' })
    wx.authorize({
      scope: 'scope.camera',
      success: () => {
        if (!this._alive || !this._visible || request !== this._cameraRequest || this.data.activeTab !== 'interaction') return
        this.setData({ cameraOpen: true, cameraReady: false, cameraStatus: '摄像头启动中' })
      },
      fail: () => {
        if (request === this._cameraRequest && this._alive) this.setData({ cameraStatus: '摄像头未授权，请点击“权限设置”开启' })
      }
    })
  },
  cameraReady() { if (this.data.cameraOpen) this.setData({ cameraReady: true, cameraStatus: '摄像头已开启' }) },
  stopCamera() {
    this._cameraRequest = (this._cameraRequest || 0) + 1
    if (this._alive) this.setData({ cameraOpen: false, cameraReady: false, takingPhoto: false, cameraStatus: '摄像头已关闭' })
  },
  cameraError() {
    this.stopCamera()
    this.setData({ cameraStatus: '摄像头不可用，请在手机微信检查授权后重试' })
  },
  cameraStopped() { this.stopCamera() },
  flipCamera() {
    if (!this.data.cameraOpen) return
    this.setData({ cameraPosition: this.data.cameraPosition === 'back' ? 'front' : 'back' })
  },
  capturePhoto() {
    if (!this.data.cameraReady || this.data.takingPhoto) { this.toast('请等待摄像头就绪'); return }
    this.setData({ takingPhoto: true })
    wx.createCameraContext().takePhoto({
      quality: 'high',
      success: result => { if (this._alive && this._visible) this.setData({ photoPath: result.tempImagePath, cameraStatus: '拍照成功，点击照片可放大', takingPhoto: false }) },
      fail: () => { if (this._alive) { this.setData({ takingPhoto: false }); this.toast('拍照失败，请重新打开摄像头') } }
    })
  },
  previewPhoto() { if (this.data.photoPath) wx.previewImage({ urls: [this.data.photoPath] }) },
  savePhoto() {
    if (!this.data.photoPath || this.data.savingPhoto) return
    this.setData({ savingPhoto: true })
    wx.saveImageToPhotosAlbum({
      filePath: this.data.photoPath,
      success: () => this.toast('照片已保存'),
      fail: () => this.modal('保存失败', '请在权限设置中允许保存到相册后重试。'),
      complete: () => { if (this._alive) this.setData({ savingPhoto: false }) }
    })
  },
  openSettings() { wx.openSetting({}) },

  inputTTS(event) { this.setData({ ttsText: event.detail.value }) },
  speakText() { this._speech.speak(this.data.ttsText) },
  speakAdvice() {
    if (!this._history.length) { this.toast('请先分析一组环境数据'); return }
    const advice = this._history[0].advice
    this.setData({ ttsText: advice })
    this._speech.speak(advice)
  },
  stopSpeaking() { this._speech.stop() },
  toggleAutoSpeak(event) {
    try {
      wx.setStorageSync('dormmate_auto_speak', event.detail.value)
      this.setData({ autoSpeak: event.detail.value })
    } catch (error) { this.toast('设置保存失败，请重试') }
  },
  startRecognition() {
    this.setData({ speechResult: '' })
    this._speech.startRecognition()
  },
  stopRecognition() { this._speech.stopRecognition() },
  inputCommand(event) { this.setData({ commandText: event.detail.value }) },
  runTypedCommand() { this.executeText(this.data.commandText) },
  executeText(text) {
    const command = resolveCommand(text)
    switch (command) {
      case 'analyze': this.openTab('environment'); this.updateEnvironment(); break
      case 'history': this.openTab('history'); this._speech.speak('已为你打开历史记录。'); break
      case 'export': this.exportCSV(); break
      case 'cameraOn': this.startCamera(); break
      case 'cameraOff': this.stopCamera(); break
      case 'advice': this.speakAdvice(); break
      case 'stop': this.stopSpeaking(); break
      default:
        this.setData({ ttsText: String(text).slice(0, 500), speechStatus: '普通文字已填入播报框，未执行指令' })
        return
    }
    this.setData({ speechStatus: '已执行指令：' + String(text).trim() })
  },
  showVoiceHelp() {
    this.modal('语音服务说明', '九种环境建议可离线播报。语音识别和自定义文字播报需要在小程序后台添加微信同声传译插件，再按 README 中的配置命令启用。录音仅在你点击开始后进行。')
  },
  toast(title) { wx.showToast({ title, icon: 'none' }) },
  modal(title, content) { wx.showModal({ title, content, showCancel: false }) }
})

