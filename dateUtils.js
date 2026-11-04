export const pad2 = (value) => String(value).padStart(2, '0');

export const toISO = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export const parseISO = (iso) => {
  const [year, month, day] = String(iso).split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const buildMonthCells = (year, month) => {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first weeks
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let index = 0; index < offset; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toISO(new Date(year, month, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};
