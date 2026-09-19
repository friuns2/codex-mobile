# Publish the npm Package

Publish `@brutalstrikedevs/codexapp` from the repository root.

## Prepare npm authentication

1. Enable two-factor authentication on the `brutalstrikedevs` npm account.
2. Create a granular access token for `@brutalstrikedevs/codexapp`.
3. Grant `Read and write (publish and stage)` package access.
4. Enable `Bypass two-factor authentication (2FA)` for direct CLI publishing.
5. Set the shortest practical expiration date.
6. Store the token in KeePass as `API Keys/npm/Automation Token`.

Treat bypass-2FA tokens as temporary. npm warns that direct publishing with these tokens will stop working in January 2027. Replace this flow with npm Trusted Publishing before then.

Load the token without printing it:

```bash
TOKEN=$({ cat /Users/igor/.keepass/api-keys.pass; echo; } \
  | /Users/igor/.local/bin/keepassxc-cli show -q -s -a Password \
    /Users/igor/.codex/skills/api-keys/api-keys.kdbx \
    'API Keys/npm/Automation Token')
npm config set //registry.npmjs.org/:_authToken "$TOKEN"
unset TOKEN
npm whoami
```

Require `npm whoami` to print `brutalstrikedevs`. Replace an expired or unauthorized token before continuing.

## Publish a release

1. Confirm the published and local versions:

   ```bash
   npm view @brutalstrikedevs/codexapp version
   node -p "require('./package.json').version"
   ```

2. Increment the version when the local version already exists on npm:

   ```bash
   npm version patch --no-git-tag-version
   ```

3. Build and verify the package:

   ```bash
   pnpm run build
   pnpm pack --pack-destination /tmp
   ```

4. Commit the version change before publishing.
5. Publish the public package:

   ```bash
   npm publish --access public
   ```

6. Wait while npm processes the package. Do not publish the same version again after npm prints the successful `+ @brutalstrikedevs/codexapp@<version>` line.

## Verify the release

Confirm that npm exposes the new version:

```bash
npm view @brutalstrikedevs/codexapp version
```

Validate the published package on the Oracle A1 host:

```bash
ssh a2 'npx --yes @brutalstrikedevs/codexapp@latest --help'
```

Require the command to print the `codexui` CLI help. Report npm propagation delays separately from publication failures.

## Resolve common failures

- Fix `E401` by replacing the stored npm token.
- Fix `EOTP` by using a token created with `Bypass two-factor authentication (2FA)` enabled.
- Fix `EPUBLISHCONFLICT` by incrementing the package version.
- Wait and retry `npm view` when npm accepts a publication but still reports the previous `latest` version.
