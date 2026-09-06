# EDIC Anti-Patterns & Correct Replacements
# 反模式 × 正确替代对照表

> Loaded on demand when validating or correcting generated code.
> Each entry shows the wrong pattern, why it fails, and the exact replacement.

---

## Color Anti-Patterns

### ❌ Hard-coded hex / rgb / hsl colors

```css
/* ❌ Wrong */
color: #333;
background: #fff;
background: rgb(255, 255, 255);
border-color: hsl(0 0% 90%);
```

```css
/* ✅ Correct — use semantic color tokens */
color: var(--ds-color-fg);
background: var(--ds-color-surface-raised);
background: var(--ds-color-surface-raised);
border-color: var(--ds-color-border);
```

**Why:** Hex/rgb/hsl values do not update in dark mode. `--ds-*` tokens switch
automatically via `[data-theme="dark"]`.

---

### ❌ Bare `oklch()` outside `:root` / `[data-theme]` / `@keyframes`

```css
/* ❌ Wrong — bare oklch in a component rule */
.my-card {
  background: oklch(97% 0.012 80);
  color: oklch(20% 0.02 60);
}
```

```css
/* ✅ Correct — reference the token */
.my-card {
  background: var(--ds-color-bg);
  color: var(--ds-color-fg);
}
```

**Why:** Bare `oklch()` in component rules bypasses the token system and breaks
dark mode. Bare oklch is only allowed in `:root` and `[data-theme="dark"]` token
declarations, and in `@keyframes`.

---

### ❌ Pure black in dark mode

```css
/* ❌ Wrong */
[data-theme="dark"] .surface { background: #000; }
[data-theme="dark"] .surface { background: oklch(0% 0 0); }
```

```css
/* ✅ Correct — warm dark base */
[data-theme="dark"] .surface { background: var(--ds-color-bg); }
/* which resolves to: oklch(15% 0.008 75) — warm grey, not cold black */
```

---

### ❌ Using light-mode accent directly in dark mode

```css
/* ❌ Wrong — olive-400 light value is too dark on dark backgrounds */
[data-theme="dark"] .accent-text { color: oklch(52% 0.08 115); }
```

```css
/* ✅ Correct — dark-mode accent is 5–10% lighter */
[data-theme="dark"] .accent-text { color: var(--ds-accent); }
/* which resolves to: oklch(57% 0.065 115) in dark mode */
```

---

## Spacing Anti-Patterns

### ❌ Hard-coded pixel or rem values

```css
/* ❌ Wrong */
padding: 16px;
margin-top: 24px;
gap: 8px;
padding: 1rem;
```

```css
/* ✅ Correct — use spacing tokens */
padding: var(--ds-space-4);      /* = 16px = 1rem */
margin-top: var(--ds-space-6);   /* = 24px = 1.5rem */
gap: var(--ds-space-2);          /* = 8px = 0.5rem */
padding: var(--ds-space-4);      /* same value, correct source */
```

**Quick mapping:**
`4px` → `--ds-space-1` · `8px` → `--ds-space-2` · `12px` → `--ds-space-3` ·
`16px` → `--ds-space-4` · `24px` → `--ds-space-6` · `32px` → `--ds-space-8`

---

## Inline Style Anti-Patterns

### ❌ Static inline `style=` attributes

```html
<!-- ❌ Wrong — static values bypass token system -->
<div style="padding: 16px; background: #fff; border-radius: 8px;">
```

```html
<!-- ✅ Correct — use component classes -->
<div class="ds-card">

<!-- ✅ Also correct — inline style only for genuinely dynamic values -->
<div class="ds-reveal" style="--d: 0.1s">  <!-- stagger delay: dynamic, OK -->
```

**Exception:** Inline `style=` is allowed **only** for values that are computed at
runtime (e.g., stagger delays `--d`, progress bar widths, dynamic heights).

---

## Typography Anti-Patterns

### ❌ Hard-coded font sizes

