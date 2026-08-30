Var newStartMenuLink
Var oldStartMenuLink
Var newDesktopLink
Var oldDesktopLink
Var oldShortcutName
Var oldMenuDirectory
Var stableProgressFile
Var stableProgressPercent
Var stableProgressStage
Var stableProgressStatus
Var stableProgressCode
Var stableUpdateCanClose
Var stableProgressBar
Var stableProgressText

!include "common.nsh"
!include "MUI2.nsh"
!include "multiUser.nsh"

Function stableInstFilesShow
  Push $R0
  Push $R1
  Push $R2
  Push $R3
  Push $R6
  Push $R7
  Push $R8
  Push $R9

  StrCpy $stableProgressBar ""
  StrCpy $stableProgressText ""
  ${if} ${isUpdated}
  ${andIfNot} ${Silent}
    FindWindow $R9 "#32770" "" $HWNDPARENT
    StrCmp $R9 0 stableProgressPageDone
    GetDlgItem $stableProgressBar $R9 1004
    GetDlgItem $stableProgressText $R9 1006
    StrCmp $stableProgressBar 0 stableProgressPageDone
    SendMessage $stableProgressBar 0x0406 0 100
    SendMessage $stableProgressBar 0x0402 0 0
    ShowWindow $stableProgressBar ${SW_SHOW}
  ${endif}
  stableProgressPageDone:
  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
FunctionEnd

!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW stableInstFilesShow
!macroend

Function stableAbortGuard
  ${if} ${isUpdated}
  ${andIf} $stableUpdateCanClose != "true"
    Abort
  ${endif}
FunctionEnd

!define MUI_CUSTOMFUNCTION_ABORT stableAbortGuard

Function stableWriteUpdateProgress
  Push $R7
  Push $R8
  Push $R9

  ${if} ${isUpdated}
  ${andIfNot} ${Silent}
    StrCpy $R9 "$stableProgressPercent% · 正在安装更新…"
    ${if} $stableProgressStatus == "failed_rolled_back"
      StrCpy $R9 "$stableProgressPercent% · 更新未完成，旧版本已恢复（错误码 $stableProgressCode）"
    ${elseif} $stableProgressStatus == "failed"
      StrCpy $R9 "$stableProgressPercent% · 更新失败，请保留安装目录（错误码 $stableProgressCode）"
    ${elseif} $stableProgressStage == "preparing"
      StrCpy $R9 "$stableProgressPercent% · 正在等待 Stable 安全退出…"
    ${elseif} $stableProgressStage == "launching"
      StrCpy $R9 "$stableProgressPercent% · 正在启动更新安装器…"
    ${elseif} $stableProgressStage == "staging"
      StrCpy $R9 "$stableProgressPercent% · 正在解压并校验新版文件…"
    ${elseif} $stableProgressStage == "runtime"
      StrCpy $R9 "$stableProgressPercent% · 正在检查本地运行环境…"
    ${elseif} $stableProgressStage == "stopping"
      StrCpy $R9 "$stableProgressPercent% · 正在关闭旧版本…"
    ${elseif} $stableProgressStage == "switching"
      StrCpy $R9 "$stableProgressPercent% · 正在切换到新版…"
    ${elseif} $stableProgressStage == "healthcheck"
      StrCpy $R9 "$stableProgressPercent% · 正在验证新版可以正常启动…"
    ${elseif} $stableProgressStage == "rolling_back"
      StrCpy $R9 "$stableProgressPercent% · 新版验证失败，正在恢复旧版本…"
    ${elseif} $stableProgressStage == "finalizing"
      StrCpy $R9 "$stableProgressPercent% · 正在更新快捷方式和安装记录…"
    ${elseif} $stableProgressStage == "complete"
      StrCpy $R9 "100% · 更新安装完成，请重新点击 Stable 图标打开新版。"
    ${endif}
    SendMessage $HWNDPARENT ${WM_SETTEXT} 0 "STR:Stable v${VERSION} 更新"
    ${if} $stableProgressBar != ""
      SendMessage $stableProgressBar 0x0402 $stableProgressPercent 0
    ${endif}
    ${if} $stableProgressText != ""
      SendMessage $stableProgressText ${WM_SETTEXT} 0 "STR:$R9"
    ${endif}
  ${endif}

  ${if} $stableProgressFile != ""
    StrCpy $R7 "$stableProgressFile.tmp"
    Delete "$R7"
    ClearErrors
    FileOpen $R8 "$R7" w
    IfErrors stableProgressWriteDone
    FileWrite $R8 "$stableProgressPercent|$stableProgressStage|$stableProgressStatus|$stableProgressCode$\r$\n"
    FileClose $R8
    Delete "$stableProgressFile"
    Rename "$R7" "$stableProgressFile"
    ClearErrors
    FileOpen $R8 "$stableProgressFile.log" a
    IfErrors stableProgressWriteDone
    FileWrite $R8 "$stableProgressPercent|$stableProgressStage|$stableProgressStatus|$stableProgressCode$\r$\n"
    FileClose $R8
  ${endif}
  stableProgressWriteDone:
  ReadEnvStr $R7 "STABLE_UPDATE_QA_PROGRESS_DELAY_MS"
  ${if} $R7 != ""
    Sleep $R7
  ${endif}
  Pop $R9
  Pop $R8
  Pop $R7
