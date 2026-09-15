/** Original code-drawn pixel art: nine-pixel shards, smaller than the fourteen-pixel source node. */
const colors = ['#cd637a', '#77bdb5', '#b091d9', '#e7b96b', '#77bf82', '#74aee2', '#dca2ce', '#dae1b8'];
const silhouettes = [
  ['0011000', '0111100', '1111110', '1111111', '0111111', '0011110', '0001100'],
  ['0001000', '0011100', '0111110', '1111111', '1111110', '0111100', '0011000'],
];
export function drawMineralFragment(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  mineral: string,
  highlight: boolean,
  now: number,
  reduced: boolean,
) {
  const number = Number(mineral.replace(/\D/g, '')) || 1,
    shape = silhouettes[number % 2]!,
    px = Math.round(x) - 3,
    py = Math.round(y) - 3;
  if (highlight) {
    ctx.strokeStyle = '#fff4c1';
    ctx.lineWidth = 1;
    ctx.strokeRect(px - 3, py - 3, 12, 12);
  }
  // A contrasting silhouette and faceted highlight keep every mineral readable without color alone.
  ctx.fillStyle = '#071015';
  for (let row = 0; row < 7; row++)
    for (let col = 0; col < 7; col++)
      if (shape[row]![col] === '1') ctx.fillRect(px + col - 1, py + row - 1, 3, 3);
  ctx.fillStyle = colors[(number - 1) % colors.length]!;
  for (let row = 0; row < 7; row++)
    for (let col = 0; col < 7; col++) if (shape[row]![col] === '1') ctx.fillRect(px + col, py + row, 1, 1);
  ctx.fillStyle = '#fff3da';
  ctx.fillRect(px + 2, py + 2, 2, 1);
  ctx.fillRect(px + 2, py + 3, 1, 1);
  ctx.globalAlpha = reduced ? 0.7 : 0.7 + Math.sin(now / 1200) * 0.15;
  ctx.fillStyle = '#fff8da';
  ctx.fillRect(px + 4, py + 1, 1, 1);
  ctx.globalAlpha = 1;
}
