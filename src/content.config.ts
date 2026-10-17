import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

// data/blog is where scripts/publish-from-vault.mjs writes posts.
const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './data/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    summary: z.string().optional(),
    lang: z.enum(['ko', 'kr', 'en']).optional(),
  }),
})

export const collections = { blog }
