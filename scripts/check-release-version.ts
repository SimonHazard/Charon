const tag = process.env.GITHUB_REF_NAME;
if (!tag?.startsWith('v')) {
  console.log('manual dry run: version/tag consistency gate skipped');
  process.exit(0);
}
const version = tag.slice(1);
const tauri = await Bun.file('apps/desktop/src-tauri/tauri.conf.json').json();
const cargo = await Bun.file('apps/desktop/src-tauri/Cargo.toml').text();
if (tauri.version !== version || !cargo.includes(`version = "${version}"`)) {
  throw new Error(`tag ${tag}, Tauri ${tauri.version}, and Cargo package version must match`);
}
console.log(`release version ${version} is consistent`);
