# ZeroTTS on CPU, with our own voice packs beside the ones in the weights.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1

# sounddevice is imported by zerotts even though we never play anything here.
RUN apt-get update && apt-get install -y --no-install-recommends libsndfile1 libportaudio2 \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir zerotts==0.1.5 'fastapi[standard]'

COPY serve.py /zero/serve.py
COPY voices /zero/voices

# Fetches the model into the image, so a cold start does not depend on Hugging Face.
RUN python /zero/serve.py --prepare

CMD ["python", "/zero/serve.py"]
