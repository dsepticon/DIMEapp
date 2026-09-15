import { nodePixelWidth } from '../../shared/originalNodeTargeting';
const minerals = ['#cd637a', '#77bdb5', '#b091d9', '#e7b96b', '#77bf82', '#74aee2', '#dca2ce', '#dae1b8'];
/** Original layered pixel formation. Palette/shape never depend on undiscovered material. */
export function drawNodeFormation(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  mineral: string | undefined,
  selected: boolean,
  active: boolean,
  now: number,
  reduced: boolean,
  variant = 0,
) {
  const width = nodePixelWidth(size),
    unit = width / 10,
    px = Math.round(x - width / 2),
    py = Math.round(y - width / 2);
  const silhouettes = [
    [
      '0001110000',
      '0011111100',
      '0111111110',
      '1111111110',
      '1111111111',
      '1111111111',
      '0111111111',
      '0011111110',
    ],
    [
      '0000111000',
      '0011111100',
      '0111111110',
      '0111111111',
      '1111111111',
      '1111111110',
      '0111111110',
      '0011111100',
    ],
    [
      '0011100000',
      '0111110100',
      '1111111110',
      '1111111111',
      '1111111111',
      '0111111111',
      '0111111110',
      '0001111100',
    ],
  ];
  const rows = silhouettes[Math.abs(variant) % silhouettes.length]!;
  ctx.fillStyle = '#071015';
  ctx.fillRect(px + 1, py + width * 0.75, width - 2, 4);
  for (let row = 0; row < rows.length; row++)
    for (let col = 0; col < 10; col++)
      if (rows[row]![col] === '1') {
        ctx.fillStyle = '#09141b';
        ctx.fillRect(
          Math.round(px + col * unit) - 1,
          Math.round(py + row * unit) - 1,
          Math.ceil(unit) + 2,
          Math.ceil(unit) + 2,
        );
      }
  for (let row = 0; row < rows.length; row++)
    for (let col = 0; col < 10; col++)
      if (rows[row]![col] === '1') {
        ctx.fillStyle = row < 3 ? '#9ca7ab' : col < 4 ? '#77868d' : '#53646c';
        ctx.fillRect(
          Math.round(px + col * unit),
          Math.round(py + row * unit),
          Math.ceil(unit),
          Math.ceil(unit),
        );
      }
  ctx.fillStyle = '#bec4bb';
  ctx.fillRect(px + width * 0.3, py + width * 0.2, Math.ceil(unit * 2), 2);
  ctx.fillStyle = mineral ? minerals[(Number(mineral.replace(/\D/g, '')) - 1) % minerals.length]! : '#a4aaa1';
  ctx.fillRect(px + width * 0.3, py + width * 0.4, 3, Math.ceil(unit * 2));
  ctx.fillRect(px + width * 0.65, py + width * 0.5, Math.ceil(unit), 3);
  if (mineral) {
    ctx.strokeStyle = '#e8f0df';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + width * 0.3 - 1, py + width * 0.4 - 1, 5, Math.ceil(unit * 2) + 2);
  }
  if (selected || active) {
    ctx.globalAlpha = active && !reduced ? 0.85 + Math.sin(now / 1100) * 0.15 : 1;
    ctx.strokeStyle = '#fff1ad';
    ctx.lineWidth = 2;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      const a = px - 4 + dx! * (width + 8),
        b = py - 4 + dy! * (width + 5);
      ctx.beginPath();
      ctx.moveTo(a, b + (dy ? -5 : 5));
      ctx.lineTo(a, b);
      ctx.lineTo(a + (dx ? -5 : 5), b);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}
