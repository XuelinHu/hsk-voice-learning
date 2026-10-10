import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCoachReply } from '../../apps/shared/coach-reply.js';

test('AI 回复会拆分正文、跟读句和练习要求', () => {
  const parsed = parseCoachReply([
    '当然可以，你可以这样点单。',
    '【跟读句】我要一杯热拿铁。',
    '【练习要求】注意“杯”的声调，完整说两遍。',
  ].join('\n'));

  assert.equal(parsed.message, '当然可以，你可以这样点单。');
  assert.equal(parsed.shadowing, '我要一杯热拿铁。');
  assert.equal(parsed.requirement, '注意“杯”的声调，完整说两遍。');
});

test('普通回答保持原文并提供默认跟读要求', () => {
  const parsed = parseCoachReply('你好！你今天想练习什么？');

  assert.equal(parsed.message, '你好！你今天想练习什么？');
  assert.equal(parsed.shadowing, '');
  assert.match(parsed.requirement, /完整跟读/);
});
