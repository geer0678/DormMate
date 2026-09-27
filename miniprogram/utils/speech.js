const settings = require('../config/speech')
const offline = require('../assets/audio/manifest.js')

function createSpeech(wxApi, callbacks, loader, asrLoader) {
  let plugin = null, manager = null, audio = null, token = 0, disposed = false
  let listening = false, ignoreResult = false, watchdog = null, session = 0, started = false
  let finalText = '', partialText = ''
  const emit = (name, value) => { if (!disposed && callbacks[name]) callbacks[name](value) }

  if (settings.enabled) {
    try { plugin = (loader || (() => requirePlugin('WechatSI')))() } catch (error) { plugin = null }
  }
  try {
    const sdk = (asrLoader || (() => require('../vendor/asr.cjs.js')))()
    if (wxApi.cloud && typeof wxApi.cloud.callFunction === 'function' && sdk.getRecorderSpeechRecognizer) {
      manager = sdk.getRecorderSpeechRecognizer(false)
    }
  } catch (error) { manager = null }

  const clearWatchdog = () => { clearTimeout(watchdog); watchdog = null }
  function finishRecognition() {
    clearWatchdog()
    listening = false
    started = false
    emit('recognitionState', 'idle')
  }
  function active(id) { return !disposed && !ignoreResult && listening && id === session }
  function bindManager(id) {
    manager.OnRecognitionStart = () => { if (active(id)) emit('recognitionState', 'recording') }
    manager.OnRecognitionResultChange = result => {
      if (!active(id)) return
      partialText = String(result.result && result.result.voice_text_str || '')
      emit('partial', finalText + partialText)
    }
    manager.OnSentenceEnd = result => {
      if (!active(id)) return
      finalText += String(result.result && result.result.voice_text_str || '')
      partialText = ''
      emit('partial', finalText)
    }
    manager.OnRecorderStop = () => { if (active(id)) emit('recognitionState', 'processing') }
    manager.OnRecognitionComplete = () => {
      if (!active(id)) return
      const text = (finalText + partialText).trim()
      finishRecognition()
      if (text) emit('recognized', text)
      else emit('error', '没有听清，请靠近麦克风重试')
    }
    manager.OnError = () => {
      if (!active(id)) return
      finishRecognition()
      emit('error', '识别失败，请检查网络和语音服务后重试')
    }
  }
  function fetchCredentials(id) {
    wxApi.cloud.callFunction({
      name: 'speechRecognition',
      success: response => {
        if (!active(id)) return
        const result = response && response.result
        const credentials = result && result.credentials
        const expiry = Number(result && result.expiredTime)
        if (!result || !result.success || !credentials || !credentials.tmpSecretId ||
            !credentials.tmpSecretKey || !credentials.token || !Number.isFinite(expiry) ||
            expiry <= Math.floor(Date.now() / 1000) + 60) {
          finishRecognition()
          emit('error', '临时语音凭证获取失败，请稍后重试')
          return
        }
        try {
          bindManager(id)
          const didStart = manager.start({
            appid: 1496785802,
            secretid: credentials.tmpSecretId,
            secretkey: credentials.tmpSecretKey,
            token: credentials.token,
            engine_model_type: '16k_zh',
            needvad: 1,
            filter_punc: 1,
            duration: 30000
          })
          if (didStart === false) throw new Error('ASR start failed')
          started = true
          watchdog = setTimeout(() => {
            if (!active(id)) return
            cancelRecognition()
            emit('error', '识别超时，请检查网络后重试')
          }, 45000)
        } catch (error) {
          finishRecognition()
          emit('error', '无法启动语音识别，请稍后重试')
        }
      },
      fail: () => {
        if (!active(id)) return
        finishRecognition()
        emit('error', '临时语音凭证获取失败，请检查网络后重试')
      }
    })
  }
  function ensureAudio() {
    if (audio) return audio
    audio = wxApi.createInnerAudioContext()
    audio.obeyMuteSwitch = false
    audio.onPlay(() => emit('playback', '正在播报'))
    audio.onEnded(() => emit('playback', '播报完成'))
    audio.onError(() => emit('playback', '播报失败，请检查音量、网络后重试'))
    return audio
  }
  function stop() {
    token++
    if (audio) audio.stop()
    emit('playback', '已停止播报')
  }
  function speak(text) {
    const value = String(text || '').trim()
    stop()
    if (!value) { emit('playback', '请输入需要播报的文字'); return }
    if (value.length > 500) { emit('playback', '每次最多播报500个字'); return }
    const requestToken = token
    const play = src => {
      if (disposed || requestToken !== token) return
      const player = ensureAudio()
      player.src = src
      player.play()
    }
    if (offline[value]) { play(offline[value]); return }
    if (!plugin) { emit('playback', '自定义文字播报需开通语音服务；环境建议可离线播放'); return }
    emit('playback', '正在合成语音')
    plugin.textToSpeech({
      lang: 'zh_CN', tts: true, content: value,
      success: result => {
        if (requestToken !== token || disposed) return
        if (Number(result.retcode) === 0 && result.filename) play(result.filename)
        else emit('playback', '语音合成失败，请稍后重试')
      },
      fail: () => { if (requestToken === token) emit('playback', '语音合成失败，请检查网络或服务额度') }
    })
  }
  function cancelRecognition() {
    ignoreResult = true
    session++
    const wasListening = listening
    const wasStarted = started
    finishRecognition()
    if (wasListening && wasStarted && manager) { try { manager.stop() } catch (error) {} }
  }
  return {
    available: !!manager,
    speak, stop,
    startRecognition() {
      if (!manager) { emit('error', '实时语音识别尚未就绪'); return }
      if (listening) return
      ignoreResult = false
      listening = true
      finalText = ''
      partialText = ''
      started = false
      const id = ++session
      stop()
      emit('recognitionState', 'starting')
      wxApi.authorize({
        scope: 'scope.record',
        success: () => { if (active(id)) fetchCredentials(id) },
        fail: () => { if (active(id)) { finishRecognition(); emit('error', '麦克风未授权，请点击“权限设置”开启') } }
      })
    },
    stopRecognition() {
      if (!manager || !listening) return
      emit('recognitionState', 'processing')
      if (!started) { cancelRecognition(); return }
      try { manager.stop() } catch (error) { finishRecognition(); emit('error', '停止录音失败，请重试') }
    },
    suspend() { cancelRecognition(); stop() },
    destroy() {
      cancelRecognition()
      stop()
      disposed = true
      if (audio) audio.destroy()
    }
  }
}
module.exports = { createSpeech }
