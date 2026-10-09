import type { SkillScanPendingBudget } from './skill-scan-coalescer'

// Each acquisition retains its slot until its uncancellable operations settle.
export const workflowScanBudget: SkillScanPendingBudget = { pending: 0, maximumPending: 64 }
