# Composer slash menu

The message composer uses `/` as a discovery surface for installed skills and built-in composer commands.

## Ordering

`/goal` and `/plan` are always the first matching rows. Installed skills follow, sorted by match quality and label.

## Actions

- Skill row: remove the slash token and add the skill to the selected-skill chips.
- `/goal`: remove the slash token and toggle a Goal mode button after the Thinking control. Submitting while active prefixes the objective with `/goal ` for the existing goal RPC routing, then clears the mode.
- `/plan`: remove the slash token and toggle the existing collaboration mode plus its Plan mode button. No turn is submitted.

Goal and Plan are mutually exclusive. Their active mode buttons are only rendered while selected, and clicking a button turns that mode off.

## Interaction contract

The trigger must begin at the start of the draft or after whitespace and must not contain another slash or whitespace. Arrow keys navigate, Enter or Tab select, and Escape closes. Typing more characters filters both skills and commands.

## Source

See `llm-wiki/raw/features/composer-slash-menu.md`, the follow-up source `llm-wiki/raw/fixes/composer-slash-mode-toggles.md`, and the implementation in `src/components/content/composerSlashMentions.ts` plus `src/components/content/ThreadComposer.vue`.
