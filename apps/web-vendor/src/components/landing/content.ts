// Every word on the public landing page lives here.
//
// The copy is fixed at build time (owner decision 2026-08-07), so keeping it in
// one module means changing a sentence is a single small edit followed by a
// rebuild of web-vendor — not a hunt through JSX.
//
// Source of truth for the process description: docs/user-guides/VENDOR_GUIDE.md.
// If the vendor journey changes, update BOTH — that guide is also rendered to
// the role-guide PDFs by scripts/seed_role_guides.sh.
//
// No contact block: the owner removed the footer's email/phone/hours on
// 2026-08-07. Vendors are pointed at the Clarifications feature instead, so
// questions stay attached to the tender they concern.

export const HERO = {
  eyebrow: 'Supplier & contractor portal',
  // {portal} is replaced at render time with the branded portal name.
  headline: 'Bid for {portal} contracts, online and on the record.',
  body:
    'This is the official portal for tenders issued by our procurement department. ' +
    'Register once, then browse open tenders, download the documents, submit sealed ' +
    'bids and follow your result — all in one place, with a timestamped receipt for ' +
    'everything you submit.',
};

export const HERO_FACTS: Array<{ title: string; body: string }> = [
  {
    title: 'Sealed two-envelope bidding',
    body: 'Technical and commercial envelopes are opened at separate, recorded stages.',
  },
  {
    title: 'Checksummed receipts',
    body: 'Every submission returns a receipt number and SHA-256 checksum per document.',
  },
  {
    title: 'Free to register',
    body: 'No charge to create an account, browse tenders or submit a bid.',
  },
];

export const ABOUT = {
  heading: 'About this system',
  intro:
    'Our procurement department publishes its tenders here so that every supplier ' +
    'receives the same information, at the same time, under the same rules.',
  cards: [
    {
      title: 'What it is',
      body:
        'A single portal covering the whole tender lifecycle: publication, clarifications, ' +
        'bid submission, evaluation, negotiation and award. Nothing is handled by email ' +
        'attachments or paper envelopes.',
    },
    {
      title: 'Who can bid',
      body:
        'Any company may register. Procurement reviews each registration, and once your ' +
        'account is approved you can submit bids on open tenders. Some tenders are ' +
        'invitation-only and appear when you have been invited.',
    },
    {
      title: 'How your prices stay private',
      body:
        'Your technical documents stay sealed until the technical opening stage, and your ' +
        'prices stay sealed until the evaluation committee opens the commercial envelopes ' +
        'in a recorded session. Clarification replies are private to your company.',
    },
  ],
};

// The nine steps a vendor actually walks. Order is real information here, which
// is why these are numbered and the other sections are not.
export const STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Register your company',
    body:
      'Company details, a primary contact and your commercial licence. Takes a few minutes.',
  },
  {
    title: 'Verify your email',
    body: 'Click the link we send you. Your address has to be confirmed before anything else.',
  },
  {
    title: 'Wait for approval',
    body:
      'Procurement reviews your registration and emails you when the account is approved. ' +
      'You can sign in while it is pending, but bidding stays locked.',
  },
  {
    title: 'Find a tender',
    body:
      'Browse open tenders by title, reference or category. Each card shows the department ' +
      'and how long is left before the deadline.',
  },
  {
    title: 'Read it and download the documents',
    body:
      'Open the tender for the full description, requirements and every attached document, ' +
      'plus the exact submission deadline.',
  },
  {
    title: 'Complete the bid wizard',
    body:
      'Upload your technical proposal, price the Bill of Quantities line by line, add your ' +
      'commercial terms — brand, country of origin, warranty, delivery period and payment ' +
      'terms — attach the signed commercial PDF, then review.',
  },
  {
    title: 'Submit and keep your receipt',
    body:
      'Submitting locks the bid and returns a receipt number with a checksum for every ' +
      'document. Submitted bids cannot be edited, so review before you confirm.',
  },
  {
    title: 'Ask clarifications',
    body:
      'Question about scope or specification? Ask through the portal. Answers are private ' +
      'to your company, and procurement may also ask you something.',
  },
  {
    title: 'Negotiation, then the result',
    body:
      'If procurement invites you to revise your offer you submit a new round — your ' +
      'original bid is preserved. When the tender is decided your bid shows the outcome.',
  },
];

export const REQUIREMENTS = {
  heading: 'What you need to register',
  intro: 'Have these ready before you start — registration takes a few minutes once you do.',
  documents: [
    { label: 'Commercial licence', required: true, note: 'PDF, up to 10 MB' },
    { label: 'Authorisation letter', required: false, note: 'PDF, optional' },
    { label: 'Other supporting documents', required: false, note: 'PDF, up to 5 files' },
  ],
  details: [
    'Company name, phone, address and website',
    'A primary contact name and email address — this becomes your sign-in',
    'A password of at least 12 characters, with upper and lower case, a number and a symbol',
  ],
};

export const GOOD_TO_KNOW = {
  heading: 'Good to know',
  items: [
    {
      q: 'Can I change a bid after submitting?',
      a:
        'No. Submission locks the bid and checksums every document. Save your draft as often ' +
        'as you like, but review carefully before you submit.',
    },
    {
      q: 'Who sees my prices?',
      a:
        'Nobody, until the evaluation committee opens the commercial envelopes in a recorded ' +
        'session. Technical evaluation happens before that, without prices in view.',
    },
    {
      q: 'Why can I not bid yet?',
      a:
        'Either your account is still pending approval, the tender is invitation-only, or the ' +
        'submission window has not opened or has already closed. The tender page states which.',
    },
    {
      q: 'What file types can I upload?',
      a: 'PDF only, up to 10 MB per file, on both the technical and commercial envelopes.',
    },
    {
      q: 'I missed the deadline — what now?',
      a:
        'The window closes automatically. A late submission is only possible if procurement ' +
        'grants a documented exception, so contact them before the deadline, not after.',
    },
  ],
};

export const FOOTER = {
  heading: 'Need help?',
  body:
    'For a question about a specific tender, use the Clarifications section inside the ' +
    'portal so your question and its answer stay on the record. For anything else, contact ' +
    'the procurement team.',
  legal:
    'Access is monitored and every action in this portal is recorded in an audit log.',
};
