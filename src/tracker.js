// Отслеживание смены времени по сообщениям чата.
//
// После каждого ответа персонажа:
//  1. если в ответе есть тег [time: …] — берём время из него;
//  2. иначе (режим «анализ») — отдельным запросом спрашиваем модель, сколько прошло;
//  3. иначе — авто-ход (+N минут за ответ).
// При включённом подтверждении изменение из тега/анализа сначала показывается пользователю.

import {
    ctx, settings, setSetting, hasChat, chatState, getSnap, writeSnap, clearSnap, nowAt, reflow,
    saveChatSoon, emitChange, uid,
} from './store.js';
import { findTag, parseTimeValue, dayOf, tagRegex } from './calendar.js';
import { analysisPrompt } from './prompt.js';
import { confirmTimeDialog } from './ui/dialogs.js';
import { toast } from './ui/dom.js';
import { t as tr } from './i18n.js';

const FRESH_TYPES = new Set(['normal', 'swipe', 'regenerate', 'first_message', 'quiet', undefined, null, '']);

function shouldConfirm(before, t) {
    const mode = settings().confirm;
    if (mode === 'off' || t === before) return false;
    if (mode === 'always') return true;
    const newDay = dayOf(t) !== dayOf(before);
    if (mode === 'day') return newDay;
    if (mode === 'big') return newDay || Math.abs(t - before) >= 180;
    return false;
}

function commit() {
    saveChatSoon();
    emitChange('time');
}

/** Записывает предложенное время (или ставит его в очередь на подтверждение). */
function propose(index, before, t, via, tag, { force = false } = {}) {
    const msg = ctx().chat?.[index];
    if (!msg) return;
    if (!force && shouldConfirm(before, t)) {
        const tok = uid();
        writeSnap(msg, { b: before, src: 'pending', via, tag: tag ?? null, p: t, tok });
        commit();
        enqueueConfirm(index, tok);
        return;
    }
    writeSnap(msg, { t, b: before, src: via, tag: tag ?? null });
    reflow(index + 1);
    commit();
}

/** Обработка нового/дописанного сообщения (MESSAGE_RECEIVED, MESSAGE_SENT). */
export function processMessage(index, type) {
    const s = settings();
    if (!s.enabled || !hasChat()) return;
    const msg = ctx().chat?.[index];
    if (!msg || msg.is_system) return;
    chatState();

    const before = nowAt(index - 1);
    if (before === null) return;
    const tag = findTag(msg.mes);
    const prev = getSnap(msg);

    // «Продолжить» и повторные события: если ничего важного не изменилось — не трогаем.
    if (!FRESH_TYPES.has(type) && prev && prev.b === before && (prev.tag ?? null) === (tag ?? null)) return;

    if (msg.is_user) {
        const t = tag ? parseTimeValue(tag, before) : null;
        if (t !== null) {
            writeSnap(msg, { t, b: before, src: 'user', tag });
            commit();
        } else if (prev) {
            clearSnap(msg);
            commit();
        }
        return;
    }

    if (tag && s.detection !== 'off') {
        const t = parseTimeValue(tag, before);
        if (t !== null) {
            propose(index, before, t, 'tag', tag);
            return;
        }
    }

    // Приветствие без тега не двигает время.
    if (type === 'first_message') {
        if (prev) { clearSnap(msg); commit(); }
        return;
    }

    const auto = s.autoAdvance ? before + Math.max(0, Math.round(Number(s.autoMinutes) || 0)) : before;
    const snap = { t: auto, b: before, src: 'auto', tag: tag ?? null };
    const runAnalysis = s.detection === 'analysis' && type !== 'continue' && type !== 'append' && type !== 'appendFinal';
    if (runAnalysis) snap.tok = uid();
    writeSnap(msg, snap);
    commit();
    if (runAnalysis) analyze(index, before, snap.tok);
}

/** Пользователь отредактировал сообщение: если поменялся тег — применяем без вопросов. */
export function processEdit(index) {
    if (!settings().enabled || !hasChat()) return;
    const msg = ctx().chat?.[index];
    if (!msg || msg.is_system) return;
    const prev = getSnap(msg);
    const tag = findTag(msg.mes);
    if ((prev?.tag ?? null) === (tag ?? null)) return;

    const before = nowAt(index - 1);
    if (before === null) return;
    if (tag) {
        const t = parseTimeValue(tag, before);
        if (t === null) return;
        writeSnap(msg, { t, b: before, src: msg.is_user ? 'user' : 'tag', tag });
    } else if (prev && (prev.src === 'tag' || prev.src === 'user' || prev.src === 'pending')) {
        if (msg.is_user) clearSnap(msg);
        else {
            const s = settings();
            writeSnap(msg, { t: s.autoAdvance ? before + (Number(s.autoMinutes) || 0) : before, b: before, src: 'auto', tag: null });
        }
    } else {
        return;
    }
    reflow(index + 1);
    commit();
}

