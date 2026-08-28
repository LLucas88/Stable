!macro customInit
  ClearErrors
  ${GetParameters} $R0
  ${GetOptions} $R0 "--updated" $R1
  ${IfNot} ${Errors}
    SetSilent silent
  ${EndIf}
!macroend
