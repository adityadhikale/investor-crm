import { markConversationRead } from "@/app/unread-messages/actions";

// Fired on `window` whenever the unread-conversation state may have changed,
// so the sidebar badge can refresh without waiting for its next poll.
export const UNREAD_CHANGED_EVENT = "crm:unread-changed";

export async function markReadAndNotify(contactId: string) {
  await markConversationRead(contactId);
  window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
}
