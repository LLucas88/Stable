!macro preInit
  ReadEnvStr $stableProgressFile "STABLE_UPDATE_PROGRESS_FILE"
  ${If} ${isUpdated}
    ${If} $stableProgressFile != ""
      Push $0
      Push $1
      System::Call 'kernel32::GetCurrentProcessId() i .r0'
      FileOpen $1 "$stableProgressFile.pid" w
      FileWrite $1 "$0"
      FileClose $1
      Pop $1
      Pop $0
    ${EndIf}
    StrCpy $stableUpdateCanClose "false"
    !insertmacro stableReportProgress "1" "launching" "running" "0"
  ${EndIf}
!macroend

!macro customInit
  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "--updated" $R1
  ${IfNot} ${Errors}
    ClearErrors
    ${GetOptions} $R0 "--stable-update-quiet" $R1
    ${If} ${Errors}
      ReadEnvStr $R1 "STABLE_UPDATE_QUIET"
      ${If} $R1 == "1"
      ${AndIf} $stableProgressFile != ""
        SetSilent silent
      ${Else}
        SetSilent normal
      ${EndIf}
    ${Else}
      SetSilent silent
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstallMode
  ${If} ${isUpdated}
    ${If} $hasPerMachineInstallation == "1"
      ${If} $hasPerUserInstallation == "0"
      ${OrIf} $INSTDIR == $perMachineInstallationFolder
        StrCpy $isForceMachineInstall "1"
      ${Else}
        StrCpy $isForceCurrentInstall "1"
      ${EndIf}
    ${Else}
      StrCpy $isForceCurrentInstall "1"
    ${EndIf}
  ${EndIf}
!macroend
