/**
 * Format-only deterministic selection from REAL OR MOCK agent proposals.
 * The manager's content does not get exclusive power to erase valid earlier
 * drafts. Selection does not assess truth, originality, language quality or
 * licenses, and never authorizes upload/publication.
 */
import {createHash} from 'node:crypto';
import {inspectOriginalScript} from './real_qwen25_short.mjs';

const ORDER=Object.freeze(['manager','quality','creative']);

export function chooseValidatedEditorialDraft(stageResults){
  if(!Array.isArray(stageResults)||stageResults.length>4)
    throw Error('Expected bounded editorial stages.');
  const byRole=new Map();
  for(const stage of stageResults){
    if(!stage||typeof stage!=='object'||!['creative','research','quality','manager'].includes(stage.role)||
       byRole.has(stage.role)||typeof stage.content!=='string'||stage.content.length>4500)
      throw Error('Malformed or duplicated editorial stage.');
    byRole.set(stage.role,stage.content);
  }
  const candidates=ORDER.filter(role=>byRole.has(role)).map(role=>{
    const result=inspectOriginalScript(byRole.get(role));
    return {
      role,validFormat:result.valid,words:result.words,
      normalizationApplied:Boolean(result.normalizationApplied),
      reason:result.valid?null:result.reason,
      ...(result.valid?{
        script:result.script,
        sha256:createHash('sha256').update(result.script,'utf8').digest('hex'),
      }:{}),
    };
  });
  const selected=candidates.find(candidate=>candidate.validFormat)||null;
  return {
    selectedRole:selected?.role??null,
    selectedScript:selected?.script??null,
    selectedSha256:selected?.sha256??null,
    selectedWords:selected?.words??null,
    selectedWasNotManager:Boolean(selected&&selected.role!=='manager'),
    // Expose a readable, bounded audit of every role while keeping scripts
    // exclusively in original full stageResults (saved separately).
    candidateChecks:candidates.map(({script,sha256,...audit})=>audit),
    selectionRule:'manager_then_quality_then_creative_IF_FORMAT_VALID',
    factualClaimsVerified:false,originalityVerified:false,
    mediaRightsVerified:false,independentEnglishReviewPassed:false,
    publicReleaseAuthorized:false,
  };
}