FunctionEnd

!macro stableReportProgress percent stage status code
  StrCpy $stableProgressPercent "${percent}"
  StrCpy $stableProgressStage "${stage}"
  StrCpy $stableProgressStatus "${status}"
  StrCpy $stableProgressCode "${code}"
  Call stableWriteUpdateProgress
!macroend

!macro stableStopUpdate code message
  StrCpy $stableUpdateCanClose "true"
  SetErrorLevel ${code}
  ${if} ${isUpdated}
  ${andIfNot} ${Silent}
    Abort "$stableProgressPercent% · ${message}（E${code}）"
  ${endif}
  Quit
!macroend

!macro customCheckAppRunning
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK stableUninstallStopProcess
    Quit

    stableUninstallStopProcess:
    DetailPrint "$(appClosing)"
    ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    Sleep 1000
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      Sleep 300
    ${endif}
  ${endif}
!macroend

!include "allowOnlyOneInstallerInstance.nsh"

!ifdef BUILD_UNINSTALLER
  !ifmacrodef customUnInstallSection
    !define MUI_COMPONENTSPAGE_NODESC
    !insertmacro MUI_UNPAGE_COMPONENTS
  !endif
!endif

!ifdef INSTALL_MODE_PER_ALL_USERS
  !ifdef BUILD_UNINSTALLER
    RequestExecutionLevel user
  !else
    RequestExecutionLevel admin
  !endif
!else
  RequestExecutionLevel user
!endif

!ifdef BUILD_UNINSTALLER
  SilentInstall silent
!else
  Var appExe
  Var launchLink
!endif

!ifdef ONE_CLICK
  !include "oneClick.nsh"
!else
  !include "assistedInstaller.nsh"
!endif

!insertmacro addLangs

!ifmacrodef customHeader
  !insertmacro customHeader
!endif

Function .onInit
  Call setInstallSectionSpaceRequired

  SetOutPath $INSTDIR
  ${LogSet} on

  !ifmacrodef preInit
    !insertmacro preInit
  !endif

  !ifdef DISPLAY_LANG_SELECTOR
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  !ifdef BUILD_UNINSTALLER
    WriteUninstaller "${UNINSTALLER_OUT_FILE}"
    !insertmacro quitSuccess
  !else
    !insertmacro check64BitAndSetRegView

    !ifdef ONE_CLICK
      !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE
    !else
      ${IfNot} ${UAC_IsInnerInstance}
        !insertmacro ALLOW_ONLY_ONE_INSTALLER_INSTANCE
      ${EndIf}
    !endif

    !insertmacro initMultiUser

    !ifmacrodef customInit
      !insertmacro customInit
    !endif

    !ifmacrodef addLicenseFiles
      InitPluginsDir
      !insertmacro addLicenseFiles
    !endif
  !endif
