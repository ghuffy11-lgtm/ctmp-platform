// Executive Dashboard label sets (2026-08-13).
//
// The dashboard renders twice from ONE component: English at /executive and
// Arabic (RTL) at /executive-ar. Everything a user reads lives here, so a
// wording change is a single edit rather than a hunt through JSX.
//
// The Arabic below is Claude's draft, pending the owner's review. Procurement
// vocabulary is house style, not dictionary style:
//   ترسية = award · مناقصة = tender · مظاريف = envelopes · التركّز = concentration
//
// KPI labels and pipeline statuses arrive from the API as English strings
// ('Tenders Created', 'INTERNAL_REVIEW'), so those maps are keyed by the API
// value. An unmapped key falls back to the raw value rather than blanking out.

export interface ExecutiveLabels {
  pageTitle: string;
  subtitle: (date: string) => string;
  year: string;
  print: string;
  printTitle: string;

  kpi: Record<string, string>;
  kpiAllYears: string;
  vsYear: (year: number) => string;
  awardsAvg: (awards: string, pct: string) => string;
  awardedOfBudget: (awarded: string, budget: string) => string;

  monthlyTrend: (year: number) => string;
  monthlyTrendHint: string;
  estimated: string;
  awarded: string;
  months: string[];

  byDepartment: string;
  byDepartmentHint: string;
  byCategory: string;
  byCategoryHint: string;
  tenderCount: (n: number) => string;
  estShort: string;
  awdShort: string;
  noDataForYear: string;

  topVendors: string;
  topVendorsHint: (year: number) => string;
  concentration: string;
  top3: (pct: string) => string;
  top5Active: (pct: string, count: number) => string;
  colVendor: string;
  colAwards: string;
  colTotal: string;
  colShare: string;
  viewVendorProfile: string;
  noAwardsYet: (year: number) => string;

  activePipeline: string;
  activePipelineHint: string;
  noActiveTenders: string;
  status: Record<string, string>;

  avgCycleCreated: string;
  avgCycleClosed: string;
  sampleSize: string;
  /** KPI tile unit — English is the terse "4d"; the footer uses days() below. */
  daysShort: (n: number) => string;
  days: (n: number) => string;
  awardedCount: (n: number) => string;

  loading: string;
  loadFailed: string;
  currency: string;
}

export const EXECUTIVE_LABELS_EN: ExecutiveLabels = {
  pageTitle: 'Executive Dashboard',
  subtitle: date => `Financial & operational summary across procurement. Year-to-date as of ${date}.`,
  year: 'Year',
  print: 'Print',
  printTitle: 'Print or save as PDF',

  kpi: {
    'Tenders Created': 'Tenders Created',
    'Estimated Value': 'Estimated Value',
    'Awarded Value': 'Awarded Value',
    'Realised Savings': 'Realised Savings',
    'Savings Rate': 'Savings Rate',
    'Negotiation Savings': 'Negotiation Savings',
    'Active Pipeline': 'Active Pipeline',
    'Avg Days to Award': 'Avg Days to Award',
    'Awarded Tenders': 'Awarded Tenders',
  },
  kpiAllYears: '(all years)',
  vsYear: year => `vs ${year}`,
  awardsAvg: (awards, pct) => `${awards} awards · avg ${pct}`,
  awardedOfBudget: (awarded, budget) => `Awarded ${awarded} of ${budget} KWD budgeted`,

  monthlyTrend: year => `Monthly Trend — ${year}`,
  monthlyTrendHint: 'Estimated value (blue) vs Awarded value (emerald), per month.',
  estimated: 'Estimated',
  awarded: 'Awarded',
  // NOTE the four-letter "Sept". These are exactly what
  // toLocaleDateString('en-GB', { month: 'short' }) produced before the labels
  // existed, and a screenshot diff caught the difference — keep them verbatim
  // so the English chart axis is unchanged.
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'],

  byDepartment: 'By Department',
  byDepartmentHint: 'Estimated + Awarded value per department',
  byCategory: 'By Category',
  byCategoryHint: 'Procurement spend by tender category',
  tenderCount: n => `${n} tender${n === 1 ? '' : 's'}`,
  estShort: 'Est',
  awdShort: 'Awd',
  noDataForYear: 'No data for the selected year.',

  topVendors: 'Top Vendors by Award Value',
  topVendorsHint: year => `Ranked by total awarded amount in ${year}.`,
  concentration: 'Concentration',
  top3: pct => `Top 3: ${pct}`,
  top5Active: (pct, count) => `Top 5: ${pct} · Active: ${count}`,
  colVendor: 'Vendor',
  colAwards: 'Awards',
  colTotal: 'Total (KWD)',
  colShare: 'Share',
  viewVendorProfile: 'View vendor profile',
  noAwardsYet: year => `No awards in ${year} yet.`,

  activePipeline: 'Active Pipeline',
  activePipelineHint: 'All in-flight tenders, by status.',
  noActiveTenders: 'No active tenders.',
  status: {},

  avgCycleCreated: 'Avg Cycle (Created → Awarded)',
  avgCycleClosed: 'Avg Cycle (Submission Closed → Awarded)',
  sampleSize: 'Sample Size',
  daysShort: n => `${n}d`,
  days: n => `${n} days`,
  awardedCount: n => `${n} awarded`,

  loading: 'Loading executive summary…',
  loadFailed: 'Failed to load summary',
  currency: 'KWD',
};

