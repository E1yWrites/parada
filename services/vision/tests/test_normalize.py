from app.pipeline.normalize import normalize_plate


def test_strips_space_and_hyphen_and_uppercases():
    assert normalize_plate("abc-1 234") == "ABC1234"


def test_already_normalized_is_unchanged():
    assert normalize_plate("ABC1234") == "ABC1234"


def test_lowercase_with_space():
    assert normalize_plate("abc 1234") == "ABC1234"


def test_hyphen_only():
    assert normalize_plate("ABC-1234") == "ABC1234"


def test_preserves_all_alphanumerics_no_overtrimming():
    # every letter/digit must survive; only separators are dropped
    assert normalize_plate("A1-B2 C3") == "A1B2C3"


def test_empty_string():
    assert normalize_plate("") == ""
