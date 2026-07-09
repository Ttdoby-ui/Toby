// ============================================================================
// Futurespin Schläger-Finder – katalogbasierte Empfehlungs-Engine
// ----------------------------------------------------------------------------
// Statt einer hartcodierten 20-Produkte-Liste liest das Quiz das KOMPLETTE
// Belag- und Holz-Sortiment aus dem JSON-Block #sf-catalog-data (gerendert vom
// Snippet schlaeger-finder-data.liquid) und rankt es nach den echten Metafeld-
// Werten (Tempo, Kontrolle, Effet, Härte, Schwammhärte, Gewicht).
//
// Hybrid-Ansatz (Option B): Ein Spielstärke-Raster begrenzt, welche Produkte
// überhaupt in Frage kommen (ein Einsteiger sieht keine Profi-Carbon-Kombi),
// und innerhalb dieses Korridors entscheidet das Wert-Ranking + die Vorhand/
// Rückhand-Logik über die 3 besten Vorschläge pro Slot.
// ============================================================================

const TOTAL = 11;
const KONFIG_URL = "https://www.futurespin.de/pages/schlaeger-konfigurator";

// ----- Katalog laden -------------------------------------------------------
let CATALOG = { belage: [], holzer: [] };
(function loadCatalog(){
  try {
    const el = document.getElementById("sf-catalog-data");
    if (el) {
      const parsed = JSON.parse(el.textContent);
      if (parsed && parsed.belage) CATALOG.belage = parsed.belage;
      if (parsed && parsed.holzer) CATALOG.holzer = parsed.holzer;
    }
  } catch(e){ /* Fallback: leeres Sortiment, Quiz zeigt Hinweis */ }
})();

// ----- Weitere Katalog-Seiten nachladen (Kollektionen >250) ----------------
// #sf-catalog-data enthält nur Seite 1 (paginate-Limit 250 pro Seite). Beläge
// (436) und Hölzer (338) liegen darüber -> die restlichen Seiten werden hier im
// Hintergrund per ?page=N nachgeladen und in CATALOG gemergt, solange der Nutzer
// noch das 11-Schritt-Quiz beantwortet. Zur Auswertung (showResult) steht damit
// der volle Katalog bereit. Ohne Nachladen fehlten die Marken D–Z.
(function lazyLoadCatalog(){
  let pages = 1;
  try {
    const el = document.getElementById("sf-catalog-data");
    if (el) { const d = JSON.parse(el.textContent); pages = parseInt(d && d.pages, 10) || 1; }
  } catch(e){}
  if (pages < 2) return;
  const seenB = {}, seenH = {};
  CATALOG.belage.forEach(function(p){ if (p && p.handle) seenB[p.handle] = 1; });
  CATALOG.holzer.forEach(function(p){ if (p && p.handle) seenH[p.handle] = 1; });
  let pg = 2;
  (function next(){
    if (pg > pages || pg > 20) return;
    fetch(location.pathname + "?page=" + pg, { headers: { "X-Requested-With": "XMLHttpRequest" } })
      .then(function(r){ return r.ok ? r.text() : ""; })
      .then(function(html){
        if (html) {
          try {
            const doc = new DOMParser().parseFromString(html, "text/html");
            const ex = doc.getElementById("sf-catalog-data");
            if (ex) {
              const d = JSON.parse(ex.textContent);
              (d.belage || []).forEach(function(p){ if (p && p.handle && !seenB[p.handle]) { seenB[p.handle] = 1; CATALOG.belage.push(p); } });
              (d.holzer || []).forEach(function(p){ if (p && p.handle && !seenH[p.handle]) { seenH[p.handle] = 1; CATALOG.holzer.push(p); } });
            }
          } catch(e){}
        }
        pg++; next();
      })
      .catch(function(){ pg++; next(); });
  })();
})();

// Zahlen-Helfer: "" / null -> NaN, sonst Number
function num(v){
  if (v === null || v === undefined || v === "") return NaN;
  const n = Number(String(v).replace(",", "."));
  return isNaN(n) ? NaN : n;
}
function hasVals(p){ return !isNaN(num(p.tempo)) || !isNaN(num(p.kontrolle)) || !isNaN(num(p.effet)); }

// Schwammhärte-Wort -> grober Zahlenwert (0-100), nur als Zusatzsignal
const HAERTE_WORD = { "soft":25, "soft-medium":40, "medium":55, "medium-hard":70, "hard":85 };
function haerteScore(p){
  // bevorzugt numerische Härte (Hölzer = Biegesteifigkeit), sonst Wort (Beläge)
  const n = num(p.haerte);
  if (!isNaN(n)) return n;
  const w = (p.schwammhaerte||"").toLowerCase();
  return HAERTE_WORD[w] != null ? HAERTE_WORD[w] : NaN;
}

// ----- Belag-Typen über productType ---------------------------------------
// Shop-productType-Werte:
//  "Noppen Innen - Offensiv" / " - Allround" / " - Defensiv"
//  "Kurze Noppe", "Halblange Noppe", "Lange Noppe", "Anti"
function belagClass(p){
  const t = (p.type||"").toLowerCase();
  if (t.indexOf("lange noppe") >= 0 && t.indexOf("halb") < 0) return "long_pips";
  if (t.indexOf("halblange") >= 0) return "short_pips"; // halblang zu kurz gezählt
  if (t.indexOf("kurze noppe") >= 0) return "short_pips";
  if (t.indexOf("anti") >= 0) return "anti";
  if (t.indexOf("noppen innen") >= 0) return "ni";
  return "ni"; // Standardannahme: normaler Noppen-Innen-Belag
}
// Charakter eines Noppen-Innen-Belags aus dem productType
function niCharacter(p){
  const t = (p.type||"").toLowerCase();
  if (t.indexOf("offensiv") >= 0) return "offensiv";
  if (t.indexOf("defensiv") >= 0) return "defensiv";
  if (t.indexOf("allround") >= 0) return "allround";
  return "allround";
}

