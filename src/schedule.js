// Расписания NPC: кто где находится в заданный момент времени мира.
// Смена принадлежит дню, в который начинается: «18:00–02:00, пн» — это с вечера понедельника
// до 02:00 вторника.

import { DAY, ALL_DAYS, dayOf, minutesOf, weekdayOf, fmtHM, LOCALES } from './calendar.js';
import { t as tr, uiLang } from './i18n.js';

const daysOf = (s) => (Array.isArray(s.days) && s.days.length ? s.days : ALL_DAYS);

/**
 * @returns {{ kind: 'present'|'away'|'off'|'none', shift?: object, until?: number|null, next?: {at:number, shift:object}|null, place: string }}
 */
export function npcStatus(npc, t) {
    const shifts = npc.shifts ?? [];
    if (!shifts.length) return { kind: 'none', place: npc.elsewhere || '', next: null };

    const day = dayOf(t);
    const m = minutesOf(t);
    const wd = weekdayOf(day);
    const wdPrev = (wd + 6) % 7;

    for (const s of shifts) {
        const days = daysOf(s);
        const place = s.place || npc.place;
        if (s.from === s.to) {
            if (days.includes(wd)) return { kind: 'present', shift: s, until: null, place };
            continue;
        }
        if (s.from < s.to) {
            if (days.includes(wd) && m >= s.from && m < s.to) return { kind: 'present', shift: s, until: day * DAY + s.to, place };
        } else {
            if (days.includes(wd) && m >= s.from) return { kind: 'present', shift: s, until: (day + 1) * DAY + s.to, place };
            if (days.includes(wdPrev) && m < s.to) return { kind: 'present', shift: s, until: day * DAY + s.to, place };
        }
    }

    let next = null;
    for (let k = 0; k <= 7 && !next; k++) {
        const dd = day + k;
        const w = weekdayOf(dd);
        for (const s of shifts) {
            if (!daysOf(s).includes(w)) continue;
            const at = dd * DAY + s.from;
            if (at > t && (!next || at < next.at)) next = { at, shift: s };
        }
    }

    const worksToday = shifts.some(s => daysOf(s).includes(wd));
    return { kind: worksToday ? 'away' : 'off', next, place: npc.elsewhere || '' };
}

/** Отрезки присутствия NPC в течение дня `day` в минутах: [[from, to], …]. */
export function segmentsForDay(npc, day) {
    const wd = weekdayOf(day);
    const wdPrev = (wd + 6) % 7;
    const segs = [];
    for (const s of npc.shifts ?? []) {
        const days = daysOf(s);
        if (s.from === s.to) {
            if (days.includes(wd)) segs.push([0, DAY]);
        } else if (s.from < s.to) {
            if (days.includes(wd)) segs.push([s.from, s.to]);
        } else {
            if (days.includes(wd)) segs.push([s.from, DAY]);
            if (days.includes(wdPrev)) segs.push([0, s.to]);
        }
    }
    return segs;
}

/** «пн–пт», «вых. пн», «пн, ср, пт» */
export function fmtDays(days, lang = uiLang()) {
    const L = LOCALES[lang] ?? LOCALES.ru;
    const list = Array.isArray(days) && days.length ? [...days].sort() : ALL_DAYS;
    if (list.length === 7) return '';
    if (list.length === 6) {
        const off = ALL_DAYS.find(d => !list.includes(d));
        return lang === 'en' ? `off ${L.wdShort[off]}` : `вых. ${L.wdShort[off]}`;
    }
    const consecutive = list.every((d, i) => i === 0 || d === list[i - 1] + 1);
    if (consecutive && list.length > 2) return `${L.wdShort[list[0]]}–${L.wdShort[list[list.length - 1]]}`;
    return list.map(d => L.wdShort[d]).join(', ');
}

export function fmtShift(s, lang = uiLang()) {
    const hours = s.from === s.to ? (lang === 'en' ? 'around the clock' : 'круглосуточно') : `${fmtHM(s.from)}–${fmtHM(s.to)}`;
    const days = fmtDays(s.days, lang);
    return days ? `${hours} · ${days}` : hours;
}

export const fmtHours = (npc, lang = uiLang()) => (npc.shifts ?? []).map(s => fmtShift(s, lang)).join(' / ');

/** Когда придёт: «в 18:00», «завтра в 08:00», «в пт в 08:00». */
export function fmtNextStart(next, t, lang = uiLang()) {
    if (!next) return '';
    const L = LOCALES[lang] ?? LOCALES.ru;
    const diff = dayOf(next.at) - dayOf(t);
    const hm = fmtHM(minutesOf(next.at));
    if (lang === 'en') {
        if (diff === 0) return `at ${hm}`;
        if (diff === 1) return `tomorrow at ${hm}`;
        return `on ${L.wdShort[weekdayOf(dayOf(next.at))]} at ${hm}`;
    }
    if (diff === 0) return `в ${hm}`;
    if (diff === 1) return `завтра в ${hm}`;
    return `в ${L.wdShort[weekdayOf(dayOf(next.at))]} в ${hm}`;
}

/** Короткий статус для карточки: «На месте · до 02:00», «Придёт в 18:00», «Выходной». */
export function statusLabel(st, t) {
    switch (st.kind) {
        case 'present': return st.until === null ? tr('st.presentAllDay') : tr('st.presentUntil', { time: fmtHM(minutesOf(st.until)) });
        case 'away': {
            const when = fmtNextStart(st.next, t);
            return when ? tr('st.comes', { when }) : tr('st.away');
        }
        case 'off': return tr('st.off');
        default: return tr('st.none');
    }
}
