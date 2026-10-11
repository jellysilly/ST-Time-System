// Настройки описаны одной схемой и рисуются в двух местах:
//  • 'book' — страница «Настройки» в блокноте (стиль дизайна);
//  • 'st'   — панель в меню «Расширения» SillyTavern (родной стиль ST).

import { h, switchButton, timeInput } from './dom.js';
import { settings, setSetting, onChange, resetSettings } from '../store.js';
import { fmtHM, parseHM } from '../calendar.js';
import { DEFAULT_TEMPLATE, DEFAULT_TAG_RULE, VARIABLES } from '../prompt.js';
import { confirmDialog } from './dialogs.js';

const lang = () => (settings().promptLang === 'en' ? 'en' : 'ru');

export const SCHEMA = [
    {
        group: 'main', key: 'detection', type: 'select', label: 'Как замечать смену времени',
        options: [
            ['tag', 'Модель ставит тег [time: …] (рекомендуется)'],
            ['analysis', 'Отдельный запрос-анализ после ответа'],
            ['off', 'Не отслеживать: авто-ход и вручную'],
        ],
        hint: (s) => ({
            tag: 'Модель в конце ответа пишет [time: 15.10.1247 08:30]. Тег прячется из чата, время записывается в календарь.',
            analysis: 'После каждого ответа уходит короткий отдельный запрос к модели. Точнее для слабых моделей, но тратит токены.',
            off: 'Время двигается только авто-ходом и вашими кнопками.',
        })[s.detection],
    },
    {
        group: 'main', key: 'confirm', type: 'select', label: 'Спрашивать перед записью',
        options: [
            ['off', 'Нет — записывать сразу'],
            ['day', 'Только при смене дня'],
            ['big', 'При смене дня или скачке от 3 часов'],
            ['always', 'Всегда'],
        ],
        hint: 'Откроется окно: принять, поправить дату и время или отклонить. Время можно исправить и позже — нажмите на метку у сообщения.',
    },
    { group: 'main', key: 'autoAdvance', type: 'toggle', label: 'Время идёт само', hint: 'Если в ответе нет отметки — прибавлять минуты за каждый ответ персонажа.' },
    { group: 'main', key: 'autoMinutes', type: 'number', label: 'Минут за ответ', min: 0, max: 720, showIf: (s) => s.autoAdvance },
    { group: 'main', key: 'wakeTime', type: 'time', label: 'Кнопка «Сон» — до', hint: 'Во сколько мир просыпается.' },
    { group: 'main', key: 'hideTags', type: 'toggle', label: 'Прятать теги [time: …] в чате' },
    { group: 'main', key: 'showStamps', type: 'toggle', label: 'Метка времени у сообщений', hint: 'Нажатие на метку — исправить время этого сообщения.' },
    { group: 'main', key: 'showWidget', type: 'toggle', label: 'Плавающие часы', hint: 'Маленькие часы поверх чата. Перетаскиваются, по нажатию открывают блокнот.' },

    {
        group: 'prompt', key: 'injectPosition', type: 'select', label: 'Куда вставлять',
        options: [['chat', 'В чат, на глубину N'], ['after', 'После описания и сценария'], ['before', 'Перед основным промптом']],
    },
    { group: 'prompt', key: 'injectDepth', type: 'number', label: 'Глубина', min: 0, max: 100, showIf: (s) => s.injectPosition === 'chat', hint: '0 — после последнего сообщения, 1 — перед ним и т. д.' },
    {
        group: 'prompt', key: 'injectRole', type: 'select', label: 'Роль',
        options: [['system', 'Система'], ['user', 'Пользователь'], ['assistant', 'Ассистент']], showIf: (s) => s.injectPosition === 'chat',
    },
    { group: 'prompt', key: 'promptLang', type: 'select', label: 'Язык инъекции', options: [['ru', 'Русский'], ['en', 'English']] },
    { group: 'prompt', key: 'includeNpcs', type: 'toggle', label: 'Передавать расписания NPC' },
    { group: 'prompt', key: 'includeEvents', type: 'toggle', label: 'Передавать события дня' },
    {
        group: 'prompt', key: 'template', type: 'textarea', label: 'Шаблон инъекции', rows: 6,
        defaultText: () => DEFAULT_TEMPLATE[lang()],
        hint: 'Пусто — стандартный шаблон. Переменные: ' + VARIABLES.map(([k]) => k).join(' ') + '. Макросы ST ({{user}}, {{char}}) тоже работают.',
    },
    {
        group: 'prompt', key: 'tagRule', type: 'textarea', label: 'Инструкция про тег времени', rows: 5,
        defaultText: () => DEFAULT_TAG_RULE[lang()], showIf: (s) => s.detection === 'tag',
        hint: 'Добавляется после шаблона в режиме «тег». Пусто — стандартная.',
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
            return switchButton({ on: !!s[def.key], label: def.label, onToggle: (v) => setSetting(def.key, v) });
        }
        case 'select': {
            const el = h('select', { id, class: variant === 'st' ? 'text_pole' : 'ts-input' },
                def.options.map(([v, l]) => h('option', { value: v, selected: s[def.key] === v }, l)));
            el.addEventListener('change', () => commit(el));
            return el;
        }
        case 'number': {
            const el = h('input', { id, type: 'number', inputmode: 'numeric', min: def.min, max: def.max, value: s[def.key], class: variant === 'st' ? 'text_pole' : 'ts-input ts-input-num' });
            el.addEventListener('change', () => commit(el));
            return el;
        }
        case 'time': {
            const el = timeInput(s[def.key], { cls: variant === 'st' ? 'text_pole' : 'ts-input ts-input-num', label: def.label, onCommit: (m) => setSetting(def.key, m) });
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
    const load = h('button', { type: 'button', class: btnCls, title: 'Подставить стандартный текст, чтобы отредактировать его' }, 'Взять стандартный');
    const clear = h('button', { type: 'button', class: btnCls, title: 'Вернуть стандартный (очистить поле)' }, 'Сбросить');
    load.addEventListener('click', () => { control.value = def.defaultText(); setSetting(def.key, control.value); control.focus(); });
    clear.addEventListener('click', () => { control.value = ''; setSetting(def.key, ''); });
    return h('div', { class: variant === 'st' ? 'flex-container' : 'ts-inline-btns' }, load, clear);
}

function buildField(def, variant) {
    const control = buildControl(def, variant);
    const hintEl = def.hint ? h(variant === 'st' ? 'div' : 'span', { class: variant === 'st' ? 'ts-st-hint' : 'ts-row-hint' }) : null;
    const updateHint = () => {
        if (hintEl) hintEl.textContent = typeof def.hint === 'function' ? def.hint(settings()) : def.hint;
    };
    updateHint();

    let el;
    if (variant === 'st') {
        if (def.type === 'toggle') {
            el = h('div', { class: 'ts-st-field' }, h('label', { class: 'checkbox_label', for: control.id }, control, h('span', null, def.label)), hintEl);
        } else {
            el = h('div', { class: 'ts-st-field' }, h('label', { for: control.id }, def.label), control, def.type === 'textarea' ? textareaTools(def, control, variant) : null, hintEl);
        }
    } else if (def.type === 'select' || def.type === 'textarea') {
        el = h('div', { class: 'ts-row ts-row-col' },
            h('div', { class: 'ts-row-text' }, h('label', { class: 'ts-row-title', for: control.id }, def.label), hintEl),
            control,
            def.type === 'textarea' ? textareaTools(def, control, variant) : null);
    } else {
        el = h('div', { class: 'ts-row' },
            h('div', { class: 'ts-row-text' }, def.type === 'toggle' ? h('span', { class: 'ts-row-title' }, def.label) : h('label', { class: 'ts-row-title', for: control.id }, def.label), hintEl),
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
    const ok = await confirmDialog({ title: 'Сбросить настройки?', text: 'Все настройки Time System вернутся к стандартным. Данные чатов (время, NPC, события) не пострадают.', ok: 'Сбросить', danger: true });
    if (ok) resetSettings();
}
