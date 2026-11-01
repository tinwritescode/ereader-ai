"""Gwen-TTS for one GPU: reads one text at a time, in the voice of the clip sent with it."""
import io
import os
import secrets
import sys
import tempfile
import threading
from pathlib import Path

import soundfile
import torch
import uvicorn
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import Response
from huggingface_hub import snapshot_download
from qwen_tts import Qwen3TTSModel

MODEL_ID = "g-group-ai-lab/gwen-tts-0.6B"
# Pinned so a new upstream commit cannot change the voice under cached clips.
MODEL_REVISION = "a83e1f08656d48217a83f0ad422d1610d5b5c963"
# The settings the gwen-tts repo recommends.
GENERATION = dict(
    temperature=0.3,
    top_k=20,
    top_p=0.9,
    max_new_tokens=4096,
    repetition_penalty=2.0,
    subtalker_do_sample=True,
    subtalker_temperature=0.1,
    subtalker_top_k=20,
    subtalker_top_p=1.0,
)


def main() -> None:
    api_key = os.environ["GWEN_API_KEY"]
    # The model is loaded before the port opens, so a request never finds it missing.
    model = Qwen3TTSModel.from_pretrained(
        snapshot_download(MODEL_ID, revision=MODEL_REVISION),
        device_map="cuda:0",
        dtype=torch.bfloat16,
        attn_implementation="sdpa",
    )
    gpu = threading.Lock()

    def require_key(x_api_key: str = Header(default="")) -> None:
        if not secrets.compare_digest(x_api_key, api_key):
            raise HTTPException(status_code=401, detail="Invalid API key")

    app = FastAPI(title="Gwen-TTS", dependencies=[Depends(require_key)])

    @app.post("/tts")
    def tts(text: str = Form(...), ref_text: str = Form(...), ref_audio: UploadFile = File(...)) -> Response:
        suffix = Path(ref_audio.filename or "").suffix or ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix) as clip:
            clip.write(ref_audio.file.read())
            clip.flush()
            with gpu:
                wavs, rate = model.generate_voice_clone(text=text, ref_audio=clip.name, ref_text=ref_text, **GENERATION)
        wav = io.BytesIO()
        soundfile.write(wav, wavs[0], rate, format="WAV", subtype="PCM_16")
        return Response(content=wav.getvalue(), media_type="audio/wav")

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ["PORT"]))


if __name__ == "__main__":
    if "--prepare" in sys.argv:
        snapshot_download(MODEL_ID, revision=MODEL_REVISION)
    else:
        main()
