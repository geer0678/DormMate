import subprocess
import sys

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
    check=True
)

print()
print("③ 正在生成环境状态统计图...")
subprocess.run(
    [sys.executable, "analysis/status_chart.py"],
    check=True
)

print()
print("================================")
print("全部分析完成！")
print("================================")
print("已生成：")
print("1. analysis/report.txt")
print("2. analysis/trend.png")
print("3. analysis/status_chart.png")