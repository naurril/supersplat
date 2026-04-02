# Traffic Light Labeling System Design

## Overview

Extends SuperSplat's existing labeling system to support annotating traffic light bulbs in background 3DGS scenes. Each traffic light consists of three bulbs (red, yellow, green), each mapped to a set of gaussians. Traffic lights are organized into intersection groups with phase timing. The output is a `.lights.yaml` sidecar file consumed by the 3dgs-simulator runtime.

## Relationship to Vehicle Light Labeling

| Aspect | Vehicle Lights | Traffic Lights |
|--------|---------------|----------------|
| Target | Car model gaussians | Background scene gaussians |
| Structure | Flat (one label per light type) | Hierarchical (light → bulb → gaussians) |
| Label IDs | Fixed bit-flags (1, 2, 4, ... 256) | Auto-incremented (≥ 512) |
| Coordination | None (independent flags) | Groups with phase timing |
| Output | `label` property in PLY | `.lights.yaml` sidecar file |
| Simulator usage | `VehicleLightState` IntFlag | `TrafficLightState` enum + `TrafficLightGroup` |

Both systems share the same per-gaussian label storage (`Uint16Array`), GPU textures, edit operations, and undo/redo infrastructure. Traffic light labels use IDs starting at 512 to avoid collisions with vehicle light bit-flags (max 256) and low auto-increment IDs.

## Data Model

### Traffic Light Structure

```typescript
// New type in src/traffic-light.ts

interface TrafficLightBulb {
    labelId: number;            // ID in the shared label system
    name: 'red_bulb' | 'yellow_bulb' | 'green_bulb';
}

interface TrafficLight {
    name: string;               // e.g. "tl_north"
    bulbs: TrafficLightBulb[];  // always 3: red, yellow, green
}

interface TrafficLightPhase {
    lights: string[];           // traffic light names active in this phase
    green: number;              // green duration (seconds)
    yellow: number;             // yellow duration (seconds)
}

interface TrafficLightGroup {
    name: string;               // e.g. "intersection_1"
    phases: TrafficLightPhase[];
}
```

### Storage on Splat

```typescript
// Added to Splat class (src/splat.ts)

trafficLights: Map<string, TrafficLight>       // name → traffic light
trafficLightGroups: TrafficLightGroup[]        // intersection groups
```

Traffic light bulbs are regular labels in the existing `labels` map. The `trafficLights` map provides the hierarchical grouping on top — it references label IDs, not duplicates of them.

### Per-Gaussian Storage

Reuses the existing `label` property (`Uint16Array`). Each bulb's label ID is assigned to its gaussians. No new per-gaussian properties are needed.

### Predefined Bulb Colors (Editor Overlay)

| Bulb | Label Color | Rationale |
|------|-------------|-----------|
| `red_bulb` | `(0.9, 0.1, 0.1)` Red | Matches real-world bulb color |
| `yellow_bulb` | `(1.0, 0.8, 0.0)` Amber | Matches real-world bulb color |
| `green_bulb` | `(0.1, 0.9, 0.2)` Green | Matches real-world bulb color |

These colors are used for label overlay visualization in the editor, not for the simulator appearance (which is defined in `.lights.yaml`).

### Label ID Allocation

When a traffic light is created, three label IDs are allocated:

```
_nextTrafficLightLabelId starts at 512
tl_north/red_bulb    → 512
tl_north/yellow_bulb → 513
tl_north/green_bulb  → 514
tl_south/red_bulb    → 515
...
```

Label names in the shared label system use the format `"{tl_name}/{bulb_name}"` (e.g. `"tl_north/red_bulb"`). This distinguishes them from vehicle light labels and makes the parent traffic light identifiable from the label name.

## UI Panel

### Layout

Traffic light management is integrated into the existing **Labels** panel, sharing the same toolbar (Assign/Replace/Remove/Select/Deselect) and toggles (Show Labels, Show Selected Only). The panel has sections for vehicle lights, traffic lights, and groups.

