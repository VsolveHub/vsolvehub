$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
    throw "backend\.venv is missing. Run .\scripts\bootstrap.cmd first."
}

Push-Location $backendRoot
try {
    # Requires the PostgreSQL and Redis services in infra\compose.yaml to be running.
    & $venvPython -m pytest tests/integration -m integration --ds=config.settings.integration --no-cov -v
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
