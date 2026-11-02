# xGO API test harness

A local page for exercising the Infobip connectivity APIs behind xGO: Number Lookup, Number Activation State, Mobile Identity, and CAMARA. Enter your API base URL, API key, and a phone number, tick the endpoints or whole sets you want, and run them. Results show status, latency, a one-line summary, the exact request, and the full response, with copy-as-cURL and JSON export.

This is a developer tool for local use. It lives in the xgo.net repository under `tools/` but is not part of the site build: Eleventy only reads `src/`, so nothing here is published. The run and callback logs in `data/` hold API responses for real numbers and are git-ignored; the API key is only ever held in the browser and in the request to the local proxy.

## Run

```bash
node server.mjs
# open http://127.0.0.1:8787
```

Node 18 or newer, no dependencies. `PORT=9000 node server.mjs` changes the page port and `CALLBACK_PORT=9001` the callback receiver port. For asynchronous endpoints, install cloudflared once (`brew install cloudflared`); see "Async callbacks" below.

## How it works

- `server.mjs` serves `public/` and exposes `POST /proxy`, the run and callback logs, and the tunnel controls. The page sends each call to the proxy, which forwards it to your API base with the `Authorization: App <key>` header added. The browser never calls Infobip directly, so there are no CORS problems and the key is only in the request to the local proxy.
- The server listens on 127.0.0.1 only and forwards to `*.infobip.com` hosts only. Start it with `ALLOW_ANY_HOST=1` to forward elsewhere (for example a mock server).
- `public/catalog.js` holds the endpoint definitions, generated from the OpenAPI specs at `https://api.infobip.com/platform/1/openapi/<product>`, plus a registry of every input with its label, an example, and a description. An endpoint that needs more than the phone number shows a "Needs:" line describing the input with an example, and the fields to fill in, on its own row; the row stays greyed out until the required fields are filled. Optional inputs are listed under "Optional:" with their defaults.
- A value that several endpoints use (callback URL, SIM swap period, return URL) is marked "shared" and kept in sync: type it once and every row that uses it is filled.
- Settings persist in the browser's localStorage. The API key stays in sessionStorage unless "Remember key in this browser" is ticked. "Forget saved settings" clears everything.

## Async callbacks

Silent verification, number intelligence, and the asynchronous lookup deliver their results by posting to a public URL. The harness handles this with a [Cloudflare quick tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/):

- The server runs a second listener, the callback receiver, on `http://127.0.0.1:8788`. It accepts any request on any path, records it in `data/callbacks.jsonl`, and answers 200. Only this port is exposed by the tunnel; the harness page, the run log, the proxy, and your key are never reachable from outside.
- "Start tunnel" in the Async callbacks card runs `cloudflared tunnel --url http://127.0.0.1:8788` and shows the `https://<random>.trycloudflare.com` URL it prints. The Callback URL field is filled with `<tunnel>/callback` automatically when it is empty or still holds an older tunnel URL (quick tunnel hostnames change on every start). "Use as return URL" sets the Return URL for the verification flows to `<tunnel>/return`.
- When a call sends a tunnel URL, the harness appends `/cb/<run tag>/<endpoint id>` so the reply can be matched to the exact call. Matched callbacks appear inside the result card of that call, tagged "callback", and in the Received list of the card; opening a saved run from the history shows its callbacks too. Untagged callbacks are matched by the token, messageId, or bulkId they echo back.
- The page polls the server every 3 seconds, so a reply shows up within a few seconds of Infobip posting it. Quick tunnels have no uptime guarantee and allow 200 in-flight requests; they are for testing only. "Stop tunnel" ends the cloudflared process; stopping the server does too.
- Prefer running cloudflared yourself? `cloudflared tunnel --url http://127.0.0.1:8788`, then paste the printed URL into any Callback URL field. A trycloudflare.com URL still gets the per-call suffix.

## Notes on the endpoints

- Number formats follow each spec: digits only for Mobile Identity and Number Lookup, `+E.164` for CAMARA. The page shows both forms under the phone field.
- Mobile Identity calls always send `consentGranted: true`; untick the consent box in the Mobile Identity header to disable those endpoints.
- Asynchronous endpoints (silent verification, number intelligence, async lookup) need a callback URL. A webhook.site address works for testing; the harness shows the immediate acknowledgement and the final result arrives at the callback.
- CAMARA number verification must originate from the handset on mobile data. From this harness it will not verify; it is still useful for confirming authentication, routing, and error shapes.
- Number Activation State has no per-number lookup. Run "Network reports metadata" first, paste a `reportId` into the Report ID field on the "Network report content" row, then run that.
- Synchronous silent verification and the zero-rated flow are Brazil-only per the spec.
