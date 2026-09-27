// Run only after adding WechatSI in your own WeChat mini-program account.
const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const version = process.argv[2]
if (version !== 'off' && !/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('用法：node scripts/configure-voice.js 后台显示的版本号\n关闭：node scripts/configure-voice.js off')
  process.exit(1)
}
const appPath = path.join(root, 'app.json')
const app = JSON.parse(fs.readFileSync(appPath, 'utf8').replace(/^\uFEFF/, ''))
if (version === 'off') {
  if (app.plugins) { delete app.plugins.WechatSI; if (!Object.keys(app.plugins).length) delete app.plugins }
} else {
  app.plugins = { ...(app.plugins || {}), WechatSI: { version, provider: 'wx069ba97219f66d99' } }
}
fs.writeFileSync(appPath, JSON.stringify(app, null, 2) + '\n')
fs.writeFileSync(path.join(root, 'config/speech.js'), 'module.exports = { enabled: ' + (version !== 'off') + ' }\n')
console.log(version === 'off' ? '已关闭在线语音，离线建议播报继续可用。' : '已配置 WechatSI ' + version + '，请在微信开发者工具重新编译并真机检查。')

