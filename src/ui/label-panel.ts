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

// default label colors
const defaultColors = [
    new Color(0.9, 0.2, 0.2),
    new Color(0.2, 0.7, 0.2),
    new Color(0.2, 0.4, 0.9),
    new Color(0.9, 0.7, 0.1),
    new Color(0.8, 0.3, 0.8),
    new Color(0.2, 0.8, 0.8),
    new Color(0.9, 0.5, 0.2),
    new Color(0.5, 0.9, 0.3)
];

const toHex = (v: number) => {
    const h = Math.round(v * 255).toString(16);
    return h.length < 2 ? `0${h}` : h;
};

let colorIndex = 0;

const nextColor = () => {
    const color = defaultColors[colorIndex % defaultColors.length];
    colorIndex++;
    return color.clone();
};

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

        // add label button

        const addBtn = new Button({
            text: localize('panel.labels.add-label'),
            class: 'label-panel-add-btn'
        });

        // label list container

        const listContainer = new Container({
            class: 'label-list-container'
        });

        this.append(header);
        this.append(toggleRow);
        this.append(addBtn);
        this.append(listContainer);

        // no-selection hint
        const noSelectionHint = new Label({
            class: 'label-panel-hint',
            text: 'Select a splat first'
        });
        this.append(noSelectionHint);

        // state

        let selected: Splat = null;

        const rebuildList = () => {
            listContainer.clear();

            // refresh selection
            const current = events.invoke('selection') as Splat;
            if (current) {
                selected = current;
            }

            if (!selected) {
                noSelectionHint.hidden = false;
                return;
            }

            noSelectionHint.hidden = true;

            const buildRow = (id: number, name: string, color: Color | null, isUnlabeled: boolean) => {
                const row = new Container({ class: 'label-item' });

                // click row to select gaussians with this label
                row.dom.addEventListener('click', (e: MouseEvent) => {
                    if ((e.target as HTMLElement).closest('.label-action-btn, .label-color-swatch, .label-eye-btn')) return;
                    events.fire('label.select', id, 'set');
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
                    // empty swatch placeholder for unlabeled
                    const placeholder = document.createElement('div');
                    placeholder.className = 'label-color-swatch label-color-none';
                    row.dom.appendChild(placeholder);
                }

                // name
                const nameLabel = new Label({
                    class: 'label-name',
                    text: name
                });

                if (!isUnlabeled) {
                    // double-click to rename
                    nameLabel.dom.addEventListener('dblclick', () => {
                        const inputEl = document.createElement('input');
                        inputEl.type = 'text';
                        inputEl.value = name;
                        inputEl.className = 'label-rename-input';
                        nameLabel.dom.style.display = 'none';
                        nameLabel.dom.parentElement.insertBefore(inputEl, nameLabel.dom.nextSibling);
                        inputEl.focus();
                        inputEl.select();

                        let done = false;
                        const finish = (save: boolean) => {
                            if (done) return;
                            done = true;
                            const newName = inputEl.value.trim();
                            inputEl.remove();
                            nameLabel.dom.style.display = '';
                            if (save && newName && selected) {
                                selected.renameLabel(id, newName);
                            }
                        };

                        inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                            if (e.key === 'Enter') finish(true);
                            if (e.key === 'Escape') finish(false);
                        });
                        inputEl.addEventListener('blur', () => finish(true));
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

                if (!isUnlabeled) {
                    // assign button
                    const assignBtn = new Label({
                        class: 'label-action-btn',
                        text: '\uE120'
                    });
                    assignBtn.dom.title = localize('panel.labels.assign');
                    assignBtn.on('click', () => {
                        events.fire('label.assign', id);
                    });
                    row.append(assignBtn);
                }

                if (!isUnlabeled) {
                    // delete button
                    const deleteBtn = new Label({
                        class: ['label-action-btn', 'label-delete-btn'],
                        text: '\uE118'
                    });
                    deleteBtn.dom.title = localize('panel.labels.delete-label');
                    deleteBtn.on('click', () => {
                        if (selected) {
                            selected.removeLabel(id);
                        }
                    });
                    row.append(deleteBtn);
                }

                listContainer.append(row);
            };

            // unlabeled row (label 0)
            buildRow(0, localize('panel.labels.unlabeled'), null, true);

            // user labels
            selected.labels.forEach((label, id) => {
                buildRow(id, label.name, label.color, false);
            });
        };

        // events

        showLabelsToggle.on('change', (value: boolean) => {
            events.fire('view.setShowLabels', value);
        });

        events.on('view.showLabels', (value: boolean) => {
            showLabelsToggle.value = value;
        });

        addBtn.on('click', () => {
            // always try to get current selection
            selected = events.invoke('selection') as Splat;
            if (selected) {
                selected.createLabel(localize('panel.labels.new-label'), nextColor());
                rebuildList();
            } else {
                console.warn('Label: no splat selected');
            }
        });

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

        // when panel becomes visible, query current selection
        events.on('labelPanel.visible', (visible: boolean) => {
            if (visible) {
                const current = events.invoke('selection') as Splat;
                if (current && current !== selected) {
                    selected = current;
                    rebuildList();
                }
            }
        });

        tooltips.register(addBtn, localize('panel.labels.add-label'), 'bottom');
    }
}

export { LabelPanel };
