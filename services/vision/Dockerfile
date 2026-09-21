# PARADA Vision / OCR — camera runtime image.
#
# Build from services/vision:
#   docker build -t parada-vision services/vision
#
# This image runs the SAME real OCR pipeline as the venv install: classical
# OpenCV plate detection + EasyOCR (CPU). It only ever talks to the PARADA API
# (PARADA_API_URL + CAMERA_API_KEY); it never connects to PostgreSQL.
#
# Camera reach: a container can read an RTSP stream only if the camera network
# is routable from where the container runs. For an on-site host use
# --network host (or map the LAN); a cloud host cannot see a facility LAN
# without a VPN — see docs/how-to/deploy.md "Hybrid deployment".

FROM python:3.11-slim

# OpenCV (headless) still needs glib; torch needs libgomp.
RUN apt-get update \
  && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/vision

# CPU-only torch first so `easyocr` does not pull the multi-GB CUDA wheels.
COPY requirements.txt ./
RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu \
  && pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY tests/fixtures ./tests/fixtures

# Bake the EasyOCR weights (~94 MB) so a container needs no outbound internet
# at start-up and the model is present before the first frame.
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False, verbose=False)"

ENV PYTHONUNBUFFERED=1
# All camera/API settings come from the environment: see .env.example here.
CMD ["python", "-m", "app.camera.cli", "run"]
