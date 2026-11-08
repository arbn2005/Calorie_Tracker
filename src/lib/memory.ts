const KEY = "calorie-counter.last-qty";

export interface QuantityMemory {
  amount: string;
  unitKey: string;
}

export function getLastQty(foodId: string): QuantityMemory | null {
  try {
    const raw = localStorage.getItem(`${KEY}:${foodId}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as QuantityMemory;
    if (typeof value !== "object" || value == null) return null;
    if (typeof value.amount !== "string" || typeof value.unitKey !== "string") {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function setLastQty(
  foodId: string,
  memory: QuantityMemory,
): void {
  try {
    localStorage.setItem(`${KEY}:${foodId}`, JSON.stringify(memory));
  } catch {
    // Storage may be unavailable; quantity memory is best-effort only.
  }
}
