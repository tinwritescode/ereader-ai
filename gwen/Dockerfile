# Gwen-TTS on an NVIDIA GPU. Unlike VieNeu, the voice comes with each request.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/opt/huggingface

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 sox \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir torch==2.7.1 torchaudio==2.7.1 --index-url https://download.pytorch.org/whl/cu128
RUN pip install --no-cache-dir qwen-tts==0.1.1 'fastapi[standard]'

COPY serve.py /gwen/serve.py

# Fetches the model into the image, so a cold start does not depend on Hugging Face.
RUN python /gwen/serve.py --prepare
ENV HF_HUB_OFFLINE=1

CMD ["python", "/gwen/serve.py"]
