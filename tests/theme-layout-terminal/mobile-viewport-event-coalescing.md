### Feature: Mobile viewport event coalescing

#### Prerequisites
- App is running from this repository.
- A thread exists with enough rendered messages to scroll.
- Test in light and dark themes at `375x812` and `768x1024`.
- Browser developer tools can dispatch consecutive `window.resize`, `visualViewport.resize`, and `visualViewport.scroll` events.

#### Steps
1. Open the thread and wait for the conversation and composer to become usable.
2. Focus the composer to open the on-screen keyboard, then close and reopen it.
3. Dispatch a burst containing all three viewport event types before the next animation frame.
4. Wait for two animation frames and inspect the final composer position, conversation height, and viewport CSS variables.
5. Rotate from a portrait viewport such as `375x812` to a phone landscape viewport such as `667x375`.
6. Repeat the rotation while the on-screen keyboard remains open and the composer retains focus, then dismiss the keyboard.
7. Navigate away immediately after dispatching another burst to exercise pending-frame cancellation.
8. Repeat the flow in both themes and at both required viewport sizes.

#### Expected Results
- A same-frame event burst schedules only one viewport-state application.
- After the scheduled frame, the composer remains visible and the conversation occupies the final visual viewport without a stale offset.
- Unchanged viewport dimensions do not trigger additional reactive assignments.
- Rotation resets the layout-height baseline and does not create a false keyboard inset.
- Rotation while an editor remains focused keeps the keyboard-specific layout until the visual viewport expands after dismissal.
- Navigating away with a pending update produces no error or late layout mutation.
- Light and dark themes remain readable at both viewport sizes.
- Events delivered once per animation frame can still cause one layout per frame; this change does not debounce across keyboard-animation frames.

#### Rollback/Cleanup
- Restore the original viewport dimensions and close the on-screen keyboard.
- Stop only the disposable `4173` verification server if it was started for this test.
