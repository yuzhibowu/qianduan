# macOS Logo 图标导出标准

这份流程用于把一张 Logo 图片直接制作成 macOS 应用图标。核心原则是：Logo 本身是视觉源，系统圆角矩形只是承载容器；不能把图片的白色矩形背景直接当成图标边界。

## 输入要求

准备一张清晰的 Logo PNG，最好包含透明背景；如果图片带白底，必须在矢量模板中用圆角裁切蒙版限制它的可见范围。Logo 的字形、粗细、横线长度和颜色全部以原图为准，不要重新用系统字体排版。

## 标准安全区

画布为 1024×1024。标准主体使用 `x=100、y=100、width=824、height=824、rx=220` 的圆角矩形。圆角矩形外必须透明，不能留下白色直角背景。Logo 图片放在圆角矩形内部，并通过 `clipPath` 裁切：

```svg
<defs>
  <clipPath id="rounded-safe">
    <rect x="100" y="100" width="824" height="824" rx="220"/>
  </clipPath>
</defs>
<rect x="100" y="100" width="824" height="824" rx="220" fill="#fff"/>
<image href="logo-source.png" clip-path="url(#rounded-safe)" .../>
```

## 生成方式

不要用 Quick Look 的白底预览作为最终源。使用 Chrome 无头渲染 SVG，并明确指定透明背景：

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars \
  --window-size=1024,1024 --default-background-color=00000000 \
  --screenshot=/tmp/logo.png file:///绝对路径/icon.svg
```

然后用 `sips` 生成 macOS 全套尺寸，再用 `iconutil` 打成 ICNS。必须包含 16、32、128、256、512，以及对应的 `@2x` 尺寸：

```bash
mkdir -p AppIcon.iconset
sips -z 16 16 logo.png --out AppIcon.iconset/icon_16x16.png
sips -z 32 32 logo.png --out AppIcon.iconset/icon_16x16@2x.png
sips -z 32 32 logo.png --out AppIcon.iconset/icon_32x32.png
sips -z 64 64 logo.png --out AppIcon.iconset/icon_32x32@2x.png
sips -z 128 128 logo.png --out AppIcon.iconset/icon_128x128.png
sips -z 256 256 logo.png --out AppIcon.iconset/icon_128x128@2x.png
sips -z 256 256 logo.png --out AppIcon.iconset/icon_256x256.png
sips -z 512 512 logo.png --out AppIcon.iconset/icon_256x256@2x.png
sips -z 512 512 logo.png --out AppIcon.iconset/icon_512x512.png
sips -z 1024 1024 logo.png --out AppIcon.iconset/icon_512x512@2x.png
iconutil -c icns AppIcon.iconset -o AppIcon.icns
```

## 验收

在 Finder 和 Launchpad 中检查：圆角外是桌面透明效果；没有白色直角边；Logo 不应比同排系统图标明显更大；汉字粗细、黄色横线长度与原图一致。修改后必须删除旧 App 再安装，避免 Finder 图标缓存造成误判。

本项目的导出助手使用这套流程，应用名称可以独立于 Logo 名称（当前应用名为“导出助手”，菜单栏名为“饼饼SHOW”）。
