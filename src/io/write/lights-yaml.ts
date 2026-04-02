import { BULB_NAMES, Splat, type TrafficLightBulbs } from '../../splat';

const DEFAULT_APPEARANCE = {
    RED: {
        red_bulb: { color: [1.0, 0.0, 0.0], opacity: 1.0 },
        yellow_bulb: { color: [0.1, 0.08, 0.0], opacity: 0.3 },
        green_bulb: { color: [0.0, 0.08, 0.0], opacity: 0.3 }
    },
    YELLOW: {
        red_bulb: { color: [0.1, 0.0, 0.0], opacity: 0.3 },
        yellow_bulb: { color: [1.0, 0.8, 0.0], opacity: 1.0 },
        green_bulb: { color: [0.0, 0.08, 0.0], opacity: 0.3 }
    },
    GREEN: {
        red_bulb: { color: [0.1, 0.0, 0.0], opacity: 0.3 },
        yellow_bulb: { color: [0.1, 0.08, 0.0], opacity: 0.3 },
        green_bulb: { color: [0.0, 1.0, 0.0], opacity: 1.0 }
    },
    OFF: {
        red_bulb: { color: [0.05, 0.0, 0.0], opacity: 0.2 },
        yellow_bulb: { color: [0.05, 0.04, 0.0], opacity: 0.2 },
        green_bulb: { color: [0.0, 0.05, 0.0], opacity: 0.2 }
    }
};

interface BulbInfo {
    center: [number, number, number];
    radius: number;
    indices: number[];
}

// collect indices and compute bounding sphere for gaussians with a given label ID
const computeBulbInfo = (splat: Splat, labelId: number): BulbInfo | null => {
    const labelData = splat.splatData.getProp('label') as Uint32Array;
    const x = splat.splatData.getProp('x') as Float32Array;
    const y = splat.splatData.getProp('y') as Float32Array;
    const z = splat.splatData.getProp('z') as Float32Array;

    // collect positions and indices
    const indices: number[] = [];
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < labelData.length; i++) {
        if (labelData[i] === labelId) {
            indices.push(i);
            cx += x[i];
            cy += y[i];
            cz += z[i];
        }
    }

    if (indices.length === 0) return null;

    cx /= indices.length;
    cy /= indices.length;
    cz /= indices.length;

    // compute max distance from centroid + padding
    let maxDist = 0;
    const scales: number[] = [];
    const scaleX = splat.splatData.getProp('scale_0') as Float32Array;

    for (const i of indices) {
        const dx = x[i] - cx;
        const dy = y[i] - cy;
        const dz = z[i] - cz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist > maxDist) maxDist = dist;
        if (scaleX) scales.push(Math.exp(scaleX[i]));
    }

    // add padding based on median gaussian scale
    let padding = 0;
    if (scales.length > 0) {
        scales.sort((a, b) => a - b);
        padding = scales[Math.floor(scales.length / 2)];
    }

    return {
        center: [
            parseFloat(cx.toFixed(4)),
            parseFloat(cy.toFixed(4)),
            parseFloat(cz.toFixed(4))
        ],
        radius: parseFloat((maxDist + padding).toFixed(4)),
        indices
    };
};

const fmtArr = (arr: number[]) => `[${arr.join(', ')}]`;

const generateLightsYaml = (splat: Splat): string => {
    const lines: string[] = [];
    lines.push('version: 1');
    lines.push('');

    // traffic_lights section
    lines.push('traffic_lights:');
    splat.trafficLights.forEach((tl: TrafficLightBulbs, name: string) => {
        lines.push(`  ${name}:`);
        for (const bulbName of BULB_NAMES) {
            const info = computeBulbInfo(splat, tl[bulbName]);
            if (info) {
                lines.push(`    ${bulbName}:`);
                lines.push('      type: sphere');
                lines.push(`      center: ${fmtArr(info.center)}`);
                lines.push(`      radius: ${info.radius}`);
                lines.push(`      indices: ${fmtArr(info.indices)}`);
            } else {
                lines.push(`    ${bulbName}:`);
                lines.push('      type: sphere');
                lines.push('      center: [0, 0, 0]');
                lines.push('      radius: 0.01');
                lines.push('      indices: []');
            }
        }
    });
    lines.push('');

    // groups section
    if (splat.trafficLightGroups.length > 0) {
        lines.push('groups:');
        for (const group of splat.trafficLightGroups) {
            lines.push(`  - name: ${group.name}`);
            lines.push('    phases:');
            for (const phase of group.phases) {
                lines.push(`      - lights: ${fmtArr(phase.lights as any)}`);
                lines.push(`        green: ${phase.green}`);
                lines.push(`        yellow: ${phase.yellow}`);
            }
        }
        lines.push('');
    }

    // appearance section (default)
    lines.push('appearance:');
    for (const [state, bulbs] of Object.entries(DEFAULT_APPEARANCE)) {
        lines.push(`  ${state}:`);
        for (const [bulbName, props] of Object.entries(bulbs)) {
            lines.push(`    ${bulbName}: { color: ${fmtArr(props.color)}, opacity: ${props.opacity} }`);
        }
    }

    return `${lines.join('\n')}\n`;
};

const downloadLightsYaml = (splat: Splat) => {
    const yaml = generateLightsYaml(splat);
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);

    // derive filename from splat filename
    const baseName = splat.filename.replace(/\.[^.]+$/, '');
    const filename = `${baseName}.lights.yaml`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

