// Блокнот — главный экран расширения (по дизайну «Time & Calendar System»).
// На ПК — разворот из двух страниц с пружиной и закладками справа,
// на телефоне — одна колонка, закладки сверху, страницы идут друг под другом.

import { h, icon, switchButton, debounce, toast } from './dom.js';
import {
    DAY, locale, split, daysFromCivil, daysInMonth, weekdayOf, dayOf, minutesOf, fmtTime, fmtHM,
    fmtWeekday, fmtDayMonth, fmtDate, fmtDateShortYear, fmtDelta, phaseKey, phaseName, cap,
} from '../calendar.js';
import { t as tr } from '../i18n.js';
import {
    settings, setSetting, hasChat, chatState, now, setNow, setBase, moveToDay, eventsOn, upsertEvent,
    deleteEvent, upsertNpc, deleteNpc, setNotes, journal, onChange,
    exportWorld, importWorld, canUseCard, saveTemplateToCard, loadTemplateFromCard, cardTemplate, ctx,
} from '../store.js';
import { npcStatus, segmentsForDay, statusLabel, fmtHours, fmtShift } from '../schedule.js';
import { buildPrompt } from '../prompt.js';
import { editTimeDialog, editMessageTime, eventDialog, npcDialog, confirmDialog, openModal, hasOpenModal } from './dialogs.js';
import { settingsForm, askResetSettings } from './settings.js';
import { reopenPending } from '../tracker.js';

const pct = (minutes) => `${((minutes / DAY) * 100).toFixed(3)}%`;
const STATUS_ORDER = { present: 0, away: 1, off: 2, none: 3 };

const exampleNpc = () => ({
    name: tr('example.name'), role: tr('example.role'), place: tr('example.place'), elsewhere: tr('example.elsewhere'),
    shifts: [{ from: 1080, to: 120, days: [1, 2, 3, 4, 5, 6], place: '' }],
});

function kicker(text) {
    return h('div', { class: 'ts-kicker' }, text);
}

function promptNote() {
    const text = h('div', { class: 'ts-note-text' });
    const update = () => {
        const s = settings();
        text.textContent = s.enabled ? (buildPrompt() || '—') : tr('note.disabled');
    };
    update();
    const el = h('div', { class: 'ts-note' },
        h('div', { class: 'ts-note-tape', 'aria-hidden': 'true' }),
        h('div', { class: 'ts-note-head' }, h('span', { class: 'ts-note-title' }, tr('note.title')), h('span', { class: 'ts-note-sub' }, tr('note.sub'))),
        text);
    const off = onChange(() => {
        if (!el.isConnected) { off(); return; }
        update();
    });
    return el;
}

function statusPill(st, t) {
    const kind = st.kind === 'present' ? 'present' : st.kind === 'away' ? 'away' : 'off';
    return h('span', { class: ['ts-pill', `ts-pill-${kind}`] },
        kind !== 'off' ? h('span', { class: 'ts-pill-dot' }) : null,
        statusLabel(st, t));
}

function dayTrack(segs, { nowMinutes = null, cls = '' } = {}) {
    return h('div', { class: ['ts-track', cls] },
        segs.map(([a, b]) => h('div', { class: 'ts-track-seg', style: { left: pct(a), width: pct(b - a) } })),
        nowMinutes !== null ? h('div', { class: 'ts-track-now', style: { left: pct(nowMinutes) }, 'aria-hidden': 'true' }) : null);
}

function download(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function pickJsonFile() {
    return new Promise((resolve) => {
        const input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            input.remove();
            if (!file) return resolve(null);
            try { resolve(JSON.parse(await file.text())); } catch { toast('error', tr('err.json')); resolve(null); }
        });
        document.body.append(input);
        input.click();
    });
}

class Notebook {
    constructor() {
        this.root = null;
        this.view = 'time';
        this.viewMonth = null;
        this.selDay = null;
        this.selNpc = null;
        this.renderedView = null;
        this.unsub = null;
        this.onKey = this.onKey.bind(this);
    }

    isOpen() { return !!this.root; }

