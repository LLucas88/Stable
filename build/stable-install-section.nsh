InitPluginsDir

${if} ${isUpdated}
  StrCpy $stableUpdateCanClose "false"
  !insertmacro stableReportProgress "4" "preparing" "running" "0"
${endif}

${IfNot} ${Silent}
  SetDetailsPrint none
${endif}

StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

!insertmacro setLinkVars

!ifdef ONE_CLICK
  ${IfNot} ${isUpdated}
    !ifdef HEADER_ICO
      File /oname=$PLUGINSDIR\installerHeaderico.ico "${HEADER_ICO}"
    !endif
    ${IfNot} ${Silent}
      !ifdef HEADER_ICO
        SpiderBanner::Show /MODERN /ICON "$PLUGINSDIR\installerHeaderico.ico"
      !else
        SpiderBanner::Show /MODERN
      !endif
      FindWindow $0 "#32770" "" $hwndparent
      FindWindow $0 "#32770" "" $hwndparent $0
      GetDlgItem $0 $0 1000
      SendMessage $0 ${WM_SETTEXT} 0 "STR:$(installing)"
      StrCpy $1 $hwndparent
      System::Call 'user32::ShutdownBlockReasonCreate(${SYSTYPE_PTR}r1, w "$(installing)")'
    ${endif}
  ${endif}
  Call stableCheckAppRunning
!else
  ${ifNot} ${UAC_IsInnerInstance}
    Call stableCheckAppRunning
  ${endif}
!endif

Var /GLOBAL keepShortcuts
Var /GLOBAL stableRenameAttempt
!macro stableRenameWithRetry source destination
  StrCpy $stableRenameAttempt 0
  ${Do}
    ClearErrors
    Rename "${source}" "${destination}"
    ${IfNot} ${Errors}
      ${ExitDo}
    ${EndIf}
    IntOp $stableRenameAttempt $stableRenameAttempt + 1
    ${If} $stableRenameAttempt >= 10
      ${ExitDo}
    ${EndIf}
    Sleep 500
  ${Loop}
  ${If} $stableRenameAttempt >= 10
    SetErrors
  ${Else}
    ClearErrors
  ${EndIf}
!macroend
Var /GLOBAL stableStageDir
Var /GLOBAL stablePreviousDir
Var /GLOBAL stableFailedDir
Var /GLOBAL stableRuntimeDir
Var /GLOBAL stableRuntimeMigrated
Var /GLOBAL stableRuntimeCopied

StrCpy $keepShortcuts "false"
!insertMacro setIsTryToKeepShortcuts
${if} $isTryToKeepShortcuts == "true"
  ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" KeepShortcuts
  ${if} $R1 == "true"
  ${andIf} ${FileExists} "$appExe"
    StrCpy $keepShortcuts "true"
  ${endIf}
${endif}

!ifdef STABLE_LIGHTWEIGHT_UPDATE
  ${ifNot} ${FileExists} "$appExe"
    !insertmacro stableStopUpdate 21 "未找到原 Stable 安装。请使用 Stable-Setup 完整安装包修复或首次安装。"
  ${endif}
  Goto stableAtomicUpdate
!endif
${if} ${isUpdated}
  ${ifNot} ${FileExists} "$appExe"
    !insertmacro stableStopUpdate 21 "原 Stable 安装目录无效，更新已停止。请使用 Stable-Setup 完整安装包修复。"
  ${endif}
  Goto stableAtomicUpdate
${endif}
${if} ${FileExists} "$appExe"
  Goto stableAtomicUpdate
${endif}
Goto stableLegacyInstall

stableAtomicUpdate:
  StrCpy $stableStageDir "$INSTDIR.__stable_next_${VERSION}"
  StrCpy $stablePreviousDir "$INSTDIR.__stable_previous_${VERSION}"
  StrCpy $stableFailedDir "$INSTDIR.__stable_failed_${VERSION}"
  ; A prior failure may contain long or temporarily locked paths that NSIS
  ; cannot delete. Never depend on deleting it to isolate this attempt.
  StrCpy $R2 0
stableChooseFailedDir:
  IfFileExists "$stableFailedDir" 0 stableFailedDirReady
  IntOp $R2 $R2 + 1
  StrCpy $stableFailedDir "$INSTDIR.__stable_failed_${VERSION}-$R2"
  Goto stableChooseFailedDir
stableFailedDirReady:
  StrCpy $R2 0
