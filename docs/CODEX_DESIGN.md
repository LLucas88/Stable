# Codex-inspired background and component surfaces

Implemented on `codex-design`, based on `codex-harness-integration` at `26d405d`.
The user requested that the existing uncommitted feature work be inherited. The
original checkout remains at E:\Stable; this branch is developed at
E:\Stable-codex-design. A point-in-time baseline of the inherited files is saved
outside the repository under E:\codex-design-audit\stable-codex-design-baseline.

## Behavior

The existing Stable layout, task flows, startup animation, approvals and project
controls remain intact. The visual layer now uses neutral light/dark content
colors, an unpainted native sidebar/titlebar, subtle state fills and nearly opaque
controls/popovers.

On Windows 11 build 22621+ with GPU compositing enabled, the host selects Mica.
The root stays transparent only after the native host reports that configuration.
The titlebar overlay follows the app's selected theme. Unsupported platforms,
older builds, disabled GPU compositing, high contrast and API failures use a solid
fallback. Windows can also substitute its own solid backdrop based on system
transparency or battery preferences.

Startup remains white for the existing launch animation. Material/theme changes
start when launch completes. Native theme listeners are removed with the window.

## Visual baseline

Derived from locally inspected Codex 26.901.5280.0 default theme generation.
This is an implementation reference, not a published OpenAI specification.

| Surface | Light | Dark |
|---|---|---|
| Main content | #ffffff | #181818 |
| Opaque shell fallback | #f6f6f6 | #141414 |
| Mica shell tint | transparent | transparent |
| Control | white at 96% | #2d2d2d at 96% |
| Main popover | white at 96% | #363636 at 96% |
| Text | #1a1c1f | #dfdfdf |
| Secondary text | ink at 69.5% | white at 71% |
| Muted text | ink at 49.5% | white at 49.8% |
| Border | ink at 7.8% | white at 8.4% |
| Strong border | ink at 11.7% | white at 15.6% |

Window-shell, app-shell and side-rail stay transparent in Mica mode. Reading/preview surfaces remain
solid. Light composer alpha is 0.96 × 0.9 = 0.864 in Mica mode, with a 16px CSS
backdrop filter. This filter is distinct from native Mica. The dark composer
uses #2d2d2d. Opaque mode removes the filter and uses opaque component variants.

Stable's semantic color aliases remain available to all existing components.
Focus/danger/success colors use slightly stronger actionable colors where useful;
the exact original accent is not imposed on every existing business control.
Component radius slots become 8/12/16px, with a separate 20px composer radius.
System UI fonts replace the display/body fonts; primary answer text uses 16px and weight 400. Navigation rows use a 36px minimum, the composer textarea a 56px minimum, and role labels remain accessible but visually hidden. Business controls and launch artwork are retained.

## Files

- desktop/services/window-appearance.cjs: native theme/material policy.
- desktop/main.cjs: window lifecycle integration and neutral preview background.
- desktop/preload.cjs: validates and synchronizes material messages to root data attributes.
- src/styles/tokens.css: neutral semantic palette and surface values.
- src/styles/codex-surfaces.css: layering, components, interactions and forced-color fallback.
- src/main.tsx and index.html: stylesheet entry and root transparency.
- tests/window-appearance.test.cjs: material policy, errors and lifecycle.
- tests/codex-surfaces-ui.test.cjs: production styles and preload in a hidden renderer.
- tests/fixtures/native-material-check.cjs: optional real Electron native API smoke check.
- Existing navigation assertions and sidebar fixture updated to the new theme layer.

## Validation

- npm run typecheck: passed.
- npm run build: passed; existing large bundle warning remains.
- 16 targeted checks passed: window appearance, navigation, launch animation,
  hidden surface checks and real React sidebar controls.
- Real hidden native window on Windows 10.0.26200: GPU compositing enabled;
  light and dark material calls both selected mica; isVisible() remained false.
- Hidden render checks verify root transparency, unpainted shell, opaque main
  content, composer/popover alpha, state fill, radius, shadow and no horizontal overflow.
- Screenshots inspected for light/dark components and the real React sidebar menu.
  Hidden Mica renderer screenshots exercise the CSS contract; they are not a
  measurement of the user's wallpaper as seen through a visible native window.
- git diff --check: passed.

Commands:

```powershell
npm run typecheck
npm run build
node --test tests/window-appearance.test.cjs tests/navigation-workspace-ui.test.cjs tests/launch-splash-ui.test.cjs tests/codex-surfaces-ui.test.cjs tests/sidebar-controls-ui.test.cjs
```

One additional existing test in agent-composer-ui.test.cjs fails because it
requires the old four-argument agent.run call. The same assertion was independently
reproduced on the inherited pre-design App.tsx snapshot. App.tsx and that test
were not changed by this visual implementation. Full-suite success is not claimed.

Artifacts are under qa-artifacts/codex-design and qa-artifacts/sidebar-controls.
All test windows use isolated profiles and remain hidden; no personal account,
task history or running application was operated.

## Screenshot correction — 2026-09-06

The first pass incorrectly applied a 70% shell overlay globally. Inspection of the installed 26.901.6511.0 CSS confirms that this rule explicitly excludes `[data-codex-window-chrome=application-menu]`, matching the menu chrome visible in the user reference. Removing that overlay allows native wallpaper tint through. Screenshot samples: Stable at (200,320) #fdfbfa; Codex at (200,320) #f9f1ec. These are observations, not fixed theme tokens or a same-position/DPI calibrated comparison.

The reference does not establish an exact DPI/zoom match. Dimensions here are CSS-pixel design choices; no pixel-perfect claim is made. Hidden renderer tests cannot verify the final visible DWM wallpaper tint. Verify that part by rebuilding/restarting the local app under the same wallpaper, theme and active-window conditions.
