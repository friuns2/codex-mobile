import { mkdir, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  pruneManagedTempMedia,
  storeManagedTempMediaDataUrl,
  storeManagedTempMediaFile,
} from './tempMediaStore'

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const pngDataUrl = `data:image/png;base64,${pngBase64}`

describe('managed temp media store', () => {
  it('stores uploaded files under the managed root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codexui-temp-media-'))
    try {
      const path = await storeManagedTempMediaFile('screenshot.png', Buffer.from('hello'), { root })
      expect(path.startsWith(root)).toBe(true)
      await expect(stat(path)).resolves.toMatchObject({ size: 5 })
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps uploaded file writes isolated per upload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codexui-temp-media-'))
    try {
      const firstPath = await storeManagedTempMediaFile('screenshot.png', Buffer.from('hello'), { root })
      const secondPath = await storeManagedTempMediaFile('screenshot.png', Buffer.from('hello'), { root })

      expect(firstPath).not.toBe(secondPath)
      expect(firstPath.startsWith(join(root, 'asset-'))).toBe(true)
      expect(secondPath.startsWith(join(root, 'asset-'))).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('prunes managed media older than 30 days', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codexui-temp-media-'))
    try {
      const now = Date.now()
      const staleDir = join(root, 'stale-entry')
      const freshDir = join(root, 'fresh-entry')
      await mkdir(staleDir, { recursive: true })
      await mkdir(freshDir, { recursive: true })
      await writeFile(join(staleDir, 'stale.txt'), 'old')
      await writeFile(join(freshDir, 'fresh.txt'), 'new')

      const staleTime = new Date(now - (31 * 24 * 60 * 60 * 1000))
      const freshTime = new Date(now - (24 * 60 * 60 * 1000))
      await utimes(staleDir, staleTime, staleTime)
      await utimes(freshDir, freshTime, freshTime)

      await pruneManagedTempMedia(root, now)

      await expect(stat(staleDir)).rejects.toMatchObject({ code: 'ENOENT' })
      await expect(stat(freshDir)).resolves.toBeTruthy()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('stores inline image data under a deterministic managed path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codexui-temp-media-'))
    try {
      const path = await storeManagedTempMediaDataUrl(pngDataUrl, 'inline-image', { root })
      expect(path).toMatch(new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/inline/[0-9a-f]{2}/inline-image-[0-9a-f]{40}\\.png$`))
      await expect(stat(path ?? '')).resolves.toBeTruthy()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('reuses deterministic inline image paths for repeated content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'codexui-temp-media-'))
    try {
      const firstPath = await storeManagedTempMediaDataUrl(pngDataUrl, 'inline-image', { root })
      const secondPath = await storeManagedTempMediaDataUrl(pngDataUrl, 'inline-image', { root })

      expect(firstPath).toBe(secondPath)
      await expect(readdir(root)).resolves.toEqual(['inline'])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
