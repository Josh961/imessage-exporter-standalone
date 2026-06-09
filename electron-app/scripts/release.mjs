#!/usr/bin/env node
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(appDir, "..");

const paths = {
  packageJson: path.join(appDir, "package.json"),
  packageLock: path.join(appDir, "package-lock.json"),
};

const releaseAssets = [
  "imessage-exporter.dmg",
  "imessage-exporter-x86.dmg",
  "imessage-exporter.exe",
];

const usage = `Usage:
  ./release <version|major|minor|patch> [options]
  npm --prefix electron-app run release -- <version|major|minor|patch> [options]

Windows:
  .\\release.ps1 <version|major|minor|patch> [options]
  release.cmd <version|major|minor|patch> [options]

Examples:
  ./release patch
  ./release 4.1.0
  ./release 4.1.0 --no-push

Options:
  --no-push           Commit and tag locally, but do not push. CI will not run until you push the tag.
  --help              Show this help.

What this command does:
  1. Updates electron-app/package.json and package-lock.json.
  2. Commits the version change if needed.
  3. Creates an annotated release tag.
  4. Pushes the current branch and tag to origin.
  5. Lets GitHub Actions build and publish the stable release assets:
     ${releaseAssets.join("\n     ")}

Apple signing and notarization belong in GitHub Actions secrets. The Windows installer is intentionally unsigned.
`;

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }

  ensureCommand("git");
  ensureCleanTree();
  fetchTags();

  const packageJson = readJson(paths.packageJson);
  const currentVersion = packageJson.version;
  const nextVersion = resolveVersion(options.versionArg, currentVersion);
  const tagName = `v.${nextVersion}`;

  ensureTagDoesNotExist(tagName);

  console.log(`Preparing ${tagName}`);
  console.log(`Current app version: ${currentVersion}`);
  console.log(`Next app version:    ${nextVersion}`);
  console.log(`Release assets:      ${releaseAssets.join(", ")}`);

  const snapshots = snapshotFiles(Object.values(paths).filter(fs.existsSync));
  let versionFilesFinalized = false;

  try {
    updateAppVersion(nextVersion);
    commitReleaseFiles(tagName);
    versionFilesFinalized = true;

    createTag(tagName);

    if (options.noPush) {
      console.log(`Created ${tagName} locally.`);
      console.log(`Push it when ready with: git push origin HEAD && git push origin ${tagName}`);
      return;
    }

    ensureOnBranch();
    run("git", ["push", "origin", "HEAD"], { cwd: repoRoot });
    run("git", ["push", "origin", tagName], { cwd: repoRoot });

    console.log(`Pushed ${tagName}. GitHub Actions will build and publish the release.`);
    console.log("Stable download paths after the workflow finishes:");
    for (const asset of releaseAssets) {
      console.log(`  /releases/latest/download/${asset}`);
    }
  } catch (error) {
    if (!versionFilesFinalized) {
      restoreFiles(snapshots);
    }
    throw error;
  }
}

function parseArgs(argv) {
  const options = {
    help: false,
    noPush: false,
    versionArg: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--no-push":
        options.noPush = true;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option: ${arg}\n\n${usage}`);
        }
        if (options.versionArg) {
          throw new Error(`Unexpected extra argument: ${arg}\n\n${usage}`);
        }
        options.versionArg = arg;
    }
  }

  if (!options.help && !options.versionArg) {
    throw new Error(`Missing version argument.\n\n${usage}`);
  }

  return options;
}

function resolveVersion(input, currentVersion) {
  if (["major", "minor", "patch"].includes(input)) {
    return bumpVersion(currentVersion, input);
  }

  const version = input.replace(/^v\.?/, "");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid version: ${input}`);
  }
  return version;
}

function bumpVersion(currentVersion, part) {
  const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Cannot bump non-semver version: ${currentVersion}`);
  }

  let [, major, minor, patch] = match.map(Number);
  if (part === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (part === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function ensureCommand(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  if (result.error && result.error.code === "ENOENT") {
    throw new Error(`Required command not found: ${command}`);
  }
}

function ensureCleanTree() {
  const status = capture("git", ["status", "--porcelain"], { cwd: repoRoot });
  if (status.trim()) {
    throw new Error(`Working tree must be clean before releasing:\n${status}`);
  }
}

function ensureOnBranch() {
  const result = spawnSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(
      "Cannot push from a detached HEAD. Check out a branch or rerun with --no-push.",
    );
  }
}

function fetchTags() {
  run("git", ["fetch", "--tags", "origin"], { cwd: repoRoot });
}

function ensureTagDoesNotExist(tagName) {
  const local = spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tagName}`], {
    cwd: repoRoot,
    stdio: "ignore",
  });
  if (local.status === 0) {
    throw new Error(`Tag already exists locally: ${tagName}`);
  }

  const remote = capture("git", ["ls-remote", "--tags", "origin", tagName], { cwd: repoRoot });
  if (remote.trim()) {
    throw new Error(`Tag already exists on origin: ${tagName}`);
  }
}

function updateAppVersion(version) {
  const packageJson = readJson(paths.packageJson);
  packageJson.version = version;
  writeJson(paths.packageJson, packageJson);

  if (fs.existsSync(paths.packageLock)) {
    const packageLock = readJson(paths.packageLock);
    packageLock.version = version;
    if (packageLock.packages && packageLock.packages[""]) {
      packageLock.packages[""].version = version;
    }
    writeJson(paths.packageLock, packageLock);
  }
}

function commitReleaseFiles(tagName) {
  const releaseFiles = [
    path.relative(repoRoot, paths.packageJson),
    path.relative(repoRoot, paths.packageLock),
  ];

  run("git", ["add", ...releaseFiles], { cwd: repoRoot });
  const staged = capture("git", ["diff", "--cached", "--name-only"], { cwd: repoRoot });
  if (!staged.trim()) {
    console.log("No version file changes to commit; tagging the current commit.");
    return;
  }

  run("git", ["commit", "-m", `Release ${tagName}`], { cwd: repoRoot });
}

function createTag(tagName) {
  run("git", ["tag", "-a", tagName, "-m", `Release ${tagName}`], { cwd: repoRoot });
}

function snapshotFiles(filePaths) {
  const snapshots = new Map();
  for (const filePath of filePaths) {
    snapshots.set(filePath, fs.readFileSync(filePath));
  }
  return snapshots;
}

function restoreFiles(snapshots) {
  for (const [filePath, content] of snapshots.entries()) {
    fs.writeFileSync(filePath, content);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, args, options = {}) {
  console.log(`> ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    env: options.env || process.env,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with status ${result.status}\n${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
