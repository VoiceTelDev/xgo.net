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

/**
 * Build-time data. Exported as a function so each Eleventy build re-reads the environment.
 *
 * XGO_STAGING=1 builds the site in staging mode: the coming-soon page stays at `/`, the real
 * homepage moves to `/new/`, every page carries a noindex meta tag, robots.txt disallows crawling,
 * and no sitemap is written. Remove the variable from the deploy workflow to launch.
 */
export default function () {
	const staging = process.env.XGO_STAGING === "1";
	return {
		version: commit(),
		year: new Date().getFullYear(),
		staging,
		home: staging ? "/new/" : "/",
	};
}
