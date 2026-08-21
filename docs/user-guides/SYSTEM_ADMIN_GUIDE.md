# System Administrator's Guide — Configuring the Platform

**Audience:** System Administrator (IT)
**System:** HADICLINIC Tendering System — Admin Portal — **https://ctmp.hadiclinic.com.kw:4202**
**What this covers:** managing users, departments, roles & permissions, email templates, branding, SMTP, Active Directory, and security settings.

> Save as PDF: open in a Markdown viewer → "Print → Save as PDF". For server/deployment matters see `docs/runbooks/PRODUCTION_OPERATIONS.md`.

---

## Where to go

Everything is under **System Configuration** (left menu) → page title **"Platform Settings & Control"**, with tabs:

```
[ Roles & Permissions ] [ Users ] [ Departments ] [ Notification Templates ] [ Platform Settings ]
```

---

## 1. Users

Tab **Users** → **+ New User**.

```
Create User
  Display Name *  [ ............ ]      Email *      [ ............ ]
  Auth Type       [ Active Directory ▾ ] (immutable after creation)
  AD Username     [ jsmith ]            (shows only for AD)
  Password        [ ........ ]          (shows only for Local; min 8 chars)
  Role            [ Procurement Admin ▾ ]
  Departments     [✓] Procurement (primary ◉)  [ ] Finance  [ ] IT
                       [ Cancel ]   [ Save ]
```
- **Auth Type:**
  - **Active Directory** — enter the user's **bare AD username** (e.g. `jsmith`); they log in with their domain password. *(The system appends the domain automatically.)*
  - **Local password** — set a password here.
- **Role** — pick one (e.g. Procurement Admin, Approver, Technical Evaluator, Commercial Committee Member…).
- **Departments** — tick the ones they belong to and mark one **Primary**.
- Edit later from the table (**Edit**); **Disable** removes access (they keep their record). Auth type can't change after creation.

---

## 2. Departments

Tab **Departments** → **+ New Department**.

```
Create Department
  Code *  [ PROC ]  (uppercase, immutable)   Name *  [ Procurement ]
  Parent Department  [ — None (top-level) — ▾ ]
                       [ Cancel ]   [ Save ]
```
- **Code** is permanent once created. Use **Parent Department** for a hierarchy.
- **Disable** hides a department from new selections (existing assignments stay); **Reactivate** brings it back. Tick **Show inactive** to see disabled ones.

---

## 3. Roles & Permissions

Tab **Roles & Permissions**. Pick a role on the left to edit it on the right, or **+ Create Role** (starts with zero permissions).

```
{Role} Permissions
  Hidden sidebar entries        [ Save hide list ]
    [ ] Dashboard  [✓] Reports  [ ] Audit Log  …   (hide menu items for this role)
  Sidebar labels (rename per role)   [ Save labels ]
    /tenders → [ Procurement Cases ]   …
  Permissions (grouped)              [ Save ]
    [✓] tender:view   [✓] tender:edit   [ ] commercial:view   …
```
- **Permissions** — tick what the role can do; **Save**. (Permission changes take effect when the user **next signs in** — tokens carry permissions.)
- **Hidden sidebar entries** — hide menu items for a role without removing the underlying access.
- **Sidebar labels** — rename menu items per role.

> ⚠️ **Separation of duties:** do not grant `commercial:*` to the System Admin role — the platform admin must not see vendor pricing.

---

## 4. Notification Templates

Tab **Notification Templates**. Each email/SMS/in-app template shows **Enabled/Disabled** and an **Edit** link.

```
Edit
  SUBJECT        [ … {{tenderReference}} … ]
  BODY TEMPLATE  [ HTML body with {{variables}} … ]
  [✓] Enabled                         [ Cancel ]  [ Save ]
```
- Keep the `{{variables}}` (e.g. `{{vendorName}}`, `{{tenderReference}}`, `{{tenderUrl}}`) — they're filled in at send time.
- Emails are sent as **branded HTML** (logo header, vendor logo under the signature). See the **ctmp-email** technical notes for the shell/logo details.

---

## 5. Platform Settings

Tab **Platform Settings** — several sections, each with its own **Save**:

**General** — System Name, Vendor Portal Name.

**Branding · Logos** — upload **Admin Portal Logo**, **Vendor Portal Logo**, **Report Header Logo** (PNG/JPG/SVG/WebP). *Note: emails use the admin (raster) logo; if you upload a new vendor logo, re-run the email logo rasteriser (IT task) so emails pick it up.*

**Email (SMTP)** — Host, Port (587 STARTTLS / 465 TLS), Username, From Address, Password (encrypted). Use **Test SMTP → Send Test** to verify.
```
Email (SMTP):  Host [ mail.hadiclinic.com.kw ]  Port [ 587 ]  Username [ noreply ]
               From [ noreply@hadiclinic.com.kw ]  Password [ •••• ] [ Set ]
Test SMTP:     [ recipient@example.com ]  [ Send Test ]
```

**Active Directory** — LDAP URL, Domain, optional service-account password. Use **Test AD Bind → Probe**.
```
Active Directory:  LDAP URL [ ldap://10.1.14.20:389 ]   Domain [ hadiclinic.com.kw ]
Test AD Bind:      Username [ netsrv ]  Password [ •••• ]  [ Probe ]
```
> ⚠️ In the **Probe**, enter the **bare username** (`netsrv`), NOT `netsrv@hadiclinic.com.kw` — the system appends the domain. A doubled domain causes LDAP error **`data 52e`**.

**Vendor Portal** — CAPTCHA Enabled, Minimum Password Length.

**Security & Audit** — Session Idle Timeout (minutes), Audit Retention (days, default ~2555 = 7 years), Late-submission-after-technical-opening (Allowed/Blocked).

**Uploads** — Maximum File Size (bytes, default 50 MB).

---

## Things only IT (server side) handles

These are **not** in the UI — see `docs/runbooks/PRODUCTION_OPERATIONS.md` + the `ctmp-*` skills:
- Deploying/rebuilding the app across the two servers (air-gapped admin + DMZ vendor).
- TLS certificate (DigiCert wildcard), DNS/NAT.
- `SETTINGS_ENCRYPTION_KEY` (protects SMTP/AD passwords) and its rotation.
- hCaptcha egress allowance (the API must reach hcaptcha.com to verify registrations).
- Database backups, migrations, syncing role/permission/department data dev→prod.

---

## Notes

- All admin actions are **audit-logged** (Audit Log + Security Alerts in the menu).
- Sensitive settings (SMTP/AD passwords) are **encrypted at rest**.
- After changing a role's permissions, affected users must **sign out and back in**.

*Server/infrastructure questions: see the operations runbook or the IT deployment notes.*
