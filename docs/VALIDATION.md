# 验证说明

## 默认自动测试

`npm test` 覆盖问题队列、取消与失败终态、结构和来源检查、角色边界、HTTP 访问保护、回声匹配、临时字幕合并、题库缓存隔离、独立窗口生命周期和平铺。测试使用临时数据及模型替身，不需要个人资料、Codex 登录或 API Key。

真实音频夹具位于 `artifacts/asr-test.wav` 时会额外运行对应测试；干净检出没有该文件，应显示跳过，不能报告为真实语音验证通过。

`npm run build` 执行 TypeScript 检查及 Vite 构建。GitHub Actions 对 Node.js 22 与 24 执行依赖安装、默认测试和构建。

## 单独验证的能力

- `npm run test:e2e`：需要 macOS 图形环境，使用独立用户和数据目录，检查窗口、表单、转写修正与离线卡片。
- `npm run test:live`：真实调用研究与复核模型，消耗账号额度；检查最终状态及来源，不能只看请求受理。
- `npm run test:captions`、`npm run test:echo`：需要本地 Whisper、模型及 README 指定格式的音频夹具。
- `npm run test:audio`：把合成音轨注入采集接口，检查采集代码到 ASR 的链路，不等于真实会议验收。
- `node tests/package-smoke.mjs`：需要先打包、成功的 `test:live` 结果及本机模型配置，不属于默认测试。

## 已知边界

- 主要开发环境是 macOS Apple Silicon；Windows、Linux 和 Intel Mac 未完成桌面全链路验证。
- 真实腾讯会议外放通话尚未完成端到端验收。不做特定会议应用或多人声纹隔离。
- 音轨、临时字幕、正式文本、问题识别和最终答案是不同阶段，不能相互替代验证。
- `completed` 表示流程完成，不保证事实绝对正确。来源访问记录不替代语义核验。
- 默认打包使用 ad-hoc 签名，尚未提供经过 Developer ID 签名、公证与跨机器验收的安装包。
- 普通桌面支持置顶和多窗口；为保留 Dock 图标，不强行覆盖其他应用的原生全屏窗口。

## 发布检查

从暂存内容导出干净目录，执行 `npm ci`、`npm test` 和 `npm run build`；核对私有资料、会话、录音、凭据及构建包没有进入 Git。公开版经历卡保留占位符，技术卡保持“我会这样设计”的方案表述。
