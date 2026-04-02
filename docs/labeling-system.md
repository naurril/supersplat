# Labeling System Design Document

## Overview

SuperSplat's labeling system allows annotating individual gaussians in a 3D Gaussian Splatting model with semantic labels. The primary use case is labeling vehicle lights on car models for autonomous driving simulation, where each label corresponds to a `VehicleLightState` flag used by the 3dgs-simulator runtime.

## Predefined Labels

Labels use fixed IDs that match the `VehicleLightState` IntFlag values from the simulator (`3dgs-simulator/simulator/actor/vehicle_light.py`):

| ID | Hex | Name | Color | Description |
|----|------|---------------|----------------|--------------------------|
| 0 | 0x0 | Unlabeled | — | No label (default) |
| 1 | 0x1 | Position | Yellow | Marker / parking lights |
| 2 | 0x2 | Low Beam | Warm white | Low beam headlights |
| 4 | 0x4 | High Beam | White | High beam headlights |
| 8 | 0x8 | Brake | Red | Brake lights |
| 16 | 0x10 | Right Blinker | Orange | Right turn signal |
| 32 | 0x20 | Left Blinker | Orange | Left turn signal |
| 64 | 0x40 | Reverse | Light gray | Reverse lights |
| 128 | 0x80 | Fog | Olive | Fog lights |
| 256 | 0x100 | Special | Blue | Special (e.g. sirens) |

IDs are powers of two so they can be combined as bit flags in the simulator. The editor treats them as plain integer IDs.

## Data Model

### Per-Gaussian Storage

Each gaussian stores a 16-bit label ID:

```
splatData.getProp('label') → Uint16Array   (one entry per gaussian)
```

- `0` = unlabeled
- `1–0xFFFF` = user or predefined labels
- 16-bit storage is required because `SPECIAL1 = 0x100` (256) exceeds 8-bit range

### Label Metadata

```typescript
// splat.ts
labels: Map<number, { name: string, color: Color }>   // id → metadata
hiddenLabels: Set<number>                               // hidden label IDs
_nextLabelId: number                                    // auto-increment counter
```

### GPU Textures

| Texture | Format | Size | Purpose |
|---------|--------|------|---------|
| `labelTexture` | `PIXELFORMAT_R16U` | W×H (same as splat grid) | Per-gaussian label ID |
| `labelPaletteTexture` | `PIXELFORMAT_RGBA8` | 512×1 | Label color + visibility |

Palette alpha encoding: `0` = hidden, `1` = visible (no overlay), `128` = visible (with color overlay).

## PLY File Format

Labels are stored as a vertex property in PLY files:

```
property ushort label
```

When loading older PLY files with 8-bit labels (`property uchar label`), the data is automatically upgraded to 16-bit. When a PLY has no `label` property, one is created filled with zeros.

On export, the `label` property is written as `ushort` (2 bytes, little-endian).

## Shader Integration

The vertex shader reads labels and applies visibility filtering and color overlays:

```glsl
uniform highp usampler2D splatLabel;    // per-gaussian label IDs (R16U)
uniform sampler2D labelPalette;          // 512×1 RGBA palette
uniform int showLabels;                  // enable label visibility filtering
uniform int showLabelColors;             // enable label color overlay
uniform int isolateSelected;             // show only selected gaussians
```

Rendering pipeline:
1. Read label ID from `splatLabel` texture
2. If `showLabels` is on, look up palette alpha — discard if hidden
3. If `isolateSelected` is on, discard unselected gaussians
4. If `showLabelColors` is on, pass label color to fragment shader
5. Fragment shader blends label color at 50% opacity

## Edit Operations

All label operations support undo/redo through the edit history system.

### AssignLabelOp

Assigns a label to all currently selected gaussians. Previous labels are stored for undo.

```
Event: label.assign(labelId)
Effect: selected gaussians → labelId
```

### ReplaceLabelOp

Sets the label to contain exactly the current selection. Gaussians previously in the label but not selected become unlabeled; selected gaussians not yet in the label are added.

```
Event: label.replace(labelId)
Effect: label = current selection (symmetric difference applied)
```

### RemoveFromLabelOp

Removes selected gaussians from a label (sets them to unlabeled). Only affects gaussians that are both selected AND have the specified label.

```
Event: label.removeSelected(labelId)
Effect: selected ∩ label → unlabeled
```

## UI Panel

### Layout

