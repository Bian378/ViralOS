/**
 * Side-effect-free orchestration contract for ViralOS AI.
 * No network requests, provider SDK, storage, billing, upload or publish actions.
 * A future backend adapter MUST persist transitions atomically by owner+revision.
 */
export const AGENT_STAGE_ORDER = ['creative', 'research', 'quality', 'manager'] as const;
export type AgentRole = (typeof AGENT_STAGE_ORDER)[number];
export type AgentStageStatus = 'waiting' | 'authorized' | 'running' | 'complete' | 'needs_operator_review';

export type AgentFinding = {
  summary: string;
  proposedScript?: string;
  claimsToVerify: string[];
};
export type AgentStage = {
  role: AgentRole;
  status: AgentStageStatus;
  claimId?: string;
  quotedCredits?: number;
  ownerLimitCredits?: number;
  finding?: AgentFinding;
  error?: string;
};
export type AgentWorkflow = {
  workflowId: string;
  projectId: string;
  projectRevision: number;
  sourceUrl: string;
  createdAt: string;
  status: 'planning' | 'awaiting_owner_review' | 'cancelled';
  stages: AgentStage[];
};

type StageConsent = {
  role: AgentRole;
  claimId: string;
  expectedRevision: number;
  ownerConsented: boolean;
  quotedCredits: number | null;
  ownerLimitCredits: number | null;
  rolePaused?: boolean;
};

type StageResult = {
  role: AgentRole;
  claimId: string;
  expectedRevision: number;
  finding: AgentFinding;
};

function assertWorkflow(run: AgentWorkflow, expectedRevision: number) {
  if (run.status !== 'planning') throw new Error('Workflow is not accepting new agent work.');
  if (!Number.isSafeInteger(expectedRevision) || run.projectRevision !== expectedRevision)
    throw new Error('Manuscript version changed. Start a new workflow.');
}
function stageFor(run: AgentWorkflow, role: AgentRole): AgentStage {
  const stage = run.stages.find(item => item.role === role);
  if (!stage) throw new Error('Unknown agent role.');
  return stage;
}
function replaceStage(run: AgentWorkflow, replacement: AgentStage): AgentWorkflow {
  return { ...run, stages: run.stages.map(stage => stage.role === replacement.role ? replacement : stage) };
}
function assertNextStage(run: AgentWorkflow, role: AgentRole) {
  const next = run.stages.find(stage => stage.status !== 'complete');
  if (!next || next.role !== role) throw new Error('Agent stages must run in order.');
}

export function createAgentWorkflow(input: {
  workflowId: string;
  projectId: string;
  projectRevision: number;
  sourceUrl: string;
  createdAt: string;
}): AgentWorkflow {
  if (!input.workflowId.trim() || !input.projectId.trim() ||
      !Number.isSafeInteger(input.projectRevision) || input.projectRevision < 0 ||
      !/^https:\/\//.test(input.sourceUrl) || !Number.isFinite(Date.parse(input.createdAt)))
    throw new Error('Valid workflow, manuscript revision, source URL and creation time required.');
  return {
    workflowId: input.workflowId, projectId: input.projectId,
    projectRevision: input.projectRevision, sourceUrl: input.sourceUrl,
    createdAt: input.createdAt, status: 'planning',
    stages: AGENT_STAGE_ORDER.map(role => ({ role, status: 'waiting' })),
  };
}

/** Authorizes ONE known-cost provider call. Does not dispatch it. */
export function authorizeAgentStage(run: AgentWorkflow, consent: StageConsent): AgentWorkflow {
  assertWorkflow(run, consent.expectedRevision);
  assertNextStage(run, consent.role);
  const stage = stageFor(run, consent.role);
  if (stage.status !== 'waiting') throw new Error('Agent call already reserved or completed.');
  if (consent.rolePaused) throw new Error('Agent is paused.');
  if (consent.ownerConsented !== true) throw new Error('Explicit owner consent is required.');
  if (!consent.claimId.trim() || run.stages.some(s => s.claimId === consent.claimId))
    throw new Error('A fresh unique claim ID is required.');
  if (consent.quotedCredits === null || consent.ownerLimitCredits === null ||
      !Number.isFinite(consent.quotedCredits) || !Number.isFinite(consent.ownerLimitCredits) ||
      consent.quotedCredits <= 0 || consent.ownerLimitCredits <= 0 ||
      consent.quotedCredits > consent.ownerLimitCredits)
    throw new Error('Known cost quote and sufficient owner-approved credit limit required.');
  return replaceStage(run, {
    ...stage, status: 'authorized', claimId: consent.claimId,
    quotedCredits: consent.quotedCredits, ownerLimitCredits: consent.ownerLimitCredits,
  });
}

/** Claim must be atomically persisted BEFORE any model request is sent. */
export function claimAgentStage(run: AgentWorkflow, input: {
  role: AgentRole; claimId: string; expectedRevision: number;
}): AgentWorkflow {
  assertWorkflow(run, input.expectedRevision);
  assertNextStage(run, input.role);
  const stage = stageFor(run, input.role);
  if (stage.status !== 'authorized' || stage.claimId !== input.claimId)
    throw new Error('No matching unused authorization.');
  return replaceStage(run, { ...stage, status: 'running' });
}

/** Records a proposal; never marks facts, rights or a manuscript as approved. */
export function completeAgentStage(run: AgentWorkflow, input: StageResult): AgentWorkflow {
  assertWorkflow(run, input.expectedRevision);
  assertNextStage(run, input.role);
  const stage = stageFor(run, input.role);
  if (stage.status !== 'running' || stage.claimId !== input.claimId)
    throw new Error('Matching running claim required.');
  const { summary, proposedScript, claimsToVerify } = input.finding;
  if (typeof summary !== 'string' || !summary.trim() || summary.length > 1400 ||
      !Array.isArray(claimsToVerify) || claimsToVerify.length > 12 ||
      !claimsToVerify.every(x => typeof x === 'string' && x.length <= 320) ||
      (proposedScript !== undefined && (typeof proposedScript !== 'string' || proposedScript.length > 3500)))
    throw new Error('Invalid or oversized agent output.');
  const updated = replaceStage(run, {
    ...stage, status: 'complete', finding: {
      summary: summary.trim(),
      ...(proposedScript !== undefined ? { proposedScript } : {}),
      claimsToVerify: claimsToVerify.map(x => x.trim()),
    },
  });
  return updated.stages.every(s => s.status === 'complete')
    ? { ...updated, status: 'awaiting_owner_review' }
    : updated;
}

/** Fail closed: never retry a potentially billed call using the same claim. */
export function flagAgentCallFailure(run: AgentWorkflow, input: {
  role: AgentRole; claimId: string; expectedRevision: number;
}): AgentWorkflow {
  assertWorkflow(run, input.expectedRevision);
  const stage = stageFor(run, input.role);
  if (stage.status !== 'running' || stage.claimId !== input.claimId)
    throw new Error('Matching running claim required.');
  return replaceStage(run, {
    ...stage, status: 'needs_operator_review',
    error: 'Unknown provider outcome. Do not retry automatically: it may have incurred a charge.',
  });
}

export function cancelAgentWorkflow(run: AgentWorkflow): AgentWorkflow {
  return run.status === 'cancelled' ? run : { ...run, status: 'cancelled' };
}
