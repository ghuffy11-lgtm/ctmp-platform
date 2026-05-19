import { test, expect } from '@playwright/test';
import {
  ensureAdminUser,
  ensureApprovedVendor,
  ensurePublishedTender,
  resetTender,
} from '../helpers/db';
import { authJson, signAdminToken, signVendorToken } from '../helpers/api';
import { TECHNICAL_FIXTURE, COMMERCIAL_FIXTURE } from '../helpers/fixtures';

const API_BASE = process.env.QA_API_URL ?? 'http://localhost:3000';

const ADMIN = {
  email: 'qa-multi-admin@hadiclinic.com.kw',
  password: 'QaMultiPass!2026',
  displayName: 'QA Multi Admin',
};
const ADMIN_SECOND = {
  email: 'qa-multi-admin2@hadiclinic.com.kw',
  password: 'QaMultiPass!2026',
  displayName: 'QA Multi Admin Second',
};

const VENDORS = [
  {
    label: 'Alpha',
    email: 'qa-multi-vendor-a@example.com',
    password: 'QaPass!2026',
    companyName: 'QA Alpha LLC',
    contactName: 'Alpha Contact',
    technicalScore: 90,
    commercialPrice: 100_000,
  },
  {
    label: 'Bravo',
    email: 'qa-multi-vendor-b@example.com',
    password: 'QaPass!2026',
    companyName: 'QA Bravo LLC',
    contactName: 'Bravo Contact',
    technicalScore: 85,
    commercialPrice: 95_000,
  },
  {
    label: 'Charlie',
    email: 'qa-multi-vendor-c@example.com',
    password: 'QaPass!2026',
    companyName: 'QA Charlie LLC',
    contactName: 'Charlie Contact',
    technicalScore: 60, // below default threshold of 70 → FAIL
    commercialPrice: 80_000,
  },
];

const TENDER = {
  reference: 'TDR-QA-MULTI-0001',
  title: 'QA Multi-Vendor Competitive Tender',
  description: 'Three vendors submit different priced bids. QA verifies ranking + FAIL filtering.',
};

interface SubmittedBid {
  bidId: string;
  vendorId: string;
  technicalScore: number;
  commercialPrice: number;
}

test.describe.serial('Multi-vendor competitive bidding', () => {
  let adminUserId: string;
  let secondAdminUserId: string;
  let adminToken: string;
  let tenderId: string;
  const bids: SubmittedBid[] = [];

  test.beforeAll(async () => {
    adminUserId = await ensureAdminUser(ADMIN);
    secondAdminUserId = await ensureAdminUser(ADMIN_SECOND);
    tenderId = await ensurePublishedTender({
      reference: TENDER.reference,
      title: TENDER.title,
      description: TENDER.description,
      adminUserId,
    });
    await resetTender(TENDER.reference);
    adminToken = await signAdminToken(adminUserId);
  });

  test('three vendors submit bids with different prices', async () => {
    for (const v of VENDORS) {
      const seeded = await ensureApprovedVendor(v);
      const vendorToken = await signVendorToken(seeded.vendorUserId);

      const bid = await authJson<{ id: string }>(
        vendorToken,
        `/tenders/${tenderId}/bids/draft`,
        { method: 'POST', body: '{}' },
      );

      for (const env of ['TECHNICAL', 'COMMERCIAL'] as const) {
        const fd = new FormData();
        fd.append(
          'file',
          new Blob([env === 'TECHNICAL' ? TECHNICAL_FIXTURE : COMMERCIAL_FIXTURE], { type: 'text/plain' }),
          `${v.label}-${env.toLowerCase()}.txt`,
        );
        const res = await fetch(`${API_BASE}/api/v1/bids/${bid.id}/envelopes/${env}/documents`, {
          method: 'POST',
          body: fd,
          headers: { Authorization: `Bearer ${vendorToken}` },
        });
        expect(res.ok, `${v.label} ${env} upload`).toBeTruthy();
      }

      await authJson(vendorToken, `/bids/${bid.id}/submit`, { method: 'POST', body: '{}' });
      bids.push({
        bidId: bid.id,
        vendorId: seeded.vendorId,
        technicalScore: v.technicalScore,
        commercialPrice: v.commercialPrice,
      });
    }
    expect(bids).toHaveLength(3);
  });

  test('admin closes submissions, opens technical, scores each bid', async () => {
    await authJson(adminToken, `/tenders/${tenderId}/close-submissions`, { method: 'POST' });
    await authJson(adminToken, `/tenders/${tenderId}/technical-opening`, { method: 'POST' });

    for (const b of bids) {
      await authJson(adminToken, `/bids/${b.bidId}/technical-evaluations`, {
        method: 'POST',
        body: JSON.stringify({ score: b.technicalScore, notes: `QA fixture score ${b.technicalScore}` }),
      });
    }

    const finalize = await authJson<{ items: Array<{ bidId: string; result?: string; score?: number }> }>(
      adminToken,
      `/tenders/${tenderId}/finalize-technical-results`,
      { method: 'POST' },
    );

    // Alpha + Bravo pass (>=70). Charlie fails (60).
    const evaluations = finalize.items;
    expect(evaluations.length).toBeGreaterThanOrEqual(3);
  });

  test('commercial comparison ranks passed bids by price; failed bid excluded', async () => {
    // Open commercial envelopes via a committee session. Two distinct admins so
    // the committee service can build a real quorum (some configs reject duplicate
    // member ids).
    const session = await authJson<{ id: string; committeeMembers: Array<{ userId: string }> }>(
      adminToken,
      `/tenders/${tenderId}/committee-sessions`,
      {
        method: 'POST',
        body: JSON.stringify({
          scheduledAt: new Date().toISOString(),
          memberIds: [adminUserId, secondAdminUserId],
        }),
      },
    );
    await authJson(adminToken, `/committee-sessions/${session.id}/attendance`, {
      method: 'POST',
      body: JSON.stringify({ attendeeIds: session.committeeMembers.map(m => m.userId) }),
    });
    await authJson(adminToken, `/committee-sessions/${session.id}/open-commercial-envelopes`, {
      method: 'POST',
      body: JSON.stringify({ remarks: 'QA multi-vendor opening' }),
    });

    // Record commercial prices.
    for (const b of bids) {
      if (b.technicalScore < 70) continue; // only PASS bids can have commercial eval
      await authJson(adminToken, `/bids/${b.bidId}/commercial-evaluations`, {
        method: 'POST',
        body: JSON.stringify({ totalPrice: b.commercialPrice, notes: 'QA fixture price' }),
      });
    }

    const comparison = await authJson<{
      rows: Array<{
        bidId: string;
        vendorId: string;
        vendorCompany?: string;
        commercialDetailsVisible: boolean;
        totalAmount?: number;
        rank?: number;
      }>;
    }>(adminToken, `/tenders/${tenderId}/commercial-comparison`);

    // Only the 2 PASS bids should appear (Charlie filtered).
    expect(comparison.rows.length, 'failed bid excluded').toBe(2);

    // Cheapest first — Bravo (95k) before Alpha (100k).
    const ranked = [...comparison.rows].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
    const first = ranked[0];
    expect(first.totalAmount, 'rank-1 row has lowest price').toBe(95_000);
  });
});
