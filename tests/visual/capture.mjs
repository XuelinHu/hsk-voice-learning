import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium } from 'playwright';
import { createAppServer } from '../../server/app.js';

const outputDir = resolve('test-results', 'visual');
await mkdir(outputDir, { recursive: true });
const server = createAppServer({
  tokenSecret: 'visual-test-secret',
  aiConfigured: true,
  aiClient: {
    async chat() {
      return '很好，这个表达很自然。\n【跟读句】你好，我想买一张去上海的火车票。\n【练习要求】注意“张”的声调，在“上海”后稍作停顿。';
    },
  },
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const executablePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({ executablePath, headless: true });

try {
  for (const app of ['studio', 'mission']) {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${baseUrl}/${app}/`);
      await page.getByRole('button', { name: '进入学习空间' }).click();
      await page.getByText('林晓语').waitFor();
      await page.getByPlaceholder('输入中文，按 Enter 发送').fill('你好，我想练习中文。');
      await page.getByRole('button', { name: '发送消息' }).click();
      await page.locator('.coach-practice').waitFor();
      await page.screenshot({ path: resolve(outputDir, `${app}-${viewport.name}.png`), fullPage: true });
      await page.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
