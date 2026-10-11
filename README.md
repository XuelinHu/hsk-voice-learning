# HSK Voice Learning

两个平行、可独立使用的 HSK 中文语音学习项目：

- **HSK 对话研习室**：安静、连续的场景对话训练，适合长时间口语练习。
- **HSK 口语任务站**：以关卡和过关条件组织口语任务，适合目标式训练。

## Android APK

可直接安装的 release 包：

- `dist/hsk-dialogue-studio-release.apk`
- `dist/hsk-mission-lab-release.apk`

APK 通过同一个 Node 后端连接百炼，密钥不会写入 APK。USB 真机调试时先启动后端并映射端口：

```powershell
cd D:\workspace\front\hsk-voice-learning
npm start
adb reverse tcp:8040 tcp:8040
```

局域网独立使用时，在 APK 登录页点击“服务地址”，填写运行后端电脑的局域网地址，例如 `http://192.168.1.10:4035`，同时将后端 `HOST` 配置为 `0.0.0.0`。

## PostgreSQL 数据持久化

后端使用独立数据库 `hsk_voice_learning`。首次部署或迁移时执行：

```powershell
npm run db:migrate
npm run test:db
```

数据库快照使用 PostgreSQL `pg_dump` custom 格式，并以 AES-256-GCM 加密。先在 `.env` 设置独立的 32 字节随机密钥 `DB_BACKUP_ENCRYPTION_KEY`（64 位十六进制），不要提交该值；备份默认写入被 Git 忽略的 `backups/`：

```powershell
npm run db:backup
npm run db:backup -- --destination D:\secure-backups\hsk.pgbak
```

恢复命令只接受已存在且以 `_test` 结尾的目标数据库，并要求显式 `--replace`；恢复前会先验证整个加密快照，目标内对象会被替换。源库和目标库名必须不同。先确认 `.env` 中的 PostgreSQL 主机、端口、用户和密码适用于目标环境，再执行：

```powershell
npm run db:restore -- --source D:\secure-backups\hsk.pgbak --database hsk_voice_learning_restore_test --replace
```

仅在隔离测试库演练恢复；不要把生产数据恢复到生产库。恢复需要 PostgreSQL 18 客户端工具 `pg_restore`。

数据库保存用户、登录审计、HSK 会话、用户/AI 文本消息和语音转写文本。手机录音始终保存在 APK 的应用私有文件目录，后端只记录转写文本、语言和音频字节数，不上传或保存录音文件及手机路径。应用启动和每次录音后会清理超过 7 天的录音，并将本地录音限制为最多 20 个、总量 40 MiB。

两套 APK 使用不同的 `client_app` 隔离最近会话；登录后会自动恢复各自最近一次文本对话，点击“开始新会话”后生成新的会话链路。

每次语音跟读结束后，用户消息下方都会生成“我的跟读录音”播放器，可回放、暂停和拖动进度。AI 每轮同时给出独立的“跟读句”和“练习要求”。

两套前端共用一个安全的 Node 后端。百炼 API Key 只由后端从 `.env` 读取，不会发送到浏览器。

## 启动

环境要求：Node.js 20+，最新版 Microsoft Edge 或 Google Chrome。

```powershell
cd D:\workspace\front\hsk-voice-learning
npm install
npm start
```

默认地址：

- 对话研习室：<http://127.0.0.1:4035/studio/>
- 口语任务站：<http://127.0.0.1:4035/mission/>

网页入口由 `.env` 中的 `WEB_PORT=4035` 控制，后端 API 使用 `PORT=8040`；请按启动日志访问对应服务。

## 演示账号

| 角色 | 账号 |
| --- | --- | --- |
| 学员 | `hskstudent` |
| 教师 | `hskteacher` |

