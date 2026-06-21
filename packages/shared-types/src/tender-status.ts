export enum TenderStatus {
  Draft = 'Draft',
  InternalReview = 'Internal Review',
  Approved = 'Approved',
  Published = 'Published',
  ClarificationPeriod = 'Clarification Period',
  SubmissionClosed = 'Submission Closed',
  TechnicalOpening = 'Technical Opening',
  TechnicalEvaluation = 'Technical Evaluation',
  CommercialSealed = 'Commercial Sealed',
  CommitteeCommercialOpening = 'Committee Commercial Opening',
  CommercialEvaluationComparison = 'Commercial Evaluation Comparison',
  // BUG-115 (2026-06-09): negotiation phase. Inserted between Commercial
  // Evaluation/Comparison and Award Recommendation. See master plan §10.
  Negotiation = 'Negotiation',
  AwardRecommendation = 'Award Recommendation',
  Awarded = 'Awarded',
  TenderClosed = 'Tender Closed',
  Cancelled = 'Cancelled',
  Suspended = 'Suspended',
  Archived = 'Archived',
}
