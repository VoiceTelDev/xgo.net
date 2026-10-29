import globals from "globals";

export default [
	{
		ignores: ["_site/", "node_modules/", "coverage/"],
	},
	{
		files: ["tests/**/*.js", "tools/**/*.{js,mjs}", "eleventy.config.js", "vitest.config.js"],
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: "module",
			globals: {
				...globals.node,
			},
		},
		rules: {
			"no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
			"no-undef": "error",
			"no-var": "error",
			"prefer-const": "error",
			eqeqeq: ["error", "always"],
		},
	},
];
