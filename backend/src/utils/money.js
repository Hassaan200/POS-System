export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function computeCogs({ stockQty, stockValue, lastCost }, qty) {
  if (stockQty > 0) {
    if (qty >= stockQty) {
      const avg = stockValue / stockQty;
      return r2(stockValue + (qty - stockQty) * avg);
    }
    return r2((stockValue * qty) / stockQty);
  }
  return r2(qty * lastCost);
}
