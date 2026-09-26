import csv
import matplotlib.pyplot as plt

# =========================
# 中文显示设置
# =========================

plt.rcParams["font.sans-serif"] = ["Microsoft YaHei"]
plt.rcParams["axes.unicode_minus"] = False


# =========================
# 准备数据
# =========================

times = []
temperatures = []
humidities = []


# =========================
# 读取 CSV
# =========================

with open("data/dormmate.csv", "r", encoding="utf-8-sig") as file:

    reader = csv.DictReader(file)

    for row in reader:

        # 清理 CSV 表头中的 BOM 和空格
        clean_row = {}

        for key, value in row.items():

            if key is not None:

                clean_key = key.replace("\ufeff", "").strip()

                clean_row[clean_key] = (
                    value.strip()
                    if value
                    else value
                )

        # 读取每一条数据
        times.append(clean_row["time"])

        temperatures.append(
            int(clean_row["temperature"])
        )

        humidities.append(
            int(clean_row["humidity"])
        )


# =========================
# 创建图表
# =========================

plt.figure(figsize=(12, 7))


# =========================
# 绘制温度折线
# =========================

plt.plot(
    times,
    temperatures,
    marker="o",
    label="温度（℃）"
)


# =========================
# 绘制湿度折线
# =========================

plt.plot(
    times,
    humidities,
    marker="o",
    label="湿度（%）"
)


# =========================
# 图表标题和坐标
# =========================

plt.title(
    "DormMate 宿舍温湿度变化趋势"
)

plt.xlabel("时间")

plt.ylabel("数值")


# =========================
# 图例和网格
# =========================

plt.legend()

plt.grid(alpha=0.3)


# =========================
# 调整时间标签
# =========================

plt.xticks(
    rotation=30
)


# =========================
# 自动调整布局
# =========================

plt.tight_layout()


# =========================
# 保存图片
# =========================

plt.savefig(
    "analysis/trend.png",
    dpi=300,
    bbox_inches="tight"
)

plt.close()


# =========================
# 输出提示
# =========================

print("趋势图生成成功！")
print("读取数据数量：", len(times))
print("保存位置：analysis/trend.png")