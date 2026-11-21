$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$toolsPath = Join-Path $env:LOCALAPPDATA 'Lubimka/AndroidBuild'
$tempTools = Join-Path $env:TEMP 'lubimka-android-tools'
New-Item -ItemType Directory -Force -Path $toolsPath | Out-Null

function Get-CheckedArchive($Name, $Url, $Sha256) {
    $file = Join-Path $toolsPath $Name
    foreach ($existing in @($file, (Join-Path $tempTools $Name))) {
        if ((Test-Path -LiteralPath $existing -PathType Leaf) -and
            (Get-FileHash -Algorithm SHA256 -LiteralPath $existing).Hash -eq $Sha256) { return $existing }
    }
    Write-Host "Downloading $Name ..."
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $file
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash -ne $Sha256) {
        throw "Checksum mismatch: $Name"
    }
    return $file
}

function Has-Jdk($Path) {
    if (-not $Path -or -not (Test-Path (Join-Path $Path 'bin/javac.exe'))) { return $false }
    return (Test-Path (Join-Path $Path 'release')) -and
        (Select-String -Quiet -Path (Join-Path $Path 'release') -Pattern '^JAVA_VERSION="(17|18|19|20|21|22|23)[."]')
}

if (-not (Has-Jdk $env:JAVA_HOME)) {
    $env:JAVA_HOME = Join-Path $toolsPath 'jdk-17.0.21.1+2'
    $currentMachine = Join-Path $tempTools 'jdk-17.0.21.1+2'
    if (-not (Has-Jdk $env:JAVA_HOME) -and (Has-Jdk $currentMachine)) { $env:JAVA_HOME = $currentMachine }
    if (-not (Has-Jdk $env:JAVA_HOME)) {
        $javaZip = Get-CheckedArchive 'jdk17.zip' 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.21.1%2B2/OpenJDK17U-jdk_x64_windows_hotspot_17.0.21.1_2.zip' 'eafba0944f777abdc74d5aad16049c9b5a1275b6ce99e2939ba9f7f3e6f08c87'
        Expand-Archive -Force -LiteralPath $javaZip -DestinationPath $toolsPath
    }
}
$env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH
$sdkPath = $env:ANDROID_HOME
if (-not $sdkPath) { $sdkPath = $env:ANDROID_SDK_ROOT }
if (-not $sdkPath) {
    $sdkPath = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
    if (-not (Test-Path -LiteralPath $sdkPath)) { $sdkPath = Join-Path $toolsPath 'sdk' }
}
$env:ANDROID_HOME = $sdkPath
$env:ANDROID_SDK_ROOT = $sdkPath
if (-not (Test-Path (Join-Path $sdkPath 'platforms/android-36/android.jar')) -or
    -not (Test-Path (Join-Path $sdkPath 'build-tools/35.0.0/aapt2.exe'))) {
    Write-Host 'The free Android SDK packages below are needed to build.'
    Write-Host 'Read the Google Android SDK terms: https://developer.android.com/studio/terms'
    Write-Host 'Do you accept those terms and want to download Android SDK Platform 36 and Build-Tools 35.0.0?'
    if ((Read-Host 'Type YES to continue') -cne 'YES') { throw 'Android SDK setup cancelled.' }
    $sdkManager = Join-Path $sdkPath 'cmdline-tools/latest/bin/sdkmanager.bat'
    if (-not (Test-Path -LiteralPath $sdkManager)) {
        $cliRoot = Join-Path $toolsPath 'cli-15859902'
        $sdkManager = Join-Path $cliRoot 'cmdline-tools/bin/sdkmanager.bat'
        if (-not (Test-Path -LiteralPath $sdkManager)) {
            $sdkZip = Get-CheckedArchive 'commandlinetools-win-15859902_latest.zip' 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip' '90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a'
            Expand-Archive -Force -LiteralPath $sdkZip -DestinationPath $cliRoot
        }
    }
    New-Item -ItemType Directory -Force -Path $sdkPath | Out-Null
    & $sdkManager "--sdk_root=$sdkPath" 'platforms;android-36' 'build-tools;35.0.0' 'platform-tools'
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path (Join-Path $sdkPath 'platforms/android-36/android.jar'))) {
        throw 'SDK installation incomplete. Check the license prompt, network and disk space.'
    }
}

Push-Location -LiteralPath $PSScriptRoot
try {
    & '.\gradlew.bat' --no-daemon ':app:assembleDebug' ':app:bundleRelease'
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE." }
    Write-Host ('Test APK: '+(Join-Path $PSScriptRoot 'app/build/outputs/apk/debug/app-debug.apk'))
    Write-Host ('Unsigned release AAB: '+(Join-Path $PSScriptRoot 'app/build/outputs/bundle/release/app-release.aab'))
} finally { Pop-Location }
