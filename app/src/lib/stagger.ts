/**
 * Stagger order for arc items.
 *
 * `getArc` returns items in order along the fan, so index 0 is one rim and the
 * last index is the other. Animating in index order would make the arc unroll
 * from one end, which reads as a list. The fan is centred on the inward normal
 * — the direction the bubble is "facing" — so that centre is where the motion
 * should start, radiating outward symmetrically to both rims.
 *
 * Returns a step count per item, not a duration: the caller multiplies by
 * whatever stagger interval it is using, and the largest step tells it how long
 * the whole sequence runs.
 */
export function staggerSteps(count: number): number[] {
  if (count <= 0) return [];

  const middle = (count - 1) / 2;
  // An even count has no single middle item; its two innermost items are half a
  // step out, so shed that half to keep the first step at zero.
  const bias = count % 2 === 0 ? 0.5 : 0;

  return Array.from({ length: count }, (_, i) =>
    Math.round(Math.abs(i - middle) - bias),
  );
}

/** Largest step in the sequence — how many stagger intervals it spans. */
export function staggerSpan(count: number): number {
  return count <= 0 ? 0 : Math.max(...staggerSteps(count));
}
