/* Sorgiva Synth 0.27.0-beta1-rc1 — intelligent adaptive governor.
 * Independent from voice DSP, preset format and real-time AudioContext graph.
 * Offline throughput is a proxy, NEVER a CPU percentage or dropout guarantee.
 */
(function () {
  "use strict";
  const KEY = "sorgivaSynth.adaptivePerformance.v1";
  // Relative planning weights; not measured CPU percentages. Recalibration is
  // documented in docs/ADAPTIVE_PERFORMANCE_v0_27_0a13.md.
  const WEIGHTS = Object.freeze({baseVoice: 2, oscillatorLayer: 1.0, noise: 1.1, filter: 0.55,
    advancedFilter: 1.1, filterDrive: 0.65, lfo: 0.32, modulationSlot: 0.18,
    fm: 1.9, ringMod: 0.8, oscSync: 1.2, globalFx: 2.0, releaseWeight: 0.75});
  const DEFAULT_MANUAL = Object.freeze({voices: 12, layers: 12, tails: 24, generators: 320});
  const VALID = ["AUTO", "ECO", "STUDIO", "MANUALE"];
  const cap = (v, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(v)) ? Number(v) : lo));
  const integer = (v, lo, hi) => Math.round(cap(v, lo, hi));
  let mode = "AUTO", automatic = true, manual = {...DEFAULT_MANUAL};
  let hardware = null, benchmark = {status: "non eseguito", samples: [], completedAt: null};
  let busy = false, aborted = false, interventionCount = 0, lastAction = "Nessuno";
  let uiTimer = null, startTimer = null, healthTimer = null, healthLastTick = null;
  // Advisory scheduling health only. Event loop lag is NOT audio CPU or an xrun counter.
  // Sustained, foreground, high-cost lag tightens admission for future voices only.
  const GOVERNOR = Object.freeze({intervalMs:1000, lagTriggerMs:120, lagClearMs:45,
    minLoadPercent:55, minSounding:2, consecutiveBad:3, consecutiveGood:12,
    cooldownMs:10000, minimumFactor:0.70, downStep:0.10, upStep:0.05});
  const health = {factor:1, state:"stabile", lastLagMs:null, bad:0, good:0,
    lastChangeAt:0, reductions:0, recoveries:0, deferredNotes:0, samples:0};

  function dynamicEnabled() { return automatic && mode === "AUTO"; }
  function resetDynamic(reason="inattivo") {
    health.factor=1;health.state=reason;health.bad=0;health.good=0;health.lastLagMs=null;
    health.lastChangeAt=0;
  }
  // Deterministic, testable policy. No audio/DSP node changes, no automatic preset edits.
  function observeHealth(sample, timestamp=Date.now()) {
    const lag=Number(sample?.lagMs);
    const sounding=Number(sample?.sounding)||0;
    const load=Number(sample?.estimatedLoadPercent)||0;
    const visible=sample?.visible===true;
    const running=sample?.running===true;
    const playing=visible && running && sounding>=GOVERNOR.minSounding;
    const t=Number(timestamp);
    if (!dynamicEnabled()) {resetDynamic("disattivato");return {...health};}
    if (!visible || !running || !Number.isFinite(lag) || lag<0 || lag>10000 || !Number.isFinite(t)) {
      health.bad=0;health.good=0;health.state="osservazione sospesa";
      return {...health};
    }
    health.samples++;
    health.lastLagMs=Math.round(lag);
    // A CPU-congested UI may coexist with perfectly uninterrupted audio.
    // Require repeated delay AND a demanding, sounding patch before adjustment.
    if(playing && load>=GOVERNOR.minLoadPercent && lag>=GOVERNOR.lagTriggerMs) {
      health.bad++;health.good=0;
      health.state="ritardi di scheduling osservati";
      if(health.bad>=GOVERNOR.consecutiveBad && t-health.lastChangeAt>=GOVERNOR.cooldownMs) {
        const old=health.factor;
        health.factor=Math.max(GOVERNOR.minimumFactor,Math.round((old-GOVERNOR.downStep)*100)/100);
        health.bad=0;
        if(health.factor<old) {
          health.reductions++;health.lastChangeAt=t;
          health.state="capacità nuove voci ridotta";
          intervention(`Ritardi ripetuti · limite nuove voci ${Math.round(health.factor*100)}%`);
        }
      }
    } else if(lag<=GOVERNOR.lagClearMs && (playing || health.factor<1)) {
      health.bad=0;health.good++;
      if(health.factor<1 && health.good>=GOVERNOR.consecutiveGood && t-health.lastChangeAt>=GOVERNOR.cooldownMs) {
        health.factor=Math.min(1,Math.round((health.factor+GOVERNOR.upStep)*100)/100);
        health.good=0;health.lastChangeAt=t;health.recoveries++;
        health.state=health.factor===1?"capacità ripristinata":"recupero graduale";
      } else if(health.factor===1) health.state="stabile";
    } else {health.bad=0;health.good=0;if(health.factor===1)health.state="stabile";}
    return {...health};
  }
  function healthTick() {
    const t=performance.now();
    const lag=healthLastTick===null?null:Math.max(0,t-healthLastTick-GOVERNOR.intervalMs);
    healthLastTick=t;
    const audio=window.SynthXAudio;
    const status=audio?.getVoiceManagementStatus?.()||{};
    const patch=audio?.getAdaptiveVoiceConfig?.()||{};
    const sounding=(status.activeVoices||0)+(status.releaseTails||0)+(status.scheduledShots||0);
    const estimated=estimate(patch,status.activeVoices||0,status.releaseTails||0);
    const base=deriveLimits(hardware,benchmark,mode,manual,automatic).budgetUnits;
    const visible=typeof document!=="undefined" && document.visibilityState==="visible";
    observeHealth({lagMs:lag, sounding, estimatedLoadPercent:base>0?estimated.total/base*100:0,
      visible,running:audio?.getContext?.()?.state==="running"});
  }
  function shouldDeferNewVoice(activeCount, voiceCap) {
    return dynamicEnabled() && health.factor<1 && activeCount>=Math.max(1,voiceCap);
  }
  function recordDeferredVoice() {health.deferredNotes++;lastAction="Nuova nota rinviata; note tenute preservate";interventionCount++;draw();}


  function profile(context) {
    const nav = typeof navigator !== "undefined" ? navigator : {};
    const ctx = context || window.SynthXAudio?.getContext?.();
    return {
      logicalProcessors: Number.isFinite(nav.hardwareConcurrency) ? integer(nav.hardwareConcurrency,1,256) : null,
      deviceMemoryGiB: Number.isFinite(nav.deviceMemory) ? cap(nav.deviceMemory,0.25,256) : null,
      userAgent: String(nav.userAgent || "non disponibile").slice(0, 180),
      audioContext: !!(window.AudioContext || window.webkitAudioContext),
      offlineAudioContext: !!(window.OfflineAudioContext || window.webkitOfflineAudioContext),
      sampleRate: Number(ctx?.sampleRate) || null,
      baseLatencySeconds: Number.isFinite(ctx?.baseLatency) ? ctx.baseLatency : null,
      outputLatencySeconds: Number.isFinite(ctx?.outputLatency) ? ctx.outputLatency : null
    };
  }
  function estimate(patch, active = 0, tails = 0) {
    const cfg = patch || {};
    const activeOsc = (cfg.oscillators || []).filter(o => o && o.enabled && Number(o.level)>0).length;
    const layers = cfg.unison?.enabled ? integer(cfg.unison.voices,1,12) : 1;
    const filterCount = Object.values(cfg.filters || {}).filter(v=>v && v.enabled).reduce((n,v)=>n+(Number(v.slope)===24 ? 1.6 : 1),0);
    const lfoCount = (cfg.lfos || []).filter(l=>l && l.enabled && Number(l.depth)>0).length;
    const matrixCount = (cfg.modulationMatrix || []).filter(s=>s && s.enabled && Number(s.amount)!==0).length;
    const voiceUnit = WEIGHTS.baseVoice + activeOsc*layers*WEIGHTS.oscillatorLayer + (cfg.noise?.enabled?WEIGHTS.noise:0)
      + filterCount*WEIGHTS.filter + (cfg.advancedFilter?.enabled?WEIGHTS.advancedFilter:0)
      + (cfg.filterDrive?.enabled?WEIGHTS.filterDrive:0) + lfoCount*WEIGHTS.lfo
      + matrixCount*WEIGHTS.modulationSlot + (cfg.fm?.enabled&&cfg.fm.amount>0?WEIGHTS.fm:0)
      + (cfg.ringMod?.enabled&&cfg.ringMod.amount>0?WEIGHTS.ringMod:0)
      + (cfg.oscSync?.enabled&&cfg.oscSync.amount>0?WEIGHTS.oscSync:0);
    const generatorPerVoice = activeOsc*layers + (cfg.noise?.enabled?1:0);
    const globalFx = ['saturation','modulation','delay','reverb'].filter(k=>cfg[k]?.enabled).length * WEIGHTS.globalFx;
    return {voiceUnit:Math.max(1,voiceUnit),generatorsPerVoice:generatorPerVoice,
      total:Math.max(0,active)*voiceUnit+Math.max(0,tails)*voiceUnit*WEIGHTS.releaseWeight+globalFx,
      active, tails, globalFx, layers, oscillators:activeOsc};
  }
  function deriveLimits(hw, bench, selected = "AUTO", manualLimits = DEFAULT_MANUAL, enabled = true) {
    const cores = Number(hw?.logicalProcessors);
    const known = Number.isFinite(cores) && cores > 0;
    // Hardware counters are only a rough hint: a logical core is NOT audio capacity.
    let base = !known ? 64 : cores<=2?80:cores<=4?160:cores<=8?320:480;
    const samples = Array.isArray(bench?.samples) ? bench.samples.filter(s=>s?.renderMs>0 && s?.renderSeconds>0) : [];
    const valid = bench?.status === "completato" && samples.length>=2;
    if (valid) {
      const ratios=samples.map(s=>s.renderMs/(s.renderSeconds*1000)).sort((a,b)=>a-b);
      // Rendering offline may run on a different execution path from live DSP.
      const middle = ratios[Math.floor(ratios.length/2)];
      if (middle>1.25) base*=0.65;
      else if (middle>0.45) base*=0.80;
      else if (middle<0.13) base*=1.15;
    }
    const factor=selected==="ECO"?0.62:selected==="STUDIO"?1.22:1;
    const manualMode=selected==="MANUALE" || !enabled;
    const safeBudget=base*factor;
    return {
      profile: selected, automatic:!manualMode,
      budgetUnits:Math.round(safeBudget*10)/10,
      voiceCeiling: manualMode?integer(manualLimits.voices,1,64):selected==="ECO"?12:selected==="STUDIO"?32:24,
      unisonLimit: manualMode?integer(manualLimits.layers,1,12):selected==="ECO"?3:12,
      unisonRecommended: selected==="ECO"?3:selected==="STUDIO"?8:known&&cores<=2?3:6,
      tailCapacity:manualMode?integer(manualLimits.tails,4,96):selected==="ECO"?12:selected==="STUDIO"?40:24,
      generatorTailCapacity:manualMode?integer(manualLimits.generators,32,2048):selected==="ECO"?180:selected==="STUDIO"?560:320,
      generatorCeiling:manualMode?integer(manualLimits.voices,1,64)*integer(manualLimits.layers,1,12)*3:
        Math.max(24,Math.round(safeBudget*2.5)),
      reservePercent: selected==="STUDIO"?15:selected==="ECO"?35:25,
      benchmarkValid: valid
    };
  }
  function limits(patch, requested = 12, runtime = {}) {
    const derived=deriveLimits(hardware,benchmark,mode,manual,automatic);
    const load=estimate(patch,Number(runtime.activeVoices)||0,Number(runtime.releaseTails)||0);
    const safePerVoice=Math.max(1,load.voiceUnit);
    const available=Math.max(safePerVoice,derived.budgetUnits-load.globalFx);
    let poly=!automatic ? 64 : mode==="MANUALE" ? derived.voiceCeiling : Math.max(1,Math.floor(available/safePerVoice));
    if (mode!=="MANUALE" && automatic && load.generatorsPerVoice>0) poly=Math.min(poly,Math.max(1,Math.floor(derived.generatorCeiling/load.generatorsPerVoice)));
    poly=Math.max(1,Math.min(64,derived.voiceCeiling,poly));
    const staticPoly=poly;
    // Operate only on the new voice admission ceiling, never on existing DSP.
    // ECO, STUDIO, MANUALE and bypass retain alpha13 limits.
    if(dynamicEnabled()) poly=Math.max(1,Math.min(poly,Math.floor(poly*health.factor)));

    const desired=integer(requested,1,64);
    return {...derived, recommendedPolyphony:poly, staticRecommendedPolyphony:staticPoly, dynamicFactor:dynamicEnabled()?health.factor:1, effectiveVoices: Math.min(desired,poly),
      requestedVoices: desired, estimate:load, estimatedLoadPercent:Math.max(0,Math.round(load.total/derived.budgetUnits*100))};
  }
  function current() {
    const audio=window.SynthXAudio;
    const stats=audio?.getVoiceManagementStatus?.() || {};
    const patch=audio?.getAdaptiveVoiceConfig?.() || {};
    const requested=integer(window.SynthXState?.getParameter?.("voices")??12,1,64);
    return limits(patch,requested,stats);
  }
  function voiceLimit(patch, requested) {return automatic?limits(patch,requested).effectiveVoices:integer(requested,1,64);}
  function staticVoiceLimit() {
    const p=window.SynthXAudio?.getAdaptiveVoiceConfig?.()||{};
    const requested=integer(window.SynthXState?.getParameter?.("voices")??12,1,64);
    const r=limits(p,requested);
    return Math.min(requested,r.staticRecommendedPolyphony);
  }
  function unisonLimit() {return automatic?deriveLimits(hardware,benchmark,mode,manual,automatic).unisonLimit:12;}
  function tailLimits() {
    const x=deriveLimits(hardware,benchmark,mode,manual,automatic);
    return automatic?{count:x.tailCapacity,generators:x.generatorTailCapacity}:null;
  }
  function intervention(message) {interventionCount++; lastAction=String(message||"Limite risorse applicato"); draw();}
  function hasSound() {
    const a=window.SynthXAudio;
    const s=a?.getVoiceManagementStatus?.();
    return !!(s && (s.activeVoices || s.releaseTails || s.scheduledShots)) ||
      !!window.SynthXSequencer?.getStatus?.()?.running || !!window.SynthXArpeggiator?.getStatus?.()?.running;
  }
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  async function runBenchmark() {
    if (busy) return {status:"in corso"};
    if (hasSound()) { draw();return {status:"rinviato: note o code attive", lastBenchmark:benchmark.status}; }
    const Ctor=window.OfflineAudioContext||window.webkitOfflineAudioContext;
    if (!Ctor) {benchmark={status:"non supportato",samples:[],completedAt:null};draw();return benchmark;}
    busy=true;aborted=false;benchmark={status:"in corso",samples:[],completedAt:null};draw();
    const samples=[];
    try {
      const jsStart=performance.now(); let checksum=0;
      for (let k=0;k<12000;k++) checksum+=Math.sin(k*0.1)*Math.cos(k*0.07);
      const jsMs=performance.now()-jsStart;
      if (!Number.isFinite(checksum)) throw Error("benchmark JavaScript non valido");
      // Unconnected live audio graph is never used. The output stays in an offline buffer.
      // All runs bounded to 0.09s, low sample rate, 4–10 oscillator/filter nodes.
      for (const count of [4,7,10,4,7,10]) {
        await pause();
        if (aborted || hasSound()) throw Error("interrotto: esecuzione musicale in corso");
        const rate=22050, duration=0.09;
        const ctx=new Ctor(1,Math.round(rate*duration),rate);
        const mix=ctx.createGain();mix.gain.value=0.05;mix.connect(ctx.destination);
        const unisonBus=ctx.createGain();unisonBus.gain.value=1/count;unisonBus.connect(mix);
        const t0=performance.now();
        for(let j=0;j<count;j++) {
          const osc=ctx.createOscillator();osc.type=j%2?'sawtooth':'sine';osc.frequency.value=220;
          osc.detune.value=(j-(count-1)/2)*1.5;
          const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=800+j*91;
          osc.connect(filter);filter.connect(unisonBus);osc.start(0);osc.stop(duration-0.005);
        }
        const prepMs=performance.now()-t0;
        const renderStart=performance.now();
        const buffer=await ctx.startRendering();
        const renderMs=performance.now()-renderStart;
        if (aborted || hasSound()) throw Error("interrotto: esecuzione musicale in corso");
        if (buffer.length!==Math.round(rate*duration) || !Number.isFinite(renderMs)) throw Error("render offline invalido");
        samples.push({oscillators:count, filters:count, unisonEquivalentLayers:count,
          preparationMs:Math.round(prepMs*1000)/1000,renderMs:Math.round(renderMs*1000)/1000,
          renderSeconds:duration,rate});
      }
      const variations=[4,7,10].map(count=>{
        const values=samples.filter(s=>s.oscillators===count).map(s=>s.renderMs);
        return values.length===2 ? Math.abs(values[0]-values[1])/Math.max(1,Math.max(...values)) : 1;
      });
      benchmark={status:"completato",samples,jsMs:Math.round(jsMs*1000)/1000,
        stabilityVariationPercent:Math.round(Math.max(...variations)*100),completedAt:new Date().toISOString(),
        note:"Throughput offline; nessuna misura del carico CPU audio reale."};
    } catch(e) {
      benchmark={status:String(e.message).startsWith("interrotto")?"interrotto":"fallito",samples,completedAt:null,error:String(e.message)};
    } finally {busy=false;draw();}
    return benchmark;
  }
  function stopBenchmark() {aborted=true;}
  function safeRead() {
    try {const obj=JSON.parse(localStorage.getItem(KEY)||"null");if(obj&&typeof obj==="object"){
      if(VALID.includes(obj.mode))mode=obj.mode;
      if(typeof obj.automatic==="boolean")automatic=obj.automatic;
      if(obj.manual&&typeof obj.manual==="object") for(const k of Object.keys(DEFAULT_MANUAL))manual[k]=integer(obj.manual[k]??DEFAULT_MANUAL[k],1,2048);
    }}catch(_){} }
  function save() {try{localStorage.setItem(KEY,JSON.stringify({version:1,mode,automatic,manual}));}catch(_){} }
  function selectMode(next) {if(!VALID.includes(next))return false;mode=next;resetDynamic("profilo cambiato");save();draw();window.SynthXControls?.updateUnisonUiStatus?.();return true;}
  function setAutomatic(value) {automatic=!!value;resetDynamic(automatic?"riattivato":"disattivato");save();draw();window.SynthXControls?.updateUnisonUiStatus?.();}
  function setManual(key,value) {const bounds={voices:[1,64],layers:[1,12],tails:[4,96],generators:[32,2048]};if(!bounds[key])return;
    manual[key]=integer(value,...bounds[key]);save();draw();if(key==="layers")window.SynthXControls?.updateUnisonUiStatus?.();}
  function draw() {
    const node=(id)=>document.getElementById(id);
    const modeNode=node("adaptive-profile");if(!modeNode)return;
    modeNode.value=mode;
    const autoNode=node("adaptive-automatic");if(autoNode)autoNode.checked=automatic;
    for(const key of Object.keys(manual)){
      const input=node("adaptive-manual-"+key);if(input){input.value=String(manual[key]);input.disabled=mode!=="MANUALE" || !automatic;}
    }
    const s=current();
    const entries={
      "adaptive-benchmark-state":benchmark.status+(benchmark.stabilityVariationPercent!=null?` · variazione max ${benchmark.stabilityVariationPercent}%`:"")+(benchmark.error?` (${benchmark.error})`:""),
      "adaptive-recommended":String(s.recommendedPolyphony),
      "adaptive-effective":String(s.effectiveVoices),
      "adaptive-unison":`${s.unisonLimit} (consigliati ${s.unisonRecommended})`,
      "adaptive-tail-budget":`${s.tailCapacity} code · ${s.generatorTailCapacity} generatori`,
      "adaptive-load":`${s.estimatedLoadPercent}% del budget stimato (non CPU reale)`,
      "adaptive-governor-state":`${health.state} · capacità ${Math.round(health.factor*100)}%${health.lastLagMs!==null?` · ritardo UI ${health.lastLagMs} ms`:""}`,
      "adaptive-governor-events":`${health.reductions} riduzioni · ${health.recoveries} recuperi · ${health.deferredNotes} nuove note rinviate`,
      "adaptive-interventions":`${interventionCount} · ${lastAction}`,
      "adaptive-hardware":`${hardware?.logicalProcessors??"?"} processori logici · RAM ${hardware?.deviceMemoryGiB??"n/d"} GiB · ${hardware?.sampleRate??"?"} Hz`,
      "adaptive-latency":`Base: ${hardware?.baseLatencySeconds??"n/d"} s · uscita: ${hardware?.outputLatencySeconds??"n/d"} s`
    };
    for(const [id,value] of Object.entries(entries))if(node(id))node(id).textContent=value;
    const button=node("adaptive-run");if(button)button.disabled=busy || hasSound();
    const manualBox=node("adaptive-manual-panel");if(manualBox)manualBox.hidden=mode!=="MANUALE" || !automatic;
  }
  function onAudioUnlocked(ctx) {
    hardware=profile(ctx);draw();
    if (!startTimer && mode==="AUTO" && automatic && benchmark.status==="non eseguito") {
      startTimer=setTimeout(()=>{startTimer=null;if(!hasSound() && benchmark.status==="non eseguito")runBenchmark();},500);
    }
  }
  function init() {
    safeRead();hardware=profile();
    document.getElementById("adaptive-profile")?.addEventListener("change",e=>selectMode(e.target.value));
    document.getElementById("adaptive-automatic")?.addEventListener("change",e=>setAutomatic(e.target.checked));
    for(const key of Object.keys(manual))document.getElementById("adaptive-manual-"+key)?.addEventListener("change",e=>setManual(key,e.target.value));
    document.getElementById("adaptive-run")?.addEventListener("click",()=>runBenchmark());
    draw();if(healthTimer===null)healthTimer=setInterval(healthTick,GOVERNOR.intervalMs);if(uiTimer===null)uiTimer=setInterval(()=>{draw(); if(benchmark.status==="non eseguito" && automatic && mode==="AUTO" && window.SynthXAudio?.getContext?.()?.state==="running" && !busy && !hasSound())runBenchmark();},900);
  }
  window.SorgivaAdaptivePerformance={init,profile,estimate,deriveLimits,limits,current,voiceLimit,unisonLimit,tailLimits,
    onAudioUnlocked,runBenchmark,stopBenchmark,selectMode,setAutomatic,setManual,intervention,
    observeHealth,shouldDeferNewVoice,recordDeferredVoice,staticVoiceLimit,getGovernorPolicy:()=>({...GOVERNOR}),
    getStatus:()=>({mode,automatic,manual:{...manual},hardware,benchmark:{...benchmark},busy,
      governor:{...health},interventionCount,lastAction,limits:current()}),
    getWeights:()=>({...WEIGHTS})};
})();
