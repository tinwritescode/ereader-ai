import { z } from 'zod';

export const CreateShareRequestSchema = z.object({ password: z.string().min(6).max(200) });

export const OpenShareRequestSchema = z.object({
  password: z.string().min(1).max(200),
  /** The random key this browser keeps, which stands for the machine. */
  device: z.string().min(32).max(200),
});

/** A link that lets one machine read one book. Only hashes are kept, so a stolen table opens nothing. */
export type BookShare = {
  id: string;
  bookId: string;
  ownerId: string;
  tokenHash: string;
  passwordHash: string;
  /** Hash of the key of the machine that took the link; null until one does. */
  holder: string | null;
  /** Password tries spent while the link waits for its machine. */
  tries: number;
  createdAt: Date;
};

export const MAX_TRIES = 10;

/** A link nobody took, tried too often, stays shut even for the right password. */
export function isClosed({ holder, tries }: Pick<BookShare, 'holder' | 'tries'>): boolean {
  return holder === null && tries >= MAX_TRIES;
}
