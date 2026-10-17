import type { APIRoute } from 'astro'
import { createHash } from 'node:crypto'
import { db, statsSalt } from '../../lib/db'
import { site } from '../../site'

export const prerender = false

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|curl|wget|python|node-fetch/i
const done = () => new Response(null, { status: 204 })

// Cookie-less: the visitor id is a hash that rotates daily, so nothing identifies a person across days.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ua = request.headers.get('user-agent') ?? ''
  if (!ua || BOT.test(ua)) return done()

  let body: { p?: unknown; r?: unknown }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return done()
  }
  const path = typeof body.p === 'string' ? body.p.slice(0, 300) : ''
  if (!path.startsWith('/') || path.startsWith('/api/') || path.startsWith('/admin')) return done()

  let referrer: string | null = null
  if (typeof body.r === 'string' && body.r) {
    try {
      const host = new URL(body.r).hostname.replace(/^www\./, '')
      if (host !== new URL(site.url).hostname.replace(/^www\./, '')) referrer = host
    } catch {}
  }

  let ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (!ip) {
    try {
      ip = clientAddress
    } catch {
      ip = ''
    }
  }

  const now = new Date()
  const day = now.toISOString().slice(0, 10)
  const visitor = createHash('sha256').update(`${day}|${ip}|${ua}|${statsSalt()}`).digest('hex').slice(0, 16)
  const country = request.headers.get('x-vercel-ip-country')

  try {
    const client = await db()
    await client.execute({
      sql: 'INSERT INTO hits (ts, day, path, referrer, country, visitor) VALUES (?, ?, ?, ?, ?, ?)',
      args: [now.getTime(), day, path, referrer, country, visitor],
    })
  } catch (e) {
    console.error('[hit]', e)
  }
  return done()
}
