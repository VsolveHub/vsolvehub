$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
    throw "backend\.venv is missing. Run .\scripts\bootstrap.cmd first."
}

Push-Location $backendRoot
try {
    & $venvPython -m ruff format --check .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $venvPython -m ruff check .
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $venvPython -m mypy apps common config
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $venvPython -m pytest
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    Pop-Location
}
