#!/bin/zsh
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
helper_root="$project_root/native-helper"
output_root="$project_root/artifacts/native-helper"
app_path="$output_root/饼饼高速导出助手.app"
staging_path="$output_root/dmg-staging"
sign_identity="${HELPER_SIGN_IDENTITY:--}"

if /usr/bin/xcodebuild -version >/dev/null 2>&1; then
  swift build --package-path "$helper_root" -c release --arch arm64 --arch x86_64
  helper_binary="$helper_root/.build/apple/Products/Release/BingBingExportHelper"
else
  manual_build_root="$helper_root/.build/manual"
  module_cache="$manual_build_root/module-cache"
  sdk_path="$(/usr/bin/xcrun --sdk macosx --show-sdk-path)"
  /bin/mkdir -p "$module_cache"
  for arch in arm64 x86_64; do
    /usr/bin/swiftc "$helper_root/Sources/BingBingExportHelper/main.swift" \
      -O -swift-version 5 -sdk "$sdk_path" \
      -module-cache-path "$module_cache" \
      -target "${arch}-apple-macosx13.0" \
      -o "$manual_build_root/BingBingExportHelper-$arch"
  done
  /usr/bin/lipo -create \
    "$manual_build_root/BingBingExportHelper-arm64" \
    "$manual_build_root/BingBingExportHelper-x86_64" \
    -output "$manual_build_root/BingBingExportHelper"
  helper_binary="$manual_build_root/BingBingExportHelper"
fi
/bin/mkdir -p "$app_path/Contents/MacOS" "$app_path/Contents/Resources"
/bin/cp "$helper_binary" "$app_path/Contents/MacOS/BingBingExportHelper"
/bin/cp "$helper_root/Info.plist" "$app_path/Contents/Info.plist"
/bin/cp "$helper_root/Resources/AppIcon.icns" "$app_path/Contents/Resources/AppIcon.icns"
/usr/bin/codesign --force --deep --sign "$sign_identity" "$app_path"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "$app_path" "$output_root/BingBing-Export-Helper-macOS.zip"
/bin/rm -rf "$staging_path"
/bin/mkdir -p "$staging_path"
/bin/cp -R "$app_path" "$staging_path/饼饼高速导出助手.app"
/bin/ln -s /Applications "$staging_path/Applications"
/usr/bin/hdiutil create -ov -quiet -volname "饼饼高速导出助手" -srcfolder "$staging_path" "$output_root/BingBing-Export-Helper-macOS.dmg"
/bin/rm -rf "$staging_path"
/usr/bin/codesign --verify --deep --strict "$app_path"
/usr/bin/hdiutil verify "$output_root/BingBing-Export-Helper-macOS.dmg" >/dev/null
echo "$app_path"
