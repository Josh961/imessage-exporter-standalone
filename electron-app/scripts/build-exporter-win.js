import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Change to the exporter-cli directory
const exporterDir = path.join(__dirname, '..', '..', 'exporter-cli');
process.chdir(exporterDir);

console.log('Building Windows exporter...');
try {
  // Build the exporter
  execSync('cargo build --target x86_64-pc-windows-gnu --release', { stdio: 'inherit' });

  // Copy the built executable
  const source = path.join(exporterDir, 'target', 'x86_64-pc-windows-gnu', 'release', 'imessage-exporter.exe');
  const dest = path.join(__dirname, '..', 'resources', 'imessage-exporter-win.exe');

  console.log(`Copying from: ${source}`);
  console.log(`Copying to: ${dest}`);

  // Create resources directory if it doesn't exist
  const resourcesDir = path.dirname(dest);
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }

  fs.copyFileSync(source, dest);
  console.log('Build complete!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}
