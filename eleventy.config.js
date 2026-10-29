export default function (eleventyConfig) {
	eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

	return {
		dir: {
			input: "src",
			output: "_site",
		},
		htmlTemplateEngine: "njk",
		markdownTemplateEngine: "njk",
	};
}
