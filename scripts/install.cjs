// Postinstall: links the platform-specific native binary to bin/godex-binary.
// npm installs the matching optional dependency before running this script,
// so the platform package is already in node_modules (production path).
// For local development (no published optional dep), checks platforms/ dir as fallback.
// If neither is available, skips gracefully — bin/godex wrapper falls back to dev mode.

"use strict";

const fs = require("fs");
const path = require("path");

function detectPlatform() {
  const plat = process.platform; // "darwin" | "linux" | "win32"
  const arch = process.arch; // "arm64" | "x64"
  if (plat === "win32") return `win32-${arch}`;
  if (plat === "darwin") return `darwin-${arch}`;
  if (plat === "linux") return `linux-${arch}`;
  return null;
}

function findBinary(pkgName, platform) {
  const binaryName = platform.startsWith("win32") ? "godex.exe" : "godex";

  // 1. Production: optional dep installed by npm/pnpm/yarn
  try {
    const pkgRoot = path.dirname(
      require.resolve(pkgName + "/package.json", {
        paths: [path.join(__dirname, "..", "node_modules")],
      }),
    );
    const binary = path.join(pkgRoot, "bin", binaryName);
    if (fs.existsSync(binary)) return binary;
  } catch (_) {
    // optional dep not published / not installed
  }

  // 2. Dev fallback: binary already compiled locally in platforms/
  const [os, arch] = platform.split("-");
  const localBinary = path.join(
    __dirname,
    "..",
    "platforms",
    os + "-" + arch,
    "bin",
    binaryName,
  );
  if (fs.existsSync(localBinary)) return localBinary;

  return null;
}

function link(src, dest) {
  try {
    fs.unlinkSync(dest);
  } catch (_) {
    // didn't exist
  }
  fs.copyFileSync(src, dest);
  try {
    fs.chmodSync(dest, 0o755);
  } catch (_) {
    // Windows doesn't need chmod
  }
}

const platform = detectPlatform();
if (!platform) {
  console.log("GodeX: skipping binary setup — unsupported platform", process.platform, process.arch);
  process.exit(0);
}

const binary = findBinary("@ahoo-wang/godex-" + platform, platform);
if (!binary) {
  console.log("GodeX: no prebuilt binary for", platform, "— dev mode, skipping");
  process.exit(0);
}

const destDir = path.join(__dirname, "..", "bin");
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, "godex-binary");

link(binary, dest);
console.log("GodeX: installed native binary for", platform);
