import { dirname, extname, join } from 'node:path'
import { open, readFile, readdir, stat } from 'node:fs/promises'

type DirectoryItem = {
  name: string
  path: string
  isDirectory: boolean
  editable: boolean
  mtimeMs: number
}

export type LocalDirectoryListingEntry = {
  name: string
  path: string
}

export type LocalDirectoryListing = {
  path: string
  parentPath: string
  entries: LocalDirectoryListingEntry[]
}

type LocalDirectoryListingOptions = {
  showHidden?: boolean
}

const TEXT_EDITABLE_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.css', '.scss',
  '.html', '.htm', '.xml', '.yml', '.yaml', '.log', '.csv', '.env', '.py',
  '.sh', '.toml', '.ini', '.conf', '.sql', '.bat', '.cmd', '.ps1',
])

function languageForPath(pathValue: string): string {
  const extension = extname(pathValue).toLowerCase()
  switch (extension) {
    case '.js': return 'javascript'
    case '.ts': return 'typescript'
    case '.jsx': return 'javascript'
    case '.tsx': return 'typescript'
    case '.py': return 'python'
    case '.sh': return 'sh'
    case '.css':
    case '.scss': return 'css'
    case '.html':
    case '.htm': return 'html'
    case '.json': return 'json'
    case '.md': return 'markdown'
    case '.yaml':
    case '.yml': return 'yaml'
    case '.xml': return 'xml'
    case '.sql': return 'sql'
    case '.toml': return 'ini'
    case '.ini':
    case '.conf': return 'ini'
    default: return 'plaintext'
  }
}

export function normalizeLocalPath(rawPath: string): string {
  const trimmed = rawPath.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('file://')) {
    try {
      return decodeURIComponent(trimmed.replace(/^file:\/\//u, ''))
    } catch {
      return trimmed.replace(/^file:\/\//u, '')
    }
  }
  return trimmed
}

export function decodeBrowsePath(rawPath: string, platform: NodeJS.Platform = process.platform): string {
  if (!rawPath) return ''
  let decoded: string
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    decoded = rawPath
  }

  // Browse URLs keep an absolute-path slash after the route prefix. On Windows,
  // that turns `C:/path` into `/C:/path`, which Node resolves as `C:\C:\path`.
  // Remove only that synthetic slash; Unix and UNC absolute paths stay intact.
  if (platform === 'win32' && /^\/[A-Za-z]:[\\/]/u.test(decoded)) {
    return decoded.slice(1)
  }

  return decoded
}

export function isTextEditablePath(pathValue: string): boolean {
  return TEXT_EDITABLE_EXTENSIONS.has(extname(pathValue).toLowerCase())
}

function isHiddenName(value: string): boolean {
  return value.startsWith('.')
}

function looksLikeTextBuffer(buffer: Buffer): boolean {
  if (buffer.length === 0) return true
  for (const byte of buffer) {
    if (byte === 0) return false
  }
  const decoded = buffer.toString('utf8')
  const replacementCount = (decoded.match(/\uFFFD/gu) ?? []).length
  return replacementCount / decoded.length < 0.05
}

async function probeFileIsText(localPath: string): Promise<boolean> {
  const handle = await open(localPath, 'r')
  try {
    const sample = Buffer.allocUnsafe(4096)
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0)
    return looksLikeTextBuffer(sample.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

export async function isTextEditableFile(localPath: string): Promise<boolean> {
  if (isTextEditablePath(localPath)) return true
  try {
    const fileStat = await stat(localPath)
    if (!fileStat.isFile()) return false
    return await probeFileIsText(localPath)
  } catch {
    return false
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;')
}

function normalizeNewProjectName(value: string): string {
  return value.trim().replace(/[\\/]+/gu, '').trim()
}

function normalizeLocalRoutePath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/gu, '/')
  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

export function toBrowseHref(pathValue: string, newProjectName = ''): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  const query = normalizedName ? `?newProjectName=${encodeURIComponent(normalizedName)}` : ''
  return `/codex-local-browse${encodeURI(normalizeLocalRoutePath(pathValue))}${query}`
}

export function toEditHref(pathValue: string, newProjectName = ''): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  const query = normalizedName ? `?newProjectName=${encodeURIComponent(normalizedName)}` : ''
  return `/codex-local-edit${encodeURI(normalizeLocalRoutePath(pathValue))}${query}`
}

function escapeForInlineScriptString(value: string): string {
  // Prevent breaking out of inline <script> blocks when file content contains HTML/script tokens.
  return JSON.stringify(value)
    .replace(/<\//gu, '<\\/')
    .replace(/<!--/gu, '<\\!--')
    .replace(/\u2028/gu, '\\u2028')
    .replace(/\u2029/gu, '\\u2029')
}

async function getDirectoryItems(localPath: string): Promise<DirectoryItem[]> {
  const entries = await readdir(localPath, { withFileTypes: true })
  const withMeta = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(localPath, entry.name)
    const entryStat = await stat(entryPath)
    const editable = !entry.isDirectory() && await isTextEditableFile(entryPath)
    return {
      name: entry.name,
      path: entryPath,
      isDirectory: entry.isDirectory(),
      editable,
      mtimeMs: entryStat.mtimeMs,
    }
  }))
  return withMeta.sort((a, b) => {
    if (b.mtimeMs !== a.mtimeMs) return b.mtimeMs - a.mtimeMs
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })
}

