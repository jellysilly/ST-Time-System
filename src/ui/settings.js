// Настройки описаны одной схемой и рисуются в двух местах:
//  • 'book' — страница «Настройки» в блокноте (стиль дизайна);
//  • 'st'   — панель в меню «Расширения» SillyTavern (родной стиль ST).

import { h, switchButton, timeInput } from './dom.js';
import { settings, setSetting, onChange, resetSettings } from '../store.js';
import { fmtHM, parseHM } from '../calendar.js';
import { DEFAULT_TEMPLATE, DEFAULT_TAG_RULE, VARIABLES, promptLang } from '../prompt.js';
import { t } from '../i18n.js';
import { confirmDialog } from './dialogs.js';

// В схеме — ключи переводов (src/i18n.js), а не готовый текст.
export const SCHEMA = [
    {
        group: 'main', key: 'uiLang', type: 'select', label: 'set.uiLang',
        options: [['auto', 'opt.lang.auto'], ['ru', 'opt.lang.ru'], ['en', 'opt.lang.en']],
    },
    {
        group: 'main', key: 'detection', type: 'select', label: 'set.detection',
        options: [['tag', 'opt.detection.tag'], ['analysis', 'opt.detection.analysis'], ['off', 'opt.detection.off']],
        hint: (s) => `hint.detection.${s.detection}`,
    },
    {
        group: 'main', key: 'confirm', type: 'select', label: 'set.confirm',
        options: [['off', 'opt.confirm.off'], ['day', 'opt.confirm.day'], ['big', 'opt.confirm.big'], ['always', 'opt.confirm.always']],
        hint: 'hint.confirm',
    },
    { group: 'main', key: 'autoAdvance', type: 'toggle', label: 'auto.title', hint: 'hint.autoAdvance' },
    { group: 'main', key: 'autoMinutes', type: 'number', label: 'set.autoMinutes', min: 0, max: 720, showIf: (s) => s.autoAdvance },
    { group: 'main', key: 'wakeTime', type: 'time', label: 'set.wakeTime', hint: 'hint.wakeTime' },
    { group: 'main', key: 'hideTags', type: 'toggle', label: 'set.hideTags' },
    { group: 'main', key: 'showStamps', type: 'toggle', label: 'set.showStamps', hint: 'hint.showStamps' },
    { group: 'main', key: 'showWidget', type: 'toggle', label: 'set.showWidget', hint: 'hint.showWidget' },

    {
        group: 'prompt', key: 'injectPosition', type: 'select', label: 'set.injectPosition',
        options: [['chat', 'opt.pos.chat'], ['after', 'opt.pos.after'], ['before', 'opt.pos.before']],
    },
    { group: 'prompt', key: 'injectDepth', type: 'number', label: 'set.injectDepth', min: 0, max: 100, showIf: (s) => s.injectPosition === 'chat', hint: 'hint.injectDepth' },
    {
        group: 'prompt', key: 'injectRole', type: 'select', label: 'set.injectRole',
        options: [['system', 'opt.role.system'], ['user', 'opt.role.user'], ['assistant', 'opt.role.assistant']], showIf: (s) => s.injectPosition === 'chat',
    },
    {
        group: 'prompt', key: 'promptLang', type: 'select', label: 'set.promptLang',
        options: [['auto', 'opt.plang.auto'], ['ru', 'opt.lang.ru'], ['en', 'opt.lang.en']],
    },
    { group: 'prompt', key: 'includeNpcs', type: 'toggle', label: 'set.includeNpcs' },
    { group: 'prompt', key: 'includeEvents', type: 'toggle', label: 'set.includeEvents' },
    {
        group: 'prompt', key: 'template', type: 'textarea', label: 'set.template', rows: 6,
        defaultText: () => DEFAULT_TEMPLATE[promptLang()],
        hint: 'hint.template', hintVars: () => ({ vars: VARIABLES.join(' ') }),
    },
    {
        group: 'prompt', key: 'tagRule', type: 'textarea', label: 'set.tagRule', rows: 5,
        defaultText: () => DEFAULT_TAG_RULE[promptLang()], showIf: (s) => s.detection === 'tag',
        hint: 'hint.tagRule',
    },
];

function readValue(def, el) {
    switch (def.type) {
        case 'toggle': return el.type === 'checkbox' ? el.checked : el.getAttribute('aria-pressed') === 'true';
        case 'number': {
            const n = Math.round(Number(el.value));
            if (!Number.isFinite(n)) return undefined;
            return Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, n));
        }
        case 'time': return parseHM(el.value) ?? undefined;
        default: return el.value;
    }
}

function writeValue(def, el, value) {
    if (document.activeElement === el) return;
    switch (def.type) {
        case 'toggle':
            if (el.type === 'checkbox') el.checked = !!value;
            else { el.setAttribute('aria-pressed', value ? 'true' : 'false'); el.classList.toggle('is-on', !!value); }
            break;
        case 'time': if (el.setMinutes) el.setMinutes(value); else el.value = fmtHM(value); break;
        default: if (el.value !== String(value ?? '')) el.value = String(value ?? '');
    }
}

