# HUJARILOVO — арт-бриф: новый экран боя

Документ для генерации ассетов (ChatGPT / любой генератор картинок) и для сборки нового экрана боя.
Механика не меняется: каждый сход — **уход** (влево / центр / вправо) и **удар** (влево / центр / вправо), всё выбирается кнопками внизу экрана.

---

## 1. Как будет выглядеть бой

**Камера «из-за спины».** Приближенный вид, как в классических боксёрских играх: свой боец — на переднем плане спиной к нам (полупрозрачный, чтобы не закрывал обзор), соперник — лицом к нам, чуть дальше, в полный рост. Оба стоят друг напротив друга в Яме. Слева/центр/право — это реально стороны экрана: уход влево — твой боец и камера смещаются влево; удар «влево» — боковой в левую половину соперника.

```
┌──────────────────────────────┐
│ [портрет] ▮▮▮▮▮▮  8  ▮▮▮▮▮▮ [портрет] │  ← HUD как в файтинге: ты слева, соперник справа,
│  БОРОДАЧ   ◆◇   НАКАЛ+2  ◇◇  ЛЫСЫЙ   │     таймер и Накал по центру
│                              │
│          (соперник)          │  ← соперник лицом к нам, в стойке
│      ░░ прицел удара ░░      │     прицел там, куда бьёшь
│   ╲                      ╱   │
│    (ты — спиной, полупрозр.) │  ← свой боец на переднем плане
│══════ плиты пола: Л Ц П ═════│  ← трещины на плитах
├──────────────────────────────┤
│ УХОД   [ ⟵ ]  [ ◆ ]  [ ⟶ ]  │  ← кнопки: с подсказкой «по тебе: 3»
│ УДАР   [ ↰ ]  [ ↑ ]  [ ↱ ]   │  ← боковой левый / прямой / боковой правый, «урон: 2»
│ [ ФИНТ ]  [   ГОТОВ   8 ]    │
└──────────────────────────────┘
```

**Сход — кино-момент (≈2,5 с):**
1. Сверху и снизу выезжают чёрные кинополосы, камера подъезжает (зум 1,15×), толпа затихает.
2. Оба бойца переходят в кадры действия: уход (наклон) и удар (боковой / прямой).
3. **Импакт-кадр** при попадании: стоп-кадр 120 мс, белая вспышка, искры, пот, цифра урона, тряска камеры. Промах — удар со свистом проходит мимо ушедшего в сторону соперника.
4. Кадр реакции: голова отлетает в сторону удара, потом возврат в стойку.
5. Плашка исхода: «ЧИСТОЕ ЧТЕНИЕ», «РАЗМЕН», «МИМО · НАКАЛ +2», «ПРОЧИТАН».

**Системы на сцене:**
- **Накал:** с каждым пустым сходом фон краснеет, толпа поднимает кулаки, на +3 — красная виньетка и стук сердца.
- **Сокрушение** (3-е чистое чтение): полноэкранный комикс-сплэш удара на полсекунды, плита под соперником раскалывается.
- **Трещины:** декали трещин на плитах пола под линиями, 3 стадии.
- **Финт:** полупрозрачный «двойник» твоего бойца в линии финта; если соперник в него ударил — его удар проваливается, и следует Контра.
- **Нокаут:** замедление, чёрно-белый кадр, падающий боец, штамп «НОКАУТ».
- **Начало боя:** экран VS: портреты въезжают с двух сторон, «РАУНД 1», «БОЙ!».

**Выбор бойца** в лобби (Бородач, Лысый или Таксолог) — только внешний вид, на числа не влияет. Можно выбрать одного и того же: у соперника будет стальной оттенок.

Все надписи (урон, «НОКАУТ», «РАУНД 1», плашки) рисуются кодом шрифтом Oswald — **на картинках не должно быть текста.**

---

## 2. Технические требования к картинкам