export const EXECUTIVE_LABELS_AR: ExecutiveLabels = {
  pageTitle: 'لوحة معلومات الإدارة',
  subtitle: date => `ملخّص مالي وتشغيلي للمشتريات. حتى تاريخ \u200e${date}\u200e.`,
  year: 'السنة',
  print: 'طباعة',
  printTitle: 'طباعة أو حفظ بصيغة PDF',

  kpi: {
    'Tenders Created': 'المناقصات المُنشأة',
    'Estimated Value': 'القيمة التقديرية',
    'Awarded Value': 'قيمة الترسية',
    'Realised Savings': 'الوفورات المحققة',
    'Savings Rate': 'نسبة الوفورات',
    'Negotiation Savings': 'وفورات التفاوض',
    'Active Pipeline': 'المناقصات الجارية',
    'Avg Days to Award': 'متوسط أيام الترسية',
    'Awarded Tenders': 'المناقصات المُرساة',
  },
  kpiAllYears: '(كل السنوات)',
  vsYear: year => `مقارنة بعام \u200e${year}\u200e`,
  awardsAvg: (awards, pct) => `\u200e${awards}\u200e ترسية · بمتوسط \u200e${pct}\u200e`,
  awardedOfBudget: (awarded, budget) => `تم ترسية \u200e${awarded}\u200e من أصل \u200e${budget}\u200e د.ك مُدرجة بالموازنة`,

  monthlyTrend: year => `الاتجاه الشهري — ${year}`,
  monthlyTrendHint: 'القيمة التقديرية (أزرق) مقابل قيمة الترسية (أخضر)، لكل شهر.',
  estimated: 'تقديرية',
  awarded: 'مُرساة',
  months: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],

  byDepartment: 'حسب الإدارة',
  byDepartmentHint: 'القيمة التقديرية والمُرساة لكل إدارة',
  byCategory: 'حسب الفئة',
  byCategoryHint: 'إنفاق المشتريات حسب فئة المناقصة',
  tenderCount: n => `\u200e${n}\u200e مناقصة`,
  estShort: 'تقديرية',
  awdShort: 'مُرساة',
  noDataForYear: 'لا توجد بيانات للسنة المحددة.',

  topVendors: 'أعلى الموردين من حيث قيمة الترسية',
  topVendorsHint: year => `مرتبة حسب إجمالي قيمة الترسية في \u200e${year}\u200e.`,
  concentration: 'التركّز',
  top3: pct => `أعلى 3: \u200e${pct}\u200e`,
  top5Active: (pct, count) => `أعلى 5: \u200e${pct}\u200e · الموردون النشطون: \u200e${count}\u200e`,
  colVendor: 'المورد',
  colAwards: 'عدد الترسيات',
  colTotal: 'الإجمالي (د.ك)',
  colShare: 'الحصة',
  viewVendorProfile: 'عرض ملف المورد',
  noAwardsYet: year => `لا توجد ترسيات في \u200e${year}\u200e حتى الآن.`,

  activePipeline: 'المناقصات الجارية',
  activePipelineHint: 'جميع المناقصات قيد التنفيذ، حسب الحالة.',
  noActiveTenders: 'لا توجد مناقصات جارية.',
  // Pipeline statuses arrive as raw DB enums (PUBLISHED, INTERNAL_REVIEW…).
  // The English page shows them raw; Arabic maps them to real words.
  status: {
    DRAFT: 'مسودة',
    INTERNAL_REVIEW: 'مراجعة داخلية',
    APPROVED: 'معتمدة',
    PUBLISHED: 'منشورة',
    CLARIFICATION_PERIOD: 'فترة الاستفسارات',
    SUBMISSION_CLOSED: 'إغلاق التقديم',
    TECHNICAL_OPENING: 'فتح المظاريف الفنية',
    TECHNICAL_EVALUATION: 'التقييم الفني',
    COMMERCIAL_SEALED: 'المظاريف المالية مختومة',
    COMMITTEE_COMMERCIAL_OPENING: 'فتح المظاريف المالية باللجنة',
    COMMERCIAL_EVALUATION: 'التقييم والمقارنة المالية',
    NEGOTIATION: 'التفاوض',
    AWARD_RECOMMENDATION: 'توصية الترسية',
    AWARDED: 'مُرساة',
    TENDER_CLOSED: 'مناقصة مغلقة',
    CANCELLED: 'ملغاة',
    SUSPENDED: 'موقوفة',
    ARCHIVED: 'مؤرشفة',
  },

  avgCycleCreated: 'متوسط الدورة (الإنشاء ← الترسية)',
  avgCycleClosed: 'متوسط الدورة (إغلاق التقديم ← الترسية)',
  sampleSize: 'حجم العينة',
  daysShort: n => `\u200e${n}\u200e يوم`,
  days: n => `\u200e${n}\u200e يوم`,
  awardedCount: n => `\u200e${n}\u200e مناقصة مُرساة`,

  loading: 'جارٍ تحميل ملخّص الإدارة…',
  loadFailed: 'تعذّر تحميل الملخّص',
  currency: 'د.ك',
};

