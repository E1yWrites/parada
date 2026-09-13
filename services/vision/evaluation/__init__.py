"""Phase 14 — OCR accuracy / reliability evaluation harness.

Everything in this package is measurement only. It drives the unchanged
production pipeline (``app.pipeline.service.process_image``) over a
project-owned, programmatically generated dataset whose ground truth is fixed
at generation time (``dataset.py`` writes ``manifest.json`` BEFORE any
inference runs; ``run_ocr_eval.py`` only ever reads it).

Scripts (run from ``services/vision`` with the service venv):

    python -m evaluation.dataset            # build dataset + manifest (seeded, deterministic)
    python -m evaluation.run_ocr_eval       # OCR accuracy / conditions / latency -> results/
    python -m evaluation.run_e2e_latency    # Vision -> API latency (needs live API + vision server)
    python -m evaluation.run_camera_probe   # physical USB/RTSP source probe (no frames persisted)
"""
