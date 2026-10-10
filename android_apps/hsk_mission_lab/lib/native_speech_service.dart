import 'package:flutter/services.dart';

class RecordedAudio {
  const RecordedAudio({required this.bytes, required this.path});

  final List<int> bytes;
  final String path;

  factory RecordedAudio.fromMap(Map<Object?, Object?> map) {
    final bytes = map['bytes'] as Uint8List?;
    final path = map['path'] as String?;
    if (bytes == null || bytes.isEmpty || path == null || path.isEmpty) {
      throw PlatformException(code: 'empty_recording', message: '没有录到有效声音。');
    }
    return RecordedAudio(bytes: bytes, path: path);
  }
}

abstract class SpeechGateway {
  Future<void> startRecording();
  Future<RecordedAudio> stopRecording();
  Future<void> cancelRecording();
  Future<Duration> playRecording(String path);
  Future<void> stopRecordingPlayback();
  Future<void> speak(String text, {double rate = 0.88});
  Future<void> stopSpeaking();
}

class NativeSpeechService implements SpeechGateway {
  static const MethodChannel _channel = MethodChannel('com.hskvoice/speech');

  @override
  Future<void> startRecording() =>
      _channel.invokeMethod<void>('startRecording');

  @override
  Future<RecordedAudio> stopRecording() async {
    final value = await _channel.invokeMapMethod<Object?, Object?>(
      'stopRecording',
    );
    if (value == null) {
      throw PlatformException(code: 'empty_recording', message: '没有录到有效声音。');
    }
    return RecordedAudio.fromMap(value);
  }

  @override
  Future<void> cancelRecording() =>
      _channel.invokeMethod<void>('cancelRecording');

  @override
  Future<Duration> playRecording(String path) async {
    final durationMs = await _channel.invokeMethod<int>('playRecording', {
      'path': path,
    });
    return Duration(milliseconds: durationMs ?? 0);
  }

  @override
  Future<void> stopRecordingPlayback() =>
      _channel.invokeMethod<void>('stopRecordingPlayback');

  @override
  Future<void> speak(String text, {double rate = 0.88}) =>
      _channel.invokeMethod<void>('speak', <String, Object>{
        'text': text,
        'locale': 'zh-CN',
        'rate': rate,
      });

  @override
  Future<void> stopSpeaking() => _channel.invokeMethod<void>('stopSpeaking');
}
