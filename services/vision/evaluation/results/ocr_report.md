# PARADA Vision — Phase 14 OCR evaluation (generated)

Generated 2026-09-13T16:12:54.614221+00:00 by `evaluation/run_ocr_eval.py`. Do not hand-edit; re-run to refresh.

## Dataset

- Source: synthetic, programmatically rendered (`evaluation/dataset.py`, seed 20260914), font `C:/Windows/Fonts/arialbd.ttf`.
- 1150 positive images = 50 unique plates × 23 conditions; 100 negative (no-plate) images; 1250 total.
- Ground truth: the rendered text, written to `manifest.json` at generation time before any inference; the evaluation only reads it.
- No real vehicle photographs are included (none held under a usage permission). Results characterise the pipeline on controlled synthetic degradations, NOT production accuracy.

## Model / runtime

- OCR: EasyOCR Reader(['en'], gpu=False): CRAFT (craft_mlt_25k.pth) + english_g2.pth CRNN (easyocr 1.7.2, torch 2.14.0+cpu, CUDA available: False, device: cpu)
- Detector: classical OpenCV (blackhat + Sobel + Otsu + aspect-ratio contours), app/pipeline/detector.py (opencv 5.0.0)
- Host: AMD64 Family 25 Model 117 Stepping 2, AuthenticAMD — 16 logical CPUs, Windows-10-10.0.26200-SP0, Python 3.11.9
- Model load (cold, this process, weights already on disk): 1660 ms

## Overall (trust threshold = 0.5)

| Metric | Value |
|---|---:|
| Positives / negatives | 1150 / 100 |
| Exact plate accuracy (all positives; a miss counts as wrong) | 77.4% |
| Exact plate accuracy among DETECTED | 83.5% |
| Detected rate | 92.7% |
| No-detection rate | 7.2% |
| OCR-failed rate | 0.1% |
| Misread rate (detected, wrong text) | 15.3% |
| Read CER (detected positives) / char accuracy | 6.24% / 93.76% |
| End-to-end CER (misses count as full deletion) | 13.09% |
| False-positive rate on negatives (any plate reported) | 0.0% (0/100) |
| Trusted false-positive rate on negatives (conf ≥ 0.5) | 0.0% |
| Negatives → NO_DETECTION / OCR_FAILED | 79 / 21 |
| Trusted reads: correct / misread → precision | 884 / 156 → 85.0% |
| Untrusted reads: correct / misread | 6 / 20 |
| Mean confidence: correct vs misread | 0.906 vs 0.809 |
| AUROC of confidence as a correctness predictor | 0.534 |

## Confidence vs correctness (DETECTED positives)

| confidence bin | n | correct | accuracy |
|---|---:|---:|---:|
| [0.00, 0.50) | 26 | 6 | 23.1% |
| [0.50, 0.70) | 112 | 85 | 75.9% |
| [0.70, 0.90) | 230 | 199 | 86.5% |
| [0.90, 1.00] | 698 | 600 | 86.0% |

## By condition group

| group | n | exact | read CER | no-det | OCR-fail | misread | trusted misread | mean conf ✓ | mean conf ✗ | median ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| angle | 200 | 98.5% | 0.6% | 0.0% | 0.0% | 1.5% | 2 | 0.921 | 0.789 | 98.9 |
| blur | 200 | 75.0% | 5.0% | 15.5% | 0.5% | 9.0% | 3 | 0.887 | 0.234 | 81.4 |
| clean | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.898 | n/a | 81.8 |
| distance | 200 | 50.5% | 15.1% | 25.0% | 0.0% | 24.5% | 48 | 0.923 | 0.911 | 85.4 |
| layout | 100 | 92.0% | 1.0% | 2.0% | 0.0% | 6.0% | 6 | 0.922 | 0.675 | 80.3 |
| lighting | 200 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.896 | n/a | 82.1 |
| negative | 100 neg | FP 0.0% | – | 79 | 21 | – | trusted FP 0.0% | – | – | 9.9 |
| noise | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.908 | n/a | 86.0 |
| occlusion | 150 | 33.3% | 22.2% | 0.0% | 0.0% | 66.7% | 97 | 0.884 | 0.871 | 74.2 |

## By condition

