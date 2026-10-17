# jerryjeon.com

Astro + Vercel. Minimal on purpose.

## Writing

Posts live in `data/blog/*.md(x)`. Write them in Obsidian (`publish: true` in frontmatter), then:

```bash
npm run publish:vault -- --all          # converts, writes data/blog, commits locally
```

Each post is in whatever language it was written in — there are no kr/en pairs.
The `_kr` / `_en` filename suffix (or `lang:` in frontmatter) only sets the KO/EN marker.

## Run

```bash
npm install
npm run dev        # http://localhost:4321
npm run build
```

## Stats

Cookie-less page-view counting, no third party.

- `POST /api/hit` (beacon from every page in production) stores path, referrer host, country and a
  daily-rotating visitor hash in a `hits` table.
- Storage: Turso via `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`; falls back to `.data/stats.db` locally.
- `npm run admin` opens `/admin` (dev server only — it 404s in production). Put the production Turso
  credentials in `.env` to see real numbers.

## Env

See `.env.example`. On Vercel set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `STATS_SALT` (Production only, so previews don't
count). giscus settings are public and live in `src/site.ts`.
