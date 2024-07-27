!include LogicLib.nsh
!include WinVer.nsh

!macro customHeader
  RequestExecutionLevel admin
!macroend

!macro customInit
  ; Initialize log file
  SetOutPath $TEMP
  StrCpy $0 "$TEMP\install_log.txt"
  FileOpen $1 $0 w
  FileWrite $1 "Installation Log$\r$\n"
  FileWrite $1 "----------------$\r$\n"
  FileClose $1

  ; Check if running as admin
  UserInfo::GetAccountType
  Pop $0
  ${If} $0 != "admin"
    MessageBox MB_ICONSTOP "Administrator rights required!"
    SetErrorLevel 740 ; ERROR_ELEVATION_REQUIRED
    Quit
  ${EndIf}
!macroend

!macro customInstall
  ; Log the installation process
  FileOpen $1 "$TEMP\install_log.txt" a
  FileWrite $1 "Checking for ImageMagick...$\r$\n"
  FileClose $1

  ; Check if ImageMagick is already installed
  ReadRegStr $0 HKLM "SOFTWARE\ImageMagick\Current" "BinPath"
  ${If} $0 != ""
    DetailPrint "ImageMagick is already installed. Skipping installation."
    FileOpen $1 "$TEMP\install_log.txt" a
    FileWrite $1 "ImageMagick is already installed at: $0$\r$\n"
    FileClose $1
  ${Else}
    ; Install ImageMagick silently
    DetailPrint "Installing ImageMagick..."
    FileOpen $1 "$TEMP\install_log.txt" a
    FileWrite $1 "Installing ImageMagick...$\r$\n"
    FileClose $1

    ExecWait '"$INSTDIR\ImageMagick-installer.exe" /VERYSILENT /NORESTART /LOG="$TEMP\imagemagick_install_log.txt"' $2

    ; Check if installation was successful
    ${If} $2 != 0
      FileOpen $1 "$TEMP\install_log.txt" a
      FileWrite $1 "Failed to install ImageMagick. Exit code: $2$\r$\n"
      FileClose $1
      MessageBox MB_OK|MB_ICONEXCLAMATION "Failed to install ImageMagick. Some features may not work correctly. Please check the log file at $TEMP\install_log.txt for details."
    ${Else}
      DetailPrint "ImageMagick installed successfully."
      FileOpen $1 "$TEMP\install_log.txt" a
      FileWrite $1 "ImageMagick installed successfully.$\r$\n"
      FileClose $1
    ${EndIf}
  ${EndIf}
!macroend
