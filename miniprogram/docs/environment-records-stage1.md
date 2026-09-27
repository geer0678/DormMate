# environment_records：第 1 阶段部署与验收

云端集合由 `environmentRecords` 云函数作为唯一写入入口。客户端访问数据库的目标安全规则为：

```json
{
  "read": "auth != null",
  "write": false
}
```

## CloudBase 控制台配置

在项目绑定的环境 `cloudbase-d6g6fprx873111e6a` 中：

1. 创建文档集合 `environment_records`（如果尚不存在）。
2. 集合权限切换为安全规则，逐字设置为上面的读写规则。
3. 在集合的索引管理里新增 `recordId` 升序**唯一索引**，索引名 `recordId_unique`。此数据库约束是并发幂等的最终保障，不能由云函数里的预查替代。
4. 新增非唯一组合索引 `createdAt` 降序、`recordId` 升序，供全量分页稳定排序使用。
5. 在云函数权限控制中应用 `cloudbase/functions.security-rules.json`：默认拒绝客户端调用，只允许已认证用户调用 `environmentRecords`；保留 `speechRecognition` 的已认证调用权限，不改变现有语音云函数的功能。保持新函数 `openapi` 调用列表为空。
6. 部署 `cloudfunctions/environmentRecords`，再确认控制台显示唯一索引已就绪后，才进入客户端接入阶段。

集合文档保留 CloudBase 自动 `_id`，业务字段为 `recordId`、`temperature`、`humidity`、`status`、`advice`、`source`、`createdAt`、`updatedAt`、`schemaVersion`。新增时状态和建议由云函数计算，时间由 `db.serverDate()` 生成。重复插入若命中唯一索引冲突，云函数按 `recordId` 读取已存在文档并返回 `{ success: true, duplicated: true, record }`。

## 本地验收

在小程序仓库执行 `npm test`。测试验证服务器规则输入点、字段校验、伪造状态/建议不被采信、唯一键冲突路径回读原文档，以及原有迁移、CSV、ASR 和页面回归。数据库唯一索引的实际存在需在 CloudBase 控制台确认；本地模拟测试不能替代该项云端验收。
