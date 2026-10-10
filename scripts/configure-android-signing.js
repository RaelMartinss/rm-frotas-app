const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const keystoreSrc = path.join(rootDir, 'credentials', 'rm-frotas.jks');
const keystoreDest = path.join(rootDir, 'android', 'app', 'rm-frotas.jks');
const gradlePath = path.join(rootDir, 'android', 'app', 'build.gradle');

console.log('[configure-android-signing] Configurando assinatura do APK...');

// 1. Copia o keystore se existir
if (fs.existsSync(keystoreSrc)) {
  fs.copyFileSync(keystoreSrc, keystoreDest);
  console.log('[configure-android-signing] Keystore copiado para android/app/rm-frotas.jks');
} else {
  console.warn('[configure-android-signing] Keystore não encontrado em credentials/rm-frotas.jks');
}

// 2. Modifica build.gradle
if (!fs.existsSync(gradlePath)) {
  console.error('[configure-android-signing] android/app/build.gradle não encontrado.');
  process.exit(1);
}

let gradle = fs.readFileSync(gradlePath, 'utf8');

const releaseSigning = `        release {
            storeFile file('rm-frotas.jks')
            storePassword 'rmfrotas2026'
            keyAlias 'rmfrotas'
            keyPassword 'rmfrotas2026'
        }
`;

if (!gradle.includes("keyAlias 'rmfrotas'")) {
  gradle = gradle.replace(/signingConfigs\s*\{/, `signingConfigs {\n${releaseSigning}`);
}

// Substitui signingConfig em buildTypes.release para usar signingConfigs.release
gradle = gradle.replace(
  /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?signingConfig\s+)signingConfigs\.\w+/,
  '$1signingConfigs.release'
);

fs.writeFileSync(gradlePath, gradle, 'utf8');
console.log('[configure-android-signing] build.gradle atualizado com signingConfigs.release com sucesso!');
