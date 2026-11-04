const isDeviceNotRegistered = (ticket) =>
  ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered";

/**
 * Resolve one Expo response against the exact ordered recipient batch.
 * A plan is complete only when each recipient has an accepted ticket or a
 * permanent unregistered-device result. Partial/transient batches are retried
 * as a whole because the current plan schema cannot persist per-token outcomes.
 */
export async function decideExpoPushResponse(response, recipientCount, attempts, maxAttempts) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // The provider may have accepted some messages before the response was lost.
  }

  const tickets = Array.isArray(payload?.data) ? payload.data : [];
  const ticketCountMatches = tickets.length === recipientCount;
  const invalidTokenIndexes = tickets.flatMap((ticket, index) =>
    index < recipientCount && isDeviceNotRegistered(ticket) ? [index] : []
  );
  const completeTicketMapping = tickets.length === recipientCount && tickets.every((ticket) =>
    ticket?.status === "ok" || isDeviceNotRegistered(ticket)
  );
  const hasAcceptedTicket = tickets.some((ticket) => ticket?.status === "ok");
  const hasRetryableOrUnknownTicket = tickets.some((ticket) =>
    ticket?.status !== "ok" && !isDeviceNotRegistered(ticket)
  );

  if (response.ok && completeTicketMapping && hasAcceptedTicket && !hasRetryableOrUnknownTicket) {
    return { status: "sent", invalidTokenIndexes, outcome: "accepted_or_permanently_invalid" };
  }

  return {
    status: attempts >= maxAttempts ? "failed" : "scheduled",
    invalidTokenIndexes: response.ok ? invalidTokenIndexes : [],
    outcome: response.ok && ticketCountMatches ? "partial_or_rejected" : "ambiguous",
  };
}