`npm run db:migrate` 只应用数据库结构，不创建或重置用户。E2E 测试与本机演示需要这两个账号时，先确保开发数据库名以 `_dev`、`_test` 或 `_demo` 结尾，在 `.env` 配置 `DEMO_SEED_DATABASE` 与数据库名完全相同、`ALLOW_DEMO_SEED=1` 以及强随机的 `HSK_STUDENT_PASSWORD` / `HSK_TEACHER_PASSWORD`（至少 16 位、包含字母和数字且不含用户名），然后执行：

```powershell
npm run db:seed:demo
```

种子命令在 `NODE_ENV=production` 下拒绝运行；已有同名用户不会被重置。完成后把 `ALLOW_DEMO_SEED` 改回 `0`。真实用户密码不再保存在源码、登录页或 APK 中；没有数据库时 API 会拒绝登录，不回退到内置演示账号。

## 配置

参考 `.env.example`：

```dotenv
DASHSCOPE_API_KEY=replace-with-your-key
DASHSCOPE_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
DASHSCOPE_MODEL=qwen-plus
DASHSCOPE_ASR_MODEL=qwen3-asr-flash
TOKEN_SECRET=replace-with-a-long-random-value
PORT=8040
WEB_PORT=4035
HOST=127.0.0.1
```

百炼接口使用[阿里云官方 OpenAI Chat 兼容地址](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)。文本转语音优先选择 Edge 提供的 Microsoft 中文在线语音；该能力依赖 Edge 的 Online Text to Speech 策略与本机语音服务。

## 语音对话

1. 登录后允许 APK 访问麦克风。
2. 点击麦克风开始录制 16 kHz 单声道 WAV，再次点击停止并联网转写。
3. 识别结果自动发送给百炼，AI 回答由 Android 中文 TTS 朗读。
4. 开启“连续语音对话”后，AI 朗读结束会自动恢复下一轮监听。
5. 会话在浏览器本地保留最近 80 条消息；后端每次只向模型发送最近 24 条，避免长会话无限增长。
6. 每次语音输入会保存到 APK 缓存，并在该条消息下显示“播放我的跟读”；即使识别失败，录音仍可回放。

语音识别依赖 Edge/Chrome 在线服务。若浏览器或网络暂时不支持，文字输入仍可完整使用。

## 测试

```powershell
npm test
npm run test:e2e
npm run test:live
npm run test:voice
npm run test:db
npm run test:all
npm run test:visual
```

- `npm test`：鉴权、令牌、HSK 提示词、长上下文裁剪、百炼合同、HTTP API、语音选择与朗读单元测试。
- `npm run test:e2e`：两个页面的登录、文字对话、跟读录音回放、语音识别、AI 回复、Microsoft TTS、连续监听和原生 Edge 语音能力测试；需要已迁移的隔离测试数据库和单独创建的演示账号。
- `npm run test:live`：服务启动且已配置百炼时，从两个真实页面各完成一次联网 AI 对话。
- `npm run test:voice`：使用 Windows Microsoft 中文 TTS 生成真实 WAV，再由 Microsoft 中文识别器转回文本，验证本机语音闭环。
- `npm run test:db`：检查 PostgreSQL 表、测试账号和“只存转写文本、不存音频”的结构约束。
- `npm run test:visual`：生成两个项目在桌面与移动端的页面截图到 `test-results/visual/`。

完整用例见 [TEST_PLAN.md](./TEST_PLAN.md)。
本次真机执行结果见 [APK_TEST_REPORT.md](./APK_TEST_REPORT.md)。

## 目录

```text
hsk-voice-learning/
  apps/
    dialogue-studio/   # 对话研习室
    mission-lab/       # 口语任务站
    shared/            # 登录、会话、语音和通用样式
  server/              # 鉴权、百炼客户端与 HTTP 服务
  tests/
    unit/              # Node 单元/合同测试
    e2e/               # Playwright 浏览器测试
    visual/            # 响应式截图脚本
```

## 启动端口

网页入口：4035；后台服务：8040。完整启动约定见 [PORTS.md](./PORTS.md)。
