param (
    [string]$stataPath,
    [string]$doFilePath,
    [int]$sleepDelay = 100
)

$ErrorActionPreference = 'Stop'

# Try to use keybd_event for more reliable key injection (Windows 10/11)
# Falls back to SendKeys if P/Invoke is not available (e.g., restricted environments)
$useKeyboardHelper = $false
try {
    Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class KeyboardHelper {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@ -ErrorAction Stop
    $useKeyboardHelper = $true
} catch {
    # P/Invoke not available, will use SendKeys fallback
    $useKeyboardHelper = $false
}

function Send-CtrlV {
    if ($useKeyboardHelper) {
        # Method 1: Use keybd_event for maximum reliability
        $VK_CONTROL = 0x11
        $VK_V = 0x56
        $KEYEVENTF_KEYUP = 0x0002

        [KeyboardHelper]::keybd_event($VK_CONTROL, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 20
        [KeyboardHelper]::keybd_event($VK_V, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 20
        [KeyboardHelper]::keybd_event($VK_V, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 20
        [KeyboardHelper]::keybd_event($VK_CONTROL, 0, $KEYEVENTF_KEYUP, [UIntPtr]::Zero)
    } else {
        # Method 2: Use SendKeys with extended delay (fallback for restricted environments)
        $global:wshell.SendKeys('^v')
    }
}

if (-not $stataPath) {
    Write-Error 'stataPath is required'
    exit 1
}

if (-not $doFilePath) {
    Write-Error 'doFilePath is required'
    exit 1
}

$proc = Get-Process | Where-Object { $_.ProcessName -like '*Stata*' }

if (-not $proc) {
    if (-not (Test-Path -LiteralPath $stataPath)) {
        Write-Error ('Invalid Stata Path: ' + $stataPath)
        exit 1
    }

    Start-Process -FilePath $stataPath
    $startTime = Get-Date
    $timeout = New-TimeSpan -Seconds 10

    while (-not (Get-Process | Where-Object { $_.ProcessName -like '*Stata*' })) {
        if ((Get-Date) - $startTime -gt $timeout) {
            Write-Error 'Timeout: Stata failed to start within 10 seconds'
            exit 1
        }
        Start-Sleep -Milliseconds $sleepDelay
    }

    Start-Sleep -Seconds 2
    $proc = Get-Process | Where-Object { $_.ProcessName -like '*Stata*' }
}

$wshell = New-Object -ComObject WScript.Shell
$global:wshell = $wshell
$dataEditorTitle = ([string]([char]0x6570) + [char]0x636E + [char]0x7F16 + [char]0x8F91 + [char]0x5668)
$targetTitles = @('Viewer', 'Data Editor', $dataEditorTitle)

foreach ($title in $targetTitles) {
    $attempt = 0
    while (($attempt -lt 5) -and $wshell.AppActivate($title)) {
        Write-Host ('Closing window matching: ' + $title)
        Start-Sleep -Milliseconds $sleepDelay
        $wshell.SendKeys('%{F4}')
        Start-Sleep -Milliseconds ($sleepDelay * 2)
        $attempt = $attempt + 1
    }
}

$activated = $false
$stataWindow = $proc | Where-Object { $_.MainWindowTitle -match 'Stata' } | Select-Object -First 1

if ($stataWindow -and $stataWindow.MainWindowTitle) {
    $activated = $wshell.AppActivate($stataWindow.MainWindowTitle)
}

if ((-not $activated) -and $proc -and $proc[0].Id) {
    $activated = $wshell.AppActivate($proc[0].Id)
}

if ($activated) {
    Start-Sleep -Milliseconds $sleepDelay
    $cleanPath = $doFilePath -replace '\\', '/'
    $quote = [char]34
    $runCommand = 'do ' + $quote + $cleanPath + $quote

    Set-Clipboard -Value $runCommand
    Start-Sleep -Milliseconds ($sleepDelay + 50)
    Send-CtrlV
    Start-Sleep -Milliseconds ($sleepDelay + 50)
    $wshell.SendKeys('~')
}