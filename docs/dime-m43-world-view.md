# Milestone 4.3 world-first interface

The gameplay canvas fills the entire available viewport. Controls use translucent edge overlays rather than separate layout rows. The implementation retains one canvas and the existing local movement, authoritative mining, extraction, and pending-request controllers.

## Interaction rules

- Four movement targets remain 44×44 CSS pixels, with smaller circular visual marks, at bottom-left. Contextual actions occupy bottom-right.
- Menu and the wallet/cargo summary open a paused operations overlay. Navigation selects objectives only. Doors, transit and ship departure still require their original physical checks.
- Scanner and service details are expandable through the menu. Nearby intact nodes expose Mine. Mine performs the existing scan and analysis operations when required, then starts the existing laser session. Each operation must succeed before the next; generation checks stop a sequence after reset or identity change.
- Hold Mine to charge and release to cool. Fracture remains automatic at the existing successful threshold. Nearby eligible pieces expose Hold Vacuum. No geometry, quantities, yield, collision, recovery or server contracts change.
- Opening an overlay releases held input. Existing active-session movement locks are preserved; simultaneous movement input cannot steal the laser pointer or create per-frame requests.
- Inactive navigation controls fade to 55% opacity and contextual actions to 75% after 4.5 seconds. Pointer, touch and keyboard activity restore full opacity immediately; controller activity is polled every 50ms. A held pointer keeps controls visible. Embedded gamepad restrictions cannot interrupt other input handling.
- Vacuum feedback is positioned outside the button's layout flow. Collection feedback cannot move the held 44px button away from a finger. The Menu corner button remains reachable while the operations overlay scrolls.
- Desktop web can hide the movement pad and tool hold buttons. Keyboard movement and canvas-focused Space/V tool shortcuts remain available. Menu controls remain keyboard accessible.
- Safe-area insets are applied on all edges. Reduced motion removes control fading transitions; high contrast strengthens HUD boundaries.
- Pending uncertainty has a visible compact entry point. Detailed Retry/Discard controls retain the existing explicit-discard confirmation and storage isolation.

## Validation method

Compare the preserved 0.9.0 ZIP with the replacement at 318×500, 360×640 and 1280×900. Count the union of permanent UI rectangles, including full transparent touch target bounds, as obstructed. Do not discount covered area based on translucency. Require at least 80% unobstructed area on Panel and Mobile.

Release evidence is stored under `/tmp/dime-m43-world-ui`. Release acceptance requires a clean complete Chromium suite, full unit suite, lint, strict typecheck, default/Twitch/web builds, formatting, compiled-content audit and production performance checks. Diagnostic runs are not the release gate.

No backend deployment, table reset or public publication is part of this update.

## Measured viewport coverage

Coverage includes active destination selection for node, laser and fragment scenes. Objective text is expanded through the HUD; its world marker remains visible. The fixed-width summary prevents increasing wallet text from consuming more map area.

| Layout           | Station | Nearby node | Laser | Fragments |
| ---------------- | ------: | ----------: | ----: | --------: |
| Panel 318×500    |   89.0% |       84.4% | 80.7% |     82.1% |
| Mobile 360×640   |   92.4% |       89.2% | 86.7% |     87.7% |
| Desktop 1280×900 |   98.5% |       97.8% | 97.3% |     97.5% |

The comparison page is `/tmp/dime-m43-world-ui/comparison.html`; raw measurements and screenshots are adjacent. These are production-build synthetic fixtures, not real player records or authenticated Twitch webview results.
