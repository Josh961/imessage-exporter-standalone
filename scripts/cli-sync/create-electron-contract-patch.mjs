#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const vendorDir = path.join(repoRoot, 'exporter-cli');
const metadataPath = path.join(vendorDir, '.standalone-upstream.json');
const patchPath = path.join(__dirname, 'patches', '001-electron-app-contract.patch');
const upstreamRepo = 'https://github.com/ReagentX/imessage-exporter.git';
const args = process.argv.slice(2);
const options = new Set(args.filter((arg) => arg.startsWith('-')));
const positional = args.filter((arg) => !arg.startsWith('-'));
const metadata = readMetadata();
const explicitTag = positional[0];
const tag = explicitTag || metadata?.tag;
const force = options.has('--force');
const contractFiles = [
  'imessage-exporter/Cargo.toml',
  'imessage-exporter/src/app/compatibility/attachment_manager.rs',
  'imessage-exporter/src/app/options.rs',
  'imessage-exporter/src/app/progress.rs',
  'imessage-exporter/src/app/runtime.rs',
];

const unknownOptions = [...options].filter((option) => !['--help', '-h', '--force'].includes(option));

if (
  options.has('--help') ||
  options.has('-h') ||
  unknownOptions.length > 0 ||
  positional.length > 1 ||
  !tag
) {
  if (unknownOptions.length > 0 || positional.length > 1) {
    console.error(`Unknown arguments: ${[...unknownOptions, ...positional.slice(1)].join(' ')}`);
  }
  printUsage();
  process.exit(options.has('--help') || options.has('-h') ? 0 : 1);
}

if (explicitTag && metadata?.tag && explicitTag !== metadata.tag && !force) {
  console.error(
    `Refusing to refresh the patch against ${explicitTag}; exporter-cli metadata says ${metadata.tag}. Rerun with --force if this is intentional.`,
  );
  process.exit(1);
}

function printUsage() {
  console.log(`Usage: node scripts/cli-sync/create-electron-contract-patch.mjs [upstream-tag] [--force]

Regenerate scripts/cli-sync/patches/001-electron-app-contract.patch by comparing
the current Electron contract files in exporter-cli to a clean upstream tag.
When no tag is supplied, the tag is read from exporter-cli/.standalone-upstream.json.
`);
}

function readMetadata() {
  if (!fs.existsSync(metadataPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
}

function run(command, args, opts = {}) {
  return execFileSync(command, args, {
    cwd: opts.cwd || repoRoot,
    encoding: opts.encoding || 'utf8',
    stdio: opts.stdio || 'pipe',
  });
}

function copyContractFiles(sourceDir, destDir) {
  fs.rmSync(destDir, { recursive: true, force: true });
  for (const file of contractFiles) {
    const source = path.join(sourceDir, file);
    const destination = path.join(destDir, file);
    if (!fs.existsSync(source)) {
      throw new Error(`Expected contract file is missing: ${source}`);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function collectRejects(dir) {
  const rejects = [];
  if (!fs.existsSync(dir)) {
    return rejects;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'target' || entry.name === '.git') {
        continue;
      }
      rejects.push(...collectRejects(fullPath));
    } else if (entry.name.endsWith('.rej')) {
      rejects.push(path.relative(repoRoot, fullPath));
    }
  }
  return rejects;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imessage-exporter-contract-patch-'));
const upstreamDir = path.join(tmpDir, 'upstream');
const baseDir = path.join(tmpDir, 'base');
const forkDir = path.join(tmpDir, 'fork');
const validateDir = path.join(tmpDir, 'validate');
const generatedPatchPath = path.join(tmpDir, '001-electron-app-contract.patch');

try {
  const rejects = collectRejects(vendorDir);
  if (rejects.length > 0) {
    throw new Error(`Refusing to refresh the patch while rejects exist:\n${rejects.join('\n')}`);
  }

  console.log(`Cloning upstream ${tag}...`);
  run('git', ['clone', '--depth', '1', '--branch', tag, upstreamRepo, upstreamDir], {
    stdio: 'inherit',
  });

  copyContractFiles(upstreamDir, baseDir);
  copyContractFiles(vendorDir, forkDir);

  let patch = '';
  try {
    patch = run('git', ['diff', '--no-index', '--src-prefix=a/', '--dst-prefix=b/', 'base', 'fork'], {
      cwd: tmpDir,
    });
  } catch (error) {
    // git diff --no-index exits with 1 when differences are found. Anything else
    // means the diff failed and should not overwrite the checked-in patch.
    if (error.status !== 1) {
      throw error;
    }
    patch = error.stdout || '';
  }

  patch = patch.replaceAll('a/base/', 'a/').replaceAll('b/fork/', 'b/');
  if (!patch.trim()) {
    throw new Error(`Generated patch is empty; refusing to overwrite ${patchPath}`);
  }

  fs.writeFileSync(generatedPatchPath, patch);
  copyContractFiles(upstreamDir, validateDir);
  run('git', ['apply', '--check', generatedPatchPath], { cwd: validateDir });
  run('node', ['scripts/check-cli-contract.mjs'], { stdio: 'inherit' });

  fs.mkdirSync(path.dirname(patchPath), { recursive: true });
  fs.copyFileSync(generatedPatchPath, patchPath);

  console.log(`Wrote ${path.relative(repoRoot, patchPath)}`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
