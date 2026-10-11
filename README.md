# Time System — time and schedules for SillyTavern

**[English](#english) · [Русский](#русский)**

<a id="english"></a>

## English

The extension gives a roleplay world a clock and a calendar, and gives NPCs schedules.

> Oleg works at the tavern from 18:00 to 02:00. Drop by at 10 in the morning and he won't be there.

Each chat keeps its own time. When time passes in the story or a new day starts, the extension records it so the model doesn't lose track of days and hours. Every request to the model gets a short note: the current time, which NPCs are around, and what's planned for today.

It works on both desktop and mobile. On a large screen the interface is a two-page notebook spread; on a phone it's a single column and dialogs slide up from the bottom.

The interface is available in English and Russian. By default it follows the SillyTavern language; you can change it in the settings (“Interface language”). The language of the note sent to the model is set separately.

### Installation

1. In SillyTavern open **Extensions** (the cubes icon) → **Install extension**.
2. Paste `https://github.com/jellysilly/ST-Time-System` and press **Install**.
3. Open a chat. A small clock appears over the chat, and the ✨ (magic wand) menu gets a **Time System** item.

### How it works

#### World time
- Every chat has its own time. A new chat starts with your device's current date and time. If the character card has a saved world template, the chat starts from that instead.
- Tap the big clock in the notebook to set any date, for example October 14, 1247. The **−1 h / +15 min / +1 h / Until 08:00** buttons shift the time in one tap.
- The time of every message is stored in the message itself. So **swipes, deletions and branches roll the time back on their own** — there's nothing to fix.

#### Detecting time changes
Pick one of three modes in the settings:

| Mode | What happens |
|---|---|
| **Model tag** (default) | At the end of a reply the model writes `[time: 15.10.1247 08:30]`. The tag is hidden from the chat and the time goes into the calendar. |
| **Separate analysis** | After each reply a short separate request asks “how much time has passed?”. Good for models that forget the tag, but it costs tokens. |
| **Don't track** | Time changes only through auto flow and your buttons. |

If a reply has no time mark, **auto flow** kicks in: +10 minutes for every character reply (adjustable, or turn it off).

The model can also give an approximate time: “next morning”, “evening”, “in 2 hours”, “+1 day”. The extension turns it into a specific time. You can put a tag in your own message too, e.g. `[time: 08:00] I wake up…`.

#### Asking before recording
The **“Ask before recording”** setting offers: *never*, *only when the day changes*, *on a new day or a jump of 3+ hours*, or *always*.

Before recording, a dialog shows the old and the new time. In it you can:
- **Record** the new time, adjusting the date or time if you like;
- **Keep old** time;
- close the dialog and decide later: the message keeps a “confirm time?” stamp.

You can fix an already recorded time at any moment too. Tap the 🕑 stamp on a message or a row in the **time log** (“Notes” tab). Later auto steps shift along with the fix.

#### NPCs and schedules
- An NPC has a name, a role, where they are on shift, where they are otherwise, a note for the AI, and shifts.
- A shift is a “from … to …” time plus days of the week. An `18:00–02:00` shift on Monday runs from Monday evening until 2 am Tuesday. The same “from” and “to” means around the clock.
- The **NPC** tab shows each NPC's weekly schedule.
- **“Save to card”** stores NPCs, events and the start date in the character card, so new chats with that character start with them. JSON export and import are available as well.

#### Calendar and events
Mark events on the calendar (“Fair 10:00–16:00”, “Full moon”); they can repeat every week, month or year. Today's and tomorrow's events are sent to the AI.

#### What the AI sees
The note is inserted into the prompt — by default in the chat at depth 1 as a system message. Example:

```
[World time: Wednesday, October 16, 1247, 21:50 (evening).
Where the NPCs are right now (by their schedules):
- Oleg (innkeeper) — here: The Grey Whale tavern, until 02:00.
- Martha (herbalist) — not here; will be at the Market square tomorrow at 08:00.
An NPC cannot be met outside their schedule unless the story clearly explains why.
Events today: Fair on the market square (10:00–16:00); Full moon (night).]
```

The full note is visible on the “What the AI sees” sticker in the notebook. You can rewrite the template in the settings. Available variables: `{{worldWeekday}} {{worldDate}} {{worldTime}} {{worldPhase}} {{worldStamp}} {{worldNpcs}} {{worldPresent}} {{worldAbsent}} {{worldEvents}} {{worldNotes}}`, plus the usual ST macros. The note language follows the interface, or you can pin it to English or Russian.

### Commands and macros

| Command | What it does |
|---|---|
| `/ts-time` | returns the world time |
| `/ts-time 08:00`, `/ts-time +3h`, `/ts-time 15.10.1247 09:00` | sets the time |
| `/ts-npc Oleg` | shows where an NPC is right now |
| `/ts-status` | prints the text the AI receives |
| `/ts-open` | opens the notebook |

Macros for your own prompts and Quick Replies: `{{worldTime}}`, `{{worldDate}}`, `{{worldWeekday}}`, `{{worldPhase}}`, `{{worldStamp}}`, `{{worldNpcs}}`, `{{worldEvents}}`.

### Where the data lives
- Extension settings: `extension_settings.time_system`.
- Chat time, NPCs, events and notes: chat metadata (`chat_metadata.time_system`).
- The time after each message: `message.extra.time_system`, separately for every swipe.
- World template in the card: `data.extensions.time_system`.

### Licenses
The Manrope, Yeseva One, Caveat and JetBrains Mono fonts are distributed under the SIL Open Font License 1.1, see [`fonts/OFL.txt`](fonts/OFL.txt).

---

<a id="русский"></a>

## Русский

Расширение даёт миру ролевой игры часы и календарь, а NPC — расписания.

> Олег работает в таверне с 18:00 до 02:00. Придёте к нему в 10 утра — его там не будет.

Время хранится отдельно для каждого чата. Когда в истории проходит время или наступает новый день, расширение записывает это, и модель не путается в днях и часах. Каждый запрос к модели получает короткую справку: какое сейчас время, кто из NPC на месте и какие события запланированы на сегодня.

Работает и на ПК, и на телефоне. На большом экране интерфейс — блокнот с разворотом на две страницы, на телефоне — одна колонка, а окна выезжают снизу.

Интерфейс на русском и английском. По умолчанию язык берётся из SillyTavern, его можно сменить в настройках («Язык интерфейса»). Язык справки для модели настраивается отдельно.

### Установка

1. В SillyTavern откройте **Расширения** (иконка кубиков) → **Install extension**.
2. Вставьте ссылку `https://github.com/jellysilly/ST-Time-System` и нажмите **Install**.
3. Откройте чат. Поверх чата появятся маленькие часы, а в меню ✨ («волшебная палочка») — пункт **Time System**.

### Как это работает

#### Время мира
- У каждого чата своё время. Новый чат начинается с текущих даты и времени вашего устройства. Если в карточке персонажа сохранён шаблон мира, чат начнётся с него.
- Нажмите на большие часы в блокноте, чтобы задать любую дату, например 14 октября 1247 года. Кнопки **−1 ч / +15 мин / +1 ч / До 08:00** сдвигают время одним нажатием.
- Время каждого сообщения хранится в самом сообщении. Поэтому **свайп, удаление или ветка сами откатывают время** назад, ничего чинить не нужно.

#### Как замечается смена времени
В настройках можно выбрать один из трёх режимов:

| Режим | Что происходит |
|---|---|
| **Тег от модели** (по умолчанию) | Модель в конце ответа пишет `[time: 15.10.1247 08:30]`. Тег прячется из чата, время записывается в календарь. |
| **Отдельный анализ** | После каждого ответа уходит короткий отдельный запрос: «сколько времени прошло?». Подходит моделям, которые забывают ставить тег, но тратит токены. |
| **Не отслеживать** | Время меняется только авто-ходом и вашими кнопками. |

Если в ответе нет отметки, работает **авто-ход**: +10 минут за каждый ответ персонажа (число настраивается или отключается).

Модель может указывать время и приблизительно: «на следующее утро», «вечер», «через 2 часа», «+1 день». Расширение переведёт это в конкретное время. Свой тег можно поставить и в собственное сообщение, например `[time: 08:00] Просыпаюсь…`.

#### Подтверждение перед записью
В настройке **«Спрашивать перед записью»** доступны варианты: *никогда*, *только при смене дня*, *при смене дня или скачке от 3 часов* или *всегда*.

Перед записью откроется окно, где показано, как было и как станет. В нём можно:
- **Записать** новое время, при желании поправив дату или время;
- **Не менять** время;
- закрыть окно и решить позже: у сообщения останется метка «подтвердить время?».

Исправить уже записанное время тоже можно в любой момент. Нажмите на метку 🕑 у сообщения или на строку в **журнале времени** (вкладка «Заметки»). Следующие авто-шаги сдвинутся вместе с исправленным.

#### NPC и расписания
- У NPC есть имя, роль, место по расписанию, место «в остальное время», заметка для ИИ и смены.
- Смена — это время «с … до …» и дни недели. Смена `18:00–02:00` в понедельник длится с вечера понедельника до 2 ночи вторника. Если «с» и «до» совпадают, смена круглосуточная.
- Во вкладке **NPC** видно недельное расписание каждого NPC.
- Кнопка **«В карточку»** сохраняет NPC, события и дату начала в карточку персонажа, и новые чаты с ним стартуют уже с ними. Ещё есть экспорт и импорт в JSON.

#### Календарь и события
На календаре отмечаются события («Ярмарка 10:00–16:00», «Полнолуние»), их можно повторять каждую неделю, месяц или год. События сегодняшнего и завтрашнего дня передаются ИИ.

#### Что видит ИИ
Справка вставляется в промпт: по умолчанию в чат на глубину 1 от имени системы. Пример:

```
[Время мира: среда, 16 октября 1247 г., 21:50 — вечер.
Где сейчас NPC (по расписанию):
- Олег (трактирщик) — на месте: Таверна «Сизый кит», до 02:00.
- Марта (травница) — нет на месте; будет: Рыночная площадь завтра в 08:00.
Встретить NPC вне его расписания нельзя, если сюжет явно этого не объясняет.
События сегодня: Ярмарка на рыночной площади (10:00–16:00); Полнолуние (ночь).]
```

Текст справки целиком видно на стикере «Что видит ИИ» в блокноте. Шаблон можно переписать в настройках. Доступны переменные `{{worldWeekday}} {{worldDate}} {{worldTime}} {{worldPhase}} {{worldStamp}} {{worldNpcs}} {{worldPresent}} {{worldAbsent}} {{worldEvents}} {{worldNotes}}`, а также обычные макросы ST. Язык справки — как у интерфейса, русский или английский.

### Команды и макросы

| Команда | Что делает |
|---|---|
| `/ts-time` | возвращает время мира |
| `/ts-time 08:00`, `/ts-time +3ч`, `/ts-time 15.10.1247 09:00` | устанавливает время |
| `/ts-npc Олег` | показывает, где сейчас NPC |
| `/ts-status` | выводит текст, который получает ИИ |
| `/ts-open` | открывает блокнот |

Макросы для своих промптов и Quick Replies: `{{worldTime}}`, `{{worldDate}}`, `{{worldWeekday}}`, `{{worldPhase}}`, `{{worldStamp}}`, `{{worldNpcs}}`, `{{worldEvents}}`.

### Где хранятся данные
- Настройки расширения: `extension_settings.time_system`.
- Время, NPC, события и заметки чата: метаданные чата (`chat_metadata.time_system`).
- Время после каждого сообщения: `message.extra.time_system`, отдельно для каждого свайпа.
- Шаблон мира в карточке: `data.extensions.time_system`.

### Лицензии
Шрифты Manrope, Yeseva One, Caveat и JetBrains Mono распространяются по SIL Open Font License 1.1, см. [`fonts/OFL.txt`](fonts/OFL.txt).
