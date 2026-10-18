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
    clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4 3 11l7 2 2 7 9-16Z"/><path d="m10 13 4-4"/></svg>',
    user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
    slips:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z"/></svg>',
    shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/></svg>',
    out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>',
    bolt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>'
  };
  function dayMonth(iso){ var t=Date.parse(iso||""); if(!isFinite(t)) return ""; try{ return new Date(t).toLocaleDateString("en-GB",{day:"numeric",month:"short"}); }catch(e){ return ""; } }
  /* EACH CLASS ITS OWN COLOUR (owner, 18 Oct 2026): free silver, Wizard Pass gold, Founding
     Wizard ruby, Family & friends electric, Admin platinum (tokens in index.html). */
  function clsOf(role,fw){ return role==="admin"?"admin":role==="ff"?"ff":fw?"founder":role==="plus"?"pass":"free"; }
  /* "Plus · until 12 Nov", and the Founding Wizard badge (api/pay.js) for good once earned. */
  function planHtml(o){ var u=o.role==="plus"?dayMonth(o.plusUntil):"";
    return "<span class='swa-plan swa-c-"+clsOf(o.role,o.founder)+"'>"+esc(o.plan||"Free plan")+(u?" · until "+esc(u):"")+"</span>"+
      (o.founder?"<span class='swa-fw'>Founding Wizard</span>":""); }
  /* Everyone but admin and Family & friends can buy or top up a pass. */
  function canBuy(role){ return role!=="admin"&&role!=="ff"; }
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
        (canBuy(o.role)?"<button class='swa-mi swa-mplus' type='button' role='menuitem' data-go='plus'>"+I.bolt+(o.role==="plus"?"Add days":"Get Wizard Pass")+"<span class='swa-r'>"+(o.role==="plus"?"Wizard Pass":"Codes every day")+"</span></button>":"")+
        "<button class='swa-mi' type='button' role='menuitem' data-go='profile'>"+I.user+"Profile</button>"+
        "<button class='swa-mi' type='button' role='menuitem' data-go='daily'>"+I.clock+"My daily slip<span class='swa-r'>10:30</span></button>"+
        "<button class='swa-mi' type='button' role='menuitem' data-go='tg'>"+I.send+"Telegram bot</button>"+
        "<button class='swa-mi' type='button' role='menuitem' data-go='slips'>"+I.slips+"My slips<span class='swa-r swa-n'>"+(o.slips||0)+"</span></button>"+
        "<button class='swa-mi' type='button' role='menuitem' data-go='msgs'>"+I.chat+"Messages"+(o.unread?"<span class='swa-r swa-unr'>"+(o.unread>9?"9+":o.unread)+"</span>":"")+"</button>"+
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
  /* THE FOUNDING WIZARD HONOUR (owner, 16 Oct 2026): the crest, their number and a
     thank-you on the plan card, kept for good like the badge. No number yet (the
     database has not said) still shows the honour. */
  function fwHtml(no){
    return "<div class='swa-fwseal'><img src='/fw/crest-sm.webp' alt='Founding Wizard crest' width='80' height='92'>"+
      "<span><b>Founding Wizard</b><small>"+(no?"No. "+esc(no)+" of the first 200. ":"")+"With thanks for being one of the first.</small></span></div>";
  }
  /* THE FAMILY & FRIENDS CREST (owner, 18 Oct 2026: "special electric badge for family and
     friends"): a lightning shield on the plan card, where Founding Wizards get theirs:
     public/fw/ff-crest.svg, whose bolt glows and sparks crackle every few seconds, still for
     anyone who asks for reduced motion. */
  function ffHtml(){
    return "<div class='swa-xseal swa-ffseal'><img src='/fw/ff-crest.svg' alt='Family and friends crest' width='80' height='92'>"+
      "<span><b>Family &amp; friends</b><small>One of the Wizard's own.</small></span></div>";
  }
  /* THE WIZARD PASS CREST (owner, 18 Oct 2026: "similar for the wizard pass also, different
     but not as glamorous"): public/fw/pass-crest.svg, plain gold with the wand's star, no motion.
     A Founding Wizard shows their own crest instead. */
  function wpCrestHtml(){
    return "<div class='swa-xseal swa-wpseal'><img src='/fw/pass-crest.svg' alt='Wizard Pass crest' width='80' height='92'>"+
      "<span><b>Wizard Pass</b><small>Thanks for backing the Wizard.</small></span></div>";
  }
  function subHtml(q,role,plan,until,fw,fwNo){
    var u=role==="plus"?dayMonth(until):"";
    var what=role==="admin"?"Every feature, no limit":role==="ff"?"Every feature, 100 codes a day":
      role==="plus"?((+lsGet("sw.codeLimit")||20)>=100?"Unlimited codes":(+lsGet("sw.codeLimit")||20)+" codes a day")+(u?", until "+esc(u):""):"2 trial codes";
    var cls=clsOf(role,fw);
    return "<p class='swa-h'>Your plan</p><div class='swa-card"+(fw?" swa-fwcard":role==="ff"?" swa-ffcard":role==="plus"?" swa-wpcard":role==="admin"?" swa-adcard":"")+"'><div class='swa-subtop'><span><b class='swa-c-"+cls+"'>"+esc(plan||"Free plan")+"</b><small>"+what+"</small></span>"+
      (canBuy(role)?"<button class='swa-pillbtn swa-pgo' type='button' data-plus>"+(role==="plus"?"Add days":"Get Wizard Pass")+"</button>":"")+"</div>"+
      (fw?fwHtml(fwNo):role==="ff"?ffHtml():role==="plus"?wpCrestHtml():"")+
      (role==="admin"||q?"<div class='swa-subuse'>"+codesHtml(q,role).replace("class='swa-q'","class='swa-q swa-q0'")+(role==="admin"?"":role==="plus"||role==="ff"?"<small>Resets at midnight</small>":"")+"</div>":"")+"</div>";
  }
  /* THE PLUS SCREEN (owner, 16 Oct 2026). o = GET /api/pay/offer plus role and
     plusUntil. Prepaid: nothing renews, a new pass stacks on the days left. */
  function naira(n){ return "₦"+String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,","); }
  /* Owner, 16 Oct 2026: "i liked the old one because it was simple and every detail could
     be seen on the page... make it look better. everything has to be on one page without
     scrolling." The old order - what you get, the founders' offer, three passes, pay - in
     the site's own type: the gold display title with the wizard, Saira prices, one
     favoured strip for the founders. Sized to fit a phone above the tab bar. */
  var LOCKI='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  /* PRICES FROM 1 NOV 2026 (owner, 18 Oct 2026; lib/pricing.js). Until then each pass
     carries its new price (next), struck through beside today's; from then every pass is
     unlimited codes with a stated fair-use limit (lib/pricing.js FAIR_USE). */
  function passHtml(p,pick,f){
    var fw=p.pass==="month"&&p.naira<p.full;
    /* A founder sees today's month price struck, not the 1 Nov one (owner, 18 Oct 2026: "the
       2000 is slashed till the spots are filled"). */
    var was=fw?p.full:Math.max(p.full||0,p.next||0);
    var per=(p.days>1?p.days+" days · "+naira(p.naira/p.days)+" a day":"24 hours")+(p.unlimited?" · unlimited codes":p.codes?" · "+p.codes+" codes a day":"");
    return "<button type='button' class='swa-pass swa-tier-"+esc(fw?"fw":p.pass)+(p.pass==="month"?" swa-hasbest":"")+"' data-pass='"+esc(p.pass)+"' aria-pressed='"+(p.pass===pick?"true":"false")+"'>"+
      (p.pass==="month"?"<span class='swa-best'>Best value</span>":"")+
      "<span class='swa-st'><b>"+esc(p.label)+"</b><small>"+per+"</small>"+
      (fw?"<small class='swa-fwp'>Founding Wizard price"+(f&&f.monthsLeft<3?" · "+f.monthsLeft+" of 3 months left":"")+"</small>":"")+"</span>"+
      "<span class='swa-price'>"+(was>p.naira?"<s>"+naira(was)+"</s>":"")+"<b>"+naira(p.naira)+"</b></span></button>";
  }
  function plusHtml(o,pick){
    var u=o.role==="plus"?dayMonth(o.plusUntil):"", f=o.founder;
    var passes=(o.passes||[]).map(function(p){ return passHtml(p,pick,f); }).join("");
    var sel=(o.passes||[]).filter(function(p){ return p.pass===pick; })[0];
    var seats=(f&&f.seats)||200, taken=f?Math.max(0,seats-f.seatsLeft):0;
    var unl=(o.passes||[]).some(function(p){ return p.unlimited; }), cap=unl?o.passes[0].codes:20;
    return "<img class='swa-wpwiz' src='/emo/wiz-spell.webp' alt='' width='112' height='112'>"+
      "<p class='swa-wpsub'><b>"+(unl?"Unlimited booking codes":"20 booking codes a day")+"</b> on every bookie, from every tool: the Wizard, Slider, Converter, Edit for me, Split and Trim. Pay once. Nothing renews.</p>"+
      /* THE ONE THING THE OTHERS DO NOT HAVE (owner, 18 Oct 2026): a public, graded record. */
      "<p class='swa-wprec'>Every pick is graded in public, win or lose. <a href='/how-it-works'>See our record</a></p>"+
      (o.switchAt?"<p class='swa-wpnow'><b>New prices from 1 Nov.</b> Buy now at today's price. From 1 Nov every running pass gets unlimited codes (fair use).</p>":"")+
      (u?"<p class='swa-wpnow'>Your pass runs until <b>"+esc(u)+"</b>. A new pass adds its days on top.</p>":"")+
      (f&&f.open&&f.seatsLeft>0&&f.monthsLeft===3?
        "<div class='swa-fwpanel'><div class='swa-fwhead'><span class='swa-fwt'>Founding Wizards</span>"+
            "<span class='swa-fwleft'><b>"+f.seatsLeft+"</b> of "+seats+" places left</span></div>"+
          "<p class='swa-fwd'>The first "+seats+" users pay <b>"+naira(1500)+"</b> for their first 3 month passes."+
            (f.endsAt?" <b>Ends "+dayMonth(new Date(Date.parse(f.endsAt)-1).toISOString())+"</b> or when the places go.":"")+"</p>"+
          "<div class='swa-fwbar' role='img' aria-label='"+taken+" of "+seats+" places taken'><i style='--to:"+Math.max(2,Math.round(100*taken/seats))+"%'></i></div></div>":"")+
      "<div class='swa-passes'>"+(passes||"<p class='swa-note'>Prices did not load. Check your connection and try again.</p>")+"</div>"+
      (sel?"<button class='swa-wppay' id='swaPay' type='button'>"+LOCKI+"<span>Pay "+naira(sel.naira)+" with Paystack</span></button>":"")+
      "<p class='swa-wpfine'>Card, bank transfer or USSD, on Paystack's secure page. We don't keep your card. No hidden charges. 18+."+(unl?" Fair use: up to "+cap+" codes a day.":"")+"</p>"+
      "<p class='swa-msg' id='swaMsg' role='status' aria-live='polite'></p>";
  }
  function profileHtml(o){
    return "<label class='swa-lbl' for='swaName'>Name on your slips</label>"+
      "<input class='swa-in' id='swaName' maxlength='24' autocomplete='nickname' value=\""+esc(o.name)+"\">"+
      pickerHtml(o.avatar,o.role,o.personal)+recordHtml(o.record)+subHtml(o.quota,o.role,o.plan,o.plusUntil,o.founder,o.founderNo)+dailyHtml(o.role)+tgHtml(o.role);
  }
  /* CONNECT TELEGRAM (owner, 16 Oct 2026; lib/tglink.js): ties the bot to this
     account, so a Wizard Pass works in the bot too. A real link, filled by tgFill
     when the panel opens (so it opens in a new tab like any link, and says whether
     this account is already connected); the click handler covers a stale one. */
  function tgPitch(role){ return role==="plus"||role==="ff"||role==="admin"?"Use your Wizard Pass in the bot too.":"Book and convert codes from a chat."; }
  function tgHtml(role){
    return "<p class='swa-h'>Telegram bot</p><div class='swa-card'><div class='swa-set'><span class='swa-st'><b>Wizard's Eye</b>"+
      "<small id='swaTgT'>"+tgPitch(role)+"</small></span>"+
      "<a class='swa-pillbtn swa-tgbtn' data-tglink target='_blank' rel='noopener'>Connect</a></div></div>";
  }
  /* MY DAILY SLIP (owner, 17 Oct 2026; api/ladder.js, lib/ladder.js). Wizard Pass:
     pick one payout from the daily ladder and a bookie; the code comes every morning
     at 10:30 as a phone alert, and on Telegram after /daily in the bot. */
  var RUNGS=[5,10,20,100,1000], BOOK_KEYS=["sporty","bet9ja","betking","betpawa","onexbet","betway"];
  function isPass(role){ return role==="plus"||role==="ff"||role==="admin"; }
  function dailyHtml(role){
    if(!isPass(role)){
      /* The Play Store app sells nothing (Play billing rules, index.html sw-twa). */
      if(d&&d.documentElement&&d.documentElement.classList.contains("sw-twa")) return "";
      return "<p class='swa-h'>My daily slip</p><div class='swa-card'><div class='swa-set'><span class='swa-st'><b>Your slip, every morning</b>"+
        "<small>Pick your odds once. We send the code at 10:30. Comes with Wizard Pass.</small></span></div></div>";
    }
    return "<p class='swa-h'>My daily slip</p><div class='swa-card' id='swaDaily'>"+
      "<div class='swa-set'><span class='swa-st'><b>Your odds</b><small>We pick the games. You copy the code.</small></span>"+
        "<select class='swa-in swa-sel' id='swaRung' aria-label='Your odds'><option value='0'>Off</option>"+
        RUNGS.map(function(x){ return "<option value='"+x+"'>x"+x+"</option>"; }).join("")+"</select></div>"+
      "<div class='swa-set swa-bkset'><span class='swa-st'><b>Your bookie</b></span>"+
        "<div class='swa-bkchips' id='swaRBook' role='radiogroup' aria-label='Your bookie'>"+
        BOOK_KEYS.map(function(k){ return "<button class='swa-bkc' type='button' role='radio' data-bk='"+k+"' aria-checked='false' aria-label='"+esc(BOOK_NAME[k])+"'>"+markOf(k)+"</button>"; }).join("")+"</div></div>"+
      "<div class='swa-set'><span class='swa-st'><b>Phone alert</b><small>At 10:30, with the code.</small></span>"+
        "<button class='swa-sw' id='swaRPush' type='button' role='switch' aria-checked='true' aria-label='Phone alert'></button></div>"+
      "<div class='swa-set'><span class='swa-st'><small id='swaRNote'>On Telegram too: connect the bot below, then send /daily to it.</small></span></div>"+
      "</div>";
  }
  function dailyFill(v,role){
    var box=v.querySelector("#swaDaily"); if(!box||!root.swAcct) return;
    var rg=box.querySelector("#swaRung"), bkBox=box.querySelector("#swaRBook"), pu=box.querySelector("#swaRPush"), nt=box.querySelector("#swaRNote");
    /* The chips stand in for a select: bk.value reads and sets the chosen book. */
    var bk={ get value(){ var c=bkBox.querySelector("[aria-checked='true']"); return c?c.getAttribute("data-bk"):"sporty"; },
      set value(k){ [].forEach.call(bkBox.querySelectorAll(".swa-bkc"),function(c){ c.setAttribute("aria-checked",String(c.getAttribute("data-bk")===k)); }); } };
    var cur=null; try{ cur=root.curBookKey?root.curBookKey():lsGet("sw.book"); }catch(e){}
    bk.value=cur&&BOOK_KEYS.indexOf(cur)>=0?cur:"sporty";
    if(root.swDailyPreset){ rg.value=String(root.swDailyPreset); }
    function show(j){
      if(!j) return;
      rg.value=String(j.rung||0); if(j.book) bk.value=j.book; pu.setAttribute("aria-checked",String(j.push!==false));
      if(j.telegram) nt.textContent="Telegram is on. Send /daily off to the bot to stop it there.";
    }
    root.swAcct.req("GET","/api/account/autopilot",null,function(code,j){
      if(code!==200) return;
      /* Opened from "Get this every morning": that rung, saved now unless one is already set. */
      var pre=root.swDailyPreset; root.swDailyPreset=null;
      if(pre&&!j.rung){ rg.value=String(pre); save(); } else show(j);
    });
    function save(){
      var r=+rg.value;
      root.swAcct.req("POST","/api/account/setautopilot",r?{rung:r,book:bk.value,push:pu.getAttribute("aria-checked")==="true"}:{rung:null},function(code,j){
        if(code===200){ show(j); nt.textContent=r?"Saved. Your x"+r+" code comes at 10:30 every morning.":"Off. No daily slip."; }
        else nt.textContent="Couldn't save. Check your connection and try again.";
      });
    }
    rg.addEventListener("change",save);
    bkBox.addEventListener("click",function(e){ var c=e.target.closest&&e.target.closest(".swa-bkc"); if(!c) return; bk.value=c.getAttribute("data-bk"); if(+rg.value) save(); });
    pu.addEventListener("click",function(){ pu.setAttribute("aria-checked",String(pu.getAttribute("aria-checked")!=="true")); if(+rg.value) save(); });
  }
  function profileAt(sel){
    profile();
    setTimeout(function(){ var e=d.querySelector(sel); if(e&&e.scrollIntoView) e.scrollIntoView({block:"center",behavior:"smooth"}); },120);
  }
  function daily(rung){
    if(rung) root.swDailyPreset=rung;
    profileAt(isPass(role())?"#swaDaily":".swa-h");
  }
  function tgFill(v,role){
    var b=v.querySelector("[data-tglink]"), t=v.querySelector("#swaTgT");
    if(!b||!root.swAcct) return;
    root.swAcct.req("GET","/api/account/tglink",null,function(code,j){
      if(code!==200||!j||!j.url) return;
      b.href=j.url; b.setAttribute("data-at",String(Date.now()));
      if(j.linked){ b.textContent="Reconnect"; if(t) t.textContent="Connected. "+tgPitch(role).replace(" too","").replace("Use","You can use"); }
    });
  }
  function grantsHtml(list){
    if(!list.length) return "<div class='swa-set'><span class='swa-st'><small>No one yet. Add an email above.</small></span></div>";
    return list.map(function(g){
      var when=""; try{ when=new Date(g.created_at).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}); }catch(e){}
      return "<div class='swa-set'><span class='swa-st'><b>"+esc(g.email)+"</b><small>since "+esc(when)+"</small></span>"+
        "<button class='swa-pillbtn' type='button' data-revoke=\""+esc(g.email)+"\">Remove</button></div>"; }).join("");
  }
  /* GOD MODE (owner, 13 Oct 2026): switches, status, numbers and reader lookup,
     over /api/account/{flags,setflags,stats,lookup,signout}. */
  function ago(iso){
    var t=Date.parse(iso); if(!isFinite(t)) return "never";
    var m=Math.round((Date.now()-t)/60000);
    return m<1?"just now":m<60?m+" min ago":m<1440?Math.round(m/60)+" h ago":(Math.round(m/1440)===1?"1 day ago":Math.round(m/1440)+" days ago");
  }
  function num(x){ return Number(x||0).toLocaleString("en-US"); }
  /* Each bookmaker in its own wordmark and colours, as on the site (owner, 13 Oct 2026). */
  function markOf(k){ var m=null; try{ m=root.swBookMarks?root.swBookMarks():null; }catch(e){}
    return "<span class='swa-bk'>"+(m&&m[k]?m[k]:esc(BOOK_NAME[k]||k))+"</span>"; }
  function msg(t){ return "<div class='swa-set'><span class='swa-st'><small>"+esc(t)+"</small></span></div>"; }
  function switchesHtml(fl){
    var off=(fl&&fl.booksOff)||[];
    return Object.keys(BOOK_NAME).map(function(k){ var on=off.indexOf(k)<0;
      return "<div class='swa-set'><span class='swa-st'><b>"+markOf(k)+"</b><small>"+(on?"Booking on":"Paused. Users are told to pick another bookmaker.")+"</small></span>"+
        "<button class='swa-sw' type='button' role='switch' data-book-sw='"+k+"' aria-checked='"+on+"' aria-label='"+esc(BOOK_NAME[k])+" booking'></button></div>"; }).join("");
  }
  function statusHtml(st,board){
    var by={}; ((st&&st.books)||[]).forEach(function(b){ by[b.book]=b; });
    var rows=Object.keys(BOOK_NAME).map(function(k){ var b=by[k];
      return "<div class='swa-set'><span class='swa-st'><b>"+markOf(k)+"</b><small>"+
        (b?"Last code "+ago(b.last)+" · "+num(b.lastHour)+" in the last hour · "+num(b.today)+" today":"No codes in the last 7 days")+"</small></span></div>"; });
    if(board&&board.generatedAt) rows.push("<div class='swa-set'><span class='swa-st'><b>Predictions</b><small>Built "+ago(board.generatedAt)+"</small></span></div>");
    return rows.join("");
  }
  function numbersHtml(st,board){
    var rec=board&&board.record, rows=[
      ["Users with an account",num(st.users)],
      /* Plain phrases, so a count never runs into its period (owner, 13 Oct 2026:
         "it just saw 7 days 10. no demarcation"). */
      ["New accounts",num(st.signupsToday)+" today, "+num(st.signups7d)+" in the last 7 days"],
      ["Signed-in users seen",num(st.activeToday)+" today, "+num(st.active7d)+" in the last 7 days"],
      ["Family & friends",num(st.ffMembers)],
      ["Codes booked",num(st.codesToday)+" today, "+num(st.codes7d)+" in the last 7 days"],
      ["Slips that landed",num(st.landed7d)+" in the last 7 days"]];
    if(rec&&rec.total) rows.push(["Our picks",num(rec.correct)+" of "+num(rec.total)+" right ("+Math.round(100*rec.correct/rec.total)+"%) · last "+(rec.days||14)+" days"]);
    return rows.map(function(r){ return "<div class='swa-set'><span class='swa-st'><b>"+esc(r[0])+"</b><small>"+esc(r[1])+"</small></span></div>"; }).join("");
  }
  function lookupHtml(r){
    if(!r.found) return msg(r.email+" has no account."+(r.ff?" Family & friends is waiting for them when they sign up.":""));
    var devs=(r.devices||[]).map(function(d){ return esc((d.label||"Device")+" · "+ago(d.last_used_at)); }).join("<br>");
    var codes=r.codes==null?"Free users are counted by device, so their codes are not tied to the account.":
      (r.codes.length?r.codes.map(function(c){ return esc(c.code)+" · "+markOf(c.book)+" · "+esc(c.status)+" · "+ago(c.created_at); }).join(" | "):"No codes yet.");
    return "<div class='swa-set'><span class='swa-st'><b>"+esc(r.email)+"</b><small>"+esc(r.plan+" · joined "+ago(r.created_at)+" · last seen "+ago(r.last_seen_at)+(r.google?" · Google":""))+"</small></span></div>"+
      "<div class='swa-set'><span class='swa-st'><b>Signed in on "+(r.devices||[]).length+"</b><small>"+(devs||"No devices")+"</small></span>"+
        ((r.devices||[]).length&&r.role!=="admin"?"<button class='swa-pillbtn' type='button' data-lk-out>Sign out everywhere</button>":"")+"</div>"+
      "<div class='swa-set'><span class='swa-st'><b>Codes</b><small>"+esc(codes)+"</small></span></div>"+
      (r.role==="admin"?"":"<div class='swa-set'><span class='swa-st'><b>Family &amp; friends</b><small>"+(r.ff?"Yes":"No")+"</small></span>"+
        "<button class='swa-pillbtn' type='button' data-lk-ff='"+(r.ff?"revoke":"grant")+"'>"+(r.ff?"Remove":"Give")+"</button></div>");
  }
  /* ONE SECTION AT A TIME (owner, 13 Oct 2026: "put all sections as row or something
     that i can toggle in between"). A row of tabs across the top; the last one used
     is remembered on this device. The two lists that grow carry their count on the
     tab, so a closed one still says what it holds. */
  /* Messages and Readers (owner, 14 Oct 2026) are filled by public/messages.js. */
  var ADMIN_TABS=[["swaTMsg","Messages"],["swaTAlerts","Alerts"],["swaTLk","Users"],["swaTSw","Switches"],["swaTStatus","Status"],["swaTNums","Numbers"],
    ["swaTGrants","Family & friends"],["swaTHits","Won slips"],["swaTLog","Log"]];
  function adminHtml(list){
    var body={
      swaTSw:"<div class='swa-card'><div class='swa-set'><span class='swa-st'><b>Maintenance mode</b><small>Every user sees the maintenance page and all booking stops. You still see the site.</small></span>"+
        "<button class='swa-sw' id='swaMaint' type='button' role='switch' aria-checked='false' aria-label='Maintenance mode'></button></div></div>"+
        "<label class='swa-lbl' for='swaMaintMsg'>Message on the maintenance page</label>"+
        "<input class='swa-in' id='swaMaintMsg' type='text' maxlength='120' autocomplete='off' placeholder='Back by 8pm with fresh picks.'>"+
        "<div class='swa-card' id='swaSw'>"+msg("Loading")+"</div>"+
        /* The old one-line notice is the message board now (Messages tab). One still up is shown here to clear. */
        "<div id='swaOldNotice' hidden><label class='swa-lbl'>Old notice line, still showing</label><div class='swa-card'><div class='swa-set'><span class='swa-st'><small id='swaNoticeT'></small></span>"+
        "<button class='swa-pillbtn' id='swaNoticeOff' type='button'>Clear</button></div></div></div>",
      swaTMsg:"<div class='swa-card'>"+msg("Loading")+"</div>",
      swaTStatus:"<div class='swa-card' id='swaStatus'>"+msg("Loading")+"</div>",
      swaTNums:"<div class='swa-card' id='swaNums'>"+msg("Loading")+"</div>",
      swaTLk:"<p class='swa-note'>Type a user's email to see their plan, devices and booked codes. From there you can sign them out everywhere or give them Family &amp; friends.</p>"+
        "<label class='swa-lbl' for='swaLkEmail'>User's email</label>"+
        "<input class='swa-in' id='swaLkEmail' type='email' autocomplete='off' autocapitalize='none' spellcheck='false'>"+
        "<button class='swa-outbtn swa-go' id='swaLkGo' type='button'>Look up</button>"+
        "<div class='swa-card' id='swaLk' hidden></div>",
      swaTGrants:"<label class='swa-lbl' for='swaGEmail'>Email</label>"+
        "<input class='swa-in' id='swaGEmail' type='email' autocomplete='off' autocapitalize='none' spellcheck='false'>"+
        "<button class='swa-outbtn swa-go' id='swaGrant' type='button'>Give Family &amp; friends</button>"+
        "<div class='swa-card' id='swaGrants'>"+(list?grantsHtml(list):msg("Loading"))+"</div>",
      swaTHits:"<div class='swa-card' id='swaHits'>"+msg("Loading")+"</div>",
      swaTLog:"<div class='swa-card' id='swaLog'>"+msg("Loading")+"</div>",
      swaTAlerts:"<div class='swa-card' id='swaAlerts'>"+msg("Loading")+"</div>"};
    return "<div class='swa-tabs' role='tablist' aria-label='Admin sections'>"+ADMIN_TABS.map(function(t){
        return "<button type='button' role='tab' class='swa-tab' id='"+t[0]+"B' data-tab='"+t[0]+"' aria-controls='"+t[0]+"' aria-selected='false'>"+
          esc(t[1])+"<small class='swa-cnt'></small></button>"; }).join("")+"</div>"+
      /* The message line sits under the tabs, so an answer lands where the eye is. */
      "<p class='swa-msg' id='swaMsg' role='status' aria-live='polite'></p>"+
      ADMIN_TABS.map(function(t){
        return "<section class='swa-panel' id='"+t[0]+"' role='tabpanel' aria-labelledby='"+t[0]+"B' hidden>"+body[t[0]]+"</section>"; }).join("");
  }
  /* THE AUDIT LOG, each entry as a sentence (/api/account/audit). */
  function logLine(r){
    var d=r.detail||{}, t=r.target||"";
    if(r.action==="setflags"){
      var b=(d.before&&d.before.booksOff)||[], a=(d.after&&d.after.booksOff)||[], out=[];
      a.filter(function(k){ return b.indexOf(k)<0; }).forEach(function(k){ out.push("Paused "+(BOOK_NAME[k]||k)+" booking"); });
      b.filter(function(k){ return a.indexOf(k)<0; }).forEach(function(k){ out.push("Turned "+(BOOK_NAME[k]||k)+" booking back on"); });
      var nb=(d.before&&d.before.notice)||"", na=(d.after&&d.after.notice)||"";
      if(na!==nb) out.push(na?"Set the notice: \u201c"+na+"\u201d":"Cleared the notice");
      var mb=!!(d.before&&d.before.maint), ma=!!(d.after&&d.after.maint);
      if(ma!==mb) out.push(ma?"Turned maintenance mode on":"Turned maintenance mode off");
      return out.join(". ")||"Saved the switches with no change";
    }
    if(r.action==="lookup") return "Looked up "+t+(d.found===false?" (no account)":"");
    if(r.action==="send") return "Sent a message to "+t+(d.text?": \u201c"+d.text+"\u201d":"");
    if(r.action==="unsend") return "Unsent "+t;
    if(r.action==="signout") return "Signed "+t+" out on every device";
    if(r.action==="grant") return "Gave Family & friends to "+t;
    if(r.action==="revoke") return "Removed Family & friends from "+t;
    if(r.action==="settle") return "Marked "+t+" as "+(d.status||"settled");
    return r.action+(t?" "+t:"");
  }
  function logHtml(rows){
    if(!rows.length) return msg("Nothing yet. Every change you make here, and every user you look up, is recorded.");
    return rows.map(function(r){
      return "<div class='swa-set'><span class='swa-st'><b>"+esc(logLine(r))+"</b><small>"+esc(r.admin_email+" · "+ago(r.at))+"</small></span></div>"; }).join("");
  }
  /* ALERTS (owner, 16 Oct 2026: "log every alert"): everything that came in, newest
     first (api/account.js alerts, lib/alerts.js); a red dot on what arrived since this
     device last opened the tab. Labels are words, not emoji (DESIGN.md). */
  var ALERT_KIND={reply:"Reply",payment:"Payment",founder:"Founding Wizard",win:"Slip landed",signup:"New user"};
  function alertsHtml(list,seen){
    if(!list.length) return msg("Nothing yet. Replies, payments, landed slips and new users show up here.");
    return list.map(function(x){ var fresh=Date.parse(x.at)>seen;
      return "<div class='swa-set swa-al"+(fresh?" swa-alnew":"")+"'><span class='swa-st'><b>"+(fresh?"<i class='swa-aldot' aria-label='New'></i>":"")+esc(x.title)+"</b>"+
        "<small><span class='swa-alk swa-alk-"+esc(x.kind)+"'>"+esc(ALERT_KIND[x.kind]||x.kind)+"</span>"+(x.detail?esc(x.detail)+" · ":"")+esc(ago(x.at))+"</small></span></div>"; }).join("");
  }
  function setCount(v,id,text){ var el=v.querySelector("[data-tab='"+id+"'] .swa-cnt"); if(el) el.textContent=text||""; }
  function wireTabs(v){
    var saved=null; try{ saved=localStorage.getItem("sw.admintab"); }catch(e){}
    function show(id){
      v.querySelectorAll(".swa-tab").forEach(function(b){ var on=b.getAttribute("data-tab")===id;
        b.setAttribute("aria-selected",String(on)); b.tabIndex=on?0:-1;
        /* After layout: run at once, the sheet is still sliding in and the tab ends half off the edge. */
        if(on) setTimeout(function(){ try{ b.scrollIntoView({block:"nearest",inline:"center"}); }catch(e){} },60); });
      v.querySelectorAll(".swa-panel").forEach(function(p){ p.hidden=p.id!==id; });
      var m=v.querySelector("#swaMsg"); if(m) m.textContent="";
      try{ localStorage.setItem("sw.admintab",id); }catch(e){}
    }
    v.querySelectorAll(".swa-tab").forEach(function(b){
      b.onclick=function(){ show(b.getAttribute("data-tab")); };
      b.onkeydown=function(e){ if(e.key!=="ArrowRight"&&e.key!=="ArrowLeft") return;
        var all=[].slice.call(v.querySelectorAll(".swa-tab")), i=all.indexOf(b)+(e.key==="ArrowRight"?1:-1);
        var nb=all[(i+all.length)%all.length]; nb.click(); nb.focus(); };
    });
    show(ADMIN_TABS.some(function(t){ return t[0]===saved; })?saved:ADMIN_TABS[0][0]);
  }
  /* EVERY CODE BOOKED ON THE SITE THAT CAME HOME (owner, 12 Oct 2026; lib/slipwatch.js).
     "check" = every leg we could grade won, but some legs (corners, shots, first half)
     cannot be graded from a final score - shown so the owner can look, never as a hit. */
  /* WHERE THE CODE CAME FROM (bookFetch's src). A converted code is the reader's own
     picks rebooked on another bookie - not a slip we built - so it is named as such. */
  var SRC_WORDS={convert:"Converted: the user's own picks",board:"Built from our board",safer:"Made safer from our picks",
    split:"Split from our picks",myslip:"My slip (our picks)"};
  function srcWords(s){ return s?(SRC_WORDS[s]||"Built on the site ("+s+")"):"Source not recorded"; }
  var BOOK_NAME={sporty:"SportyBet",bet9ja:"Bet9ja",betking:"BetKing",betpawa:"Betpawa",onexbet:"1xBet",betway:"Betway"};
  function hitsHtml(list){
    if(!list.length) return "<div class='swa-set'><span class='swa-st'><small>No landed slips yet. They show up here within ten minutes of the last game ending.</small></span></div>";
    var landed=list.filter(function(h){ return h.status==="landed"; });
    var best=landed.reduce(function(m,h){ return Math.max(m,Number(h.total_odds)||0); },0);
    var head="<div class='swa-set'><span class='swa-st'><b>"+landed.length+" landed"+(best?" · biggest ×"+esc(best.toLocaleString("en-US",{maximumFractionDigits:2})):"")+"</b>"+
      "<small>"+(list.length-landed.length)+" to check by hand</small></span></div>";
    return head+list.map(function(h){
      var when=""; try{ when=new Date(h.settled_at||h.created_at).toLocaleDateString(undefined,{day:"numeric",month:"short"}); }catch(e){}
      var legs=(h.legs||[]).map(function(l){ return l.name; });
      var games=(h.leg_count||legs.length)+" game"+((h.leg_count||legs.length)===1?"":"s");
      return "<div class='swa-set'><span class='swa-st'><b>"+esc(h.code)+" · "+markOf(h.book)+
        (h.total_odds?" · <span class='swa-gold'>×"+esc(Number(h.total_odds).toLocaleString("en-US",{maximumFractionDigits:2}))+"</span>":"")+"</b>"+
        "<small>"+esc(games+" · "+when+(h.who?" · "+h.who:""))+"</small>"+
        "<small>"+esc(srcWords(h.src))+"</small>"+
        (legs.length?"<small>"+esc(legs.slice(0,3).join(" · "))+"</small>"+
          (legs.length>3?"<details class='swa-more'><summary><span class='swa-m'>Show "+(legs.length-3)+" more</span><span class='swa-l'>Show less</span></summary><small>"+esc(legs.slice(3).join(" · "))+"</small></details>":""):"")+"</span>"+
        (h.status==="check"?"<button type='button' class='swa-pillbtn' data-chk='"+esc(String(h.id))+"' data-code='"+esc(h.code)+"' aria-expanded='false'>Check</button>":"")+
        (h.share?"<button type='button' class='swa-pillbtn' data-share='"+esc(JSON.stringify(h.share))+"'>Share</button>":"")+"</div>"+
        (h.status==="check"?checkHtml(h):""); }).join("");
  }
  /* SETTLE A "CHECK" BY HAND (owner, 13 Oct 2026). Every leg we could grade won; the
     rest (corners, shots, first half) cannot be read off a final score. Tapping
     Check opens the legs; the owner looks the code up on the bookmaker and says
     which way it went (/api/account/settle). */
  function checkHtml(h){
    return "<div class='swa-set swa-chkbox' data-chkbox='"+esc(String(h.id))+"' hidden><span class='swa-st'>"+
      "<small data-full></small><small>Code "+esc(h.code)+" on "+markOf(h.book)+". Check the legs marked Check there, then say how it went.</small></span>"+
      "<button type='button' class='swa-pillbtn' data-settle='landed'>It landed</button>"+
      "<button type='button' class='swa-pillbtn' data-settle='lost'>It lost</button></div>";
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
        "<button class='swa-sw' id='swaMail' type='button' role=\"switch\" aria-checked=\""+(!!o.mail)+"\" aria-label='Picks by email'></button></div>"+
        "<div class='swa-set'><span class='swa-st'><b>Phone notifications</b><small>Messages from the Wizard, pick of the day at 9am, and when your slip lands</small></span>"+
        "<button class='swa-sw' id='swaPush' type='button' role=\"switch\" aria-checked=\"false\" aria-label='Phone notifications'></button></div></div>"+
      "<p class='swa-h'>Account</p><div class='swa-card'><button class='swa-set swa-link' id='swaDevs' type='button'><span class='swa-st'><b>Signed-in devices</b><small>"+devWords(o.devices)+"</small></span>"+CHEV+"</button></div>"+
      "<button class='swa-outbtn' id='swaOut' type='button'>Sign out</button>"+
      "<div class='swa-fine'><button class='swa-del' id='swaDel' type='button'>Delete account</button></div>"+
      "<div id='swaDelBox' hidden><p class='swa-note'>This deletes your account and everything synced to it. It cannot be undone. Type DELETE to confirm.</p>"+
        "<input class='swa-in' id='swaDelIn' autocomplete='off' autocapitalize='characters'><button class='swa-outbtn swa-danger' id='swaDelGo' type='button'>Delete for good</button></div>"+
      "<p class='swa-msg' id='swaMsg' role='status' aria-live='polite'></p>";
  }
  var api={firstNameOf:firstNameOf,menuHtml:menuHtml,plusHtml:plusHtml,naira:naira,codesHtml:codesHtml,esc:esc,I:I,AV_FREE:AV_FREE,AV_FF:AV_FF,AV_OWNER:AV_OWNER,AV_PERSONAL:AV_PERSONAL,pickerHtml:pickerHtml,grantsHtml:grantsHtml,hitsHtml:hitsHtml,adminHtml:adminHtml,recordHtml:recordHtml,profileHtml:profileHtml,settingsHtml:settingsHtml};
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
    ".swa-unr{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--red);color:#fff;font-size:10.5px;font-weight:800;line-height:18px;text-align:center;box-sizing:border-box}"+
    ".swa-mi svg{width:18px;height:18px;color:var(--soft);flex:none}.swa-r{margin-left:auto;color:var(--faint)}.swa-out{color:var(--soft)}"+
    ".swa-mi:focus-visible{outline:2px solid var(--accent);outline-offset:2px}"+
    ".swa-tab.swa-new::after{content:'';display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--red);margin-left:6px;vertical-align:middle}"+
    ".swa-view{position:fixed;inset:0;z-index:9982;background:var(--bg);color:var(--text);overflow-y:auto;padding:16px 16px 40px;transform:translateX(100%);visibility:hidden;transition:transform .28s cubic-bezier(.23,1,.32,1),visibility 0s .28s}"+
    ".swa-view.on{transform:none;visibility:visible;transition:transform .28s cubic-bezier(.23,1,.32,1),visibility 0s}.swa-in-wrap{max-width:520px;margin:0 auto}"+
    ".swa-back{display:flex;align-items:center;gap:4px;border:0;background:none;color:var(--soft);font:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:6px 4px 6px 0}.swa-back svg{width:18px;height:18px}"+
    /* Back stays at the top while a long page scrolls (owner, 14 Oct 2026: in
       the inbox it scrolled away). A bar the width of the page, the page's own
       colour behind it so nothing shows through. */
    ".swa-view .swa-in-wrap>.swa-back{position:sticky;top:-16px;z-index:5;width:calc(100% + 32px);margin:-16px -16px 0;padding:14px 16px 8px;background:var(--bg);box-sizing:border-box}"+
    ".swa-t{margin:0 0 16px;font-size:22px;font-weight:800;letter-spacing:-.01em}"+
    ".swa-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:4px -2px 4px;padding:2px}.swa-tabs::-webkit-scrollbar{display:none}"+
    ".swa-tab{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--soft);font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap}"+
    ".swa-tab[aria-selected='true']{background:var(--red-fill);border-color:transparent;color:#fff}.swa-tab:focus-visible{outline:2px solid var(--red);outline-offset:2px}"+
    ".swa-tab .swa-cnt{font-size:11px;font-weight:800;opacity:.85}.swa-tab .swa-cnt:empty{display:none}"+
    ".swa-aldot{display:inline-block;width:8px;height:8px;border-radius:99px;background:var(--red);margin-right:7px;vertical-align:1px}"+
    ".swa-alk{display:inline-block;margin-right:6px;padding:0 6px;border-radius:4px;background:var(--card-2);color:var(--soft);font-size:11px;font-weight:700}"+
    ".swa-alk-founder,.swa-alk-win{color:var(--accent)}.swa-alk-payment{color:var(--green-ink)}"+
    ".swa-panel[hidden],.swa-set[hidden]{display:none!important}.swa-panel>.swa-card+.swa-lbl{margin-top:18px}"+
    ".swa-leg{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--line)}.swa-leg>b{flex:0 0 46px;font-size:11px;text-transform:uppercase;letter-spacing:.04em}"+
    ".swa-leg span{flex:1;min-width:0;color:var(--soft)}.swa-leg span b{color:var(--text);font-size:13px}.swa-leg i{font-style:normal;color:var(--faint)}"+
    ".swa-won{color:var(--green-ink)}.swa-lost{color:var(--red-ink)}.swa-open{color:var(--amber)}"+
    ".swa-chkbox{flex-wrap:wrap;gap:8px}.swa-chkbox .swa-st{flex:1 1 100%}.swa-chkbox small{display:block;margin-top:6px}.swa-chkbox small b{display:block;color:var(--text);font-size:12.5px;margin-bottom:2px}.swa-set .swa-pillbtn+.swa-pillbtn{margin-left:6px}"+
    ".swa-h{font-size:13px;font-weight:700;color:var(--soft);margin:18px 2px 8px}.swa-h small{font-weight:600;color:var(--faint);margin-left:6px}"+
    ".swa-lbl{display:block;font-size:12px;font-weight:700;color:var(--faint);margin:0 0 5px}.swa-ta{height:auto;min-height:62px;padding:9px 12px;line-height:1.4;resize:vertical}.swa-more summary{cursor:pointer;font-size:12px;font-weight:800;color:var(--accent);list-style:none;margin-top:2px}.swa-more summary::-webkit-details-marker{display:none}.swa-more .swa-l,.swa-more[open] .swa-m{display:none}.swa-more[open] .swa-l{display:inline}.swa-bk{font-weight:800}"+
    ".swa-in{width:100%;height:42px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;font-size:15px;font-weight:700;padding:0 12px;box-sizing:border-box}"+
    ".swa-pick{display:grid;grid-template-columns:repeat(6,1fr);gap:8px}.swa-pick.swa-lock{grid-template-columns:repeat(5,1fr);gap:12px;padding:0 36px 0 0}"+
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
    ".swa-st{flex:1;min-width:0}.swa-st b{display:block;overflow-wrap:anywhere;font-size:13.5px;font-weight:700}.swa-st small{display:block;font-size:12px;font-weight:600;color:var(--faint);margin-top:1px}.swa-bkset{flex-wrap:wrap}.swa-bkset .swa-st{flex:1 1 100%}.swa-bkchips{display:flex;flex-wrap:wrap;gap:6px;width:100%}.swa-bkc{display:inline-flex;align-items:center;min-height:36px;padding:0 12px;border:1px solid var(--line);border-radius:var(--r-chip,6px);background:var(--card);cursor:pointer;font:inherit;font-size:14px;font-weight:800}.swa-bkc[aria-checked=true]{border-color:var(--accent);background:rgba(242,184,75,.12)}.swa-bkc:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.swa-in.swa-sel{flex:none;width:auto;min-width:118px;max-width:46%;height:38px;font-size:14px;padding:0 30px 0 10px;cursor:pointer;-webkit-appearance:none;appearance:none;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23A3A0A6' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 9px center;background-size:14px}"+
    ".swa-link{cursor:pointer}.swa-chev{width:16px;height:16px;color:var(--faint)}"+
    ".swa-seg{display:flex;background:var(--card-2);border-radius:8px;padding:3px;gap:2px}.swa-seg button{border:0;background:none;color:var(--soft);font:inherit;font-size:12px;font-weight:700;padding:6px 12px;border-radius:6px;cursor:pointer}.swa-seg button[aria-pressed=true]{background:var(--card);color:var(--text)}"+
    ".swa-books{display:flex;gap:6px;flex-wrap:wrap;padding:0 12px 12px}.swa-books button{border:1px solid var(--line);background:var(--card-2);border-radius:6px;padding:7px 11px;font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;color:var(--text)}.swa-books button[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}"+
    ".swa-sw{width:42px;height:26px;border-radius:99px;border:0;background:var(--raise);position:relative;cursor:pointer;flex:none}.swa-sw:after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .2s}.swa-sw[aria-checked=true]{background:var(--green)}.swa-sw[aria-checked=true]:after{transform:translateX(16px)}"+
    ".swa-outbtn{width:100%;height:44px;border-radius:6px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;margin:18px 0 12px}.swa-danger{color:var(--red-ink)}"+
    ".swa-go{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}.swa-go[disabled]{opacity:.6;cursor:default}"+
    ".swa-fine{text-align:center}.swa-del{border:0;background:none;font:inherit;font-size:12.5px;font-weight:700;color:var(--red-ink);text-decoration:underline;text-underline-offset:3px;cursor:pointer}"+
    ".swa-note,.swa-msg{font-size:13px;color:var(--soft);line-height:1.5}.swa-card+.swa-card{margin-top:0}.swa-card .swa-set+.swa-set{border-top:1px solid var(--line)}"+
    ".swa-pillbtn{border:1px solid var(--line);background:var(--card-2);color:var(--text);border-radius:6px;padding:6px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}"+
    ".swa-set:focus-visible,.swa-seg button:focus-visible,.swa-books button:focus-visible,.swa-sw:focus-visible,.swa-outbtn:focus-visible,.swa-del:focus-visible,.swa-pillbtn:focus-visible,.swa-in:focus-visible,.swa-back:focus-visible{outline:2px solid var(--accent);outline-offset:2px}"+
    /* THE WIZARD PASS PAGE (owner, 16 Oct 2026): simple, every detail in sight, one screen
       with no scrolling. Title gold in the display face with the wizard beside it; one
       paragraph; the founders as one favoured strip; three compact passes; pay. */
    ".swa-view.swa-wp{padding-bottom:16px}.swa-wp .swa-in-wrap{position:relative}"+
    ".swa-wp .swa-t{font-family:var(--disp);font-size:40px;line-height:1;font-weight:800;text-transform:uppercase;letter-spacing:.005em;color:var(--accent);margin:22px 84px 14px 0}"+
    ".swa-wpwiz{position:absolute;top:52px;right:-2px;width:70px;height:70px;pointer-events:none}"+
    ".swa-wpsub{margin:0;font-size:13.5px;line-height:1.45;font-weight:600;color:var(--soft)}.swa-wpsub b{color:var(--text)}"+
    ".swa-wpnow{margin:10px 0 0;font-size:13.5px;font-weight:600;color:var(--soft)}.swa-wpnow b{color:var(--accent)}"+
    ".swa-fwpanel{margin:16px 0 0;padding:12px 14px;border:1px solid var(--cls-founder-rim);border-radius:12px;background:var(--card)}"+
    ".swa-fwhead{display:flex;align-items:baseline;justify-content:space-between;gap:10px}"+
    ".swa-fwt{font-family:var(--disp);font-size:18px;font-weight:800;text-transform:uppercase;letter-spacing:.005em;color:var(--cls-founder)}"+
    ".swa-fwleft{font-size:12px;font-weight:700;color:var(--faint);white-space:nowrap}.swa-fwleft b{font-family:var(--disp);font-size:15px;color:var(--text);font-variant-numeric:tabular-nums}"+
    ".swa-fwd{margin:4px 0 10px;font-size:13px;line-height:1.45;color:var(--soft)}.swa-fwd b{color:var(--text)}"+
    ".swa-fwbar{height:5px;border-radius:99px;background:var(--raise);overflow:hidden}"+
    ".swa-fwbar i{display:block;height:100%;width:0;border-radius:99px;background:var(--cls-founder);transition:width 1.1s var(--ease-out,cubic-bezier(.23,1,.32,1)) .15s}.swa-fwbar i.on{width:var(--to)}"+
    ".swa-wp .swa-passes{margin-top:18px}"+
    ".swa-wprec{margin:6px 0 0;font-size:12.5px;line-height:1.45;color:var(--soft)}.swa-wprec a{color:var(--accent);font-weight:700}"+
    ".swa-wppay{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;height:52px;margin-top:16px;border:0;border-radius:var(--r-lg,8px);background:var(--accent);color:var(--on-accent);"+
      "font:inherit;font-size:16px;font-weight:800;cursor:pointer}.swa-wppay svg{width:18px;height:18px}.swa-wppay[disabled]{opacity:.6;cursor:default}"+
    ".swa-wppay:focus-visible{outline:2px solid var(--text);outline-offset:3px}"+
    ".swa-wpfine{margin:8px 0 0;text-align:center;font-size:12px;font-weight:600;color:var(--faint)}.swa-wp .swa-msg{margin:4px 0 0;text-align:center}"+
    /* short phones (iPhone SE, 360x640): tighter, so it still fits above the tab bar */
    "@media (max-height:660px){.swa-wp .swa-t{font-size:32px;margin:12px 66px 12px 0}.swa-wpwiz{width:56px;height:56px;top:44px}"+
      ".swa-wpsub{font-size:12.5px;line-height:1.4}.swa-wp .swa-pass{min-height:54px;padding-top:7px;padding-bottom:7px}.swa-wp .swa-price b{font-size:23px}"+
      ".swa-wp .swa-pass .swa-st b{font-size:17px}.swa-wp .swa-passes{gap:9px;margin-top:12px}.swa-wp .swa-pass.swa-hasbest{padding-top:15px}"+
      ".swa-fwpanel{margin-top:10px;padding:9px 12px}.swa-fwd{margin:2px 0 8px;font-size:12.5px}.swa-wppay{height:46px;margin-top:10px}.swa-wpfine{margin-top:6px}}"+
    "@media (prefers-reduced-motion:reduce){.swa-fwbar i{transition:none}}"+
    /* Passes: Saira numerals for the price, the month marked with a flat tag. */
    ".swa-fw{display:inline-block;margin-top:5px;padding:2px 8px;border-radius:var(--r-sm);border:1px solid var(--cls-founder);color:var(--cls-founder);font-size:11px;font-weight:800}"+
    ".swa-mplus{color:var(--accent)}.swa-mplus svg{color:var(--accent)}.swa-mplus .swa-r{font-size:11.5px;font-weight:700}"+
    ".swa-ffcard{border-color:var(--electric-rim)}.swa-ffseal b{color:var(--electric)!important}"+
    ".swa-c-free{color:var(--cls-free)!important}.swa-c-pass{color:var(--accent)!important}.swa-c-founder{color:var(--cls-founder)!important}.swa-c-ff{color:var(--electric)!important}.swa-c-admin{color:var(--cls-admin)!important}"+
    ".swa-wpcard{border-color:var(--accent-rim)}.swa-adcard{border-color:var(--cls-admin-rim)}.swa-fwseal b{color:var(--cls-founder)!important}"+
    ".swa-pass{--tier:var(--accent)}.swa-tier-day{--tier:var(--tier-day)}.swa-tier-week{--tier:var(--tier-week)}.swa-tier-fw{--tier:var(--cls-founder)}"+
    ".swa-fwcard{border-color:var(--cls-founder-rim)}.swa-fwseal,.swa-xseal{display:flex;align-items:center;gap:14px;padding:12px 14px;border-top:1px solid var(--line)}.swa-fwseal img,.swa-xseal img{flex:none;width:80px;height:92px}.swa-fwseal b,.swa-xseal b{display:block;font-family:var(--disp);font-size:20px;font-weight:800;text-transform:uppercase;letter-spacing:.005em;color:var(--accent);line-height:1.1}.swa-fwseal small,.swa-xseal small{display:block;margin-top:3px;font-size:12.5px;font-weight:600;color:var(--soft);line-height:1.45}.swa-tgbtn{flex:none;text-decoration:none;white-space:nowrap}.swa-pgo{margin-left:auto;border-color:var(--accent);color:var(--accent);white-space:nowrap}"+
    ".swa-passes{display:grid;gap:11px;margin:0}"+
    ".swa-pass{position:relative;display:flex;align-items:center;gap:14px;width:100%;min-height:66px;padding:11px 16px 11px 48px;border:1.5px solid var(--line);border-radius:12px;"+
      "background:var(--card);color:var(--text);font:inherit;text-align:left;cursor:pointer;transition:border-color .18s,background-color .18s}"+
    /* a drawn radio: an empty ring, gold and ticked when picked */
    ".swa-pass::before{content:'';position:absolute;left:16px;top:50%;width:18px;height:18px;margin-top:-10px;border-radius:50%;border:2px solid var(--grey);box-sizing:content-box;"+
      "background:no-repeat center/12px 12px}"+
    ".swa-pass[aria-pressed=true]{border-color:var(--tier);background:var(--card-2)}"+
    ".swa-pass[aria-pressed=true]::before{border-color:var(--tier);background-color:var(--tier);"+
      "background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2314120E' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E\")}"+
    ".swa-pass .swa-st b{font-family:var(--disp);font-size:19px;line-height:1.05;font-weight:800;text-transform:uppercase;letter-spacing:.005em}"+
    ".swa-pass .swa-st small{margin-top:2px}.swa-fwp{color:var(--cls-founder)!important;font-weight:700!important}"+
    ".swa-price{text-align:right;font-variant-numeric:tabular-nums;font-family:var(--disp)}"+
    ".swa-price b{display:block;font-size:28px;line-height:1;font-weight:800;color:var(--tier)}.swa-price s{display:block;font-size:14px;font-weight:700;color:var(--faint)}"+
    ".swa-best{position:absolute;top:-10px;left:46px;padding:2px 8px;border-radius:var(--r-sm,4px);background:var(--accent);color:var(--on-accent);font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.swa-pass.swa-hasbest{padding-top:16px}"+
    "@media (hover:hover){.swa-pass:hover{border-color:var(--accent-rim)}}"+
    ".swa-pass:focus-visible,.swa-pgo:focus-visible{outline:2px solid var(--accent);outline-offset:2px}"+
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
      else if(go==="daily") daily();
      else if(go==="tg") profileAt("[data-tglink]");
      else if(go==="settings") settings();
      else if(go==="msgs"&&root.swMsg) root.swMsg.inbox();
      else if(go==="admin") admin();
      else if(go==="plus") plus();
      else if(go==="out") signOut();
    });
  }
  /* BACK FROM PAYSTACK WITHOUT PAYING (owner, 16 Oct 2026: "when i close paystack without
     paying, the pay button is greyed out"). The phone restores the page as it was left,
     button disabled mid-tap; whenever the page is shown again it is live again. */
  if(root.addEventListener) root.addEventListener("pageshow",function(){
    var b=d.getElementById("swaPay"), m=d.getElementById("swaMsg");
    if(b&&b.disabled){ b.disabled=false; if(m) m.textContent=""; }
  });
  /* Any [data-plus] on the page opens Plus: the code-limit message, the plan card. */
  d.addEventListener("click",function(e){ var b=e.target.closest&&e.target.closest("[data-plus]"); if(b){ e.preventDefault(); plus(); } });
  /* [data-tglink]: a link tgFill filled in the last 10 minutes opens as itself, in a
     new tab. One not filled yet, or near its 15-minute end, is fetched afresh and
     opened in this tab: a pop-up after the wait is blocked, and on a phone the same
     tab hands straight over to the Telegram app. */
  d.addEventListener("click",function(e){ var b=e.target.closest&&e.target.closest("[data-tglink]"); if(!b||!root.swAcct) return;
    if(b.getAttribute("href")&&Date.now()-(+b.getAttribute("data-at")||0)<10*60e3) return;
    e.preventDefault(); if(b.getAttribute("aria-busy")) return;
    b.setAttribute("aria-busy","true"); var was=b.textContent; b.textContent="Opening…";
    root.swAcct.req("GET","/api/account/tglink",null,function(code,j){ b.removeAttribute("aria-busy"); b.textContent=was;
      if(code===200&&j&&j.url) root.location.href=j.url; else b.textContent="Try again"; }); });
  function acct(){ return root.swAcct||{st:{email:""}}; }
  /* Admin only once the server has said so in this page view (index.html saveRole, swAdminLive). */
  function role(){ var r=lsGet("sw.role")||"free"; return r==="admin"&&root.swAdminLive!==true?"free":r; }
  function savedName(){ try{ return root.localStorage.getItem("sw.name")||""; }catch(e){ return ""; } }
  function open(){
    ensure();
    var a=acct();
    menu.innerHTML=menuHtml({name:firstNameOf(savedName(),a.st.email),email:a.st.email,role:role(),plan:lsGet("sw.plan"),
      plusUntil:lsGet("sw.plusUntil"),founder:lsGet("sw.founder")==="1",
      quota:root.swQuotaToday?root.swQuotaToday():null,slips:root.swSlipCount?root.swSlipCount():0,unread:root.swMsg?root.swMsg.unread():0});
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
  function view(title,html,cls){
    ensure();
    if(!viewEl){ viewEl=d.createElement("div"); viewEl.className="swa-view"; viewEl.setAttribute("role","dialog"); viewEl.setAttribute("aria-modal","true"); d.body.appendChild(viewEl);
      d.addEventListener("keydown",function(e){ if(e.key==="Escape"&&viewEl.classList.contains("on")) closeView(); }); }
    viewEl.classList[cls==="swa-wp"?"add":"remove"]("swa-wp");   /* the Wizard Pass page dresses its own title */
    viewEl.setAttribute("aria-label",title);
    viewEl.innerHTML="<div class='swa-in-wrap'><button class='swa-back' type='button'>"+BACK+"Back</button><h2 class='swa-t'>"+esc(title)+"</h2>"+html+"</div>";
    viewEl.querySelector(".swa-back").onclick=closeView;
    if(!viewEl.classList.contains("on")){ try{ root.history.pushState({sw:1},""); pushed=true; }catch(e){} }
    viewEl.classList.add("on"); d.documentElement.classList.add("locked");
    viewEl.querySelector(".swa-back").focus({preventScroll:true});
    return viewEl;
  }
  /* THE OPEN PANEL SURVIVES A REFRESH (owner, 14 Oct 2026: "when i refresh on the
     admin page, it takes me back to the home page"). Kept for this tab only;
     restore() reopens it once /api/me has answered.
     EXCEPT ADMIN (owner, 16 Oct 2026: "sometimes I refresh and it stays open" - it
     reopened only when the server's admin answer came in time, so it was never the
     same twice). A refresh with Admin open always lands on the home page; Admin is
     one tap away in the bottom bar and the avatar menu. */
  function mark(k){ try{ if(k) root.sessionStorage.setItem("sw.acctview",k); else root.sessionStorage.removeItem("sw.acctview"); }catch(e){}
    if(root.swNavMark) root.swNavMark(k); }
  function restore(){
    var k=null; try{ k=root.sessionStorage.getItem("sw.acctview"); }catch(e){}
    if(k==="admin") mark(null);
    else if(k==="profile") profile();
    else if(k==="settings") settings();
    else if(k==="plus") plus();
    else if(k==="msgs"&&root.swMsg) root.swMsg.inbox();
    passLink();
    paidReturn();
  }
  /* /?pass=1, from the /wizard-pass page's button (lib/pages.js renderWizardPass):
     open the Wizard Pass, through sign-in when signed out. The flag leaves the
     address so a refresh does not open it again. */
  function passLink(){
    if(!/[?&]pass=1(&|$)/.test(root.location.search)) return;
    try{ root.history.replaceState(null,"",root.location.pathname+root.location.search.replace(/[?&]pass=1/,"").replace(/^&/,"?")+root.location.hash); }catch(e){}
    plus();
  }
  function closeView(popped){ if(!viewEl||!viewEl.classList.contains("on")) return; viewEl.classList.remove("on"); mark(null);
    if(pushed){ pushed=false; if(popped!==true){ ownBack=true; try{ root.history.back(); }catch(e){ ownBack=false; } } } d.documentElement.classList.remove("locked");
    var av=d.getElementById("hdAccount"); if(av) try{ av.focus(); }catch(e){} }
  function lsGet(k){ try{ return root.localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k,v){ try{ root.localStorage.setItem(k,v); }catch(e){} }
  function plus(){
    /* The Play Store app sells nothing (Play billing rules, index.html sw-twa). */
    if(d.documentElement.classList.contains("sw-twa")) return;
    var a=acct();
    if(!a.st.on){ if(root.swGate) root.swGate("plus",null,plus,""); return; }
    close(); mark("plus");
    var pick="month", offer={passes:[]};
    var me={role:role(),plusUntil:lsGet("sw.plusUntil")};
    function draw(){
      var v=view("Wizard Pass",plusHtml({passes:offer.passes,founder:offer.founder,switchAt:offer.switchAt,role:me.role,plusUntil:me.plusUntil},pick),"swa-wp");
      var pay=v.querySelector("#swaPay"), msg=v.querySelector("#swaMsg");
      /* A tap picks in place: no redraw, so the scroll stays and the bar does not replay. */
      v.querySelectorAll("[data-pass]").forEach(function(b){ b.onclick=function(){
        pick=b.getAttribute("data-pass");
        v.querySelectorAll("[data-pass]").forEach(function(x){ x.setAttribute("aria-pressed",x===b?"true":"false"); });
        var p=offer.passes.filter(function(x){ return x.pass===pick; })[0];
        if(pay&&p) pay.querySelector("span").textContent="Pay "+naira(p.naira)+" with Paystack";
      }; });
      /* The one motion: the places bar fills from empty (reduced motion: it is just there). */
      var bar=v.querySelector(".swa-fwbar i");
      if(bar) root.requestAnimationFrame(function(){ root.requestAnimationFrame(function(){ bar.classList.add("on"); }); });
      if(pay) pay.onclick=function(){
        pay.disabled=true; msg.textContent="Opening Paystack...";
        a.req("POST","/api/pay/start",{pass:pick},function(code,j){
          if(code===200&&j&&j.url){ root.location.href=j.url;
            setTimeout(function(){ pay.disabled=false; msg.textContent=""; },15000);   /* Paystack never opened: tap again */
            return; }
          pay.disabled=false;
          msg.textContent=code===0?"No connection. Check your data and try again.":
            code===401?"Sign in again to pay.":code===429?"Too many tries. Try again in a few minutes.":
            "Paystack didn't answer. Try again in a minute.";
        });
      };
    }
    draw();
    a.req("GET","/api/pay/offer",null,function(code,j){ if(code===200&&j&&j.passes){ offer=j; if(viewEl&&viewEl.classList.contains("on")) draw(); } });
  }
  /* BACK FROM PAYSTACK (?paid=<reference>). Settled by our server asking
     Paystack, never by this page: a few asks while the payment lands, then
     the account is re-read so the new plan shows everywhere. */
  function paidReturn(){
    var m=/[?&]paid=(sw_[0-9a-f]{20})/.exec(root.location.search); if(!m) return;
    try{ root.history.replaceState(null,"",root.location.pathname+root.location.search.replace(/[?&]paid=[^&]*/,"").replace(/^&/,"?")+root.location.hash); }catch(e){}
    var a=acct(), tries=0;
    (function ask(){
      a.req("GET","/api/pay/verify?ref="+m[1],null,function(code,j){
        if(code===200&&j&&j.paid){
          a.req("GET","/api/me",null,function(c2,me){
            if(c2===200&&me&&me.signedIn&&a.saveRole) a.saveRole(me);
            var n=me&&typeof me.codeLimit==="number"?me.codeLimit:20;
            a.notice("Your Wizard Pass is on"+(j.until?" until "+dayMonth(j.until):"")+". "+(n>=100?"Unlimited codes.":n+" codes a day."));
          });
          return;
        }
        if(++tries<6) return setTimeout(ask,2500);
        a.notice("Payment not confirmed yet. If you paid, your Wizard Pass switches on within a few minutes.");
      });
    })();
  }
  function profile(){
    close(); mark("profile");
    var a=acct();
    var v=view("Profile",profileHtml({name:firstNameOf(lsGet("sw.name"),a.st.email),
      avatar:root.swAvatarKey?root.swAvatarKey():"fire",role:role(),personal:lsGet("sw.personal"),plan:lsGet("sw.plan"),plusUntil:lsGet("sw.plusUntil"),
      founder:lsGet("sw.founder")==="1",founderNo:lsGet("sw.founderNo"),
      record:root.swRecord?root.swRecord():{built:0,won:0,settled:0},
      quota:root.swQuotaToday?root.swQuotaToday():null}));
    tgFill(v,role());
    dailyFill(v,role());
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
  /* Phone notifications (13 Oct 2026): the same /api/push subscription the codes
     page makes. Signed in, so the POST links it to this account for "your slip
     landed"; an existing subscription is re-sent on open to link it too.
     One subscription, two switches: Settings and the Slip of the day card
     (owner, 15 Oct 2026: the card's button only showed the browser's
     permission, so it read "on" for good and never subscribed anyone). */
  var PUSH={reg:null,key:null,ready:null};
  function pushOk(){ var n=root.navigator; return !!(n&&n.serviceWorker&&("PushManager" in root)&&("Notification" in root)); }
  function u8(s){ var p=s.replace(/-/g,"+").replace(/_/g,"/"), r=atob(p+"=".repeat((4-p.length%4)%4)), o=new Uint8Array(r.length);
    for(var i=0;i<r.length;i++) o[i]=r.charCodeAt(i); return o; }
  function pushPost(s){ var j=s.toJSON(); return fetch("/api/push",{method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({endpoint:j.endpoint,keys:j.keys})}).then(function(r){ return r.ok; }); }
  function pushInit(){
    if(PUSH.ready) return PUSH.ready;
    var n=root.navigator;
    PUSH.ready=Promise.all([
      fetch("/api/penalty?a=pushkey").then(function(r){ return r.json(); }).then(function(j){ PUSH.key=j&&j.key; }).catch(function(){}),
      n.serviceWorker.getRegistration().then(function(r){ return r||n.serviceWorker.register("/sw.js"); }).then(function(r){ PUSH.reg=r; }).catch(function(){})
    ]);
    return PUSH.ready;
  }
  function pushSub(){ return pushInit().then(function(){ return PUSH.reg?PUSH.reg.pushManager.getSubscription():null; }); }
  /* cb(on): this phone holds a subscription. It is re-sent, which links it to the account. */
  function pushState(cb){
    if(!pushOk()||Notification.permission==="denied") return cb(false);
    pushSub().then(function(s){ if(s) pushPost(s).catch(function(){}); cb(!!s); }).catch(function(){ cb(false); });
  }
  /* cb(ok, line). Permission first: it needs the tap's user activation, which an await spends. */
  function pushOn(cb){
    Notification.requestPermission().then(function(p){
      if(p!=="granted") return cb(false,"Notifications are blocked for this site.");
      return pushInit().then(function(){
        if(!PUSH.reg||!PUSH.key) return cb(false,"Not ready yet. Try again in a moment.");
        return PUSH.reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:u8(PUSH.key)}).then(pushPost).then(function(ok){
          cb(ok,ok?"Notifications on \uD83D\uDD25":"Something went wrong. Try again."); });
      });
    }).catch(function(){ cb(false,"Something went wrong. Try again."); });
  }
  function pushOff(cb){
    pushSub().then(function(s){
      if(!s) return;
      var ep=s.endpoint;
      return s.unsubscribe().then(function(){ return fetch("/api/push",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({endpoint:ep})}); });
    }).then(function(){ cb(true); }).catch(function(){ cb(false); });
  }
  function pushSwitch(b,say){
    function on(x){ b.setAttribute("aria-checked",x?"true":"false"); }
    var sm=b.parentNode.querySelector("small");
    if(!pushOk()){ b.disabled=true; sm.textContent="Add Soccerwizard to your Home Screen to turn this on"; return; }
    if(Notification.permission==="denied"){ b.disabled=true; sm.textContent="Blocked in your browser settings"; return; }
    pushState(on);
    b.onclick=function(){
      if(b.getAttribute("aria-checked")!=="true") return pushOn(function(ok,m){ on(ok); say(m); });
      pushOff(function(ok){ if(ok){ on(false); say(""); } else say("Something went wrong. Try again."); });
    };
  }
  function settings(){
    close(); mark("settings");
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
    pushSwitch(v.querySelector("#swaPush"),say);
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
    /* Only the admin role opens it, whatever button asked (14 Oct 2026). The
       server is the real gate: it answers 403 to every admin call from anyone else. */
    if(role()!=="admin") return;
    mark("admin");
    /* Opening Admin is reading it: the nav badge clears (index.html adminBadge). */
    try{ localStorage.setItem("sw.adminSeen",String(Date.now())); }catch(e){}
    if(root.paintAdminBadge) root.paintAdminBadge(0);
    var a=acct();
    var v=view("Admin",adminHtml(null)), inp=v.querySelector("#swaGEmail"), btn=v.querySelector("#swaGrant");
    wireTabs(v);
    function say(t){ v.querySelector("#swaMsg").textContent=t||""; }
    function fail(code,j){
      if(code===401) return a.signedOutHere(j&&j.reason);
      say(code===0?"No connection. Check your data and try again.":code===403?"Only admins can do that.":
        j&&j.error==="bad_email"?"That email does not look right.":"Something went wrong. Try again.");
    }
    function load(){
      a.req("GET","/api/account/grants",null,function(code,j){
        if(code!==200) return fail(code,j);
        var box=v.querySelector("#swaGrants"); box.innerHTML=grantsHtml(j.grants||[]); setCount(v,"swaTGrants",String((j.grants||[]).length));
        box.querySelectorAll("[data-revoke]").forEach(function(b){ b.onclick=function(){ b.disabled=true;
          a.req("POST","/api/account/revoke",{email:b.getAttribute("data-revoke")},function(c2,j2){
            if(c2===200){ say("Removed."); load(); } else { b.disabled=false; fail(c2,j2); } }); }; });
      });
    }
    function hitsLoad(){ a.req("GET","/api/account/hits",null,function(code,j){
      var box=v.querySelector("#swaHits"); if(!box) return;
      if(code===200){ var hs=j.hits||[], nc=hs.filter(function(h){ return h.status==="check"; }).length;
        /* No numbers (owner, 14 Oct 2026): a dot while there is a win you have
           not seen, gone once Won slips is open, back with the next win. */
        setCount(v,"swaTHits","");
        var tb=v.querySelector("[data-tab='swaTHits']"), fresh=root.swAdminHitsNew?root.swAdminHitsNew():0;
        if(tb){ tb.classList.toggle("swa-new",fresh>0||nc>0);
          if(!tb._seen){ tb._seen=1; tb.addEventListener("click",function(){ tb.classList.remove("swa-new"); if(root.swAdminHitsSeen) root.swAdminHitsSeen(); }); } } }
      box.innerHTML=code===200?hitsHtml(j.hits||[]):
        "<div class='swa-set'><span class='swa-st'><small>"+(code===503?"The slip ledger is not set up yet.":"Could not load the hits.")+"</small></span></div>";
      /* SHARE A WIN: the phone's own share sheet with the banner and caption; on a desktop, the banner
         opens in a tab and the caption is copied. Nothing names the code or the user. */
      box.querySelectorAll("[data-share]").forEach(function(b){ b.onclick=function(){
        var s; try{ s=JSON.parse(b.getAttribute("data-share")); }catch(e){ return; }
        var text=s.x||s.tg||"";
        /* THE COPY CAN BE REFUSED. By the time a failed share falls back here the tap
           is spent, and the browser answers writeText with NotAllowedError (Sentry,
           13 Oct 2026). A rejected promise escapes try/catch, so it is caught on the
           promise, and the caption is shown to copy by hand instead. */
        function fallback(){ try{ root.open(s.img,"_blank","noopener"); }catch(e){}
          function show(){ say("Banner opened in a new tab. Copy this caption: "+text); }
          try{ var w=navigator.clipboard&&navigator.clipboard.writeText(text);
            if(w&&w.then) w.then(function(){ say("Caption copied. Banner opened in a new tab."); },show); else show();
          }catch(e){ show(); } }
        if(!navigator.share) return fallback();
        fetch(s.img).then(function(r){ return r.blob(); }).then(function(bl){
          var f=new File([bl],"soccerwizard-win.png",{type:bl.type||"image/png"});
          var data=(navigator.canShare&&navigator.canShare({files:[f]}))?{files:[f],text:text}:{text:text,url:s.img};
          return navigator.share(data);
        }).catch(function(e){ if(!e||e.name!=="AbortError") fallback(); });
      }; });
      box.querySelectorAll("[data-chk]").forEach(function(b){ b.onclick=function(){
        var id=b.getAttribute("data-chk"), code=b.getAttribute("data-code")||"The slip", panel=box.querySelector("[data-chkbox='"+id+"']"); if(!panel) return;
        panel.hidden=!panel.hidden; b.setAttribute("aria-expanded",String(!panel.hidden));
        /* EVERY LEG, IN WORDS (api/account.js slipdetail, lib/slipdetail.js): the pick,
           the odds, the final score, and won / lost / what to check by hand. */
        var full=panel.querySelector("[data-full]");
        if(!panel.hidden&&full&&!full.getAttribute("data-done")){
          full.setAttribute("data-done","1"); full.textContent="Reading every leg...";
          a.req("GET","/api/account/slipdetail?id="+encodeURIComponent(id),null,function(c3,d){
            if(c3!==200||!d||!d.legs){ full.removeAttribute("data-done"); full.textContent="Could not read the slip. Tap Check again to retry."; return; }
            var won=0,lost=0,open=0;
            var rows=d.legs.map(function(l){
              if(l.verdict==="won"||l.verdict==="void") won++; else if(l.verdict==="lost") lost++; else open++;
              var mark=l.verdict==="won"?"<b class='swa-won'>Won</b>":l.verdict==="void"?"<b class='swa-won'>Void</b>":l.verdict==="lost"?"<b class='swa-lost'>Lost</b>":"<b class='swa-open'>Check</b>";
              return "<div class='swa-leg'>"+mark+"<span><b>"+esc(l.pick)+"</b>"+(l.odds?" @ "+esc(String(l.odds)):"")+
                "<br>"+esc(l.match)+(l.score?" · "+esc(l.score):"")+(l.why?"<br><i>"+esc(l.why)+"</i>":"")+"</span></div>"; }).join("");
            full.innerHTML="<b>"+d.legs.length+" legs: "+won+" won"+(lost?", "+lost+" lost":"")+(open?", "+open+" to check":"")+"</b>"+rows+
              (d.readBack?"":"<i>The bookmaker no longer shows this code, so these are only the legs we graded"+(d.untracked?" ("+d.untracked+" more not shown)":"")+".</i>");
          });
        }
        panel.querySelectorAll("[data-settle]").forEach(function(s){ s.onclick=function(){
          var to=s.getAttribute("data-settle");
          panel.querySelectorAll("button").forEach(function(x){ x.disabled=true; });
          a.req("POST","/api/account/settle",{id:id,status:to},function(c2,j2){
            if(c2===200){ say(to==="landed"?code+" marked as landed. It now counts as a win, and you can share it.":code+" marked as lost. It stays off the win list."); hitsLoad(); }
            else { panel.querySelectorAll("button").forEach(function(x){ x.disabled=false; });
              if(c2===409) say("Already settled. Refreshing."), hitsLoad(); else fail(c2,j2); } }); }; });
      }; });
    }); }
    hitsLoad();
    /* Alerts: the count on the tab is what came in since this device last opened it;
       opening the tab shows the dots once, then counts them as seen. */
    var alerts=[];
    function alertsSeen(){ try{ return +localStorage.getItem("sw.alertsSeen")||0; }catch(e){ return 0; } }
    function alertsPaint(){ var seen=alertsSeen(), n=alerts.filter(function(x){ return Date.parse(x.at)>seen; }).length;
      v.querySelector("#swaAlerts").innerHTML=alertsHtml(alerts,seen); setCount(v,"swaTAlerts",n?String(n):""); }
    function alertsRead(){ if(!alerts.length) return; alertsPaint();
      try{ localStorage.setItem("sw.alertsSeen",String(Date.parse(alerts[0].at)||Date.now())); }catch(e){} setCount(v,"swaTAlerts",""); }
    function alertsLoad(){ a.req("GET","/api/account/alerts",null,function(code,j){
      if(code!==200){ v.querySelector("#swaAlerts").innerHTML=msg("Could not load alerts."); return; }
      alerts=j.alerts||[]; alertsPaint();
      var tb=v.querySelector("[data-tab='swaTAlerts']"); if(tb&&tb.getAttribute("aria-selected")==="true") alertsRead(); }); }
    alertsLoad();
    v.querySelector("[data-tab='swaTAlerts']").addEventListener("click",alertsRead);
    function logLoad(){ a.req("GET","/api/account/audit",null,function(code,j){
      v.querySelector("#swaLog").innerHTML=code===200?logHtml(j.log||[]):
        msg(code===503?"The log is not set up yet. Run sql/admin.sql in Supabase.":"Could not load the log."); }); }
    logLoad();
    v.querySelector("[data-tab='swaTLog']").addEventListener("click",logLoad);
    var flags={booksOff:[],notice:""};
    var board=null; try{ board=root.swBoard?root.swBoard():null; }catch(e){}
    function paintSw(){
      v.querySelector("#swaMaint").setAttribute("aria-checked",flags.maint?"true":"false");
      v.querySelector("#swaOldNotice").hidden=!flags.notice; v.querySelector("#swaNoticeT").textContent=flags.notice||"";
      var box=v.querySelector("#swaSw"); box.innerHTML=switchesHtml(flags);
      box.querySelectorAll("[data-book-sw]").forEach(function(b){ b.onclick=function(){
        var k=b.getAttribute("data-book-sw"), off=flags.booksOff.slice(), i=off.indexOf(k);
        if(i<0) off.push(k); else off.splice(i,1);
        b.disabled=true;
        saveFlags({booksOff:off,notice:flags.notice},(i<0?BOOK_NAME[k]+" booking paused.":BOOK_NAME[k]+" booking back on.")); }; });
    }
    function saveFlags(next,done){
      a.req("POST","/api/account/setflags",Object.assign({},flags,next),function(code,j){
        if(code!==200){ paintSw(); return fail(code,j); }
        flags=j; paintSw();
        say(done+" Users see it within a couple of minutes."); });
    }
    a.req("GET","/api/account/flags",null,function(code,j){
      if(code!==200){ v.querySelector("#swaSw").innerHTML=msg("Could not load the switches."); return; }
      flags=j; paintSw(); v.querySelector("#swaMaintMsg").value=flags.maintMsg||"";
    });
    v.querySelector("#swaMaint").onclick=function(){
      var on=!flags.maint;
      if(on&&!root.confirm("Turn maintenance mode on? Every user sees the maintenance page and booking stops until you turn it off.")) return;
      saveFlags({maint:on,maintMsg:v.querySelector("#swaMaintMsg").value.replace(/^\s+|\s+$/g,"")},
        on?"Maintenance mode is on.":"Maintenance mode is off. The site is back."); };
    v.querySelector("#swaNoticeOff").onclick=function(){ saveFlags({booksOff:flags.booksOff,notice:""},"Notice cleared."); };
    a.req("GET","/api/account/stats",null,function(code,j){
      var bad=msg(code===503?"Numbers are not set up yet. Run sql/admin.sql in Supabase.":"Could not load the numbers.");
      v.querySelector("#swaStatus").innerHTML=code===200?statusHtml(j,board):bad;
      v.querySelector("#swaNums").innerHTML=code===200?numbersHtml(j,board):bad;
    });
    var lkIn=v.querySelector("#swaLkEmail"), lkGo=v.querySelector("#swaLkGo"), lkBox=v.querySelector("#swaLk");
    function lookup(){
      var e=lkIn.value.replace(/^\s+|\s+$/g,""); if(!e) return say("Add an email first.");
      lkGo.disabled=true;
      a.req("GET","/api/account/lookup?email="+encodeURIComponent(e),null,function(code,j){ lkGo.disabled=false;
        if(code!==200) return fail(code,j);
        lkBox.hidden=false; lkBox.innerHTML=lookupHtml(j);
        var out=lkBox.querySelector("[data-lk-out]");
        if(out) out.onclick=function(){ out.disabled=true;
          a.req("POST","/api/account/signout",{email:j.email},function(c2,j2){
            if(c2===200){ say("Signed out on every device."); lookup(); } else { out.disabled=false; fail(c2,j2); } }); };
        var ff=lkBox.querySelector("[data-lk-ff]");
        if(ff) ff.onclick=function(){ ff.disabled=true;
          a.req("POST","/api/account/"+ff.getAttribute("data-lk-ff"),{email:j.email},function(c2,j2){
            if(c2===200){ say("Done."); lookup(); load(); } else { ff.disabled=false; fail(c2,j2); } }); };
      });
    }
    lkGo.onclick=lookup;
    lkIn.onkeydown=function(e){ if(e.key==="Enter") lookup(); };
    btn.onclick=function(){
      var e=inp.value.replace(/^\s+|\s+$/g,""); if(!e) return say("Add an email first.");
      btn.disabled=true;
      a.req("POST","/api/account/grant",{email:e},function(code,j){ btn.disabled=false;
        if(code===200){ inp.value=""; say("Done. They now have Family & friends."); load(); } else fail(code,j); });
    };
    load();
    /* The message board's two tabs. Drawn last: Readers replaces the old email lookup. */
    if(root.swMsg) root.swMsg.admin(v,a,say,setCount,function(id){ var b=v.querySelector("[data-tab='"+id+"']"); if(b) b.click(); });
    else v.querySelector("#swaTMsg").innerHTML=msg("Messages did not load. Refresh the page.");
  }
  function eatPop(){
    if(ownBack){ ownBack=false; return true; }
    if(viewEl&&viewEl.classList.contains("on")){ closeView(true); return true; }
    return false;
  }
  root.swPlus={open:plus};
  root.swAccountUI={eatPop:eatPop,open:open,close:close,toggle:toggle,profile:profile,daily:daily,isPass:function(){ return isPass(role()); },settings:settings,admin:admin,plus:plus,closeView:closeView,view:view,mark:mark,restore:restore,push:{ok:pushOk,state:pushState,on:pushOn,off:pushOff}};
})(typeof window!=="undefined"?window:this);
