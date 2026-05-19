import { Client } from 'pg';
import bcrypt from 'bcrypt';

const DATABASE_URL =
  process.env.QA_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgresql://ctmp:ctmp_dev@localhost:5432/ctmp';

export async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/**
 * Idempotent: ensures an internal admin user exists with the given email + password.
 * Seeds a department + role (System Admin) and links the user. Returns the user UUID.
 */
export async function ensureAdminUser(args: {
  email: string;
  password: string;
  displayName: string;
}): Promise<string> {
  return withDb(async client => {
    // Department
    let deptRow = await client.query<{ id: string }>(
      `SELECT id FROM departments WHERE name = $1 LIMIT 1`,
      ['QA Department'],
    );
    let departmentId: string;
    if (deptRow.rowCount === 0) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO departments (id, name, code, is_active, created_at)
         VALUES (gen_random_uuid(), $1, $2, true, now())
         RETURNING id`,
        ['QA Department', 'QA'],
      );
      departmentId = inserted.rows[0].id;
    } else {
      departmentId = deptRow.rows[0].id;
    }

    // System Admin role (seeded by 001_baseline_roles_permissions.sql in real envs).
    let roleRow = await client.query<{ id: string }>(
      `SELECT id FROM roles WHERE code = 'system_admin' LIMIT 1`,
    );
    let roleId: string;
    if (roleRow.rowCount === 0) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO roles (id, code, name, description, is_system, created_at)
         VALUES (gen_random_uuid(), 'system_admin', 'System Admin', 'Full system access', true, now())
         RETURNING id`,
      );
      roleId = inserted.rows[0].id;
    } else {
      roleId = roleRow.rows[0].id;
    }

    // Grant the role every permission so the test admin can do everything.
    await client.query(
      `INSERT INTO role_permissions (role_id, permission_id, granted_at)
       SELECT $1, p.id, now() FROM permissions p
       ON CONFLICT DO NOTHING`,
      [roleId],
    );

    // User (LOCAL auth so we can bcrypt-verify the password).
    const passwordHash = await bcrypt.hash(args.password, 12);
    const userRow = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [args.email],
    );
    let userId: string;
    if (userRow.rowCount === 0) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (id, email, display_name, auth_type, password_hash, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'LOCAL', $3, 'ACTIVE', now(), now())
         RETURNING id`,
        [args.email, args.displayName, passwordHash],
      );
      userId = inserted.rows[0].id;
    } else {
      userId = userRow.rows[0].id;
      await client.query(`UPDATE users SET password_hash = $1, auth_type = 'LOCAL' WHERE id = $2`, [passwordHash, userId]);
    }

    await client.query(
      `INSERT INTO user_departments (user_id, department_id, is_primary, assigned_at)
       VALUES ($1, $2, true, now()) ON CONFLICT DO NOTHING`,
      [userId, departmentId],
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role_id, granted_at) VALUES ($1, $2, now()) ON CONFLICT DO NOTHING`,
      [userId, roleId],
    );

    return userId;
  });
}

/**
 * Force-verify the vendor's primary contact email so we don't need to round-trip
 * through MailHog inside the test. The verification flow itself is covered by
 * a separate test; here we just want the golden path to proceed.
 */
export async function forceVerifyVendorPrimaryEmail(vendorEmail: string): Promise<void> {
  await withDb(async client => {
    await client.query(
      `UPDATE vendor_users SET email_verified_at = now() WHERE email = $1`,
      [vendorEmail],
    );
  });
}

/**
 * Create a tender in the Published state with the given reference, ready to receive bids.
 * Returns the tender UUID.
 */