```
┌──────────────────────────────────────────┐
│  Labels                                  │
│  Show Labels ──────────────── [toggle]   │
│  Show Selected Only ────────── [toggle]  │
│  [Assign] [Replace] [Remove]             │
│  [Select] [Deselect]                     │
│                                          │
│  ── Vehicle Lights ──                    │
│    ◻ Unlabeled                  1234     │
│    👁 ■ Position                 456     │
│    ...                                   │
│  [Add All Lights] [Add Label]            │
│                                          │
│  ── TRAFFIC LIGHTS ──                    │
│  ▼ tl_north                         [×]  │
│    ▌ 👁 ● red_bulb           234         │  ← active (orange border)
│      👁 ● yellow_bulb        189         │
│      👁 ● green_bulb         201         │
│  ▶ tl_south                         [×]  │
│  [Add Traffic Light]                     │
│                                          │
│  ── GROUPS ──                            │
│  intersection_1                     [×]  │
│    Phase 1: [tl_north, tl_south]         │
│      Green: [15.0]s  Yellow: [5.0]s      │
│    Phase 2: [tl_east, tl_west]           │
│      Green: [15.0]s  Yellow: [5.0]s      │
│    [Add Phase]                           │
│  [Add Group]  [Export .lights.yaml]      │
└──────────────────────────────────────────┘
```

### Traffic Light Section

**Creating a traffic light**: Click **Add Traffic Light** → enter a name (e.g. `tl_north`). Three bulb labels are automatically created (`red_bulb`, `yellow_bulb`, `green_bulb`) with predefined colors.

**Traffic light row**: Collapsible. Shows the traffic light name and a delete button. Expanding reveals three bulb rows.

**Bulb row**: Same controls as existing label rows:
- Eye icon: toggle bulb visibility
- Color swatch: bulb overlay color
- Name: `red_bulb` / `yellow_bulb` / `green_bulb` (not editable)
- Count: number of labeled gaussians
- Clicking a bulb row makes it the **active label** for toolbar operations

**Renaming a traffic light**: Double-click the traffic light name to edit inline.

**Deleting a traffic light**: Click `×` on the traffic light row. All three bulb labels are removed (gaussians become unlabeled). Requires confirmation if any bulb has gaussians.

### Toolbar Buttons

Same as the existing label panel — Assign, Replace, Remove, Select, Deselect. They operate on the currently active bulb label. The implementation reuses the same `label.assign`, `label.replace`, `label.removeSelected`, and `label.select` events.

### Groups Section

**Creating a group**: Click **Add Group** → enter intersection name. An empty group with one default phase is created.

**Phase row**: Shows which traffic lights are in the phase and timing fields:
- **Lights**: Multi-select dropdown of available traffic light names
- **Green**: Duration in seconds (number input, default 15.0)
- **Yellow**: Duration in seconds (number input, default 5.0)

**Add Phase**: Appends a new phase to the group.

**Validation**: A traffic light can appear in at most one phase per group. Traffic lights not in any phase of a group are implicitly RED for the entire cycle. A traffic light should not appear in multiple groups (warning shown).

### Preview Section

Allows visualizing traffic light states in the editor viewport without running the simulator.

**Manual state**: Radio buttons to force all traffic lights to a specific state (RED / YELLOW / GREEN / OFF). Applies the appearance colors from the default appearance table to the labeled gaussians.

**Animate**: Plays the phase cycle in real-time. Uses `requestAnimationFrame` with an elapsed time counter. For each frame:
1. Compute `sim_time = elapsed * speed`
2. For each group, call `getStates(sim_time)` to determine each light's state
3. Apply appearance colors to gaussians (modify SH DC component and opacity, same as simulator)
4. Ungrouped traffic lights remain in the manually selected state

**Stop**: Pauses animation and restores original gaussian appearance (from baseline snapshot taken at animation start).

