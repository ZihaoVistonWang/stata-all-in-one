<#
.SYNOPSIS
    Build the Stata in-memory Data Viewer plugin for Windows x64.
.DESCRIPTION
    Requires the Visual Studio C++ build tools. Run from the repository root:
        powershell -ExecutionPolicy Bypass -File scripts/build-data-plugin.ps1
#>

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$SourceDir = Join-Path $RepoRoot "native\stata_data_plugin"
$OutputDir = Join-Path $RepoRoot "bin"
$BuildDir = Join-Path $RepoRoot "build_data_plugin"
$Output = Join-Path $OutputDir "stata_data_bridge-win32.plugin"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

$cl = Get-Command cl.exe -ErrorAction SilentlyContinue
if (-not $cl) {
    throw "cl.exe was not found. Open an x64 Native Tools Command Prompt for Visual Studio first."
}

$CompilerArgs = @(
    "/nologo",
    "/LD",
    "/O2",
    "/DSYSTEM=STWIN32",
    (Join-Path $SourceDir "stplugin.c"),
    (Join-Path $SourceDir "stata_data_plugin.c"),
    "/link",
    "/OUT:$Output"
)

Push-Location $BuildDir
try {
    & cl.exe $CompilerArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Windows Stata data plugin compilation failed."
    }
} finally {
    Pop-Location
}

Remove-Item -Recurse -Force $BuildDir

Write-Host "Built: $Output"
