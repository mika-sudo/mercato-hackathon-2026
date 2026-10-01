import { z } from "zod";

/**
 * Onboarding answers become prompt v1 through fixed templates: every choice maps to fixed text,
 * and the only free text (name, role) is reduced to one short line. No LLM is involved here.
 */

export interface Choice {
  id: string;
  label: string;
  /** Text written into the prompt. */
  rule: string;
}

export const PERSONA_IDS = [
  "founder",
  "engineer",
  "sales",
  "recruiter",
  "investor",
  "freelancer",
  "personal"
] as const;
export type PersonaId = (typeof PERSONA_IDS)[number];

export interface Persona {
  id: PersonaId;
  label: string;
  /** Starter rule set for this identity; shown under the picker and written into the prompt. */
  summary: string;
  urgent: Choice[];
  urgentDefaults: string[];
  junk: Choice[];
  junkDefaults: string[];
  delegates: Choice[];
}

export const STRICTNESS = {
  gentle: { label: "Gentle", unsure: "important", unsubscribeAt: null },
  balanced: { label: "Balanced", unsure: "unimportant", unsubscribeAt: 0.9 },
  ruthless: { label: "Ruthless", unsure: "junk", unsubscribeAt: 0.8 }
} as const satisfies Record<string, { label: string; unsure: string; unsubscribeAt: number | null }>;
export type Strictness = keyof typeof STRICTNESS;
export const STRICTNESS_IDS = Object.keys(STRICTNESS) as Strictness[];

const choice = (id: string, label: string, rule: string): Choice => ({ id, label, rule });

const FAMILY = choice("family", "Family", "Family, and anything about them.");
const MANAGER = choice("manager", "My manager", "Their manager, and anything their manager is waiting on.");
const MONEY_LEGAL = choice("money-legal", "Money & legal", "Money and legal: wires, payroll, taxes, lawyers and compliance deadlines.");
const DEALS = choice("deals", "Deals & contracts", "Deals, contracts and signatures waiting on them.");

const COLD_SALES = choice("cold-sales", "Cold sales", "Cold sales and vendor pitches from senders with no prior relationship.");
const RECRUITERS = choice("recruiters", "Recruiters", "Recruiters pitching jobs.");
const NEWSLETTERS = choice("newsletters", "Newsletters", "Newsletters and digests.");
const EVENTS = choice("events", "Event invites", "Event invites, webinars and conference promos.");
const NOTIFICATIONS = choice("notifications", "Notifications & receipts", "Automated notifications and receipts.");
const PROMOTIONS = choice("promotions", "Promotions", "Promotions, discounts and marketing email.");
const SCHEDULING = choice("scheduling", "Scheduling", "Scheduling and calendar logistics: an assistant handles these.");
const SUPPORT = choice("support", "Support", "Customer support requests: a support team handles these.");

