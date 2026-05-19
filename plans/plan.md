# План исправлений: Latest Videos + оптимизация

## Проблемы

1. **Стримы утекают в Latest Videos** — 3-е видео показывает «прямая трансляция пользователь EssKey»
2. **Два API-запроса** — `playlistItems` + `videos.list` = двойной расход квоты + медленная загрузка
3. **RSS-фоллбэк ненадёжен** — не содержит `liveBroadcastContent`, стримы не фильтруются
4. **API-ключ в клиенте** — на статическом сайте невозможно использовать `.env` без серверной части
5. **Надпись «Ambient & Lo-Fi»** в hero — нужно убрать
6. **Медленная загрузка** — лишние запросы и код

---

## Архитектура решения

```mermaid
flowchart TD
    A[script.js: один fetch] -->|playlistItems| B[YouTube Data API v3]
    B -->|JSON с всеми видео| A
    A -->|Фильтрация STREAM_IDS + паттерны| C[Массив videos]
    A -->|Фильтрация STREAM_IDS + паттерны| D[Массив streams из API]
    C -->|Рендеринг| E[Секция Latest Videos]
    D -->|Слияние с STREAMS| F[Секция Streams]
    A -->|localStorage cache| G[Кэш 5 мин]
```

### Ключевой принцип: один API-запрос, клиентская сортировка

- Один вызов `playlistItems` получает до 50 видео
- Клиент разделяет результат на два массива по критериям:
  - **Стримы** → ID в `STREAM_IDS` или заголовок начинается с паттернов `RADIO 24/7`, `24/7 RADIO` и т.д.
  - **Видео** → всё остальное
- Стримы из API сливаются с захардкоженными `STREAMS` — дедупликация по ID
- Каждый массив рендерится в свою секцию

---

## Пошаговый план изменений

### Шаг 1: Упростить `script.js` — удалить RSS и второй API-запрос

**Удалить:**
- `CONFIG.RSS_URL`, `CONFIG.RSS_TIMEOUT`, `CONFIG.API_TIMEOUT`
- `CONFIG.YOUTUBE_API_KEY` — перенести в константу рядом с CONFIG, с комментарием об ограничении в Google Cloud Console
- Функцию `fetchViaYouTubeAPI()` — заменить на упрощённую
- Функцию `tryRSSSource()`, `fetchViaRSS()`, `parseYouTubeXml()`, `extractVideoId()`
- Массив `RSS_SOURCES`
- Второй запрос к `videos.list` внутри `fetchViaYouTubeAPI()`

**Новая функция `fetchYouTubeVideos()`:**
```
1. Проверить localStorage кэш
2. Один запрос: playlistItems (maxResults=50)
3. Маппинг в массив объектов { id, title, url, thumbnail, published }
4. Фильтрация Private/Deleted видео
5. Вернуть полный массив — разделение на videos/streams делается позже
6. Кэшировать в localStorage
```

### Шаг 2: Разделение videos и streams на клиенте

**Новая функция `separateVideosAndStreams(items)`:**
- Принимает полный массив из API
- Возвращает `{ videos: [...], streams: [...] }`
- Критерий стрима:
  - ID в `STREAM_IDS` Set
  - Заголовок начинается с паттернов: `RADIO 24/7`, `24/7 RADIO`, `LIVE RADIO`, `24/7 STREAM`
- Сортировка обоих массивов по дате — новые первыми

**Обновить `renderStreams()`:**
- Сливать стримы из API с захардкоженными `STREAMS`
- Дедупликация по ID
- Рендерить объединённый список

### Шаг 3: Обновить CONFIG

Упростить:
```
CHANNEL_ID: "UCa9kWM8BbmFi5OpXbjyqk9w",
YOUTUBE_API_KEY: "AIzaSyBF1CMRH89borC-ibFL3LXX_7XofUJLEuY",
VISIBLE_VIDEO_COUNT: 6,
MAX_VIDEOS: 50,
CACHE_TTL: 5 * 60 * 1000,
PRELOADER_MAX_TIME: 8000,
PARALLAX_FACTOR: 0.03,
CACHE_KEY: "esskey_v16",  // обновить версию для сброса старого кэша
```

