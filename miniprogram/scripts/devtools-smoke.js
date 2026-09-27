const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const automator = require('miniprogram-automator')
const { parseImport } = require('../utils/csv')
const out = path.resolve(__dirname, '../artifacts')
const errors = []
async function run() {
  const mini = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
  mini.on('exception', error => errors.push(error))
  let snapshot
  try {
    snapshot = await mini.evaluate(() => {
      const keys = ['dormmate_history_v3', 'dormmate_auto_speak']
      const present = wx.getStorageInfoSync().keys
      return keys.map(key => ({key, present: present.includes(key), value: wx.getStorageSync(key)}))
    })
    fs.writeFileSync(path.join(out, 'devtools-storage-backup.json'), JSON.stringify(snapshot, null, 2))
    await mini.callWxMethod('setStorageSync', 'dormmate_history_v3', [])
    await mini.callWxMethod('setStorageSync', 'dormmate_auto_speak', false)
    await mini.mockWxMethod('showModal', {confirm:true,cancel:false})
    let page = await mini.reLaunch('/pages/index/index')
    await page.waitFor(700)
    assert.equal(await page.data('stats.count'), 0)
    for (const [temperature,humidity,status] of [[31,78,'偏热偏湿'],[25,55,'正常'],[16,35,'偏冷偏干']]) {
      await page.callMethod('inputTemperature', {detail:{value:String(temperature)}})
      await page.callMethod('inputHumidity', {detail:{value:String(humidity)}})
      const analyze=await page.$('.primary')
      await analyze.tap()
      await page.waitFor(200)
      assert.equal(await page.data('status'), status)
    }
    assert.equal(await page.data('stats.count'), 3)
    await mini.screenshot({path:path.join(out,'environment.png')})
    await page.callMethod('inputTemperature',{detail:{value:''}})
    await page.callMethod('updateEnvironment')
    assert.equal(await page.data('stats.count'),3)
    assert.ok(await page.data('error'))
    await page.callMethod('inputTemperature',{detail:{value:'25'}})
    await page.callMethod('importWebSnapshot')
    await page.waitFor(400)
    if(await page.data('stats.count')!==17) console.log('IMPORT DEBUG',JSON.stringify(await page.data()));
    assert.equal(await page.data('stats.count'),17)
    await page.callMethod('importWebSnapshot')
    await page.waitFor(200)
    assert.equal(await page.data('stats.count'),17)
    await mini.screenshot({path:path.join(out,'history.png')})
    await page.callMethod('exportCSV')
    await page.waitFor(500)
    const file = await page.data('exportedPath')
    assert.ok(file.endsWith('dormmate.csv'))
    const text = await mini.evaluate(filePath => wx.getFileSystemManager().readFileSync(filePath,'utf8'), file)
    assert.equal(parseImport(text).length,17)
    fs.writeFileSync(path.join(out,'verified-export.csv'),text)
    await page.callMethod('exportReport')
    await page.waitFor(300)
    assert.equal(await page.data('exportedName'),'dormmate-report.txt')
    const report = await mini.evaluate(filePath => wx.getFileSystemManager().readFileSync(filePath,'utf8'), await page.data('exportedPath'))
    assert.ok(report.includes('记录总数：17'))
    await page.callMethod('openTab','analysis')
    await page.waitFor(700)
    assert.ok(await page.$('trend-chart'))
    const componentError = await mini.evaluate(() => getCurrentPages()[0].selectComponent('trend-chart').data.chartError)
    assert.equal(componentError,'')
    await mini.screenshot({path:path.join(out,'analysis.png')})
    await mini.pageScrollTo(460)
    await page.waitFor(200)
    await mini.screenshot({path:path.join(out,'distribution.png')})
    await page.callMethod('openTab','interaction')
    await page.waitFor(300)
    await mini.screenshot({path:path.join(out,'interaction.png')})
    assert.equal(await page.data('speechAvailable'),false)
    await page.callMethod('executeText','查看历史记录')
    assert.equal(await page.data('activeTab'),'history')
    await page.callMethod('stopSpeaking')
    page = await mini.reLaunch('/pages/index/index')
    await page.waitFor(400)
    assert.equal(await page.data('stats.count'),17)
    if(errors.length) throw new Error('运行异常：'+JSON.stringify(errors))
    fs.writeFileSync(path.join(out,'devtools-result.json'),JSON.stringify({
      passed:true, date:new Date().toISOString(), checks:[
        '微信开发者工具实际打开页面','三组现场输入','无效输入不保存','网页14条快照导入',
        '重复导入去重','CSV文件真实写入且可重新解析','TXT报告完整生成',
        '原生Canvas绘制无错误','九状态图与交互页截图','指令导航','重新启动恢复历史'
      ], exceptions:errors, hardware:'摄像头、麦克风、音频听感与在线插件仍需真机验证'
    },null,2))
    console.log('Developer-tools smoke test passed; screenshots and results are in artifacts/.')
  } finally {
    try {
      await mini.restoreWxMethod('showModal')
      if(snapshot) {
        for(const entry of snapshot) {
          if(entry.present) await mini.callWxMethod('setStorageSync',entry.key,entry.value)
          else await mini.callWxMethod('removeStorageSync',entry.key)
        }
        await mini.reLaunch('/pages/index/index')
      }
    } finally { mini.disconnect() }
  }
}
run().catch(error=>{console.error(error);process.exitCode=1})

