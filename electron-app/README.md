# iMessage Exporter Standalone

## Build And Run

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/iMessage-Exporter.git
   ```
2. Navigate to the electron-app directory:
   ```
   cd imessage-exporter-standalone/electron-app
   ```
3. Install the dependencies:
   ```
   npm install
   ```
4. Run the application:
   ```
   npm run dev
   ```

## Release

From the repository root on macOS/Linux:

```bash
./release patch
```

From Windows:

```powershell
.\release.ps1 patch
```

or:

```cmd
release.cmd patch
```

The command updates the app version, commits the version files, creates the tag, and pushes it. GitHub Actions then builds both macOS DMGs plus the Windows installer and creates or updates the GitHub release. The uploaded assets use these stable names:

```text
imessage-exporter.dmg
imessage-exporter-x86.dmg
imessage-exporter.exe
```

Use an explicit version when needed:

```bash
./release 4.1.0
```

The final links are:

```text
/releases/latest/download/imessage-exporter.dmg
/releases/latest/download/imessage-exporter-x86.dmg
/releases/latest/download/imessage-exporter.exe
```

Apple signing and notarization are read from GitHub repository secrets during the macOS workflow job. Configure `CSC_LINK` and `CSC_KEY_PASSWORD` for the Developer ID certificate, optionally `CSC_NAME`, plus one notarization credential set: `APPLE_API_KEY`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER`/`APPLE_TEAM_ID`, `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`, or `APPLE_KEYCHAIN`/`APPLE_KEYCHAIN_PROFILE`/`APPLE_TEAM_ID`. The Windows installer is intentionally unsigned.
