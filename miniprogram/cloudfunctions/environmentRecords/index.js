const cloud = require('wx-server-sdk')
const { createEnvironmentRecordsHandler } = require('./core')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = createEnvironmentRecordsHandler(cloud)
