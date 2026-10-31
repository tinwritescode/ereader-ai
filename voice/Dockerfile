# VieNeu-TTS v3 Turbo on CPU, with our cloned voices enrolled at start.
FROM python:3.12-slim-bookworm

ENV PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    PATH=/opt/venv/bin:$PATH \
    PYTHONPATH=/vieneu/src:/vieneu \
    HF_HOME=/opt/huggingface \
    VIENEU_BACKEND=onnx \
    VIENEU_DEVICE=cpu \
    HOST=:: \
    VIENEU_QUEUE=32 \
    VIENEU_QUEUE_TIMEOUT=170

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates libsndfile1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv

# Pinned so a new upstream commit cannot change the voices under cached clips.
ARG VIENEU_COMMIT=04044e1b8f822f946bafb2c88b716459f4164152
WORKDIR /vieneu
RUN curl -fsSL https://github.com/pnnbao97/VieNeu-TTS/archive/${VIENEU_COMMIT}.tar.gz | tar xz --strip-components=1
RUN uv sync --frozen --no-dev --no-install-project --no-build

COPY clips /voice/clips
COPY serve.py /voice/serve.py

# Fetches the models into the image, so a restart does not depend on Hugging Face.
RUN python /voice/serve.py --prepare

CMD ["python", "/voice/serve.py"]
