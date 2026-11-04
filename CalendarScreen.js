import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MONTHS, WEEKDAYS, parseISO, formatLongDate } from './helpers';
import { formatShopDate, formatRemindAt } from './shoppingPlan';
import {
  activeShoppingDate,
  calendarContentState,
  calendarModeForView,
  calendarTaskCreationDate,
  calendarViewForMode,
  dateIsInCalendarMonth,
  nextCalendarMonth,
  sortCalendarTasksByDate,
  tasksForCalendarDay,
  tasksForCalendarMonth,
  buildMonthCells,
} from './calendar';

export default function CalendarScreen({ calendar, components }) {
  const {
    s,
    c,
    tx,
    lang,
    tasks,
    today,
    taskRow,
    calendarMode,
    setCalendarMode,
    openNewTask,
    shoppingPlan,
    navigate,
  } = calendar;
  const { Screen, ScreenHeader, EmptyCard, TaskRow } = components;

  const [selectedDate, setSelectedDate] = useState(today);
  const [cursor, setCursor] = useState(() => {
    const date = parseISO(today);
    return { year: date.getFullYear(), month: date.getMonth() };
  });

  const viewMode = calendarViewForMode(calendarMode);
  const setViewMode = (mode) => setCalendarMode(calendarModeForView(mode));
  const cells = buildMonthCells(cursor.year, cursor.month);
  const shopDay = activeShoppingDate(shoppingPlan);
  const shopDayInMonth = dateIsInCalendarMonth(shopDay, cursor.year, cursor.month);
  const monthTasks = tasksForCalendarMonth(tasks, cursor.year, cursor.month);
  const selectedTasks = tasksForCalendarDay(tasks, selectedDate);
  const selectedDayContentState = calendarContentState(selectedTasks.length, selectedDate === shopDay);
  const monthContentState = calendarContentState(monthTasks.length, shopDayInMonth);

  const ShopDayCard = () => (
    <TouchableOpacity
      style={[s.card, { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: c.orange }]}
      onPress={() => navigate('shopping')}
    >
      <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.soft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="cart-outline" size={20} color={c.orange} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 15, fontWeight: '800' }}>
          🛒 {tx('Alışveriş günü', 'Shopping day', 'Einkaufstag')} · {formatShopDate(shopDay)}
        </Text>
        <Text style={{ color: c.sub, fontSize: 12, marginTop: 3 }}>
          {tx('Hatırlatma', 'Reminder', 'Erinnerung')}: {formatRemindAt(shoppingPlan.remindAt)} · {(shoppingPlan.items || []).length} {tx('ürün', 'items', 'Artikel')}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.sub} />
    </TouchableOpacity>
  );

  const moveMonth = (delta) => setCursor((current) => nextCalendarMonth(current, delta));

  return (
    <Screen>
      <ScreenHeader
        title={tx('Takvim', 'Calendar', 'Kalender')}
        subtitle={tx('Görevlerini tarih üzerinde gör', 'See your tasks by date', 'Aufgaben nach Datum sehen')}
      />

      <View style={s.segment}>
        <TouchableOpacity
          style={[s.segmentItem, viewMode === 'month' && s.segmentItemActive]}
          onPress={() => setViewMode('month')}
        >
          <Text style={[s.segmentText, viewMode === 'month' && s.segmentTextActive]}>
            {tx('Ay', 'Month', 'Monat')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.segmentItem, viewMode === 'list' && s.segmentItemActive]}
          onPress={() => setViewMode('list')}
        >
          <Text style={[s.segmentText, viewMode === 'list' && s.segmentTextActive]}>
            {tx('Liste', 'List', 'Liste')}
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'month' ? (
        <>
          <View style={s.calCard}>
            <View style={s.calHeader}>
              <TouchableOpacity style={s.calNav} onPress={() => moveMonth(-1)}>
                <Ionicons name="chevron-back" size={18} color={c.text} />
              </TouchableOpacity>

              <Text style={s.calMonth}>{MONTHS[lang][cursor.month]} {cursor.year}</Text>

              <TouchableOpacity style={s.calNav} onPress={() => moveMonth(1)}>
                <Ionicons name="chevron-forward" size={18} color={c.text} />
              </TouchableOpacity>
            </View>

            <View style={s.calWeekRow}>
              {WEEKDAYS[lang].map((day) => (
                <Text key={day} style={s.calWeekText}>{day}</Text>
              ))}
            </View>

            {Array.from({ length: cells.length / 7 }).map((_, weekIndex) => (
              <View style={s.calWeekRow} key={`week-${weekIndex}`}>
                {cells.slice(weekIndex * 7, weekIndex * 7 + 7).map((iso, index) => {
                  const hasTask = iso && monthTasks.some((task) => task.dueDate === iso);
                  const isShopDay = iso && iso === shopDay;
                  const isToday = iso === today;
                  const isSelected = iso === selectedDate;

                  return (
                    <TouchableOpacity
                      key={iso || `empty-${weekIndex}-${index}`}
                      style={s.calCell}
                      disabled={!iso}
                      onPress={() => iso && setSelectedDate(iso)}
                    >
                      {iso && (
                        <View style={[
                          s.calDay,
                          isToday && s.calDayToday,
                          isSelected && !isToday && s.calDaySelected,
                        ]}>
                          <Text style={[s.calDayText, isToday && s.calDayTextToday]}>
                            {parseISO(iso).getDate()}
                          </Text>
                          {(hasTask || isShopDay) && (
                            <View style={{ flexDirection: 'row', gap: 3 }}>
                              {hasTask && <View style={[s.calDot, { backgroundColor: isToday ? c.gold : c.green }]} />}
                              {isShopDay && <View style={[s.calDot, { backgroundColor: c.orange }]} />}
                            </View>
                          )}
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={s.sectionHeader}>
            <View>
              <Text style={s.sectionTitle}>{formatLongDate(selectedDate, lang)}</Text>
              <Text style={s.sectionSub}>{selectedTasks.length} {tx('görev', 'tasks', 'Aufgaben')}</Text>
            </View>
            <TouchableOpacity onPress={() => openNewTask(calendarTaskCreationDate(viewMode, selectedDate, today))}>
              <Text style={s.link}>+ {tx('Ekle', 'Add', 'Hinzufügen')}</Text>
            </TouchableOpacity>
          </View>

          {selectedDate === shopDay && <ShopDayCard />}

          {selectedDayContentState === 'shopping-only' ? null : selectedDayContentState === 'empty' ? (
            <View style={s.card}>
              <Text style={s.cardTitle}>
                {tx('Bu tarihte görev yok.', 'No tasks on this date.', 'Keine Aufgaben an diesem Datum.')}
              </Text>
            </View>
          ) : (
            selectedTasks.map((task) => <TaskRow key={task.id} task={task} taskRow={taskRow} />)
          )}
        </>
      ) : (
        <>
          <View style={s.sectionHeader}>
            <View>
              <Text style={s.sectionTitle}>{MONTHS[lang][cursor.month]} {cursor.year}</Text>
              <Text style={s.sectionSub}>{monthTasks.length} {tx('görev', 'tasks', 'Aufgaben')}</Text>
            </View>
            <TouchableOpacity onPress={() => openNewTask(calendarTaskCreationDate(viewMode, selectedDate, today))}>
              <Text style={s.link}>+ {tx('Yeni', 'New', 'Neu')}</Text>
            </TouchableOpacity>
          </View>

          {shopDayInMonth && <ShopDayCard />}

          {monthContentState === 'shopping-only' ? null : monthContentState === 'empty' ? (
            <EmptyCard
              badge="CAL"
              title={tx('Bu ay görev yok', 'No tasks this month', 'Keine Aufgaben diesen Monat')}
              text={tx(
                'Takvimden bir gün seçerek görev ekleyebilirsin.',
                'Select a day on the calendar to add a task.',
                'Wähle einen Tag im Kalender, um eine Aufgabe hinzuzufügen.'
              )}
            />
          ) : (
            sortCalendarTasksByDate(monthTasks)
              .map((task) => <TaskRow key={task.id} task={task} mode="upcoming" taskRow={taskRow} />)
          )}
        </>
      )}
    </Screen>
  );
}
