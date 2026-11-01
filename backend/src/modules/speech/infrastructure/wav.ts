export const SAMPLE_RATE = 24_000;
const HEADER_BYTES = 44;
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
