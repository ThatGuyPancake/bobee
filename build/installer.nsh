!macro customUnInstall
  ; Remove the autostart entry only on a real uninstall. During an upgrade
  ; the old uninstaller also runs, and deleting it there would switch
  ; "Start with Windows" off after every update.
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "electron.app.Bobee"
  ${endIf}
!macroend