stableChoosePreviousDir:
  IfFileExists "$stablePreviousDir" 0 stablePreviousDirReady
  IntOp $R2 $R2 + 1
  StrCpy $stablePreviousDir "$INSTDIR.__stable_previous_${VERSION}-$R2"
  Goto stableChoosePreviousDir
stablePreviousDirReady:
  StrCpy $R2 0
stableChooseStageDir:
  IfFileExists "$stableStageDir" 0 stableStageDirReady
  IntOp $R2 $R2 + 1
  StrCpy $stableStageDir "$INSTDIR.__stable_next_${VERSION}-$R2"
  Goto stableChooseStageDir
stableStageDirReady:
  StrCpy $stableRuntimeMigrated "false"
  StrCpy $stableRuntimeCopied "false"
  ReadEnvStr $stableRuntimeDir "STABLE_RUNTIME_HOME"
  ${if} $stableRuntimeDir == ""
    StrCpy $stableRuntimeDir "$LOCALAPPDATA\stable-desktop\runtime-v1"
  ${endif}

  CreateDirectory "$stableStageDir"
  SetOutPath "$stableStageDir"
  !insertmacro stableReportProgress "10" "staging" "running" "0"
  !ifdef UNINSTALLER_ICON
    File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
  !endif
  Call stableInstallApplicationFiles
  WriteUninstaller "$stableStageDir\${UNINSTALL_FILENAME}"
  !insertmacro stableReportProgress "55" "staging" "running" "0"

  ${ifNot} ${FileExists} "$stableStageDir\${APP_EXECUTABLE_FILENAME}"
  ${orIfNot} ${FileExists} "$stableStageDir\resources\app.asar"
    !insertmacro stableReportProgress "55" "package_invalid" "failed" "10"
    RMDir /r "$stableStageDir"
    !insertmacro stableStopUpdate 10 "更新包校验失败，安装未完成。"
  ${endif}

  !insertmacro stableReportProgress "72" "backup" "running" "0"
  ClearErrors
  ExecWait '"$stableStageDir\${APP_EXECUTABLE_FILENAME}" --stable-upgrade-backup "--stable-upgrade-install=$INSTDIR" "--stable-upgrade-previous=$stablePreviousDir"' $R0
  ${if} ${Errors}
  ${orIf} $R0 != 0
    !insertmacro stableStopUpdate 25 "升级前备份或数据库迁移检查失败，原程序和数据已保留。"
  ${endif}

  ${if} ${FileExists} "$stableRuntimeDir\node\node.exe"
    Goto stableRuntimeReady
  ${endif}

  !insertmacro stableReportProgress "62" "runtime" "running" "0"
  CreateDirectory "$stableRuntimeDir"
  RMDir "$stableRuntimeDir"
  ${if} ${FileExists} "$stableStageDir\resources\runtime\node\node.exe"
    ClearErrors
    CreateDirectory "$stableRuntimeDir\node"
    CopyFiles /SILENT "$stableStageDir\resources\runtime\node\*" "$stableRuntimeDir\node"
    IfErrors stableCopyStagedRuntime stableRuntimeReady
  ${endif}

  ${if} ${FileExists} "$INSTDIR\resources\runtime\node\node.exe"
    ClearErrors
    Goto stableCopyOldRuntime
  ${endif}
  Goto stableRuntimeFailed

stableCopyStagedRuntime:
  CreateDirectory "$stableRuntimeDir"
  ClearErrors
  CopyFiles /SILENT "$stableStageDir\resources\runtime\*" "$stableRuntimeDir"
  IfErrors stableRuntimeFailed stableRuntimeReady

stableCopyOldRuntime:
  CreateDirectory "$stableRuntimeDir"
  StrCpy $stableRuntimeCopied "true"
  ClearErrors
  CopyFiles /SILENT "$INSTDIR\resources\runtime\*" "$stableRuntimeDir"
  IfErrors stableRuntimeFailed stableRuntimeReady

stableRuntimeFailed:
  ${if} $stableRuntimeCopied == "true"
    RMDir /r "$stableRuntimeDir"
  ${endif}
  RMDir /r "$stableStageDir"
  !insertmacro stableReportProgress "68" "runtime_failed" "failed" "11"
  !insertmacro stableStopUpdate 11 "本地运行环境缺失或不完整。请使用 Stable-Setup 完整安装包修复；Stable-Update 轻量包不能补齐运行环境。"