// ----- Holz-Typen über productType -----------------------------------------
//  "Vollholz 5 Schichten", "Vollholz 7 Schichten", "Carbon-Holz", "Kunstfaser-Holz"
function holzClass(p){
  const t = (p.type||"").toLowerCase();
  if (t.indexOf("carbon") >= 0) return "carbon";
  if (t.indexOf("kunstfaser") >= 0) return "kunstfaser";
  if (t.indexOf("7 schicht") >= 0) return "voll7";
  if (t.indexOf("5 schicht") >= 0) return "voll5";
  if (t.indexOf("vollholz") >= 0) return "voll5";
  return "voll5";
}

// ----- Fragen (unverändert) -------------------------------------------------
const questions = [
  {text:"Wie lange spielst du schon Tischtennis?", hint:"", options:[
    {label:"Weniger als 1 Jahr",sub:"",val:0},{label:"1 bis 3 Jahre",sub:"",val:1},
    {label:"3 bis 7 Jahre",sub:"",val:2},{label:"Mehr als 7 Jahre",sub:"",val:3}]},
  {text:"Wie oft trainierst du pro Woche?", hint:"", options:[
    {label:"Gelegentlich / Freizeit",sub:"Kein fester Rhythmus",val:0},{label:"1 bis 2 Mal",sub:"Regelmäßiges Hobby/Vereinstraining",val:1},
    {label:"3 bis 4 Mal",sub:"Ambitioniertes Training",val:2},{label:"5 Mal oder öfter",sub:"Leistungsorientiert",val:3}]},
  {text:"Spielst du in einem Verein oder an Wettkämpfen?", hint:"", options:[
    {label:"Nein – nur privat",sub:"Keller, Garten, Freunde",val:0},{label:"Gelegentlich Vereinstraining",sub:"Keine aktive Ligasaison",val:1},
    {label:"Verein, Kreisliga",sub:"Aktive Medenrunde",val:2},{label:"Bezirksliga oder höher",sub:"Ernsthafter Wettkampfsport",val:3}]},
  {text:"Was beschreibt deinen Spielstil am besten?", hint:"", options:[
    {label:"Kontrolliert und sicher",sub:"Wenig Fehler, geduldig",val:"control"},{label:"Topspin & viel Rotation",sub:"Aktives Topspinspiel",val:"spin"},
    {label:"Schnell & aggressiv",sub:"Druck machen, direkt",val:"speed"},{label:"Ich entwickle noch meinen Stil",sub:"",val:"any"}]},
  {text:"Wo spielst du am liebsten?", hint:"", options:[
    {label:"Nah am Tisch",sub:"Kurzes Spiel, Konter, Blocks",val:"short"},{label:"Mittlere Distanz",sub:"Topspin aus der Halbdistanz",val:"mid"},
    {label:"Weit vom Tisch",sub:"Abwehr, Unterschnitt",val:"far"},{label:"Variabel",sub:"Je nach Situation",val:"any"}]},
  {text:"Wie bewertest du deine Technik?", hint:"", options:[
    {label:"Ich lerne noch die Grundschläge",sub:"Basics: VH, RH, Aufschlag",val:0},{label:"Grundschläge sitzen, Details fehlen",sub:"Topspin kommt, Konsistenz fehlt",val:1},
    {label:"Solide Technik, ich feile an Details",sub:"Variationen, Gegentopspin",val:2},{label:"Ausgereift und wettkampferprobt",sub:"",val:3}]},
  {text:"Was ist dein Ziel beim Tischtennis?", hint:"", options:[
    {label:"Spaß haben",sub:"Freizeit & Geselligkeit",val:0},{label:"Besser werden",sub:"Hobby ernstnehmen",val:1},
    {label:"Im Verein aufsteigen",sub:"Liga-Erfolge",val:2},{label:"Maximale Leistung",sub:"Wettkampf, Turniere",val:3}]},
  {text:"Spielst du auf einer Seite Spezial-Material?", hint:"Klassisch ist beidseitig Noppen-Innen. Spezialbeläge stören den Gegner oder erlauben schnelle Konter.", options:[
    {label:"Nein – beidseitig Noppen-Innen",sub:"Klassischer Aufbau",val:"none"},{label:"Ja – kurze Noppen",sub:"Blockspiel, schnelle Konter",val:"short_pips"},
    {label:"Ja – lange Noppen",sub:"Störeffekt, Schnittumkehr",val:"long_pips"},{label:"Ja – Anti-Top",sub:"Schnittumkehr, passiver Störeffekt",val:"anti"}]},
  {text:"Was ist dein Budget für den kompletten Schläger?", hint:"Gesamtpreis für 2 Beläge + Holz (ohne Montage). Hilft uns, passende Kombinationen vorzuschlagen.", options:[
    {label:"Bis 80 €",sub:"Einsteiger-Setup",val:"budget"},{label:"80 – 150 €",sub:"Solides Vereins-Setup",val:"mid"},
    {label:"150 – 250 €",sub:"Leistungs-Setup",val:"premium"},{label:"Über 250 €",sub:"High-End",val:"top"}]},
  {text:"Welche Seite ist deine stärkere bzw. aktivere?", hint:"Damit empfehlen wir der starken Seite einen offensiveren, spinstärkeren Belag und der schwächeren Seite einen kontrollierteren.", options:[
    {label:"Vorhand stärker",sub:"Vorhand-dominanter Spieler",val:"fh"},{label:"Ausgeglichen",sub:"Beide Seiten gleich stark",val:"balanced"},
    {label:"Rückhand stärker",sub:"Rückhand-dominanter Spieler",val:"bh"}]},
  {text:"Gibt es etwas, das wir sonst noch wissen sollten?", hint:"Optional – je mehr wir wissen, desto besser. Z. B. Spielhand, Verletzungen, bisheriges Material, spezielle Wünsche.", options:[], freetext:true}
];