export const PERSONAS: Record<PersonaId, Persona> = {
  founder: {
    id: "founder",
    label: "Founder / Exec",
    summary: "Investors, board, customers and key hires matter. Vendor pitches don't.",
    urgent: [
      choice("customers", "Customers & outages", "Customers reporting outages, escalations or churn risk."),
      choice("investors", "Investors & board", "Investors and board members, especially anything time-bound."),
      DEALS,
      choice("key-hires", "Key hires", "Key hires: candidates at offer stage and the people closing them."),
      MONEY_LEGAL,
      FAMILY
    ],
    urgentDefaults: ["customers", "investors"],
    junk: [COLD_SALES, RECRUITERS, NEWSLETTERS, EVENTS, NOTIFICATIONS, PROMOTIONS],
    junkDefaults: ["cold-sales", "events", "promotions"],
    delegates: [
      SCHEDULING,
      choice("invoices", "Invoices", "Invoices and billing: finance handles these."),
      SUPPORT
    ]
  },
  engineer: {
    id: "engineer",
    label: "Engineer",
    summary: "Incidents, review requests, your manager and your team matter. Marketing and bot noise don't.",
    urgent: [
      choice("incidents", "Outages & on-call", "Production incidents, pages and on-call handoffs."),
      choice("reviews", "Review requests", "Code reviews and design docs waiting on them."),
      MANAGER,
      choice("security", "Security alerts", "Security alerts and access problems on systems they own."),
      choice("ci", "Failed deploys & CI", "Failed deploys and broken CI on their projects."),
      FAMILY
    ],
    urgentDefaults: ["incidents", "manager"],
    junk: [
      COLD_SALES,
      RECRUITERS,
      NEWSLETTERS,
      EVENTS,
      choice("bot-notifications", "Bot notifications", "Tool and bot notifications that need no action: passing builds, digests, status emails."),
      PROMOTIONS
    ],
    junkDefaults: ["recruiters", "bot-notifications", "promotions"],
    delegates: [
      choice("on-call", "On-call rotation", "Alerts outside their on-call shift: the rotation handles these."),
      choice("planning", "Team lead", "Planning and status requests: the team lead handles these."),
      SUPPORT
    ]
  },
  sales: {
    id: "sales",
    label: "Sales / BD",
    summary: "Prospects, customers and anything tied to an open deal matter. Internal announcements don't.",
    urgent: [
      choice("prospects", "Prospects replying", "Prospects replying, booking time or asking questions."),
      DEALS,
      choice("renewals", "Customers & renewals", "Existing customers, renewals and expansion conversations."),
      MANAGER,
      choice("approvals", "Pricing approvals", "Pricing and discount approvals that block a deal."),
      FAMILY
    ],
    urgentDefaults: ["prospects", "deals"],
    junk: [
      { ...COLD_SALES, label: "Vendor pitches" },
      RECRUITERS,
      NEWSLETTERS,
      EVENTS,
      NOTIFICATIONS,
      PROMOTIONS
    ],
    junkDefaults: ["cold-sales", "newsletters", "promotions"],
    delegates: [
      choice("crm", "CRM updates", "CRM and pipeline hygiene requests: sales ops handles these."),
      choice("redlines", "Redlines", "Contract redlines: legal handles these."),
      SUPPORT
    ]
  },
  recruiter: {
    id: "recruiter",
    label: "Recruiter",
    summary: "Candidates, hiring managers and offers matter. Job-board alerts and agency pitches don't.",
    urgent: [
      choice("candidates", "Candidate replies", "Candidates replying, especially late-stage ones."),
      choice("hiring-managers", "Hiring managers", "Hiring managers asking for updates or feedback."),
      choice("offers", "Offers", "Offers, approvals and signed paperwork."),
      choice("interviews", "Interview changes", "Interview reschedules and no-shows for today or tomorrow."),
      MANAGER,
      FAMILY
    ],
    urgentDefaults: ["candidates", "offers"],
    junk: [
      choice("agency-pitches", "Agency pitches", "Recruiting agencies and sourcing tools pitching services."),
      choice("job-boards", "Job-board alerts", "Job-board and applicant-tracking alert digests."),
      NEWSLETTERS,
      EVENTS,
      NOTIFICATIONS,
      PROMOTIONS
    ],
    junkDefaults: ["agency-pitches", "job-boards", "promotions"],
    delegates: [
      choice("coordinator", "Interview scheduling", "Interview scheduling: a coordinator handles this."),
      choice("paperwork", "Paperwork", "Onboarding paperwork and background checks: HR ops handles these."),
      choice("sourcing", "Sourcing", "Top-of-funnel outreach: sourcers handle this.")
    ]
  },
  investor: {
    id: "investor",
    label: "Investor",
    summary: "Portfolio founders, LPs and live deals matter. Cold decks without a warm intro don't.",
    urgent: [
      choice("portfolio", "Portfolio founders", "Portfolio founders, especially asking for help or flagging trouble."),
      choice("live-deals", "Live deals", "Live deals: term sheets, diligence and closing documents."),
      choice("lps", "LPs", "Limited partners, and anything about reporting or capital."),
      choice("wires", "Capital calls & wires", "Capital calls, wires and signatures with a deadline."),
      choice("partners", "My partners", "Partners at the fund."),
      FAMILY
    ],
    urgentDefaults: ["portfolio", "live-deals"],
    junk: [
      choice("cold-pitches", "Cold pitches", "Cold decks and pitches with no warm intro."),
      RECRUITERS,
      NEWSLETTERS,
      EVENTS,
      NOTIFICATIONS,
      PROMOTIONS
    ],
    junkDefaults: ["newsletters", "events", "promotions"],
    delegates: [
      SCHEDULING,
      choice("fund-ops", "Fund admin", "Capital calls, K-1s and fund admin: fund ops handles these."),
      choice("screening", "Deck screening", "Inbound decks: associates screen these first.")
    ]
  },
  freelancer: {
    id: "freelancer",
    label: "Freelancer",
    summary: "Clients, deadlines, payments and new leads matter. Platform notifications don't.",
    urgent: [
      choice("clients", "Client feedback", "Clients with feedback, approvals or deadlines."),
      choice("leads", "New leads", "New project inquiries and referrals."),
      choice("payments", "Payments", "Payments, overdue invoices and payout problems."),
      choice("contracts", "Contracts", "Contracts and statements of work waiting on a signature."),
      FAMILY
    ],
    urgentDefaults: ["clients", "payments"],
    junk: [
      COLD_SALES,
      choice("platform", "Platform notifications", "Marketplace and platform notifications that need no action."),
      NEWSLETTERS,
      EVENTS,
      RECRUITERS,
      PROMOTIONS
    ],
    junkDefaults: ["cold-sales", "platform", "promotions"],
    delegates: [
      choice("bookkeeping", "Bookkeeping & taxes", "Bookkeeping and taxes: an accountant handles these."),
      choice("lead-screening", "Lead screening", "Qualifying new leads: an agent handles this."),
      SCHEDULING
    ]
  },
  personal: {
    id: "personal",
    label: "Personal",
    summary: "Family, friends, bills, travel and appointments matter. Marketing and social notifications don't.",
    urgent: [
      FAMILY,
      choice("bills", "Bills & banking", "Bills, bank alerts and anything overdue."),
      choice("travel", "Travel", "Travel bookings, check-ins and changes."),
      choice("appointments", "Health & appointments", "Doctor, dentist and other appointments."),
      choice("school", "School & childcare", "School and childcare messages."),
      choice("account-security", "Account security", "Password resets and sign-in alerts they didn't expect.")
    ],
    urgentDefaults: ["family", "bills"],
    junk: [
      PROMOTIONS,
      NEWSLETTERS,
      choice("social", "Social notifications", "Social media notifications."),
      COLD_SALES,
      EVENTS,
      NOTIFICATIONS
    ],
    junkDefaults: ["promotions", "social"],
    delegates: [
      choice("household", "Household bills", "Household bills: their partner handles these."),
      choice("taxes", "Taxes", "Taxes: an accountant handles these.")
    ]
  }
};

