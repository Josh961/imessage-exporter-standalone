import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getAppVersion, withCargoPackageVersions } from "./build-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appVersion = getAppVersion(__dirname);
const windowsTarget =
  process.env.WINDOWS_RUST_TARGET ||
  (process.platform === "win32" ? "x86_64-pc-windows-msvc" : "x86_64-pc-windows-gnu");

// Change to the exporter-cli directory
const exporterDir = path.join(__dirname, "..", "..", "exporter-cli");
process.chdir(exporterDir);

console.log(`Building Windows exporter ${appVersion} for ${windowsTarget}...`);
try {
  await withCargoPackageVersions(__dirname, appVersion, async () => {
    // Build the exporter
    execFileSync("cargo", ["build", "--target", windowsTarget, "--release"], { stdio: "inherit" });
  });

  // Copy the built executable
  const source = path.join(
    exporterDir,
    "target",
    windowsTarget,
    "release",
    "imessage-exporter.exe",
  );
  const dest = path.join(__dirname, "..", "resources", "imessage-exporter-win.exe");

  console.log(`Copying from: ${source}`);
  console.log(`Copying to: ${dest}`);

  // Create resources directory if it doesn't exist
  const resourcesDir = path.dirname(dest);
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }

  fs.copyFileSync(source, dest);
  console.log("Build complete!");
} catch (error) {
  console.error("Build failed:", error.message);
  process.exit(1);
}