const budgetMap={budget:"bis 80 €",mid:"80–150 €",premium:"150–250 €",top:"über 250 €"};
const budgetMax={budget:80,mid:150,premium:250,top:99999};
const matLabel={none:null,short_pips:"Kurze Noppen",long_pips:"Lange Noppen",anti:"Anti-Top"};

let answers=[], freeText="", currentQ=0, selectedVal=null;

// ----- Frage-Rendering (unverändert) ---------------------------------------
function renderQuestion(){
  const q=questions[currentQ];
  const letters=["A","B","C","D"];
  document.getElementById("q-number").textContent="Frage "+(currentQ<9?"0":"")+(currentQ+1);
  document.getElementById("q-text").textContent=q.text;
  const hintEl=document.getElementById("q-hint");
  hintEl.textContent=q.hint||""; hintEl.style.display=q.hint?"block":"none";
  document.getElementById("q-current").textContent=currentQ+1;
  document.getElementById("progress-fill").style.width=((currentQ+1)/TOTAL*100)+"%";
  if(q.freetext){
    selectedVal="ok";
    document.getElementById("q-options").innerHTML="";
    document.getElementById("freetext-section").innerHTML=`
      <div class="freetext-wrap">
        <label class="freetext-label">Deine Angaben (optional):</label>
        <textarea class="freetext-input" id="freetext-input" placeholder="z. B.: Linkshänder, hatte eine Ellbogenverletzung, spiele bisher Donic-Beläge, möchte mehr Spin auf der Vorhand …">${freeText}</textarea>
      </div>`;
    document.getElementById("btn-next").disabled=false;
    document.getElementById("btn-next").textContent="Auswahl anzeigen ✓";
  } else {
    selectedVal=answers[currentQ]!==undefined?answers[currentQ]:null;
    document.getElementById("freetext-section").innerHTML="";
    document.getElementById("q-options").innerHTML=q.options.map((o,i)=>{
      const sel=selectedVal===o.val?" selected":"";
      return `<button class="option${sel}" onclick="selectOption(this,'${String(o.val).replace(/'/g,"\\'")}')">
        <div class="option-letter">${letters[i]}</div>
        <div class="option-content"><div class="option-label">${o.label}</div>${o.sub?`<div class="option-sub">${o.sub}</div>`:""}</div>
      </button>`;
    }).join("");
    document.getElementById("btn-next").disabled=selectedVal===null;
    document.getElementById("btn-next").textContent=currentQ===TOTAL-1?"Auswahl anzeigen ✓":"Weiter →";
  }
  document.getElementById("btn-back").style.visibility=currentQ===0?"hidden":"visible";
  const c=document.getElementById("question-card");c.style.animation="none";void c.offsetWidth;c.style.animation="";
}
function selectOption(el,val){
  document.querySelectorAll(".option").forEach(o=>o.classList.remove("selected"));
  el.classList.add("selected");
  selectedVal=isNaN(val)?val:Number(val);
  document.getElementById("btn-next").disabled=false;
}
function goNext(){
  if(selectedVal===null)return;
  if(questions[currentQ].freetext){const ta=document.getElementById("freetext-input");if(ta)freeText=ta.value.trim();}
  else answers[currentQ]=selectedVal;
  if(currentQ<TOTAL-1){currentQ++;renderQuestion();}else showResult();
}
function goBack(){
  if(currentQ>0){
    if(questions[currentQ].freetext){const ta=document.getElementById("freetext-input");if(ta)freeText=ta.value.trim();}
    currentQ--;selectedVal=answers[currentQ]!==undefined?answers[currentQ]:null;renderQuestion();
  }
}

// ----- Niveau-Berechnung (unverändert) -------------------------------------
function calcLevel(){
  let s=0;[0,1,2,5,6].forEach(i=>{if(typeof answers[i]==="number")s+=answers[i];});
  if(s<=4)return"beginner";if(s<=8)return"intermediate";if(s<=12)return"advanced";return"expert";
}
const levelMeta={
  beginner:{name:"Einsteiger",desc:"Du baust dein Spiel auf. Weiche, fehlerverzeihende Beläge mit gutem Gefühl bringen dich schneller voran.",speed:20,spin:30,ctrl:85},
  intermediate:{name:"Fortgeschrittener",desc:"Deine Technik sitzt – jetzt stimmst du dein Equipment gezielt auf deinen Stil ab.",speed:55,spin:65,ctrl:65},
  advanced:{name:"Vereinsspieler",desc:"Du spielst regelmäßig im Wettkampf. Dein Equipment braucht echte Leistung – mehr Spin und Direktheit.",speed:75,spin:80,ctrl:55},
  expert:{name:"Leistungsspieler",desc:"Auf deinem Niveau entscheiden Nuancen. Topbeläge, die deine Technik voll ausspielen.",speed:95,spin:95,ctrl:40}
};
const LEVELS=["beginner","intermediate","advanced","expert"];
const LEVEL_IDX={beginner:0,intermediate:1,advanced:2,expert:3};

