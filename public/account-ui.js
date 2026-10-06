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
    out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>'
  };
  function codesHtml(q){
    if(!q) return "";
    var pct=Math.round(100*q.used/q.limit);
    return "<div class='swa-q'><div class='swa-q1'><span>Codes today</span><span><span class='swa-n'>"+q.used+"</span> of "+q.limit+"</span></div>"+
      "<div class='swa-bar'><i style='width:"+pct+"%'></i></div></div>";
  }
  function menuHtml(o){
    return "<div class='swa-id'><b>"+esc(o.name)+"</b><small>"+esc(o.email)+"</small><span class='swa-plan'>Free plan</span></div>"+
      codesHtml(o.quota)+
      "<div class='swa-list'>"+
        "<button class='swa-mi' type='button' role='menuitem' data-go='profile'>"+I.user+"Profile</button>"+
        "<button class='swa-mi' type='button' role='menuitem' data-go='slips'>"+I.slips+"My slips<span class='swa-r swa-n'>"+(o.slips||0)+"</span></button>"+
        "<button class='swa-mi' type='button' role='menuitem' data-go='settings'>"+I.gear+"Settings</button>"+
      "</div><div class='swa-list'>"+
        "<button class='swa-mi swa-out' type='button' role='menuitem' data-go='out'>"+I.out+"Sign out</button></div>";
  }
  var AV_FREE=["fire","8bit","2bit","lino","glass","halo"];
  var AV_LOCKED=["storm","lich","gold","holo","graffiti","afro","lowpoly","clay"];
  var AV_NAME={fire:"Fire eyes","8bit":"Arcade","2bit":"2-bit",lino:"Linocut",glass:"Stained glass",halo:"Halo",
    storm:"Storm caller",lich:"Frost lich",gold:"Gold trophy",holo:"Hologram",graffiti:"Graffiti",afro:"Afrofuturist",lowpoly:"Low-poly",clay:"Clay"};
  var LOCK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  function pickerHtml(cur){
    return "<p class='swa-h'>Avatar</p><div class='swa-pick'>"+AV_FREE.map(function(k){
        return "<button type='button' data-av=\""+k+"\" aria-pressed=\""+(k===cur?"true":"false")+"\" aria-label=\""+AV_NAME[k]+" avatar\"><img src='/av/"+k+".webp' alt='' loading='lazy' width='44' height='44'></button>";
      }).join("")+"</div>"+
      "<p class='swa-h'>Skins<small>Unlock with plans</small></p><div class='swa-pick swa-lock'>"+AV_LOCKED.map(function(k){
        return "<button type='button' disabled aria-label=\""+AV_NAME[k]+", comes with plans\"><img src='/av/"+k+".webp' alt='' loading='lazy' width='56' height='56'>"+LOCK+"</button>";
      }).join("")+"</div>";
  }
  function recordHtml(r){
    var pct=r.settled?Math.round(100*r.won/r.settled):0;
    return "<p class='swa-h'>Your record</p><div class='swa-rec'><span class='swa-big'>"+r.won+"</span>"+
      "<span class='swa-m'><b>slips won</b><br>"+(r.settled?"of "+r.settled+" settled, "+pct+"%":"none settled yet")+"</span>"+
      "<span class='swa-side'><span class='swa-n'>"+r.built+"</span>saved</span></div>";
  }
  function subHtml(q){
    return "<p class='swa-h'>Subscription</p><div class='swa-card'><div class='swa-subtop'><span><b>Free plan</b><small>Every feature, 10 codes a day</small></span><span class='swa-soon'>More plans soon</span></div>"+
      (q?"<div class='swa-subuse'>"+codesHtml(q).replace("class='swa-q'","class='swa-q swa-q0'")+"<small>Resets at midnight</small></div>":"")+"</div>";
  }
  function profileHtml(o){
    return "<label class='swa-lbl' for='swaName'>Name on your slips</label>"+
      "<input class='swa-in' id='swaName' maxlength='24' autocomplete='nickname' value=\""+esc(o.name)+"\">"+
      pickerHtml(o.avatar)+recordHtml(o.record)+subHtml(o.quota);
  }
  var api={firstNameOf:firstNameOf,menuHtml:menuHtml,codesHtml:codesHtml,esc:esc,I:I,AV_FREE:AV_FREE,AV_LOCKED:AV_LOCKED,pickerHtml:pickerHtml,recordHtml:recordHtml,profileHtml:profileHtml};
  if(typeof module!=="undefined"&&module.exports){ module.exports=api; return; }
  if(!root.document) return;

  var d=root.document, menu=null, scrim=null, lastFocus=null;
  var CSS=".swa-scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);opacity:0;pointer-events:none;transition:opacity .18s;z-index:9980}.swa-scrim.on{opacity:1;pointer-events:auto}"+
    ".swa-menu{position:fixed;top:58px;right:12px;width:268px;max-width:calc(100vw - 24px);background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:12px;"+
      "box-shadow:0 10px 24px rgba(0,0,0,.45);z-index:9981;transform-origin:calc(100% - 22px) -8px;transform:scale(.92) translateY(-6px);opacity:0;pointer-events:none;"+
      "transition:transform .2s cubic-bezier(.23,1,.32,1),opacity .16s}.swa-menu.on{transform:none;opacity:1;pointer-events:auto}"+
    ".swa-id{padding:14px 14px 12px}.swa-id b{display:block;font-size:14.5px;font-weight:800}.swa-id small{display:block;font-size:12px;font-weight:600;color:var(--faint);margin-top:1px}"+
    ".swa-plan{display:block;margin-top:3px;font-size:12px;font-weight:700;color:var(--accent)}"+
    ".swa-q{margin:0 14px 14px}.swa-q1{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;font-weight:700;color:var(--soft)}"+
    ".swa-n{font-variant-numeric:tabular-nums;font-weight:800;color:var(--text)}"+
    ".swa-bar{height:4px;border-radius:2px;background:var(--raise);margin-top:8px;overflow:hidden}.swa-bar i{display:block;height:100%;background:var(--accent);border-radius:2px}"+
    ".swa-list{border-top:1px solid var(--line);padding:6px}"+
    ".swa-mi{width:100%;display:flex;align-items:center;gap:11px;padding:10px 9px;border:0;background:none;border-radius:8px;color:var(--text);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;text-align:left}"+
    ".swa-mi svg{width:18px;height:18px;color:var(--soft);flex:none}.swa-r{margin-left:auto;color:var(--faint)}.swa-out{color:var(--soft)}"+
    ".swa-mi:focus-visible{outline:2px solid var(--accent);outline-offset:2px}"+
    ".swa-view{position:fixed;inset:0;z-index:9982;background:var(--bg);color:var(--text);overflow-y:auto;padding:16px 16px 40px;transform:translateX(100%);transition:transform .28s cubic-bezier(.23,1,.32,1)}"+
    ".swa-view.on{transform:none}.swa-in-wrap{max-width:520px;margin:0 auto}"+
    ".swa-back{display:flex;align-items:center;gap:4px;border:0;background:none;color:var(--soft);font:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:6px 4px 6px 0}.swa-back svg{width:18px;height:18px}"+
    ".swa-t{margin:0 0 16px;font-size:22px;font-weight:800;letter-spacing:-.01em}"+
    ".swa-h{font-size:13px;font-weight:700;color:var(--soft);margin:18px 2px 8px}.swa-h small{font-weight:600;color:var(--faint);margin-left:6px}"+
    ".swa-lbl{display:block;font-size:12px;font-weight:700;color:var(--faint);margin:0 0 5px}"+
    ".swa-in{width:100%;height:42px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;font-size:15px;font-weight:700;padding:0 12px;box-sizing:border-box}"+
    ".swa-pick{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.swa-pick.swa-lock{grid-template-columns:repeat(4,1fr);gap:12px;padding:0 18px}"+
    ".swa-pick button{aspect-ratio:1;border-radius:50%;border:1.5px solid transparent;background:var(--card-2);padding:0;overflow:hidden;position:relative;cursor:pointer}"+
    ".swa-pick img{width:100%;height:100%;object-fit:cover;display:block}"+
    ".swa-pick button[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-rim)}"+
    ".swa-pick button[disabled]{cursor:not-allowed}.swa-pick button[disabled] img{filter:brightness(.55) saturate(.8)}"+
    ".swa-pick button svg{position:absolute;left:50%;top:50%;width:15px;height:15px;margin:-7.5px 0 0 -7.5px;color:#fff}"+
    ".swa-card,.swa-rec{border:1px solid var(--line);border-radius:12px;background:var(--card)}"+
    ".swa-rec{display:flex;align-items:flex-end;gap:12px;padding:14px}.swa-big{font-size:32px;line-height:1;font-weight:800;font-variant-numeric:tabular-nums;color:var(--green-ink)}"+
    ".swa-m{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:var(--soft);line-height:1.35}.swa-m b{color:var(--text)}"+
    ".swa-side{text-align:right;font-size:12px;font-weight:600;color:var(--faint)}.swa-side .swa-n{display:block;font-size:17px}"+
    ".swa-subtop{display:flex;align-items:center;gap:12px;padding:12px}.swa-subtop b{display:block;font-size:14px;font-weight:800}"+
    ".swa-subtop small{display:block;font-size:12px;font-weight:600;color:var(--faint);margin-top:2px}.swa-soon{margin-left:auto;font-size:12px;font-weight:700;color:var(--faint);white-space:nowrap}"+
    ".swa-subuse{border-top:1px solid var(--line);padding:11px 12px 12px}.swa-q0{margin:0}.swa-subuse small{display:block;margin-top:6px;font-size:12px;font-weight:600;color:var(--faint)}"+
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
      if(go==="slips"&&root.openSlipsSheet) root.openSlipsSheet();
      else if(go==="profile") profile();
      else if(go==="settings") settings();
      else if(go==="out") signOut();
    });
  }
  function acct(){ return root.swAcct||{st:{email:""}}; }
  function savedName(){ try{ return root.localStorage.getItem("sw.name")||""; }catch(e){ return ""; } }
  function open(){
    ensure();
    var a=acct();
    menu.innerHTML=menuHtml({name:firstNameOf(savedName(),a.st.email),email:a.st.email,
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
  var viewEl=null;
  function view(title,html){
    ensure();
    if(!viewEl){ viewEl=d.createElement("div"); viewEl.className="swa-view"; viewEl.setAttribute("role","dialog"); viewEl.setAttribute("aria-modal","true"); d.body.appendChild(viewEl);
      d.addEventListener("keydown",function(e){ if(e.key==="Escape"&&viewEl.classList.contains("on")) closeView(); }); }
    viewEl.setAttribute("aria-label",title);
    viewEl.innerHTML="<div class='swa-in-wrap'><button class='swa-back' type='button'>"+BACK+"Back</button><h2 class='swa-t'>"+esc(title)+"</h2>"+html+"</div>";
    viewEl.querySelector(".swa-back").onclick=closeView;
    viewEl.classList.add("on"); d.documentElement.classList.add("locked");
    viewEl.querySelector(".swa-back").focus({preventScroll:true});
    return viewEl;
  }
  function closeView(){ if(!viewEl) return; viewEl.classList.remove("on"); d.documentElement.classList.remove("locked");
    var av=d.getElementById("hdAccount"); if(av) try{ av.focus(); }catch(e){} }
  function lsGet(k){ try{ return root.localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ root.localStorage.setItem(k,v); }catch(e){} }
  function profile(){
    close();
    var a=acct();
    var v=view("Profile",profileHtml({name:firstNameOf(lsGet("sw.name"),a.st.email),
      avatar:root.swAvatarKey?root.swAvatarKey():"fire",
      record:root.swRecord?root.swRecord():{built:0,won:0,settled:0},
      quota:root.swQuotaToday?root.swQuotaToday():null}));
    var nm=v.querySelector("#swaName");
    nm.addEventListener("change",function(){
      var t=nm.value.replace(/^\s+|\s+$/g,"").replace(/[<>]/g,"").slice(0,24);
      if(t){ lsSet("sw.name",t); nm.value=t; }
    });
    v.querySelectorAll("[data-av]").forEach(function(b){
      b.addEventListener("click",function(){
        lsSet("sw.avatar",b.getAttribute("data-av"));
        v.querySelectorAll("[data-av]").forEach(function(x){ x.setAttribute("aria-pressed",x===b?"true":"false"); });
        if(a.paintButton) a.paintButton();
      });
    });
  }
  function settings(){ close(); }
  root.swAccountUI={open:open,close:close,toggle:toggle,profile:profile,settings:settings,closeView:closeView};
})(typeof window!=="undefined"?window:this);