function buildControl(def, variant) {
    const s = settings();
    const id = `ts_set_${def.key}_${variant}`;
    const commit = (el) => {
        const v = readValue(def, el);
        if (v !== undefined) setSetting(def.key, v);
    };
    switch (def.type) {
        case 'toggle': {
            if (variant === 'st') {
                const el = h('input', { type: 'checkbox', id, checked: !!s[def.key] });
                el.addEventListener('change', () => commit(el));
                return el;
            }
            return switchButton({ on: !!s[def.key], label: t(def.label), onToggle: (v) => setSetting(def.key, v) });
        }
        case 'select': {
            const el = h('select', { id, class: variant === 'st' ? 'text_pole' : 'ts-input' },
                def.options.map(([v, l]) => h('option', { value: v, selected: s[def.key] === v }, t(l))));
            el.addEventListener('change', () => commit(el));
            return el;
        }
        case 'number': {
            const el = h('input', { id, type: 'number', inputmode: 'numeric', min: def.min, max: def.max, value: s[def.key], class: variant === 'st' ? 'text_pole' : 'ts-input ts-input-num' });
            el.addEventListener('change', () => commit(el));
            return el;
        }
        case 'time': {
            const el = timeInput(s[def.key], { cls: variant === 'st' ? 'text_pole' : 'ts-input ts-input-num', label: t(def.label), onCommit: (m) => setSetting(def.key, m) });
            el.id = id;
            return el;
        }
        case 'textarea': {
            const el = h('textarea', { id, rows: def.rows ?? 5, class: variant === 'st' ? 'text_pole textarea_compact' : 'ts-input ts-textarea-mono', placeholder: def.defaultText?.() ?? '', spellcheck: 'false' }, s[def.key] ?? '');
            el.addEventListener('input', () => commit(el));
            return el;
        }
        default: return h('span');
    }
}

function textareaTools(def, control, variant) {
    const btnCls = variant === 'st' ? 'menu_button menu_button_icon' : 'ts-btn ts-btn-outline ts-btn-sm';
    const load = h('button', { type: 'button', class: btnCls, title: t('set.loadDefaultTitle') }, t('set.loadDefault'));
    const clear = h('button', { type: 'button', class: btnCls, title: t('set.clearTitle') }, t('set.clear'));
    load.addEventListener('click', () => { control.value = def.defaultText(); setSetting(def.key, control.value); control.focus(); });
    clear.addEventListener('click', () => { control.value = ''; setSetting(def.key, ''); });
    return h('div', { class: variant === 'st' ? 'flex-container' : 'ts-inline-btns' }, load, clear);
}

function buildField(def, variant) {
    const control = buildControl(def, variant);
    const hintEl = def.hint ? h(variant === 'st' ? 'div' : 'span', { class: variant === 'st' ? 'ts-st-hint' : 'ts-row-hint' }) : null;
    const updateHint = () => {
        if (hintEl) hintEl.textContent = t(typeof def.hint === 'function' ? def.hint(settings()) : def.hint, def.hintVars?.());
    };
    updateHint();

    let el;
    if (variant === 'st') {
        if (def.type === 'toggle') {
            el = h('div', { class: 'ts-st-field' }, h('label', { class: 'checkbox_label', for: control.id }, control, h('span', null, t(def.label))), hintEl);
        } else {
            el = h('div', { class: 'ts-st-field' }, h('label', { for: control.id }, t(def.label)), control, def.type === 'textarea' ? textareaTools(def, control, variant) : null, hintEl);
        }
    } else if (def.type === 'select' || def.type === 'textarea') {
        el = h('div', { class: 'ts-row ts-row-col' },
            h('div', { class: 'ts-row-text' }, h('label', { class: 'ts-row-title', for: control.id }, t(def.label)), hintEl),
            control,
            def.type === 'textarea' ? textareaTools(def, control, variant) : null);
    } else {
        el = h('div', { class: 'ts-row' },
            h('div', { class: 'ts-row-text' }, def.type === 'toggle' ? h('span', { class: 'ts-row-title' }, t(def.label)) : h('label', { class: 'ts-row-title', for: control.id }, t(def.label)), hintEl),
            control);
    }
    return { def, el, control, updateHint };
}

/**
 * @param {'book'|'st'} variant
 * @param {string[]} groups
 */
export function settingsForm(variant, groups = ['main', 'prompt']) {
    const root = h('div', { class: `ts-form ts-form-${variant}` });
    const fields = SCHEMA.filter(d => groups.includes(d.group)).map(d => buildField(d, variant));
    root.append(...fields.map(f => f.el));

    const sync = () => {
        const s = settings();
        for (const f of fields) {
            f.el.hidden = f.def.showIf ? !f.def.showIf(s) : false;
            writeValue(f.def, f.control, s[f.def.key]);
            f.updateHint();
            if (f.def.type === 'textarea') f.control.placeholder = f.def.defaultText?.() ?? '';
        }
    };
    sync();
    const off = onChange((what) => {
        if (!root.isConnected) { off(); return; }
        if (what === 'settings' || what === 'all') sync();
    });
    return root;
}

export async function askResetSettings() {
    const ok = await confirmDialog({ title: t('reset.title'), text: t('reset.text'), ok: t('reset.ok'), danger: true });
    if (ok) resetSettings();
}
