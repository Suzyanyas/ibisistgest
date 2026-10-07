export function convertToBaseUnit(
  quantidade: number,
  fromUnit: string,
  toUnit: string
): number {
  const from = fromUnit.toUpperCase();
  const to = toUnit.toUpperCase();
  if (from === to) return quantidade;
  if (from === "G" && to === "KG") return quantidade / 1000;
  if (from === "KG" && to === "G") return quantidade * 1000;
  if (from === "ML" && to === "L") return quantidade / 1000;
  if (from === "L" && to === "ML") return quantidade * 1000;
  console.warn(`Unit conversion not supported: ${fromUnit} to ${toUnit}`);
  return quantidade;
}
