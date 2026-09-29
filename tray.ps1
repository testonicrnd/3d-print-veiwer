Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type -Name WinUser -Namespace AirmaxTray -MemberDefinition @'
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
'@

Start-Sleep -Milliseconds 800

$hta = Get-Process mshta -ErrorAction SilentlyContinue |
       Sort-Object StartTime -Descending |
       Select-Object -First 1

if (-not $hta) { exit }

$hwnd          = $hta.MainWindowHandle
$script:shown  = $true

$ni            = New-Object System.Windows.Forms.NotifyIcon
$ni.Icon       = [System.Drawing.SystemIcons]::Application
$ni.Text       = "AIRMAX 서버"
$ni.Visible    = $true

function Toggle {
    if ($script:shown) {
        [AirmaxTray.WinUser]::ShowWindow($hwnd, 0) | Out-Null
        $script:shown = $false
    } else {
        [AirmaxTray.WinUser]::ShowWindow($hwnd, 9) | Out-Null
        [AirmaxTray.WinUser]::SetForegroundWindow($hwnd) | Out-Null
        $script:shown = $true
    }
}

$ctx = New-Object System.Windows.Forms.ContextMenuStrip

$itemToggle = $ctx.Items.Add("표시 / 숨기기")
$itemToggle.add_Click({ Toggle })

$ctx.Items.Add("-") | Out-Null

$itemExit = $ctx.Items.Add("트레이 종료")
$itemExit.add_Click({
    $ni.Visible = $false
    $ni.Dispose()
    [System.Windows.Forms.Application]::Exit()
})

$ni.ContextMenuStrip = $ctx
$ni.add_DoubleClick({ Toggle })

# HTA가 닫히면 트레이도 자동 종료
$timer          = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.add_Tick({
    if (-not (Get-Process -Id $hta.Id -ErrorAction SilentlyContinue)) {
        $ni.Visible = $false
        $ni.Dispose()
        [System.Windows.Forms.Application]::Exit()
    }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
