#!/usr/bin/env node
// Validates a packaged (electron-builder) app before it can ship.
//
// 1. Static check: walks every static/dynamic import reachable from the
//    packaged main entry inside app.asar and fails if a module is missing.
//    This is the exact failure class that shipped in v4.4.0, where
//    src/backup-location.mjs was absent from the electron-builder files
//    whitelist and the app crashed at launch with ERR_MODULE_NOT_FOUND.
// 2. Smoke test: launches the packaged executable with
//    IMESSAGE_EXPORTER_SMOKE_TEST=1 and requires it to exit 0 after the
//    renderer finishes loading. A missing module, broken preload, or missing
//    renderer bundle all fail this gate.
//
// Usage: node scripts/check-packaged-app.mjs [--app-dir <unpacked dir or .app>] [--skip-smoke]
import { spawn } from "child_process";
import fs from "fs";
import { builtinModules } from "module";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import * as asar from "@electron/asar";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const distBuildDir = path.join(appDir, "dist-build");
const SMOKE_TIMEOUT_MS = Number(process.env.SMOKE_TEST_TIMEOUT_MS) || 60_000;

const args = process.argv.slice(2);
const skipSmoke = args.includes("--skip-smoke");
const appDirArgIndex = args.indexOf("--app-dir");
const explicitAppDir = appDirArgIndex !== -1 ? path.resolve(args[appDirArgIndex + 1]) : null;

const builtins = new Set(builtinModules);

function fail(message) {
  console.error(`✖ ${message}`);
  process.exitCode = 1;
}

function findPackagedApps() {
  if (explicitAppDir) {
    return [explicitAppDir];
  }

  const apps = [];
  if (process.platform === "win32") {
    const unpacked = path.join(distBuildDir, "win-unpacked");
    if (fs.existsSync(unpacked)) apps.push(unpacked);
  } else if (process.platform === "darwin") {
    for (const dir of ["mac", "mac-arm64", "mac-universal"]) {
      const parent = path.join(distBuildDir, dir);
      if (!fs.existsSync(parent)) continue;
      for (const entry of fs.readdirSync(parent)) {
        if (entry.endsWith(".app")) apps.push(path.join(parent, entry));
      }
    }
  }
  return apps;
}

function resourcesDirFor(packagedApp) {
  return packagedApp.endsWith(".app")
    ? path.join(packagedApp, "Contents", "Resources")
    : path.join(packagedApp, "resources");
}

function executableFor(packagedApp) {
  if (packagedApp.endsWith(".app")) {
    const macosDir = path.join(packagedApp, "Contents", "MacOS");
    const entries = fs.readdirSync(macosDir);
    if (entries.length !== 1) {
      throw new Error(
        `Expected exactly one executable in ${macosDir}, found: ${entries.join(", ")}`,
      );
    }
    return path.join(macosDir, entries[0]);
  }
  const exes = fs
    .readdirSync(packagedApp)
    .filter((entry) => entry.endsWith(".exe") && entry !== "ImageMagick-installer.exe");
  if (exes.length !== 1) {
    throw new Error(
      `Expected exactly one app executable in ${packagedApp}, found: ${exes.join(", ")}`,
    );
  }
  return path.join(packagedApp, exes[0]);
}

// Static/dynamic import and require specifiers in a JS source file. This is a
// regex-based scan, not a full parser, so it intentionally over-matches;
// anything it cannot resolve as relative or bare is ignored.
function importSpecifiers(source) {
  const specifiers = new Set();
  const patterns = [
    /\bimport\s+[^"'();]*?from\s*["']([^"']+)["']/g,
    /\bexport\s+[^"'();]*?from\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.add(match[1]);
    }
  }
  return [...specifiers];
}

function isBuiltin(specifier) {
  return (
    specifier.startsWith("node:") ||
    builtins.has(specifier.split("/")[0]) ||
    specifier === "electron"
  );
}

