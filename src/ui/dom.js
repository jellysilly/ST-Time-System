// Маленькие помощники для построения DOM без фреймворков.

import { fmtHM, parseHM } from '../calendar.js';
import { t } from '../i18n.js';

/**
 * h('button', { class: 'x', onClick: fn, 'aria-label': '…' }, 'текст', childNode)
 * Строки вставляются как текст (никакого innerHTML для пользовательских данных).
 */
export function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
        for (const [k, v] of Object.entries(props)) {
            if (v === null || v === undefined || v === false) continue;
            if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
            else if (k === 'style' && typeof v === 'object') {
                for (const [sk, sv] of Object.entries(v)) {
                    if (sv === null || sv === undefined) continue;
                    if (sk.startsWith('--')) el.style.setProperty(sk, String(sv));
                    else el.style[sk] = sv;
                }
            } else if (k === 'dataset') Object.assign(el.dataset, v);
            else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
            else if (k === 'value') el.value = v;
            else if (k === 'checked') el.checked = !!v;
            else if (v === true) el.setAttribute(k, '');
            else el.setAttribute(k, String(v));
        }
    }
    append(el, children);
    return el;
}

export function append(el, children) {
    for (const c of children.flat(Infinity)) {
        if (c === null || c === undefined || c === false) continue;
        el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
}

const ICONS = {
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sliders: '<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2"/>',
    close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
    prev: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2"/><path d="M12 19.5v2"/><path d="M2.5 12h2"/><path d="M19.5 12h2"/><path d="M5.3 5.3l1.4 1.4"/><path d="M17.3 17.3l1.4 1.4"/><path d="M5.3 18.7l1.4-1.4"/><path d="M17.3 6.7l1.4-1.4"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    star: '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/>',
    edit: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2"/><path d="M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    download: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    upload: '<path d="M12 20V9"/><path d="M7 14l5-5 5 5"/><path d="M5 4h14"/>',
    card: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17c1-2 2.5-3 4-3s3 1 4 3"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
};

/** SVG-иконка из набора дизайна (stroke-иконки 24×24). */
export function icon(name, { size = 18, stroke = 'currentColor', width = 1.9, fill = 'none', cls = '' } = {}) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('fill', fill);
    svg.setAttribute('stroke', stroke);
    svg.setAttribute('stroke-width', String(width));
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    if (cls) svg.setAttribute('class', cls);
    svg.innerHTML = ICONS[name] ?? '';
    return svg;
}

/** Переключатель в стиле дизайна (кнопка с aria-pressed). */
export function switchButton({ on, label, onToggle, cls = '' }) {
    const btn = h('button', {
        type: 'button',
        class: ['ts-switch', on && 'is-on', cls],
        'aria-pressed': on ? 'true' : 'false',
        'aria-label': label,
        title: label,
    }, h('span', { class: 'ts-switch-track' }, h('span', { class: 'ts-switch-knob' })));
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const next = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', next ? 'true' : 'false');
        btn.classList.toggle('is-on', next);
        onToggle?.(next);
    });
    return btn;
}

/**
 * Поле «ЧЧ:ММ» в 24-часовом формате на любой локали. На телефоне открывает цифровую
 * клавиатуру, двоеточие ставится само: «730» → «7:30», «0730» → «07:30».
 */
export function timeInput(minutes, { cls = 'ts-input ts-in-time', label = t('dt.time'), onCommit } = {}) {
    let last = fmtHM(minutes);
    const el = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: 5, placeholder: t('dt.placeholder'), value: last, class: cls, 'aria-label': label, spellcheck: 'false' });
    el.addEventListener('input', () => {
        const digits = el.value.replace(/\D/g, '').slice(0, 4);
        el.value = digits.length > 2 ? `${digits.slice(0, -2)}:${digits.slice(-2)}` : digits;
    });
    el.addEventListener('change', () => {
        const m = parseHM(el.value);
        if (m === null) { el.value = last; return; }
        last = fmtHM(m);
        el.value = last;
        onCommit?.(m);
    });
    el.addEventListener('focus', () => el.select());
    el.setMinutes = (m) => { last = fmtHM(m); el.value = last; };
    return el;
}

export function debounce(fn, ms) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

export function toast(kind, text) {
    const t = globalThis.toastr;
    if (t && typeof t[kind] === 'function') t[kind](text, 'Time System');
    else console.log('[Time System]', text);
}
