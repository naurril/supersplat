import { BooleanInput, Button, Container, Label } from '@playcanvas/pcui';
import { Color } from 'playcanvas';

import { Events } from '../events';
import { Splat } from '../splat';
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

        this.append(header);
        this.append(toggleRow);
        this.append(isolateRow);
        this.append(toolbar);
        this.append(listContainer);
        this.append(bottomBar);

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
            // update highlight on rows
            const rows = listContainer.dom.querySelectorAll('.label-item');
            rows.forEach((row: Element) => {
                const rowId = parseInt(row.getAttribute('data-label-id'), 10);
                row.classList.toggle('label-item-active', rowId === id);
            });
            updateToolbarState();
        };

        const rebuildList = () => {
            listContainer.clear();

            // refresh selection
            const current = events.invoke('selection') as Splat;
            if (current) {
                selected = current;
            }

            if (!selected) {
                noSelectionHint.hidden = false;
                toolbar.hidden = true;
                bottomBar.hidden = true;
                return;
            }

            noSelectionHint.hidden = true;
            toolbar.hidden = false;
            bottomBar.hidden = false;

            // validate active label still exists
            if (activeLabelId > 0 && !selected.labels.has(activeLabelId)) {
                activeLabelId = -1;
            }

            const buildRow = (id: number, name: string, color: Color | null, isUnlabeled: boolean) => {
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

                listContainer.append(row);
            };

            // unlabeled row
            buildRow(0, localize('panel.labels.unlabeled'), null, true);

            // user labels
            selected.labels.forEach((label, id) => {
                buildRow(id, label.name, label.color, false);
            });

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

        // rebuild on relevant events

        events.on('selection.changed', (splat: Splat) => {
            selected = splat;
            rebuildList();
        });

        events.on('splat.labelsChanged', () => {
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
