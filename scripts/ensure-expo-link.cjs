/**
 * npm-workspaces postinstall helper.
 *
 * The PARADA monorepo pins apps/admin to React 18 while the Expo SDK 57
 * mobile app requires React 19. That version conflict makes npm keep the
 * Expo SDK tree inside apps/mobile/node_modules instead of hoisting it to
 * the repository root, and it can nest SDK packages directly under
 * node_modules/expo/node_modules (seen with expo-asset, expo-file-system,
 * expo-keep-awake on SDK 53 and expo-modules-core during the SDK 57 upgrade).
 *
 * That split breaks module resolution in different tooling depending on where
 * a package physically lives:
 *
 *  1. Root-hoisted Babel plugins (babel-preset-expo) require `expo/config`
 *     from the root node_modules -> symlink expo into the root.
 *  2. Local SDK packages (expo-font, expo-keep-awake, @expo/vector-icons,
 *     the root `expo` copy itself) require one of the NESTED packages ->
 *     lift each nested SDK package up to apps/mobile/node_modules.
 *
 * This script bridges all of those gaps with idempotent directory symlinks.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mobileNodeModules = path.join(root, "apps", "mobile", "node_modules");

function isLink(target) {
  try {
    const stats = fs.lstatSync(target);
    return stats.isSymbolicLink()
      ? fs.existsSync(fs.readlinkSync(target))
      : fs.existsSync(target);
  } catch {
    return false;
  }
}

function linkIfMissing(linkPath, target) {
  if (isLink(linkPath) || fs.existsSync(linkPath)) {
    return false;
  }
  if (!fs.existsSync(target)) {
    return false;
  }
  fs.symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
  return true;
}

// 1) Bridge `expo` into the root node_modules for root-hoisted tooling.
const expoTarget = path.join(mobileNodeModules, "expo");
if (linkIfMissing(path.join(root, "node_modules", "expo"), expoTarget)) {
  console.log("[postinstall] linked node_modules/expo -> apps/mobile/node_modules/expo");
}

// React Native lives only in the mobile workspace. Root-hoisted Expo build
// tooling (e.g. @expo/metro-config hermes bytecode compiler lookup) resolves
// it from the root node_modules, so bridge it too.
const reactNativeTarget = path.join(mobileNodeModules, "react-native");
if (linkIfMissing(path.join(root, "node_modules", "react-native"), reactNativeTarget)) {
  console.log("[postinstall] linked node_modules/react-native -> apps/mobile/node_modules/react-native");
}

// 2) Lift SDK packages that npm nested under node_modules/expo/node_modules.
const nestedModules = path.join(expoTarget, "node_modules");
if (fs.existsSync(nestedModules)) {
  for (const name of fs.readdirSync(nestedModules)) {
    if (name.startsWith(".")) {
      continue;
    }
    const nested = path.join(nestedModules, name);
    if (linkIfMissing(path.join(mobileNodeModules, name), nested)) {
      console.log(`[postinstall] lifted node_modules/expo/node_modules/${name} -> apps/mobile/node_modules/${name}`);
    }
  }
}