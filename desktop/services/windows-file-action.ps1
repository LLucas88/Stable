$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class StableFileShell {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct OpenInfo { public string File; public string Class; public uint Flags; }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
  public static extern int SHOpenWithDialog(IntPtr parent, ref OpenInfo info);
  [DllImport("shlwapi.dll", CharSet=CharSet.Unicode)]
  public static extern int AssocQueryString(uint flags, uint kind, string association, string verb, StringBuilder output, ref uint length);
  [DllImport("ole32.dll")]
  public static extern int CoInitializeEx(IntPtr reserved, uint mode);
  [DllImport("ole32.dll")]
  public static extern void CoUninitialize();
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
  public static extern int SHParseDisplayName(string name, IntPtr bindContext, out IntPtr pidl, uint attributes, out uint actualAttributes);
  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")]
  public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")]
  public static extern bool ShowWindowAsync(IntPtr window, int command);
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();
}
'@
if ($env:STABLE_FILE_ACTION -in @('reveal','probeReveal')) {
  # Validate the item through the shell before opening Explorer. Visibility and
  # selection, rather than a successful dispatch alone, determine IPC success.
  $result = [StableFileShell]::CoInitializeEx([IntPtr]::Zero, 2)
  [Runtime.InteropServices.Marshal]::ThrowExceptionForHR($result)
  $pidl = [IntPtr]::Zero
  try {
    if (-not [IO.File]::Exists($env:STABLE_FILE_TARGET)) { throw 'File no longer exists' }
    [uint32]$attributes = 0
    $result = [StableFileShell]::SHParseDisplayName($env:STABLE_FILE_TARGET, [IntPtr]::Zero, [ref]$pidl, 0, [ref]$attributes)
    [Runtime.InteropServices.Marshal]::ThrowExceptionForHR($result)
    if ($pidl -eq [IntPtr]::Zero) { throw 'Cannot resolve file for Explorer' }
    if ($env:STABLE_FILE_ACTION -eq 'probeReveal') { 'FILE_ITEM_RESOLVED' } else {
      # Reuse an existing folder once; otherwise explicitly request a normal
      # Explorer window, independently of this hidden helper's startup state.
      $parent = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($env:STABLE_FILE_TARGET)).TrimEnd('\')
      $leaf = [IO.Path]::GetFileName($env:STABLE_FILE_TARGET)
      $explorer = New-Object -ComObject Shell.Application
      # Use exactly one activation route, never native open followed by activation.
      $existing = @($explorer.Windows() | Where-Object {
        try { [IO.Path]::GetFullPath($_.Document.Folder.Self.Path).TrimEnd('\') -ieq $parent } catch { $false }
      } | Sort-Object { [StableFileShell]::IsWindowVisible([IntPtr]$_.HWND) } -Descending) | Select-Object -First 1
      if ($null -ne $existing) {
        $item = $existing.Document.Folder.ParseName($leaf)
        if ($null -eq $item) { throw 'Cannot select existing file' }
        $existing.Document.SelectItem($item, 29)
        $handle = [IntPtr]$existing.HWND
        if ([StableFileShell]::IsIconic($handle) -or -not [StableFileShell]::IsWindowVisible($handle)) {
          # Restoring already activates the window. Do not activate it again.
          $null = [StableFileShell]::ShowWindowAsync($handle, 9)
        } else {
          $null = [StableFileShell]::SetForegroundWindow($handle)
        }
      } else {
        $start = New-Object System.Diagnostics.ProcessStartInfo
        $start.FileName = [IO.Path]::Combine($env:SystemRoot, 'explorer.exe')
        $start.UseShellExecute = $true
        $start.WindowStyle = [Diagnostics.ProcessWindowStyle]::Normal
        # Windows file names cannot contain quotes. No cmd/PowerShell parsing.
        $start.Arguments = '/select,"' + [IO.Path]::GetFullPath($env:STABLE_FILE_TARGET) + '"'
        $launched = [Diagnostics.Process]::Start($start)
        if ($null -ne $launched) { $launched.Dispose() }
      }
      $shown = $false
      $chosenHandle = if ($null -ne $existing) { [IntPtr]$existing.HWND } else { [IntPtr]::Zero }
      $stableSince = $null
      # Give the shell's own asynchronous activation time to settle first.
      Start-Sleep -Milliseconds 400
      $deadline = [DateTime]::UtcNow.AddSeconds(6)
      while (-not $shown -and [DateTime]::UtcNow -lt $deadline) {
        $visibleSelection = $false
        $matches = @($explorer.Windows() | ForEach-Object {
          try {
            if ([IO.Path]::GetFullPath($_.Document.Folder.Self.Path).TrimEnd('\') -ieq $parent) {
              [pscustomobject]@{ View = $_; Handle = [IntPtr]$_.HWND; Foreground = ([StableFileShell]::GetForegroundWindow() -eq [IntPtr]$_.HWND); Visible = [StableFileShell]::IsWindowVisible([IntPtr]$_.HWND) }
            }
          } catch { } # Explorer tabs can disappear while enumerating.
        } | Sort-Object -Property Foreground,Visible -Descending)
        foreach ($candidate in $matches) {
          try {
            if ($chosenHandle -ne [IntPtr]::Zero -and $candidate.Handle -ne $chosenHandle) { continue }
            $item = $candidate.View.Document.Folder.ParseName($leaf)
            if ($null -eq $item) { continue }
            $selected = @($candidate.View.Document.SelectedItems() | ForEach-Object { $_.Path })
            if ([StableFileShell]::IsWindowVisible($candidate.Handle) -and
                -not [StableFileShell]::IsIconic($candidate.Handle) -and
                $selected -contains $env:STABLE_FILE_TARGET) {
              $chosenHandle = $candidate.Handle
              $visibleSelection = $true
              if ($null -eq $stableSince) { $stableSince = [DateTime]::UtcNow }
              $shown = ([DateTime]::UtcNow - $stableSince).TotalMilliseconds -ge 1000
              break
            }
          } catch { }
        }
        if (-not $visibleSelection) { $stableSince = $null }
        if (-not $shown) { Start-Sleep -Milliseconds 150 }
      }
      if (-not $shown) { throw 'Explorer did not display and select the requested file' }
      'FILE_REVEAL_VISIBLE_AND_SELECTED'
    }
  } finally {
    if ($pidl -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::FreeCoTaskMem($pidl) }
    [StableFileShell]::CoUninitialize()
  }
} elseif ($env:STABLE_FILE_ACTION -eq 'openWith') {
  $info = New-Object StableFileShell+OpenInfo
  $info.File = $env:STABLE_FILE_TARGET
  $info.Flags = 4 # OAIF_EXEC: choose an application for this file only.
  $result = [StableFileShell]::SHOpenWithDialog([IntPtr]::Zero, [ref]$info)
  if ($result -lt 0 -and $result -ne -2147023673) { throw 'Open With dialog failed' }
} elseif ($env:STABLE_FILE_ACTION -in @('browser','probeBrowser')) {
  [uint32]$length = 0
  $null = [StableFileShell]::AssocQueryString(4096, 2, 'https', 'open', $null, [ref]$length)
  if ($length -lt 1 -or $length -gt 32768) { throw 'Default browser is not configured' }
  $buffer = New-Object System.Text.StringBuilder ([int]$length)
  $result = [StableFileShell]::AssocQueryString(4096, 2, 'https', 'open', $buffer, [ref]$length)
  $executable = $buffer.ToString()
  if ($result -ne 0 -or -not [IO.File]::Exists($executable)) { throw 'Default browser cannot be resolved' }
  if ([IO.Path]::GetFileName($executable) -ieq 'OpenWith.exe') { throw 'Default browser is not configured' }
  if ($env:STABLE_FILE_ACTION -eq 'probeBrowser') {
    [IO.Path]::GetFileName($executable)
  } else {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $executable
    $start.UseShellExecute = $false
    $start.Arguments = '"' + ([Uri]$env:STABLE_FILE_TARGET).AbsoluteUri + '"'
    $null = [System.Diagnostics.Process]::Start($start)
  }
} else { throw 'Unsupported file action' }
