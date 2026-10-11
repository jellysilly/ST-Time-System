// Модальные окна в стиле блокнота: подтверждение записи времени, правка времени,
// события календаря и карточки NPC. На телефоне окна выезжают снизу как «шторка».

import { h, icon, switchButton, timeInput } from './dom.js';
import {
    DAY, LOCALES, split, makeTime, daysInMonth, parseHM, fmtWeekday, fmtDateShort, fmtTime,
    fmtDelta, dayOf, ALL_DAYS, cap,
} from '../calendar.js';
import { normalizeNpc, uid, ctx, getSnap, nowAt, setMessageTime, removeMessageTime } from '../store.js';

const stack = [];

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !stack.length) return;
    e.stopPropagation();
    stack[stack.length - 1].dismiss();
}, true);

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string} [o.kicker] надпись капителью над заголовком
 * @param {Node|Node[]} o.body
 * @param {{label:string, kind?:'primary'|'ghost'|'danger', value?:any|(() => any), validate?:() => boolean}[]} o.actions
 * @param {any} [o.dismissValue] что вернуть при закрытии крестиком/Esc/тапом мимо
 * @returns {Promise<any>}
 */
export function openModal({ title, kicker, body, actions = [], dismissValue = null, size = 'md', bind = null }) {
    return new Promise((resolve) => {
        const titleId = 'ts-modal-title-' + uid();
        const overlay = h('div', { class: 'ts-ui ts-modal-overlay' });
        const card = h('div', { class: ['ts-modal', 'dots', `ts-modal-${size}`], role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });

        let closed = false;
        const close = (value) => {
            if (closed) return;
            closed = true;
            const i = stack.indexOf(entry);
            if (i >= 0) stack.splice(i, 1);
            overlay.classList.add('is-leaving');
            setTimeout(() => overlay.remove(), 160);
            resolve(value);
        };
        const entry = { dismiss: () => close(dismissValue) };
        bind?.({ dismiss: entry.dismiss });

        const closeBtn = h('button', { type: 'button', class: 'ts-icon-btn ts-modal-close', 'aria-label': 'Закрыть', onClick: () => close(dismissValue) }, icon('close', { size: 18 }));
        const header = h('div', { class: 'ts-modal-head' },
            h('div', { class: 'ts-modal-titles' },
                kicker ? h('div', { class: 'ts-kicker' }, kicker) : null,
                h('h2', { class: 'ts-modal-title', id: titleId }, title)),
            closeBtn);

        const footer = h('div', { class: 'ts-modal-actions' }, actions.map((a) => h('button', {
            type: 'button',
            class: ['ts-btn', a.kind === 'primary' ? 'ts-btn-dark' : a.kind === 'danger' ? 'ts-btn-danger' : 'ts-btn-outline', a.push && 'ts-push'],
            onClick: () => {
                if (a.validate && !a.validate()) return;
                close(typeof a.value === 'function' ? a.value() : a.value);
            },
        }, a.label)));

        card.append(header, h('div', { class: 'ts-modal-body' }, body), footer);
        overlay.append(card);
        overlay.addEventListener('pointerdown', (e) => { overlay.dataset.downOutside = String(e.target === overlay); });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && overlay.dataset.downOutside === 'true') close(dismissValue);
        });

        stack.push(entry);
        document.body.append(overlay);
        requestAnimationFrame(() => {
            overlay.classList.add('is-open');
            const first = card.querySelector('[data-autofocus]') ?? footer.querySelector('.ts-btn-dark');
            first?.focus({ preventScroll: true });
        });
    });
}

export const hasOpenModal = () => stack.length > 0;

function field(label, control, hint) {
    return h('label', { class: 'ts-field' },
        h('span', { class: 'ts-field-label' }, label),
        control,
        hint ? h('span', { class: 'ts-field-hint' }, hint) : null);
}

