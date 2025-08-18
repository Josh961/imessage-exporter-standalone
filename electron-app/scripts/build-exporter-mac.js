import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Change to the exporter-cli directory
const exporterDir = path.join(__dirname, '..', '..', 'exporter-cli');
process.chdir(exporterDir);

console.log('Building macOS exporter...');
try {
  // Build for Apple Silicon (aarch64)
  console.log('Building for Apple Silicon...');
  execSync('cargo build --target aarch64-apple-darwin --release', { stdio: 'inherit' });

  // Build for Intel (x86_64)
  console.log('Building for Intel macOS...');
  execSync('cargo build --target x86_64-apple-darwin --release', { stdio: 'inherit' });

  // Create resources directory if it doesn't exist
  const resourcesDir = path.join(__dirname, '..', 'resources');
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }

  // Copy both binaries separately
  const aarch64Source = path.join(exporterDir, 'target', 'aarch64-apple-darwin', 'release', 'imessage-exporter');
  const aarch64Dest = path.join(resourcesDir, 'imessage-exporter-mac-arm64');

  const x86_64Source = path.join(exporterDir, 'target', 'x86_64-apple-darwin', 'release', 'imessage-exporter');
  const x86_64Dest = path.join(resourcesDir, 'imessage-exporter-mac-x64');

  console.log('Copying Apple Silicon binary...');
  fs.copyFileSync(aarch64Source, aarch64Dest);
  console.log(`✅ Copied to ${aarch64Dest}`);

  console.log('Copying Intel binary...');
  fs.copyFileSync(x86_64Source, x86_64Dest);
  console.log(`✅ Copied to ${x86_64Dest}`);

  console.log('Build complete!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
