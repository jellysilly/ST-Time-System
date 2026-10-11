// Плавающие часы поверх чата, пункт в меню «волшебной палочки» и панель в меню расширений.

import { h, icon } from './dom.js';
import { settings, hasChat, now } from '../store.js';
import { fmtTime, fmtDateShort, fmtDateShortYear, phaseName } from '../calendar.js';
import { t as tr } from '../i18n.js';
import { settingsForm, askResetSettings } from './settings.js';

const POS_KEY = 'time_system_widget_pos';
let widget = null;
let openHandler = () => {};

function readPos() {
    try {
        const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
        return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
    } catch { return null; }
}

function savePos(p) {
    try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* приватный режим */ }
}

function clampPos(p) {
    if (!widget) return p;
    const r = widget.getBoundingClientRect();
    const maxX = Math.max(4, window.innerWidth - r.width - 4);
    const maxY = Math.max(4, window.innerHeight - r.height - 4);
    return { x: Math.min(Math.max(4, p.x), maxX), y: Math.min(Math.max(4, p.y), maxY) };
}

function applyPos(p) {
    if (!widget || !p) return;
    const c = clampPos(p);
    widget.style.left = `${c.x}px`;
    widget.style.top = `${c.y}px`;
    widget.style.right = 'auto';
}

export function mountWidget(onOpen) {
    openHandler = onOpen;
    if (widget) return;
    widget = h('button', { type: 'button', class: 'ts-ui ts-widget', 'aria-label': tr('widget.aria'), title: 'Time System' },
        h('span', { class: 'ts-widget-icon' }, icon('clock', { size: 18, width: 1.9 })),
        h('span', { class: 'ts-widget-text' }, h('b', { class: 'ts-widget-time' }), h('span', { class: 'ts-widget-date' })));
    document.body.append(widget);

    // Перетаскивание мышью и пальцем; короткое нажатие открывает блокнот.
    let drag = null;
    widget.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        const r = widget.getBoundingClientRect();
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top, moved: false };
    });
    widget.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.sx;
        const dy = e.clientY - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) < 6) return;
        if (!drag.moved) {
            drag.moved = true;
            widget.setPointerCapture?.(e.pointerId);
            widget.classList.add('is-dragging');
        }
        applyPos({ x: drag.ox + dx, y: drag.oy + dy });
    });
    const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const wasMoved = drag.moved;
        drag = null;
        widget.classList.remove('is-dragging');
        if (wasMoved) {
            const r = widget.getBoundingClientRect();
            savePos({ x: r.left, y: r.top });
            widget.dataset.justDragged = '1';
            setTimeout(() => { delete widget.dataset.justDragged; }, 50);
        }
    };
    widget.addEventListener('pointerup', end);
    widget.addEventListener('pointercancel', end);
    widget.addEventListener('click', (e) => {
        if (widget.dataset.justDragged) { e.preventDefault(); return; }
        openHandler();
    });
    window.addEventListener('resize', () => applyPos(readPos()));
    applyPos(readPos());
    updateWidget();
}

export function updateWidget() {
    if (!widget) return;
    const s = settings();
    const visible = s.enabled && s.showWidget && hasChat();
    widget.hidden = !visible;
    if (!visible) return;
    const t = now();
    if (t === null) { widget.hidden = true; return; }
    widget.querySelector('.ts-widget-time').textContent = fmtTime(t);
    widget.querySelector('.ts-widget-date').textContent = fmtDateShort(t);
    widget.title = tr('widget.title', { when: `${fmtDateShortYear(t)}, ${fmtTime(t)}`, phase: phaseName(t) });
    widget.setAttribute('aria-label', tr('widget.aria'));
    const pos = readPos();
    if (pos) applyPos(pos);
}

export function mountWandItem(onOpen) {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById('ts_wand_item')) return;
    const item = h('div', { id: 'ts_wand_item', class: 'list-group-item flex-container flexGap5', title: tr('wand.title') },
        h('div', { class: 'fa-regular fa-clock extensionsMenuExtensionButton' }),
        h('span', null, 'Time System'));
    item.addEventListener('click', () => onOpen());
    menu.append(item);
}

let panelNow = null;
let panelOpen = () => {};

function buildPanel() {
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host) return;
    const old = document.getElementById('ts_settings_panel');
    const oldContent = old?.querySelector('.inline-drawer-content');
    const wasOpen = !!oldContent && getComputedStyle(oldContent).display !== 'none';

    panelNow = h('div', { class: 'ts-st-now' });
    const content = h('div', { class: 'inline-drawer-content' },
        panelNow,
        h('div', { class: 'menu_button menu_button_icon ts-st-open', role: 'button', tabindex: '0', onClick: () => panelOpen() },
            h('i', { class: 'fa-solid fa-book-open' }), h('span', null, tr('panel.open'))),
        settingsForm('st', ['main', 'prompt']),
        h('div', { class: 'ts-st-footer' },
            h('div', { class: 'menu_button', role: 'button', tabindex: '0', onClick: () => askResetSettings() }, tr('set.reset')),
            h('small', null, tr('panel.footer'))));
    const chevron = h('div', { class: ['inline-drawer-icon', 'fa-solid', wasOpen ? 'fa-circle-chevron-up up' : 'fa-circle-chevron-down down'] });
    const panel = h('div', { id: 'ts_settings_panel', class: 'ts-st-panel' },
        h('div', { class: 'inline-drawer' },
            h('div', { class: 'inline-drawer-toggle inline-drawer-header' },
                h('b', null, h('i', { class: 'fa-regular fa-clock' }), ' Time System'),
                chevron),
            content));
    // Пересборка (смена языка) не должна сворачивать открытую панель.
    if (wasOpen) content.style.display = 'block';
    if (old) old.replaceWith(panel); else host.append(panel);
    updatePanel();
}

export function mountPanel(onOpen) {
    panelOpen = onOpen;
    if (!document.getElementById('ts_settings_panel')) buildPanel();
}

/** Смена языка интерфейса: пересобрать панель и подписи. */
export function relocalizeChrome() {
    buildPanel();
    const wand = document.getElementById('ts_wand_item');
    if (wand) wand.title = tr('wand.title');
    updateWidget();
}

export function updatePanel() {
    if (!panelNow) return;
    const s = settings();
    if (!hasChat()) { panelNow.textContent = tr('panel.noChat'); return; }
    const t = now();
    panelNow.textContent = s.enabled
        ? tr('panel.now', { when: `${fmtDateShortYear(t)}, ${fmtTime(t)}`, phase: phaseName(t) })
        : tr('panel.disabled');
    panelNow.prepend(h('i', { class: 'fa-regular fa-clock' }), ' ');
}
