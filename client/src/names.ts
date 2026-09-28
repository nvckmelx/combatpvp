const FIRST = ['Тихий', 'Бешеный', 'Чугунный', 'Ржавый', 'Хмурый', 'Злой', 'Быстрый', 'Каменный', 'Ночной', 'Горячий', 'Седой', 'Стальной', 'Кривой', 'Упрямый'];
const SECOND = ['Кулак', 'Молот', 'Лом', 'Бородач', 'Шатун', 'Кабан', 'Волк', 'Литейщик', 'Шрам', 'Бык', 'Гвоздь', 'Клык', 'Медведь', 'Жернов'];

export function randomName(): string {
  const a = FIRST[Math.floor(Math.random() * FIRST.length)];
  const b = SECOND[Math.floor(Math.random() * SECOND.length)];
  return `${a} ${b}`;
}
