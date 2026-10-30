[CmdletBinding()]
param(
    [ValidateSet('Up', 'Migrate', 'Seed', 'Verify', 'VerifySeed', 'Status', 'Logs', 'Down')]
    [string]$Action = 'Status',
    [string]$EnvFile
)

$ErrorActionPreference = 'Stop'

$databaseRoot = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $databaseRoot 'compose.yaml'
$migrationsRoot = Join-Path $databaseRoot 'migrations'
$testFile = Join-Path $databaseRoot 'tests/schema_smoke_test.sql'
$seedFile = Join-Path $databaseRoot 'seeds/development_sample.sql'
$seedTestFile = Join-Path $databaseRoot 'tests/sample_data_test.sql'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker is required. Install/start Docker Desktop and retry.'
}

$composePrefix = @('compose', '--file', $composeFile)
if ($EnvFile) {
    $resolvedEnvFile = (Resolve-Path -LiteralPath $EnvFile).Path
    $composePrefix += @('--env-file', $resolvedEnvFile)
    foreach ($line in Get-Content -LiteralPath $resolvedEnvFile) {
        if ($line -match '^\s*(MEALY_DB_(?:NAME|USER|PASSWORD|PORT))=(.*)$') {
            Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim()
        }
    }
}

$dbName = $env:MEALY_DB_NAME
$dbUser = $env:MEALY_DB_USER
if (-not $dbName -or -not $dbUser) {
    throw 'MEALY_DB_NAME and MEALY_DB_USER must be set through the environment or -EnvFile.'
}

function Invoke-Compose {
    param([Parameter(Mandatory)][string[]]$Arguments)
    & docker @composePrefix @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose failed with exit code $LASTEXITCODE"
    }
}

function Invoke-PsqlCommand {
    param([Parameter(Mandatory)][string]$Sql)
    $Sql | & docker @composePrefix exec -T postgres psql -v ON_ERROR_STOP=1 -U $dbUser -d $dbName
    if ($LASTEXITCODE -ne 0) {
        throw "psql failed with exit code $LASTEXITCODE"
    }
}

function Wait-ForDatabase {
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        & docker @composePrefix exec -T postgres pg_isready -U $dbUser -d $dbName *> $null
        if ($LASTEXITCODE -eq 0) { return }
        Start-Sleep -Seconds 2
    }
    throw 'PostgreSQL did not become ready within 60 seconds.'
}

function Invoke-Migrations {
    Wait-ForDatabase
    Invoke-PsqlCommand @'
CREATE TABLE IF NOT EXISTS public.mealy_schema_migrations (
    filename text PRIMARY KEY,
    sha256 text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
);
'@

    $migrationFiles = Get-ChildItem -LiteralPath $migrationsRoot -File -Filter '*.sql' | Sort-Object Name
    foreach ($file in $migrationFiles) {
        $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        $escapedName = $file.Name.Replace("'", "''")
        $lookup = "SELECT sha256 FROM public.mealy_schema_migrations WHERE filename = '$escapedName';"
        $appliedHash = [string](& docker @composePrefix exec -T postgres psql -v ON_ERROR_STOP=1 -At -U $dbUser -d $dbName -c $lookup)
        if ($LASTEXITCODE -ne 0) { throw "Unable to inspect migration $($file.Name)" }
        $appliedHash = "$appliedHash".Trim()

        if ($appliedHash) {
            if ($appliedHash -ne $hash) {
                throw "Applied migration $($file.Name) was modified. Expected $appliedHash but found $hash. Add a new migration instead."
            }
            Write-Host "Already applied: $($file.Name)"
            continue
        }

        Write-Host "Applying: $($file.Name)"
        $migrationSql = Get-Content -LiteralPath $file.FullName -Raw
        $transactionalSql = @"
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';
$migrationSql
INSERT INTO public.mealy_schema_migrations (filename, sha256) VALUES ('$escapedName', '$hash');
COMMIT;
"@
        Invoke-PsqlCommand $transactionalSql
    }
}

switch ($Action) {
    'Up' {
        Invoke-Compose -Arguments @('up', '-d', 'postgres')
        Wait-ForDatabase
        Invoke-Migrations
    }
    'Migrate' {
        Invoke-Migrations
    }
    'Seed' {
        Invoke-Migrations
        Invoke-PsqlCommand (Get-Content -LiteralPath $seedFile -Raw)
    }
    'Verify' {
        Invoke-Migrations
        Invoke-PsqlCommand (Get-Content -LiteralPath $testFile -Raw)
    }
    'VerifySeed' {
        Invoke-Migrations
        Invoke-PsqlCommand (Get-Content -LiteralPath $seedFile -Raw)
        Invoke-PsqlCommand (Get-Content -LiteralPath $seedTestFile -Raw)
    }
    'Status' {
        Invoke-Compose -Arguments @('ps')
    }
    'Logs' {
        Invoke-Compose -Arguments @('logs', '--tail', '200', 'postgres')
    }
    'Down' {
        Invoke-Compose -Arguments @('down')
    }
}
