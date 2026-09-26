import csv
import html

# ========================================
# DormMate M2 数据分析
# ========================================

# 温度统计
total_temperature = 0
max_temperature = -999
min_temperature = 999

# 湿度统计
total_humidity = 0
max_humidity = -999
min_humidity = 999

# 状态统计
normal_count = 0
hot_count = 0
cold_count = 0
humid_count = 0

# 总记录数
count = 0


# ========================================
# 1. 读取 CSV
# ========================================

with open(
    "data/dormmate.csv",
    "r",
    encoding="utf-8-sig"
) as file:

    reader = csv.DictReader(file)

    for row in reader:

        # 清理表头，避免 BOM 和空格问题
        clean_row = {}

        for key, value in row.items():

            if key is not None:

                clean_key = (
                    key
                    .replace("\ufeff", "")
                    .strip()
                )

                clean_row[clean_key] = (
                    value.strip()
                    if value
                    else value
                )

        temperature = int(
            clean_row["temperature"]
        )

        humidity = int(
            clean_row["humidity"]
        )

        # --------------------------------
        # 温度统计
        # --------------------------------

        total_temperature += temperature

        if temperature > max_temperature:
            max_temperature = temperature

        if temperature < min_temperature:
            min_temperature = temperature


        # --------------------------------
        # 湿度统计
        # --------------------------------

        total_humidity += humidity

        if humidity > max_humidity:
            max_humidity = humidity

        if humidity < min_humidity:
            min_humidity = humidity


        # --------------------------------
        # 使用与网页一致的规则判断状态
        # --------------------------------

        if temperature < 18:

            cold_count += 1

        elif temperature >= 30:

            hot_count += 1

        elif humidity >= 75:

            humid_count += 1

        else:

            normal_count += 1


        count += 1


# ========================================
# 2. 防止 CSV 没有数据
# ========================================

if count == 0:

    print("CSV 中没有数据，无法分析。")

    raise SystemExit


# ========================================
# 3. 计算统计结果
# ========================================

average_temperature = (
    total_temperature / count
)

average_humidity = (
    total_humidity / count
)

abnormal_count = (
    hot_count
    + cold_count
    + humid_count
)

abnormal_rate = (
    abnormal_count
    / count
    * 100
)


# ========================================
# 4. 生成 TXT 报告
# ========================================

report = f"""
DormMate 宿舍环境数据分析报告
============================

记录数量：{count}

【温度统计】
平均温度：{average_temperature:.2f} ℃
最高温度：{max_temperature} ℃
最低温度：{min_temperature} ℃

【湿度统计】
平均湿度：{average_humidity:.2f} %
最高湿度：{max_humidity} %
最低湿度：{min_humidity} %

【环境状态统计】
正常：{normal_count} 次
偏热：{hot_count} 次
偏冷：{cold_count} 次
偏湿：{humid_count} 次

【异常情况】
异常总次数：{abnormal_count} 次
异常占比：{abnormal_rate:.2f} %
"""

print(report)

with open(
    "analysis/report.txt",
    "w",
    encoding="utf-8"
) as report_file:

    report_file.write(report)


# ========================================
# 5. 生成 HTML 数据分析报告
# ========================================

html_report = f"""
<!DOCTYPE html>

<html lang="zh-CN">

<head>

    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>DormMate 数据分析报告</title>

    <style>

        body {{
            font-family:
                Arial,
                "Microsoft YaHei",
                sans-serif;

            max-width: 1000px;

            margin: 40px auto;

            padding: 20px;

            background-color: #f5f7fb;

            color: #333;
        }}

        h1 {{
            text-align: center;

            color: #2563eb;
        }}

        .subtitle {{
            text-align: center;

            color: #666;

            margin-bottom: 30px;
        }}

        .summary {{
            display: grid;

            grid-template-columns:
                repeat(4, 1fr);

            gap: 15px;

            margin-bottom: 30px;
        }}

        .card {{
            background: white;

            padding: 20px;

            border-radius: 12px;

            text-align: center;

            box-shadow:
                0 4px 12px
                rgba(0, 0, 0, 0.08);
        }}

        .number {{
            font-size: 25px;

            font-weight: bold;

            color: #2563eb;
        }}

        .label {{
            margin-top: 8px;

            color: #666;
        }}

        .section {{
            background: white;

            padding: 25px;

            margin-bottom: 25px;

            border-radius: 12px;

            box-shadow:
                0 4px 12px
                rgba(0, 0, 0, 0.08);
        }}

        table {{
            width: 100%;

            border-collapse: collapse;
        }}

        th,
        td {{
            padding: 12px;

            border-bottom:
                1px solid #ddd;

            text-align: center;
        }}

        th {{
            background-color: #f3f4f6;
        }}

        img {{
            width: 100%;

            height: auto;
        }}

        @media (max-width: 700px) {{

            .summary {{
                grid-template-columns:
                    repeat(2, 1fr);
            }}

        }}

    </style>

</head>


<body>

    <h1>
        DormMate 宿舍环境数据分析报告
    </h1>

    <p class="subtitle">
        基于 CSV 宿舍环境记录自动生成
    </p>


    <div class="summary">

        <div class="card">

            <div class="number">
                {count}
            </div>

            <div class="label">
                数据记录
            </div>

        </div>


        <div class="card">

            <div class="number">
                {average_temperature:.2f} ℃
            </div>

            <div class="label">
                平均温度
            </div>

        </div>


        <div class="card">

            <div class="number">
                {average_humidity:.2f} %
            </div>

            <div class="label">
                平均湿度
            </div>

        </div>


        <div class="card">

            <div class="number">
                {abnormal_rate:.2f} %
            </div>

            <div class="label">
                异常占比
            </div>

        </div>

    </div>


    <div class="section">

        <h2>温湿度统计</h2>

        <table>

            <tr>
                <th>项目</th>
                <th>平均值</th>
                <th>最高值</th>
                <th>最低值</th>
            </tr>

            <tr>
                <td>温度</td>
                <td>{average_temperature:.2f} ℃</td>
                <td>{max_temperature} ℃</td>
                <td>{min_temperature} ℃</td>
            </tr>

            <tr>
                <td>湿度</td>
                <td>{average_humidity:.2f} %</td>
                <td>{max_humidity} %</td>
                <td>{min_humidity} %</td>
            </tr>

        </table>

    </div>


    <div class="section">

        <h2>环境状态统计</h2>

        <table>

            <tr>
                <th>状态</th>
                <th>出现次数</th>
            </tr>

            <tr>
                <td>正常</td>
                <td>{normal_count}</td>
            </tr>

            <tr>
                <td>偏热</td>
                <td>{hot_count}</td>
            </tr>

            <tr>
                <td>偏冷</td>
                <td>{cold_count}</td>
            </tr>

            <tr>
                <td>偏湿</td>
                <td>{humid_count}</td>
            </tr>

        </table>

    </div>


    <div class="section">

        <h2>温湿度变化趋势</h2>

        <img
            src="trend.png"
            alt="DormMate 温湿度变化趋势图"
        >

    </div>


    <div class="section">

        <h2>环境状态统计图</h2>

        <img
            src="status_chart.png"
            alt="DormMate 环境状态统计图"
        >

    </div>

</body>

</html>
"""


# ========================================
# 6. 保存 HTML 报告
# ========================================

with open(
    "analysis/report.html",
    "w",
    encoding="utf-8"
) as html_file:

    html_file.write(html_report)


print("分析完成！")
print("TXT 报告：analysis/report.txt")
print("HTML 报告：analysis/report.html")