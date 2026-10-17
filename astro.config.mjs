import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import vercel from '@astrojs/vercel'
import { unified } from '@astrojs/markdown-remark'

// Posts start with `# Title` (from the vault); the layout already renders the title.
function remarkDropLeadingH1() {
  return (tree) => {
    const first = tree.children[0]
    if (first?.type === 'heading' && first.depth === 1) tree.children.shift()
  }
}

export default defineConfig({
  site: 'https://www.jerryjeon.com',
  adapter: vercel(),
  integrations: [mdx()],
  markdown: {
    processor: unified({ remarkPlugins: [remarkDropLeadingH1] }),
    shikiConfig: { theme: 'github-dark-dimmed' },
  },
  redirects: {
    '/blog': '/',
    '/tags': '/',
  },
})
