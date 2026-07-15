@echo off
setlocal EnableExtensions

set "BAT_SELF=%~f0"
set "BAT_STDOUT_ONLY=0"
set "BAT_NO_PAUSE=0"

:parse_args
if "%~1"=="" goto args_done
if /I "%~1"=="--stdout-only" set "BAT_STDOUT_ONLY=1"
if /I "%~1"=="--no-pause" set "BAT_NO_PAUSE=1"
shift
goto parse_args

:args_done
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $raw=[System.IO.File]::ReadAllText($env:BAT_SELF); $marker='# POWERSHELL_PAYLOAD_BELOW'; $idx=$raw.LastIndexOf($marker); if($idx -lt 0){ throw 'PowerShell payload marker not found.' }; $code=$raw.Substring($idx + $marker.Length) -replace '^\r?\n',''; & ([scriptblock]::Create($code))"
set "PS_EXIT=%ERRORLEVEL%"

if not "%BAT_NO_PAUSE%"=="1" pause
exit /b %PS_EXIT%

# POWERSHELL_PAYLOAD_BELOW
$ErrorActionPreference = 'Continue'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = [Console]::OutputEncoding
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$startedAt = (Get-Date).ToUniversalTime().ToString('o')
$errors = New-Object 'System.Collections.Generic.List[string]'
$registryEntries = New-Object 'System.Collections.Generic.List[object]'
$candidates = New-Object 'System.Collections.Generic.List[object]'
$seenPaths = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)

function Get-PropertyString {
    param([Microsoft.Win32.RegistryKey]$Key, [string]$Name)
    try {
        $value = $Key.GetValue($Name, $null)
        if ($null -eq $value) { return '' }
        return [string]$value
    } catch {
        return ''
    }
}

function Normalize-RegistryPathValue {
    param([string]$PathValue)
    if ([string]::IsNullOrWhiteSpace($PathValue)) { return '' }
    return [Environment]::ExpandEnvironmentVariables($PathValue.Trim()).Trim('"')
}

