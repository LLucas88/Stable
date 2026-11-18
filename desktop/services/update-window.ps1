param([Parameter(Mandatory=$true)][string]$Directory,[int]$CenterX=-1,[int]$CenterY=-1,[switch]$Headless)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Stable 更新'
$form.FormBorderStyle = 'None'
$form.ClientSize = New-Object System.Drawing.Size(320,96)
$form.BackColor = [System.Drawing.Color]::White
$form.StartPosition = 'CenterScreen'
if ($CenterX -ne -1 -and $CenterY -ne -1) {
  $form.StartPosition = 'Manual'
  $area = [System.Windows.Forms.Screen]::FromPoint((New-Object System.Drawing.Point($CenterX,$CenterY))).WorkingArea
  $form.Location = New-Object System.Drawing.Point(([Math]::Max($area.Left,[Math]::Min($CenterX-160,$area.Right-320))),([Math]::Max($area.Top,[Math]::Min($CenterY-48,$area.Bottom-96))))
}
$form.KeyPreview = $true
$label = New-Object System.Windows.Forms.Label
$label.Location = New-Object System.Drawing.Point(24,22)
$label.Size = New-Object System.Drawing.Size(276,32)
$label.Font = New-Object System.Drawing.Font('Microsoft YaHei UI',10)
$label.Text = '正在更新…'
$track = New-Object System.Windows.Forms.Panel
$track.Location = New-Object System.Drawing.Point(24,67)
$track.Size = New-Object System.Drawing.Size(272,4)
$track.BackColor = [System.Drawing.Color]::FromArgb(237,240,235)
$fill = New-Object System.Windows.Forms.Panel
$fill.Size = New-Object System.Drawing.Size(0,4)
$fill.BackColor = [System.Drawing.Color]::FromArgb(99,120,86)
$track.Controls.Add($fill)
$form.Controls.AddRange(@($label,$track))
$script:canClose = $false
$script:successAt = $null
$script:lastEvent = Get-Date
$script:lastText = ''
$script:exitSince = $null
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 200
$form.Add_FormClosing({param($sender,$eventArgs) if(-not $script:canClose -and $eventArgs.CloseReason -eq 'UserClosing'){$eventArgs.Cancel=$true}})
$form.Add_KeyDown({param($sender,$eventArgs) if($script:canClose -and $eventArgs.KeyCode -eq 'Escape'){$form.Close()}})
$timer.Add_Tick({
  try {
    if(Test-Path -LiteralPath (Join-Path $Directory 'cancel')){$script:canClose=$true;$form.Close();return}
    $file = Join-Path $Directory 'progress'
    if(Test-Path -LiteralPath $file){
      $line = [System.IO.File]::ReadAllText($file).Trim()
      if($line -match '^(\d{1,3})\|([a-z_]+)\|(running|success|failed|failed_rolled_back)\|(\d+)$'){
        $percent=[Math]::Min(100,[int]$Matches[1]);$stage=$Matches[2];$status=$Matches[3]
        if($line -ne $script:lastText){$script:lastEvent=Get-Date;$script:lastText=$line}
        $fill.Width=[int](272*$percent/100)
        if($status -eq 'failed_rolled_back'){$label.Text='更新未完成，旧版已恢复';$script:canClose=$true}
        elseif($status -eq 'failed'){$label.Text='更新失败，请重新打开 Stable 修复';$script:canClose=$true}
        elseif($status -eq 'success' -and $stage -eq 'complete' -and $percent -eq 100){
          $label.Text='正在重启…'
          if($null -eq $script:successAt){$script:successAt=Get-Date}
          if(Test-Path -LiteralPath (Join-Path $Directory 'restarted')){$script:canClose=$true;$form.Close();return}
          if(((Get-Date)-$script:successAt).TotalSeconds -gt 60){$label.Text='请手动打开 Stable';$script:canClose=$true}
        }
      }
    }
    if(-not $script:canClose -and $null -eq $script:successAt -and ((Get-Date)-$script:lastEvent).TotalMinutes -gt 10){$label.Text='更新暂未完成，请稍候…';$script:canClose=$true}
    $pidFile = Join-Path $Directory 'progress.pid'
    if(-not $script:canClose -and $null -eq $script:successAt -and (Test-Path -LiteralPath $pidFile)){
      $installerId = [System.IO.File]::ReadAllText($pidFile).Trim()
      if($installerId -match '^\d+$' -and -not (Get-Process -Id ([int]$installerId) -ErrorAction SilentlyContinue)){
        if($null -eq $script:exitSince){$script:exitSince=Get-Date}
        if(((Get-Date)-$script:exitSince).TotalSeconds -gt 5){$label.Text='更新意外中断，请重新打开 Stable';$script:canClose=$true}
      }else{$script:exitSince=$null}
    }
    if($Headless){[System.IO.File]::WriteAllText((Join-Path $Directory 'observed.json'),(@{text=$label.Text;width=$fill.Width;canClose=$script:canClose}|ConvertTo-Json -Compress))}
  } catch { } # An atomic progress-file replacement can briefly make the file unreadable.
})
if($Headless){$form.Opacity=0;$form.ShowInTaskbar=$false}
$form.Add_Shown({[System.IO.File]::WriteAllText((Join-Path $Directory 'ready'),'ready');$timer.Start()})
try{[System.Windows.Forms.Application]::Run($form)}finally{$timer.Dispose();$form.Dispose()}