// ───────────────────────── подтверждения ─────────────────────────

const queue = [];
let running = false;
let currentDialog = null;

export function enqueueConfirm(index, tok) {
    if (!queue.some(q => q.tok === tok)) queue.push({ index, tok });
    runQueue();
}

async function runQueue() {
    if (running) return;
    running = true;
    try {
        while (queue.length) {
            const { index, tok } = queue.shift();
            const msg = ctx().chat?.[index];
            const snap = getSnap(msg);
            if (!snap || snap.tok !== tok || snap.src !== 'pending') continue;

            const before = nowAt(index - 1);
            const dialog = {};
            currentDialog = dialog;
            const res = await confirmTimeDialog({
                before,
                proposed: snap.p,
                source: snap.tag ? `[time: ${snap.tag}]` : tr('confirm.byAnalysis'),
                who: msg.name,
                bind: (api) => { dialog.dismiss = api.dismiss; },
            });
            currentDialog = null;

            const cur = getSnap(ctx().chat?.[index]);
            if (!cur || cur.tok !== tok || cur.src !== 'pending') continue;
            if (res?.dontAsk) setSetting('confirm', 'off');

            if (res?.action === 'accept' && Number.isFinite(res.t)) {
                const snapOut = { t: res.t, b: before, src: cur.via || 'tag', tag: cur.tag ?? null };
                if (res.t !== cur.p) snapOut.ed = 1;
                writeSnap(ctx().chat[index], snapOut);
            } else if (res?.action === 'reject') {
                writeSnap(ctx().chat[index], { t: before, b: before, src: 'rejected', tag: cur.tag ?? null });
            } else {
                continue; // «позже» — остаётся в ожидании, метку в чате можно нажать
            }
            reflow(index + 1);
            commit();
        }
    } finally {
        running = false;
    }
}

/** Смена чата: закрываем окно, очищаем очередь, подхватываем неподтверждённые отметки. */
export function resetForChat() {
    queue.length = 0;
    currentDialog?.dismiss?.();
    currentDialog = null;
    resumePending();
}

export function resumePending() {
    if (!hasChat() || !settings().enabled) return;
    const chat = ctx().chat ?? [];
    for (let i = Math.max(0, chat.length - 30); i < chat.length; i++) {
        const s = getSnap(chat[i]);
        if (s?.src !== 'pending') continue;
        if (settings().confirm === 'off') {
            writeSnap(chat[i], { t: s.p, b: nowAt(i - 1), src: s.via || 'tag', tag: s.tag ?? null });
            reflow(i + 1);
            commit();
        } else {
            enqueueConfirm(i, s.tok);
        }
    }
}

// ───────────────────────── анализ ─────────────────────────

const cleanText = (text) => String(text ?? '')
    .replace(tagRegex(), '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

async function rawGenerate(prompt, systemPrompt) {
    const fn = ctx().generateRaw;
    if (typeof fn !== 'function') throw new Error(tr('err.noGenerateRaw'));
    // Новые версии принимают объект, старые — позиционные аргументы.
    if (fn.length === 0) return await fn({ prompt, systemPrompt });
    return await fn(prompt, null, false, false, systemPrompt);
}

async function analyze(index, before, tok) {
    const chat = ctx().chat ?? [];
    const msg = chat[index];
    const parts = [];
    const prevMsg = chat[index - 1];
    if (prevMsg && !prevMsg.is_system && prevMsg.is_user) parts.push(`${prevMsg.name}: ${cleanText(prevMsg.mes)}`);
    parts.push(`${msg.name}: ${cleanText(msg.mes)}`);
    const fragment = parts.join('\n\n').slice(-6000);
    const { system, prompt } = analysisPrompt(before, fragment);

    let result = '';
    try {
        result = String(await rawGenerate(prompt, system) ?? '');
    } catch (e) {
        console.warn('[Time System] анализ времени не удался', e);
        toast('warning', tr('toast.analysisFail'));
        return;
    }

    const cur = getSnap(ctx().chat?.[index]);
    if (!cur || cur.tok !== tok) return; // сообщение уже другое (свайп, удаление, смена чата)
    const value = findTag(result) ?? result.trim().split('\n').pop();
    const t = parseTimeValue(value, before);
    if (t === null || t === cur.t) {
        const { tok: _, ...rest } = cur;
        writeSnap(ctx().chat[index], rest);
        commit();
        return;
    }
    propose(index, before, t, 'analysis', null);
}

// ───────────────────────── отметки в чате ─────────────────────────

/** Нажатие на метку «ждёт подтверждения». */
export function reopenPending(index) {
    const s = getSnap(ctx().chat?.[index]);
    if (s?.src === 'pending' && s.tok) enqueueConfirm(index, s.tok);
}
