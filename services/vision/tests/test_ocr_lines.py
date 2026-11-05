"""Unit tests for picking the plate-number line out of EasyOCR fragments and
dropping region/sticker words. EasyOCR is mocked: each result is
(box corners, text, confidence) exactly as reader.readtext(detail=1) returns."""

from unittest.mock import patch

import numpy as np
import pytest

from app.pipeline.ocr import is_region_word, read_plate_text, strip_region_words


def _box(x, y, w, h):
    return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]


def _read(results):
    class _Reader:
        def readtext(self, *_a, **_k):
            return list(results)

    with patch("app.pipeline.ocr.get_ocr_engine", return_value=_Reader()):
        return read_plate_text(np.zeros((10, 10), dtype=np.uint8))


def test_small_region_text_above_the_plate_is_dropped():
    # "NCR" sits left of and above the number; sorted by x alone it came first
    # and the reading was "NCR ABC 1234".
    result = _read(
        [
            (_box(5, 2, 30, 12), "NCR", 0.45),
            (_box(10, 20, 80, 40), "ABC", 0.95),
            (_box(100, 21, 100, 40), "1234", 0.91),
        ]
    )
    assert result.text == "ABC 1234"
    # Confidence is over the plate-number line only.
    assert result.confidence == pytest.approx((0.95 + 0.91) / 2)


def test_slogan_below_the_plate_is_dropped():
    result = _read(
        [
            (_box(10, 10, 90, 40), "NBC", 0.9),
            (_box(110, 10, 100, 40), "5678", 0.9),
            (_box(0, 55, 220, 14), "MATATAG NA REPUBLIKA", 0.8),
        ]
    )
    assert result.text == "NBC 5678"


def test_fragments_of_one_line_are_joined_left_to_right():
    result = _read(
        [
            (_box(120, 12, 100, 40), "1234", 0.9),
            (_box(10, 10, 90, 42), "ABC", 0.9),
        ]
    )
    assert result.text == "ABC 1234"


def test_the_tallest_line_wins_over_a_longer_small_line():
    result = _read(
        [
            (_box(0, 0, 60, 18), "DEALER", 0.9),
            (_box(70, 0, 60, 18), "BATANGAS", 0.9),
            (_box(140, 0, 60, 18), "CITY", 0.9),
            (_box(10, 30, 180, 40), "XYZ567", 0.9),
        ]
    )
    assert result.text == "XYZ567"


def test_region_word_as_tall_as_the_plate_is_still_ignored():
    result = _read(
        [
            (_box(0, 10, 60, 40), "NCR", 0.9),
            (_box(70, 10, 160, 40), "ABC1234", 0.9),
        ]
    )
    assert result.text == "ABC1234"


def test_only_region_text_yields_an_empty_reading_not_a_plate():
    result = _read([(_box(0, 0, 50, 20), "PILIPINAS", 0.9)])
    assert result is not None
    assert result.text == ""
    # What was seen is kept for the debug dump.
    assert [f.text for f in result.fragments] == ["PILIPINAS"]
    assert result.fragments[0].kept is False


def test_no_text_at_all_is_none():
    assert _read([]) is None


def test_fragments_record_what_was_kept():
    result = _read(
        [
            (_box(5, 2, 30, 12), "NCR", 0.45),
            (_box(10, 20, 180, 40), "ABC1234", 0.95),
        ]
    )
    assert [(f.text, f.kept) for f in result.fragments] == [("NCR", False), ("ABC1234", True)]


@pytest.mark.parametrize(
    "word", ["NCR", "ncr", "N.C.R.", "PILIPINAS", "Philippines", "LTO", "REGION4A", "REGION IV-A", "REGION"]
)
def test_region_words_are_recognized(word):
    assert is_region_word(word)


@pytest.mark.parametrize("word", ["ABC", "1234", "ABC1234", "NCRA", "REGIONAL"])
def test_plate_text_is_not_a_region_word(word):
    assert not is_region_word(word)


@pytest.mark.parametrize(
    "text, expected",
    [
        ("NCR ABC 1234", "ABC 1234"),
        ("ABC 1234 PILIPINAS", "ABC 1234"),
        ("LTO ABC1234", "ABC1234"),
        ("REGION IV-A ABC 123", "ABC 123"),
        ("REGION4A ABC 123", "ABC 123"),
        ("ABC 1234", "ABC 1234"),
    ],
)
def test_strip_region_words(text, expected):
    assert strip_region_words(text) == expected


def test_region_word_inside_one_fragment_is_stripped():
    # EasyOCR sometimes returns one fragment for the whole line.
    result = _read([(_box(0, 10, 220, 40), "NCR ABC 1234", 0.9)])
    assert result.text == "ABC 1234"
