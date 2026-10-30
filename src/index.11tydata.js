export default function () {
	return {
		permalink: process.env.XGO_STAGING === "1" ? "/new/index.html" : "/index.html",
	};
}
