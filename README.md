# iMessage Exporter Standalone

This project consists of two main components:

1. An Electron-based GUI application for easy interaction with the iMessage Exporter CLI.
2. A Command-Line Interface (CLI) tool for advanced users.

## Electron App

The Electron app provides a user-friendly graphical interface for exporting iMessage chats. It's designed for users who prefer to run an executable and offers features like:

- Automatic detection of iMessage backup locations
- Contact selection interface
- Date range selection for exports

For information on how to run the Electron app, refer to the [Electron App README](./electron-app/README.md).

## Release

Create a release from the repo root with one command on macOS/Linux:

```bash
./release patch
```

On Windows, use either wrapper:

```powershell
.\release.ps1 patch
```

```cmd
release.cmd patch
```

You can also pass an explicit version from any platform:

```bash
./release 4.1.0
```

The release command updates the Electron app version, commits the version files, creates an annotated tag using the existing `v.` prefix, and pushes the current branch plus tag. The tag push starts the GitHub Actions release workflow, which builds on macOS and Windows runners and publishes the GitHub release with these stable asset names:

```text
imessage-exporter.dmg
imessage-exporter-x86.dmg
imessage-exporter.exe
```

The stable download paths are:

```text
/releases/latest/download/imessage-exporter.dmg
/releases/latest/download/imessage-exporter-x86.dmg
/releases/latest/download/imessage-exporter.exe
```

Apple signing and notarization should be configured as GitHub repository secrets for the release workflow. Use `CSC_LINK` and `CSC_KEY_PASSWORD` for the Developer ID certificate, optionally `CSC_NAME`, plus one notarization credential set: `APPLE_API_KEY`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER`/`APPLE_TEAM_ID`, `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`, or `APPLE_KEYCHAIN`/`APPLE_KEYCHAIN_PROFILE`/`APPLE_TEAM_ID`. The Windows installer is intentionally unsigned.

Use `./release 4.1.0 --no-push` to create the version commit and tag locally without starting the workflow.

## Exporter CLI

The Exporter CLI is a command-line tool built in rust that provides a more advanced interface for exporting iMessage chats. The electron app is built on top of this CLI tool. The original repository for this project [can be found here](https://github.com/ReagentX/imessage-exporter).
