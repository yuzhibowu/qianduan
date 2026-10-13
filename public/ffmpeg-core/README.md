# 浏览器 FFmpeg 内核

本目录保存上游 `@ffmpeg/core@0.12.10` 的 ESM 发布文件，与网站同源发布。客户端不会向上游发送用户素材或 PNG 帧。

来源：
- https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js
- https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm

SHA256：
```
67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3  ffmpeg-core.js
9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7  ffmpeg-core.wasm
```

源码与构建说明：[FFmpeg WASM 上游仓库](https://github.com/ffmpegwasm/ffmpeg.wasm)。内核遵循 FFmpeg 及其编入库的许可证，与 wrapper 的 MIT 许可证不同，见[上游许可说明](https://ffmpegwasm.netlify.app/docs/faq/)及[FFmpeg 许可](https://ffmpeg.org/legal.html)。

2026-10-13：替换旧的 `turntable-7.1-r1` 内核；旧内核实际输出 4444 而没有应用 XQ profile。更新时须校验两个发布文件，更新客户端缓存版本，并对浏览器实际输出的 ProRes profile、vendor、帧率、帧数、时长与连续 Alpha 做回环检查，不能只检查编码参数文本。
