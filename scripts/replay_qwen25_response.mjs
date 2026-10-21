/**
 * Replay an archived REAL neural response as an ORIGINAL English Short draft.
 * This only adjusts scene separators after strict validation. No model calls.
 * The output is an unapproved evaluation manifest, not a published video.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectOriginalScript } from './real_qwen25_short.mjs';

export function replayRealShort({input,outputDirectory}) {
  if(typeof input!=='string'||typeof outputDirectory!=='string')
    throw Error('Input filename and new output folder are required.');
  const original=readFileSync(input,'utf8');
  const evaluated=inspectOriginalScript(original);
  if(!evaluated.valid)throw Error('Real model draft still invalid: '+evaluated.reason);
  const directory=resolve(outputDirectory);
  mkdirSync(directory,{recursive:false});
  writeFileSync(join(directory,'source-DRAFT.json'),
    JSON.stringify(evaluated.manifest,null,2)+'\n',{flag:'wx'});
  const report={
    inputOrigin:'ONE_ACTUAL_QWEN25_LOCAL_MODEL_RESPONSE',
    provenance:'Saved from GitHub Actions run 39668724323 attempt 1',
    originalWords:evaluated.words,
    losslessNormalizationApplied:evaluated.normalizationApplied,
    modelInferencePerformedInThisRun:false,
    storyboardPassed:true,
    factualReviewPassed:false,
    voiceLicensingReviewed:false,
    humanApproved:false,uploadAuthorized:false,
    published:false,
  };
  writeFileSync(join(directory,'archived-response-QC.json'),
    JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  return report;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.length!==4)throw Error('Usage: node replay_qwen25_response.mjs INPUT.txt NEW_OUT_DIRECTORY');
  process.stdout.write(JSON.stringify(replayRealShort({
    input:process.argv[2],outputDirectory:process.argv[3],
  }))+'\n');
}
