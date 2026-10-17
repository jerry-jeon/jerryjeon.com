import { getCollection, type CollectionEntry } from 'astro:content'

export type Post = CollectionEntry<'blog'>

export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('blog', (p) => import.meta.env.DEV || !p.data.draft)
  return posts.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
}

// Posts are written in whichever language; nothing is paired.
export function langOf(post: Post): 'ko' | 'en' {
  if (post.data.lang) return post.data.lang === 'en' ? 'en' : 'ko'
  if (post.id.endsWith('_en')) return 'en'
  if (post.id.endsWith('_kr')) return 'ko'
  return post.data.tags.some((t) => t.toLowerCase() === 'english') ? 'en' : 'ko'
}

export const tagSlug = (tag: string) => tag.toLowerCase().trim().replace(/\s+/g, '-')

export function tagCounts(posts: Post[]) {
  const counts = new Map<string, { tag: string; count: number }>()
  for (const p of posts)
    for (const tag of p.data.tags) {
      const slug = tagSlug(tag)
      const entry = counts.get(slug) ?? { tag, count: 0 }
      entry.count++
      counts.set(slug, entry)
    }
  return [...counts.entries()]
    .map(([slug, v]) => ({ slug, ...v }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug))
}

export function groupByYear(posts: Post[]) {
  const years = new Map<number, Post[]>()
  for (const p of posts) {
    const y = p.data.date.getUTCFullYear()
    years.set(y, [...(years.get(y) ?? []), p])
  }
  return [...years.entries()]
}

// The vault's summaries are often just the title; fall back to the first paragraph.
export function excerpt(post: Post, max = 120) {
  const { summary, title } = post.data
  if (summary && summary.trim() !== title.trim()) return summary
  const para = (post.body ?? '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .find((b) => b && !/^(#|```|>|-|\*|\d+\.|!\[|<|\||---)/.test(b))
  if (!para) return ''
  const text = para
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text
}

export const fmtDate = (d: Date, withYear = true) => {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return withYear ? `${y}.${m}.${day}` : `${m}.${day}`
}

// Links between posts, for the "Linked" list on a post page.
export function linkedPosts(post: Post, all: Post[]) {
  const linksTo = (from: Post, to: Post) => (from.body ?? '').includes(`(/blog/${to.id})`)
  return all.filter((p) => p.id !== post.id && (linksTo(post, p) || linksTo(p, post)))
}
