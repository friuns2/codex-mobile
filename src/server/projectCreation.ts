import { lstat, mkdir, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

const PROJECTLESS_THREAD_DIRECTORY_MAX_ATTEMPTS = 100
const PROJECTLESS_THREAD_SLUG_MAX_LENGTH = 80

function formatProjectlessDateSegment(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function buildProjectlessPromptSlug(prompt: string | null): string {
  const slug = prompt
    ?.toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.slice(0, 6)
    .join('-')
    .slice(0, PROJECTLESS_THREAD_SLUG_MAX_LENGTH)
  return slug && slug.length > 0 ? slug : 'new-chat'
}

async function ensureRealDirectory(path: string, label: string): Promise<void> {
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(`${label} must be a real directory`)
  }
}

export async function createProjectlessThreadDirectory(prompt: string | null): Promise<{ cwd: string; outputDirectory: string; workspaceRoot: string }> {
  const workspaceRoot = join(homedir(), 'Documents', 'Codex')
  await mkdir(workspaceRoot, { recursive: true })
  await ensureRealDirectory(workspaceRoot, 'Projectless workspace root')

  const dateDir = join(workspaceRoot, formatProjectlessDateSegment())
  await mkdir(dateDir, { recursive: true })
  await ensureRealDirectory(dateDir, 'Projectless thread date directory')

  const slug = buildProjectlessPromptSlug(prompt)
  for (let index = 0; index < PROJECTLESS_THREAD_DIRECTORY_MAX_ATTEMPTS; index += 1) {
    const folderName = index === 0 ? slug : `${slug}-${index + 1}`
    const cwd = join(dateDir, folderName)
    try {
      await mkdir(cwd, { recursive: false })
      return { cwd, outputDirectory: cwd, workspaceRoot }
    } catch {
      try {
        await stat(cwd)
      } catch {
        throw new Error('Failed to create new chat folder')
      }
    }
  }

  throw new Error('Unable to create a unique new chat folder')
}

function normalizeGithubCloneUrl(rawUrl: string): { url: string; repoName: string } {
  const trimmedUrl = rawUrl.trim()
  if (!trimmedUrl) throw new Error('Missing GitHub repository URL')

  const sshMatch = trimmedUrl.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/u)
  if (sshMatch) {
    const repoName = sshMatch[2]
    return { url: `git@github.com:${sshMatch[1]}/${repoName}.git`, repoName }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmedUrl)
  } catch {
    throw new Error('Enter a valid GitHub repository URL')
  }
  if (parsed.hostname.toLowerCase() !== 'github.com') {
    throw new Error('Only github.com repository URLs are supported')
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length < 2) {
    throw new Error('Enter a GitHub repository URL with owner and repository name')
  }
  const owner = segments[0]
  const repoName = segments[1].replace(/\.git$/iu, '')
  if (!/^[A-Za-z0-9_.-]+$/u.test(owner) || !/^[A-Za-z0-9_.-]+$/u.test(repoName)) {
    throw new Error('GitHub repository owner or name contains unsupported characters')
  }
  return { url: `https://github.com/${owner}/${repoName}.git`, repoName }
}

export async function cloneGithubRepositoryIntoBase(
  rawUrl: string,
  rawBasePath: string,
  deps: { runCommand: (command: string, args: string[], options?: { cwd?: string; timeoutMs?: number }) => Promise<void>; persistWorkspaceRoot: (workspaceRoot: string, label?: string) => Promise<void> },
): Promise<string> {
  const basePath = rawBasePath.trim()
  if (!basePath) throw new Error('Missing clone destination folder')
  const normalizedBasePath = isAbsolute(basePath) ? basePath : resolve(basePath)
  await ensureRealDirectory(normalizedBasePath, 'Clone destination folder')

  const { url, repoName } = normalizeGithubCloneUrl(rawUrl)
  const targetPath = join(normalizedBasePath, repoName)
  try {
    await stat(targetPath)
    throw new Error(`Destination already exists: ${targetPath}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error
  }

  try {
    await deps.runCommand('git', ['clone', url, targetPath], { cwd: normalizedBasePath, timeoutMs: 5 * 60_000 })
  } catch (error) {
    await rm(targetPath, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
  await deps.persistWorkspaceRoot(targetPath, '')
  return targetPath
}
