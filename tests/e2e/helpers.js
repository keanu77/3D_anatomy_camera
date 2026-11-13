import { expect } from '@playwright/test';

// A demo draws at once. With the camera the first frame waits for a tracking model to start,
// which can take over a minute on software-rendered CI: pass LIVE_START there.
export const LIVE_START = 100000;
export async function rendered(page, timeout = 30000) {
  await expect.poll(() => page.evaluate(() => window.__ANATOMY_DIAGNOSTICS__?.()?.renderer?.frameCount || 0), { timeout }).toBeGreaterThan(0);
}

// The single layers, the head fit and the read-out are folded away until asked for: open them as a viewer would.
export async function openAdvanced(page) {
  if (!(await page.locator('#advanced').evaluate((node) => node.open))) await page.locator('#advanced > summary').click();
}

export async function storeSettings(page, settings) {
  await page.addInitScript((value) => localStorage.setItem('xr_settings', JSON.stringify(value)), settings);
}

export async function fixedStage(page) {
  await page.addInitScript(() => {
    // This fixture compares anatomy pixels; both original in-stage controls and
    // the new sibling inspection toolbar are covered by separate UI tests.
    const css = '.wrap{justify-content:flex-start!important}#stage{position:relative!important;width:640px!important;height:480px!important;min-width:640px!important;max-width:none!important;aspect-ratio:auto!important;border:0!important;border-radius:0!important;background:#0b1220!important;flex:none!important}#stage>:not(canvas):not(video){display:none!important}.stagecol{width:640px!important;flex:none!important}.mobile-controls,.inspection-ui{display:none!important}';
    const install = () => {
      if (!document.documentElement) return;
      if (document.getElementById('qa-stage-size')) return;
      const style = document.createElement('style'); style.id = 'qa-stage-size'; style.textContent = css;
      document.documentElement.append(style);
    };
    install();
    new MutationObserver(install).observe(document, { childList: true, subtree: true });
  });
}

export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /content security policy|refused to|unsafe-eval|wasm-unsafe-eval/i.test(msg.text())) errors.push(msg.text());
  });
  return errors;
}
