import { test, expect } from '@playwright/test';
import {
  ensureAdminUser,
  ensureApprovedVendor,
  ensurePublishedTender,
  resetTender,
} from '../helpers/db';
import { authFetch, authJson, signAdminToken, signVendorToken } from '../helpers/api';
import { TECHNICAL_FIXTURE, COMMERCIAL_FIXTURE } from '../helpers/fixtures';

// Migration 052 (2026-08-06): bid-level commercial terms — brand/manufacturer,
// country of origin, warranty, delivery period and payment terms.
//
// What is worth guarding:
//   * every field is optional and NEVER gates submission (vendor B submits
//     with nothing filled in and must still succeed),
//   * the delivery range rules (to >= from, to needs from, to == from
//     collapses to a fixed period),
//   * ownership + immutability, matching the BOQ endpoint's guards,
//   * the terms reach the admin Commercial Comparison response.

const API_BASE = process.env.QA_API_URL ?? 'http://localhost:3000';

const ADMIN = {
  email: 'qa-ct-admin@hadiclinic.com.kw',
  password: 'QaPass!2026',
  displayName: 'QA Commercial-Terms Admin',
};
const ADMIN_SECOND = {
  email: 'qa-ct-admin-2@hadiclinic.com.kw',
  password: 'QaPass!2026',
  displayName: 'QA Commercial-Terms Admin 2',
};
const VENDOR_A = {
  email: 'qa-ct-vendor@example.com',
  password: 'QaPass!2026',
  companyName: 'QA CT Vendor LLC',
  contactName: 'CT Contact',
};
const VENDOR_B = {
  email: 'qa-ct-vendor-2@example.com',
  password: 'QaPass!2026',
  companyName: 'QA CT Vendor 2 LLC',
  contactName: 'CT Contact 2',
};
const TENDER = {
  reference: 'TDR-QA-CT-0001',
  title: 'QA Commercial-Terms Tender',
  description: 'Bid-level commercial terms round-trip.',
};

const FULL_TERMS = {
  brandManufacturer: 'Mindray',
  countryOfOrigin: 'China',
  warrantyYears: 3,
  deliveryFrom: 4,
  deliveryTo: 8,
  deliveryUnit: 'WEEKS' as const,
  paymentTerms: '25% upon signing\n25% on delivery',
};

interface CommercialTermsResponse {
  brandManufacturer: string | null;
  countryOfOrigin: string | null;
  warrantyYears: number | null;
  deliveryFrom: number | null;
  deliveryTo: number | null;
  deliveryUnit: 'WEEKS' | 'MONTHS' | null;
  paymentTerms: string | null;
}

