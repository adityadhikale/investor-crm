import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Crest Capital Management Private Limited collects, uses and protects personal information.",
};

const CONTACT_EMAIL = "aditya.dhikale@crest-group.co";

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-8 scroll-mt-8">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-foreground/90">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 leading-relaxed sm:py-14">
      <h1 className="text-3xl font-semibold">Privacy Policy</h1>
      <p className="mt-1 text-sm text-muted-foreground">Last updated: 2 October 2026</p>

      <p className="mt-6">
        This Privacy Policy explains how <strong>Crest Capital Management Private Limited</strong>{" "}
        (&quot;Crest&quot;, &quot;we&quot;, &quot;us&quot;) collects, uses and protects personal
        information when we communicate with investors, clients, shareholders, advisors and
        prospective contacts, including through WhatsApp.
      </p>

      <Section title="1. Who we are">
        <p>
          Crest Capital Management Private Limited is an investment management business in India.
          For privacy questions, contact us at{" "}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="2. Information we collect">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Contact details</strong> you or your representatives have given us: name, phone
            number, email address, and the organisation or role you hold.
          </li>
          <li>
            <strong>Records of our relationship</strong>: notes from meetings and calls, follow-up
            reminders, and the groups or categories we file you under (for example,
            &quot;Investor&quot; or &quot;Shareholder&quot;).
          </li>
          <li>
            <strong>WhatsApp messages</strong> exchanged between you and us, including text,
            images, documents and voice notes you choose to send, together with the time they were
            sent.
          </li>
        </ul>
      </Section>

      <Section title="3. How we use your information">
        <ul className="list-disc space-y-2 pl-6">
          <li>To respond to your messages and questions.</li>
          <li>
            To send you updates, reports, reminders and other communications relating to your
            relationship with Crest.
          </li>
          <li>
            To keep accurate records of our dealings with you, and to meet legal and regulatory
            requirements.
          </li>
        </ul>
        <p>
          We do not sell your personal information, and we do not use it for third-party
          advertising.
        </p>
      </Section>

      <Section title="4. WhatsApp">
        <p>
          We use the WhatsApp Business Platform, provided by Meta Platforms, Inc., to send and
          receive messages. Messages sent through WhatsApp are processed by WhatsApp and Meta in
          accordance with their own terms and privacy policies. We message you only where you have
          contacted us, or where we have a legitimate relationship with you and a basis to contact
          you. You can ask us at any time to stop sending you messages, and we will honour that
          request.
        </p>
      </Section>

      <Section title="5. Service providers">
        <p>
          We use trusted technology providers to store and process data on our behalf, such as
          cloud database hosting, email delivery and AI-assisted drafting and summarising tools.
          They may handle your information only to provide services to us and are not permitted to
          use it for their own purposes.
        </p>
      </Section>

      <Section title="6. How long we keep information">
        <p>
          We keep personal information for as long as needed for the purposes in this policy and to
          meet legal, accounting and regulatory obligations. After that, we delete it or make it
          anonymous.
        </p>
      </Section>

      <Section title="7. Security">
        <p>
          We protect personal information with access controls and encrypted connections. Access to
          our records is limited to authorised staff. No system is completely secure, but we take
          reasonable steps to protect your information.
        </p>
      </Section>

      <Section title="8. Your choices and rights">
        <p>
          You may ask us to tell you what information we hold about you, to correct it, or to
          delete it, and you may ask us to stop messaging you. To make a request, email{" "}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          . We will respond within a reasonable time and in line with applicable Indian law.
        </p>
      </Section>

      <Section id="data-deletion" title="9. Data deletion">
        <p>
          To have your personal data deleted from our systems, email{" "}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>{" "}
          from the address or phone number we hold for you, with the subject line &quot;Data
          deletion request&quot;. We will confirm once your information has been removed, except
          for anything we are legally required to keep.
        </p>
      </Section>

      <Section title="10. Changes to this policy">
        <p>
          We may update this policy from time to time. The &quot;Last updated&quot; date above
          shows when it last changed.
        </p>
      </Section>
    </div>
  );
}
