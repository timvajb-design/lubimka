#!/bin/bash
set -euo pipefail

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

[[ $# -eq 1 && "$1" == *.xcarchive ]] || fail 'Usage: bash scripts/testflight-device-archive.sh /path/to/new.xcarchive'
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
mkdir -p "$(dirname "$1")"
archive="$(cd "$(dirname "$1")" && pwd -P)/$(basename "$1")"
[[ ! -e "$archive" && ! -L "$archive" ]] || fail "Archive already exists: $archive"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

xcodebuild -project "$root/ios/Lubimka.xcodeproj" \
  -scheme Lubimka -configuration Release -sdk iphoneos \
  -destination 'generic/platform=iOS' -derivedDataPath "$scratch/DerivedData" \
  -archivePath "$archive" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO archive

read_plist() {
  /usr/libexec/PlistBuddy -c "Print :$2" "$1"
}

app_path="$(read_plist "$archive/Info.plist" ApplicationProperties:ApplicationPath)"
[[ "$app_path" == Applications/Lubimka.app ]] || fail "Unexpected archive product: $app_path"
app="$archive/Products/$app_path"
plist="$app/Info.plist"
bundle="$(read_plist "$plist" CFBundleIdentifier)"
sdk="$(read_plist "$plist" DTSDKName)"
[[ "$bundle" == online.lubimka.app ]] || fail "Unexpected bundle identifier: $bundle"
[[ "$sdk" == iphoneos* && "$(read_plist "$plist" DTPlatformName)" == iphoneos && "$(read_plist "$plist" CFBundleSupportedPlatforms:0)" == iPhoneOS ]] || fail "Unexpected device SDK or platform: $sdk"
executable="$app/$(read_plist "$plist" CFBundleExecutable)"
[[ -f "$executable" ]] || fail 'Missing app executable'
xcrun lipo -verify_arch arm64 "$executable"
xcrun vtool -show-build "$executable" | awk '$1 == "platform" && $2 == "IOS" { device=1 } END { exit !device }' || fail 'Mach-O is missing the iOS device platform'
printf 'Verified unsigned Release archive: %s (%s, arm64), %s\n' "$bundle" "$sdk" "$archive"