    open(view) {
        if (view) this.view = view;
        if (this.root) { this.render(); return; }
        this.viewMonth = null;
        this.selDay = null;
        this.renderedView = null;

        this.enabledBtn = h('button', { type: 'button', class: 'ts-enable', 'data-fid': 'enabled' },
            h('span', { class: 'ts-enable-label' }),
            h('span', { class: 'ts-switch-track' }, h('span', { class: 'ts-switch-knob' })));
        this.enabledBtn.addEventListener('click', () => setSetting('enabled', !settings().enabled));
        this.settingsBtn = h('button', { type: 'button', class: 'ts-icon-btn ts-icon-btn-lg', 'aria-label': tr('app.settings'), title: tr('app.settingsShort'), 'data-fid': 'settings', onClick: () => this.go(this.view === 'settings' ? 'time' : 'settings') }, icon('sliders', { size: 20, width: 1.8 }));
        const closeBtn = h('button', { type: 'button', class: 'ts-icon-btn ts-icon-btn-lg', 'aria-label': tr('app.close'), title: tr('app.close'), onClick: () => this.close() }, icon('close', { size: 20 }));

        this.tabs = h('nav', { class: 'ts-tabs', role: 'tablist', 'aria-label': tr('app.sections') },
            [['time', tr('tab.time')], ['npc', tr('tab.npc')], ['notes', tr('tab.notes')]].map(([key, label]) =>
                h('button', { type: 'button', role: 'tab', class: ['ts-tab', `ts-tab-${key}`], 'data-view': key, 'data-fid': `tab-${key}`, onClick: () => this.go(key) }, label)));

        this.left = h('section', { class: 'ts-page ts-page-left dots' });
        this.right = h('section', { class: 'ts-page ts-page-right dots' });
        const rings = h('div', { class: 'ts-rings', 'aria-hidden': 'true' }, Array.from({ length: 14 }, () => h('i')));
        this.spread = h('div', { class: 'ts-spread' }, this.left, h('div', { class: 'ts-binding', 'aria-hidden': 'true' }, rings), this.right);

        const app = h('div', { class: 'ts-app' },
            h('div', { class: 'ts-blob', 'aria-hidden': 'true' }),
            h('header', { class: 'ts-header' },
                h('div', { class: 'ts-brand' },
                    h('div', { class: 'ts-logo' }, icon('clock', { size: 26, width: 1.8 })),
                    h('div', { class: 'ts-brand-text' },
                        h('h1', { class: 'ts-title' }, 'Time System'),
                        h('div', { class: 'ts-subtitle' }, tr('app.subtitle')))),
                h('div', { class: 'ts-header-actions' }, this.enabledBtn, this.settingsBtn, closeBtn)),
            h('div', { class: 'ts-book' },
                h('div', { class: 'ts-bookbody' }, h('div', { class: 'ts-cover', 'aria-hidden': 'true' }), this.spread),
                this.tabs));

        this.root = h('div', { class: 'ts-ui ts-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Time System' }, app);
        this.root.addEventListener('click', (e) => { if (e.target === this.root) this.close(); });
        document.body.append(this.root);
        document.addEventListener('keydown', this.onKey);
        this.unsub = onChange((what) => this.onStoreChange(what));
        this.render();
        requestAnimationFrame(() => this.root?.classList.add('is-open'));
        document.body.classList.add('ts-notebook-open');
    }

    close() {
        if (!this.root) return;
        this.unsub?.();
        document.removeEventListener('keydown', this.onKey);
        const el = this.root;
        this.root = null;
        el.classList.remove('is-open');
        setTimeout(() => el.remove(), 180);
        document.body.classList.remove('ts-notebook-open');
    }

    /** Смена языка интерфейса: пересобрать открытый блокнот на той же вкладке. */
    relocalize() {
        if (!this.root) return;
        const view = this.view;
        const keep = { viewMonth: this.viewMonth, selDay: this.selDay };
        this.unsub?.();
        document.removeEventListener('keydown', this.onKey);
        this.root.remove();
        this.root = null;
        this.open(view);
        this.viewMonth = keep.viewMonth;
        this.selDay = keep.selDay;
        this.render();
    }

    toggle(view) {
        if (this.isOpen() && (!view || view === this.view)) this.close(); else this.open(view);
    }

    onKey(e) {
        if (e.key === 'Escape' && !hasOpenModal()) { e.stopPropagation(); this.close(); }
    }

    go(view) {
        this.view = view;
        this.render();
    }

    onStoreChange(what) {
        if (!this.root) return;
        if (what === 'settings' && this.view === 'settings') { this.updateHeader(); return; }
        if (what === 'notes' && this.view === 'notes') return;
        this.render();
    }

