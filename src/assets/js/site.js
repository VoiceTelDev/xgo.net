/*
 * xGO site behaviour: mobile menu, homepage lookup demo, and form submission.
 *
 * Forms post JSON to the endpoint in `data-endpoint` (set from src/_data/site.json). Until an
 * endpoint is configured they show a "not connected" message instead of pretending to send.
 */
(function () {
	"use strict";

	// Mobile menu
	const toggle = document.querySelector("[data-menu-toggle]");
	const menu = document.getElementById("mobile-menu");

	function setMenu(open) {
		menu.hidden = !open;
		toggle.setAttribute("aria-expanded", open ? "true" : "false");
		toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
	}

	if (toggle && menu) {
		toggle.addEventListener("click", function () {
			setMenu(toggle.getAttribute("aria-expanded") !== "true");
		});
		document.addEventListener("keydown", function (event) {
			if (event.key === "Escape" && !menu.hidden) {
				setMenu(false);
				toggle.focus();
			}
		});
		const wide = window.matchMedia("(min-width: 961px)");
		wide.addEventListener("change", function (event) {
			if (event.matches) setMenu(false);
		});
	}

	// Homepage lookup demo
	const demo = document.querySelector("[data-demo]");
	if (demo) {
		const products = {
			enrich: {
				name: "Phone Enrichment",
				on: [0, 1, 2, 3],
				note: "caller name, carrier, and routing intelligence in one lookup",
			},
			cnam: { name: "Caller Name Lookup", on: [0], note: "the available caller ID name" },
			carrier: {
				name: "Carrier Lookup",
				on: [1, 3],
				note: "carrier identifiers and routing context",
			},
			lrn: {
				name: "LRN Lookup",
				on: [2, 3],
				note: "the Location Routing Number and routing attributes",
			},
		};
		const tabs = demo.querySelectorAll("[data-tab]");
		const rows = demo.querySelectorAll("[data-field]");
		const nameEl = demo.querySelector("[data-product-name]");
		const noteEl = demo.querySelector("[data-product-note]");
		const countEl = demo.querySelector("[data-field-count]");

		function select(id) {
			const product = products[id];
			if (!product) return;
			tabs.forEach(function (tab) {
				tab.setAttribute(
					"aria-pressed",
					tab.getAttribute("data-tab") === id ? "true" : "false"
				);
			});
			rows.forEach(function (row) {
				const on = product.on.indexOf(Number(row.getAttribute("data-field"))) !== -1;
				row.classList.toggle("is-off", !on);
			});
			nameEl.textContent = product.name;
			noteEl.textContent = product.note;
			countEl.textContent =
				product.on.length + (product.on.length === 1 ? " field group" : " field groups");
		}

		tabs.forEach(function (tab) {
			tab.addEventListener("click", function () {
				select(tab.getAttribute("data-tab"));
			});
		});
	}

	// Forms
	document.querySelectorAll("form[data-form]").forEach(function (form) {
		const box = form.closest("[data-form-box]");
		const sent = box.querySelector("[data-sent-view]");
		const error = form.querySelector("[data-form-error]");
		const submit = form.querySelector('button[type="submit"]');
		const endpoint = form.getAttribute("data-endpoint");

		function showError(message) {
			error.textContent = message;
			error.hidden = false;
			error.focus();
		}

		form.addEventListener("submit", function (event) {
			event.preventDefault();
			error.hidden = true;
			if (!form.reportValidity()) return;
			if (!endpoint) {
				showError(
					"This form isn't connected to a mailbox yet. Please check back shortly or reach us through another channel."
				);
				return;
			}
			const payload = {};
			new FormData(form).forEach(function (value, key) {
				payload[key] = value;
			});
			payload.page = window.location.pathname;
			submit.disabled = true;
			fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json", Accept: "application/json" },
				body: JSON.stringify(payload),
			})
				.then(function (response) {
					if (!response.ok)
						throw new Error("Request failed with status " + response.status);
					form.hidden = true;
					sent.hidden = false;
					sent.querySelector("[tabindex]").focus();
				})
				.catch(function () {
					showError(
						"Something went wrong sending your message. Please try again in a moment."
					);
				})
				.finally(function () {
					submit.disabled = false;
				});
		});

		box.querySelectorAll("[data-action='reset']").forEach(function (button) {
			button.addEventListener("click", function () {
				form.reset();
				sent.hidden = true;
				form.hidden = false;
				const first = form.querySelector("input, select, textarea");
				if (first) first.focus();
			});
		});
	});
})();
