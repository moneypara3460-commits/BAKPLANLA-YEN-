import { buildMonthCells, parseISO } from './dateUtils';
import { istanbulTodayISO } from './shoppingPlan';

export { buildMonthCells };

export const calendarViewForMode = (calendarMode) =>
  calendarMode === 'list' ? 'list' : 'month';

export const calendarModeForView = (viewMode) =>
  viewMode === 'list' ? 'list' : 'calendar';

export const openCalendarList = (setCalendarMode, goTab) => {
  setCalendarMode('list');
  goTab('calendar');
};

export const calendarTaskCreationDate = (viewMode, selectedDate, today) =>
  viewMode === 'list' ? today : selectedDate;

export const nextCalendarMonth = (cursor, delta) => {
  const next = new Date(cursor.year, cursor.month + delta, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
};

export const tasksForCalendarMonth = (tasks, year, month) =>
  tasks.filter((task) => {
    const date = parseISO(task.dueDate);
    return date.getFullYear() === year && date.getMonth() === month;
  });

export const tasksForCalendarDay = (tasks, selectedDate) =>
  tasks
    .filter((task) => task.dueDate === selectedDate)
    .sort((a, b) => Number(a.completed) - Number(b.completed));

export const sortCalendarTasksByDate = (tasks) =>
  tasks.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));

export const calendarContentState = (taskCount, hasShoppingSummary) =>
  taskCount > 0 ? 'tasks' : hasShoppingSummary ? 'shopping-only' : 'empty';

export const activeShoppingDate = (shoppingPlan, today = istanbulTodayISO()) =>
  shoppingPlan?.shopDate && shoppingPlan.shopDate >= today
    ? shoppingPlan.shopDate
    : null;

export const dateIsInCalendarMonth = (isoDate, year, month) => {
  if (!isoDate) return false;
  const date = parseISO(isoDate);
  return date.getFullYear() === year && date.getMonth() === month;
};
