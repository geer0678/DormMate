const config = {
  nodeId: 'dorm-a',
  webUrl: 'ws://127.0.0.1:9001',
  miniUrl: 'wx://127.0.0.1:9001',
  topicFilter: 'dormmate/+/env'
}
if (typeof module !== 'undefined' && module.exports) module.exports = config
if (typeof window !== 'undefined') window.DormMateMqttConfig = config