function projectCreationTargetPath(parentPath: string, newProjectName: string): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  if (!normalizedName) return ''
  return join(parentPath, normalizedName)
}

function projectCreationButtonLabel(newProjectName: string): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  return normalizedName ? `Create ${normalizedName} here` : ''
}

function projectCreationStatusText(newProjectName: string): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  return normalizedName ? `Creating ${normalizedName} in Codex...` : 'Creating project in Codex...'
}

function openFolderStatusText(newProjectName: string): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  return normalizedName
    ? `Opening folder in Codex without creating ${normalizedName}...`
    : 'Opening folder in Codex...'
}

function failureStatusText(newProjectName: string): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  return normalizedName
    ? `Failed to open folder or create ${normalizedName}.`
    : 'Failed to open folder.'
}

function actionButtonsHtml(localPath: string, newProjectName: string): string {
  const normalizedName = normalizeNewProjectName(newProjectName)
  const createTargetPath = projectCreationTargetPath(localPath, normalizedName)
  const createButton = createTargetPath
    ? `<button class="header-open-btn create-project-btn" type="button" aria-label="${escapeHtml(projectCreationButtonLabel(normalizedName))}" title="${escapeHtml(projectCreationButtonLabel(normalizedName))}" data-path="${escapeHtml(createTargetPath)}" data-label="${escapeHtml(normalizedName)}" data-status="${escapeHtml(projectCreationStatusText(normalizedName))}" data-error="${escapeHtml(failureStatusText(normalizedName))}">${escapeHtml(projectCreationButtonLabel(normalizedName))}</button>`
    : ''
  const openButton = `<button class="header-open-btn open-folder-btn" type="button" aria-label="Open current folder in Codex" title="Open folder in Codex" data-path="${escapeHtml(localPath)}" data-label="" data-status="${escapeHtml(openFolderStatusText(normalizedName))}" data-error="${escapeHtml(failureStatusText(normalizedName))}">Open folder in Codex</button>`
  return `${createButton}${openButton}`
}

export async function getLocalDirectoryListing(
  localPath: string,
  options: LocalDirectoryListingOptions = {},
): Promise<LocalDirectoryListing> {
  const entries = await readdir(localPath, { withFileTypes: true })
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: join(localPath, entry.name),
    }))
    .filter((entry) => options.showHidden === true || !isHiddenName(entry.name))
    .sort((a, b) => {
      const aHidden = isHiddenName(a.name)
      const bHidden = isHiddenName(b.name)
      if (aHidden !== bHidden) return aHidden ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    })

  return {
    path: localPath,
    parentPath: dirname(localPath),
    entries: directories,
  }
}

