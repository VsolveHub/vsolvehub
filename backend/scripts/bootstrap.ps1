$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $backendRoot ".venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $venvPython)) {
    py -3.13 -m venv (Join-Path $backendRoot ".venv")
}

& $venvPython -m pip install --upgrade pip pip-tools
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& $venvPython -m pip install --require-hashes -r (Join-Path $backendRoot "requirements\dev.txt")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Backend virtual environment is ready at $backendRoot\.venv"
