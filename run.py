import subprocess
import sys
import os

print("================================")
print("   DormMate 宿舍环境分析系统")
print("================================")
print()

print("① 正在生成数据分析报告...")
subprocess.run(
    [sys.executable, "analysis/analysis.py"],
    check=True
)

print()
print("② 正在生成温湿度趋势图...")
subprocess.run(
    [sys.executable, "analysis/chart.py"],
    check=True,
    env={**os.environ, "MPLBACKEND": "Agg"}
)

print()
print("③ 正在生成环境状态统计图...")
subprocess.run(
    [sys.executable, "analysis/status_chart.py"],
    check=True,
    env={**os.environ, "MPLBACKEND": "Agg"}
)

print()
print("④ 正在生成 Task C 历史异常分析...")
subprocess.run([sys.executable, "analysis/task_c.py"], check=True)

print()
print("================================")
print("全部分析完成！")
print("================================")
print("已生成：")
print("1. analysis/report.txt")
print("2. analysis/trend.png")
print("3. analysis/status_chart.png")
print("4. analysis/task_c_summary.json / task_c_results.csv / Task C 图表")