stableRuntimeReady:
  ${ifNot} ${FileExists} "$stableRuntimeDir\node\node.exe"
    Goto stableRuntimeFailed
  ${endif}

  !insertmacro stableReportProgress "68" "runtime" "running" "0"
  !insertmacro stableReportProgress "70" "stopping" "running" "0"
  Call stableCheckAppRunning
  !insertmacro stableReportProgress "76" "switching" "running" "0"
  SetOutPath "$TEMP"
  ClearErrors
  !insertmacro stableRenameWithRetry "$INSTDIR" "$stablePreviousDir"
  IfErrors stableSwapFailedBeforeRename 0
  !insertmacro stableReportProgress "82" "switching" "running" "0"
  ClearErrors
  !insertmacro stableRenameWithRetry "$stableStageDir" "$INSTDIR"
  IfErrors stableSwapRollback 0
  !insertmacro stableReportProgress "86" "switching" "running" "0"

  !insertmacro stableReportProgress "88" "healthcheck" "running" "0"
  SetOutPath "$INSTDIR"
  ExecWait '"$appExe" --stable-update-healthcheck' $R0
  ${if} $R0 != 0
    !insertmacro stableReportProgress "90" "rolling_back" "running" "$R0"
    Call stableCheckAppRunning
    SetOutPath "$TEMP"
    ClearErrors
    !insertmacro stableRenameWithRetry "$INSTDIR" "$stableFailedDir"
    IfErrors 0 stableHealthNewMoved
    Sleep 1000
    ClearErrors
    !insertmacro stableRenameWithRetry "$INSTDIR" "$stableFailedDir"
    IfErrors stableHealthNewMoveFailed 0

    stableHealthNewMoved:
    ${if} $stableRuntimeMigrated == "true"
      CreateDirectory "$stablePreviousDir\resources"
      ClearErrors
      !insertmacro stableRenameWithRetry "$stableRuntimeDir" "$stablePreviousDir\resources\runtime"
      IfErrors stableHealthRuntimeRestoreFailed 0
    ${elseif} $stableRuntimeCopied == "true"
      ClearErrors
      RMDir /r "$stableRuntimeDir"
      IfErrors stableHealthRuntimeRestoreFailed 0
    ${endif}
    ClearErrors
    !insertmacro stableRenameWithRetry "$stablePreviousDir" "$INSTDIR"
    IfErrors stableHealthOldRestoreFailed 0
    !insertmacro stableReportProgress "92" "healthcheck_rollback" "failed_rolled_back" "12"
    !insertmacro stableStopUpdate 12 "新版未通过启动检查，旧版本已经恢复。"
  ${endif}
  !insertmacro stableReportProgress "94" "healthcheck" "running" "0"
  Goto stablePostInstall

stableHealthNewMoveFailed:
  !insertmacro stableReportProgress "92" "rollback_failed" "failed" "15"
  !insertmacro stableStopUpdate 15 "更新失败，新版目录无法隔离。请保留安装目录。"

stableHealthRuntimeRestoreFailed:
  !insertmacro stableReportProgress "92" "rollback_failed" "failed" "16"
  !insertmacro stableStopUpdate 16 "更新失败，本地运行环境未能恢复。请保留安装目录。"

stableHealthOldRestoreFailed:
  !insertmacro stableReportProgress "92" "rollback_failed" "failed" "17"
  !insertmacro stableStopUpdate 17 "更新失败，旧版本目录未能恢复。请保留安装目录。"

stableSwapRollback:
  ${if} $stableRuntimeMigrated == "true"
    CreateDirectory "$stablePreviousDir\resources"
    ClearErrors
    !insertmacro stableRenameWithRetry "$stableRuntimeDir" "$stablePreviousDir\resources\runtime"
    IfErrors stableSwapRuntimeRestoreFailed 0
  ${elseif} $stableRuntimeCopied == "true"
    ClearErrors
    RMDir /r "$stableRuntimeDir"
    IfErrors stableSwapRuntimeRestoreFailed 0
  ${endif}
  ClearErrors
  !insertmacro stableRenameWithRetry "$stablePreviousDir" "$INSTDIR"
  IfErrors stableSwapRestoreFailed 0
  !insertmacro stableReportProgress "86" "swap_failed" "failed_rolled_back" "13"
  !insertmacro stableStopUpdate 13 "新版目录切换失败，旧版本已经恢复。"

