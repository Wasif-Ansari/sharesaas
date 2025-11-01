#!/usr/bin/env node

/**
 * P2P Share - File Manifest & Verification
 * Run: node verify.js
 */

const fs = require('fs');
const path = require('path');

const requiredFiles = [
  // Signaling server
  'apps/signaling/server.js',
  'apps/signaling/package.json',
  'apps/signaling/Dockerfile',

  // Web app
  'apps/web/src/app/page.tsx',
  'apps/web/src/app/layout.tsx',
  'apps/web/src/app/globals.css',
  'apps/web/src/lib/signaling.ts',
  'apps/web/package.json',
  'apps/web/next.config.js',
  'apps/web/tsconfig.json',
  'apps/web/tailwind.config.ts',
  'apps/web/Dockerfile',

  // Docker & infrastructure
  'docker-compose.yml',
  'docker/coturn/turnserver.conf',
  'docker/coturn/realm.txt',

  // Documentation
  'README.md',
  'QUICKSTART.md',
  'SETUP.md',
  'INDEX.md',
  'PROJECT_SUMMARY.md',
  'docs/ARCHITECTURE.md',
  'docs/DEPLOYMENT.md',

  // Config
  'package.json',
  '.gitignore',
  'start.sh',
  'start.bat',
];

console.log('\n🔍 P2P Share - File Verification\n');
console.log('================================\n');

let allGood = true;
let existing = 0;
let missing = [];

requiredFiles.forEach((file) => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const size = fs.statSync(filePath).size;
    console.log(`✅ ${file} (${size} bytes)`);
    existing++;
  } else {
    console.log(`❌ ${file} (MISSING)`);
    missing.push(file);
    allGood = false;
  }
});

console.log('\n================================\n');
console.log(`Summary: ${existing}/${requiredFiles.length} files found\n`);

if (allGood) {
  console.log('✅ All files present!\n');
  console.log('Next steps:');
  console.log('1. Review QUICKSTART.md for 5-minute setup');
  console.log('2. Or read SETUP.md for detailed installation');
  console.log('3. Run: docker-compose up --build\n');
} else {
  console.log(`❌ Missing ${missing.length} files:\n`);
  missing.forEach((file) => console.log(`   - ${file}`));
  console.log('\nPlease check the file paths and ensure all files are created.\n');
}

process.exit(allGood ? 0 : 1);
