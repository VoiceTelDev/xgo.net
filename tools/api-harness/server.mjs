/*
 * Local proxy, callback receiver, and static server for the xGO API test harness.
 *
 * Serves ./public on http://127.0.0.1:8787 and forwards POST /proxy calls to the Infobip API base
 * the page supplies, adding the `Authorization: App <key>` header. The key never leaves this
 * machine except in that header, and the server only listens on localhost.
 *
 * Asynchronous endpoints post their results to a callback URL. A second listener on
 * http://127.0.0.1:8788 records anything posted to it (data/callbacks.jsonl) so that a Cloudflare
 * quick tunnel can expose that port alone: the harness page, the run log, and the proxy are never
 * reachable through the tunnel. POST /tunnel/start runs `cloudflared tunnel --url` for that port
 * and reports the public trycloudflare.com URL.
 *
 * Every completed run is appended as one JSON line to data/runs.jsonl, which the page lists as
 * run history. The API key is never written to disk.
 *
 * No dependencies. Node 18 or newer. cloudflared is optional (brew install cloudflared).
 *
 *   node server.mjs                     # http://127.0.0.1:8787, receiver on :8788
 *   PORT=9000 CALLBACK_PORT=9001 node server.mjs
 *   ALLOW_ANY_HOST=1 node server.mjs    # forward to any https host, not only *.infobip.com
 *   CLOUDFLARED=/path/to/cloudflared node server.mjs
 */
import { createServer } from "node:http";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 8787);
const CALLBACK_PORT = Number(process.env.CALLBACK_PORT || 8788);
const HOST = "127.0.0.1";
const BASE_DIR = fileURLToPath(new URL(".", import.meta.url));
const ROOT = join(BASE_DIR, "public");
const DATA_DIR = join(BASE_DIR, "data");
const RUN_LOG = join(DATA_DIR, "runs.jsonl");
const CALLBACK_LOG = join(DATA_DIR, "callbacks.jsonl");
const CALLBACK_URL = `http://${HOST}:${CALLBACK_PORT}`;
const CLOUDFLARED = process.env.CLOUDFLARED || "cloudflared";
const ALLOW_ANY_HOST = process.env.ALLOW_ANY_HOST === "1";
const TIMEOUT_MS = 30_000;
const TUNNEL_START_MS = 25_000;
const TYPES = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
	const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
	res.writeHead(status, {
		"Content-Type": type,
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff",
	});
	res.end(payload);
}

function readBody(req, limit = 1_000_000) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > limit) {
				reject(new Error("Request body too large"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => resolve(Buffer.concat(chunks)));
		req.on("error", reject);
	});
}

async function readJson(req) {
	const buffer = await readBody(req);
	try {
		return buffer.length ? JSON.parse(buffer.toString("utf8")) : {};
	} catch (error) {
		throw new Error("Request body is not valid JSON: " + error.message);
	}
}

// Proxy ------------------------------------------------------------------------------------------

function allowedBase(base) {
	let url;
	try {
		url = new URL(base);
	} catch {
		return "API base must be a full URL such as https://xxxxx.api.infobip.com";
	}
	if (url.protocol !== "https:") return "API base must use https";
	const host = url.hostname.toLowerCase();
	if (!ALLOW_ANY_HOST && host !== "infobip.com" && !host.endsWith(".infobip.com")) {
		return "API base must be an infobip.com host (start the server with ALLOW_ANY_HOST=1 to override)";
	}
	return null;
}

