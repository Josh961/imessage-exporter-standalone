#!/usr/bin/env node
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resourcesDir = path.join(__dirname, '..', 'resources');
const requiredFlags = ['--chat-ids', '--list-contacts', '--images-only'];

const platformResources = {
  darwin: {
    files: ['imessage-exporter-mac-arm64', 'imessage-exporter-mac-x64'],
    runnable:
      process.arch === 'arm64' ? 'imessage-exporter-mac-arm64' : 'imessage-exporter-mac-x64',
  },
  win32: {
    files: ['imessage-exporter.exe'],
    runnable: 'imessage-exporter.exe',
  },
};

const platform = platformResources[process.platform];

if (!platform) {
  console.error(`No exporter resource smoke check is configured for ${process.platform}.`);
  process.exit(1);
}

for (const file of platform.files) {
  const filePath = path.join(resourcesDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`Missing exporter resource: ${path.relative(process.cwd(), filePath)}`);
    process.exit(1);
  }
}

const runnablePath = path.join(resourcesDir, platform.runnable);
const help = execFileSync(runnablePath, ['--help'], { encoding: 'utf8' });
const missingFlags = requiredFlags.filter((flag) => !help.includes(flag));

if (missingFlags.length > 0) {
  console.error(
    `${platform.runnable} is missing required Electron contract flags: ${missingFlags.join(', ')}`,
  );
  process.exit(1);
}

const version = execFileSync(runnablePath, ['--version'], { encoding: 'utf8' }).trim();
console.log(`Exporter resource check passed: ${platform.runnable} (${version})`);
