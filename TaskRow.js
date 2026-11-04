import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { daysBetween, formatDate, getTaskState } from './helpers';

const stateColor = (state, colors) =>
  state === 'overdue' ? colors.red : state === 'today' ? colors.orange : state === 'completed' ? colors.muted : colors.green;

const stateIcon = (state) =>
  state === 'overdue' ? 'return-up-back' : state === 'today' ? 'time-outline' : state === 'completed' ? 'checkmark' : 'calendar-outline';

const relativeText = (task, today, tx) => {
  const days = daysBetween(today, task.dueDate);
  if (days < 0) return { text: tx(`${-days} gün gecikti`, `${-days} days overdue`, `${-days} Tage überfällig`), color: 'red' };
  if (days === 0) return { text: tx('Bugün son gün!', 'Due today!', 'Heute fällig!'), color: 'red' };
  return { text: tx(`${days} gün kaldı`, `${days} days left`, `${days} Tage übrig`), color: 'blue' };
};

export const taskRowDetails = ({ task, mode = 'date', today, lang, tx, colors }) => {
  const state = getTaskState(task, today);
  return {
    state,
    color: stateColor(state, colors),
    icon: stateIcon(state),
    relative: relativeText(task, today, tx),
    showRelative: !task.completed && (mode === 'upcoming' || state === 'overdue' || state === 'today'),
    formattedDate: formatDate(task.dueDate, lang),
  };
};

export default function TaskRow({ task, mode = 'date', taskRow }) {
  const { s, c, tx, lang, today, openTask, toggleTask } = taskRow;
  const details = taskRowDetails({ task, mode, today, lang, tx, colors: c });
  const { color, icon, relative, showRelative, formattedDate } = details;

  return (
    <TouchableOpacity style={s.taskRow} onPress={() => openTask(task)}>
      <View style={[s.taskIconBox, { backgroundColor: `${color}22` }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>

      <View style={s.flex1}>
        <Text style={[s.taskTitle, task.completed && s.taskTitleDone]} numberOfLines={2}>
          {task.title}
        </Text>
        <Text style={s.cardMeta}>{formattedDate}</Text>
        {showRelative && <Text style={[s.taskStatus, { color: c[relative.color] }]}>{relative.text}</Text>}
      </View>

      <TouchableOpacity
        style={[
          s.taskCircle,
          { borderColor: task.completed ? c.green : c.muted },
          task.completed && s.taskCircleDone,
        ]}
        onPress={() => toggleTask(task.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {task.completed && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