/** Shown when someone without `executive:dashboard` opens the Arabic page. */
export const AR_RESTRICTED = {
  title: 'هذه الصفحة متاحة للإدارة فقط.',
  body: 'لا تملك الصلاحية اللازمة لعرض لوحة معلومات الإدارة. يمكنك العودة إلى البوابة الرئيسية.',
  back: 'العودة إلى البوابة',
};

/** Department Overview (/executive/departments, /executive-ar/departments). */
export interface DeptOverviewLabels {
  title: string;
  hint: string;
  totals: string;
  deptsActive: string;
  totalEstimated: string;
  totalAwarded: string;
  realisedSavings: string;
  colDepartment: string;
  colTenders: string;
  colEstimated: string;
  colAwarded: string;
  colSavingsPct: string;
  openProfile: string;
  profileHrefBase: string;
  loading: string;
  loadFailed: string;
  // Added after the first Arabic render showed these still in English.
  subtitle: (date: string) => string;
  year: string;
  print: string;
  comparison: (year: number) => string;
  comparisonHint: string;
  allDepartments: (year: number) => string;
  estimated: string;
  awarded: string;
  estShort: string;
  awdShort: string;
  awardsCount: (n: number) => string;
  tendersCreated: (n: number) => string;
  tendersCount: (n: number) => string;
  awardedOfBudget: (a: string, b: string) => string;
  currency: string;
}

/** Vendor Directory (/executive/vendors, /executive-ar/vendors). */
export interface VendorDirLabels {
  title: string;
  backToDashboard: string;
  search: string;
  searchPlaceholder: string;
  status: string;
  awardYear: string;
  allYears: string;
  allStatuses: string;
  totalApproved: string;
  withAwards: string;
  lifetimeSpend: string;
  top5Concentration: string;
  colCompany: string;
  colAwards: string;
  colTotal: string;
  colLastAward: string;
  colWinRate: string;
  viewProfile: string;
  profileHrefBase: string;
  noMatches: string;
  previous: string;
  next: string;
  loading: string;
  loadFailed: string;
  /**
   * Gregorian month names for date cells. `null` in English, where dates keep
   * going through toLocaleDateString('en-GB') so the output cannot drift.
   * Arabic uses the Gulf month names — the same set the dashboard's monthly
   * trend already uses, so the two screens agree.
   */
  months: string[] | null;
  /** A date, LRM-wrapped in Arabic so bidi cannot reorder "21 مايو 2026". */
  date: (v: string) => string;
  statusLabels: Record<string, string>;
  // Added after the first Arabic render showed these still in English.
  subtitle: string;
  vendorCount: (n: number) => string;
  pageOf: (page: number, total: number) => string;
  currency: string;
  dashboardHref: string;
}