**Speed**: Playback speed multiplier (0.25× to 4×).

Preview modifies gaussian appearance temporarily — changes are **not** saved and do not create edit history entries. A baseline snapshot of `features_dc` and `opacity` for all traffic light gaussians is taken when preview starts, and restored when preview stops.

### Default Appearance Table

Hardcoded to match the simulator defaults. Used by preview mode.

```typescript
const DEFAULT_APPEARANCE: Record<string, Record<string, { color: [number, number, number], opacity: number }>> = {
    RED: {
        red_bulb:    { color: [1.0, 0.0, 0.0], opacity: 1.0 },
        yellow_bulb: { color: [0.1, 0.08, 0.0], opacity: 0.3 },
        green_bulb:  { color: [0.0, 0.08, 0.0], opacity: 0.3 }
    },
    YELLOW: {
        red_bulb:    { color: [0.1, 0.0, 0.0], opacity: 0.3 },
        yellow_bulb: { color: [1.0, 0.8, 0.0], opacity: 1.0 },
        green_bulb:  { color: [0.0, 0.08, 0.0], opacity: 0.3 }
    },
    GREEN: {
        red_bulb:    { color: [0.1, 0.0, 0.0], opacity: 0.3 },
        yellow_bulb: { color: [0.1, 0.08, 0.0], opacity: 0.3 },
        green_bulb:  { color: [0.0, 1.0, 0.0], opacity: 1.0 }
    },
    OFF: {
        red_bulb:    { color: [0.05, 0.0, 0.0], opacity: 0.2 },
        yellow_bulb: { color: [0.05, 0.04, 0.0], opacity: 0.2 },
        green_bulb:  { color: [0.0, 0.05, 0.0], opacity: 0.2 }
    }
};
```

## Export: `.lights.yaml`

### Trigger

Click **Export .lights.yaml** in the panel. A file save dialog opens with the default name derived from the loaded PLY filename (e.g. `scene.lights.yaml`).

### Conversion Process

For each traffic light bulb, the export computes a bounding sphere from the labeled gaussians:

```
1. Collect positions (x, y, z) of all gaussians with this bulb's label ID
2. Compute centroid = mean(positions)
3. Compute radius = max(distance(position, centroid)) + padding
4. padding = median(scale) of the bulb's gaussians (accounts for gaussian size)
```

Bounding sphere is chosen over bbox because:
- The simulator's sphere query is the most commonly used type
- Bulbs are roughly spherical in real-world geometry
- Spheres are more rotation-invariant

### Output Format

```yaml
version: 1

traffic_lights:
  tl_north:
    red_bulb:    { type: sphere, center: [3.2, 15.8, 4.1], radius: 0.18 }
    yellow_bulb: { type: sphere, center: [3.2, 15.8, 3.8], radius: 0.16 }
    green_bulb:  { type: sphere, center: [3.2, 15.8, 3.5], radius: 0.17 }
  tl_south:
    red_bulb:    { type: sphere, center: [8.5, 15.8, 4.1], radius: 0.15 }
    yellow_bulb: { type: sphere, center: [8.5, 15.8, 3.8], radius: 0.14 }
    green_bulb:  { type: sphere, center: [8.5, 15.8, 3.5], radius: 0.16 }

groups:
  - name: intersection_1
    phases:
      - lights: [tl_north, tl_south]
        green: 15.0
        yellow: 5.0
      - lights: [tl_east, tl_west]
        green: 15.0
        yellow: 5.0

appearance:
  RED:
    red_bulb:    { color: [1.0, 0.0, 0.0], opacity: 1.0 }
    yellow_bulb: { color: [0.1, 0.08, 0.0], opacity: 0.3 }
    green_bulb:  { color: [0.0, 0.08, 0.0], opacity: 0.3 }
  YELLOW:
    red_bulb:    { color: [0.1, 0.0, 0.0], opacity: 0.3 }
    yellow_bulb: { color: [1.0, 0.8, 0.0], opacity: 1.0 }
    green_bulb:  { color: [0.0, 0.08, 0.0], opacity: 0.3 }
  GREEN:
    red_bulb:    { color: [0.1, 0.0, 0.0], opacity: 0.3 }
    yellow_bulb: { color: [0.1, 0.08, 0.0], opacity: 0.3 }
    green_bulb:  { color: [0.0, 1.0, 0.0], opacity: 1.0 }
  OFF:
    red_bulb:    { color: [0.05, 0.0, 0.0], opacity: 0.2 }
    yellow_bulb: { color: [0.05, 0.04, 0.0], opacity: 0.2 }
    green_bulb:  { color: [0.0, 0.05, 0.0], opacity: 0.2 }
```