stableSwapRestoreFailed:
  !insertmacro stableReportProgress "86" "rollback_failed" "failed" "18"
  !insertmacro stableStopUpdate 18 "更新失败，旧版本目录未能恢复。请保留安装目录。"

stableSwapRuntimeRestoreFailed:
  ClearErrors
  !insertmacro stableRenameWithRetry "$stablePreviousDir" "$INSTDIR"
  IfErrors stableSwapRestoreFailed 0
  !insertmacro stableReportProgress "86" "rollback_failed" "failed" "20"
  !insertmacro stableStopUpdate 20 "旧版本文件已恢复，但本地运行环境未能恢复。请保留安装目录。"

stableSwapFailedBeforeRename:
  ${if} $stableRuntimeMigrated == "true"
    CreateDirectory "$INSTDIR\resources"
    ClearErrors
    !insertmacro stableRenameWithRetry "$stableRuntimeDir" "$INSTDIR\resources\runtime"
    IfErrors stableRuntimeRestoreBeforeSwapFailed 0
  ${elseif} $stableRuntimeCopied == "true"
    ClearErrors
    RMDir /r "$stableRuntimeDir"
    IfErrors stableRuntimeRestoreBeforeSwapFailed 0
  ${endif}
  !insertmacro stableReportProgress "80" "swap_failed" "failed_rolled_back" "14"
  !insertmacro stableStopUpdate 14 "旧版本目录无法切换，原安装保持不变。"

stableRuntimeRestoreBeforeSwapFailed:
  !insertmacro stableReportProgress "80" "rollback_failed" "failed" "19"
  !insertmacro stableStopUpdate 19 "更新失败，本地运行环境未能恢复。请保留安装目录。"

stableLegacyInstall:
  !insertmacro uninstallOldVersion SHELL_CONTEXT
  !insertmacro handleUninstallResult SHELL_CONTEXT
  ${if} $installMode == "all"
    !insertmacro uninstallOldVersion HKEY_CURRENT_USER
    !insertmacro handleUninstallResult HKEY_CURRENT_USER
  ${endIf}
  SetOutPath $INSTDIR
  !ifdef UNINSTALLER_ICON
    File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
  !endif
  Call stableInstallApplicationFiles
  WriteUninstaller "$INSTDIR\${UNINSTALL_FILENAME}"

stablePostInstall:
!insertmacro stableReportProgress "95" "finalizing" "running" "0"
!insertmacro registryAddInstallInfo
${if} $installMode == "all"
  StrCpy $0 "/allusers"
${else}
  StrCpy $0 "/currentuser"
${endIf}
WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString '"$INSTDIR\${UNINSTALL_FILENAME}" $0 _?=$INSTDIR'
WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" QuietUninstallString '"$INSTDIR\${UNINSTALL_FILENAME}" $0 /S _?=$INSTDIR'
!insertmacro addStartMenuLink $keepShortcuts
!insertmacro addDesktopLink $keepShortcuts
; Preserve installer identity while separating production taskbar grouping from development.
${if} ${FileExists} "$newStartMenuLink"
  WinShell::SetLnkAUMI "$newStartMenuLink" "com.stable.agent.production"
${endif}
${if} ${FileExists} "$newDesktopLink"
  WinShell::SetLnkAUMI "$newDesktopLink" "com.stable.agent.production"
${endif}

${if} ${FileExists} "$newStartMenuLink"
  StrCpy $launchLink "$newStartMenuLink"
${else}
  StrCpy $launchLink "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
${endIf}

!ifmacrodef registerFileAssociations
  !insertmacro registerFileAssociations
!endif

!ifmacrodef customInstall
  !insertmacro customInstall
!endif

!insertmacro stableReportProgress "100" "complete" "success" "0"
${if} ${isUpdated}
  ${ifNot} ${Silent}
    Sleep 1200
  ${endif}
  !insertmacro quitSuccess
${endif}

!macro doStartApp
  HideWindow
  !insertmacro StartApp
!macroend

!ifdef ONE_CLICK
  !ifdef RUN_AFTER_FINISH
    ${ifNot} ${Silent}
    ${orIf} ${isForceRun}
      !insertmacro doStartApp
    ${endIf}
  !else
    ${if} ${isForceRun}
      !insertmacro doStartApp
    ${endIf}
  !endif
  !insertmacro quitSuccess
!else
  ${if} ${isForceRun}
  ${andIf} ${Silent}
    !insertmacro doStartApp
  ${endIf}
!endif