export const DEPT_OVERVIEW_EN: DeptOverviewLabels = {
  title: 'Department Directory',
  hint: 'Click a row to open the department profile.',
  totals: 'Totals',
  deptsActive: 'Departments Active',
  totalEstimated: 'Total Estimated',
  totalAwarded: 'Total Awarded',
  realisedSavings: 'Realised Savings',
  colDepartment: 'Department',
  colTenders: 'Tenders',
  colEstimated: 'Estimated (KWD)',
  colAwarded: 'Awarded (KWD)',
  colSavingsPct: 'Savings %',
  openProfile: 'Open department profile',
  profileHrefBase: '/executive/departments',
  loading: 'Loading department overview…',
  loadFailed: 'Failed to load department overview',
  subtitle: date => `Per-department procurement activity. Click any row for the full department profile. Year-to-date as of ${date}.`,
  year: 'Year',
  print: 'Print',
  comparison: year => `Department comparison — ${year}`,
  comparisonHint: 'Estimated value (lighter) vs Awarded value (darker), side by side. Click a row to drill into the department.',
  allDepartments: year => `All departments — ${year}`,
  estimated: 'Estimated',
  awarded: 'Awarded',
  estShort: 'Est',
  awdShort: 'Awd',
  awardsCount: n => `${n} award${n === 1 ? '' : 's'}`,
  tendersCreated: n => `${n} tender${n === 1 ? '' : 's'} created`,
  tendersCount: n => `${n} tender${n === 1 ? '' : 's'}`,
  awardedOfBudget: (a, b) => `Awarded ${a} of ${b} KWD budgeted`,
  currency: 'KWD',
};

export const DEPT_OVERVIEW_AR: DeptOverviewLabels = {
  title: 'دليل الإدارات',
  hint: 'اضغط على أي صف لعرض ملف الإدارة.',
  totals: 'الإجماليات',
  deptsActive: 'الإدارات النشطة',
  totalEstimated: 'إجمالي القيمة التقديرية',
  totalAwarded: 'إجمالي قيمة الترسية',
  realisedSavings: 'الوفورات المحققة',
  colDepartment: 'الإدارة',
  colTenders: 'المناقصات',
  colEstimated: 'التقديرية (د.ك)',
  colAwarded: 'المُرساة (د.ك)',
  colSavingsPct: 'نسبة الوفورات',
  openProfile: 'عرض ملف الإدارة',
  profileHrefBase: '/executive-ar/departments',
  loading: 'جارٍ تحميل بيانات الإدارات…',
  loadFailed: 'تعذّر تحميل بيانات الإدارات',
  subtitle: date => `نشاط المشتريات لكل إدارة. حتى تاريخ \u200e${date}\u200e.`,
  year: 'السنة',
  print: 'طباعة',
  comparison: year => `مقارنة الإدارات — \u200e${year}\u200e`,
  comparisonHint: 'القيمة التقديرية (فاتح) مقابل قيمة الترسية (غامق)، جنبًا إلى جنب.',
  allDepartments: year => `جميع الإدارات — \u200e${year}\u200e`,
  estimated: 'تقديرية',
  awarded: 'مُرساة',
  estShort: 'تقديرية',
  awdShort: 'مُرساة',
  awardsCount: n => `\u200e${n}\u200e ترسية`,
  tendersCreated: n => `\u200e${n}\u200e مناقصة مُنشأة`,
  tendersCount: n => `\u200e${n}\u200e مناقصة`,
  awardedOfBudget: (a, b) => `تم ترسية \u200e${a}\u200e من أصل \u200e${b}\u200e د.ك مُدرجة بالموازنة`,
  currency: 'د.ك',
};

export const VENDOR_DIR_EN: VendorDirLabels = {
  title: 'Vendor Directory',
  backToDashboard: 'Executive Dashboard',
  search: 'Search',
  searchPlaceholder: 'Company name, registration #, tax #',
  status: 'Status',
  awardYear: 'Award Year',
  allYears: 'All years',
  allStatuses: 'All statuses',
  totalApproved: 'Total Approved Vendors',
  withAwards: 'Vendors with Awards',
  lifetimeSpend: 'Lifetime Spend',
  top5Concentration: 'Top 5 Concentration',
  colCompany: 'Company',
  colAwards: 'Awards',
  colTotal: 'Total (KWD)',
  colLastAward: 'Last Award',
  colWinRate: 'Win Rate',
  viewProfile: 'View profile',
  profileHrefBase: '/executive/vendors',
  noMatches: 'No vendors match the current filters.',
  previous: 'Previous',
  next: 'Next',
  loading: 'Loading vendor directory…',
  loadFailed: 'Failed to load vendor directory',
  months: null,
  date: v => v,
  statusLabels: {},
  subtitle: 'Executive view — every vendor with award history, lifetime spend, and win rate. Click any row for the full profile.',
  vendorCount: n => `${n} vendor${n === 1 ? '' : 's'}`,
  pageOf: (page, total) => `Page ${page} of ${total}`,
  currency: 'KWD',
  dashboardHref: '/executive',
};

