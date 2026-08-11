# Composer slash mode toggle follow-up

Source: follow-up implementation and browser verification on 2026-08-12.

The slash menu must place `/goal` and `/plan` before skills. Selecting either command removes the slash token and activates a visible composer mode button after the Thinking control. Clicking that button deactivates the mode. Goal and Plan are mutually exclusive.

Goal mode submits the draft through the existing `/goal <objective>` command route, then turns itself off. Plan mode uses the existing `selectedCollaborationMode` state and turns off through the same collaboration-mode update event as the attach-menu switch.

Dark mode requires an explicit selected-row background and explicit Goal/Plan button surfaces in `src/style.css`; otherwise the component-scoped light selected-row background can render as a bright white row on the dark popup.
