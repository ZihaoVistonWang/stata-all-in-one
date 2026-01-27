# ============================================================
# Universal Stata Runner (Parameterized Version)
# 通用 Stata 运行工具（参数化版本）
# ============================================================

param (
    [string]$stataPath,
    [string]$doFilePath,
    [int]$sleepDelay = 100
)

# 1. Identify Stata process / 自动识别 Stata 进程
$proc = Get-Process | Where-Object { $_.ProcessName -like "*Stata*" }

if (-not $proc) {
    # If not running, start it using the provided path / 如果未运行，按提供的路径启动
    if (Test-Path $stataPath) {
        Start-Process $stataPath
        $startTime = Get-Date
        $timeout = New-TimeSpan -Seconds 10
        
        while (-not (Get-Process | Where-Object { $_.ProcessName -like "*Stata*" })) { 
            if ((Get-Date) - $startTime -gt $timeout) {
                Write-Error "Timeout: Stata failed to start within 10 seconds"
                exit 1
            }
            Start-Sleep -Milliseconds $sleepDelay 
        }
        Start-Sleep -Seconds 2
        $proc = Get-Process | Where-Object { $_.ProcessName -like "*Stata*" }
    } else {
        Write-Error "Invalid Stata Path: $stataPath"
        exit
    }
}

# 2. Close all help windows / 关闭所有帮助窗口
$wshell = New-Object -ComObject WScript.Shell
$helperWindows = Get-Process | Where-Object { $_.MainWindowTitle -match "help" }
if ($helperWindows.Count -gt 0) {
    Write-Host "Found $($helperWindows.Count) help window(s), closing..."
    $helperWindows | ForEach-Object {
        Write-Host "Closing: $($_.MainWindowTitle)"
        $wshell.AppActivate($_.MainWindowTitle)
        Start-Sleep -Milliseconds $sleepDelay
        $wshell.SendKeys("%{F4}")  # Alt+F4
    }
    Start-Sleep -Milliseconds $sleepDelay  # 统一等待所有窗口关闭
}

# 3. Fuzzy Match Window Title / 模糊匹配窗口标题
$stataWindow = $proc | Where-Object { $_.MainWindowTitle -match "Stata" } | Select-Object -First 1
$actualTitle = $stataWindow.MainWindowTitle

# 4. Execute Command / 执行指令

$activated = $false
if ($actualTitle) {
    $activated = $wshell.AppActivate($actualTitle)
}

if (-not $activated -and $proc -and $proc[0].Id) {
    # Fallback: activate by process ID to avoid title matching issues
    $activated = $wshell.AppActivate($proc[0].Id)
}

if ($activated) {
    Start-Sleep -Milliseconds $sleepDelay  # give focus time to settle

    # Compatibility path conversion / 路径兼容性转换
    $cleanPath = $doFilePath.Replace("\", "/")
    
    # Put the command into Clipboard / 存入剪贴板
    Set-Clipboard -Value "do `"$cleanPath`""
    
    Start-Sleep -Milliseconds $sleepDelay
    
    # Paste then Enter / 先粘贴再回车，避免粘贴被吞
    $wshell.SendKeys("^v")
    Start-Sleep -Milliseconds $sleepDelay
    $wshell.SendKeys("~")  # Enter
}