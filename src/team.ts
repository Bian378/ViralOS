// Registry v1. Legacy pause IDs stay intact; no stored role is repurposed.
export const productTeam = [
  { id: 'supervisor', name: 'Chefsagent', role: 'Samordning, beroenden och eskalering', capability: 'Kontrollpanelen sammanställer status. Automatisk delegering återstår.', page: 'overview' },
  { id: 'youtube_scout', name: 'YouTube Discovery', role: 'Källor och videokandidater', capability: 'Hämtar popularitetsurval. Shorts-format är inte verifierat.', page: 'radar', pauseId: 'youtube' },
  { id: 'trend_analyst', name: 'Trend Intelligence', role: 'Källunderlag och teman', capability: 'Källmetadata finns. Fördjupad trendbedömning återstår.', page: 'radar', pauseId: 'intelligence' },
  { id: 'creative', name: 'Creative Director', role: 'Hook och engelskt manus', capability: 'Manuell redigering och separat godkänd AI-provning.', page: 'studio', pauseId: 'creative' },
  { id: 'research_rights', name: 'Research & Rights', role: 'Fakta, ursprung och rättigheter', capability: 'Ej implementerad. Källänk är inte ett användningstillstånd.', page: 'connections' },
  { id: 'asset_producer', name: 'Visuals & Voice', role: 'Bildmaterial och engelsk berättarröst', capability: 'Ej ansluten. Tjänst, rättigheter och budget behöver beslutas.', page: 'connections' },
  { id: 'editor', name: 'Video Editor', role: 'Klippning, ljud och undertexter', capability: 'Tyst text-MP4 finns. Röst och serverrendering återstår.', page: 'studio', pauseId: 'studio' },
  { id: 'quality', name: 'Quality Control', role: 'Teknisk kontroll och ägargranskning', capability: 'Manusbeslut sparas. Fullständig video-QC återstår.', page: 'overview' },
  { id: 'publishing', name: 'YouTube Publisher', role: 'Tillstånd och publicering', capability: 'Blockerad. OAuth och separat publiceringstillstånd saknas.', page: 'calendar' },
  { id: 'growth', name: 'Performance & Learning', role: 'Resultat och förbättringsförslag', capability: 'Ej ansluten. Inga verifierade publiceringsresultat.', page: 'analytics' },
];
