import json
import tempfile
import unittest
from pathlib import Path

from task_c import ROOT, analyze, compare, read_records, shared_rule_status, write_outputs


class TaskCAnalysisTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.history = read_records(ROOT / "data" / "task_c_history.csv")
        cls.evaluation = read_records(ROOT / "data" / "task_c_evaluation.csv")
        cls.result = analyze(cls.history, cls.evaluation)

    def test_csv_fields_and_count(self):
        self.assertEqual(len(self.history), 40)
        self.assertEqual(len(self.evaluation), 12)
        self.assertEqual(set(self.history[0]), {"nodeId", "temperature", "humidity", "status", "time", "source"})

    def test_features_have_correct_types(self):
        self.assertEqual((self.evaluation[0]["temperature"], self.evaluation[0]["humidity"]), (24.5, 58.0))
        self.assertTrue(all(isinstance(r["temperature"], float) and isinstance(r["humidity"], float)
                            for r in self.history + self.evaluation))

    def test_rule_uses_existing_nine_state_module(self):
        self.assertEqual(shared_rule_status(self.evaluation), [r["rule_status"] for r in self.result["records"]])
        self.assertEqual(shared_rule_status([{"temperature": 16, "humidity": 35},
                                             {"temperature": 32, "humidity": 85}]),
                         ["偏冷偏干", "偏热偏湿"])

    def test_rule_abnormal(self):
        self.assertTrue(all(r["rule_abnormal"] == (r["rule_status"] != "正常") for r in self.result["records"]))

    def test_model_is_reproducible(self):
        second = analyze(self.history, self.evaluation)
        self.assertEqual([(r["ml_anomaly"], r["anomaly_score"]) for r in self.result["records"]],
                         [(r["ml_anomaly"], r["anomaly_score"]) for r in second["records"]])

    def test_ml_output_count_and_scores(self):
        self.assertEqual(len(self.result["records"]), len(self.evaluation))
        self.assertTrue(all(isinstance(r["anomaly_score"], float) and isinstance(r["ml_anomaly"], bool)
                            for r in self.result["records"]))

    def test_four_combinations(self):
        self.assertEqual([compare(*x) for x in [(False, False), (True, True), (True, False), (False, True)]],
                         ["both_normal", "both_abnormal", "rule_only", "ml_only"])
        counts = self.result["nodes"]["dorm-a"]["counts"]
        self.assertEqual(sum(counts.values()), len(self.evaluation))

    def test_node_isolation_and_insufficient_samples(self):
        other = {**self.evaluation[0], "nodeId": "dorm-b", "time": "2026-09-30T00:00:00Z"}
        result = analyze(self.history, self.evaluation + [other])
        self.assertEqual(result["nodes"]["dorm-a"]["analyzedSamples"], 12)
        self.assertFalse(result["nodes"]["dorm-b"]["available"])
        self.assertEqual(result["nodes"]["dorm-b"]["evaluationSamples"], 1)
        self.assertEqual(len(result["records"]), 12)

    def test_training_and_evaluation_cannot_overlap(self):
        with self.assertRaisesRegex(ValueError, "不能同时进入训练"):
            analyze(self.history, [self.history[0]])

    def test_csv_rejects_missing_fields(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "bad.csv"
            path.write_text("nodeId,temperature\ndorm-a,25\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "缺少必要 CSV 字段"):
                read_records(path)

    def test_report_and_charts_generated(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder)
            (output / "report.html").write_text("<html><body>M2</body></html>", encoding="utf-8")
            write_outputs(self.result, output)
            report = (output / "report.html").read_text(encoding="utf-8")
            self.assertIn("历史异常分析", report)
            self.assertIn("M2", report)
            self.assertIn("taskCFilter", report)
            self.assertTrue((output / "task_c_scatter.png").stat().st_size > 0)
            self.assertTrue((output / "task_c_comparison.png").stat().st_size > 0)
            self.assertEqual(json.loads((output / "task_c_summary.json").read_text(encoding="utf-8"))
                             ["nodes"]["dorm-a"]["analyzedSamples"], 12)
            self.assertEqual(len(read_result_csv(output / "task_c_results.csv")), 12)
            write_outputs(self.result, output)
            self.assertEqual((output / "report.html").read_text(encoding="utf-8").count("TASK_C_START"), 1)


def read_result_csv(path):
    import csv
    with path.open(encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


if __name__ == "__main__":
    unittest.main()
