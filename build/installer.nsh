!macro preInit
  ReadEnvStr $stableProgressFile "STABLE_UPDATE_PROGRESS_FILE"
  ${If} ${isUpdated}
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
      SetSilent normal
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
