/* The account menu, Profile and Settings. Opens from the avatar in the top
   bar (index.html swAccount). The avatar is never drawn twice on one screen,
   so the menu header carries words only. Colours are site tokens. Plain ES5. */
(function(root){
  "use strict";
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function firstNameOf(saved,email){
    var n=String(saved||"").replace(/^\s+|\s+$/g,"");
    if(n) return n;
    n=String(email||"").split("@")[0].replace(/[^A-Za-z]+/g," ").replace(/^\s+|\s+$/g,"").split(" ")[0]||"";
    return n?n.charAt(0).toUpperCase()+n.slice(1).toLowerCase():"You";
  }
  var I={
    user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    slips:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/></svg>',
    out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>'
  };
  function planHtml(o){ return "<span class='swa-plan"+(o.role==="admin"?" swa-gold":"")+"'>"+esc(o.plan||"Free plan")+"</span>"; }
  function codesHtml(q,role){
    if(role==="admin") return "<div class='swa-q'><div class='swa-q1'><span>Codes today</span><span class='swa-n'>No limit</span></div></div>";
    if(!q) return "";
    var pct=Math.round(100*q.used/q.limit);
    return "<div class='swa-q'><div class='swa-q1'><span>Codes today</span><span><span class='swa-n'>"+q.used+"</span> of "+q.limit+"</span></div>"+
      "<div class='swa-bar'><i style='width:"+pct+"%'></i></div></div>";
  }
  function menuHtml(o){
    return "<div class='swa-id'><b>"+esc(o.name)+"</b><small>"+esc(o.email)+"</small>"+planHtml(o)+"</div>"+
      codesHtml(o.quota,o.role)+
      "<div class='swa-list'>"+
        "<button class='swa-mi' type='button' role='menuitem' data-go='profile'>"+I.user+"Profile</button>"+
        "<button class='swa-mi' type='button' role='menuitem' data-go='slips'>"+I.slips+"My slips<span class='swa-r swa-n'>"+(o.slips||0)+"</span></button>"+
        "<button class='swa-mi' type='button' role='menuitem' data-go='settings'>"+I.gear+"Settings</button>"+
        (o.role==="admin"?"<button class='swa-mi' type='button' role='menuitem' data-go='admin'>"+I.shield+"Admin</button>":"")+
      "</div><div class='swa-list'>"+
        "<button class='swa-mi swa-out' type='button' role='menuitem' data-go='out'>"+I.out+"Sign out</button></div>";
  }
  var AV_FREE=["fire","8bit","2bit","lino","glass","halo"];
  /* Must match lib/roles.js (test/accountui.test.js checks). */
  var AV_FF=AV_FREE.concat(["gold","holo","graffiti","lowpoly","clay",
    "runes","noir","goldbeard","nebula","cyber","blaze","synth","abyss","alchemist","ink","magma","ent","nomad","wired"]);
  var AV_OWNER=["storm","lich","afro"];
  var AV_PERSONAL=["dread"];
  var AV_NAME={fire:"Fire eyes","8bit":"Arcade","2bit":"2-bit",lino:"Linocut",glass:"Stained glass",halo:"Halo",
    storm:"Storm caller",lich:"Frost lich",gold:"Gold trophy",holo:"Hologram",graffiti:"Graffiti",afro:"Afrofuturist",lowpoly:"Low-poly",clay:"Clay",
    runes:"Rune etched",noir:"Neon noir",goldbeard:"Gold beard",nebula:"Nebula",cyber:"Cyber seer",blaze:"Blaze",
    synth:"Synthwave",abyss:"Abyss",alchemist:"Alchemist",ink:"Ink sketch",magma:"Magma",ent:"Forest ent",
    nomad:"Desert nomad",wired:"Wired",dread:"Star dreads"};
  var LOCK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  /* Any role but free has the skins (a future paid plan too); lib/roles.js hasSkins. */
  function hasSkins(role){ return !!role&&role!=="free"; }
  /* personal: comma list from GET /api/me, only for the one account it is granted to. */
  function pickerHtml(cur,role,personal){
    var own=String(personal||"").split(",").filter(function(k){ return AV_PERSONAL.indexOf(k)>=0; });
    var mine=(role==="admin"?AV_FF.concat(AV_OWNER):hasSkins(role)?AV_FF:AV_FREE).concat(own);
    /* One row up to 7, else 6 a row unless that leaves one alone on the last row. */
    var n=mine.length, cols=n<=7?Math.max(n,6):n%6!==1?6:n%5!==1?5:7;
    return "<p class='swa-h'>Avatar</p><div class='swa-pick'"+(cols===6?"":" style='grid-template-columns:repeat("+cols+",1fr)'")+">"+mine.map(function(k){
        return "<button type='button' data-av=\""+k+"\" aria-pressed=\""+(k===cur?"true":"false")+"\" aria-label=\""+AV_NAME[k]+" avatar\"><img src='/av/"+k+".webp' alt='' loading='lazy' width='44' height='44'></button>";
      }).join("")+"</div>"+
      (hasSkins(role)?"":"<p class='swa-h'>Skins<small>Unlock with plans</small></p><div class='swa-pick swa-lock'>"+AV_FF.slice(AV_FREE.length).map(function(k){
        return "<button type='button' disabled aria-label=\""+AV_NAME[k]+", comes with plans\"><img src='/av/"+k+".webp' alt='' loading='lazy' width='56' height='56'>"+LOCK+"</button>";
      }).join("")+"</div>");
  }
  function recordHtml(r){
    var pct=r.settled?Math.round(100*r.won/r.settled):0;
    return "<p class='swa-h'>Your record</p><div class='swa-rec'><span class='swa-big'>"+r.won+"</span>"+
      "<span class='swa-m'><b>slips won</b><br>"+(r.settled?"of "+r.settled+" settled, "+pct+"%":"none settled yet")+"</span>"+
      "<span class='swa-side'><span class='swa-n'>"+r.built+"</span>saved</span></div>";
  }
  function subHtml(q,role,plan){
    var what=role==="admin"?"Every feature, no limit":role==="ff"?"Every feature, 100 codes a day":"Every feature, 10 codes a day";
    return "<p class='swa-h'>Subscription</p><div class='swa-card'><div class='swa-subtop'><span><b"+(role==="admin"?" class='swa-gold'":"")+">"+esc(plan||"Free plan")+"</b><small>"+what+"</small></span>"+
      (role==="ff"||role==="admin"?"":"<span class='swa-soon'>More plans soon</span>")+"</div>"+
      (role==="admin"||q?"<div class='swa-subuse'>"+codesHtml(q,role).replace("class='swa-q'","class='swa-q swa-q0'")+(role==="admin"?"":"<small>Resets at midnight</small>")+"</div>":"")+"</div>";
  }
  function profileHtml(o){
    return "<label class='swa-lbl' for='swaName'>Name on your slips</label>"+
      "<input class='swa-in' id='swaName' maxlength='24' autocomplete='nickname' value=\""+esc(o.name)+"\">"+
      pickerHtml(o.avatar,o.role,o.personal)+recordHtml(o.record)+subHtml(o.quota,o.role,o.plan);
  }
  function grantsHtml(list){
    if(!list.length) return "<div class='swa-set'><span class='swa-st'><small>No one yet. Add an email above.</small></span></div>";
    return list.map(function(g){
      var when=""; try{ when=new Date(g.created_at).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}); }catch(e){}
      return "<div class='swa-set'><span class='swa-st'><b>"+esc(g.email)+"</b><small>since "+esc(when)+"</small></span>"+
        "<button class='swa-pillbtn' type='button' data-revoke=\""+esc(g.email)+"\">Remove</button></div>"; }).join("");
  }
  function adminHtml(list){
    return "<label class='swa-lbl' for='swaGEmail'>Email</label>"+
      "<input class='swa-in' id='swaGEmail' type='email' autocomplete='off' autocapitalize='none' spellcheck='false'>"+
      "<button class='swa-outbtn swa-go' id='swaGrant' type='button'>Give Family &amp; friends</button>"+
      "<p class='swa-msg' id='swaMsg' role='status' aria-live='polite'></p>"+
      "<p class='swa-h'>Family &amp; friends</p><div class='swa-card' id='swaGrants'>"+(list?grantsHtml(list):"<div class='swa-set'><span class='swa-st'><small>Loading</small></span></div>")+"</div>";
  }
  var CHEV='<svg class="swa-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  function devWords(n){ return n==null?"":(n<=1?"Just this device":"This phone and "+(n-1)+" other"+(n>2?"s":"")); }
  function settingsHtml(o){
    /* o.marks values are trusted HTML from our own BOOKS, not user input. */
    var books=Object.keys(o.marks||{}).map(function(k){
      return "<button type='button' data-book=\""+esc(k)+"\" aria-pressed=\""+(k===o.book?"true":"false")+"\">"+o.marks[k]+"</button>"; }).join("");
    return "<p class='swa-h'>Appearance</p><div class='swa-card'><div class='swa-set'><span class='swa-st'><b>Theme</b></span>"+
        "<div class='swa-seg'><button type='button' data-theme=\"dark\" aria-pressed=\""+(o.theme!=="light")+"\">Dark</button><button type='button' data-theme=\"light\" aria-pressed=\""+(o.theme==="light")+"\">Light</button></div></div></div>"+
      "<p class='swa-h'>Booking</p><div class='swa-card'><div class='swa-set swa-set0'><span class='swa-st'><b>Default bookmaker</b><small>Codes open here first</small></span></div><div class='swa-books'>"+books+"</div></div>"+
      "<p class='swa-h'>Notifications</p><div class='swa-card'><div class='swa-set'><span class='swa-st'><b>Picks by email</b><small>The day's picks, each morning</small></span>"+
        "<button class='swa-sw' id='swaMail' type='button' role=\"switch\" aria-checked=\""+(!!o.mail)+"\" aria-label='Picks by email'></button></div></div>"+
      "<p class='swa-h'>Account</p><div class='swa-card'><button class='swa-set swa-link' id='swaDevs' type='button'><span class='swa-st'><b>Signed-in devices</b><small>"+devWords(o.devices)+"</small></span>"+CHEV+"</button></div>"+
      "<button class='swa-outbtn' id='swaOut' type='button'>Sign out</button>"+
      "<div class='swa-fine'><button class='swa-del' id='swaDel' type='button'>Delete account</button></div>"+
      "<div id='swaDelBox' hidden><p class='swa-note'>This deletes your account and everything synced to it. It cannot be undone. Type DELETE to confirm.</p>"+
        "<input class='swa-in' id='swaDelIn' autocomplete='off' autocapitalize='characters'><button class='swa-outbtn swa-danger' id='swaDelGo' type='button'>Delete for good</button></div>"+
      "<p class='swa-msg' id='swaMsg' role='status' aria-live='polite'></p>";
  }
  var api={firstNameOf:firstNameOf,menuHtml:menuHtml,codesHtml:codesHtml,esc:esc,I:I,AV_FREE:AV_FREE,AV_FF:AV_FF,AV_OWNER:AV_OWNER,AV_PERSONAL:AV_PERSONAL,pickerHtml:pickerHtml,grantsHtml:grantsHtml,adminHtml:adminHtml,recordHtml:recordHtml,profileHtml:profileHtml,settingsHtml:settingsHtml};
  if(typeof module!=="undefined"&&module.exports){ module.exports=api; return; }
  if(!root.document) return;

  var d=root.document, menu=null, scrim=null, lastFocus=null;
  var CSS=".swa-scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .18s;z-index:9980}.swa-scrim.on{opacity:1;pointer-events:auto}"+
    ".swa-menu{position:fixed;top:58px;right:12px;width:268px;max-width:calc(100vw - 24px);background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:12px;"+
      "box-shadow:0 10px 24px rgba(0,0,0,.45);z-index:9981;transform-origin:calc(100% - 22px) -8px;transform:scale(.92) translateY(-6px);opacity:0;pointer-events:none;"+
      "transition:transform .2s cubic-bezier(.23,1,.32,1),opacity .16s}.swa-menu.on{transform:none;opacity:1;pointer-events:auto}"+
    ".swa-id{padding:14px 14px 12px}.swa-id b{display:block;font-size:14.5px;font-weight:800}.swa-id small{display:block;font-size:12px;font-weight:600;color:var(--faint);margin-top:1px}"+
    ".swa-plan{display:block;margin-top:3px;font-size:12px;font-weight:700;color:var(--accent)}.swa-gold{color:var(--accent)}"+
    ".swa-q{margin:0 14px 14px}.swa-q1{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;font-weight:700;color:var(--soft)}"+
    ".swa-n{font-variant-numeric:tabular-nums;font-weight:800;color:var(--text)}"+
    ".swa-bar{height:4px;border-radius:2px;background:var(--raise);margin-top:8px;overflow:hidden}.swa-bar i{display:block;height:100%;background:var(--accent);border-radius:2px}"+
    ".swa-list{border-top:1px solid var(--line);padding:6px}"+
    ".swa-mi{width:100%;display:flex;align-items:center;gap:11px;padding:10px 9px;border:0;background:none;border-radius:8px;color:var(--text);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;text-align:left}"+
    ".swa-mi svg{width:18px;height:18px;color:var(--soft);flex:none}.swa-r{margin-left:auto;color:var(--faint)}.swa-out{color:var(--soft)}"+
    ".swa-mi:focus-visible{outline:2px solid var(--accent);outline-offset:2px}"+
    ".swa-view{position:fixed;inset:0;z-index:9982;background:var(--bg);color:var(--text);overflow-y:auto;padding:16px 16px 40px;transform:translateX(100%);visibility:hidden;transition:transform .28s cubic-bezier(.23,1,.32,1),visibility 0s .28s}"+
    ".swa-view.on{transform:none;visibility:visible;transition:transform .28s cubic-bezier(.23,1,.32,1),visibility 0s}.swa-in-wrap{max-width:520px;margin:0 auto}"+
    ".swa-back{display:flex;align-items:center;gap:4px;border:0;background:none;color:var(--soft);font:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:6px 4px 6px 0}.swa-back svg{width:18px;height:18px}"+
    ".swa-t{margin:0 0 16px;font-size:22px;font-weight:800;letter-spacing:-.01em}"+
    ".swa-h{font-size:13px;font-weight:700;color:var(--soft);margin:18px 2px 8px}.swa-h small{font-weight:600;color:var(--faint);margin-left:6px}"+
    ".swa-lbl{display:block;font-size:12px;font-weight:700;color:var(--faint);margin:0 0 5px}"+
    ".swa-in{width:100%;height:42px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;font-size:15px;font-weight:700;padding:0 12px;box-sizing:border-box}"+
    ".swa-pick{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.swa-pick.swa-lock{grid-template-columns:repeat(5,1fr);gap:12px;padding:0 18px}"+
    ".swa-pick button{aspect-ratio:1;border-radius:50%;border:1.5px solid transparent;background:var(--card-2);padding:0;overflow:hidden;position:relative;cursor:pointer}"+
    ".swa-pick img{width:100%;height:100%;object-fit:cover;display:block}"+
    ".swa-pick button[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-rim)}"+
    ".swa-pick button[disabled]{cursor:not-allowed}.swa-pick button[disabled] img{filter:brightness(.55) saturate(.8)}"+
    ".swa-pick button svg{position:absolute;left:50%;top:50%;width:15px;height:15px;margin:-7.5px 0 0 -7.5px;color:#fff}"+
    ".swa-card,.swa-rec{border:1px solid var(--line);border-radius:12px;background:var(--card)}"+
    ".swa-rec{display:flex;align-items:flex-end;gap:12px;padding:14px}.swa-big{font-size:32px;line-height:1;font-weight:800;font-variant-numeric:tabular-nums;color:var(--green-ink)}"+
    ".swa-m{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:var(--soft);line-height:1.35}.swa-m b{color:var(--text)}"+
    ".swa-side{text-align:right;font-size:12px;font-weight:600;color:var(--faint)}.swa-side .swa-n{display:block;font-size:17px}"+
    ".swa-subtop{display:flex;align-items:center;gap:12px;padding:12px}.swa-subtop b{display:block;font-size:14px;font-weight:800;color:var(--accent)}"+
    ".swa-subtop small{display:block;font-size:12px;font-weight:600;color:var(--faint);margin-top:2px}.swa-soon{margin-left:auto;font-size:12px;font-weight:700;color:var(--faint);white-space:nowrap}"+
    ".swa-subuse{border-top:1px solid var(--line);padding:11px 12px 12px}.swa-q0{margin:0}.swa-subuse small{display:block;margin-top:6px;font-size:12px;font-weight:600;color:var(--faint)}"+
    ".swa-set{display:flex;align-items:center;gap:12px;padding:12px;min-height:52px;width:100%;box-sizing:border-box;border:0;background:none;color:inherit;font:inherit;text-align:left}.swa-set0{padding-bottom:8px}"+
    ".swa-st{flex:1;min-width:0}.swa-st b{display:block;overflow-wrap:anywhere;font-size:13.5px;font-weight:700}.swa-st small{display:block;font-size:12px;font-weight:600;color:var(--faint);margin-top:1px}"+
    ".swa-link{cursor:pointer}.swa-chev{width:16px;height:16px;color:var(--faint)}"+
    ".swa-seg{display:flex;background:var(--card-2);border-radius:99px;padding:3px;gap:2px}.swa-seg button{border:0;background:none;color:var(--soft);font:inherit;font-size:12px;font-weight:700;padding:6px 12px;border-radius:99px;cursor:pointer}.swa-seg button[aria-pressed=true]{background:var(--card);color:var(--text)}"+
    ".swa-books{display:flex;gap:6px;flex-wrap:wrap;padding:0 12px 12px}.swa-books button{border:1px solid var(--line);background:var(--card-2);border-radius:99px;padding:7px 11px;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;color:var(--text)}.swa-books button[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}"+
    ".swa-sw{width:42px;height:26px;border-radius:99px;border:0;background:var(--raise);position:relative;cursor:pointer;flex:none}.swa-sw:after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s}.swa-sw[aria-checked=true]{background:var(--green)}.swa-sw[aria-checked=true]:after{transform:translateX(16px)}"+
    ".swa-outbtn{width:100%;height:44px;border-radius:99px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;margin:18px 0 12px}.swa-danger{color:var(--red-ink)}"+
    ".swa-go{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}.swa-go[disabled]{opacity:.6;cursor:default}"+
    ".swa-fine{text-align:center}.swa-del{border:0;background:none;font:inherit;font-size:12.5px;font-weight:700;color:var(--red-ink);text-decoration:underline;text-underline-offset:3px;cursor:pointer}"+
    ".swa-note,.swa-msg{font-size:13px;color:var(--soft);line-height:1.5}.swa-card+.swa-card{margin-top:0}.swa-card .swa-set+.swa-set{border-top:1px solid var(--line)}"+
    ".swa-pillbtn{border:1px solid var(--line);background:var(--card-2);color:var(--text);border-radius:99px;padding:6px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}"+
    ".swa-set:focus-visible,.swa-seg button:focus-visible,.swa-books button:focus-visible,.swa-sw:focus-visible,.swa-outbtn:focus-visible,.swa-del:focus-visible,.swa-pillbtn:focus-visible,.swa-in:focus-visible,.swa-back:focus-visible{outline:2px solid var(--accent);outline-offset:2px}"+
    "@media (hover:hover){.swa-mi:hover{background:var(--card-2)}}"+
    "@media (prefers-reduced-motion:reduce){.swa-menu,.swa-scrim,.swa-view{transition:none}}";
  function ensure(){
    if(menu) return;
    var st=d.createElement("style"); st.textContent=CSS; d.head.appendChild(st);
    scrim=d.createElement("div"); scrim.className="swa-scrim"; d.body.appendChild(scrim);
    menu=d.createElement("div"); menu.className="swa-menu"; menu.setAttribute("role","menu"); menu.setAttribute("aria-label","Your account");
    d.body.appendChild(menu);
    scrim.addEventListener("click",close);
    d.addEventListener("keydown",function(e){ if(e.key==="Escape"&&menu.classList.contains("on")) close(); });
    menu.addEventListener("click",function(e){
      var b=e.target.closest&&e.target.closest("[data-go]"); if(!b) return;
      var go=b.getAttribute("data-go"); close();
      if(go==="slips"&&root.openSlipsSheet) root.openSlipsSheet("all");
      else if(go==="profile") profile();
      else if(go==="settings") settings();
      else if(go==="admin") admin();
      else if(go==="out") signOut();
    });
  }
  function acct(){ return root.swAcct||{st:{email:""}}; }
  function role(){ return lsGet("sw.role")||"free"; }
  function savedName(){ try{ return root.localStorage.getItem("sw.name")||""; }catch(e){ return ""; } }
  function open(){
    ensure();
    var a=acct();
    menu.innerHTML=menuHtml({name:firstNameOf(savedName(),a.st.email),email:a.st.email,role:role(),plan:lsGet("sw.plan"),
      quota:root.swQuotaToday?root.swQuotaToday():null,slips:root.swSlipCount?root.swSlipCount():0});
    lastFocus=d.activeElement;
    scrim.classList.add("on"); menu.classList.add("on");
    var av=d.getElementById("hdAccount"); if(av) av.setAttribute("aria-expanded","true");
    var f=menu.querySelector(".swa-mi"); if(f) f.focus({preventScroll:true});
  }
  function close(){
    if(!menu||!menu.classList.contains("on")) return;
    menu.classList.remove("on"); scrim.classList.remove("on");
    var av=d.getElementById("hdAccount"); if(av) av.setAttribute("aria-expanded","false");
    if(lastFocus&&lastFocus.focus) try{ lastFocus.focus(); }catch(e){}
  }
  function toggle(){ if(menu&&menu.classList.contains("on")) close(); else open(); }
  function signOut(){
    var a=acct();
    a.req("POST","/api/auth/logout",{},function(code){
      if(code===200||code===401) a.signedOutHere(null,true); else a.notice("No connection. You are still signed in.");
    });
  }
  var BACK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  /* System Back closes the view: one history entry per open view, as the slips
     sheet does with pushOverlay. eatPop() is called first by the site popstate
     handler so a Back that closes the view does not also change the page. */
  var viewEl=null, pushed=false, ownBack=false;
  function view(title,html){
    ensure();
    if(!viewEl){ viewEl=d.createElement("div"); viewEl.className="swa-view"; viewEl.setAttribute("role","dialog"); viewEl.setAttribute("aria-modal","true"); d.body.appendChild(viewEl);
      d.addEventListener("keydown",function(e){ if(e.key==="Escape"&&viewEl.classList.contains("on")) closeView(); }); }
    viewEl.setAttribute("aria-label",title);
    viewEl.innerHTML="<div class='swa-in-wrap'><button class='swa-back' type='button'>"+BACK+"Back</button><h2 class='swa-t'>"+esc(title)+"</h2>"+html+"</div>";
    viewEl.querySelector(".swa-back").onclick=closeView;
    if(!viewEl.classList.contains("on")){ try{ root.history.pushState({sw:1},""); pushed=true; }catch(e){} }
    viewEl.classList.add("on"); d.documentElement.classList.add("locked");
    viewEl.querySelector(".swa-back").focus({preventScroll:true});
    return viewEl;
  }
  function closeView(popped){ if(!viewEl||!viewEl.classList.contains("on")) return; viewEl.classList.remove("on");
    if(pushed){ pushed=false; if(popped!==true){ ownBack=true; try{ root.history.back(); }catch(e){ ownBack=false; } } } d.documentElement.classList.remove("locked");
    var av=d.getElementById("hdAccount"); if(av) try{ av.focus(); }catch(e){} }
  function lsGet(k){ try{ return root.localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ root.localStorage.setItem(k,v); }catch(e){} }
  function profile(){
    close();
    var a=acct();
    var v=view("Profile",profileHtml({name:firstNameOf(lsGet("sw.name"),a.st.email),
      avatar:root.swAvatarKey?root.swAvatarKey():"fire",role:role(),personal:lsGet("sw.personal"),plan:lsGet("sw.plan"),
      record:root.swRecord?root.swRecord():{built:0,won:0,settled:0},
      quota:root.swQuotaToday?root.swQuotaToday():null}));
    var nm=v.querySelector("#swaName");
    nm.addEventListener("change",function(){
      var t=nm.value.replace(/^\s+|\s+$/g,"").replace(/[<>]/g,"").slice(0,24);
      if(t){ lsSet("sw.name",t); nm.value=t; }
      else nm.value=firstNameOf(lsGet("sw.name"),a.st.email);
    });
    v.querySelectorAll("[data-av]").forEach(function(b){
      b.addEventListener("click",function(){
        lsSet("sw.avatar",b.getAttribute("data-av"));
        v.querySelectorAll("[data-av]").forEach(function(x){ x.setAttribute("aria-pressed",x===b?"true":"false"); });
        if(a.paintButton) a.paintButton();
      });
    });
  }
  function settings(){
    close();
    var a=acct();
    var v=view("Settings",settingsHtml({theme:lsGet("sw.theme")==="light"?"light":"dark",
      book:root.swBookKey?root.swBookKey():"sporty",marks:root.swBookMarks?root.swBookMarks():{},mail:false,devices:null}));
    function say(t){ v.querySelector("#swaMsg").textContent=t||""; }
    function fail(code,j){ if(code===0) return say("No connection. Check your data and try again.");
      if(j&&j.error==="reauth") return say("For your safety, sign in again, then delete within 10 minutes.");
      say("Something went wrong. Try again."); }
    v.querySelectorAll("[data-theme]").forEach(function(b){ b.onclick=function(){
      var t=b.getAttribute("data-theme"); if(root.swSetTheme) root.swSetTheme(t);
      v.querySelectorAll("[data-theme]").forEach(function(x){ x.setAttribute("aria-pressed",x===b?"true":"false"); }); }; });
    v.querySelectorAll("[data-book]").forEach(function(b){ b.onclick=function(){
      if(root.swSetBook) root.swSetBook(b.getAttribute("data-book"));
      v.querySelectorAll("[data-book]").forEach(function(x){ x.setAttribute("aria-pressed",x===b?"true":"false"); }); }; });
    var mail=v.querySelector("#swaMail");
    a.req("GET","/api/account/consent",null,function(code,j){ if(code===200) mail.setAttribute("aria-checked",j.on?"true":"false"); });
    mail.onclick=function(){ var on=mail.getAttribute("aria-checked")!=="true"; mail.disabled=true;
      a.req("POST","/api/account/consent",{on:on},function(code,j){ mail.disabled=false;
        if(code===200) mail.setAttribute("aria-checked",j.on?"true":"false"); else fail(code,j); }); };
    a.req("GET","/api/auth/devices",null,function(code,j){
      var sm=v.querySelector("#swaDevs small"); if(code===200&&j.devices&&sm) sm.textContent=devWords(j.devices.length); });
    v.querySelector("#swaDevs").onclick=function(){ devices(); };
    v.querySelector("#swaOut").onclick=signOut;
    v.querySelector("#swaDel").onclick=function(){ v.querySelector("#swaDelBox").hidden=false; v.querySelector("#swaDelIn").focus(); };
    v.querySelector("#swaDelGo").onclick=function(){
      if(v.querySelector("#swaDelIn").value.replace(/\s/g,"").toUpperCase()!=="DELETE") return say("Type DELETE to confirm.");
      a.req("POST","/api/account/delete",{},function(code,j){
        if(code===200){ closeView(); a.signedOutHere(null,true); a.notice("Your account is deleted."); return; }
        if(code===401) return a.signedOutHere(j&&j.reason);
        fail(code,j);
        if(j&&j.error==="reauth"){ var l=d.createElement("a"); l.textContent=" Sign in again"; l.href="/login?return="+encodeURIComponent("/?account=1"); v.querySelector("#swaMsg").appendChild(l); }
      });
    };
  }
  function devices(){
    var a=acct();
    var v=view("Signed-in devices","<div class='swa-card' id='swaDevList'><div class='swa-set'><span class='swa-st'><small>Loading</small></span></div></div><button class='swa-outbtn' id='swaAll' type='button'>Sign out everywhere</button><p class='swa-msg' id='swaMsg' role='status'></p>");
    v.querySelector("#swaAll").onclick=function(){ a.req("POST","/api/auth/logout-all",{},function(code){
      if(code===200||code===401) a.signedOutHere(null,true);
      else v.querySelector("#swaMsg").textContent=code===0?"No connection. You are still signed in.":"Something went wrong. Try again."; }); };
    function load(){
      a.req("GET","/api/auth/devices",null,function(code,j){
        var box=v.querySelector("#swaDevList"); if(code===401) return a.signedOutHere(j.reason);
        if(code!==200){ box.innerHTML=""; v.querySelector("#swaMsg").textContent="Something went wrong. Try again."; return; }
        box.innerHTML=(j.devices||[]).map(function(x){
          var when=""; try{ when=new Date(x.last_used_at).toLocaleDateString(undefined,{day:"numeric",month:"short"}); }catch(e){}
          return "<div class='swa-set'><span class='swa-st'><b>"+esc(x.label||"Device")+"</b><small>"+(x.current?"This device":"Last used "+esc(when))+"</small></span>"+
            (x.current?"":"<button class='swa-pillbtn' type='button' data-end=\""+esc(x.id)+"\">Sign out</button>")+"</div>"; }).join("");
        box.querySelectorAll("[data-end]").forEach(function(b){ b.onclick=function(){
          a.req("POST","/api/auth/devices/end",{id:b.getAttribute("data-end")},function(c2){ if(c2===200) load(); }); }; });
      });
    }
    load();
  }
  function admin(){
    close();
    var a=acct();
    var v=view("Admin",adminHtml(null)), inp=v.querySelector("#swaGEmail"), btn=v.querySelector("#swaGrant");
    function say(t){ v.querySelector("#swaMsg").textContent=t||""; }
    function fail(code,j){
      if(code===401) return a.signedOutHere(j&&j.reason);
      say(code===0?"No connection. Check your data and try again.":code===403?"Only admins can do that.":
        j&&j.error==="bad_email"?"That email does not look right.":"Something went wrong. Try again.");
    }
    function load(){
      a.req("GET","/api/account/grants",null,function(code,j){
        if(code!==200) return fail(code,j);
        var box=v.querySelector("#swaGrants"); box.innerHTML=grantsHtml(j.grants||[]);
        box.querySelectorAll("[data-revoke]").forEach(function(b){ b.onclick=function(){ b.disabled=true;
          a.req("POST","/api/account/revoke",{email:b.getAttribute("data-revoke")},function(c2,j2){
            if(c2===200){ say("Removed."); load(); } else { b.disabled=false; fail(c2,j2); } }); }; });
      });
    }
    btn.onclick=function(){
      var e=inp.value.replace(/^\s+|\s+$/g,""); if(!e) return say("Add an email first.");
      btn.disabled=true;
      a.req("POST","/api/account/grant",{email:e},function(code,j){ btn.disabled=false;
        if(code===200){ inp.value=""; say("Done. They now have Family & friends."); load(); } else fail(code,j); });
    };
    load();
  }
  function eatPop(){
    if(ownBack){ ownBack=false; return true; }
    if(viewEl&&viewEl.classList.contains("on")){ closeView(true); return true; }
    return false;
  }
  root.swAccountUI={eatPop:eatPop,open:open,close:close,toggle:toggle,profile:profile,settings:settings,admin:admin,closeView:closeView};
})(typeof window!=="undefined"?window:this);
