import { execSync } from "node:child_process";

function commit() {
	try {
		return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
			.toString()
			.trim();
	} catch {
		return String(Date.now());
	}
}

export default {
	version: commit(),
	year: new Date().getFullYear(),
};
