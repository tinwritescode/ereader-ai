"""Records the Python reference of the sampling port, with fixed noise.

Needs: onnxruntime, numpy, and the model's files. Run from mobile/:
    python tool/build_nano_fixture.py path/to/model

Writes:
  test/features/listen/nano_fixture.bin   every float the sampler sees and makes, for the host test.
  integration_test/nano_reference.dart    the noise and the result, for the same check on a device.
"""
import base64
import json
import math
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort

PHONEMES = "sˈin tʃˈaː2w."
STEPS, SWAY, CFG = 4, -1.0, 3.0
DECIMATION = 8


def voice(name):
    values = np.fromfile(f"assets/speech/voices/{name}.bin", "<f4")
    return values[:192][None], values[192:].reshape(1, 50, 256)


def trim_and_fade(wav, sr=24000, thresh_db=-45.0, keep_s=0.04, fade_s=0.015, win_s=0.01):
    win = int(win_s * sr)
    n_win = wav.size // win
    env = np.abs(wav[: n_win * win]).reshape(n_win, win).mean(1)
    above = np.flatnonzero(env > 10 ** (thresh_db / 20))
    lead, tail = int(above[0]) * win, wav.size - (int(above[-1]) + 1) * win
    keep = int(keep_s * sr)
    out = np.array(wav[max(0, lead - keep): wav.size - max(0, tail - keep)], dtype=np.float32)
    n = min(int(fade_s * sr), out.size // 2)
    ramp = (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, n))).astype(np.float32)
    out[:n] *= ramp
    out[-n:] *= ramp[::-1]
    return out


def main():
    model = Path(sys.argv[1])
    vocab = json.loads((model / "config.json").read_text(encoding="utf-8"))["vocab"]
    options = ort.SessionOptions()
    options.log_severity_level = 3
    graph = lambda name: ort.InferenceSession(str(model / f"{name}.onnx"), options, providers=["CPUExecutionProvider"])
    text, duration, flow, decoder = map(graph, ["text_encoder", "duration_predictor", "vector_estimator", "codec_decoder"])

    speaker, style = voice("minh_quan")
    null_speaker, null_style = voice("null")
    ids = np.array([[1] + [vocab[c] for c in PHONEMES] + [2]], dtype=np.int64)
    null_ids = np.array([[1, 2]], dtype=np.int64)
    context = text.run(None, {"ids": ids, "style": style})[0]
    null_context = text.run(None, {"ids": null_ids, "style": null_style})[0]
    log_seconds = float(duration.run(None, {"ctx": context, "ctx_mask": ids != 0, "spk": speaker})[0][0])
    frames = max(2, int(round(min(math.exp(log_seconds), 15.0) * 15.625)))

    noise = np.random.default_rng(7).standard_normal((1, 144, frames)).astype(np.float32)
    x = noise.copy()
    u = np.linspace(0.0, 1.0, STEPS + 1)
    times = u + SWAY * (np.cos(np.pi / 2 * u) - 1 + u)
    velocities = []
    for i in range(STEPS):
        t = np.array([times[i]], dtype=np.float32)
        v = flow.run(None, {"x": x, "t": t, "ctx": context, "ctx_mask": ids != 0, "spk": speaker, "style": style})[0]
        vu = flow.run(None, {"x": x, "t": t, "ctx": null_context, "ctx_mask": null_ids != 0, "spk": null_speaker, "style": null_style})[0]
        velocities += [v, vu]
        x = x + np.float32(times[i + 1] - times[i]) * (vu + CFG * (v - vu))
    raw = decoder.run(None, {"x": x})[0][0, 0]
    wav = trim_and_fade(np.clip(raw, -1, 1).astype(np.float32))

    with Path("test/features/listen/nano_fixture.bin").open("wb") as out:
        np.array([frames, STEPS, raw.size, wav.size], dtype="<i4").tofile(out)
        np.array([log_seconds], dtype="<f8").tofile(out)
        for array in [noise, *velocities, x, raw, wav]:
            array.astype("<f4").tofile(out)

    encoded = lambda array: base64.b64encode(array.astype("<f4").tobytes()).decode()
    Path("integration_test/nano_reference.dart").write_text(
        "// Written by tool/build_nano_fixture.py.\n"
        f"const referencePhonemes = '{PHONEMES}';\n"
        f"const referenceSteps = {STEPS};\n"
        f"const referenceSway = {SWAY};\n"
        f"const referenceDecimation = {DECIMATION};\n"
        f"const referenceSamples = {wav.size};\n"
        f"const referenceNoise = '{encoded(noise)}';\n"
        f"const referenceWave = '{encoded(wav[::DECIMATION])}';\n",
        encoding="utf-8",
    )
    print("frames", frames, "samples", wav.size)


if __name__ == "__main__":
    main()
