"""Reads /data/text.txt aloud, one line per sentence, at temperature 0.3 like production."""
import argparse

import numpy as np
import soundfile as sf
from vieneu import Vieneu

ap = argparse.ArgumentParser()
ap.add_argument('--repo', default='pnnbao-ump/VieNeu-TTS-v3-Turbo')
ap.add_argument('--voice')
ap.add_argument('--ref')
ap.add_argument('--out', required=True)
args = ap.parse_args()

tts = Vieneu(mode='v3turbo', backbone_repo=args.repo, device='cuda', backend='pytorch')
pause = np.zeros(int(tts.sample_rate * 0.4), dtype=np.float32)
parts = []
for line in open('/data/text.txt', encoding='utf-8'):
    if line.strip():
        voice = {'ref_audio': args.ref} if args.ref else {'voice': args.voice}
        parts += [tts.infer(line.strip(), temperature=0.3, **voice), pause]
sf.write(args.out, np.concatenate(parts), tts.sample_rate)
print('wrote', args.out)
