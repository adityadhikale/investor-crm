"use client";

import { useRouter } from "next/navigation";

import type { ContactRow } from "@/components/contact-details-dialog";
import { UnreadBadge } from "@/components/unread-badge";

export type InvestorTrackingRow = ContactRow & {
  lastInteraction: string | null;
  nextFollowUp: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function InvestorTrackingTable({
  investors,
  unreadCounts = {},
}: {
  investors: InvestorTrackingRow[];
  /** Unread WhatsApp message counts keyed by contact id. */
  unreadCounts?: Record<string, number>;
}) {
  const router = useRouter();

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-background">
      <div className="min-w-[640px]">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b bg-background text-left text-muted-foreground">
              <th className="w-[30%] px-5 py-2.5 sm:py-3 font-medium">Name</th>
              <th className="w-[25%] px-5 py-2.5 sm:py-3 font-medium">Phone</th>
              <th className="w-[22.5%] px-5 py-2.5 sm:py-3 font-medium">Last Interaction</th>
              <th className="w-[22.5%] px-5 py-2.5 sm:py-3 font-medium">Next Follow-up</th>
            </tr>
          </thead>

          <tbody>
            {investors.length ? (
              investors.map((investor) => (
                <tr
                  key={investor.id}
                  className="cursor-pointer border-b last:border-b-0 hover:bg-muted/20"
                  onClick={() => router.push(`/investors/${investor.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/investors/${investor.id}`);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                >
                  <td className="px-5 py-2.5 sm:py-4 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {investor.name}
                      <UnreadBadge count={unreadCounts[investor.id]} />
                    </span>
                  </td>
                  <td className="px-5 py-2.5 sm:py-4">{investor.phone}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 sm:py-4">
                    {formatDate(investor.lastInteraction)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 sm:py-4">
                    {formatDate(investor.nextFollowUp)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center text-muted-foreground">
                  No investor contacts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}