param (
    [string]$stataPath
)

# CRITICAL: Force UTF-8 encoding for stdin/stdout.
# On Chinese Windows, [Console]::In.ReadLine() defaults to GBK (code page 936),
# which corrupts UTF-8 multi-byte characters sent by Node.js.
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ErrorActionPreference = 'Continue'
$stata = $null
$initialized = $false

# ── Embed C# WindowManager for foreground Stata window ──────────
# (same P/Invoke code used by win_run_do_file_*.ps1 scripts)
try {
    Add-Type -TypeDefinition @"
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
    public static extern bool IsZoomed(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

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

    public static string GetWindowTitle(IntPtr hWnd) {
        StringBuilder sb = new StringBuilder(256);
        GetWindowText(hWnd, sb, 256);
        return sb.ToString();
    }

    public static bool IsWindowMaximized(IntPtr hWnd) {
        return IsZoomed(hWnd);
    }

    public static bool IsWindowMinimized(IntPtr hWnd) {
        return IsIconic(hWnd);
    }
}
"@ -ErrorAction SilentlyContinue | Out-Null
} catch { }

# Write diagnostic to stderr (won't interfere with JSON protocol on stdout)
function Write-Diag($msg) {
    try {
        [Console]::Error.WriteLine("[COM-SVC] $msg")
    } catch { }
}

function Write-Response($obj) {
    $json = $obj | ConvertTo-Json -Compress -Depth 4
    Write-Output $json
}