async function proxy(req, res) {
	const started = performance.now();
	let call;
	try {
		call = await readJson(req);
	} catch (error) {
		return send(res, 400, { error: error.message });
	}
	const { base, key, method = "GET", path, query = {}, headers = {}, body } = call;
	if (typeof base !== "string" || typeof path !== "string" || !path.startsWith("/")) {
		return send(res, 400, {
			error: "Expected base (string) and path (string starting with /)",
		});
	}
	const baseError = allowedBase(base);
	if (baseError) return send(res, 400, { error: baseError });
	if (typeof key !== "string" || !key.trim())
		return send(res, 400, { error: "API key is empty" });

	const url = new URL(path, base.endsWith("/") ? base : base + "/");
	for (const [name, value] of Object.entries(query || {})) {
		if (value !== undefined && value !== null && String(value) !== "")
			url.searchParams.set(name, String(value));
	}
	const upstreamHeaders = {
		Authorization: "App " + key.trim(),
		Accept: "application/json",
		...headers,
	};
	const init = {
		method: String(method).toUpperCase(),
		headers: upstreamHeaders,
		redirect: "manual",
	};
	if (body !== undefined && body !== null && init.method !== "GET" && init.method !== "HEAD") {
		upstreamHeaders["Content-Type"] = "application/json";
		init.body = typeof body === "string" ? body : JSON.stringify(body);
	}
	init.signal = AbortSignal.timeout(TIMEOUT_MS);

	try {
		const upstream = await fetch(url, init);
		const text = await upstream.text();
		let parsed = text;
		try {
			parsed = text ? JSON.parse(text) : null;
		} catch {
			/* keep raw text */
		}
		const durationMs = Math.round(performance.now() - started);
		console.log(
			`${init.method} ${url.pathname}${url.search} -> ${upstream.status} (${durationMs} ms)`
		);
		return send(res, 200, {
			ok: upstream.ok,
			status: upstream.status,
			statusText: upstream.statusText,
			url: url.toString(),
			durationMs,
			headers: Object.fromEntries(upstream.headers.entries()),
			body: parsed,
			request: {
				method: init.method,
				url: url.toString(),
				body: init.body ? JSON.parse(init.body) : undefined,
			},
		});
	} catch (error) {
		const durationMs = Math.round(performance.now() - started);
		const message =
			error.name === "TimeoutError"
				? `No response within ${TIMEOUT_MS / 1000} s`
				: error.message;
		console.log(`${init.method} ${url.pathname} -> error: ${message} (${durationMs} ms)`);
		return send(res, 200, {
			ok: false,
			error: message,
			url: url.toString(),
			durationMs,
			request: {
				method: init.method,
				url: url.toString(),
				body: init.body ? JSON.parse(init.body) : undefined,
			},
		});
	}
}

// Run log ----------------------------------------------------------------------------------------

function stripKeys(value) {
	if (Array.isArray(value)) return value.map(stripKeys);
	if (value && typeof value === "object") {
		const out = {};
		for (const [name, inner] of Object.entries(value)) {
			if (name === "key" || name === "apiKey") continue;
			out[name] = stripKeys(inner);
		}
		return out;
	}
	return value;
}

async function readJsonLines(file) {
	try {
		const text = await readFile(file, "utf8");
		return text
			.split("\n")
			.filter(Boolean)
			.map((line) => {
				try {
					return JSON.parse(line);
				} catch {
					return null;
				}
			})
			.filter(Boolean);
	} catch (error) {
		if (error.code === "ENOENT") return [];
		throw error;
	}
}

function runSummary(run) {
	const results = Array.isArray(run.results) ? run.results : [];
	const ok = results.filter((r) => r.status >= 200 && r.status < 300).length;
	return {
		id: run.id,
		phone: run.phone || "",
		base: run.base || "",
		startedAt: run.startedAt,
		finishedAt: run.finishedAt,
		callbackTag: run.callbackTag || null,
		calls: results.length,
		ok,
		failed: results.length - ok,
	};
}

async function saveRun(req, res) {
	let run;
	try {
		run = await readJson(req);
	} catch (error) {
		return send(res, 400, { error: error.message });
	}
	if (!run || !Array.isArray(run.results) || !run.results.length) {
		return send(res, 400, { error: "A run needs a non-empty results array" });
	}
	const record = stripKeys({
		id: `${Date.now()}-${randomBytes(3).toString("hex")}`,
		savedAt: new Date().toISOString(),
		...run,
	});
	await mkdir(DATA_DIR, { recursive: true });
	await appendFile(RUN_LOG, JSON.stringify(record) + "\n");
	console.log(`saved run ${record.id} (${record.results.length} calls) to ${RUN_LOG}`);
	return send(res, 201, { id: record.id, summary: runSummary(record) });
}

async function listRuns(res) {
	const runs = await readJsonLines(RUN_LOG);
	return send(res, 200, { runs: runs.map(runSummary).reverse(), file: RUN_LOG });
}

