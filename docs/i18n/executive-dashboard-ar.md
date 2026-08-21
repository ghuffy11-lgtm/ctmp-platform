# Arabic Management Dashboard — translation glossary

**Page:** `https://ctmp.hadiclinic.com.kw:4202/executive-ar` (dev: `https://ctmp-admin.hadiclinic.com.kw:4202/executive-ar`)
**Source of truth:** `apps/web-admin/src/components/executive/labels.ts` → `EXECUTIVE_LABELS_AR`
**Status:** Claude's draft, live on dev, **awaiting the owner's review**

Mark anything that reads wrong and it changes in one file, then a web-admin rebuild.
**Do not** translate tender titles, department names or vendor names — those are user data and render
exactly as entered.

Numbers, currency and dates stay **Western digits, Gregorian, left-to-right** inside the Arabic
layout, so the Arabic view can be reconciled against the English screens and the XLSX/PDF exports.
Figures embedded in Arabic sentences are wrapped in LEFT-TO-RIGHT MARKs (`‎`) so "0.0%" does not
render as "%0.0".

## Page header

| English | Arabic | Where |
|---|---|---|
| Executive Dashboard | لوحة معلومات الإدارة | page title |
| Financial & operational summary across procurement. Year-to-date as of … | ملخّص مالي وتشغيلي للمشتريات. حتى تاريخ … | subtitle |
| Year | السنة | year selector |
| Print | طباعة | button |
| Print or save as PDF | طباعة أو حفظ بصيغة PDF | button tooltip |
| — | نظام المناقصات / بوابة الإدارة | header brand + strapline |

## KPI cards

| English | Arabic |
|---|---|
| Tenders Created | المناقصات المُنشأة |
| Estimated Value | القيمة التقديرية |
| Awarded Value | قيمة الترسية |
| Realised Savings | الوفورات المحققة |
| Savings Rate | نسبة الوفورات |
| Negotiation Savings | وفورات التفاوض |
| Active Pipeline | المناقصات الجارية |
| Avg Days to Award | متوسط أيام الترسية |
| Awarded Tenders | المناقصات المُرساة |
| (all years) | (كل السنوات) |
| vs {year} | مقارنة بعام {year} |
| {n} awards · avg {pct} | {n} ترسية · بمتوسط {pct} |
| Awarded {x} of {y} KWD budgeted | تم ترسية {x} من أصل {y} د.ك مُدرجة بالموازنة |
| KWD | د.ك |
| {n}d (KPI tile) | {n} يوم |

## Monthly trend

| English | Arabic |
|---|---|
| Monthly Trend — {year} | الاتجاه الشهري — {year} |
| Estimated value (blue) vs Awarded value (emerald), per month. | القيمة التقديرية (أزرق) مقابل قيمة الترسية (أخضر)، لكل شهر. |
| Estimated | تقديرية |
| Awarded | مُرساة |
| Jan–Dec | يناير · فبراير · مارس · أبريل · مايو · يونيو · يوليو · أغسطس · سبتمبر · أكتوبر · نوفمبر · ديسمبر |

## Breakdowns

| English | Arabic |
|---|---|
| By Department | حسب الإدارة |
| Estimated + Awarded value per department | القيمة التقديرية والمُرساة لكل إدارة |
| By Category | حسب الفئة |
| Procurement spend by tender category | إنفاق المشتريات حسب فئة المناقصة |
| {n} tenders | {n} مناقصة |
| Est | تقديرية |
| Awd | مُرساة |
| No data for the selected year. | لا توجد بيانات للسنة المحددة. |

## Top vendors

| English | Arabic |
|---|---|
| Top Vendors by Award Value | أعلى الموردين من حيث قيمة الترسية |
| Ranked by total awarded amount in {year}. | مرتبة حسب إجمالي قيمة الترسية في {year}. |
| Concentration | التركّز |
| Top 3: {pct} | أعلى 3: {pct} |
| Top 5: {pct} · Active: {n} | أعلى 5: {pct} · الموردون النشطون: {n} |
| Vendor | المورد |
| Awards | عدد الترسيات |
| Total (KWD) | الإجمالي (د.ك) |
| Share | الحصة |
| No awards in {year} yet. | لا توجد ترسيات في {year} حتى الآن. |

## Pipeline and cycle time

| English | Arabic |
|---|---|
| Active Pipeline | المناقصات الجارية |
| All in-flight tenders, by status. | جميع المناقصات قيد التنفيذ، حسب الحالة. |
| No active tenders. | لا توجد مناقصات جارية. |
| Avg Cycle (Created → Awarded) | متوسط الدورة (الإنشاء ← الترسية) |
| Avg Cycle (Submission Closed → Awarded) | متوسط الدورة (إغلاق التقديم ← الترسية) |
| Sample Size | حجم العينة |
| {n} days | {n} يوم |
| {n} awarded | {n} مناقصة مُرساة |

## Tender statuses

The English page prints these as raw database enums (`INTERNAL_REVIEW`). The Arabic page maps them
to real words — so on this point the Arabic view reads better than the English one.