/** Поля «день · месяц · год» и (опционально) «время» с днём недели и быстрыми кнопками. */
export function dateTimeField(t, { withTime = true, realNow = false, onChange } = {}) {
    const p = split(t);
    const day = h('input', { type: 'number', inputmode: 'numeric', min: 1, max: 31, value: p.d, class: 'ts-input ts-in-day', 'aria-label': 'День' });
    const month = h('select', { class: 'ts-input ts-in-month', 'aria-label': 'Месяц' },
        LOCALES.ru.monthsGen.map((name, i) => h('option', { value: String(i + 1), selected: i + 1 === p.m }, name)));
    const year = h('input', { type: 'number', inputmode: 'numeric', value: p.y, class: 'ts-input ts-in-year', 'aria-label': 'Год' });
    const time = withTime ? timeInput(p.minutes) : null;
    const weekday = h('span', { class: 'ts-dt-weekday' });

    const read = () => {
        const y = parseInt(year.value, 10);
        const m = Number(month.value);
        let d = parseInt(day.value, 10);
        if (!Number.isFinite(y) || !Number.isFinite(d) || m < 1 || m > 12) return null;
        d = Math.min(Math.max(d, 1), daysInMonth(y, m));
        const minutes = withTime ? (parseHM(time.value) ?? p.minutes) : 0;
        return makeTime(y, m, d, minutes);
    };
    const write = (v) => {
        const q = split(v);
        day.value = String(q.d);
        month.value = String(q.m);
        year.value = String(q.y);
        time?.setMinutes(q.minutes);
        update();
    };
    const update = () => {
        const v = read();
        weekday.textContent = v === null ? '—' : cap(fmtWeekday(v));
        onChange?.(v);
    };
    for (const el of [day, month, year, time].filter(Boolean)) {
        el.addEventListener('input', update);
        el.addEventListener('change', update);
    }

    const chips = withTime
        ? h('div', { class: 'ts-chips' },
            [['−1 ч', -60], ['+15 мин', 15], ['+1 ч', 60], ['+1 день', DAY]].map(([label, delta]) =>
                h('button', { type: 'button', class: 'ts-chip', onClick: () => { const v = read(); if (v !== null) write(v + delta); } }, label)),
            realNow ? h('button', {
                type: 'button', class: 'ts-chip', title: 'Дата и время вашего устройства',
                onClick: () => { const d = new Date(); write(makeTime(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours() * 60 + d.getMinutes())); },
            }, 'Реальное время') : null)
        : null;

    const el = h('div', { class: 'ts-dt' },
        h('div', { class: 'ts-dt-row' }, day, month, year),
        h('div', { class: 'ts-dt-row' }, time, weekday),
        chips);
    update();
    return { el, get value() { return read(); }, set: write, focus: () => (time ?? day).focus() };
}

const fmtPoint = (t) => `${fmtDateShort(t)} ${split(t).y} · ${fmtTime(t)}`;

/** Ручная правка времени. Возвращает новое время, 'remove' или null. */
export async function editTimeDialog({ title = 'Время мира', kicker = 'ВРЕМЯ МИРА', t, before = null, allowRemove = false, note = '' }) {
    const diff = h('span', { class: 'ts-diff' });
    const dt = dateTimeField(t, {
        realNow: true,
        onChange: (v) => {
            diff.textContent = before === null || v === null ? '' : `${fmtDelta(v - before)} от предыдущей отметки`;
        },
    });
    const body = [
        note ? h('p', { class: 'ts-p' }, note) : null,
        dt.el,
        before !== null ? h('div', { class: 'ts-compare-mini' }, `До этого: ${fmtPoint(before)}`, h('br'), diff) : null,
    ];
    const actions = [];
    if (allowRemove) actions.push({ label: 'Убрать отметку', kind: 'ghost', value: 'remove' });
    actions.push({ label: 'Отмена', kind: 'ghost', value: null, push: true });
    actions.push({ label: 'Сохранить', kind: 'primary', value: () => dt.value, validate: () => dt.value !== null });
    return openModal({ title, kicker, body, actions });
}

/** Правка отметки времени конкретного сообщения (журнал, метка в чате). */
export async function editMessageTime(index) {
    const snap = getSnap(ctx().chat?.[index]);
    if (!snap || !Number.isFinite(snap.t)) return;
    const res = await editTimeDialog({
        title: `После сообщения #${index}`,
        kicker: 'ВРЕМЯ МИРА',
        t: snap.t,
        before: nowAt(index - 1),
        allowRemove: true,
        note: snap.tag ? `Отметка модели: [time: ${snap.tag}]` : '',
    });
    if (res === 'remove') removeMessageTime(index);
    else if (Number.isFinite(res)) setMessageTime(index, res);
}

/**
 * Окно подтверждения записи времени, которое предложила модель.
 * @returns {Promise<{action:'accept', t:number, dontAsk:boolean}|{action:'reject', dontAsk:boolean}|{action:'later'}>}
 */
