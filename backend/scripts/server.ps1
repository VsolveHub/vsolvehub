$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
    throw "backend\.venv is missing. Run .\scripts\bootstrap.cmd first."
}

Push-Location $backendRoot
try {
    & $venvPython manage.py runserver 0.0.0.0:8000
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
