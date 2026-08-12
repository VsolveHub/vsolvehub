$ErrorActionPreference = "Stop"

# Every gate in quality.ps1 except pytest.
#
# Implementation sessions do not run tests — they write them, and the owner runs them. See
# `Django_Next.js_Plan/M2/task.md` §"Verification convention". That rule and `quality.ps1` are
# incompatible in a way that is easy to miss: pytest is the fourth of six steps, and
# `$LASTEXITCODE -ne 0` exits immediately, so a single failing test also skips
# `makemigrations --check`, `spectacular --validate` and the contract-drift comparison. Those last
# three are exactly the checks a session most needs, and the drift check has caught real bugs.
#
# So this is not "quality.ps1 with the slow part removed" — it is the subset a session is allowed to
# run, arranged so that skipping tests does not silently skip four other things.
#
# `quality.ps1` remains the full gate and stays the owner's command.

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

    & $venvPython manage.py makemigrations --check --dry-run --noinput
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    & $venvPython manage.py spectacular --file $temporaryContract --validate
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $generatedContract = (Get-Content -LiteralPath $temporaryContract -Raw).Replace("`r`n", "`n")
    $committedContract = (Get-Content -LiteralPath $contractPath -Raw).Replace("`r`n", "`n")
    if ($generatedContract -cne $committedContract) {
        throw "contracts\openapi\v1.yaml is stale. Regenerate it with manage.py spectacular."
    }

    Write-Host ""
    Write-Host "Static gates passed. Tests were NOT run - that is this script's whole point."
    Write-Host "Run .\scripts\quality.cmd to include pytest."
}
finally {
    if (Test-Path -LiteralPath $temporaryContract) {
        Remove-Item -LiteralPath $temporaryContract -Force
    }
    Pop-Location
}
