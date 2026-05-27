import { homedir } from "node:os";
import path from "node:path";

export function expandHomeDir(filepath: string): string {
	if (filepath.startsWith("~/")) {
		return path.join(process.env.HOME ?? homedir(), filepath.slice(2));
	}
	return filepath;
}