Удалить: `RSS_URL`, `RSS_TIMEOUT`, `API_TIMEOUT`

### Шаг 4: Убрать «Ambient & Lo-Fi» из hero

**Файл:** `index.html`, строка 159

Было:
```html
<h1><span class="h1-brand">EssKey Music</span> <span class="h1-sub">— Ambient & Lo-Fi</span></h1>
```

Стало:
```html
<h1><span class="h1-brand">EssKey Music</span></h1>
```

### Шаг 5: Обновить `sw.js`

- Добавить `/api/` в список исключений кэширования — на случай будущего использования API-роутов
- Обновить `CACHE_NAME` на `esskey-v3`

### Шаг 6: Оптимизация загрузки

- Убрать второй API-запрос — экономия ~500ms-2s
- Убрать RSS-код — меньше JS для парсинга
- Установить `Cache-Control` заголовок через `vercel.json` для статики
- Предзагрузка шрифтов: добавить `<link rel="preload">` для шрифтов

### Шаг 7: Обновить `index.html` — ссылки на ресурсы

- Переключить `styles.min.css` → `styles.css` и `script.min.js` → `script.js` — минифицированные файлы не в git и могут устареть
- Добавить `<link rel="preload">` для шрифтов

### Шаг 8: Создать `vercel.json` — заголовки кэширования

```json
{
  "headers": [
    {
      "source": "/(.*)\\.(css|js)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=3600" }]
    }
  ]
}
```

---

## Структура файлов после изменений

```
landing/
├── index.html             ← ИЗМЕНЁН: убран Ambient & Lo-Fi, ссылки на CSS/JS, preload шрифтов
├── script.js              ← ИЗМЕНЁН: удалён RSS, один API-запрос, разделение videos/streams
├── styles.css             ← БЕЗ ИЗМЕНЕНИЙ
├── sw.js                  ← ИЗМЕНЁН: обновлён CACHE_NAME, исключения кэша
├── vercel.json            ← НОВЫЙ: заголовки кэширования статики
├── manifest.json          ← БЕЗ ИЗМЕНЕНИЙ
├── .env.example           ← НОВЫЙ: шаблон для документации
└── plans/
    └── plan.md            ← Этот файл
```

---

## Что касается API-ключа и .env

На **чисто статическом сайте** невозможно скрыть API-ключ — `.env` работает только на сервере. Варианты:

| Вариант | Плюсы | Минусы |
|---------|-------|--------|
| **A: Ключ в клиенте + ограничение по HTTP-рефереру в Google Cloud Console** | Просто, бесплатно, работает сейчас | Ключ виден в DevTools, но ограничен по домену |
| **B: Vercel Serverless Function** | Ключ скрыт на сервере | Требует настройки, пользователь не хочет |

**Рекомендация:** Вариант A — оставить ключ в клиенте, но обязательно ограничить его в Google Cloud Console:
- Application restrictions: HTTP referrers
- Добавить: `https://esskey-music.vercel.app/*`
- Это предотвратит использование ключа на других доменах

---

## Риски и mitigations

| Риск | Mitigation |
|------|-----------|
| Quota YouTube API исчерпан | Один запрос вместо двух + localStorage кэш 5 мин = минимум вызовов |
| Стримы всё ещё утекают | Тройная фильтрация: STREAM_IDS + паттерны заголовков + исключение liveBroadcastContent если есть |
| Старый кэш у пользователей | CACHE_KEY обновлён на esskey_v16 — старый кэш игнорируется |
| API-ключ скомпрометирован | Ограничение по HTTP-рефереру в Google Cloud Console |

---

## Порядок реализации

1. Обновить `script.js` — удалить RSS, упростить API до одного запроса, добавить разделение videos/streams
2. Обновить `index.html` — убрать Ambient & Lo-Fi, переключить ссылки на CSS/JS, добавить preload
3. Обновить `sw.js` — обновить CACHE_NAME, исключения
4. Создать `vercel.json` — заголовки кэширования
5. Создать `.env.example` — для документации
6. Протестировать локально
7. Задеплоить и проверить на продакшене
