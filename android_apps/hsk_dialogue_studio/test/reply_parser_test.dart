import 'package:flutter_test/flutter_test.dart';

import 'package:hsk_dialogue_studio/reply_parser.dart';

void main() {
  test('拆分 AI 正文、跟读句和练习要求', () {
    final reply = parseCoachReply('很好，我们继续。\n【跟读句】我要一杯热拿铁。\n【练习要求】完整说两遍。');

    expect(reply.message, '很好，我们继续。');
    expect(reply.shadowing, '我要一杯热拿铁。');
    expect(reply.requirement, '完整说两遍。');
  });
}
