#!/bin/bash
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Setup requires root in the dedicated StableAgent distribution.' >&2; exit 1; }
source_dir=$(realpath "$1")
[[ -f "$source_dir/package-lock.json" && -f "$source_dir/runner.cjs" ]] || exit 1
export DEBIAN_FRONTEND=noninteractive
packages=(ca-certificates curl xz-utils bubblewrap socat ripgrep git python3 python3-venv python3-pip jq unzip)
missing=false
for package in "${packages[@]}"; do
  [[ $(dpkg-query -W -f='${db:Status-Status}' "$package" 2>/dev/null) == installed ]] || missing=true
done
if $missing; then
  apt-get -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o Acquire::Retries=2 update
  apt-get -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 -o Acquire::Retries=2 install -y --no-install-recommends "${packages[@]}"
fi
id stable >/dev/null 2>&1 || useradd --create-home --shell /bin/bash stable
# This account is never a sudoer; setup is the only privileged operation.
install -d -o root -g root -m 755 /opt/stable-agent
case $(uname -m) in x86_64) arch=x64 ;; aarch64) arch=arm64 ;; *) echo 'Unsupported CPU' >&2; exit 1 ;; esac
node_version=22.22.2
archive="node-v${node_version}-linux-${arch}.tar.xz"
if [[ ! -x /opt/stable-agent/node/bin/node ]] || [[ $(/opt/stable-agent/node/bin/node --version) != "v${node_version}" ]]; then
download=$(mktemp -d)
trap 'rm -rf -- "$download"' EXIT
curl --fail --location --connect-timeout 20 --max-time 300 --retry 2 --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v${node_version}/${archive}" -o "$download/$archive"
curl --fail --location --connect-timeout 20 --max-time 60 --retry 2 --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt" -o "$download/SHASUMS256.txt"
(cd "$download"; grep " ${archive}\$" SHASUMS256.txt | sha256sum --check --strict -)
install -d /opt/stable-agent/node
tar -xJf "$download/$archive" --strip-components=1 -C /opt/stable-agent/node
fi
export PATH=/opt/stable-agent/node/bin:/usr/sbin:/usr/bin:/sbin:/bin
install -o root -g root -m 644 "$source_dir/package.json" "$source_dir/package-lock.json" "$source_dir/runner.cjs" "$source_dir/workspace-copy.cjs" /opt/stable-agent/
cd /opt/stable-agent
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org --fetch-timeout=30000 --fetch-retries=2
chown -R root:root /opt/stable-agent
chmod -R go-w /opt/stable-agent
cat > /etc/wsl.conf <<'EOF'
[automount]
enabled=true
root=/mnt/
options=metadata,umask=022
[interop]
enabled=false
appendWindowsPath=false
[user]
default=stable
EOF
# Ubuntu's unprivileged-userns AppArmor policy otherwise blocks bubblewrap.
# Allow only the packaged bwrap executable to create its sandbox namespaces.
if command -v apparmor_parser >/dev/null 2>&1 && [[ -d /sys/kernel/security/apparmor && -d /etc/apparmor.d ]]; then
  cat > /etc/apparmor.d/stable-bwrap <<'EOF'
abi <abi/4.0>,
include <tunables/global>
profile stable-bwrap /usr/bin/bwrap flags=(unconfined) {
  userns,
}
EOF
  apparmor_parser -r /etc/apparmor.d/stable-bwrap
fi
printf 'Installed Node: '; node --version
printf 'Installed sandbox: '; node -p "require('./node_modules/@anthropic-ai/sandbox-runtime/package.json').version"
