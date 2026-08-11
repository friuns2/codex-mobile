# Composer slash menu

The message composer uses `/` as a discovery surface for installed skills and built-in composer commands.

## Ordering

Installed skills are sorted by match quality and label, then `/goal` and `/plan` are appended. The command slots are reserved before the skill result limit is applied, which keeps both commands visible even when the machine has many skills installed.

## Actions

- Skill row: remove the slash token and add the skill to the selected-skill chips.
- `/goal`: insert `/goal ` and keep focus in the textarea for the objective. Submission continues through the existing goal RPC routing.
- `/plan`: remove the slash token and toggle the existing collaboration mode. No turn is submitted.

## Interaction contract

The trigger must begin at the start of the draft or after whitespace and must not contain another slash or whitespace. Arrow keys navigate, Enter or Tab select, and Escape closes. Typing more characters filters both skills and commands.

## Source

See `llm-wiki/raw/features/composer-slash-menu.md` and the implementation in `src/components/content/composerSlashMentions.ts` plus `src/components/content/ThreadComposer.vue`.