```css
/* ❌ Wrong */
font-size: 14px;
font-size: 0.875rem;
font-size: 1.5rem;
```

```css
/* ✅ Correct — use type scale tokens */
font-size: var(--ds-text-body-sm);  /* = 0.875rem = 14px */
font-size: var(--ds-text-body-sm);
font-size: var(--ds-text-h4);       /* = 1.5rem = 24px */
```

---

### ❌ Hard-coded font families

```css
/* ❌ Wrong */
font-family: Georgia, serif;
font-family: -apple-system, sans-serif;
font-family: 'Courier New', monospace;
```

```css
/* ✅ Correct */
font-family: var(--ds-font-display);  /* headings: Iowan Old Style, Charter, Georgia, Noto Serif SC */
font-family: var(--ds-font-body);     /* body: Noto Sans SC, -apple-system, system-ui */
font-family: var(--ds-font-mono);     /* code: JetBrains Mono, IBM Plex Mono */
```

---

## Component Structure Anti-Patterns

### ❌ BEM dangling modifier (no base class)

```html
<!-- ❌ Wrong — modifier without base class -->
<button class="ds-btn--primary">Click</button>
<div class="ds-card--hoverable">Content</div>
```

```html
<!-- ✅ Correct — base class + modifier -->
<button class="ds-btn ds-btn--primary">Click</button>
<div class="ds-card ds-card--hoverable">Content</div>
```

---

### ❌ Glass card without colored background parent

```html
<!-- ❌ Wrong — backdrop-filter has nothing to blur on plain white -->
<body>
  <div class="ds-glass-card">...</div>
</body>
```

```html
<!-- ✅ Correct — colored parent enables the blur effect -->
<div class="ds-glass-demo-bg">
  <div class="ds-glass-card">...</div>
</div>
```

---

### ❌ Dropdown without `position:relative` parent

```html
<!-- ❌ Wrong — dropdown panel positions relative to viewport -->
<div>
  <button>Open</button>
  <div class="ds-dropdown" style="position:absolute; top:40px; left:0;">...</div>
</div>
```

```html
<!-- ✅ Correct — wrapper provides positioning context -->
<div style="position:relative; display:inline-block;">
  <button>Open</button>
  <div class="ds-dropdown"
       style="position:absolute; top:calc(100% + var(--ds-space-1)); right:0;
              z-index:var(--ds-z-dropdown);">...</div>
</div>
```

---

## Accessibility Anti-Patterns

### ❌ Icon-only button without `aria-label`

```html
<!-- ❌ Wrong — screen reader announces nothing meaningful -->
<button class="ds-icon-btn">
  <svg><!-- close icon --></svg>
</button>
```

```html
<!-- ✅ Correct -->
<button class="ds-icon-btn" aria-label="关闭">
  <svg aria-hidden="true"><!-- close icon --></svg>
</button>
```

---

### ❌ Decorative SVG without `aria-hidden`

```html
<!-- ❌ Wrong — screen reader may read out the SVG title/desc or skip incorrectly -->
<svg class="ds-feature-ico"><!-- star icon --></svg>
```

```html
<!-- ✅ Correct -->
<svg class="ds-feature-ico" aria-hidden="true"><!-- star icon --></svg>
```

---

## Motion Anti-Patterns

### ❌ Animation without reduced-motion override

```css
/* ❌ Wrong — ignores user accessibility preference */
.ds-reveal {
  animation: fadeIn var(--ds-duration-500) var(--ds-ease-out);
}
```

```css
/* ✅ Correct */
.ds-reveal {
  animation: fadeIn var(--ds-duration-500) var(--ds-ease-out);
}
@media (prefers-reduced-motion: reduce) {
  .ds-reveal { animation: none; opacity: 1; transform: none; }
}
```

Note: `styles.css` already includes global `prefers-reduced-motion` rules for
built-in components. Add overrides only for custom animations you write.