export async function confirmTimeDialog({ before, proposed, source, who, bind = null }) {
    const toRow = h('div', { class: 'ts-compare-val' });
    const deltaEl = h('div', { class: 'ts-compare-delta' });
    const refresh = (v) => {
        if (v === null) { toRow.textContent = '—'; deltaEl.textContent = ''; return; }
        toRow.textContent = fmtPoint(v);
        const newDay = dayOf(v) !== dayOf(before);
        deltaEl.textContent = fmtDelta(v - before) + (newDay ? ' · новый день' : '');
        deltaEl.classList.toggle('is-new-day', newDay);
    };
    const dt = dateTimeField(proposed, { onChange: refresh });
    let dontAsk = false;

    const body = [
        h('p', { class: 'ts-p' }, who ? `${who}: время в истории изменилось.` : 'Время в истории изменилось.', ' Записать в календарь?'),
        source ? h('div', { class: 'ts-source' }, source) : null,
        h('div', { class: 'ts-compare' },
            h('div', { class: 'ts-compare-row' }, h('span', { class: 'ts-compare-key' }, 'Было'), h('div', { class: 'ts-compare-val is-muted' }, fmtPoint(before))),
            h('div', { class: 'ts-compare-row' }, h('span', { class: 'ts-compare-key' }, 'Станет'), h('div', null, toRow, deltaEl))),
        h('div', { class: 'ts-field-label' }, 'Поправить, если нужно'),
        dt.el,
        h('div', { class: 'ts-row ts-row-tight' },
            h('div', { class: 'ts-row-text' },
                h('span', { class: 'ts-row-title' }, 'Больше не спрашивать'),
                h('span', { class: 'ts-row-hint' }, 'Можно снова включить в настройках')),
            switchButton({ on: false, label: 'Больше не спрашивать', onToggle: (v) => { dontAsk = v; } })),
    ];
    refresh(proposed);

    return openModal({
        title: 'Записать новое время?',
        kicker: 'СМЕНА ВРЕМЕНИ',
        body,
        bind,
        dismissValue: { action: 'later' },
        actions: [
            { label: 'Не менять', kind: 'ghost', push: true, value: () => ({ action: 'reject', dontAsk }) },
            { label: 'Записать', kind: 'primary', value: () => ({ action: 'accept', t: dt.value, dontAsk }), validate: () => dt.value !== null },
        ],
    });
}

const REPEATS = [['none', 'Не повторять'], ['weekly', 'Каждую неделю'], ['monthly', 'Каждый месяц'], ['yearly', 'Каждый год']];

/** Создание/правка события. Возвращает событие, { delete: true } или null. */
export async function eventDialog(ev, defaultDay) {
    const name = h('input', { type: 'text', class: 'ts-input', value: ev?.name ?? '', placeholder: 'Ярмарка на рыночной площади', 'data-autofocus': true, maxlength: 200 });
    const when = h('input', { type: 'text', class: 'ts-input', value: ev?.time ?? '', placeholder: '19:00, 10:00–16:00, весь день, ночь…', maxlength: 60 });
    const date = dateTimeField((ev?.day ?? defaultDay) * DAY, { withTime: false });
    const repeat = h('select', { class: 'ts-input' }, REPEATS.map(([v, l]) => h('option', { value: v, selected: (ev?.repeat ?? 'none') === v }, l)));

    const actions = [];
    if (ev) actions.push({ label: 'Удалить', kind: 'danger', value: { delete: true } });
    actions.push({ label: 'Отмена', kind: 'ghost', value: null, push: true });
    actions.push({
        label: 'Сохранить',
        kind: 'primary',
        validate: () => { const ok = !!name.value.trim() && date.value !== null; if (!ok) name.focus(); return ok; },
        value: () => ({ id: ev?.id, name: name.value.trim(), time: when.value.trim(), day: dayOf(date.value), repeat: repeat.value }),
    });

    return openModal({
        title: ev ? 'Событие' : 'Новое событие',
        kicker: 'КАЛЕНДАРЬ МИРА',
        body: [
            field('Что происходит', name),
            field('Когда', when, 'Свободный текст — так его увидит ИИ.'),
            h('div', { class: 'ts-field' }, h('span', { class: 'ts-field-label' }, 'Дата'), date.el),
            field('Повтор', repeat),
        ],
        actions,
    });
}

function dayChips(days, onChange) {
    const set = new Set(days?.length ? days : ALL_DAYS);
    const wrap = h('div', { class: 'ts-daychips', role: 'group', 'aria-label': 'Дни недели' });
    ALL_DAYS.forEach((d) => {
        const b = h('button', { type: 'button', class: ['ts-daychip', set.has(d) && 'is-on'], 'aria-pressed': set.has(d) ? 'true' : 'false' }, LOCALES.ru.wdShort[d]);
        b.addEventListener('click', () => {
            if (set.has(d)) set.delete(d); else set.add(d);
            b.classList.toggle('is-on', set.has(d));
            b.setAttribute('aria-pressed', set.has(d) ? 'true' : 'false');
            onChange([...set].sort());
        });
        wrap.append(b);
    });
    return wrap;
}

