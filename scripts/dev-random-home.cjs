const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { spawnSync } = require('node:child_process')

const codexHome = mkdtempSync(join(tmpdir(), 'codexapp-dev-home-'))
console.log(`Using temporary CODEX_HOME: ${codexHome}`)

const result = spawnSync(process.execPath, [join(__dirname, 'dev.cjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: {
    ...process.env,
    CODEX_HOME: codexHome,
  },
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