export async function ensurePublishedTender(args: {
  reference: string;
  title: string;
  description: string;
  adminUserId: string;
}): Promise<string> {
  return withDb(async client => {
    let dept = await client.query<{ id: string }>(
      `SELECT id FROM departments LIMIT 1`,
    );
    if (dept.rowCount === 0) {
      throw new Error('No departments configured — ensureAdminUser first');
    }
    const departmentId = dept.rows[0].id;

    const existing = await client.query<{ id: string }>(
      `SELECT id FROM tenders WHERE reference = $1 LIMIT 1`,
      [args.reference],
    );
    if (existing.rowCount && existing.rows[0]) return existing.rows[0].id;

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO tenders (
        id, reference, title, description, department_id, visibility, status,
        submission_close_at, current_version, created_by, owning_user_id,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, 'PUBLIC', 'PUBLISHED',
        now() + interval '30 days', 1, $5, $5,
        now(), now()
      )
      RETURNING id`,
      [args.reference, args.title, args.description, departmentId, args.adminUserId],
    );
    return inserted.rows[0].id;
  });
}

/**
 * Seed an APPROVED vendor with a verified primary contact. Idempotent.
 * Used by specs that don't need to exercise the registration flow itself.
 */
export async function ensureApprovedVendor(args: {
  email: string;
  password: string;
  companyName: string;
  contactName: string;
}): Promise<{ vendorId: string; vendorUserId: string; password: string }> {
  return withDb(async client => {
    const existingUser = await client.query<{ id: string; vendor_id: string }>(
      `SELECT id, vendor_id FROM vendor_users WHERE email = $1 LIMIT 1`,
      [args.email],
    );
    if (existingUser.rowCount && existingUser.rows[0]) {
      const vendorUserId = existingUser.rows[0].id;
      const vendorId = existingUser.rows[0].vendor_id;
      await client.query(
        `UPDATE vendor_users SET email_verified_at = now(), password_hash = $2, status = 'ACTIVE', failed_login_count = 0, locked_until = NULL WHERE id = $1`,
        [vendorUserId, await bcrypt.hash(args.password, 12)],
      );
      await client.query(
        `UPDATE vendors SET status = 'APPROVED', approved_at = COALESCE(approved_at, now()), company_name = $2 WHERE id = $1`,
        [vendorId, args.companyName],
      );
      return { vendorId, vendorUserId, password: args.password };
    }

    const vendorRow = await client.query<{ id: string }>(
      `INSERT INTO vendors (id, company_name, status, approved_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'APPROVED', now(), now(), now())
       RETURNING id`,
      [args.companyName],
    );
    const vendorId = vendorRow.rows[0].id;

    const userRow = await client.query<{ id: string }>(
      `INSERT INTO vendor_users (
        id, vendor_id, email, password_hash, full_name, is_primary_contact, status,
        email_verified_at, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, true, 'ACTIVE',
        now(), now(), now()
      )
      RETURNING id`,
      [vendorId, args.email, await bcrypt.hash(args.password, 12), args.contactName],
    );
    return { vendorId, vendorUserId: userRow.rows[0].id, password: args.password };
  });
}

/**
 * Create a tender that has ALREADY passed its submission deadline. Used by
 * the late-submission spec.
 */
export async function ensurePastDeadlineTender(args: {
  reference: string;
  title: string;
  adminUserId: string;
  daysOverdue?: number;
}): Promise<string> {
  return withDb(async client => {
    const dept = await client.query<{ id: string }>(`SELECT id FROM departments LIMIT 1`);
    if (dept.rowCount === 0 || !dept.rows[0]) throw new Error('No departments configured');
    const departmentId = dept.rows[0].id;

    const days = args.daysOverdue ?? 1;
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM tenders WHERE reference = $1 LIMIT 1`,
      [args.reference],
    );
    if (existing.rowCount && existing.rows[0]) {
      await client.query(
        `UPDATE tenders SET status = 'PUBLISHED', submission_close_at = now() - ($2::int * interval '1 day') WHERE id = $1`,
        [existing.rows[0].id, days],
      );
      return existing.rows[0].id;
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO tenders (
        id, reference, title, description, department_id, visibility, status,
        submission_close_at, current_version, created_by, owning_user_id,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, 'past-deadline tender for late-submission e2e',
        $3, 'PUBLIC', 'PUBLISHED',
        now() - ($5::int * interval '1 day'), 1, $4, $4,
        now(), now()
      )
      RETURNING id`,
      [args.reference, args.title, departmentId, args.adminUserId, days],
    );
    return inserted.rows[0].id;
  });
}

/**
 * Reset the tender to a clean state — useful when re-running tests.
 */
export async function resetTender(reference: string): Promise<void> {
  await withDb(async client => {
    const r = await client.query<{ id: string }>(
      `SELECT id FROM tenders WHERE reference = $1 LIMIT 1`,
      [reference],
    );
    if (r.rowCount === 0 || !r.rows[0]) return;
    const tenderId = r.rows[0].id;
    await client.query(`DELETE FROM bids WHERE tender_id = $1`, [tenderId]);
    await client.query(`DELETE FROM committee_sessions WHERE tender_id = $1`, [tenderId]);
    await client.query(`DELETE FROM tender_clarifications WHERE tender_id = $1`, [tenderId]);
    await client.query(
      `UPDATE tenders SET status = 'PUBLISHED', submission_close_at = now() + interval '30 days', awarded_at = NULL, awarded_vendor_id = NULL WHERE id = $1`,
      [tenderId],
    );
  });
}

/**
 * Wipe vendor + linked records so the registration test can replay the email.
 */
export async function resetVendorByEmail(email: string): Promise<void> {
  await withDb(async client => {
    const r = await client.query<{ vendor_id: string }>(
      `SELECT vendor_id FROM vendor_users WHERE email = $1 LIMIT 1`,
      [email],
    );
    if (r.rowCount === 0 || !r.rows[0]) return;
    const vendorId = r.rows[0].vendor_id;
    await client.query(`DELETE FROM bids WHERE vendor_id = $1`, [vendorId]);
    await client.query(`DELETE FROM vendor_users WHERE vendor_id = $1`, [vendorId]);
    await client.query(`DELETE FROM vendor_registration_requests WHERE vendor_id = $1`, [vendorId]);
    await client.query(`DELETE FROM vendors WHERE id = $1`, [vendorId]);
  });
}