function packageNameOf(specifier) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function checkAsarImports(asarPath) {
  const problems = [];
  const contents = new Set(
    asar.listPackage(asarPath, {}).map((entry) => entry.replaceAll("\\", "/").replace(/^\//, "")),
  );

  const readEntry = (entryPath) => asar.extractFile(asarPath, entryPath).toString("utf8");

  const packageJson = JSON.parse(readEntry("package.json"));
  const mainEntry = (packageJson.main || "index.js").replaceAll("\\", "/");

  const requiredFiles = [mainEntry, "src/preload.js", "dist/index.html"];
  for (const file of requiredFiles) {
    if (!contents.has(file)) {
      problems.push(`required file missing from app.asar: ${file}`);
    }
  }

  const visited = new Set();
  const queue = [mainEntry, "src/preload.js"].filter((entry) => contents.has(entry));

  while (queue.length > 0) {
    const current = queue.pop();
    if (visited.has(current)) continue;
    visited.add(current);

    const source = readEntry(current);
    for (const specifier of importSpecifiers(source)) {
      if (isBuiltin(specifier)) continue;

      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        const resolved = path.posix.join(path.posix.dirname(current), specifier);
        if (!contents.has(resolved)) {
          problems.push(`${current} imports "${specifier}" but ${resolved} is not in app.asar`);
        } else if (/\.(mjs|cjs|js)$/.test(resolved)) {
          queue.push(resolved);
        }
        continue;
      }

      const packageName = packageNameOf(specifier);
      if (!contents.has(`node_modules/${packageName}/package.json`)) {
        problems.push(
          `${current} imports "${specifier}" but node_modules/${packageName} is not in app.asar`,
        );
      }
    }
  }

  return { problems, checkedFiles: visited.size };
}

function smokeTest(executable) {
  return new Promise((resolve) => {
    const child = spawn(executable, [], {
      env: { ...process.env, IMESSAGE_EXPORTER_SMOKE_TEST: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let settled = false;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    // A missing main-process module never reaches the smoke-test hook: Electron
    // shows its uncaught-exception dialog and the process hangs, so a timeout
    // here is itself a failure signal.
    const timer = setTimeout(() => {
      child.kill();
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      }
      settle({
        ok: false,
        reason: `did not finish within ${SMOKE_TIMEOUT_MS / 1000}s (likely a startup crash dialog)`,
        output,
      });
    }, SMOKE_TIMEOUT_MS);

    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (output += data));
    child.on("error", (error) =>
      settle({ ok: false, reason: `failed to launch: ${error.message}`, output }),
    );
    child.on("exit", (code) => {
      if (code === 0 && output.includes("SMOKE_TEST_OK")) {
        settle({ ok: true, output });
      } else {
        settle({ ok: false, reason: `exited with code ${code}`, output });
      }
    });
  });
}

function nativeArchApp(apps) {
  if (process.platform !== "darwin") return apps[0];
  const preferred =
    process.arch === "arm64" ? `${path.sep}mac-arm64${path.sep}` : `${path.sep}mac${path.sep}`;
  return (
    apps.find(
      (app) => app.includes(preferred) || app.includes(`${path.sep}mac-universal${path.sep}`),
    ) || null
  );
}

const packagedApps = findPackagedApps();
if (packagedApps.length === 0) {
  fail(`no packaged app found under ${distBuildDir}. Run electron-builder first.`);
  process.exit(1);
}

for (const packagedApp of packagedApps) {
  const asarPath = path.join(resourcesDirFor(packagedApp), "app.asar");
  console.log(`Checking ${path.relative(appDir, asarPath)}...`);
  if (!fs.existsSync(asarPath)) {
    fail(`app.asar not found at ${asarPath}`);
    continue;
  }

  const { problems, checkedFiles } = checkAsarImports(asarPath);
  if (problems.length > 0) {
    for (const problem of problems) fail(problem);
  } else {
    console.log(`✔ static import check passed (${checkedFiles} files walked)`);
  }
}

if (process.exitCode) {
  console.error("Packaged app verification FAILED (static checks). Not running smoke test.");
  process.exit(1);
}

if (skipSmoke) {
  console.log("Skipping smoke test (--skip-smoke).");
} else {
  const smokeApp = nativeArchApp(packagedApps);
  if (!smokeApp) {
    console.log(`No packaged app matches the native arch (${process.arch}); skipping smoke test.`);
  } else {
    // Run the app from a temp directory OUTSIDE the project tree. When run
    // in place, Node's module resolution walks up from the asar into the
    // project's own node_modules, silently masking packages missing from
    // the asar. Copying out makes the app prove it is self-contained.
    const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "imessage-exporter-smoke-"));
    try {
      const stagedApp = path.join(stagingDir, path.basename(smokeApp));
      fs.cpSync(smokeApp, stagedApp, { recursive: true });
      const executable = executableFor(stagedApp);
      console.log(`Smoke testing ${path.relative(appDir, smokeApp)} (staged in ${stagingDir})...`);
      const result = await smokeTest(executable);
      if (!result.ok) {
        fail(`smoke test failed: ${result.reason}`);
        if (result.output.trim()) console.error(result.output.trim());
        process.exit(1);
      }
      console.log("✔ smoke test passed (app launched, renderer loaded, clean exit)");
    } finally {
      fs.rmSync(stagingDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    }
  }
}

console.log("Packaged app verification passed.");
