# Android APK 真机测试报告

测试日期：2026-08-12

## 结果

| 项目 | 自动化 | release 构建 | 安装启动 | 录音 | ASR/AI/TTS | 跟读回放 | 连续模式 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| HSK 对话研习室 | 3/3 通过 | 通过 | 通过 | 通过 | 通过 | 通过 | 通过 |
| HSK 口语任务站 | 3/3 通过 | 通过 | 通过 | 通过 | 通过 | 通过 | 通过 |

后端 Node 测试：14/14 通过；两套 Flutter `analyze`：零问题。

数据库接入后，后端 Node 测试为 16/16 通过，两套 Flutter 测试为各 4/4 通过，`analyze` 仍为零问题。

## PostgreSQL 全链路

- 已创建独立数据库 `hsk_voice_learning` 和 5 张业务表。
- 演示账号只有在隔离开发/测试数据库中显式种入后才存在，密码使用 scrypt 哈希；生产 schema、登录页与 APK 均不包含默认口令。
- 真实 WAV 经百炼转写后，同一个会话 ID 关联转写事件、用户消息和 AI 消息。
- 两套 release APK 均在真机登录后恢复了各自最近一次数据库文本会话。
- 真机复核时数据库包含 2 个用户、4 次登录审计、2 个会话、4 条消息和 1 条转写。
- 录音文件仅保存在 Android 应用私有文件目录；数据库没有音频 Blob、Base64 或录音路径字段。

## 真机证据

- 对话研习室生成 669484 字节 WAV；静音转写失败后仍保留“播放我的跟读”。
- 口语任务站生成 96044 字节 WAV；百炼 ASR 返回文本并进入 AI 对话。
- Android 音频服务显示口语任务站的 MediaPlayer 为 `started`，文件采样率为 16000 Hz。
- 两套应用均收到真实百炼回答，页面展示跟读句和练习要求；Android TTS 完成后状态回到“语音已就绪”。
- 连续模式修复后，真机在 TTS 完成后自动显示“正在听，请说中文；说完后点击停止”。

截图与 UI 层级文件保存在 `test-results/`。

## 发布物

- `dist/hsk-dialogue-studio-release.apk`（48798186 字节）
- `dist/hsk-mission-lab-release.apk`（48833414 字节）

## 2026-10-11 隔离真机回归

- 两款最新 release APK 安装到 OnePlus PKS110；各自以独立的 `client_app` 登录 PostgreSQL 18.3 测试库 `hsk_voice_learning_test`。测试用户 `codexphone` 仅存在于该隔离库，生产库未访问、未修改。
- 手机 `AudioRecord` 真实采集 16 kHz 单声道 WAV，并经本机 USB reverse 发往本机 ASR stub；stub 确认 3 个请求均带 RIFF/WAVE 头，返回固定测试转写。AI chat stub 返回带跟读句/练习要求的固定回答；没有调用百炼、Ollama 或其他真实模型。
- 两款应用都完成录音转写、AI 回复、Android 中文 TTS 和跟读录音回放。`dumpsys audio` 确认两款应用的 `MediaPlayer` 均以 16 kHz 启动并正常停止，系统 TTS 音轨也完成播放。
- 真机复测暴露并修复录音回放路径错误：录音存于 `files/hsk_recordings`，原校验却限制在 `cacheDir`；两款 Android 原生实现已统一校验规范化后的专用录音目录。修复后的两款 release APK 均构建、安装并实测回放成功。
- 隔离库汇总：成功登录 3 次；口语任务站 1 个会话、2 条转写、2 组语音用户/AI 消息；对话研习室 1 个独立会话、1 条转写、1 组语音用户/AI 消息。`transcription_events` 只含转写文本和 `audio_bytes`，没有音频 Blob、Base64 或文件路径列。
- 当前两个 Flutter widget 测试各 5/5 通过，analyze 均无问题。历史记录增加 `(created_at,id)` 键集分页，客户端滚到顶部加载更早消息并保持阅读位置；Node 单测 26/26、E2E/语音 smoke 3/3 通过。最新 APK：`dist/hsk-dialogue-studio-release.apk`（48798186 字节）、`dist/hsk-mission-lab-release.apk`（48833414 字节），已同步至 LAN 工作区且 SHA-256 一致。当前 ADB 无设备连接，本轮未进行真机更新安装。此前真机回归截图见 `../output/device-validation/hsk-mission-post-fix-voice.png` 与 `../output/device-validation/hsk-studio-playback-attempt.png`。
