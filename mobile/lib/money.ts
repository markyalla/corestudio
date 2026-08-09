/** Mirrors backend/src/lib/money.ts's formatGHS — money is pesewas (integer) everywhere. */
export function formatGHS(pesewas: number): string {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(pesewas / 100);
}