// ============================================================================
//  EMPFEHLUNGS-ENGINE
// ============================================================================
function targetProfile(level, style, distance){
  const base = {
    beginner:    { tempo: 95,  haerte: 35 },
    intermediate:{ tempo: 108, haerte: 50 },
    advanced:    { tempo: 118, haerte: 65 },
    expert:      { tempo: 125, haerte: 78 }
  }[level];
  let tempo = base.tempo, haerte = base.haerte;
  if (style === "speed"){ tempo += 8;  haerte += 8; }
  else if (style === "spin"){ tempo += 2; haerte += 4; }
  else if (style === "control"){ tempo -= 8; haerte -= 8; }
  if (distance === "short"){ tempo += 3; haerte += 3; }
  else if (distance === "far"){ tempo -= 6; haerte -= 6; }
  return { tempo: tempo, haerte: haerte };
}

function allowedHolzClasses(level){
  switch(level){
    case "beginner":     return ["voll5"];
    case "intermediate": return ["voll5","voll7","kunstfaser"];
    case "advanced":     return ["voll7","kunstfaser","carbon","voll5"];
    default:             return ["carbon","kunstfaser","voll7"];
  }
}
function holzTargetTempo(level){
  return { beginner:80, intermediate:95, advanced:110, expert:120 }[level];
}

function scoreBelag(p, target, side){
  const t = num(p.tempo);
  const k = num(p.kontrolle);
  const h = haerteScore(p);
  let score = 0, used = 0;
  if (!isNaN(t)){ score += Math.abs(t - target.tempo) * 1.0; used++; }
  if (!isNaN(h)){ score += Math.abs(h - target.haerte) * 0.6; used++; }
  if (side === "fh"){
    if (!isNaN(t)) score -= (t - target.tempo) * 0.35;
    if (!isNaN(h)) score -= (h - target.haerte) * 0.25;
  } else if (side === "bh"){
    if (!isNaN(k)) score -= (k - 100) * 0.30;
    if (!isNaN(t)) score += (t - target.tempo) * 0.20;
  }
  if (used === 0) score += 9999;
  return score;
}

function characterBias(p, side){
  const c = niCharacter(p);
  if (side === "fh") return c === "offensiv" ? -6 : (c === "defensiv" ? 6 : 0);
  if (side === "bh") return c === "offensiv" ? 5 : (c === "defensiv" ? -4 : -2);
  return 0;
}

function recommendBelage(level, target, side, material, budgetPerBelag, n){
  n = n || 3;
  let pool = CATALOG.belage.slice();

  if (material === "short_pips")      pool = pool.filter(p => belagClass(p) === "short_pips");
  else if (material === "long_pips")  pool = pool.filter(p => belagClass(p) === "long_pips");
  else if (material === "anti")       pool = pool.filter(p => belagClass(p) === "anti");
  else                                pool = pool.filter(p => belagClass(p) === "ni");

  const isSpecial = (material === "short_pips" || material === "long_pips" || material === "anti");

  if (pool.length === 0){
    if (material === "long_pips" || material === "short_pips"){
      pool = CATALOG.belage.filter(p => {
        const c = belagClass(p); return c === "long_pips" || c === "short_pips";
      });
    }
    if (pool.length === 0) pool = CATALOG.belage.slice();
  }

  const scored = pool.map(p => {
    let s = isSpecial ? 0 : scoreBelag(p, target, side);
    if (!isSpecial) s += characterBias(p, side);
    const price = num(p.price);
    if (!isNaN(price) && budgetPerBelag && price > budgetPerBelag * 1.25){
      s += (price - budgetPerBelag) * 0.5;
    }
    return { p: p, s: s };
  });
  scored.sort((a,b)=> a.s - b.s || num(a.p.price) - num(b.p.price));

  if (isSpecial){
    scored.sort((a,b)=> (num(a.p.price)||999) - (num(b.p.price)||999));
  }
  return scored.slice(0, n).map(x => toCard(x.p, "belag"));
}

function recommendHolzer(level, n){
  n = n || 3;
  const allowed = allowedHolzClasses(level);
  const tgt = holzTargetTempo(level);
  let pool = CATALOG.holzer.filter(p => allowed.indexOf(holzClass(p)) >= 0);
  if (pool.length < n){
    pool = CATALOG.holzer.slice();
  }
  const scored = pool.map(p => {
    const t = num(p.tempo);
    let s = !isNaN(t) ? Math.abs(t - tgt) : 60;
    const cls = holzClass(p);
    const order = allowed.indexOf(cls);
    if (order >= 0) s += order * 2;
    return { p: p, s: s };
  });
  scored.sort((a,b)=> a.s - b.s || num(a.p.price) - num(b.p.price));
  return scored.slice(0, n).map(x => toCard(x.p, "holz"));
}

function toCard(p, cat){
  return {
    name: p.title,
    brand: brandOf(p.title),
    price: num(p.price) || 0,
    handle: p.handle,
    note: autoNote(p, cat),
    img: p.img || "",
    url: p.url || ("/products/" + p.handle),
    type: p.type || ""
  };
}
function brandOf(title){
  const m = String(title||"").trim().split(/\s+/);
  return m.length ? m[0] : "";
}

