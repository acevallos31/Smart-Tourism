import { parseCSV, normalizeEvent, filterEvents, summarize, makeDemoEvent, exportCSV, firmwareConfig, validateTopic, DEFAULT_TOPIC, DEFAULT_BROKER, localTime, alertFor } from './model.mjs';

const $ = id => document.getElementById(id);
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const number = value => new Intl.NumberFormat('es-HN').format(value);
const shortDate = value => new Intl.DateTimeFormat('es-HN', { day:'numeric', month:'short', timeZone:'UTC' }).format(new Date(value + 'T12:00:00Z'));
const reasonLabel = { A_B:'Secuencia A → B', B_A:'Secuencia B → A', AFORO_MAXIMO:'Capacidad completa', AFORO_CERO:'Aforo en cero', PASO_INCOMPLETO:'Paso incompleto', SIMULTANEOS:'Pulsos simultáneos' };
const validationLabel = { ACEPTADO:'Aceptado', RECHAZADO:'Rechazado', REVISAR_DATOS:'Revisar datos' };
const state = { mode:'history', page:'overview', history:[], database:[], demo:[], live:[], pageIndex:0, filtered:[], historyName:'Datos del proyecto', client:null, connected:false, connecting:false, invalid:0, received:0, lastSeen:0, heartbeat:null, seen:new Set(), topic:DEFAULT_TOPIC, historyRevision:0, databaseRevision:0, liveSequences:new Map(), gaps:0, audioEnabled:false, alertLevel:0, messageRevision:0, heartbeatRevision:0, eventRevision:0 };
let toastTimer;
let audioContext;

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200); }
function error(message = '') { $('appError').textContent = message; $('appError').hidden = !message; }
function currentEvents() { return state[state.mode === 'history' ? 'history' : state.mode]; }
function alertDetails(event) {
  if (!event) return null;
  if (event.validation === 'RECHAZADO') return { level:'danger', rank:3, title:'Acceso rechazado', message:event.reason === 'AFORO_MAXIMO' ? `No se permitió la entrada: el lugar está completo (${event.occupancy} de ${event.capacity}).` : 'No se permitió la salida porque el aforo ya estaba en cero.' };
  if (event.validation === 'REVISAR_DATOS') return { level:'warning', rank:2, title:'Movimiento para revisar', message:event.reason === 'SIMULTANEOS' ? 'Los dos sensores se activaron al mismo tiempo. Revisa este movimiento.' : 'Una persona activó solo un sensor. Revisa el paso incompleto.' };
  if (event.alert === 'CAPACIDAD_MAXIMA') return { level:'danger', rank:3, title:'Capacidad máxima', message:`Hay ${event.occupancy} de ${event.capacity} personas. No permitas más entradas.` };
  if (event.alert === 'ADVERTENCIA_80') return { level:'warning', rank:2, title:'Aforo alto', message:`Hay ${event.occupancy} de ${event.capacity} personas. Quedan ${Math.max(0,event.capacity-event.occupancy)} lugares disponibles.` };
  return null;
}
function currentAlertEvent() {
  if (state.mode === 'history' || state.mode === 'database') return null;
  if (state.mode === 'live' && state.heartbeat && state.heartbeatRevision > state.eventRevision) return { ...state.heartbeat, alert:alertFor(state.heartbeat.occupancy,state.heartbeat.capacity), validation:'ACEPTADO', reason:'A_B' };
  return currentEvents().at(-1) || null;
}
function renderActiveAlert() {
  const details=alertDetails(currentAlertEvent());
  $('activeAlert').hidden=!details;
  if(details){$('activeAlert').className=`active-alert ${details.level}`;$('activeAlertLabel').textContent=details.level==='danger'?'ALERTA URGENTE':'ALERTA ACTIVA';$('activeAlertTitle').textContent=details.title;$('activeAlertMessage').textContent=details.message;}
  $('audioToggle').classList.toggle('audio-on',state.audioEnabled);$('audioToggle').setAttribute('aria-pressed',String(state.audioEnabled));$('audioToggleText').textContent=state.audioEnabled?'Sonido activo':'Activar sonido';
}
function playAlertSound(level='warning') {
  if(!state.audioEnabled||!audioContext||audioContext.state!=='running')return;
  const patterns=level==='danger'?[[880,0,.16],[660,.22,.16],[880,.44,.22]]:level==='review'?[[520,0,.18],[520,.28,.18]]:[[700,0,.16],[820,.24,.2]];
  const start=audioContext.currentTime;
  for(const [frequency,delay,duration] of patterns){const oscillator=audioContext.createOscillator(),gain=audioContext.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,start+delay);gain.gain.exponentialRampToValueAtTime(.14,start+delay+.02);gain.gain.exponentialRampToValueAtTime(.0001,start+delay+duration);oscillator.connect(gain).connect(audioContext.destination);oscillator.start(start+delay);oscillator.stop(start+delay+duration+.02);}
}
async function toggleAudio() {
  if(state.audioEnabled){state.audioEnabled=false;renderActiveAlert();toast('Sonido de alertas desactivado.');return;}
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  if(!AudioEngine){toast('Este navegador no permite reproducir alertas sonoras.');return;}
  audioContext ||= new AudioEngine();await audioContext.resume();state.audioEnabled=true;renderActiveAlert();playAlertSound('warning');toast('Sonido de alertas activado.');
}
function handleIncomingAlert(event) {
  const details=alertDetails(event);
  if(details&&(details.rank>state.alertLevel||event.validation!=='ACEPTADO'))playAlertSound(event.validation==='REVISAR_DATOS'?'review':details.level);
  state.alertLevel=details?.rank||0;
}
function resetDates() {
  const dates = currentEvents().map(e => e.date).sort();
  $('fromDate').value = dates[0] || ''; $('toDate').value = dates.at(-1) || '';
}
function clearFilters() { $('directionFilter').value = ''; $('validationFilter').value = ''; $('searchInput').value = ''; state.pageIndex = 0; }
function selectMode(mode) {
  state.mode = mode;
  if(mode==='database') refreshDatabase(); clearFilters(); resetDates(); error();
  state.alertLevel=alertDetails(currentAlertEvent())?.rank||0;
  document.querySelectorAll('[data-mode]').forEach(button => { const active = button.dataset.mode === mode; button.classList.toggle('selected', active); button.setAttribute('aria-pressed', String(active)); });
  render();
}
async function refreshDatabase() {
  const revision=++state.databaseRevision;
  try {
    const response=await fetch('/api/events?limit=10000',{cache:'no-store'});
    if(!response.ok) throw new Error(response.status===503?'PostgreSQL no está configurado en este servidor.':'No se pudo consultar PostgreSQL (HTTP '+response.status+').');
    const rows=await response.json();
    if(!Array.isArray(rows)) throw new Error('Respuesta inesperada de la API.');
    const events=rows.map(raw=>normalizeEvent(raw,{origin:'POSTGRESQL',sessionId:raw.sessionId||'historico'}));
    events.sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.sequence-b.sequence);
    if(revision!==state.databaseRevision)return;
    state.database=events;
    if(state.mode==='database'){resetDates();render();}
  } catch(err) {
    if(revision!==state.databaseRevision)return;
    if(state.mode==='database')error(err.message+' Puedes regresar a Datos guardados (CSV).');
  }
}

