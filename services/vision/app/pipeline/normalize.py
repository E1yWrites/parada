import re

_NON_ALNUM = re.compile(r"[^A-Z0-9]")


def normalize_plate(plate: str) -> str:
    """Mirrors packages/database/src/plate.ts normalizePlate exactly:
    uppercase, then strip everything but A-Z0-9. Single source of truth for
    the algorithm lives in TS; this is a same-behavior port so vision output
    matches what the API will match against.
    """
    return _NON_ALNUM.sub("", plate.upper())