function autoNote(p, cat){
  const parts = [];
  const t = num(p.tempo), k = num(p.kontrolle), e = num(p.effet);
  if (!isNaN(t)){
    if (t >= 125) parts.push("sehr schnell");
    else if (t >= 112) parts.push("schnell");
    else if (t >= 98) parts.push("mittleres Tempo");
    else parts.push("kontrolliertes Tempo");
  }
  if (cat === "belag"){
    const hw = (p.schwammhaerte||"").toLowerCase();
    const hmap = {"soft":"weich","soft-medium":"weich-mittel","medium":"mittelhart","medium-hard":"mittel-hart","hard":"hart"};
    if (hmap[hw]) parts.push(hmap[hw]);
    if (!isNaN(e) && e >= 120) parts.push("spinstark");
    else if (!isNaN(k) && k >= 115) parts.push("sehr kontrolliert");
  } else {
    const cls = holzClass(p);
    if (cls === "carbon") parts.push("Carbon, direkt");
    else if (cls === "kunstfaser") parts.push("Kunstfaser");
    else if (cls === "voll7") parts.push("7 Schichten");
    else parts.push("Vollholz, kontrolliert");
    const g = num(p.gewicht);
    if (!isNaN(g)) parts.push(g + " g");
  }
  if (!parts.length) return cat === "belag" ? "Belag aus unserem Sortiment" : "Holz aus unserem Sortiment";
  return parts.slice(0,3).join(" · ");
}

// ----- Konfigurator-State (unverändert) ------------------------------------
let config={fh:null,bh:null,blade:null};
let slotMeta={fh:{role:"Belag Vorhand"},bh:{role:"Belag Rückhand"},blade:{role:"Holz"}};
let pickPools={};

function fmt(n){return n.toFixed(2).replace(".",",")+" €";}
function esc(s){
  return String(s==null?"":s).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function jsq(s){
  return String(s==null?"":s)
    .replace(/\\/g,"\\\\")
    .replace(/'/g,"\\'")
    .replace(/"/g,'\\"')
    .replace(/</g,"\\x3c");
}

function confirmPick(slot,handle,variantId,variantTitle){
  const prod=(pickPools[slot]||[]).find(p=>p.handle===handle);
  if(!prod)return;
  config[slot]=Object.assign({},prod,{variantId:variantId||null,variantTitle:variantTitle||""});
  document.querySelectorAll('.pick-card[data-slot="'+slot+'"]').forEach(c=>{
    c.classList.toggle("selected", c.dataset.handle===handle);
    if(c.dataset.handle!==handle){
      const oe=c.querySelector(".pick-opts"); if(oe){oe.innerHTML="";oe.classList.remove("open");}
    }
  });
  renderConfig();
  showToast(prod.name+(variantTitle?" ("+variantTitle+")":"")+" gewählt");
  autoAdvance(slot);
}

// Mobil: nach einer Auswahl automatisch zum nächsten Slot springen
// (Vorhand -> Rückhand -> Holz -> Übersicht). Auf Desktop deaktiviert,
// da dort alles nebeneinander sichtbar ist und Auto-Scrollen stören würde.
function autoAdvance(slot){
  try{
    if(window.innerWidth >= 750) return;        // nur Mobil / schmale Viewports
    const next = slot==="fh" ? "bh" : (slot==="bh" ? "blade" : null);
    setTimeout(function(){
      if(next){ scrollToSlot(next); }
      else { jumpToSelection(); }               // nach dem Holz zur Übersicht
    }, 450);                                     // kurze Pause: Toast/Markierung bleibt sichtbar
  }catch(e){ /* Auto-Scroll ist optionales Komfort-Feature */ }
}

function renderConfig(){
  const rows=document.getElementById("config-rows");
  const slots=["fh","bh","blade"];
  rows.innerHTML=slots.map(s=>{
    const p=config[s];
    if(!p){
      return `<div class="config-row empty" role="button" tabindex="0" onclick="scrollToSlot('${s}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();scrollToSlot('${s}')}"><div class="config-thumb-empty">+</div>
        <div class="config-info"><div class="config-role">${slotMeta[s].role}</div>
        <div class="config-pname placeholder">Noch nicht gewählt – tippen zum Auswählen</div></div>
        <div class="config-jump-hint">&#8593;</div></div>`;
    }
    const vt=p.variantTitle?`<div class="config-variant">${p.variantTitle}</div>`:"";
    return `<div class="config-row" role="button" tabindex="0" onclick="scrollToSlot('${s}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();scrollToSlot('${s}')}">
      ${p.img?`<img class="config-thumb" src="${p.img}" alt="" data-fallback="${proxify(p.img)}" onerror="imgFallback(this)">`:`<div class="config-thumb-empty">🏓</div>`}
      <div class="config-info"><div class="config-role">${slotMeta[s].role}</div>
      <div class="config-pname">${p.name}</div>${vt}</div>
      <div class="config-pprice">${fmt(p.price)}</div></div>`;
  }).join("");
  let total=0,count=0;
  slots.forEach(s=>{if(config[s]){total+=config[s].price;count++;}});
  document.getElementById("config-total").textContent=fmt(total);
  const budget=answers[8]||"mid";
  const note=document.getElementById("config-budget-note");
  if(count>0){
    const max=budgetMax[budget];
    if(total<=max){note.textContent=`✓ Innerhalb deines Budgets (${budgetMap[budget]})`;note.className="config-budget-note ok";}
    else{note.textContent=`⚠ ${fmt(total-max)} über deinem Budget (${budgetMap[budget]})`;note.className="config-budget-note over";}
  } else { note.textContent=""; note.className="config-budget-note"; }
  const ready = config.blade && (config.fh || config.bh);
  const btn=document.getElementById("btn-handoff");
  btn.disabled=!ready;
  btn.textContent=ready?"In den Konfigurator übernehmen →":"Wähle Holz + mind. 1 Belag";
  updateJumpPill(count,ready);
}

function updateJumpPill(count,ready){
  const pill=document.getElementById("jump-pill");
  if(!pill)return;
  const txt=document.getElementById("jp-text");
  const cnt=document.getElementById("jp-count");
  cnt.textContent=count+"/3";
  txt.textContent=ready?"Weiter zur Auswahl":"Zur Auswahl";
  pill.classList.toggle("show",count>0);
}
function jumpToSelection(){
  const p=document.getElementById("config-panel");
  if(p)p.scrollIntoView({behavior:"smooth",block:"start"});
}
function scrollToSlot(slot){
  const el=document.getElementById("slot-"+slot);
  if(!el)return;
  el.scrollIntoView({behavior:"smooth",block:"start"});
  const grid=el.nextElementSibling && el.nextElementSibling.nextElementSibling;
  if(grid && grid.classList.contains("pick-grid")){
    grid.querySelectorAll(".pick-card").forEach(function(c){
      c.classList.add("flash");
      setTimeout(function(){c.classList.remove("flash");},900);
    });
  }
}

(function(){
  const p=document.getElementById("config-panel");
  if(!p||!("IntersectionObserver" in window))return;
  const io=new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      const pill=document.getElementById("jump-pill");
      if(!pill)return;
      if(e.isIntersecting){pill.style.visibility="hidden";}
      else{pill.style.visibility="";}
    });
  },{threshold:0.25});
  io.observe(p);
})();

