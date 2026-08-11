# Composer slash menu

Source: implementation and verification of commit `b928fae9` on 2026-08-12.

The composer recognizes a slash token at a whitespace boundary with `/(^|\s)(\/[^\s\/]*)$/u`. While the token is active, it presents installed skills before built-in commands. The menu reserves two slots for `/goal` and `/plan`, so a large skill list cannot hide the built-in commands.

Selecting a skill removes the slash token and attaches the skill as a structured skill input. Selecting `/goal` replaces the token with `/goal ` and leaves the cursor ready for an objective. Selecting `/plan` removes the token and toggles the existing composer collaboration mode between `default` and `plan`; it does not submit a prompt.

Keyboard behavior matches the composer file mention interaction: Up and Down move the highlighted row, Enter or Tab selects it, and Escape closes the menu. The popup is available in new-thread and existing-thread composers and has explicit light and dark theme styling.

Focused verification:

- `pnpm vitest run src/components/content/composerSlashMentions.test.ts`
- `pnpm run build:frontend`
- Headless browser assertion that the empty `/` query renders skills first and `/goal`, `/plan` last.
- Browser assertion that selecting `/plan` changes the composer switch to `Disable plan mode` with `aria-checked=true`.
