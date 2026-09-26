# AGENTS.md

本文件记录当前 DormMate 项目的实际结构和开发约定。DormMate 是宿舍环境监测页面，并提供基于 CSV 的离线数据分析与图表生成。

## 技术栈与入口

- 前端使用原生 HTML / CSS / JavaScript，没有前端框架或构建步骤。
- `index.html` 是网页入口，加载 `style.css` 和 `script.js`。
- Python 用于读取 CSV、生成数据分析报告和图表；`run.py` 是分析流程入口。
- 绘图脚本依赖第三方库 `matplotlib`；其他已使用的 Python 模块来自标准库。

## 目录结构

```text
.
├── index.html                 # 网页结构与资源引用
├── script.js                  # 主要网页交互、浏览器本地记录和 CSV 导出
├── style.css                  # 页面样式
├── run.py                     # 顺序执行 Python 分析及绘图脚本
├── data/
│   └── dormmate.csv           # Python 分析的数据源
└── analysis/
    ├── analysis.py            # 统计分析，生成 report.txt 和 report.html
    ├── chart.py               # 生成温湿度趋势图 trend.png
    ├── status_chart.py        # 生成环境状态图 status_chart.png
    ├── report.txt
    ├── report.html
    ├── trend.png
    └── status_chart.png       # 以上四项为分析输出
```

## 运行方式

所有命令均在项目根目录执行，因为 Python 脚本使用相对路径读取 `data/dormmate.csv` 并写入 `analysis/`。

1. 网页：直接在浏览器中打开 `index.html`。如需在本地服务器下使用页面，可运行 `python -m http.server 8000`，然后访问 `http://localhost:8000/`。摄像头、语音等功能取决于浏览器支持和权限。
2. Python 分析：先安装 `matplotlib`（例如 `python -m pip install matplotlib`），再运行 `python run.py`。该命令会重新生成 `analysis/report.txt`、`analysis/report.html`、`analysis/trend.png` 和 `analysis/status_chart.png`。绘图脚本会调用 `plt.show()`，可能打开图表窗口。

网页历史记录保存在浏览器 `localStorage`，网页导出的 CSV 不会自动写入 `data/dormmate.csv`；Python 分析只读取后者。

## 检查与测试

- 当前没有 `package.json`、依赖清单或自动化测试框架。
- 网页手动检查：打开页面，输入温湿度并执行分析，确认结果、历史记录、刷新后的本地记录和 CSV 导出正常；有条件时再检查摄像头与语音功能。
- Python 手动检查：运行 `python run.py`，确认命令成功结束，并检查四个分析输出文件。修改 CSV 后，可核对报告统计值和图表是否反映新数据。
- 可用 `python -m py_compile run.py analysis/analysis.py analysis/chart.py analysis/status_chart.py` 检查 Python 语法；此命令可能生成 `__pycache__`。

## 开发注意事项

- 保持网页 `localStorage` 数据与 Python CSV 数据源的区别清晰。
- 修改 CSV 读取逻辑时注意编码：`analysis.py` 和 `chart.py` 使用 `utf-8-sig`，`status_chart.py` 使用 `gb18030`。
- 当前目录不是 Git 仓库；如需分支开发，应先确认实际仓库位置或初始化方式。
