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
