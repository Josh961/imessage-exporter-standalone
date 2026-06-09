import fs from "fs";
import path from "path";

export function getAppVersion(scriptDir) {
  const packageJsonPath = path.join(scriptDir, "..", "package.json");
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8")).version;
}

export async function withCargoPackageVersions(scriptDir, version, callback) {
  const repoRoot = path.join(scriptDir, "..", "..");
  const cargoFiles = [
    path.join(repoRoot, "exporter-cli", "Cargo.lock"),
    path.join(repoRoot, "exporter-cli", "imessage-database", "Cargo.toml"),
    path.join(repoRoot, "exporter-cli", "imessage-exporter", "Cargo.toml"),
  ];
  const snapshots = new Map(
    cargoFiles.filter(fs.existsSync).map((file) => [file, fs.readFileSync(file, "utf8")]),
  );
  let restored = false;

  const restoreSnapshots = () => {
    if (restored) {
      return;
    }
    restored = true;
    for (const [file, content] of snapshots.entries()) {
      fs.writeFileSync(file, content);
    }
  };

  const signalHandlers = new Map();
  for (const [signal, exitCode] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ]) {
    const handler = () => {
      restoreSnapshots();
      process.exit(exitCode);
    };
    process.once(signal, handler);
    signalHandlers.set(signal, handler);
  }

  try {
    for (const file of cargoFiles.filter((cargoFile) => cargoFile.endsWith("Cargo.toml"))) {
      if (!snapshots.has(file)) {
        throw new Error(`Missing Cargo manifest: ${file}`);
      }
      const original = snapshots.get(file);
      const updated = original.replace(/^version = ".*"$/m, `version = "${version}"`);
      if (updated === original) {
        throw new Error(`Could not patch package version in ${file}`);
      }
      fs.writeFileSync(file, updated);
    }
    await callback();
  } finally {
    for (const [signal, handler] of signalHandlers.entries()) {
      process.off(signal, handler);
    }
    restoreSnapshots();
  }
}
