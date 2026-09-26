import csv
import matplotlib.pyplot as plt
import matplotlib


# ========================================
# 中文显示设置
# ========================================

matplotlib.rcParams["font.sans-serif"] = [
    "Microsoft YaHei",
    "SimHei"
]

matplotlib.rcParams["axes.unicode_minus"] = False


# ========================================
# 状态统计
# ========================================

status_count = {

    "正常": 0,

    "偏冷": 0,
    "偏热": 0,

    "偏干": 0,
    "偏湿": 0,

    "偏冷偏干": 0,
    "偏冷偏湿": 0,

    "偏热偏干": 0,
    "偏热偏湿": 0
}



# ========================================
# 读取 CSV
# ========================================

with open(
    "data/dormmate.csv",
    "r",
    encoding="utf-8-sig"
) as file:


    reader = csv.DictReader(file)


    for row in reader:


        temperature = float(
            row["temperature"]
        )


        humidity = float(
            row["humidity"]
        )



        # ----------------------------
        # 温度分类
        # ----------------------------

        if temperature < 18:

            temp_status = "偏冷"

        elif temperature >= 30:

            temp_status = "偏热"

        else:

            temp_status = "正常"



        # ----------------------------
        # 湿度分类
        # ----------------------------

        if humidity < 40:

            humid_status = "偏干"


        elif humidity >= 75:

            humid_status = "偏湿"


        else:

            humid_status = "正常"



        # ----------------------------
        # 九种组合
        # ----------------------------

        if (
            temp_status == "正常"
            and humid_status == "正常"
        ):

            final_status = "正常"


        elif (
            temp_status == "正常"
            and humid_status == "偏干"
        ):

            final_status = "偏干"


        elif (
            temp_status == "正常"
            and humid_status == "偏湿"
        ):

            final_status = "偏湿"


        elif (
            temp_status == "偏冷"
            and humid_status == "偏干"
        ):

            final_status = "偏冷偏干"


        elif (
            temp_status == "偏冷"
            and humid_status == "偏湿"
        ):

            final_status = "偏冷偏湿"


        elif (
            temp_status == "偏热"
            and humid_status == "偏干"
        ):

            final_status = "偏热偏干"


        elif (
            temp_status == "偏热"
            and humid_status == "偏湿"
        ):

            final_status = "偏热偏湿"


        elif temp_status == "偏冷":

            final_status = "偏冷"


        elif temp_status == "偏热":

            final_status = "偏热"


        else:

            final_status = "正常"



        status_count[final_status] += 1



# ========================================
# 绘图数据
# ========================================

status_names = list(
    status_count.keys()
)


status_values = list(
    status_count.values()
)



# ========================================
# 创建柱状图
# ========================================

plt.figure(
    figsize=(10,6)
)


bars = plt.bar(
    status_names,
    status_values
)



plt.title(
    "DormMate 宿舍环境九状态统计",
    fontsize=16
)


plt.xlabel(
    "环境状态"
)


plt.ylabel(
    "出现次数"
)



plt.xticks(
    rotation=45
)



# 显示数字

for bar in bars:

    height = bar.get_height()

    plt.text(
        bar.get_x()
        + bar.get_width()/2,

        height,

        str(int(height)),

        ha="center",

        va="bottom"
    )



plt.tight_layout()



# 保存

plt.savefig(
    "analysis/status_chart.png",
    dpi=300
)



plt.close()



print(
    "九状态统计图生成成功！"
)

print(
    "保存位置：analysis/status_chart.png"
)