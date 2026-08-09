// All money is stored as integer pesewas (1 GHS = 100 pesewas).

export function formatGHS(pesewas: number): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
  }).format(pesewas / 100);
}

/** Parse a user-entered GHS amount (e.g. "150" or "150.50") into pesewas. */
export function parseGHS(input: string | number): number {
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Invalid GHS amount: ${input}`);
  return Math.round(n * 100);
}
