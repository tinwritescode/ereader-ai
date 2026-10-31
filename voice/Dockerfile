# VieNeu-TTS v3 Turbo on an NVIDIA GPU, with our cloned voices enrolled at start.
FROM nvidia/cuda:12.8.0-runtime-ubuntu24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    PATH=/opt/venv/bin:$PATH \
    PYTHONPATH=/vieneu/src:/vieneu \
    HF_HOME=/opt/huggingface \
    HOST=0.0.0.0 \
    VIENEU_BACKEND=pytorch \
    VIENEU_DEVICE=cuda \
    VIENEU_MAX_STREAMS=16 \
    VIENEU_QUEUE=32 \
    VIENEU_QUEUE_TIMEOUT=170

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates libsndfile1 ffmpeg software-properties-common \
    && add-apt-repository -y ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends python3.12 python3.12-venv \
    && rm -rf /var/lib/apt/lists/*
ADD https://astral.sh/uv/install.sh /uv-install.sh
RUN UV_INSTALL_DIR=/usr/local/bin sh /uv-install.sh

# Pinned so a new upstream commit cannot change the voices under cached clips.
ARG VIENEU_COMMIT=04044e1b8f822f946bafb2c88b716459f4164152
WORKDIR /vieneu
RUN curl -fsSL https://github.com/pnnbao97/VieNeu-TTS/archive/${VIENEU_COMMIT}.tar.gz | tar xz --strip-components=1
RUN uv sync --frozen --no-dev --extra cuda --no-install-project --no-build --python python3.12

COPY clips /voice/clips
COPY serve.py /voice/serve.py

# Fetches the models into the image, so a cold start does not depend on Hugging Face.
RUN VIENEU_DEVICE=cpu python /voice/serve.py --prepare

CMD ["python", "/voice/serve.py"]
