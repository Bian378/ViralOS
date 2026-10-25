import {useEffect,useState,type ChangeEvent} from 'react';
import {CheckCircle2,FileVideo,FileText,ShieldAlert,UploadCloud} from 'lucide-react';
import CloudReviewCard from './CloudReviewCard';

type ServerReviewSummary={
  id:string;title:string;state:'awaiting_owner_review'|'changes_requested'|'video_reviewed_no_upload_permission';
  version:number;selectedDraftRole:string|null;videoSha256:string;
  hasUploadPermission:false;hasPublishPermission:false;
};
type ReviewPacket={
  schemaVersion:1;
  kind:'viralos-local-unapproved-review-item';
  state:'LOCAL_DRAFT_AWAITING_OWNER_REVIEW';
  title:string;topic:string;sourceUrl:string;
  video:{relativePath:'preview/short-DRAFT.mp4';sha256:string;
    width:1080;height:1920;fps:30;visualStyle:'kinetic_procedural'|'typography_static'};
  script:{text:string;sha256:string;words:number;
    selectedDraftRole:string|null};
  editorial:{rolesActuallyInvoked:string[];localModelCalls:number;
    managerModelCallSkipped:boolean;realNeuralInferenceUsed:boolean};
  permissions:{ownerApproved:false;privateYouTubeUploadAuthorized:false;
    publicYouTubeReleaseAuthorized:false;canAutomaticallyPublish:false};
  canBeImportedIntoAuthenticatedQueueAutomatically:false;
};

const isRecord=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const hex=async(buffer:ArrayBuffer)=>{
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',buffer));
  return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
};

async function safeLocalReviewObject(data:unknown):Promise<ReviewPacket>{
  if(!isRecord(data)||!isRecord(data.video)||!isRecord(data.script)||
     !isRecord(data.editorial)||!isRecord(data.permissions)||
     data.schemaVersion!==1||data.kind!=='viralos-local-unapproved-review-item'||
     data.state!=='LOCAL_DRAFT_AWAITING_OWNER_REVIEW'||
     data.canBeImportedIntoAuthenticatedQueueAutomatically!==false)
    throw Error('Filen är inte ett granskningsutkast från ViralOS.');
  const v=data.video,s=data.script,e=data.editorial,p=data.permissions;
  if(p.ownerApproved!==false||p.privateYouTubeUploadAuthorized!==false||
     p.publicYouTubeReleaseAuthorized!==false||p.canAutomaticallyPublish!==false)
    throw Error('Filen försöker ange godkännande och får inte förhandsvisas.');
  if(v.relativePath!=='preview/short-DRAFT.mp4'||v.width!==1080||
     v.height!==1920||v.fps!==30||
     !['kinetic_procedural','typography_static'].includes(v.visualStyle as string)||
     typeof v.sha256!=='string'||!/^[a-f0-9]{64}$/.test(v.sha256))
    throw Error('Videouppgifterna stämmer inte med utkastformatet.');
  if(typeof s.text!=='string'||s.text.length>3500||s.text.length<80||
     typeof s.sha256!=='string'||!/^[a-f0-9]{64}$/.test(s.sha256)||
     !Number.isSafeInteger(s.words)||s.words!==s.text.trim().split(/\s+/u).length)
    throw Error('Manusets storlek eller uppgifter är ogiltiga.');
  const actual=await hex(new TextEncoder().encode(s.text).buffer);
  if(actual!==s.sha256)
    throw Error('Manusets SHA-256 stämmer inte – utkastet kan ha ändrats.');
  if(!Array.isArray(e.rolesActuallyInvoked)||
     e.rolesActuallyInvoked.length>4||
     e.localModelCalls!==e.rolesActuallyInvoked.length||
     (e.rolesActuallyInvoked.length===0&&s.selectedDraftRole!==null))
    throw Error('Agenthistoriken är ogiltig.');
  if(typeof data.title!=='string'||!data.title.trim()||data.title.length>160||
     typeof data.sourceUrl!=='string'||(data.sourceUrl!==''&&!data.sourceUrl.startsWith('https://')))
    throw Error('Utkastets titel eller källa är ogiltig.');
  return data as unknown as ReviewPacket;
}

