"""Phase 14 — run the unchanged production pipeline over the evaluation
dataset and write measured results.

    python -m evaluation.run_ocr_eval [--dataset evaluation/dataset] [--out evaluation/results]

Reads ``manifest.json`` (never writes it). For each image it calls
``app.pipeline.service.process_image`` — the same function ``POST /detect``
and the camera runtime use — and records status / plate / confidences plus
stage latencies. Stage timing wraps the detector and OCR entry points that
``service.py`` already imports; the pipeline code itself is untouched.

Outputs:
  results/ocr_results.json   every per-image record + all aggregates
  results/ocr_report.md      human-readable tables (generated, do not hand-edit)
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import statistics
import sys
import time
from datetime import datetime, timezone

import cv2

from app.pipeline import service as service_module
from app.pipeline.ocr import get_ocr_engine
from evaluation.metrics import Record, auroc, by_key, confidence_bins, latency_summary, summarize

TRUST_THRESHOLD = 0.5  # DEFAULT_OCR_CONFIDENCE_THRESHOLD (API isPlateTrusted)

LEGACY_FIXTURES = {
    # Phase 11 fixture -> expected outcome as asserted by tests/test_real_inference_smoke.py
    "clear_plate.png": "ABC1234",
    "spaced_plate.png": "ABC1234",
    "angled_plate.png": "ABC1234",
    "low_light_plate.png": "ABC1234",
    "multiple_plates.png": None,  # two plates; deterministic read of one — not scored for exact match
    "unreadable_plate.png": "__NEGATIVE__",  # must never yield a plate
    "no_plate.png": "__NEGATIVE__",
}


class StageTimer:
    """Wraps the detector / OCR functions service.py calls so per-stage wall
    time can be attributed without modifying the pipeline."""

    def __init__(self) -> None:
        self.detect_ms = 0.0
        self.ocr_ms = 0.0
        self._orig_detect = service_module.detect_plate_candidates
        self._orig_ocr = service_module.read_plate_text

    def __enter__(self) -> "StageTimer":
        def timed_detect(*a, **k):
            t = time.perf_counter()
            try:
                return self._orig_detect(*a, **k)
            finally:
                self.detect_ms += (time.perf_counter() - t) * 1000

        def timed_ocr(*a, **k):
            t = time.perf_counter()
            try:
                return self._orig_ocr(*a, **k)
            finally:
                self.ocr_ms += (time.perf_counter() - t) * 1000

        service_module.detect_plate_candidates = timed_detect
        service_module.read_plate_text = timed_ocr
        return self

    def __exit__(self, *exc) -> None:
        service_module.detect_plate_candidates = self._orig_detect
        service_module.read_plate_text = self._orig_ocr

    def reset(self) -> None:
        self.detect_ms = 0.0
        self.ocr_ms = 0.0


def run_one(image_bytes: bytes, timer: StageTimer) -> tuple[service_module.VisionResult, float, float, float]:
    timer.reset()
    t = time.perf_counter()
    result = service_module.process_image(image_bytes)
    total = (time.perf_counter() - t) * 1000
    return result, total, timer.detect_ms, timer.ocr_ms


def _runtime_info() -> dict:
    import numpy
    import torch
    import easyocr

    info = {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "machine": platform.machine(),
        "cpu": platform.processor(),
        "logical_cpus": os.cpu_count(),
        "torch": torch.__version__,
        "cuda_available": bool(torch.cuda.is_available()),
        "device": "cpu",
        "easyocr": easyocr.__version__,
        "opencv": cv2.__version__,
        "numpy": numpy.__version__,
        "ocr_model": "EasyOCR Reader(['en'], gpu=False): CRAFT (craft_mlt_25k.pth) + english_g2.pth CRNN",
        "detector": "classical OpenCV (blackhat + Sobel + Otsu + aspect-ratio contours), app/pipeline/detector.py",
    }
    try:
        model_dir = os.path.join(os.path.expanduser("~"), ".EasyOCR", "model")
        info["model_files"] = {
            f: os.path.getsize(os.path.join(model_dir, f)) for f in sorted(os.listdir(model_dir)) if f.endswith(".pth")
        }
    except OSError:
        info["model_files"] = {}
    return info


def _fmt(v, pct: bool = False, nd: int = 1) -> str:
    if v is None:
        return "n/a"
    if pct:
        return f"{v * 100:.{nd}f}%"
    return f"{v:.{nd}f}"


def _cond_table(rows: dict[str, dict], title_key: str) -> str:
    lines = [
        f"| {title_key} | n | exact | read CER | no-det | OCR-fail | misread | trusted misread | mean conf ✓ | mean conf ✗ | median ms |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for name, s in rows.items():
        if s["positives"] == 0:
            lines.append(
                f"| {name} | {s['negatives']} neg | FP {_fmt(s['false_positive_rate'], True)} | – | {s['negative_no_detection']} | {s['negative_ocr_failed']} | – | trusted FP {_fmt(s['trusted_false_positive_rate'], True)} | – | – | {_fmt(s['latency_total'].get('median_ms'))} |"
            )
            continue
        lines.append(
            f"| {name} | {s['positives']} | {_fmt(s['exact_match_accuracy'], True)} | {_fmt(s['read_cer'], True)} | "
            f"{_fmt(s['no_detection_rate'], True)} | {_fmt(s['ocr_failed_rate'], True)} | {_fmt(s['misread_rate'], True)} | "
            f"{s['trusted_misread']} | {_fmt(s['mean_confidence_correct'], nd=3)} | {_fmt(s['mean_confidence_wrong'], nd=3)} | "
            f"{_fmt(s['latency_total'].get('median_ms'))} |"
        )
    return "\n".join(lines)


def write_report(out_dir: str, results: dict) -> str:
    o = results["overall"]
    lt, ld, lo = o["latency_total"], o["latency_detect"], o["latency_ocr"]
    m = results["dataset"]
    rt = results["runtime"]
    md = []
    md.append("# PARADA Vision — Phase 14 OCR evaluation (generated)\n")
    md.append(f"Generated {results['generated_at']} by `evaluation/run_ocr_eval.py`. Do not hand-edit; re-run to refresh.\n")
    md.append("## Dataset\n")
    md.append(f"- Source: synthetic, programmatically rendered (`evaluation/dataset.py`, seed {m['seed']}), font `{m['font']}`.")
    md.append(f"- {m['counts']['positives']} positive images = {m['unique_plates']} unique plates × {len(m['conditions'])} conditions; {m['counts']['negatives']} negative (no-plate) images; {m['counts']['total']} total.")
    md.append("- Ground truth: the rendered text, written to `manifest.json` at generation time before any inference; the evaluation only reads it.")
    md.append("- No real vehicle photographs are included (none held under a usage permission). Results characterise the pipeline on controlled synthetic degradations, NOT production accuracy.\n")
    md.append("## Model / runtime\n")
    md.append(f"- OCR: {rt['ocr_model']} (easyocr {rt['easyocr']}, torch {rt['torch']}, CUDA available: {rt['cuda_available']}, device: {rt['device']})")
    md.append(f"- Detector: {rt['detector']} (opencv {rt['opencv']})")
    md.append(f"- Host: {rt['cpu']} — {rt['logical_cpus']} logical CPUs, {rt['platform']}, Python {rt['python']}")
    md.append(f"- Model load (cold, this process, weights already on disk): {results['model_load_ms']:.0f} ms\n")
    md.append(f"## Overall (trust threshold = {TRUST_THRESHOLD})\n")
    md.append("| Metric | Value |\n|---|---:|")
    md.append(f"| Positives / negatives | {o['positives']} / {o['negatives']} |")
    md.append(f"| Exact plate accuracy (all positives; a miss counts as wrong) | {_fmt(o['exact_match_accuracy'], True)} |")
    md.append(f"| Exact plate accuracy among DETECTED | {_fmt(o['exact_match_accuracy_among_detected'], True)} |")
    md.append(f"| Detected rate | {_fmt(o['detected_rate'], True)} |")
    md.append(f"| No-detection rate | {_fmt(o['no_detection_rate'], True)} |")
    md.append(f"| OCR-failed rate | {_fmt(o['ocr_failed_rate'], True)} |")
    md.append(f"| Misread rate (detected, wrong text) | {_fmt(o['misread_rate'], True)} |")
    md.append(f"| Read CER (detected positives) / char accuracy | {_fmt(o['read_cer'], True, 2)} / {_fmt(o['read_char_accuracy'], True, 2)} |")
    md.append(f"| End-to-end CER (misses count as full deletion) | {_fmt(o['e2e_cer'], True, 2)} |")
    md.append(f"| False-positive rate on negatives (any plate reported) | {_fmt(o['false_positive_rate'], True)} ({o['negatives'] and int(round(o['false_positive_rate'] * o['negatives']))}/{o['negatives']}) |")
    md.append(f"| Trusted false-positive rate on negatives (conf ≥ {TRUST_THRESHOLD}) | {_fmt(o['trusted_false_positive_rate'], True)} |")
    md.append(f"| Negatives → NO_DETECTION / OCR_FAILED | {o['negative_no_detection']} / {o['negative_ocr_failed']} |")
    md.append(f"| Trusted reads: correct / misread → precision | {o['trusted_correct']} / {o['trusted_misread']} → {_fmt(o['trusted_precision'], True)} |")
    md.append(f"| Untrusted reads: correct / misread | {o['untrusted_correct']} / {o['untrusted_misread']} |")
    md.append(f"| Mean confidence: correct vs misread | {_fmt(o['mean_confidence_correct'], nd=3)} vs {_fmt(o['mean_confidence_wrong'], nd=3)} |")
    md.append(f"| AUROC of confidence as a correctness predictor | {_fmt(results['confidence_auroc'], nd=3)} |\n")
    md.append("## Confidence vs correctness (DETECTED positives)\n")
    md.append("| confidence bin | n | correct | accuracy |\n|---|---:|---:|---:|")
    for b in results["confidence_bins"]:
        md.append(f"| {b['bin']} | {b['n']} | {b['correct']} | {_fmt(b['accuracy'], True)} |")
    md.append("\n## By condition group\n")
    md.append(_cond_table(results["by_group"], "group"))
    md.append("\n## By condition\n")
    md.append(_cond_table(results["by_condition"], "condition"))
    md.append("\n## Inference latency (per image, warm model, CPU)\n")
    md.append("| stage | n | mean ms | median ms | p95 ms | max ms |\n|---|---:|---:|---:|---:|---:|")
    for name, s in (("process_image total", lt), ("detector", ld), ("OCR (EasyOCR readtext, summed per image)", lo)):
        md.append(f"| {name} | {s['n']} | {_fmt(s.get('mean_ms'))} | {_fmt(s.get('median_ms'))} | {_fmt(s.get('p95_ms'))} | {_fmt(s.get('max_ms'))} |")
    md.append(f"\nFirst inference after model load (JIT/cache warm-up, excluded from the table): {results['first_inference_ms']:.0f} ms.\n")
    md.append("## Phase 11 legacy fixtures (`tests/fixtures/images`)\n")
    md.append("| fixture | expected | status | read | conf | ms |\n|---|---|---|---|---:|---:|")
    for r in results["legacy_fixtures"]:
        md.append(f"| {r['file']} | {r['expected']} | {r['status']} | {r['normalized_plate'] or '–'} | {_fmt(r['ocr_confidence'], nd=3)} | {_fmt(r['latency_ms'])} |")
    v = results["legacy_video"]
    md.append(f"\nVideo fixture `{v['file']}`: {v['frames']} frames, {v['detected']} DETECTED (all read `{v['plates_read']}`), {v['no_detection']} NO_DETECTION, {v['ocr_failed']} OCR_FAILED; median {_fmt(v['latency']['median_ms'])} ms/frame.\n")
    md.append("## Misreads (positives, DETECTED, wrong text)\n")
    md.append("| image | truth | read | conf |\n|---|---|---|---:|")
    for r in results["misreads"][:60]:
        md.append(f"| {r['image_id']} | {r['ground_truth']} | {r['predicted']} | {_fmt(r['ocr_confidence'], nd=3)} |")
    if len(results["misreads"]) > 60:
        md.append(f"| … {len(results['misreads']) - 60} more in ocr_results.json | | | |")
    md.append("\n## Character confusions (substitutions in misreads, top 15)\n")
    md.append("| truth → read | count |\n|---|---:|")
    for k, c in results["confusions"][:15]:
        md.append(f"| {k} | {c} |")
    path = os.path.join(out_dir, "ocr_report.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(md) + "\n")
    return path


def _confusions(misreads: list[dict]) -> list[tuple[str, int]]:
    """Positional substitutions for equal-length misreads (the common case);
    length-changing errors are reported as insert/delete."""
    from collections import Counter

    c: Counter[str] = Counter()
    for r in misreads:
        t, p = r["ground_truth"], r["predicted"] or ""
        if len(t) == len(p):
            for a, b in zip(t, p):
                if a != b:
                    c[f"{a} → {b}"] += 1
        elif len(p) < len(t):
            c[f"deletion ({len(t) - len(p)} char)"] += 1
        else:
            c[f"insertion ({len(p) - len(t)} char)"] += 1
    return c.most_common()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    here = os.path.dirname(os.path.abspath(__file__))
    parser.add_argument("--dataset", default=os.path.join(here, "dataset"))
    parser.add_argument("--out", default=os.path.join(here, "results"))
    parser.add_argument("--limit", type=int, default=0, help="evaluate only the first N manifest entries (smoke runs)")
    args = parser.parse_args(argv)

    with open(os.path.join(args.dataset, "manifest.json"), encoding="utf-8") as f:
        manifest = json.load(f)
    os.makedirs(args.out, exist_ok=True)

    t = time.perf_counter()
    get_ocr_engine()
    model_load_ms = (time.perf_counter() - t) * 1000
    print(f"model loaded in {model_load_ms:.0f} ms")

    fixtures_dir = os.path.join(os.path.dirname(here), "tests", "fixtures", "images")
    records: list[Record] = []
    raw: list[dict] = []
    first_inference_ms = None
    entries = manifest["images"][: args.limit] if args.limit else manifest["images"]

    with StageTimer() as timer:
        # Warm-up on the first legacy fixture (first call after load carries
        # one-off JIT/cache cost and would distort the per-image table).
        with open(os.path.join(fixtures_dir, "clear_plate.png"), "rb") as f:
            _, first_inference_ms, _, _ = run_one(f.read(), timer)

        for i, e in enumerate(entries, start=1):
            with open(os.path.join(args.dataset, e["file"]), "rb") as f:
                b = f.read()
            result, total, det, ocr = run_one(b, timer)
            rec = Record(
                image_id=e["id"],
                condition=e["condition"],
                group=e["group"],
                is_negative=bool(e["is_negative"]),
                ground_truth=e["ground_truth"],
                status=result.status.value,
                predicted=result.normalized_plate,
                ocr_confidence=result.ocr_confidence,
                detection_confidence=result.detection_confidence,
                latency_total_ms=total,
                latency_detect_ms=det,
                latency_ocr_ms=ocr,
            )
            records.append(rec)
            raw.append(
                {
                    **rec.__dict__,
                    "detected_plate_raw": result.detected_plate,
                    "candidates_considered": result.candidates_considered,
                    "correct": rec.correct,
                }
            )
            if i % 100 == 0 or i == len(entries):
                print(f"  {i}/{len(entries)} evaluated")

        legacy = []
        for name, expected in LEGACY_FIXTURES.items():
            with open(os.path.join(fixtures_dir, name), "rb") as f:
                result, total, _, _ = run_one(f.read(), timer)
            legacy.append(
                {
                    "file": name,
                    "expected": "no plate" if expected == "__NEGATIVE__" else (expected or "any (two plates)"),
                    "status": result.status.value,
                    "normalized_plate": result.normalized_plate,
                    "ocr_confidence": result.ocr_confidence,
                    "latency_ms": total,
                    "as_expected": (
                        (result.normalized_plate is None) if expected == "__NEGATIVE__" else
                        (result.status.value == "DETECTED" and bool(result.normalized_plate)) if expected is None else
                        (result.normalized_plate == expected)
                    ),
                }
            )

        video_path = os.path.join(os.path.dirname(here), "tests", "fixtures", "videos", "clear_plate.mp4")
        video = {"file": "tests/fixtures/videos/clear_plate.mp4", "frames": 0, "detected": 0, "no_detection": 0, "ocr_failed": 0, "plates_read": [], "latency": {}}
        cap = cv2.VideoCapture(video_path)
        lat = []
        try:
            while cap.isOpened():
                ok, frame = cap.read()
                if not ok:
                    break
                ok, buf = cv2.imencode(".jpg", frame)
                result, total, _, _ = run_one(buf.tobytes(), timer)
                lat.append(total)
                video["frames"] += 1
                if result.status.value == "DETECTED":
                    video["detected"] += 1
                    if result.normalized_plate not in video["plates_read"]:
                        video["plates_read"].append(result.normalized_plate)
                elif result.status.value == "NO_DETECTION":
                    video["no_detection"] += 1
                else:
                    video["ocr_failed"] += 1
        finally:
            cap.release()
        video["latency"] = latency_summary(lat)

    overall = summarize(records, TRUST_THRESHOLD).as_dict()
    misreads = [r for r in raw if (not r["is_negative"]) and r["status"] == "DETECTED" and not r["correct"]]
    results = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "trust_threshold": TRUST_THRESHOLD,
        "dataset": {k: v for k, v in manifest.items() if k != "images"},
        "runtime": _runtime_info(),
        "model_load_ms": model_load_ms,
        "first_inference_ms": first_inference_ms,
        "overall": overall,
        "confidence_bins": confidence_bins(records),
        "confidence_auroc": auroc(records),
        "by_group": by_key(records, "group", TRUST_THRESHOLD),
        "by_condition": by_key(records, "condition", TRUST_THRESHOLD),
        "misreads": misreads,
        "confusions": _confusions(misreads),
        "legacy_fixtures": legacy,
        "legacy_video": video,
        "records": raw,
    }
    with open(os.path.join(args.out, "ocr_results.json"), "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    path = write_report(args.out, results)
    print(f"wrote {path}")
    print(
        f"exact={_fmt(overall['exact_match_accuracy'], True)} readCER={_fmt(overall['read_cer'], True, 2)} "
        f"noDet={_fmt(overall['no_detection_rate'], True)} FP={_fmt(overall['false_positive_rate'], True)} "
        f"median={_fmt(overall['latency_total']['median_ms'])}ms"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