function Invoke-Init($doRegister) {
    # Step 1: Register Stata Automation if requested
    if ($doRegister) {
        Write-Diag "Registering Stata: $stataPath /Register"
        try {
            $proc = Start-Process -FilePath $stataPath `
                -ArgumentList '/Register' `
                -Verb RunAs `
                -Wait `
                -PassThru
            Write-Diag "Registration exit code: $($proc.ExitCode)"
            Start-Sleep -Milliseconds 1500
        } catch {
            Write-Diag "Registration trigger failed: $_"
        }
    }

    # Step 2: Try to create COM object
    Write-Diag "Creating COM object: stata.StataOLEApp"
    try {
        $script:stata = New-Object -ComObject stata.StataOLEApp
        Write-Diag "COM object created successfully"

        # Show Stata window (bring to foreground)
        [void]$script:stata.UtilShowStata(0)
        Write-Diag "UtilShowStata(0) called - Stata should be visible now"

        # Warm-up: run a simple DoCommand to ensure Stata is fully initialized
        # DoCommand is synchronous — blocks until Stata finishes the command
        Start-Sleep -Milliseconds 1000
        Write-Diag "Running warm-up command..."
        $warmupResult = $script:stata.DoCommand('display "Stata COM ready"')
        Write-Diag "Warm-up result: errorCode=$warmupResult"

        $script:initialized = $true
        Write-Diag "Initialization complete"
        return @{ success = $true }
    } catch {
        Write-Diag "COM creation FAILED: $_"
        $script:stata = $null
        $script:initialized = $false
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-Execute($command) {
    if (-not $script:initialized -or -not $script:stata) {
        Write-Diag "Execute rejected: not initialized"
        return @{ success = $false; error = 'COM object not initialized' }
    }

    $cmdPreview = if ($command.Length -gt 100) {
        $command.Substring(0, 100) + '...'
    } else {
        $command
    }
    Write-Diag "DoCommandAsync: $cmdPreview"

    try {
        $errorCode = $script:stata.DoCommandAsync($command)
        Write-Diag "DoCommandAsync returned errorCode=$errorCode"
        return @{ success = $true; errorCode = $errorCode }
    } catch {
        Write-Diag "DoCommandAsync FAILED: $_"
        return @{ success = $false; error = $_.Exception.Message; errorCode = -1 }
    }
}

function Invoke-Status {
    if (-not $script:initialized -or -not $script:stata) {
        return @{ isFree = $false; returnCode = -1 }
    }
    try {
        $free = $script:stata.UtilIsStataFree()
        $rc = $script:stata.UtilStataErrorCode()
        return @{ isFree = ($free -ne 0); returnCode = $rc }
    } catch {
        return @{ isFree = $false; returnCode = -1; error = $_.Exception.Message }
    }
}

function Invoke-Break {
    if (-not $script:initialized -or -not $script:stata) {
        return @{ success = $false; error = 'COM object not initialized' }
    }
    try {
        [void]$script:stata.UtilSetStataBreak()
        Write-Diag "Break sent"
        return @{ success = $true }
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-Foreground {
    # Show all Stata windows and bring main window to foreground
    # This ensures Graph, Viewer, Data Editor windows are also visible

    # First use COM to restore/show Stata
    if ($script:stata) {
        try {
            [void]$script:stata.UtilShowStata(0)
        } catch { }
    }

    # Find Stata process and show ALL its windows
    try {
        $regex = "(?i)^stata(mp|se|ic|be)?[^a-z]*$"
        $proc = Get-Process | Where-Object { $_.ProcessName -match $regex } | Select-Object -First 1
        if ($proc) {
            $handles = [WindowManager]::GetProcessWindows($proc.Id)
            $mainHandle = [IntPtr]::Zero

            # First pass: restore ALL minimized windows
            foreach ($h in $handles) {
                $title = [WindowManager]::GetWindowTitle($h)
                if ([WindowManager]::IsWindowMinimized($h)) {
                    [WindowManager]::ShowWindow($h, 9) | Out-Null  # SW_RESTORE
                    Write-Diag "Restored window: $title"
                }
                # Track main Stata window for foreground focus
                if ($title -match "(?i)^stata" -and $mainHandle -eq [IntPtr]::Zero) {
                    $mainHandle = $h
                }
            }

            Start-Sleep -Milliseconds 100

            # Second pass: bring main Stata window to foreground
            if ($mainHandle -ne [IntPtr]::Zero) {
                [WindowManager]::SetForegroundWindow($mainHandle) | Out-Null
                Write-Diag "Stata main window foregrounded"
            }
        }
    } catch {
        Write-Diag "Foreground failed (non-critical): $_"
    }
    return @{ success = $true }
}

function Invoke-Shutdown {
    Write-Diag "Shutting down..."
    if ($script:stata) {
        try {
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($script:stata) | Out-Null
        } catch { }
        $script:stata = $null
    }
    $script:initialized = $false
    return @{ success = $true }
}

Write-Diag "Service starting, stataPath=$stataPath"

# Signal ready to parent process
Write-Response @{ ready = $true }
Write-Diag "Ready signal sent"

# Main JSON-line read loop
while ($true) {
    $line = $null
    try {
        $line = [Console]::In.ReadLine()
    } catch {
        Write-Diag "ReadLine exception, exiting: $_"
        break
    }

    if ($null -eq $line) {
        Write-Diag "EOF received, exiting"
        break
    }

    $line = $line.Trim()
    if ($line -eq '') { continue }

    Write-Diag "Received: $($line.Substring(0, [Math]::Min(200, $line.Length)))"

    try {
        $req = $line | ConvertFrom-Json
    } catch {
        Write-Diag "Invalid JSON: $_"
        Write-Response @{ id = 0; success = $false; error = "Invalid JSON: $_" }
        continue
    }

    $action = $req.action
    $id = if ($req.PSObject.Properties['id']) { $req.id } else { 0 }

    switch ($action) {
        'init' {
            $doRegister = if ($req.PSObject.Properties['doRegister']) { $req.doRegister } else { $false }
            Write-Diag "Processing init (doRegister=$doRegister)"
            $result = Invoke-Init $doRegister
            $result | Add-Member -NotePropertyName 'id' -NotePropertyValue $id -Force
            Write-Response $result
        }
        'execute' {
            $result = Invoke-Execute $req.command
            $result | Add-Member -NotePropertyName 'id' -NotePropertyValue $id -Force
            Write-Response $result
            # Bring Stata to foreground after sending code
            Invoke-Foreground | Out-Null
        }
        'status' {
            $result = Invoke-Status
            $result | Add-Member -NotePropertyName 'id' -NotePropertyValue $id -Force
            Write-Response $result
        }
        'break' {
            $result = Invoke-Break
            $result | Add-Member -NotePropertyName 'id' -NotePropertyValue $id -Force
            Write-Response $result
        }
        'foreground' {
            $result = Invoke-Foreground
            $result | Add-Member -NotePropertyName 'id' -NotePropertyValue $id -Force
            Write-Response $result
        }
        'shutdown' {
            $result = Invoke-Shutdown
            $result | Add-Member -NotePropertyName 'id' -NotePropertyValue $id -Force
            Write-Response $result
            exit 0
        }
        default {
            Write-Diag "Unknown action: $action"
            Write-Response @{ id = $id; success = $false; error = "Unknown action: $action" }
        }
    }
}
