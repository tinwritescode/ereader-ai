/** Paid work asks for this before it runs, and hands it back when the work fails. */
export type UsageCharge = {
  /** Throws when the account has nothing left. */
  take(): Promise<void>;
  giveBack(): Promise<void>;
};
