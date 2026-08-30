Var newStartMenuLink
Var oldStartMenuLink
Var newDesktopLink
Var oldDesktopLink
Var oldShortcutName
Var oldMenuDirectory

!include "common.nsh"
!include "MUI2.nsh"
!include "multiUser.nsh"

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

    stableStopProcess:
    DetailPrint "$(appClosing)"
    ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    Sleep 1000
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      ${nsProcess::KillProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      Sleep 300
    ${endif}
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
