// This is a basic Flutter widget test.
//
// To perform an interaction with a widget in your test, use the WidgetTester
// utility in the flutter_test package. For example, you can send tap and scroll
// gestures. You can also use WidgetTester to find child widgets in the widget
// tree, read text, and verify that the values of widget properties are correct.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hsk_dialogue_studio/app.dart';
import 'package:hsk_dialogue_studio/app_config.dart';
import 'package:hsk_dialogue_studio/coach_api.dart';
import 'package:hsk_dialogue_studio/native_speech_service.dart';

void main() {
  testWidgets('显示 APK 登录页且不预填演示凭据', (tester) async {
    await tester.pumpWidget(
      HskVoiceApp(
        config: dialogueStudioConfig,
        coachGateway: _FakeCoachGateway(),
        speechGateway: _FakeSpeechGateway(),
      ),
    );

    expect(find.text('HSK 对话研习室'), findsOneWidget);
    expect(find.text('进入学习空间'), findsOneWidget);
    expect(find.text('hskstudent'), findsNothing);
    expect(find.textContaining('Hsk@2026'), findsNothing);
    final usernameField = tester.widget<TextField>(
      find.byType(TextField).first,
    );
    final passwordField = tester.widget<TextField>(
      find.byType(TextField).at(1),
    );
    expect(usernameField.controller?.text, isEmpty);
    expect(passwordField.controller?.text, isEmpty);
  });

  testWidgets('连续语音模式在教练朗读完成后自动开始录音', (tester) async {
    final speech = _FakeSpeechGateway();
    await tester.pumpWidget(
      HskVoiceApp(
        config: dialogueStudioConfig,
        coachGateway: _FakeCoachGateway(),
        speechGateway: speech,
      ),
    );

    await tester.tap(find.text('进入学习空间'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(Switch));
    await tester.enterText(find.byType(TextField), '你好');
    await tester.tap(find.byTooltip('发送消息'));
    await tester.pumpAndSettle();

    expect(speech.startRecordingCalls, 1);
    expect(find.textContaining('正在听'), findsOneWidget);
  });

  testWidgets('登录后恢复最近一次后台文本会话', (tester) async {
    await tester.pumpWidget(
      HskVoiceApp(
        config: dialogueStudioConfig,
        coachGateway: _FakeCoachGateway(
          history: const <ChatMessage>[
            ChatMessage(role: 'user', content: '数据库里的上次练习。'),
          ],
        ),
        speechGateway: _FakeSpeechGateway(),
      ),
    );

    await tester.tap(find.text('进入学习空间'));
    await tester.pumpAndSettle();

    expect(find.text('数据库里的上次练习。'), findsOneWidget);
  });

  testWidgets('滚动到历史顶部后追加更早的会话消息', (tester) async {
    final coach = _FakeCoachGateway(
      history: List<ChatMessage>.generate(
        30,
        (index) => ChatMessage(role: 'user', content: '近期消息 $index'),
      ),
      earlierHistory: const <ChatMessage>[
        ChatMessage(role: 'assistant', content: '更早的后台练习。'),
      ],
    );
    await tester.pumpWidget(
      HskVoiceApp(
        config: dialogueStudioConfig,
        coachGateway: coach,
        speechGateway: _FakeSpeechGateway(),
      ),
    );

    await tester.tap(find.text('进入学习空间'));
    await tester.pumpAndSettle();
    expect(find.text('更早的后台练习。'), findsNothing);

    for (var index = 0; index < 8; index += 1) {
      await tester.drag(find.byType(ListView), const Offset(0, 400));
      await tester.pumpAndSettle();
    }

    expect(coach.earlierHistoryLoads, 1);
    expect(find.text('更早的后台练习。'), findsOneWidget);
  });
}

class _FakeCoachGateway implements CoachGateway {
  _FakeCoachGateway({
    this.history = const <ChatMessage>[],
    this.earlierHistory = const <ChatMessage>[],
  });

  final List<ChatMessage> history;
  final List<ChatMessage> earlierHistory;
  int earlierHistoryLoads = 0;
  @override
  String baseUrl = 'http://127.0.0.1:8040';

  @override
  Future<LoginSession> login(String username, String password) async =>
      const LoginSession(
        token: 'test-token',
        user: SessionUser(displayName: '测试学员', username: 'hskstudent'),
      );

  @override
  Future<String> chat({
    required String token,
    required int level,
    required String scenario,
    required List<ChatMessage> messages,
  }) async => '你好。\n【跟读句】你好。\n【练习要求】完整说两遍。';

  @override
  Future<String> transcribe({
    required String token,
    required List<int> wavBytes,
    required int level,
    required String scenario,
  }) async => '你好';

  @override
  Future<ConversationHistory> loadLatestConversation({
    required String token,
    ConversationCursor? before,
  }) async {
    if (before == null) {
      return ConversationHistory(
        messages: history,
        hasMore: earlierHistory.isNotEmpty,
        nextCursor: earlierHistory.isEmpty
            ? null
            : const ConversationCursor(
                conversationId: '22222222-2222-4222-8222-222222222222',
                id: '100',
                createdAt: '2026-10-11T02:00:00.123456Z',
              ),
      );
    }
    earlierHistoryLoads += 1;
    return ConversationHistory(messages: earlierHistory);
  }

  @override
  void resetConversation() {}
}

class _FakeSpeechGateway implements SpeechGateway {
  int startRecordingCalls = 0;

  @override
  Future<void> startRecording() async {
    startRecordingCalls += 1;
  }

  @override
  Future<RecordedAudio> stopRecording() async =>
      const RecordedAudio(bytes: <int>[1, 2], path: 'test.wav');
  @override
  Future<void> cancelRecording() async {}
  @override
  Future<Duration> playRecording(String path) async => Duration.zero;
  @override
  Future<void> stopRecordingPlayback() async {}
  @override
  Future<void> speak(String text, {double rate = 0.88}) async {}
  @override
  Future<void> stopSpeaking() async {}
}
