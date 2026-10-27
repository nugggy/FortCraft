// Builds the FortCraft Android APK.
//   node build.mjs          copy the game into www/, sync Capacitor, build a signed release APK
//   node build.mjs --web    only copy the game into www/ (used before `npx cap add android`)
// Output: mobile/dist/FortCraft.apk
//
// Signing: reads %USERPROFILE%\.fortcraft\keystore.properties (outside the repo) with
// storeFile, storePassword, keyAlias, keyPassword. Keep that folder backed up: updates
// only install over an existing app when they're signed with the same key.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WWW = path.join(HERE, 'www');
const COPY = ['index.html', 'style.css', 'version.json', 'manifest.webmanifest', 'icons', 'src', 'vendor'];

function copyWeb() {
  fs.rmSync(WWW, { recursive: true, force: true });
  fs.mkdirSync(WWW, { recursive: true });
  for (const item of COPY) fs.cpSync(path.join(ROOT, item), path.join(WWW, item), { recursive: true });
  // The app is its own thing: no service worker, and mark the build as native for the update channel.
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'version.json'), 'utf8'));
  fs.writeFileSync(path.join(WWW, 'version.json'), JSON.stringify({ ...v, build: 'android' }, null, 2));
  console.log(`Copied game v${v.version} into www/`);
  return v.version;
}

function findTools() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
  const jbr = process.env.JAVA_HOME_ANDROID || 'C:\\Program Files\\Android\\Android Studio\\jbr';
  if (!fs.existsSync(sdk)) throw new Error(`Android SDK not found at ${sdk}. Install Android Studio or set ANDROID_HOME.`);
  return { sdk, java: fs.existsSync(jbr) ? jbr : process.env.JAVA_HOME };
}

const version = copyWeb();
if (process.argv.includes('--web')) process.exit(0);

const { sdk, java } = findTools();
const env = { ...process.env, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk, JAVA_HOME: java };
execSync('npx cap sync android', { cwd: HERE, stdio: 'inherit', env });

// version code from semver: 1.2.3 -> 10203
const [maj, min, pat] = version.split('.').map(n => parseInt(n, 10) || 0);
const code = maj * 10000 + min * 100 + pat;
const gradlew = `"${path.join(HERE, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')}"`;
execSync(`${gradlew} assembleRelease --no-daemon -PfcVersionName=${version} -PfcVersionCode=${code}`, { cwd: path.join(HERE, 'android'), stdio: 'inherit', env, shell: true });

const out = path.join(HERE, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
fs.mkdirSync(path.join(HERE, 'dist'), { recursive: true });
fs.copyFileSync(out, path.join(HERE, 'dist', 'FortCraft.apk'));
console.log(`\nBuilt mobile/dist/FortCraft.apk (v${version}, code ${code})`);
