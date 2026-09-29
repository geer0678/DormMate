"""Task C: offline, node-isolated Rule vs Isolation Forest analysis."""
from __future__ import annotations

import csv
import html
import json
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from sklearn.ensemble import IsolationForest

ROOT = Path(__file__).resolve().parent.parent
NODES = ("dorm-a", "dorm-b", "dorm-c")
MIN_TRAINING_SAMPLES = 30
FIELDS = ("nodeId", "temperature", "humidity", "status", "time", "source")
CATEGORIES = ("both_normal", "both_abnormal", "rule_only", "ml_only")
CATEGORY_LABELS = {
    "both_normal": "共同正常", "both_abnormal": "共同异常",
    "rule_only": "仅 Rule 异常", "ml_only": "仅 ML 异常",
}


def read_records(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        if not reader.fieldnames or not set(FIELDS).issubset(reader.fieldnames):
            raise ValueError(f"{path}: 缺少必要 CSV 字段")
        records = []
        for line, row in enumerate(reader, 2):
            try:
                temperature, humidity = float(row["temperature"]), float(row["humidity"])
                if not (0 <= temperature <= 50 and 0 <= humidity <= 100):
                    raise ValueError("温湿度超出 DormMate 有效范围")
                if row["nodeId"] not in NODES or not row["time"] or not row["source"]:
                    raise ValueError("无效节点、时间或来源")
            except (TypeError, ValueError) as error:
                raise ValueError(f"{path}:{line}: {error}") from error
            records.append({**row, "temperature": temperature, "humidity": humidity})
    return records


def shared_rule_status(records: list[dict]) -> list[str]:
    if not records:
        return []
    result = subprocess.run(
        ["node", str(ROOT / "analysis" / "task_c_rule.js")],
        input=json.dumps(records, ensure_ascii=False), text=True, capture_output=True,
        check=True, cwd=ROOT, encoding="utf-8",
    )
    statuses = json.loads(result.stdout)
    if len(statuses) != len(records):
        raise ValueError("共享规则输出条数与输入不一致")
    return statuses


def compare(rule_abnormal: bool, ml_anomaly: bool) -> str:
    if rule_abnormal and ml_anomaly:
        return "both_abnormal"
    if rule_abnormal:
        return "rule_only"
    if ml_anomaly:
        return "ml_only"
    return "both_normal"


def analyze(history: list[dict], evaluation: list[dict], minimum: int = MIN_TRAINING_SAMPLES) -> dict:
    training_keys = {(r["nodeId"], r["time"]) for r in history}
    if any((r["nodeId"], r["time"]) in training_keys for r in evaluation):
        raise ValueError("待判断记录不能同时进入训练历史")
    training_by_node = defaultdict(list)
    evaluation_by_node = defaultdict(list)
    for record in history:
        training_by_node[record["nodeId"]].append(record)
    for record in evaluation:
        evaluation_by_node[record["nodeId"]].append(record)
    evaluated = []
    nodes = {}
    for node_id in NODES:
        training = training_by_node[node_id]
        candidates = evaluation_by_node[node_id]
        available = len(training) >= minimum and bool(candidates)
        node_rows = []
        if available:
            model = IsolationForest(n_estimators=100, contamination="auto", random_state=42)
            model.fit([[r["temperature"], r["humidity"]] for r in training])
            features = [[r["temperature"], r["humidity"]] for r in candidates]
            predictions = model.predict(features)
            scores = model.decision_function(features)
            rule_statuses = shared_rule_status(candidates)
            for record, status, prediction, score in zip(candidates, rule_statuses, predictions, scores):
                rule_abnormal, ml_anomaly = status != "正常", bool(prediction == -1)
                node_rows.append({**record, "rule_status": status, "rule_abnormal": rule_abnormal,
                                  "ml_anomaly": ml_anomaly, "anomaly_score": float(score),
                                  "comparison": compare(rule_abnormal, ml_anomaly)})
        counts = Counter(row["comparison"] for row in node_rows)
        nodes[node_id] = {
            "nodeId": node_id, "trainingSamples": len(training), "evaluationSamples": len(candidates),
            "analyzedSamples": len(node_rows), "available": available,
            "message": "分析完成" if available else "历史样本不足，暂不进行 ML 分析。" if len(training) < minimum
                       else "暂无待判断的新数据。",
            "ruleAbnormal": sum(row["rule_abnormal"] for row in node_rows),
            "mlAbnormal": sum(row["ml_anomaly"] for row in node_rows),
            "counts": {category: counts[category] for category in CATEGORIES},
        }
        evaluated.extend(node_rows)
    return {"generatedAt": datetime.now(timezone.utc).isoformat(),
            "dataSource": "独立 CSV：模拟历史样本 / 模拟待测样本；非真实传感器，未写入 CloudBase",
            "model": {"name": "IsolationForest", "features": ["temperature", "humidity"],
                      "n_estimators": 100, "contamination": "auto", "random_state": 42,
                      "minimumTrainingSamples": minimum},
            "nodes": nodes, "records": evaluated}


def draw_charts(result: dict, output_dir: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    records = result["records"]
    fig, ax = plt.subplots(figsize=(8, 5))
    for anomalous, color, marker, label in ((False, "#458678", "o", "ML normal"),
                                             (True, "#aa4b71", "X", "ML anomaly")):
        subset = [r for r in records if r["ml_anomaly"] == anomalous]
        if subset:
            ax.scatter([r["temperature"] for r in subset], [r["humidity"] for r in subset],
                       c=color, marker=marker, s=80, label=label)
    ax.set(xlabel="Temperature (°C)", ylabel="Humidity (%)", title="Evaluation records: temperature vs humidity")
    ax.legend(loc="best")
    ax.grid(alpha=.2)
    fig.tight_layout()
    fig.savefig(output_dir / "task_c_scatter.png", dpi=160)
    plt.close(fig)

    totals = Counter(r["comparison"] for r in records)
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.bar(["Both normal", "Both anomaly", "Rule only", "ML only"],
           [totals[key] for key in CATEGORIES], color=["#458678", "#775f8d", "#c58d52", "#aa4b71"])
    ax.set(ylabel="Number of evaluation records", title="Rule vs ML outcome counts")
    ax.set_ylim(0, max(1, max(totals.values(), default=0)) + 1)
    fig.tight_layout()
    fig.savefig(output_dir / "task_c_comparison.png", dpi=160)
    plt.close(fig)


def report_section(result: dict) -> str:
    cards = []
    for node_id, node in result["nodes"].items():
        if node["available"]:
            c = node["counts"]
            detail = (f'Rule 异常 {node["ruleAbnormal"]} 条 · '
                      f'ML 异常 {node["mlAbnormal"]} 条 · 共同异常 {c["both_abnormal"]} 条 · '
                      f'仅 Rule {c["rule_only"]} 条 · 仅 ML {c["ml_only"]} 条 · 共同正常 {c["both_normal"]} 条')
        else:
            detail = node["message"]
        cards.append(f'<p><strong>{node_id}</strong> · 训练历史 {node["trainingSamples"]} 条 · '
                     f'待判断 {node["evaluationSamples"]} 条<br>{html.escape(detail)}</p>')
    rows = []
    for r in result["records"]:
        values = [r["time"], r["nodeId"], f'{r["temperature"]:.1f}℃', f'{r["humidity"]:.0f}%',
                  r["rule_status"], "异常" if r["rule_abnormal"] else "正常",
                  "异常" if r["ml_anomaly"] else "正常", f'{r["anomaly_score"]:.4f}',
                  "一致" if r["rule_abnormal"] == r["ml_anomaly"] else "不一致"]
        rows.append(f'<tr data-comparison="{r["comparison"]}">' +
                    ''.join(f'<td>{html.escape(str(value))}</td>' for value in values) + '</tr>')
    disagreement = next((r for r in result["records"] if r["comparison"] == "ml_only"), None)
    if disagreement is None:
        disagreement = next((r for r in result["records"] if r["comparison"] == "rule_only"), None)
    example = (f'{disagreement["nodeId"]} 的 {disagreement["temperature"]:.1f}℃ / '
               f'{disagreement["humidity"]:.0f}%：Rule {"异常" if disagreement["rule_abnormal"] else "正常"}，'
               f'ML {"异常" if disagreement["ml_anomaly"] else "正常"}。该节点训练历史只有 '
               f'{result["nodes"][disagreement["nodeId"]]["trainingSamples"]} 条，'
               'ML 对偏离常见模式的数值可能过于敏感；此判断值得复核，不能替代固定规则。') if disagreement else (
               '本次待测记录没有出现 Rule 与 ML 不一致；不为展示目的调整模型输出。')
    return f'''<!-- TASK_C_START -->
<section class="section" id="task-c-analysis">
<h2>历史异常分析 · Rule vs ML</h2>
<p><strong>数据来源：</strong>{html.escape(result["dataSource"])}</p>
<p>固定规则按 DormMate 现有九状态范围判断；Isolation Forest 根据该节点训练历史的温湿度分布判断偏离程度。
ML 仅供辅助，不代表一定比固定规则正确。待判断新数据没有进入本次训练基线。</p>
<p>异常分数使用 Isolation Forest decision_function：小于 0 判为 ML 异常，数值越小表示越偏离训练分布。</p>
{''.join(cards)}
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">
<figure><img src="task_c_scatter.png" alt="待测温湿度散点图，区分 ML 正常和异常"><figcaption>温度与湿度散点：ML 异常点以叉号显示。</figcaption></figure>
<figure><img src="task_c_comparison.png" alt="Rule 和 ML 四种结果组合数量对比"><figcaption>同一批待测记录的 Rule vs ML 数量。</figcaption></figure>
</div>
<h3>需要复核的分歧例子</h3><p>{html.escape(example)}</p>
<h3>待判断记录</h3>
<label>查看结果 <select id="taskCFilter"><option value="all">全部</option><option value="anomaly">任一方法异常</option>
<option value="both_abnormal">共同异常</option><option value="rule_only">仅 Rule</option><option value="ml_only">仅 ML</option>
<option value="both_normal">共同正常</option></select></label>
<div style="overflow:auto"><table><thead><tr><th>时间</th><th>节点</th><th>温度</th><th>湿度</th><th>Rule 状态</th>
<th>Rule 是否异常</th><th>ML 是否异常</th><th>异常分数</th><th>一致性</th></tr></thead>
<tbody id="taskCRows">{''.join(rows)}</tbody></table></div>
</section>
<script>document.getElementById('taskCFilter').addEventListener('change', function () {{
  for (const row of document.querySelectorAll('#taskCRows tr')) {{
    row.hidden = this.value !== 'all' && (this.value === 'anomaly'
      ? row.dataset.comparison === 'both_normal' : row.dataset.comparison !== this.value);
  }}
}});</script>
<!-- TASK_C_END -->'''


def write_outputs(result: dict, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    draw_charts(result, output_dir)
    (output_dir / "task_c_summary.json").write_text(
        json.dumps({key: value for key, value in result.items() if key != "records"}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    with (output_dir / "task_c_results.csv").open("w", encoding="utf-8-sig", newline="") as file:
        fields = list(FIELDS) + ["rule_status", "rule_abnormal", "ml_anomaly", "anomaly_score", "comparison"]
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(result["records"])
    report = output_dir / "report.html"
    if report.exists():
        content = report.read_text(encoding="utf-8")
        start = content.find("<!-- TASK_C_START -->")
        end = content.find("<!-- TASK_C_END -->")
        if start >= 0 and end >= start:
            content = content[:start] + content[end + len("<!-- TASK_C_END -->"):]
        content = content.replace("</body>", report_section(result) + "\n</body>", 1)
        report.write_text(content, encoding="utf-8")


def main() -> None:
    history = read_records(ROOT / "data" / "task_c_history.csv")
    evaluation = read_records(ROOT / "data" / "task_c_evaluation.csv")
    result = analyze(history, evaluation)
    write_outputs(result, ROOT / "analysis")
    for node_id, item in result["nodes"].items():
        print(f'{node_id}: 训练 {item["trainingSamples"]}，待判断 {item["evaluationSamples"]}；{item["message"]}')
        if item["available"]:
            print(f'  Rule 异常 {item["ruleAbnormal"]}，ML 异常 {item["mlAbnormal"]}，四组合 {item["counts"]}')
    print("Task C 报告：analysis/report.html")


if __name__ == "__main__":
    main()
