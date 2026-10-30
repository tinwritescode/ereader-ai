#!/usr/bin/env bash
# Saves the README screenshots from the booted simulator.
# Replaces the installed app with a test build: rebuild the real app afterwards.
set -euo pipefail

cd "$(dirname "$0")/.."
out=../docs/screenshots
device=$(xcrun simctl list devices booted | grep -oE '[0-9A-F-]{36}' | head -1)

flutter test integration_test/screenshots_test.dart -d "$device" |
  while IFS= read -r line; do
    echo "$line"
    if [[ $line =~ SCREEN:([a-z-]+) ]]; then
      sleep 1
      xcrun simctl io "$device" screenshot "$out/${BASH_REMATCH[1]}.png"
    fi
  done
