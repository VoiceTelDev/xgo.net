export default function () {
	return {
		permalink: process.env.XGO_STAGING === "1" ? "/index.html" : false,
		eleventyExcludeFromCollections: true,
	};
}
