// Time System — расширение SillyTavern: у мира есть время, у NPC — расписания.

import { ctx, settings, onChange, emitChange, chatState, hasChat, getSnap, nowAt } from './src/store.js';
import { applyPrompt } from './src/prompt.js';
import { processMessage, processEdit, resetForChat, reopenPending } from './src/tracker.js';
import { notebook } from './src/ui/notebook.js';
import { editMessageTime } from './src/ui/dialogs.js';
import { decorateAll, decorateById, setStampHandler, syncBodyClasses } from './src/ui/chat.js';
import { mountWidget, updateWidget, mountWandItem, mountPanel, updatePanel } from './src/ui/widget.js';
import { registerCommands, registerMacros } from './src/commands.js';

const openNotebook = () => notebook.open();

let domTimer = null;
function scheduleDom(delay = 30) {
    clearTimeout(domTimer);
    domTimer = setTimeout(() => {
        updateWidget();
        updatePanel();
        decorateAll();
    }, delay);
}

function onStampClick(index) {
    const snap = getSnap(ctx().chat?.[index]);
    if (!snap) return;
    if (snap.src === 'pending') reopenPending(index);
    else editMessageTime(index);
}

/**
 * Перехватчик генерации (manifest.generate_interceptor): прямо перед сборкой промпта
 * ставим актуальное время. При свайпе последнее сообщение ещё содержит данные старого
 * варианта, поэтому берём время до него.
 */
globalThis.timeSystemGenerateInterceptor = async function (_chat, _contextSize, _abort, type) {
    try {
        if (!hasChat()) return;
        const len = ctx().chat?.length ?? 0;
        applyPrompt(nowAt(type === 'swipe' ? len - 2 : len - 1));
    } catch (e) {
        console.error('[Time System] interceptor', e);
    }
};

function onChatChanged() {
    resetForChat();
    if (hasChat()) chatState();
    emitChange('all');
    scheduleDom(150);
}

function init() {
    settings();
    const { eventSource } = ctx();
    const ev = ctx().eventTypes ?? ctx().event_types;

    onChange(() => {
        try { applyPrompt(); } catch (e) { console.error('[Time System]', e); }
        syncBodyClasses();
        scheduleDom();
    });

    mountPanel(openNotebook);
    mountWandItem(openNotebook);
    mountWidget(openNotebook);
    setStampHandler(onStampClick);
    registerCommands(openNotebook);
    registerMacros();

    const on = (name, fn) => {
        if (ev[name]) eventSource.on(ev[name], (...args) => {
            try { return fn(...args); } catch (e) { console.error(`[Time System] ${name}`, e); }
        });
    };

    on('CHAT_CHANGED', onChatChanged);
    on('MESSAGE_RECEIVED', (id, type) => processMessage(Number(id), type));
    on('MESSAGE_SENT', (id) => processMessage(Number(id), 'normal'));
    on('MESSAGE_EDITED', (id) => processEdit(Number(id)));
    on('MESSAGE_SWIPED', () => emitChange('time'));
    on('MESSAGE_DELETED', () => emitChange('time'));
    on('MESSAGE_SWIPE_DELETED', () => emitChange('time'));
    on('CHARACTER_MESSAGE_RENDERED', (id) => decorateById(id));
    on('USER_MESSAGE_RENDERED', (id) => decorateById(id));
    on('MESSAGE_UPDATED', (id) => decorateById(id));
    on('MORE_MESSAGES_LOADED', () => scheduleDom());
    on('SETTINGS_UPDATED', () => scheduleDom());

    syncBodyClasses();
    onChatChanged();
    console.log('[Time System] загружено');
}

jQuery(() => {
    try {
        init();
    } catch (e) {
        console.error('[Time System] ошибка запуска', e);
        globalThis.toastr?.error?.('Не удалось запустить Time System — подробности в консоли.');
    }
});
