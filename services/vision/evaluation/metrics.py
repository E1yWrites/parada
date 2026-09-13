"""Pure metric functions for the Phase 14 OCR evaluation.

No I/O, no model access — these are deliberately tiny and unit-tested
(``tests/test_evaluation_metrics.py``) so every number in the report is
reproducible from the raw per-image records.

Definitions (documented once here, used verbatim in the report):

* exact match      — ``normalized_plate == ground_truth`` for a DETECTED result.
                     A NO_DETECTION / OCR_FAILED result on a positive image is
                     counted as NOT matched (it is a miss, never ignored).
* CER              — character error rate = Levenshtein(pred, truth) / len(truth),
                     computed over DETECTED positives ("read CER") and over ALL
                     positives with a miss counted as len(truth) deletions
                     ("end-to-end CER"). Character accuracy = 1 - CER.
* no-detection     — NO_DETECTION / positives. OCR_FAILED is reported separately.
* misread          — DETECTED but wrong text / positives.
* false positive   — DETECTED (any text) on a NEGATIVE image / negatives.
* trusted          — ``ocr_confidence >= threshold`` (the API's isPlateTrusted
                     boundary, default 0.5). A "trusted misread" is the case the
                     backend would actually act on.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Iterable, Sequence


def levenshtein(a: str, b: str) -> int:
    """Classic edit distance (insert/delete/substitute, unit cost)."""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, start=1):
        cur = [i]
        for j, cb in enumerate(b, start=1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]


def cer(pred: str, truth: str) -> float:
    if not truth:
        raise ValueError("ground truth must be non-empty")
    return levenshtein(pred, truth) / len(truth)


@dataclass(frozen=True)
class Record:
    """One evaluated image. ``predicted`` is the normalized plate or None."""

    image_id: str
    condition: str
    group: str
    is_negative: bool
    ground_truth: str | None
    status: str  # DETECTED | NO_DETECTION | OCR_FAILED
    predicted: str | None
    ocr_confidence: float | None
    detection_confidence: float | None
    latency_total_ms: float
    latency_detect_ms: float
    latency_ocr_ms: float

    @property
    def detected(self) -> bool:
        return self.status == "DETECTED" and bool(self.predicted)

    @property
    def correct(self) -> bool:
        return (not self.is_negative) and self.detected and self.predicted == self.ground_truth


def _pct(num: int, den: int) -> float | None:
    return (num / den) if den else None


def _percentile(values: Sequence[float], p: float) -> float | None:
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def latency_summary(values: Sequence[float]) -> dict:
    if not values:
        return {"n": 0}
    return {
        "n": len(values),
        "mean_ms": statistics.fmean(values),
        "median_ms": statistics.median(values),
        "p95_ms": _percentile(values, 0.95),
        "max_ms": max(values),
        "min_ms": min(values),
    }


@dataclass
class Summary:
    positives: int = 0
    negatives: int = 0
    detected: int = 0
    exact: int = 0
    no_detection: int = 0
    ocr_failed: int = 0
    misread: int = 0
    read_edit_distance: int = 0
    read_truth_chars: int = 0
    e2e_edit_distance: int = 0
    e2e_truth_chars: int = 0
    neg_detected: int = 0
    neg_trusted: int = 0
    neg_ocr_failed: int = 0
    neg_no_detection: int = 0
    trusted_correct: int = 0
    trusted_misread: int = 0
    untrusted_correct: int = 0
    untrusted_misread: int = 0
    conf_correct: list[float] = field(default_factory=list)
    conf_wrong: list[float] = field(default_factory=list)
    lat_total: list[float] = field(default_factory=list)
    lat_detect: list[float] = field(default_factory=list)
    lat_ocr: list[float] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "positives": self.positives,
            "negatives": self.negatives,
            "exact_match_accuracy": _pct(self.exact, self.positives),
            "exact_match_accuracy_among_detected": _pct(self.exact, self.detected),
            "detected_rate": _pct(self.detected, self.positives),
            "no_detection_rate": _pct(self.no_detection, self.positives),
            "ocr_failed_rate": _pct(self.ocr_failed, self.positives),
            "misread_rate": _pct(self.misread, self.positives),
            "read_cer": _pct(self.read_edit_distance, self.read_truth_chars),
            "read_char_accuracy": (
                1 - self.read_edit_distance / self.read_truth_chars if self.read_truth_chars else None
            ),
            "e2e_cer": _pct(self.e2e_edit_distance, self.e2e_truth_chars),
            "false_positive_rate": _pct(self.neg_detected, self.negatives),
            "trusted_false_positive_rate": _pct(self.neg_trusted, self.negatives),
            "negative_ocr_failed": self.neg_ocr_failed,
            "negative_no_detection": self.neg_no_detection,
            "trusted_correct": self.trusted_correct,
            "trusted_misread": self.trusted_misread,
            "untrusted_correct": self.untrusted_correct,
            "untrusted_misread": self.untrusted_misread,
            "trusted_precision": _pct(self.trusted_correct, self.trusted_correct + self.trusted_misread),
            "mean_confidence_correct": statistics.fmean(self.conf_correct) if self.conf_correct else None,
            "mean_confidence_wrong": statistics.fmean(self.conf_wrong) if self.conf_wrong else None,
            "latency_total": latency_summary(self.lat_total),
            "latency_detect": latency_summary(self.lat_detect),
            "latency_ocr": latency_summary(self.lat_ocr),
        }


def summarize(records: Iterable[Record], threshold: float = 0.5) -> Summary:
    s = Summary()
    for r in records:
        s.lat_total.append(r.latency_total_ms)
        s.lat_detect.append(r.latency_detect_ms)
        s.lat_ocr.append(r.latency_ocr_ms)
        if r.is_negative:
            s.negatives += 1
            if r.detected:
                s.neg_detected += 1
                if (r.ocr_confidence or 0.0) >= threshold:
                    s.neg_trusted += 1
            elif r.status == "OCR_FAILED":
                s.neg_ocr_failed += 1
            else:
                s.neg_no_detection += 1
            continue

        assert r.ground_truth, "positive record without ground truth"
        s.positives += 1
        truth_len = len(r.ground_truth)
        s.e2e_truth_chars += truth_len
        if r.detected:
            s.detected += 1
            dist = levenshtein(r.predicted or "", r.ground_truth)
            s.read_edit_distance += dist
            s.read_truth_chars += truth_len
            s.e2e_edit_distance += dist
            trusted = (r.ocr_confidence or 0.0) >= threshold
            if r.correct:
                s.exact += 1
                s.conf_correct.append(r.ocr_confidence or 0.0)
                if trusted:
                    s.trusted_correct += 1
                else:
                    s.untrusted_correct += 1
            else:
                s.misread += 1
                s.conf_wrong.append(r.ocr_confidence or 0.0)
                if trusted:
                    s.trusted_misread += 1
                else:
                    s.untrusted_misread += 1
        else:
            s.e2e_edit_distance += truth_len  # a miss = every character lost
            if r.status == "NO_DETECTION":
                s.no_detection += 1
            else:
                s.ocr_failed += 1
    return s


def confidence_bins(records: Iterable[Record], edges: Sequence[float] = (0.0, 0.5, 0.7, 0.9, 1.0001)) -> list[dict]:
    """Accuracy of DETECTED positives per confidence bin — the confidence-vs-
    correctness view. Bins are [lo, hi)."""
    rows = []
    detected = [r for r in records if (not r.is_negative) and r.detected]
    for lo, hi in zip(edges[:-1], edges[1:]):
        in_bin = [r for r in detected if lo <= (r.ocr_confidence or 0.0) < hi]
        rows.append(
            {
                "bin": f"[{lo:.2f}, {min(hi, 1.0):.2f}{']' if hi > 1 else ')'}",
                "n": len(in_bin),
                "correct": sum(1 for r in in_bin if r.correct),
                "accuracy": _pct(sum(1 for r in in_bin if r.correct), len(in_bin)),
            }
        )
    return rows


def auroc(records: Iterable[Record]) -> float | None:
    """Rank-based AUROC of ocr_confidence as a predictor of "read is correct",
    over DETECTED positives. None if either class is empty. Equivalent to the
    Mann-Whitney U statistic normalised by n_pos * n_neg (ties count 0.5)."""
    pos = [r.ocr_confidence or 0.0 for r in records if (not r.is_negative) and r.detected and r.correct]
    neg = [r.ocr_confidence or 0.0 for r in records if (not r.is_negative) and r.detected and not r.correct]
    if not pos or not neg:
        return None
    wins = 0.0
    for p in pos:
        for n in neg:
            wins += 1.0 if p > n else (0.5 if p == n else 0.0)
    return wins / (len(pos) * len(neg))


def by_key(records: Iterable[Record], key: str, threshold: float = 0.5) -> dict[str, dict]:
    groups: dict[str, list[Record]] = defaultdict(list)
    for r in records:
        groups[getattr(r, key)].append(r)
    return {k: summarize(v, threshold).as_dict() for k, v in sorted(groups.items())}