export const VENDOR_DIR_AR: VendorDirLabels = {
  title: 'دليل الموردين',
  backToDashboard: 'لوحة معلومات الإدارة',
  search: 'بحث',
  searchPlaceholder: 'اسم الشركة أو رقم السجل أو الرقم الضريبي',
  status: 'الحالة',
  awardYear: 'سنة الترسية',
  allYears: 'كل السنوات',
  allStatuses: 'كل الحالات',
  totalApproved: 'الموردون المعتمدون',
  withAwards: 'موردون لديهم ترسيات',
  lifetimeSpend: 'إجمالي الإنفاق',
  top5Concentration: 'تركّز أعلى 5 موردين',
  colCompany: 'الشركة',
  colAwards: 'عدد الترسيات',
  colTotal: 'الإجمالي (د.ك)',
  colLastAward: 'آخر ترسية',
  colWinRate: 'نسبة الفوز',
  viewProfile: 'عرض ملف المورد',
  profileHrefBase: '/executive-ar/vendors',
  noMatches: 'لا يوجد موردون مطابقون للفلاتر الحالية.',
  previous: 'السابق',
  next: 'التالي',
  loading: 'جارٍ تحميل دليل الموردين…',
  loadFailed: 'تعذّر تحميل دليل الموردين',
  months: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  date: v => `‎${v}‎`,
  statusLabels: {
    APPROVED: 'معتمد',
    PENDING: 'قيد المراجعة',
    INTERNAL_REVIEW: 'مراجعة داخلية',
    SUSPENDED: 'موقوف',
    BLACKLISTED: 'محظور',
    CANCELLED: 'ملغى',
    REJECTED: 'مرفوض',
  },
  subtitle: 'عرض إداري — جميع الموردين مع سجل الترسيات وإجمالي الإنفاق ونسبة الفوز.',
  vendorCount: n => `\u200e${n}\u200e مورد`,
  pageOf: (page, total) => `صفحة \u200e${page}\u200e من \u200e${total}\u200e`,
  currency: 'د.ك',
  dashboardHref: '/executive-ar',
};

// ─── Department profile (/executive/departments/[id], /executive-ar/…) ───────
export interface DeptProfileLabels {
  backToDirectory: string;
  loading: string;
  loadFailed: string;
  overview: string;
  scope: string;
  allTime: string;
  yearScope: (year: number) => string;
  tendersCreated: string;
  estimatedValue: string;
  awardedValue: string;
  realisedSavings: string;
  activePipeline: string;
  distinctVendors: string;
  spendTrend: string;
  yearOverYear: string;
  byCategory: string;
  tenders: string;
  vendors: string;
  category: string;
  reference: string;
  title: string;
  status: string;
  created: string;
  winner: string;
  colAwardedKwd: string;
  colEstimatedKwd: string;
  active: string;
  awarded: string;
  awardedValueShort: string;
  estAwd: (est: string, awd: string) => string;
  awardedOfBudget: (a: string, b: string) => string;
  allYearsSuffix: (v: string) => string;
  noHistory: string;
  noTenderActivity: string;
  noTenders: string;
  noVendorsAwarded: string;
  /** A figure with its currency, LRM-wrapped in Arabic so the digits stay LTR. */
  /** A date, LRM-wrapped in Arabic — otherwise bidi reorders "29 May 2026" to "May 2026 29". */
  /**
   * Gregorian month names for date cells. `null` in English, where dates keep
   * going through toLocaleDateString('en-GB') so the output cannot drift.
   * Arabic uses the Gulf month names — the same set the dashboard's monthly
   * trend already uses, so the two screens agree.
   */
  months: string[] | null;
  date: (v: string) => string;
  /** "3 awards" — pluralised in English, dual/plural-safe wording in Arabic. */
  awardsCount: (n: number) => string;
  /** Where the winner links point — keeps an Arabic page inside /executive-ar. */
  /** The department directory this profile belongs to. */
  /**
   * Tender statuses arrive as raw DB enums. English shows them as-is (the badge
   * has always looked that way); Arabic maps them to words. Named
   * `tenderStatus` because `status` is already the column header.
   */
  tenderStatus: Record<string, string>;
  directoryHref: string;
  vendorHrefBase: string;
  amount: (v: string) => string;
  currency: string;
}

