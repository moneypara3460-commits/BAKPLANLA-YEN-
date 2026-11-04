import React, { useEffect } from 'react';
import { Text, TouchableOpacity, Switch, View } from 'react-native';
import { HOUR_OPTIONS } from './reminders';
import { notificationsSupported, openSystemSettings } from './notifications';

export const countUpcomingReminderTasks = (tasks, today) =>
  (Array.isArray(tasks) ? tasks : []).filter((task) => task && !task.completed && task.dueDate >= today).length;

export default function NotificationsScreen({
  s, c, tx, tasks, today,
  notifPrefs, notifPermission, updateNotifPrefs, toggleTaskReminders,
  refreshNotifPermission, sendTestNotif,
  Screen, ScreenHeader, Chip,
}) {
  useEffect(() => { refreshNotifPermission(); }, []);

  // Kaç görev için hatırlatma kurulabileceğini kullanıcı görsün (boş vaat verilmez).
  const upcoming = countUpcomingReminderTasks(tasks, today);
  const blocked = notifPermission === 'denied';
  const unsupported = !notificationsSupported;

  return (
    <Screen>
      <ScreenHeader
        title={tx('Bildirimler', 'Notifications', 'Benachrichtigungen')}
        subtitle={tx('Görev hatırlatmaları', 'Task reminders', 'Aufgabenerinnerungen')}
      />

      {unsupported && (
        <View style={s.softCard}>
          <Text style={s.cardTitle}>{tx('Bu cihazda desteklenmiyor', 'Not supported on this device', 'Auf diesem Gerät nicht unterstützt')}</Text>
          <Text style={s.cardMeta}>
            {tx('Hatırlatmalar yalnızca Android ve iOS uygulamasında çalışır. Tarayıcıda (web) çalışmaz.', 'Reminders only work in the Android and iOS app, not in the browser.', 'Erinnerungen funktionieren nur in der Android- und iOS-App, nicht im Browser.')}
          </Text>
        </View>
      )}

      <View style={[s.softCard, { flexDirection: 'row', alignItems: 'center' }]}>
        <View style={s.flex1}>
          <Text style={s.cardTitle}>{tx('Görev hatırlatmaları', 'Task reminders', 'Aufgabenerinnerungen')}</Text>
          <Text style={s.cardMeta}>
            {tx('Tamamlanmamış görevlerin için telefonuna bildirim gelir.', 'You get a notification on your phone for tasks you have not completed.', 'Du erhältst eine Benachrichtigung für offene Aufgaben.')}
          </Text>
        </View>
        <Switch
          value={notifPrefs.taskReminders}
          onValueChange={toggleTaskReminders}
          disabled={unsupported}
          trackColor={{ false: '#CBD5D1', true: c.green }}
          thumbColor="#FFFFFF"
        />
      </View>

      {blocked && (
        <View style={s.softCard}>
          <Text style={s.cardTitle}>{tx('Bildirim izni kapalı', 'Notifications are blocked', 'Benachrichtigungen blockiert')}</Text>
          <Text style={s.cardMeta}>
            {tx('Telefonun ayarlarından BAKPLANLA için bildirimlere izin vermen gerekiyor.', 'You need to allow notifications for BAKPLANLA in your phone settings.', 'Du musst Benachrichtigungen für BAKPLANLA in den Telefoneinstellungen erlauben.')}
          </Text>
          <TouchableOpacity style={[s.secondaryBtn, { marginTop: 10 }]} onPress={openSystemSettings}>
            <Text style={s.secondaryBtnText}>{tx('Ayarları Aç', 'Open Settings', 'Einstellungen öffnen')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {notifPrefs.taskReminders && (
        <>
          <Text style={s.label}>{tx('HATIRLATMA SAATİ', 'REMINDER TIME', 'ERINNERUNGSZEIT')}</Text>
          <View style={s.chipRow}>
            {HOUR_OPTIONS.map((hour) => (
              <Chip
                key={hour}
                label={`${String(hour).padStart(2, '0')}:00`}
                active={notifPrefs.hour === hour}
                onPress={() => updateNotifPrefs({ hour })}
              />
            ))}
          </View>

          <View style={[s.softCard, { flexDirection: 'row', alignItems: 'center' }]}>
            <View style={s.flex1}>
              <Text style={s.cardTitle}>{tx('Bir gün önce de hatırlat', 'Also remind a day earlier', 'Auch einen Tag vorher erinnern')}</Text>
              <Text style={s.cardMeta}>
                {tx('Görevin gününe ek olarak bir gün öncesinde de bildirim gelir.', 'You also get a notification the day before the task is due.', 'Du wirst zusätzlich am Vortag erinnert.')}
              </Text>
            </View>
            <Switch
              value={notifPrefs.dayBefore}
              onValueChange={(value) => updateNotifPrefs({ dayBefore: value })}
              trackColor={{ false: '#CBD5D1', true: c.green }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={s.softCard}>
            <Text style={s.cardTitle}>{tx('Şu an planlanan', 'Currently planned', 'Aktuell geplant')}</Text>
            <Text style={s.cardMeta}>
              {upcoming > 0
                ? tx(`${upcoming} görev için hatırlatma kuruluyor. Görev ekleyip sildiğinde bildirimler kendiliğinden güncellenir.`, `Reminders are set for ${upcoming} tasks. They update automatically as you add or remove tasks.`, `Für ${upcoming} Aufgaben sind Erinnerungen gesetzt. Sie aktualisieren sich automatisch.`)
                : tx('Yaklaşan görevin yok. Görev ekleyince hatırlatma kendiliğinden kurulur.', 'You have no upcoming tasks. Reminders are set automatically when you add one.', 'Keine anstehenden Aufgaben. Erinnerungen werden automatisch gesetzt.')}
            </Text>
            <Text style={[s.note, { marginTop: 8 }]}>
              {tx('Bildirimler yalnızca bu cihazda kurulur; sunucudan anlık bildirim gönderilmez. Uygulamayı silersen hatırlatmalar da silinir.', 'Reminders live on this device only; there are no server push notifications. Deleting the app removes them.', 'Erinnerungen liegen nur auf diesem Gerät; es gibt keine Server-Push-Nachrichten.')}
            </Text>
          </View>

          <TouchableOpacity style={s.secondaryBtn} onPress={sendTestNotif}>
            <Text style={s.secondaryBtnText}>{tx('Test Bildirimi Gönder', 'Send Test Notification', 'Testbenachrichtigung senden')}</Text>
          </TouchableOpacity>
        </>
      )}
    </Screen>
  );
}
