import { describe, expect, it } from 'vitest'
import { decodeBrowsePath, toBrowseHref, toEditHref } from './localBrowseUi'

describe('decodeBrowsePath', () => {
  it('removes the browse-route slash before Windows drive paths', () => {
    expect(decodeBrowsePath('/C:/Users/Nulled/video.mp4', 'win32')).toBe('C:/Users/Nulled/video.mp4')
    expect(decodeBrowsePath('/%43%3A/Users/Nulled/file.ps1', 'win32')).toBe('C:/Users/Nulled/file.ps1')
  })

  it('preserves Unix, UNC, and already normalized paths', () => {
    expect(decodeBrowsePath('/home/codex/file.txt', 'linux')).toBe('/home/codex/file.txt')
    expect(decodeBrowsePath('//server/share/file.txt', 'win32')).toBe('//server/share/file.txt')
    expect(decodeBrowsePath('C:/Users/Nulled/file.txt', 'win32')).toBe('C:/Users/Nulled/file.txt')
  })

  it('leaves malformed URL encoding usable for the normal validation path', () => {
    expect(decodeBrowsePath('/tmp/100%/file.txt', 'linux')).toBe('/tmp/100%/file.txt')
  })
})

describe('local browse route hrefs', () => {
  it('adds the route separator and converts Windows path separators', () => {
    const path = String.raw`C:\Users\Nulled\Documents\invasion\artifacts\autonomous-weaponry\mammoth-v1`
    expect(toBrowseHref(path)).toBe(
      '/codex-local-browse/C:/Users/Nulled/Documents/invasion/artifacts/autonomous-weaponry/mammoth-v1',
    )
    expect(toEditHref(String.raw`C:\Users\Nulled\file.ps1`)).toBe(
      '/codex-local-edit/C:/Users/Nulled/file.ps1',
    )
  })

  it('preserves Unix and UNC absolute paths', () => {
    expect(toBrowseHref('/home/codex/folder')).toBe('/codex-local-browse/home/codex/folder')
    expect(toBrowseHref(String.raw`\\server\share\folder`)).toBe('/codex-local-browse//server/share/folder')
  })

  it('keeps project picker query parameters encoded', () => {
    expect(toBrowseHref(String.raw`C:\Users\Nulled\Parent Folder`, 'My Project')).toBe(
      '/codex-local-browse/C:/Users/Nulled/Parent%20Folder?newProjectName=My%20Project',
    )
  })
})
