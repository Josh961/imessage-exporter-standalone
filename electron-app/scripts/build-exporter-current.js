#!/usr/bin/env node
import { spawnSync } from 'child_process';

const scriptByPlatform = {
  darwin: 'build-exporter-mac',
  win32: 'build-exporter-win',
};

const script = scriptByPlatform[process.platform];

if (!script) {
  console.error(
    `No native exporter build script is configured for ${process.platform}. Use macOS or Windows packaging.`,
  );
  process.exit(1);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', script], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
