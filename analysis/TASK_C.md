# Task C 离线历史异常分析

运行：在仓库根目录安装 `requirements.txt`，执行 `node analysis/generate_task_c_samples.js`（仅在需要重建教学样本时），再执行 `python run.py`。`run.py` 保留 M2 报告和图表，并追加 Task C 结果。Dashboard 本地 HTTP 页面读取 `analysis/task_c_summary.json`；完整结果在 `analysis/report.html#task-c-analysis`。

`data/task_c_history.csv` 是 **40 条明确标记为“模拟历史样本”的 dorm-a 训练基线**；`data/task_c_evaluation.csv` 是 **12 条明确标记为“模拟待测样本”的新数据**。两文件均由固定脚本生成，温湿度和时间可复现，`status` 由 `miniprogram/utils/dormmate.js` 唯一九状态函数填写。它们不是硬件传感器数据，也不写入 CloudBase。现有 M2 `data/dormmate.csv` 只有 9 条且没有 `nodeId`，不能作为单宿舍模型训练基线。线上共享历史存在软件 MQTT 演示数据，当前没有把它无差别纳入训练。

Python 使用每个节点各自的训练历史，对**未进入训练基线**的待测记录同时运行现有九状态规则和 `IsolationForest(n_estimators=100, contamination="auto", random_state=42)`。仅用 temperature、humidity 两个特征。少于 30 条训练历史的节点显示“历史样本不足，暂不进行 ML 分析”；当前 dorm-b/c 正是此状态。更换 CSV 后可重新运行，绝不把不同宿舍合并训练。ML `decision_function` 小于 0 判异常；它是相对历史分布的偏离分数，不是环境安全程度。

`analysis/task_c_results.csv` 给出每条待测记录的 Rule 状态、Rule 是否异常、ML 是否异常、分数、四类结果；`analysis/task_c_summary.json` 是 Dashboard 的只读摘要；`analysis/task_c_scatter.png` 和 `analysis/task_c_comparison.png` 是散点图和四类数量图。模型输出是辅助信息，不回写正式共享历史的 `status`。请重点复核报告中 Rule 正常而 ML 异常的例子：有限且人为分布的模拟训练历史可能让 ML 对规则范围内的数值过于敏感，不能据此宣称 ML 更正确。
