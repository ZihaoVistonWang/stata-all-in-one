# ============================================================
# Universal Stata Runner (Parameterized Version)
# 通用 Stata 运行工具（参数化版本）
# ============================================================

param (
    [string]$stataPath,
    [string]$doFilePath
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
            Start-Sleep -Milliseconds 200 
        }
        Start-Sleep -Seconds 2
        $proc = Get-Process | Where-Object { $_.ProcessName -like "*Stata*" }
    } else {
        Write-Error "Invalid Stata Path: $stataPath"
        exit
    }
}

# 2. Fuzzy Match Window Title / 模糊匹配窗口标题
$stataWindow = $proc | Where-Object { $_.MainWindowTitle -match "Stata" } | Select-Object -First 1
$actualTitle = $stataWindow.MainWindowTitle

# 3. Execute Command / 执行指令
$wshell = New-Object -ComObject WScript.Shell

if ($actualTitle -and $wshell.AppActivate($actualTitle)) {
    # Compatibility path conversion / 路径兼容性转换
    $cleanPath = $doFilePath.Replace("\", "/")
    
    # Put the command into Clipboard / 存入剪贴板
    Set-Clipboard -Value "do `"$cleanPath`""
    
    Start-Sleep -Milliseconds 500
    
    # Paste and Enter / 粘贴并回车
    $wshell.SendKeys("^v")
    Start-Sleep -Milliseconds 300
    $wshell.SendKeys("~") 
}