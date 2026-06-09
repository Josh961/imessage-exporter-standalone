$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $scriptDir "electron-app/scripts/release.mjs") @args
exit $LASTEXITCODE
