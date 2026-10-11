// Настройки расширения, состояние чата и «снимки» времени на сообщениях.
//
// Как хранится время:
//  • chatMetadata.time_system.base — время в начале чата;
//  • message.extra.time_system = { t, b, src, tag } — время мира ПОСЛЕ этого сообщения (t)
//    и время до него (b). ST хранит extra отдельно для каждого свайпа, поэтому свайпы,
//    удаления и ветки сами «откатывают» время: текущее время = снимок последнего сообщения.

import { DAY, ALL_DAYS, makeTime, dayOf, split, daysInMonth } from './calendar.js';

export const KEY = 'time_system';

export const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    autoAdvance: true,
    autoMinutes: 10,
    detection: 'tag',          // tag | analysis | off
    confirm: 'off',            // off | day | big | always
    wakeTime: 480,
    hideTags: true,
    showStamps: true,
    showWidget: true,
    injectPosition: 'chat',    // chat | after | before
    injectDepth: 1,
    injectRole: 'system',      // system | user | assistant
    promptLang: 'ru',
    includeNpcs: true,
    includeEvents: true,
    template: '',
    tagRule: '',
});

export const ctx = () => SillyTavern.getContext();

// ───────────────────────── шина изменений ─────────────────────────

const listeners = new Set();
export function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
export function emitChange(what = 'all') {
    for (const fn of listeners) {
        try { fn(what); } catch (e) { console.error('[Time System]', e); }
    }
}

// ───────────────────────── настройки ─────────────────────────

export function settings() {
    const store = ctx().extensionSettings;
    if (!store[KEY] || typeof store[KEY] !== 'object') store[KEY] = {};
    const s = store[KEY];
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
        if (s[k] === undefined) s[k] = v;
    }
    return s;
}

export function setSetting(key, value) {
    settings()[key] = value;
    ctx().saveSettingsDebounced();
    emitChange('settings');
}

export function resetSettings() {
    const s = settings();
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, DEFAULT_SETTINGS);
    ctx().saveSettingsDebounced();
    emitChange('settings');
}

// ───────────────────────── чат ─────────────────────────