FunctionEnd

!ifndef BUILD_UNINSTALLER
  !include "installUtil.nsh"
!endif

!include "installer.nsh"

Function stableInstallApplicationFiles
  !ifdef APP_BUILD_DIR
    File /r "${APP_BUILD_DIR}\*.*"
  !else
    !insertmacro extractEmbeddedAppPackage
    ${if} $installMode == "all"
      SetShellVarContext current
    ${endif}
    !insertmacro copyFile "$EXEPATH" "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
  !endif
FunctionEnd

Function stableCheckAppRunning
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
  ${if} $R0 == 0
    ${ifNot} ${isUpdated}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK stableStopProcess
      Quit
    ${endif}

    DetailPrint "正在等待 Stable 安全退出…"
    StrCpy $R1 0
    stableWaitForProcessExit:
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 != 0
      Goto stableProcessStopped
    ${endif}
    Sleep 250
    IntOp $R1 $R1 + 1
    IntCmp $R1 40 stableStopProcess stableWaitForProcessExit stableStopProcess

    stableStopProcess:
    DetailPrint "$(appClosing)"
    ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    Sleep 1000
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      Sleep 300
    ${endif}
    stableProcessStopped:
  ${endif}
FunctionEnd

Section "install" INSTALL_SECTION_ID
  !ifndef BUILD_UNINSTALLER
    !ifndef INSTALL_MODE_PER_ALL_USERS
      !ifndef ONE_CLICK
        ${if} $hasPerMachineInstallation == "1"
        ${andIf} ${Silent}
          ${ifNot} ${UAC_IsAdmin}
            ShowWindow $HWNDPARENT ${SW_HIDE}
            !insertmacro UAC_RunElevated
            ${Switch} $0
              ${Case} 0
                ${Break}
              ${Case} 1223
                ${Break}
              ${Default}
                MessageBox mb_IconStop|mb_TopMost|mb_SetForeground "Unable to elevate, error $0"
                ${Break}
            ${EndSwitch}
            Quit
          ${else}
            !insertmacro setInstallModePerAllUsers
          ${endIf}
        ${endIf}
      !endif
    !endif
    !include "stable-install-section.nsh"
  !endif
SectionEnd

Function setInstallSectionSpaceRequired
  !insertmacro setSpaceRequired ${INSTALL_SECTION_ID}
FunctionEnd

!define BUILD_UNINSTALLER
!macro customUnInstall
  Var /GLOBAL stableUninstallRuntimeDir
  ReadRegStr $R7 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${if} $R7 != ""
    StrCpy $INSTDIR "$R7"
  ${elseif} ${FileExists} "$EXEDIR\${APP_EXECUTABLE_FILENAME}"
    StrCpy $INSTDIR "$EXEDIR"
  ${endif}
  ReadEnvStr $stableUninstallRuntimeDir "STABLE_RUNTIME_HOME"
  ${if} $stableUninstallRuntimeDir == ""
    StrCpy $stableUninstallRuntimeDir "$LOCALAPPDATA\stable-desktop\runtime-v1"
  ${endif}
  RMDir /r "$stableUninstallRuntimeDir"
  SetOutPath "$TEMP"
  RMDir /r "$INSTDIR"
  ${if} ${FileExists} "$INSTDIR\*.*"
    System::Call 'Kernel32::SetEnvironmentVariable(t "STABLE_UNINSTALL_DIR", t "$INSTDIR")'
    Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Remove-Item -LiteralPath $$env:STABLE_UNINSTALL_DIR -Recurse -Force -ErrorAction SilentlyContinue"`
  ${endif}
!macroend
!include "uninstaller.nsh"
!undef BUILD_UNINSTALLER
