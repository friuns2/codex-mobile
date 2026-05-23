#!/usr/bin/env bash
set -euo pipefail

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required" >&2
  exit 1
fi

package_name="codexui-android"
current_version=$(node -p "require('./package.json').version")
published_version=$(pnpm view "$package_name" dist-tags.latest 2>/dev/null || true)

next_version=$(node -e "
const parse = (v) => v.split('.').map((n) => Number(n));
const gt = (a, b) => {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
};
const current = parse(process.argv[1]);
const published = process.argv[2] ? parse(process.argv[2]) : [0, 0, 0];
const base = gt(current, published) ? current : published;
base[2] += 1;
console.log(base.join('.'));
" "$current_version" "$published_version")

pnpm run build

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT
publish_dir="$tmp_dir/codexui-android"

rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'output' \
  --exclude '.vite' \
  --exclude 'dist/.vite' \
  ./ "$publish_dir/"

node - "$publish_dir/package.json" "$package_name" "$next_version" <<'NODE'
const fs = require('node:fs');

const [packageJsonPath, packageName, nextVersion] = process.argv.slice(2);
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

packageJson.name = packageName;
packageJson.version = nextVersion;
packageJson.bin = {
  ...(packageJson.bin || {}),
  'codexui-android': 'dist-cli/index.js',
};
packageJson.scripts = {
  ...(packageJson.scripts || {}),
};
delete packageJson.scripts.prepublishOnly;
for (const dep of ['node-pty', 'node-pty-prebuilt-multiarch']) {
  delete packageJson.dependencies?.[dep];
  delete packageJson.optionalDependencies?.[dep];
  delete packageJson.devDependencies?.[dep];
}
delete packageJson.bundleDependencies;
delete packageJson.bundledDependencies;
packageJson.files = (packageJson.files || []).filter((entry) => !entry.startsWith('vendor/'));

fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
NODE

echo "Publishing $package_name@$next_version"
(cd "$publish_dir" && npm publish --access public --ignore-scripts)
