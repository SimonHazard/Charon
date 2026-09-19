type ReleaseVersions = {
  rootPackage: string;
  desktopPackage: string;
  cargoPackage: string;
  tauri: string;
};

const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

export function validateManifestVersions(versions: ReleaseVersions) {
  const version = versions.rootPackage;
  if (!semver.test(version)) throw new Error(`invalid release version ${version}`);
  const mismatches = Object.entries(versions)
    .filter(([, manifestVersion]) => manifestVersion !== version)
    .map(([manifest, manifestVersion]) => `${manifest}=${manifestVersion}`);
  if (mismatches.length) {
    throw new Error(`manifest version ${version} does not match ${mismatches.join(', ')}`);
  }
  return version;
}

export function validateReleaseVersion(tag: string, versions: ReleaseVersions) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(tag)) {
    throw new Error(`release tag ${tag} must be vX.Y.Z SemVer`);
  }
  const version = validateManifestVersions(versions);
  if (tag !== `v${version}`) {
    throw new Error(`release tag ${tag} does not match manifest version ${version}`);
  }
  return version;
}

function cargoVersion(text: string) {
  const packageBlock = text.match(/\[package\]([\s\S]*?)(?:\n\[|$)/u)?.[1] ?? '';
  const version = packageBlock.match(/^version\s*=\s*"([^"]+)"/mu)?.[1];
  if (!version) throw new Error('Cargo package version is missing');
  return version;
}

if (import.meta.main) {
  const rootPackage = await Bun.file('package.json').json();
  const desktopPackage = await Bun.file('apps/desktop/package.json').json();
  const tauri = await Bun.file('apps/desktop/src-tauri/tauri.conf.json').json();
  const cargo = await Bun.file('apps/desktop/src-tauri/Cargo.toml').text();
  const versions = {
    rootPackage: String(rootPackage.version),
    desktopPackage: String(desktopPackage.version),
    cargoPackage: cargoVersion(cargo),
    tauri: String(tauri.version),
  };
  const tag = process.env.RELEASE_TAG;
  const version = tag ? validateReleaseVersion(tag, versions) : validateManifestVersions(versions);
  console.log(version);
}
