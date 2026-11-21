#!/bin/bash
# Run from a Mac with Xcode 26+ and an installed iOS Simulator runtime.
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
cd "$root/ios"
scratch="$(mktemp -d)"
sim_id=""
cleanup() {
  if [[ -n "$sim_id" ]]; then
    xcrun simctl shutdown "$sim_id" >/dev/null 2>&1 || true
    xcrun simctl delete "$sim_id" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$scratch"
}
trap cleanup EXIT
xcodebuild -version
xcrun swiftc Lubimka/LinkPolicy.swift Tests/main.swift -o "$scratch/links-test"
"$scratch/links-test"
xcrun simctl list -j devices available > "$scratch/devices.json"
# Take a supported iPhone type and runtime from the same installed simulator.
read -r runtime phone < <(python3 - "$scratch/devices.json" <<'PY'
import json, sys
devices = json.load(open(sys.argv[1]))["devices"]
choices = []
for runtime, entries in devices.items():
    if ".iOS-" not in runtime:
        continue
    version = tuple(map(int, runtime.split(".iOS-")[1].split("-")))
    for item in entries:
        phone = item.get("deviceTypeIdentifier", "")
        if item.get("isAvailable") and ".iPhone-" in phone:
            choices.append((version, runtime, phone))
if not choices:
    sys.exit("Install an iOS runtime and create an iPhone simulator in Xcode.")
_, runtime, phone = max(choices)
print(runtime, phone)
PY
)
sim_id="$(xcrun simctl create "Lubimka smoke $$" "$phone" "$runtime")"
xcodebuild -project Lubimka.xcodeproj -scheme Lubimka -configuration Debug \
  -destination "id=$sim_id" -derivedDataPath "$scratch/build" CODE_SIGNING_ALLOWED=NO build
xcrun simctl boot "$sim_id"
xcrun simctl bootstatus "$sim_id" -b
xcrun simctl install "$sim_id" "$scratch/build/Build/Products/Debug-iphonesimulator/Lubimka.app"
xcrun simctl launch "$sim_id" online.lubimka.app
xcodebuild -project Lubimka.xcodeproj -scheme Lubimka -configuration Debug \
  -destination "id=$sim_id" -derivedDataPath "$scratch/build" -parallel-testing-enabled NO \
  -only-testing:LubimkaUITests/ScannerSmokeTests/testOpenScannerAndReturnToHome test
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo '### Проверка «Любимки» на iPhone'
    printf 'Устройство: %s. Среда: %s.\n\n' "${phone##*.}" "${runtime##*.}"
    echo 'Приложение собрано, установлено и запущено. Пройден UI-тест открытия QR-сканера и возврата на главную.'
  } >> "$GITHUB_STEP_SUMMARY"
fi
