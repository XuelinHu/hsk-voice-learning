package com.hskvoice.hsk_mission_lab

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Locale

class MainActivity : FlutterActivity(), TextToSpeech.OnInitListener {
    private val channelName = "com.hskvoice/speech"
    private val microphoneRequestCode = 5201
    private var textToSpeech: TextToSpeech? = null
    private var ttsReady = false
    private var pendingSpeakResult: MethodChannel.Result? = null
    private var pendingRecordingStartResult: MethodChannel.Result? = null
    private var audioRecord: AudioRecord? = null
    private var recordingThread: Thread? = null
    private var recordingBuffer: ByteArrayOutputStream? = null
    private var mediaPlayer: MediaPlayer? = null
    @Volatile private var isRecording = false

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        textToSpeech = TextToSpeech(this, this)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result -> handleCall(call, result) }
    }

    override fun onInit(status: Int) {
        ttsReady = status == TextToSpeech.SUCCESS
        textToSpeech?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) = Unit

            override fun onDone(utteranceId: String?) {
                runOnUiThread {
                    pendingSpeakResult?.success(null)
                    pendingSpeakResult = null
                }
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                finishSpeakError("tts_failed", "中文朗读失败。")
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                finishSpeakError("tts_failed", "中文朗读失败（错误码 $errorCode）。")
            }
        })
    }

    private fun finishSpeakError(code: String, message: String) {
        runOnUiThread {
            pendingSpeakResult?.error(code, message, null)
            pendingSpeakResult = null
        }
    }

    private fun handleCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "speak" -> speak(call, result)
            "stopSpeaking" -> {
                textToSpeech?.stop()
                pendingSpeakResult?.success(null)
                pendingSpeakResult = null
                result.success(null)
            }
            "startRecording" -> requestRecording(result)
            "stopRecording" -> stopRecording(result)
            "cancelRecording" -> {
                releaseRecording(discard = true)
                result.success(null)
            }
            "playRecording" -> playRecording(call.argument<String>("path"), result)
            "stopRecordingPlayback" -> {
                stopPlayback()
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    private fun speak(call: MethodCall, result: MethodChannel.Result) {
        if (!ttsReady) {
            result.error("tts_unavailable", "系统中文朗读服务尚未准备好。", null)
            return
        }
        if (pendingSpeakResult != null) {
            result.error("tts_busy", "中文朗读正在进行中。", null)
            return
        }
        val text = call.argument<String>("text").orEmpty().trim()
        if (text.isEmpty()) {
            result.error("empty_text", "没有可朗读的文字。", null)
            return
        }
        stopPlayback()
        val languageStatus = textToSpeech?.setLanguage(Locale.SIMPLIFIED_CHINESE)
        if (languageStatus == TextToSpeech.LANG_MISSING_DATA ||
            languageStatus == TextToSpeech.LANG_NOT_SUPPORTED
        ) {
            result.error("locale_unavailable", "系统缺少简体中文语音包。", null)
            return
        }
        val rate = (call.argument<Double>("rate") ?: 0.88).toFloat()
        textToSpeech?.setSpeechRate(rate)
        pendingSpeakResult = result
        val status = textToSpeech?.speak(
            text,
            TextToSpeech.QUEUE_FLUSH,
            null,
            "hsk-${System.currentTimeMillis()}",
        )
        if (status == TextToSpeech.ERROR) {
            pendingSpeakResult = null
            result.error("tts_failed", "中文朗读启动失败。", null)
        }
    }

    private fun requestRecording(result: MethodChannel.Result) {
        if (isRecording || pendingRecordingStartResult != null) {
            result.error("recording_busy", "跟读录音正在进行中。", null)
            return
        }
        pendingRecordingStartResult = result
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), microphoneRequestCode)
            return
        }
        startRecording()
    }

    private fun startRecording() {
        val result = pendingRecordingStartResult ?: return
        val sampleRate = 16_000
        val channel = AudioFormat.CHANNEL_IN_MONO
        val encoding = AudioFormat.ENCODING_PCM_16BIT
        val minBuffer = AudioRecord.getMinBufferSize(sampleRate, channel, encoding)
        if (minBuffer <= 0) {
            pendingRecordingStartResult = null
            result.error("recording_unavailable", "无法初始化麦克风录音。", null)
            return
        }
        val recorder = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                sampleRate,
                channel,
                encoding,
                maxOf(minBuffer, 4096),
            )
        } catch (_: SecurityException) {
            pendingRecordingStartResult = null
            result.error("permission_denied", "麦克风权限未授予。", null)
            return
        }
        if (recorder.state != AudioRecord.STATE_INITIALIZED) {
            recorder.release()
            pendingRecordingStartResult = null
            result.error("recording_unavailable", "麦克风录音初始化失败。", null)
            return
        }
        audioRecord = recorder
        recordingBuffer = ByteArrayOutputStream()
        isRecording = true
        recorder.startRecording()
        recordingThread = Thread({
            val buffer = ByteArray(4096)
            val maximumBytes = sampleRate * 2 * 60
            while (isRecording && (recordingBuffer?.size() ?: 0) < maximumBytes) {
                val read = recorder.read(buffer, 0, buffer.size)
                if (read > 0) {
                    synchronized(this) { recordingBuffer?.write(buffer, 0, read) }
                }
            }
        }, "hsk-audio-recorder").apply { start() }
        pendingRecordingStartResult = null
        result.success(null)
    }

    private fun stopRecording(result: MethodChannel.Result) {
        if (!isRecording) {
            result.error("recording_inactive", "当前没有正在进行的跟读录音。", null)
            return
        }
        val pcm = releaseRecording(discard = false)
        if (pcm == null || pcm.size < 3_200) {
            result.error("empty_recording", "录音太短，请完整说完一句话。", null)
            return
        }
        val wav = createWav(pcm, 16_000)
        val directory = File(filesDir, "hsk_recordings").apply { mkdirs() }
        val file = File(directory, "practice_${System.currentTimeMillis()}.wav")
        try {
            file.writeBytes(wav)
        } catch (_: Exception) {
            result.error("recording_save_failed", "跟读录音保存失败。", null)
            return
        }
        result.success(mapOf("bytes" to wav, "path" to file.absolutePath))
    }

    private fun playRecording(path: String?, result: MethodChannel.Result) {
        if (path.isNullOrBlank()) {
            result.error("recording_missing", "找不到本次跟读录音。", null)
            return
        }
        val file = try {
            File(path).canonicalFile
        } catch (_: Exception) {
            result.error("recording_missing", "录音路径无效。", null)
            return
        }
        val recordingsRoot = File(filesDir, "hsk_recordings").canonicalFile
        if (!file.path.startsWith(recordingsRoot.path + File.separator) || !file.isFile) {
            result.error("recording_missing", "录音文件不存在。", null)
            return
        }
        stopPlayback()
        textToSpeech?.stop()
        pendingSpeakResult?.success(null)
        pendingSpeakResult = null
        try {
            mediaPlayer = MediaPlayer().apply {
                setDataSource(file.absolutePath)
                prepare()
                start()
            }
            result.success(mediaPlayer?.duration ?: 0)
        } catch (_: Exception) {
            stopPlayback()
            result.error("playback_failed", "跟读录音播放失败。", null)
        }
    }

    private fun stopPlayback() {
        try {
            mediaPlayer?.stop()
        } catch (_: IllegalStateException) {
            // Playback may already have completed.
        }
        mediaPlayer?.release()
        mediaPlayer = null
    }

    private fun releaseRecording(discard: Boolean): ByteArray? {
        isRecording = false
        try {
            audioRecord?.stop()
        } catch (_: IllegalStateException) {
            // Recorder may already be stopped by Android.
        }
        try {
            recordingThread?.join(1_500)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }
        audioRecord?.release()
        audioRecord = null
        recordingThread = null
        val pcm = if (discard) null else synchronized(this) {
            recordingBuffer?.toByteArray()
        }
        recordingBuffer?.close()
        recordingBuffer = null
        return pcm
    }

    private fun createWav(pcm: ByteArray, sampleRate: Int): ByteArray {
        val header = ByteArray(44)
        writeAscii(header, 0, "RIFF")
        writeInt(header, 4, 36 + pcm.size)
        writeAscii(header, 8, "WAVE")
        writeAscii(header, 12, "fmt ")
        writeInt(header, 16, 16)
        writeShort(header, 20, 1)
        writeShort(header, 22, 1)
        writeInt(header, 24, sampleRate)
        writeInt(header, 28, sampleRate * 2)
        writeShort(header, 32, 2)
        writeShort(header, 34, 16)
        writeAscii(header, 36, "data")
        writeInt(header, 40, pcm.size)
        return header + pcm
    }

    private fun writeAscii(target: ByteArray, offset: Int, value: String) {
        value.toByteArray(Charsets.US_ASCII).copyInto(target, offset)
    }

    private fun writeInt(target: ByteArray, offset: Int, value: Int) {
        target[offset] = value.toByte()
        target[offset + 1] = (value shr 8).toByte()
        target[offset + 2] = (value shr 16).toByte()
        target[offset + 3] = (value shr 24).toByte()
    }

    private fun writeShort(target: ByteArray, offset: Int, value: Int) {
        target[offset] = value.toByte()
        target[offset + 1] = (value shr 8).toByte()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != microphoneRequestCode) return
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            startRecording()
        } else {
            pendingRecordingStartResult?.error(
                "permission_denied",
                "麦克风权限未授予。",
                null,
            )
            pendingRecordingStartResult = null
        }
    }

    override fun onDestroy() {
        pendingRecordingStartResult?.error("cancelled", "应用已关闭。", null)
        pendingRecordingStartResult = null
        pendingSpeakResult?.success(null)
        pendingSpeakResult = null
        releaseRecording(discard = true)
        stopPlayback()
        textToSpeech?.stop()
        textToSpeech?.shutdown()
        super.onDestroy()
    }
}