async function getRun(res, id) {
	const runs = await readJsonLines(RUN_LOG);
	const run = runs.find((candidate) => candidate.id === id);
	return run ? send(res, 200, run) : send(res, 404, { error: "No run with id " + id });
}

// Callback receiver --------------------------------------------------------------------------------

const MAX_CALLBACKS_IN_MEMORY = 500;
const CALLBACK_HEADERS = [
	"content-type",
	"content-length",
	"user-agent",
	"cf-connecting-ip",
	"cf-ipcountry",
	"cf-ray",
	"x-forwarded-for",
];
// A callback URL may carry /cb/<run tag>/<endpoint id> so the page can match the reply to the call.
const TAG_PATTERN = /\/cb\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,64})(?=\/|$)/;
const callbacks = { items: [], seq: 0 };
const receiver = { listening: false, error: null };

async function loadCallbacks() {
	const items = await readJsonLines(CALLBACK_LOG);
	callbacks.items = items.slice(-MAX_CALLBACKS_IN_MEMORY);
	callbacks.seq = items.reduce((max, item) => Math.max(max, Number(item.seq) || 0), 0);
}

function parseCallbackBody(buffer, contentType = "") {
	const text = buffer.toString("utf8");
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		/* not JSON */
	}
	if (/application\/x-www-form-urlencoded/i.test(contentType))
		return Object.fromEntries(new URLSearchParams(text));
	return text.length > 100_000 ? text.slice(0, 100_000) + "…" : text;
}

function receiverPage(message) {
	return `<!DOCTYPE html><meta charset="utf-8"><meta name="robots" content="noindex"><title>xGO harness receiver</title><body style="font: 15px/1.5 system-ui, sans-serif; color: #0e1014; padding: 32px; max-width: 560px"><p>${message}</p></body>`;
}

async function receiveCallback(req, res) {
	const url = new URL(req.url, CALLBACK_URL);
	const isGet = req.method === "GET" || req.method === "HEAD";
	if (isGet && url.pathname === "/favicon.ico") return send(res, 404, "", "text/plain");
	if (isGet && url.pathname === "/") {
		return send(
			res,
			200,
			receiverPage(
				"This is the xGO API test harness callback receiver. Results posted here show up on the harness page."
			),
			"text/html; charset=utf-8"
		);
	}
	let body = null;
	try {
		body = isGet ? null : parseCallbackBody(await readBody(req), req.headers["content-type"]);
	} catch (error) {
		return send(res, 413, { ok: false, error: error.message });
	}
	const match = url.pathname.match(TAG_PATTERN);
	const headers = {};
	for (const name of CALLBACK_HEADERS)
		if (req.headers[name] !== undefined) headers[name] = req.headers[name];
	const record = {
		id: `${Date.now()}-${randomBytes(3).toString("hex")}`,
		seq: ++callbacks.seq,
		receivedAt: new Date().toISOString(),
		method: req.method,
		path: url.pathname,
		query: Object.fromEntries(url.searchParams),
		headers,
		tag: match ? match[1] : null,
		endpointId: match ? match[2] : null,
		body,
	};
	callbacks.items.push(record);
	if (callbacks.items.length > MAX_CALLBACKS_IN_MEMORY) callbacks.items.shift();
	await mkdir(DATA_DIR, { recursive: true });
	await appendFile(CALLBACK_LOG, JSON.stringify(record) + "\n");
	console.log(
		`callback #${record.seq}: ${req.method} ${url.pathname}${record.endpointId ? ` (${record.endpointId})` : ""}`
	);
	if (isGet)
		return send(
			res,
			200,
			receiverPage("Received. You can close this page."),
			"text/html; charset=utf-8"
		);
	return send(res, 200, { ok: true, id: record.id });
}

async function listCallbacks(url, res) {
	const after = Number(url.searchParams.get("after"));
	const tag = url.searchParams.get("tag");
	const limit = Math.min(
		Math.max(Number(url.searchParams.get("limit")) || 50, 1),
		MAX_CALLBACKS_IN_MEMORY
	);
	let items = callbacks.items;
	if (tag) items = items.filter((item) => item.tag === tag);
	else if (Number.isFinite(after) && after > 0) items = items.filter((item) => item.seq > after);
	else items = items.slice(-limit);
	return send(res, 200, {
		callbacks: items,
		latest: callbacks.seq,
		file: CALLBACK_LOG,
		receiver: {
			url: CALLBACK_URL,
			port: CALLBACK_PORT,
			listening: receiver.listening,
			error: receiver.error,
		},
		tunnel: await tunnelStatus(),
	});
}

