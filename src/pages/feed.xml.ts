import rss from '@astrojs/rss'
import type { APIContext } from 'astro'
import { site } from '../site'
import { excerpt, getPosts } from '../lib/posts'

export async function GET(context: APIContext) {
  const posts = await getPosts()
  return rss({
    title: site.title,
    description: '',
    site: context.site ?? site.url,
    items: posts.map((p) => ({
      title: p.data.title,
      pubDate: p.data.date,
      description: excerpt(p, 240),
      link: `/blog/${p.id}`,
      categories: p.data.tags,
    })),
  })
}
