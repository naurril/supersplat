import { BooleanInput, Button, Container, Label, NumericInput, TextInput } from '@playcanvas/pcui';
import { Color } from 'playcanvas';

import { Events } from '../events';
import { BULB_NAMES, Splat, type TrafficLightGroup } from '../splat';
import { localize } from './localization';
import hiddenSvg from './svg/hidden.svg';
import shownSvg from './svg/shown.svg';
import { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

const toHex = (v: number) => {
    const h = Math.round(v * 255).toString(16);
    return h.length < 2 ? `0${h}` : h;
};

// predefined vehicle light labels: id, name, color
const prebuiltLabels: { id: number, name: string, color: Color }[] = [
    { id: 0x1, name: 'Position', color: new Color(0.9, 0.9, 0.3) },
    { id: 0x2, name: 'Low Beam', color: new Color(1.0, 1.0, 0.7) },
    { id: 0x4, name: 'High Beam', color: new Color(1.0, 1.0, 1.0) },
    { id: 0x8, name: 'Brake', color: new Color(0.9, 0.1, 0.1) },
    { id: 0x10, name: 'Right Blinker', color: new Color(1.0, 0.6, 0.0) },
    { id: 0x20, name: 'Left Blinker', color: new Color(1.0, 0.5, 0.0) },
    { id: 0x40, name: 'Reverse', color: new Color(0.9, 0.9, 0.9) },
    { id: 0x80, name: 'Fog', color: new Color(0.7, 0.7, 0.2) },
    { id: 0x100, name: 'Special', color: new Color(0.2, 0.4, 0.9) }
];

const prebuiltLabelNames = prebuiltLabels.map(l => l.name);

class LabelPanel extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'label-panel',
            class: 'panel',
            hidden: true
        };

        super(args);

        // stop pointer events bubbling
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        // header

        const header = new Container({
            class: 'panel-header'
        });

        const icon = new Label({
            class: 'panel-header-icon',
            text: '\uE164'
        });

        const headerLabel = new Label({
            class: 'panel-header-label',
            text: localize('panel.labels')
        });

        header.append(icon);
        header.append(headerLabel);

        // show labels toggle

        const toggleRow = new Container({
            class: 'label-panel-row'
        });

        const toggleLabel = new Label({
            text: localize('panel.labels.show-labels'),
            class: 'label-panel-row-label'
        });

        const showLabelsToggle = new BooleanInput({
            type: 'toggle',
            value: false
        });

        toggleRow.append(toggleLabel);
        toggleRow.append(showLabelsToggle);

        // isolate selected toggle

        const isolateRow = new Container({
            class: 'label-panel-row'
        });

        const isolateLabel = new Label({
            text: localize('panel.labels.isolate-selected'),
            class: 'label-panel-row-label'
        });

        const isolateToggle = new BooleanInput({
            type: 'toggle',
            value: false
        });

        isolateRow.append(isolateLabel);
        isolateRow.append(isolateToggle);

        // action toolbar: assign / select / deselect — operates on active label

        const toolbar = new Container({
            class: 'label-toolbar'
        });

        const assignBtn = new Button({
            text: localize('panel.labels.assign'),
            class: ['label-toolbar-btn', 'label-assign-btn']
        });

        const replaceBtn = new Button({
            text: localize('panel.labels.replace'),
            class: ['label-toolbar-btn', 'label-replace-btn']
        });

        const removeBtn = new Button({
            text: localize('panel.labels.remove'),
            class: ['label-toolbar-btn', 'label-remove-btn']
        });

        const selectBtn = new Button({
            text: localize('panel.labels.select'),
            class: 'label-toolbar-btn'
        });

        const deselectBtn = new Button({
            text: localize('panel.labels.deselect'),
            class: 'label-toolbar-btn'
        });

        toolbar.append(assignBtn);
        toolbar.append(replaceBtn);
        toolbar.append(removeBtn);
        toolbar.append(selectBtn);
        toolbar.append(deselectBtn);

        // label list container

        const listContainer = new Container({
            class: 'label-list-container'
        });

        // bottom buttons

        const bottomBar = new Container({
            class: 'label-bottom-bar'
        });

        const addAllBtn = new Button({
            text: localize('panel.labels.add-all-lights'),
            class: 'label-toolbar-btn'
        });

        const addBtn = new Button({
            text: localize('panel.labels.add-label'),
            class: 'label-toolbar-btn'
        });

        bottomBar.append(addAllBtn);
        bottomBar.append(addBtn);

        // traffic light section

        const tlSectionHeader = new Container({ class: 'label-section-header' });
        const tlSectionLabel = new Label({ text: localize('panel.labels.traffic-lights'), class: 'label-section-title' });
        tlSectionHeader.append(tlSectionLabel);

        const tlListContainer = new Container({ class: ['label-list-container', 'tl-list-container'] });

        const tlBottomBar = new Container({ class: 'label-bottom-bar' });
        const addTlBtn = new Button({
            text: localize('panel.labels.add-traffic-light'),
            class: 'label-toolbar-btn'
        });
        tlBottomBar.append(addTlBtn);

        // groups section

        const groupSectionHeader = new Container({ class: 'label-section-header' });
        const groupSectionLabel = new Label({ text: localize('panel.labels.groups'), class: 'label-section-title' });
        groupSectionHeader.append(groupSectionLabel);

        const groupListContainer = new Container({ class: ['label-list-container', 'group-list-container'] });

        const groupBottomBar = new Container({ class: 'label-bottom-bar' });
        const addGroupBtn = new Button({
            text: localize('panel.labels.add-group'),
            class: 'label-toolbar-btn'
        });
        const importBtn = new Button({
            text: localize('panel.labels.import-lights-yaml'),
            class: 'label-toolbar-btn'
        });
        const exportBtn = new Button({
            text: localize('panel.labels.export-lights-yaml'),
            class: 'label-toolbar-btn'
        });
        groupBottomBar.append(addGroupBtn);
        groupBottomBar.append(importBtn);
        groupBottomBar.append(exportBtn);

        // scrollable body wraps all list content
        const scrollBody = new Container({ class: 'label-scroll-body' });
        scrollBody.append(listContainer);
        scrollBody.append(bottomBar);
        scrollBody.append(tlSectionHeader);
        scrollBody.append(tlListContainer);
        scrollBody.append(tlBottomBar);
        scrollBody.append(groupSectionHeader);
        scrollBody.append(groupListContainer);
        scrollBody.append(groupBottomBar);

        this.append(header);
        this.append(toggleRow);
        this.append(isolateRow);
        this.append(toolbar);
        this.append(scrollBody);

        // no-selection hint
        const noSelectionHint = new Label({
            class: 'label-panel-hint',
            text: 'Select a splat first'
        });
        this.append(noSelectionHint);

        // state

        let selected: Splat = null;
        let activeLabelId: number = -1;

        const updateToolbarState = () => {
            assignBtn.enabled = activeLabelId >= 0;
            replaceBtn.enabled = activeLabelId > 0;
            removeBtn.enabled = activeLabelId > 0;
            selectBtn.enabled = activeLabelId >= 0;
            deselectBtn.enabled = activeLabelId >= 0;
        };

        const setActiveLabel = (id: number) => {
            activeLabelId = id;
            // update highlight on rows in all containers
            for (const container of [listContainer, tlListContainer]) {
                const rows = container.dom.querySelectorAll('.label-item');
                rows.forEach((row: Element) => {
                    const rowId = parseInt(row.getAttribute('data-label-id'), 10);
                    row.classList.toggle('label-item-active', rowId === id);
                });
            }
            updateToolbarState();
        };

        // track collapsed traffic lights
        const collapsedTls = new Set<string>();
        let nextTlCounter = 1;

        const rebuildList = () => {
            listContainer.clear();
            tlListContainer.clear();
            groupListContainer.clear();

            // refresh selection
            const current = events.invoke('selection') as Splat;
            if (current) {
                selected = current;
            }

            const hasSplat = !!selected;
            const hasTl = hasSplat && selected.trafficLights.size > 0;

            if (!hasSplat) {
                noSelectionHint.hidden = false;
                toolbar.hidden = true;
                bottomBar.hidden = true;
                tlSectionHeader.hidden = true;
                tlListContainer.hidden = true;
                tlBottomBar.hidden = true;
                groupSectionHeader.hidden = true;
                groupListContainer.hidden = true;
                groupBottomBar.hidden = true;
                return;
            }

            noSelectionHint.hidden = true;
            toolbar.hidden = false;
            bottomBar.hidden = false;
            tlSectionHeader.hidden = false;
            tlListContainer.hidden = false;
            tlBottomBar.hidden = false;
            groupSectionHeader.hidden = !hasTl;
            groupListContainer.hidden = !hasTl;
            groupBottomBar.hidden = !hasTl;

            // validate active label still exists
            if (activeLabelId > 0 && !selected.labels.has(activeLabelId)) {
                activeLabelId = -1;
            }

            // build a label row (for vehicle lights + unlabeled)
            const buildRow = (id: number, name: string, color: Color | null, isUnlabeled: boolean, container: Container) => {
                const row = new Container({ class: 'label-item' });
                row.dom.setAttribute('data-label-id', String(id));
                if (id === activeLabelId) {
                    row.dom.classList.add('label-item-active');
                }

                // click row to set active label
                row.dom.addEventListener('click', (e: MouseEvent) => {
                    if ((e.target as HTMLElement).closest('.label-eye-btn, .label-color-swatch, .label-name, .label-delete-btn')) return;
                    setActiveLabel(id);
                });

                // eye icon (visibility toggle)
                const isVisible = selected.isLabelVisible(id);
                const eyeBtn = document.createElement('div');
                eyeBtn.className = 'label-eye-btn';
                eyeBtn.title = isVisible ? 'Hide' : 'Show';
                eyeBtn.appendChild(createSvg(isVisible ? shownSvg : hiddenSvg));
                eyeBtn.addEventListener('click', (e: MouseEvent) => {
                    e.stopPropagation();
                    selected.toggleLabelVisibility(id);
                });
                row.dom.appendChild(eyeBtn);

                // color swatch
                if (color) {
                    const swatch = document.createElement('div');
                    swatch.className = 'label-color-swatch';
                    swatch.style.backgroundColor = `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`;

                    const colorInput = document.createElement('input');
                    colorInput.type = 'color';
                    colorInput.style.display = 'none';
                    colorInput.value = `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
                    swatch.appendChild(colorInput);

                    swatch.addEventListener('click', () => colorInput.click());
                    colorInput.addEventListener('input', () => {
                        const hex = colorInput.value;
                        const r = parseInt(hex.slice(1, 3), 16) / 255;
                        const g = parseInt(hex.slice(3, 5), 16) / 255;
                        const b = parseInt(hex.slice(5, 7), 16) / 255;
                        selected.setLabelColor(id, new Color(r, g, b));
                        swatch.style.backgroundColor = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
                    });

                    row.dom.appendChild(swatch);
                } else {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'label-color-swatch label-color-none';
                    row.dom.appendChild(placeholder);
                }

                // name (selectable text, double-click to rename via dropdown)
                const nameLabel = new Label({
                    class: 'label-name',
                    text: name
                });

                if (!isUnlabeled) {
                    nameLabel.dom.addEventListener('dblclick', () => {
                        const selectEl = document.createElement('select');
                        selectEl.className = 'label-rename-input';

                        for (const prebuiltName of prebuiltLabelNames) {
                            const opt = document.createElement('option');
                            opt.value = prebuiltName;
                            opt.text = prebuiltName;
                            if (prebuiltName === name) opt.selected = true;
                            selectEl.appendChild(opt);
                        }

                        nameLabel.dom.style.display = 'none';
                        nameLabel.dom.parentElement.insertBefore(selectEl, nameLabel.dom.nextSibling);
                        selectEl.focus();

                        let done = false;
                        const finish = (save: boolean) => {
                            if (done) return;
                            done = true;
                            const newName = selectEl.value;
                            selectEl.remove();
                            nameLabel.dom.style.display = '';
                            if (save && newName && selected) {
                                selected.renameLabel(id, newName);
                            }
                        };

                        selectEl.addEventListener('change', () => finish(true));
                        selectEl.addEventListener('keydown', (e: KeyboardEvent) => {
                            if (e.key === 'Escape') finish(false);
                        });
                        selectEl.addEventListener('blur', () => finish(true));
                    });
                }

                row.append(nameLabel);

                // count
                const count = selected.getLabelCount(id);
                const countLabel = new Label({
                    class: 'label-count',
                    text: `${count}`
                });
                row.append(countLabel);

                // delete button (not for unlabeled)
                if (!isUnlabeled) {
                    const deleteBtn = new Label({
                        class: ['label-action-btn', 'label-delete-btn'],
                        text: '\uE118'
                    });
                    deleteBtn.dom.title = localize('panel.labels.delete-label');
                    deleteBtn.on('click', () => {
                        if (selected) {
                            if (id === activeLabelId) activeLabelId = -1;
                            selected.removeLabel(id);
                        }
                    });
                    row.append(deleteBtn);
                }

                container.append(row);
            };

            // build a bulb row (for traffic light bulbs)
            const buildBulbRow = (container: Container, labelId: number, bulbName: string, color: Color) => {
                const row = new Container({ class: ['label-item', 'tl-bulb-row'] });
                row.dom.setAttribute('data-label-id', String(labelId));
                if (labelId === activeLabelId) {
                    row.dom.classList.add('label-item-active');
                }

                row.dom.addEventListener('click', (e: MouseEvent) => {
                    if ((e.target as HTMLElement).closest('.label-eye-btn, .label-color-swatch')) return;
                    setActiveLabel(labelId);
                });

                // eye icon
                const isVisible = selected.isLabelVisible(labelId);
                const eyeBtn = document.createElement('div');
                eyeBtn.className = 'label-eye-btn';
                eyeBtn.title = isVisible ? 'Hide' : 'Show';
                eyeBtn.appendChild(createSvg(isVisible ? shownSvg : hiddenSvg));
                eyeBtn.addEventListener('click', (e: MouseEvent) => {
                    e.stopPropagation();
                    selected.toggleLabelVisibility(labelId);
                });
                row.dom.appendChild(eyeBtn);

                // color swatch
                const swatch = document.createElement('div');
                swatch.className = 'label-color-swatch';
                swatch.style.backgroundColor = `rgb(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)})`;
                row.dom.appendChild(swatch);

                // bulb name
                const nameLabel = new Label({ class: 'label-name', text: bulbName });
                row.append(nameLabel);

                // count
                const count = selected.getLabelCount(labelId);
                const countLabel = new Label({ class: 'label-count', text: `${count}` });
                row.append(countLabel);

                container.append(row);
            };

            // build a traffic light entry (header + bulb rows)
            const buildTrafficLightEntry = (name: string) => {
                const tl = selected.trafficLights.get(name);
                if (!tl) return;

                const collapsed = collapsedTls.has(name);

                // header row
                const headerRow = new Container({ class: ['label-item', 'tl-header-row'] });

                // expand/collapse toggle
                const toggle = new Label({
                    class: 'tl-toggle',
                    text: collapsed ? '\u25B6' : '\u25BC'
                });
                headerRow.append(toggle);

                // traffic light name (double-click to rename)
                const nameLabel = new Label({ class: ['label-name', 'tl-name'], text: name });
                nameLabel.dom.addEventListener('dblclick', () => {
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'label-rename-input';
                    input.value = name;

                    nameLabel.dom.style.display = 'none';
                    nameLabel.dom.parentElement.insertBefore(input, nameLabel.dom.nextSibling);
                    input.focus();
                    input.select();

                    let done = false;
                    const finish = (save: boolean) => {
                        if (done) return;
                        done = true;
                        const newName = input.value.trim();
                        input.remove();
                        nameLabel.dom.style.display = '';
                        if (save && newName && newName !== name && selected) {
                            if (collapsedTls.has(name)) {
                                collapsedTls.delete(name);
                                collapsedTls.add(newName);
                            }
                            selected.renameTrafficLight(name, newName);
                        }
                    };

                    input.addEventListener('keydown', (e: KeyboardEvent) => {
                        if (e.key === 'Enter') finish(true);
                        if (e.key === 'Escape') finish(false);
                    });
                    input.addEventListener('blur', () => finish(true));
                });
                headerRow.append(nameLabel);

                // delete button
                const deleteBtn = new Label({
                    class: ['label-action-btn', 'label-delete-btn'],
                    text: '\uE118'
                });
                deleteBtn.dom.title = localize('panel.labels.delete-traffic-light');
                deleteBtn.on('click', () => {
                    if (selected) {
                        // clear active label if it belongs to this traffic light
                        if (tl.red_bulb === activeLabelId || tl.yellow_bulb === activeLabelId || tl.green_bulb === activeLabelId) {
                            activeLabelId = -1;
                        }
                        collapsedTls.delete(name);
                        selected.deleteTrafficLight(name);
                    }
                });
                headerRow.append(deleteBtn);

                // click header to toggle collapse
                headerRow.dom.addEventListener('click', (e: MouseEvent) => {
                    if ((e.target as HTMLElement).closest('.label-name, .label-delete-btn')) return;
                    if (collapsed) {
                        collapsedTls.delete(name);
                    } else {
                        collapsedTls.add(name);
                    }
                    rebuildList();
                });

                tlListContainer.append(headerRow);

                // bulb rows (if expanded)
                if (!collapsed) {
                    for (const bulbName of BULB_NAMES) {
                        const labelId = tl[bulbName];
                        const label = selected.labels.get(labelId);
                        if (label) {
                            buildBulbRow(tlListContainer, labelId, bulbName, label.color);
                        }
                    }
                }
            };

            // build a group entry
            const buildGroupEntry = (group: TrafficLightGroup, groupIdx: number) => {
                const groupRow = new Container({ class: 'tl-group-entry' });

                // group header
                const groupHeader = new Container({ class: 'tl-group-header' });
                const groupName = new Label({ class: 'label-name', text: group.name });
                groupName.dom.addEventListener('dblclick', () => {
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'label-rename-input';
                    input.value = group.name;

                    groupName.dom.style.display = 'none';
                    groupName.dom.parentElement.insertBefore(input, groupName.dom.nextSibling);
                    input.focus();
                    input.select();

                    let done = false;
                    const finish = (save: boolean) => {
                        if (done) return;
                        done = true;
                        const newName = input.value.trim();
                        input.remove();
                        groupName.dom.style.display = '';
                        if (save && newName && selected) {
                            group.name = newName;
                            rebuildList();
                        }
                    };

                    input.addEventListener('keydown', (e: KeyboardEvent) => {
                        if (e.key === 'Enter') finish(true);
                        if (e.key === 'Escape') finish(false);
                    });
                    input.addEventListener('blur', () => finish(true));
                });
                groupHeader.append(groupName);

                const deleteGroupBtn = new Label({
                    class: ['label-action-btn', 'label-delete-btn'],
                    text: '\uE118'
                });
                deleteGroupBtn.dom.title = localize('panel.labels.delete-group');
                deleteGroupBtn.on('click', () => {
                    if (selected) {
                        selected.trafficLightGroups.splice(groupIdx, 1);
                        rebuildList();
                    }
                });
                groupHeader.append(deleteGroupBtn);
                groupRow.append(groupHeader);

                // phases
                for (let pi = 0; pi < group.phases.length; pi++) {
                    const phase = group.phases[pi];
                    const phaseRow = new Container({ class: 'tl-phase-row' });

                    const phaseLabel = new Label({ class: 'tl-phase-label', text: `Phase ${pi + 1}:` });
                    phaseRow.append(phaseLabel);

                    // lights list as text input (comma-separated)
                    const lightsInput = new TextInput({
                        class: 'tl-phase-lights-input',
                        value: phase.lights.join(', '),
                        placeholder: 'tl_name1, tl_name2'
                    });
                    lightsInput.on('change', (value: string) => {
                        phase.lights = value.split(',').map(s => s.trim()).filter(s => s);
                    });
                    phaseRow.append(lightsInput);
                    groupRow.append(phaseRow);

                    // timing row
                    const timingRow = new Container({ class: 'tl-timing-row' });
                    const greenLabel = new Label({ text: localize('panel.labels.green-duration'), class: 'tl-timing-label' });
                    const greenInput = new NumericInput({ class: 'tl-timing-input', value: phase.green, min: 0.1, step: 0.5, precision: 1 });
                    greenInput.on('change', (value: number) => {
                        phase.green = value;
                    });
                    const yellowLabel = new Label({ text: localize('panel.labels.yellow-duration'), class: 'tl-timing-label' });
                    const yellowInput = new NumericInput({ class: 'tl-timing-input', value: phase.yellow, min: 0.1, step: 0.5, precision: 1 });
                    yellowInput.on('change', (value: number) => {
                        phase.yellow = value;
                    });

                    timingRow.append(greenLabel);
                    timingRow.append(greenInput);
                    timingRow.append(yellowLabel);
                    timingRow.append(yellowInput);
                    groupRow.append(timingRow);
                }

                // add phase button
                const addPhaseBtn = new Button({
                    text: localize('panel.labels.add-phase'),
                    class: ['label-toolbar-btn', 'tl-add-phase-btn']
                });
                addPhaseBtn.on('click', () => {
                    group.phases.push({ lights: [], green: 15.0, yellow: 5.0 });
                    rebuildList();
                });
                groupRow.append(addPhaseBtn);

                groupListContainer.append(groupRow);
            };

            // unlabeled row
            buildRow(0, localize('panel.labels.unlabeled'), null, true, listContainer);

            // user labels (excluding traffic light bulb labels)
            selected.labels.forEach((label, id) => {
                if (!selected.isTrafficLightLabel(id)) {
                    buildRow(id, label.name, label.color, false, listContainer);
                }
            });

            // traffic light entries
            selected.trafficLights.forEach((_tl, name) => {
                buildTrafficLightEntry(name);
            });

            // group entries
            for (let i = 0; i < selected.trafficLightGroups.length; i++) {
                buildGroupEntry(selected.trafficLightGroups[i], i);
            }

            updateToolbarState();
        };

        // toolbar actions

        assignBtn.on('click', () => {
            if (activeLabelId >= 0) {
                events.fire('label.assign', activeLabelId);
            }
        });

        replaceBtn.on('click', () => {
            if (activeLabelId > 0) {
                events.fire('label.replace', activeLabelId);
            }
        });

        removeBtn.on('click', () => {
            if (activeLabelId > 0) {
                events.fire('label.removeSelected', activeLabelId);
            }
        });

        selectBtn.on('click', () => {
            if (activeLabelId >= 0) {
                events.fire('label.select', activeLabelId, 'set');
            }
        });

        deselectBtn.on('click', () => {
            if (activeLabelId >= 0) {
                events.fire('label.select', activeLabelId, 'remove');
            }
        });

        // show labels toggle

        showLabelsToggle.on('change', (value: boolean) => {
            events.fire('view.setShowLabels', value);
        });

        events.on('view.showLabels', (value: boolean) => {
            showLabelsToggle.value = value;
        });

        isolateToggle.on('change', (value: boolean) => {
            events.fire('view.setIsolateSelected', value);
        });

        events.on('view.isolateSelected', (value: boolean) => {
            isolateToggle.value = value;
        });

        // add all predefined light labels

        addAllBtn.on('click', () => {
            selected = events.invoke('selection') as Splat;
            if (!selected) return;
            for (const preset of prebuiltLabels) {
                selected.createLabelWithId(preset.id, preset.name, preset.color);
            }
            rebuildList();
        });

        // add single custom label

        addBtn.on('click', () => {
            selected = events.invoke('selection') as Splat;
            if (selected) {
                selected.createLabel(localize('panel.labels.new-label'));
                rebuildList();
            }
        });

        // add traffic light

        addTlBtn.on('click', () => {
            selected = events.invoke('selection') as Splat;
            if (selected) {
                let name: string;
                do {
                    name = `tl_${nextTlCounter++}`;
                } while (selected.trafficLights.has(name));
                selected.createTrafficLight(name);
                rebuildList();
            }
        });

        // add group

        addGroupBtn.on('click', () => {
            selected = events.invoke('selection') as Splat;
            if (selected) {
                let gIdx = selected.trafficLightGroups.length + 1;
                const existingNames = new Set(selected.trafficLightGroups.map(g => g.name));
                let gName: string;
                do {
                    gName = `intersection_${gIdx++}`;
                } while (existingNames.has(gName));
                selected.trafficLightGroups.push({
                    name: gName,
                    phases: [{ lights: [], green: 15.0, yellow: 5.0 }]
                });
                rebuildList();
            }
        });

        // import .lights.yaml

        importBtn.on('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.yaml,.yml';
            input.addEventListener('change', () => {
                const file = input.files?.[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = () => {
                        events.fire('trafficLight.import', reader.result as string);
                        rebuildList();
                    };
                    reader.readAsText(file);
                }
            });
            input.click();
        });

        // export .lights.yaml

        exportBtn.on('click', () => {
            events.fire('trafficLight.export');
        });

        // rebuild on relevant events

        events.on('selection.changed', (splat: Splat) => {
            selected = splat;
            rebuildList();
        });

        events.on('splat.labelsChanged', () => {
            rebuildList();
        });

        events.on('splat.trafficLightsChanged', () => {
            rebuildList();
        });

        events.on('splat.stateChanged', () => {
            rebuildList();
        });

        // handle panel visibility

        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                this.hidden = !visible;
                events.fire('labelPanel.visible', visible);
            }
        };

        events.function('labelPanel.visible', () => {
            return !this.hidden;
        });

        events.on('labelPanel.setVisible', (visible: boolean) => {
            setVisible(visible);
        });

        events.on('labelPanel.toggleVisible', () => {
            setVisible(this.hidden);
        });

        events.on('labelPanel.visible', (visible: boolean) => {
            if (visible) {
                const current = events.invoke('selection') as Splat;
                if (current && current !== selected) {
                    selected = current;
                    rebuildList();
                }
            }
        });

        tooltips.register(assignBtn, 'Add selection to label', 'bottom');
        tooltips.register(replaceBtn, 'Label = exactly selection', 'bottom');
        tooltips.register(removeBtn, 'Unlabel selected points', 'bottom');
        tooltips.register(addAllBtn, localize('panel.labels.add-all-lights'), 'bottom');
    }
}

export { LabelPanel };
