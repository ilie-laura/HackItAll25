<<<<<<< HEAD
/* ==========================
   TEXT PROCESSING HELPERS
========================== */
function normalize(str){
    return String(str||"")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"");
}

function escape(s){
    return String(s||"")
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;");
}

/* ==========================
   CATEGORY DETECTION
========================== */

const semanticMap={
    pharmacy:["farmacie","medicamente","pastile"],
    bakery:["paine","patiserie","covrigi","cozonac"],
    clothes:["haine","tricou","blugi","second hand","pantofi"],
    supermarket:["magazin","supermarket","alimentar","market"],
    marketplace:["piata","targ","legume","fructe"],
};

const categoryMap={
    pharmacy:["pharmacy"],
    bakery:["bakery"],
    clothes:["clothes","second_hand","shoes","boutique"],
    supermarket:["supermarket","convenience","grocery"],
    marketplace:["marketplace"],
};

function detectCategory(text){
    text=normalize(text);
    for(const cat in semanticMap){
        if(semanticMap[cat].some(w=>text.includes(w))) return cat;
    }
    return null;
}

/* ==========================
   BRAND BLOCKING DETECTION
========================== */

const chainBrands=[
 "zara","hm","h&m","pepco","decathlon","nike","adidas",
 "kaufland","carrefour","lidl","penny","mega image",
 "dominos","pizza hut","kfc","mcdonald","starbucks"
];

function detectExcludedBrand(text){
    text=normalize(text);
    if(text.includes("fara")||text.includes("nu vreau")||text.includes("exclude")||text.includes("nu de la")){
        let brand=text
            .replace(/.*(fara|nu vreau|exclude|nu de la)/,"")
            .trim();
        return brand;
    }
    return null;
}

/* ==========================
   GEO + MAP
========================== */

let map=L.map("map").setView([45,25],7);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

let shops=[], userCoords=null;
let markers=L.layerGroup().addTo(map);
let userMarker=null;

navigator.geolocation.getCurrentPosition(load,fallback,{enableHighAccuracy:true,timeout:15000});

async function fallback(){
    const res=await fetch("https://ipapi.co/json/");
    const d=await res.json();
    load({coords:{latitude:d.latitude,longitude:d.longitude}});
}

/* ==========================
   FETCH SHOPS FROM OVERPASS
========================== */

async function load(pos){
    userCoords=[pos.coords.latitude,pos.coords.longitude];

    if(userMarker) map.removeLayer(userMarker);
    userMarker=L.marker(userCoords).addTo(map).bindPopup("Locatia ta");

    map.setView(userCoords,15);

    const R=5000;
    const query=`[out:json][timeout:25];
(
 node["shop"](around:${R},${userCoords[0]},${userCoords[1]});
 node["amenity"="pharmacy"](around:${R},${userCoords[0]},${userCoords[1]});
 node["amenity"="marketplace"](around:${R},${userCoords[0]},${userCoords[1]});
); out center;`;

    const r=await fetch("https://overpass-api.de/api/interpreter",{method:"POST",body:query});
    const data=await r.json();

    shops=data.elements.map(o=>({
        name:o.tags.name||"Fara nume",
        type:o.tags.shop||o.tags.amenity||"",
        website:o.tags.website||null,
        rating:o.tags.rating?Number(o.tags.rating):null,
        lat:o.lat||o.center?.lat,
        lon:o.lon||o.center?.lon,
        isChain:isChain(o.tags.name||"")
    }))
    .map(s=>({...s, distance:dist(userCoords,[s.lat,s.lon])}));
}

/* ==========================
   UTIL DISTANCE
========================== */

