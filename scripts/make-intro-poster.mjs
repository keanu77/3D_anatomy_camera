// Draws the start screen's pictures from the app's own still demo, so the first screen shows the real model.
// Usage: start the dev server, then `node scripts/make-intro-poster.mjs [https://127.0.0.1:4173] [bones muscles nerves]`.
// With no names every picture is drawn again. Needs cwebp on the PATH.
// The output is a project-owned render; review it before committing a new one.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A wide picture for the head and hands, an upright one for a standing figure: in a wide frame the figure
// used a third of the width and was shown small.
const wide = { width: 900, height: 600 }, upright = { width: 600, height: 900 };
// `demo` is the address after `?still#`; `settings` are stored before the page loads; `stage` is the size the picture
// is drawn at, `crop` where the kept part of it begins and `size` how large that part is. Showing the whole real image
// (real: 1) leaves out the black head shape that hides the camera picture behind the skull: with no camera it would be
// a dark block at the neck.
const POSTERS = {
  // The head-and-hands demo is composed for 4:3; the poster is the 3:2 part of it that holds the skull and both hands.
  bones: { demo: 'demo', settings: {}, stage: { width: 1200, height: 900 }, crop: { x: 150, y: 190 }, size: wide },
  // The standing figure fills the height of any stage, so these two are drawn at the poster's own size.
  muscles: { demo: 'demo&bodyMuscles', settings: { real: 1 }, stage: upright, crop: { x: 0, y: 0 }, size: upright },
  nerves: { demo: 'demo&nervous', settings: { real: 1, bright: 1.6 }, stage: upright, crop: { x: 0, y: 0 }, size: upright },
};
const args = process.argv.slice(2);
const origin = args.find(value => /^https?:/.test(value)) || 'https://127.0.0.1:4173';
const names = args.filter(value => !/^https?:/.test(value));
const unknown = names.filter(name => !Object.hasOwn(POSTERS, name));
if (unknown.length) { console.error(`Unknown picture: ${unknown.join(', ')}. Known: ${Object.keys(POSTERS).join(', ')}.`); process.exit(1); }

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const work = mkdtempSync(join(tmpdir(), 'intro-poster-'));
try {
  for (const name of names.length ? names : Object.keys(POSTERS)) {
    const { demo, settings, stage, crop, size } = POSTERS[name];
    const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, ignoreHTTPSErrors: true, locale: 'zh-TW', deviceScaleFactor: 1 });
    await page.addInitScript(({ width, height, stored }) => {
      localStorage.clear(); localStorage.setItem('xr_settings', JSON.stringify(stored));
      const css = `#stage{width:${width}px!important;height:${height}px!important;max-width:none!important;aspect-ratio:auto!important;box-shadow:none!important}`
        + `.stagecol{place-items:start!important;padding:0!important;background-image:none!important}.inspection-ui,#live-status{display:none!important}`;
      const install = () => {
        if (!document.documentElement || document.getElementById('poster-stage')) return;
        const style = document.createElement('style'); style.id = 'poster-stage'; style.textContent = css; document.documentElement.append(style);
      };
      install(); new MutationObserver(install).observe(document, { childList: true, subtree: true });
    }, { ...stage, stored: settings });
    await page.goto(`${origin}/?still#${demo}`);
    await page.waitForFunction(() => (window.__ANATOMY_DIAGNOSTICS__?.()?.renderer?.frameCount || 0) > 0, null, { timeout: 90000 });
    await page.waitForTimeout(500);
    const box = await page.locator('#stage').boundingBox();
    const png = join(work, `${name}.png`), file = `src/intro-poster-${name}.webp`;
    await page.screenshot({ path: png, clip: { x: box.x + crop.x, y: box.y + crop.y, ...size } });
    await page.close();
    execFileSync('cwebp', ['-quiet', '-q', '82', '-m', '6', png, '-o', file]);
    console.log(`${file} written, ${size.width}x${size.height}.`);
  }
} finally { await browser.close(); rmSync(work, { recursive: true, force: true }); }
