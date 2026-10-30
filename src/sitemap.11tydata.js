export default function () {
	return {
		permalink: process.env.XGO_STAGING === "1" ? false : "/sitemap.xml",
		eleventyExcludeFromCollections: true,
	};
}
