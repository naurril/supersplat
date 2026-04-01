# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SuperSplat is an open-source, browser-based editor for 3D Gaussian Splats built on the PlayCanvas engine. It supports inspecting, editing, optimizing, and publishing splat data. No tests exist in this codebase.

## Commands

- **Dev server**: `npm run develop` (runs Rollup watch + serve on port 3000)
- **Build**: `npm run build` (production Rollup build)
- **Lint**: `npm run lint` (ESLint on `src/`)

## Architecture

### Entry flow

`src/index.ts` → `src/main.ts` (`main()`) which bootstraps the entire application:
1. Creates the central `Events` bus
2. Registers subsystem events via `register*Events()` functions (editor, selection, doc, render, timeline, etc.)
3. Creates `EditorUI`, the PlayCanvas graphics device, `Scene`, and `ToolManager`
4. Wires everything together through the events system

### Event-driven design

The `Events` class (`src/events.ts`) extends PlayCanvas `EventHandler` and is the backbone of the app. It adds a `function(name, fn)` / `invoke(name, ...args)` mechanism for named callable functions. Nearly all cross-module communication goes through `events.fire()` / `events.on()` and `events.function()` / `events.invoke()`. Subsystems are decoupled—they register event handlers rather than importing each other directly.

### Key modules

| Module | Role |
|---|---|
| `src/scene.ts` | Scene graph manager—owns the PlayCanvas `App`, layers, and all `Element` instances |
| `src/splat.ts` | Core `Splat` class (extends `Element`)—wraps a GSplat asset with selection state, transforms, and edit operations |
| `src/camera.ts` | Orbital/fly camera controller with render targets |
| `src/editor.ts` | `registerEditorEvents()`—splat editing operations (delete, reset, transform) with undo/redo |
| `src/edit-history.ts` | Undo/redo stack |
| `src/doc.ts` | File I/O for `.ssproj` project format (ZIP-based) |
| `src/element.ts` | Base `Element` class with types: camera, model, splat, shadow, debug, other |

### Source layout

- `src/ui/` — UI layer built on `@playcanvas/pcui`. `src/ui/editor.ts` is the top-level `EditorUI` class; subfolders contain panels, dialogs, popups, and SCSS styles.
- `src/tools/` — Selection and transform tools (brush, box, lasso, polygon, sphere, flood, eyedropper, measure, move, rotate, scale), managed by `ToolManager`.
- `src/io/` — File loading (`read/`) and saving (`write/`) for PLY, SOG, and other formats.
- `src/shaders/` — GLSL shaders for splat rendering, bounds, grid, overlays.
- `src/anim/` — Animation/spline interpolation.

### Build system

Rollup (`rollup.config.mjs`) with two bundles: main app and service worker (`src/sw.ts`). Uses `BUILD_TYPE` env var (`debug`/`release`). Static assets are in `static/` and copied to `dist/` during build.

### Key dependencies

- **playcanvas** — WebGL rendering engine
- **@playcanvas/pcui** — UI component library
- **@playcanvas/splat-transform** — Splat data transformation utilities
- **i18next** — Localization (locale files in `static/locales/`)

## Lint Rules

ESLint flat config (`eslint.config.mjs`) extends `@playcanvas/eslint-config`. Notable: `@typescript-eslint/no-explicit-any` and `no-unused-vars` are disabled. TypeScript target is ES2022 with `noImplicitAny: true`.
