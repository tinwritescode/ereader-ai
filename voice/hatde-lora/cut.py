"""Cut every recorded part at its pauses and pair the pieces with the script lines, in order.

    python3 voice/hatde-lora/cut.py /tmp/hatde-dataset

Writes the VieNeu fine-tune layout (metadata.csv, raw_audio/) to the given folder.
"""
import os
import re
import subprocess
import sys

IN = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'recordings')
OUT = sys.argv[1]
D = IN
# (audio, metadata file, first row, row count) in recording order.
PARTS = [('p1', 'metadata-5-phut.csv', 0, 30), ('p2', 'metadata-5-phut.csv', 30, 12), ('p3', 'metadata-5-phut.csv', 42, 12),
         ('p4', 'metadata-5-phut.csv', 54, 15), ('p5', 'metadata-5-phut.csv', 69, 5), ('p6', 'metadata-thu-them.csv', 0, 100),
         ('p7', 'metadata-thu-them.csv', 100, 63)]
# Short lead-in; the tail stops right after the voice, since pure silence would give every clip the same last codec frame.
LEAD, TAIL = 0.35, 0.02
MIN_SECONDS = 3.1


def lines(meta):
    return [l.rstrip('\n').split('|', 1)[1] for l in open(f'{D}/{meta}', encoding='utf-8')][1:]


def duration(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True)
    return float(r.stdout)


def voiced(path):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', 'silencedetect=n=-40dB:d=0.7', '-f', 'null', '-'], capture_output=True, text=True)
    starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', r.stderr)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', r.stderr)]
    total, spans, at = duration(path), [], 0.0
    for s, e in zip(starts, ends):
        if s > at:
            spans.append((at, s))
        at = e
    if at < total:
        spans.append((at, total))
    return spans, total


os.makedirs(f'{OUT}/raw_audio', exist_ok=True)
index, metadata, ok = 0, ['file_name|text'], True
for name, meta, first, count in PARTS:
    texts = lines(meta)[first:first + count]
    spans, total = voiced(f'{IN}/{name}.mp3')
    if len(spans) != count:
        ok = False
        print('MISMATCH', name, len(spans), 'pieces, expected', count)
        continue
    pieces = []
    for (a, b), text in zip(spans, texts):
        # A line under 3 s joins the next one, so prepare_dataset does not drop it.
        if pieces and pieces[-1][1] - pieces[-1][0] + LEAD < MIN_SECONDS:
            pieces[-1] = (pieces[-1][0], b, pieces[-1][2] + ' ' + text)
        else:
            pieces.append((a, b, text))
    if len(pieces) > 1 and pieces[-1][1] - pieces[-1][0] + LEAD < MIN_SECONDS:
        last = pieces.pop()
        pieces[-1] = (pieces[-1][0], last[1], pieces[-1][2] + ' ' + last[2])
    for a, b, text in pieces:
        index += 1
        file = f'hatde_{index:03d}.wav'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', f'{IN}/{name}.mp3', '-ss', str(max(0, a - LEAD)), '-to', str(min(total, b + TAIL)),
                        '-ac', '1', '-c:a', 'pcm_s16le', f'{OUT}/raw_audio/{file}'], check=True)
        metadata.append(f'{file}|{text}')
open(f'{OUT}/metadata.csv', 'w', encoding='utf-8').write('\n'.join(metadata) + '\n')
lengths = [duration(f"{OUT}/raw_audio/{l.split('|')[0]}") for l in metadata[1:]]
print('ok' if ok else 'NOT OK', 'clips', len(lengths), 'minutes %.2f' % (sum(lengths) / 60),
      'min %.2f max %.2f' % (min(lengths), max(lengths)), 'under3', sum(x < 3 for x in lengths), 'over15', sum(x > 15 for x in lengths))