- **Формат:** PNG. Спрайты бойцов, декали и эффекты — **с прозрачным фоном**. Проверь, что фон действительно прозрачный, а не нарисованная «шахматка». Если прозрачность не получается — попроси сплошной ярко-зелёный фон `#00FF00`, я уберу его скриптом.
- **Бойцы:** холст **1024×1536** (вертикальный), один боец в полный рост от макушки до ступней, по центру, занимает ~85 % высоты, ступни у нижнего края. Без пола, без тени, без фона.
- **Одинаковость:** у одного бойца во всех позах — тот же масштаб, та же одежда, те же пропорции и та же высота камеры. Небольшие сдвиги я выровняю скриптом, но масштаб и целостность фигуры важны.
- **Зеркальные позы:** уход, боковой удар и реакция на боковой удар делаются **только в одну сторону (влево по картинке)** — вправо я отзеркалю в коде.
- **Свет:** нейтральный тёмный, с лёгким тёплым контровым светом. Цвет «ты красный / соперник стальной» добавлю кодом.
- **Без текста, логотипов, водяных знаков.** Персонажи оригинальные, не похожие на реальных людей и героев других игр.

---

## 3. Как генерировать, чтобы бойцы были одинаковыми

1. **Сначала лист персонажа** (раздел 5.1) — вид спереди и сзади на одном листе. Это эталон.
2. **Каждую позу** генерируй, прикрепляя к запросу этот лист: «Same character as in the attached reference sheet…».
3. Один чат — один боец. Не смешивай бойцов в одном диалоге.
4. Если поза получилась с другой одеждой или телосложением — перегенерируй, не бери «почти похожее».

---

## 4. Список ассетов

Имена файлов — ровно такие: так я подключу их без переименований. `{id}` — `borodach`, `lysy` или `taksolog`.

### 4.1 Обязательно (MVP) — 39 файлов

| # | Файл | Что это | Размер |
|---|---|---|---|
| **Бойцы, по 14 на каждого (×2 = 28), из них в игру идут 13** ||||
| 1 | `fighters/{id}/sheet.png` | Лист персонажа: спереди и сзади (эталон, в игру не идёт) | 1536×1024 |
| 2 | `fighters/{id}/front_idle.png` | Лицом к нам, стойка, кулаки у подбородка | 1024×1536 |
| 3 | `fighters/{id}/front_slip.png` | Лицом к нам, уклон корпусом **влево по картинке** | 1024×1536 |
| 4 | `fighters/{id}/front_hook.png` | Лицом к нам, боковой удар, кулак летит **влево по картинке** | 1024×1536 |
| 5 | `fighters/{id}/front_straight.png` | Лицом к нам, прямой удар в зрителя, кулак крупно на переднем плане | 1024×1536 |
| 6 | `fighters/{id}/front_hit_side.png` | Лицом к нам, пропустил боковой: голова отлетает **вправо по картинке** | 1024×1536 |
| 7 | `fighters/{id}/front_hit_center.png` | Лицом к нам, пропустил прямой: голова назад, корпус отброшен | 1024×1536 |
| 8 | `fighters/{id}/front_ko.png` | Лицом к нам, нокаут: падает, колени подкошены | 1024×1536 |
| 9 | `fighters/{id}/back_idle.png` | Спиной к нам (вид из-за плеча), стойка | 1024×1536 |
| 10 | `fighters/{id}/back_slip.png` | Спиной к нам, уклон **влево по картинке** | 1024×1536 |
| 11 | `fighters/{id}/back_hook.png` | Спиной к нам, боковой **влево по картинке** | 1024×1536 |
| 12 | `fighters/{id}/back_straight.png` | Спиной к нам, прямой удар вперёд, рука вытянута | 1024×1536 |
| 13 | `fighters/{id}/back_hit.png` | Спиной к нам, пропустил удар: голова назад, плечи сжаты | 1024×1536 |
| 14 | `fighters/{id}/back_ko.png` | Спиной к нам, падает на колени | 1024×1536 |
| **Портреты (2)** ||||
| 15 | `portraits/{id}.png` | Голова и плечи, 3/4, взгляд **вправо**, тёмный фон | 1024×1024 |
| **Арена (2)** ||||
| 16 | `arena/pit_portrait.png` | Яма без бойцов, вертикальная (телефон) | 1024×1536 |
| 17 | `arena/pit_landscape.png` | Яма без бойцов, горизонтальная (компьютер) | 1536×1024 |
| **Трещины на плитах (3)** ||||
| 18 | `arena/crack_1.png` | Тонкие трещины, прозрачный фон | 1024×1024 |
| 19 | `arena/crack_2.png` | Глубокие трещины | 1024×1024 |
| 20 | `arena/crack_3.png` | Расколотая плита с красным свечением в разломах | 1024×1024 |
| **Эффекты (4)** ||||
| 21 | `vfx/impact.png` | Вспышка удара: искры и ударная волна | 1024×1024 |
| 22 | `vfx/sweat.png` | Брызги пота | 1024×1024 |
| 23 | `vfx/dust.png` | Облако пыли от шага | 1024×1024 |
| 24 | `vfx/whoosh.png` | След промаха: смазанная дуга удара | 1536×1024 |

