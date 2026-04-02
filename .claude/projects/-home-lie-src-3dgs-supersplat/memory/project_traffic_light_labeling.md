---
name: Traffic Light Labeling Feature
description: Design for traffic light labeling in SuperSplat, extending vehicle light labeling for 3dgs-simulator compatibility
type: project
---

Traffic light labeling feature designed (docs/traffic-light-labeling.md) to extend the existing vehicle light labeling system.

**Why:** The 3dgs-simulator needs `.lights.yaml` sidecar files that define traffic light bulb regions (sphere/bbox/index_range), groups with phase timing, and per-state appearance. SuperSplat needs a way to author these by labeling gaussians.

**How to apply:** Traffic light bulbs reuse the existing per-gaussian label system (label IDs starting at 512). A separate Traffic Lights panel manages the hierarchical structure (traffic light → red/yellow/green bulbs → gaussians), intersection groups with phase timing, preview mode, and export to `.lights.yaml`. Key files planned: `src/traffic-light.ts`, `src/ui/traffic-light-panel.ts`, `src/io/write/lights-yaml.ts`, `src/io/read/lights-yaml.ts`.
