import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const root = resolve(import.meta.dir, "..");
const pkgPath = resolve(root, "package.json");
const platformDirs = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-arm64",
  "win32-x64",
];

function readPkg(file: string) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writePkg(file: string, pkg: Record<string, unknown>) {
  writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
}

const args = process.argv.slice(2);
const allowSameVersion = args.includes("--allow-same-version");
const skipInstall = args.includes("--skip-install");
const version = args.find((a) => !a.startsWith("--"));
if (!version) {
  console.error("Usage: bun run version <version>");
  console.error("Example: bun run version 0.0.2");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error(`Invalid version: ${version}`);
  process.exit(1);
}

const currentPkg = readPkg(pkgPath);
if (currentPkg.version === version && !allowSameVersion) {
  console.error(`Already at version ${version}`);
  process.exit(1);
}

// Update root package.json
currentPkg.version = version;
for (const dep of Object.keys(
  currentPkg.optionalDependencies as Record<string, string>,
)) {
  currentPkg.optionalDependencies[dep] = version;
}
writePkg(pkgPath, currentPkg);
console.log(`package.json → ${version}`);

// Update platform packages
for (const dir of platformDirs) {
  const file = resolve(root, "platforms", dir, "package.json");
  const pkg = readPkg(file);
  pkg.version = version;
  writePkg(file, pkg);
  console.log(`platforms/${dir}/package.json → ${version}`);
}

// Refresh bun.lock (skip in CI where deps are already installed)
if (!skipInstall) {
  execSync("bun install", { cwd: root, stdio: "inherit" });
  console.log("bun.lock updated");
}

