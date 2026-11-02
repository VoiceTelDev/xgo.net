/*
 * Endpoint catalog for the xGO API test harness.
 *
 * Built from the Infobip OpenAPI specs (https://api.infobip.com/platform/1/openapi/<product>) for
 * number-lookup, number-activation-state, mobile-identity, and camara. Each endpoint declares the
 * inputs it uses (`inputs`, rendered as fields on its row), which of them are required (`needs`),
 * a sentence describing the required input with an example (`needsNote`), an optional sentence for
 * the optional inputs (`optionalNote`), how to build its request, and how to summarise a response.
 *
 * ctx fields: phonePlain (digits), phoneE164 (+digits), consent, period, logsLimit, callback,
 * returnUrl, deviceIp, devicePort, clientId, redirectUrl, carrierIds (array of integers), token,
 * reportId, pageSize, networkName, givenName, familyName, birthdate, email, postal, country,
 * nationalId, docType, lat, lng, accuracy.
 */
(function () {
	"use strict";

	// Every input an endpoint can ask for, with its label, an example (placeholder) and a description (title).
	const PARAMS = {
		consent: {
			type: "checkbox",
			label: "Send consentGranted = true",
			hint: "Mobile Identity requires explicit end-user consent; every call in this set sends consentGranted: true. Untick to disable the set.",
			default: true,
		},
		period: {
			type: "number",
			label: "Period (hours)",
			placeholder: "240",
			min: 1,
			hint: "Look-back window for the SIM swap check, in hours. Empty means 240 (10 days).",
		},
		logsLimit: {
			type: "number",
			label: "Limit",
			placeholder: "10",
			min: 1,
			max: 1000,
			hint: "Maximum number of log entries to return. Empty means 10.",
		},
		callback: {
			type: "url",
			label: "Callback URL",
			placeholder: "https://webhook.site/your-id",
			mono: true,
			wide: true,
			hint: "Public HTTPS URL where Infobip posts the asynchronous result. A webhook.site address works for testing.",
		},
		returnUrl: {
			type: "url",
			label: "Return URL",
			placeholder: "https://example.com/done",
			mono: true,
			wide: true,
			hint: "Where the handset is redirected after the verification page.",
		},
		deviceIp: {
			type: "text",
			label: "Device IP",
			placeholder: "177.12.34.56",
			mono: true,
			hint: "Public IP of the handset as seen by the mobile network (mobile data, not Wi-Fi).",
		},
		devicePort: {
			type: "number",
			label: "Device port",
			placeholder: "54321",
			min: 1,
			max: 65535,
			mono: true,
			hint: "Source port of the handset's connection.",
		},
		clientId: {
			type: "text",
			label: "CAMARA clientId",
			placeholder: "my-app-client",
			mono: true,
			hint: "Client identifier of your Infobip number verification application.",
		},
		redirectUrl: {
			type: "url",
			label: "Redirect URL",
			placeholder: "https://example.com/auth/callback",
			mono: true,
			wide: true,
			hint: "Redirect URL registered for the application; it receives the authorization code.",
		},
		carrierIds: {
			type: "text",
			label: "Android carrier IDs",
			placeholder: "1839, 1187",
			mono: true,
			hint: "Android canonical carrier IDs, comma separated (TelephonyManager.getSimCarrierId on the device).",
		},
		token: {
			type: "text",
			label: "Token",
			placeholder: "token from the init response",
			mono: true,
			wide: true,
			hint: "Token returned by the zero-rated init call.",
		},
		reportId: {
			type: "text",
			label: "Report ID",
			placeholder: "1f7a9938-0e3b-4e20-bb69-4968dca75078",
			mono: true,
			wide: true,
			hint: "reportId copied from the Network reports metadata response.",
		},
		pageSize: {
			type: "number",
			label: "Page size",
			placeholder: "20",
			min: 1,
			max: 1000,
			hint: "Records per page. Empty means 20.",
		},
		networkName: {
			type: "text",
			label: "Network name filter",
			placeholder: "Verizon Wireless",
			hint: "Only list reports for this network.",
		},
		givenName: {
			type: "text",
			label: "Given name",
			placeholder: "Jane",
			hint: "First name as held by the operator.",
		},
		familyName: {
			type: "text",
			label: "Family name",
			placeholder: "Doe",
			hint: "Last name as held by the operator.",
		},
		birthdate: {
			type: "text",
			label: "Birthdate",
			placeholder: "1985-07-15",
			mono: true,
			hint: "ISO date, YYYY-MM-DD.",
		},
		email: {
			type: "email",
			label: "Email",
			placeholder: "jane.doe@example.com",
			hint: "Email address on the subscriber record.",
		},
		postal: {
			type: "text",
			label: "Postal code",
			placeholder: "10001",
			mono: true,
			hint: "Postal code of the billing address.",
		},
		country: {
			type: "text",
			label: "Country (ISO 2)",
			placeholder: "US",
			maxlength: 2,
			mono: true,
			hint: "Two-letter ISO country code.",
		},
		nationalId: {
			type: "text",
			label: "National ID",
			placeholder: "123.456.789-10",
			mono: true,
			hint: "National identity number, formatted as the issuing country writes it.",
		},
		docType: {
			type: "select",
			label: "Document type",
			options: [
				{ value: "", label: "(none)" },
				{ value: "CC", label: "CC: cédula de ciudadanía" },
				{ value: "CE", label: "CE: cédula de extranjería" },
				{ value: "NIT", label: "NIT: tax ID" },
			],
			hint: "Mandatory in Colombia.",
		},
		lat: {
			type: "number",
			label: "Latitude",
			placeholder: "40.7128",
			step: "any",
			mono: true,
			hint: "Decimal degrees, -90 to 90.",
		},
		lng: {
			type: "number",
			label: "Longitude",
			placeholder: "-74.0060",
			step: "any",
			mono: true,
			hint: "Decimal degrees, -180 to 180.",
		},
		accuracy: {
			type: "number",
			label: "Radius (km)",
			placeholder: "10",
			min: 1,
			mono: true,
			hint: "Radius of the circle to check, in kilometres.",
		},
	};

	// Labels used in the "Needs:" line for inputs that live outside the endpoint row.
	const LABELS = {
		phone: "phone number",
		consent: "consentGranted ticked in the Mobile Identity header",
		identity:
			"at least one identity field (given name, family name, birthdate, email, postal code, country, or national ID)",
	};

	const IDENTITY = [
		"givenName",
		"familyName",
		"birthdate",
		"email",
		"postal",
		"country",
		"nationalId",
	];

	const present = (value) =>
		value !== undefined && value !== null && String(value).trim() !== "" && value !== false;

	function get(object, path) {
		return path
			.split(".")
			.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), object);
	}

	function first(body) {
		return body && Array.isArray(body.results) ? body.results[0] : undefined;
	}

	function kv(pairs) {
		return pairs
			.filter(([, value]) => value !== undefined && value !== null && value !== "")
			.map(
				([key, value]) =>
					`<strong>${key}</strong> ${typeof value === "object" ? JSON.stringify(value) : String(value)}`
			)
			.join(" · ");
	}

	function withOptional(body, extras) {
		for (const [key, value] of Object.entries(extras)) {
			if (present(value)) body[key] = value;
		}
		return body;
	}

	const CALLBACK_EXAMPLE = "e.g. https://webhook.site/<your-id>";

	const SETS = [
		{
			id: "number-lookup",
			title: "Number Lookup",
			doc: "https://www.infobip.com/docs/api/connectivity/number-lookup",
			desc: "Number Context: current network, portability and roaming status, validity. Numbers are sent as digits without a plus sign.",
			endpoints: [
				{
					id: "nl-query",
					method: "POST",
					path: "/number/1/query",
					name: "Number Context lookup",
					desc: "Synchronous HLR-based lookup for one number: status, original and current network, ported and roaming flags.",
					core: true,
					needs: ["phone"],
					inputs: [],
					build: (ctx) => ({ body: { to: [ctx.phonePlain] } }),
					summarize: (body) => {
						const r = first(body);
						if (!r) return "";
						return kv([
							["status", get(r, "status.name") || get(r, "status.groupName")],
							[
								"network",
								get(r, "currentNetwork.networkName") ||
									get(r, "originalNetwork.networkName"),
							],
							["mccMnc", r.mccMnc],
							["ported", r.ported],
							["roaming", r.roaming],
							["error", get(r, "error.name")],
						]);
					},
				},
				{
					id: "nl-logs",
					method: "GET",
					path: "/number/1/logs",
					name: "Number Context logs",
					desc: "Recent lookups for this number as recorded by the platform.",
					core: true,
					needs: ["phone"],
					inputs: ["logsLimit"],
					optionalNote: "a limit on the number of log entries returned (default 10).",
					build: (ctx) => ({ query: { to: ctx.phonePlain, limit: ctx.logsLimit || 10 } }),
					summarize: (body) =>
						Array.isArray(body && body.results)
							? `${body.results.length} log entr${body.results.length === 1 ? "y" : "ies"}`
							: "",
				},
				{
					id: "nl-notify",
					method: "POST",
					path: "/number/1/notify",
					name: "Number Context lookup (async)",
					desc: "Same lookup, delivered to your callback URL as JSON. The immediate response only acknowledges the request.",
					needs: ["phone", "callback"],
					inputs: ["callback"],
					needsNote: `a callback URL where Infobip posts the lookup result as JSON (${CALLBACK_EXAMPLE}).`,
					build: (ctx) => ({
						body: {
							to: [ctx.phonePlain],
							notifyUrl: ctx.callback,
							notifyContentType: "application/json",
						},
					}),
					summarize: (body) => {
						const r = first(body);
						return r
							? kv([
									["messageId", r.messageId],
									["status", get(r, "status.name")],
								])
							: kv([["bulkId", body && body.bulkId]]);
					},
				},
			],
		},
		{
			id: "number-activation-state",
			title: "Number Activation State",
			doc: "https://www.infobip.com/docs/api/connectivity/number-activation-state",
			desc: "Report-based feed of activation state changes per network. There is no per-number lookup: list the reports, then page through a report's records.",
			endpoints: [
				{
					id: "nas-reports",
					method: "GET",
					path: "/number-activation-state/1/network-reports",
					name: "Network reports metadata",
					desc: "Paginated list of available reports with reportId, network, and date range.",
					core: true,
					needs: [],
					inputs: ["pageSize", "networkName"],
					optionalNote:
						"a page size (default 20) and a network name filter (e.g. Verizon Wireless).",
					build: (ctx) => ({
						query: withOptional(
							{ page: 0, size: ctx.pageSize || 20 },
							{ networkName: ctx.networkName }
						),
					}),
					summarize: (body) => {
						const r = first(body);
						const n = Array.isArray(body && body.results)
							? body.results.length
							: undefined;
						return kv([
							["reports on page", n],
							["first reportId", r && r.reportId],
							["network", r && r.networkName],
						]);
					},
				},
				{
					id: "nas-records",
					method: "GET",
					path: "/number-activation-state/1/network-reports/{reportId}/records",
					name: "Network report content",
					desc: "Activation state changes inside one report.",
					needs: ["reportId"],
					inputs: ["reportId", "pageSize"],
					needsNote:
						"a report ID from the Network reports metadata response: run that first and copy a reportId (e.g. 1f7a9938-0e3b-4e20-bb69-4968dca75078).",
					optionalNote: "a page size (default 20).",
					build: (ctx) => ({
						path: `/number-activation-state/1/network-reports/${encodeURIComponent(ctx.reportId)}/records`,
						query: { page: 0, size: ctx.pageSize || 20 },
					}),
					summarize: (body) => {
						const n = Array.isArray(body && body.results)
							? body.results.length
							: undefined;
						return kv([["records on page", n]]);
					},
				},
			],
		},
		{
			id: "mobile-identity",
			title: "Mobile Identity",
			doc: "https://www.infobip.com/docs/api/connectivity/mobile-identity",
			desc: "Carrier-powered SIM swap, silent mobile verification, and number intelligence. Every call requires consentGranted = true. Availability varies by country.",
			inputs: ["consent"],
			endpoints: [
				{
					id: "mi-simswap",
					method: "POST",
					path: "/mi/simswap/1/check",
					name: "SIM swap check",
					desc: "Has the SIM changed within the period? Synchronous.",
					core: true,
					needs: ["phone", "consent"],
					inputs: ["period"],
					optionalNote: "a look-back period in hours (default 240, that is 10 days).",
					build: (ctx) => ({
						body: {
							consentGranted: true,
							phoneNumber: ctx.phonePlain,
							period: ctx.period || 240,
						},
					}),
					summarize: (body) =>
						kv([
							["swapped", body && body.swapped],
							["result", body && body.result],
							["status", body && body.status],
							["token", body && body.token],
						]),
				},
				{
					id: "mi-number-intelligence",
					method: "POST",
					path: "/mi/number-intelligence/1/query",
					name: "Number Intelligence query",
					desc: "Asynchronous multi-attribute query: SIM swap, plus national ID or device location when provided. Results arrive at the callback URL.",
					needs: ["phone", "consent", "callback"],
					inputs: [
						"callback",
						"period",
						"nationalId",
						"docType",
						"lat",
						"lng",
						"accuracy",
					],
					needsNote: `a callback URL where the asynchronous result is posted (${CALLBACK_EXAMPLE}).`,
					optionalNote:
						"a SIM swap period in hours (default 240); a national ID, plus document type in Colombia, to add the nationalIdentityNumber attribute; latitude, longitude, and radius together to add the deviceLocation attribute.",
					build: (ctx) => {
						const attributes = { simSwap: { period: ctx.period || 240 } };
						if (present(ctx.nationalId))
							attributes.nationalIdentityNumber = withOptional(
								{ nationalId: ctx.nationalId },
								{ documentType: ctx.docType }
							);
						if (present(ctx.lat) && present(ctx.lng) && present(ctx.accuracy))
							attributes.deviceLocation = {
								latitude: Number(ctx.lat),
								longitude: Number(ctx.lng),
								accuracy: Number(ctx.accuracy),
							};
						return {
							body: {
								consentGranted: true,
								phoneNumber: ctx.phonePlain,
								callbackUrl: ctx.callback,
								attributes,
							},
						};
					},
					summarize: (body) =>
						kv([
							["token", body && body.token],
							["status", body && body.status],
						]),
				},
				{
					id: "mi-smv",
					method: "POST",
					path: "/mi/verification/1/verify",
					name: "Silent Mobile Verification",
					desc: "Starts a device-side verification. The response carries a deviceRedirectUrl to open on the handset over mobile data; the result is posted to the callback URL.",
					needs: ["phone", "consent", "callback"],
					inputs: ["callback", "returnUrl"],
					needsNote: `a callback URL where the verification result is posted (${CALLBACK_EXAMPLE}).`,
					optionalNote:
						"a return URL the handset is redirected to after the check (e.g. https://example.com/done).",
					build: (ctx) => ({
						body: withOptional(
							{
								consentGranted: true,
								phoneNumber: ctx.phonePlain,
								callbackUrl: ctx.callback,
							},
							{ returnUrl: ctx.returnUrl }
						),
					}),
					summarize: (body) =>
						kv([
							["status", body && body.status],
							["token", body && body.token],
							["deviceRedirectUrl", body && body.deviceRedirectUrl],
						]),
				},
				{
					id: "mi-smv-advanced",
					method: "POST",
					path: "/mi/verification/1/verify/advanced",
					name: "Advanced Silent Mobile Verification",
					desc: "Silent verification with a SIM swap check first. No SMS failover is configured by this harness.",
					needs: ["phone", "consent", "callback"],
					inputs: ["callback", "period", "returnUrl"],
					needsNote: `a callback URL where the verification result is posted (${CALLBACK_EXAMPLE}).`,
					optionalNote:
						"a SIM swap period in hours (default 240) and a return URL for the handset.",
					build: (ctx) => ({
						body: withOptional(
							{
								consentGranted: true,
								phoneNumber: ctx.phonePlain,
								callbackUrl: ctx.callback,
								simSwapCheck: { period: ctx.period || 240 },
							},
							{ returnUrl: ctx.returnUrl }
						),
					}),
					summarize: (body) =>
						kv([
							["status", body && body.status],
							["token", body && body.token],
							["deviceRedirectUrl", body && body.deviceRedirectUrl],
						]),
				},
				{
					id: "mi-smv-sync",
					method: "POST",
					path: "/mi/verification/1/verify/synchronous",
					name: "Synchronous Silent Mobile Verification",
					desc: "Brazil only. Verifies using the device's public IP and port as seen on the mobile network.",
					needs: ["phone", "consent", "deviceIp", "devicePort"],
					inputs: ["deviceIp", "devicePort"],
					needsNote:
						"the handset's public IP and source port as seen by the mobile network, not Wi-Fi (e.g. 177.12.34.56 and 54321).",
					build: (ctx) => ({
						body: {
							consentGranted: true,
							phoneNumber: ctx.phonePlain,
							deviceIp: ctx.deviceIp,
							devicePort: Number(ctx.devicePort),
						},
					}),
					summarize: (body) =>
						kv([
							["result", body && body.result],
							["token", body && body.token],
						]),
				},
				{
					id: "mi-zero-init",
					method: "POST",
					path: "/mi/verification/1/zero-rated/init",
					name: "Zero-rated verification: init",
					desc: "Brazil only. Starts a zero-rated flow; the returned token is used by the verify step.",
					needs: ["phone", "consent"],
					inputs: ["returnUrl"],
					optionalNote:
						"a return URL the handset is redirected to after the zero-rated check.",
					build: (ctx) => ({
						body: withOptional(
							{ consentGranted: true, phoneNumber: ctx.phonePlain },
							{ returnUrl: ctx.returnUrl }
						),
					}),
					summarize: (body) =>
						kv([
							["token", body && body.token],
							["status", body && body.status],
							["deviceRedirectUrl", body && body.deviceRedirectUrl],
						]),
				},
				{
					id: "mi-zero-verify",
					method: "POST",
					path: "/mi/verification/1/verify/zero-rated",
					name: "Zero-rated verification: verify",
					desc: "Brazil only. Completes the flow started by init.",
					needs: ["token"],
					inputs: ["token"],
					needsNote:
						"the token returned by Zero-rated verification: init (copy it from that response).",
					build: (ctx) => ({ body: { token: ctx.token } }),
					summarize: (body) =>
						kv([
							["result", body && body.result],
							["status", body && body.status],
						]),
				},
				{
					id: "mi-national-id",
					method: "POST",
					path: "/mi/national-identity-number/1/check",
					name: "National identity number check",
					desc: "Does the number belong to the holder of this national ID?",
					needs: ["phone", "consent", "nationalId"],
					inputs: ["nationalId", "docType"],
					needsNote:
						"the national identity number to check against the subscriber record (e.g. 123.456.789-10).",
					optionalNote:
						"a document type, which is mandatory in Colombia (CC, CE, or NIT).",
					build: (ctx) => ({
						body: withOptional(
							{
								consentGranted: true,
								phoneNumber: ctx.phonePlain,
								nationalId: ctx.nationalId,
							},
							{ documentType: ctx.docType }
						),
					}),
					summarize: (body) =>
						kv([
							[
								"match",
								body && (body.match !== undefined ? body.match : body.result),
							],
							["status", body && body.status],
						]),
				},
			],
		},
		{
			id: "camara",
			title: "CAMARA",
			doc: "https://www.infobip.com/docs/api/connectivity/camara",
			desc: "GSMA CAMARA-shaped APIs: SIM swap, number verification, device location, KYC match. Numbers are sent in +E.164 form.",
			endpoints: [
				{
					id: "camara-simswap-check",
					method: "POST",
					path: "/camara/sim-swap/v0/check",
					name: "SIM swap check",
					desc: "Boolean: was there a SIM swap within maxAge hours?",
					core: true,
					needs: ["phone"],
					inputs: ["period"],
					optionalNote: "maxAge in hours (default 240).",
					build: (ctx) => ({
						body: { phoneNumber: ctx.phoneE164, maxAge: ctx.period || 240 },
					}),
					summarize: (body) => kv([["swapped", body && body.swapped]]),
				},
				{
					id: "camara-simswap-date",
					method: "POST",
					path: "/camara/sim-swap/v0/retrieve-date",
					name: "Retrieve SIM swap date",
					desc: "Timestamp of the most recent SIM change.",
					core: true,
					needs: ["phone"],
					inputs: [],
					build: (ctx) => ({ body: { phoneNumber: ctx.phoneE164 } }),
					summarize: (body) => kv([["latestSimChange", body && body.latestSimChange]]),
				},
				{
					id: "camara-nv-v0",
					method: "POST",
					path: "/camara/number-verification/v0/verify",
					name: "Number verification v0",
					desc: "Verifies possession via the operator data connection. Must originate from the handset on mobile data, so from this harness expect a not-verified or error response; useful for checking auth and reachability.",
					needs: ["phone"],
					inputs: [],
					build: (ctx) => ({ body: { phoneNumber: ctx.phoneE164 } }),
					summarize: (body) =>
						kv([["devicePhoneNumberVerified", body && body.devicePhoneNumberVerified]]),
				},
				{
					id: "camara-nv-v2",
					method: "POST",
					path: "/camara/number-verification/v2/verify",
					name: "Number verification v2",
					desc: "SIM-based (TS.43) verification. Same device-origin caveat as v0.",
					needs: ["phone"],
					inputs: [],
					build: (ctx) => ({ body: { phoneNumber: ctx.phoneE164 } }),
					summarize: (body) =>
						kv([["devicePhoneNumberVerified", body && body.devicePhoneNumberVerified]]),
				},
				{
					id: "camara-device-number",
					method: "GET",
					path: "/camara/number-verification/v2/device-phone-number",
					name: "Get device phone number",
					desc: "Returns the number associated with the calling device's SIM. Device-origin caveat applies.",
					needs: [],
					inputs: [],
					build: () => ({}),
					summarize: (body) =>
						kv([["devicePhoneNumber", body && body.devicePhoneNumber]]),
				},
				{
					id: "camara-authorize",
					method: "GET",
					path: "/camara/number-verification/v0/authorize",
					name: "Number verification: device authorization",
					desc: "The redirect step of the browser flow. Expect a 302 whose Location header points at the operator; the harness shows it instead of following it. The phone number, when set, is passed as login_hint.",
					needs: ["clientId", "redirectUrl"],
					inputs: ["clientId", "redirectUrl"],
					needsNote:
						"the clientId of your Infobip number verification application and the redirect URL registered for it (e.g. my-app-client and https://example.com/auth/callback).",
					build: (ctx) => ({
						query: withOptional(
							{
								clientId: ctx.clientId,
								redirectUrl: ctx.redirectUrl,
								state: "harness-" + Date.now(),
							},
							{ login_hint: ctx.phoneE164 ? "tel:" + ctx.phoneE164 : "" }
						),
					}),
					summarize: (body, response) =>
						kv([
							["location", response && response.headers && response.headers.location],
						]),
				},
				{
					id: "camara-dcql-verify",
					method: "POST",
					path: "/camara/number-verification/v2/dcql/verify",
					name: "DCQL request: verify",
					desc: "Builds the Android CredentialManager request for SIM-based verification.",
					needs: ["carrierIds"],
					inputs: ["carrierIds"],
					needsNote:
						"one or more Android canonical carrier IDs, comma separated (e.g. 1839, 1187; read them on the device with TelephonyManager.getSimCarrierId).",
					build: (ctx) => ({
						body: { nonce: crypto.randomUUID(), carrierIds: ctx.carrierIds },
					}),
					summarize: (body) =>
						body && typeof body === "object"
							? `${Object.keys(body).length} top-level field${Object.keys(body).length === 1 ? "" : "s"} returned`
							: "",
				},
				{
					id: "camara-dcql-number",
					method: "POST",
					path: "/camara/number-verification/v2/dcql/device-phone-number",
					name: "DCQL request: device phone number",
					desc: "Builds the Android CredentialManager request for retrieving the device number.",
					needs: ["carrierIds"],
					inputs: ["carrierIds"],
					needsNote:
						"one or more Android canonical carrier IDs, comma separated (e.g. 1839, 1187).",
					build: (ctx) => ({
						body: { nonce: crypto.randomUUID(), carrierIds: ctx.carrierIds },
					}),
					summarize: (body) =>
						body && typeof body === "object"
							? `${Object.keys(body).length} top-level field${Object.keys(body).length === 1 ? "" : "s"} returned`
							: "",
				},
				{
					id: "camara-location",
					method: "POST",
					path: "/camara/location/v0/verify",
					name: "Device location verification",
					desc: "Is the device within the circle defined by latitude, longitude, and radius?",
					needs: ["phone", "lat", "lng", "accuracy"],
					inputs: ["lat", "lng", "accuracy"],
					needsNote:
						"latitude, longitude, and a radius in km describing the circle to check (e.g. 40.7128, -74.0060, 10).",
					build: (ctx) => ({
						body: {
							ueId: { msisdn: ctx.phoneE164 },
							latitude: Number(ctx.lat),
							longitude: Number(ctx.lng),
							accuracy: Number(ctx.accuracy),
						},
					}),
					summarize: (body) =>
						kv([["verificationResult", body && body.verificationResult]]),
				},
				{
					id: "camara-kyc",
					method: "POST",
					path: "/camara/kyc-match/v0.3/match",
					name: "KYC match",
					desc: "Matches the identity fields you provide against operator records and returns a match flag per field.",
					needs: ["phone", "identity"],
					inputs: IDENTITY,
					needsNote: LABELS.identity + ".",
					build: (ctx) => ({
						body: withOptional(
							{ phoneNumber: ctx.phoneE164 },
							{
								givenName: ctx.givenName,
								familyName: ctx.familyName,
								name: [ctx.givenName, ctx.familyName].filter(present).join(" "),
								birthdate: ctx.birthdate,
								email: ctx.email,
								postalCode: ctx.postal,
								country: ctx.country ? String(ctx.country).toUpperCase() : "",
								idDocument: ctx.nationalId,
							}
						),
					}),
					summarize: (body) =>
						body && typeof body === "object"
							? kv(
									Object.entries(body)
										.filter(([key]) => /Match$/.test(key))
										.slice(0, 8)
								)
							: "",
				},
			],
		},
	];

	// Returns the unmet requirements of an endpoint as { key, label } pairs.
	function missing(endpoint, ctx) {
		const gaps = [];
		for (const need of endpoint.needs) {
			if (need === "identity") {
				if (!IDENTITY.some((key) => present(ctx[key])))
					gaps.push({ key: need, label: LABELS.identity });
			} else if (need === "phone") {
				if (!present(ctx.phonePlain)) gaps.push({ key: need, label: LABELS.phone });
			} else if (need === "carrierIds") {
				if (!Array.isArray(ctx.carrierIds) || !ctx.carrierIds.length)
					gaps.push({ key: need, label: PARAMS.carrierIds.label });
			} else if (!present(ctx[need])) {
				gaps.push({
					key: need,
					label: LABELS[need] || (PARAMS[need] && PARAMS[need].label) || need,
				});
			}
		}
		return gaps;
	}

	window.CATALOG = { sets: SETS, params: PARAMS, identity: IDENTITY, missing, labels: LABELS };
})();
