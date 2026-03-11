param (
    [string]$stataPath,
    [string]$doFilePath,
    [int]$sleepDelay = 100
)

$ErrorActionPreference = 'Stop'

# 1. Embed C# API for advanced window enumeration and management
$code = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Collections.Generic;

public class WindowManager {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool IsZoomed(IntPtr hWnd); // Checks if window is maximized

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd); // Checks if window is minimized

    // Get all visible windows belonging to a specific Process ID
    public static List<IntPtr> GetProcessWindows(uint pid) {
        List<IntPtr> windows = new List<IntPtr>();
        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
            uint windowPid;
            GetWindowThreadProcessId(hWnd, out windowPid);
            if (windowPid == pid && IsWindowVisible(hWnd)) {
                windows.Add(hWnd);
            }
            return true;
        }, IntPtr.Zero);
        return windows;
    }

    // Read the title of a specific window
    public static string GetWindowTitle(IntPtr hWnd) {
        StringBuilder sb = new StringBuilder(256);
        GetWindowText(hWnd, sb, 256);
        return sb.ToString();
    }
    
    // Check if a window is maximized
    public static bool IsWindowMaximized(IntPtr hWnd) {
        return IsZoomed(hWnd);
    }
    
    // Check if a window is minimized
    public static bool IsWindowMinimized(IntPtr hWnd) {
        return IsIconic(hWnd);
    }
}
"@

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

# 2. Load WindowManager API
try {
    Add-Type -TypeDefinition $code -ErrorAction Stop
} catch {
    # API may already be loaded, ignore error
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

# 3. Load WindowManager API
try {
    Add-Type -TypeDefinition $code -ErrorAction Stop
} catch {
    # API may already be loaded, ignore error
}

# 4. Find Stata process, launch if not exists
$regex = "(?i)^stata(mp|se|ic|be)?[^a-z]*$"
$proc = Get-Process | Where-Object { $_.ProcessName -match $regex } | Select-Object -First 1

if (-not $proc) {
    if (-not (Test-Path -LiteralPath $stataPath)) {
        Write-Error ('Invalid Stata Path: ' + $stataPath)
        exit 1
    }

    Start-Process -FilePath $stataPath
    $startTime = Get-Date
    $timeout = New-TimeSpan -Seconds 10

    while (-not (Get-Process | Where-Object { $_.ProcessName -match $regex })) {
        if ((Get-Date) - $startTime -gt $timeout) {
            Write-Error 'Timeout: Stata failed to start within 10 seconds'
            exit 1
        }
        Start-Sleep -Milliseconds $sleepDelay
    }

    Start-Sleep -Seconds 2
    $proc = Get-Process | Where-Object { $_.ProcessName -match $regex } | Select-Object -First 1
}

$global:wshell = New-Object -ComObject WScript.Shell
$dataEditorTitle = ([string]([char]0x6570) + [char]0x636E + [char]0x7F16 + [char]0x8F91 + [char]0x5668)
$targetTitles = @('Viewer', 'Data Editor', $dataEditorTitle)

# Check if main Stata window was maximized before closing other windows
$wasMaximized = $false
if ($proc) {
    $handles = [WindowManager]::GetProcessWindows($proc.Id)
    foreach ($h in $handles) {
        $title = [WindowManager]::GetWindowTitle($h)
        if ($title -match "(?i)^stata") {
            if ([WindowManager]::IsWindowMaximized($h)) {
                $wasMaximized = $true
            }
            break
        }
    }
}

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

# Use WindowManager API to precisely locate and activate Stata main window
$handles = [WindowManager]::GetProcessWindows($proc.Id)
$mainHandle = [IntPtr]::Zero
$foundTitle = ""

# Loop through all windows and find the main window whose title starts with "Stata"
# Helper windows are usually "Viewer", "Data Editor", etc.
foreach ($h in $handles) {
    $title = [WindowManager]::GetWindowTitle($h)
    
    if ($title -match "(?i)^stata") {
        $mainHandle = $h
        $foundTitle = $title
        break
    }
}

# Activate main window
if ($mainHandle -ne [IntPtr]::Zero) {
    # Determine appropriate show command based on previous state
    if ($wasMaximized) {
        # If window was maximized before, maximize it again
        [WindowManager]::ShowWindow($mainHandle, 3) | Out-Null  # SW_MAXIMIZE = 3
    } else {
        # If window was not maximized, just restore it
        [WindowManager]::ShowWindow($mainHandle, 9) | Out-Null  # SW_RESTORE = 9
    }
    Start-Sleep -Milliseconds $sleepDelay
    
    # Set window to foreground
    [WindowManager]::SetForegroundWindow($mainHandle) | Out-Null
    Start-Sleep -Milliseconds $sleepDelay
    
    $activated = $true
} else {
    # Fallback: if main window not found, use traditional AppActivate method
    $wshell = New-Object -ComObject WScript.Shell
    $activated = $false
    
    $stataWindow = $proc | Where-Object { $_.MainWindowTitle -match 'Stata' } | Select-Object -First 1

    if ($stataWindow -and $stataWindow.MainWindowTitle) {
        $activated = $wshell.AppActivate($stataWindow.MainWindowTitle)
    }

    if ((-not $activated) -and $proc -and $proc[0].Id) {
        $activated = $wshell.AppActivate($proc[0].Id)
    }
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