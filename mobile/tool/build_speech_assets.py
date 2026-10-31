"""Builds the offline speech assets for VieNeu-TTS v3 Nano.

Needs: sea-g2p, numpy. Run from mobile/, with the voices file from the vieneu package
(src/vieneu/assets/voices_v3_nano.json):
    python tool/build_speech_assets.py path/to/voices_v3_nano.json

Writes assets/speech/:
  phonemes.tsv.gz  every Vietnamese syllable mapped by sea_g2p. After its normalizer, sea_g2p
                   works word by word, so this table gives the phone the same output without
                   its Rust engine and 60 MB dictionary.
  vocab.json       phoneme to model token id, from the model's config.json.
  voices/*.bin     little-endian float32: speaker embedding [192], then style tokens [50, 256].
  voices/null.bin  the unconditional voice for guidance, in the same layout.
"""
import gzip
import hashlib
import io
import json
import sys
import unicodedata
from itertools import product
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from sea_g2p import G2P, SEAPipeline

MODEL = "https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Nano/resolve/aba295eb96a6fa6003ebe417cc1f2802a7adc1dc"
VOICES_SHA256 = "2ca4cbf475409e61fda662fbd3fb3a3ac3e980bbc3925fedb4d1199c4ccac3e7"
ENGLISH_WORDS = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt"
OUT = Path("assets/speech")
CONTEXT = ("xin", "chào")
VOICES = {"Adam": "adam", "Ái Hân": "ai_han", "Mỹ Duyên": "my_duyen", "Đức Trí": "duc_tri",
          "Hữu Quân": "huu_quan", "Xuân Tiên": "xuan_tien", "Mai Anh": "mai_anh", "Trúc Ly": "truc_ly",
          "Anh Khôi": "anh_khoi", "Minh Quân": "minh_quan", "Mạnh Dũng": "manh_dung"}

ONSETS = ["", "b", "c", "ch", "d", "đ", "g", "gh", "gi", "h", "k", "kh", "l", "m", "n", "ng", "ngh",
          "nh", "p", "ph", "q", "qu", "r", "s", "t", "th", "tr", "v", "x"]
NUCLEI = ["a", "ă", "â", "e", "ê", "i", "o", "ô", "ơ", "u", "ư", "y", "ai", "ao", "au", "ay", "âu", "ây",
          "eo", "êu", "ia", "iê", "iu", "oa", "oă", "oe", "oi", "oo", "ôi", "ơi", "ua", "uâ", "uê", "ui",
          "uô", "uơ", "uy", "ưa", "ưi", "ưu", "ươ", "uya", "uyê", "yê", "iêu", "oai", "oay", "oeo", "uây",
          "uôi", "ươi", "ươu", "yêu", "uyu"]
CODAS = ["", "c", "ch", "m", "n", "ng", "nh", "p", "t"]
TONE_MARKS = ["́", "̀", "̉", "̃", "̣"]
STOP_CODAS = {"c", "ch", "p", "t"}
VOWELS = set("aăâeêioôơuưy")


def syllables():
    for onset, nucleus, coda in product(ONSETS, NUCLEI, CODAS):
        if coda and nucleus[-1] in "iouy" and len(nucleus) > 1 and nucleus not in ("oo",):
            continue
        rime = nucleus + coda
        yield onset + rime
        marks = [TONE_MARKS[0], TONE_MARKS[4]] if coda in STOP_CODAS else TONE_MARKS
        for mark in marks:
            for index, char in enumerate(nucleus):
                if char in VOWELS:
                    position = len(onset) + index + 1
                    word = onset + rime
                    yield unicodedata.normalize("NFC", word[:position] + mark + word[position:])


def foreign_words():
    """Common English words plus names from real books, which are not Vietnamese syllables."""
    with urlopen(ENGLISH_WORDS) as response:
        yield from response.read().decode("utf-8").split()
    yield from Path("tool/extra_words.txt").read_text(encoding="utf-8").split()
    yield from "abcdefghijklmnopqrstuvwxyz"


def spoken(pipeline, word):
    """Phonemes of [word] among Vietnamese words: alone, sea_g2p takes "to" and "an" for English."""
    phonemes = pipeline.run(f"{CONTEXT[0]} {word} {CONTEXT[1]}.", punc_norm=False)
    head, tail = pipeline.run(CONTEXT[0], punc_norm=False), pipeline.run(CONTEXT[1], punc_norm=False)
    # The normalizer drops a word in a script it does not know.
    if phonemes == f"{head} {tail}.":
        return ""
    return phonemes.removeprefix(f"{head} ").removesuffix(f" {tail}.")


def fetch(name):
    with urlopen(f"{MODEL}/{name}") as response:
        return response.read()


def write_voice(name, speaker, style):
    speaker = np.asarray(speaker, dtype="<f4")
    style = np.asarray(style, dtype="<f4")
    assert speaker.shape == (192,) and style.shape == (50, 256), (speaker.shape, style.shape)
    (OUT / "voices" / f"{name}.bin").write_bytes(speaker.tobytes() + style.tobytes())


def main():
    raw_voices = Path(sys.argv[1]).read_bytes()
    assert hashlib.sha256(raw_voices).hexdigest() == VOICES_SHA256, "another voices file"
    presets = json.loads(raw_voices)["presets"]
    assert set(presets) == set(VOICES), set(presets) ^ set(VOICES)

    (OUT / "voices").mkdir(parents=True, exist_ok=True)
    pipeline = SEAPipeline(lang="vi")
    g2p = G2P(lang="vi")
    words = set(syllables()) | {word.lower() for word in foreign_words()}
    table = {word: spoken(pipeline, word) for word in sorted(words)}
    table = {word: phonemes for word, phonemes in table.items() if phonemes}
    # Capitals read differently (GDP as letters, Tin as a word) get their own row.
    for word in sorted(table):
        upper = spoken(pipeline, word.upper())
        if upper != table[word]:
            table[word.upper()] = upper
    # English letter names, for acronyms outside the table.
    table |= {f"@{letter}": g2p.convert(f"<en>{letter}</en>") for letter in "abcdefghijklmnopqrstuvwxyz"}
    with gzip.open(OUT / "phonemes.tsv.gz", "wt", encoding="utf-8", compresslevel=9) as out:
        for word, phonemes in table.items():
            out.write(f"{word}\t{phonemes}\n")
    print("syllables", len(table))

    config = json.loads(fetch("config.json"))
    (OUT / "vocab.json").write_text(json.dumps(config["vocab"], ensure_ascii=False), encoding="utf-8")

    constants = np.load(io.BytesIO(fetch("constants.npz")))
    write_voice("null", constants["null_spk"], constants["null_style"])
    for name, voice_id in VOICES.items():
        write_voice(voice_id, presets[name]["speaker_emb"], presets[name]["style"])


if __name__ == "__main__":
    main()