| Enum | Arabic |
|---|---|
| DRAFT | مسودة |
| INTERNAL_REVIEW | مراجعة داخلية |
| APPROVED | معتمدة |
| PUBLISHED | منشورة |
| CLARIFICATION_PERIOD | فترة الاستفسارات |
| SUBMISSION_CLOSED | إغلاق التقديم |
| TECHNICAL_OPENING | فتح المظاريف الفنية |
| TECHNICAL_EVALUATION | التقييم الفني |
| COMMERCIAL_SEALED | المظاريف المالية مختومة |
| COMMITTEE_COMMERCIAL_OPENING | فتح المظاريف المالية باللجنة |
| COMMERCIAL_EVALUATION | التقييم والمقارنة المالية |
| NEGOTIATION | التفاوض |
| AWARD_RECOMMENDATION | توصية الترسية |
| AWARDED | مُرساة |
| TENDER_CLOSED | مناقصة مغلقة |
| CANCELLED | ملغاة |
| SUSPENDED | موقوفة |
| ARCHIVED | مؤرشفة |

## System messages

| English | Arabic |
|---|---|
| Loading executive summary… | جارٍ تحميل ملخّص الإدارة… |
| Failed to load summary | تعذّر تحميل الملخّص |
| This page is available to management only. | هذه الصفحة متاحة للإدارة فقط. |
| You do not have permission … return to the portal | لا تملك الصلاحية اللازمة لعرض لوحة معلومات الإدارة. يمكنك العودة إلى البوابة الرئيسية. |
| Back to the portal | العودة إلى البوابة |

## Terms worth a second opinion

These are the ones where house usage matters more than the dictionary:

- **ترسية** — award / awarding
- **مناقصة** — tender
- **مظاريف** — envelopes (technical / commercial)
- **التركّز** — vendor concentration
- **الوفورات المحققة** — realised savings
- **حجم العينة** — sample size

---

# Detail pages (added 2026-08-19)

`/executive-ar/departments/[id]` and `/executive-ar/vendors/[id]` — the drill-downs
reached by clicking a department or a vendor. Same review rule as above: change any
wording you don't like and it will be applied.

## Department profile

| English | Arabic |
|---|---|
| Back to directory | العودة إلى الدليل |
| Scope | النطاق |
| All time | كل الفترات |
| Tenders Created | المناقصات المُنشأة |
| Estimated Value | القيمة التقديرية |
| Awarded Value | قيمة الترسية |
| Realised Savings | الوفورات المحققة |
| Active Pipeline | المناقصات الجارية |
| Distinct Vendors | عدد الموردين |
| Overview / Tenders / Spend Trend / Vendors | نظرة عامة / المناقصات / اتجاه الإنفاق / الموردون |
| Year over year (all time) | مقارنة سنوية (كل الفترات) |
| By category (current scope) | حسب الفئة (النطاق الحالي) |
| Reference / Title / Status / Category | الرقم المرجعي / العنوان / الحالة / الفئة |
| Winner | الفائز |
| Created | تاريخ الإنشاء |
| Awarded (KWD) / Estimated (KWD) | المُرساة (د.ك) / التقديرية (د.ك) |
| Awarded X of Y KWD budgeted | تم ترسية ‎X‎ من أصل ‎Y‎ د.ك مُدرجة بالموازنة |
| No tenders for this scope. | لا توجد مناقصات في هذا النطاق. |
| No vendors have been awarded in this scope. | لم تتم ترسية أي مورد في هذا النطاق. |

## Vendor profile

| English | Arabic |
|---|---|
| Lifetime Awards | إجمالي الترسيات |
| Lifetime Value | إجمالي القيمة |
| Average Award Size | متوسط قيمة الترسية |
| Bids Submitted | العروض المقدّمة |
| Win Rate | نسبة الفوز |
| Technical Pass Rate | نسبة النجاح الفني |
| Award History / Participation | سجل الترسيات / المشاركات |
| Registration # / Tax # / Country | رقم السجل / الرقم الضريبي / الدولة |
| Phone / Website / Registered | الهاتف / الموقع الإلكتروني / تاريخ التسجيل |
| Primary Contact / Contact Phone | جهة الاتصال الرئيسية / هاتف جهة الاتصال |
| Awarded (date column) | تاريخ الترسية |
| Submitted (date column) | تاريخ التقديم |
| Amount (KWD) / Commercial (KWD) | المبلغ (د.ك) / العرض المالي (د.ك) |
| By Department / By Category | حسب الإدارة / حسب الفئة |
| 3 awards | ‎3‎ ترسية |

## Two open wording questions

1. **"3 awards" → "‎3‎ ترسية".** Grammatically Arabic would prefer
   `ترسية واحدة` (1), `ترسيتان` (2), `‎3‎ ترسيات` (3–10), `‎11‎ ترسية` (11+).
   The dashboard already uses the single invariant form, so the detail pages match it
   rather than introduce a second style. Say the word and both switch to the
   grammatical forms together.

2. **Award status "Active" → "نشط".** The word is shared with tender status, where
   نشط is right. For an award, `سارية` ("in force") reads better. Splitting them is a
   small change if you want it.

## Not translated (by design)

Tender titles, vendor contact names, e-mail addresses, websites and tender reference
numbers stay exactly as entered — they are data, not interface text.


---

## Month names (added 2026-08-21)

Dates in the Arabic screens now use Gulf month names, matching the dashboard's monthly-trend chart:

| English | Arabic |
|---|---|
| Jan / Feb / Mar / Apr | يناير / فبراير / مارس / أبريل |
| May / Jun / Jul / Aug | مايو / يونيو / يوليو / أغسطس |
| Sept / Oct / Nov / Dec | سبتمبر / أكتوبر / نوفمبر / ديسمبر |

Dates read day-month-year, e.g. **‎21 مايو 2026‎**. The year stays Gregorian and the digits stay
Western, per the original decision.

If you would rather use the Levantine names (كانون الثاني، شباط، آذار …) say so — it is a one-line
change in `labels.ts`, applied to every Arabic screen at once.