    updateHeader() {
        const on = !!settings().enabled;
        this.enabledBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        this.enabledBtn.classList.toggle('is-on', on);
        this.enabledBtn.querySelector('.ts-enable-label').textContent = on ? tr('app.enabled') : tr('app.disabled');
        this.settingsBtn.setAttribute('aria-pressed', this.view === 'settings' ? 'true' : 'false');
        for (const tab of this.tabs.children) {
            const active = tab.dataset.view === this.view;
            tab.classList.toggle('is-active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
        }
    }

    render() {
        if (!this.root) return;
        const focusId = this.root.contains(document.activeElement) ? document.activeElement?.dataset?.fid : null;
        // Прокрутку сохраняем только при перерисовке той же вкладки; новая вкладка — с начала.
        const sameView = this.renderedView === this.view;
        const saved = { l: this.left.scrollTop, r: this.right.scrollTop, s: this.spread.scrollTop };

        this.updateHeader();
        this.spread.dataset.view = this.view;

        if (!hasChat()) {
            this.left.replaceChildren(...this.noChat());
            this.right.replaceChildren(kicker(tr('k.worldTime')), h('div', { class: 'ts-hand ts-muted' }, tr('nochat.right')));
        } else {
            const pages = {
                time: () => [this.calendarPage(), this.timePage()],
                npc: () => [this.npcListPage(), this.npcDetailPage()],
                notes: () => [this.journalPage(), this.notesPage()],
                settings: () => [this.settingsPage('main'), this.settingsPage('prompt')],
            }[this.view]();
            this.left.replaceChildren(...pages[0]);
            this.right.replaceChildren(...pages[1]);
        }

        this.left.scrollTop = sameView ? saved.l : 0;
        this.right.scrollTop = sameView ? saved.r : 0;
        this.spread.scrollTop = sameView ? saved.s : 0;
        this.renderedView = this.view;
        if (focusId) this.root.querySelector(`[data-fid="${CSS.escape(focusId)}"]`)?.focus({ preventScroll: true });
    }

    noChat() {
        return [
            kicker(tr('k.calendar')),
            h('h2', { class: 'ts-h2' }, tr('nochat.title')),
            h('p', { class: 'ts-hand ts-muted ts-hand-lg' }, tr('nochat.text')),
        ];
    }

    // ───────────────────────── Время: календарь ─────────────────────────

    calendarPage() {
        const t = now();
        const cur = split(t);
        const L = locale();
        const vm = this.viewMonth ?? { y: cur.y, m: cur.m };
        const sel = this.selDay ?? cur.day;
        const first = daysFromCivil(vm.y, vm.m, 1);
        const offset = weekdayOf(first);
        const dim = daysInMonth(vm.y, vm.m);
        const isCurMonth = vm.y === cur.y && vm.m === cur.m;

        const shiftMonth = (delta) => {
            let m = vm.m + delta;
            let y = vm.y;
            if (m < 1) { m = 12; y -= 1; }
            if (m > 12) { m = 1; y += 1; }
            this.viewMonth = { y, m };
            this.render();
        };

        const cells = [];
        for (let i = 0; i < offset; i++) cells.push(h('div', { class: 'ts-day-blank' }));
        for (let d = 1; d <= dim; d++) {
            const day = first + d - 1;
            const today = day === cur.day;
            const selected = day === sel;
            const hasEvents = eventsOn(day).length > 0;
            cells.push(h('button', {
                type: 'button',
                class: ['ts-day', today && 'is-today', selected && !today && 'is-selected'],
                'aria-pressed': selected ? 'true' : 'false',
                'aria-label': `${fmtDayMonth(day * DAY)}${hasEvents ? tr('cal.hasEvents') : ''}${today ? tr('cal.isNow') : ''}`,
                'data-fid': `day-${day}`,
                onClick: () => { this.selDay = day; this.render(); },
            }, h('span', null, String(d)), hasEvents ? icon('star', { size: 10, fill: 'currentColor', stroke: 'currentColor', width: 2, cls: 'ts-day-star' }) : h('span', { class: 'ts-day-star-space' })));
        }

        const selT = sel * DAY;
        const events = eventsOn(sel);
        const selTitle = `${fmtDayMonth(selT)}, ${fmtWeekday(selT)}`;

        return [
            h('div', { class: 'ts-cal-head' },
                h('div', null,
                    kicker(tr('k.calendar')),
                    h('div', { class: 'ts-month' },
                        h('h2', { class: 'ts-month-name' }, cap(L.months[vm.m - 1])),
                        h('span', { class: 'ts-month-year' }, tr('cal.year', { y: vm.y })))),
                h('div', { class: 'ts-cal-nav' },
                    !isCurMonth ? h('button', { type: 'button', class: 'ts-btn ts-btn-ghost ts-btn-sm', 'data-fid': 'cal-today', onClick: () => { this.viewMonth = null; this.selDay = null; this.render(); } }, tr('cal.today')) : null,
                    h('button', { type: 'button', class: 'ts-nav-btn', 'aria-label': tr('cal.prev'), 'data-fid': 'cal-prev', onClick: () => shiftMonth(-1) }, icon('prev', { size: 18, width: 2 })),
                    h('button', { type: 'button', class: 'ts-nav-btn', 'aria-label': tr('cal.next'), 'data-fid': 'cal-next', onClick: () => shiftMonth(1) }, icon('next', { size: 18, width: 2 })))),
            h('div', { class: 'ts-weekdays', 'aria-hidden': 'true' }, L.wdShort.map(w => h('div', null, w.toUpperCase()))),
            h('div', { class: 'ts-days' }, cells),
            h('div', { class: 'ts-legend' },
                h('span', null, h('i', { class: 'ts-legend-now' }), tr('cal.legendNow')),
                h('span', null, h('i', { class: 'ts-legend-sel' }), tr('cal.legendSel')),
                h('span', null, icon('star', { size: 12, fill: 'currentColor', stroke: 'none', cls: 'ts-legend-star' }), tr('cal.legendEvent'))),
            h('div', { class: 'ts-selday' },
                h('div', { class: 'ts-selday-head' },
                    h('div', { class: 'ts-hand ts-selday-title' }, selTitle),
                    h('button', { type: 'button', class: 'ts-btn ts-btn-dark ts-btn-sm', 'data-fid': 'add-event', onClick: () => this.editEvent(null, sel) }, icon('plus', { size: 14, width: 2.4 }), tr('cal.addEvent'))),
                events.length
                    ? events.map(e => h('button', { type: 'button', class: 'ts-event', onClick: () => this.editEvent(e, sel) },
                        h('span', { class: 'ts-event-time' }, e.time || tr('cal.allDay')),
                        h('span', { class: 'ts-event-name' }, e.name),
                        e.repeat !== 'none' ? h('span', { class: 'ts-event-repeat', title: tr('cal.repeats') }, '↻') : null))
                    : h('div', { class: 'ts-hand ts-muted ts-hand-md' }, tr('cal.empty')),
                sel !== cur.day
                    ? h('button', { type: 'button', class: 'ts-btn ts-btn-outline ts-btn-sm ts-selfstart', onClick: () => this.moveWorldTo(sel) }, icon('calendar', { size: 14 }), tr('cal.moveHere'))
                    : null),
            promptNote(),
        ];
    }

    async moveWorldTo(day) {
        const t = now();
        const target = day * DAY + minutesOf(t);
        const ok = await confirmDialog({
            title: tr('move.title'),
            text: tr('move.text', { from: `${fmtDateShortYear(t)}, ${fmtTime(t)}`, to: `${fmtDateShortYear(target)}, ${fmtTime(target)}`, delta: fmtDelta(target - t) }),
            ok: tr('move.ok'),
        });
        if (!ok) return;
        moveToDay(day);
        this.selDay = null;
        this.viewMonth = null;
    }

    async editEvent(ev, day) {
        const res = await eventDialog(ev, day);
        if (!res) return;
        if (res.delete) { deleteEvent(ev.id); return; }
        upsertEvent(res);
        this.selDay = res.day;
        const p = split(res.day * DAY);
        this.viewMonth = { y: p.y, m: p.m };
        this.render();
    }

    // ───────────────────────── Время: часы и NPC ─────────────────────────

    timePage() {
        const s = settings();
        const st = chatState();
        const t = now();
        const minutes = minutesOf(t);
        const phase = phaseKey(minutes);
        const night = phase === 'night' || phase === 'evening';
        const wake = Number.isFinite(s.wakeTime) ? s.wakeTime : 480;
        const toWake = ((wake - minutes) + DAY) % DAY || DAY;

        const quick = (label, delta, fid, dark = false) => h('button', {
            type: 'button', class: ['ts-btn', dark ? 'ts-btn-dark' : 'ts-btn-outline', 'ts-quick'], 'data-fid': fid,
            onClick: () => setNow(now() + delta),
        }, dark ? icon('moon', { size: 15, width: 2 }) : null, label);

        const npcs = [...st.npcs]
            .map(n => ({ n, st: npcStatus(n, t) }))
            .sort((a, b) => STATUS_ORDER[a.st.kind] - STATUS_ORDER[b.st.kind]);

        return [
            h('div', { class: 'ts-time-head' },
                kicker(tr('k.worldTime')),
                h('div', { class: 'ts-hand ts-time-date' }, `${cap(fmtWeekday(t))}, ${fmtDayMonth(t)}`)),
            h('div', { class: 'ts-clock-row' },
                h('button', { type: 'button', class: 'ts-clock', title: tr('time.edit'), 'aria-label': tr('time.aria', { time: fmtTime(t) }), 'data-fid': 'clock', onClick: () => this.editNow() }, fmtTime(t)),
                h('div', { class: 'ts-phase' },
                    h('div', { class: ['ts-phase-icon', night ? 'is-night' : 'is-day'] }, icon(night ? 'moon' : 'sun', { size: 26, width: 1.8 })),
                    h('div', { class: 'ts-phase-text' },
                        h('span', { class: 'ts-phase-name' }, cap(phaseName(t))),
                        h('span', { class: 'ts-phase-date' }, fmtDateShortYear(t))))),
            h('div', { class: 'ts-daybar-wrap' },
                h('div', { class: 'ts-daybar' },
                    h('div', { class: 'ts-daybar-fill' }, h('i', { class: 'p-night' }), h('i', { class: 'p-morning' }), h('i', { class: 'p-day' }), h('i', { class: 'p-evening' }), h('i', { class: 'p-late' })),
                    h('div', { class: 'ts-daybar-now', style: { left: pct(minutes) }, 'aria-hidden': 'true' })),
                h('div', { class: 'ts-daybar-labels', 'aria-hidden': 'true' }, ['00:00', '06:00', '12:00', '18:00', '24:00'].map(x => h('span', null, x)))),
            h('div', { class: 'ts-quick-grid' },
                quick(tr('q.minusHour'), -60, 'q-minus'),
                quick(tr('q.plus15'), 15, 'q-15'),
                quick(tr('q.plusHour'), 60, 'q-60'),
                quick(tr('q.sleep', { time: fmtHM(wake) }), toWake, 'q-sleep', true)),
            h('div', { class: 'ts-row' },
                h('div', { class: 'ts-row-text' },
                    h('span', { class: 'ts-row-title' }, tr('auto.title')),
                    h('span', { class: 'ts-row-hint' }, tr('auto.hint', { n: s.autoMinutes }))),
                switchButton({ on: !!s.autoAdvance, label: tr('auto.aria'), onToggle: (v) => setSetting('autoAdvance', v) })),
            h('div', { class: 'ts-section-head' },
                h('div', { class: 'ts-section-titles' }, kicker(tr('k.npcSchedules')), h('span', { class: 'ts-hand ts-section-sub' }, tr('npc.whoWhere'))),
                h('button', { type: 'button', class: 'ts-icon-btn', 'aria-label': tr('npc.add'), title: tr('npc.add'), 'data-fid': 'add-npc', onClick: () => this.editNpc(null) }, icon('plus', { size: 16, width: 2.2 }))),
            npcs.length
                ? h('div', { class: 'ts-npc-list' }, npcs.map(({ n, st: status }) => this.npcCard(n, status, t)))
                : this.npcEmpty(),
        ];
    }

    npcEmpty() {
        return h('div', { class: 'ts-empty' },
            h('div', { class: 'ts-hand ts-muted ts-hand-md' }, tr('npc.empty')),
            h('div', { class: 'ts-inline-btns' },
                h('button', { type: 'button', class: 'ts-btn ts-btn-dark ts-btn-sm', onClick: () => this.editNpc(null) }, icon('plus', { size: 14, width: 2.4 }), 'NPC'),
                h('button', { type: 'button', class: 'ts-btn ts-btn-outline ts-btn-sm', onClick: () => upsertNpc(exampleNpc()) }, tr('npc.example'))));
    }

    npcCard(n, st, t) {
        const present = st.kind === 'present';
        const where = present ? st.place : (n.elsewhere ? tr('npc.now', { place: n.elsewhere }) : n.place);
        return h('button', {
            type: 'button',
            class: ['ts-npc', present && 'is-present', n.hidden && 'is-hidden'],
            title: n.hidden ? tr('npc.hiddenTitle') : tr('npc.openTitle'),
            onClick: () => { this.selNpc = n.id; this.go('npc'); },
        },
        h('div', { class: 'ts-npc-top' },
            h('div', { class: 'ts-avatar' }, (n.name.trim()[0] || '?').toUpperCase()),
            h('div', { class: 'ts-npc-info' },
                h('div', { class: 'ts-npc-name' }, n.name, n.role ? h('span', { class: 'ts-npc-role' }, ` · ${n.role}`) : null, n.hidden ? h('span', { class: 'ts-npc-role' }, tr('npc.hiddenTag')) : null),
                where ? h('div', { class: 'ts-npc-place' }, icon('pin', { size: 13, width: 2 }), h('span', null, where)) : null),
            statusPill(st, t)),
        h('div', { class: 'ts-npc-bottom' },
            dayTrack(segmentsForDay(n, dayOf(t)), { nowMinutes: minutesOf(t) }),
            h('span', { class: 'ts-npc-hours' }, fmtHours(n) || tr('npc.noSchedule'))));
    }

    async editNow() {
        const t = now();
        const res = await editTimeDialog({ title: tr('nowEdit.title'), t, note: tr('nowEdit.note') });
        if (Number.isFinite(res)) setNow(res);
    }

    async editNpc(npc) {
        const res = await npcDialog(npc);
        if (!res) return;
        if (res.delete) {
            const ok = await confirmDialog({ title: tr('npc.deleteTitle', { name: npc.name }), text: tr('npc.deleteText'), ok: tr('btn.delete'), danger: true });
            if (ok) deleteNpc(npc.id);
            return;
        }
        const saved = upsertNpc(res);
        if (saved && this.view === 'npc') this.selNpc = saved.id;
    }

    // ───────────────────────── NPC ─────────────────────────

    npcListPage() {
        const st = chatState();
        const t = now();
        if (!st.npcs.some(n => n.id === this.selNpc)) this.selNpc = st.npcs[0]?.id ?? null;

        const tools = h('div', { class: 'ts-tools' },
            h('button', { type: 'button', class: 'ts-btn ts-btn-outline ts-btn-sm', onClick: () => this.exportJson() }, icon('download', { size: 14 }), tr('btn.export')),
            h('button', { type: 'button', class: 'ts-btn ts-btn-outline ts-btn-sm', onClick: () => this.importJson() }, icon('upload', { size: 14 }), tr('btn.import')),
            canUseCard() ? h('button', { type: 'button', class: 'ts-btn ts-btn-outline ts-btn-sm', onClick: () => this.toCard() }, icon('card', { size: 14 }), tr('btn.toCard')) : null,
            canUseCard() && cardTemplate() ? h('button', { type: 'button', class: 'ts-btn ts-btn-outline ts-btn-sm', onClick: () => this.fromCard() }, icon('card', { size: 14 }), tr('btn.fromCard')) : null);

        return [
            h('div', { class: 'ts-cal-head' },
                h('div', null, kicker(tr('k.residents')), h('div', { class: 'ts-month' }, h('h2', { class: 'ts-month-name' }, 'NPC'), h('span', { class: 'ts-month-year' }, String(st.npcs.length)))),
                h('button', { type: 'button', class: 'ts-btn ts-btn-dark ts-btn-sm', 'data-fid': 'npc-add', onClick: () => this.editNpc(null) }, icon('plus', { size: 14, width: 2.4 }), 'NPC')),
            st.npcs.length
                ? h('div', { class: 'ts-npc-rows' }, st.npcs.map((n) => {
                    const status = npcStatus(n, t);
                    return h('button', {
                        type: 'button',
                        class: ['ts-npc-row', n.id === this.selNpc && 'is-selected', n.hidden && 'is-hidden'],
                        'aria-pressed': n.id === this.selNpc ? 'true' : 'false',
                        'data-fid': `npc-${n.id}`,
                        onClick: () => { this.selNpc = n.id; this.render(); },
                    },
                    h('div', { class: ['ts-avatar', 'ts-avatar-sm', status.kind === 'present' && 'is-present'] }, (n.name.trim()[0] || '?').toUpperCase()),
                    h('div', { class: 'ts-npc-info' },
                        h('div', { class: 'ts-npc-name' }, n.name, n.role ? h('span', { class: 'ts-npc-role' }, ` · ${n.role}`) : null),
                        h('div', { class: 'ts-npc-place' }, h('span', null, fmtHours(n) || tr('npc.noSchedule')))),
                    statusPill(status, t));
                }))
                : this.npcEmpty(),
            h('p', { class: 'ts-hint-block' }, tr('npc.storageHint')),
            tools,
        ];
    }

    npcDetailPage() {
        const st = chatState();
        const n = st.npcs.find(x => x.id === this.selNpc);
        if (!n) {
            return [kicker(tr('k.schedule')), h('div', { class: 'ts-hand ts-muted ts-hand-md' }, tr('npc.pick'))];
        }
        const t = now();
        const status = npcStatus(n, t);
        const today = dayOf(t);
        const monday = today - weekdayOf(today);

        const week = h('div', { class: 'ts-week' },
            locale().wdShort.map((w, i) => {
                const day = monday + i;
                const isToday = day === today;
                return h('div', { class: ['ts-week-row', isToday && 'is-today'] },
                    h('span', { class: 'ts-week-day' }, w),
                    dayTrack(segmentsForDay(n, day), { nowMinutes: isToday ? minutesOf(t) : null, cls: 'ts-track-lg' }));
            }),
            h('div', { class: 'ts-week-row ts-week-scale', 'aria-hidden': 'true' }, h('span'), h('div', { class: 'ts-daybar-labels' }, ['0', '6', '12', '18', '24'].map(x => h('span', null, x)))));

        return [
            kicker(tr('k.schedule')),
            h('div', { class: 'ts-npc-hero' },
                h('div', { class: ['ts-avatar', 'ts-avatar-lg', status.kind === 'present' && 'is-present'] }, (n.name.trim()[0] || '?').toUpperCase()),
                h('div', { class: 'ts-npc-hero-text' },
                    h('h2', { class: 'ts-h2' }, n.name),
                    n.role ? h('div', { class: 'ts-muted ts-strong' }, n.role) : null),
                statusPill(status, t)),
            h('div', { class: 'ts-facts' },
                n.place ? h('div', { class: 'ts-fact' }, icon('pin', { size: 15, width: 2 }), h('span', null, h('b', null, tr('npc.bySchedule')), n.place)) : null,
                n.elsewhere ? h('div', { class: 'ts-fact' }, icon('moon', { size: 15, width: 2 }), h('span', null, h('b', null, tr('npc.otherwise')), n.elsewhere)) : null,
                n.notes ? h('div', { class: 'ts-fact' }, icon('book', { size: 15, width: 2 }), h('span', null, n.notes)) : null,
                (n.shifts ?? []).map(s => h('div', { class: 'ts-fact' }, icon('clock', { size: 15, width: 2 }), h('span', null, fmtShift(s), s.place ? ` — ${s.place}` : '')))),
            kicker(tr('k.week')),
            week,
            h('div', { class: 'ts-inline-btns' },
                h('button', { type: 'button', class: 'ts-btn ts-btn-dark', onClick: () => this.editNpc(n) }, icon('edit', { size: 15 }), tr('btn.edit')),
                h('button', { type: 'button', class: 'ts-btn ts-btn-outline', onClick: () => upsertNpc({ ...n, hidden: !n.hidden }) }, icon(n.hidden ? 'eye' : 'eyeOff', { size: 15 }), n.hidden ? tr('npc.showAi') : tr('npc.hideAi')),
                h('button', { type: 'button', class: 'ts-btn ts-btn-outline ts-btn-danger-outline', onClick: async () => {
                    const ok = await confirmDialog({ title: tr('npc.deleteTitle', { name: n.name }), text: tr('npc.deleteText'), ok: tr('btn.delete'), danger: true });
                    if (ok) deleteNpc(n.id);
                } }, icon('trash', { size: 15 }), tr('btn.delete'))),
        ];
    }

    exportJson() {
        const data = exportWorld();
        if (!data) return;
        const name = (ctx().name2 || 'world').replace(/[^\p{L}\p{N}_-]+/gu, '_');
        download(`time-system-${name}.json`, data);
    }

    async importJson() {
        const data = await pickJsonFile();
        if (!data) return;
        const mode = await openModal({
            title: tr('import.title'),
            body: h('p', { class: 'ts-p' }, tr('import.text', { npcs: data.npcs?.length ?? 0, events: data.events?.length ?? 0 })),
            actions: [
                { label: tr('btn.cancel'), kind: 'ghost', value: null, push: true },
                { label: tr('btn.replace'), kind: 'ghost', value: 'replace' },
                { label: tr('btn.add'), kind: 'primary', value: 'merge' },
            ],
            size: 'sm',
        });
        if (!mode) return;
        try {
            const r = importWorld(data, mode);
            toast('success', tr('import.done', { npcs: r.npcs, events: r.events }));
        } catch (e) {
            toast('error', e.message);
        }
    }

    async toCard() {
        const ok = await confirmDialog({
            title: tr('card.title'),
            text: tr('card.text', { name: ctx().name2 }),
            ok: tr('btn.save'),
        });
        if (!ok) return;
        try {
            await saveTemplateToCard();
            toast('success', tr('card.saved'));
            this.render();
        } catch (e) {
            toast('error', e.message);
        }
    }

    async fromCard() {
        const ok = await confirmDialog({ title: tr('cardLoad.title'), text: tr('cardLoad.text'), ok: tr('btn.load') });
        if (!ok) return;
        try { loadTemplateFromCard('replace'); toast('success', tr('cardLoad.done')); } catch (e) { toast('error', e.message); }
    }

    // ───────────────────────── Журнал и заметки ─────────────────────────

    journalPage() {
        const st = chatState();
        const entries = journal().slice(-150).reverse();
        const list = h('div', { class: 'ts-journal' });
        let lastDay = null;
        for (const e of entries) {
            const s = e.snap;
            const pending = s.src === 'pending';
            const t = pending ? s.p : s.t;
            if (!Number.isFinite(t)) continue;
            const d = dayOf(t);
            if (d !== lastDay) {
                list.append(h('div', { class: 'ts-hand ts-journal-day' }, `${cap(fmtWeekday(t))}, ${fmtDate(t)}`));
                lastDay = d;
            }
            const delta = Number.isFinite(s.b) ? t - s.b : 0;
            list.append(h('button', {
                type: 'button',
                class: ['ts-jrow', pending && 'is-pending'],
                title: pending ? tr('j.pendingTitle') : tr('j.editTitle'),
                onClick: () => (pending ? reopenPending(e.index) : editMessageTime(e.index)),
            },
            h('span', { class: 'ts-event-time' }, fmtTime(t)),
            h('span', { class: 'ts-jrow-main' },
                h('span', { class: 'ts-jrow-delta' }, pending ? tr('src.pending') : fmtDelta(delta)),
                h('span', { class: 'ts-jrow-meta' }, `#${e.index} · ${e.name}${pending ? '' : ` · ${tr(`src.${s.src}`)}`}${s.ed ? tr('j.edited') : ''}`)),
            icon('edit', { size: 14, cls: 'ts-jrow-edit' })));
        }
        list.append(h('button', { type: 'button', class: 'ts-jrow ts-jrow-base', onClick: () => this.editBase() },
            h('span', { class: 'ts-event-time' }, fmtTime(st.base)),
            h('span', { class: 'ts-jrow-main' },
                h('span', { class: 'ts-jrow-delta' }, tr('j.start')),
                h('span', { class: 'ts-jrow-meta' }, fmtDateShortYear(st.base))),
            icon('edit', { size: 14, cls: 'ts-jrow-edit' })));

        return [
            h('div', { class: 'ts-time-head' }, kicker(tr('k.journal')), h('span', { class: 'ts-hand ts-section-sub' }, tr('j.sub'))),
            h('p', { class: 'ts-hint-block' }, tr('j.hint')),
            list,
        ];
    }

    async editBase() {
        const res = await editTimeDialog({ title: tr('j.start'), kicker: tr('k.journal'), t: chatState().base, note: tr('j.startNote') });
        if (Number.isFinite(res)) setBase(res);
    }

    notesPage() {
        const st = chatState();
        const save = debounce((v) => setNotes(v), 400);
        const area = h('textarea', { class: 'ts-notes-area', placeholder: tr('notes.placeholder'), spellcheck: 'true' }, st.notes);
        area.addEventListener('input', () => save(area.value));
        return [
            h('div', { class: 'ts-time-head' }, kicker(tr('k.notes')), h('span', { class: 'ts-hand ts-section-sub' }, tr('notes.sub'))),
            area,
            h('div', { class: 'ts-row' },
                h('div', { class: 'ts-row-text' },
                    h('span', { class: 'ts-row-title' }, tr('notes.toAi')),
                    h('span', { class: 'ts-row-hint' }, tr('notes.toAiHint'))),
                switchButton({ on: !!st.notesToPrompt, label: tr('notes.toAi'), onToggle: (v) => setNotes(undefined, v) })),
        ];
    }

    // ───────────────────────── Настройки ─────────────────────────

    settingsPage(group) {
        if (group === 'main') {
            return [
                h('div', { class: 'ts-cal-head' }, h('div', null, kicker(tr('k.settings')), h('h2', { class: 'ts-month-name' }, tr('set.mainTitle')))),
                settingsForm('book', ['main']),
                h('button', { type: 'button', class: 'ts-btn ts-btn-outline ts-btn-sm ts-selfstart', onClick: () => askResetSettings() }, tr('set.reset')),
            ];
        }
        return [
            h('div', { class: 'ts-cal-head' }, h('div', null, kicker(tr('k.prompt')), h('h2', { class: 'ts-month-name' }, tr('set.promptTitle')))),
            settingsForm('book', ['prompt']),
            promptNote(),
        ];
    }
}

export const notebook = new Notebook();
