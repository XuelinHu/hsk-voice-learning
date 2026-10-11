import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';

import 'app_config.dart';
import 'coach_api.dart';
import 'native_speech_service.dart';
import 'reply_parser.dart';

const _ink = Color(0xFF1C2420);
const _paper = Color(0xFFF4F6F3);
const _line = Color(0xFFDDE3DE);

class HskVoiceApp extends StatelessWidget {
  const HskVoiceApp({
    super.key,
    required this.config,
    this.coachGateway,
    this.speechGateway,
  });

  final HskAppConfig config;
  final CoachGateway? coachGateway;
  final SpeechGateway? speechGateway;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: config.title,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme:
            ColorScheme.fromSeed(
              seedColor: config.primary,
              surface: _paper,
            ).copyWith(
              primary: config.primary,
              secondary: config.secondary,
              outlineVariant: _line,
            ),
        scaffoldBackgroundColor: _paper,
        cardTheme: const CardThemeData(
          elevation: 0,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(8)),
            side: BorderSide(color: _line),
          ),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(8)),
            borderSide: BorderSide(color: _line),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.all(Radius.circular(8)),
            borderSide: BorderSide(color: _line),
          ),
        ),
      ),
      home: _AppRoot(
        config: config,
        coach: coachGateway ?? CoachApi(baseUrl: config.apiBaseUrl, clientApp: config.applicationId),
        speech: speechGateway ?? NativeSpeechService(),
      ),
    );
  }
}

class _AppRoot extends StatefulWidget {
  const _AppRoot({
    required this.config,
    required this.coach,
    required this.speech,
  });

  final HskAppConfig config;
  final CoachGateway coach;
  final SpeechGateway speech;

  @override
  State<_AppRoot> createState() => _AppRootState();
}

class _AppRootState extends State<_AppRoot> {
  LoginSession? _session;

  @override
  Widget build(BuildContext context) {
    final session = _session;
    if (session == null) {
      return _LoginPage(
        config: widget.config,
        coach: widget.coach,
        onLoggedIn: (value) => setState(() => _session = value),
      );
    }
    return _ConversationPage(
      config: widget.config,
      coach: widget.coach,
      speech: widget.speech,
      session: session,
      onLogout: () => setState(() => _session = null),
    );
  }
}

class _LoginPage extends StatefulWidget {
  const _LoginPage({
    required this.config,
    required this.coach,
    required this.onLoggedIn,
  });

  final HskAppConfig config;
  final CoachGateway coach;
  final ValueChanged<LoginSession> onLoggedIn;

