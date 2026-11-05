"""Unit tests for the plate-format filter (match_plate) and PLATE_PATTERN."""

import importlib.util
import re

import pytest

import app.pipeline.service as service
from app.pipeline.service import DEFAULT_PLATE_PATTERN, match_plate


@pytest.mark.parametrize("plate", ["ABC1234", "ABC123", "NBC5678", "XYZ567"])
def test_valid_ph_plates_pass_unchanged(plate):
    assert match_plate(plate) == plate


@pytest.mark.parametrize(
    "reading, expected",
    [
        ("IABC1234", "ABC1234"),  # stray character before the plate
        ("ABC1234X", "ABC1234"),  # stray character after the plate
        ("ABCI234", "ABC1234"),  # I read for 1 in the digit group
        ("ABC12O4", "ABC1204"),  # O read for 0
        ("A8C1234", "ABC1234"),  # 8 read for B in the letter group
        ("5BC123", "SBC123"),  # 5 read for S
    ],
)
def test_letter_digit_confusions_are_corrected_by_position(reading, expected):
    assert match_plate(reading) == expected


@pytest.mark.parametrize("reading", ["LMAT", "LEE", "12345", "ABCDEFG", "HELLOWORLD", "AB12", ""])
def test_non_plate_text_is_rejected(reading):
    assert match_plate(reading) is None


@pytest.mark.parametrize(
    "reading, expected",
    [
        # Night test 2: the I of CDI 6227 was missed (or read as "]", "[", "L").
        # Correction used to pull the 6 into the letters: "CD 6227" -> "CDG227".
        ("CD 6227", None),
        ("CD] 6227", None),
        ("CD ] 6227", None),
        ("CD[ 6227", None),
        ("CD L 6227", None),
        ("CDI 6227", "CDI6227"),
        ("CDI 62271", "CDI6227"),  # stray character after the number
        ("CDI-6227", "CDI6227"),
        ("CD1 6227", "CDI6227"),  # corrected inside the letter group only
        ("CDI 62Z7", "CDI6227"),  # corrected inside the digit group only
        ("CDI 62", None),  # too few digits
        ("ABCD 1234", None),  # letter group must be exactly 3
    ],
)
def test_group_structure_is_kept(reading, expected):
    assert match_plate(reading) == expected


@pytest.mark.parametrize("reading", ["CD6227", "CD62271", "CD6227X", "cd6227"])
def test_unbroken_two_letters_then_four_digits_is_rejected(reading):
    # Same bug as "CD 6227" without the space: never "CDG227".
    assert match_plate(reading) is None


def test_custom_pattern_skips_ph_corrections(monkeypatch):
    # Corrections assume the default 3-letters-then-digits layout; any other
    # pattern is matched exactly as configured.
    custom = r"[A-Z]{3}[0-9]{4}"
    monkeypatch.setattr(service, "_PLATE_PATTERN_SOURCE", custom)
    monkeypatch.setattr(service, "PLATE_PATTERN", re.compile(rf"^(?:{custom})$"))
    assert match_plate("ABC1234") == "ABC1234"
    assert match_plate("ABCI234") is None
    assert match_plate("ABC123") is None


def _fresh_service():
    """A private copy of app.pipeline.service, so PLATE_PATTERN is re-read from
    the environment without redefining the real module's classes."""
    spec = importlib.util.spec_from_file_location("app.pipeline._service_env_copy", service.__file__)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_default_pattern_without_env(monkeypatch):
    monkeypatch.delenv("PLATE_PATTERN", raising=False)
    fresh = _fresh_service()
    assert fresh._PLATE_PATTERN_SOURCE == DEFAULT_PLATE_PATTERN
    assert fresh.match_plate("LMAT") is None


def test_empty_plate_pattern_turns_the_filter_off(monkeypatch):
    monkeypatch.setenv("PLATE_PATTERN", "")
    fresh = _fresh_service()
    assert fresh.PLATE_PATTERN is None
    # Any reading of at least MIN_PLATE_TEXT_LENGTH passes through as-is.
    assert fresh.match_plate("LMAT") == "LMAT"
    assert fresh.match_plate("ABCI234") == "ABCI234"
    assert fresh.match_plate("A") is None
