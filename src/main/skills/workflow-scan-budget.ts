import type { SkillScanPendingBudget } from './skill-scan-coalescer'

// Held by leaf reads (root scans, file reads, a WSL scan) until their uncancellable work settles.
export const workflowScanBudget: SkillScanPendingBudget = { pending: 0, maximumPending: 64 }
