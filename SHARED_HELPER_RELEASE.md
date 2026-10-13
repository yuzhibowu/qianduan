# 统一助手 0.7 发布验证

2026-10-13；网页版本 `261013X1`；生产项目 `bingbingshow/qianduan`，固定入口 https://qianduan-zeta.vercel.app 。

接入依据为相邻 PNG微动画项目的 `SHARED_HELPER_INTEGRATION.md`。完整保留原有 `src/App.tsx` 下载链接及按钮修改；未改组件、参数、默认值、原始技术路线或动画状态。

## 修复范围

- 使用可用 Node 24 运行时及 `npm install --include=optional` 补齐缺失的 Lightning CSS 原生依赖。项目原有 Vite 8.2.2 构建通过，没有删除锁文件、降级 Vite 或修改系统安全设置。
- 原生助手 MOV 下载适配与浏览器 MOV 成品共用结构化 ProRes vendor 修正，只改 sample entry 的 `apl0` 字段，不改编码样本。
- 旧浏览器内核实际没有应用 XQ profile。换成校验过的上游 `@ffmpeg/core@0.12.10`，保持同源发布及原有 PNG 逐帧输入；实际回退输出已验证为 XQ。旧内核保存在忽略目录 `artifacts/previous-ffmpeg-core`。

## 自动化验证证据

- `npm test`：22 个测试文件、95 项通过；TypeScript、`npm run build`、Vercel 正式生产构建与 `git diff --check` 通过。
- 实际点击统一助手 0.7 链接下载 ZIP，SHA256 为 `c1f5bc5901493516dcda6c397dd5ef44f73bb4f43c6a1045381d7b74ee68d941`，与线上 SHA256SUMS 一致。清单仍为 `notarized=false`。
- 无助手安装提示、重新检测、独立按钮状态与 MOV/APNG 并行导出验证。真实生产来源 `https://qianduan-zeta.vercel.app` 得到助手明确的 CORS 授权，能力返回 0.7.0。
- Coin Loader 完整周期：720P 母画布、自适应裁切 218×218，30 FPS、314 个唯一帧、10.466667 秒，原生 MOV/APNG 同时成功。
- Neon Border 短片：320×180、30 FPS、30 帧，原生 MOV/APNG 同时成功。
- 无助手浏览器回退：320×180 母画布、自适应 60×60、30 FPS、30 帧，MOV/APNG 同时成功。
- 4K：3840×2160、30 FPS、6 帧的原生 MOV 成功。
- 已同步并保留远程此前 7 个提交（HEVC Alpha、Paper Image 等功能）；旧 `hevc-alpha` 协议按助手版本桥接为 0.7 的 `hevc`，旧助手继续使用原格式名。30 帧 HEVC Alpha 经 Apple 解码确认 Alpha 特征及透明、半透明、不透明像素，时间间隔精确为 1/30 秒。证据为 `artifacts/helper-release-merged/report.json`。
- 合并后所有格式的 0.7 下载提示与 ZIP 实际点击校验再次通过；Paper Image 导入诊断透明 PNG 后，266×180、6 帧 APNG 同时含透明、半透明和不透明内容。证据为 `artifacts/helper-release-merged-download/report.json`。诊断图不代表原效果视觉验收。
- 每份 MOV 检查 ProRes XQ、`yuva444p`、`apl0`、帧率、帧数和时长；每份 APNG 的全部 fcTL 覆盖完整画布、无限循环、精确 1/30 秒；所有解码检查包含透明、半透明与不透明像素。

本地证据：`artifacts/helper-release-local/long-neon-attempt-report.json`（下载和完整 Coin 周期），`artifacts/helper-release-local-remaining/report.json`（短边框），`artifacts/helper-release-official-core/report.json`（回退和 4K），并保留内核诊断日志与截图。上线复验输出到 `artifacts/helper-release-production/`。

生产部署已完成：`dpl_8DQUX9BUH7TZKriLBjGrbByAyxeB`，应用代码提交 `c0839f4`，正式页面显示 `261013X1`。正式域名再次实际点击下载并校验 ZIP；完整 Coin、短边框、浏览器回退、4K 短片和 Apple HEVC Alpha 解码合计 8 份成品通过，见 `artifacts/helper-release-production/report.json`。Paper Image 默认 Unsplash 图片使首次 `networkidle` 页面检查超时；测试改为 DOM 就绪后直接导入诊断 PNG，独立复验的第 9 份 APNG 通过，见 `artifacts/helper-release-production-paper/report.json`。两份结果均没有页面异常，不能将前一次等待超时隐藏成整轮脚本一次成功。

## 边界与组件清单逐项核对

1. 官方源码、依赖、Variant：本次不接入或替换原组件；沿用现有源码，未作新增官方视觉比对。
2. 原始动画技术、时间和触发：未修改。
3. 参数、默认值、范围、单位、条件和联动：未修改。
4. 预览原始行为与交互：未修改。
5. 控件参数桥接：未修改，不宣称本次重新逐项验收所有控件。
6. 预览和逐帧导出：仍调用原有同一渲染器、参数及绝对时间模型；仅调整成品编码和下载适配。
7. MOV/APNG/HEVC Alpha/USDZ 格式能力和按钮：保留远程现有能力；检查原生、回退和独立按钮状态。
8. 官方在线效果比对：本次不涉及效果修改，未作新的全部组件官方视觉验收。
9. 自动化与构建：上述范围通过；用户实际视觉、Keynote 播放和完整素材验收尚未完成。

640×360 的 Neon Border 原始完整周期双格式测试曾在 5 分钟上限内未完成，浏览器渲染进程仍持续工作；已保留记录并取消对应测试任务，未退出或替换用户助手。短边框成功不能表述为该长周期测试通过。4K 检查为 6 帧短片，不代表所有高分辨率长视频或全部素材均已验收。

## 复验命令

先启动 `npm run build` 产物的 Vite preview，然后运行：
```
node scripts/verify-helper-release.mjs http://127.0.0.1:4173 artifacts/helper-release-local
node scripts/verify-helper-release.mjs https://qianduan-zeta.vercel.app artifacts/helper-release-production
```
需要已安装的 Playwright Chromium、FFmpeg/ffprobe 和运行中的助手 0.7；可用 `PLAYWRIGHT_BROWSERS_PATH`、`FFMPEG`、`FFPROBE` 指定路径，`VERIFY_CASES` 选择单独检查。测试仅在隔离浏览器上下文授权本机网络访问，不更改用户浏览器权限。
