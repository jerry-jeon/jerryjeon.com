#!/usr/bin/env node
/**
 * publish-from-vault — convert an Obsidian note into a blog MDX post.
 *
 * Source of truth is the Obsidian vault (synced to this Mac). Only notes whose
 * frontmatter has `publish: true` are eligible. Wikilinks to OTHER published
 * notes become real blog links; links to unpublished notes degrade to plain
 * text (no broken links). Writes to data/blog/ and commits locally — it does
 * NOT push (your blog is public; review, then push yourself or pass --push).
 *
 * Self-contained: no npm deps, runs with plain `node`.
 *
 * Usage:
 *   node scripts/publish-from-vault.mjs --all [--push] [--dry-run]
 *   node scripts/publish-from-vault.mjs --note "Document Hub/디버깅의 기초.md" [--dry-run]
 *
 * Vault-note frontmatter it understands:
 *   publish: true        # required to be eligible
 *   slug: my-post        # optional nice URL slug (else derived from title)
 *   lang: en | kr        # optional filename suffix (default: kr)
 *   title:, date:, summary:, tags:   # optional overrides (else derived)
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const VAULT = process.env.VAULT_PATH || '/Users/jeongyeongju/Documents/Obsidian Vault'
const BLOG_REPO = path.resolve(import.meta.dirname, '..')
const BLOG_OUT = path.join(BLOG_REPO, 'data', 'blog')

const args = process.argv.slice(2)
const opt = (n) => args.includes(n)
const argVal = (n) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : undefined)
const DRY = opt('--dry-run')
const PUSH = opt('--push')

// ---- tiny YAML frontmatter parse/stringify (handles our simple frontmatter) ----
const stripQuotes = (s) => s.replace(/^['"]|['"]$/g, '')

function parseYaml(text) {
  const data = {}
  const lines = text.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue }
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!m) { i++; continue }
    const key = m[1]
    const val = m[2].trim()
    if (val === '') {
      const list = []
      let j = i + 1
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        list.push(stripQuotes(lines[j].replace(/^\s*-\s+/, '').trim()))
        j++
      }
      data[key] = list.length ? list : ''
      i = list.length ? j : i + 1
      continue
    }
    if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val.slice(1, -1).split(',').map((s) => stripQuotes(s.trim())).filter(Boolean)
    } else if (val === 'true' || val === 'false') {
      data[key] = val === 'true'
    } else {
      data[key] = stripQuotes(val)
    }
    i++
  }
  return data
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!m) return { data: {}, content: raw }
  return { data: parseYaml(m[1]), content: raw.slice(m[0].length) }
}

const yamlScalar = (s) => `'${String(s).replace(/'/g, "''")}'`

function stringifyMdx(front, body) {
  let out = '---\n'
  out += `title: ${yamlScalar(front.title)}\n`
  out += `date: '${front.date}'\n`
  if (front.tags?.length) out += 'tags:\n' + front.tags.map((t) => `  - ${yamlScalar(t)}`).join('\n') + '\n'
  else out += 'tags: []\n'
  out += `draft: ${front.draft ? 'true' : 'false'}\n`
  if (front.summary) out += `summary: ${yamlScalar(front.summary)}\n`
  out += '---\n\n' + body.replace(/^\n+/, '')
  return out
}

const slugify = (s) =>
  String(s).toLowerCase().trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

// ---- vault helpers ----
function listNotes(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...listNotes(full))
    else if (e.name.endsWith('.md')) out.push(full)
  }
  return out
}

const titleOf = (file) => path.basename(file, '.md')
const isPublished = (fm) => fm?.publish === true
const langOf = (fm) => (fm?.lang === 'en' ? 'en' : 'kr')
const slugFor = (fm, file) => (fm?.slug ? String(fm.slug) : slugify(fm?.title || titleOf(file)))

function summaryFor(fm, body) {
  if (fm?.summary) return String(fm.summary)
  const p = body.trim().split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').trim() || ''
  return p.length > 180 ? p.slice(0, 177) + '…' : p
}

const dateFor = (fm) => new Date(fm?.date || fm?.created || Date.now()).toISOString().slice(0, 10)

function buildPublishedIndex(notes) {
  const index = new Map()
  for (const file of notes) {
    const { data } = parseFrontmatter(fs.readFileSync(file, 'utf8'))
    if (!isPublished(data)) continue
    const entry = { slug: slugFor(data, file), lang: langOf(data) }
    index.set(titleOf(file), entry)
    if (data.title) index.set(String(data.title), entry)
  }
  return index
}

function convertWikilinks(body, publishedIndex) {
  return body.replace(/\[\[([^\]]+)\]\]/g, (_m, inner) => {
    const [targetPart, alias] = inner.split('|')
    const target = targetPart.split('#')[0].trim()
    const text = (alias || targetPart).trim()
    const hit = publishedIndex.get(target)
    return hit ? `[${text}](/blog/${hit.slug}_${hit.lang})` : text
  })
}

// `## 관련` sections are vault-only notes-to-self; drop them up to the next h1/h2.
function stripVaultOnlySections(body) {
  return body.replace(/^##\s+관련\s*\n[\s\S]*?(?=^#{1,2}\s|(?![\s\S]))/gm, '').trimEnd() + '\n'
}

function toMdx(fm, rawBody, publishedIndex, file) {
  const body = stripVaultOnlySections(rawBody)
  const front = {
    title: fm?.title || titleOf(file),
    date: dateFor(fm),
    tags: Array.isArray(fm?.tags) ? fm.tags : [],
    draft: false,
    summary: summaryFor(fm, body),
  }
  return stringifyMdx(front, convertWikilinks(body, publishedIndex))
}

const git = (...a) => execFileSync('git', a, { cwd: BLOG_REPO, encoding: 'utf8' })

function main() {
  const allNotes = listNotes(VAULT)
  const publishedIndex = buildPublishedIndex(allNotes)

  const noteArg = argVal('--note')
  let targets
  if (noteArg) {
    targets = [path.isAbsolute(noteArg) ? noteArg : path.join(VAULT, noteArg)]
  } else if (opt('--all')) {
    targets = allNotes.filter((f) => isPublished(parseFrontmatter(fs.readFileSync(f, 'utf8')).data))
  } else {
    console.error('Pass --all or --note "<path in vault>". Add --dry-run to preview.')
    process.exit(1)
  }

  if (targets.length === 0) { console.log('No notes with `publish: true` found.'); return }

  const written = []
  for (const file of targets) {
    const { data, content } = parseFrontmatter(fs.readFileSync(file, 'utf8'))
    if (noteArg && !isPublished(data)) {
      console.warn(`⚠️  "${titleOf(file)}" is not marked publish: true — converting anyway (--note).`)
    }
    const outName = `${slugFor(data, file)}_${langOf(data)}.mdx`
    const outPath = path.join(BLOG_OUT, outName)
    const mdx = toMdx(data, content, publishedIndex, file)
    if (DRY) {
      console.log(`\n=== ${titleOf(file)}  →  data/blog/${outName} ===\n`)
      console.log(mdx)
      continue
    }
    // Safety: never silently clobber an already-published post (it may be more
    // polished than the vault note). Require --force to overwrite.
    if (fs.existsSync(outPath) && !opt('--force')) {
      console.warn(`• skip data/blog/${outName} — already exists (use --force to overwrite)`)
      continue
    }
    fs.writeFileSync(outPath, mdx)
    written.push(`data/blog/${outName}`)
    console.log(`✓ wrote data/blog/${outName}  (from "${titleOf(file)}")`)
  }

  if (DRY || written.length === 0) return
  git('add', ...written)
  git('commit', '-m', `publish: ${written.map((w) => path.basename(w)).join(', ')}`)
  console.log(`\n✓ committed ${written.length} post(s).`)
  if (PUSH) { git('push'); console.log('✓ pushed — Vercel will deploy.') }
  else console.log('Not pushed. Review, then `git push` (or re-run with --push).')
}

main()
