const fs = require('fs');
const path = require('path');

const versionArg = process.argv[2] || process.env.APP_VERSION || '1.0.0';
const version = versionArg.replace(/^v/i, '').trim();
const buildNum = parseInt(process.env.BUILD_NUMBER || process.argv[3] || '1', 10);

console.log(`[inject-version] Setting App Version: ${version}, Version Code: ${buildNum}`);

// 1. Atualiza app.json
const appJsonPath = path.join(__dirname, '..', 'app.json');
if (fs.existsSync(appJsonPath)) {
  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  appJson.expo = appJson.expo || {};
  appJson.expo.version = version;
  appJson.expo.android = appJson.expo.android || {};
  appJson.expo.android.versionCode = buildNum;
  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n', 'utf8');
  console.log('[inject-version] app.json atualizado.');
}

// 2. Atualiza src/services/app-update.service.ts
const updateServicePath = path.join(__dirname, '..', 'src', 'services', 'app-update.service.ts');
if (fs.existsSync(updateServicePath)) {
  let content = fs.readFileSync(updateServicePath, 'utf8');
  content = content.replace(
    /export const CURRENT_APP_VERSION = '.*?';/,
    `export const CURRENT_APP_VERSION = '${version}';`
  );
  fs.writeFileSync(updateServicePath, content, 'utf8');
  console.log('[inject-version] app-update.service.ts atualizado.');
}
