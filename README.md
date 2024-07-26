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

## Exporter CLI

The Exporter CLI is a command-line tool built in rust that provides a more advanced interface for exporting iMessage chats. The electron app is built on top of this CLI tool. The original repository for this project [can be found here](https://github.com/ReagentX/imessage-exporter).
