import csv

# ========================================
# DormMate M2 数据分析（九状态版本）
# ========================================

# 初始化统计变量
total_temperature = 0
max_temperature = -999
min_temperature = 999

total_humidity = 0
max_humidity = -999
min_humidity = 999

status_counts = {
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

attention_records = []
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

        temperature = float(clean_row["temperature"])
        humidity = float(clean_row["humidity"])

        advice = clean_row.get(
            "advice",
            "暂无建议"
        )

        # 温度统计
        total_temperature += temperature

        if temperature > max_temperature:
            max_temperature = temperature

        if temperature < min_temperature:
            min_temperature = temperature

        # 湿度统计
        total_humidity += humidity

        if humidity > max_humidity:
            max_humidity = humidity

        if humidity < min_humidity:
            min_humidity = humidity


        # ========================================
        # 九状态判断
        # ========================================

        if temperature < 18:
            temp_status = "偏冷"

        elif temperature >= 30:
            temp_status = "偏热"

        else:
            temp_status = "正常"


        if humidity < 40:
            humidity_status = "偏干"

        elif humidity >= 75:
            humidity_status = "偏湿"

        else:
            humidity_status = "正常"


        if temp_status == "正常" and humidity_status == "正常":
            status = "正常"

        elif temp_status == "偏冷" and humidity_status == "偏干":
            status = "偏冷偏干"

        elif temp_status == "偏冷" and humidity_status == "偏湿":
            status = "偏冷偏湿"

        elif temp_status == "偏热" and humidity_status == "偏干":
            status = "偏热偏干"

        elif temp_status == "偏热" and humidity_status == "偏湿":
            status = "偏热偏湿"

        elif temp_status == "偏冷":
            status = "偏冷"

        elif temp_status == "偏热":
            status = "偏热"

        elif humidity_status == "偏干":
            status = "偏干"

        elif humidity_status == "偏湿":
            status = "偏湿"

        else:
            status = "正常"


        status_counts[status] += 1


        # 保存关注记录
        if status != "正常":

            attention_records.append(
                {
                    "time": clean_row.get("time", ""),
                    "temperature": temperature,
                    "humidity": humidity,
                    "status": status,
                    "advice": advice
                }
            )

        count += 1


# ========================================
# 2. 空数据检查
# ========================================

if count == 0:

    print("CSV中没有数据，无法分析")

    raise SystemExit


# ========================================
# 3. 统计计算
# ========================================

average_temperature = total_temperature / count
average_humidity = total_humidity / count

abnormal_count = count - status_counts["正常"]

abnormal_rate = abnormal_count / count * 100


# ========================================
# 4. TXT报告
# ========================================

report = f"""
DormMate 宿舍环境数据分析报告
============================

记录数量：
{count}

【温度统计】

平均温度：
{average_temperature:.2f} ℃

最高温度：
{max_temperature} ℃

最低温度：
{min_temperature} ℃


【湿度统计】

平均湿度：
{average_humidity:.2f} %

最高湿度：
{max_humidity} %

最低湿度：
{min_humidity} %


【九状态统计】

"""

for key, value in status_counts.items():

    report += f"{key}：{value} 次\n"


report += f"""

【异常情况】

异常次数：
{abnormal_count} 次

异常占比：
{abnormal_rate:.2f}%


【重点关注记录】

"""


for item in attention_records:

    report += f"""
时间：
{item['time']}

温度：
{item['temperature']} ℃

湿度：
{item['humidity']} %

状态：
{item['status']}

建议：
{item['advice']}

----------------------------

"""


print(report)


with open(
    "analysis/report.txt",
    "w",
    encoding="utf-8"
) as file:

    file.write(report)


# ========================================
# 5. 生成 HTML 报告
# ========================================

attention_html = ""

if len(attention_records) == 0:

    attention_html = """
<tr>
<td colspan="5">
暂无异常记录
</td>
</tr>
"""

else:

    for item in attention_records:

        attention_html += f"""
<tr>
<td>{item['time']}</td>
<td>{item['temperature']} ℃</td>
<td>{item['humidity']} %</td>
<td>{item['status']}</td>
<td>{item['advice']}</td>
</tr>
"""


status_html = ""

for key, value in status_counts.items():

    status_html += f"""
<tr>
<td>{key}</td>
<td>{value}</td>
</tr>
"""


html_report = f"""
<!DOCTYPE html>

<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<title>
DormMate 数据分析报告
</title>


<style>

body {{

font-family:
Arial,
"Microsoft YaHei",
sans-serif;

max-width:
1100px;

margin:
40px auto;

padding:
20px;

background:
#f5f7fb;

color:
#333;

}}


h1 {{

text-align:center;

color:#2563eb;

}}


.subtitle {{

text-align:center;

color:#666;

margin-bottom:30px;

}}


.section {{

background:white;

padding:25px;

margin-bottom:25px;

border-radius:12px;

box-shadow:
0 4px 12px rgba(0,0,0,0.08);

}}


.summary {{

display:grid;

grid-template-columns:
repeat(4,1fr);

gap:15px;

}}


.card {{

background:white;

padding:20px;

border-radius:12px;

text-align:center;

}}


.number {{

font-size:25px;

font-weight:bold;

color:#2563eb;

}}


table {{

width:100%;

border-collapse:collapse;

}}


th,
td {{

padding:12px;

border-bottom:
1px solid #ddd;

text-align:center;

}}


th {{

background:#f3f4f6;

}}


img {{

width:100%;

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

<div>
数据记录
</div>

</div>



<div class="card">

<div class="number">
{average_temperature:.2f}℃
</div>

<div>
平均温度
</div>

</div>



<div class="card">

<div class="number">
{average_humidity:.2f}%
</div>

<div>
平均湿度
</div>

</div>



<div class="card">

<div class="number">
{abnormal_rate:.2f}%
</div>

<div>
异常占比
</div>

</div>


</div>





<div class="section">

<h2>
温湿度统计
</h2>


<table>

<tr>
<th>项目</th>
<th>平均值</th>
<th>最高值</th>
<th>最低值</th>
</tr>


<tr>

<td>
温度
</td>

<td>
{average_temperature:.2f}℃
</td>

<td>
{max_temperature}℃
</td>

<td>
{min_temperature}℃
</td>

</tr>


<tr>

<td>
湿度
</td>

<td>
{average_humidity:.2f}%
</td>

<td>
{max_humidity}%
</td>

<td>
{min_humidity}%
</td>

</tr>


</table>

</div>





<div class="section">

<h2>
九状态统计
</h2>


<table>

<tr>

<th>
状态
</th>

<th>
次数
</th>

</tr>


{status_html}


</table>

</div>





<div class="section">

<h2>
重点关注记录
</h2>


<table>

<tr>

<th>
时间
</th>

<th>
温度
</th>

<th>
湿度
</th>

<th>
状态
</th>

<th>
建议
</th>

</tr>


{attention_html}


</table>

</div>





<div class="section">

<h2>
温湿度变化趋势
</h2>


<img
src="trend.png"
alt="trend"
/>

</div>





<div class="section">

<h2>
环境状态统计图
</h2>


<img
src="status_chart.png"
alt="status"
/>

</div>



</body>

</html>
"""


# ========================================
# 6. 保存 HTML
# ========================================


with open(
    "analysis/report.html",
    "w",
    encoding="utf-8"
) as file:

    file.write(html_report)


print("分析完成！")
print("TXT报告：analysis/report.txt")
print("HTML报告：analysis/report.html")