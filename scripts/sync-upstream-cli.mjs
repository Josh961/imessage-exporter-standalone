#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const vendorDir = path.join(repoRoot, 'exporter-cli');
const patchDir = path.join(__dirname, 'cli-sync', 'patches');
const metadataPath = path.join(vendorDir, '.standalone-upstream.json');
const upstreamRepo = 'https://github.com/ReagentX/imessage-exporter.git';
const upstreamLatestReleaseUrl =
  'https://api.github.com/repos/ReagentX/imessage-exporter/releases/latest';

const args = process.argv.slice(2);
const options = new Set(args.filter((arg) => arg.startsWith('-')));
const positional = args.filter((arg) => !arg.startsWith('-'));
const requestedTag = positional[0] || 'latest';

if (options.has('--help') || options.has('-h')) {
  printUsage();
  process.exit(0);
}

const dryRun = options.has('--dry-run');
const force = options.has('--force');
const skipPatches = options.has('--skip-patches');
const skipCargo = options.has('--skip-cargo');
const skipCheck = options.has('--skip-check');

const unknownOptions = [...options].filter(
  (option) =>
    ![
      '--help',
      '-h',
      '--dry-run',
      '--force',
      '--skip-patches',
      '--skip-cargo',
      '--skip-check',
    ].includes(option),
);

if (unknownOptions.length > 0 || positional.length > 1) {
  console.error(`Unknown arguments: ${[...unknownOptions, ...positional.slice(1)].join(' ')}`);
  printUsage();
  process.exit(1);
}

function printUsage() {
  console.log(`Usage: node scripts/sync-upstream-cli.mjs [latest|tag] [options]

Fetch upstream ReagentX/imessage-exporter, replace exporter-cli, and reapply
the standalone Electron app patch series.

Options:
  -h, --help      Show this help
  --dry-run       Resolve the upstream tag and list patches without modifying files
  --force         Allow syncing when exporter-cli or sync files are already dirty
  --skip-patches  Copy upstream only; do not apply local patch series
  --skip-cargo    Do not regenerate Cargo.lock after patching manifests
  --skip-check    Do not run the Electron CLI contract checker
`);
}

function run(command, args, opts = {}) {
  const printable = [command, ...args].join(' ');
  if (opts.log !== false) {
    console.log(`$ ${printable}`);
  }
  return execFileSync(command, args, {
    cwd: opts.cwd || repoRoot,
    encoding: opts.encoding || 'utf8',
    stdio: opts.stdio || 'pipe',
  });
}

function httpsJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'imessage-exporter-standalone-cli-sync',
        },
      },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`GitHub returned ${response.statusCode}: ${body}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.setTimeout(15000, () => {
      request.destroy(new Error(`Timed out reading ${url}`));
    });
    request.on('error', reject);
    request.end();
  });
}

async function resolveTag(tag) {
  if (tag !== 'latest') {
    return tag;
  }

  try {
    const release = await httpsJson(upstreamLatestReleaseUrl);
    if (release?.tag_name) {
      return release.tag_name;
    }
  } catch (error) {
    console.warn(`Could not read GitHub latest release API: ${error.message}`);
  }

  const refs = run('git', ['ls-remote', '--tags', '--refs', upstreamRepo], { log: false });
  const tags = refs
    .split('\n')
    .map(parseSemverTagRef)
    .filter(Boolean)
    .sort((a, b) => compareSemver(a.version, b.version));

  if (tags.length === 0) {
    throw new Error('Could not resolve the latest upstream tag');
  }
  return tags.at(-1).tag;
}

function parseSemverTagRef(line) {
  const match = line.trim().match(/refs\/tags\/(v?(\d+\.\d+\.\d+))$/);
  if (!match) {
    return null;
  }
  return {
    tag: match[1],
    version: match[2],
  };
}

function compareSemver(a, b) {
  const aa = a.split('.').map(Number);
  const bb = b.split('.').map(Number);
  for (let index = 0; index < Math.max(aa.length, bb.length); index += 1) {
    const diff = (aa[index] || 0) - (bb[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function ensureCleanWorktree() {
  const paths = [
    'exporter-cli',
    'sync-cli',
    'sync-cli.cmd',
    'sync-cli.ps1',
    'scripts/sync-upstream-cli.mjs',
    'scripts/check-cli-contract.mjs',
    'scripts/cli-sync',
    'docs/cli-upstream-sync.md',
    'README.md',
  ];
  const status = run('git', ['status', '--porcelain', '--', ...paths], { log: false }).trim();
  if (status && !force) {
    throw new Error(
      `Refusing to overwrite a dirty CLI sync worktree. Commit or stash these first, or rerun with --force:\n${status}`,
    );
  }
}

function copyUpstreamToVendor(sourceDir) {
  fs.rmSync(vendorDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, vendorDir, {
    recursive: true,
    filter: (source) => path.basename(source) !== '.git',
  });
}

function writeMetadata(tag, commit) {
  const metadata = {
    upstreamRepo,
    tag,
    commit,
    syncedAt: new Date().toISOString(),
    patchDirectory: path.relative(repoRoot, patchDir),
  };
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

function getPatchFiles() {
  if (!fs.existsSync(patchDir)) {
    return [];
  }
  return fs
    .readdirSync(patchDir)
    .filter((file) => file.endsWith('.patch'))
    .sort()
    .map((file) => path.join(patchDir, file));
}

function applyPatchSeries() {
  const patches = getPatchFiles();
  if (patches.length === 0) {
    throw new Error(`No patch files found in ${path.relative(repoRoot, patchDir)}`);
  }

  for (const patch of patches) {
    console.log(`Applying ${path.relative(repoRoot, patch)}...`);
    try {
      run(
        'git',
        ['apply', '--reject', '--whitespace=nowarn', '--directory=exporter-cli', patch],
        { stdio: 'inherit' },
      );
    } catch (error) {
      reportRejects();
      throw new Error(`Patch failed: ${path.relative(repoRoot, patch)}`);
    }
  }
}

function reportRejects() {
  const rejects = [];
  collectFiles(vendorDir, (file) => {
    if (file.endsWith('.rej')) {
      rejects.push(path.relative(repoRoot, file));
    }
  });

  if (rejects.length > 0) {
    console.error('\nPatch rejects were written here:');
    for (const reject of rejects) {
      console.error(`  ${reject}`);
    }
    console.error('Resolve those rejects, delete the .rej files, then rerun the contract check.');
  }
}

function collectFiles(dir, callback) {
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'target' || entry.name === '.git') {
        continue;
      }
      collectFiles(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}

async function main() {
  if (!dryRun) {
    ensureCleanWorktree();
  }

  const tag = await resolveTag(requestedTag);
  const cloneDir = fs.mkdtempSync(path.join(os.tmpdir(), 'imessage-exporter-upstream-'));

  try {
    run('git', ['clone', '--depth', '1', '--branch', tag, upstreamRepo, cloneDir], {
      stdio: 'inherit',
    });
    const commit = run('git', ['rev-parse', 'HEAD'], { cwd: cloneDir, log: false }).trim();
    const patches = getPatchFiles().map((patch) => path.relative(repoRoot, patch));

    console.log(`Resolved upstream ${requestedTag} -> ${tag} (${commit})`);
    if (patches.length > 0) {
      console.log('Patch series:');
      for (const patch of patches) {
        console.log(`  ${patch}`);
      }
    }

    if (dryRun) {
      console.log('Dry run complete. No files were changed.');
      return;
    }

    copyUpstreamToVendor(cloneDir);
    writeMetadata(tag, commit);

    if (!skipPatches) {
      applyPatchSeries();
    }

    if (!skipCargo) {
      run('cargo', ['generate-lockfile'], { cwd: vendorDir, stdio: 'inherit' });
    }

    if (!skipCheck) {
      run('node', ['scripts/check-cli-contract.mjs'], { stdio: 'inherit' });
    }

    console.log('\nCLI sync complete.');
    console.log('Next checks:');
    console.log('  cd exporter-cli && cargo test -p imessage-exporter');
    console.log('  cd electron-app && npm run build');
  } finally {
    fs.rmSync(cloneDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
