/* xGO API test harness: settings, endpoint selection, running calls through the local proxy, results, run history, async callbacks. */
(function () {
	"use strict";

	const STORAGE_KEY = "xgo-harness:v2";
	const LEGACY_STORAGE_KEY = "xgo-harness:v1";
	const KEY_KEY = "xgo-harness:key";
	const POLL_MS = 3000;
	const $ = (id) => document.getElementById(id);
	const sets = window.CATALOG.sets;
	const PARAMS = window.CATALOG.params;
	const endpoints = sets.flatMap((set) =>
		set.endpoints.map((endpoint) => ({ ...endpoint, set }))
	);
	const byId = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));

	// Requirements that are satisfied outside the endpoint row (Connection card, set header).
	const OUTSIDE_ROW = new Set(["phone", "consent"]);

	// How many places use each parameter; a value used in more than one place is shown as "shared".
	const usage = new Map();
	for (const set of sets) {
		for (const key of set.inputs || []) usage.set(key, (usage.get(key) || 0) + 1);
		for (const endpoint of set.endpoints)
			for (const key of endpoint.inputs || []) usage.set(key, (usage.get(key) || 0) + 1);
	}

	const state = {
		selected: new Set(),
		values: {},
		results: [],
		running: false,
		runs: [],
		viewing: null,
		live: null,
		runTag: null,
		callbacks: [],
		callbackSeq: 0,
		receiver: null,
		tunnel: null,
		tunnelBusy: false,
	};

	// Settings persistence ------------------------------------------------------------------

	function loadSettings() {
		try {
			let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
			if (!saved) {
				// Settings from the first version kept every parameter at the top level; carry them over.
				const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "null");
				if (legacy) {
					saved = {
						base: legacy.base,
						phone: legacy.phone,
						selected: legacy.selected,
						values: {},
					};
					for (const key of Object.keys(PARAMS))
						if (legacy[key] !== undefined) saved.values[key] = legacy[key];
				}
			}
			if (saved) {
				$("api-base").value = saved.base || "";
				$("phone").value = saved.phone || "";
				state.values =
					saved.values && typeof saved.values === "object" ? { ...saved.values } : {};
				if (Array.isArray(saved.selected))
					saved.selected.forEach((id) => state.selected.add(id));
			}
			const remembered = localStorage.getItem(KEY_KEY);
			if (remembered) {
				$("api-key").value = remembered;
				$("remember-key").checked = true;
			} else {
				$("api-key").value = sessionStorage.getItem(KEY_KEY) || "";
			}
		} catch {
			/* storage unavailable: run without persistence */
		}
		applyValues();
	}

	function saveSettings() {
		try {
			const saved = {
				base: $("api-base").value,
				phone: $("phone").value,
				selected: [...state.selected],
				values: state.values,
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
			localStorage.removeItem(LEGACY_STORAGE_KEY);
			const key = $("api-key").value;
			if ($("remember-key").checked) {
				localStorage.setItem(KEY_KEY, key);
				sessionStorage.removeItem(KEY_KEY);
			} else {
				localStorage.removeItem(KEY_KEY);
				sessionStorage.setItem(KEY_KEY, key);
			}
		} catch {
			/* ignore */
		}
	}

	// Parameter values ---------------------------------------------------------------------------

	function valueOf(key) {
		const spec = PARAMS[key];
		const value = state.values[key];
		if (spec.type === "checkbox")
			return value === undefined ? Boolean(spec.default) : Boolean(value);
		return value === undefined || value === null ? "" : String(value);
	}

	// Push every stored value into the inputs that show it.
	function applyValues() {
		document.querySelectorAll("[data-param]").forEach((element) => {
			const value = valueOf(element.dataset.param);
			if (element.type === "checkbox") element.checked = value;
			else element.value = value;
		});
	}

	// Store a value and mirror it into the other inputs for the same parameter.
	function setValue(key, value, source) {
		state.values[key] = value;
		document.querySelectorAll(`[data-param="${key}"]`).forEach((element) => {
			if (element === source) return;
			if (element.type === "checkbox") element.checked = Boolean(value);
			else element.value = value === undefined || value === null ? "" : value;
		});
		refreshRunnable();
		saveSettings();
	}

	// Context --------------------------------------------------------------------------------

	function normalizePhone(raw) {
		const digits = String(raw || "").replace(/[^\d]/g, "");
		return { plain: digits, e164: digits ? "+" + digits : "" };
	}

	function ctx() {
		const values = {};
		for (const key of Object.keys(PARAMS)) {
			const value = valueOf(key);
			values[key] = typeof value === "string" ? value.trim() : value;
		}
		const phone = normalizePhone($("phone").value);
		return {
			...values,
			base: $("api-base").value.trim().replace(/\/+$/, ""),
			key: $("api-key").value.trim(),
			phonePlain: phone.plain,
			phoneE164: phone.e164,
			period: Number(values.period) || 240,
			logsLimit: Number(values.logsLimit) || 10,
			pageSize: Number(values.pageSize) || 20,
			carrierIds: values.carrierIds
				.split(/[\s,;]+/)
				.map((part) => Number(part))
				.filter((part) => Number.isInteger(part) && part > 0),
		};
	}

	// Rendering endpoints ----------------------------------------------------------------------

	function fieldHtml(key, scope, required) {
		const spec = PARAMS[key];
		const id = `f-${scope}-${key}`;
		const title = spec.hint ? ` title="${escapeHtml(spec.hint)}"` : "";
		if (spec.type === "checkbox") {
			return `<label class="check pfield--check" for="${id}"${title}><input type="checkbox" id="${id}" data-param="${key}"> ${escapeHtml(spec.label)}${required ? '<span class="pfield__req">required</span>' : ""}</label>`;
		}
		const classes = "input input--sm" + (spec.mono ? " input--mono" : "");
		let control;
		if (spec.type === "select") {
			const options = spec.options
				.map(
					(option) =>
						`<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`
				)
				.join("");
			control = `<select class="${classes}" id="${id}" data-param="${key}"${title}>${options}</select>`;
		} else {
			const attrs = [
				`type="${spec.type}"`,
				`class="${classes}"`,
				`id="${id}"`,
				`data-param="${key}"`,
				'autocomplete="off"',
				'spellcheck="false"',
			];
			if (spec.placeholder) attrs.push(`placeholder="${escapeHtml(spec.placeholder)}"`);
			for (const name of ["min", "max", "step", "maxlength"])
				if (spec[name] !== undefined) attrs.push(`${name}="${spec[name]}"`);
			if (required) attrs.push('aria-required="true"');
			control = `<input ${attrs.join(" ")}${title}>`;
		}
		const marks =
			(required ? '<span class="pfield__req">required</span>' : "") +
			((usage.get(key) || 0) > 1
				? '<span class="pfield__shared" title="The same value is used by every endpoint that has this field">shared</span>'
				: "");
		return `<div class="pfield${spec.wide ? " pfield--wide" : ""}" data-field="${key}"><label class="pfield__label" for="${id}">${escapeHtml(spec.label)}${marks}</label>${control}</div>`;
	}

	function renderSets() {
		const container = $("sets");
		container.innerHTML = "";
		for (const set of sets) {
			const card = document.createElement("section");
			card.className = "card set";
			const setInputs = (set.inputs || [])
				.map((key) => fieldHtml(key, "set-" + set.id, true))
				.join("");
			card.innerHTML = `
				<div class="set__head">
					<h2 class="set__title">${set.title}</h2>
					<a class="btn btn--text" href="${set.doc}" target="_blank" rel="noopener">docs</a>
					<div class="set__actions">
						<button class="btn btn--line btn--sm" type="button" data-select-set="${set.id}">Select runnable</button>
						<button class="btn btn--line btn--sm" type="button" data-clear-set="${set.id}">Clear</button>
					</div>
					<p class="set__desc">${set.desc}</p>
					${setInputs ? `<div class="set__inputs">${setInputs}</div>` : ""}
				</div>`;
			for (const endpoint of set.endpoints) {
				const row = document.createElement("div");
				row.className = "endpoint";
				row.dataset.endpoint = endpoint.id;
				const fields = (endpoint.inputs || [])
					.map((key) => fieldHtml(key, endpoint.id, endpoint.needs.includes(key)))
					.join("");
				row.innerHTML = `
					<input type="checkbox" id="pick-${endpoint.id}" data-pick="${endpoint.id}">
					<div class="endpoint__main">
						<label class="endpoint__name" for="pick-${endpoint.id}"><span>${endpoint.name}</span>${endpoint.core ? '<span class="pill pill--ink">core</span>' : ""}</label>
						<code class="endpoint__path">${endpoint.path}</code>
						<p class="endpoint__desc">${endpoint.desc}</p>
						<p class="endpoint__needs" data-needs="${endpoint.id}"></p>
						${endpoint.optionalNote ? `<p class="endpoint__optional"><strong>Optional:</strong> ${escapeHtml(endpoint.optionalNote)}</p>` : ""}
						${fields ? `<div class="endpoint__fields">${fields}</div>` : ""}
					</div>
					<div class="endpoint__side"><span class="method method--${endpoint.method.toLowerCase()}">${endpoint.method}</span></div>`;
				card.appendChild(row);
			}
			container.appendChild(card);
		}
	}

	// The "Needs:" line: unmet requirements from outside the row, then the row's own description (or its unmet inputs).
	function needsLine(endpoint, gaps) {
		const parts = gaps.filter((gap) => OUTSIDE_ROW.has(gap.key)).map((gap) => gap.label);
		if (endpoint.needsNote) parts.push(endpoint.needsNote);
		else parts.push(...gaps.filter((gap) => !OUTSIDE_ROW.has(gap.key)).map((gap) => gap.label));
		return parts.length ? `<strong>Needs:</strong> ${escapeHtml(parts.join("; "))}` : "";
	}

	function refreshRunnable() {
		const context = ctx();
		for (const endpoint of endpoints) {
			const gaps = window.CATALOG.missing(endpoint, context);
			const gapKeys = new Set(gaps.map((gap) => gap.key));
			const row = document.querySelector(`[data-endpoint="${endpoint.id}"]`);
			const box = row.querySelector("[data-pick]");
			const needs = row.querySelector("[data-needs]");
			endpoint.gaps = gaps;
			row.classList.toggle("endpoint--off", gaps.length > 0);
			needs.innerHTML = needsLine(endpoint, gaps);
			needs.classList.toggle("endpoint__needs--missing", gaps.length > 0);
			row.querySelectorAll("[data-field]").forEach((field) =>
				field.classList.toggle("pfield--missing", gapKeys.has(field.dataset.field))
			);
			box.disabled = gaps.length > 0;
			if (gaps.length) state.selected.delete(endpoint.id);
			box.checked = state.selected.has(endpoint.id);
		}
		const phone = normalizePhone($("phone").value);
		$("phone-plain").textContent = phone.plain || "—";
		$("phone-e164").textContent = phone.e164 || "—";
		updateRunStatus();
	}

	function updateRunStatus() {
		if (!state.running) $("run-status").textContent = `${state.selected.size} selected`;
		$("run").disabled = state.running || state.selected.size === 0;
	}

	// Running ---------------------------------------------------------------------------------

	async function callProxy(payload) {
		const response = await fetch("/proxy", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		return response.json();
	}

	function buildRequest(endpoint, context) {
		const built = endpoint.build(context) || {};
		return {
			base: context.base,
			method: endpoint.method,
			path: built.path || endpoint.path,
			query: built.query || {},
			body: built.body,
		};
	}

	// A tag per run; callback URLs that point at the harness receiver get /cb/<tag>/<endpoint> appended.
	function newRunTag() {
		return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
	}

	function isHarnessUrl(value) {
		let url;
		try {
			url = new URL(value);
		} catch {
			return false;
		}
		if (/\.trycloudflare\.com$/i.test(url.hostname)) return true;
		const origins = [
			state.tunnel && state.tunnel.url,
			state.receiver && state.receiver.url,
		].filter(Boolean);
		return origins.some((origin) => value.startsWith(origin));
	}

	function contextForCall(endpoint, context) {
		if (
			!(endpoint.inputs || []).includes("callback") ||
			!context.callback ||
			!isHarnessUrl(context.callback)
		)
			return context;
		return {
			...context,
			callback: context.callback.replace(/\/+$/, "") + `/cb/${state.runTag}/${endpoint.id}`,
		};
	}

	async function run() {
		const context = ctx();
		const problems = [];
		if (!context.base) problems.push("API base URL");
		if (!context.key) problems.push("API key");
		if (problems.length) {
			showNotice(`Enter the ${problems.join(" and ")} first.`, true);
			return;
		}
		const picked = endpoints.filter((endpoint) => state.selected.has(endpoint.id));
		if (!picked.length) return;
		hideNotice();
		leaveSavedRun();
		state.results = [];
		state.runTag = newRunTag();
		$("results").innerHTML = "";
		state.running = true;
		$("run").disabled = true;
		const startedAt = new Date();
		$("results-meta").textContent =
			`Live run started ${formatStamp(startedAt)} for ${context.phoneE164 || "no number"}.`;
		let done = 0;
		for (const endpoint of picked) {
			$("run-status").textContent =
				`Running ${done + 1} of ${picked.length}: ${endpoint.name}…`;
			const request = buildRequest(endpoint, contextForCall(endpoint, context));
			const card = renderResult({ endpoint, request, pending: true });
			let response;
			try {
				response = await callProxy({ ...request, key: context.key });
			} catch (error) {
				response = {
					ok: false,
					error: "Could not reach the local proxy: " + error.message,
				};
			}
			const entry = { endpoint, request, response, at: new Date().toISOString(), card };
			state.results.push(entry);
			fillResult(card, entry);
			attachCallbacks(state.callbacks, entry);
			done += 1;
		}
		state.running = false;
		const finishedAt = new Date();
		$("run-status").textContent =
			`Ran ${picked.length} call${picked.length === 1 ? "" : "s"} in ${((finishedAt - startedAt) / 1000).toFixed(1)} s`;
		$("run").disabled = state.selected.size === 0;
		setExportEnabled(true);
		await saveRun({ startedAt, finishedAt, context });
	}

	// Run history ---------------------------------------------------------------------------------

	function serializeEntry(entry) {
		return {
			id: entry.endpoint.id,
			name: entry.endpoint.name,
			method: entry.request.method,
			path: entry.request.path,
			url: entry.response.url || entry.request.base + entry.request.path,
			requestBody: entry.request.body,
			query: entry.request.query,
			status: entry.response.status,
			statusText: entry.response.statusText,
			durationMs: entry.response.durationMs,
			responseHeaders: entry.response.headers,
			responseBody: entry.response.body,
			error: entry.response.error,
			at: entry.at,
		};
	}

	function entryFromSaved(saved) {
		const endpoint = byId.get(saved.id) || {
			id: saved.id,
			name: saved.name || saved.id,
			method: saved.method || "GET",
			path: saved.path || "",
			summarize: null,
		};
		return {
			endpoint,
			request: {
				base: "",
				method: saved.method,
				path: saved.path,
				query: saved.query,
				body: saved.requestBody,
			},
			response: {
				ok: saved.status >= 200 && saved.status < 300,
				status: saved.status,
				statusText: saved.statusText,
				url: saved.url,
				durationMs: saved.durationMs,
				headers: saved.responseHeaders,
				body: saved.responseBody,
				error: saved.error,
			},
			at: saved.at,
		};
	}

	async function saveRun({ startedAt, finishedAt, context }) {
		const payload = {
			startedAt: startedAt.toISOString(),
			finishedAt: finishedAt.toISOString(),
			base: context.base,
			phone: context.phoneE164,
			callbackTag: state.runTag,
			results: state.results.map(serializeEntry),
		};
		try {
			const response = await fetch("/runs", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			});
			const data = await response.json();
			if (!response.ok) throw new Error(data.error || response.statusText);
			state.live = { id: data.id, ...payload };
			state.runs.unshift(data.summary);
			renderHistory();
			renderCallbacks();
			history.replaceState(null, "", "#run=" + encodeURIComponent(data.id));
			$("results-meta").textContent =
				`Run ${data.id} saved: ${payload.phone || "no number"} · ${formatStamp(new Date(payload.startedAt))}.`;
		} catch (error) {
			showNotice(
				"The run finished but could not be saved to the log: " + error.message,
				true
			);
		}
	}

	async function loadRuns() {
		try {
			const response = await fetch("/runs");
			const data = await response.json();
			state.runs = data.runs || [];
			$("history-file").textContent = data.file ? "Log file: " + data.file : "";
		} catch {
			state.runs = [];
		}
		renderHistory();
	}

	function renderHistory() {
		const list = $("history");
		$("history-count").textContent = state.runs.length
			? `${state.runs.length} run${state.runs.length === 1 ? "" : "s"}`
			: "";
		if (!state.runs.length) {
			list.innerHTML = '<li class="history__empty">No runs saved yet.</li>';
			return;
		}
		const currentId = state.viewing ? state.viewing.id : state.live ? state.live.id : null;
		list.innerHTML = state.runs
			.map(
				(run) => `
			<li class="history__item${run.id === currentId ? " history__item--current" : ""}">
				<a class="history__link" href="#run=${encodeURIComponent(run.id)}" data-run="${run.id}">${escapeHtml(run.phone || "no number")} · ${formatStamp(new Date(run.startedAt))}</a>
				<span class="history__meta">${run.calls} call${run.calls === 1 ? "" : "s"} · ${run.ok} ok${run.failed ? ` · ${run.failed} failed` : ""}</span>
			</li>`
			)
			.join("");
	}

	async function openRun(id) {
		if (state.running) return;
		let run;
		try {
			const response = await fetch("/runs/" + encodeURIComponent(id));
			if (!response.ok) throw new Error((await response.json()).error || response.statusText);
			run = await response.json();
		} catch (error) {
			showNotice("Could not load that run: " + error.message, true);
			return;
		}
		hideNotice();
		state.viewing = run;
		state.results = (run.results || []).map(entryFromSaved);
		$("results").innerHTML = "";
		for (const entry of [...state.results].reverse()) {
			entry.card = renderResult({
				endpoint: entry.endpoint,
				request: entry.request,
				pending: false,
			});
			fillResult(entry.card, entry);
		}
		const banner = $("viewing");
		banner.hidden = false;
		banner.innerHTML = `Showing saved run <strong>${escapeHtml(run.phone || "no number")} · ${formatStamp(new Date(run.startedAt))}</strong> (${run.results.length} call${run.results.length === 1 ? "" : "s"}, base ${escapeHtml(run.base || "?")}). <button class="btn btn--text" type="button" id="back-live">Back to live results</button>`;
		$("back-live").addEventListener("click", () => {
			leaveSavedRun();
			state.results = [];
			$("results").innerHTML =
				'<p class="empty">Run something to see live results here, or pick a saved run from the history.</p>';
			$("results-meta").textContent = "Live results appear here as each call completes.";
			setExportEnabled(false);
			history.replaceState(null, "", location.pathname);
		});
		$("results-meta").textContent = `Saved run ${run.id}.`;
		setExportEnabled(true);
		renderHistory();
		history.replaceState(null, "", "#run=" + encodeURIComponent(run.id));
		await fetchCallbacksForTag(run.callbackTag);
		if (state.viewing === run) attachCallbacks(state.callbacks);
	}

	function leaveSavedRun() {
		state.viewing = null;
		$("viewing").hidden = true;
		$("viewing").innerHTML = "";
		renderHistory();
	}

	function formatStamp(date) {
		const pad = (n) => String(n).padStart(2, "0");
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
	}

	// Async callbacks ----------------------------------------------------------------------------

	function currentTag() {
		return state.viewing ? state.viewing.callbackTag : state.runTag;
	}

	// Identifiers in a response body that an untagged callback may echo back.
	function identifiers(body) {
		const found = [];
		const take = (object) => {
			if (!object || typeof object !== "object") return;
			for (const key of ["token", "messageId", "bulkId", "verificationId", "requestId"]) {
				if (typeof object[key] === "string" && object[key].length >= 6)
					found.push(object[key]);
			}
		};
		take(body);
		if (body && Array.isArray(body.results)) body.results.forEach(take);
		return found;
	}

	function callbackMatches(callback, entry) {
		if (callback.tag)
			return (
				Boolean(currentTag()) &&
				callback.tag === currentTag() &&
				callback.endpointId === entry.endpoint.id
			);
		const ids = identifiers(entry.response && entry.response.body);
		if (!ids.length) return false;
		const haystack =
			JSON.stringify(callback.body ?? "") + " " + JSON.stringify(callback.query || {});
		return ids.some((id) => haystack.includes(id));
	}

	function callbackPayload(callback) {
		if (callback.body !== null && callback.body !== undefined && callback.body !== "")
			return callback.body;
		return Object.keys(callback.query || {}).length
			? { query: callback.query }
			: "(empty body)";
	}

	function attachCallbacks(list, onlyEntry) {
		const entries = onlyEntry ? [onlyEntry] : state.results;
		for (const callback of list) {
			for (const entry of entries) {
				if (!entry.card || !entry.response || entry.response.pending) continue;
				if (entry.card.querySelector(`[data-callback="${callback.id}"]`)) continue;
				if (callbackMatches(callback, entry)) attachCallbackToCard(entry.card, callback);
			}
		}
	}

	function attachCallbackToCard(card, callback) {
		const section = document.createElement("div");
		section.className = "result__section result__section--callback";
		section.dataset.callback = callback.id;
		section.innerHTML = `
			<p class="label">Callback received ${escapeHtml(formatStamp(new Date(callback.receivedAt)))} · ${escapeHtml(callback.method)} ${escapeHtml(callback.path)}<button class="btn btn--text" type="button">copy</button></p>
			<pre class="code">${escapeHtml(pretty(callbackPayload(callback)))}</pre>`;
		const button = section.querySelector("button");
		button.addEventListener("click", (event) => {
			event.preventDefault();
			navigator.clipboard
				.writeText(pretty(callbackPayload(callback)))
				.then(() => flash(button, "copied"));
		});
		card.querySelector(".result__body").appendChild(section);
		const meta = card.querySelector(".result__meta");
		if (!meta.querySelector(".pill--callback"))
			meta.insertAdjacentHTML(
				"beforeend",
				'<span class="pill pill--ok pill--callback">callback</span>'
			);
	}

	function renderCallbacks() {
		const list = $("callbacks");
		const items = [...state.callbacks].reverse().slice(0, 50);
		$("callbacks-count").textContent = state.callbacks.length
			? `${state.callbacks.length} received`
			: "";
		$("callbacks-clear").hidden = !state.callbacks.length;
		if (!items.length) {
			list.innerHTML = '<li class="history__empty">Nothing received yet.</li>';
			return;
		}
		const open = new Set(
			[...list.querySelectorAll("details[open]")].map((details) => details.dataset.cb)
		);
		list.innerHTML = items
			.map((callback) => {
				const endpoint = callback.endpointId ? byId.get(callback.endpointId) : null;
				const run = callback.tag
					? state.runs.find((candidate) => candidate.callbackTag === callback.tag)
					: null;
				let match;
				if (endpoint) {
					const where = run
						? `<a class="btn btn--text" href="#run=${encodeURIComponent(run.id)}" data-run="${run.id}">open run</a>`
						: callback.tag === state.runTag
							? "current run"
							: "";
					match = `${escapeHtml(endpoint.name)}${where ? " · " + where : ""}`;
				} else {
					match = "no run tag in the path";
				}
				return `
			<li><details class="cb" data-cb="${callback.id}"${open.has(callback.id) ? " open" : ""}>
				<summary class="cb__summary">
					<span class="cb__time">${formatStamp(new Date(callback.receivedAt))}</span>
					<span class="cb__path">${escapeHtml(callback.method)} ${escapeHtml(callback.path)}</span>
					<span class="cb__match${endpoint ? "" : " cb__match--none"}">${match}</span>
				</summary>
				<pre class="code code--light">${escapeHtml(pretty(callbackPayload(callback)))}</pre>
			</details></li>`;
			})
			.join("");
	}

	function mergeCallbacks(list) {
		const fresh = (list || []).filter(
			(callback) => !state.callbacks.some((known) => known.id === callback.id)
		);
		if (fresh.length) {
			state.callbacks.push(...fresh);
			state.callbacks.sort((a, b) => (a.seq || 0) - (b.seq || 0));
		}
		return fresh;
	}

	async function loadCallbacks() {
		try {
			const response = await fetch("/callbacks?limit=50");
			const data = await response.json();
			mergeCallbacks(data.callbacks);
			state.callbackSeq = data.latest || 0;
			state.receiver = data.receiver || null;
			state.tunnel = data.tunnel || null;
			$("callbacks-file").textContent = data.file ? "Log file: " + data.file : "";
		} catch {
			/* server unreachable: the proxy pill already says so */
		}
		renderTunnel();
		renderCallbacks();
		attachCallbacks(state.callbacks);
	}

	async function pollCallbacks() {
		try {
			const response = await fetch(`/callbacks?after=${state.callbackSeq}`);
			const data = await response.json();
			state.receiver = data.receiver || state.receiver;
			state.tunnel = data.tunnel || state.tunnel;
			state.callbackSeq = Math.max(state.callbackSeq, data.latest || 0);
			renderTunnel();
			const fresh = mergeCallbacks(data.callbacks);
			if (fresh.length) {
				renderCallbacks();
				attachCallbacks(fresh);
			}
		} catch {
			/* try again on the next tick */
		}
	}

	async function fetchCallbacksForTag(tag) {
		if (!tag) return;
		try {
			const response = await fetch(`/callbacks?tag=${encodeURIComponent(tag)}`);
			const data = await response.json();
			if (mergeCallbacks(data.callbacks).length) renderCallbacks();
		} catch {
			/* ignore */
		}
	}

	const TUNNEL_LABELS = {
		stopped: "tunnel off",
		starting: "tunnel starting…",
		connecting: "tunnel connecting…",
		connected: "tunnel connected",
		error: "tunnel error",
	};

	function renderTunnel() {
		const tunnel = state.tunnel;
		const receiver = state.receiver;
		const pill = $("tunnel-status");
		if (receiver && receiver.url)
			$("receiver-url").textContent = receiver.url.replace(/^https?:\/\//, "");
		if (!tunnel) {
			pill.textContent = "server not reachable";
			pill.className = "pill pill--bad";
			return;
		}
		const receiverDown = receiver && !receiver.listening;
		pill.textContent = receiverDown
			? "receiver not listening"
			: TUNNEL_LABELS[tunnel.status] || tunnel.status;
		pill.className =
			"pill " +
			(receiverDown || tunnel.status === "error"
				? "pill--bad"
				: tunnel.status === "connected"
					? "pill--ok"
					: tunnel.running
						? "pill--warn"
						: "");
		$("tunnel-start").hidden = tunnel.running;
		$("tunnel-stop").hidden = !tunnel.running;
		$("tunnel-start").disabled = state.tunnelBusy;
		$("tunnel-stop").disabled = state.tunnelBusy;
		const messages = [];
		if (receiver && receiver.error) messages.push("Receiver: " + receiver.error + ".");
		if (tunnel.installed === false) {
			messages.push(
				`cloudflared was not found (looked for "${tunnel.command}"). Install it with "brew install cloudflared", or run "cloudflared tunnel --url ${tunnel.exposes}" yourself and paste the printed URL into a Callback URL field.`
			);
		}
		if (tunnel.status === "error" && tunnel.error) messages.push(tunnel.error);
		else if (tunnel.status === "connecting")
			messages.push(
				"Waiting for the tunnel to register; the URL can take a few seconds to become reachable."
			);
		else if (tunnel.status === "connected" && tunnel.version)
			messages.push(tunnel.version + ".");
		const note = $("tunnel-note");
		note.hidden = !messages.length;
		note.textContent = messages.join(" ");
		note.style.color =
			tunnel.status === "error" || (receiver && receiver.error) ? "var(--bad)" : "";
		$("tunnel-url-box").hidden = !tunnel.url;
		if (tunnel.url) $("tunnel-url").textContent = tunnel.url;
	}

	// After a tunnel starts, point empty or stale (previous tunnel) callback and return URLs at it.
	function adoptTunnelUrl(url) {
		if (!url) return;
		const stale = (value) => !value || /\.trycloudflare\.com(\/|$)/i.test(value);
		const changed = [];
		if (stale(valueOf("callback"))) {
			setValue("callback", url + "/callback");
			changed.push("Callback URL");
		}
		if (valueOf("returnUrl") && stale(valueOf("returnUrl"))) {
			setValue("returnUrl", url + "/return");
			changed.push("Return URL");
		}
		if (changed.length)
			showNotice(
				`${changed.join(" and ")} set to the tunnel at ${url}. The asynchronous endpoints are runnable now.`,
				false
			);
	}

	async function startTunnel() {
		state.tunnelBusy = true;
		$("tunnel-start").textContent = "Starting…";
		renderTunnel();
		try {
			const response = await fetch("/tunnel/start", { method: "POST" });
			state.tunnel = await response.json();
			adoptTunnelUrl(state.tunnel.url);
		} catch (error) {
			showNotice("Could not start the tunnel: " + error.message, true);
		}
		state.tunnelBusy = false;
		$("tunnel-start").textContent = "Start tunnel";
		renderTunnel();
	}

	async function stopTunnel() {
		state.tunnelBusy = true;
		renderTunnel();
		try {
			const response = await fetch("/tunnel/stop", { method: "POST" });
			state.tunnel = await response.json();
		} catch (error) {
			showNotice("Could not stop the tunnel: " + error.message, true);
		}
		state.tunnelBusy = false;
		renderTunnel();
	}

	// Results ------------------------------------------------------------------------------------

	function statusPill(response) {
		if (!response || response.pending) return '<span class="pill">running…</span>';
		if (response.error && !response.status) return `<span class="pill pill--bad">error</span>`;
		const status = response.status;
		const kind =
			status >= 200 && status < 300 ? "ok" : status >= 300 && status < 400 ? "warn" : "bad";
		return `<span class="pill pill--${kind}">${status} ${escapeHtml(response.statusText || "")}</span>`;
	}

	function summaryFor(entry) {
		const { endpoint, response } = entry;
		if (!response) return "";
		if (response.error && !response.status) return escapeHtml(response.error);
		const body = response.body;
		if (response.status >= 400) {
			const details = body && body.requestError && body.requestError.serviceException;
			if (details)
				return `<strong>${escapeHtml(details.messageId || "")}</strong> ${escapeHtml(details.text || "")}`.trim();
			if (body && (body.message || body.detail))
				return escapeHtml(String(body.message || body.detail));
			return typeof body === "string" ? escapeHtml(body.slice(0, 200)) : "";
		}
		try {
			return endpoint.summarize ? endpoint.summarize(body, response) || "" : "";
		} catch {
			return "";
		}
	}

	function curlFor(entry) {
		const { request, response } = entry;
		const url = (response && response.url) || request.base + request.path;
		const lines = [
			`curl -X ${request.method} '${url}'`,
			`  -H 'Authorization: App $INFOBIP_API_KEY'`,
			`  -H 'Accept: application/json'`,
		];
		if (request.body !== undefined && request.body !== null && request.method !== "GET") {
			lines.push(`  -H 'Content-Type: application/json'`);
			lines.push(`  -d '${JSON.stringify(request.body).replace(/'/g, "'\\''")}'`);
		}
		return lines.join(" \\\n");
	}

	function pretty(value) {
		if (value === undefined || value === null || value === "") return "(empty)";
		return typeof value === "string" ? value : JSON.stringify(value, null, 2);
	}

	function escapeHtml(text) {
		return String(text).replace(
			/[&<>"]/g,
			(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]
		);
	}

	function renderResult({ endpoint, request, pending }) {
		const list = $("results");
		const empty = list.querySelector(".empty");
		if (empty) empty.remove();
		const card = document.createElement("details");
		card.className = "result";
		card.open = true;
		card.innerHTML = `
			<summary class="result__head">
				<span class="method method--${endpoint.method.toLowerCase()}">${endpoint.method}</span>
				<span class="result__title">${escapeHtml(endpoint.name)}</span>
				<code class="result__path">${escapeHtml(request.path)}</code>
				<span class="result__meta">${statusPill({ pending })}</span>
				<p class="result__summary"></p>
			</summary>
			<div class="result__body"></div>`;
		list.prepend(card);
		return card;
	}

	function fillResult(card, entry) {
		const { request, response } = entry;
		const meta = card.querySelector(".result__meta");
		meta.innerHTML = `${statusPill(response)}${response.durationMs !== undefined ? `<span class="pill">${response.durationMs} ms</span>` : ""}`;
		card.querySelector(".result__summary").innerHTML = summaryFor(entry);
		const interesting = [
			"content-type",
			"x-request-id",
			"x-correlator",
			"location",
			"date",
			"server",
		];
		const headers = response.headers
			? Object.fromEntries(
					Object.entries(response.headers).filter(([key]) =>
						interesting.includes(key.toLowerCase())
					)
				)
			: {};
		const sections = [
			[
				"Request",
				pretty({
					method: request.method,
					url: response.url || request.base + request.path,
					body: request.body,
				}),
				"copy-request",
			],
			["Response headers", pretty(headers), null],
			[
				"Response body",
				response.error && !response.status ? response.error : pretty(response.body),
				"copy-body",
			],
		];
		card.querySelector(".result__body").innerHTML = sections
			.map(
				([title, text, action]) => `
				<div class="result__section">
					<p class="label">${title}${action ? `<button class="btn btn--text" type="button" data-copy="${action}">copy</button>` : ""}${title === "Request" ? '<button class="btn btn--text" type="button" data-copy="copy-curl">copy as cURL</button>' : ""}</p>
					<pre class="code${title === "Response body" ? "" : " code--light"}">${escapeHtml(text)}</pre>
				</div>`
			)
			.join("");
		card.querySelectorAll("[data-copy]").forEach((button) => {
			button.addEventListener("click", (event) => {
				event.preventDefault();
				const kind = button.dataset.copy;
				const text =
					kind === "copy-curl"
						? curlFor(entry)
						: kind === "copy-request"
							? pretty(request.body)
							: pretty(response.body);
				navigator.clipboard.writeText(text).then(() => flash(button, "copied"));
			});
		});
	}

	function flash(button, text) {
		const original = button.textContent;
		button.textContent = text;
		setTimeout(() => (button.textContent = original), 1200);
	}

	function showNotice(text, bad) {
		let notice = $("notice");
		if (!notice) {
			notice = document.createElement("p");
			notice.id = "notice";
			$("results").parentElement.insertBefore(notice, $("results"));
		}
		notice.className = "notice" + (bad ? " notice--bad" : "");
		notice.textContent = text;
	}

	function hideNotice() {
		const notice = $("notice");
		if (notice) notice.remove();
	}

	function setExportEnabled(enabled) {
		$("copy-summary").disabled =
			$("download").disabled =
			$("clear-results").disabled =
				!enabled;
	}

	// Export ----------------------------------------------------------------------------------

	function summaryMarkdown() {
		const rows = state.results.map((entry) => {
			const status = entry.response.status || "error";
			const summary = summaryFor(entry)
				.replace(/<[^>]+>/g, "")
				.replace(/\|/g, "\\|");
			return `| ${entry.request.method} ${entry.request.path} | ${status} | ${entry.response.durationMs ?? ""} | ${summary} |`;
		});
		return ["| Endpoint | Status | ms | Summary |", "|---|---|---|---|", ...rows].join("\n");
	}

	function download() {
		const source = state.viewing || state.live || {};
		const payload = {
			id: source.id,
			startedAt: source.startedAt,
			finishedAt: source.finishedAt,
			base: source.base || ctx().base,
			phone: source.phone || ctx().phoneE164,
			callbackTag: source.callbackTag || currentTag() || undefined,
			results: state.results.map(serializeEntry),
			callbacks: state.callbacks.filter((callback) =>
				state.results.some((entry) => callbackMatches(callback, entry))
			),
		};
		const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
		const link = document.createElement("a");
		link.href = URL.createObjectURL(blob);
		link.download = `xgo-harness-${(payload.startedAt || new Date().toISOString()).replace(/[:.]/g, "-")}.json`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(link.href), 1000);
	}

	// Proxy health --------------------------------------------------------------------------------

	async function checkProxy() {
		const pill = $("proxy-status");
		try {
			const response = await fetch("/health");
			const data = await response.json();
			if (!data.ok) throw new Error("unexpected reply");
			pill.textContent = data.allowAnyHost ? "proxy ready (any host)" : "proxy ready";
			pill.className = "pill pill--ok topbar__status";
			if (data.receiver) state.receiver = data.receiver;
		} catch {
			pill.textContent =
				"proxy not reachable: run `node server.mjs` and open http://127.0.0.1:8787";
			pill.className = "pill pill--bad topbar__status";
		}
	}

	// Wiring ------------------------------------------------------------------------------------

	const CONNECTION_INPUTS = new Set(["api-base", "api-key", "phone"]);

	function wire() {
		document.addEventListener("input", (event) => {
			const target = event.target;
			const param = target.dataset && target.dataset.param;
			if (param && target.type !== "checkbox" && target.tagName !== "SELECT") {
				setValue(param, target.value, target);
			} else if (CONNECTION_INPUTS.has(target.id)) {
				refreshRunnable();
				saveSettings();
			}
		});
		document.addEventListener("change", (event) => {
			const target = event.target;
			const param = target.dataset && target.dataset.param;
			if (param && (target.type === "checkbox" || target.tagName === "SELECT")) {
				setValue(param, target.type === "checkbox" ? target.checked : target.value, target);
				return;
			}
			const pick = target.dataset && target.dataset.pick;
			if (pick) {
				if (target.checked) state.selected.add(pick);
				else state.selected.delete(pick);
				updateRunStatus();
				saveSettings();
			}
			if (target.id === "remember-key") saveSettings();
		});
		document.addEventListener("click", (event) => {
			const target = event.target.closest("[data-select-set], [data-clear-set], [data-run]");
			if (!target) return;
			event.preventDefault();
			if (target.dataset.run) {
				openRun(target.dataset.run);
				return;
			}
			const setId = target.dataset.selectSet || target.dataset.clearSet;
			const set = sets.find((candidate) => candidate.id === setId);
			for (const endpoint of set.endpoints) {
				const full = byId.get(endpoint.id);
				if (target.dataset.selectSet && full.gaps.length === 0)
					state.selected.add(endpoint.id);
				if (target.dataset.clearSet) state.selected.delete(endpoint.id);
			}
			refreshRunnable();
			saveSettings();
		});
		$("toggle-key").addEventListener("click", () => {
			const input = $("api-key");
			input.type = input.type === "password" ? "text" : "password";
			$("toggle-key").textContent = input.type === "password" ? "Show" : "Hide";
		});
		$("select-core").addEventListener("click", () => {
			for (const endpoint of endpoints)
				if (endpoint.core && endpoint.gaps.length === 0) state.selected.add(endpoint.id);
			refreshRunnable();
			saveSettings();
		});
		$("select-ready").addEventListener("click", () => {
			for (const endpoint of endpoints)
				if (endpoint.gaps.length === 0) state.selected.add(endpoint.id);
			refreshRunnable();
			saveSettings();
		});
		$("select-none").addEventListener("click", () => {
			state.selected.clear();
			refreshRunnable();
			saveSettings();
		});
		$("run").addEventListener("click", run);
		$("copy-summary").addEventListener("click", () =>
			navigator.clipboard
				.writeText(summaryMarkdown())
				.then(() => flash($("copy-summary"), "Copied"))
		);
		$("download").addEventListener("click", download);
		$("clear-results").addEventListener("click", () => {
			leaveSavedRun();
			state.results = [];
			$("results").innerHTML =
				'<p class="empty">Results cleared. Saved runs stay in the log and the history list.</p>';
			setExportEnabled(false);
			history.replaceState(null, "", location.pathname);
		});
		$("clear-saved").addEventListener("click", () => {
			localStorage.removeItem(STORAGE_KEY);
			localStorage.removeItem(LEGACY_STORAGE_KEY);
			localStorage.removeItem(KEY_KEY);
			sessionStorage.removeItem(KEY_KEY);
			window.location.reload();
		});
		$("tunnel-start").addEventListener("click", startTunnel);
		$("tunnel-stop").addEventListener("click", stopTunnel);
		$("tunnel-copy").addEventListener("click", () => {
			if (state.tunnel && state.tunnel.url)
				navigator.clipboard
					.writeText(state.tunnel.url)
					.then(() => flash($("tunnel-copy"), "copied"));
		});
		$("use-callback").addEventListener("click", () => {
			if (!state.tunnel || !state.tunnel.url) return;
			setValue("callback", state.tunnel.url + "/callback");
			flash($("use-callback"), "Callback URL set");
		});
		$("use-return").addEventListener("click", () => {
			if (!state.tunnel || !state.tunnel.url) return;
			setValue("returnUrl", state.tunnel.url + "/return");
			flash($("use-return"), "Return URL set");
		});
		$("callbacks-clear").addEventListener("click", async () => {
			if (!window.confirm("Clear the callback log file? Saved runs are not affected."))
				return;
			try {
				await fetch("/callbacks", { method: "DELETE" });
				state.callbacks = [];
				renderCallbacks();
			} catch (error) {
				showNotice("Could not clear the callback log: " + error.message, true);
			}
		});
		window.addEventListener("hashchange", () => {
			const match = location.hash.match(/^#run=(.+)$/);
			if (match) openRun(decodeURIComponent(match[1]));
		});
	}

	renderSets();
	loadSettings();
	wire();
	refreshRunnable();
	checkProxy();
	loadRuns().then(async () => {
		await loadCallbacks();
		const match = location.hash.match(/^#run=(.+)$/);
		if (match) openRun(decodeURIComponent(match[1]));
		setInterval(pollCallbacks, POLL_MS);
	});
})();
