/** Keep whole-number fields editable while removing accidental leading zeroes. */
export function normalizeWholeNumberInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.replace(/^0+(?=\d)/, "");
}

export function wholeNumberValue(value: string): number {
  if (value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