const choiceIds = z.array(z.string().min(1).max(64)).max(20);

export const onboardingAnswersSchema = z
  .object({
    name: z.string().max(200),
    role: z.string().max(200),
    persona: z.enum(PERSONA_IDS),
    urgent: choiceIds,
    junk: choiceIds,
    delegates: choiceIds,
    strictness: z.enum(["gentle", "balanced", "ruthless"])
  })
  .strict();
export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>;

export const onboardingRecordSchema = z
  .object({
    version: z.literal(1),
    answers: onboardingAnswersSchema,
    prompt: z.string(),
    unsubscribeAt: z.number().min(0).max(1).nullable(),
    savedAt: z.string().datetime()
  })
  .strict();
export type OnboardingRecord = z.infer<typeof onboardingRecordSchema>;

export const NAME_MAX = 40;
export const ROLE_MAX = 80;

export function defaultAnswers(persona: PersonaId = "founder"): OnboardingAnswers {
  const preset = PERSONAS[persona];
  return {
    name: "",
    role: "",
    persona,
    urgent: [...preset.urgentDefaults],
    junk: [...preset.junkDefaults],
    delegates: [],
    strictness: "balanced"
  };
}

/** Picking an identity applies its preset; name, role and strictness carry over. */
export function withPersona(answers: OnboardingAnswers, persona: PersonaId): OnboardingAnswers {
  return { ...defaultAnswers(persona), name: answers.name, role: answers.role, strictness: answers.strictness };
}

/** One line of plain text: no control characters, no newlines, bounded length. */
export function cleanLine(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

function picked(choices: Choice[], ids: string[]): Choice[] {
  return choices.filter((item) => ids.includes(item.id));
}

export function buildPrompt(answers: OnboardingAnswers): string {
  const persona = PERSONAS[answers.persona];
  const strictness = STRICTNESS[answers.strictness];
  const name = cleanLine(answers.name, NAME_MAX);
  const role = cleanLine(answers.role, ROLE_MAX);
  const who = name || "the user";
  const urgent = picked(persona.urgent, answers.urgent);
  const junk = picked(persona.junk, answers.junk);
  const delegates = picked(persona.delegates, answers.delegates);
  const bullets = (rules: string[]) => rules.map((rule) => `- ${rule}`);

  return [
    `You triage email for ${who}${role ? `, ${role}` : ""}.`,
    "Put every thread in exactly one category: urgent, important, unimportant or junk.",
    "",
    `Profile (${persona.label}): ${persona.summary}`,
    "",
    "urgent: needs attention today.",
    ...bullets(urgent.length ? urgent.map((item) => item.rule) : ["Direct requests with a same-day deadline."]),
    "",
    "important: people who need a reply or a decision, but not today.",
    "",
    "unimportant: fine to skip, but not junk.",
    "- Updates that need no action.",
    ...(delegates.length
      ? ["- Work handled by someone else is unimportant:", ...delegates.map((item) => `  - ${item.rule}`)]
      : []),
    "",
    `junk: ${who} never wants to see these.`,
    ...bullets(junk.length ? junk.map((item) => item.rule) : ["Obvious spam and phishing only."]),
    "",
    "Never junk, whatever else applies:",
    `- Threads ${who} has replied in.`,
    `- Senders who are direct contacts of ${who}.`,
    "",
    `When unsure, choose ${strictness.unsure}.`,
    strictness.unsubscribeAt === null
      ? "Never auto-unsubscribe."
      : `Auto-unsubscribe from junk senders only at ${strictness.unsubscribeAt} confidence or higher.`
  ].join("\n");
}