function handoff(){
  function slot(p){ return p ? {name:p.name, handle:p.handle, variantId:p.variantId||null, variantTitle:p.variantTitle||""} : null; }
  const rec={
    holz: slot(config.blade),
    vorhand: slot(config.fh),
    rueckhand: slot(config.bh)
  };
  try{ localStorage.setItem("konfigBeraterRec", JSON.stringify(rec)); }catch(e){}
  var btn=document.getElementById("btn-handoff");
  if(btn){ btn.textContent="✓ Wird übernommen …"; btn.disabled=true; }
  try{
    var url=new URL(window.location.href);
    url.hash="schlaeger-konfigurator";
    window.location.replace(url.toString());
    window.location.reload();
  }catch(e){
    window.location.hash="schlaeger-konfigurator";
    window.location.reload();
  }
}

let toastTimer=null;
function showToast(msg){
  const t=document.getElementById("toast");
  t.textContent=msg;t.classList.add("show");
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),1800);
}

function proxify(url){
  if(!url) return "";
  var bare=url.replace(/^https?:\/\//,"");
  return "https://images.weserv.nl/?url="+encodeURIComponent(bare);
}
function imgFallback(img){
  var fb=img.getAttribute("data-fallback");
  if(fb && img.src!==fb){
    img.removeAttribute("data-fallback");
    img.src=fb;
    return;
  }
  img.onerror=null;
  var cls=img.classList.contains("config-thumb")?"config-thumb-empty":"pick-img-empty";
  var span=document.createElement(cls==="config-thumb-empty"?"div":"span");
  span.className=cls;
  span.textContent="🏓";
  if(img.parentNode) img.parentNode.replaceChild(span,img);
}

function makePickCard(slot,prod){
  return `<div class="pick-card" data-slot="${slot}" data-handle="${prod.handle}">
    <div class="pick-tap" onclick='openCard("${jsq(slot)}","${jsq(prod.handle)}")'>
      <div class="pick-img-wrap">${prod.img?`<img class="pick-img" src="${prod.img}" alt="${esc(prod.name)}" loading="lazy" data-fallback="${proxify(prod.img)}" onerror="imgFallback(this)">`:`<span class="pick-img-empty">🏓</span>`}</div>
      <div class="pick-body">
        <div class="pick-name">${esc(prod.name)}</div>
        <div class="pick-brand">${esc(prod.brand)}</div>
        <div class="pick-note">${esc(prod.note)}</div>
        <div class="pick-price">${fmt(prod.price)}</div>
      </div>
    </div>
    <div class="pick-opts" id="opts-${slot}-${prod.handle}"></div>
  </div>`;
}

// ----- Varianten-Auswahl pro Karte (unverändert) ---------------------------
let variantCache={};
let cardOptState={};
function optKey(slot,handle){return slot+"::"+handle;}

async function loadVariants(handle){
  if(variantCache[handle]) return variantCache[handle];
  try{
    const r=await fetch("/products/"+encodeURIComponent(handle)+".js");
    if(!r.ok) throw new Error("http");
    const data=await r.json();
    variantCache[handle]=data;
    return data;
  }catch(e){ variantCache[handle]=null; return null; }
}

async function openCard(slot,handle){
  const card=document.querySelector('.pick-card[data-slot="'+slot+'"][data-handle="'+handle+'"]');
  if(!card)return;
  const optsEl=document.getElementById("opts-"+slot+"-"+handle);
  if(!optsEl)return;
  const data=await loadVariants(handle);
  if(!data){
    optsEl.innerHTML='<div class="pick-opt-err">Varianten konnten nicht geladen werden. <button class="pick-confirm" onclick=\'confirmPick("'+slot+'","'+handle+'",0,"")\'>Trotzdem wählen</button></div>';
    return;
  }
  renderCardOptions(slot,handle,data,optsEl);
}

function renderCardOptions(slot,handle,data,optsEl){
  const k=optKey(slot,handle);
  if(!cardOptState[k]) cardOptState[k]={options:{},variantId:null,variantTitle:""};
  const sel=cardOptState[k].options;
  const opts=data.options||[];
  const optNames=opts.map(o=> typeof o==="string"? o : o.name);
  const optValues=optNames.map((nm,i)=>{
    const vals=[];
    data.variants.forEach(v=>{
      if(!v.available) return;
      const val=v.options[i];
      if(val!=null && vals.indexOf(val)===-1) vals.push(val);
    });
    return vals;
  });
  let html="";
  optNames.forEach((nm,i)=>{
    const isColor=/farbe|color|colour/i.test(nm);
    html+=`<div class="pick-opt-grp"><span class="pick-opt-lbl">${esc(nm)}</span><div class="pick-opt-row">`;
    optValues[i].forEach(val=>{
      const on=sel[nm]===val?" on":"";
      if(isColor){
        const css=colorCss(val);
        html+=`<button class="pick-swatch${on}" title="${esc(val)}" style="background:${css}" onclick='setCardOpt("${jsq(slot)}","${jsq(handle)}","${jsq(nm)}","${jsq(val)}")'></button>`;
      } else {
        html+=`<button class="pick-pill${on}" onclick='setCardOpt("${jsq(slot)}","${jsq(handle)}","${jsq(nm)}","${jsq(val)}")'>${esc(val)}</button>`;
      }
    });
    html+=`</div></div>`;
  });
  const st=cardOptState[k];
  const allChosen=optNames.every(nm=>sel[nm]);
  if(allChosen && st.variantId){
    html+=`<button class="pick-confirm" onclick='confirmPick("${jsq(slot)}","${jsq(handle)}",${st.variantId},"${jsq(st.variantTitle)}")'>Diese Variante wählen ✓</button>`;
  } else if(allChosen && !st.variantId){
    html+=`<div class="pick-opt-err">Diese Kombination ist leider nicht verfügbar.</div>`;
  } else {
    html+=`<div class="pick-opt-hint">Bitte ${optNames.filter(nm=>!sel[nm]).map(esc).join(" & ")} wählen</div>`;
  }
  optsEl.innerHTML=html;
  optsEl.classList.add("open");
}

function setCardOpt(slot,handle,name,val){
  const k=optKey(slot,handle);
  if(!cardOptState[k]) cardOptState[k]={options:{},variantId:null,variantTitle:""};
  cardOptState[k].options[name]=val;
  const data=variantCache[handle];
  if(data){
    const optNames=(data.options||[]).map(o=> typeof o==="string"? o : o.name);
    const sel=cardOptState[k].options;
    let match=null;
    data.variants.forEach(v=>{
      const ok=optNames.every((nm,i)=> v.options[i]===sel[nm]);
      if(ok && v.available && !match) match=v;
    });
    if(match){ cardOptState[k].variantId=match.id; cardOptState[k].variantTitle=match.title; }
    else { cardOptState[k].variantId=null; cardOptState[k].variantTitle=""; }
    const optsEl=document.getElementById("opts-"+slot+"-"+handle);
    if(optsEl) renderCardOptions(slot,handle,data,optsEl);
  }
}

function colorCss(val){
  const m={schwarz:"#111",black:"#111",rot:"#cc1a1a",red:"#cc1a1a",dunkelrot:"#8b0000",
    "grün":"#2a6e2a",gruen:"#2a6e2a",green:"#2a6e2a",blau:"#1a4db5",blue:"#1a4db5",
    orange:"#e85c00",gelb:"#c8a000",yellow:"#c8a000",lila:"#7b2fbf",violet:"#7b2fbf",
    "weiß":"#ddd",weiss:"#ddd",white:"#ddd",pink:"#d63384",braun:"#7b4a2d"};
  return m[String(val).toLowerCase()]||"#888";
}

// ----- Ergebnis ------------------------------------------------------------
async function showResult(){
  document.getElementById("quiz-section").style.display="none";
  document.getElementById("intro").style.display="none";
  document.getElementById("result-section").classList.add("visible");

  const level=calcLevel();
  const budget=answers[8]||"mid";
  const material=answers[7]||"none";
  const dom=answers[9]||"balanced";
  const style=answers[3]||"any";
  const distance=answers[4]||"any";
  const lm=levelMeta[level];

  document.getElementById("r-level").textContent=lm.name;
  document.getElementById("r-desc").textContent=lm.desc;
  setTimeout(()=>{
    document.getElementById("bar-speed").style.width=lm.speed+"%";document.getElementById("val-speed").textContent=lm.speed;
    document.getElementById("bar-spin").style.width=lm.spin+"%";document.getElementById("val-spin").textContent=lm.spin;
    document.getElementById("bar-ctrl").style.width=lm.ctrl+"%";document.getElementById("val-ctrl").textContent=lm.ctrl;
  },100);

  const target = targetProfile(level, style, distance);
  const budgetPerBelag = budgetMax[budget] === 99999 ? null : budgetMax[budget] / 3;

  const blPool = recommendHolzer(level, 3);

  let fhSide, bhSide, fhRole, fhSub, bhRole;
  if (dom === "fh"){
    fhSide="fh"; bhSide="bh";
    fhRole="Belag Vorhand · stärkere Seite"; fhSub="Deine stärkere Seite – offensivere, spinstärkere Beläge:";
  } else if (dom === "bh"){
    fhSide="bh"; bhSide="fh";
    fhRole="Belag Vorhand · ruhigere Seite"; fhSub="Kontrolliertere Beläge für deine ruhigere Vorhand:";
  } else {
    fhSide="balanced"; bhSide="bh";
    fhRole="Belag Vorhand"; fhSub="Wähle einen Vorhand-Belag (Noppen-Innen):";
  }

  const fhPool = recommendBelage(level, target, fhSide, "none", budgetPerBelag, 3);

  let bhPool;
  if (material === "short_pips"){ bhPool=recommendBelage(level,target,"bh","short_pips",budgetPerBelag,3); bhRole="Belag Rückhand · Kurze Noppen"; }
  else if (material === "long_pips"){ bhPool=recommendBelage(level,target,"bh","long_pips",budgetPerBelag,3); bhRole="Belag Rückhand · Lange Noppen"; }
  else if (material === "anti"){ bhPool=recommendBelage(level,target,"bh","anti",budgetPerBelag,3); bhRole="Belag Rückhand · Anti-Top"; }
  else {
    bhPool=recommendBelage(level, target, bhSide, "none", budgetPerBelag, 3);
    bhRole = dom==="bh" ? "Belag Rückhand · stärkere Seite" : (dom==="fh" ? "Belag Rückhand · ruhigere Seite" : "Belag Rückhand");
  }

  slotMeta.fh.role=fhRole;
  slotMeta.bh.role=bhRole;
  pickPools={fh:fhPool,bh:bhPool,blade:blPool};

  if(!fhPool.length && !bhPool.length && !blPool.length){
    document.getElementById("picker-content").innerHTML=
      '<div class="section-sub" style="margin-top:24px">Die Produktdaten konnten nicht geladen werden. Bitte lade die Seite neu oder kontaktiere uns – wir beraten dich gern persönlich.</div>';
    return;
  }

  const ml=matLabel[material];
  let html="";
  if(ml) html+=`<div style="margin-top:32px"><span class="material-badge">&#9670; Materialseite: ${esc(ml)}</span></div>`;
  html+=`<div class="section-label" id="slot-fh">${esc(fhRole)} <span class="budget-tag">für ${esc(lm.name)}</span></div>
    <div class="section-sub">${esc(fhSub)}</div>
    <div class="pick-grid">${fhPool.map(p=>makePickCard("fh",p)).join("")}</div>`;
  html+=`<div class="section-label" id="slot-bh">${esc(bhRole)}</div>
    <div class="section-sub">${material==="none"?(dom==="bh"?"Deine stärkere Seite – offensivere, spinstärkere Beläge zuerst:":"Wähle einen Rückhand-Belag:"):"Wähle dein Spezialmaterial für die Rückhand:"}</div>
    <div class="pick-grid">${bhPool.map(p=>makePickCard("bh",p)).join("")}</div>`;
  html+=`<div class="section-label" id="slot-blade">Holz</div>
    <div class="section-sub">Wähle dein Holz:</div>
    <div class="pick-grid">${blPool.map(p=>makePickCard("blade",p)).join("")}</div>`;
  document.getElementById("picker-content").innerHTML=html;
  renderConfig();

  if(freeText&&freeText.length>=10){
    document.getElementById("ai-note-anchor").innerHTML=`
      <div class="ai-note-box" id="ai-note-box">
        <div class="ai-note-title">&#10024; Persönlicher Hinweis zu deinen Angaben</div>
        <div class="ai-note-text"><div class="loading-spinner"></div>Wird analysiert…</div>
      </div>`;
    const aiNote=await getAiNote(level,budget,material,freeText);
    const box=document.getElementById("ai-note-box");
    if(box){ if(aiNote){box.querySelector(".ai-note-text").textContent=aiNote;} else {box.style.display="none";} }
  }
}

async function getAiNote(level,budget,material,freetext){
  try{
    const prompt=`Du bist Tischtennis-Materialexperte beim Shop Futurespin.
Kundenprofil:
- Spielniveau: ${levelMeta[level].name}
- Budget gesamt (2 Beläge + Holz): ${budgetMap[budget]}
- Materialseite: ${matLabel[material]||"beidseitig Noppen-Innen"}
- Freitext: "${freetext}"
Analysiere den Freitext und gib in 2-3 prägnanten deutschen Sätzen eine persönliche Ergänzung zur Equipment-Empfehlung. Gehe konkret auf das ein, was der Kunde erwähnt hat. Nur die Ergänzung, keine Anrede, keine Überschrift.`;
    const resp=await fetch("https://api.anthropic.com/v1/messages",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:1000,messages:[{role:"user",content:prompt}]})
    });
    const data=await resp.json();
    return (data.content&&data.content[0]&&data.content[0].text)||null;
  }catch(e){return null;}
}

function restart(){
  answers=[];freeText="";currentQ=0;selectedVal=null;
  config={fh:null,bh:null,blade:null};
  slotMeta.fh.role="Belag Vorhand";
  slotMeta.bh.role="Belag Rückhand";
  document.getElementById("intro").style.display="block";
  document.getElementById("quiz-section").style.display="block";
  document.getElementById("result-section").classList.remove("visible");
  document.getElementById("picker-content").innerHTML="";
  document.getElementById("ai-note-anchor").innerHTML="";
  var pill=document.getElementById("jump-pill");if(pill)pill.classList.remove("show");
  window.scrollTo({top:0,behavior:"smooth"});
  renderQuestion();
}

renderQuestion();
