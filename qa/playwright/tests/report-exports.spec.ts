import { test, expect } from '@playwright/test';
import { ensureAdminUser, ensurePublishedTender } from '../helpers/db';
import { signAdminToken } from '../helpers/api';

const API_BASE = process.env.QA_API_URL ?? 'http://localhost:3000';

/**
 * Report export lifecycle:
 * 1. POST /reports/{code}/export enqueues a job (returns immediately with QUEUED status).
 * 2. BullMQ worker processes the job (state transitions QUEUED → RUNNING → COMPLETED).
 * 3. GET /reports/jobs/{id} polls status until COMPLETED.
 * 4. GET /reports/jobs/{id}/download streams the XLSX file (caller-scoped).
 *
 * This spec exercises a basic Tender Summary report export — no commercial:export
 * permission needed, so any admin can run it.
 */
test.describe.serial('Report export enqueue → poll → download', () => {
  let adminUserId: string;
  let adminToken: string;
  let tenderId: string = '';

  test.beforeAll(async () => {
    adminUserId = (await ensureAdminUser({
      email: 'qa-report-admin@example.com',
      password: 'QaReportPass!2026',
      displayName: 'QA Report Admin',
    })) as unknown as string;
    adminToken = signAdminToken(adminUserId) as unknown as string;

    tenderId = (await ensurePublishedTender({
      reference: `QA_REPORT_${Date.now()}`,
      title: 'QA Report Test Tender',
      description: 'Tender for report-exports e2e test',
      adminUserId,
    })) as unknown as string;
  });

  test('enqueue tender_summary report → 201 with QUEUED status', async () => {
    const res = await fetch(`${API_BASE}/api/v1/reports/tender_summary/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ format: 'XLSX' }),
    });

    expect(res.status, `enqueue status: ${res.status}`).toBe(201);
    const body = (await res.json()) as any;
    expect(body.id).toBeTruthy();
    expect(body.status).toBe('QUEUED');
    expect(body.reportCode).toBe('tender_summary');
    expect(body.format).toBe('XLSX');
  });

  test('poll job status until COMPLETED (with timeout)', async () => {
    // 1. Enqueue.
    const enqRes = await fetch(`${API_BASE}/api/v1/reports/tender_summary/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ format: 'XLSX' }),
    });
    expect(enqRes.ok).toBeTruthy();
    const enqBody = (await enqRes.json()) as any;
    const jobId = enqBody.id;

    // 2. Poll until COMPLETED or timeout (30s).
    const maxAttempts = 30;
    const pollIntervalMs = 1000;
    let jobStatus = 'QUEUED';
    let completedAt = false;

    for (let i = 0; i < maxAttempts; i++) {
      const statusRes = await fetch(`${API_BASE}/api/v1/reports/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });

      expect(statusRes.ok, `status poll status: ${statusRes.status}`).toBeTruthy();
      const statusBody = (await statusRes.json()) as any;
      jobStatus = statusBody.status;
      completedAt = !!statusBody.completedAt;

      if (jobStatus === 'COMPLETED') {
        expect(statusBody.fileSize).toBeGreaterThan(0);
        break;
      }

      if (jobStatus === 'FAILED') {
        throw new Error(`Job failed: ${statusBody.errorMessage}`);
      }

      // Wait before next poll.
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    expect(jobStatus, 'job eventually completes').toBe('COMPLETED');
    expect(completedAt, 'completedAt timestamp set').toBe(true);
  });

  test('download completed report as XLSX', async () => {
    // 1. Enqueue.
    const enqRes = await fetch(`${API_BASE}/api/v1/reports/tender_summary/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ format: 'XLSX' }),
    });
    const enqBody = (await enqRes.json()) as any;
    const jobId = enqBody.id;

    // 2. Poll until COMPLETED.
    let jobStatus = 'QUEUED';
    for (let i = 0; i < 30; i++) {
      const statusRes = await fetch(`${API_BASE}/api/v1/reports/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });
      const statusBody = (await statusRes.json()) as any;
      if (statusBody.status === 'COMPLETED') {
        jobStatus = 'COMPLETED';
        break;
      }
      if (statusBody.status === 'FAILED') {
        throw new Error(`Job failed: ${statusBody.errorMessage}`);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    expect(jobStatus).toBe('COMPLETED');

    // 3. Download the file.
    const downloadRes = await fetch(`${API_BASE}/api/v1/reports/jobs/${jobId}/download`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    expect(downloadRes.ok, `download status: ${downloadRes.status}`).toBeTruthy();
    expect(downloadRes.headers.get('content-type')).toMatch(/spreadsheet|excel/i);

    const buffer = await downloadRes.arrayBuffer();
    expect(buffer.byteLength, 'downloaded file has content').toBeGreaterThan(100);

    // 4. Verify XLSX structure (magic bytes: PK for ZIP).
    const magicBytes = new Uint8Array(buffer).slice(0, 2);
    const isPkZip = magicBytes[0] === 0x50 && magicBytes[1] === 0x4b; // "PK"
    expect(isPkZip, 'file is valid ZIP/XLSX').toBe(true);
  });

  test('download requires authorization (caller-scoped)', async () => {
    // 1. Enqueue with first admin.
    const enqRes = await fetch(`${API_BASE}/api/v1/reports/tender_summary/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ format: 'XLSX' }),
    });
    const enqBody = (await enqRes.json()) as any;
    const jobId = enqBody.id;

    // 2. Poll to completion.
    for (let i = 0; i < 30; i++) {
      const statusRes = await fetch(`${API_BASE}/api/v1/reports/jobs/${jobId}`, {
        headers: { 'Authorization': `Bearer ${adminToken}` },
      });
      const statusBody = (await statusRes.json()) as any;
      if (statusBody.status === 'COMPLETED') break;
      if (statusBody.status === 'FAILED') throw new Error(`Job failed: ${statusBody.errorMessage}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 3. Create a second admin and try to download the first admin's report.
    const secondAdminId = await ensureAdminUser({
      email: 'qa-report-admin-2@example.com',
      password: 'QaReport2Pass!2026',
      displayName: 'QA Report Admin 2',
    });
    const secondAdminToken = signAdminToken(secondAdminId);

    const downloadRes = await fetch(`${API_BASE}/api/v1/reports/jobs/${jobId}/download`, {
      headers: { 'Authorization': `Bearer ${secondAdminToken}` },
    });

    expect(downloadRes.status, 'download by different user forbidden').toBe(403);
  });

  test('report enqueue with invalid format → 400', async () => {
    const res = await fetch(`${API_BASE}/api/v1/reports/tender_summary/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ format: 'CSV' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(JSON.stringify(body)).toMatch(/XLSX|PDF|format/i);
  });
});
