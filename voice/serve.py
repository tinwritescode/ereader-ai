"""Starts VieNeu's API with our voices enrolled. Enrolled voices live in memory,
so they are added on every start, before the port opens."""
import sys
from pathlib import Path

from apps import openai_speech

CLIPS = Path(__file__).parent / "clips"


def enroll() -> None:
    engine = openai_speech.engine()
    for clip in sorted(CLIPS.glob("*.mp3")):
        engine.tts.add_voice(clip.stem, str(clip), denoise=True, description="")


if __name__ == "__main__":
    enroll()
    if "--prepare" not in sys.argv:
        openai_speech.main()