export async function createDirectoryListingHtml(localPath: string, options?: { newProjectName?: string }): Promise<string> {
  const newProjectName = normalizeNewProjectName(options?.newProjectName ?? '')
  const items = await getDirectoryItems(localPath)
  const parentPath = dirname(localPath)
  const rows = items
    .map((item) => {
      const suffix = item.isDirectory ? '/' : ''
      const editAction = item.editable
        ? ` <a class="icon-btn" aria-label="Edit ${escapeHtml(item.name)}" href="${escapeHtml(toEditHref(item.path, newProjectName))}" title="Edit">✏️</a>`
        : ''
      return `<li class="file-row"><a class="file-link" href="${escapeHtml(toBrowseHref(item.path, newProjectName))}">${escapeHtml(item.name)}${suffix}</a><span class="row-actions">${editAction}</span></li>`
    })
    .join('\n')

  const parentLink = localPath !== parentPath
    ? `<a class="header-parent-link" href="${escapeHtml(toBrowseHref(parentPath, newProjectName))}">..</a>`
    : ''
  const pickerSummary = newProjectName
    ? `<p class="picker-summary">Browse to the parent folder where you want to create <strong>${escapeHtml(newProjectName)}</strong>, or open the current folder directly.</p>`
    : ''
  const actionButtons = actionButtonsHtml(localPath, newProjectName)

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Index of ${escapeHtml(localPath)}</title>
  <style>
    body { font-family: ui-monospace, Menlo, Monaco, monospace; margin: 16px; background: #0b1020; color: #dbe6ff; }
    a { color: #8cc2ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    ul { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 8px; }
    .file-row { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 10px; }
    .file-link { display: block; padding: 10px 12px; border: 1px solid #28405f; border-radius: 10px; background: #0f1b33; overflow-wrap: anywhere; }
    .header-actions { display: flex; align-items: center; gap: 10px; margin-top: 10px; flex-wrap: wrap; }
    .header-parent-link { color: #9ec8ff; font-size: 14px; padding: 8px 10px; border: 1px solid #2a4569; border-radius: 10px; background: #101f3a; }
    .header-parent-link:hover { text-decoration: none; filter: brightness(1.08); }
    .header-open-btn {
      height: 42px;
      padding: 0 14px;
      border: 1px solid #4f8de0;
      border-radius: 10px;
      background: linear-gradient(135deg, #2e6ee6 0%, #3d8cff 100%);
      color: #eef6ff;
      font-weight: 700;
      letter-spacing: 0.01em;
      cursor: pointer;
      box-shadow: 0 6px 18px rgba(33, 90, 199, 0.35);
    }
    .header-open-btn:hover { filter: brightness(1.08); }
    .header-open-btn:disabled { opacity: 0.6; cursor: default; }
    .picker-summary { margin: 10px 0 0; color: #b8d5ff; max-width: 60rem; line-height: 1.45; }
    .row-actions { display: inline-flex; align-items: center; gap: 8px; min-width: 42px; justify-content: flex-end; }
    .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 42px; height: 42px; border: 1px solid #36557a; border-radius: 10px; background: #162643; color: #dbe6ff; text-decoration: none; cursor: pointer; }
    .icon-btn:hover { filter: brightness(1.08); text-decoration: none; }
    .status { margin: 10px 0 0; color: #8cc2ff; min-height: 1.25em; }
    h1 { font-size: 18px; margin: 0; word-break: break-all; }
    @media (max-width: 640px) {
      body { margin: 12px; }
      .file-row { gap: 8px; }
      .file-link { font-size: 15px; padding: 12px; }
      .icon-btn { width: 44px; height: 44px; }
    }
  </style>
</head>
<body>
  <h1>Index of ${escapeHtml(localPath)}</h1>
  ${pickerSummary}
  <div class="header-actions">
    ${parentLink}
    ${actionButtons}
  </div>
  <p id="status" class="status"></p>
  <ul>${rows}</ul>
  <script>
    const status = document.getElementById('status');
    document.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest('.open-folder-btn, .create-project-btn');
      if (!(button instanceof HTMLButtonElement)) return;

      const path = button.getAttribute('data-path') || '';
      const label = button.getAttribute('data-label') || '';
      const statusText = button.getAttribute('data-status') || 'Opening folder in Codex...';
      const errorText = button.getAttribute('data-error') || 'Failed to open folder.';
      if (!path) return;
      button.disabled = true;
      status.textContent = statusText;
      try {
        const response = await fetch('/codex-api/project-root', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path,
            createIfMissing: button.classList.contains('create-project-btn'),
            label,
          }),
        });
        if (!response.ok) {
          status.textContent = errorText;
          button.disabled = false;
          return;
        }
        status.textContent = 'Folder opened. Returning to Codex...';
        const nextUrl = '/?openProjectPath=' + encodeURIComponent(path) + '#/';
        window.location.assign(nextUrl);
      } catch {
        status.textContent = errorText;
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`
}

export async function createTextEditorHtml(localPath: string): Promise<string> {
  const content = await readFile(localPath, 'utf8')
  const parentPath = dirname(localPath)
  const language = languageForPath(localPath)
  const safeContentLiteral = escapeForInlineScriptString(content)
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Edit ${escapeHtml(localPath)}</title>
  <style>
    html, body { width: 100%; height: 100%; margin: 0; }
    body { font-family: ui-monospace, Menlo, Monaco, monospace; background: #0b1020; color: #dbe6ff; display: flex; flex-direction: column; overflow: hidden; }
    .toolbar { position: sticky; top: 0; z-index: 10; display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; background: #0b1020; border-bottom: 1px solid #243a5a; }
    .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    button, a { background: #1b2a4a; color: #dbe6ff; border: 1px solid #345; padding: 6px 10px; border-radius: 6px; text-decoration: none; cursor: pointer; }
    button:hover, a:hover { filter: brightness(1.08); }
    #editor { flex: 1 1 auto; min-height: 0; width: 100%; border: none; overflow: hidden; }
    #status { margin-left: 8px; color: #8cc2ff; }
    .ace_editor { background: #07101f !important; color: #dbe6ff !important; width: 100% !important; height: 100% !important; }
    .ace_gutter { background: #07101f !important; color: #6f8eb5 !important; }
    .ace_marker-layer .ace_active-line { background: #10213c !important; }
    .ace_marker-layer .ace_selection { background: rgba(140, 194, 255, 0.3) !important; }
    .meta { opacity: 0.9; font-size: 12px; overflow-wrap: anywhere; }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="row">
      <a href="${escapeHtml(toBrowseHref(parentPath))}">Back</a>
      <button id="saveBtn" type="button">Save</button>
      <span id="status"></span>
    </div>
    <div class="meta">${escapeHtml(localPath)} · ${escapeHtml(language)}</div>
  </div>
  <div id="editor"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/ace/1.36.2/ace.js"></script>
  <script>
    const saveBtn = document.getElementById('saveBtn');
    const status = document.getElementById('status');
    const editor = ace.edit('editor');
    editor.setTheme('ace/theme/tomorrow_night');
    editor.session.setMode('ace/mode/${escapeHtml(language)}');
    editor.setValue(${safeContentLiteral}, -1);
    editor.setOptions({
      fontSize: '13px',
      wrap: true,
      showPrintMargin: false,
      useSoftTabs: true,
      tabSize: 2,
      behavioursEnabled: true,
    });
    editor.resize();

    saveBtn.addEventListener('click', async () => {
      status.textContent = 'Saving...';
      const response = await fetch(location.pathname, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: editor.getValue(),
      });
      status.textContent = response.ok ? 'Saved' : 'Save failed';
    });
  </script>
</body>
</html>`
}
