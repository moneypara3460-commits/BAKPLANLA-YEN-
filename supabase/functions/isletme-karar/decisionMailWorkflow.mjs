export async function deliverCurrentDecision({ id, repository, mailConfigured, sendMail, now = Date.now }) {
  const { row, error } = await repository.readDecision(id);
  if (error) return { type: "read_error", error };
  if (!row || (row.status !== "approved" && row.status !== "rejected")) {
    return { type: "skipped", reason: "no_decision" };
  }
  if (row.decision_mailed_status === row.status) return { type: "skipped", reason: "already_mailed" };
  if (!row.reviewed_at || now() - new Date(row.reviewed_at).getTime() > 2 * 3600 * 1000) {
    return { type: "skipped", reason: "old" };
  }
  if (!mailConfigured) return { type: "error", code: "no_mail_config" };

  const claimed = await repository.claimDecision(id, row.status, row.reviewed_at);
  if (!claimed?.length) return { type: "skipped", reason: "claimed" };

  try {
    await sendMail(row);
  } catch (error) {
    await repository.releaseClaim(id, row.status, row.reviewed_at);
    return { type: "error", code: "mail_failed", error };
  }

  await repository.recordSent(id, row.status, row.reviewed_at, new Date(now()).toISOString());
  return { type: "success", status: row.status };
}
