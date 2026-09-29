const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { createRequire } = require('node:module')
const rules = require('../utils/dormmate')
const records = require('../utils/records')
const csv = require('../utils/csv')
const storage = require('../utils/storage')
const { createSpeech } = require('../utils/speech')
const settings = require('../config/speech')
const { resolveCommand } = require('../utils/commands')
const sample = (t = 25, h = 55, time = '2026-09-27 12:00:00') => records.normalize({ temperature: t, humidity: h, time }, 0)

test('九种状态、上下限、阈值和小数', () => {
  const expected = [['偏冷偏干','偏冷','偏冷偏湿'],['偏干','正常','偏湿'],['偏热偏干','偏热','偏热偏湿']]
  ;[16,25,32].forEach((t, i) => [35,55,80].forEach((h, j) => assert.equal(rules.analyzeEnvironment(t,h).status,expected[i][j])))
  assert.equal(rules.analyzeEnvironment(18,40).status,'正常')
  assert.equal(rules.analyzeEnvironment(29.99,74.99).status,'正常')
  assert.equal(rules.analyzeEnvironment(30,75).status,'偏热偏湿')
  assert.equal(rules.analyzeEnvironment(0,0).status,'偏冷偏干')
  assert.equal(rules.analyzeEnvironment(50,100).status,'偏热偏湿')
})
test('空值、NaN、无穷、隐式类型和越界不能进入历史', () => {
  for (const value of ['', ' ', null, undefined, false, true, [], {}, NaN, Infinity, 'NaN', '0x20', '1e1']) {
    assert.equal(rules.validateEnvironment(value,50).valid,false)
    assert.equal(rules.validateEnvironment(25,value).valid,false)
  }
  for (const [t,h] of [[-1,20],[51,20],[20,-1],[20,101]]) assert.equal(rules.validateEnvironment(t,h).valid,false)
})
test('CSV 往返，BOM、双引号、逗号、换行及非法文件', () => {
  const input=[sample(32,80),sample(16,35,'2026-09-27 11:00:00')]
  assert.deepEqual(csv.parseImport(csv.toCSV(input)),input.slice().reverse())
  assert.deepEqual(csv.parseRows('\uFEFFa,b\r\n"one,\ntwo","say ""hello"""\r\n'),[['a','b'],['one,\ntwo','say "hello"']])
  for(const text of ['', 'time,temperature\nx,25', 'time,temperature,humidity\n2026-09-27 12:00:00,25,101',
    'time,temperature,humidity\n"missing,25,50', 'time,time,temperature,humidity\nx,x,25,50',
    'time,temperature,humidity\n2026-09-27 12:00:00,25,50,extra', '{"x":']) {
    assert.throws(()=>csv.parseImport(text))
  }
  assert.throws(()=>records.normalize({time:'2026-02-30 12:00:00',temperature:25,humidity:50},0))
})
test('旧状态重算、合并去重、JSON 导入、限制', () => {
  const old={time:'2026-09-27 12:00',temperature:16,humidity:35,status:'偏冷',advice:'旧建议'}
  const imported=csv.parseImport(JSON.stringify({history:[old]}))
  assert.equal(imported[0].status,'偏冷偏干')
  assert.equal(imported[0].time,'2026-09-27 12:00:00')
  assert.equal(records.mergeRecords(imported,imported).added,0)
  assert.throws(()=>records.normalizeAll(new Array(records.LIMIT+1).fill(old)),/最多/)
})
test('统计、九状态分布、TXT 关注记录与零记录', () => {
  const list=[sample(25,50),sample(35,80,'2026-09-27 13:00:00')]
  const result=records.statistics(list)
  assert.equal(result.averageTemperature,'30.00')
  assert.equal(result.averageHumidity,'65.00')
  assert.equal(result.abnormalRate,'50.00')
  assert.equal(result.minTemperature,25)
  assert.equal(result.maxTemperature,35)
  assert.equal(result.distribution.find(item=>item.status==='偏热偏湿').count,1)
  assert.equal(records.statistics([]).averageTemperature,'--')
  assert.match(records.report(list),/偏热偏湿/)
  assert.match(records.report(list),/2026-09-27 13:00:00/)
})
function mockWx() {
  const values = new Map()
  const plays=[]
  const cloudRows=[]
  const api={
    values,plays,
    cloud:{callFunction({data}){
      if(data.action==='list') return Promise.resolve({result:{success:true,records:cloudRows.slice(data.offset,data.offset+data.limit),nextOffset:null}})
      if(data.action==='add') {
        cloudRows.unshift({recordId:data.recordId,temperature:data.temperature,humidity:data.humidity,
          ...rules.analyzeEnvironment(data.temperature,data.humidity),source:data.source,createdAt:new Date().toISOString()})
        return Promise.resolve({result:{success:true}})
      }
      return Promise.resolve({result:{success:false,error:'不支持的操作'}})
    }},
    getStorageSync(key){return values.has(key)?values.get(key):''},
    setStorageSync(key,value){values.set(key,JSON.parse(JSON.stringify(value)))},
    showToast(){},showModal(options){options.success && options.success({confirm:true})},
    pageScrollTo(){},openSetting(){},
    authorize(options){options.success()},
    createInnerAudioContext(){return {src:'',onPlay(){},onEnded(){},onError(){},play(){plays.push(this.src)},stop(){},destroy(){}}}
  }
  return api
}
test('迁移旧缓存；清空后不重新导入旧缓存；读取失败不覆盖', () => {
  const wx=mockWx()
  wx.values.set('history',[sample()])
  assert.equal(storage.load(wx).length,1)
  storage.save(wx,[])
  assert.equal(storage.load(wx).length,0)
  wx.values.set(storage.KEY,'broken')
  assert.throws(()=>storage.load(wx))
  assert.equal(wx.values.get(storage.KEY),'broken')
})
test('页面在本地历史损坏后加载云端时保留原始缓存', async () => {
  const wx=mockWx()
  wx.values.set(storage.KEY,'broken')
  const page=loadPage(wx)
  await new Promise(setImmediate)
  assert.equal(page._storageBlocked,true)
  assert.equal(wx.values.get(storage.KEY),'broken')
  page.onUnload()
})
function loadPage(wx) {
  const filename=path.resolve(__dirname,'../pages/index/index.js')
  let definition
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),{require:createRequire(filename),wx,Page(value){definition=value},
    console,Date,Math,setInterval(){return 1},clearInterval(){}})
  const page={...definition,data:JSON.parse(JSON.stringify(definition.data)),setData(patch){Object.assign(this.data,patch)}}
  page.onLoad()
  return page
}
test('页面输入→云端保存→统计→重开；本机缓存失败不影响云端记录', async () => {
  const wx=mockWx()
  const page=loadPage(wx)
  await new Promise(setImmediate)
  assert.equal(page.data.stats.count,0)
  await page.updateEnvironment()
  assert.equal(page.data.stats.count,0)
  page.inputTemperature({detail:{value:'31'}}); page.inputHumidity({detail:{value:'78'}})
  await page.updateEnvironment()
  assert.equal(page.data.status,'偏热偏湿')
  assert.equal(page.data.stats.count,1)
  assert.equal(wx.plays.length,1)
  const reopened=loadPage(wx)
  await new Promise(setImmediate)
  assert.equal(reopened.data.stats.count,1)
  wx.setStorageSync=()=>{throw new Error('quota')}
  page.inputTemperature({detail:{value:'25'}})
  await page.updateEnvironment()
  assert.equal(page.data.temperature,25)
  assert.equal(page.data.stats.count,2)
})
test('8个网页语音指令、别名和普通文字', () => {
  const pairs={'分析环境':'analyze','检测环境':'analyze','查看环境':'analyze','查看历史记录':'history','导出数据':'export','打开摄像头':'cameraOn','关闭摄像头':'cameraOff','播放建议':'advice','停止播放':'stop'}
  for(const [text,command] of Object.entries(pairs)) assert.equal(resolveCommand(' '+text+'。 '),command)
  assert.equal(resolveCommand('请帮我分析环境'),'')
  const page=loadPage(mockWx())
  page.executeText('这不是操作指令')
  assert.equal(page.data.ttsText,'这不是操作指令')
  page.executeText('查看历史记录')
  assert.equal(page.data.activeTab,'history')
})
test('停止播报阻止迟到的TTS；隐藏页面丢弃识别结果；授权取消不启动录音', () => {
  const wx=mockWx(), manager={start(){manager.started=true},stop(){}}
  wx.cloud={callFunction(options){ options.success({result:{success:true,credentials:{tmpSecretId:'tmp-id',tmpSecretKey:'tmp-key',token:'tmp-token'},expiredTime:Math.floor(Date.now()/1000)+1800}}) }}
  let synthesis,recognized=0
  const plugin={getRecordRecognitionManager:()=>manager,textToSpeech(options){synthesis=options}}
  settings.enabled=true
  const speech=createSpeech(wx,{recognized(){recognized++}},()=>plugin,()=>({getRecorderSpeechRecognizer:()=>manager}))
  settings.enabled=false
  speech.speak('自定义播报内容')
  speech.stop()
  synthesis.success({retcode:0,filename:'https://example.invalid/stale.mp3'})
  assert.equal(wx.plays.length,0)
  speech.startRecognition()
  assert.equal(manager.started,true)
  speech.suspend()
  manager.OnSentenceEnd({result:{voice_text_str:'分析环境'}})
  manager.OnRecognitionComplete()
  assert.equal(recognized,0)
  let authorize
  wx.authorize=options=>{authorize=options}
  manager.started=false
  speech.startRecognition(); speech.suspend(); authorize.success()
  assert.equal(manager.started,false)
  speech.destroy()
})
test('实时 ASR 使用云函数临时凭证，保留实时文字与最终指令接口', () => {
  const wx=mockWx(), calls=[], states=[], partials=[], recognized=[]
  wx.cloud={callFunction(options){calls.push(options)}}
  const manager={start(params){this.params=params},stop(){this.stopped=true}}
  const speech=createSpeech(wx,{
    recognitionState:state=>states.push(state), partial:text=>partials.push(text),
    recognized:text=>recognized.push(text)
  },()=>null,()=>({getRecorderSpeechRecognizer:()=>manager}))
  assert.equal(speech.available,true)
  speech.startRecognition()
  assert.equal(calls.length,1)
  assert.equal(calls[0].name,'speechRecognition')
  calls[0].success({result:{success:true,credentials:{tmpSecretId:'tmp-id',tmpSecretKey:'tmp-key',token:'tmp-token'},expiredTime:Math.floor(Date.now()/1000)+1800}})
  assert.equal(manager.params.appid,1496785802)
  assert.equal(manager.params.secretid,'tmp-id')
  assert.equal(manager.params.secretkey,'tmp-key')
  assert.equal(manager.params.token,'tmp-token')
  manager.OnRecognitionStart()
  manager.OnRecognitionResultChange({result:{voice_text_str:'查看历'}})
  manager.OnSentenceEnd({result:{voice_text_str:'查看历史记录'}})
  manager.OnRecognitionComplete()
  assert.deepEqual(partials,['查看历','查看历史记录'])
  assert.deepEqual(recognized,['查看历史记录'])
  assert.deepEqual(states,['starting','recording','idle'])
  speech.destroy()
})
test('临时凭证失效或页面离开时不启动实时识别', () => {
  const wx=mockWx(), requests=[], errors=[]
  wx.cloud={callFunction(options){requests.push(options)}}
  const manager={start(){this.started=true},stop(){this.stopped=true}}
  const speech=createSpeech(wx,{error:message=>errors.push(message)},()=>null,()=>({getRecorderSpeechRecognizer:()=>manager}))
  speech.startRecognition()
  requests[0].success({result:{success:true,credentials:{tmpSecretId:'id',tmpSecretKey:'key',token:'token'},expiredTime:Math.floor(Date.now()/1000)-1}})
  assert.equal(manager.started,undefined)
  assert.match(errors[0],/临时语音凭证/)
  speech.startRecognition()
  speech.suspend()
  requests[1].success({result:{success:true,credentials:{tmpSecretId:'id',tmpSecretKey:'key',token:'token'},expiredTime:Math.floor(Date.now()/1000)+1800}})
  assert.equal(manager.started,undefined)
  speech.destroy()
})
test('官方 SDK 适配副本仅转换模块导出，识别入口可加载', () => {
  const original=fs.readFileSync(path.resolve(__dirname,'../vendor/asr.min.js'),'utf8')
  const adapter=fs.readFileSync(path.resolve(__dirname,'../vendor/asr.cjs.js'),'utf8')
  assert.equal(adapter.replace(/\r\n/g,'\n'),original.replace('export class SpeechRecognizer','class SpeechRecognizer')
    .replace('export function getRecorderSpeechRecognizer','function getRecorderSpeechRecognizer')
    .replace(/\r\n/g,'\n')+'\nmodule.exports = { SpeechRecognizer, getRecorderSpeechRecognizer }\n')
  const filename=path.resolve(__dirname,'../vendor/asr.cjs.js')
  const module={exports:{}}
  vm.runInNewContext(adapter,{module,exports:module.exports,wx:{getRecorderManager:()=>({})},console,Math,Date,Promise,Uint8Array,Int8Array,ArrayBuffer,setTimeout,clearTimeout,setInterval,clearInterval})
  assert.equal(typeof module.exports.getRecorderSpeechRecognizer,'function')
  assert.equal(typeof module.exports.SpeechRecognizer,'function')
})
test('WXML 绑定均有实现，注册页与组件齐全，离线音频存在', () => {
  const wx=mockWx(), page=loadPage(wx)
  const wxml=fs.readFileSync(path.resolve(__dirname,'../pages/index/index.wxml'),'utf8')
  for(const match of wxml.matchAll(/bind(?:tap|input|change|error|stop|initdone)="(\w+)"/g)) {
    assert.equal(typeof page[match[1]],'function',match[1])
  }
  const manifest=require('../assets/audio/manifest.js')
  assert.equal(Object.keys(manifest).length,10)
  for(const audio of Object.values(manifest)) {
    const buffer=fs.readFileSync(path.resolve(__dirname,'..',audio.slice(1)))
    assert.equal(buffer.subarray(0,4).toString(),'RIFF')
    assert.ok(buffer.length>10000)
  }
})