function selectPage(page) {
  state.page = page; state.pageIndex = 0; clearFilters();
  const details = { overview:['Control de visitas','Mira el aforo, las entradas y las salidas de forma sencilla.','Resumen'], events:['Todos los movimientos','Busca y revisa las entradas y salidas registradas.','Movimientos'], alerts:['Alertas','Eventos rechazados o que necesitan revisión.','Alertas'], connection:['Conectar con Wokwi','Sigue estos pasos para recibir datos del ESP32.','Conectar Wokwi'] }[page];
  $('pageTitle').textContent = details[0]; $('pageDescription').textContent = details[1]; $('breadcrumb').textContent = details[2];
  document.querySelectorAll('[data-page]').forEach(button => { const active = button.dataset.page === page; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current'); });
  $('overviewPanel').hidden = page !== 'overview'; $('eventsPanel').hidden = page === 'connection'; $('connectionPanel').hidden = page !== 'connection'; $('sourcePicker').hidden = page === 'connection'; $('advancedOptions').hidden = page === 'connection'; $('viewAll').hidden = page !== 'overview';
  render();
}

function render() {
  const filters = { from:$('fromDate').value, to:$('toDate').value, direction:$('directionFilter').value, validation:$('validationFilter').value, query:$('searchInput').value };
  $('fromDate').setCustomValidity(filters.from && filters.to && filters.from > filters.to ? 'La fecha inicial debe ser anterior a la final.' : '');
  let events = filterEvents(currentEvents(), filters);
  if (state.page === 'alerts') events = events.filter(e => e.alert !== 'NINGUNA' || e.validation !== 'ACEPTADO');
  state.filtered = events;
  const stats = summarize(events);
  $('entriesMetric').textContent = number(stats.entries); $('exitsMetric').textContent = number(stats.exits); $('maxMetric').textContent = events.length ? number(stats.max) : '—'; $('capacityMetric').textContent = ` / ${stats.latest?.capacity || 10}`; $('alertsMetric').textContent = number(stats.alerts);
  $('alertsFoot').textContent = `${number(stats.rejected)} rechazados · ${number(stats.review)} para revisión`;
  $('eventCount').textContent = number(currentEvents().length);
  $('periodCount').textContent = `${stats.days.length} ${stats.days.length === 1 ? 'día' : 'días'}`;
  $('flowFooter').textContent = `${number(stats.total)} eventos en el período · ${number(stats.entries + stats.exits)} pasos aceptados`;
  $('sourceBadge').textContent = state.mode === 'history' ? 'DATOS GUARDADOS' : state.mode === 'database' ? 'POSTGRESQL' : state.mode === 'demo' ? 'PRUEBA' : 'WOKWI EN VIVO';
  $('sourceNote').textContent = state.mode === 'history' ? `${number(state.history.length)} movimientos guardados en el proyecto.` : state.mode === 'database' ? `${number(state.database.length)} movimientos consultados de PostgreSQL.` : state.mode === 'demo' ? 'Usa los botones para probar el contador.' : 'Muestra los eventos recibidos mientras esta página está abierta.';
  $('demoControls').hidden = state.mode !== 'demo' || state.page === 'connection'; $('livePrompt').hidden = state.mode !== 'live' || state.page === 'connection'; $('connectionPill').hidden = state.mode !== 'live';
  $('eventsTitle').textContent = state.page === 'overview' ? 'Últimos movimientos' : state.page === 'alerts' ? 'Eventos que necesitan atención' : 'Todos los movimientos';
  $('eventsSubtitle').textContent = state.page === 'alerts' ? 'Rechazos, aforo alto y pasos incompletos.' : 'Entradas y salidas registradas.';
  $('exportButton').disabled = !events.length;
  drawFlow(stats.days); drawOccupancy(stats.days); drawGauge(stats.latest); renderTable(events); renderConnection(); renderActiveAlert();
}

function drawFlow(days) {
  if (!days.length) { $('flowChart').innerHTML = '<div class="empty-chart">Los pasos aceptados aparecerán aquí.</div>'; return; }
  const width = Math.max(250,$('flowChart').clientWidth), height = 205, left = 32, right = 9, top = 16, bottom = 30;
  const plotH = height - top - bottom, plotW = width - left - right;
  const largest = Math.max(...days.map(d => Math.max(d.entries, d.exits)), 1); const max = Math.max(5, Math.ceil(largest / 5) * 5);
  const band = plotW / days.length; const barWidth = Math.min(22, band * .29);
  let shapes = '';
  for (let i=0;i<=4;i++) { const y = top + plotH * i / 4; shapes += `<line class="gridline" x1="${left}" y1="${y}" x2="${width-right}" y2="${y}"/><text x="${left-9}" y="${y+3}" text-anchor="end">${Math.round(max*(1-i/4))}</text>`; }
  days.forEach((d,i) => {
    const x = left + band * (i+.5); const a = plotH*d.entries/max, b = plotH*d.exits/max;
    shapes += `<rect class="bar" x="${x-barWidth-1.5}" y="${top+plotH-a}" width="${barWidth}" height="${a}" rx="2" fill="#438767"><title>${html(shortDate(d.date))}: ${d.entries} entradas aceptadas</title></rect><rect class="bar" x="${x+1.5}" y="${top+plotH-b}" width="${barWidth}" height="${b}" rx="2" fill="#cadfbe"><title>${html(shortDate(d.date))}: ${d.exits} salidas aceptadas</title></rect>`;
    if (i % Math.max(1,Math.ceil(days.length/(width<450?4:9))) === 0 || days.length === 1) shapes += `<text x="${x}" y="${height-10}" text-anchor="middle">${html(shortDate(d.date))}</text>`;
  });
  $('flowChart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Entradas y salidas por día"><title>Entradas y salidas aceptadas. ${days.length} días.</title>${shapes}</svg>`;
}

function drawOccupancy(days) {
  if (!days.length) { $('occupancyChart').innerHTML = '<div class="empty-chart">Sin lecturas para este período.</div>'; return; }
  const width = Math.max(250,$('occupancyChart').clientWidth), height = 150, left = 32, right = 12, top = 10, bottom = 28;
  const max = Math.max(10,...days.map(d=>d.max)); const plotH = height-top-bottom, plotW = width-left-right;
  let shapes = '';
  [0,.5,1].forEach(f=>{ const y=top+plotH*(1-f); shapes += `<line class="gridline" x1="${left}" y1="${y}" x2="${width-right}" y2="${y}"/><text x="${left-9}" y="${y+3}" text-anchor="end">${Math.round(max*f)}</text>`; });
  const points = days.map((d,i)=>({x:days.length===1?left+plotW/2:left+i*plotW/(days.length-1), y:top+plotH*(1-d.avg/max),d}));
  const line = points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${points.at(-1).x},${top+plotH} L${points[0].x},${top+plotH} Z`;
  shapes += `<defs><linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#a6c690" stop-opacity=".28"/><stop offset="100%" stop-color="#a6c690" stop-opacity=".015"/></linearGradient></defs><path d="${area}" fill="url(#areaGradient)"/><path d="${line}" fill="none" stroke="#83a976" stroke-width="2.2"/>`;
  points.forEach((p,i)=>{ shapes+=`<circle cx="${p.x}" cy="${p.y}" r="3" fill="#83a976"><title>${html(shortDate(p.d.date))}: promedio ${p.d.avg.toFixed(2)}, máximo ${p.d.max}</title></circle>`; if(i%Math.max(1,Math.ceil(days.length/(width<450?4:7)))===0) shapes+=`<text x="${p.x}" y="${height-8}" text-anchor="middle">${html(shortDate(p.d.date))}</text>`; });
  $('occupancyChart').innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Ocupación promedio por día"><title>Promedio de las lecturas de ocupación, no promedio ponderado por tiempo.</title>${shapes}</svg>`;
}

function drawGauge(latest) {
  $('occupancyTitle').textContent = 'Personas dentro';
  $('occupancySubtitle').textContent = (state.mode === 'history' || state.mode === 'database') ? 'Según el último registro histórico' : 'Según el último evento recibido';
  const occupancy = latest?.occupancy, capacity = latest?.capacity || 10;
  const level = !latest ? 'neutral' : latest.alert === 'CAPACIDAD_MAXIMA' ? 'danger' : latest.alert === 'ADVERTENCIA_80' ? 'warning' : 'normal';
  $('occupancyStatus').className = `badge ${level}`; $('occupancyStatus').textContent = !latest ? 'Sin datos' : level==='danger'?'Completo':level==='warning'?'Precaución':'Disponible';
  $('gaugeFill').style.strokeDasharray = `${latest?occupancy/capacity*100:0} 100`;
  $('gaugeFill').style.stroke = level==='danger'?'#c7756b':level==='warning'?'#cdb269':'#83a878';
  $('gaugeNumber').textContent = latest ? occupancy : '—'; $('gaugeLabel').textContent = `de ${capacity} personas`;
  $('gauge').setAttribute('aria-label', latest?`${occupancy} de ${capacity} personas`:'Sin registros de ocupación');
  $('availableSpots').textContent = latest?capacity-occupancy:'—'; $('occupancyPercent').textContent = latest?`${Math.round(occupancy/capacity*100)}%`:'—';
  $('lastSeen').textContent = latest ? `Última actualización: ${shortDate(latest.date)}, ${latest.timestamp.slice(11)}` : 'Esperando el primer evento';
}

function renderTable(events) {
  const pageSize = state.page === 'overview' ? 6 : 20;
  const pages = Math.max(1,Math.ceil(events.length/pageSize)); state.pageIndex=Math.min(state.pageIndex,pages-1);
  const ordered = [...events].reverse(), start=state.pageIndex*pageSize;
  $('eventsBody').innerHTML = ordered.slice(start,start+pageSize).map(e=>`<tr><td><div class="event-id" title="${html(e.eventId)}">${html(e.eventId)}</div><div class="event-device">${html(e.deviceId)}</div><span class="date-cell">${html(shortDate(e.date))}</span><span class="time-cell">${html(e.timestamp.slice(11))}</span></td><td><span class="movement ${e.direction==='salida'?'out':e.direction==='indeterminada'?'review':''}"><svg aria-hidden="true"><use href="#${e.direction==='indeterminada'?'i-alert':'i-arrow'}"/></svg>${e.direction==='entrada'?'Entrada':e.direction==='salida'?'Salida':'Paso incompleto'}</span></td><td class="occupancy-cell"><strong>${e.occupancy}</strong><span> de ${e.capacity}</span></td><td><span class="badge ${e.validation==='ACEPTADO'?'normal':e.validation==='RECHAZADO'?'danger':'warning'}">${validationLabel[e.validation]}</span></td><td><span class="reason-label">${reasonLabel[e.reason]}${e.validation==='ACEPTADO' && e.alert!=='NINGUNA'?` · ${e.alert==='CAPACIDAD_MAXIMA'?'Aforo completo':'Aforo alto'}`:''}</span></td></tr>`).join('') || '<tr><td colspan="5" class="empty-state">No hay movimientos para mostrar.<br>Cambia los filtros o prueba el sistema.</td></tr>';
  $('tableCount').textContent = events.length?`${number(start+1)}–${number(Math.min(start+pageSize,events.length))} de ${number(events.length)} eventos`:'0 eventos';
  $('pageCount').textContent=`${state.pageIndex+1} / ${pages}`;
  $('previousPage').disabled=state.pageIndex===0; $('nextPage').disabled=state.pageIndex>=pages-1;
}

function download(text, filename, type='text/plain;charset=utf-8') {
  const url=URL.createObjectURL(new Blob([text],{type})); const a=document.createElement('a'); a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function importFile(file) {
  if (!file) return;
  if (file.size>10*1024*1024) throw new Error('El archivo supera 10 MB. Importa un conjunto más pequeño.');
  const text=(await file.text()).replace(/^\uFEFF/,''); let records;
  if(file.name.toLowerCase().endsWith('.csv')) records=parseCSV(text);
  else if(text.trim().startsWith('[')) records=JSON.parse(text);
  else records=text.split(/\r?\n/).filter(line=>line.trim().startsWith('{')).map(line=>JSON.parse(line));
  if(!Array.isArray(records)||!records.length) throw new Error('No se encontraron eventos. Usa eventos_iot.csv o las líneas JSON del monitor serial.');
  if(records.length>20000) throw new Error('Importa como máximo 20.000 eventos por archivo.');
  const normalized=records.map((raw,i)=>{try{return normalizeEvent(raw,{origin:'IMPORTADO',sessionId:'importado'});}catch(e){throw new Error(`Registro ${i+1}: ${e.message}`);}});
  const keys=new Set(); const unique=normalized.filter(e=>{if(keys.has(e.key))return false;keys.add(e.key);return true;});
  unique.sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||a.sequence-b.sequence);
  state.historyRevision++;state.history=unique;state.historyName=file.name;selectMode('history');selectPage('overview');toast(`${number(unique.length)} eventos importados${unique.length<normalized.length?' · duplicados omitidos':''}.`);
}

function renderConnection() {
  const fresh=state.lastSeen && Date.now()-state.lastSeen<30000;
  const simulatorState=state.connected&&fresh?'online':state.connected?'waiting':'offline';
  const status=simulatorState==='online'?'Simulador conectado':simulatorState==='waiting'?'Esperando simulador':state.connecting?'Conectando…':'Desconectado';
  $('brokerStatus').textContent=status;$('brokerStatus').className=`badge ${simulatorState==='online'?'normal':simulatorState==='waiting'?'warning':'neutral'}`;$('connectionPill').textContent=status;
  $('navDot').classList.toggle('online',simulatorState==='online');$('navDot').classList.toggle('waiting',simulatorState==='waiting');$('connectButton').disabled=state.connected||state.connecting;$('disconnectButton').disabled=!state.client;$('topicInput').disabled=Boolean(state.client);
  $('deviceStatus').textContent=state.connected&&fresh?'Señal reciente':state.lastSeen?'Sin señal reciente':'Sin señal';
  $('receivedCount').textContent=number(state.received);$('invalidCount').textContent=number(state.invalid);
  const titles={online:'Conexión exitosa con Wokwi',waiting:'Esperando señal del simulador',offline:'Simulador desconectado'};
  const messages={online:`Recibiendo datos del ESP32${state.gaps?` · ${state.gaps} posibles eventos perdidos`:''}.`,waiting:'La página está lista. Inicia Wokwi y pulsa ▶ para recibir la señal.',offline:'Conecta el panel para recibir los datos de Wokwi.'};
  $('simulatorConnection').className=`simulator-connection ${simulatorState}`;$('simulatorConnectionTitle').textContent=titles[simulatorState];$('simulatorConnectionText').textContent=messages[simulatorState];
  $('livePrompt').className=`simulator-banner ${simulatorState}`;$('simulatorBannerTitle').textContent=titles[simulatorState];$('livePromptText').textContent=messages[simulatorState];$('goConnect').hidden=simulatorState==='online';$('goConnect').textContent=simulatorState==='waiting'?'Ver conexión':'Conectar Wokwi';
}

function connect() {
  const topic=$('topicInput').value.trim();
  if(!validateTopic(topic)){toast('Usa un canal smart-tourism/…/events, sin espacios ni comodines.');return;}
  if(!window.mqtt){error('No se pudo cargar MQTT.js. Recarga la página o ejecuta npm run sync-data.');return;}
  if(state.client)return;
  if(topic!==state.topic){state.live=[];state.seen.clear();state.liveSequences.clear();state.received=0;state.invalid=0;state.lastSeen=0;state.gaps=0;state.heartbeat=null;}
  state.topic=topic;try{localStorage.setItem('smarttourism.topic',topic);}catch{}
  state.connecting=true;$('mqttFeedback').textContent='Conectando al broker público de pruebas…';renderConnection();
  const client=window.mqtt.connect(DEFAULT_BROKER,{clientId:`st-web-${crypto.randomUUID().slice(0,12)}`,clean:true,keepalive:30,reconnectPeriod:4000,connectTimeout:12000,protocolVersion:4});state.client=client;
  client.on('connect',()=>{
    if(state.client!==client)return;
    client.subscribe([topic,topic.replace(/\/events$/,'/status')],{qos:0},(err,granted)=>{
      if(state.client!==client)return;
      if(err||!granted?.length||granted.some(g=>g.qos===128)){$('mqttFeedback').textContent='El broker rechazó la suscripción. Desconecta y vuelve a intentarlo.';renderConnection();return;}
      state.connected=true;state.connecting=false;$('mqttFeedback').textContent='Canal suscrito. Inicia el firmware actualizado en Wokwi.';renderConnection();
    });
  });
  client.on('message',(receivedTopic,payload,packet)=>{
    if(state.client!==client)return;
    try{
      if(payload.length>4096)throw new Error('Mensaje demasiado grande');
      const raw=JSON.parse(payload.toString());
      if(receivedTopic.endsWith('/status')){
        if(raw.type!=='heartbeat'||!/^ACCESO-[\w-]+$/.test(raw.deviceId)||!/^[\w.-]{1,80}$/.test(raw.sessionId)||!Number.isInteger(raw.occupancy)||raw.occupancy<0||raw.occupancy>10||raw.capacity!==10)throw new Error('Estado no válido');
        if(!packet.retain){state.lastSeen=Date.now();state.heartbeat=raw;state.heartbeatRevision=++state.messageRevision;handleIncomingAlert({...raw,alert:alertFor(raw.occupancy,raw.capacity),validation:'ACEPTADO',reason:'A_B'});if(state.mode==='live')render();}
        if(Number.isInteger(raw.dropped)&&raw.dropped>0)$('mqttFeedback').textContent=`El dispositivo informa ${raw.dropped} eventos descartados por falta de conexión.`;
      }else if(receivedTopic===topic){
        if(!raw.sessionId)throw new Error('Actualiza el firmware: falta sessionId.');
        const event=normalizeEvent(raw,{origin:'WOKWI'});
        if(state.seen.has(event.key))return;
        const session=`${event.deviceId}:${event.sessionId}`, previous=state.liveSequences.get(session)||0;
        if(event.sequence<=previous)return;
        if(previous&&event.sequence>previous+1)state.gaps+=event.sequence-previous-1;
        state.liveSequences.set(session,event.sequence);
        state.seen.add(event.key);state.live.push(event);state.received++;state.eventRevision=++state.messageRevision;handleIncomingAlert(event);
        if(state.live.length>5000){const removed=state.live.shift();state.seen.delete(removed.key);}
        if(!packet.retain)state.lastSeen=Date.now();
        if(state.mode==='live') { if(!$('fromDate').value)$('fromDate').value=event.date; if(!$('toDate').value||$('toDate').value<event.date)$('toDate').value=event.date; render(); }
      }
    }catch{state.invalid++;$('mqttFeedback').textContent='Se descartó un mensaje con formato no válido. Comprueba el firmware y el canal.';}
    renderConnection();
  });
  client.on('reconnect',()=>{if(state.client!==client)return;state.connecting=true;state.connected=false;$('mqttFeedback').textContent='Intentando recuperar la conexión…';renderConnection();});
  client.on('close',()=>{if(state.client!==client)return;state.connected=false;state.connecting=true;renderConnection();});
  client.on('error',()=>{if(state.client!==client)return;$('mqttFeedback').textContent='No se pudo conectar. Comprueba tu Internet; el broker público puede no estar disponible.';renderConnection();});
  renderConnection();
}

function disconnect() {const client=state.client;state.client=null;state.connected=false;state.connecting=false;state.lastSeen=0;client?.end(true);$('mqttFeedback').textContent='Desconectado. Los eventos recibidos siguen disponibles hasta cerrar esta pestaña.';renderConnection();}

document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>selectMode(b.dataset.mode)));
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>selectPage(b.dataset.page)));
document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();selectPage('overview');});
for(const id of ['fromDate','toDate','directionFilter','validationFilter'])$(id).addEventListener('change',()=>{state.pageIndex=0;render();if(!$('fromDate').checkValidity())$('fromDate').reportValidity();});
$('searchInput').addEventListener('input',()=>{state.pageIndex=0;render();});
$('allDates').addEventListener('click',()=>{resetDates();state.pageIndex=0;render();});
$('clearFilters').addEventListener('click',()=>{clearFilters();resetDates();render();});
$('previousPage').addEventListener('click',()=>{state.pageIndex--;render();});$('nextPage').addEventListener('click',()=>{state.pageIndex++;render();});
$('viewAll').addEventListener('click',()=>selectPage('events'));$('goConnect').addEventListener('click',()=>selectPage('connection'));
$('exportButton').addEventListener('click',()=>download(exportCSV(state.filtered),`smart-tourism-${state.mode}-${localTime().slice(0,10)}.csv`,'text/csv;charset=utf-8'));
$('importButton').addEventListener('click',()=>$('importFile').click());$('importFile').addEventListener('change',async e=>{try{await importFile(e.target.files[0]);}catch(err){error(err.message);}finally{e.target.value='';}});
for(const [id,direction] of [['demoEntry','entrada'],['demoExit','salida'],['demoIncomplete','indeterminada']])$(id).addEventListener('click',()=>{const event=makeDemoEvent(state.demo,direction);state.demo.push(event);handleIncomingAlert(event);if(state.demo.length>5000)state.demo.shift();resetDates();state.pageIndex=0;render();});
$('demoReset').addEventListener('click',()=>{state.demo=[];state.alertLevel=0;resetDates();clearFilters();render();toast('Demostración reiniciada.');});
$('audioToggle').addEventListener('click',()=>toggleAudio().catch(()=>toast('No se pudo activar el sonido.')));$('openAlerts').addEventListener('click',()=>selectPage('alerts'));
$('connectButton').addEventListener('click',connect);$('disconnectButton').addEventListener('click',disconnect);
$('downloadConfig').addEventListener('click',()=>{try{download(firmwareConfig($('topicInput').value.trim()),'config.h');}catch(err){toast(err.message);}});
try{const saved=localStorage.getItem('smarttourism.topic');if(saved&&validateTopic(saved))state.topic=saved;}catch{}
$('topicInput').value=state.topic;
setInterval(renderConnection,5000);
window.addEventListener('beforeunload',()=>state.client?.end(true));
window.addEventListener('resize',()=>requestAnimationFrame(()=>{const stats=summarize(state.filtered);drawFlow(stats.days);drawOccupancy(stats.days);}));

selectPage('overview');selectMode('history');
const revision=state.historyRevision;
try{
  const response=await fetch('./data/eventos_iot.csv');if(!response.ok)throw new Error(`No se pudo cargar el CSV (HTTP ${response.status}).`);
  const rows=parseCSV(await response.text());const events=rows.map(raw=>normalizeEvent(raw,{origin:'SIMULADO'}));
  if(revision===state.historyRevision){state.history=events;state.historyName='Datos sintéticos · octubre 2026';if(state.mode==='history')resetDates();render();}
}catch(err){error(`${err.message} Puedes importar eventos_iot.csv manualmente o usar la demostración.`);}
