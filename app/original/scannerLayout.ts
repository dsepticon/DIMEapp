/** Fit expanded information in the larger clear band, leaving actors unobstructed. */
export function scannerCardLayout(
  height: number,
  top: number,
  bottom: number,
  playerY: number,
  nodeY: number,
  nodeRadius = 24,
) {
  const upper = Math.min(playerY - 14, nodeY - nodeRadius) - 8 - top;
  const lower = height - bottom - Math.max(playerY + 14, nodeY + nodeRadius) - 8;
  return upper >= lower
    ? { top, maxHeight: Math.max(44, Math.min(180, upper)) }
    : { bottom, maxHeight: Math.max(44, Math.min(180, lower)) };
}