/** Создание/правка NPC. Возвращает NPC, { delete: true } или null. */
export async function npcDialog(npc) {
    const draft = normalizeNpc(npc ?? { name: '', shifts: [{ from: 1080, to: 120, days: [...ALL_DAYS] }] });
    if (!npc) draft.name = '';

    const name = h('input', { type: 'text', class: 'ts-input', value: draft.name, placeholder: 'Олег', 'data-autofocus': true, maxlength: 80 });
    const role = h('input', { type: 'text', class: 'ts-input', value: draft.role, placeholder: 'трактирщик', maxlength: 80 });
    const place = h('input', { type: 'text', class: 'ts-input', value: draft.place, placeholder: 'Таверна «Сизый кит»', maxlength: 120 });
    const elsewhere = h('input', { type: 'text', class: 'ts-input', value: draft.elsewhere, placeholder: 'дома, отсыпается', maxlength: 120 });
    const notes = h('textarea', { class: 'ts-input', rows: 2, placeholder: 'Характер, привычки — коротко, это увидит ИИ', maxlength: 400 }, draft.notes);
    let hidden = draft.hidden;

    const shiftsBox = h('div', { class: 'ts-shifts' });
    const renderShifts = () => {
        shiftsBox.replaceChildren(...draft.shifts.map((s, i) => {
            const from = timeInput(s.from, { cls: 'ts-input', label: 'Начало смены', onCommit: (m) => { s.from = m; } });
            const to = timeInput(s.to, { cls: 'ts-input', label: 'Конец смены', onCommit: (m) => { s.to = m; } });
            const sp = h('input', { type: 'text', class: 'ts-input', value: s.place, placeholder: 'Место (если не основное)', maxlength: 120 });
            sp.addEventListener('input', () => { s.place = sp.value; });
            const remove = h('button', { type: 'button', class: 'ts-icon-btn ts-icon-btn-sm', 'aria-label': 'Удалить смену', title: 'Удалить смену', onClick: () => { draft.shifts.splice(i, 1); renderShifts(); } }, icon('trash', { size: 16 }));
            return h('div', { class: 'ts-shift' },
                h('div', { class: 'ts-shift-times' }, h('span', { class: 'ts-shift-label' }, 'с'), from, h('span', { class: 'ts-shift-label' }, 'до'), to, remove),
                dayChips(s.days, (days) => { s.days = days; }),
                sp);
        }));
        if (!draft.shifts.length) shiftsBox.append(h('div', { class: 'ts-hand ts-muted' }, 'Без смен — NPC считается «без расписания».'));
    };
    renderShifts();

    const actions = [];
    if (npc) actions.push({ label: 'Удалить', kind: 'danger', value: { delete: true } });
    actions.push({ label: 'Отмена', kind: 'ghost', value: null, push: true });
    actions.push({
        label: 'Сохранить',
        kind: 'primary',
        validate: () => { const ok = !!name.value.trim(); if (!ok) name.focus(); return ok; },
        value: () => normalizeNpc({
            ...draft,
            name: name.value.trim(),
            role: role.value.trim(),
            place: place.value.trim(),
            elsewhere: elsewhere.value.trim(),
            notes: notes.value.trim(),
            hidden,
            shifts: draft.shifts.filter(s => s.days.length),
        }),
    });

    return openModal({
        title: npc ? npc.name : 'Новый NPC',
        kicker: 'РАСПИСАНИЕ NPC',
        size: 'lg',
        body: [
            h('div', { class: 'ts-grid2' }, field('Имя', name), field('Кто это', role)),
            field('Где бывает по расписанию', place),
            field('Где в остальное время', elsewhere, 'Необязательно. Например: «дома», «в лесу на охоте».'),
            field('Заметка для ИИ', notes),
            h('div', { class: 'ts-field' },
                h('span', { class: 'ts-field-label' }, 'Смены'),
                shiftsBox,
                h('button', { type: 'button', class: 'ts-btn ts-btn-outline ts-btn-sm', onClick: () => { draft.shifts.push({ from: 540, to: 1080, days: [...ALL_DAYS], place: '' }); renderShifts(); } }, icon('plus', { size: 14, width: 2.4 }), 'Смена'),
                h('span', { class: 'ts-field-hint' }, 'Смена «18:00–02:00» в пн — с вечера понедельника до 2 ночи вторника. Одинаковые «с» и «до» — круглосуточно.')),
            h('div', { class: 'ts-row ts-row-tight' },
                h('div', { class: 'ts-row-text' },
                    h('span', { class: 'ts-row-title' }, 'Скрыть от ИИ'),
                    h('span', { class: 'ts-row-hint' }, 'NPC останется в блокноте, но не попадёт в промпт')),
                switchButton({ on: hidden, label: 'Скрыть от ИИ', onToggle: (v) => { hidden = v; } })),
        ],
        actions,
    });
}

/** Простое подтверждение. */
export function confirmDialog({ title, text, ok = 'Да', cancel = 'Отмена', danger = false }) {
    return openModal({
        title,
        body: h('p', { class: 'ts-p' }, text),
        actions: [
            { label: cancel, kind: 'ghost', value: false, push: true },
            { label: ok, kind: danger ? 'danger' : 'primary', value: true },
        ],
        dismissValue: false,
        size: 'sm',
    });
}

export { fmtPoint };
