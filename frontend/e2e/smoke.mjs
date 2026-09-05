/** E2E 冒烟测试：上传照片 → DECA 重建 → 3D 视口渲染真实 Mesh */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pngjs from 'pngjs';

const PNG = pngjs.PNG || pngjs;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PHOTO = process.env.PHOTO || 'D:/Pictures/iCloud Photos/Photos/E4971FAD-0AB4-4E91-AAA7-D2AE1E60C6E5.png';
const URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

try {
  await page.goto(URL, { waitUntil: 'networkidle' });
  console.log('[0] 页面已加载');

  await page.setInputFiles('#file-photo', PHOTO);
  console.log('[1] 已上传照片，等待重建…');

  const resp = await page.waitForResponse(
    (r) => r.url().includes('/api/reconstruct'),
    { timeout: 120000 },
  );
  console.log('[2] /api/reconstruct status:', resp.status());

  await page
    .waitForFunction(() => document.getElementById('toast')?.textContent?.includes('重建完成'), {
      timeout: 30000,
    })
    .catch(() => console.log('[warn] 未捕获完成 toast（可能已自动消失）'));

  await page.waitForTimeout(800);

  const shot = await page.locator('#viewport-3d').screenshot();
  await page.screenshot({ path: path.join(OUT, 'page.png') });
  console.log('[3] 截图已保存到 e2e/out/page.png');

  const png = PNG.sync.read(shot);
  let nonBg = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i] + png.data[i + 1] + png.data[i + 2] > 45) nonBg++;
  }
  const total = png.width * png.height;
  console.log(`[4] 视口非背景像素: ${nonBg} / ${total} (${((100 * nonBg) / total).toFixed(2)}%)`);

  // 切换到 Loomis 模式并截图
  await page.click('#tab-loomis');
  await page.waitForTimeout(400);
  const loomisShot = await page.locator('#viewport-3d').screenshot();
  await page.screenshot({ path: path.join(OUT, 'page-loomis.png') });
  const loomisPng = PNG.sync.read(loomisShot);
  let loomisNonBg = 0;
  for (let i = 0; i < loomisPng.data.length; i += 4) {
    if (loomisPng.data[i] + loomisPng.data[i + 1] + loomisPng.data[i + 2] > 45) loomisNonBg++;
  }
  const loomisTotal = loomisPng.width * loomisPng.height;
  console.log(`[5] Loomis 模式非背景像素: ${loomisNonBg} / ${loomisTotal} (${((100 * loomisNonBg) / loomisTotal).toFixed(2)}%)`);

  // 切换到 Bridgman 模式并截图
  await page.click('#tab-bridgman');
  await page.waitForTimeout(400);
  const bridgmanShot = await page.locator('#viewport-3d').screenshot();
  await page.screenshot({ path: path.join(OUT, 'page-bridgman.png') });
  const bridgmanPng = PNG.sync.read(bridgmanShot);
  let bridgmanNonBg = 0;
  for (let i = 0; i < bridgmanPng.data.length; i += 4) {
    if (bridgmanPng.data[i] + bridgmanPng.data[i + 1] + bridgmanPng.data[i + 2] > 45) bridgmanNonBg++;
  }
  const bridgmanTotal = bridgmanPng.width * bridgmanPng.height;
  console.log(`[6] Bridgman 模式非背景像素: ${bridgmanNonBg} / ${bridgmanTotal} (${((100 * bridgmanNonBg) / bridgmanTotal).toFixed(2)}%)`);

  console.log('[7] console 错误:', consoleErrors.length ? consoleErrors : '无');

  const ok = resp.status() === 200 && consoleErrors.length === 0 && nonBg > 1000 && loomisNonBg > 1000 && bridgmanNonBg > 1000;
  console.log(ok ? '✅ PASS' : '❌ FAIL');
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
}