async function clearCallbacks(res) {
	callbacks.items = [];
	await mkdir(DATA_DIR, { recursive: true });
	await writeFile(CALLBACK_LOG, "");
	console.log("callback log cleared");
	return send(res, 200, { ok: true });
}

// Cloudflare quick tunnel ----------------------------------------------------------------------------

const tunnel = {
	child: null,
	status: "stopped",
	url: null,
	startedAt: null,
	error: null,
	stopping: false,
	log: [],
};
let cloudflared = { installed: null, version: null, checkedAt: 0 };

function checkCloudflared(force = false) {
	if (!force && cloudflared.installed !== null && Date.now() - cloudflared.checkedAt < 60_000)
		return Promise.resolve(cloudflared);
	return new Promise((resolve) => {
		execFile(CLOUDFLARED, ["--version"], { timeout: 5_000 }, (error, stdout) => {
			cloudflared = {
				installed: !error,
				version: error ? null : String(stdout).trim().split("\n")[0],
				checkedAt: Date.now(),
			};
			resolve(cloudflared);
		});
	});
}

async function tunnelStatus() {
	const info = await checkCloudflared(tunnel.status === "error");
	return {
		command: CLOUDFLARED,
		installed: info.installed,
		version: info.version,
		running: Boolean(tunnel.child),
		status: tunnel.status,
		url: tunnel.url,
		startedAt: tunnel.startedAt,
		error: tunnel.error,
		log: tunnel.log.slice(-8),
		exposes: CALLBACK_URL,
	};
}

