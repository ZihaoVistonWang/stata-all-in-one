<#
.SYNOPSIS
    Build the stata_bridge native addon for Windows x64.
.DESCRIPTION
    Compiles native/stata_bridge/src/stata_bridge.cc into bin/stata_bridge-win32.node
    using node-gyp and the MSVC toolchain. Requires Visual Studio 2022 with
    "Desktop development with C++" workload, Node.js, and node-gyp.
.NOTES
    Author: Zihao Viston Wang
    Run from the repository root:  powershell -File scripts/build-native.ps1
#>

param(
    [switch]$Clean,
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$BindingDir = Join-Path $RepoRoot "native\stata_bridge"
$OutputDir  = Join-Path $RepoRoot "bin"
$BuildDir   = Join-Path $BindingDir "build"

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Building stata_bridge-win32.node (Windows)" -ForegroundColor Cyan
Write-Host "  Configuration: $Configuration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Clean if requested
if ($Clean) {
    Write-Host "[Clean] Removing build directory..." -ForegroundColor Yellow
    if (Test-Path $BuildDir) {
        Remove-Item -Recurse -Force $BuildDir
    }
    Write-Host "[Clean] Removing existing .node file..." -ForegroundColor Yellow
    $existingNode = Join-Path $OutputDir "stata_bridge-win32.node"
    if (Test-Path $existingNode) {
        Remove-Item -Force $existingNode
    }
}

# Check prerequisites
Write-Host "[Check] Verifying prerequisites..." -ForegroundColor Gray

try {
    $nodeVersion = & node --version 2>$null
    Write-Host "  Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Error "Node.js is not installed or not in PATH."
    exit 1
}

try {
    $npmVersion = & npm --version 2>$null
    Write-Host "  npm:     v$npmVersion" -ForegroundColor Green
} catch {
    Write-Error "npm is not available."
    exit 1
}

# Check node-gyp availability
try {
    $gypVersion = & npx node-gyp --version 2>$null
    if (-not $gypVersion) {
        Write-Host "  Installing node-gyp..." -ForegroundColor Gray
        & npm install -g node-gyp 2>&1 | Out-Null
    }
    Write-Host "  node-gyp: available" -ForegroundColor Green
} catch {
    Write-Host "  Installing node-gyp..." -ForegroundColor Gray
    & npm install -g node-gyp 2>&1 | Out-Null
}

# Build
Write-Host "[Build] Configuring..." -ForegroundColor Gray
Push-Location $BindingDir

try {
    $gypArgs = @(
        "node-gyp", "configure",
        "--arch=x64",
        "--release"   # Always use release; debug builds are very large
    )

    if ($Configuration -eq "Debug") {
        $gypArgs = @("node-gyp", "configure", "--arch=x64", "--debug")
    }

    & npx @gypArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Error "node-gyp configure failed."
        Pop-Location
        exit 1
    }

    Write-Host "[Build] Compiling..." -ForegroundColor Gray
    $buildArgs = @("node-gyp", "build", "--arch=x64")
    if ($Configuration -eq "Debug") {
        $buildArgs += "--debug"
    }
    & npx @buildArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Error "node-gyp build failed."
        Pop-Location
        exit 1
    }
} finally {
    Pop-Location
}

# Copy the output
$BuildOutput = if ($Configuration -eq "Debug") {
    Join-Path $BuildDir "Debug\stata_bridge-win32.node"
} else {
    Join-Path $BuildDir "Release\stata_bridge-win32.node"
}

if (-not (Test-Path $BuildOutput)) {
    Write-Error "Build output not found at: $BuildOutput"
    exit 1
}

$TargetPath = Join-Path $OutputDir "stata_bridge-win32.node"
Copy-Item -Force $BuildOutput $TargetPath
Write-Host "[Done] Output: $TargetPath" -ForegroundColor Green

# Show file info
$fileInfo = Get-Item $TargetPath
Write-Host "[Done] Size: $([math]::Round($fileInfo.Length / 1KB, 1)) KB" -ForegroundColor Green

Write-Host "[Build] Compiling the Windows Stata data plugin..." -ForegroundColor Gray
& (Join-Path $PSScriptRoot "build-data-plugin.ps1")

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Build completed successfully!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
