import { useEffect, useRef } from 'react';
import type { MiningType } from '../../../shared/schema';
import { P } from '../palette';

const schemes: Record<MiningType, { surface: string; shade: string; strata: string; seed: number }> = {
  Hand: { surface: P.green, shade: P.steel, strata: P.cyanLight, seed: 2 },
  Roc: { surface: P.amber, shade: P.amberDark, strata: P.cream, seed: 5 },
  Prospector: { surface: P.blue, shade: P.rockLight, strata: P.cyan, seed: 8 },
  Mole: { surface: P.violet, shade: P.rockDark, strata: P.amberLight, seed: 11 },
};

/** An original 16-pixel survey world; no downloaded image or texture data. */
export function drawSurveyIcon(ctx: CanvasRenderingContext2D, source: MiningType) {
  const scheme = schemes[source];
  ctx.clearRect(0, 0, 16, 16);
  ctx.fillStyle = P.shadow;
  ctx.fillRect(0, 0, 16, 16);
  for (let y = 1; y < 15; y++) {
    for (let x = 1; x < 15; x++) {
      const radius = (x - 7.5) ** 2 + (y - 7.5) ** 2;
      if (radius > 43) continue;
      ctx.fillStyle =
        (x * 7 + y * 11 + scheme.seed) % 17 < 3 ? scheme.strata : x + y > 17 ? scheme.shade : scheme.surface;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  // Survey marker and an offset glint make the small disk legible as a location.
  ctx.fillStyle = P.void;
  ctx.fillRect(6, 7, 4, 2);
  ctx.fillRect(7, 6, 2, 4);
  ctx.fillStyle = P.cream;
  ctx.fillRect(7, 7, 2, 2);
  ctx.fillStyle = scheme.strata;
  ctx.fillRect(3, 3, 2, 1);
}

export function SurveyIcon({ source }: { source: MiningType }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context) drawSurveyIcon(context, source);
  }, [source]);
  return <canvas ref={canvas} width={16} height={16} aria-hidden="true" />;
}
