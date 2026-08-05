$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
    throw "backend\.venv is missing. Run .\scripts\bootstrap.cmd first."
}

Push-Location $backendRoot
try {
    # The solo pool is the only reliable choice on Windows: the prefork default depends on
    # fork() semantics Windows does not have. Linux deployments run prefork with a real
    # concurrency setting; see backend/README.md.
    & $venvPython -m celery -A config worker --loglevel=info --pool=solo
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
