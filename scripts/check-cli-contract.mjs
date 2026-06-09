#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const requiredChecks = [
  {
    file: 'exporter-cli/imessage-exporter/src/app/options.rs',
    labels: [
      ['list contacts option name', 'OPTION_LIST_CONTACTS'],
      ['selected chat IDs option name', 'OPTION_SELECTED_CHAT_IDS'],
      ['images only option name', 'OPTION_IGNORE_VIDEOS'],
      ['list contacts option field', 'list_contacts: bool'],
      ['images only option field', 'images_only: bool'],
      ['list contacts clap arg', 'Arg::new(OPTION_LIST_CONTACTS)'],
      ['selected chat IDs clap arg', 'Arg::new(OPTION_SELECTED_CHAT_IDS)'],
      ['images only clap arg', 'Arg::new(OPTION_IGNORE_VIDEOS)'],
    ],
  },
  {
    file: 'exporter-cli/imessage-exporter/src/app/runtime.rs',
    labels: [
      ['list contacts dispatch', 'self.options.list_contacts'],
      ['list contacts implementation', 'list_contacts_and_chats'],
      ['list contacts exact chat IDs field', 'chat_ids_field'],
      ['DM output protocol', 'CONTACT|'],
      ['group output protocol', 'GROUP|'],
      ['empty filter app error sentinel', 'No chatrooms were found with the supplied contacts.'],
    ],
  },
  {
    file: 'exporter-cli/imessage-exporter/src/app/progress.rs',
    labels: [
      ['progress event type', 'ProgressEvent'],
      ['progress JSON stdout prefix', 'PROGRESS_JSON:'],
    ],
  },
  {
    file: 'exporter-cli/imessage-exporter/src/app/compatibility/attachment_manager.rs',
    labels: [['images only attachment gate', 'images_only']],
  },
  {
    file: 'exporter-cli/imessage-exporter/src/app/compatibility/backup.rs',
    labels: [
      ['backup password env name', 'IMESSAGE_EXPORTER_BACKUP_PASSWORD'],
      ['backup password env reader', 'BACKUP_PASSWORD_ENV'],
    ],
  },
  {
    file: 'electron-app/src/main.mjs',
    labels: [
      ['CONTACT parser', 'CONTACT|'],
      ['GROUP parser', 'GROUP|'],
      ['selected chat IDs export', '--chat-ids'],
      ['progress parser', 'PROGRESS_JSON:'],
      ['CLI no-chat sentinel mapping', 'No chatrooms were found with the supplied contacts.'],
      ['backup password env passthrough', 'IMESSAGE_EXPORTER_BACKUP_PASSWORD'],
    ],
  },
];

const requiredFiles = ['exporter-cli/.standalone-upstream.json', 'scripts/cli-sync/patches'];

const failures = [];

for (const requiredFile of requiredFiles) {
  const fullPath = path.join(repoRoot, requiredFile);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${requiredFile}: missing`);
  }
}

for (const check of requiredChecks) {
  const fullPath = path.join(repoRoot, check.file);
  if (!fs.existsSync(fullPath)) {
    failures.push(`${check.file}: missing`);
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  for (const [label, needle] of check.labels) {
    if (!content.includes(needle)) {
      failures.push(`${check.file}: missing ${label} (${needle})`);
    }
  }
}

const rejectFiles = [];
collectFiles(path.join(repoRoot, 'exporter-cli'), (file) => {
  if (file.endsWith('.rej')) {
    rejectFiles.push(path.relative(repoRoot, file));
  }
  if (/\.(rs|toml|lock|md|json)$/.test(file)) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('<<<<<<<') || content.includes('>>>>>>>')) {
      failures.push(`${path.relative(repoRoot, file)}: contains conflict markers`);
    }
  }
});

for (const rejectFile of rejectFiles) {
  failures.push(`${rejectFile}: unresolved patch reject`);
}

if (failures.length > 0) {
  console.error('CLI Electron contract check failed:');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log('CLI Electron contract check passed.');

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
