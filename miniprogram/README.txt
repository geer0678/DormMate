DormMate 实时语音识别替换文件

将本目录中的 utils、vendor、tests 文件夹复制到现有微信小程序项目根目录，合并并覆盖同名文件。
不要把任何永久 SecretId / SecretKey 放进小程序源码。现有 speechRecognition 云函数需保持已部署状态。

真机验证：
1. 微信公众平台将 asr.cloud.tencent.com 加入 request 合法域名和 socket 合法域名；开发者工具项目配置中确认云开发环境可用。
2. 用微信开发者工具打开项目并编译，确认语音交互区的“开始识别”可用。
3. 真机预览，授权麦克风；点“开始识别”，说“查看历史记录”，观察实时文字；点“结束识别”，确认切换到历史记录。
4. 再测“分析环境”和“打开摄像头”；离开页面后确认迟到识别结果不会执行指令。
5. 若无法识别，在开发者工具查看 CloudBase speechRecognition 调用和 asr.cloud.tencent.com 请求/Socket 错误，不要在日志中打印临时密钥。

本地验证：node --test tests/*.test.js，13 项通过。真机语音与云端连接尚未由本环境验证。
