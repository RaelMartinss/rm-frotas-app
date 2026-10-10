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

// 3. Garante permissões essenciais para o TaskManager e Background Location no AndroidManifest.xml
const manifestPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(manifestPath)) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');
  const requiredPermissions = [
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.WAKE_LOCK',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_BACKGROUND_LOCATION',
  ];

  let addedCount = 0;
  for (const perm of requiredPermissions) {
    if (!manifest.includes(`android:name="${perm}"`)) {
      manifest = manifest.replace(
        '<manifest',
        `<manifest>\n    <uses-permission android:name="${perm}"/>`
      );
      // Fallback se não substituiu na tag raiz
      if (!manifest.includes(`android:name="${perm}"`)) {
        manifest = manifest.replace(
          '</manifest>',
          `    <uses-permission android:name="${perm}"/>\n</manifest>`
        );
      }
      addedCount++;
    }
  }

  fs.writeFileSync(manifestPath, manifest, 'utf8');
  console.log(`[configure-android-signing] AndroidManifest.xml verificado. (${addedCount} permissões injetadas)`);
} else {
  console.warn('[configure-android-signing] AndroidManifest.xml não encontrado para verificação de permissões.');
}

// 4. Otimiza desempenho de compilação no gradle.properties (reduz tempo de build no CI)
const gradlePropsPath = path.join(rootDir, 'android', 'gradle.properties');
if (fs.existsSync(gradlePropsPath)) {
  let props = fs.readFileSync(gradlePropsPath, 'utf8');
  const perfSettings = {
    'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError',
    'org.gradle.parallel': 'true',
    'org.gradle.caching': 'true',
    'org.gradle.vfs.watch': 'true',
    'android.enableR8.fullMode': 'true',
  };

  for (const [key, val] of Object.entries(perfSettings)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(props)) {
      props = props.replace(regex, `${key}=${val}`);
    } else {
      props += `\n${key}=${val}`;
    }
  }

  fs.writeFileSync(gradlePropsPath, props, 'utf8');
  console.log('[configure-android-signing] gradle.properties configurado com flags de alta performance (4GB RAM, parallel, build-cache).');
}

