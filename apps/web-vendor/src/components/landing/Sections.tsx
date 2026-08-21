'use client';

// Presentational sections of the public landing page. No data fetching, no
// state — everything they render comes from ./content.ts or from props the
// page already had. Styling reuses the portal's existing language (glass cards,
// electric accent, heading-font) so the page reads as part of the product.

import Link from 'next/link';
import { CheckCircle2, FileCheck2, ShieldCheck, UserPlus } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import {
  ABOUT,
  FOOTER,
  GOOD_TO_KNOW,
  HERO,
  HERO_FACTS,
  REQUIREMENTS,
  STEPS,
} from './content';

function SectionHeading({ id, title, intro }: { id: string; title: string; intro?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 id={id} className="heading-font text-3xl md:text-4xl font-semibold tracking-tighter scroll-mt-28">
        {title}
      </h2>
      {intro && <p className="text-slate-900/65 text-sm mt-3 leading-relaxed">{intro}</p>}
    </div>
  );
}

export function Hero({ portalName }: { portalName: string }) {
  return (
    <section className="pt-12 pb-4">
      <div className="max-w-3xl">
        <span className="text-electric-600 text-[11px] tracking-[3px] font-semibold uppercase">
          {HERO.eyebrow}
        </span>
        <h1 className="heading-font text-4xl md:text-6xl font-semibold tracking-tighter leading-[1.05] mt-4 text-balance">
          {HERO.headline.replace('{portal}', portalName)}
        </h1>
        {/* Owner 2026-08-07: no CTAs here — Sign In / Register already sit in
            the header, and repeating them under the intro added nothing. */}
        <p className="text-slate-900/70 text-base md:text-lg mt-6 leading-relaxed">{HERO.body}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12">
        {HERO_FACTS.map(fact => (
          <GlassCard key={fact.title} padding="md" className="flex gap-3">
            <ShieldCheck className="w-5 h-5 text-electric-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-sm">{fact.title}</div>
              <p className="text-slate-900/65 text-xs mt-1 leading-relaxed">{fact.body}</p>
            </div>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}

export function AboutSystem() {
  return (
    <section className="pt-16 space-y-8">
      <SectionHeading id="about" title={ABOUT.heading} intro={ABOUT.intro} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {ABOUT.cards.map(card => (
          <GlassCard key={card.title} padding="lg" className="h-full">
            <h3 className="heading-font text-xl font-medium">{card.title}</h3>
            <p className="text-slate-900/70 text-sm mt-3 leading-relaxed">{card.body}</p>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}

export function HowItWorks() {
  return (
    <section className="pt-16 space-y-8">
      <SectionHeading
        id="how-it-works"
        title="How it works"
        intro="From first registration to the final result — nine steps, in order."
      />
      <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <GlassCard padding="lg" className="h-full">
              <div className="flex items-baseline gap-3">
                <span className="heading-font text-electric-600 text-2xl font-semibold tabular-nums leading-none">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <h3 className="heading-font text-lg font-medium leading-snug">{step.title}</h3>
              </div>
              <p className="text-slate-900/70 text-sm mt-3 leading-relaxed">{step.body}</p>
            </GlassCard>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Requirements() {
  return (
    <section className="pt-16 space-y-8">
      <SectionHeading id="requirements" title={REQUIREMENTS.heading} intro={REQUIREMENTS.intro} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassCard padding="lg">
          <h3 className="heading-font text-xl font-medium flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-electric-600" />
            Documents
          </h3>
          <ul className="mt-5 space-y-3">
            {REQUIREMENTS.documents.map(doc => (
              <li key={doc.label} className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium">{doc.label}</div>
                  <div className="text-xs text-slate-900/55 mt-0.5">{doc.note}</div>
                </div>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-3 py-1 rounded-3xl whitespace-nowrap ${
                    doc.required
                      ? 'bg-electric-500/15 text-electric-600'
                      : 'bg-slate-900/5 text-slate-900/55'
                  }`}
                >
                  {doc.required ? 'Required' : 'Optional'}
                </span>
              </li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard padding="lg">
          <h3 className="heading-font text-xl font-medium flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-electric-600" />
            Details
          </h3>
          <ul className="mt-5 space-y-3">
            {REQUIREMENTS.details.map(detail => (
              <li key={detail} className="flex gap-2.5 text-sm text-slate-900/70 leading-relaxed">
                <span className="text-electric-600 mt-0.5 shrink-0">•</span>
                {detail}
              </li>
            ))}
          </ul>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 mt-6 px-5 py-3 btn-electric rounded-3xl text-sm font-medium"
          >
            <UserPlus className="w-4 h-4" />
            Start registration
          </Link>
        </GlassCard>
      </div>
    </section>
  );
}

export function GoodToKnow() {
  return (
    <section className="pt-16 space-y-8">
      <SectionHeading id="good-to-know" title={GOOD_TO_KNOW.heading} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {GOOD_TO_KNOW.items.map(item => (
          <GlassCard key={item.q} padding="lg" className="h-full">
            <h3 className="text-sm font-semibold">{item.q}</h3>
            <p className="text-slate-900/70 text-sm mt-2 leading-relaxed">{item.a}</p>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}

export function LandingFooter({ portalName }: { portalName: string }) {
  return (
    <footer className="mt-20 border-t border-slate-900/10">
      {/* Owner 2026-08-07: the contact column (email / phone / hours) and the
          Register · Sign in links were removed. Tender questions belong in
          Clarifications, which the body text points at. */}
      <div className="max-w-screen-2xl mx-auto w-full px-6 lg:px-8 py-12">
        <div className="max-w-2xl">
          <h2 className="heading-font text-2xl font-semibold tracking-tight">{FOOTER.heading}</h2>
          <p className="text-slate-900/65 text-sm mt-3 leading-relaxed">{FOOTER.body}</p>
          <p className="text-slate-900/45 text-xs mt-6">{FOOTER.legal}</p>
        </div>
      </div>
      <div className="border-t border-slate-900/10">
        <div className="max-w-screen-2xl mx-auto w-full px-6 lg:px-8 py-5 text-xs text-slate-900/45">
          {portalName} · Vendor Portal
        </div>
      </div>
    </footer>
  );
}
