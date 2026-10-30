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
	let pagesPromise;

	function build() {
		if (!pagesPromise) {
			const elev = new Eleventy("src", "_site", {
				quietMode: true,
				configPath: "eleventy.config.js",
			});
			pagesPromise = elev.toJSON();
		}
		return pagesPromise;
	}

	it("renders the homepage through the base layout with the shared stylesheet", async () => {
		const pages = await build();
		const home = pages.find((p) => p.url === "/");

		expect(home).toBeDefined();
		expect(home.content).toContain("<title>xGO — Know more from every number.</title>");
		expect(home.content).toContain(
			'<h1 id="hero-title" class="hero__title">Know more from every number'
		);
		expect(home.content).toMatch(/href="\/assets\/css\/site\.css\?v=[^"]+"/);
		expect(home.content).toContain('<link rel="canonical" href="https://xgo.net/">');
		expect(home.content).not.toContain(' style="');
	});

	it("renders every page in the brief's URL map", async () => {
		const pages = await build();
		const urls = new Set(pages.map((p) => p.url));
		for (const url of [
			"/products/",
			"/products/phone-enrichment/",
			"/products/caller-name-lookup/",
			"/products/carrier-lookup/",
			"/products/lrn-lookup/",
			"/products/bulk-enrichment/",
			"/products/ghostverify/",
			"/solutions/",
			"/solutions/sales-crm-enrichment/",
			"/solutions/data-providers/",
			"/developers/",
			"/pricing/",
			"/about/",
			"/contact/",
			"/coverage/",
			"/faq/",
			"/security/",
			"/terms/",
			"/privacy/",
		]) {
			expect(urls.has(url), `missing ${url}`).toBe(true);
		}
	});

	it("renders a 404 page at /404.html with its own title", async () => {
		const pages = await build();
		const notFound = pages.find((p) => p.url === "/404.html");

		expect(notFound).toBeDefined();
		expect(notFound.content).toContain("<title>Page not found | xGO</title>");
		expect(notFound.content).toContain('href="/"');
		expect(notFound.content).toContain('<meta name="robots" content="noindex, nofollow">');
	});

	it("lists only indexable pages in the sitemap", async () => {
		const pages = await build();
		const sitemap = pages.find((p) => p.url === "/sitemap.xml");

		expect(sitemap).toBeDefined();
		expect(sitemap.content).toContain("<loc>https://xgo.net/</loc>");
		expect(sitemap.content).toContain("<loc>https://xgo.net/products/</loc>");
		expect(sitemap.content).not.toContain("404.html");
		expect(sitemap.content).not.toContain("/terms/");
	});
});