function noteTunnelLine(line) {
	const text = String(line).trim();
	if (!text) return;
	tunnel.log.push(text);
	if (tunnel.log.length > 60) tunnel.log.shift();
	const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
	if (match && !tunnel.url) {
		tunnel.url = match[0];
		tunnel.status = "connecting";
		console.log(`tunnel url: ${tunnel.url} -> ${CALLBACK_URL}`);
	}
	if (/Registered tunnel connection/i.test(text) && tunnel.url) tunnel.status = "connected";
	if (/\bERR\b/.test(text)) tunnel.error = text.replace(/^\S+\s+ERR\s+/, "");
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startTunnel() {
	if (tunnel.child) return tunnelStatus();
	const info = await checkCloudflared(true);
	if (!info.installed) {
		tunnel.status = "error";
		tunnel.error = `${CLOUDFLARED} is not installed or not on PATH (brew install cloudflared)`;
		return tunnelStatus();
	}
	Object.assign(tunnel, {
		status: "starting",
		url: null,
		startedAt: new Date().toISOString(),
		error: null,
		stopping: false,
		log: [],
	});
	const child = spawn(CLOUDFLARED, ["tunnel", "--url", CALLBACK_URL, "--no-autoupdate"], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	tunnel.child = child;
	createInterface({ input: child.stdout }).on("line", noteTunnelLine);
	createInterface({ input: child.stderr }).on("line", noteTunnelLine);
	child.on("error", (error) => {
		tunnel.child = null;
		tunnel.status = "error";
		tunnel.url = null;
		tunnel.error =
			error.code === "ENOENT"
				? `${CLOUDFLARED} is not installed or not on PATH (brew install cloudflared)`
				: error.message;
	});
	child.on("exit", (code, signal) => {
		tunnel.child = null;
		tunnel.url = null;
		if (tunnel.stopping) {
			tunnel.status = "stopped";
			tunnel.error = null;
		} else {
			tunnel.status = "error";
			tunnel.error = tunnel.error || `cloudflared exited (${signal || "code " + code})`;
		}
		tunnel.stopping = false;
		console.log(`tunnel ${tunnel.status}${tunnel.error ? ": " + tunnel.error : ""}`);
	});
	const deadline = Date.now() + TUNNEL_START_MS;
	while (!tunnel.url && tunnel.child && Date.now() < deadline) await sleep(250);
	if (!tunnel.url && tunnel.child) {
		tunnel.error =
			tunnel.error ||
			`cloudflared printed no trycloudflare.com URL within ${TUNNEL_START_MS / 1000} s`;
	}
	return tunnelStatus();
}

async function stopTunnel() {
	if (tunnel.child) {
		tunnel.stopping = true;
		tunnel.child.kill("SIGTERM");
		const deadline = Date.now() + 5_000;
		while (tunnel.child && Date.now() < deadline) await sleep(100);
		if (tunnel.child) tunnel.child.kill("SIGKILL");
	}
	return tunnelStatus();
}

function shutdown() {
	if (tunnel.child) {
		tunnel.stopping = true;
		tunnel.child.kill("SIGTERM");
	}
	process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", () => tunnel.child && tunnel.child.kill("SIGTERM"));

// Static files ---------------------------------------------------------------------------------------

async function serveStatic(pathname, res) {
	const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
	const file = normalize(join(ROOT, relative));
	if (!file.startsWith(ROOT + sep) && file !== ROOT)
		return send(res, 403, "Forbidden", "text/plain");
	try {
		const data = await readFile(file);
		return send(res, 200, data, TYPES[extname(file)] || "application/octet-stream");
	} catch {
		return send(res, 404, "Not found", "text/plain");
	}
}

// Servers --------------------------------------------------------------------------------------------

await loadCallbacks();

createServer(async (req, res) => {
	const url = new URL(req.url, `http://${HOST}:${PORT}`);
	const path = decodeURIComponent(url.pathname);
	try {
		if (req.method === "GET" && path === "/health") {
			return send(res, 200, {
				ok: true,
				allowAnyHost: ALLOW_ANY_HOST,
				runLog: RUN_LOG,
				callbackLog: CALLBACK_LOG,
				receiver: {
					url: CALLBACK_URL,
					port: CALLBACK_PORT,
					listening: receiver.listening,
					error: receiver.error,
				},
			});
		}
		if (req.method === "POST" && path === "/proxy") return await proxy(req, res);
		if (req.method === "POST" && path === "/runs") return await saveRun(req, res);
		if (req.method === "GET" && path === "/runs") return await listRuns(res);
		if (req.method === "GET" && path.startsWith("/runs/"))
			return await getRun(res, path.slice(6));
		if (req.method === "GET" && path === "/callbacks") return await listCallbacks(url, res);
		if (req.method === "DELETE" && path === "/callbacks") return await clearCallbacks(res);
		if (req.method === "GET" && path === "/tunnel") return send(res, 200, await tunnelStatus());
		if (req.method === "POST" && path === "/tunnel/start")
			return send(res, 200, await startTunnel());
		if (req.method === "POST" && path === "/tunnel/stop")
			return send(res, 200, await stopTunnel());
		if (req.method === "GET" || req.method === "HEAD") return await serveStatic(path, res);
	} catch (error) {
		console.error(error);
		return send(res, 500, { error: error.message });
	}
	return send(res, 405, "Method not allowed", "text/plain");
}).listen(PORT, HOST, () => {
	console.log(`xGO API test harness: http://${HOST}:${PORT}`);
	console.log(
		ALLOW_ANY_HOST ? "Forwarding to any https host." : "Forwarding to *.infobip.com only."
	);
	console.log(`Run log: ${RUN_LOG}`);
});

createServer((req, res) => {
	receiveCallback(req, res).catch((error) => {
		console.error(error);
		send(res, 500, { ok: false, error: error.message });
	});
})
	.on("error", (error) => {
		receiver.error =
			error.code === "EADDRINUSE"
				? `port ${CALLBACK_PORT} is already in use (set CALLBACK_PORT to change it)`
				: error.message;
		console.error(`Callback receiver not started: ${receiver.error}`);
	})
	.listen(CALLBACK_PORT, HOST, () => {
		receiver.listening = true;
		console.log(
			`Callback receiver: ${CALLBACK_URL} (Start tunnel on the page, or run: cloudflared tunnel --url ${CALLBACK_URL})`
		);
		console.log(`Callback log: ${CALLBACK_LOG}`);
	});
