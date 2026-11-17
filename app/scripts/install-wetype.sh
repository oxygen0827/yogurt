#!/bin/sh
# Build the optional VoiceKey executable for this user. Requires git, Rust and CMake.
set -eu
revision=138d675a9a7f55fcf029fe4919856aa856687cc7
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
git -C "$work" init -q
git -C "$work" fetch --depth 1 https://github.com/J3n5en/voicekey.git "$revision"
git -C "$work" checkout -q --detach FETCH_HEAD
(cd "$work" && cargo build --locked --release -p voicekey-core --bin vk-test)
dest="${YOGURT_USER_DATA:-$HOME/Library/Application Support/Yogurt}/helpers"
if [ "${1:-}" = "--bundle" ]; then
  dest="$(cd "$(dirname "$0")/.." && pwd)/resources/wetype"
fi
mkdir -p "$dest"
stage=$(mktemp "$dest/.vk-test.XXXXXX")
install -m 755 "$work/target/release/vk-test" "$stage"
mv -f "$stage" "$dest/vk-test"