| condition | n | exact | read CER | no-det | OCR-fail | misread | trusted misread | mean conf ✓ | mean conf ✗ | median ms |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| angle_persp_25 | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.866 | n/a | 75.3 |
| angle_rot_05 | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.937 | n/a | 91.5 |
| angle_rot_12 | 50 | 98.0% | 0.3% | 0.0% | 0.0% | 2.0% | 1 | 0.963 | 1.000 | 102.8 |
| angle_rot_20 | 50 | 96.0% | 2.0% | 0.0% | 0.0% | 4.0% | 1 | 0.917 | 0.684 | 118.7 |
| blur_gauss_11 | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.868 | n/a | 82.6 |
| blur_gauss_3 | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.912 | n/a | 81.5 |
| blur_gauss_7 | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.880 | n/a | 81.9 |
| blur_motion_9 | 50 | 0.0% | 46.8% | 62.0% | 2.0% | 36.0% | 3 | n/a | 0.234 | 9.8 |
| clean | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.898 | n/a | 81.8 |
| dist_far_050 | 50 | 0.0% | n/a | 100.0% | 0.0% | 0.0% | 0 | n/a | n/a | 9.2 |
| dist_far_075 | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.905 | n/a | 80.7 |
| dist_near_150 | 50 | 82.0% | 6.9% | 0.0% | 0.0% | 18.0% | 9 | 0.942 | 0.983 | 113.3 |
| dist_near_200 | 50 | 20.0% | 38.6% | 0.0% | 0.0% | 80.0% | 39 | 0.934 | 0.894 | 97.1 |
| layout_fill_070 | 50 | 94.0% | 0.3% | 4.0% | 0.0% | 2.0% | 1 | 0.907 | 0.900 | 80.4 |
| layout_nospace | 50 | 90.0% | 1.7% | 0.0% | 0.0% | 10.0% | 5 | 0.939 | 0.630 | 80.3 |
| light_bright_160 | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.901 | n/a | 82.0 |
| light_dark_020 | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.892 | n/a | 83.1 |
| light_dark_035 | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.918 | n/a | 82.3 |
| light_uneven | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.874 | n/a | 81.1 |
| negative_blobs | 20 neg | FP 0.0% | – | 19 | 1 | – | trusted FP 0.0% | – | – | 9.7 |
| negative_non_plate_rects | 20 neg | FP 0.0% | – | 20 | 0 | – | trusted FP 0.0% | – | – | 9.8 |
| negative_plain | 20 neg | FP 0.0% | – | 20 | 0 | – | trusted FP 0.0% | – | – | 9.4 |
| negative_textless_plate_rect | 20 neg | FP 0.0% | – | 20 | 0 | – | trusted FP 0.0% | – | – | 9.6 |
| negative_textured | 20 neg | FP 0.0% | – | 0 | 20 | – | trusted FP 0.0% | – | – | 155.8 |
| noise_sensor_15 | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.908 | n/a | 86.0 |
| occl_10 | 50 | 100.0% | 0.0% | 0.0% | 0.0% | 0.0% | 0 | 0.884 | n/a | 76.5 |
| occl_25 | 50 | 0.0% | 22.0% | 0.0% | 0.0% | 100.0% | 48 | n/a | 0.822 | 75.0 |
| occl_40 | 50 | 0.0% | 44.6% | 0.0% | 0.0% | 100.0% | 49 | n/a | 0.921 | 62.9 |

## Inference latency (per image, warm model, CPU)

| stage | n | mean ms | median ms | p95 ms | max ms |
|---|---:|---:|---:|---:|---:|
| process_image total | 1250 | 80.5 | 81.7 | 132.5 | 419.0 |
| detector | 1250 | 4.9 | 4.8 | 5.8 | 9.6 |
| OCR (EasyOCR readtext, summed per image) | 1250 | 70.7 | 72.0 | 120.8 | 402.1 |

First inference after model load (JIT/cache warm-up, excluded from the table): 161 ms.

## Phase 11 legacy fixtures (`tests/fixtures/images`)

| fixture | expected | status | read | conf | ms |
|---|---|---|---|---:|---:|
| clear_plate.png | ABC1234 | DETECTED | ABC1234 | 0.997 | 113.7 |
| spaced_plate.png | ABC1234 | DETECTED | ABC1234 | 0.999 | 114.4 |
| angled_plate.png | ABC1234 | DETECTED | ABC1234 | 0.734 | 151.4 |
| low_light_plate.png | ABC1234 | DETECTED | ABC1234 | 0.997 | 118.2 |
| multiple_plates.png | any (two plates) | DETECTED | IYZ999 | 0.742 | 75.3 |
| unreadable_plate.png | no plate | NO_DETECTION | – | n/a | 13.9 |
| no_plate.png | no plate | NO_DETECTION | – | n/a | 9.7 |

Video fixture `tests/fixtures/videos/clear_plate.mp4`: 10 frames, 5 DETECTED (all read `['ABC1234']`), 5 NO_DETECTION, 0 OCR_FAILED; median 61.4 ms/frame.

## Misreads (positives, DETECTED, wrong text)