  @override
  State<_LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<_LoginPage> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final session = await widget.coach.login(
        _username.text.trim(),
        _password.text,
      );
      if (mounted) widget.onLoggedIn(session);
    } on CoachApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (error) {
      if (mounted) setState(() => _error = '登录失败：$error');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loginWithSso() async {
    if (_loading) return;
    setState(() { _loading = true; _error = null; });
    try {
      final session = await widget.coach.loginWithOidc(
        issuer: widget.config.oidcIssuer,
        clientId: widget.config.oidcClientId,
        redirectUrl: widget.config.oidcRedirectUrl,
      );
      if (mounted) widget.onLoggedIn(session);
    } on CoachApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (error) {
      if (mounted) setState(() => _error = '统一登录失败：$error');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _editServer() async {
    final controller = TextEditingController(text: widget.coach.baseUrl);
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('后端服务地址'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.url,
          decoration: InputDecoration(hintText: widget.config.apiBaseUrl),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('保存'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (value != null && value.isNotEmpty) {
      widget.coach.baseUrl = value;
      if (mounted) setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Container(
                      width: 54,
                      height: 54,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: widget.config.primary,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Text(
                        '汉',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 25,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    widget.config.title,
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      color: _ink,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(widget.config.subtitle),
                  const SizedBox(height: 30),
                  FilledButton.icon(
                    onPressed: _loading ? null : _loginWithSso,
                    icon: const Icon(Icons.key),
                    label: const Text('使用统一账号登录'),
                  ),
                  const SizedBox(height: 18),
                  const Divider(),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _username,
                    autofillHints: const <String>[AutofillHints.username],
                    decoration: const InputDecoration(
                      labelText: '账号',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    autofillHints: const <String>[AutofillHints.password],
                    onSubmitted: (_) => _login(),
                    decoration: const InputDecoration(
                      labelText: '密码',
                      prefixIcon: Icon(Icons.lock_outline),
                    ),
                  ),
                  if (_error != null) ...<Widget>[
                    const SizedBox(height: 12),
                    _Notice(text: _error!, isError: true),
                  ],
                  const SizedBox(height: 18),
                  FilledButton.icon(
                    onPressed: _loading ? null : _login,
                    icon: _loading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.login),
                    label: const Text('进入学习空间'),
                  ),
                  const SizedBox(height: 16),
                  TextButton.icon(
                    onPressed: _editServer,
                    icon: const Icon(Icons.dns_outlined, size: 18),
                    label: Text('服务地址 ${widget.coach.baseUrl}'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ConversationPage extends StatefulWidget {
  const _ConversationPage({
    required this.config,
    required this.coach,
    required this.speech,
    required this.session,
    required this.onLogout,
  });

  final HskAppConfig config;
  final CoachGateway coach;
  final SpeechGateway speech;
  final LoginSession session;
  final VoidCallback onLogout;

  @override
  State<_ConversationPage> createState() => _ConversationPageState();
}

class _ConversationPageState extends State<_ConversationPage> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  late final List<ChatMessage> _messages;
  int _level = 3;
  int _scenarioIndex = 0;
  bool _recording = false;
  bool _sending = false;
  bool _continuous = false;
  bool _hasEarlierHistory = false;
  bool _loadingEarlierHistory = false;
  String _status = '语音已就绪';
  String? _error;
  ConversationCursor? _historyCursor;

  String get _scenario => widget.config.scenarios[_scenarioIndex];

  @override
  void initState() {
    super.initState();
    _messages = <ChatMessage>[
      const ChatMessage(
        role: 'assistant',
        content: '你好，我们开始今天的中文练习。\n【跟读句】你好，我想练习中文。\n【练习要求】先听示范，再完整跟读两遍。',
      ),
    ];
    unawaited(_restoreHistory());
  }

  Future<void> _restoreHistory() async {
    try {
      final history = await widget.coach.loadLatestConversation(
        token: widget.session.token,
      );
      if (!mounted || history.messages.isEmpty) return;
      setState(() {
        _messages
          ..clear()
          ..addAll(history.messages);
        _historyCursor = history.nextCursor;
        _hasEarlierHistory = history.hasMore && history.nextCursor != null;
        if (history.level != null) _level = history.level!;
        final scenarioIndex = widget.config.scenarios.indexOf(
          history.scenario ?? '',
        );
        if (scenarioIndex >= 0) _scenarioIndex = scenarioIndex;
        _status = '已恢复上次文本会话';
      });
      _scrollToBottom();
    } on CoachApiException {
      if (mounted) setState(() => _status = '语音已就绪');
    }
  }

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    if (_recording) widget.speech.cancelRecording();
    widget.speech.stopSpeaking();
    widget.speech.stopRecordingPlayback();
    super.dispose();
  }

  Future<void> _startRecording() async {
    if (_recording || _sending) return;
    setState(() {
      _error = null;
      _status = '正在听，请说中文；说完后点击停止';
    });
    try {
      await widget.speech.stopSpeaking();
      await widget.speech.stopRecordingPlayback();
      await widget.speech.startRecording();
      if (mounted) setState(() => _recording = true);
    } on PlatformException catch (error) {
      if (mounted) {
        setState(() {
          _recording = false;
          _error = error.message ?? '无法启动麦克风录音。';
          _status = '录音启动失败';
        });
      }
    }
  }

  Future<void> _finishRecording() async {
    if (!_recording) return;
    RecordedAudio? recording;
    setState(() {
      _recording = false;
      _sending = true;
      _status = '正在识别本次跟读';
      _error = null;
    });
    try {
      recording = await widget.speech.stopRecording();
      final transcript = await widget.coach.transcribe(
        token: widget.session.token,
        wavBytes: recording.bytes,
        level: _level,
        scenario: _scenario,
      );
      if (!mounted) return;
      setState(() => _sending = false);
      await _sendUserMessage(transcript, recordingPath: recording.path);
    } on PlatformException catch (error) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = error.message ?? '跟读录音失败。';
          _status = '请重新录音';
        });
      }
    } on CoachApiException catch (error) {
      if (mounted) {
        setState(() {
          _sending = false;
          if (recording != null) {
            _messages.add(
              ChatMessage(
                role: 'user',
                content: '（语音未识别，录音已保留）',
                recordingPath: recording.path,
              ),
            );
          }
          _error = error.message;
          _status = '语音识别失败，可播放录音后重试';
        });
        _scrollToBottom();
      }
    }
  }

  Future<void> _sendText() async {
    final text = _input.text.trim();
    if (text.isEmpty) return;
    _input.clear();
    await _sendUserMessage(text);
  }

  Future<void> _sendUserMessage(String text, {String? recordingPath}) async {
    if (_sending) return;
    setState(() {
      _sending = true;
      _error = null;
      _status = 'AI 正在回应';
      _messages.add(
        ChatMessage(role: 'user', content: text, recordingPath: recordingPath),
      );
    });
    _scrollToBottom();
    try {
      final reply = await widget.coach.chat(
        token: widget.session.token,
        level: _level,
        scenario: _scenario,
        messages: _messages,
      );
      if (!mounted) return;
      setState(() {
        _messages.add(ChatMessage(role: 'assistant', content: reply));
        _status = '正在朗读教练回复';
      });
      _scrollToBottom();
      final parsed = parseCoachReply(reply);
      final spoken = parsed.shadowing.isEmpty
          ? parsed.message
          : '${parsed.message}。请跟读：${parsed.shadowing}';
      await widget.speech.speak(spoken);
      if (!mounted) return;
      setState(() {
        _sending = false;
        _status = '语音已就绪';
      });
      if (_continuous) await _startRecording();
    } on CoachApiException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          _status = '对话暂时中断';
        });
      }
    } on PlatformException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message ?? '中文朗读失败。';
          _status = '文字回复已收到';
        });
      }
    } finally {
      if (mounted) setState(() => _sending = false);
      _scrollToBottom();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeOut,
      );
    });
  }

  bool _handleHistoryScroll(UserScrollNotification notification) {
    if (notification.direction == ScrollDirection.forward &&
        notification.metrics.extentBefore <= 48) {
      unawaited(_loadEarlierHistory());
    }
    return false;
  }

  Future<void> _loadEarlierHistory() async {
    final cursor = _historyCursor;
    if (_loadingEarlierHistory || !_hasEarlierHistory || cursor == null) return;

    final oldMaxExtent = _scroll.hasClients
        ? _scroll.position.maxScrollExtent
        : 0.0;
    final oldPixels = _scroll.hasClients ? _scroll.position.pixels : 0.0;
    var insertedMessages = false;
    setState(() => _loadingEarlierHistory = true);
    try {
      final history = await widget.coach.loadLatestConversation(
        token: widget.session.token,
        before: cursor,
      );
      if (!mounted) return;
      if (history.messages.isEmpty) {
        setState(() {
          _hasEarlierHistory = false;
          _historyCursor = null;
        });
        return;
      }
      setState(() {
        _messages.insertAll(0, history.messages);
        _historyCursor = history.nextCursor;
        _hasEarlierHistory = history.hasMore && history.nextCursor != null;
      });
      insertedMessages = true;
    } on CoachApiException catch (error) {
      if (mounted) {
        setState(() {
          _error = error.message;
          _status = '历史加载失败';
        });
      }
    } finally {
      if (mounted) {
        setState(() => _loadingEarlierHistory = false);
        await WidgetsBinding.instance.endOfFrame;
        if (insertedMessages && _scroll.hasClients) {
          final delta = _scroll.position.maxScrollExtent - oldMaxExtent;
          _scroll.jumpTo(
            (oldPixels + delta)
                .clamp(
                  _scroll.position.minScrollExtent,
                  _scroll.position.maxScrollExtent,
                )
                .toDouble(),
          );
        }
      }
    }
  }

  Future<void> _editServer() async {
    final controller = TextEditingController(text: widget.coach.baseUrl);
    final value = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('后端服务地址'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.url,
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, controller.text.trim()),
            child: const Text('保存'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (value != null && value.isNotEmpty) widget.coach.baseUrl = value;
  }

  void _newConversation() {
    widget.coach.resetConversation();
    setState(() {
      _messages
        ..clear()
        ..add(
          const ChatMessage(
            role: 'assistant',
            content: '新会话已经开始。\n【跟读句】我们开始吧。\n【练习要求】自然地说出完整句子。',
          ),
        );
      _status = '新会话已开始';
      _error = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final learnerTurns = _messages.where((item) => item.role == 'user').length;
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              widget.config.title,
              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
            ),
            Text(
              widget.session.user.displayName,
              style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w400),
            ),
          ],
        ),
        actions: <Widget>[
          IconButton(
            tooltip: '开始新会话',
            onPressed: _newConversation,
            icon: const Icon(Icons.refresh),
          ),
          IconButton(
            tooltip: '服务设置',
            onPressed: _editServer,
            icon: const Icon(Icons.settings_outlined),
          ),
          IconButton(
            tooltip: '退出登录',
            onPressed: widget.onLogout,
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: <Widget>[
            Container(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(bottom: BorderSide(color: _line)),
              ),
              child: Column(
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: DropdownButtonFormField<int>(
                          isExpanded: true,
                          initialValue: _level,
                          decoration: const InputDecoration(
                            labelText: 'HSK 等级',
                            isDense: true,
                          ),
                          items: List<DropdownMenuItem<int>>.generate(
                            6,
                            (index) => DropdownMenuItem<int>(
                              value: index + 1,
                              child: Text('HSK ${index + 1}'),
                            ),
                          ),
                          onChanged: (value) {
                            if (value != null) setState(() => _level = value);
                          },
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: DropdownButtonFormField<int>(
                          isExpanded: true,
                          initialValue: _scenarioIndex,
                          decoration: const InputDecoration(
                            labelText: '练习场景',
                            isDense: true,
                          ),
                          items: widget.config.scenarios
                              .asMap()
                              .entries
                              .map(
                                (entry) => DropdownMenuItem<int>(
                                  value: entry.key,
                                  child: Text(
                                    entry.value,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              )
                              .toList(),
                          onChanged: (value) {
                            if (value != null) {
                              setState(() => _scenarioIndex = value);
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                  if (widget.config.isMission) ...<Widget>[
                    const SizedBox(height: 10),
                    Row(
                      children: <Widget>[
                        Text('任务进度 $learnerTurns / 5'),
                        const SizedBox(width: 10),
                        Expanded(
                          child: LinearProgressIndicator(
                            value: (learnerTurns / 5).clamp(0, 1),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            Expanded(
              child: NotificationListener<UserScrollNotification>(
                onNotification: _handleHistoryScroll,
                child: ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.fromLTRB(14, 16, 14, 12),
                  itemCount:
                      _messages.length +
                      (_hasEarlierHistory || _loadingEarlierHistory ? 1 : 0),
                  itemBuilder: (context, index) {
                    final hasHeader =
                        _hasEarlierHistory || _loadingEarlierHistory;
                    if (hasHeader && index == 0) {
                      return SizedBox(
                        height: _loadingEarlierHistory ? 40 : 1,
                        child: _loadingEarlierHistory
                            ? const Center(child: CircularProgressIndicator())
                            : null,
                      );
                    }
                    final messageIndex = index - (hasHeader ? 1 : 0);
                    return _MessageBubble(
                      message: _messages[messageIndex],
                      primary: widget.config.primary,
                      secondary: widget.config.secondary,
                      speech: widget.speech,
                    );
                  },
                ),
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                child: _Notice(text: _error!, isError: true),
              ),
            Container(
              padding: EdgeInsets.fromLTRB(
                12,
                9,
                12,
                MediaQuery.viewInsetsOf(context).bottom > 0 ? 8 : 12,
              ),
              decoration: const BoxDecoration(
                color: Colors.white,
                border: Border(top: BorderSide(color: _line)),
              ),
              child: Column(
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Icon(
                        _recording ? Icons.graphic_eq : Icons.circle,
                        size: _recording ? 18 : 8,
                        color: _recording ? Colors.red : Colors.green,
                      ),
                      const SizedBox(width: 7),
                      Expanded(
                        child: Text(
                          _status,
                          style: const TextStyle(fontSize: 11),
                        ),
                      ),
                      Text(
                        '$learnerTurns 轮',
                        style: const TextStyle(fontSize: 11),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: <Widget>[
                      IconButton.filled(
                        tooltip: _recording ? '停止并识别' : '开始跟读录音',
                        style: IconButton.styleFrom(
                          backgroundColor: _recording
                              ? Colors.red
                              : widget.config.primary,
                        ),
                        onPressed: _sending
                            ? null
                            : (_recording ? _finishRecording : _startRecording),
                        icon: Icon(_recording ? Icons.stop : Icons.mic),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _input,
                          enabled: !_sending && !_recording,
                          minLines: 1,
                          maxLines: 3,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => _sendText(),
                          decoration: const InputDecoration(
                            hintText: '输入中文',
                            isDense: true,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        tooltip: '发送消息',
                        onPressed: _sending || _recording ? null : _sendText,
                        icon: _sending
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.send),
                      ),
                    ],
                  ),
                  Row(
                    children: <Widget>[
                      Switch(
                        value: _continuous,
                        onChanged: (value) {
                          setState(() => _continuous = value);
                        },
                      ),
                      const Text('连续语音对话', style: TextStyle(fontSize: 12)),
                      const Spacer(),
                      Text(_scenario, style: const TextStyle(fontSize: 11)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({
    required this.message,
    required this.primary,
    required this.secondary,
    required this.speech,
  });

  final ChatMessage message;
  final Color primary;
  final Color secondary;
  final SpeechGateway speech;

  @override
  Widget build(BuildContext context) {
    final isUser = message.role == 'user';
    final parsed = isUser ? null : parseCoachReply(message.content);
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 360),
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isUser ? primary : Colors.white,
          border: isUser ? null : Border.all(color: _line),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              parsed?.message ?? message.content,
              style: TextStyle(
                color: isUser ? Colors.white : _ink,
                height: 1.5,
              ),
            ),
            if (message.recordingPath != null) ...<Widget>[
              const SizedBox(height: 8),
              _RecordingPlaybackButton(
                path: message.recordingPath!,
                speech: speech,
                foreground: Colors.white,
              ),
            ],
            if (parsed != null) ...<Widget>[
              const SizedBox(height: 9),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: secondary.withValues(alpha: 0.09),
                  border: Border(left: BorderSide(color: secondary, width: 3)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    if (parsed.shadowing.isNotEmpty) ...<Widget>[
                      const Text(
                        '跟读句',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(parsed.shadowing),
                      Align(
                        alignment: Alignment.centerRight,
                        child: IconButton(
                          tooltip: '播放跟读示范',
                          visualDensity: VisualDensity.compact,
                          onPressed: () => speech.speak(parsed.shadowing),
                          icon: Icon(Icons.volume_up_outlined, color: primary),
                        ),
                      ),
                    ],
                    const Text(
                      '练习要求',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      parsed.requirement,
                      style: const TextStyle(fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RecordingPlaybackButton extends StatefulWidget {
  const _RecordingPlaybackButton({
    required this.path,
    required this.speech,
    required this.foreground,
  });

  final String path;
  final SpeechGateway speech;
  final Color foreground;

  @override
  State<_RecordingPlaybackButton> createState() =>
      _RecordingPlaybackButtonState();
}

class _RecordingPlaybackButtonState extends State<_RecordingPlaybackButton> {
  bool _playing = false;
  bool _loading = false;
  int _generation = 0;

  Future<void> _toggle() async {
    final generation = ++_generation;
    if (_playing) {
      await widget.speech.stopRecordingPlayback();
      if (mounted) setState(() => _playing = false);
      return;
    }
    setState(() => _loading = true);
    try {
      final duration = await widget.speech.playRecording(widget.path);
      if (!mounted) return;
      setState(() {
        _loading = false;
        _playing = true;
      });
      await Future<void>.delayed(duration + const Duration(milliseconds: 200));
      if (mounted && generation == _generation) {
        setState(() => _playing = false);
      }
    } on PlatformException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _playing = false;
      });
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(error.message ?? '录音播放失败。')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return TextButton.icon(
      onPressed: _loading ? null : _toggle,
      style: TextButton.styleFrom(foregroundColor: widget.foreground),
      icon: _loading
          ? SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: widget.foreground,
              ),
            )
          : Icon(
              _playing ? Icons.stop_circle_outlined : Icons.play_circle_outline,
            ),
      label: Text(_playing ? '停止回放' : '播放我的跟读'),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, required this.isError});

  final String text;
  final bool isError;

  @override
  Widget build(BuildContext context) {
    final color = isError ? const Color(0xFFAA3038) : Colors.green;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: <Widget>[
          Icon(
            isError ? Icons.error_outline : Icons.info_outline,
            color: color,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(color: color)),
          ),
        ],
      ),
    );
  }
}
