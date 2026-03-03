#!/usr/bin/env bash

set -euo pipefail

echo "Installing Expo Router app dependencies..."
npm install

echo "Verifying reminder modules are present..."
npm ls \
  expo-av \
  expo-location \
  expo-notifications \
  expo-task-manager \
  @react-native-async-storage/async-storage \
  @react-native-community/datetimepicker >/dev/null

echo "Running static checks..."
npm run typecheck
npm run lint

echo "Cloud environment setup complete."
