/** Red count of unread WhatsApp messages, shown next to a contact's name. */
export function UnreadBadge({ count }: { count: number | undefined }) {
  if (!count || count <= 0) return null;

  return (
    <span
      className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold leading-none text-white"
      title={`${count} unread WhatsApp ${count === 1 ? "message" : "messages"}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
