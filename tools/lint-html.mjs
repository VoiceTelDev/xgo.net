import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = resolve(ROOT, "_site");

async function find(dir, results = []) {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			await find(full, results);
		} else if (entry.name.endsWith(".html")) {
			results.push(full);
		}
	}
	return results;
}

const files = await find(SITE);
if (files.length === 0) {
	console.log("No HTML files to lint.");
	process.exit(0);
}

console.log(`Linting ${files.length} HTML files.`);
try {
	execFileSync("npx", ["--no-install", "html-validate", ...files], { stdio: "inherit" });
} catch (err) {
	process.exit(err.status || 1);
}
