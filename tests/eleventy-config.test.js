import { describe, it, expect } from "vitest";
import Eleventy from "@11ty/eleventy";
import configure from "../eleventy.config.js";

describe("eleventy.config.js", () => {
	it("reads src/, writes _site/, and copies src/assets to /assets", () => {
		const passthrough = [];
		const config = configure({ addPassthroughCopy: (map) => passthrough.push(map) });

		expect(config.dir).toEqual({ input: "src", output: "_site" });
		expect(config.htmlTemplateEngine).toBe("njk");
		expect(passthrough).toEqual([{ "src/assets": "assets" }]);
	});
});

describe("site build", () => {
	async function build() {
		const elev = new Eleventy("src", "_site", {
			quietMode: true,
			configPath: "eleventy.config.js",
		});
		return elev.toJSON();
	}

	it("renders the coming-soon home page through the base layout", async () => {
		const pages = await build();
		const home = pages.find((p) => p.url === "/");

		expect(home).toBeDefined();
		expect(home.content).toContain("<title>xgo.net</title>");
		expect(home.content).toContain("<h1>xgo.net</h1>");
		expect(home.content).toContain("Coming soon.");
		expect(home.content).toContain('href="/assets/css/site.css"');
		expect(home.content).toContain('<link rel="canonical" href="https://xgo.net/">');
	});

	it("renders a 404 page at /404.html with its own title", async () => {
		const pages = await build();
		const notFound = pages.find((p) => p.url === "/404.html");

		expect(notFound).toBeDefined();
		expect(notFound.content).toContain("<title>Page not found — xgo.net</title>");
		expect(notFound.content).toContain('<a href="/">Back to home</a>');
	});
});
