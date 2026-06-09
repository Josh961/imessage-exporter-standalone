$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $scriptDir "scripts/sync-upstream-cli.mjs") @args
exit $LASTEXITCODE
