$ErrorActionPreference = "Stop"

$backendRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $backendRoot ".venv\Scripts\python.exe"
$contractPath = Join-Path (Split-Path -Parent $backendRoot) "contracts\openapi\v1.yaml"
$temporaryContract = Join-Path ([System.IO.Path]::GetTempPath()) (
    "vsolve-openapi-{0}.yaml" -f [System.Guid]::NewGuid().ToString("N")
)

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

    & $venvPython manage.py makemigrations --check --dry-run --noinput
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $venvPython manage.py spectacular --file $temporaryContract --validate
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $generatedContract = (Get-Content -LiteralPath $temporaryContract -Raw).Replace("`r`n", "`n")
    $committedContract = (Get-Content -LiteralPath $contractPath -Raw).Replace("`r`n", "`n")
    if ($generatedContract -cne $committedContract) {
        throw "contracts\openapi\v1.yaml is stale. Regenerate it with manage.py spectacular."
    }
}
finally {
    if (Test-Path -LiteralPath $temporaryContract) {
        Remove-Item -LiteralPath $temporaryContract -Force
    }
    Pop-Location
}
