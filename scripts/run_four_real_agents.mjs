/**
 * Opt-in one-shot four REAL local editorial agents.
 * Creates only an unapproved local manuscript + claim-review report.
 * Nothing calls AppDeploy, YouTube, external research or commercial AI.
 */
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFourRealAgents} from './four_real_agents.mjs';

export async function saveFourAgentReview({
  outputDir,topic,sourceUrl,explicitLocalConsent=false,
  managerPolicy='generate',run=runFourRealAgents,
}){
  if(typeof outputDir!=='string'||!outputDir.trim())
    throw Error('An explicit new output folder is required.');
  if(explicitLocalConsent!==true)
    throw Error('Explicit authorization for four local Qwen model requests required.');
  const destination=resolve(outputDir);
  mkdirSync(destination,{recursive:false});
  try{
    const {report,draftManifest}=await run({topic,sourceUrl,explicitLocalConsent:true,managerPolicy});
    const count=report?.modelCalls;
    const expected=report?.rolesExecuted;
    if(!Number.isSafeInteger(count)||(count!==3&&count!==4)||
       !Array.isArray(expected)||expected.length!==count||
       !expected.every((role,i)=>role===['creative','research','quality','manager'][i])||
       (count===3&&(managerPolicy!=='preserve-valid'||report.managerModelCallSkipped!==true||
         report.selectedDraftRole===null))||
       (managerPolicy==='generate'&&count!==4)||
       report?.humanApproved!==false||report?.published!==false||
       report?.publicReleaseAuthorized!==false){
      throw Error('Unexpected model-run approval or stage receipt.');
    }
    writeFileSync(resolve(destination,'four-agent-review-UNVERIFIED.json'),
      JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    if(draftManifest){
      if(draftManifest.notForPublication!==true)
        throw Error('Production plan must remain an unapproved draft.');
      writeFileSync(resolve(destination,'source-DRAFT.json'),
        JSON.stringify(draftManifest,null,2)+'\n',{flag:'wx'});
    }
    return {status:report.status,roles:report.rolesExecuted,
      modelCalls:count,managerPolicy,managerModelCallSkipped:count===3,
      validDraft:Boolean(draftManifest),
      selectedDraftRole:report.selectedDraftRole??null,
      selectedWordCount:report.selectedWordCount??null,
      selectedDraftSha256:report.selectedDraftSha256??null,
      formatOnlyValidation:Boolean(report.manuscriptFormatPassed),
      outputFolder:destination,appDeployCreditsUsed:0,
      publicationAllowed:false};
  }catch(e){
    rmSync(destination,{recursive:true,force:true});
    throw e;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  const required=['--topic','--source-url','--out-dir','--allow-four-local-calls'];
  const optional=['--preserve-valid-draft'];
  const config={};
  for(let i=0;i<args.length;i++){
    if(![...required,...optional].includes(args[i])||args[i] in config)throw Error('Unknown/duplicate option');
    if(args[i]==='--allow-four-local-calls'||args[i]==='--preserve-valid-draft'){
      config[args[i]]=true;continue;
    }
    if(++i>=args.length||args[i].startsWith('--'))throw Error('Missing argument');
    config[args[i-1]]=args[i];
  }
  if(!required.every(key=>config[key]))throw Error('Required: --topic --source-url --out-dir --allow-four-local-calls');
  const answer=await saveFourAgentReview({
    topic:config['--topic'],sourceUrl:config['--source-url'],
    outputDir:config['--out-dir'],explicitLocalConsent:true,
    managerPolicy:config['--preserve-valid-draft']?'preserve-valid':'generate',
  });
  process.stdout.write(JSON.stringify(answer)+'\n');
}
