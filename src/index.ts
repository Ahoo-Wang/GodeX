// src/index.ts

import { runCli } from "./cli";

process.exitCode = await runCli(process.argv);