export const DEPT_PROFILE_EN: DeptProfileLabels = {
  backToDirectory: 'Back to directory',
  loading: 'Loading department profile…',
  loadFailed: 'Failed to load department profile',
  overview: 'Overview',
  scope: 'Scope',
  allTime: 'All time',
  yearScope: y => `Year ${y}`,
  tendersCreated: 'Tenders Created',
  estimatedValue: 'Estimated Value',
  awardedValue: 'Awarded Value',
  realisedSavings: 'Realised Savings',
  activePipeline: 'Active Pipeline',
  distinctVendors: 'Distinct Vendors',
  spendTrend: 'Spend Trend',
  yearOverYear: 'Year over year (all time)',
  byCategory: 'By category (current scope)',
  tenders: 'Tenders',
  vendors: 'Vendors',
  category: 'Category',
  reference: 'Reference',
  title: 'Title',
  status: 'Status',
  created: 'Created',
  winner: 'Winner',
  colAwardedKwd: 'Awarded (KWD)',
  colEstimatedKwd: 'Estimated (KWD)',
  active: 'Active',
  awarded: 'Awarded',
  awardedValueShort: 'awarded value',
  estAwd: (est, awd) => `Est: ${est} · Awd: ${awd}`,
  awardedOfBudget: (a, b) => `Awarded ${a} of ${b} KWD budgeted`,
  allYearsSuffix: v => `${v} KWD (all years)`,
  noHistory: 'No history yet.',
  noTenderActivity: 'No tender activity for this scope.',
  noTenders: 'No tenders for this scope.',
  noVendorsAwarded: 'No vendors have been awarded in this scope.',
  months: null,
  date: v => v,
  awardsCount: n => `${n} award${n === 1 ? '' : 's'}`,
  tenderStatus: {},
  directoryHref: '/executive/departments',
  vendorHrefBase: '/executive/vendors',
  amount: v => `${v} KWD`,
  currency: 'KWD',
};

export const DEPT_PROFILE_AR: DeptProfileLabels = {
  backToDirectory: 'العودة إلى الدليل',
  loading: 'جارٍ تحميل ملف الإدارة…',
  loadFailed: 'تعذّر تحميل ملف الإدارة',
  overview: 'نظرة عامة',
  scope: 'النطاق',
  allTime: 'كل الفترات',
  yearScope: y => `سنة ‎${y}‎`,
  tendersCreated: 'المناقصات المُنشأة',
  estimatedValue: 'القيمة التقديرية',
  awardedValue: 'قيمة الترسية',
  realisedSavings: 'الوفورات المحققة',
  activePipeline: 'المناقصات الجارية',
  distinctVendors: 'عدد الموردين',
  spendTrend: 'اتجاه الإنفاق',
  yearOverYear: 'مقارنة سنوية (كل الفترات)',
  byCategory: 'حسب الفئة (النطاق الحالي)',
  tenders: 'المناقصات',
  vendors: 'الموردون',
  category: 'الفئة',
  reference: 'الرقم المرجعي',
  title: 'العنوان',
  status: 'الحالة',
  created: 'تاريخ الإنشاء',
  winner: 'الفائز',
  colAwardedKwd: 'المُرساة (د.ك)',
  colEstimatedKwd: 'التقديرية (د.ك)',
  active: 'جارية',
  awarded: 'مُرساة',
  awardedValueShort: 'قيمة الترسية',
  estAwd: (est, awd) => `تقديرية: ‎${est}‎ · مُرساة: ‎${awd}‎`,
  awardedOfBudget: (a, b) => `تم ترسية ‎${a}‎ من أصل ‎${b}‎ د.ك مُدرجة بالموازنة`,
  allYearsSuffix: v => `‎${v}‎ د.ك (كل السنوات)`,
  noHistory: 'لا يوجد سجل حتى الآن.',
  noTenderActivity: 'لا يوجد نشاط مناقصات في هذا النطاق.',
  noTenders: 'لا توجد مناقصات في هذا النطاق.',
  noVendorsAwarded: 'لم تتم ترسية أي مورد في هذا النطاق.',
  months: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  date: v => `‎${v}‎`,
  awardsCount: n => `‎${n}‎ ترسية`,
  tenderStatus: {
    DRAFT: 'مسودة',
    INTERNAL_REVIEW: 'مراجعة داخلية',
    APPROVED: 'معتمدة',
    PUBLISHED: 'منشورة',
    CLARIFICATION_PERIOD: 'فترة الاستفسارات',
    SUBMISSION_CLOSED: 'إغلاق التقديم',
    TECHNICAL_OPENING: 'فتح المظاريف الفنية',
    TECHNICAL_EVALUATION: 'التقييم الفني',
    COMMERCIAL_SEALED: 'المظاريف المالية مختومة',
    COMMITTEE_COMMERCIAL_OPENING: 'فتح المظاريف المالية باللجنة',
    COMMERCIAL_EVALUATION: 'التقييم والمقارنة المالية',
    NEGOTIATION: 'التفاوض',
    AWARD_RECOMMENDATION: 'توصية الترسية',
    AWARDED: 'مُرساة',
    TENDER_CLOSED: 'مناقصة مغلقة',
    CANCELLED: 'ملغاة',
    SUSPENDED: 'موقوفة',
    ARCHIVED: 'مؤرشفة',
  },
  directoryHref: '/executive-ar/departments',
  vendorHrefBase: '/executive-ar/vendors',
  amount: v => `‎${v}‎ د.ك`,
  currency: 'د.ك',
};

