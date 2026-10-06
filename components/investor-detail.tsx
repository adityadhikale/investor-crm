"use client";

import {
  ContactDetail,
  type WhatsAppMessage,
} from "@/components/contact-detail";
import type { ComponentProps } from "react";

export type { WhatsAppMessage };

/** The Investors page's detail screen: the contact screen with investor wording. */
export function InvestorDetail(props: Omit<ComponentProps<typeof ContactDetail>, "variant">) {
  return <ContactDetail variant="investor" {...props} />;
}