export function hasChat() {
    const c = ctx();
    const id = typeof c.getCurrentChatId === 'function' ? c.getCurrentChatId() : c.chatId;
    return !!id && !!c.chatMetadata;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Шаблон мира, сохранённый в карточке персонажа (data.extensions.time_system). */
export function cardTemplate() {
    const c = ctx();
    if (c.groupId || c.characterId === undefined || c.characterId === null) return null;
    const tpl = c.characters?.[c.characterId]?.data?.extensions?.[KEY];
    return tpl && typeof tpl === 'object' ? tpl : null;
}

function initialState() {
    const tpl = cardTemplate();
    const d = new Date();
    const base = Number.isFinite(tpl?.start)
        ? tpl.start
        : makeTime(d.getFullYear(), d.getMonth() + 1, d.getDate(), Math.round((d.getHours() * 60 + d.getMinutes()) / 5) * 5);
    return {
        v: 1,
        base,
        npcs: Array.isArray(tpl?.npcs) ? structuredClone(tpl.npcs) : [],
        events: Array.isArray(tpl?.events) ? structuredClone(tpl.events) : [],
        notes: '',
        notesToPrompt: false,
    };
}

function normalizeShift(s) {
    const from = Number.isFinite(s?.from) ? s.from : 540;
    const to = Number.isFinite(s?.to) ? s.to : 1080;
    const days = Array.isArray(s?.days) ? [...new Set(s.days.filter(x => Number.isInteger(x) && x >= 0 && x < 7))].sort() : [...ALL_DAYS];
    return { from: ((from % DAY) + DAY) % DAY, to: ((to % DAY) + DAY) % DAY, days, place: String(s?.place ?? '') };
}

export function normalizeNpc(n) {
    return {
        id: n?.id || uid(),
        name: String(n?.name ?? '').trim() || 'Без имени',
        role: String(n?.role ?? ''),
        place: String(n?.place ?? ''),
        elsewhere: String(n?.elsewhere ?? ''),
        notes: String(n?.notes ?? ''),
        hidden: !!n?.hidden,
        shifts: Array.isArray(n?.shifts) ? n.shifts.map(normalizeShift) : [],
    };
}

export function normalizeEvent(e) {
    return {
        id: e?.id || uid(),
        day: Number.isFinite(e?.day) ? Math.floor(e.day) : dayOf(now() ?? 0),
        time: String(e?.time ?? ''),
        name: String(e?.name ?? '').trim() || 'Событие',
        repeat: ['none', 'weekly', 'monthly', 'yearly'].includes(e?.repeat) ? e.repeat : 'none',
    };
}

/** Состояние текущего чата (создаётся при первом обращении). null — чат не открыт. */
export function chatState() {
    if (!hasChat()) return null;
    const meta = ctx().chatMetadata;
    let st = meta[KEY];
    if (!st || typeof st !== 'object') {
        st = meta[KEY] = initialState();
        saveMeta();
    }
    if (!Number.isFinite(st.base)) st.base = initialState().base;
    if (!Array.isArray(st.npcs)) st.npcs = [];
    if (!Array.isArray(st.events)) st.events = [];
    if (typeof st.notes !== 'string') st.notes = '';
    return st;
}

export function saveMeta() {
    const c = ctx();
    if (typeof c.saveMetadataDebounced === 'function') c.saveMetadataDebounced();
    else c.saveMetadata?.();
}

let chatSaveTimer = null;
export function saveChatSoon() {
    clearTimeout(chatSaveTimer);
    chatSaveTimer = setTimeout(() => {
        const c = ctx();
        (c.saveChat ?? c.saveChatConditional)?.call(c);
    }, 400);
}

// ───────────────────────── снимки времени ─────────────────────────

export function getSnap(msg) {
    const s = msg?.extra?.[KEY];
    return s && typeof s === 'object' ? s : null;
}

export function snapTime(msg) {
    const s = getSnap(msg);
    return s && Number.isFinite(s.t) ? s.t : null;
}

/** Пишет снимок в сообщение и в данные текущего свайпа. */
export function writeSnap(msg, snap) {
    if (!msg) return;
    if (!msg.extra || typeof msg.extra !== 'object') msg.extra = {};
    msg.extra[KEY] = snap;
    const info = Array.isArray(msg.swipe_info) ? msg.swipe_info[msg.swipe_id ?? 0] : null;
    if (info && typeof info === 'object') {
        if (!info.extra || typeof info.extra !== 'object') info.extra = {};
        info.extra[KEY] = structuredClone(snap);
    }
}

export function clearSnap(msg) {
    if (msg?.extra) delete msg.extra[KEY];
    const info = Array.isArray(msg?.swipe_info) ? msg.swipe_info[msg.swipe_id ?? 0] : null;
    if (info?.extra) delete info.extra[KEY];
}

/** Время мира после сообщения с индексом index (−1 — начало чата). */
export function nowAt(index) {
    const chat = ctx().chat ?? [];
    for (let i = Math.min(index, chat.length - 1); i >= 0; i--) {
        const t = snapTime(chat[i]);
        if (t !== null) return t;
    }
    return chatState()?.base ?? null;
}

/** Текущее время мира. */
export function now() {
    if (!hasChat()) return null;
    return nowAt((ctx().chat?.length ?? 0) - 1);
}

/**
 * После правки снимка в сообщении `fromIndex - 1` подтягивает следующие:
 * авто-шаги сохраняют свою длительность, точные отметки остаются как были.
 */
export function reflow(fromIndex) {
    const chat = ctx().chat ?? [];
    for (let j = Math.max(0, fromIndex); j < chat.length; j++) {
        const s = getSnap(chat[j]);
        if (!s) continue;
        const before = nowAt(j - 1);
        if (s.b === before) break;
        if (Number.isFinite(s.t) && (s.src === 'auto' || s.src === 'rejected') && Number.isFinite(s.b)) {
            s.t = before + (s.t - s.b);
        }
        s.b = before;
        writeSnap(chat[j], s);
    }
}

/** Ручная установка текущего времени. */
export function setNow(t) {
    const st = chatState();
    if (!st || !Number.isFinite(t)) return;
    const chat = ctx().chat ?? [];
    if (chat.length <= 1) {
        st.base = Math.round(t);
        if (chat[0] && getSnap(chat[0])) clearSnap(chat[0]);
        saveMeta();
        if (chat.length) saveChatSoon();
    } else {
        const last = chat.length - 1;
        const { p, tok, ...prev } = getSnap(chat[last]) ?? {};
        writeSnap(chat[last], {
            ...prev,
            t: Math.round(t),
            b: Number.isFinite(prev.b) ? prev.b : nowAt(last - 1),
            src: 'manual',
        });
        saveChatSoon();
    }
    emitChange('time');
}

/** Исправление времени конкретного сообщения (из журнала или метки в чате). */
export function setMessageTime(index, t) {
    const chat = ctx().chat ?? [];
    const msg = chat[index];
    if (!msg || !Number.isFinite(t)) return;
    const { p, tok, ...prev } = getSnap(msg) ?? {};
    writeSnap(msg, { ...prev, t: Math.round(t), b: nowAt(index - 1), src: 'manual' });
    reflow(index + 1);
    saveChatSoon();
    emitChange('time');
}

/** Удаляет отметку сообщения — время берётся из предыдущего. */
export function removeMessageTime(index) {
    const msg = ctx().chat?.[index];
    if (!msg) return;
    clearSnap(msg);
    reflow(index + 1);
    saveChatSoon();
    emitChange('time');
}

/** Все отметки времени в чате (для журнала). */
export function journal() {
    const chat = ctx().chat ?? [];
    const out = [];
    for (let i = 0; i < chat.length; i++) {
        const s = getSnap(chat[i]);
        if (!s) continue;
        out.push({ index: i, name: chat[i].name, isUser: !!chat[i].is_user, snap: s });
    }
    return out;
}

// ───────────────────────── NPC и события ─────────────────────────

export function upsertNpc(npc) {
    const st = chatState();
    if (!st) return null;
    const n = normalizeNpc(npc);
    const i = st.npcs.findIndex(x => x.id === n.id);
    if (i >= 0) st.npcs[i] = n; else st.npcs.push(n);
    saveMeta();
    emitChange('npcs');
    return n;
}

export function deleteNpc(id) {
    const st = chatState();
    if (!st) return;
    st.npcs = st.npcs.filter(x => x.id !== id);
    saveMeta();
    emitChange('npcs');
}

export function upsertEvent(ev) {
    const st = chatState();
    if (!st) return null;
    const e = normalizeEvent(ev);
    const i = st.events.findIndex(x => x.id === e.id);
    if (i >= 0) st.events[i] = e; else st.events.push(e);
    saveMeta();
    emitChange('events');
    return e;
}

export function deleteEvent(id) {
    const st = chatState();
    if (!st) return;
    st.events = st.events.filter(x => x.id !== id);
    saveMeta();
    emitChange('events');
}

function occursOn(e, day) {
    if (day === e.day) return true;
    if (day < e.day) return false;
    switch (e.repeat) {
        case 'weekly': return (day - e.day) % 7 === 0;
        case 'monthly': {
            const a = split(day * DAY);
            const b = split(e.day * DAY);
            return a.d === Math.min(b.d, daysInMonth(a.y, a.m));
        }
        case 'yearly': {
            const a = split(day * DAY);
            const b = split(e.day * DAY);
            return a.m === b.m && a.d === b.d;
        }
        default: return false;
    }
}

const eventSortKey = (e) => {
    const m = /(\d{1,2}):(\d{2})/.exec(e.time);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    if (/весь|all/i.test(e.time) || !e.time) return -1;
    return 2000;
};

export function eventsOn(day) {
    const st = chatState();
    if (!st) return [];
    return st.events.filter(e => occursOn(e, day)).sort((a, b) => eventSortKey(a) - eventSortKey(b));
}

export function setNotes(text, toPrompt) {
    const st = chatState();
    if (!st) return;
    if (typeof text === 'string') st.notes = text;
    if (typeof toPrompt === 'boolean') st.notesToPrompt = toPrompt;
    saveMeta();
    emitChange('notes');
}

/** Перенос даты мира на день `day`, время суток сохраняется. */
export function moveToDay(day) {
    const t = now();
    if (t === null) return;
    setNow(day * DAY + (t - dayOf(t) * DAY));
}


/** Время начала чата (до первой отметки). */
export function setBase(t) {
    const st = chatState();
    if (!st || !Number.isFinite(t)) return;
    st.base = Math.round(t);
    reflow(0);
    saveMeta();
    saveChatSoon();
    emitChange('time');
}

// ───────────────────────── импорт / экспорт / карточка ─────────────────────────

export function exportWorld() {
    const st = chatState();
    if (!st) return null;
    return { format: 'st-time-system', version: 1, start: st.base, npcs: st.npcs, events: st.events, notes: st.notes };
}

/** mode: 'replace' — заменить NPC и события, 'merge' — добавить новые (по имени / id). */
export function importWorld(data, mode = 'merge') {
    const st = chatState();
    if (!st || !data || typeof data !== 'object') throw new Error('Пустые данные');
    const npcs = Array.isArray(data.npcs) ? data.npcs.map(normalizeNpc) : [];
    const events = Array.isArray(data.events) ? data.events.map(normalizeEvent) : [];
    if (!npcs.length && !events.length) throw new Error('В файле нет NPC и событий');
    if (mode === 'replace') {
        st.npcs = npcs;
        st.events = events;
    } else {
        for (const n of npcs) {
            const i = st.npcs.findIndex(x => x.id === n.id || x.name.toLowerCase() === n.name.toLowerCase());
            if (i >= 0) st.npcs[i] = { ...n, id: st.npcs[i].id }; else st.npcs.push(n);
        }
        for (const e of events) {
            if (!st.events.some(x => x.id === e.id || (x.day === e.day && x.name === e.name))) st.events.push(e);
        }
    }
    saveMeta();
    emitChange('all');
    return { npcs: npcs.length, events: events.length };
}

export const canUseCard = () => {
    const c = ctx();
    return !c.groupId && c.characterId !== undefined && c.characterId !== null && !!c.characters?.[c.characterId];
};

export async function saveTemplateToCard() {
    const c = ctx();
    const st = chatState();
    if (!st || !canUseCard()) throw new Error('Шаблон можно сохранить только в чате с одним персонажем');
    await c.writeExtensionField(c.characterId, KEY, { start: st.base, npcs: st.npcs, events: st.events });
}

export function loadTemplateFromCard(mode = 'replace') {
    const tpl = cardTemplate();
    if (!tpl) throw new Error('В карточке персонажа нет сохранённого шаблона');
    return importWorld(tpl, mode);
}
