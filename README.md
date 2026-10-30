# xgo.net

Marketing site for xGO, built with [Eleventy](https://www.11ty.dev/) v3, Nunjucks templates, one hand-written stylesheet, and a small vanilla script. Deployed to GitHub Pages at https://xgo.net on every push to `main`.

## Develop

```bash
npm install
npm run serve    # http://localhost:8080
npm run build    # writes _site/
```

## Quality

```bash
npm run quality  # format, lint (JS + CSS), build, HTML validation, tests with 100% coverage
```

The deploy workflow runs the same gates before publishing, so a failing gate blocks a deploy.

## Layout

```
src/
  index.njk                  Homepage
  <section>/index.njk        One folder per page; the folder name is the URL (/products/, /pricing/, …)
  404.njk                    Not-found page (served by GitHub Pages)
  sitemap.njk, robots.njk    /sitemap.xml and /robots.txt
  _data/site.json            Brand, URL, navigation, footer columns, form endpoints
  _data/products.json        Product names, URLs, field codes, and taglines used across pages
  _data/build.js             Commit hash for cache-busting asset URLs, current year
  _includes/layouts/base.njk Document shell: metadata, Open Graph, icons, header, footer
  _includes/partials/        header, footer, logo, symbol, crumbs, cta-card, related, code-sample, macros
  assets/css/site.css        The single shared stylesheet (tokens, base, layout, components)
  assets/js/site.js          Mobile menu, homepage lookup demo, form submission
  assets/fonts/              Instrument Sans (variable) and Fragment Mono, Latin subsets, SIL OFL
  assets/img/                Logo SVGs, favicon, touch icon, social preview image
tests/                       Vitest build tests
tools/lint-html.mjs          html-validate over the built site
```

### Design system

Colours, type, spacing, and radii are CSS custom properties at the top of `site.css`; the values come from the xGO brand guide (Ink `#0e1014`, Signal `#ff5a1f`, Paper, Mist, Graphite, Slate, Smoke, Ash). Class names follow BEM (`block__element--modifier`). Reusable pieces include `.section` variants, `.split` (label column + body), `.pair` (two-column rows), `.grid` with `--min`/`--gap`, `.card`, `.panel` + `.trace` (the node-and-rail demo), `.dash-card` (anything in development), `.chip`, `.btn` variants, `.faq`, `.returns`, `.steps`, `.table-card` + `.data-table`, `.form` + `.input`, and `.cta-card`.

Status language is deliberate: GhostVerify is always "Coming soon" or "In development", responses and example data are labelled "Illustrative", and rates on `/pricing/` are `[RATE]` placeholders until real prices are approved.

## Forms

The contact form (`/contact/`) and the GhostVerify early-access form (`/products/ghostverify/#early-access`) are static HTML with client-side submission in `src/assets/js/site.js`. To connect them:

1. Set `forms.contact` and `forms.earlyAccess` in `src/_data/site.json` to absolute endpoint URLs.
2. The script sends `POST <endpoint>` with `Content-Type: application/json` and a body of the form fields keyed by their `name` attributes, plus `page` (the submitting path). Contact fields: `first_name`, `last_name`, `email`, `company`, `website`, `interest`, `volume`, `message`. Early-access fields: `name`, `email`, `company`, `country`, `product`, `volume`, `use_case`.
3. Any 2xx response shows the confirmation state; anything else shows an inline error. Until an endpoint is configured, submitting shows a "not connected yet" message rather than pretending to send.

Without JavaScript the forms post to their own page, so the endpoint should also accept `application/x-www-form-urlencoded` if a no-JS fallback is wanted.

## Staging mode

The Deploy workflow currently builds with `XGO_STAGING=1`. In that mode the coming-soon page stays at `/`, the real homepage is served at `/new/`, every page carries `noindex, nofollow`, `robots.txt` disallows crawling, and no sitemap is written. All interior pages are live at their final URLs (for example `/products/`), just unlinked from `/`, so anyone with a URL can open them. To preview staging locally:

```bash
XGO_STAGING=1 npm run build && npx serve _site   # or any static server
```

## Launch checklist

- [ ] Delete `XGO_STAGING=1` from the build step in `.github/workflows/deploy.yml` so the real homepage is served at `/`, pages become indexable, and the sitemap is published.

- [ ] Replace `[RATE]` placeholders on `/pricing/` with approved prices (or keep the page unlinked until then).
- [ ] Have counsel review `/terms/` and `/privacy/`, then remove the draft notice (`partials/legal-notice.njk` include) and the `noindex: true` front matter on both pages.
- [ ] Connect the two forms (see above).
- [ ] Confirm the social preview image (`assets/img/og-default.jpg`) and page descriptions.
- [ ] Merge to `main`; the Deploy workflow publishes to https://xgo.net.