const parseYamlValue = (s: string): any => {
    s = s.trim();
    // array
    if (s.startsWith('[') && s.endsWith(']')) {
        const inner = s.slice(1, -1).trim();
        if (inner === '') return [];
        return inner.split(',').map(v => parseYamlValue(v.trim()));
    }
    // number
    if (/^-?\d+(?:\.\d+)?$/.test(s)) {
        return parseFloat(s);
    }
    // boolean
    if (s === 'true') return true;
    if (s === 'false') return false;
    // string (strip quotes if present)
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('\'') && s.endsWith('\''))) {
        return s.slice(1, -1);
    }
    return s;
};

// minimal YAML parser for the lights.yaml format
const parseLightsYaml = (text: string) => {
    // use js-yaml-like approach: parse to JSON via regex transforms
    // This handles the subset of YAML used in .lights.yaml files
    const lines = text.split('\n');
    const result: any = {};
    const stack: { obj: any, indent: number }[] = [{ obj: result, indent: -1 }];
    let currentKey = '';

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        const trimmed = line.replace(/\s+$/, '');
        if (!trimmed || trimmed.startsWith('#')) continue;

        const indent = line.search(/\S/);
        const content = trimmed.trim();

        // pop stack to correct level
        while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
            stack.pop();
        }
        const parent = stack[stack.length - 1].obj;

        // list item
        if (content.startsWith('- ')) {
            const itemContent = content.substring(2).trim();
            if (!Array.isArray(parent[currentKey])) {
                parent[currentKey] = [];
            }
            if (itemContent.includes(':')) {
                const obj: any = {};
                // parse inline key-value pairs
                const pairs = itemContent.match(/(\w+):\s*([^,}]+)/g);
                if (pairs) {
                    for (const pair of pairs) {
                        const [k, ...vParts] = pair.split(':');
                        obj[k.trim()] = parseYamlValue(vParts.join(':').trim());
                    }
                }
                parent[currentKey].push(obj);
                stack.push({ obj, indent });
            } else {
                parent[currentKey].push(parseYamlValue(itemContent));
            }
            continue;
        }

        // key: value
        const colonIdx = content.indexOf(':');
        if (colonIdx === -1) continue;

        const key = content.substring(0, colonIdx).trim();
        const valueStr = content.substring(colonIdx + 1).trim();

        if (valueStr === '' || valueStr === '|') {
            // nested object
            if (Array.isArray(parent)) {
                const last = parent[parent.length - 1];
                last[key] = {};
                currentKey = key;
                stack.push({ obj: last[key], indent });
            } else {
                parent[key] = {};
                currentKey = key;
                stack.push({ obj: parent[key], indent });
            }
        } else if (valueStr.startsWith('{')) {
            // inline object
            const obj: any = {};
            const pairs = valueStr.match(/(\w+):\s*([^,}]+)/g);
            if (pairs) {
                for (const pair of pairs) {
                    const [k, ...vParts] = pair.split(':');
                    obj[k.trim()] = parseYamlValue(vParts.join(':').trim());
                }
            }
            if (Array.isArray(parent)) {
                const last = parent[parent.length - 1];
                last[key] = obj;
            } else {
                parent[key] = obj;
            }
        } else {
            // simple value
            if (Array.isArray(parent)) {
                const last = parent[parent.length - 1];
                last[key] = parseYamlValue(valueStr);
            } else {
                parent[key] = parseYamlValue(valueStr);
                currentKey = key;
            }
        }
    }

    return result;
};

const importLightsYaml = (splat: Splat, text: string) => {
    const data = parseLightsYaml(text);
    const labelData = splat.splatData.getProp('label') as Uint32Array;
    const x = splat.splatData.getProp('x') as Float32Array;
    const y = splat.splatData.getProp('y') as Float32Array;
    const z = splat.splatData.getProp('z') as Float32Array;

    if (!data.traffic_lights) return;

    for (const [name, bulbs] of Object.entries(data.traffic_lights as Record<string, any>)) {
        // create the traffic light if it doesn't exist
        if (!splat.trafficLights.has(name)) {
            splat.createTrafficLight(name);
        }
        const tl = splat.trafficLights.get(name);

        for (const bulbName of BULB_NAMES) {
            const bulbDef = bulbs[bulbName];
            if (!bulbDef) continue;

            const labelId = tl[bulbName];

            // prefer indices if available
            if (bulbDef.indices && Array.isArray(bulbDef.indices) && bulbDef.indices.length > 0) {
                for (const idx of bulbDef.indices) {
                    if (idx >= 0 && idx < labelData.length) {
                        labelData[idx] = labelId;
                    }
                }
            } else if (bulbDef.type === 'sphere' && bulbDef.center && bulbDef.radius) {
                // fallback: resolve sphere spatial query
                const [cx, cy, cz] = bulbDef.center;
                const r = bulbDef.radius;
                const r2 = r * r;
                for (let i = 0; i < labelData.length; i++) {
                    const dx = x[i] - cx;
                    const dy = y[i] - cy;
                    const dz = z[i] - cz;
                    if (dx * dx + dy * dy + dz * dz <= r2) {
                        labelData[i] = labelId;
                    }
                }
            }
        }
    }

    // import groups
    if (data.groups && Array.isArray(data.groups)) {
        const existingNames = new Set(splat.trafficLightGroups.map(g => g.name));
        for (const group of data.groups) {
            if (!existingNames.has(group.name)) {
                splat.trafficLightGroups.push({
                    name: group.name,
                    phases: (group.phases || []).map((p: any) => ({
                        lights: p.lights || [],
                        green: p.green ?? 15.0,
                        yellow: p.yellow ?? 5.0
                    }))
                });
            }
        }
    }

    splat.updateLabels();
};

export { generateLightsYaml, downloadLightsYaml, importLightsYaml };
