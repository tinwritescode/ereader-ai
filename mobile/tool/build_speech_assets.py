"""Builds the offline speech assets from Kokoro-Vietnamese.

Needs: vig2p, torch, huggingface_hub, numpy. Run from mobile/:
    python tool/build_speech_assets.py

Writes assets/speech/:
  phonemes.tsv.gz  every Vietnamese syllable mapped by vig2p. vig2p works word by word,
                   so this table gives the phone the same output without its Rust engine.
  vocab.json       phoneme to model token id, from the model's config.json.
  voices/*.bin     style vectors as little-endian float32, shape [510, 1, 256].
"""
import gzip
import json
import unicodedata
from itertools import product
from pathlib import Path
from urllib.request import urlopen

import numpy as np
import torch
from huggingface_hub import hf_hub_download
from vig2p import VietnameseG2P

REPO = "contextboxai/Kokoro-Vietnamese"
ENGLISH_WORDS = "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt"
OUT = Path("assets/speech")
VOICES = ["diem_trinh", "duc_an", "duc_duy", "hung_thinh", "mai_linh", "mai_loan", "manh_dung",
          "my_yen", "ngoc_huyen", "phat_tai", "storyvert", "thanh_dat", "thuc_trinh", "tuan_ngoc"]

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


def main():
    (OUT / "voices").mkdir(parents=True, exist_ok=True)
    g2p = VietnameseG2P()
    words = set(syllables()) | {word.lower() for word in foreign_words()}
    table = {word: g2p(word) for word in sorted(words)}
    with gzip.open(OUT / "phonemes.tsv.gz", "wt", encoding="utf-8", compresslevel=9) as out:
        for word, phonemes in table.items():
            out.write(f"{word}\t{phonemes}\n")
    print("syllables", len(table))

    config = json.loads(Path(hf_hub_download(REPO, "config.json")).read_text(encoding="utf-8"))
    (OUT / "vocab.json").write_text(json.dumps(config["vocab"], ensure_ascii=False), encoding="utf-8")

    for voice in VOICES:
        pack = torch.load(hf_hub_download(REPO, f"voicepacks/{voice}.pt"), map_location="cpu", weights_only=True)
        array = pack.detach().cpu().numpy().astype("<f4")
        assert array.shape == (510, 1, 256), array.shape
        array.tofile(OUT / "voices" / f"{voice}.bin")


if __name__ == "__main__":
    main()