function dist(a,b){
    if(!a||!b) return Infinity;
    const [lat1,lon1]=a;
    const [lat2,lon2]=b;
    const R=6371000;
    const toRad=d=>d*Math.PI/180;
    const dLat=toRad(lat2-lat1);
    const dLon=toRad(lon2-lon1);
    const x=Math.sin(dLat/2)**2+
        Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

function formatDist(m){
    return m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(2)} km`;
}

function isChain(name){
    return chainBrands.some(b=>normalize(name).includes(b));
}

/* ==========================
   SEARCH ENGINE + SCOR
========================== */

function search(query){
    const q=normalize(query);
    const category=detectCategory(q);
    const excluded=detectExcludedBrand(q);

    let result=[...shops];

    if(category){
        result=result.filter(s=>{
            return categoryMap[category].some(tag=>normalize(s.type).includes(tag));
        });
    }

    if(excluded){
        result=result.filter(s=>!normalize(s.name).includes(excluded));
    }

    result.forEach(s=>{
        const distanceScore=1/(s.distance+1);
        const ratingScore=s.rating?(s.rating/5)*0.2:0;
        const localScore=s.isChain?-0.3:0.4;
        s.score=distanceScore+ratingScore+localScore;
    });

    result.sort((a,b)=>b.score-a.score);

    renderResults(result.slice(0,12));
}

/* ==========================
   RENDER UI
========================== */

function renderResults(list){
    const box=document.getElementById("results");
    box.innerHTML="";

    markers.clearLayers();

    if(list.length===0){
        box.innerHTML="<div>Nu am gasit rezultate relevante.</div>";
        return;
    }

    list.forEach(s=>{
        const card=document.createElement("div");
        card.className="card";
        card.innerHTML=`
           <b>${escape(s.name)}</b> ${s.isChain?"(lant)":"(local)"}<br>
           Tip: ${escape(s.type)}<br>
           Distanta: ${formatDist(s.distance)}<br>
           <a href="https://google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}" target="_blank">Navigheaza</a>
        `;
        box.appendChild(card);

        if(s.lat&&s.lon){
            L.marker([s.lat,s.lon]).addTo(markers)
            .bindPopup(`<b>${escape(s.name)}</b><br>${escape(s.type)}<br>${formatDist(s.distance)}`);
        }
    });

    map.setView([list[0].lat,list[0].lon],15);
}

/* ==========================
   CHAT HANDLER
========================== */

document.getElementById("send-btn").onclick=()=>{
    const input=document.getElementById("chat-input");
    const text=input.value.trim();
    if(!text) return;
    addUserMessage(text);
    search(text);
    input.value="";
};

function addUserMessage(t){
    const chat=document.getElementById("chat");
    const div=document.createElement("div");
    div.className="bubble user";
    div.innerText=t;
    chat.append(div);
    chat.scrollTop=chat.scrollHeight;
}
=======
/* app.js – versiune finală: păstrează mesajul inițial, afișează results + distance + marker popups */

// utilitare text
function normalizeText(str){
  return String(str||'').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
}
function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

const semanticMap = {
  pharmacy:["farmacie","pastile","medicamente"],
  bakery:["paine","covrigi","cozonac","patiserie"],
  clothes:["haine","tricou","second hand","pantofi","rochie","blugi","jeans"],
  supermarket:["magazin","supermarket","market","alimentar"],
  marketplace:["piata","targ","legume","fructe"]
};

const categoryMap = {
  pharmacy:["pharmacy"],
  bakery:["bakery"],
  clothes:["clothes","second_hand","boutique","shoes"],
  supermarket:["supermarket","convenience","grocery"],
  marketplace:["marketplace"]
};

function detectCategory(text){
  text = normalizeText(text);
  for(let c in semanticMap){
      if(semanticMap[c].some(w=>text.includes(w))) return c;
  }
  return null;
}

/* === hartă === */
let map = L.map('map').setView([45,25],7);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

let shops = [], userCoords = null;
let markers = L.layerGroup().addTo(map); // layer for shop markers
let userMarker = null;

/* fallback geolocation */
navigator.geolocation.getCurrentPosition(load, fallback, {timeout:5000});
async function fallback(){
  try {
    const d = await (await fetch("https://ipapi.co/json/")).json();
    load({coords:{latitude:d.latitude,longitude:d.longitude}});
  } catch(e){
    console.error("Fallback geolocation failed", e);
    alert("Nu am putut determina locația (geolocație și fallback eșuate).");
  }
}

/* === Overpass fetch === */
async function load(pos){
  userCoords = [pos.coords.latitude, pos.coords.longitude];

  if(userMarker) map.removeLayer(userMarker);
  userMarker = L.marker(userCoords).addTo(map).bindPopup("Locația ta");

  map.setView(userCoords,15);

  const RADIUS = 5000;
  const query = `[out:json][timeout:25];
(
  node["shop"](around:${RADIUS},${userCoords[0]},${userCoords[1]});
  way["shop"](around:${RADIUS},${userCoords[0]},${userCoords[1]});
  node["amenity"="pharmacy"](around:${RADIUS},${userCoords[0]},${userCoords[1]});
  way["amenity"="pharmacy"](around:${RADIUS},${userCoords[0]},${userCoords[1]});
  node["amenity"="marketplace"](around:${RADIUS},${userCoords[0]},${userCoords[1]});
  way["amenity"="marketplace"](around:${RADIUS},${userCoords[0]},${userCoords[1]});
);
out center;`;

  console.log("Overpass query:\n", query);

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: query });
    if(!res.ok){
      const txt = await res.text().catch(()=>null);
      throw new Error("Overpass error: "+(res.statusText||res.status)+(txt? " - "+txt:""));
    }
    const data = await res.json();

    shops = data.elements.map(e => {
      const lat = e.lat || (e.center && e.center.lat) || null;
      const lon = e.lon || (e.center && e.center.lon) || null;
      const name = (e.tags && (e.tags.name || e.tags.shop)) || "Fără nume";
      const type = e.tags && (e.tags.shop || e.tags.amenity) || "";
      const website = e.tags && (e.tags.website || e.tags.url) ? (e.tags.website || e.tags.url) : null;
      const rating = e.tags && e.tags.rating ? parseFloat(e.tags.rating) : null;
      return { id: "osm-"+(e.type||"")+"-"+e.id, name, type, lat, lon, website, rating, isChain: isLikelyChain(name) };
    });

    // calc distances
    shops.forEach(s => {
      s.distance = (s.lat && s.lon && userCoords) ? haversineDistance(userCoords[0], userCoords[1], s.lat, s.lon) : Infinity;
    });

    // keep initial chat message visible; do not auto-render results
    // user will type query and then results will appear in #results
  } catch(err){
    console.error(err);
    alert("Eroare la interogarea Overpass: " + err.message);
  }
}

/* === helper distance/format === */
function haversineDistance(lat1, lon1, lat2, lon2){
  const R = 6371000;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(toRad(lat1))*Math.cos(toRad(lat2)) *
            Math.sin(dLon/2)*Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}
function formatDistance(m){
  if(!isFinite(m)) return '';
  if(m < 1000) return `${Math.round(m)} m`;
  return `${(m/1000).toFixed(2)} km`;
}

/* === core: render top results into #results and update markers === */
function renderMatches(places, rawQuery){
  const input = String(rawQuery || document.getElementById("chat-input").value || "").trim();
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = ""; // clear previous results only

  if(!input){
    // keep initial chat message intact; just clear results
    resultsDiv.innerHTML = `<div class="muted">Scrie un produs (ex: "blugi negrii") și apasă Trimite.</div>`;
    markers.clearLayers();
    return;
  }

  const category = detectCategory(input);
  const words = input.split(/\s+/).map(w=>normalizeText(w)).filter(Boolean);

  // update distances
  places.forEach(p => {
    p.distance = (p.lat && p.lon && userCoords) ? haversineDistance(userCoords[0], userCoords[1], p.lat, p.lon) : Infinity;
  });

  // start with locals preferred
  let matches = places.filter(p => !p.isChain);

  if(category){
    const tags = categoryMap[category] || [];
    matches = matches.filter(p => {
      const t = normalizeText(p.type || "");
      const n = normalizeText(p.name || "");
      const tagMatch = tags.some(tag => t.includes(tag));
      const nameMatch = words.some(w => n.includes(w));
      return tagMatch || nameMatch;
    });
  } else {
    matches = matches.filter(p => {
      const t = normalizeText(p.type || "");
      const n = normalizeText(p.name || "");
      return words.every(w => t.includes(w) || n.includes(w));
    });
  }

  if(matches.length === 0){
    // fallback: include chains so user sees options
    matches = places.filter(p => {
      const t = normalizeText(p.type || "");
      const n = normalizeText(p.name || "");
      return words.every(w => t.includes(w) || n.includes(w));
    });
  }

  // scoring: proximity (1/(dist+1)) weighted + rating normalized
  matches.forEach(p => {
    const distScore = p.distance < Infinity ? 1 / (p.distance + 1) : 0;
    const ratingScore = p.rating ? (p.rating / 5) : 0;
    p._score = (distScore * 0.85) + (ratingScore * 0.15) + (p.isChain ? -0.15 : 0);
  });

  matches.sort((a,b) => b._score - a._score);

  const top = matches.slice(0, 10);

  // render list and markers
  markers.clearLayers();
  if(top.length === 0){
    resultsDiv.innerHTML = `<div class="muted">Nu am găsit rezultate relevante în apropiere.</div>`;
    return;
  }

  top.forEach(p => {
    const card = document.createElement("div");
    card.className = "card";
    const mapsLink = (p.lat && p.lon) ? `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}&zoom=18` : "#";
    const siteLink = p.website ? ` • <a href="${escapeHtml(p.website)}" target="_blank" rel="noopener">Site magazin</a>` : '';
    const distTxt = formatDistance(p.distance);
    const ratingTxt = p.rating != null ? ` • Rating: ${p.rating}` : '';
    const badge = p.isChain ? `<span class="badge chain">Lanț</span>` : `<span class="badge local">Local</span>`;

    card.innerHTML = `
      <div><strong>${escapeHtml(p.name)}</strong> ${badge}</div>
      <div class="muted">${escapeHtml(p.type || '')} ${distTxt}${ratingTxt}</div>
      <div><a href="${mapsLink}" target="_blank" rel="noopener">Vezi pe hartă</a>${siteLink}</div>
    `;
    resultsDiv.appendChild(card);

    // add marker
    if(p.lat && p.lon){
      const m = L.marker([p.lat, p.lon]).addTo(markers);
      m.bindPopup(`<b>${escapeHtml(p.name)}</b><br>${escapeHtml(p.type||'')}<br>${distTxt}${ratingTxt}`);
    }
  });

  // center map to first result if exists
  if(top.length > 0 && top[0].lat && top[0].lon){
    map.setView([top[0].lat, top[0].lon], 15);
  }
}

/* === chat + UI === */
const chat = document.getElementById("chat");

function addBubble(text, role){
  const b = document.createElement("div");
  b.className = "bubble " + role;
  b.innerHTML = text;
  chat.append(b);
  chat.scrollTop = chat.scrollHeight;
}

function sendMsg(){
  const inputEl = document.getElementById("chat-input");
  const text = inputEl.value.trim();
  if(!text) return;
  inputEl.value = "";
  addBubble(escapeHtml(text), "user");
  respond(text);
}
document.getElementById("send-btn").onclick = sendMsg;
document.getElementById("chat-input").addEventListener("keydown", e => {
  if(e.key === "Enter") { e.preventDefault(); sendMsg(); }
});

function respond(text){
  const cat = detectCategory(text);
  if(!cat){
    addBubble("Nu înțeleg exact — încearcă: farmacie, haine, paine, supermarket, piață.", "bot");
  } else {
    addBubble(`Caut: "${escapeHtml(text)}" (categorie detectată: ${cat})`, "bot");
  }
  if(shops && shops.length) renderMatches(shops, text);
  else addBubble("Încă încarc datele… așteaptă un moment și reîncearcă.", "bot");
}

/* small heuristic for chains */
function isLikelyChain(name){
  if(!name) return false;
  const chains = ["lidl","kaufland","carrefour","mega image","aldi","mcdonald","kfc","starbucks","dm","decathlon"];
  const lower = name.toLowerCase();
  return chains.some(c => lower.includes(c));
}
>>>>>>> ffb8f1c (Adaugare app.js si modificari la index.html)
