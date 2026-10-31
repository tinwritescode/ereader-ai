"""Writes what sea_g2p itself makes of tool/golden_sentences.txt, for the phonemizer test.

Needs: sea-g2p. Run from mobile/:
    python tool/build_speech_golden.py
"""
from pathlib import Path

from sea_g2p import SEAPipeline

pipeline = SEAPipeline(lang="vi")
sentences = Path("tool/golden_sentences.txt").read_text(encoding="utf-8").splitlines()
with Path("test/features/listen/sea_g2p_golden.tsv").open("w", encoding="utf-8") as out:
    for sentence in sentences:
        out.write(f"{sentence}\t{pipeline.run(sentence, punc_norm=True)}\n")