The `appearance` section always uses the default appearance table. Custom appearance editing is out of scope for the initial implementation.

### Validation Before Export

- Every traffic light must have at least one gaussian labeled per bulb (warn if empty bulbs exist)
- Group phase lights must reference existing traffic light names
- Duplicate traffic light names are not allowed

## Import: `.lights.yaml`

### Trigger

When loading a PLY file, check for a corresponding `.lights.yaml` sidecar. Also available via **File → Import Traffic Light Metadata**.

### Conversion Process

For each traffic light in the YAML:
1. Create a `TrafficLight` entry with three bulb labels
2. Resolve spatial queries against loaded gaussian positions:
   - `sphere`: find gaussians within radius of center
   - `bbox`: find gaussians within min/max bounds
   - `index_range`: use gaussian indices directly
3. Assign the resolved gaussians to the corresponding bulb labels
4. Import groups and phase timing

This allows round-tripping: export from SuperSplat → use in simulator → re-import for refinement.

## Edit Operations

Traffic light operations compose existing label operations rather than introducing new `EditOp` subclasses.

### Creating a Traffic Light

1. Allocate three label IDs via `createLabelWithId()`
2. Add the `TrafficLight` entry to `splat.trafficLights`
3. Fire `splat.trafficLightsChanged` event

This is a single undoable operation (`CreateTrafficLightOp`).

### Deleting a Traffic Light

1. Set all gaussians of each bulb label to unlabeled (0)
2. Remove the three labels
3. Remove the `TrafficLight` entry
4. Remove the traffic light from any groups
5. Fire `splat.trafficLightsChanged` event

Single undoable operation (`DeleteTrafficLightOp`).

### Labeling Bulb Gaussians

Reuses existing `AssignLabelOp`, `ReplaceLabelOp`, `RemoveFromLabelOp` — the active label is the bulb's label ID. No new edit ops needed.

### Modifying Groups

Group and phase changes (`AddGroupOp`, `RemoveGroupOp`, `ModifyGroupOp`) are undoable operations that only modify the `trafficLightGroups` array, not per-gaussian data.

## Events

New events added to the `Events` bus:

| Event | Payload | Description |
|-------|---------|-------------|
| `trafficLight.create` | `(name: string)` | Create a new traffic light with 3 bulbs |
| `trafficLight.delete` | `(name: string)` | Delete traffic light and its labels |
| `trafficLight.rename` | `(oldName: string, newName: string)` | Rename a traffic light |
| `trafficLight.group.add` | `(name: string)` | Create a new empty group |
| `trafficLight.group.remove` | `(name: string)` | Delete a group |
| `trafficLight.group.modify` | `(name: string, phases: TrafficLightPhase[])` | Update group phases |
| `trafficLight.preview.setState` | `(state: string)` | Set manual preview state |
| `trafficLight.preview.animate` | `(playing: boolean)` | Start/stop animation |
| `trafficLight.export` | — | Export `.lights.yaml` |
| `trafficLight.import` | `(yaml: string)` | Import from `.lights.yaml` |
| `splat.trafficLightsChanged` | — | Fired after any structural change |

## Document Persistence

Traffic light metadata is saved in `.ssproj` project files alongside existing label data:

