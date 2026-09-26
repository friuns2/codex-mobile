### Feature: Mobile long-thread focus and submit performance

#### Prerequisites

- Run the app from this repository on a phone-sized viewport.
- Open a thread whose recent 50-message render window contains several completed command executions, including at least one output larger than 100 KB.

#### Steps

1. Leave all completed command rows collapsed and inspect the page DOM.
2. Confirm collapsed rows have no `.cmd-output-inner` or `.cmd-output` descendants.
3. Tap the composer, type a short message, and submit it.
4. Confirm the keyboard opens and closes without a multi-second pause and the conversation follows the latest message.
5. Expand a completed command row and confirm its full output appears.
6. Collapse the row and confirm its output nodes are removed from the DOM again.
7. Repeat steps 3–6 in light and dark themes.

#### Expected Results

- Collapsed command output text does not remain in the rendered DOM.
- Tapping and submitting remain responsive even when the underlying thread contains large command outputs.
- A mobile submission requests one explicit jump to the latest message; the conversation's existing bottom lock follows subsequent render frames.
- Expanded command output remains readable and scrollable, with the same light and dark theme styling.

#### Rollback/Cleanup

- No persistent test data is required. Delete any test message if it was sent to a disposable thread.
