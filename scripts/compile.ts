// Build standalone native binaries via bun build --compile.
// Release builds run this on each target platform in GitHub Actions.
// Local --all builds ask Bun to download and use each matching target runtime.
//
// Usage:
//   bun run scripts/compile.ts                    # current platform only
//   bun run scripts/compile.ts --all               # all platforms

import { existsSync, renameSync } from "node:fs";

const PLATFORMS = [
  {
    name: "@ahoo-wang/godex-darwin-arm64",
    flag: "darwin-arm64",
    bunTarget: "bun-darwin-arm64",
  },
  {
    name: "@ahoo-wang/godex-darwin-x64",
    flag: "darwin-x64",
    bunTarget: "bun-darwin-x64",
  },
  {
    name: "@ahoo-wang/godex-linux-x64",
    flag: "linux-x64",
    bunTarget: "bun-linux-x64",
  },
  {
    name: "@ahoo-wang/godex-linux-arm64",
    flag: "linux-arm64",
    bunTarget: "bun-linux-arm64",
  },
  {
    name: "@ahoo-wang/godex-win32-x64",
    flag: "win32-x64",
    bunTarget: "bun-windows-x64",
  },
  {
    name: "@ahoo-wang/godex-win32-arm64",
    flag: "win32-arm64",
    bunTarget: "bun-windows-arm64",
  },
] as const;

const args = process.argv.slice(2);
const buildAll = args.includes("--all");
const targetFlag = args
  .find((a) => a.startsWith("--target="))
  ?.split("=")[1];

let targets: typeof PLATFORMS[number][];
if (targetFlag) {
  targets = PLATFORMS.filter((p) => p.flag === targetFlag);
} else if (buildAll) {
  targets = [...PLATFORMS];
} else {
  targets = PLATFORMS.filter((p) => {
    const os = process.platform;
    const arch = process.arch;
    return p.flag === `${os}-${arch}`;
  });
}

if (targets.length === 0) {
  console.error(
    `No matching platform for ${process.platform}-${process.arch}. Use --all to cross-compile.`,
  );
  process.exit(1);
}

for (const { name, flag, bunTarget } of targets) {
  const [os, arch] = flag.split("-");
  const isWindows = os === "win32";
  const binaryName = isWindows ? "godex.exe" : "godex";
  const outdir = `platforms/${os}-${arch}/bin`;
  const outfile = `${outdir}/${binaryName}`;

  console.log(`Compiling ${name} → ${outfile} ...`);
  const proc = Bun.spawnSync(
    [
      "bun",
      "build",
      "--compile",
      "--define", "GODEX_BUILD_ENV=\"prod\"",
      `--target=${bunTarget}`,
      "src/index.ts",
      "--outfile",
      outfile,
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (proc.exitCode !== 0) {
    console.error(`Failed: ${name}`);
    process.exit(1);
  }

  // Cross-compiling may not add .exe suffix for Windows targets
  if (isWindows && !existsSync(outfile)) {
    const withoutExe = `${outdir}/godex`;
    if (existsSync(withoutExe)) {
      renameSync(withoutExe, outfile);
    }
  }

  console.log(`  ${name} OK`);
}

console.log("\nAll done.");
