InitPluginsDir

ReadEnvStr $stableProgressFile "STABLE_UPDATE_PROGRESS_FILE"
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
Var /GLOBAL stableStageDir
Var /GLOBAL stablePreviousDir
Var /GLOBAL stableFailedDir
Var /GLOBAL stableRuntimeDir
Var /GLOBAL stableRuntimeMigrated

StrCpy $keepShortcuts "false"
!insertMacro setIsTryToKeepShortcuts
${if} $isTryToKeepShortcuts == "true"
  ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" KeepShortcuts
  ${if} $R1 == "true"
  ${andIf} ${FileExists} "$appExe"
    StrCpy $keepShortcuts "true"
  ${endIf}
${endif}

${if} ${isUpdated}
${andIf} ${FileExists} "$appExe"
  Goto stableAtomicUpdate
${endif}
Goto stableLegacyInstall

stableAtomicUpdate:
  StrCpy $stableStageDir "$INSTDIR.__stable_next_${VERSION}"
  StrCpy $stablePreviousDir "$INSTDIR.__stable_previous_${VERSION}"
  StrCpy $stableFailedDir "$INSTDIR.__stable_failed_${VERSION}"
  StrCpy $stableRuntimeMigrated "false"
  ReadEnvStr $stableRuntimeDir "STABLE_RUNTIME_HOME"
  ${if} $stableRuntimeDir == ""
    StrCpy $stableRuntimeDir "$LOCALAPPDATA\stable-desktop\runtime-v1"
  ${endif}

  RMDir /r "$stableStageDir"
  RMDir /r "$stableFailedDir"
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

  ${if} ${FileExists} "$stableRuntimeDir\node\node.exe"
  ${andIf} ${FileExists} "$stableRuntimeDir\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
    Goto stableRuntimeReady
  ${endif}

  !insertmacro stableReportProgress "62" "runtime" "running" "0"
  CreateDirectory "$stableRuntimeDir"
  RMDir "$stableRuntimeDir"
  ${if} ${FileExists} "$stableStageDir\resources\runtime\node\node.exe"
  ${andIf} ${FileExists} "$stableStageDir\resources\runtime\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
    ClearErrors
    Rename "$stableStageDir\resources\runtime" "$stableRuntimeDir"
    IfErrors stableCopyStagedRuntime stableRuntimeReady
  ${endif}

  ${if} ${FileExists} "$INSTDIR\resources\runtime\node\node.exe"
  ${andIf} ${FileExists} "$INSTDIR\resources\runtime\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
    ClearErrors
    Rename "$INSTDIR\resources\runtime" "$stableRuntimeDir"
    IfErrors stableCopyOldRuntime stableOldRuntimeMoved
  ${endif}
  Goto stableRuntimeFailed

stableOldRuntimeMoved:
  StrCpy $stableRuntimeMigrated "true"
  Goto stableRuntimeReady

stableCopyStagedRuntime:
  CreateDirectory "$stableRuntimeDir"
  ClearErrors
  CopyFiles /SILENT "$stableStageDir\resources\runtime\*" "$stableRuntimeDir"
  IfErrors stableRuntimeFailed stableRuntimeReady

stableCopyOldRuntime:
  CreateDirectory "$stableRuntimeDir"
  ClearErrors
  CopyFiles /SILENT "$INSTDIR\resources\runtime\*" "$stableRuntimeDir"
  IfErrors stableRuntimeFailed stableRuntimeReady

stableRuntimeFailed:
  RMDir /r "$stableStageDir"
  !insertmacro stableReportProgress "68" "runtime_failed" "failed" "11"
  !insertmacro stableStopUpdate 11 "本地运行环境准备失败，安装未完成。"

stableRuntimeReady:
  ${ifNot} ${FileExists} "$stableRuntimeDir\node\node.exe"
  ${orIfNot} ${FileExists} "$stableRuntimeDir\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
    Goto stableRuntimeFailed
  ${endif}

  !insertmacro stableReportProgress "68" "runtime" "running" "0"
  !insertmacro stableReportProgress "70" "stopping" "running" "0"
  Call stableCheckAppRunning
  !insertmacro stableReportProgress "76" "switching" "running" "0"
  SetOutPath "$TEMP"
  RMDir /r "$stablePreviousDir"
  ClearErrors
  Rename "$INSTDIR" "$stablePreviousDir"
  IfErrors stableSwapFailedBeforeRename 0
  !insertmacro stableReportProgress "82" "switching" "running" "0"
  ClearErrors
  Rename "$stableStageDir" "$INSTDIR"
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
    Rename "$INSTDIR" "$stableFailedDir"
    IfErrors 0 stableHealthNewMoved
    Sleep 1000
    ClearErrors
    Rename "$INSTDIR" "$stableFailedDir"
    IfErrors stableHealthNewMoveFailed 0

    stableHealthNewMoved:
    ${if} $stableRuntimeMigrated == "true"
      CreateDirectory "$stablePreviousDir\resources"
      ClearErrors
      Rename "$stableRuntimeDir" "$stablePreviousDir\resources\runtime"
      IfErrors stableHealthRuntimeRestoreFailed 0
    ${endif}
    ClearErrors
    Rename "$stablePreviousDir" "$INSTDIR"
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
    Rename "$stableRuntimeDir" "$stablePreviousDir\resources\runtime"
    IfErrors stableSwapRuntimeRestoreFailed 0
  ${endif}
  ClearErrors
  Rename "$stablePreviousDir" "$INSTDIR"
  IfErrors stableSwapRestoreFailed 0
  !insertmacro stableReportProgress "86" "swap_failed" "failed_rolled_back" "13"
  !insertmacro stableStopUpdate 13 "新版目录切换失败，旧版本已经恢复。"

stableSwapRestoreFailed:
  !insertmacro stableReportProgress "86" "rollback_failed" "failed" "18"
  !insertmacro stableStopUpdate 18 "更新失败，旧版本目录未能恢复。请保留安装目录。"

stableSwapRuntimeRestoreFailed:
  ClearErrors
  Rename "$stablePreviousDir" "$INSTDIR"
  IfErrors stableSwapRestoreFailed 0
  !insertmacro stableReportProgress "86" "rollback_failed" "failed" "20"
  !insertmacro stableStopUpdate 20 "旧版本文件已恢复，但本地运行环境未能恢复。请保留安装目录。"

stableSwapFailedBeforeRename:
  ${if} $stableRuntimeMigrated == "true"
    CreateDirectory "$INSTDIR\resources"
    ClearErrors
    Rename "$stableRuntimeDir" "$INSTDIR\resources\runtime"
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
