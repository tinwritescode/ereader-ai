"""ZeroTTS over HTTP: Vietnamese text in, 24 kHz mono 16-bit WAV out."""
import io
import os
import secrets
import sys
import threading
from pathlib import Path

import numpy as np
import soundfile
import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import Response
from huggingface_hub import snapshot_download
from pydantic import BaseModel
from scipy.signal import resample_poly
from zerotts import ZeroTTS, normalize_vi_text
from zerotts.chunking import chunk_text, clean_segment_punctuation, normalize_punctuation

MODEL_ID = "zeroweight-ai/ZeroTTS"
# Pinned so a new upstream commit cannot change the voices under cached clips.
MODEL_REVISION = "18d6681518a4becaed3c125ceb3c7db59905fe86"
# A plain folder: onnxruntime refuses the symlinks of the Hugging Face cache.
MODEL_DIR = "/opt/zerotts"
# The model is trained on utterances, not paragraphs.
MAX_SEGMENT_SECONDS = 15
# Made on ZeroWeight's platform from our clip; the pack names the voice by a random id.
HAT_DE_PACK = Path(__file__).parent / "voices" / "hat-de.zip"
# One per vCPU of the Cloud Run instance; the library's default of 4 leaves half idle.
THREADS = 8
OUTPUT_RATE = 24_000
PAUSE_SECONDS = 0.12


class Speech(BaseModel):
    text: str
    voice: str


def segments_of(text: str) -> list[str]:
    spoken = normalize_punctuation(normalize_vi_text(text))
    return [clean_segment_punctuation(piece) for piece in chunk_text(spoken, max_chunk_sec=MAX_SEGMENT_SECONDS)]


def main() -> None:
    api_key = os.environ["ZERO_API_KEY"]
    # The model is loaded before the port opens, so a request never finds it missing.
    tts = ZeroTTS.from_pretrained(MODEL_DIR, intra_op_num_threads=THREADS)
    hat_de = tts.add_voices(str(HAT_DE_PACK))[0]
    voices = {**{voice: voice for voice in tts.list_voices()}, "hatde": hat_de}
    pause = np.zeros(int(tts.sample_rate * PAUSE_SECONDS), dtype=np.float32)
    model = threading.Lock()

    def require_key(x_api_key: str = Header(default="")) -> None:
        if not secrets.compare_digest(x_api_key, api_key):
            raise HTTPException(status_code=401, detail="Invalid API key")

    app = FastAPI(title="ZeroTTS", dependencies=[Depends(require_key)])

    @app.post("/tts")
    def speak(speech: Speech) -> Response:
        if speech.voice not in voices:
            raise HTTPException(status_code=404, detail="Unknown voice")
        pieces: list[np.ndarray] = []
        for segment in segments_of(speech.text):
            with model:
                audio = np.asarray(tts.synthesize(segment, voice=voices[speech.voice]), dtype=np.float32).reshape(-1)
            pieces += [audio, pause]
        if not pieces:
            raise HTTPException(status_code=422, detail="Nothing to say")
        samples = resample_poly(np.concatenate(pieces[:-1]), OUTPUT_RATE, tts.sample_rate)
        wav = io.BytesIO()
        soundfile.write(wav, np.clip(samples, -1, 1), OUTPUT_RATE, format="WAV", subtype="PCM_16")
        return Response(content=wav.getvalue(), media_type="audio/wav")

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ["PORT"]))


if __name__ == "__main__":
    if "--prepare" in sys.argv:
        snapshot_download(MODEL_ID, revision=MODEL_REVISION, local_dir=MODEL_DIR)
    else:
        main()