### 4.2 Желательно (сделают игру заметно круче) — 7 файлов

| Файл | Что это | Размер |
|---|---|---|
| `fighters/{id}/front_victory.png` (×2) | Победа: рёв, кулак вверх | 1024×1536 |
| `fighters/{id}/front_taunt.png` (×2) | Насмешка: «иди сюда» пальцами | 1024×1536 |
| `arena/crowd.png` | Полоса толпы-силуэтов с поднятыми кулаками, прозрачный фон | 1536×512 |
| `vfx/crush_splash.png` | Комикс-сплэш Сокрушения: кулак врезается в челюсть, спидлайны | 1536×1024 |
| `ui/vs_bg.png` | Фон экрана VS: диагональный раскол, слева красный, справа сталь | 1536×1024 |

Иконки кнопок (стрелки ухода, удары) и все надписи я рисую в коде — их генерировать не нужно.

---

## 5. Промпты (копируй как есть)

### Общий стиль — добавляй в начало каждого запроса

```
Gritty cinematic semi-realistic digital painting for a browser fighting game.
Underground bare-knuckle fighting in an abandoned foundry at night.
Dark, high contrast, deep blacks, blood-red rim light and cold steel-grey highlights, dust and grit texture.
Palette: coal black #070806, blood red #C1272D, dark red #6E1414, steel #D9D0C8.
Original character, not resembling any real person or any existing game character.
No text, no letters, no logos, no watermark.
```

### Правила спрайта — добавляй ко всем позам бойцов

```
Full body from the top of the head to the feet, single character, isolated on a fully transparent background (PNG with alpha channel).
No floor, no cast shadow, no background elements.
Vertical canvas 1024x1536, the character is centered horizontally, fills about 85% of the image height, feet close to the bottom edge.
Same scale, same outfit and same proportions as in the attached reference sheet.
```

### Персонажи

**Бородач** (`borodach`):
```
Character: a powerful muscular bare-knuckle fighter in his thirties, long dark hair tied in a top knot, thick dark beard, fierce eyes,
bare scarred torso, dark loose fight trousers with a torn blood-red cloth sash around the waist,
hands wrapped in dark worn hand wraps with red accents, feet wrapped in dark cloth.
```

**Лысый** (`lysy`):
```
Character: a heavy muscular bald fighter in his forties, shaved head, short stubble beard, heavy brow, calm menacing stare,
dark tribal-style tattoos on shoulders and forearms, bare torso,
dark fight shorts with a dark red belt, black fingerless fight gloves, bare feet.
```

