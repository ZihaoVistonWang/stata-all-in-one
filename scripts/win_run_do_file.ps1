# ============================================================
# Universal Stata Runner (Parameterized Version)
# 通用 Stata 运行工具（参数化版本）
# ============================================================

param (
    [string]$stataPath,
    [string]$doFilePath,
    [int]$sleepDelay = 200
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
    Start-Sleep -Milliseconds 200  # 统一等待所有窗口关闭
}

# 3. Fuzzy Match Window Title / 模糊匹配窗口标题
$stataWindow = $proc | Where-Object { $_.MainWindowTitle -match "Stata" } | Select-Object -First 1
$actualTitle = $stataWindow.MainWindowTitle

# 4. Execute Command / 执行指令

if ($actualTitle -and $wshell.AppActivate($actualTitle)) {
    # Compatibility path conversion / 路径兼容性转换
    $cleanPath = $doFilePath.Replace("\", "/")
    
    # Put the command into Clipboard / 存入剪贴板
    Set-Clipboard -Value "do `"$cleanPath`""
    
    Start-Sleep -Milliseconds $sleepDelay
    
    # Paste and Enter / 粘贴并回车
    $wshell.SendKeys("^v~")  # Ctrl+V 和 Enter 合并为一个操作
}