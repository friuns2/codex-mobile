import { extname } from 'node:path'

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

export function getLocalImageContentType(imagePath: string): string | null {
  return IMAGE_CONTENT_TYPES[extname(imagePath).toLowerCase()] ?? null
}

export function isSupportedLocalImagePath(imagePath: string): boolean {
  return getLocalImageContentType(imagePath) !== null
}