// ─── Vendor profile (/executive/vendors/[id], /executive-ar/vendors/[id]) ────
export interface VendorProfileLabels {
  backToDirectory: string;
  loading: string;
  loadFailed: string;
  overview: string;
  lifetimeAwards: string;
  lifetimeValue: string;
  averageAwardSize: string;
  bidsSubmitted: string;
  winRate: string;
  technicalPassRate: string;
  awardHistory: string;
  participation: string;
  spendTrend: string;
  yearOverYear: string;
  /** Date columns — distinct from the `awarded` outcome value, which reads differently in Arabic. */
  awardedDate: string;
  submittedDate: string;
  byDepartment: string;
  byCategory: string;
  primaryContact: string;
  registrationNo: string;
  taxNo: string;
  country: string;
  phone: string;
  website: string;
  registered: string;
  contactPhone: string;
  blacklistReason: string;
  suspensionReason: string;
  reference: string;
  title: string;
  department: string;
  category: string;
  amountKwd: string;
  commercialKwd: string;
  technical: string;
  outcome: string;
  status: string;
  awarded: string;
  totalSuffix: (total: string) => string;
  noAwardHistory: string;
  noAwards: string;
  noBidHistory: string;
  noData: string;
  /** A figure with its currency, LRM-wrapped in Arabic so the digits stay LTR. */
  /** A date, LRM-wrapped in Arabic — otherwise bidi reorders "29 May 2026" to "May 2026 29". */
  /**
   * Gregorian month names for date cells. `null` in English, where dates keep
   * going through toLocaleDateString('en-GB') so the output cannot drift.
   * Arabic uses the Gulf month names — the same set the dashboard's monthly
   * trend already uses, so the two screens agree.
   */
  months: string[] | null;
  date: (v: string) => string;
  /** "3 awards" — pluralised in English, dual/plural-safe wording in Arabic. */
  awardsCount: (n: number) => string;
  amount: (v: string) => string;
  currency: string;
  directoryHref: string;
  /** Bid + vendor + award statuses, keyed by the English text the API returns. */
  statusLabels: Record<string, string>;
}

