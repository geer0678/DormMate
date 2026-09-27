const cloud = require("wx-server-sdk")
const tencentcloud = require("tencentcloud-sdk-nodejs")

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const StsClient = tencentcloud.sts.v20180813.Client

exports.main = async () => {
  try {
    const secretId = process.env.ASR_SECRET_ID
    const secretKey = process.env.ASR_SECRET_KEY

    if (!secretId || !secretKey) {
      return {
        success: false,
        code: "MISSING_CREDENTIALS",
        error: "未配置 ASR_SECRET_ID 或 ASR_SECRET_KEY"
      }
    }

    const client = new StsClient({
      credential: {
        secretId,
        secretKey
      },
      region: "ap-guangzhou",
      profile: {
        httpProfile: {
          endpoint: "sts.tencentcloudapi.com"
        }
      }
    })

    const policy = {
      version: "2.0",
      statement: [
        {
          effect: "allow",
          action: ["name/asr:*"],
          resource: "*"
        }
      ]
    }

    const params = {
      Name: "dormmateasr",
      Policy: encodeURIComponent(JSON.stringify(policy)),
      DurationSeconds: 1800
    }

    const result = await client.GetFederationToken(params)

    if (!result || !result.Credentials) {
      throw new Error("腾讯云 STS 未返回临时凭证")
    }

    return {
      success: true,
      credentials: {
        tmpSecretId: result.Credentials.TmpSecretId,
        tmpSecretKey: result.Credentials.TmpSecretKey,
        token: result.Credentials.Token
      },
      expiredTime: result.ExpiredTime,
      expiration: result.Expiration || ""
    }
  } catch (error) {
    console.error("获取 DormMate ASR 临时凭证失败:", error)

    return {
      success: false,
      code: error.code || "UNKNOWN_ERROR",
      error: error.message || String(error)
    }
  }
}