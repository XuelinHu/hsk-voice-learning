import 'dart:async';
import 'dart:convert';
import 'dart:io';

class SessionUser {
  const SessionUser({required this.displayName, required this.username});

  final String displayName;
  final String username;
}

class LoginSession {
  const LoginSession({required this.token, required this.user});

  final String token;
  final SessionUser user;
}

class ChatMessage {
  const ChatMessage({
    required this.role,
    required this.content,
    this.recordingPath,
    this.source = 'text',
  });

  final String role;
  final String content;
  final String? recordingPath;
  final String source;

  Map<String, String> toJson() => <String, String>{
    'role': role,
    'content': content,
    'source': recordingPath == null ? source : 'voice',
  };
}

class ConversationHistory {
  const ConversationHistory({
    required this.messages,
    this.level,
    this.scenario,
  });

  final List<ChatMessage> messages;
  final int? level;
  final String? scenario;
}

abstract class CoachGateway {
  String get baseUrl;
  set baseUrl(String value);

  Future<LoginSession> login(String username, String password);

  Future<String> transcribe({
    required String token,
    required List<int> wavBytes,
    required int level,
    required String scenario,
  });

  Future<String> chat({
    required String token,
    required int level,
    required String scenario,
    required List<ChatMessage> messages,
  });

  Future<ConversationHistory> loadLatestConversation({required String token});

  void resetConversation();
}

class CoachApi implements CoachGateway {
  CoachApi({
    this.baseUrl = 'http://127.0.0.1:8866',
    this.clientApp = 'unknown',
  });

  @override
  String baseUrl;
  final String clientApp;
  String? _conversationId;

  @override
  Future<LoginSession> login(String username, String password) async {
    final payload = await _post('/api/login', <String, Object?>{
      'username': username,
      'password': password,
      'appId': clientApp,
    });
    final user = payload['user'] as Map<String, dynamic>?;
    final token = payload['token'] as String?;
    if (user == null || token == null || token.isEmpty) {
      throw const CoachApiException('登录服务返回格式异常。');
    }
    _conversationId = null;
    return LoginSession(
      token: token,
      user: SessionUser(
        displayName: user['displayName'] as String? ?? username,
        username: user['username'] as String? ?? username,
      ),
    );
  }

  @override
  Future<String> transcribe({
    required String token,
    required List<int> wavBytes,
    required int level,
    required String scenario,
  }) async {
    final payload = await _post(
      '/api/transcribe',
      <String, Object?>{
        'audio': 'data:audio/wav;base64,${base64Encode(wavBytes)}',
        'locale': 'zh-CN',
        'appId': clientApp,
        'conversationId': _conversationId,
        'level': level,
        'scenario': scenario,
      },
      token: token,
      timeout: const Duration(seconds: 65),
    );
    final transcript = payload['transcript'] as String?;
    if (transcript == null || transcript.trim().isEmpty) {
      throw const CoachApiException('没有识别到有效中文，请再试一次。');
    }
    _conversationId = payload['conversationId'] as String? ?? _conversationId;
    return transcript.trim();
  }

  @override
  Future<String> chat({
    required String token,
    required int level,
    required String scenario,
    required List<ChatMessage> messages,
  }) async {
    final payload = await _post(
      '/api/chat',
      <String, Object?>{
        'level': level,
        'scenario': scenario,
        'appId': clientApp,
        'conversationId': _conversationId,
        'messages': messages
            .skip(messages.length > 24 ? messages.length - 24 : 0)
            .map((message) => message.toJson())
            .toList(),
      },
      token: token,
      timeout: const Duration(seconds: 45),
    );
    final reply = payload['reply'] as String?;
    if (reply == null || reply.trim().isEmpty) {
      throw const CoachApiException('AI 教练返回了空内容。');
    }
    _conversationId = payload['conversationId'] as String? ?? _conversationId;
    return reply.trim();
  }

  @override
  Future<ConversationHistory> loadLatestConversation({
    required String token,
  }) async {
    final payload = await _get(
      '/api/history/latest?appId=${Uri.encodeQueryComponent(clientApp)}',
      token: token,
    );
    _conversationId = payload['conversationId'] as String?;
    final rawMessages = payload['messages'] as List<dynamic>? ?? const [];
    return ConversationHistory(
      level: payload['level'] as int?,
      scenario: payload['scenario'] as String?,
      messages: rawMessages
          .whereType<Map<String, dynamic>>()
          .map(
            (message) => ChatMessage(
              role: message['role'] as String? ?? 'assistant',
              content: message['content'] as String? ?? '',
              source: message['source'] as String? ?? 'text',
            ),
          )
          .where((message) => message.content.isNotEmpty)
          .toList(),
    );
  }

  @override
  void resetConversation() {
    _conversationId = null;
  }

  Future<Map<String, dynamic>> _get(
    String path, {
    required String token,
  }) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 8);
    try {
      final root = baseUrl.trim().replaceAll(RegExp(r'/+$'), '');
      final request = await client.getUrl(Uri.parse('$root$path'));
      request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      final response = await request.close().timeout(
        const Duration(seconds: 15),
      );
      final payload =
          jsonDecode(await utf8.decoder.bind(response).join())
              as Map<String, dynamic>;
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw CoachApiException(payload['error'] as String? ?? '读取会话历史失败。');
      }
      return payload;
    } on SocketException {
      throw const CoachApiException('无法连接后台服务。');
    } on TimeoutException {
      throw const CoachApiException('读取会话历史超时。');
    } finally {
      client.close(force: true);
    }
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, Object?> body, {
    String? token,
    Duration timeout = const Duration(seconds: 15),
  }) async {
    final client = HttpClient()..connectionTimeout = const Duration(seconds: 8);
    try {
      final root = baseUrl.trim().replaceAll(RegExp(r'/+$'), '');
      final request = await client.postUrl(Uri.parse('$root$path'));
      request.headers.contentType = ContentType.json;
      if (token != null) {
        request.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      }
      request.write(jsonEncode(body));
      final response = await request.close().timeout(timeout);
      final responseBody = await utf8.decoder.bind(response).join();
      final payload = jsonDecode(responseBody) as Map<String, dynamic>;
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw CoachApiException(
          payload['error'] as String? ?? '服务请求失败（${response.statusCode}）。',
        );
      }
      return payload;
    } on SocketException {
      throw const CoachApiException(
        '无法连接本机服务。USB 调试时请先执行 adb reverse tcp:8866 tcp:8866。',
      );
    } on TimeoutException {
      throw const CoachApiException('服务响应超时，请稍后重试。');
    } on FormatException {
      throw const CoachApiException('服务返回格式异常。');
    } finally {
      client.close(force: true);
    }
  }
}

class CoachApiException implements Exception {
  const CoachApiException(this.message);
  final String message;
  @override
  String toString() => message;
}