export default function ReviewInboxPreview({loadServerQueue}:{loadServerQueue:()=>Promise<unknown>}){
  const [packet,setPacket]=useState<ReviewPacket|null>(null);
  const [video,setVideo]=useState<string|null>(null);
  const [videoMatched,setVideoMatched]=useState(false);
  const [status,setStatus]=useState('');
  const [working,setWorking]=useState(false);
  const [remoteReviews,setRemoteReviews]=useState<ServerReviewSummary[]>([]);
  const [serverStatus,setServerStatus]=useState('Läser din inloggade granskningskö …');
  const [loadingServer,setLoadingServer]=useState(false);

  async function reloadServerQueue(){
    setLoadingServer(true);
    try{
      const data=await loadServerQueue();
      if(!isRecord(data)||!Array.isArray(data.items)||
         data.items.length>30)throw Error('Kön gav ett oväntat svar.');
      const items=data.items as ServerReviewSummary[];
      if(items.some(x=>!isRecord(x)||typeof x.id!=='string'||
          typeof x.title!=='string'||x.hasUploadPermission!==false||
          x.hasPublishPermission!==false))
        throw Error('Köinformationen är inte säker.');
      setRemoteReviews(items);
      setServerStatus(items.length?
        'Servern hittade '+items.length+' privata granskningsposter. Ingen publicering är aktiverad.':
        'Din privata granskningskö är tom. Spara en verifierad MP4 från Videostudio.');
    }catch{
      setRemoteReviews([]);
      setServerStatus('Serverkön kunde inte läsas. Lokal förhandsvisning fungerar ändå; ingen uppladdning gjordes.');
    }finally{
      setLoadingServer(false);
    }
  }
  useEffect(()=>{void reloadServerQueue();},[]);

  useEffect(()=>()=>{if(video)URL.revokeObjectURL(video);},[video]);

  const resetVideo=()=>{
    setVideo(null);
    setVideoMatched(false);
  };

  async function onJson(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];e.target.value='';
    if(!file)return;
    setWorking(true);setStatus('');setPacket(null);resetVideo();
    try{
      if(file.size<10||file.size>65000)throw Error('JSON-filen måste vara mindre än 65 kB.');
      const obj=await safeLocalReviewObject(JSON.parse(await file.text()) as unknown);
      setPacket(obj);
      setStatus('Manusets hash är verifierad. Välj också den lokala MP4-filen för en full videokontroll.');
    }catch(err){
      setStatus(err instanceof Error?err.message:'Kunde inte läsa JSON-filen.');
    }finally{setWorking(false);}
  }

  async function onVideo(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];e.target.value='';
    if(!file||!packet)return;
    setWorking(true);setStatus('');resetVideo();
    try{
      if(file.size<1024||file.size>150*1024*1024)throw Error('MP4 måste vara mellan 1 kB och 150 MB.');
      if(!file.name.toLowerCase().endsWith('.mp4'))
        throw Error('Välj en MP4-videofil.');
      const observed=await hex(await file.arrayBuffer());
      if(observed!==packet.video.sha256)
        throw Error('MP4-filen stämmer inte med videons sparade SHA-256. Granska rätt version.');
      const url=URL.createObjectURL(file);
      setVideo(url);setVideoMatched(true);
      setStatus('Matchande MP4 verifierad i webbläsaren. Detta är fortfarande ett icke godkänt utkast.');
    }catch(err){
      setStatus(err instanceof Error?err.message:'Kunde inte verifiera videon.');
    }finally{setWorking(false);}
  }

  return <section>
    <div className="page-head">
      <div>
        <div className="eyebrow">REVIEW INBOX · LOCAL PREVIEW</div>
        <h1>Granska din nästa Short.</h1>
        <p>Öppna en lokal ViralOS-granskningsfil och kontrollera videon utan att ladda upp något.</p>
      </div>
      <span className="badge">Endast förhandsvisning</span>
    </div>
    <div className="notice">
      Lokala filval skickas inte till servern. Använd Spara i min privata granskningskö i Videostudio för en separat, verifierad inloggad uppladdning.
      Varken privat YouTube-uppladdning eller offentlig publicering är tillåten.
    </div>
    <div className="panel" style={{marginTop:18}}>
      <h3>Din inloggade granskningskö</h3>
      <p role="status">{serverStatus}</p>
      <button className="small ghost" disabled={loadingServer} onClick={()=>void reloadServerQueue()}>
        Uppdatera köstatus
      </button>
      {remoteReviews.map(item=><CloudReviewCard key={item.id} item={item} onChanged={reloadServerQueue}/>)}
      <p>Videofiler sparas först efter en separat, frivillig uppladdning från Videostudio. Granskning ger aldrig automatisk YouTube-behörighet.</p>
    </div>
    <div className="grid" style={{marginTop:20}}>
      <div className="panel">
        <FileText size={25} aria-hidden="true"/>
        <h3>1. Välj granskningsfil</h3>
        <p>Välj <code>review-queue-item-DRAFT.json</code> från en lokal produktionskörning eller hämta den efter MP4-export i Videostudio.</p>
        <input aria-label="Välj lokal ViralOS JSON-granskningsfil" type="file"
          accept=".json,application/json" onChange={onJson} disabled={working}/>
      </div>
      <div className="panel">
        <FileVideo size={25} aria-hidden="true"/>
        <h3>2. Kontrollera videon</h3>
        <p>Välj videons MP4. Filens SHA-256 jämförs med utkastet direkt i webbläsaren.</p>
        <input aria-label="Välj lokal MP4 för kontroll" type="file"
          accept=".mp4,video/mp4" disabled={working||!packet} onChange={onVideo}/>
      </div>
    </div>
    {status&&<div className="notice" role="status" style={{marginTop:15}}>{status}</div>}
    {packet&&<div className="grid" style={{marginTop:18}}>
      <div className="panel">
        <h3>{packet.title}</h3>
        <p>Idé: {packet.topic}</p>
        <p>Manusvalt från: <strong>{packet.script.selectedDraftRole||'Ej angiven agent'}</strong></p>
        <p>{packet.script.words} ord · {packet.editorial.localModelCalls} redovisade agentanrop</p>
        <p>Chefsagentens generering överhoppad: {packet.editorial.managerModelCallSkipped?'Ja':'Nej'}</p>
        <p>Riktig AI-inferens i ursprungskörningen: {packet.editorial.realNeuralInferenceUsed?'Rapporterad':'Inte rapporterad'}</p>
        <div style={{whiteSpace:'pre-wrap',lineHeight:1.65,marginTop:14}}>{packet.script.text}</div>
      </div>
      <div className="panel">
        <ShieldAlert size={25} aria-hidden="true"/>
        <h3>Kontroller före eventuell uppladdning</h3>
        <ul className="setup">
          <li>Kontrollera fakta och manusets innehåll manuellt</li>
          <li>Verifiera rättigheterna för video, röst och musik</li>
          <li>Synkronisera undertexter mot det faktiska talet</li>
          <li>Granska hela den slutliga videon</li>
          <li>Godkänn exakt fil genom framtida serverbaserat flöde</li>
        </ul>
        <p><strong>Ingen YouTube-uppladdning eller offentlig publicering är tillåten här.</strong></p>
        {videoMatched&&<p><CheckCircle2 size={16} aria-hidden="true"/> Video och granskningsfil matchar.</p>}
      </div>
    </div>}
    {video&&<div className="panel" style={{marginTop:18}}>
      <h3>Verifierad lokal videoförhandsvisning</h3>
      <video controls src={video} style={{maxWidth:340,width:'100%',maxHeight:620}}
        aria-label="Lokal ViralOS Short som väntar på ägarens granskning"/>
      <p>Förhandsvisad på denna enhet. Inget har skickats till ViralOS-servern.</p>
    </div>}
    {!packet&&<div className="panel" style={{marginTop:18}}>
      <UploadCloud size={25} aria-hidden="true"/>
      <h3>Inga lokala utkast öppnade</h3>
      <p>Skapa en MP4 i Videostudio och hämta även dess SHA-256-granskningsfil. Öppna sedan båda filerna här.</p>
    </div>}
  </section>;
}
