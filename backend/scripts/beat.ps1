$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
    throw "backend\.venv is missing. Run .\scripts\bootstrap.cmd first."
}

Push-Location $backendRoot
try {
    # Exactly one beat process per deployment. A second scheduler double-fires every periodic
    # task, including the outbox recovery sweep.
    & $venvPython -m celery -A config beat --loglevel=info
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
