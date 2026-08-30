InitPluginsDir

${IfNot} ${Silent}
  SetDetailsPrint none
${endif}

StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

!insertmacro setLinkVars

!ifdef ONE_CLICK
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
  !ifdef UNINSTALLER_ICON
    File /oname=uninstallerIcon.ico "${UNINSTALLER_ICON}"
  !endif
  Call stableInstallApplicationFiles
  WriteUninstaller "$stableStageDir\${UNINSTALL_FILENAME}"

  ${ifNot} ${FileExists} "$stableStageDir\${APP_EXECUTABLE_FILENAME}"
  ${orIfNot} ${FileExists} "$stableStageDir\resources\app.asar"
    SetErrorLevel 10
    RMDir /r "$stableStageDir"
    Quit
  ${endif}

  ${if} ${FileExists} "$stableRuntimeDir\node\node.exe"
  ${andIf} ${FileExists} "$stableRuntimeDir\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
    Goto stableRuntimeReady
  ${endif}

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
  SetErrorLevel 11
  Quit

stableRuntimeReady:
  ${ifNot} ${FileExists} "$stableRuntimeDir\node\node.exe"
  ${orIfNot} ${FileExists} "$stableRuntimeDir\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js"
    Goto stableRuntimeFailed
  ${endif}

  Call stableCheckAppRunning
  SetOutPath "$TEMP"
  RMDir /r "$stablePreviousDir"
  ClearErrors
  Rename "$INSTDIR" "$stablePreviousDir"
  IfErrors stableSwapFailedBeforeRename 0
  ClearErrors
  Rename "$stableStageDir" "$INSTDIR"
  IfErrors stableSwapRollback 0

  SetOutPath "$INSTDIR"
  ExecWait '"$appExe" --stable-update-healthcheck' $R0
  ${if} $R0 != 0
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
    Exec '"$appExe"'
    SetErrorLevel 12
    Quit
  ${endif}
  Goto stablePostInstall

stableHealthNewMoveFailed:
  SetErrorLevel 15
  Quit

stableHealthRuntimeRestoreFailed:
  SetErrorLevel 16
  Quit

stableHealthOldRestoreFailed:
  SetErrorLevel 17
  Quit

stableSwapRollback:
  ${if} $stableRuntimeMigrated == "true"
    CreateDirectory "$stablePreviousDir\resources"
    Rename "$stableRuntimeDir" "$stablePreviousDir\resources\runtime"
  ${endif}
  Rename "$stablePreviousDir" "$INSTDIR"
  SetErrorLevel 13
  Quit

stableSwapFailedBeforeRename:
  ${if} $stableRuntimeMigrated == "true"
    CreateDirectory "$INSTDIR\resources"
    Rename "$stableRuntimeDir" "$INSTDIR\resources\runtime"
  ${endif}
  SetErrorLevel 14
  Quit

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