export const VENDOR_PROFILE_EN: VendorProfileLabels = {
  backToDirectory: 'Back to directory',
  loading: 'Loading vendor profile…',
  loadFailed: 'Failed to load vendor profile',
  overview: 'Overview',
  lifetimeAwards: 'Lifetime Awards',
  lifetimeValue: 'Lifetime Value',
  averageAwardSize: 'Average Award Size',
  bidsSubmitted: 'Bids Submitted',
  winRate: 'Win Rate',
  technicalPassRate: 'Technical PASS Rate',
  awardHistory: 'Award History',
  participation: 'Participation',
  spendTrend: 'Spend Trend',
  yearOverYear: 'Year over year',
  awardedDate: 'Awarded',
  submittedDate: 'Submitted',
  byDepartment: 'By Department',
  byCategory: 'By Category',
  primaryContact: 'Primary Contact',
  registrationNo: 'Registration #',
  taxNo: 'Tax #',
  country: 'Country',
  phone: 'Phone',
  website: 'Website',
  registered: 'Registered',
  contactPhone: 'Contact Phone',
  blacklistReason: 'Blacklist reason',
  suspensionReason: 'Suspension reason',
  reference: 'Reference',
  title: 'Title',
  department: 'Department',
  category: 'Category',
  amountKwd: 'Amount (KWD)',
  commercialKwd: 'Commercial (KWD)',
  technical: 'Technical',
  outcome: 'Outcome',
  status: 'Status',
  awarded: 'Awarded',
  totalSuffix: t => `${t} total`,
  noAwardHistory: 'No award history yet.',
  noAwards: 'No awards on record for this vendor.',
  noBidHistory: 'No bid history for this vendor.',
  noData: 'No data.',
  months: null,
  date: v => v,
  awardsCount: n => `${n} award${n === 1 ? '' : 's'}`,
  amount: v => `${v} KWD`,
  currency: 'KWD',
  directoryHref: '/executive/vendors',
  statusLabels: {},
};

export const VENDOR_PROFILE_AR: VendorProfileLabels = {
  backToDirectory: 'العودة إلى الدليل',
  loading: 'جارٍ تحميل ملف المورد…',
  loadFailed: 'تعذّر تحميل ملف المورد',
  overview: 'نظرة عامة',
  lifetimeAwards: 'إجمالي الترسيات',
  lifetimeValue: 'إجمالي القيمة',
  averageAwardSize: 'متوسط قيمة الترسية',
  bidsSubmitted: 'العروض المقدَّمة',
  winRate: 'نسبة الفوز',
  technicalPassRate: 'نسبة النجاح الفني',
  awardHistory: 'سجل الترسيات',
  participation: 'المشاركات',
  spendTrend: 'اتجاه الإنفاق',
  yearOverYear: 'مقارنة سنوية',
  awardedDate: 'تاريخ الترسية',
  submittedDate: 'تاريخ التقديم',
  byDepartment: 'حسب الإدارة',
  byCategory: 'حسب الفئة',
  primaryContact: 'جهة الاتصال الرئيسية',
  registrationNo: 'رقم السجل',
  taxNo: 'الرقم الضريبي',
  country: 'الدولة',
  phone: 'الهاتف',
  website: 'الموقع الإلكتروني',
  registered: 'تاريخ التسجيل',
  contactPhone: 'هاتف جهة الاتصال',
  blacklistReason: 'سبب الحظر',
  suspensionReason: 'سبب الإيقاف',
  reference: 'الرقم المرجعي',
  title: 'العنوان',
  department: 'الإدارة',
  category: 'الفئة',
  amountKwd: 'المبلغ (د.ك)',
  commercialKwd: 'العرض المالي (د.ك)',
  technical: 'الفني',
  outcome: 'النتيجة',
  status: 'الحالة',
  awarded: 'مُرساة',
  totalSuffix: t => `الإجمالي ‎${t}‎`,
  noAwardHistory: 'لا يوجد سجل ترسيات حتى الآن.',
  noAwards: 'لا توجد ترسيات مسجّلة لهذا المورد.',
  noBidHistory: 'لا يوجد سجل عروض لهذا المورد.',
  noData: 'لا توجد بيانات.',
  months: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  date: v => `‎${v}‎`,
  awardsCount: n => `‎${n}‎ ترسية`,
  amount: v => `‎${v}‎ د.ك`,
  currency: 'د.ك',
  directoryHref: '/executive-ar/vendors',
  statusLabels: {
    Approved: 'معتمد',
    Pending: 'قيد المراجعة',
    'Internal Review': 'مراجعة داخلية',
    Suspended: 'موقوف',
    Blacklisted: 'محظور',
    Cancelled: 'ملغى',
    Draft: 'مسودة',
    Submitted: 'مُقدَّم',
    Evaluated: 'تم التقييم',
    Awarded: 'مُرساة',
    'Not Awarded': 'لم تتم الترسية',
    Withdrawn: 'مسحوب',
    Disqualified: 'مستبعد',
    Late: 'متأخر',
    'Late accepted': 'متأخر ومقبول',
    Amended: 'معدّل',
    Superseded: 'مُستبدل',
    Active: 'نشط',
    PASS: 'ناجح',
    FAIL: 'راسب',
  },
};
