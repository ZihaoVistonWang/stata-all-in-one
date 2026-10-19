# JSON arrives on stdin. User paths are data, never PowerShell source.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
$player = $null
try {
    $request = [Console]::ReadLine() | ConvertFrom-Json
    Add-Type -AssemblyName PresentationCore
    Add-Type -AssemblyName WindowsBase
    $audioPath = [string]$request.path
    if ($request.ringtone -ne 'custom') {
        $events = @{ notification = 'SystemNotification'; information = 'SystemAsterisk'; warning = 'SystemExclamation' }
        $eventName = $events[[string]$request.ringtone]
        if (-not $eventName) { throw 'Unknown system sound' }
        $key = "Registry::HKEY_CURRENT_USER\AppEvents\Schemes\Apps\.Default\$eventName\.Current"
        $audioPath = [string](Get-Item -LiteralPath $key).GetValue('')
        if ([string]::IsNullOrWhiteSpace($audioPath)) { throw 'System sound is disabled or unavailable' }
        $audioPath = [Environment]::ExpandEnvironmentVariables($audioPath)
    }
    if (-not [IO.Path]::IsPathRooted($audioPath) -or -not [IO.File]::Exists($audioPath)) { throw 'Audio file is unavailable' }
    $player = New-Object System.Windows.Media.MediaPlayer
    $state = @{ ready = $false; failed = $null; ended = $false }
    $player.add_MediaOpened({ $state.ready = $true }.GetNewClosure())
    $player.add_MediaFailed({ param($sender, $eventArgs) $state.failed = $eventArgs.ErrorException.Message }.GetNewClosure())
    $player.add_MediaEnded({ $state.ended = $true }.GetNewClosure())
    $player.Open([Uri]::new($audioPath, [UriKind]::Absolute))
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $limit = [Math]::Min(300, [Math]::Max(0, [double]$request.durationSeconds))
    $started = $false
    while (-not $started -or $clock.Elapsed.TotalSeconds -lt $limit) {
        # WPF media events need an STA Dispatcher, even without a window.
        $frame = New-Object System.Windows.Threading.DispatcherFrame
        $frameCallback = { $frame.Continue = $false }.GetNewClosure()
        $callback = [Action]$frameCallback
        [void][System.Windows.Threading.Dispatcher]::CurrentDispatcher.BeginInvoke([System.Windows.Threading.DispatcherPriority]::Background, $callback)
        [System.Windows.Threading.Dispatcher]::PushFrame($frame)
        if ($state.failed) { throw $state.failed }
        if ($state.ready -and (-not $started -or $state.ended)) {
            $state.ended = $false
            $player.Position = [TimeSpan]::Zero
            $player.Play()
            if (-not $started) {
                $clock.Restart()
                [Console]::Out.WriteLine('SAIO_AUDIO_READY')
                [Console]::Out.Flush()
                $started = $true
            }
        }
        if (-not $state.ready -and $clock.Elapsed.TotalSeconds -gt 5) { throw 'Audio decoder timed out' }
        Start-Sleep -Milliseconds 20
    }
    if (-not $started) { throw 'Audio could not be opened before the playback deadline' }
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
} finally {
    if ($null -ne $player) { $player.Stop(); $player.Close() }
}
