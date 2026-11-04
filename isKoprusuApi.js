/*
===========================================================
  BAKPLANLA İŞ KÖPRÜSÜ — Supabase çağrıları
  Tüm işlemler sunucudaki bk_* fonksiyonlarından (RPC) geçer.
  Uygulamaya gizli anahtar konmaz; yalnızca mevcut herkese açık anahtar + kullanıcı oturumu kullanılır.
  Dönüş: { ok: true, data } | { ok: false, code }
===========================================================
*/

import { errorCode } from './isKoprusu.js';

export const IK_TIMEOUT_MS = 15000;

const withTimeout = (promise, ms) => new Promise((resolve) => {
  let done = false;
  const timer = setTimeout(() => { if (!done) { done = true; resolve({ data: null, error: { message: 'timeout' } }); } }, ms);
  Promise.resolve(promise).then(
    (res) => { if (!done) { done = true; clearTimeout(timer); resolve(res); } },
    (err) => { if (!done) { done = true; clearTimeout(timer); resolve({ data: null, error: err || { message: 'network' } }); } },
  );
});

export const createIkApi = (supabase, timeoutMs = IK_TIMEOUT_MS) => {
  const rpc = async (fn, args) => {
    if (!supabase) return { ok: false, code: 'not_installed' };
    const res = await withTimeout(supabase.rpc(fn, args || {}), timeoutMs);
    if (res && res.error) return { ok: false, code: errorCode(res.error) };
    return { ok: true, data: res ? res.data : null };
  };
  return {
    // genç
    me: () => rpc('bk_get_me'),
    saveCandidate: (displayName, adultConfirmed, city) =>
      rpc('bk_save_candidate', { p_display_name: displayName, p_adult_confirmed: adultConfirmed, p_city: city || null }),
    listShifts: (f = {}) => rpc('bk_list_open_shifts', {
      p_role: f.role || null, p_from: f.from || null, p_to: f.to || null,
      p_min_pay: f.minPay ? Number(f.minPay) : null, p_only_eligible: !!f.onlyEligible, p_only_open_seats: !!f.onlyOpen,
    }),
    getShift: (id) => rpc('bk_get_shift', { p_shift_id: id }),
    apply: (shiftId, message, shareHistory, contactPhone) =>
      rpc('bk_apply', { p_shift_id: shiftId, p_message: message || null, p_share_history: !!shareHistory, p_contact_phone: contactPhone || null }),
    myApplications: () => rpc('bk_my_applications'),
    cancelApplication: (id) => rpc('bk_cancel_application', { p_application_id: id }),
    issueCheckin: (id) => rpc('bk_issue_checkin_token', { p_application_id: id }),
    review: (appId, side, ratings, comment) =>
      rpc('bk_submit_review', { p_application_id: appId, p_side: side, p_ratings: ratings, p_comment: comment || null }),
    respondOffer: (offerId, accept) => rpc('bk_respond_offer', { p_offer_id: offerId, p_accept: !!accept }),
    passport: () => rpc('bk_my_passport'),
    events: () => rpc('bk_my_events', { p_limit: 50 }),
    markRead: () => rpc('bk_mark_events_read'),
    report: (type, id, reason) => rpc('bk_report', { p_target_type: type, p_target_id: id, p_reason: reason }),
    // işletme
    registerBusiness: (payload) => rpc('bk_register_business', { p: payload }),
    myBusinesses: () => rpc('bk_my_businesses'),
    createShift: (businessId, payload) => rpc('bk_create_shift', { p_business_id: businessId, p: payload }),
    updateShift: (shiftId, payload) => rpc('bk_update_shift', { p_shift_id: shiftId, p: payload }),
    cancelShift: (shiftId, reason) => rpc('bk_cancel_shift', { p_shift_id: shiftId, p_reason: reason }),
    businessShifts: (businessId) => rpc('bk_business_shifts', { p_business_id: businessId }),
    applicants: (shiftId) => rpc('bk_shift_applicants', { p_shift_id: shiftId }),
    decide: (appId, status, note) => rpc('bk_decide_application', { p_application_id: appId, p_status: status, p_note: note || null }),
    confirmLegal: (appId) => rpc('bk_confirm_legal', { p_application_id: appId }),
    redeemCheckin: (payload) => rpc('bk_redeem_checkin', { p_payload: payload }),
    manualAttendance: (appId, action, note) => rpc('bk_manual_attendance', { p_application_id: appId, p_action: action, p_note: note }),
    sendOffer: (appId, payload) => rpc('bk_send_offer', { p_application_id: appId, p: payload }),
    withdrawOffer: (offerId) => rpc('bk_withdraw_offer', { p_offer_id: offerId }),
  };
};
