/** Raw magnitude 0…1 → output 0…1 with a dead zone at the start and a 100% zone at the end. */
export function applyZones(raw: number, dead: number, max: number): number {
  if (raw <= dead) return 0;
  if (raw >= 1 - max) return 1;
  return (raw - dead) / (1 - dead - max);
}

/**
 * Trigger force from the finger position along the trigger (0 = weak end, 1 = strong end):
 * the top `maxZone` is 100%, any touch gives at least `minForce`, and there is no dead zone.
 */
export function triggerForce(raw: number, maxZone: number, minForce: number): number {
  const top = 1 - maxZone;
  const t = top > 0 ? Math.min(1, Math.max(0, raw) / top) : 1;
  return minForce + (1 - minForce) * t;
}
