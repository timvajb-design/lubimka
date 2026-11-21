#!/bin/bash
# Run on a Mac signed into the owner's Apple Developer team in Xcode.
# Pass the team ID and an unused build number for the current app version.
set -euo pipefail
umask 077

fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $# == 2 ]] || fail 'Usage: bash scripts/testflight-upload.sh APPLE_TEAM_ID BUILD_NUMBER'
team=$1
build=$2
[[ $team =~ ^[A-Z0-9]{10}$ ]] || fail 'Expected a 10-character Apple Developer team ID.'
[[ $build =~ ^[1-9][0-9]{0,3}(\.[0-9]{1,2}){0,2}$ ]] || fail 'Expected a build number such as 2 or 2.1.'
[[ $(uname -s) == Darwin ]] || fail 'Run this script on macOS with Xcode.'

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
project="$root/ios/Lubimka.xcodeproj"
[[ -f "$project/project.pbxproj" ]] || fail "Missing Lubimka Xcode project: $project"
help="$(xcodebuild -help 2>&1)"
[[ $help == *testFlightInternalTestingOnly* ]] || fail 'Select a version of Xcode that supports internal-only export.'

archive_dir="$HOME/Library/Developer/Xcode/Archives/$(date +%F)"
mkdir -p "$archive_dir"
archive="$archive_dir/Lubimka-$build-$(date +%H%M%S)-$$.xcarchive"
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

xcodebuild -project "$project" -scheme Lubimka -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$archive" \
  -allowProvisioningUpdates DEVELOPMENT_TEAM="$team" CODE_SIGN_STYLE=Automatic \
  CURRENT_PROJECT_VERSION="$build" archive

app="$archive/Products/Applications/Lubimka.app"
info="$app/Info.plist"
read_info() { /usr/libexec/PlistBuddy -c "Print :$1" "$info"; }
[[ $(read_info CFBundleIdentifier) == online.lubimka.app ]] || fail 'Unexpected bundle identifier.'
[[ $(read_info CFBundleVersion) == "$build" ]] || fail 'Unexpected build number.'
[[ $(read_info DTPlatformName) == iphoneos ]] || fail 'Archive is not built for an iOS device.'
codesign --verify --strict "$app"
signer="$(codesign -dv --verbose=4 "$app" 2>&1)"
grep -Fx "TeamIdentifier=$team" <<< "$signer" >/dev/null || fail 'Archive signature is from another team.'

cat > "$scratch/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>testFlightInternalTestingOnly</key><true/>
  <key>signingStyle</key><string>automatic</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>teamID</key><string>$team</string>
</dict></plist>
PLIST
printf 'Signed archive retained at %s\n' "$archive"
xcodebuild -exportArchive -archivePath "$archive" -exportPath "$scratch/export" \
  -exportOptionsPlist "$scratch/ExportOptions.plist" -allowProvisioningUpdates
printf 'Upload finished. Check build %s in App Store Connect → TestFlight after processing.\n' "$build"
