import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.js"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary", "lcov"],
			include: ["eleventy.config.js"],
			thresholds: {
				statements: 100,
				branches: 100,
				functions: 100,
				lines: 100,
			},
		},
	},
});
