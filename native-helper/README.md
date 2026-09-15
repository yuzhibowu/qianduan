# 饼饼高速导出助手

这是“前端→Keynote”网页的本机导出桥梁。助手只监听 `127.0.0.1:43987`，默认只接受正式网页地址、`http://127.0.0.1:*` 和 `http://localhost:*`。它不接受任意终端命令，只提供能力检测、开始导出、追加 PNG 帧、完成、下载和取消六类固定操作。

PNG 动图由助手直接把无损 PNG 数据流封装为完整帧 APNG，不需要 FFmpeg。透明 MOV 会依次寻找应用内置的 `ffmpeg`、Apple 芯片 Homebrew 的 `/opt/homebrew/bin/ffmpeg` 和 Intel Homebrew 的 `/usr/local/bin/ffmpeg`，并使用固定的 ProRes 4444 XQ 与 Alpha 参数。

运行 `npm run helper:build` 会生成：

- `artifacts/native-helper/饼饼高速导出助手.app`
- `artifacts/native-helper/BingBing-Export-Helper-macOS.zip`
- `artifacts/native-helper/BingBing-Export-Helper-macOS.dmg`

当前构建默认采用本机临时签名，适合开发验证。提供 `HELPER_SIGN_IDENTITY="Developer ID Application: ..."` 时，打包脚本会改用正式身份。向陌生用户正式分发前，需要 Apple Developer ID 签名、公证，并把 DMG 或 ZIP 上传到 GitHub Releases；网页安装提示只能在正式 Release 资产可下载后启用。
