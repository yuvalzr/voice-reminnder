#!/usr/bin/env bash

set -euo pipefail

channel="${1:-preview}"
if [[ $# -gt 0 ]]; then
  shift
fi

if [[ $# -gt 0 ]]; then
  message="$*"
else
  message="Update $(date -u +'%Y-%m-%d %H:%M UTC')"
fi

echo "Preparing EAS update for channel/branch: ${channel}"

if ! npx eas-cli whoami >/dev/null 2>&1; then
  echo "ERROR: You are not logged in to Expo."
  echo "Run: npx eas-cli login"
  exit 1
fi

# Keep channel and branch names aligned to avoid "no EAS update branch" failures.
if ! npx eas-cli channel:view "${channel}" >/dev/null 2>&1; then
  echo "Channel '${channel}' does not exist yet. Creating it now..."
  npx eas-cli channel:create "${channel}" --non-interactive
fi

echo "Publishing update to branch '${channel}'..."
npx eas-cli update --branch "${channel}" --message "${message}" --non-interactive

echo "Mapping channel '${channel}' -> branch '${channel}'..."
npx eas-cli channel:edit "${channel}" --branch "${channel}" --non-interactive

echo "SUCCESS: EAS update published and channel mapping ensured."
