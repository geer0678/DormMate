App({
  globalData: {},

  onLaunch() {
    wx.cloud.init({
      env: "cloudbase-d6g6fprx873111e6a",
      traceUser: true
    })

    console.log("DormMate 云开发初始化成功")
  }
})