```json
{
  "labels": [ ... ],
  "nextLabelId": 257,
  "trafficLights": {
    "tl_north": {
      "bulbs": [
        { "name": "red_bulb", "labelId": 512 },
        { "name": "yellow_bulb", "labelId": 513 },
        { "name": "green_bulb", "labelId": 514 }
      ]
    },
    "tl_south": {
      "bulbs": [
        { "name": "red_bulb", "labelId": 515 },
        { "name": "yellow_bulb", "labelId": 516 },
        { "name": "green_bulb", "labelId": 517 }
      ]
    }
  },
  "trafficLightGroups": [
    {
      "name": "intersection_1",
      "phases": [
        { "lights": ["tl_north", "tl_south"], "green": 15.0, "yellow": 5.0 },
        { "lights": ["tl_east", "tl_west"], "green": 15.0, "yellow": 5.0 }
      ]
    }
  ],
  "nextTrafficLightLabelId": 518
}
```

Per-gaussian bulb assignments are stored via the shared `label` property in the PLY data within the project archive.

## Labeling Workflow

### Initial Setup

1. Load a background 3DGS scene (PLY file)
2. Open the **Traffic Lights** panel
3. Click **Add Traffic Light**, name it `tl_north`
4. Three bulb rows appear: `red_bulb`, `yellow_bulb`, `green_bulb`
5. Enable **Show Labels** toggle

### Labeling Bulbs

1. Expand `tl_north`, click the `red_bulb` row to activate it
2. Navigate to the traffic light in the 3D viewport
3. Use brush/lasso to select the red bulb gaussians
4. Click **Assign** — selected gaussians are labeled as `tl_north/red_bulb`
5. Click `yellow_bulb`, select the yellow bulb gaussians, **Assign**
6. Click `green_bulb`, select the green bulb gaussians, **Assign**
7. Repeat for each traffic light in the scene

### Refinement

Same workflow as vehicle light refinement — Select, Show Selected Only, adjust selection, Replace.

### Setting Up Groups

1. Click **Add Group**, name it `intersection_1`
2. In Phase 1, add `tl_north` and `tl_south` to the lights list
3. Set green=15s, yellow=5s
4. Click **Add Phase**, add `tl_east` and `tl_west`
5. Set green=15s, yellow=5s

### Preview

1. Click **RED** / **YELLOW** / **GREEN** to see static states applied to all traffic lights
2. Click **Animate** to see the phase cycle play out in real-time
3. Verify timing and visual appearance
4. Click **Stop** to restore original appearance

### Export

1. Click **Export .lights.yaml**
2. Save dialog opens with suggested filename
3. The exported file is ready for use by `3dgs-simulator`

## File Locations

| File | Role |
|------|------|
| `src/traffic-light.ts` | Data model types, group state computation, bounding sphere computation |
| `src/splat.ts` | Traffic light metadata storage on Splat, serialization |
| `src/edit-ops.ts` | CreateTrafficLightOp, DeleteTrafficLightOp, group modification ops |
| `src/editor.ts` | Traffic light event handlers |
| `src/ui/traffic-light-panel.ts` | Traffic light panel UI |
| `src/ui/scss/traffic-light-panel.scss` | Panel styles |
| `src/io/write/lights-yaml.ts` | `.lights.yaml` export (gaussian positions → bounding spheres) |
| `src/io/read/lights-yaml.ts` | `.lights.yaml` import (spatial queries → label assignments) |

## Future Extensions

- **Custom appearance**: Allow editing per-state bulb colors and opacity in the panel, instead of using defaults
- **Arrow signals**: Support arrow-shaped green lights (left/right/straight turn signals) as additional bulb types
- **Pedestrian signals**: Walk/don't-walk signals with their own bulb set
- **Blinking mode**: Support blinking yellow/red states with configurable blink rate
- **Bulk creation**: Select multiple traffic lights in the viewport and create them in batch from spatial clustering
