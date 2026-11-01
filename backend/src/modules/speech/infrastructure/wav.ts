export const SAMPLE_RATE = 24_000;
const HEADER_BYTES = 44;
const FIRST_CHUNK_OFFSET = 12;
const CHUNK_HEADER_BYTES = 8;
// A tenth of a second, so a sentence with nothing to say still plays and hands on to the next.
export const SILENCE = Buffer.alloc(SAMPLE_RATE / 5);
export const SAYABLE = /[\p{Script=Latin}\p{Nd}]/u;

export function wavOf(samples: Buffer): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(HEADER_BYTES - 8 + samples.length, 4);
  header.write('WAVE', 8, 'latin1');
  header.write('fmt ', 12, 'latin1');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'latin1');
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

/** The audio inside a WAV file, or null when [wav] is not one. */
export function samplesOf(wav: Buffer): Buffer | null {
  if (wav.toString('latin1', 0, 4) !== 'RIFF') return null;
  for (let at = FIRST_CHUNK_OFFSET; at + CHUNK_HEADER_BYTES <= wav.length; ) {
    const size = wav.readUInt32LE(at + 4);
    const start = at + CHUNK_HEADER_BYTES;
    if (wav.toString('latin1', at, at + 4) === 'data') return wav.subarray(start, start + size);
    at = start + size + (size % 2);
  }
  return null;
}
