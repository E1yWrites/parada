"""Phase 14 evaluation harness — metric definitions and dataset determinism.

These pin the arithmetic behind every number in evaluation/results so the
report is reproducible from the per-image records. No model is loaded here.
"""

import json
import os
import random

import pytest

from evaluation import dataset as ds
from evaluation.metrics import Record, auroc, by_key, cer, confidence_bins, levenshtein, summarize


def _rec(**kw) -> Record:
    base = dict(
        image_id="x",
        condition="clean",
        group="clean",
        is_negative=False,
        ground_truth="ABC1234",
        status="DETECTED",
        predicted="ABC1234",
        ocr_confidence=0.9,
        detection_confidence=0.7,
        latency_total_ms=80.0,
        latency_detect_ms=8.0,
        latency_ocr_ms=60.0,
    )
    base.update(kw)
    return Record(**base)


def test_levenshtein_and_cer():
    assert levenshtein("ABC1234", "ABC1234") == 0
    assert levenshtein("ABC1234", "ABC1233") == 1
    assert levenshtein("ABC1234", "BC1234") == 1  # one deletion
    assert levenshtein("", "ABC") == 3
    assert cer("ABC1233", "ABC1234") == pytest.approx(1 / 7)
    with pytest.raises(ValueError):
        cer("X", "")


def test_summary_counts_every_outcome_exactly_once():
    records = [
        _rec(image_id="ok"),  # correct, trusted
        _rec(image_id="ok-low", ocr_confidence=0.3),  # correct, untrusted
        _rec(image_id="wrong", predicted="ABC1233", ocr_confidence=0.8),  # trusted misread (1 sub)
        _rec(image_id="wrong-low", predicted="AB1234", ocr_confidence=0.2),  # untrusted misread (1 del)
        _rec(image_id="miss", status="NO_DETECTION", predicted=None, ocr_confidence=None),
        _rec(image_id="ocrfail", status="OCR_FAILED", predicted=None, ocr_confidence=None),
        _rec(image_id="neg-fp", is_negative=True, ground_truth=None, predicted="ZZ99", ocr_confidence=0.6),
        _rec(image_id="neg-fp-low", is_negative=True, ground_truth=None, predicted="ZZ", ocr_confidence=0.1),
        _rec(image_id="neg-nodet", is_negative=True, ground_truth=None, status="NO_DETECTION", predicted=None, ocr_confidence=None),
        _rec(image_id="neg-ocrfail", is_negative=True, ground_truth=None, status="OCR_FAILED", predicted=None, ocr_confidence=None),
    ]
    s = summarize(records, threshold=0.5).as_dict()
    assert s["positives"] == 6 and s["negatives"] == 4
    assert s["exact_match_accuracy"] == pytest.approx(2 / 6)
    assert s["exact_match_accuracy_among_detected"] == pytest.approx(2 / 4)
    assert s["detected_rate"] == pytest.approx(4 / 6)
    assert s["no_detection_rate"] == pytest.approx(1 / 6)
    assert s["ocr_failed_rate"] == pytest.approx(1 / 6)
    assert s["misread_rate"] == pytest.approx(2 / 6)
    # read CER: 2 edits over 4 detected * 7 chars
    assert s["read_cer"] == pytest.approx(2 / 28)
    assert s["read_char_accuracy"] == pytest.approx(1 - 2 / 28)
    # e2e CER: the 2 misses add 7 deletions each
    assert s["e2e_cer"] == pytest.approx((2 + 14) / 42)
    assert s["false_positive_rate"] == pytest.approx(2 / 4)
    assert s["trusted_false_positive_rate"] == pytest.approx(1 / 4)
    assert s["negative_no_detection"] == 1 and s["negative_ocr_failed"] == 1
    assert (s["trusted_correct"], s["trusted_misread"], s["untrusted_correct"], s["untrusted_misread"]) == (1, 1, 1, 1)
    assert s["trusted_precision"] == pytest.approx(0.5)
    assert s["mean_confidence_correct"] == pytest.approx((0.9 + 0.3) / 2)
    assert s["mean_confidence_wrong"] == pytest.approx((0.8 + 0.2) / 2)
    assert s["latency_total"]["n"] == 10 and s["latency_total"]["median_ms"] == 80.0


def test_confidence_bins_and_auroc_use_detected_positives_only():
    records = [
        _rec(image_id="a", ocr_confidence=0.95),
        _rec(image_id="b", ocr_confidence=0.75, predicted="ABC1233"),
        _rec(image_id="c", ocr_confidence=0.55),
        _rec(image_id="neg", is_negative=True, ground_truth=None, predicted="Q1", ocr_confidence=0.99),
        _rec(image_id="miss", status="NO_DETECTION", predicted=None, ocr_confidence=None),
    ]
    bins = {b["bin"]: b for b in confidence_bins(records)}
    assert bins["[0.90, 1.00]"]["n"] == 1 and bins["[0.90, 1.00]"]["accuracy"] == 1.0
    assert bins["[0.70, 0.90)"]["n"] == 1 and bins["[0.70, 0.90)"]["accuracy"] == 0.0
    assert bins["[0.50, 0.70)"]["n"] == 1
    assert bins["[0.00, 0.50)"]["n"] == 0 and bins["[0.00, 0.50)"]["accuracy"] is None
    # correct confidences {0.95, 0.55} vs wrong {0.75}: one win, one loss
    assert auroc(records) == pytest.approx(0.5)
    assert auroc([_rec()]) is None


def test_by_key_groups_records():
    records = [_rec(group="clean"), _rec(group="blur", predicted="ABC1233"), _rec(group="blur")]
    g = by_key(records, "group")
    assert set(g) == {"blur", "clean"}
    assert g["clean"]["exact_match_accuracy"] == 1.0
    assert g["blur"]["exact_match_accuracy"] == pytest.approx(0.5)


def test_dataset_is_deterministic_and_ground_truth_is_independent_of_ocr(tmp_path):
    """Same seed => same manifest/ground truth; the manifest is written by the
    generator alone and carries the normalized text the evaluator scores
    against (no OCR is involved in producing it)."""
    a = ds.build(str(tmp_path / "a"), plates=2, seed=7)
    b = ds.build(str(tmp_path / "b"), plates=2, seed=7)
    strip = lambda m: {k: v for k, v in m.items() if k != "render_runtime"}  # noqa: E731
    assert strip(a) == strip(b)
    assert a["counts"] == {"positives": 2 * len(ds.CONDITIONS), "negatives": ds.NEGATIVES, "total": 2 * len(ds.CONDITIONS) + ds.NEGATIVES}
    positives = [e for e in a["images"] if not e["is_negative"]]
    assert all(e["ground_truth"] == ds.normalize(e["plate_text"]) for e in positives)
    assert all(len(e["ground_truth"]) == 7 and e["ground_truth"].isalnum() for e in positives)
    assert all(e["ground_truth"] is None for e in a["images"] if e["is_negative"])
    with open(tmp_path / "a" / "manifest.json", encoding="utf-8") as f:
        on_disk = json.load(f)
    assert on_disk["images"] == a["images"]
    for e in a["images"][:3]:
        assert (tmp_path / "a" / e["file"]).is_file()


def test_plate_text_format():
    rng = random.Random(3)
    for _ in range(50):
        t = ds.random_plate_text(rng)
        assert len(t) == 8 and t[3] == " "
        assert t[:3].isalpha() and t[4:].isdigit()
        assert ds.normalize(t) == t.replace(" ", "")