**Таксолог** (`taksolog`) — единственный одетый боец, силуэт должен читаться иначе, чем у двух голых торсов:
```
Character: a lean wiry adult man, slim build, dark hair in a blunt bowl cut with straight bangs down to the eyebrows,
a black plaid (checked) flannel jacket worn open over a plain black t-shirt, sleeves down to the wrists,
olive-green cargo trousers with side pockets, grey-and-white sneakers, bare fists with light worn tape on the knuckles.
Street-fighter look, not a pro athlete: tense shoulders, sharp focused eyes.
```
Для вида сзади добавь: `We see the black plaid jacket on his back and the back of the bowl-cut head.` — чтобы генератор не нарисовал голую спину.

### 5.1 Лист персонажа (`sheet.png`, 1536×1024)

```
Character reference sheet on a plain dark grey background: the same character shown twice side by side at the same scale —
LEFT: full body front view facing the viewer in a boxing guard stance;
RIGHT: full body back view seen from behind in the same guard stance.
Even lighting, clear readable silhouette.
```

### 5.2 Вид спереди (соперник)

| Файл | Добавь к запросу |
|---|---|
| `front_idle` | `Facing the viewer at eye level, boxing guard stance, fists raised in front of the chin, knees slightly bent, staring straight at the viewer, menacing and ready.` |
| `front_slip` | `Facing the viewer, slipping a punch: upper body and head lean strongly toward the LEFT side of the image, weight on the left leg, fists still up in guard.` |
| `front_hook` | `Facing the viewer, throwing a wide hook punch: the fist swings toward the LEFT side of the image at head height, torso twisted, strong motion, dynamic.` |
| `front_straight` | `Facing the viewer, throwing a straight punch directly at the viewer: the fist is huge in the foreground with strong foreshortening, shoulder driven forward, intense face.` |
| `front_hit_side` | `Facing the viewer, getting hit on the jaw from the left: head snapped toward the RIGHT side of the image, eyes shut, face distorted, sweat spraying, body recoiling.` |
| `front_hit_center` | `Facing the viewer, hit straight in the face: head thrown back, body leaning backwards, arms flung open, sweat spraying.` |
| `front_ko` | `Knocked out: falling backwards and slightly to the side, knees buckling, arms limp, eyes rolled back, the moment before hitting the ground.` |
| `front_victory` | `Facing the viewer, victory: roaring with one fist raised high above the head, chest out, triumphant.` |
| `front_taunt` | `Facing the viewer, taunting: beckoning with the fingers of one hand, 'come on' gesture, cocky grin, other fist in guard.` |

### 5.3 Вид сзади (свой боец, камера из-за спины)

| Файл | Добавь к запросу |
|---|---|
| `back_idle` | `Seen from behind and slightly above, over-the-shoulder camera: we see his back, shoulders and the back of his head, facing away from the viewer into the scene, fists up in guard in front of him.` |
| `back_slip` | `Seen from behind, over-the-shoulder camera, slipping a punch: upper body and head lean strongly toward the LEFT side of the image, fists in guard.` |
| `back_hook` | `Seen from behind, over-the-shoulder camera, throwing a wide hook punch toward the LEFT side of the image, torso twisted, back muscles tense.` |
| `back_straight` | `Seen from behind, over-the-shoulder camera, throwing a straight punch forward away from the viewer, arm fully extended into the scene.` |
| `back_hit` | `Seen from behind, over-the-shoulder camera, recoiling from a hit: head snapped back, shoulders tensed, stepping back.` |
| `back_ko` | `Seen from behind, collapsing down onto his knees, head dropping, arms hanging.` |

### 5.4 Портрет (`portraits/{id}.png`, 1024×1024)

```
Head and shoulders portrait, three-quarter view, the character looks toward the RIGHT side of the image,
dramatic red rim light from the right, dark smoky background, intense stare, sweat on the skin.
```

### 5.5 Арена

