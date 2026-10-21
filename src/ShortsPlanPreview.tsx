import { useMemo } from 'react';
import { Clapperboard, ShieldCheck } from 'lucide-react';
import type { Project } from './model';
import { buildShortsProductionPlan } from './shorts-production-plan';

export default function ShortsPlanPreview({ project }: { project: Project }) {
  const outcome = useMemo(() => {
    try {
      return { plan: buildShortsProductionPlan({
        projectId: project.id, revision: project.revision ?? 0, title: project.title,
        script: project.script, sourceUrl: project.sourceUrl,
      }), error: null as string | null };
    } catch (e) {
      return { plan: null, error: e instanceof Error ? e.message : 'Kan inte skapa scenplan.' };
    }
  }, [project.id, project.revision, project.title, project.script, project.sourceUrl]);
  return <details className="panel shorts-plan-panel" style={{ marginTop: 20 }}>
    <summary><Clapperboard size={17} /> Scenplan och undertexttiming
      <span className="badge">Gratis · Ingen AI</span>
    </summary>
    <div className="panel-body">
      <p className="smallprint">
        Förhandsberäkning från manus – ingen video, AI-röst, musik eller färdig synkroniserad undertext
        har skapats. Det här är inte ett godkännande för användning eller publicering.
      </p>
      {outcome.error && <div className="notice amber" role="status">
        Scenplanen är inte redo: {outcome.error}
      </div>}
      {outcome.plan && <>
        <div className="feed-meta">
          <span className="badge green">{outcome.plan.scenes.length} scener</span>
          <span>{outcome.plan.totalWords} ord</span>
          <span>Ca {Math.round(outcome.plan.estimatedSeconds)} sekunder</span>
          <span>9:16 · 1080 × 1920 · 30 FPS</span>
        </div>
        <div className="shorts-plan-scenes">
          {outcome.plan.scenes.map(scene => <div className="shorts-plan-scene" key={scene.order}>
            <div className="feed-meta">
              <strong>Scen {scene.order}</strong>
              <span>Start {(scene.startFrame / 30).toFixed(1)} s</span>
              <span>Längd {(scene.durationFrames / 30).toFixed(1)} s</span>
            </div>
            <p>{scene.text}</p>
            <p className="smallprint">
              {scene.captionCues.length} ungefärliga undertextsegment ·
              Bild-/videomaterial och rättigheter är ännu inte valda eller verifierade.
            </p>
          </div>)}
        </div>
      </>}
      <div className="notice" style={{ marginTop: 14 }}>
        <ShieldCheck size={14} style={{ display: 'inline', marginRight: 7 }} />
        Engelskt språk, källor, bildrättigheter, berättarröst och slutlig undertextsynkronisering
        måste granskas separat. Endast en färdig MP4 kan godkännas för publicering.
      </div>
    </div>
  </details>;
}
