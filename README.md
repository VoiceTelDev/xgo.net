# xgo.net

Placeholder site for xgo.net, built with [Eleventy](https://www.11ty.dev/) v3 and Nunjucks templates (same stack as voicetel-website).

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

## Layout

- `src/index.njk`, `src/404.njk` — pages
- `src/_includes/layouts/base.njk` — shared HTML shell
- `src/_data/site.json` — site name, URL, description
- `src/assets/css/site.css` — styles (copied to `/assets/`)