`arena/pit_portrait.png` (1024×1536) и `arena/pit_landscape.png` (1536×1024):
```
Interior of an abandoned foundry turned into an underground fight pit, view from inside the pit at a fighter's eye level.
The floor in the lower third is made of heavy cast-iron plates arranged in three wide lanes running away from the viewer.
Dim red glow of cold furnaces in the background, hanging chains, dust floating in light beams,
a crowd of dark silhouettes behind a rusty fence at the far edge of the pit.
The center of the pit is empty (no fighters). Strong depth, darker edges (vignette), room for characters in the middle.
```

`arena/crack_1.png`, `crack_2.png`, `crack_3.png` (1024×1024, прозрачный фон):
```
Top-down decal of cracks in a dark cast-iron floor plate, isolated on a transparent background, only the cracks without the plate.
Stage 1: a few thin hairline cracks. / Stage 2: deep branching cracks. / Stage 3: shattered plate, wide fractures glowing blood-red inside.
```

`arena/crowd.png` (1536×512, прозрачный фон):
```
Horizontal strip of a dense crowd of dark silhouettes seen from behind a rusty fence, many raised fists, backlit by red light,
isolated on a transparent background, no faces visible.
```

### 5.6 Эффекты (прозрачный фон)

| Файл | Промпт |
|---|---|
| `vfx/impact.png` | `Punch impact effect: white-hot sparks bursting outward, a circular shockwave ring, red embers, isolated on a transparent background, centered.` |
| `vfx/sweat.png` | `Spray of sweat droplets flying outward from a single point toward the right, glossy droplets with highlights, isolated on a transparent background.` |
| `vfx/dust.png` | `Puff of grey foundry dust kicked up from the floor, soft volumetric cloud, isolated on a transparent background.` |
| `vfx/whoosh.png` | `Motion blur trail of a missed punch: a curved sweeping arc of white and red streaks from left to right, isolated on a transparent background.` |
| `vfx/crush_splash.png` | `Comic-book style impact panel: a wrapped fist smashing into a jaw in extreme close-up, radiating speed lines, halftone dots, red and black, dramatic.` |

### 5.7 Фон VS (`ui/vs_bg.png`, 1536×1024)

```
Abstract background for a versus screen: a diagonal jagged split from top right to bottom left,
left half deep blood red, right half dark steel grey, grunge brush texture, sparks along the split line, no characters.
```

---

## 6. Как передать

- Присылай картинки прямо в чат с Claude пачками по бойцу, или загрузи в репозиторий в папку `art-source/` (через «Add file → Upload files» на GitHub) с путями и именами из раздела 4.
- Я прогоню их скриптом: обрезка по фигуре, выравнивание масштаба и линии ступней, удаление зелёного фона (если был), уменьшение и сжатие в WebP для браузера. Оригиналы в игру не идут.
- **Сделано:** полный комплект (46 PNG) получен и подключён. Таксолог — ещё 17 PNG (15 поз, лист, портрет), подключён отдельно; его `prompts.json`, `validation.json` и README лежат в `art-source/meta/taksolog/`, чтобы не смешивать с метаданными первых 46 файлов. Всего 63 PNG → 60 WebP. Исходники лежат в `art-source/` (в git не хранятся), команда `python3 tools/build_art.py` делает из них WebP в `client/public/art/`: общий масштаб на бойца и ракурс по стойке `idle`, ступни на одной линии, срез ореола с альфой < 32, холст бойцов 640×960. Если какой-то файл пропадёт, на его месте снова появится временный силуэт.
- **Где что используется:** все позы бойцов; `front_taunt` — когда соперник отправляет фразу; портреты — в HUD, меню и на экране VS; `arena/pit_*` — фон Ямы; `crack_1…3` — трещины на плитах; `crowd` — толпа поднимается с Накалом; `vfx/impact` и `sweat` — попадание; `whoosh` — промах; `dust` — Рывок; `crush_splash` — Сокрушение; `ui/vs_bg` — экран VS перед боем. `sheet.png` — только эталон.
