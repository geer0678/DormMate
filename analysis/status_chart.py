import csv
import matplotlib.pyplot as plt
import matplotlib

# 设置中文字体
matplotlib.rcParams["font.sans-serif"] = ["Microsoft YaHei", "SimHei"]
matplotlib.rcParams["axes.unicode_minus"] = False

# 四种状态的次数
normal_count = 0
hot_count = 0
cold_count = 0
humid_count = 0

# 读取 CSV
with open("data/dormmate.csv", "r", encoding="gb18030") as file:
    reader = csv.DictReader(file)

    for row in reader:
        temperature = int(row["temperature"])
        humidity = int(row["humidity"])

        # 按照和 analysis.py 相同的规则判断
        if temperature > 30:
            hot_count += 1

        elif temperature < 18:
            cold_count += 1

        elif humidity > 75:
            humid_count += 1

        else:
            normal_count += 1

# 准备画图的数据
status_names = ["正常", "偏热", "偏冷", "偏湿"]

status_counts = [
    normal_count,
    hot_count,
    cold_count,
    humid_count
]

# 创建柱状图
plt.figure(figsize=(8, 6))

bars = plt.bar(status_names, status_counts)

# 标题
plt.title("DormMate 宿舍环境状态统计", fontsize=16)

# 坐标名称
plt.xlabel("环境状态")
plt.ylabel("出现次数")

# 在每根柱子上显示具体数字
for bar in bars:
    height = bar.get_height()

    plt.text(
        bar.get_x() + bar.get_width() / 2,
        height,
        str(int(height)),
        ha="center",
        va="bottom",
        fontsize=12
    )

# 让纵轴只显示整数
plt.yticks(range(0, max(status_counts) + 2))

# 网格
plt.grid(axis="y", alpha=0.3)

# 自动调整布局
plt.tight_layout()

# 保存图片
plt.savefig("analysis/status_chart.png", dpi=300)

# 显示图片
plt.show()

print("状态统计图生成成功！")
print("保存位置：analysis/status_chart.png")