function Get-DisplayIconPath {
    param([string]$DisplayIcon)
    if ([string]::IsNullOrWhiteSpace($DisplayIcon)) { return '' }
    $value = [Environment]::ExpandEnvironmentVariables($DisplayIcon.Trim())
    if ($value.StartsWith('"')) {
        $closingQuote = $value.IndexOf('"', 1)
        if ($closingQuote -gt 1) {
            return $value.Substring(1, $closingQuote - 1)
        }
    }
    $value = $value -replace ',\s*-?\d+\s*$', ''
    $match = [regex]::Match($value, '^(.*?\.exe)\b', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($match.Success) { return $match.Groups[1].Value.Trim('"') }
    return $value.Trim('"')
}

function Get-StataEdition {
    param([string]$ExePath, [string]$DisplayName)
    $name = [System.IO.Path]::GetFileName($ExePath)
    if ($name -match '(?i)^StataMP(-64)?\.exe$') { return 'mp' }
    if ($name -match '(?i)^StataSE(-64)?\.exe$') { return 'se' }
    if ($name -match '(?i)^StataBE(-64)?\.exe$') { return 'be' }
    if ($name -match '(?i)^StataIC(-64)?\.exe$') { return 'ic' }
    if ($DisplayName -match '(?i)MP') { return 'mp' }
    if ($DisplayName -match '(?i)SE') { return 'se' }
    if ($DisplayName -match '(?i)BE') { return 'be' }
    if ($DisplayName -match '(?i)IC') { return 'ic' }
    return $null
}

function Get-StataVersion {
    param([string]$ExePath, [string]$DisplayVersion, [string]$DisplayName)
    foreach ($value in @($DisplayName, $DisplayVersion)) {
        $match = [regex]::Match([string]$value, '(?i)Stata(?:Now)?\s*(\d{1,2})')
        if ($match.Success) { return [int]$match.Groups[1].Value }
        $match = [regex]::Match([string]$value, '(?:^|\D)(\d{1,2})(?:\D|$)')
        if ($match.Success) { return [int]$match.Groups[1].Value }
    }
    try {
        $info = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($ExePath)
        $match = [regex]::Match([string]$info.ProductVersion, '(\d{1,2})')
        if ($match.Success) { return [int]$match.Groups[1].Value }
    } catch { }
    return $null
}

function Find-StataDll {
    param([string]$ExeDirectory, [string]$PreferredEdition)
    $patterns = [ordered]@{
        mp = @('mp-64.dll', 'StataMP-64.dll')
        se = @('se-64.dll', 'StataSE-64.dll')
        be = @('be-64.dll', 'StataBE-64.dll')
        ic = @('ic-64.dll', 'StataIC-64.dll')
    }
    $editions = New-Object 'System.Collections.Generic.List[string]'
    if ($PreferredEdition -and $patterns.Contains($PreferredEdition)) {
        [void]$editions.Add($PreferredEdition)
    }
    foreach ($edition in $patterns.Keys) {
        if (-not $editions.Contains($edition)) { [void]$editions.Add($edition) }
    }
    $checkedPaths = New-Object 'System.Collections.Generic.List[string]'
    foreach ($edition in $editions) {
        foreach ($dllName in $patterns[$edition]) {
            $candidatePath = Join-Path $ExeDirectory $dllName
            [void]$checkedPaths.Add($candidatePath)
            if (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
                return [pscustomobject]@{
                    hasMatchingDll = $true
                    dllPath = (Get-Item -LiteralPath $candidatePath).FullName
                    dllEdition = $edition
                    checkedDllPaths = [string[]]$checkedPaths
                }
            }
        }
    }
    return [pscustomobject]@{
        hasMatchingDll = $false
        dllPath = $null
        dllEdition = $null
        checkedDllPaths = [string[]]$checkedPaths
    }
}

$exeNames = @(
    'StataMP-64.exe', 'StataSE-64.exe', 'StataBE-64.exe', 'StataIC-64.exe',
    'StataMP.exe', 'StataSE.exe', 'StataBE.exe', 'StataIC.exe', 'Stata.exe'
)
$uninstallPath = 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
$roots = @(
    @{ name = 'HKLM'; hive = [Microsoft.Win32.RegistryHive]::LocalMachine },
    @{ name = 'HKCU'; hive = [Microsoft.Win32.RegistryHive]::CurrentUser }
)
$views = @(
    @{ name = '64'; view = [Microsoft.Win32.RegistryView]::Registry64 },
    @{ name = '32'; view = [Microsoft.Win32.RegistryView]::Registry32 }
)

foreach ($root in $roots) {
    foreach ($view in $views) {
        $baseKey = $null
        $uninstallKey = $null
        try {
            $baseKey = [Microsoft.Win32.RegistryKey]::OpenBaseKey($root.hive, $view.view)
            $uninstallKey = $baseKey.OpenSubKey($uninstallPath, $false)
            if ($null -eq $uninstallKey) { continue }
            foreach ($subKeyName in $uninstallKey.GetSubKeyNames()) {
                $appKey = $null
                try {
                    $appKey = $uninstallKey.OpenSubKey($subKeyName, $false)
                    if ($null -eq $appKey) { continue }
                    $displayName = Get-PropertyString $appKey 'DisplayName'
                    if ([string]::IsNullOrWhiteSpace($displayName) -or $displayName -notmatch '(?i)Stata(Now)?') {
                        continue
                    }
                    $entry = [pscustomobject]@{
                        displayName = $displayName
                        displayVersion = Get-PropertyString $appKey 'DisplayVersion'
                        installLocation = Get-PropertyString $appKey 'InstallLocation'
                        displayIcon = Get-PropertyString $appKey 'DisplayIcon'
                        registryKey = $root.name + '\' + $uninstallPath + '\' + $subKeyName
                        registryView = $view.name
                    }
                    [void]$registryEntries.Add($entry)
                } catch {
                    [void]$errors.Add(('Failed to read {0}\{1} [{2}-bit]: {3}' -f $root.name, $subKeyName, $view.name, $_.Exception.Message))
                } finally {
                    if ($null -ne $appKey) { $appKey.Close() }
                }
            }
        } catch {
            [void]$errors.Add(('Failed to query {0}\{1} [{2}-bit]: {3}' -f $root.name, $uninstallPath, $view.name, $_.Exception.Message))
        } finally {
            if ($null -ne $uninstallKey) { $uninstallKey.Close() }
            if ($null -ne $baseKey) { $baseKey.Close() }
        }
    }
}

foreach ($entry in $registryEntries) {
    $candidateDirs = New-Object 'System.Collections.Generic.List[string]'
    $candidateFiles = New-Object 'System.Collections.Generic.List[string]'
    $installLocation = Normalize-RegistryPathValue $entry.installLocation
    if (-not [string]::IsNullOrWhiteSpace($installLocation)) {
        if ([System.IO.Path]::GetExtension($installLocation) -ieq '.exe') {
            [void]$candidateFiles.Add($installLocation)
            [void]$candidateDirs.Add([System.IO.Path]::GetDirectoryName($installLocation))
        } else {
            [void]$candidateDirs.Add($installLocation)
        }
    }
    $iconPath = Normalize-RegistryPathValue (Get-DisplayIconPath $entry.displayIcon)
    if (-not [string]::IsNullOrWhiteSpace($iconPath)) {
        if ([System.IO.Path]::GetExtension($iconPath) -ieq '.exe') {
            [void]$candidateFiles.Add($iconPath)
            [void]$candidateDirs.Add([System.IO.Path]::GetDirectoryName($iconPath))
        } else {
            [void]$candidateDirs.Add($iconPath)
        }
    }
    foreach ($directory in $candidateDirs) {
        foreach ($exeName in $exeNames) {
            try { [void]$candidateFiles.Add((Join-Path $directory $exeName)) } catch { }
        }
    }
    foreach ($candidatePath in $candidateFiles) {
        $fileName = [System.IO.Path]::GetFileName($candidatePath)
        if ($exeNames -notcontains $fileName) { continue }
        if (-not (Test-Path -LiteralPath $candidatePath -PathType Leaf)) { continue }
        $fullPath = (Get-Item -LiteralPath $candidatePath).FullName
        if (-not $seenPaths.Add($fullPath)) { continue }
        $installDirectory = [System.IO.Path]::GetDirectoryName($fullPath)
        $edition = Get-StataEdition $fullPath $entry.displayName
        $dll = Find-StataDll $installDirectory $edition
        $licensePath = Join-Path $installDirectory 'stata.lic'
        [void]$candidates.Add([pscustomobject]@{
            executablePath = $fullPath
            installDirectory = $installDirectory
            displayName = $entry.displayName
            edition = $edition
            version = Get-StataVersion $fullPath $entry.displayVersion $entry.displayName
            registryKey = $entry.registryKey
            registryView = $entry.registryView
            hasLicense = (Test-Path -LiteralPath $licensePath -PathType Leaf)
            licensePath = $licensePath
            hasMatchingDll = $dll.hasMatchingDll
            dllPath = $dll.dllPath
            dllEdition = $dll.dllEdition
            checkedDllPaths = $dll.checkedDllPaths
        })
    }
}

$stopwatch.Stop()
$stdoutOnly = $env:BAT_STDOUT_ONLY -eq '1'
$outputFile = if ($stdoutOnly) { $null } else { Join-Path (Split-Path -Parent $env:BAT_SELF) 'stata-discovery-report.json' }
$report = [ordered]@{
    schemaVersion = 1
    supported = $true
    success = $true
    startedAt = $startedAt
    finishedAt = (Get-Date).ToUniversalTime().ToString('o')
    elapsedMs = [math]::Round($stopwatch.Elapsed.TotalMilliseconds, 2)
    timedOut = $false
    searchedKeys = $registryEntries.Count
    registryLocations = @(
        'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall [64-bit and 32-bit views]',
        'HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall [64-bit and 32-bit views]'
    )
    registryEntries = [object[]]$registryEntries
    candidates = [object[]]$candidates
    errors = [string[]]$errors
    outputFile = $outputFile
}

$json = $report | ConvertTo-Json -Depth 8 -Compress:$stdoutOnly
if ($outputFile) {
    [System.IO.File]::WriteAllText($outputFile, $json, (New-Object System.Text.UTF8Encoding $false))
}
[Console]::Out.WriteLine($json)
exit 0