async function uploadEnvelopes(bidId: string, token: string) {
  for (const envelopeType of ['TECHNICAL', 'COMMERCIAL'] as const) {
    const fd = new FormData();
    fd.append(
      'file',
      new Blob([envelopeType === 'TECHNICAL' ? TECHNICAL_FIXTURE : COMMERCIAL_FIXTURE], {
        type: 'text/plain',
      }),
      `${envelopeType.toLowerCase()}.txt`,
    );
    const res = await fetch(`${API_BASE}/api/v1/bids/${bidId}/envelopes/${envelopeType}/documents`, {
      method: 'POST',
      body: fd,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok, `${envelopeType} upload`).toBe(true);
  }
}

test.describe.serial('Bid commercial terms', () => {
  let adminUserId: string;
  let secondAdminUserId: string;
  let tenderId: string;
  let tokenA: string;
  let tokenB: string;
  let bidA: string;
  let bidB: string;

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

    const a = await ensureApprovedVendor(VENDOR_A);
    const b = await ensureApprovedVendor(VENDOR_B);
    tokenA = await signVendorToken(a.vendorUserId);
    tokenB = await signVendorToken(b.vendorUserId);

    bidA = (await authJson<{ id: string }>(tokenA, `/tenders/${tenderId}/bids/draft`, {
      method: 'POST',
      body: '{}',
    })).id;
    bidB = (await authJson<{ id: string }>(tokenB, `/tenders/${tenderId}/bids/draft`, {
      method: 'POST',
      body: '{}',
    })).id;
  });

  test('a fresh draft has every term null', async () => {
    const terms = await authJson<CommercialTermsResponse>(tokenA, `/bids/${bidA}/commercial-terms`);
    expect(terms).toEqual({
      brandManufacturer: null,
      countryOfOrigin: null,
      warrantyYears: null,
      deliveryFrom: null,
      deliveryTo: null,
      deliveryUnit: null,
      paymentTerms: null,
    });
  });

  test('a full set round-trips, line breaks intact', async () => {
    const saved = await authJson<CommercialTermsResponse>(tokenA, `/bids/${bidA}/commercial-terms`, {
      method: 'PUT',
      body: JSON.stringify(FULL_TERMS),
    });
    expect(saved).toMatchObject(FULL_TERMS);

    const reread = await authJson<CommercialTermsResponse>(tokenA, `/bids/${bidA}/commercial-terms`);
    expect(reread.paymentTerms).toBe('25% upon signing\n25% on delivery');
    expect(reread.warrantyYears).toBe(3);
  });

  test('to == from collapses to a fixed period, unit defaulted', async () => {
    const saved = await authJson<CommercialTermsResponse>(tokenA, `/bids/${bidA}/commercial-terms`, {
      method: 'PUT',
      body: JSON.stringify({ deliveryFrom: 8, deliveryTo: 8 }),
    });
    expect(saved.deliveryFrom).toBe(8);
    expect(saved.deliveryTo).toBeNull();
    expect(saved.deliveryUnit).toBe('WEEKS');
  });

  test('deliveryTo below deliveryFrom is rejected', async () => {
    const res = await authFetch(tokenA, `/bids/${bidA}/commercial-terms`, {
      method: 'PUT',
      body: JSON.stringify({ deliveryFrom: 12, deliveryTo: 6, deliveryUnit: 'WEEKS' }),
    });
    expect(res.status).toBe(400);
  });

  test('deliveryTo without deliveryFrom is rejected', async () => {
    const res = await authFetch(tokenA, `/bids/${bidA}/commercial-terms`, {
      method: 'PUT',
      body: JSON.stringify({ deliveryTo: 8 }),
    });
    expect(res.status).toBe(400);
  });

  test('an unknown delivery unit is rejected', async () => {
    const res = await authFetch(tokenA, `/bids/${bidA}/commercial-terms`, {
      method: 'PUT',
      body: JSON.stringify({ deliveryFrom: 4, deliveryUnit: 'DAYS' }),
    });
    expect(res.status).toBe(400);
  });

  test('an empty payload clears every term', async () => {
    const cleared = await authJson<CommercialTermsResponse>(tokenA, `/bids/${bidA}/commercial-terms`, {
      method: 'PUT',
      body: '{}',
    });
    expect(Object.values(cleared).every(v => v === null)).toBe(true);
  });

  test('another vendor can neither read nor write these terms', async () => {
    const read = await authFetch(tokenB, `/bids/${bidA}/commercial-terms`);
    expect(read.status).toBe(403);

    const write = await authFetch(tokenB, `/bids/${bidA}/commercial-terms`, {
      method: 'PUT',
      body: JSON.stringify({ brandManufacturer: 'Not mine' }),
    });
    expect(write.status).toBe(403);
  });

  test('the endpoint requires a vendor token', async () => {
    const res = await fetch(`${API_BASE}/api/v1/bids/${bidA}/commercial-terms`);
    expect(res.status).toBe(401);
  });

  test('a bid with no terms at all still submits', async () => {
    // The regression this feature could realistically cause: an optional field
    // creeping into a submit precondition. Vendor B never touches the terms.
    await uploadEnvelopes(bidB, tokenB);
    const submit = await authFetch(tokenB, `/bids/${bidB}/submit`, { method: 'POST', body: '{}' });
    expect(submit.status, await submit.text()).toBe(201);
  });

  test('terms survive submission and the bid then becomes immutable', async () => {
    await authJson(tokenA, `/bids/${bidA}/commercial-terms`, {
      method: 'PUT',
      body: JSON.stringify(FULL_TERMS),
    });
    await uploadEnvelopes(bidA, tokenA);
    const submit = await authFetch(tokenA, `/bids/${bidA}/submit`, { method: 'POST', body: '{}' });
    expect(submit.status, await submit.text()).toBe(201);

    const afterSubmit = await authJson<CommercialTermsResponse>(
      tokenA,
      `/bids/${bidA}/commercial-terms`,
    );
    expect(afterSubmit).toMatchObject(FULL_TERMS);

    const write = await authFetch(tokenA, `/bids/${bidA}/commercial-terms`, {
      method: 'PUT',
      body: JSON.stringify({ brandManufacturer: 'Too late' }),
    });
    expect(write.status).toBe(403);
  });

  test('the commercial comparison carries the terms', async () => {
    const adminToken = await signAdminToken(adminUserId);

    // Drive the tender to committee commercial opening — the comparison is
    // gated on it. Same sequence as commercial-visibility.spec.
    await authJson(adminToken, `/tenders/${tenderId}/close-submissions`, { method: 'POST' });
    await authJson(adminToken, `/tenders/${tenderId}/technical-opening`, { method: 'POST' });
    for (const bidId of [bidA, bidB]) {
      await authJson(adminToken, `/bids/${bidId}/technical-evaluations`, {
        method: 'POST',
        body: JSON.stringify({ score: 90, notes: 'QA pass' }),
      });
    }
    await authJson(adminToken, `/tenders/${tenderId}/finalize-technical-results`, { method: 'POST' });

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
      body: JSON.stringify({ remarks: 'QA commercial-terms opening' }),
    });

    const comparison = await authJson<{
      vendors: Array<{ bidId: string; commercialTerms: CommercialTermsResponse | null }>;
    }>(adminToken, `/tenders/${tenderId}/comparison/commercial`);

    const filled = comparison.vendors.find(v => v.bidId === bidA);
    expect(filled?.commercialTerms).toMatchObject(FULL_TERMS);

    // A vendor who filled nothing in still gets the object, all-null — the
    // matrix renders an em dash per field rather than crashing.
    const blank = comparison.vendors.find(v => v.bidId === bidB);
    expect(blank?.commercialTerms).toEqual({
      brandManufacturer: null,
      countryOfOrigin: null,
      warrantyYears: null,
      deliveryFrom: null,
      deliveryTo: null,
      deliveryUnit: null,
      paymentTerms: null,
    });
  });
});
