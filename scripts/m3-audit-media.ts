import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

type EvidenceRow = {
  scenarioId: string;
  panelScreenshotPath: string;
  mobileScreenshotPath: string;
};
type Manifest = { scenarios: EvidenceRow[] };
const root = resolve('test-results');
const manifest = JSON.parse(await readFile(resolve(root, 'm3-visual-audit.json'), 'utf8')) as Manifest;
const videos: string[] = [];
async function findVideos(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await findVideos(path);
    else if (entry.name.endsWith('.webm')) videos.push(path);
  }
}
await findVideos(root);

const browser = await chromium.launch({ headless: true, args: ['--allow-file-access-from-files'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 }, deviceScaleFactor: 1 });
  const sheets: string[] = [];
  async function sheet(name: string, cards: Array<{ label: string; path: string }>) {
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#172028;color:#f5f5f5;font:14px monospace}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:6px}.card{background:#344353;padding:4px;overflow:hidden}.card img{width:100%;height:auto;display:block}.label{height:30px;overflow:hidden}</style><div class="grid">${cards
      .map(
        (card) =>
          `<div class="card"><div class="label">${card.label.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</div><img src="${pathToFileURL(resolve(card.path)).href}"></div>`,
      )
      .join('')}</div>`;
    const htmlPath = resolve(root, `${name}.html`);
    const imagePath = resolve(root, `${name}.png`);
    await writeFile(htmlPath, html);
    await page.goto(pathToFileURL(htmlPath).href);
    await page.locator('img').first().waitFor();
    await page.evaluate(async () => {
      await Promise.all(
        [...document.images].map(async (image) => {
          if (!image.complete)
            await new Promise((done) => image.addEventListener('load', done, { once: true }));
        }),
      );
    });
    await page.screenshot({ path: imagePath, fullPage: true });
    sheets.push(imagePath);
  }

  for (const layout of ['panel', 'mobile'] as const) {
    const cards = manifest.scenarios.map((scenario) => ({
      label: `${scenario.scenarioId} · ${layout}`,
      path: scenario[layout === 'panel' ? 'panelScreenshotPath' : 'mobileScreenshotPath'],
    }));
    for (let index = 0; index < cards.length; index += 12)
      await sheet(`m3-audit-${layout}-${Math.floor(index / 12) + 1}`, cards.slice(index, index + 12));
  }

  const videoEvidence: Array<{
    path: string;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
    framePaths: string[];
    error: string | null;
  }> = [];
  const playerHtml = resolve(root, 'm3-audit-video-player.html');
  await writeFile(playerHtml, '<!doctype html><meta charset="utf-8"><video muted playsinline></video>');
  for (const [index, path] of videos.entries()) {
    await page.goto(pathToFileURL(playerHtml).href);
    const evidence = {
      path,
      durationSeconds: null as number | null,
      width: null as number | null,
      height: null as number | null,
      framePaths: [] as string[],
      error: null as string | null,
    };
    try {
      for (const [frame, fraction] of [0.05, 0.25, 0.5, 0.75, 0.95].entries()) {
        const data = await page.evaluate(
          async ({ url, fraction }) => {
            const video = document.querySelector('video')!;
            if (!video.src) {
              video.src = url;
              await Promise.race([
                new Promise<void>((done, fail) => {
                  video.addEventListener('loadedmetadata', () => done(), { once: true });
                  video.addEventListener('error', () => fail(new Error('Video metadata failed')), {
                    once: true,
                  });
                }),
                new Promise<never>((_, fail) =>
                  setTimeout(() => fail(new Error('Video metadata timed out')), 10_000),
                ),
              ]);
            }
            const target = Math.max(0, Math.min(video.duration - 0.05, video.duration * fraction));
            video.currentTime = target;
            await Promise.race([
              new Promise<void>((done) => video.addEventListener('seeked', () => done(), { once: true })),
              new Promise<never>((_, fail) =>
                setTimeout(() => fail(new Error('Video seek timed out')), 10_000),
              ),
            ]);
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d')!.drawImage(video, 0, 0);
            return {
              png: canvas.toDataURL('image/png').split(',')[1],
              duration: video.duration,
              width: video.videoWidth,
              height: video.videoHeight,
            };
          },
          { url: pathToFileURL(path).href, fraction },
        );
        evidence.durationSeconds = data.duration;
        evidence.width = data.width;
        evidence.height = data.height;
        const framePath = resolve(root, `m3-audit-video-${index + 1}-frame-${frame + 1}.png`);
        await writeFile(framePath, Buffer.from(data.png, 'base64'));
        evidence.framePaths.push(framePath);
      }
    } catch (error) {
      evidence.error = error instanceof Error ? error.message : 'Unknown local media error';
    }
    videoEvidence.push(evidence);
  }
  const videoCards = videoEvidence.flatMap((video, index) =>
    video.framePaths.map((path, frame) => ({ label: `video ${index + 1}, frame ${frame + 1}`, path })),
  );
  for (let index = 0; index < videoCards.length; index += 12)
    await sheet(`m3-audit-recordings-${Math.floor(index / 12) + 1}`, videoCards.slice(index, index + 12));

  await writeFile(
    resolve(root, 'm3-recording-audit.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        videoCount: videos.length,
        videos: videoEvidence,
        contactSheets: sheets,
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    JSON.stringify({
      videoCount: videos.length,
      contactSheetCount: sheets.length,
      errors: videoEvidence.filter((video) => video.error),
    }) + '\n',
  );
} finally {
  await browser.close();
}