| image | truth | read | conf |
|---|---|---|---:|
| p000_dist_near_150 | NXT7590 | 7590 | 1.000 |
| p000_dist_near_200 | NXT7590 | 7590 | 0.636 |
| p000_occl_25 | NXT7590 | KT7590 | 0.970 |
| p000_occl_40 | NXT7590 | 7590 | 1.000 |
| p001_dist_near_150 | XLX4838 | 4838 | 1.000 |
| p001_dist_near_200 | XLX4838 | 4838 | 1.000 |
| p001_occl_25 | XLX4838 | X4838 | 0.999 |
| p001_occl_40 | XLX4838 | 4838 | 0.836 |
| p002_dist_near_200 | UJB5253 | 5253 | 1.000 |
| p002_occl_25 | UJB5253 | UJB525 | 0.487 |
| p002_occl_40 | UJB5253 | UJB5 | 0.990 |
| p003_dist_near_200 | DZY1854 | 1854 | 0.947 |
| p003_occl_25 | DZY1854 | DZY185 | 0.574 |
| p003_occl_40 | DZY1854 | 1854 | 0.982 |
| p004_dist_near_200 | POB7138 | 7138 | 0.917 |
| p004_occl_25 | POB7138 | POB713 | 0.656 |
| p004_occl_40 | POB7138 | 7138 | 1.000 |
| p005_dist_near_200 | KHR6292 | KHR | 1.000 |
| p005_occl_25 | KHR6292 | IR6292 | 0.813 |
| p005_occl_40 | KHR6292 | 6292 | 0.951 |
| p006_dist_near_200 | JBM2778 | 2778 | 1.000 |
| p006_blur_motion_9 | JBM2778 | JBW2778 | 0.751 |
| p006_occl_25 | JBM2778 | BM2778 | 0.727 |
| p006_occl_40 | JBM2778 | JBM2 | 0.998 |
| p007_dist_near_200 | DDP5745 | DDP | 0.895 |
| p007_occl_25 | DDP5745 | DDP57 | 1.000 |
| p007_occl_40 | DDP5745 | DDP5 | 0.974 |
| p008_dist_near_200 | CIP8100 | 8100 | 1.000 |
| p008_occl_25 | CIP8100 | IP8100 | 0.989 |
| p008_occl_40 | CIP8100 | CIP8 | 0.948 |
| p009_blur_motion_9 | MCV9804 | WCV9804 | 0.461 |
| p009_occl_25 | MCV9804 | CV9804 | 0.966 |
| p009_occl_40 | MCV9804 | 9804 | 1.000 |
| p010_dist_near_200 | ZPI5984 | 5984 | 0.979 |
| p010_blur_motion_9 | ZPI5984 | 749I598 | 0.028 |
| p010_occl_25 | ZPI5984 | P15984 | 0.719 |
| p010_occl_40 | ZPI5984 | 5984 | 1.000 |
| p011_dist_near_200 | WER5205 | 5205 | 0.998 |
| p011_blur_motion_9 | WER5205 | WER0 | 0.114 |
| p011_occl_25 | WER5205 | ER5205 | 0.645 |
| p011_occl_40 | WER5205 | WER | 0.993 |
| p011_layout_nospace | WER5205 | WER52O5 | 0.519 |
| p012_dist_near_200 | HIN6557 | 655 | 0.655 |
| p012_occl_25 | HIN6557 | HIN65 | 0.612 |
| p012_occl_40 | HIN6557 | HIN6 | 0.846 |
| p013_dist_near_200 | PYI8622 | 8622 | 1.000 |
| p013_blur_motion_9 | PYI8622 | 948622 | 0.157 |
| p013_occl_25 | PYI8622 | PYI862 | 0.930 |
| p013_occl_40 | PYI8622 | 8622 | 1.000 |
| p014_dist_near_200 | DOR5188 | 5188 | 1.000 |
| p014_occl_25 | DOR5188 | JR5188 | 0.987 |
| p014_occl_40 | DOR5188 | DOR5 | 0.617 |
| p015_dist_near_150 | LAX1166 | 1166 | 1.000 |
| p015_dist_near_200 | LAX1166 | AX | 0.576 |
| p015_occl_25 | LAX1166 | AX1166 | 0.700 |
| p015_occl_40 | LAX1166 | 1166 | 1.000 |
| p016_occl_25 | DQO8929 | DQO891 | 0.596 |
| p016_occl_40 | DQO8929 | 8929 | 0.888 |
| p017_dist_near_200 | GTW7519 | GTW | 1.000 |
| p017_occl_25 | GTW7519 | GTW75 | 0.997 |
| … 116 more in ocr_results.json | | | |

## Character confusions (substitutions in misreads, top 15)

| truth → read | count |
|---|---:|
| deletion (3 char) | 76 |
| deletion (1 char) | 37 |
| deletion (2 char) | 29 |
| deletion (4 char) | 18 |
| 0 → O | 5 |
| deletion (5 char) | 4 |
| M → W | 3 |
| Z → 7 | 1 |
| P → 4 | 1 |
| I → 9 | 1 |
| 5 → I | 1 |
| 9 → 5 | 1 |
| 8 → 9 | 1 |
| 4 → 8 | 1 |
| insertion (1 char) | 1 |
