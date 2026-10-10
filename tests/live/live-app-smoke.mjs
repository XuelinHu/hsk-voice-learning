import assert from 'node:assert/strict';

import { chromium } from 'playwright';

const baseUrl = process.env.HSK_BASE_URL || 'http://127.0.0.1:8866';
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
});

try {
  for (const path of ['/studio/', '/mission/']) {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}${path}`);
    await page.getByRole('button', { name: '进入学习空间' }).click();
    await page.getByText('林晓语').waitFor();
    await page.getByPlaceholder('输入中文，按 Enter 发送').fill('你好，请和我练习一句中文。');
    await page.getByRole('button', { name: '发送消息' }).click();
    const answer = page.locator('.message--assistant:not(.message--pending) p').last();
    await answer.waitFor({ timeout: 30_000 });
    const reply = (await answer.textContent())?.trim();
    assert.ok(reply && reply.length >= 4, `${path} 未收到有效百炼回答`);
    await page.locator('.coach-practice').last().waitFor();
    const practiceText = await page.locator('.coach-practice').last().textContent();
    assert.match(practiceText, /跟读句/);
    assert.match(practiceText, /练习要求/);
    console.log(`${path} live reply received (${reply.length} chars)`);
    await page.close();
  }
} finally {
  await browser.close();
}