```
┌──────────────────────────────────┐
│  Labels                          │
│                                  │
│  Show Labels ──────── [toggle]   │
│  Show Selected Only ── [toggle]  │
│                                  │
│  [Assign] [Replace] [Remove]     │
│  [Select] [Deselect]             │
│                                  │
│    ◻ Unlabeled           1234    │
│  ▌ 👁 ■ Position          456    │  ← active (orange border)
│    👁 ■ Low Beam          789  × │
│    👁 ■ Brake             123  × │
│    ...                           │
│                                  │
│  [Add All Lights] [Add Label]    │
└──────────────────────────────────┘
```

### Active Label

Click a label row to make it "active" (highlighted with an orange left border). All toolbar buttons operate on the active label.

### Toolbar Buttons

| Button | Action | Active Label Constraint |
|--------|--------|------------------------|
| Assign | Add selected points to label | Any (including Unlabeled) |
| Replace | Label = exactly selection | Not Unlabeled |
| Remove | Unlabel selected points from label | Not Unlabeled |
| Select | Select all gaussians with label | Any |
| Deselect | Remove label's points from selection | Any |

### Label Row Controls

| Control | Action |
|---------|--------|
| Eye icon | Toggle label visibility (hidden labels are not rendered) |
| Color swatch | Click to change label color via color picker |
| Name | Text-selectable; double-click for dropdown rename |
| Count | Gaussian count for this label |
| × (delete) | Remove label, reset its gaussians to unlabeled |

### Global Controls

- **Show Labels**: Enables label color overlay rendering and visibility filtering
- **Show Selected Only**: Hides all unselected gaussians (isolate mode for refinement)
- **Add All Lights**: Creates all 9 predefined vehicle light labels with correct IDs/colors
- **Add Label**: Creates a custom label with auto-incremented ID

### Label Rename

Double-clicking a label name opens a dropdown with the 9 predefined light type names. Selecting one renames the label. This ensures consistent naming without typos.

## Labeling Workflow

### Initial Labeling

1. Load a car 3DGS model (PLY file)
2. Open the Label panel, click **Add All Lights**
3. Enable **Show Labels** toggle
4. Click "Low Beam" row to make it active
5. Use brush/lasso tool to select headlight gaussians
6. Click **Assign** — selected points are now labeled "Low Beam"
7. Click "Brake" row, select tail lights, **Assign**, repeat for each light type

### Refinement

1. Click a label row (e.g. "Brake") to activate it
2. Click **Select** — all brake points are now selected
3. Toggle **Show Selected Only** — see only the brake points
4. **Shift + brush** to add missed points to selection
5. **Ctrl + brush** to remove wrong points from selection
6. Click **Replace** — the label now matches exactly the refined selection
7. Toggle **Show Selected Only** off

### Removing Points from a Label

1. Brush-select the points to remove
2. Click the label row to activate it
3. Click **Remove** — only points that are both selected AND in this label get unlabeled

### Moving Points Between Labels

1. Select the points to reassign
2. Click the destination label row
3. Click **Assign** — points move to the new label (overwriting their previous label)

## Document Persistence

Label metadata (names, colors, next ID) is saved in `.ssproj` project files:

```json
{
  "labels": [
    { "id": 1, "name": "Position", "color": [0.9, 0.9, 0.3] },
    { "id": 8, "name": "Brake", "color": [0.9, 0.1, 0.1] }
  ],
  "nextLabelId": 257
}
```

Per-gaussian label assignments are part of the PLY data within the project archive.

When loading a PLY without a project file, `detectLabels()` scans the data and auto-creates metadata — using predefined names/colors for known VehicleLightState IDs, and generic "Label N" for unknown IDs.

## File Locations

| File | Role |
|------|------|
| `src/splat.ts` | Core label data model, GPU sync, serialization |
| `src/edit-ops.ts` | AssignLabelOp, ReplaceLabelOp, RemoveFromLabelOp |
| `src/editor.ts` | Event handlers, view state (showLabels, isolateSelected) |
| `src/ui/label-panel.ts` | Label panel UI |
| `src/ui/scss/label-panel.scss` | Panel styles |
| `src/shaders/splat-shader.ts` | Label rendering in vertex/fragment shaders |
| `src/io/read/loader.ts` | PLY loading (type mapping for ushort) |
| `src/splat-serialize.ts` | PLY export (ushort write support) |
| `static/locales/en.json` | UI strings |
