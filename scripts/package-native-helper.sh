#!/bin/zsh
set -euo pipefail

project_root="$(cd "$(dirname "$0")/.." && pwd)"
helper_root="$project_root/native-helper"
output_root="$project_root/artifacts/native-helper"
app_path="$output_root/饼饼高速导出助手.app"
staging_path="$output_root/dmg-staging"
sign_identity="${HELPER_SIGN_IDENTITY:--}"

swift build --package-path "$helper_root" -c release --arch arm64 --arch x86_64
/bin/mkdir -p "$app_path/Contents/MacOS" "$app_path/Contents/Resources"
/bin/cp "$helper_root/.build/apple/Products/Release/BingBingExportHelper" "$app_path/Contents/MacOS/BingBingExportHelper"
/bin/cp "$helper_root/Info.plist" "$app_path/Contents/Info.plist"
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
