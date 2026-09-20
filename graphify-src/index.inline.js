











































































































(function(){var t=null;try{t=localStorage.getItem("sw.theme");}catch(e){}
/* Dark is the default whatever the device says. The light theme is built and
   fitted and one tap away, but this page is read in dark by design, and
   `prefers-color-scheme` would hand most phones a first impression the brand
   never chose. A stored choice still wins. */
document.documentElement.setAttribute("data-theme",t||"dark");})();
/* THE INTRO GATE, DECIDED BEFORE FIRST PAINT.
 *
 * Same shape as the theme bootstrap above and for the same reason: the gate is
 * `display:none` by default and only a class on <html> turns it on, so a reader
 * who has already seen it today never gets a frame of it. Deciding this in the
 * deferred bundle would flash the splash on every repeat visit.
 *
 * Four reasons not to show it, and the search one is not cosmetic. Google
 * treats a full-screen interstitial on arrival as a ranking negative on mobile,
 * and Googlebot has no localStorage so it would meet the gate on every crawl of
 * the home page. Skipping it for search arrivals protects the ranking AND gives
 * the visitor the thing they searched for immediately, which is the right call
 * on its own.
 *
 * Deep paths need no rule here: /m/..., /matches, /how-it-works, /privacy and
 * /terms are separate generated files that never include this script. The
 * pathname check is belt and braces for the rewrites. */
(function(){
  var D=document.documentElement;
  try{
    if(location.pathname!=="/"&&location.pathname!=="/index.html") return;
    /* ONCE A SESSION. Two complaints, one on each side of this, and the answer
       is between them.
       It began as once a CALENDAR DAY, which meant a returning reader never saw
       the wizard again - the whole thing existed for first-timers only. Opened
       to every visit, and then: "anytime i reload any page it takes me back to
       the entry page", which is the same rule read from the other end. A reload
       is not a visit.
       sessionStorage is exactly the line between them. It survives a reload and
       a wander through the match pages, and it dies when the tab does - so
       coming back tomorrow, or in a new tab, shows the wizard again, and
       pressing refresh never does.
       localStorage still records that they have EVER seen it, which is a
       different question and drives the visible Skip below. */
    var seen=false;
    try{ seen=!!localStorage.getItem("sw.intro.day"); }catch(e){}
    try{ if(sessionStorage.getItem("sw.intro.session")==="1") return; }catch(e){}
    var r=document.referrer||"";
    if(r&&/^https?:\/\/([^\/]*\.)?(google|bing|duckduckgo|yahoo|yandex|baidu|ecosia|brave|search\.marcia)\./i.test(r)) return;
    /* Reduced motion still gets the gate - it is an age check as well as a
       splash - but it gets the poster and never the video. */
    if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches){
      D.className+=" sw-gate-still";
    }
    if(seen||localStorage.getItem("sw.age18")==="1") D.className+=" sw-gate-known";
    D.className+=" sw-gate-on";
    try{
      var portrait=window.matchMedia&&window.matchMedia("(max-aspect-ratio: 3/4)").matches;
      var pl=document.createElement("link");
      pl.rel="preload"; pl.as="image"; pl.fetchPriority="high";
      pl.href=portrait?"/intro-wizard-poster-p.jpg":"/intro-wizard-poster.jpg";
      document.head.appendChild(pl);
    }catch(e){}
  }catch(e){ /* no storage, no gate - never trap a reader behind a thrown error */ }
})();
/* Catch the install offer here, in the head, rather than in the main bundle.
   Chrome fires beforeinstallprompt early in the load, and the bundle is a
   deferred external file by the time it reaches a browser - it does not run
   until parsing is done. The event does not queue and does not fire twice, so
   a listener attached later can miss it outright, which is exactly what it
   looks like when the install button never appears no matter how installable
   the site is. Hold the event on window and let the bundle collect it. */
/* Anything that throws before the page has finished wiring itself, kept where
   it can be read back. A script that dies half way still leaves a working
   board behind it - the render has already happened by then - so the failure
   is invisible except as features that quietly do not exist. */
(function(){
  window.__swErr=[];
  window.addEventListener("error",function(ev){
    try{window.__swErr.push({m:String(ev.message),l:ev.lineno,c:ev.colno});}catch(_){}
  },true);
  window.addEventListener("unhandledrejection",function(ev){
    try{window.__swErr.push({m:"unhandled: "+String((ev.reason&&ev.reason.message)||ev.reason)});}catch(_){}
  });
})();
/* Hold the sphere still until its mark has arrived, so the first thing anyone
   sees is the S facing them rather than the blank back of the ball turning
   into view. Decode rather than load, so the class lands when it can actually
   be painted. Fails open: if the image never arrives the class is set anyway
   after a moment, and a still ball beats a permanently frozen one. */
(function(){
  var go=function(){ document.documentElement.classList.add("orb-ready"); };
  try{
    var im=new Image();
    im.onload=function(){ (im.decode?im.decode():Promise.resolve()).then(go,go); };
    im.onerror=go;
    im.src="/wiz-orb-mark.png";
    if(im.complete) go();
  }catch(e){ go(); }
  setTimeout(go,4000);
})();
(function(){
  window.__swInstallEvent=null;
  window.addEventListener("beforeinstallprompt",function(e){
    e.preventDefault();
    window.__swInstallEvent=e;
    try{window.dispatchEvent(new Event("sw-installable"));}catch(_){}
  });
})();


/* Error tracking (opt-in). Paste your Sentry *browser* DSN below to enable;
   left empty this whole block is a no-op and loads nothing. The DSN is a public
   client key - safe to ship. Also honours ?nosentry to disable ad hoc. */
(function(){
  var SW_SENTRY_DSN = "https://ac93e87be549b605d84d8064217ccd7a@o4511967072026624.ingest.de.sentry.io/4511972150673488";  // <-- paste browser DSN here to turn on
  if(!SW_SENTRY_DSN) return;
  try{ if(/[?&]nosentry\b/.test(location.search)) return; }catch(e){}
  var s=document.createElement("script");
  s.src="https://browser.sentry-cdn.com/8.55.0/bundle.min.js";
  s.crossOrigin="anonymous";
  s.integrity="sha384-BlRl+vkcjdIA/AKRb8zWtiqlVVXepUsSv0+vho7ZMUTsNudEyQjGUKo9W86Hc1EC";
  s.onload=function(){
    try{
      window.Sentry.init({
        dsn:SW_SENTRY_DSN,
        /* Only report our own app errors, not noise from extensions/other origins. */
        allowUrls:[location.origin],
        /* WHY allowUrls IS NOT ENOUGH.
           It filters on the URL in the stack frame, and a script INJECTED into
           the page reports the document's own URL - which is location.origin,
           so it sails straight through. On 2 Sep an iOS webview threw
           "Can't find variable: CONFIG" from updateGapFiller(). Neither CONFIG
           nor updateGapFiller appears anywhere in our 400KB bundle, this HTML,
           or the analytics script; only two scripts load and both are ours.
           The campaign sends X traffic, which opens in an in-app browser -
           exactly the thing that injects these - so expect more of it.
           Matched on the message instead. Deliberately the exact identifier
           and both engines' phrasings rather than anything like /ReferenceError/:
           a broad rule here would swallow OUR undefined variables, which is
           the single most useful error this reporter catches. If a new one
           shows up, add its name; do not widen the pattern. */
        ignoreErrors:[
          /Can't find variable: CONFIG\b/,      // WebKit / iOS Safari
          /\bCONFIG is not defined\b/,          // V8 / Chrome, same thing
          /* Two more of the same, 3 Sep. `currentInset` threw from init() for
             three readers and `window.webkit.messageHandlers` from
             sendScrollEvent() for one. Neither identifier appears anywhere in
             our bundle, this HTML or the analytics script, and
             webkit.messageHandlers IS the iOS webview bridge - it exists only
             inside an in-app browser. Same source as CONFIG: X traffic opening
             in one. Named exactly, per the rule above. */
          /Can't find variable: currentInset\b/,
          /\bcurrentInset is not defined\b/,
          /window\.webkit\.messageHandlers/
        ],
        tracesSampleRate:0,          // errors only, no perf overhead
        replaysSessionSampleRate:0,
        replaysOnErrorSampleRate:0
      });
    }catch(e){}
  };
  s.onerror=function(){/* CDN blocked or offline - fail silent, never break the app */};
  document.head.appendChild(s);
})();




























































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































/* THE INTRO GATE, WIRED HERE RATHER THAN IN THE BUNDLE.
 *
 * Inline and next to its own markup on purpose. The bundle is a deferred
 * external file, so it does not run until parsing finishes, and on a slow phone
 * that is a second or more in which Enter would be a dead button. prebuild only
 * extracts the BIGGEST inline script, so this one stays where it is - the same
 * arrangement the theme bootstrap in the head relies on.
 *
 * Two rules run through all of it.
 *
 * NOTHING WAITS ON THE VIDEO. The poster paints immediately, the copy fades in
 * on a CSS timer, and playback is a bonus. iOS Low Power Mode refuses autoplay
 * outright and some Android data savers do too; in every one of those cases the
 * reader still gets a still wizard and a working button.
 *
 * NOTHING CAN TRAP THE READER. Escape dismisses, every path restores scroll,
 * and a hard timeout dismisses the gate if anything hangs.
 */
(function(){
  var G=document.getElementById("swGate");
  if(!G) return;
  var D=document.documentElement;
  if(D.className.indexOf("sw-gate-on")<0){ G.parentNode.removeChild(G); return; }
  G.removeAttribute("hidden");

  var loop=G.querySelector(".sw-g-loop"),
      reveal=G.querySelector(".sw-g-reveal"),
      enter=document.getElementById("swGateEnter"),
      skip=document.getElementById("swGateSkip"),
      under=document.getElementById("swGateUnder"),
      back=document.getElementById("swGateBack");
  var done=false;
  /* How gently the hood drifts. The loop files are plain 24fps, so this only
     holds each real frame longer - it never softens one. Safe to change on
     its own; see play() for why it is not paired with a frame rate any more. */
  var LOOP_RATE=0.7;

  function today(){
    var d=new Date();
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+
           "-"+String(d.getDate()).padStart(2,"0");
  }
  function remember(){
    /* Two records, two questions. The session one stops a reload re-showing the
       gate; the localStorage one remembers they have ever seen it, which is
       what gives a returning reader the visible Skip. */
    try{ sessionStorage.setItem("sw.intro.session","1"); }catch(e){}
    try{ localStorage.setItem("sw.intro.day", today()); }catch(e){}
  }
  /* Kept far longer than the splash: the splash is a once-a-day flourish,
     being 18 is not a daily question. */
  function affirm(){ try{ localStorage.setItem("sw.age18","1"); }catch(e){} }

  /* SLOW OR METERED CONNECTIONS GET THE POSTER AND NOTHING ELSE.
     Most of this audience is on mobile data. 471 KB of loop is a fair trade for
     a brand moment on wifi and a bad one on 2G, where it would also arrive long
     after the reader had decided to leave. */
  function wantsVideo(){
    if(D.className.indexOf("sw-gate-still")>=0) return false;
    try{
      var c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
      if(c){
        if(c.saveData) return false;
        if(/^(slow-2g|2g)$/.test(c.effectiveType||"")) return false;
      }
    }catch(e){}
    return true;
  }

  function dismiss(landing){
    if(done) return; done=true;
    remember();
    G.className += landing ? " is-landing" : " is-out";
    var gone=false;
    function finish(){
      if(gone) return; gone=true;
      D.className=D.className.replace(/\bsw-gate-on\b/g,"").replace(/\s+/g," ").trim();
      try{ loop.pause(); reveal.pause();
           loop.removeAttribute("src"); reveal.removeAttribute("src"); }catch(e){}
      if(G.parentNode) G.parentNode.removeChild(G);
      /* Focus lands somewhere sane rather than nowhere, or the next Tab starts
         from the top of the document with no visible cue. */
      try{
        var t=document.querySelector("main")||document.getElementById("list")||document.body;
        t.setAttribute("tabindex","-1"); t.focus({preventScroll:true});
      }catch(e){}
    }
    setTimeout(finish, landing?480:320);   /* the media transition is 440ms; removing at 430 clipped it */
  }

  /* SHARPNESS IS A DESKTOP PROBLEM, so only desktop pays for it.
     The source is 864x496. On a 390px phone that is already 2.2x oversampled
     and looks clean; on a 1568px desktop it is a 1.8x UPSCALE, which is where
     the softness comes from. So there are two sets, and the wide one costs
     roughly two and a half times the bytes:

       lean  864x496   loop 301 KB  reveal 371 KB
       sharp 1296x744  loop 742 KB  reveal 758 KB

     Chosen on the viewport, and only when the connection has not already told
     us to be careful - wantsVideo has refused save-data and 2G before we get
     here. A large phone in landscape is still a phone, so this asks about
     coarse pointers as well as width. */
  function sharpSet(){
    try{
      if(window.innerWidth < 900) return false;
      if(window.matchMedia && window.matchMedia("(pointer:coarse)").matches) return false;
      var c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
      if(c && /^(slow-2g|2g|3g)$/.test(c.effectiveType||"")) return false;
    }catch(e){ return false; }
    return true;
  }
  /* AV1 WHERE IT PLAYS, H.264 EVERYWHERE ELSE.
     Measured on these exact clips at matched bitrates - the AV1 files are 1-2%
     SMALLER and better on every one:

       loop       191 KB -> 187 KB   SSIM 0.953 -> 0.973
       loop-hd    459 KB -> 447 KB   SSIM 0.971 -> 0.981
       reveal     370 KB -> 364 KB   SSIM 0.972 -> 0.980
       reveal-hd  757 KB -> 744 KB   SSIM 0.979 -> 0.985

     canPlayType rather than a <source> list, because the file is already
     chosen at runtime for viewport and connection and a source list cannot see
     either. "probably" only: Safari answers "maybe" for codecs it cannot
     actually decode, and a maybe that turns out to be no is a black gate.
     VP9 is deliberately not here. It beats H.264 by much less than AV1 does,
     and the browsers that have VP9 but not AV1 - Safari 14 to 16 - get the
     H.264 file, which is the same file they would have got anyway. */
  function bestCodec(){
    try{
      var v=document.createElement("video");
      if(v.canPlayType('video/mp4; codecs="av01.0.05M.08"')==="probably") return ".av1";
    }catch(e){}
    return "";
  }
  /* WHICH CROP, and it is a question about the shape of the hole rather than
     the kind of device.
     object-fit:cover on a portrait phone shows only 31% of a landscape frame -
     the other 69% is decoded, paid for, and thrown away. A portrait cut of the
     same scene at the same file size carries 2.6x the pixels the reader can
     actually see: 343,008 against 132,849 per frame.
     Measured, not assumed. And keyed on the viewport ratio so a narrow desktop
     window gets it too, because the geometry is the same either way. */
  function variant(){
    try{
      if(window.innerHeight>0 && (window.innerWidth/window.innerHeight)<0.75) return "-p";
    }catch(e){}
    return sharpSet()?"-hd":"";
  }
  function play(){
    if(!wantsVideo()) return;
    var hd=variant();
    var cx=bestCodec();
    try{
      loop.src="/intro-wizard-loop"+hd+cx+".mp4";
      /* GENTLE, AND SHARP, AND THOSE TURNED OUT TO CONFLICT.
         This first interpolated the loop to 40fps and played it at 0.6, so the
         cadence stayed at 24 new frames a second while the hood slowed. On
         paper that is the better answer and the file sizes even improved.
         In practice it broke up badly - reported as "crazy breaking and
         pixelating" - because motion-compensated interpolation has to invent
         frames, and the thing it had to invent around was forked lightning:
         thin, fast, high contrast, and different in every frame. It is close to
         the worst input such a filter can be given.
         The measurement missed it. SSIM over a handful of sampled frames showed
         a drop of about 0.03 and no visible warping in the frames I looked at,
         because the breakup is intermittent and I did not sample the frames it
         happened on. The owner's eyes were right and the metric was not.
         So the files are plain 24fps again and the slowdown is playbackRate
         alone. Every frame shown is a real one at full quality - the ONLY cost
         is that frames are held longer, and with a mean frame-to-frame step of
         3.42 out of 255 there is almost nothing moving far enough for that to
         read as judder. Sharpness beat cadence, which is the right way round
         for a still-ish shot of a hood in the wind. */
      loop.playbackRate=LOOP_RATE;
      loop.addEventListener("canplay",function(){
        /* Some browsers reset the rate when a new source finishes loading. */
        try{ loop.playbackRate=LOOP_RATE; }catch(e){}
        loop.className+=" is-in";
      },{once:true});
      var p=loop.play();
      if(p&&p.catch) p.catch(function(){ /* refused - the poster stands */ });
      /* The reveal is fetched only once the loop is going, so the two never
         compete for the first seconds of bandwidth. */
      setTimeout(armReveal, 1200);
    }catch(e){}
  }

  /* Attach the reveal and start fetching it. Called on a timer once the loop is
     running, and again by Enter if that timer has not come round yet. */
  function armReveal(){
    if(reveal.getAttribute("src")) return;
    try{
      /* PRELOAD="NONE" MEANT ARMING IT FETCHED LITTLE OR NOTHING.
         The element is marked preload="none" so a reader who never presses
         Enter is not charged for the clip - but that attribute outlives the
         arming, and under it a browser is free to buffer nothing at all for
         the load() below. So the tap could still be racing a cold 370-780 KB
         download, and the 1100ms budget below then either gave up (no reveal)
         or started on the first frames that had arrived - the reported skip.
         Flipped here rather than in the markup, because the point of the
         attribute is that nothing loads until we decide it should. */
      reveal.preload="auto";
      reveal.src="/intro-wizard-reveal"+variant()+bestCodec()+".mp4";
      reveal.load();
    }catch(e){}
  }

  function onEnter(){
    if(done) return;
    affirm();
    G.className += " is-revealing";
    var landed=false;
    function land(){ if(landed) return; landed=true; dismiss(true); }
    if(!wantsVideo()){
      /* Reduced motion or a metered connection: still a landing, just a
         shorter one. */
      setTimeout(land, 180); return;
    }
    /* PLAY IT IF IT IS READY, OTHERWISE JUST LAND. NO WAITING, NO WATCHING.
       This is where two reports met, and the machinery between them is now
       gone.
       First: "sometimes when i press enter it just skips and the video doesnt
       play" - a tap before the clip had been armed found no src and fell
       through to the short landing. The answer was to make Enter arm the clip
       and then wait for it, on `canplay`.
       Then: "the video is not smooth from the moment i click enter, kinda
       skips a little" - because `canplay` means one decodable frame, so on a
       cold fetch playback started and ran dry. Waiting on `canplaythrough`
       instead fixed the stutter and left a reader holding a still panel for up
       to a beat after tapping, which is its own kind of wrong.
       The real fault was never the wait. It was that the clip was never in
       cache: it had been served `max-age=0, must-revalidate` since the gate
       shipped, so EVERY visit re-fetched 370-780 KB. That is fixed in
       vercel.json, and once the file is local `readyState` is 4 before anyone
       can reach the button.
       So the wait comes out. Ready means play; not ready means land, at once,
       which is what a reader who has already tapped actually wants. Nothing
       here can stutter, because nothing here starts a clip that cannot finish
       one. */
    if(reveal.readyState < 4){ setTimeout(land, 180); return; }
    runReveal(land);
  }

  /* Play it, and land as it finishes. Split out so the wait above can call it
     the moment the file is ready. */
  function runReveal(land){
    /* THE SKIP BEFORE THE SITE, and it was a pause rather than a stutter.
       Landing on "ended" means the video stops on its final frame, THEN the
       zoom-out transition starts - two motions with a dead beat between them,
       which reads as a hitch just as the page arrives. Starting the landing a
       little before the end lets the CSS zoom take over while the video is
       still moving, so it is one continuous push through the eye.
       `ended` stays as the backstop for anything that never fires timeupdate. */
    reveal.addEventListener("timeupdate", function(){
      var d=reveal.duration;
      if(isFinite(d) && d>0 && reveal.currentTime >= d-0.22) land();
    });
    reveal.addEventListener("ended", land, {once:true});
    reveal.addEventListener("error", land, {once:true});
    var pr=reveal.play();
    if(pr&&pr.catch) pr.catch(land);
    /* Never longer than the clip plus a moment, whatever the video does. The
       clip's own length once the browser knows it, because a fixed 3.2s cut a
       slow start off at the knees - and a ceiling either way, because a stall
       must not hold the reader at the gate. */
    var cap=setTimeout(land, 3200);
    reveal.addEventListener("loadedmetadata", function(){
      var d=reveal.duration;
      if(!isFinite(d)||!(d>0)) return;
      clearTimeout(cap);
      cap=setTimeout(land, Math.min(6000, d*1000+600));
    }, {once:true});
  }

  /* If any of the wiring below throws, the reader must not be left behind a
     panel whose buttons do nothing. Dismissing is the safe failure. */
  try{
  enter.addEventListener("click", onEnter);
  skip.addEventListener("click", function(){ affirm(); dismiss(false); });
  under.addEventListener("click", function(){ G.className += " is-stopped"; });
  back.addEventListener("click", function(){
    G.className=G.className.replace(/\bis-stopped\b/g,"");
    try{ enter.focus(); }catch(e){}
  });
  document.addEventListener("keydown", function(ev){
    if(ev.key==="Escape"&&!done){ affirm(); dismiss(false); }
  });

  try{ enter.focus({preventScroll:true}); }catch(e){}
  play();
  }catch(err){ dismiss(false); }
  /* NO GLOBAL AUTO-DISMISS, and that is a correction rather than an omission.
     This started as a fifteen second backstop and it fired on me while I was
     still reading the panel - which is exactly what it would do to a reader
     deciding whether to press Enter. A timer cannot tell 'hung' from
     'thinking'.
     What it was guarding against is covered in the two places the hang can
     actually happen: the reveal has its own 3.2s land() timeout, and the
     wiring below dismisses outright if anything in setup threw. Escape is
     registered before any of it and always works. */
})();






















































































































































































































































































































































































































































































































































































































"use strict";
const $=function(id){return document.getElementById(id);};
/* the same drawn cross the static close buttons use - see .sheet-x in the css */
var XSVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
/* writeText returns a promise, and it rejects - "Document is not focused" is
   the common one, thrown when the tap lands while focus sits in another frame
   or the page has just been backgrounded. try/catch does not catch a rejected
   promise, so every copy on the site was an unhandled rejection waiting for
   the wrong moment; Sentry had logged six before anybody noticed.
   Nothing useful can be done beyond not crashing: the button has already said
   "Copied", and the code is on screen to select by hand. */
function copyText(t){
  try{
    if(!navigator.clipboard) return false;
    var r=navigator.clipboard.writeText(t);
    if(r&&r.catch) r.catch(function(){});
    return true;
  }catch(e){ return false; }
}
const P0=function(x){return Math.round(x*100);};

/* Home, draw and away are one split of one certainty, so the three numbers we
   print have to add to a hundred. Rounding each on its own does not: 36.6,
   26.8 and 36.6 are exactly 100 and become 37, 27 and 37, which is 101 and
   makes the whole card look like it cannot count.
   Largest remainder: floor everything, then hand the leftover points to the
   values with the biggest fractions. The result always totals 100 and each
   number is still within one of its true value. Where two are genuinely equal
   one of them takes the odd point - unavoidable when an odd remainder is
   split two ways, and honest about it. */
function split100(vals){
  var raw=vals.map(function(v){return (Number(v)||0)*100;});
  var sum=raw.reduce(function(a,b){return a+b;},0);
  if(!(sum>0)) return raw.map(function(){return 0;});
  raw=raw.map(function(r){return r*100/sum;});
  var out=raw.map(function(r){return Math.floor(r);});
  var left=100-out.reduce(function(a,b){return a+b;},0);
  var order=raw.map(function(r,i){return {i:i,frac:r-Math.floor(r)};})
               .sort(function(a,b){return b.frac-a.frac;});
  for(var n=0;n<left;n++) out[order[n%order.length].i]++;
  return out;
}
var CHK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;display:block"><path d="M5 13l4 4L19 7"/></svg>';
var PLUS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" style="width:12px;height:12px;display:block"><path d="M12 5v14M5 12h14"/></svg>';
function conf(p){var pc=Math.round(p*100);return pc>=70?"strong":pc>=55?"lean":"slight";}
function confLabel(p){var pc=Math.round(p*100);return pc>=70?"Strong":pc>=55?"Likely":"Slight";}
function verdict(p){var pc=Math.round(p*100);return pc>=70?"Good bet":pc>=55?"Worth a look":"Risky pick";}
const V={off:0,dayPicked:false,country:"",league:"",q:"",cat:"all",list:true,view:"pred"};
try{var _sv=localStorage.getItem("sw.view"); if(_sv) V.list=(_sv==="list");}catch(e){}
/* Which tab you are on is session state, not a preference. Kept in
   sessionStorage so it survives moving around the site and a reload, and is
   gone once the tab or the app is closed - coming back later should start at
   the front door, not wherever you happened to stop. */
try{var _sv2=sessionStorage.getItem("sw.viewtab"); if(_sv2 && ["pred","live","build"].includes(_sv2)) V.view=_sv2;}catch(e){}
/* Clear the old localStorage copy so an existing visitor is not pinned to the
   tab they were on when this changed. */
try{localStorage.removeItem("sw.viewtab");}catch(e){}
let DATA={generated:"",matches:0,leagues:[],fixtures:[],results:[]};
const REDUCED=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if(REDUCED) document.documentElement.classList.add("reduce");
const SHUT={};
const LOPEN={};

function esc(s){return String(s).replace(/[&<>"]/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];});}
function fid(f){return "m"+(f.date+f.home+f.away).replace(/[^a-zA-Z0-9]/g,"");}

/* ==================================================================
   SLIP HISTORY
   A slip you built is kept, graded against the final scores when they
   arrive, and shown back to you. Without this the site finishes its job the
   moment it hands over a code and there is nothing to come back for.
   ================================================================== */

/* Grade one leg by ITS OWN market, not the fixture's headline tip. A slip leg
   is whatever you picked - Over 2.5, both teams, the away side - and the
   headline tip is frequently something else entirely.
   Returns "win", "lose", or null for a market a final score cannot settle:
   first-half goals need a half-time score we do not carry. Null means
   unknown, never lost, so a slip is never marked down on a leg nobody
   actually graded. */
function gradeCode(code, hg, ag){
  if(hg==null||ag==null||isNaN(hg)||isNaN(ag)) return null;
  var tot=hg+ag, both=hg>0&&ag>0;
  switch(code){
    case"1":  return hg>ag?"win":"lose";
    case"2":  return ag>hg?"win":"lose";
    case"X":  return hg===ag?"win":"lose";
    case"1X": return hg>=ag?"win":"lose";
    case"X2": return ag>=hg?"win":"lose";
    case"12": return hg!==ag?"win":"lose";
    case"OVER_1.5": return tot>1?"win":"lose";
    case"OVER_2.5": return tot>2?"win":"lose";
    case"OVER_3.5": return tot>3?"win":"lose";
    case"GG": return both?"win":"lose";
    case"HOME_OVER_0.5": return hg>0?"win":"lose";
    case"HOME_OVER_1.5": return hg>1?"win":"lose";
    case"AWAY_OVER_0.5": return ag>0?"win":"lose";
    case"AWAY_OVER_1.5": return ag>1?"win":"lose";
    /* Settled at half time, which no feed here reports after the fact. */
    case"FH_OVER_0.5": return null;
  }
  return null;
}

/* The final score for a leg, from whichever source actually has one.
   A graded server result outranks the live feed, the same order the board
   already trusts. */
function finalScoreFor(leg){
  var nh=normTeam(leg.home||""), na=normTeam(leg.away||"");
  var rs=DATA.results||[];
  for(var i=0;i<rs.length;i++){
    var r=rs[i];
    if(r.date===leg.date && normTeam(r.home)===nh && normTeam(r.away)===na)
      return {hg:r.hg, ag:r.ag};
  }
  var f=fixtureById(leg.id);
  if(f && f.hg!=null && f.ag!=null) return {hg:f.hg, ag:f.ag};
  if(f){
    var st=fixtureState(f);
    /* An INFERRED full time is refused here on purpose. Everything else in
       this function is a score somebody stands behind - the results feed, the
       baked payload, or the live feed saying full time in as many words. The
       inference is a guess drawn from a match being absent, and settleSlips
       freezes whatever it is told and settles the whole slip on one lost leg,
       so a guess here is not a display glitch that corrects itself: it is a
       permanent wrong verdict on somebody's ticket. Waiting for the next build
       costs minutes. Being wrong costs the slip. */
    if(st && st.kind==="ft" && !st.inferred) return {hg:st.hg, ag:st.ag};
  }
  return null;
}

var SLIPS=[];
try{SLIPS=JSON.parse(localStorage.getItem("sw.slips.v1")||"[]");}catch(e){SLIPS=[];}
if(!Array.isArray(SLIPS)) SLIPS=[];
/* Keeping every slip forever would grow without bound in a store measured in
   megabytes, and nobody scrolls past a month of their own history anyway. */
const SLIPS_KEEP=60;

/* One-time repair for slips settled on half-time scores.
   A leg keeps its verdict once it has one - settleSlips skips any leg already
   marked win or lose, and a settled slip is never revisited. That is right
   while the scores are right. They were not: the live feed spent its life
   publishing the first half as the current score, so a leg could be frozen as
   a loss against a score the match had long since passed. Bayern Munich sat in
   the record as 1-0 with our Over 1.5 tip marked a miss; it finished 5-1.
   Clearing the verdict lets settleSlips grade it again from data that is now
   correct. Only legs recent enough for the results feed to still carry them
   are touched: past that window there is nothing to re-grade against, and
   blanking a leg we cannot settle again would replace a possibly-wrong answer
   with certainly no answer. Older slips are left alone - the honest limit of
   what this can repair. */
try{
  if(!localStorage.getItem("sw.slips.rescore1")){
    var _fixed=0;
    SLIPS.forEach(function(sl){
      if(!sl||!Array.isArray(sl.legs)) return;
      var touched=false;
      sl.legs.forEach(function(l){
        if(!l||!l.date) return;
        if(dayOff(l.date) < -21) return;
        if(l.res==="win"||l.res==="lose"){
          delete l.res; delete l.hg; delete l.ag; touched=true;
        }
      });
      if(touched){ sl.settled=false; sl.won=null; sl.hits=0; sl.graded=0; _fixed++; }
    });
    if(_fixed) saveSlips();
    localStorage.setItem("sw.slips.rescore1","1");
  }
}catch(e){}
function saveSlips(){
  try{
    if(SLIPS.length>SLIPS_KEEP) SLIPS=SLIPS.slice(0,SLIPS_KEEP);
    localStorage.setItem("sw.slips.v1",JSON.stringify(SLIPS));
  }catch(e){}
}

/* Record a slip at the moment it becomes real - when a booking code exists.
   Building and rebuilding in the wizard should not fill the history with
   drafts nobody placed. */
function rememberSlip(legs, odds, code){
  if(!legs||legs.length<1) return null;
  var snap=legs.map(function(x){
    var f=fixtureById(x.id)||{};
    /* THE LABEL IS WRITTEN HERE OR IT IS NEVER WRITTEN. Your slips renders
       `l.label||l.code`, and this took whatever the caller happened to pass -
       so the paths that hand over a raw pick ({id,code,p}) saved no label and
       the card showed the plumbing: "MIX_2_OV_1.5" where "Newcastle or over
       1.5 goals" belongs. Reported on exactly that market. Computed once, at
       the one place every caller goes through, because a label per caller is
       how this went wrong the first time. */
    return {id:x.id, code:x.code,
            label:x.label||(f.home?mLabel(f,x.code).replace(/<[^>]+>/g,""):""),
            home:f.home||"", away:f.away||"", date:f.date||"",
            kickoff:f.kickoff||null,
            p:+x.p||0, odd:legOdd(f,x.code,x.p)};
  });
  /* The same code booked twice is the same slip, not two. */
  if(code){
    for(var i=0;i<SLIPS.length;i++) if(SLIPS[i].code===code) return SLIPS[i];
  }
  var slip={
    sid:"s"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),
    at:new Date().toISOString(),
    code:code||null,
    legs:snap,
    odds:+odds||snap.reduce(function(t,l){return t*(l.odd||1);},1),
    settled:false, won:null, hits:0, graded:0,
  };
  SLIPS.unshift(slip); saveSlips(); refreshSlipUI();
  return slip;
}

/* Everything on the page that reads SLIPS, redrawn together.
   Reported: "when i click on save your slip, it doesnt show on the home page
   till i refresh. also, in the your slip, when i delete the last ticket, it
   still shows that i have a slip till i refresh."
   Both were the same omission. renderMyResults draws the home-page card and was
   only ever called once, at startup - so saving a slip left the card absent and
   deleting the last one left it stranded, each until a reload rebuilt the page
   from storage. removeSlip and clearSlips did redraw the sheet and the record,
   which is why the sheet looked right while the home page did not.
   Deliberately not folded into saveSlips(), tempting as that chokepoint is:
   renderRecord() itself calls saveSlips() when grading changes something, so a
   redraw hung there would recurse. The guard below is belt and braces for the
   same reason. */
var SLIPUI_BUSY=false;
function refreshSlipUI(){
  if(SLIPUI_BUSY) return;
  SLIPUI_BUSY=true;
  try{ renderMyResults(); }catch(e){}
  try{ renderRecord(); }catch(e){}
  try{ renderSlipsSheet(); }catch(e){}
  SLIPUI_BUSY=false;
}

/* Grade everything that can be graded. Cheap, idempotent, and safe to call on
   every payload refresh - a slip already settled is skipped. */
function settleSlips(){
  var changed=false, newlySettled=[];
  SLIPS.forEach(function(s){
    if(s.settled) return;
    var hits=0, graded=0, lost=0, unknown=0;
    s.legs.forEach(function(l){
      if(l.res==="win"||l.res==="lose"){ graded++; if(l.res==="win")hits++; else lost++; return; }
      var sc=finalScoreFor(l);
      if(!sc){ unknown++; return; }
      var g=gradeCode(l.code, sc.hg, sc.ag);
      if(g==null){ l.res="void"; l.hg=sc.hg; l.ag=sc.ag; changed=true; return; }
      l.res=g; l.hg=sc.hg; l.ag=sc.ag; graded++; changed=true;
      if(g==="win") hits++; else lost++;
    });
    s.hits=hits; s.graded=graded;
    /* One lost leg settles an accumulator - the rest cannot rescue it. */
    if(lost>0){ s.settled=true; s.won=false; changed=true; newlySettled.push(s); }
    else if(unknown===0 && graded+countVoid(s)===s.legs.length && graded>0){
      s.settled=true; s.won=true; changed=true; newlySettled.push(s);
    }
  });
  if(changed) saveSlips();
  return newlySettled;
}
function countVoid(s){
  return s.legs.filter(function(l){return l.res==="void";}).length;
}

/* Your record, from your own slips. Separate from the site's hit rate, which
   measures our headline tips rather than anything you actually built. */
/* The card a returning visitor is actually here for. Nothing else on the page
   answers "did mine come in?", and until this existed the site had no reason
   to be opened twice.
   It only appears once there is something to say. A first-time visitor sees
   the offer and the board, exactly as before. */
function renderMyResults(){
  var host=$("myres"); if(!host) return;
  if(!SLIPS.length){ host.innerHTML=""; return; }
  var r=myRecord();
  var last=SLIPS.filter(function(x){return x.settled;})[0];
  var open=SLIPS.filter(function(x){return !x.settled;})[0];

  var head, body;
  if(open){
    /* A slip still running beats a finished one: it is the live thing. */
    var done=open.legs.filter(function(l){return l.res==="win"||l.res==="lose";}).length;
    head="<span class='mr-tag live'>Running</span>";
    body="<b>"+open.legs.length+"-game slip · ×"+open.odds.toFixed(2)+"</b>"+
      "<span>"+(done?done+" of "+open.legs.length+" settled so far":"None of these have finished yet")+
      (open.hits?" · "+open.hits+" landed":"")+"</span>";
  } else if(last){
    var when=slipWhen(last.at);
    head="<span class='mr-tag "+(last.won?"won":"lost")+"'>"+(last.won?"Won":"Lost")+"</span>";
    body="<b>Your "+when+" slip: "+last.hits+" of "+last.legs.length+" landed</b>"+
      "<span>"+(last.won
        ? "All of them. That paid ×"+last.odds.toFixed(2)+"."
        : "One got away. That is how accumulators go.")+"</span>";
  }
  /* The numbers carry the weight, the words explain them - reading "1 of 3"
     at a glance is the point, not the sentence around it. */
  var rec=r.settled
    ? "<b>"+r.won+" of "+r.settled+"</b> slips landed"+
      (r.streak>1?" · <b>"+r.streak+"</b> in a row":"")
    : "<b>"+r.built+"</b> slip"+(r.built===1?"":"s")+" so far";

  /* Shown once, the first time there is anything here. Nobody expects a site
     to have kept their slip, so without a word about it the card reads as
     another panel rather than as their own record. */
  var coach=slipCoachSeen()?"":
    "<div class='mr-coach'><span>We keep every slip you book and check it "+
    "against the final scores. Come back and see how it finished.</span>"+
    "<button class='mr-coach-x' type='button'>Got it</button></div>";

  host.innerHTML=
    "<section class='myres'>"+
      "<div class='mr-top'>"+head+"<span class='mr-ttl'>Your slips</span></div>"+
      "<div class='mr-body'>"+body+"</div>"+
      coach+
      "<div class='mr-foot'><span class='mr-rec'>"+rec+"</span>"+
        "<button class='mr-all' id='mrAll' type='button'>See all</button></div>"+
    "</section>";
  $("mrAll").addEventListener("click",openSlipsSheet);
  var cx=host.querySelector(".mr-coach-x");
  if(cx) cx.addEventListener("click",function(){ slipCoachDone(); renderMyResults(); });
}
const SLIP_COACH_KEY="sw.coached.slips.v1";
function slipCoachSeen(){
  try{return localStorage.getItem(SLIP_COACH_KEY)==="1";}catch(e){return true;}
}
function slipCoachDone(){
  try{localStorage.setItem(SLIP_COACH_KEY,"1");}catch(e){}
}
/* "Tuesday" rather than a date: people remember the day they placed it. */
function slipWhen(iso){
  var d=new Date(iso); if(isNaN(d)) return "last";
  var off=dayOff(d.toISOString().slice(0,10));
  if(off===0) return "today's";
  if(off===-1) return "yesterday's";
  return dayName(off)+"'s";
}

function openSlipsSheet(){
  renderSlipsSheet();
  $("scrim").classList.add("on");
  $("slipsSheet").classList.add("on");
  lockBody(true); pushOverlay();
}
function closeSlipsSheet(){
  $("scrim").classList.remove("on");
  $("slipsSheet").classList.remove("on");
  if(!$("mySheet")||!$("mySheet").classList.contains("on")) lockBody(false);
}
/* A booked slip is a record, not a draft, so removing one asks first - and the
   ask lives in the sheet rather than in a browser confirm(), which on a phone
   is a jarring system dialog over a sheet the user is already inside. */
function removeSlip(sid){
  var i=SLIPS.findIndex?SLIPS.findIndex(function(s){return s.sid===sid;}):-1;
  if(i<0){ for(var j=0;j<SLIPS.length;j++) if(SLIPS[j].sid===sid){i=j;break;} }
  if(i<0) return;
  SLIPS.splice(i,1); saveSlips(); refreshSlipUI();
  window.swToast&&window.swToast("Slip removed","ok","sliprm");
}
function clearSlips(){
  if(!SLIPS.length) return;
  SLIPS=[]; saveSlips(); refreshSlipUI();
  window.swToast&&window.swToast("Slip history cleared","ok","slipclr");
}
/* Which slip is expanded. null until the sheet has been drawn once, so the
   first draw can choose the newest without overriding a later choice. */
var SLOPEN=null;
function renderSlipsSheet(){
  var body=$("slipsBody"); if(!body) return;
  if(!SLIPS.length){
    body.innerHTML="<div class='bld-empty'><b>No slips yet</b>"+
      "Book one and it will be kept here, with its result once the games finish.</div>";
    return;
  }
  var r=myRecord();
  var head="<div class='sl-rec'>"+
    "<div><i>Slips</i><b>"+r.built+"</b></div>"+
    "<div><i>Landed</i><b>"+r.won+"</b></div>"+
    "<div><i>Legs</i><b>"+(r.legs?Math.round(100*r.legHits/r.legs)+"%":"-")+"</b></div>"+
    (r.best?"<div><i>Best</i><b>×"+r.best.odds.toFixed(2)+"</b></div>":"")+
    "</div>";
  /* Nothing chosen yet means the newest is the one to show. Once anything has
     been opened or closed by hand, that choice is what holds. */
  if(SLOPEN===null) SLOPEN=(SLIPS[0]&&SLIPS[0].sid)||"";
  body.innerHTML=head+SLIPS.map(function(sp){
    var state=sp.settled?(sp.won?"won":"lost"):"open";
    var label=sp.settled?(sp.won?"Won":"Lost"):"Running";
    var open=(sp.sid===SLOPEN);
    return "<div class='sl-card "+state+(open?" is-open":"")+"'>"+
      /* One line each, opened on demand. A booked slip is mostly answered by
         its first line - did it land, when, for how much - and sixty of them
         stacked open meant scrolling past hundreds of legs to find the one you
         were looking for. The legs are the detail behind the answer, so they
         wait until asked for. The newest is open, because that is the one
         anyone arriving here is almost always checking. */
      "<button class='sl-head' type='button' data-slop='"+esc(sp.sid||"")+"' "+
        "aria-expanded='"+(open?"true":"false")+"'>"+
        "<span class='sl-tag "+state+"'>"+label+"</span>"+
        (isJackpotSlip(sp)?"<span class='sl-tag sl-tag-jack'>Jackpot</span>":"")+
        "<span class='sl-when'>"+esc(slipWhen(sp.at))+" · "+sp.legs.length+" games</span>"+
        "<span class='sl-odds'>×"+(sp.odds>=1000?Math.round(sp.odds).toLocaleString():sp.odds.toFixed(2))+"</span>"+
        "<span class='sl-chev' aria-hidden='true'>▾</span></button>"+
      "<div class='sl-body'>"+
      "<div class='sl-legs'>"+sp.legs.map(function(l){
        /* A dot, not a tick. Ticks and crosses read as a checklist somebody
           is working through; these are results, and the site already says
           status with a coloured dot everywhere else. The score does the
           explaining - the dot only has to say which way it went. */
        var sc=(l.hg!=null&&l.ag!=null)?(" "+l.hg+"-"+l.ag):"";
        return "<div class='sl-leg "+(l.res||"open")+"'><span class='sl-m'></span>"+
          "<span class='sl-t'>"+esc(l.home)+" v "+esc(l.away)+"</span>"+
          "<span class='sl-p'>"+esc(l.label||l.code)+esc(sc)+"</span></div>";
      }).join("")+"</div>"+
      /* The code was printed as plain text, which is the one thing on this card
         somebody actually needs to use - and it could not be copied. */
      "<div class='sl-acts'>"+
        (sp.code
          ? "<span class='sl-code'>Code <b>"+esc(sp.code)+"</b></span>"+
            "<button class='sl-mini' type='button' data-slcp=\""+esc(sp.code)+"\" "+
              "aria-label='Copy booking code'>Copy</button>"
          : "<span class='sl-code sl-code-none'>No code</span>")+
        /* Not "edit": this slip is a bet that was placed, and nothing here can
           change it. What is useful is starting a new one from it, so it loads
           the legs that are still open into My slip and says what it had to
           leave behind. */
        "<button class='sl-mini' type='button' data-slrb='"+esc(sp.sid||"")+"'>Rebuild</button>"+
        "<button class='sl-mini sl-mini-x' type='button' data-slrm='"+esc(sp.sid||"")+"' "+
          "aria-label='Remove this slip'>Delete</button>"+
      "</div>"+
      "</div>"+
    "</div>";
  }).join("")+
  /* Under the list, not in the header: clearing the lot is the last thing
     anyone wants here, so it should be the last thing they reach. */
  "<div class='sl-foot'><button class='sl-clear' id='slipsClear' type='button'>"+
    "Clear slip history</button></div>";
  /* One open at a time. Two or three expanded and the density this is for is
     gone again; and with one, opening the next always closes the last without
     anyone having to tidy up. */
  body.querySelectorAll("[data-slop]").forEach(function(b){
    b.addEventListener("click",function(){
      SLOPEN=(SLOPEN===b.dataset.slop)?"":b.dataset.slop;
      renderSlipsSheet();
    });
  });
  body.querySelectorAll("[data-slrm]").forEach(function(b){
    b.addEventListener("click",function(){ askRemoveSlip(b,b.dataset.slrm); });
  });
  body.querySelectorAll("[data-slcp]").forEach(function(b){
    b.addEventListener("click",function(){
      var code=b.dataset.slcp;
      copyText(code);
      var was=b.textContent; b.textContent="Copied"; b.classList.add("ok");
      setTimeout(function(){ b.textContent=was; b.classList.remove("ok"); },1500);
    });
  });
  body.querySelectorAll("[data-slrb]").forEach(function(b){
    b.addEventListener("click",function(){ rebuildSlip(b.dataset.slrb); });
  });
  var ca=$("slipsClear");
  if(ca) ca.addEventListener("click",function(){ askClearSlips(ca); });
}
/* Start a new slip from an old one.
   Deliberately not called "edit": the slip in this list is a bet that was
   placed, and nothing here can change it - the code is already at SportyBet.
   What is useful is the shape of it, so the legs that are still open are
   loaded into My slip and the ones that are not are named rather than dropped
   in silence. */
function rebuildSlip(sid){
  var sp=null;
  for(var i=0;i<SLIPS.length;i++) if(SLIPS[i].sid===sid){sp=SLIPS[i];break;}
  if(!sp) return;
  var added=0, played=0, missing=0;
  /* Replaces what is on the slip rather than adding to it. Rebuilding is
     "give me this slip again", and folding it into whatever was already there
     gives a third thing that is neither - and, run twice, a slip with every
     leg on it once and then twice over. What it replaced is said out loud
     below, since it is the one thing here that throws work away. */
  var had=MYSLIP.length;
  MYSLIP=[];
  sp.legs.forEach(function(l){
    var f=fixtureById(l.id);
    if(!f){ missing++; return; }                    /* no longer on the card */
    if(!notStarted(f)){ played++; return; }          /* kicked off or finished */
    var p=(l.p!=null?l.p:mProb(f,l.code));
    MYSLIP.push({id:l.id,code:l.code,label:l.label||mLabel(f,l.code),p:+p||0});
    added++;
  });
  saveMy(); renderFab();
  var lost=played+missing;
  if(!added){
    window.swToast&&window.swToast("None of these games are still open","info","rb");
    return;
  }
  closeSlipsSheet(); openMySheet();
  var msg="Slip rebuilt with "+added+" pick"+(added===1?"":"s");
  if(lost) msg+=" - "+lost+" no longer available";
  if(had) msg+=had===1?" (replaced 1)":(" (replaced "+had+")");
  window.swToast&&window.swToast(msg,"ok","rb");
}
/* Two-tap confirm in place: the button becomes "Sure?" and reverts if it is
   not taken up, so nothing is lost to a stray tap and no dialog interrupts. */
function armConfirm(btn,label,go){
  if(btn._armed){ clearTimeout(btn._armed); btn._armed=null; go(); return; }
  var was=btn.innerHTML;
  btn.innerHTML=label; btn.classList.add("arm");
  btn._armed=setTimeout(function(){
    btn._armed=null; btn.innerHTML=was; btn.classList.remove("arm");
  },2600);
}
function askRemoveSlip(btn,sid){ armConfirm(btn,"Sure?",function(){removeSlip(sid);}); }
function askClearSlips(btn){ armConfirm(btn,"Tap again to clear everything",function(){clearSlips();}); }

/* A slip priced at jackpot odds is a lottery ticket, and it is counted as one:
   kept out of the record entirely rather than allowed to drag a genuine run of
   form down with it. Judged by odds rather than by how it was built, so a
   twenty-thousand-to-one ticket assembled by hand counts the same as one the
   wizard conjured. They are still stored, still graded, still shown - they
   simply do not set the percentages. */
function isJackpotSlip(s){ return !!(s && isJackpotOdds(+s.odds)); }
function myRecord(){
  var real=SLIPS.filter(function(s){return !isJackpotSlip(s);});
  var done=real.filter(function(s){return s.settled;});
  var won=done.filter(function(s){return s.won;}).length;
  var legs=0, legHits=0;
  real.forEach(function(s){ s.legs.forEach(function(l){
    if(l.res==="win"){legs++;legHits++;} else if(l.res==="lose"){legs++;} }); });
  var best=null;
  done.forEach(function(s){ if(s.won && (!best||s.odds>best.odds)) best=s; });
  /* Consecutive winning slips, most recent first. A jackpot ticket neither
     continues a streak nor ends one - it is simply stepped over. */
  var streak=0;
  for(var i=0;i<SLIPS.length;i++){
    if(isJackpotSlip(SLIPS[i])||!SLIPS[i].settled) continue;
    if(SLIPS[i].won) streak++; else break;
  }
  var jack=SLIPS.filter(isJackpotSlip);
  return {built:real.length, settled:done.length, won:won,
          legs:legs, legHits:legHits, best:best, streak:streak,
          jack:jack.length, jackWon:jack.filter(function(s){return s.settled&&s.won;}).length,
          pending:real.filter(function(s){return !s.settled;}).length};
}
function countryOf(l){return l.split(" ")[0];}
/* CONMEBOL countries. Only Argentina and Brazil are in the feeds today, but
   the whole set is listed so a new South American league is handled the moment
   it appears rather than slipping through as if it were European. The builders
   hold these back behind Europe; countryOf() gives the league's leading word. */
var SA_COUNTRIES={Argentina:1,Bolivia:1,Brazil:1,Chile:1,Colombia:1,Ecuador:1,
  Paraguay:1,Peru:1,Uruguay:1,Venezuela:1};
/* Held back harder than South America. The model has less history to work
   from in these leagues and the form is choppier, so a confident-looking
   number here is worth less than the same number in Europe - which is
   exactly the kind of leg that quietly sinks a slip.
   They are not removed: on a thin day, or once somebody has shuffled a few
   times and clearly wants a different mix, they come through.
   Matched on the whole country prefix rather than the first word, because
   countryOf() takes one word and "South", "United" and "Saudi" on their own
   would have swept up South Africa and the United States. */
var ASIA_PREFIXES=["Japan","China","India","Indonesia","Malaysia","Singapore",
  "Thailand","Vietnam","Uzbekistan","Iran","Iraq","Qatar","Kuwait","Bahrain",
  "Oman","Jordan","Lebanon","Kazakhstan","Azerbaijan","Taiwan","Myanmar",
  "Cambodia","Nepal","Bangladesh","Tajikistan","Turkmenistan","Kyrgyzstan",
  "Korea Republic","South Korea","Saudi Arabia","United Arab Emirates",
  "Hong Kong","Chinese Taipei","Palestine","Syria","Yemen","Maldives"];
/* "Fixtures are not a lot" = fewer than this many European games to choose
   from. Below it a slip would be thin, so South America is allowed in to pad
   it; at or above it Europe stands on its own. An absolute floor, not a share
   of the risk-slider cap - that cap runs to ~35, so a relative test would rate
   Europe "scarce" almost every day and defeat the whole point. */
var SA_MIN_EURO=6;
/* Asia gets its own, lower bar than South America. Both used SA_MIN_EURO, so
   any card with fewer than six European candidates - "Today only" early in the
   day, a single time-of-day bucket, top-flight-only - dropped straight into
   "fill" and let Japan and China through regardless of tier or shuffles. That
   is most of the reason they turned up in slips that were never meant to
   have them. Three means Europe has genuinely run out rather than merely
   thinned. */
var ASIA_MIN_EURO=3;
/* Lower divisions (2nd tiers and below) - some days the board is mostly these
   and the user wants top-flight only. One shared setting drives both builders. */
/* Second tier and below, by the competition's own name rather than a list of
   leagues someone has to keep up to date.
   The guard first: a few top flights read like tiers - Korea's K-League 1,
   Japan's J1, Spain's La Liga 1 - and would otherwise be demoted by the
   "league 1" pattern below. */
/* Is this FIXTURE below the top division?
   Prefer the tier the build stamped on it: that was decided against the league
   the model actually rated the clubs in, and for a cup tie it is the worse of
   the two clubs' divisions - so an FA Cup tie against a fourth-tier side is
   correctly not top flight, which no amount of reading the competition name
   could tell us. Falls back to the name test for a payload baked before the
   field existed, so an old cached board still behaves. */
function isLowerFixture(f){
  if(!f) return false;
  if(f.tier) return f.tier>1;
  return isLowerLeague(f.league);
}
function isLowerLeague(l){
  var s=(l||"").toLowerCase();
  if(/\bk-?league 1\b|\bj1 league\b|\bla liga 1\b|\bliga 1\b|\bligue 1\b|\bserie a\b|\bbundesliga 1\b/.test(s)) return false;
  return /\bchampionship\b|\bleague [123]\b|\bj[23] league\b|\bconference\b|\bligue [23]\b|\bserie [bc]\b|\bla liga 2\b|\bbundesliga 2\b|\b2\. bundesliga\b|\b3\. liga\b|\beerste divisie\b|\bchallenge league\b|\bpromotion league\b|\b1st division\b|\bdivision [12]\b|\bprimera b\b|\bprimera nacional\b|\bsegunda\b|\btorneo federal\b|\bregionalliga\b|\bnext pro\b|\breserves?\b|\bu(19|20|21|23)\b|\bnb (ii|iii)\b|\bii lyga\b/.test(s);
}
/* Running order for whatever is left after the pinned and marquee sections:
   a country's top flight before anybody's second tier, South America after
   Europe's top flights, and the lower divisions last. */
function leagueRank(l){
  if(isLowerLeague(l)) return 3;
  if(isSAleague(l)) return 2;
  return 1;
}
var TOP_ONLY=false; try{TOP_ONLY=localStorage.getItem("sw.toponly")==="1";}catch(e){}
function setTopOnly(v){TOP_ONLY=!!v;try{localStorage.setItem("sw.toponly",v?"1":"0");}catch(e){}}
function marketCount(){try{return Object.keys(BUILD.mk).filter(function(k){return BUILD.mk[k];}).length;}catch(e){return 0;}}
function updateFiltersSum(){
  var el=document.getElementById("filtersSum"); if(!el) return;
  var n=marketCount();
  el.textContent=(TOP_ONLY?"Top flight":"All leagues")+" \u00b7 "+n+" market"+(n===1?"":"s");
}
function isSAleague(l){return !!SA_COUNTRIES[countryOf(l||"")];}
function isAsianLeague(l){
  var t=(l||"").trim();
  for(var i=0;i<ASIA_PREFIXES.length;i++){
    var pre=ASIA_PREFIXES[i];
    if(t===pre||t.indexOf(pre+" ")===0) return true;
  }
  return false;
}
function isAsian(f){return isAsianLeague((f&&f.league)||"");}

/* Ranking a headline by the league table rather than by continent.
   Both the Pick and the Slip of the day used to demerit any Asian league, and
   because that demerit sorted ahead of confidence it worked as a ban whenever
   anything else was on the card - reaching past a China Super League pick at
   89.9% to a Conference National game. Our own table has China Super League at
   tier 1, level with the Premier League, and Conference National at 5, so the
   rule was overruling our judgement of quality with a guess about geography.
   A step down in tier costs two points of confidence rather than the pick: a
   strong top-flight game leads the day, and a standout lower down has to be
   clearly better to take the headline rather than merely present. An unranked
   league sits below every named one. Mirrors choosePotd in lib/build.js. */
var TIER_COST=0.02, TIER_UNRANKED=6;
function tierOf(f){ var t=Number(f&&f.tier); return (t>=1&&t<=5)?t:TIER_UNRANKED; }
function tierScore(p,f){ return (Number(p)||0)-TIER_COST*(tierOf(f)-1); }
/* How hard to hold a South American game back.
   The continent was never the problem - grinding, low-scoring leagues were,
   and Argentina is the one that prompted the rule: it averages well under
   half a goal past the over-2.5 bar, so its games stay held back here on
   their own numbers. A South American fixture the model expects goals in is
   not the game this penalty exists to avoid, so it keeps its full weight and
   competes with Europe on merit. No league list to maintain: if Brazil or
   Colombia are scoring, they come through by themselves. */
function saWeight(f,base){
  if(f&&f.o25!=null&&!isNaN(f.o25)&&f.o25>=HIGH_SCORING_O25) return 1;
  return base;
}
function isSouthAmerican(f){return isSAleague((f&&f.league)||"");}
/* Predicted scoreline from expected goals. On a rounded tie, break toward the
   side the model leans on, so it never shows a draw against a "No draw" tip;
   a genuine draw is kept only when the draw is the most likely single result. */
/* The scoreline shown on a card.
   The build already publishes one - f.score - and it is chosen to be the
   likeliest scoreline the fixture's own tip actually survives, settled by the
   same grader that settles real matches. Prefer it.
   What follows is the old local heuristic, kept only for a record that has no
   published score. It is why "Alaves 2-1 Villarreal" sat beside the tip
   "Villarreal or draw": it rebuilt a scoreline from the goal expectations and
   the over/under call without ever consulting the tip, so for two evenly
   matched sides it rounded 1.38 and 1.38 into a home win and contradicted the
   call printed next to it. Two independent answers to one question, and the
   page showed the wrong one. */
function scoreLine(f){
  if(f&&typeof f.score==="string"&&/^\d+-\d+$/.test(f.score)) return f.score;
  var sum=f.lh+f.la;
  if(sum<=0) return "0-0";
  var over=f.o25>=0.5;
  var total=Math.round(sum);
  if(over&&total<3) total=3;
  if(!over&&total>2) total=2;
  var h=Math.round(f.lh/sum*total), a=total-h;
  if(h===a){
    var hp=f.home_p||0, ap=f.away_p||0, dp=f.draw_p||0;
    if(!(dp>=hp&&dp>=ap)){ if(hp>=ap){h+=1;a-=1;} else {a+=1;h-=1;} }
  }
  return h+"-"+a;
}

/* Flags as emoji rather than image files: no requests, no licensing, and
   they inherit the reader's own font. Built from the two-letter code so a
   missing country simply shows nothing rather than a broken box. */
var FLAG_CODE={Argentina:"AR",Austria:"AT",Belgium:"BE",Brazil:"BR",China:"CN",
  Denmark:"DK",England:"GB-ENG",Finland:"FI",France:"FR",Germany:"DE",Greece:"GR",
  Ireland:"IE",Italy:"IT",Japan:"JP",Mexico:"MX",Netherlands:"NL",Norway:"NO",
  Poland:"PL",Portugal:"PT",Romania:"RO",Russia:"RU",Scotland:"GB-SCT",Spain:"ES",
  Sweden:"SE",Switzerland:"CH",Turkey:"TR",USA:"US"};
var GLOBE_SVG="<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' style='color:var(--soft);vertical-align:-3px'><circle cx='12' cy='12' r='9'/><path d='M3 12h18'/><path d='M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18'/></svg>";
var INTL_RE=/international|world|europe|uefa|conmebol|concacaf|champions|friendl|conference|qualif/i;
function intlGlobe(c){return INTL_RE.test(c||"")?GLOBE_SVG:"";}
function flagFor(c){
  var code=FLAG_CODE[c];
  if(!code) return intlGlobe(c);
  code=code.toLowerCase();
  return "<img class='flag' src='https://flagcdn.com/w40/"+code+".png' "+
    "srcset='https://flagcdn.com/w80/"+code+".png 2x' alt='' aria-hidden='true' loading='lazy'>";
}
function compOf(l){const p=l.split(" ");return p.slice(1).join(" ")||l;}

function dayOff(iso){
  const d=new Date(iso+"T00:00:00Z"),n=new Date();
  return Math.round((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())
    -Date.UTC(n.getFullYear(),n.getMonth(),n.getDate()))/86400000);
}
function dayName(o){
  if(o===0) return "Today"; if(o===1) return "Tomorrow";
  const d=new Date();d.setDate(d.getDate()+o);
  return d.toLocaleDateString(undefined,{weekday:"long"});
}
function dayDate(o){
  const d=new Date();d.setDate(d.getDate()+o);
  return d.toLocaleDateString(undefined,{day:"numeric",month:"short"});
}
function kickTime(f){
  if(!f.kickoff) return f.time||"";
  try{return new Date(f.kickoff).toLocaleTimeString([],
    {hour:"2-digit",minute:"2-digit",hour12:false});}catch(e){return f.time||"";}
}
function isUpcoming(f){
  if(!f) return false;
  var t=null;
  if(f.kickoff){t=new Date(f.kickoff).getTime();}
  else if(f.time&&/^\d{1,2}:\d{2}/.test(f.time)){t=new Date(f.date+"T"+f.time+":00Z").getTime();}
  if(t!=null&&!isNaN(t)) return t>Date.now();
  return dayOff(f.date)>=0;
}
function ahead(){return DATA.fixtures.filter(function(f){return isUpcoming(f);});}
/* The day's board keeps every game for that day, including ones already kicked
   off or finished - people come back through the afternoon to see how the day's
   tips are doing, and a board that empties itself as games start is useless for
   that. Past days stay with the results view, which grades them properly. */
function onDay(){
  if(V.off<0) return [];
  return (DATA.fixtures||[]).filter(function(f){return dayOff(f.date)===V.off;});
}
function activeDays(){
  const s={};
  /* Any day from today forward that has fixtures at all. Keyed off the fixture
     list rather than ahead(), so today does not drop off the strip the moment
     its last game kicks off. */
  (DATA.fixtures||[]).forEach(function(f){var o=dayOff(f.date); if(o>=0) s[o]=1;});
  (DATA.results||[]).forEach(function(r){s[dayOff(r.date)]=1;});
  return Object.keys(s).map(Number).sort(function(a,b){return a-b;});
}
/* A game is done when the result is in, or when enough time has passed that it
   cannot still be on. Used to decide whether a day has any football left. */
function fixturePlayed(f){
  if(potdResult(f,f)) return true;
  var t=kickMs(f);
  return t!=null && (Date.now()-t)>=MATCH_LEN_MS;
}
function dayHasUnplayed(off){
  var all=DATA.fixtures||[];
  for(var i=0;i<all.length;i++){
    if(dayOff(all[i].date)===off && !fixturePlayed(all[i])) return true;
  }
  return false;
}
function resultsOnDay(){return (DATA.results||[]).filter(function(r){return dayOff(r.date)===V.off;});}
function best(f){return Math.max(f.home_p,f.draw_p,f.away_p);}

/* ------------------------------------------------------------ categories
   Each one answers a question people actually arrive with, rather than
   making them read every card to find it. */
const CATS=[
  {k:"all",   label:"All games",   test:function(){return true;}},
  {k:"fav",   label:"\u2605 Favourites", test:function(f){return isFav(f.league)||isFav("c:"+countryOf(f.league));}},
  {k:"banker",label:"80%+ picks",  test:function(f){return f.tip_p>=0.80;}},
  {k:"value", label:"\u2726 Better price", test:function(f){return isValue(f);}},
  {k:"win",   label:"Straight win", test:function(f){
     return Math.max(f.home_p,f.away_p)>=0.60;}},
  {k:"o15",   label:"Over 1.5",     test:function(f){return f.o15>=0.80;}},
  {k:"draw",  label:"Draw picks",  test:function(f){return f.draw_watch;}},
  {k:"over",  label:"Over 2.5",    test:function(f){return f.o25>=0.60;}},
  {k:"btts",  label:"Both score",  test:function(f){return f.btts>=0.60;}}
];
function catTest(k){
  const c=CATS.filter(function(x){return x.k===k;})[0];
  return c?c.test:function(){return true;};
}
/* EVERYTHING THE BOARD FILTERS ON EXCEPT THE CATEGORY.
 *
 * The number on a chip has to be what the chip gives you, which is the same
 * rule the day buckets already follow - see test/counts.test.js. renderCats
 * had its own copy of this filter and that copy was missing the search box, so
 * typing a club that plays nowhere today left the chips reading "All games 14"
 * over an empty board. Two copies of a filter is how the counts drift from the
 * thing they count; there is one now, and shown() is it plus the category. */
function baseFiltered(){
  const q=V.q.trim().toLowerCase();
  return onDay().filter(function(f){
    if(V.country&&countryOf(f.league)!==V.country) return false;
    if(V.league&&f.league!==V.league) return false;
    if(q&&(f.league+" "+f.home+" "+f.away).toLowerCase().indexOf(q)<0) return false;
    return true;});
}
function shown(){
  const t=catTest(V.cat);
  return baseFiltered().filter(t);
}

function plainTip(f){
  const t=f.tip;
  if(t==="Home win") return f.home+" to win";
  if(t==="Away win") return f.away+" to win";
  if(t==="Draw") return "A draw";
  if(t==="Both teams score") return "Both teams score";
  if(t==="First half goal") return "A goal in the first half";
  if(t.indexOf("1X")===0) return f.home+" or Draw";
  if(t.indexOf("X2")===0) return f.away+" or Draw";
  if(t.indexOf("12")===0) return "Any team to win";
  if(t.indexOf("Draw or over")===0) return "Draw or over 2.5 goals";
  if(t.indexOf("Draw or both")===0) return "Draw or both teams score";
  if(t.indexOf("Both score and")===0) return "Both score and over 2.5";
  return t;
}
function whyLine(f){
  var hf=f.home_p>f.away_p, strong=hf?f.home:f.away, xg=Math.abs(f.lh-f.la);
  var t=f.tip||"";
  if(t==="Both teams score") return "Both teams have been scoring in most of their games.";
  if(t.indexOf("Both score and")===0) return "Both teams score often and their games see goals.";
  if(t==="Over 2.5"||t.indexOf("Draw or over")===0) return "Their recent games have had plenty of goals.";
  if(t==="Under 2.5") return "Both teams have been in low-scoring games lately.";
  if(t==="First half goal") return "Goals tend to come early in their matches.";
  if(t==="Draw") return "The two sides look evenly matched.";
  var form=hf?f.form_home:f.form_away, wins=form?form.filter(function(x){return x==="W";}).length:0;
  if(wins>=3) return esc(strong)+" have won "+wins+" of their last "+form.length+".";
  if(xg>=0.5) return esc(strong)+" are the stronger side and expected to score more.";
  return esc(strong)+" have the edge on recent form.";
}
function tipCode(f){var t=f.tip||"";if(t==="Home win")return"1";if(t==="Away win")return"2";if(t==="Draw")return"X";if(t==="Both teams score")return"GG";if(t==="Over 2.5")return"OVER_2.5";if(t==="Over 1.5")return"OVER_1.5";if(t.indexOf("1X")===0)return"1X";if(t.indexOf("X2")===0)return"X2";if(t.indexOf("12")===0)return"12";return null;}
function edgeOf(f){var c=tipCode(f);if(!c)return null;var o=f.sportyOdds&&f.sportyOdds[c];if(!o||o<=1.01)return null;return f.tip_p-1/o;}
function isValue(f){var e=edgeOf(f);return e!=null&&e>=0.05;}
function _devig3(o1,ox,o2){var a=1/o1,b=1/ox,c=1/o2,s=a+b+c;return (s>0)?[a/s,b/s,c/s]:null;}
function refineTip(f){
  if(!f||f._refined) return; f._refined=1;
  var t=f.tip||"";
  if(t.indexOf("12")===0){
    var hp=f.home_p||0, ap=f.away_p||0, edge=Math.abs(hp-ap), homeFav=hp>=ap;
    var clear = edge>=0.15 || (homeFav && hp>=0.50) || (!homeFav && ap>=0.48);
    if(clear) f.tip = homeFav ? "1X" : "X2";
  }
  /* A double-chance headline must show the same % as its row in the expanded
     card (dc1x/dcx2). Otherwise the uncertainty-shrunk headline (e.g. 69%) and
     the raw market row (52%+26% = 78%) disagree for the identical bet. */
  if((f.tip||"").indexOf("1X")===0 && f.dc1x!=null) f.tip_p=f.dc1x;
  else if((f.tip||"").indexOf("X2")===0 && f.dcx2!=null) f.tip_p=f.dcx2;
}
/* HOW HARD TO TRUST THE MARKET OVER OURSELVES, and it is not a constant.
   Measured across a 394-fixture live board, our probability for the favourite
   against the de-vigged book price, AFTER the flat 30% blend that used to be
   the whole rule:

     book says fav is   n     we say    gap    home fav   away fav
        40-50%         150     42.2%    -2.3      -0.9       -6.1
        50-60%          96     47.5%    -6.7      -5.2      -11.5
        60-70%          49     53.5%   -11.4      -9.8      -17.1
        70-80%          21     59.9%   -14.4     -11.3      -18.5
        80%+             5     65.8%   -16.5     -16.5         -

   The model compresses toward the middle: it will not say anyone is a strong
   favourite. Where the book says 82% it says 66%, and it is worse for AWAY
   favourites at every level. That is the signature of ratings shrunk toward a
   league mean, and it is not a small effect - it is the reason no big team
   ever reached a wizard ticket. Reported as: "im not even seeing outright of
   Real madrid and big teams on wizard". Ipswich v Liverpool: the book prices
   Liverpool at 1.54, about 65%; we said 41%; Ipswich-to-score sat at 81%, and
   the builder takes the highest probability in the band, so 81% beat 41%
   every time. The outright was never excluded - it just could not compete
   with a number we had priced too low.

   A FLAT WEIGHT CANNOT FIX THIS, because the error is not flat. Thirty per
   cent of a two-point disagreement is noise; thirty per cent of a twenty-point
   one leaves fourteen points standing. So the weight scales with the size of
   the disagreement: small gaps are left almost alone - that is where a model
   is allowed to have an opinion, and where "Better price" lives - and large
   ones are pulled most of the way to the book, because a large disagreement
   with a well-calibrated market is overwhelmingly our error, not our edge.

   0.30 to 0.75 over a 20-point gap. Both ends are measured rather than
   chosen: 0.30 is what the flat rule already used and leaves the small-gap
   behaviour unchanged, and 20 points is where the observed error tops out. */
var BLEND_MIN=0.30, BLEND_MAX=0.75, BLEND_FULL_GAP=0.20;
function blendWeight(gap){
  var t=Math.min(1, Math.abs(gap)/BLEND_FULL_GAP);
  return BLEND_MIN + (BLEND_MAX-BLEND_MIN)*t;
}
function blendFixture(f){
  var o=f.sportyOdds; if(!o) return; var B=0.30;
  if(o["1"]&&o["X"]&&o["2"]){
    var m=_devig3(o["1"],o["X"],o["2"]);
    if(m){
      /* The largest single-outcome disagreement sets the weight for all three,
         so the three-way stays coherent and still sums to one. Weighing each
         outcome separately would pull them apart and need a renormalise that
         quietly undoes the difference. */
      var B3=blendWeight(Math.max(
        Math.abs(f.home_p-m[0]), Math.abs(f.draw_p-m[1]), Math.abs(f.away_p-m[2])));
      var B=B3;
      f.home_p=f.home_p*(1-B)+m[0]*B; f.draw_p=f.draw_p*(1-B)+m[1]*B; f.away_p=f.away_p*(1-B)+m[2]*B;
      var s=f.home_p+f.draw_p+f.away_p; if(s>0){f.home_p/=s;f.draw_p/=s;f.away_p/=s;}
      f.dc1x=f.home_p+f.draw_p; f.dcx2=f.draw_p+f.away_p; f.dc12=f.home_p+f.away_p; f.anybody=f.dc12;
    }
  }
  function two(ov,un,field){ if(o[ov]&&o[un]){var a=1/o[ov],b=1/o[un],s=a+b; if(s>0) f[field]=f[field]*(1-B)+(a/s)*B;} }
  two("OVER_2.5","UNDER_2.5","o25"); two("OVER_1.5","UNDER_1.5","o15"); two("GG","NG","btts");
  /* THE HEADLINE HAS TO BE CHOSEN AGAIN, NOT JUST REPRICED.
     This is the bug that cost real money. The build picks the tip from the
     model's own numbers; the blend above then moves those numbers toward the
     bookmaker, and that can change WHO THE FAVOURITE IS. The old code read
     the baked tip with tipCode and only refreshed its percentage, so the
     label went on pointing at the side that was no longer favoured and
     faithfully displayed its now-lower number.
     Reported: "Hull or draw at 56%" with Hull on 28% and Aston Villa on 46% -
     when "Villa or draw" was 72%. Same shape on Nice v Le Mans: "Le Mans or
     draw 50%" while Nice were 50% and "Nice or draw" was 75%. Both times the
     WORSE of the two double chances, because it was the right call before the
     blend and nobody asked the question again afterwards. */
  var re=bestTipFrom(kOf(f));
  if(re){
    var flipped=(re.label!==f.tip);
    f.tip=re.label; f.tip_p=re.p;
    /* AND THE SCORELINE HAS TO FOLLOW THE TIP, or we publish a contradiction.
       The build draws the scoreline from the full distribution and keeps only
       cells the tip survives, so the baked pair always agree. Re-choosing the
       tip here broke that agreement the moment it flipped: reported as
       "Everton v Man United - double chance on Man U but you predicted 1-0",
       where 1-0 is an Everton win and the new tip was Man United or draw.
       Both halves were individually right and together they were nonsense. */
    if(flipped) f.score=reconcileScore(f, f.tip);
  }
  var c=tipCode(f);
  if(c){var mp={"1":f.home_p,"2":f.away_p,"X":f.draw_p,"1X":f.dc1x,"X2":f.dcx2,"12":f.dc12,"OVER_2.5":f.o25,"OVER_1.5":f.o15,"GG":f.btts};
    if(mp[c]!=null) f.tip_p=mp[c];}
  f.blended=true;
}
/* A SCORELINE THE NEW TIP CAN SURVIVE.
 *
 * The build picks its scoreline by filtering the full distribution down to
 * cells the tip does not lose on, then drawing from what is left - so a baked
 * tip and a baked score always agree. The payload does not carry that
 * distribution, only the two expected-goal figures, so this rebuilds the
 * agreement from those when the tip changes underneath it.
 *
 * Three steps, cheapest first, and the order is the point:
 *
 *   1. Keep the baked score if the new tip already survives it. Most flips are
 *      1X to X2 on a scoreline like 1-1, which both tips accept, so nothing
 *      moves and the reader sees no churn.
 *   2. Otherwise MIRROR it. A 1X flipping to X2 is the model changing its mind
 *      about which side is favoured, not about the shape of the game, and
 *      "Everton 1-0" becoming "Man United 1-0" says exactly that. It also
 *      always works for that flip, which is the common one.
 *   3. Only if neither holds, pick the likeliest cell the tip survives, under
 *      the model's own expected goals. Last because it is the one that can
 *      change the character of the prediction.
 *
 * Deliberately NOT the argmax in the general case: the build measured that
 * publishing the single likeliest cell gives 1-1 on 91% of the card, which is
 * why it samples instead. Step 3 only runs for the handful of flips the first
 * two cannot settle, so it cannot flatten the board.
 */
function scoreSurvives(label, s){
  var m=/^(\d+)\s*-\s*(\d+)$/.exec(String(s == null ? "" : s).trim());
  if(!m) return false;
  /* "unknown" is not a failure - a first-half market places no constraint on a
     full-time score. Matches the build's `gradeLabel(...) !== false`. */
  return tipEval({tip:label})(+m[1], +m[2]) !== "lose";
}
function mirrorScore(s){
  var m=/^(\d+)\s*-\s*(\d+)$/.exec(String(s == null ? "" : s).trim());
  return m ? (m[2]+"-"+m[1]) : null;
}
function reconcileScore(f, label){
  var cur=f && f.score;
  if(scoreSurvives(label, cur)) return cur;
  var mir=mirrorScore(cur);
  if(mir && scoreSurvives(label, mir)) return mir;
  var lh=+f.lh, la=+f.la;
  if(!isFinite(lh)||lh<=0) lh=1.3;
  if(!isFinite(la)||la<=0) la=1.1;
  function pois(k, lam){
    var p=Math.exp(-lam), t=p;
    for(var i=1;i<=k;i++){ t*=lam/i; p=t; }
    return p;
  }
  var best=cur, bp=-1;
  for(var h=0;h<=5;h++) for(var a=0;a<=5;a++){
    var s=h+"-"+a;
    if(!scoreSurvives(label, s)) continue;
    var p=pois(h,lh)*pois(a,la);
    if(p>bp){ bp=p; best=s; }
  }
  return best;
}
/* The fixture's probabilities under the names lib/model.js uses, so the two
   implementations of the choice below take byte-identical input. */
function kOf(f){
  /* cross_tier is only written when the build found one - `cross_tier:
     crossTier ? n : undefined` - so its presence IS the flag, and reading it
     as a boolean is what keeps the 0.72 Over-1.5 bar in step with the build. */
  /* cross_country the same way - written only when the tie crosses a border,
     so its presence is the flag. Without it the browser would re-derive a
     match result on a Champions League game the build deliberately published
     as a goals call, and the reader would see the card contradict itself. */
  return {home:f.home_p, draw:f.draw_p, away:f.away_p,
          o15:f.o15, dc1x:f.dc1x, dcx2:f.dcx2,
          crossTier:(f.cross_tier!=null),
          crossCountry:(f.cross_country!=null)};
}
/* A LINE-FOR-LINE MIRROR OF bestTip IN lib/model.js, and it has to stay one.
   Blending only happens in the browser - the bookmaker's odds arrive after the
   page loads - so the build cannot make this call and the client has to. That
   means the same rule lives in two places, which is exactly the thing that has
   bitten this codebase before: "it works for me" is worthless when two paths
   are not the same code. So test/tipparity.test.js lifts BOTH functions out of
   their files and runs them over a grid of probability vectors, asserting they
   agree on every one. Change either and that test fails until you change both. */
function bestTipFrom(k){
  if(!k||k.home==null||k.draw==null||k.away==null||k.dc1x==null||k.dcx2==null) return null;
  var cands=[
    {label:"Home win", p:k.home},
    {label:"Draw", p:k.draw},
    {label:"Away win", p:k.away}
  ];
  var o15Bar=k.crossTier?0.72:0.80;
  if(k.o15>=o15Bar) cands.push({label:"Over 1.5", p:k.o15});
  /* Across a border: goals or nothing. See the long note in lib/model.js -
     the country gap is imported rather than fitted, and it moves who wins far
     more than it moves how many goals get scored. */
  if(k.crossCountry){
    return k.o15>=o15Bar ? {label:"Over 1.5", p:k.o15} : null;
  }
  var outright=Math.max(k.home,k.draw,k.away);
  var dc=[
    {label:"1X, home or draw", p:k.dc1x},
    {label:"X2, draw or away", p:k.dcx2}
  ].sort(function(a,b){return b.p-a.p;})[0];
  if(dc.p-outright>0.14) cands.push(dc);
  var top=cands.sort(function(a,b){return b.p-a.p;})[0];
  if(k.home>=0.55 && top.label==="1X, home or draw") top={label:"Home win", p:k.home};
  if(k.crossTier && k.o15>=o15Bar &&
     (top.label==="Home win"||top.label==="Away win") &&
     top.p < k.o15+0.06){
    top={label:"Over 1.5", p:k.o15};
  }
  return top;
}
function valPill(f){return isValue(f)?"<span class='pill value'>\u2726 Better price</span>":"";}
function valMark(f){return isValue(f)?"<span class='vmark' title='Better price - our odds beat SportyBet'>\u2726 Better price</span>":"";}

/* -------------------------------------------------------- pick of the day
   Chosen by confidence, then explained. A pick with no reasoning is just a
   number, and numbers without reasons are what every tipster site sells. */
function allOnDay(off){return (DATA.fixtures||[]).filter(function(f){return dayOff(f.date)===off;});}
/* Locked Pick of the Day: one game chosen per 24h fixture day. Once set it does
   not change - not when odds blend, not when the game kicks off. It stays shown
   with its result (won/lost) until the next day's fixtures take over. Stored per
   date in localStorage so a reload shows the same pick. */
function potdResult(pick,f){
  // 1) server-graded result (most reliable)
  var nh=normTeam(pick.home), na=normTeam(pick.away);
  var r=(DATA.results||[]).filter(function(x){
    return x.date===pick.date && normTeam(x.home)===nh && normTeam(x.away)===na;})[0];
  if(r) return {hg:r.hg,ag:r.ag,won:!!r.hit,push:false};
  // 2) fixture enriched with an actual full-time score
  if(f && f.hg!=null && f.ag!=null){
    var v=tipEval(f)(f.hg,f.ag);
    /* Ungradeable is not a result. Returning one here would print "Miss"
       against a first-half tip we simply cannot settle - better to fall
       through to "played, result soon" and let the next build say. */
    if(v==="unknown") return null;
    return {hg:f.hg,ag:f.ag,won:v==="win",push:false};
  }
  return null;
}
/* A women's, youth or reserve side is a different team from the first XI that
   shares its name. Without this, "Paris Saint-Germain W" normalises to
   "paris w", which contains "paris" - a 1.8 substring score against "Paris SG". */
function teamTag(s){
  var t=" "+(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ")+" ";
  if(/ (w|women|womens|femenino|feminin|feminine|ladies) /.test(t)) return "w";
  var u=t.match(/ u(15|16|17|18|19|20|21|23) /); if(u) return "u"+u[1];
  if(/ (ii|iii|b|reserve|reserves|youth|academy|jr|juniors) /.test(t)) return "res";
  return "";
}
/* Pair a fixture with the live-feed entry for the SAME game.
   Both sides must clear a floor of their own. A combined threshold alone lets
   one strong side carry the match: "Paris SG" scored 1.8 against
   "Paris Saint-Germain W" while the home side matched nothing, which cleared
   1.3 and put a LIVE badge on a fixture two days out. attachEventIds has
   required a per-side floor all along - this is the same rule. */
/* THE SAME MARKER, WHEN IT IS ON THE COMPETITION RATHER THAN THE CLUB.
   Reported twice: a Galatasaray U19 game in September, and Gaziantep FK v
   Fenerbahce today - the live feed carried
   `league: "Turkiye Amateur U19 PAF Ligi"` with team names written plainly as
   "Gaziantep FK" and "Fenerbahce". teamTag reads the TEAM, so both sides
   tagged senior, both cleared 0.6, and a youth match's score was bound to the
   Super Lig fixture.
   A youth or reserve league says so in its own name, so read that too and make
   the two sides agree. Our own board would carry the same marker if we ever
   listed such a competition, so a genuine U19 fixture still pairs with its own
   live entry. */
function leagueTag(s){
  var t=" "+(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ")+" ";
  if(/ (w|women|womens|feminin|feminine|femenino|ladies) /.test(t)) return "w";
  var u=t.match(/ u(15|16|17|18|19|20|21|23) /); if(u) return "u"+u[1];
  if(/ (paf|youth|junior|juniors|academy|reserve|reserves|primavera) /.test(t)) return "res";
  return "";
}
/* The team's own marker wins - "Fenerbahce U19" in a league with no marker is
   still a youth side - and the league answers when the team is silent. */
function ageTag(team,league){ return teamTag(team)||leagueTag(league); }
/* THE CASE NO MARKER CATCHES: a second string with a plain name, in a
   competition with a plain name. Both tags come back empty and honestly so -
   nothing in either string says youth or reserve - and the two names still
   belong to different teams.
   The competition itself answers that, and both sides already carry one. Two
   competitions plainly disagree when neither carries a word the other does:
   "Turkey Super Lig" and "Turkiye Amateur U19 PAF Ligi" share nothing, while
   "England Premier League" and "Premier League" share two.
   Deliberately weak. Sharing ONE word is enough, so the same country's league
   and cup still agree - those are the same clubs and the same feed, and the
   clock below is what separates them. This only has to catch a competition
   from somewhere else entirely, which is what every wrong pairing so far has
   actually been. An empty string on either side means we cannot tell, which
   is not the same as a disagreement, so it allows. */
function compTokens(s){
  return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()
    .split(" ").filter(function(w){ return w.length>=3; });
}
function compAgrees(a,b){
  var ta=compTokens(a), tb=compTokens(b);
  if(!ta.length||!tb.length) return true;
  return ta.some(function(x){
    return tb.some(function(y){
      /* Same prefix rule the team names use: "Superliga" answers "Superliga",
         and a four-character stem is long enough not to be a coincidence. */
      return x===y||(x.length>=4&&y.length>=4&&(x.indexOf(y)===0||y.indexOf(x)===0));
    });
  });
}
/* AND THE CLOCK, WHICH THIS FUNCTION NEVER ASKED ABOUT.
   liveForFixture checks it and noteLiveSeen does not, so the one caller that
   WRITES - it records the last score seen and saves it - was the one with no
   guard at all. A fixture days from kickoff could be paired with a game in
   play and have that game's score written against it. The per-side floor and
   the tags made it unlikely; nothing made it impossible.
   The check belongs here, where both callers pass. A fixture whose kickoff we
   cannot read is allowed through: unknown is not a disagreement, and that is
   the state liveForFixture already refuses on its own. */
function couldBeOn(f){
  var t=kickMs(f);
  if(t==null) return true;
  var age=Date.now()-t;
  return age>=0&&age<=LIVE_WINDOW_MS;
}
function liveMatchFor(f){
  if(!f||typeof LIVE==="undefined"||!LIVE||!LIVE.matches) return null;
  if(!couldBeOn(f)) return null;
  var best=null,bs=0;
  LIVE.matches.forEach(function(m){
    if(ageTag(m.home,m.league)!==ageTag(f.home,f.league)||
       ageTag(m.away,m.league)!==ageTag(f.away,f.league)) return;
    if(!compAgrees(f.league,m.league)) return;
    var sh=simTeams(f.home,m.home), sa=simTeams(f.away,m.away);
    if(sh<0.6||sa<0.6) return;
    var s=sh+sa; if(s>bs){bs=s;best=m;}
  });
  return bs>=1.3?best:null;
}
/* Kickoff in ms, from whichever field the fixture carries. */
function kickMs(f){
  if(!f) return null;
  var t=null;
  if(f.kickoff) t=new Date(f.kickoff).getTime();
  else if(f.time&&/^\d{1,2}:\d{2}/.test(f.time)) t=new Date(f.date+"T"+f.time+":00Z").getTime();
  return (t==null||isNaN(t))?null:t;
}
/* The live entry for a fixture, if that fixture could actually be on now.
   The clock is checked as well as the names: a game cannot be in play before
   its own kickoff, and is not still in play many hours after it. */
const LIVE_WINDOW_MS=4.5*3600*1000;
/* Ninety minutes, half time and stoppage, with room to spare. Past this a
   game without a score has been played, not merely started. */
/* Long enough that a match cannot still be on: 45 + 15 + 45 is 105 minutes,
   and generous stoppage in both halves takes a slow game to about 120. The old
   value was 135, which is a quarter of an hour past the point where anything
   is still being played, and for that quarter hour a finished match sat on the
   page as "Started" with a pulsing live dot. */
const MATCH_LEN_MS=2*3600*1000;

/* Fixtures this page has actually watched being played.
   The clock above is a guess; this is a fact. The live feed drops a match the
   moment it ends, so a fixture we saw in the feed and can no longer find has
   finished - no waiting for a threshold, no inferring from kick-off. It only
   knows about matches seen since the page was opened, which is why the clock
   stays as the fallback for anyone arriving after the whistle. */
var SEEN_LIVE={};
/* The last score each fixture was showing while it was still in the feed.
   The feed has no full time: a match is there, and then it is not. So the
   final score is simply the last one we saw before it went - which is only
   knowable if somebody wrote it down while it was still there. */
var LIVE_LAST={};
/* Kept across reloads. Without this the score vanished on refresh, which is
   exactly what happened: watched to full time, on screen for hours, gone the
   moment the page was reloaded, and never there at all for anyone arriving
   later.
   Only the three fields anything reads are stored. The entry also carries the
   whole fixture object, which is never read back and has no business in
   storage. Stamped with the day so nothing accumulates: by the next day the
   build has baked the real score and this is dead weight. */
var LIVE_LAST_KEY="sw.livelast";
function saveLiveLast(){
  try{
    var day=new Date().toISOString().slice(0,10), out={day:day,at:{}};
    for(var k in LIVE_LAST){ var v=LIVE_LAST[k];
      if(v&&v.hg!=null&&v.ag!=null) out.at[k]={hg:v.hg,ag:v.ag,minute:v.minute||0}; }
    localStorage.setItem(LIVE_LAST_KEY,JSON.stringify(out));
  }catch(e){}
}
(function restoreLiveLast(){
  try{
    var raw=localStorage.getItem(LIVE_LAST_KEY); if(!raw) return;
    var o=JSON.parse(raw); if(!o||!o.at) return;
    if(o.day!==new Date().toISOString().slice(0,10)){
      localStorage.removeItem(LIVE_LAST_KEY); return;
    }
    for(var k in o.at){ var v=o.at[k];
      if(v&&v.hg!=null&&v.ag!=null) LIVE_LAST[k]={hg:v.hg,ag:v.ag,minute:v.minute||0}; }
  }catch(e){}
})();
/* Deep enough into the second half that the last score we saw is the one it
   finished on. A match that vanishes at 55 minutes vanished for some other
   reason - a feed hiccup, an abandonment - and recording that as a result
   would put a wrong row in the record. The same bar the server sweep uses,
   for the same reason. */
const LATE_MINUTE=80;
/* Being past the 80th minute is not on its own evidence that a match ended.
   The feed drops a match when it finishes, so "seen late, absent now" is the
   only full-time signal there is - but ONE absent poll looks exactly the same
   whether the match ended, the feed hiccuped, or liveMatchFor simply failed to
   pair the names that time round. With no other condition this fires
   continuously from the 80th minute on.
   Reported 1 Sep 2026: FK Rostov v CSKA Moscow marked lost in My slip while it
   was still playing - our own feed had it at minute 84, status H2, 1-0. A leg
   on over 1.5 or the away side grades as a loss against that, settleSlips
   never revisits a leg once it says win or lose, and one lost leg settles the
   whole accumulator. So a single dropped poll became a permanent wrong answer.
   Two more conditions, both cheap:
   - gone for several consecutive polls, not one
   - and far enough past kick-off that 90 minutes plus a half-time interval
     have actually elapsed. At minute 84 roughly 99 minutes have passed, which
     is short of this, so the Rostov case cannot arise. */
const FT_MIN_ELAPSED_MS=115*60*1000;
const FT_MIN_MISSES=3;
var LIVE_MISS={};
function ftInferable(f,id){
  if((LIVE_MISS[id]||0)<FT_MIN_MISSES) return false;
  var t=kickMs(f);
  return t!=null&&(Date.now()-t)>=FT_MIN_ELAPSED_MS;
}
function noteLiveSeen(){
  try{
    if(!LIVE||!LIVE.matches) return;
    (DATA.fixtures||[]).forEach(function(f){
      var lm=liveMatchFor(f);
      var mid=fid(f);
      /* Only count absences for a match we have actually seen in play. A
         fixture that has never appeared is not missing, it just has not
         started. */
      if(!lm){ if(SEEN_LIVE[mid]) LIVE_MISS[mid]=(LIVE_MISS[mid]||0)+1; return; }
      LIVE_MISS[mid]=0;
      var id=mid;
      SEEN_LIVE[id]=1;
      if(lm.homeScore!=null&&lm.awayScore!=null){
        LIVE_LAST[id]={hg:lm.homeScore,ag:lm.awayScore,
          minute:(lm.minute!=null?lm.minute:0),f:f};
      }
    });
    saveLiveLast();
  }catch(e){}
}
function liveForFixture(f){
  var t=kickMs(f);
  if(t==null) return null;
  var age=Date.now()-t;
  if(age<0||age>LIVE_WINDOW_MS) return null;
  return liveMatchFor(f);
}
/* Where a fixture stands: null when it has not kicked off, otherwise in play or
   settled. A server-graded result wins over the live feed - it is the one that
   decides the record - then a feed entry reporting full time, then a score in
   play. */
function fixtureState(f){
  var r=potdResult(f,f);
  if(r) return {kind:"ft",hg:r.hg,ag:r.ag,won:r.won,push:r.push};
  var lm=liveForFixture(f);
  if(lm&&lm.homeScore!=null&&lm.awayScore!=null){
    var ev=tipEval(f)(lm.homeScore,lm.awayScore);
    if(FT_RE.test(lm.status||""))
      return {kind:"ft",hg:lm.homeScore,ag:lm.awayScore,won:ev==="win",push:ev==="unknown"};
    return {kind:"live",hg:lm.homeScore,ag:lm.awayScore,won:ev==="win",minute:lm.minute||""};
  }
  /* Kicked off, but no score to be had. There is a real gap between the two
     sources: the live feed drops a game the moment it finishes, and the
     backend only grades it on the next build. In between, a game that has been
     played looked exactly like one that had not - same tip, same confidence,
     nothing to say it was over. Say which it is, even with no score. */
  /* Watched to a late minute and now gone from the feed: that last score is
     the final one, so it is a full-time result like any other and gets graded
     as one. This is the only full time this feed will ever give us - it drops
     a match rather than marking it finished. */
  var last=LIVE_LAST[fid(f)];
  if(last&&last.minute>=LATE_MINUTE&&ftInferable(f,fid(f))){
    var lev=tipEval(f)(last.hg,last.ag);
    /* Flagged as inferred. It is good enough to show a result on the board,
       and deliberately NOT good enough to settle somebody's slip: this is a
       guess from an absence, and finalScoreFor refuses it for that reason. */
    return {kind:"ft",inferred:true,hg:last.hg,ag:last.ag,won:lev==="win",push:lev==="unknown"};
  }
  if(SEEN_LIVE[fid(f)]) return {kind:"played"};
  var t=kickMs(f);
  if(t!=null){
    var age=Date.now()-t;
    if(age>=MATCH_LEN_MS) return {kind:"played"};
    if(age>=0) return {kind:"started"};
  }
  return null;
}
/* Time until kickoff, once it is close enough to matter.
   A fixture list with only clock times reads as a timetable; a card that says
   "in 40m" reads as something happening. The cutoff is six hours because
   beyond that the number is just the clock time restated, and the last hour
   turns amber - not to hurry anybody, but because that is genuinely when a
   slip stops being bookable. */
const SOON_MS=6*3600*1000;
function kickCountdown(f){
  var t=kickMs(f); if(!t) return "";
  var d=t-Date.now();
  if(d<=0||d>SOON_MS) return "";
  var mins=Math.round(d/60000);
  var txt=mins>=60 ? (Math.floor(mins/60)+"h "+(mins%60?(mins%60)+"m":"")).trim()
                   : mins+"m";
  return "<span class='fx-soon"+(mins<=60?" near":"")+"'>in "+txt+"</span>";
}
function statusBadge(f){
  /* Two things belong beside a prediction: how long until it starts, and how
     it finished. Everything between those was the live pill, and it cost more
     than it paid. It claimed a match was live after the final whistle, it
     showed a pulsing dot on a game that was over, it published half-time
     scores as current ones, and when it had nothing to say it said "Played,
     result soon" - twenty characters that pushed the team names out of the
     card to promise something the page could not deliver.
     Live football has its own tab. Here we say what we predicted and what
     happened, and while a match is in play we say nothing at all, because
     nothing is what we reliably know.

     NOTHING ON THE DAY ITSELF, and the verdict comes from the backend or not
     at all. Reported 3 Sep 2026: a game that finished 0-0 was shown as a Hit.
     This asked fixtureState, which reaches a full-time verdict three ways, and
     only the first of them is a score anybody stands behind:
       1. potdResult  - the graded results feed, or a score baked into the
          payload by the build. Server truth.
       2. the live feed saying FT - name-matched to our fixture, and the pairing
          is the same one that once put a LIVE badge on a game two days out.
       3. INFERRED FROM ABSENCE - seen past the 80th minute, then gone for three
          polls. The last score we happened to see is assumed to be the final
          one, so a stale or mispaired score becomes a printed verdict.
     finalScoreFor already refuses 3 for settling a slip, in as many words: a
     guess from an absence is not good enough to decide somebody's ticket. It
     was never good enough to print on the board either.
     So the board waits. While a day is still running there is no verdict of any
     kind, only the countdown; once the day is behind us the backend has graded
     it and the whole day's results appear together. A reader comes back the
     next morning to a page that is either silent or right, which is the only
     pair of states worth offering. */
  if(dayOff(f.date)>=0) return kickCountdown(f);
  var r=potdResult(f,f);
  if(!r || r.hg==null) return "";
  return "<span class='fx-st "+(r.push?"fx-push":(r.won?"fx-hit":"fx-miss"))+"'>"+
    r.hg+"-"+r.ag+" "+(r.push?"Void":(r.won?"Hit":"Miss"))+"</span>";
}
/* Wrapper so the 30s live poll can repaint the badge in place, rather than
   re-rendering the board and collapsing whatever card is open. */
function statusSlot(f){
  return "<span class='fx-slot' data-fxst='"+fid(f)+"'>"+statusBadge(f)+"</span>";
}
function fixtureById(id){
  var all=DATA.fixtures||[];
  for(var i=0;i<all.length;i++) if(fid(all[i])===id) return all[i];
  return null;
}
function refreshFixtureStates(){
  var slots=document.querySelectorAll(".fx-slot[data-fxst]");
  for(var i=0;i<slots.length;i++){
    var f=fixtureById(slots[i].getAttribute("data-fxst"));
    if(!f) continue;
    var html=statusBadge(f);
    if(slots[i].innerHTML!==html) slots[i].innerHTML=html;
  }
}
/* Countdowns ride the live-score poll, which is right while it is running and
   wrong the moment that feed has a bad minute - a frozen "in 40m" is worse
   than no countdown at all. Their own slow timer costs a handful of string
   comparisons and keeps them honest when nothing else is happening. */
setInterval(function(){
  if(document.hidden) return;
  try{ refreshFixtureStates(); }catch(e){}
},60000);
/* Keep every lock from today forward, drop the ones already played out.
   This used to keep only the date just rendered, which was fine while the card
   never left today - but now that it follows the board, rendering tomorrow
   would delete today's lock and rendering today would delete tomorrow's, so
   flipping between them re-picked both every time. A day that has been and
   gone is the only dead lock. */
function prunePotdKeys(){
  try{ for(var i=localStorage.length-1;i>=0;i--){ var k=localStorage.key(i);
    if(!k||k.indexOf("sw.potd.")!==0) continue;
    var d=k.slice(8);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||dayOff(d)<0) localStorage.removeItem(k); } }catch(e){}
}
/* Which board row is the Pick of the day, so it can be tagged in the list. */
var POTD_ID="";
function renderPotd(){
  /* The card follows the day you are looking at: on tomorrow's board it is
     tomorrow's pick, named as such by the meta line below. It used to pin
     itself to today so it could hold a live score and a result through the
     evening, but that left the card contradicting the board around it - a
     "pick of the day" for a day you are not on. Each day's pick is locked
     separately, so today's still holds its score and grade when you come back
     to it. Falls back to today only when the chosen day has no card at all. */
  const day=allOnDay(V.off).length ? allOnDay(V.off) : allOnDay(0);
  if(!day.length){$("potd").innerHTML="";POTD_ID="";return;}
  const dateStr=day[0].date, lockKey="sw.potd."+dateStr;
  // Reuse the locked pick for this date; only pick fresh if none stored yet.
  let lock=null; try{lock=JSON.parse(localStorage.getItem(lockKey)||"null");}catch(e){}
  let top=null;
  /* Look the lock up across the WHOLE payload, not just this day's rows.
     The board is rebaked on every deploy as well as by the daily cron, and a
     rebake can drop or re-date a row. Searching only `day` meant the lock
     silently fell through to a fresh pick whenever that happened - which is
     how the card jumped off a game that had already been played and onto
     another one, losing the result it was supposed to be holding. The lock is
     the promise; only a fixture that has genuinely left the payload breaks
     it. */
  /* The build's own pick wins when it has one. Deciding this per browser meant
     two people never had to be looking at the same "pick of the day", and a
     cleared cache re-rolled it - for the one call this site puts its name to.
     It is chosen once in lib/build.js and carried forward across rebakes, so
     the localStorage lock below is now only the fallback for a payload built
     before this existed. */
  const baked=(DATA.potd&&DATA.potd.date===dateStr)?DATA.potd:null;
  if(baked&&baked.id){
    top=day.filter(function(f){return fid(f)===baked.id;})[0]
      || (DATA.fixtures||[]).filter(function(f){return fid(f)===baked.id;})[0]
      || null;
    /* Mirror it into the lock so a later payload that somehow lacks one still
       shows the same game rather than re-picking. */
    if(top&&(!lock||lock.id!==baked.id)){
      try{localStorage.setItem(lockKey,JSON.stringify(baked));}catch(e){}
    }
  }
  if(!top&&lock&&lock.id){
    top=day.filter(function(f){return fid(f)===lock.id;})[0]
      || (DATA.fixtures||[]).filter(function(f){return fid(f)===lock.id;})[0]
      || null;
  }
  if(!top){
    // deterministic: highest confidence, tie-break by fixture id so every device agrees
    /* Same reasoning as the slip of the day: pick of the day is the one call
       this site puts its name to, so it is not made from an assumed number.
       Only if the whole card is cross-division does one become eligible. */
    var pool=day.filter(function(f){return !f.cross_tier;});
    if(!pool.length) pool=day;
    /* A pick of the day has to still be playable when it is picked. The
       fixture day is a calendar date in UTC, so an MLS game at 23:30 UTC is
       half past midnight here - already played by breakfast, and it was
       ranking second on the board. Calling a game we could have watched last
       night "the pick of the day" is not a prediction. Kept as a preference
       rather than a hard filter so a card with nothing left to come still
       shows something. */
    var upcoming=pool.filter(function(f){return notStarted(f);});
    if(upcoming.length) pool=upcoming;
    /* Thin support is still its own demerit - the headline is the last place a
       number nobody has earned should lead the page - and league quality is
       carried by tierScore rather than by a continent. */
    var potdDemerit=function(f){ return (f.thin?1:0); };
    top=pool.slice().sort(function(a,b){
      return potdDemerit(a)-potdDemerit(b) ||
        (tierScore(b.tip_p,b)-tierScore(a.tip_p,a)) || (fid(a)<fid(b)?-1:1);
    })[0];
    try{localStorage.setItem(lockKey,JSON.stringify({id:fid(top),home:top.home,away:top.away,date:top.date}));}catch(e){}
    prunePotdKeys();
  }
  /* Tell the board which row is this pick, so it can be tagged rather than read
     as a second, unrelated live game. render() calls renderPotd() before it
     builds the rows, so this is set by the time they need it. */
  POTD_ID=fid(top);

  /* Live-feed match for this pick gives near real-time score; falls back to the
     backend result once the live feed drops a finished game. Rules:
       - upcoming            -> show the tip + confidence (normal)
       - in play             -> mirror the live score (green if the tip is landing)
       - full time & WON     -> celebrate: score + "Won"
       - full time & LOST    -> leave the tip exactly as-is (never label a loss) */
  /* Shares the strict matcher: both sides must clear a floor, tags must agree,
     and the pick's own kickoff must have arrived. The loose version here used
     to let one strong side carry the match. */
  function findLive(){ return liveForFixture(top); }
  const FTre=/(ft|finished|ended|aet|after et|pen|ap)/i;
  let statusChip, bigHTML, stateClass="", metaExtra="", eyebrowPast=false, handled=false;
  const lm=findLive();
  if(lm && lm.homeScore!=null && lm.awayScore!=null){
    const ev=tipEval(top)(lm.homeScore,lm.awayScore);
    if(FTre.test(lm.status||"")){
      if(ev==="win"){                     // celebrate wins only; losses fall through
        stateClass="potd-won";
        statusChip="<span class='potd-status potd-won'>✔ Won</span>";
        bigHTML="<div class='big potd-score'>"+lm.homeScore+"<em>-</em>"+lm.awayScore+"</div>";
        metaExtra=" &middot; Full time"; eyebrowPast=true; handled=true;
      }
    } else {                               // in play - mirror the live score
      stateClass=(ev==="win")?"potd-live potd-live-good":"potd-live";
      statusChip="<span class='potd-status potd-live'><span class='ld'></span>LIVE"+(lm.minute?" "+esc(String(lm.minute))+"’":"")+"</span>";
      bigHTML="<div class='big potd-score'>"+lm.homeScore+"<em>-</em>"+lm.awayScore+"</div>";
      metaExtra=" &middot; "+(ev==="win"?"Tip landing":"In play");
      handled=true;
    }
  }
  if(!handled){
    const r=potdResult(top,top);
    if(r && r.won){                        // backend confirms a win
      stateClass="potd-won";
      statusChip="<span class='potd-status potd-won'>✔ Won</span>";
      bigHTML="<div class='big potd-score'>"+r.hg+"<em>-</em>"+r.ag+"</div>";
      metaExtra=" &middot; Full time"; eyebrowPast=true;
    } else {                               // upcoming, or lost -> leave the tip as-is
      statusChip="<span class='k'>"+esc(compOf(top.league))+"</span>";
      bigHTML="<div class='big num'>"+P0(top.tip_p)+"<em>%</em></div>";
    }
  }

  const reasons=[];
  const hf=top.home_p>top.away_p;
  const strong=hf?top.home:top.away;
  const xgLead=Math.abs(top.lh-top.la);
  if(xgLead>=0.5)
    reasons.push("<b>"+esc(strong)+"</b> are expected to score "+xgLead.toFixed(1)+" more goals than their opponent");
  const form=hf?top.form_home:top.form_away;
  if(form&&form.length){
    const w=form.filter(function(x){return x==="W";}).length;
    if(w>=3) reasons.push("<b>"+esc(strong)+"</b> have won "+w+" of their last "+form.length);
  }
  /* The goals line, said so it backs the tip instead of arguing with it.
     Bayern v Stuttgart went out as "Over 1.5 - 90%" with a bullet underneath
     reading "Goals look likely, over 2.5 at 75%": a second, lower number at a
     different bar, directly under the headline, which reads as a correction
     rather than as evidence.
     So when the call is itself a goals line, the only thing worth adding is
     the bar above it - clearing a higher one is a reason to trust the lower.
     When the call is at or above that bar, or is an under, the headline has
     already said it and there is nothing to add. */
  var _ov=/^Over\s*([\d.]+)/i.exec(top.tip||"");
  var _un=/^Under\s*([\d.]+)/i.exec(top.tip||"");
  if(_ov){
    if(parseFloat(_ov[1])<2.5 && top.o25>=0.6)
      reasons.push("Room to spare: even <b>over 2.5</b> lands "+P0(top.o25)+"% of the time");
  } else if(!_un){
    if(top.o25>=0.6) reasons.push("Goals look likely, over 2.5 at <b>"+P0(top.o25)+"%</b>");
    else if((1-top.o25)>=0.6) reasons.push("A tight game, under 2.5 at <b>"+P0(1-top.o25)+"%</b>");
  }
  /* "The strongest call on the day's card" is only true while it is. The pick
     is locked for the day but the board is refitted underneath it, so another
     fixture can overtake it by the evening - and the card would go on claiming
     a rank it no longer holds. Say the number either way; claim the rank only
     when it is still earned. */
  var _stillTop=!(DATA.fixtures||[]).some(function(f){
    return dayOff(f.date)===dayOff(top.date) && !f.cross_tier && f.tip_p>top.tip_p;});
  reasons.push("Our model puts this at <b>"+P0(top.tip_p)+"%</b>"+
    (_stillTop?", the strongest call on the day's card":""));

  $("potd").innerHTML=
    "<section class='potd "+stateClass+"'>"+
      "<div class='potd-top'>"+
        "<svg width='15' height='15' viewBox='0 0 24 24' fill='currentColor'>"+
          "<path d='M12 2l2.4 6.9 7.1.4-5.5 4.6 1.8 7-5.8-4-5.8 4 1.8-7L2.5 9.3l7.1-.4z'/></svg>"+
        "<b>Pick of the day</b>"+statusChip+
      "</div>"+
      "<div class='potd-body'>"+
        "<div class='potd-grid'>"+
          "<div><h2>"+esc(plainTip(top))+"</h2>"+
            "<p class='meta'>"+esc(top.home)+" v "+esc(top.away)+" &middot; "+
              dayName(dayOff(top.date))+" "+esc(kickTime(top))+
              metaExtra+"</p></div>"+
          bigHTML+
        "</div>"+
        "<div class='why'><span class='eyebrow'>Why we like"+(eyebrowPast?"d":"")+" it</span><ul>"+
          reasons.map(function(r){return "<li><span class='dot'></span><span>"+r+"</span></li>";}).join("")+
        "</ul></div>"+
      "</div>"+
    "</section>";
  $("potd").querySelector(".potd").addEventListener("click",function(){
    const el=document.getElementById(fid(top));
    if(!el) return;
    el.classList.add("open","seen");
    el.scrollIntoView({behavior:REDUCED?"auto":"smooth",block:"center"});
  });
  $("potd").querySelector(".potd").style.cursor="pointer";
}

function renderCats(){
  const base=baseFiltered();
  $("cats").innerHTML=CATS.map(function(c){
    const n=base.filter(c.test).length;
    if(!n && c.k!=="all" && c.k!=="fav") return "";
    return "<button class='cat' data-c='"+c.k+"' aria-pressed='"+(V.cat===c.k)+"'"+
      (n?"":" disabled")+">"+c.label+"<span class='n'>"+n+"</span></button>";}).join("");
  $("cats").querySelectorAll(".cat").forEach(function(b){
    b.addEventListener("click",function(){V.cat=b.dataset.c;render();});});
}

function renderControls(){
  const days=activeDays();
  if(days.length&&days.indexOf(V.off)<0){
    var up=days.filter(function(o){return o>=0;});
    /* Nearest upcoming day, never the busiest one. Today falls out of the list
       the moment its last fixture kicks off, and picking the busiest day then
       lands a Wednesday visitor on Saturday's big card - the wrong day, and a
       tap back to get where they meant to be. days[] is sorted, so up[0] is
       today whenever today still has games to come, and tomorrow otherwise. */
    V.off = up.length ? up[0] : days[days.length-1];
  }
  /* The board follows the football. A day is done when every game on it has
     been played, and once that happens there is nothing left to act on, so it
     moves to the next day that still has some. Holding a finished card is the
     Pick of the Day's job, not the board's.
     Only when the day was chosen for you - paging with the arrows pins it, so
     looking back over today's results is never yanked out from under you. */
  if(!V.dayPicked && V.off>=0 && !dayHasUnplayed(V.off)){
    var nxt=days.filter(function(o){return o>V.off && dayHasUnplayed(o);})[0];
    if(nxt!=null) V.off=nxt;
  }
  const i=days.indexOf(V.off);
  $("dname").textContent=dayName(V.off);
  $("ddate").textContent=dayDate(V.off);
  $("prev").disabled=(i<=0);
  $("next").disabled=(i<0||i>=days.length-1);
  /* Paging pins the day: from here on it is the visitor's choice, not ours. */
  $("prev").onclick=function(){if(i>0){V.off=days[i-1];V.dayPicked=true;V.country="";V.league="";render();}};
  $("next").onclick=function(){if(i<days.length-1){V.off=days[i+1];V.dayPicked=true;V.country="";V.league="";render();}};

  const ps=onDay();
  const byC={};
  ps.forEach(function(f){const c=countryOf(f.league);(byC[c]=byC[c]||new Set()).add(f.league);});
  const countries=Object.keys(byC).sort();
  if(V.country&&countries.indexOf(V.country)<0) V.country="";
  $("country").innerHTML="<option value=''>All countries</option>"+
    countries.map(function(c){
      const n=ps.filter(function(f){return countryOf(f.league)===c;}).length;
      return "<option value=\""+esc(c)+"\""+(V.country===c?" selected":"")+">"+
        esc(c)+" ("+n+")</option>";}).join("");
  const leagues=V.country?Array.from(byC[V.country]).sort()
    :Array.from(new Set(ps.map(function(f){return f.league;}))).sort();
  if(V.league&&leagues.indexOf(V.league)<0) V.league="";
  /* Several countries run a "Serie A", so the bare competition name is
     ambiguous. Prefix the country while the country filter is on "all"; once a
     country is chosen it is already known and repeating it just adds noise. */
  $("league").innerHTML="<option value=''>All leagues</option>"+
    leagues.map(function(l){
      const n=ps.filter(function(f){return f.league===l;}).length;
      const nm=V.country?compOf(l):(countryOf(l)+" \u203a "+compOf(l));
      return "<option value=\""+esc(l)+"\""+(V.league===l?" selected":"")+">"+
        esc(nm)+" ("+n+")</option>";}).join("");
  $("country").onchange=function(){V.country=this.value;V.league="";render();};
  $("league").onchange=function(){V.league=this.value;render();};

  const n=shown().length;
  $("finder-count").textContent=n+" game"+(n===1?"":"s");
  if(V.country||V.league){
    const label=[V.country,V.league?compOf(V.league):""].filter(Boolean).join(" \u203a ");
    $("chosen").innerHTML="<div class='chosen'><b>Showing "+esc(label)+
      "</b><button id='clearf' type='button'>Clear</button></div>";
    $("clearf").addEventListener("click",function(){V.country="";V.league="";render();});
  } else $("chosen").innerHTML="";
}

/* --------------------------------------------------------------- markets */
function opt(name,v,good,code,id){
  if(v==null||isNaN(v)) return "";
  var on=(code&&id)?myslipHas(id,code):false;
  var add=(code&&id)?"<button class='opt-add"+(on?" on":"")+"' data-add='"+id+"' data-code='"+code+"' data-label=\""+name+"\" data-p='"+v.toFixed(3)+"' aria-pressed='"+(on?"true":"false")+"' aria-label=\""+name+" - add to slip\">"+(on?"\u2713":"+")+"</button>":"";
  return "<div class='opt"+(good?" good":"")+(code?" bk":"")+"' style='--w:"+v.toFixed(3)+"'>"+
    "<span class='n'>"+name+"</span><span class='p num'>"+P0(v)+"%</span>"+add+
    "<span class='fill'></span></div>";
}
function countMarkets(f){
  return [f.dc1x,f.dcx2,(f.anybody!=null?f.anybody:f.dc12),f.o15,f.o25,
    (f.o25!=null?1-f.o25:null),f.btts,f.fh_o05,f.btts_o25,f.draw_o25,f.draw_btts]
    .filter(function(v){return v!=null&&!isNaN(v);}).length;
}
function moreHTML(f){
  const noDraw=(f.anybody!=null)?f.anybody:f.dc12;
  const id=fid(f);
  return "<div class='more-pad'>"+
    "<div class='grp'><h3>Who wins</h3><div class='opts'>"+
      opt(esc(f.home)+" to win",f.home_p,f.home_p>=.6,"1",id)+
      opt(esc(f.away)+" to win",f.away_p,f.away_p>=.6,"2",id)+
      opt("Draw",f.draw_p,f.draw_p>=.4,"X",id)+
      opt(esc(f.home)+" or draw",f.dc1x,f.dc1x>=.75,"1X",id)+
      opt(esc(f.away)+" or draw",f.dcx2,f.dcx2>=.75,"X2",id)+
      opt("Any team to win",noDraw,noDraw>=.75,"12",id)+"</div></div>"+
    "<div class='grp'><h3>Goals</h3><div class='opts'>"+
      opt("Over 1.5 goals",f.o15,f.o15>=.75,"OVER_1.5",id)+
      opt("Over 2.5 goals",f.o25,f.o25>=.6,"OVER_2.5",id)+
      opt("Under 2.5 goals",1-f.o25,(1-f.o25)>=.6)+
      opt("Both teams score",f.btts,f.btts>=.6,"GG",id)+
      opt("Goal in 1st half",f.fh_o05,f.fh_o05!=null&&f.fh_o05>=.7,"FH_OVER_0.5",id)+"</div></div>"+
    "<div class='grp'><h3>Combos</h3><div class='opts'>"+
      opt("Both score + over 2.5",f.btts_o25,f.btts_o25!=null&&f.btts_o25>=.55)+
      opt("Draw or over 2.5",f.draw_o25,f.draw_o25!=null&&f.draw_o25>=.7)+
      opt("Draw or both score",f.draw_btts,f.draw_btts!=null&&f.draw_btts>=.7)+
    "</div></div>"+
    "<button class='more-collapse' type='button'>Collapse \u25b4</button></div>";
}
/* form_home / form_away are baked by the nightly build, so a game played today
   is missing from them until tomorrow's rebuild. Overlay the live feed on top:
   while a team is playing we prepend a provisional chip (ringed + breathing),
   and it settles into a normal chip the moment the feed reports full time.
   Match on name only, so the bar is high - 1.8 is exact-or-substring in
   simTeams, anything looser risks pinning another club's result on a team. */
const FT_RE=/(ft|finished|ended|aet|after et|pen|ap)/i;
/* Read the overlay off one of OUR OWN fixtures rather than off the live feed
   directly. Going through the fixture list means the game has to be one we
   actually cover, with a kickoff that has arrived - so a women's or youth tie
   sharing the club's name cannot write into a first-team form strip. */
/* Only fixtures that have actually started can move a form strip, and on a
   normal evening that is a handful out of a couple of hundred. Working it out
   once per render turns the strip lookup from "scan every fixture, twice per
   card" into "scan the few that are in play" - measured, that was the
   difference between 1.5s and a few milliseconds on a full board.
   Nulled whenever the fixtures or the live feed move. */
var FORM_IDX=null;
function formIndexInvalidate(){ FORM_IDX=null; }
function formIndex(){
  if(FORM_IDX) return FORM_IDX;
  var out=[], all=(typeof DATA!=="undefined"&&DATA.fixtures)?DATA.fixtures:[];
  for(var i=0;i<all.length;i++){
    var f=all[i];
    if(teamTag(f.home)||teamTag(f.away)) continue;
    var st=fixtureState(f);
    /* Only a state carrying an actual score can move a form strip. "started"
       and "played" have none, and would turn a W/D/L into NaN. */
    if(st&&st.hg!=null&&st.ag!=null) out.push({f:f,st:st});
  }
  FORM_IDX=out;
  return out;
}
function liveFormFor(team){
  if(!team) return null;
  var idx=formIndex();
  for(var i=0;i<idx.length;i++){
    var f=idx[i].f, st=idx[i].st;
    var isHome=simTeams(team,f.home)>=1.8, isAway=simTeams(team,f.away)>=1.8;
    if(!isHome&&!isAway) continue;
    var gf=isHome?st.hg:st.ag, ga=isHome?st.ag:st.hg;
    return {r:gf>ga?"W":(gf<ga?"L":"D"), prov:st.kind==="live"};
  }
  return null;
}
function formChips(arr,team){
  var live=liveFormFor(team), out="";
  if(live) out+="<i class='"+live.r+(live.prov?" prov":"")+"'>"+live.r+"</i>";
  (arr||[]).slice(0,live?4:5).forEach(function(r){out+="<i class='"+r+"'>"+r+"</i>";});
  return out;
}
function formHTML(arr,team){
  if((!arr||!arr.length)&&!liveFormFor(team)) return "";
  /* Keep the baked form and the team on the node so the 30s live poll can
     repaint just these chips instead of re-rendering (and collapsing) cards. */
  return "<span class='form' data-ft='"+esc(team||"")+"' data-fs='"+
    (arr||[]).slice(0,5).join("")+"'>"+formChips(arr,team)+"</span>";
}
/* Called after every live poll: repaint form strips in place. */
function refreshFormStrips(){
  var nodes=document.querySelectorAll(".form[data-ft]");
  for(var i=0;i<nodes.length;i++){
    var n=nodes[i], team=n.getAttribute("data-ft"),
        base=(n.getAttribute("data-fs")||"").split("");
    var html=formChips(base,team);
    if(n.innerHTML!==html) n.innerHTML=html;
  }
}

function matchHTML(f){
  var _s0=scoreLine(f).split("-"); var _h0=+_s0[0], _a0=+_s0[1];
  /* One split of one certainty - print three numbers that add to a hundred. */
  var _s100=split100([f.home_p,f.draw_p,f.away_p]);
  const hw=_h0>_a0;
  const aw=_a0>_h0;
  const cf=conf(f.tip_p);
  const pills=[];
  var _sc=scoreLine(f).split("-"); var _mgn=Math.abs((+_sc[0])-(+_sc[1]));
  if(f.draw_watch && _mgn<=1) pills.push("<span class='pill draw'>Could be a draw</span>");
  if(f.o25>=0.66) pills.push("<span class='pill goals'>Goals likely</span>");
  var _vb=valPill(f); if(_vb) pills.unshift(_vb);
  /* The featured pick also sits in the board. Tag its row so the score it
     shares with the Pick of the day card reads as the same game, not a second
     one. */
  if(fid(f)===POTD_ID) pills.unshift("<span class='pill potd-tag'>★ Pick</span>");
  return "<article class='m conf-"+cf+"' id='"+fid(f)+"'>"+
    "<button class='m-btn' data-fx='"+fid(f)+"'>"+
      "<span class='m-top'><span class='t'>"+esc(kickTime(f))+"</span>"+statusSlot(f)+pills.join("")+"</span>"+
      "<span class='teams'>"+
        "<span class='tnames'>"+
          "<span class='tn"+(hw?" win":"")+"'>"+
            "<span class='who'><span>"+esc(f.home)+"</span>"+formHTML(f.form_home,f.home)+"</span>"+
            "<span class='g num' title='Goals we expect them to score'>"+
              f.lh.toFixed(1)+"</span></span>"+
          "<span class='tn"+(aw?" win":"")+"'>"+
            "<span class='who'><span>"+esc(f.away)+"</span>"+formHTML(f.form_away,f.away)+"</span>"+
            "<span class='g num' title='Goals we expect them to score'>"+
              f.la.toFixed(1)+"</span></span>"+
        "</span>"+
        "<span class='sc' title='One way this match could end, drawn from our score distribution - not the most likely score'>"+
          "<b class='num'>"+scoreLine(f)+"</b><i>could end</i></span>"+
      "</span>"+
      "<span class='pbar'>"+
        "<i style='flex:"+(f.home_p*100).toFixed(1)+";background:var(--win)'></i>"+
        "<i style='flex:"+(f.draw_p*100).toFixed(1)+";background:var(--grey)'></i>"+
        "<i style='flex:"+(f.away_p*100).toFixed(1)+";background:var(--cream)'></i>"+
      "</span>"+
      "<span class='legend'>"+
        "<b><i style='background:var(--win)'></i>Home "+_s100[0]+"%</b>"+
        "<b><i style='background:var(--grey)'></i>Draw "+_s100[1]+"%</b>"+
        "<b><i style='background:var(--cream)'></i>Away "+_s100[2]+"%</b>"+
      "</span>"+
      "<span class='tipbox'><span class='vdot'></span><span class='k'>Our call</span>"+
        "<span class='v'>"+esc(plainTip(f))+"</span>"+
        "<span class='grade'>"+verdict(f.tip_p)+"</span>"+
        "<span class='cring' style='--v:"+P0(f.tip_p)+"'><b>"+P0(f.tip_p)+"</b></span></span>"+
      "<span class='why'>"+whyLine(f)+"</span>"+
      "<span class='mtoggle'>"+
        "<span class='ls'>See "+countMarkets(f)+" more predictions</span>"+
        "<span class='cv'>&rsaquo;</span></span>"+
    "</button>"+
    (tipCode(f)?"<button class='m-add' data-add='"+fid(f)+"' data-code='"+tipCode(f)+"' data-label=\""+esc(plainTip(f))+"\" data-p='"+f.tip_p.toFixed(3)+"' type='button' aria-pressed='false'><span class='ma-ic'>"+PLUS+"</span> Add to slip</button>":"")+
  "</article>";
}

/* ---------------------------------------------------------- favourites */
const FAV_KEY="formline.favs.v1";
let FAVS={};
try{FAVS=JSON.parse(localStorage.getItem(FAV_KEY)||"{}");}catch(e){FAVS={};}
function isFav(l){return !!FAVS[l];}
function toggleFav(l){
  if(FAVS[l]) delete FAVS[l]; else FAVS[l]=1;
  try{localStorage.setItem(FAV_KEY,JSON.stringify(FAVS));}catch(e){}
  render();
}
const TOP_LEAGUES=["England Premier League","Spain La Liga 1","Italy Serie A",
  "Germany Bundesliga 1","France Ligue 1","Netherlands Eredivisie",
  "Portugal Primeira Liga","England Championship","Turkey Super Lig"];

function leagueBlock(l,games,withFlag){
  const g=games.slice().sort(function(a,b){
    return String(a.kickoff||a.time).localeCompare(String(b.kickoff||b.time));});
  return "<div class='comp'><div class='comp-h'>"+(withFlag?flagFor(countryOf(l)):"")+"<span>"+esc(compOf(l))+"</span>"+
    "<button class='star' data-fav=\""+esc(l)+"\" aria-pressed='"+isFav(l)+
    "' aria-label='Pin league'>"+(isFav(l)?"\u2605":"\u2606")+"</button></div>"+
    "<div class='grid'>"+g.map(matchHTML).join("")+"</div></div>";
}

let io=null;
function observe(){
  if(io) io.disconnect();
  if(REDUCED||!("IntersectionObserver" in window)){
    document.querySelectorAll(".m").forEach(function(e){e.classList.add("seen");});return;}
  io=new IntersectionObserver(function(es){
    es.forEach(function(e){if(e.isIntersecting){
      e.target.classList.add("seen");io.unobserve(e.target);}});},{threshold:.1});
  document.querySelectorAll(".m").forEach(function(e){io.observe(e);});
}

function setList(p){V.list=!!p;try{localStorage.setItem("sw.view",p?"list":"cards");}catch(e){}
  var s=$("v-cards"),pr=$("v-list");
  if(s)s.classList.toggle("on",!p); if(pr)pr.classList.toggle("on",p);
  render();}
function blockFor(l,games,withFlag){return V.list?listBlock(l,games,withFlag):leagueBlock(l,games,withFlag);}

/* One place where a row opens or shuts.
   Four callers used to do it by hand - the row's own click, the two close
   buttons, and the sheet's escape route - and each of them only ever set the
   class. The class is now three facts, not one: what is drawn, what the
   opener announces, and whether the panel's eleven buttons are reachable. Any
   caller that sets only the first re-introduces the invisible tab stops, so
   none of them may set it directly. */
/* THE HINT TEACHES ONE THING AND THEN STOPS EARNING ITS PLACE.
 * "Tap any match for every option we predict" is worth 43px to somebody who
 * has never opened a row, and worth nothing to somebody who just did - and on
 * a 390x844 phone those 43px are the difference between the first match line
 * clearing the fold and sitting on it. So it retires itself the first time a
 * row is opened, by any route, and stays retired: `sw.tapped` in localStorage.
 * Remembered rather than counted per session, because the lesson does not need
 * teaching twice and a returning reader has already had it. */
var TAP_KEY="sw.tapped";
function retireTapHint(){
  try{ if(localStorage.getItem(TAP_KEY)) return; localStorage.setItem(TAP_KEY,"1"); }catch(e){}
  document.documentElement.classList.add("tapped");
}
try{ if(localStorage.getItem(TAP_KEY)) document.documentElement.classList.add("tapped"); }catch(e){}
function setRowOpen(r,open){
  if(!r) return;
  open=!!open;
  if(open) retireTapHint();
  var id=r.dataset.lf;
  /* Same trap: LOPEN is a `const`, so window.LOPEN is undefined and this
     guard silently skipped the assignment - a row would open and then shut
     itself on the next repaint, because nothing had written down that it
     was open. The old inline callers used the bare name and worked. */
  if(id) LOPEN[id]=open;
  r.classList.toggle("open",open);
  var t=r.querySelector(".lrow-toggle");
  if(t) t.setAttribute("aria-expanded",open?"true":"false");
  var p=r.querySelector(".lmore");
  if(p){ if(open) p.removeAttribute("inert"); else p.setAttribute("inert",""); }
}
function listRowHTML(f){
  const cf=conf(f.tip_p), id=fid(f), openCls=LOPEN[id]?" open":"";
  const lead=(f.home_p>=f.draw_p&&f.home_p>=f.away_p)?"h":(f.away_p>=f.draw_p?"a":"d");
  /* One split of one certainty - print three numbers that add to a hundred. */
  const _lt100=split100([f.home_p,f.draw_p,f.away_p]);
  const _open=!!LOPEN[id], _mid="more-"+id;
  return "<div class='lrow conf-"+cf+openCls+"' data-lf='"+id+"'>"+
    "<button type='button' class='sr-only lrow-toggle' aria-expanded='"+(_open?"true":"false")+
      "' aria-controls='"+_mid+"'>Options for "+esc(f.home)+" v "+esc(f.away)+"</button>"+
    "<span class='lt-time'>"+esc(kickTime(f))+"</span>"+
    "<span class='lt-match'><span class='tm'>"+esc(f.home)+"</span><span class='vs'>v</span><span class='tm'>"+esc(f.away)+"</span>"+statusSlot(f)+(id===POTD_ID?"<span class='lt-pick' title='Pick of the day' aria-label='Pick of the day'>★</span>":"")+"</span>"+
    "<span class='lt-p"+(lead==="h"?" lead":"")+"'>"+_lt100[0]+"<small>%</small></span>"+
    "<span class='lt-p"+(lead==="d"?" lead":"")+"'>"+_lt100[1]+"<small>%</small></span>"+
    "<span class='lt-p"+(lead==="a"?" lead":"")+"'>"+_lt100[2]+"<small>%</small></span>"+
    "<span class='lt-tip'><span class='vdot'></span><span class='tx' title=\""+esc(plainTip(f))+"\">"+esc(plainTip(f))+"</span>"+
      "<i class='grade'>"+P0(f.tip_p)+"%</i></span>"+
    "<span class='lt-score' title='One way this match could end, drawn from our score distribution - not the most likely score'>"+scoreLine(f)+"</span>"+
    "<span class='lt-chev' aria-hidden='true'>\u25be</span>"+
    /* inert while shut: the panel is collapsed with max-height, which hides it
       from eyes and from nobody else - eleven buttons a row, 83 rows, all of
       them tab stops pointing at nothing on screen. */
    "<div class='lmore' id='"+_mid+"'"+(_open?"":" inert")+"><button class='lmore-x' type='button' aria-label='Collapse'>▴</button>"+moreHTML(f)+"</div>"+
  "</div>";
}
function listBlock(l,games,withFlag){
  const g=games.slice().sort(function(a,b){
    return String(a.kickoff||a.time).localeCompare(String(b.kickoff||b.time));});
  return "<div class='comp'><div class='comp-h'>"+(withFlag?flagFor(countryOf(l)):"")+"<span>"+esc(compOf(l))+"</span>"+
    "<button class='star' data-fav=\""+esc(l)+"\" aria-pressed='"+isFav(l)+
    "' aria-label='Pin league'>"+(isFav(l)?"\u2605":"\u2606")+"</button></div>"+
    "<div class='ltable'>"+
      "<div class='lthead'><span></span><span>Match</span><span class='c'>1</span>"+
        "<span class='c'>X</span><span class='c'>2</span><span>Tip</span>"+
        "<span class='c pred'>Pred</span><span></span></div>"+
      g.map(listRowHTML).join("")+"</div></div>";
}
function renderResults(){
  var rs=resultsOnDay();
  var hits=rs.filter(function(r){return r.hit;}).length;
  var head="<div class='res-head'><b>Results \u00b7 "+dayName(V.off)+"</b>"+
    (rs.length?"<span>"+hits+"/"+rs.length+" tips landed</span>":"")+"</div>";
  if(!rs.length){setBoard(head+"<div class='none'><b>No results for this day</b><p>Play a day forward for upcoming games.</p></div>");return;}
  var byC={};
  rs.forEach(function(r){var c=countryOf(r.league);(byC[c]=byC[c]||[]).push(r);});
  var html=head+Object.keys(byC).sort().map(function(c){
    return "<section class='country'><div class='country-h'><h2>"+flagFor(c)+"<span>"+esc(c)+"</span></h2></div>"+
      "<div class='country-body'>"+byC[c].map(function(r){
        return "<div class='rrow "+(r.hit?"hit":"miss")+"'>"+
          "<div class='rr-main'>"+
            "<span class='rr-tm rr-h'>"+esc(r.home)+"</span>"+
            "<b class='rr-sc'>"+r.hg+"</b><span class='rr-v'>-</span><b class='rr-sc'>"+r.ag+"</b>"+
            "<span class='rr-tm rr-a'>"+esc(r.away)+"</span>"+
          "</div>"+
          "<div class='rr-tip'><span class='rr-t'>"+esc(plainTip(r))+"</span>"+
            "<span class='rr-badge'>"+(r.hit?"Hit":"Miss")+"</span></div>"+
        "</div>";}).join("")+"</div></section>";}).join("");
  setBoard(html);
}
/* Clears everything that can hide a fixture, and nothing that cannot. The day
   is deliberately left alone: someone who stepped to Wednesday meant it, and
   throwing them back to today would undo the one choice they made on purpose. */
function resetBoardFilters(){
  V.q=""; V.cat="all"; V.country=""; V.league="";
  var box=document.getElementById("q"); if(box) box.value="";
  render();
}
/* WHAT THE CLOSED BUTTON HAS TO ADMIT. The search and the two selects fold
   away on a phone, and a reader who left one set and came back to a short
   board would otherwise have no way to see why - the control that did it is
   shut. The dot says a filter is on; #chosen, which stays visible either way,
   says which. Called from render() so it cannot drift from the state it
   describes, whatever changed it. */
function syncFilterBtn(){
  var dot=$("fbtnOn"); if(!dot) return;
  dot.hidden=!(V.q&&V.q.trim())&&!V.country&&!V.league;
}
/* Opened by the reader, so it stays open until they shut it: a panel that
   closed itself on the next render would eat the tap that opened it. */
(function(){
  var b=$("fbtn"), bar=b&&b.closest(".bar"); if(!b||!bar) return;
  b.addEventListener("click",function(){
    var open=!bar.classList.contains("f-open");
    bar.classList.toggle("f-open",open);
    b.setAttribute("aria-expanded",open?"true":"false");
    /* Straight into the box they came for. Not on the way out - moving focus
       to something that has just been hidden strands a keyboard. */
    if(open){ var q=$("q"); if(q) try{q.focus({preventScroll:true});}catch(e){q.focus();} }
  });
})();
function render(){
  document.documentElement.classList.toggle("list",!!V.list);
  formIndexInvalidate();
  renderControls(); renderCats(); syncFilterBtn();
  /* Rail content, so it survives the results-view early return below.
     renderProof stands on its own: the hero must carry its proof even on a
     day the recap has nothing to say. */
  renderDaily(); renderProof();
  if(V.off<0){ document.documentElement.classList.add("is-results");
    $("potd").innerHTML="";POTD_ID="";$("sotd").innerHTML="";$("record").innerHTML="";
    renderBoardHead([]); renderResults(); return; }
  document.documentElement.classList.remove("is-results");
  renderPotd(); renderSlipOfDay(); renderRecord(); renderBookAll(); renderSlipTease();
  renderMyResults(); wireSlipsSheet();
  const list=shown();
  renderBoardHead(list);
  if(!list.length){
    /* A DEAD END WITH A WAY OUT. Four controls can empty this board - the
       search box, a category chip, a country and a league - and a reader does
       not necessarily remember which one they touched, so the button clears
       all four rather than making them guess. The old copy also promised
       "new fixtures arrive Friday for the weekend" on every day of the week,
       which was untrue most days it was shown. Name what emptied the board
       instead, since we know which control did it. */
    var _term = V.q.trim();
    var _why = _term ? "Nothing matches \u201c" + esc(_term) + "\u201d"
             : V.league ? "No games in " + esc(V.league) + " on this day"
             : V.country ? "No games in " + esc(V.country) + " on this day"
             : V.cat !== "all" ? "No games in this category on this day"
             : "No games on this day";
    setBoard("<div class='none'><b>" + _why + "</b>" +
      "<p>The rest of the board is still there.</p>" +
      "<button class='none-reset' id='boardReset' type='button'>Show all games</button>" +
      "</div>");
    var _rst = document.getElementById("boardReset");
    if (_rst) _rst.addEventListener("click", resetBoardFilters);
    return;
  }
  var _thin = list.length<=4 ? "<div class='thin-note'>Only "+list.length+" fixture"+(list.length===1?"":"s")+" available right now - more arrive as the weekend nears.</div>" : "";
  const byL={};
  list.forEach(function(f){(byL[f.league]=byL[f.league]||[]).push(f);});
  const favL=Object.keys(byL).filter(isFav).sort();
  let html="";
  if(favL.length)
    html+="<div class='faves-h'><h2>\u2605 Pinned</h2><span>"+
      favL.reduce(function(n,l){return n+byL[l].length;},0)+" games</span></div>"+
      favL.map(function(l){return blockFor(l,byL[l],true);}).join("");
  // Top leagues stays European by definition of TOP_LEAGUES; the isSAleague
  // guard makes that a rule rather than a coincidence, so adding a South
  // American entry to that list later still can't surface one here.
  /* ...and no second tiers either: England's Championship is on that list, and
     promoting it above everyone else's top flight is the thing being fixed. */
  const tops=favL.length?[]:TOP_LEAGUES.filter(function(l){
    return byL[l]&&!isSAleague(l)&&!isLowerLeague(l);});
  if(tops.length)
    html+="<div class='faves-h'><h2>Top leagues</h2><span>"+
      tops.reduce(function(n,l){return n+byL[l].length;},0)+" games</span></div>"+
      tops.map(function(l){return blockFor(l,byL[l],true);}).join("");
  const done={}; favL.concat(tops).forEach(function(l){done[l]=1;});

  const byC={};
  Object.keys(byL).forEach(function(l){
    if(done[l]) return;
    const c=countryOf(l);(byC[c]=byC[c]||[]).push(l);});
  /* A country is ranked by the best competition it still has on the board, so
     Scotland's Premiership sits above Spain's second tier, Brazil and
     Argentina follow Europe's top flights, and the lower divisions - which on
     a busy day are most of the rows - come last instead of pushing the games
     people came for down the page. Pinned countries still lead. */
  const cRank={};
  Object.keys(byC).forEach(function(c){
    cRank[c]=Math.min.apply(null,byC[c].map(leagueRank));
  });
  html+=Object.keys(byC).sort(function(a,b){
    var fa=isFav("c:"+a)?0:1, fb=isFav("c:"+b)?0:1;
    return fa-fb || cRank[a]-cRank[b] || a.localeCompare(b);
  }).map(function(c){
    /* Within a country, its top flight leads too. */
    const ls=byC[c].sort(function(x,y){
      return leagueRank(x)-leagueRank(y) || x.localeCompare(y);});
    const n=ls.reduce(function(t,l){return t+byL[l].length;},0);
    return "<section class='country"+(SHUT[c]?" shut":"")+"'>"+
      "<div class='country-h' role='button' tabindex='0' data-toggle=\""+esc(c)+"\">"+
        "<span class='chev'>\u25be</span><h2>"+flagFor(c)+"<span>"+esc(c)+"</span></h2>"+
        "<button class='star' data-fav=\"c:"+esc(c)+"\" aria-pressed='"+isFav("c:"+c)+"' aria-label='Pin country'>"+(isFav("c:"+c)?"\u2605":"\u2606")+"</button>"+
        "<span class='count'>"+n+"</span></div>"+
      "<div class='country-body'>"+ls.map(function(l){
        return blockFor(l,byL[l]);}).join("")+"</div></section>";}).join("");
  setBoard(_thin+html);
  applyBoardCap(list.length);
  /* Re-attaches after every render until it is dismissed. No scroll here -
     a page that jumps on load is worse than one that explains nothing. */
  runCoach();
  document.querySelectorAll(".lrow").forEach(function(r){
    r.addEventListener("click",function(e){
      if(e.target.closest(".opt-add")||e.target.closest(".m-add")) return;
      setRowOpen(r,!LOPEN[r.dataset.lf]);});
    var xb=r.querySelector(".lmore-x");
    if(xb) xb.addEventListener("click",function(e){e.stopPropagation();
      setRowOpen(r,false);
      /* Focus would otherwise sit on a button that just went inert, and the
         browser drops it to the document - a keyboard reader loses their place
         in a hundred-row list. Hand it back to the row's own opener. */
      var t=r.querySelector(".lrow-toggle"); if(t) t.focus();});
    var xc=r.querySelector(".lmore-close");
    if(xc) xc.addEventListener("click",function(e){e.stopPropagation();
      setRowOpen(r,false);
      var t=r.querySelector(".lrow-toggle"); if(t) t.focus();});});

  document.querySelectorAll(".m-btn").forEach(function(b){
    b.addEventListener("click",function(){openSheet(b.dataset.fx);});});
  document.querySelectorAll(".m-add").forEach(function(b){
    var on=myslipHas(b.dataset.add,b.dataset.code); b.classList.toggle("on",on);
    var _ic=b.querySelector(".ma-ic"); if(_ic)_ic.innerHTML=on?CHK:PLUS;
    b.lastChild.textContent=on?" Added":" Add to slip";
    b.addEventListener("click",function(e){e.stopPropagation();
      if(!b.dataset.code) return;
      toggleMy(b.dataset.add,b.dataset.code,b.dataset.label,b.dataset.p,b);});});
  document.querySelectorAll("[data-fav]").forEach(function(b){
    b.addEventListener("click",function(e){e.stopPropagation();toggleFav(b.dataset.fav);});});
  document.querySelectorAll("[data-toggle]").forEach(function(h){
    const hit=function(){const c=h.dataset.toggle;SHUT[c]=!SHUT[c];
      h.closest(".country").classList.toggle("shut",!!SHUT[c]);};
    h.addEventListener("click",hit);
    h.addEventListener("keydown",function(e){
      if(e.key==="Enter"||e.key===" "){e.preventDefault();hit();}});});
  observe();
}

/* ---------------------------------------------------------------- sheet */
var SHEET_RETURN=null, SHEET_SCROLL=0;
function fixtureById(id){
  for(var i=0;i<DATA.fixtures.length;i++){
    if(fid(DATA.fixtures[i])===id) return DATA.fixtures[i];}
  return null;
}
function openSheet(id){
  var f=fixtureById(id); if(!f) return;
  SHEET_RETURN=document.querySelector("[data-fx='"+id+"']");
  $("sheet-title").textContent=f.home+" v "+f.away;
  $("sheet-sub").textContent=compOf(f.league)+" \u00b7 "+
    dayName(dayOff(f.date))+" "+kickTime(f)+" \u00b7 "+plainTip(f)+" "+
    P0(f.tip_p)+"%";
  $("sheet-body").innerHTML=moreHTML(f);
  SHEET_SCROLL=window.scrollY||document.documentElement.scrollTop||0;
  $("scrim").classList.add("on");
  $("sheet").classList.add("on");
  document.documentElement.classList.add("locked");
  // fills animate on open, same as they did inside the card
  var sb=$("sheet-body");
  sb.querySelectorAll(".opt .fill").forEach(function(el){
    el.style.transform="scaleX(var(--w,0))";});
  $("sheet-x").focus();
  pushOverlay();
}
function closeSheet(){
  $("scrim").classList.remove("on");
  $("sheet").classList.remove("on");
  document.documentElement.classList.remove("locked");
  if(SHEET_RETURN){SHEET_RETURN.focus();SHEET_RETURN=null;}
}
$("scrim").addEventListener("click",function(){closeSheet();closeMySheet();closeSlipsSheet();});
$("sheet-x").addEventListener("click",closeSheet);
function anyOverlayOpen(){return ($("sheet")&&$("sheet").classList.contains("on"))||($("mySheet")&&$("mySheet").classList.contains("on"));}
window.addEventListener("popstate",function(){
  if(anyOverlayOpen()){closeSheet();closeMySheet();}
  else if(document.documentElement.classList.contains("mode-build")||document.documentElement.classList.contains("mode-live")){setView("pred");}
});
function pushOverlay(){try{history.pushState({sw:1},"");}catch(e){}}
addEventListener("keydown",function(e){
  if(e.key==="Escape"){
    if($("sheet").classList.contains("on")) closeSheet();
    if($("mySheet").classList.contains("on")) closeMySheet();
    if($("slipsSheet")&&$("slipsSheet").classList.contains("on")) closeSlipsSheet();
  }});

/* ============================================================ build a slip */
/* Set only while clearMy repaints the builder, to stop that repaint from
   syncing the picks back into a slip the user just emptied. */
var BUILD_NOSYNC=false;
/* The markets a fresh visit starts with.
   Four, not seven. Win or draw and Team over 0.5 are the two safest things on
   the board (tier 0), Over 1.5 is the one goals line safe enough to headline,
   and Outright win is what people come looking for. Over 2.5 and Both score
   used to be on by default despite being tier 1 and tier 2 - the riskiest
   chips were pre-selected while the safest one, Team over 0.5, was not.
   Nothing here is persisted, so this set is what everyone gets on every load;
   the chips stay available for anyone who wants the rest. WSP below carries
   the same set so the two builders start from the same place. */
/* THE FOUR COMBINATION CHIPS START OFF, AND OFF ON PURPOSE. They price, they
   book on both bookmakers, and not one of them has a graded result yet - the
   last market switched on before it had one took over the wizard's picks for a
   week. They begin earning a record the moment the next card is graded; until
   then they are there for anyone who goes looking. */
var BUILD={risk:null,removed:{},picks:[],booking:false,seed:Math.floor(Math.random()*1e6),shuffles:0,mk:{wd:true,any:false,out:true,o15:true,o25:false,o35:false,fh:false,tts:true,tts2:false,both:false,dro25:false,drgg:false,rsgg:false,rso25:false,dro15:false,rso15:false,weh:false},touched:false,mode:"slider"};
/* NO `draw` KEY HERE, deliberately. The draw is a Wizard market and lives in
   WSP.mk alone. It was briefly mirrored into BUILD.mk like every other toggle,
   which was inert - "X" is in neither allowedMarkets nor mkOn, so no risk
   setting could reach it - but inert is not the same as safe: the flag sat
   there set to true, waiting for the day somebody adds "X" to either list and
   the Slider quietly starts building draws nobody asked it for. A key that
   does not exist cannot be read by accident. */
try{var rr=localStorage.getItem("sw.risk"); if(rr!=null) BUILD.risk=+rr;}catch(e){}
try{var rm=localStorage.getItem("sw.mode"); if(rm==="slider"||rm==="wizard") BUILD.mode=rm;}catch(e){}
/* Ticket window. "day" holds every leg inside today, so the whole slip settles
   the same evening; "all" runs for as long as there are fixtures published.
   One shared preference, so the slider builder and Wizard's Special can never
   disagree about which games are on the table. */
/* Today, not everything. A slip whose legs run across three days cannot be
   watched in one evening and cannot settle in one, and "all upcoming" was
   quietly the wider, slower default. Anyone who wants the long window still
   has the toggle, and their choice is still remembered. */
var SCOPE="day";
/* One-time reset so the new default actually reaches people who already have
   "all" saved from before it changed - otherwise this is a default nobody
   returning ever sees. Guarded by a flag rather than run every load, or
   choosing "all" would never stick again. Same move the sw.tod clear below
   makes, for the same reason. */
try{ if(!localStorage.getItem("sw.scopedflt2")){ localStorage.removeItem("sw.scope");
  localStorage.setItem("sw.scopedflt2","1"); } }catch(e){}
try{var sc0=localStorage.getItem("sw.scope"); if(sc0==="day"||sc0==="all"||sc0==="span") SCOPE=sc0;}catch(e){}
/* Which single day the "day" window points at: 0 today, 1 tomorrow, and so on.
   Only meaningful while SCOPE is "day". A saved offset can outlive its
   fixtures - yesterday's "tomorrow" is today - so clampDay() pulls it back to
   a day that still has games before anything is painted. */
var SDAY=0;
try{var sd0=parseInt(localStorage.getItem("sw.sday"),10);
  if(!isNaN(sd0)&&sd0>=0&&sd0<=14) SDAY=sd0;}catch(e){}
/* How wide the "span" window is, in days counted from SDAY. Asked for:
   "we should be able to choose certain amount of days for the games to span.
   Not just 1 day or all upcoming." Only meaningful while SCOPE is "span",
   and a stored width we no longer offer falls back to the narrowest rather
   than to a number nobody picked. */
var SPAN_CHOICES=[2,3,7];
var SPAN=3;
try{var sp0=parseInt(localStorage.getItem("sw.span"),10);
  if(SPAN_CHOICES.indexOf(sp0)>=0) SPAN=sp0;}catch(e){}
function spanName(n){return "Next "+n+" days";}
/* Time of day, by local kickoff. Someone building a slip at lunchtime does
   not want games that started this morning, and someone who will be watching
   in the evening wants only the evening card. The cuts follow how a day
   actually splits for a Nigerian audience: most European football lands in
   the late bucket, which is why "all day" stays the default. */
/* Always starts at All day, deliberately not restored from a previous
   visit. A stored bucket is a filter you cannot see the edge of: someone
   who picked Early once came back to a card holding five leagues out of
   twenty-eight and reported the league picker as broken, because nothing
   on screen said a time window was still on from days ago. A day filter is
   worth remembering; a slice of a day is not. The stored value is cleared
   so anyone already holding one is let out of it. */
var TOD="all";
try{localStorage.removeItem("sw.tod");}catch(e){}
/* A bucket only means something against one day, so it never survives a wide
   window - including a pair of preferences saved before that was true. */
if(SCOPE!=="day") TOD="all";
/* The buckets are named for the part of the day a reader is in, so they have
   to match what the clock on the card says.
     Early   05:00 - 12:59  morning
     Mid day 13:00 - 17:59  afternoon
     Late    18:00 - 04:59  evening, and on past midnight
   Two things were wrong before. "Early" was everything before 15:00, so a
   14:30 kickoff was filed as early - it is not, and it was reported as one.
   Worse, the late bucket ended at midnight while getHours() wraps to 0, so
   every overnight game came back as hour 0-4 and landed in "Early" as well:
   61 of today's 357 fixtures, which is why picking Early returned a screen of
   late-night football. Late now runs through to 05:00 rather than stopping at
   the date boundary, because a 00:30 kickoff is the end of an evening, not the
   start of a morning. */
function todOf(f){
  var t=kickMs(f); if(!t) return null;
  var h=new Date(t).getHours();
  if(h>=5&&h<13) return "early";
  if(h>=13&&h<18) return "mid";
  return "late";
}
function todFixtures(list){
  /* Early / mid / late describe how a single day splits. Applied to "all
     upcoming" the same cut would run across every published day at once -
     an evening in nine days' time is not what someone picking "Late" is
     asking for - so the buckets only bite on a single fixture day. */
  if(TOD==="all"||SCOPE!=="day") return list;
  /* A fixture with no readable kickoff used to pass every bucket, so it turned
     up under Early and Mid day and Late alike. If we cannot say when it starts
     we cannot honour the choice, so it stays out of a narrowed view - it is
     still there under "All day". */
  return list.filter(function(f){ return todOf(f)===TOD; });
}
/* Which leagues a slip may draw from.
   Empty means every league, which is both the default and what "clear" returns
   to - a stored set that had emptied itself would otherwise build nothing and
   look broken. Kept as a plain object so it survives JSON round-tripping into
   localStorage. */
var BLD_LEAGUES={};
try{var _bl0=JSON.parse(localStorage.getItem("sw.bldleagues")||"{}");
  if(_bl0&&typeof _bl0==="object"&&!Array.isArray(_bl0)) BLD_LEAGUES=_bl0;}catch(e){}
function leaguesChosen(){for(var k in BLD_LEAGUES){if(BLD_LEAGUES[k])return true;}return false;}
function leagueAllowed(l){return !leaguesChosen()||!!BLD_LEAGUES[l];}
function leagueChosenCount(){var n=0;for(var k in BLD_LEAGUES){if(BLD_LEAGUES[k])n++;}return n;}
function setLeaguePicked(l,on){
  if(on) BLD_LEAGUES[l]=1; else delete BLD_LEAGUES[l];
  try{localStorage.setItem("sw.bldleagues",JSON.stringify(BLD_LEAGUES));}catch(e){}
}
function clearLeaguePicks(){
  BLD_LEAGUES={};
  try{localStorage.removeItem("sw.bldleagues");}catch(e){}
}
/* Is this fixture inside the window - the ONE answer, because the board, the
   league picker and the counts drift apart the moment there are two copies of
   it. A second copy of exactly this predicate is what produced the chip-count
   bug ("Count the chips after the search box"). */
function inScope(f){
  var o=dayOff(f.date);
  if(SCOPE==="day") return o===SDAY;
  if(SCOPE==="span") return o>=SDAY&&o<SDAY+SPAN;
  return true;
}
function scopeFixtures(){
  return todFixtures(DATA.fixtures.filter(function(f){
    if(!notStarted(f)) return false;
    if(!leagueAllowed(f.league)) return false;
    return inScope(f);
  }));
}
/* The leagues actually available to choose from, with how many games each has
   in the current day/time window - so the picker offers what can be built with
   rather than every league the payload has ever carried. Counted BEFORE the
   league filter, or choosing one league would empty the list of the others. */
function leaguesOnBoard(){
  var seen={};
  todFixtures(DATA.fixtures.filter(function(f){
    if(!notStarted(f)) return false;
    return inScope(f);
  })).forEach(function(f){
    if(TOP_ONLY&&isLowerFixture(f)) return;
    seen[f.league]=(seen[f.league]||0)+1;
  });
  return Object.keys(seen).sort(function(a,b){
    var r=leagueRank(a)-leagueRank(b); if(r) return r;
    return a.localeCompare(b);
  }).map(function(l){return {league:l,n:seen[l]};});
}
/* Games still buildable on a given day offset - the count shown against the
   day, and what tells clampDay whether an offset is worth keeping. */
function dayBuildable(off){
  var n=0,all=DATA.fixtures||[];
  for(var i=0;i<all.length;i++){var f=all[i];
    if(dayOff(f.date)===off&&notStarted(f)) n++;}
  return n;
}
/* What a tap actually hands you: the three filters both builders apply before
   they pick anything. The counts beside the day and time buttons used to come
   off the raw payload, so switching on Top flight left every number unchanged
   while the board behind it shrank, and a bucket could advertise nine games and
   then produce two.
   Deliberately NOT used by dayPickList or clampDay below. Which days EXIST is a
   structural question, and letting a league choice empty the day picker would
   make it jump about while somebody is still choosing. */
function buildableOn(off){
  var out=[],all=DATA.fixtures||[];
  for(var i=0;i<all.length;i++){var f=all[i];
    if(!notStarted(f)) continue;
    if(dayOff(f.date)!==off) continue;
    if(!leagueAllowed(f.league)) continue;
    if(TOP_ONLY&&isLowerFixture(f)) continue;
    out.push(f);}
  return out;
}
/* The same three filters with no day at all, for the "All upcoming" count. */
function buildableAll(){
  return (DATA.fixtures||[]).filter(function(f){
    return notStarted(f)&&leagueAllowed(f.league)&&!(TOP_ONLY&&isLowerFixture(f));
  });
}
/* The same three filters across the whole span, for the pill that is showing
   one. Built from buildableOn so there is no third copy of the filters. */
function buildableSpan(){
  var out=[];
  for(var i=0;i<SPAN;i++) out=out.concat(buildableOn(SDAY+i));
  return out;
}
/* Structural, like dayBuildable and for the same reason: it decides what the
   day menu offers, and a league choice must not make the menu rearrange. */
function spanBuildable(n,start){
  var t=0;
  for(var i=0;i<n;i++) t+=dayBuildable(start+i);
  return t;
}
/* Every day from today forward that still has a game to build with, ascending.
   Days whose fixtures have all kicked off drop out, so the picker never offers
   an empty day. */
function dayPickList(){
  return activeDays().filter(function(o){return o>=0&&dayBuildable(o)>0;});
}
/* A stored day can point at a day with nothing left on it - keep it if it still
   has games, otherwise fall to the earliest day that does. */
function clampDay(){
  if(SCOPE!=="day"||dayBuildable(SDAY)>0) return;
  var list=dayPickList();
  if(list.length){SDAY=list[0]; try{localStorage.setItem("sw.sday",SDAY);}catch(e){}}
}
function paintScope(){
  updateFiltersSum();
  var seg=$("scopeSeg"); if(!seg) return;
  clampDay();
  /* Only "all" carries data-scope now; the day pill is a dropdown trigger and
     is lit on its own below. */
  seg.querySelectorAll("[data-scope]").forEach(function(b){
    var on=b.getAttribute("data-scope")===SCOPE;
    b.classList.toggle("on",on);
    b.setAttribute("aria-pressed",on?"true":"false");
  });
  var dayBtn=$("scopeDayBtn");
  if(dayBtn){
    /* The pill is the narrow window whichever shape it is in - one day or a
       run of them. Only "All upcoming" turns it off. */
    var dayOn=SCOPE!=="all";
    dayBtn.classList.toggle("on",dayOn);
    dayBtn.setAttribute("aria-pressed",dayOn?"true":"false");
  }
  /* "Today only" reads best when the day really is today; any other choice
     shows its own name ("Tomorrow", "Saturday") so the pill says what it does. */
  var lbl=$("scopeDayLbl");
  if(lbl) lbl.textContent = SCOPE==="span" ? spanName(SPAN)
        : (SDAY===0 ? "Today only" : dayName(SDAY));
  /* Counts make the choice concrete: "12" against "168" says more about what
     the switch does than either label manages on its own. The day pill counts
     against the day it points at. */
  try{
    var n={day:SCOPE==="span"?buildableSpan().length:buildableOn(SDAY).length,
           all:buildableAll().length};
    seg.querySelectorAll("[data-scope-n]").forEach(function(el){
      el.textContent=n[el.getAttribute("data-scope-n")];
    });
  }catch(e){}
  paintTod();
}
/* Same treatment for the time buckets, and the counts matter more here: on a
   quiet weekday three of the four are empty, and a label alone would invite a
   tap that returns nothing. */
function paintTod(){
  var seg=$("todSeg"); if(!seg) return;
  /* On "All upcoming" none of these is in force. A time of day is a slice of
     ONE day and that window spans several, so TOD is pinned to "all" and
     todFixtures ignores it entirely - yet "All day" still came up lit, claiming
     a filter that was not running.
     Reported: "when i click on all upcoming, i think all day should not look
     active. since all upcoming is not one day."
     setTod already says the same thing from the other side: naming a time of
     day is naming a day, so tapping any bucket here pulls the window onto one.
     That still works; it simply is not selected until it does. */
  var live=(SCOPE==="day");
  seg.querySelectorAll("[data-tod]").forEach(function(b){
    var on=live&&b.getAttribute("data-tod")===TOD;
    b.classList.toggle("on",on);
    b.setAttribute("aria-pressed",on?"true":"false");
  });
  try{
    /* Counted against the chosen day, whatever the window is set to: tapping a
       bucket brings the window onto that day, so the number is what the tap
       gives you. */
    var base=buildableOn(SDAY);
    var n={all:base.length,early:0,mid:0,late:0};
    base.forEach(function(f){var b=todOf(f); if(b&&n[b]!=null) n[b]++;});
    seg.querySelectorAll("[data-tod-n]").forEach(function(el){
      var k=el.getAttribute("data-tod-n");
      el.textContent=n[k];
      var btn=el.closest(".scope-opt");
      /* Nothing in this window - say so by dimming rather than by letting the
         tap empty the board. */
      if(btn) btn.classList.toggle("tod-empty",k!=="all"&&n[k]===0);
    });
  }catch(e){}
}
function setTod(t){
  if(t!=="all"&&t!=="early"&&t!=="mid"&&t!=="late") return false;
  var changed=false;
  if(t!==TOD){TOD=t; changed=true;}
  /* Naming a time of day is naming a day: pull the window in with it rather
     than leave a lit-up bucket that quietly filters nothing. */
  if(t!=="all"&&SCOPE!=="day"){
    SCOPE="day"; try{localStorage.setItem("sw.scope","day");}catch(e){} changed=true;
  }
  if(!changed) return false;
  paintScope(); return true;
}
/* Point the day window at a specific day. Selecting a day is also selecting the
   "day" window, so it flips SCOPE in with it - picking Tomorrow while on "All
   upcoming" should show tomorrow, not stay wide. */
function setDay(off){
  var changed=false;
  if(SCOPE!=="day"){SCOPE="day"; try{localStorage.setItem("sw.scope","day");}catch(e){} changed=true;}
  if(off!==SDAY){SDAY=off; try{localStorage.setItem("sw.sday",off);}catch(e){} changed=true;}
  if(!changed) return false;
  paintScope(); return true;
}
/* Point the window at a run of days. Same shape as setDay: choosing a span is
   also choosing the narrow window. It starts at the first day that still has
   games, so "Next 3 days" is the next three rather than three counted from a
   day already played out - or from a Saturday picked earlier. */
function setSpan(n){
  if(SPAN_CHOICES.indexOf(n)<0) return false;
  var list=dayPickList(), start=list.length?list[0]:0;
  if(SCOPE==="span"&&SPAN===n&&SDAY===start) return false;
  SCOPE="span"; SPAN=n; SDAY=start;
  try{localStorage.setItem("sw.scope","span");
    localStorage.setItem("sw.span",String(n));
    localStorage.setItem("sw.sday",String(start));}catch(e){}
  /* Early / mid / late slice ONE day. A span is not one day, so the bucket
     retires with the widening - the same rule "All upcoming" follows, and
     todFixtures already ignores TOD outside a single day. */
  if(TOD!=="all") TOD="all";
  paintScope(); return true;
}
/* Persist and repaint only - callers decide what to re-render, because a change
   made from the Wizard's Special sheet must not flip BUILD.touched and rewrite
   the slip the user just conjured. */
function setScope(s){
  if((s!=="day"&&s!=="all")||s===SCOPE) return false;
  SCOPE=s; try{localStorage.setItem("sw.scope",s);}catch(e){}
  /* Widening past a single day retires the time bucket with it - the cut no
     longer applies, and the segment should say so instead of staying lit. */
  if(s!=="day"&&TOD!=="all"){TOD="all";}
  paintScope(); return true;
}
/* Same origin, so booking reaches the browser over the Cloudflare edge that
   already serves this page instead of an intercontinental hop to Railway.
   Measured from Lagos: 0.5s here against 2-60s direct. See
   lib/bookproxy.js - the 400 a refused slip returns passes through intact,
   which dropUnbookable below depends on. */
const BOOK_URL="/api/book?book=sporty";
/* WHO THIS BROWSER IS, FOR COUNTING BOOKINGS AND NOTHING ELSE.
   A random opaque token, minted once and kept, sent only to our own booking
   route. It is NOT a fingerprint and must never become one: nothing about the
   device, the screen or the user agent goes into it, so it identifies a
   browser that has been here before and says nothing about who is holding it.
   Clearing site data clears it, which is the honest bargain - the limit exists
   to control cost, and the address ceiling on the server is what remains for
   anyone who clears it deliberately.
   Storage can throw (private mode, site data blocked). Then there is no id and
   the booking goes through uncounted; a quota must never be a precondition for
   booking. Server side: lib/quota.js, which wants 8-64 of [A-Za-z0-9_-]. */
function swDeviceId(){
  try{
    /* PROVISIONING A DEVICE FROM A LINK. Reading this id off a phone means a
       USB cable and chrome://inspect; setting it means opening one URL. So
       ?swdev=<token> claims this browser as a named device - visit it once on
       each handset that should skip the daily cap, with the same token in
       SW_QUOTA_EXEMPT.
       THE TOKEN IS A BYPASS KEY, so it is stripped from the address bar
       immediately rather than riding along in a screenshot or a shared link.
       Shape-checked against the same rule the server enforces
       ([A-Za-z0-9_-]{8,64}); a malformed one is ignored rather than stored,
       because storing it would silently drop this device into the shared
       address bucket instead of failing where anyone would notice. */
    var _m=/[?&]swdev=([^&#]+)/.exec(location.search||"");
    if(_m){
      var _t=decodeURIComponent(_m[1]);
      if(/^[A-Za-z0-9_-]{8,64}$/.test(_t)) localStorage.setItem("sw.device",_t);
      try{
        var _clean=(location.search||"").replace(/([?&])swdev=[^&#]*&?/,"$1")
          .replace(/[?&]$/,"");
        history.replaceState(null,"",location.pathname+_clean+(location.hash||""));
      }catch(e){}
    }
    var v=localStorage.getItem("sw.device");
    if(v&&/^[A-Za-z0-9_-]{8,64}$/.test(v)) return v;
    var r;
    if(window.crypto&&crypto.randomUUID) r=crypto.randomUUID().replace(/-/g,"");
    else if(window.crypto&&crypto.getRandomValues){
      var a=new Uint8Array(16); crypto.getRandomValues(a);
      r=Array.prototype.map.call(a,function(b){return ("0"+b.toString(16)).slice(-2);}).join("");
    } else r=String(Math.random()).slice(2)+String(Date.now());
    r=r.slice(0,32);
    localStorage.setItem("sw.device",r);
    return r;
  }catch(e){ return null; }
}
/* SportyBet's share endpoint is intermittently flaky - it rejects or times out
   on a first hit and works on retry. Retry up to 3x with backoff so the user
   never has to. Only retries on network/5xx/no-code, never on a clean rejection. */
/* What the last booking said was left, so the code modal can warn without
   asking again. Null until a booking answers, and left null when the quota is
   switched off - see lib/bookgate.js. */
var SW_QUOTA_LEFT=null;
/* QUIET UNTIL IT IS NEARLY GONE. A counter shown at nine of ten is noise, and
   noise is what teaches people to ignore the one at two. Nothing at all when
   the number is unknown: a made-up allowance is worse than none. */
function quotaNoteHTML(n){
  if(n===null||n===undefined||!isFinite(+n)) return "";
  n=+n;
  if(n>3) return "";
  if(n<=0)
    return "<div class='code-quota'>That was your last booking code today. "+
      "More after midnight.</div>";
  return "<div class='code-quota'>"+n+(n===1?" booking code":" booking codes")+
    " left today.</div>";
}
function bookFetch(sel,B){
  B=B||curBook();
  var tries=0;
  /* Without a deadline a request that never settles - the API restarting, a
     phone that lost signal mid-post - left the button reading "Booking..."
     with no way back except a reload. */
  function withTimeout(ms){
    var ctrl=("AbortController" in window)?new AbortController():null;
    var t=setTimeout(function(){ try{ctrl&&ctrl.abort();}catch(e){} },ms);
    return {signal:ctrl?ctrl.signal:undefined, done:function(){clearTimeout(t);}};
  }
  function attempt(){
    tries++;
    var to=withTimeout(15000);
    /* The device header is what lets this reader be counted as themselves.
       Without it the request falls into the shared address bucket, which on a
       carrier NAT is a whole cell tower - see lib/bookgate.js. Omitted rather
       than sent empty when storage refused us an id. */
    var _hdrs={"Content-Type":"application/json"};
    var _dev=swDeviceId(); if(_dev) _hdrs["X-SW-Device"]=_dev;
    return fetch(B.book,{method:"POST",headers:_hdrs,
      signal:to.signal,
      body:JSON.stringify({selections:sel})})
      .then(function(r){to.done();
        return r.json().catch(function(){return {};}).then(function(d){
          d=d||{};
          /* A non-JSON 500 or a gateway page carries no reason of its own -
             say what the status was rather than nothing at all. */
          if(!r.ok&&!d.detail&&!d.message&&!d.error)
            d.message="the booking service returned "+r.status;
          /* The free-period cap. Carried through as a flag because the status
             is gone by the next link in the chain. */
          if(r.status===429) d._capped=1;
          /* HOW MANY ARE LEFT AFTER THIS ONE. The server counts the code it is
             about to issue, so this is what remains going forward. Absent when
             the quota is off or the counter was unreachable - and then nothing
             is claimed rather than a number invented. */
          try{
            var _q=r.headers&&r.headers.get?r.headers.get("X-Sw-Quota-Remaining"):null;
            if(_q!==null&&_q!==undefined&&_q!==""&&isFinite(+_q)){
              d._left=+_q; SW_QUOTA_LEFT=+_q;
            }
          }catch(e){}
          return d;
        });},function(e){to.done();throw e;})
      .then(function(d){
        if(d&&d.success&&B.codeOf(d)) return d;
        /* A cap is a definitive answer, like a named refusal - retrying it
           spends two more round trips and 1.8 seconds to be told the same
           thing, and the reader watches "Booking..." the whole time. */
        if(d&&d._capped){ d._kind="capped"; return d; }
        /* A named refusal is an answer, not a blip. Retrying it spends two
           more round trips to be told the same thing, and delays the retry
           that actually helps - the one without those legs. */
        if(d&&d.unbookable&&d.unbookable.length){ d._kind="refused"; return d; }
        if(tries<3) return new Promise(function(res){setTimeout(res,600*tries);}).then(attempt);
        d=d||{}; d._kind="refused"; return d;
      })
      .catch(function(e){
        if(tries<3) return new Promise(function(res){setTimeout(res,600*tries);}).then(attempt);
        /* Every failure used to come back as a bare {} - a dead network, a
           15s timeout against a host that had gone to sleep and a flat refusal
           were indistinguishable by the time a caller saw them, so all three
           printed the same "Couldn't generate a code". Carry the shape of the
           failure so the message can say something true and actionable. */
        return {_kind:(e&&e.name==="AbortError")?"timeout":"net"};
      });
  }
  return attempt();
}
/* Whatever reason the service gave, in whichever field it used. */
function bookReason(d){
  if(!d) return "";
  if(d.detail) return typeof d.detail==="string"?d.detail:JSON.stringify(d.detail);
  return d.message||d.error||"";
}
/* One message builder for all three booking paths, so a failure reads the same
   wherever it happens and says what to do next. The host sleeps when it is
   quiet, and a first-time visitor is the most likely person to wake it - which
   is exactly who was being told, unhelpfully, "Couldn't generate a code". */
function bookErrHTML(d,B){
  B=B||curBook();
  var kind=d&&d._kind, why=bookReason(d);
  if(kind==="timeout")
    return "<div class='code-err'><b>The booking service didn't answer in time.</b>"+
      "<span>It goes to sleep when it is quiet and takes a few seconds to wake up. "+
      "Tap again - the second try almost always works.</span></div>";
  if(kind==="net")
    return "<div class='code-err'><b>Couldn't reach the booking service.</b>"+
      "<span>Check your connection and try again. Your slip is saved either way.</span></div>";
  /* OUR LIMIT, NOT THE BOOKMAKER'S. The generic branch below would put
     SportyBet's name on a decision we made and then tell the reader to remove
     a leg - when nothing is wrong with their slip and nothing they do to it
     will help. Say whose rule it is and when it lifts. */
  if(kind==="capped")
    return "<div class='code-err'><b>That's today's ten booking codes.</b>"+
      "<span>The free run gives every device ten a day. Your slip is saved - "+
      "the code will be here after midnight. Everything else on the board "+
      "still works.</span></div>";
  return "<div class='code-err'><b>"+B.mark+" wouldn't take this slip.</b>"+
    (why?"<span>"+esc(why)+"</span>"
       :"<span>One of the picks may have just closed. Remove a leg and try again.</span>")+
    "</div>";
}
/* Which legs to drop after SportyBet has refused the slip.

   Both Get code buttons already retried once "without unavailable markets",
   and that retry could never fire. It re-filtered on OUR copy of sportyOdds -
   the same numbers the pre-flight had just cleared - so `safe` always equalled
   the list we sent, the `safe.length<picks.length` guard was never true, and
   the reader got "SportyBet wouldn't take this slip" with every leg intact.

   The disagreement is about time, not markets. The client reads the odds once
   at page load; the server's fixtures cache refreshes every 45 minutes. Leave
   a slip open across a refresh that thins a market and our copy still shows a
   price the server no longer has. Sentry caught exactly that: 31 legs sent,
   3 refused, all of them OVER_1.5.

   The server already answers the question - it names the offending legs in
   `unbookable` - and we were throwing that away. So trust it, and fall back to
   the local filter only when it says nothing. Clearing the odd as we go keeps
   the board from advertising a price that cannot be booked, and stops the same
   slip failing the same way on the next tap. */
function dropUnbookable(picks,d,B){
  B=B||curBook();
  var bad=(d&&d.unbookable)||[];
  /* Keyed on the id THIS book used, not on the pick's SportyBet id: the
     server echoes back whatever we sent it, so matching on the wrong one
     drops nothing and the retry resends the same doomed slip. */
  if(bad.length){
    var kill={};
    bad.forEach(function(b){kill[b.eventId+"|"+b.prediction]=1;});
    var key=function(c){return bookIdOf(c,B)+"|"+c.code;};
    var kept=picks.filter(function(c){return !kill[key(c)];});
    /* Our price for that market was wrong. Forget it rather than keep showing
       it - the pre-flight and the board both read this. */
    picks.forEach(function(c){
      if(!kill[key(c)]) return;
      var f=c.f||fixtureById(c.id);
      if(f&&f[B.odds]) delete f[B.odds][c.code];});
    return kept;
  }
  /* NO LIST, NO GUESS. This used to fall back to our own odds and drop
     whatever we held no price for - the same false evidence that made the
     pre-flight refuse legs SportyBet was happy to take (see `full` on the
     BOOKS table and JTEJA5). A book's own named refusal is information; our
     cache's silence is not, and dropping a leg on it means resending a slip
     the reader never agreed to shorten. When the server names nothing the
     slip stands as it is and the error is shown. The book must still list the
     game - that check never lied. */
  return picks.filter(function(c){return !!bookIdOf(c,B);});
}
const SPORTY_URL="https://www.sportybet.com/ng/?shareCode=";
/* Their own bundle matches /[?&]bookABetCode=([\da-zA-Z]+)/ against
   window.location.search - so this is the parameter, and "BookABet" (which
   was a guess from the POST endpoint's name) loaded their home page with the
   code ignored. */
const B9_URL="https://sports.bet9ja.com/?bookABetCode=";
const B9_BOOK_URL="/api/book?book=bet9ja";
/* The same booking code loads the same slip on football.com, which until now
   the modal only mentioned in a footnote - leaving anyone who uses that app to
   copy the code and find their own way there. */
const FOOTBALL_URL="https://www.football.com/ng/m?shareCode=";
/* football.com serves a 404 for /.well-known/assetlinks.json, which is the file
   Android requires before it will let an app claim a site's https links. So a
   plain https link can never open their app, however installed it is - which is
   why SportyBet's opens and theirs did not.
   An intent:// URL asks Android for the app by name instead. The fallback is
   the part that makes this safe: no app, wrong package, or an app that does not
   want the link, and the browser opens the web page exactly as it does today.
   Android only - nothing else understands the scheme, and iOS and desktop are
   already served properly by the plain URL. */
const FOOTBALL_PKG="com.football.app.android";
function footballLink(code){
  var web=FOOTBALL_URL+encodeURIComponent(code);
  if(!/android/i.test(navigator.userAgent)) return {href:web,blank:true};
  return {href:"intent://"+web.replace(/^https?:\/\//,"")+
    "#Intent;scheme=https;package="+FOOTBALL_PKG+
    ";S.browser_fallback_url="+encodeURIComponent(web)+";end", blank:false};
}
const BK_BOOK_URL="/api/book?book=betking";
/* BetKing has NO deep link for a booking code, and that is a finding rather
   than a gap we have not filled yet: their desktop bundle reads exactly one
   code from the URL (`couponCode`, for a coupon already placed) and nothing
   anywhere loads a BOOKED code from a query string. SportyBet has
   ?shareCode= and Bet9ja ?bookABetCode=; BetKing's booking code is typed into
   the betslip's own box.
   So `open` is null here on purpose, and the two places that draw "Open in X"
   say what to do instead. Appending the code to their home page would look
   like a working link and quietly drop the slip. */
const BK_URL=null;
/* Same-origin so Vercel's CDN can cache it - see lib/upstream.js. */
const SPORTY_FIXTURES="/api/fixtures";
/* Bet9ja. Same-origin for the same reason - see lib/upstream.js. */
const BET9JA_FIXTURES="/api/bet9ja";
/* BetKing, same again. */
const BETKING_FIXTURES="/api/betking";

/* The two bookmakers differ in what they are FOR, not just in their
   field names, and the matcher needs to know which it is filling in.

   SportyBet is also our odds source: blendFixture folds its prices into
   the model. Bet9ja is not, and deliberately. It covers 96.6% of the
   board against SportyBet's 100%, its listing carries no team-goals
   price at all (their per-league endpoint ignores the market group), and
   a second opinion feeding the model is a modelling change nobody asked
   for. It is here so that somebody who banks with Bet9ja can take the
   same slip to their own bookmaker. */
var BOOKS={
  /* `full` says whether the odds we hold for a book list EVERY market it
     offers. SportyBet's feed does. Bet9ja's does not, and cannot: the bulk
     endpoint ignores MKEY and returns the same default markets whatever you
     ask for, while the book itself carries 771 on one fixture. So a missing
     price means "not offered" for SportyBet and only "we did not fetch it"
     for Bet9ja - and only the first is worth telling a reader about.
     `blend` stays off for Bet9ja, and that is a MODELLING decision rather than
     an integration gap. bet9ja.py maps every under line since b93c250, so the
     mapping is no longer the obstacle - but blendFixture mutates the fixture
     itself, not a per-book view, so switching this on moves the probabilities
     every reader sees whichever bookmaker they use. Bet9ja also covers 96.6%
     of the board against SportyBet's 100%, so some fixtures would be blended
     against two books and some against one, and the published record and the
     calibration were both built on SportyBet-only prices.
     And it was measured on 2 Sep rather than argued. Across 54 top-flight
     games both books price, their de-vigged home-win probabilities differ by
     0.53 points on average and by more than three points on NONE of them,
     while the model sits ten to twenty points from both. The two books are one
     opinion, not two, so blending the second buys nothing.
     There is a trap waiting for anyone who flips this to true anyway:
     blendFixture reads f.sportyOdds whatever book it was called for, so it
     would run the SportyBet blend TWICE - market weight 30% becomes about 51%
     - and never read a Bet9ja price at all. Make blendFixture book-aware
     first, and only if those numbers ever start to diverge. */
  /* `wholeLines` says whether the book sells a whole-number line - Over 3.0,
     Asian -1.0 - the kind that pushes when the score lands exactly on it.
     SportyBet does; neither other book does, and a leg on one cannot travel to
     them without moving half a goal (see nearestLine). Read from here so the
     rule is about the book's catalogue rather than about its name.
     `arg` is what the upstream route calls the market on a selection -
     SportyBet's takes `prediction`, both others take `code` - and `skin` is
     the class suffix the branded surfaces use. Both are here rather than
     compared by name at the call site, because a name comparison is a place a
     new book gets silently left out. */
  /* `full` WAS TRUE AND IT WAS NOT. It claimed SportyBet's feed lists every
     market they offer on an event, which made "missing from our cache" read as
     "they do not sell it" - and that refusal happened in the browser, before
     any request. Their feed is partial per event: measured 15 Sep on the next
     day's card, Russian Premier League events carried 1/X/2, double chance, GG
     and the first-half lines with no Over/Under at all, and Swiss Super League
     events carried every Over/Under line with no 1X2 at all. Both book.
     A reader's own code, JTEJA5, held four legs we were refusing on the very
     event ids we match - Lugano 1X, Thun 1X, Baltika OVER_1.5, Lokomotiv
     OVER_2.5 - so the market was there and the "no" was ours.
     False now, which puts SportyBet on the same footing as the other two: the
     book is judged on whether it lists the GAME, and the market is answered by
     the bookmaker, who names what it will not take. server.py's _unbookable
     carries the same correction on the other side of the wire. */
  sporty:{key:"sporty",label:"SportyBet",id:"eventId",odds:"sportyOdds",blend:true, full:false, arg:"prediction",skin:"sb",readable:true, wholeLines:true},
  bet9ja:{key:"bet9ja",label:"Bet9ja",  id:"b9EventId",odds:"b9Odds",  blend:false,full:false,arg:"code",      skin:"b9",readable:true, wholeLines:false},
  /* BetKing, on the same terms as Bet9ja and for the same reason: a booking
     code is only any use to somebody who banks with the firm that issued it.
     `full` is false because their day feed carries the default markets only -
     no team goals, no first-half line - while the book itself prices 206 on a
     Premier League tie, which the booking route reads per event. So a missing
     price here means "we did not fetch it", never "they do not offer it".
     `blend` is false for the same modelling reason it is false for Bet9ja,
     not because the unders are missing: betking.py maps every under line, and
     blendFixture still reads f.sportyOdds whatever book it was called for. */
  betking:{key:"betking",label:"BetKing",id:"bkEventId",odds:"bkOdds",blend:false,full:false,arg:"code",skin:"bk",readable:true,wholeLines:false}
};

/* Common team name aliases that SportyBet uses but our data doesn't (or vice versa).
   These are applied AFTER accent stripping but BEFORE tokenization. */
var TEAM_ALIASES = {
  "athletico": "paranaense",
  "inter miami cf": "inter miami",
  "b. dortmund": "borussia dortmund",
  "b. monchengladbach": "borussia monchengladbach",
  "vfb stuttgart": "stuttgart",
  "sv werder bremen": "werder bremen",
  "rasenballsport leipzig": "leipzig",
  "eintracht frankfurt": "frankfurt",
  "bayern": "bayern munich",
  "bayer": "bayer leverkusen",
  "wolfsburg": "vfl wolfsburg",
  "hoffenheim": "tsg hoffenheim",
  "heidenheim": "1. fc heidenheim",
  "st. pauli": "fc st pauli",
  "union berlin": "1. fc union berlin",
  "real madrid cf": "real madrid",
  "atletico madrid": "atletico de madrid",
  "athletic bilbao": "athletic club",
  /* football-data abbreviates this one; "ath" is too short for the prefix rule
     in simTeams to bridge, so the two feeds scored 0.5 and missed each other. */
  "ath bilbao": "athletic club",
  "deportivo alaves": "alaves",
  "celta vigo": "celta de vigo",
  "real sociedad": "sociedad",
  "real betis": "betis",
  "valencia cf": "valencia",
  "villarreal cf": "villarreal",
  "sevilla fc": "sevilla",
  "getafe cf": "getafe",
  "osasuna": "ca osasuna",
  "mallorca": "rcd mallorca",
  "rayo vallecano": "rayo",
  /* Our feed says "Vallecano", SportyBet says "Rayo Vallecano". Without this
     the two scored zero against each other, which is half of how a La Liga
     fixture came to be booked as an Ecuadorian one - see sameSlot below. */
  "vallecano": "rayo",
  "girona fc": "girona",
  "las palmas": "ud las palmas",
  "cadiz cf": "cadiz",
  "almeria": "ud almeria",
  "granada cf": "granada",
  "ac milan": "milan",
  "inter": "internazionale",
  "as roma": "roma",
  "ss lazio": "lazio",
  "ssc napoli": "napoli",
  "juventus fc": "juventus",
  "torino fc": "torino",
  "fiorentina": "acf fiorentina",
  "bologna fc": "bologna",
  "udinese": "udinese calcio",
  "sassuolo": "us sassuolo",
  "empoli fc": "empoli",
  "salernitana": "us salernitana",
  "lecce": "us lecce",
  "cagliari": "cagliari calcio",
  "genoa": "genoa cfc",
  "hellas verona": "verona",
  "frosinone": "frosinone calcio",
  "psv eindhoven": "psv",
  "feyenoord": "feyenoord rotterdam",
  "az alkmaar": "az",
  "twente": "fc twente",
  "utrecht": "fc utrecht",
  "heerenveen": "sc heerenveen",
  "zwolle": "pec zwolle",
  "groningen": "fc groningen",
  "heracles": "heracles almelo",
  /* Our side is aliased to "sbv excelsior" while the odds feed writes
     "Excelsior Rotterdam", and neither name contains the other - so the club
     could not be matched from either direction. Both spellings now land on
     the same canonical name. */
  "excelsior": "sbv excelsior",
  "excelsior rotterdam": "sbv excelsior",
  "volendam": "fc volendam",
  "almere city": "almere city fc",
  "n.e.c.": "nec nijmegen",
  "sparta rotterdam": "sparta",
  /* ------------------------------------------------------------------
     Abbreviations one feed uses and the other does not. Every one of these
     was a fixture that could never be priced, taken from a live matcher log.
     They are exact whole-name keys, so none can fire on a name that merely
     contains the abbreviation. */
  /* QPR COLLAPSES DOWN, NOT UP, AND THE DIRECTION IS THE WHOLE POINT.
     Aliasing "qpr" to the full "queens park rangers" fixed the reported miss
     and bought two far worse matches with it: the full name contains "rangers"
     as a whole word and "queens park" as a whole phrase, so QPR scored 1.80
     against GLASGOW RANGERS and against Queens Park FC - two other clubs, one
     of them in a different country. Caught by diffing every name pair the live
     feeds produce; it would have shown up as a Premiership fixture priced off
     a Championship one.
     Mapping the long name down to the short one has no such reach: "qpr"
     contains nothing and is contained by nothing. Any feed spelling of the
     club lands on it, and neither Rangers nor Queens Park can get near it.
     The lesson generalises - when a club's full name contains another club's
     whole name, alias TOWARD the form that does not. */
  "queens park rangers": "qpr",
  /* TWO CLUBS CALLED AMERICA, IN TWO COUNTRIES. Club America of Mexico City
     normalises to bare "america", which is a whole-word containment inside
     America de Cali's "america cali" - so the two scored 1.80, the figure
     reserved for an exact or containing name, and a Liga MX fixture could be
     priced off a Colombian one. Giving the Mexican club its full name keeps
     the two apart while still matching either feed's spelling of it, since
     both arrive here as "america" before this line runs. */
  "america": "club america",
  "for sittard": "fortuna sittard",
  "inverness c": "inverness caledonian thistle",
  /* "the" is stripped before aliases run, so the feed's "Queen of the South"
     arrives here as "queen of south". */
  "queen of sth": "queen of south",
  "airdrie united": "airdrieonians",
  "volos nps": "volos nfc",
  "rapid bucuresti": "rapid 1923",
  /* FCSB, WITH A CAVEAT WORTH KNOWING. The Bucharest club plays as FCSB in one
     feed and Steaua in the other, and without this it matched nothing at all.
     But CSA Steaua Bucuresti is a DIFFERENT, lower-division club carrying the
     same name, so this alias makes the two collide if they ever appear on one
     card. They are separated by division, not by name, and that is the whole
     of the protection - if the tier filter is ever loosened, revisit this
     line first. */
  "fcsb": "steaua bucharest",
  "rkC waalwijk": "rkC",
  "sc freiburg": "freiburg",
  "vfl bochum": "bochum",
  "vfl wolfsburg": "wolfsburg",
  "fc koln": "koln",
  "ath madrid": "atletico de madrid",
  "cologne": "koln",
  "1 fc nuremberg": "nurnberg",
  "1 nuremberg": "nurnberg",
  "fotbal club fcsb": "steaua bucharest",
  "sheffield wednesday": "sheffield weds",
  "m'gladbach": "monchengladbach",
  "mgladbach": "monchengladbach",
  "eif": "ekenas",
  "hamburger sv": "hamburg",
  "hamburger": "hamburg",
  "fotbal fcsb": "steaua bucharest",
  "m gladbach": "monchengladbach",
  "borussia m gladbach": "monchengladbach",
  "borussia mgladbach": "monchengladbach",
  "borussia monchengladbach": "monchengladbach",
  "borussia mgladbach": "monchengladbach",
  "tsg 1899 hoffenheim": "hoffenheim",
  "sv darmstadt 98": "darmstadt",
  "fc heidenheim": "heidenheim",
  "fc union berlin": "union berlin",
  "1. fc koln": "koln",
  "1. fc heidenheim": "heidenheim",
  "1. fc union berlin": "union berlin",
  "fc st. pauli": "st. pauli",
  "fc augsburg": "augsburg",
  "vfb stuttgart": "stuttgart",
  "eintracht frankfurt": "frankfurt",
  "bayer 04 leverkusen": "leverkusen",
  "borussia dortmund": "dortmund",
  "fc bayern munchen": "bayern munich",
  "rb leipzig": "leipzig",
  /* Finnish clubs are known by their initials on our side and written out in
     full by SportyBet, so the two share no token at all and scored zero. Both
     spellings fold to the long form. */
  "sjk": "seinajoen jk",
  "tps": "turun palloseura",
  "kups": "kuopion palloseura",
  "vps": "vaasan palloseura",
  "hjk": "hjk helsinki",
  "ifk mariehamn": "mariehamn",
  /* The first alias Bet9ja has needed, and the only one so far.
     They list Rosario Central as "Atletico Rosario" - the club is Club
     Atletico Rosario Central and their feed keeps the wrong two words of it.
     Identified rather than guessed: the fixture is against Newell's Old Boys,
     which is the Rosario derby, kicking off the same minute as ours, and the
     Argentine top flight has no club called Atletico Rosario. It costs a
     second fixture as well - they carry "Tigre - Atletico Rosario" a week
     later. */
  "atletico rosario": "rosario central",
  /* Renamed, and the feeds have not agreed on it. */
  "shenzhen xinpengcheng": "shenzhen peng city",
  /* Both were matching, but only on kick-off time with the name scoring
     0.00 - the clock carrying a pairing the names could not. That works
     until two games in the same league start together, and then the
     fixture goes unpriced. Greek ει against ι is one letter, so the
     containment rule misses by a hair; Basaksehir is a different word
     in each feed. Aliased to the same canonical form, not bridged with a
     general rule: "istanbul" alone would also match Kasimpasa Istanbul. */
  "levadeiakos": "levadiakos",
  "buyuksehyr": "basaksehir",
  "istanbul bb": "basaksehir",
};

/* normTeam is the hottest function on the page by a wide margin - matching the
   feed to the fixtures, and every form strip, runs through it - and it is
   twenty-odd regexes over the same few hundred strings. Measured on a real
   payload it was called 617,000 times per load across roughly 1,300 distinct
   names. It is a pure function of its input, so the answer is worth keeping.
   Null-prototype map, so a club called "constructor" cannot collide with
   Object.prototype. Capped because the key space is club names, not user
   input, but a runaway feed should not be able to grow this without bound. */
var NT_CACHE=Object.create(null), NT_SIZE=0;
const NT_MAX=20000;
function normTeam(s){
  var k=s||"";
  var hit=NT_CACHE[k];
  if(hit!==undefined) return hit;
  var v=normTeamRaw(k);
  if(NT_SIZE<NT_MAX){NT_CACHE[k]=v;NT_SIZE++;}
  return v;
}
function normTeamRaw(s){
  s=(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
  s=s.replace(/ø/g,"o").replace(/æ/g,"ae").replace(/å/g,"a").replace(/ß/g,"ss")
     .replace(/đ/g,"d").replace(/ð/g,"d").replace(/ł/g,"l").replace(/ı/g,"i").replace(/þ/g,"th");
  /* Every punctuation mark, not a hand-picked five. "Saint Patrick´s" carries
     U+00B4, an acute accent standing in for an apostrophe, which survived the
     old class and left the token as "patrick´s" - so it matched nothing. The
     transliterations above have already done their work by this point, so
     anything still not a letter, digit or space is a separator. */
  s=s.replace(/[^a-z0-9 ]/g," ");
  /* Transliteration collapse: our data and SportyBet disagree on how they
     romanise Scandinavian vowels - Brondby vs Broendby (ø), Valerenga vs
     Vaalerenga (å). Collapse both spellings to the short form so they match. */
  s=s.replace(/oe/g,"o").replace(/aa/g,"a");
  s=s.replace(/\butd\b/g,"united");
  /* Abbreviated qualifiers. Our feed writes "Dep. Riestra", "Atl. Tucuman",
     "Ind. Rivadavia", "St. Patricks"; SportyBet writes them out in full. The
     token compare below will not bridge a three-letter stub to its full word,
     so bridge it here. Which spelling wins does not matter - both feeds run
     through this same function, so all that matters is that they converge. */
  s=s.replace(/\bdep\b/g,"deportivo").replace(/\batl\b/g,"atletico")
     .replace(/\bind\b/g,"independiente");
  /* "st" is deliberately not expanded. It looked obvious - "St. Patricks"
     against "Saint Patrick's" - but Saint is not the only thing it stands for:
     "St. Gilloise" is Union Saint-Gilloise, which SportyBet lists as "Union
     Gilloise", and expanding ours to "saint gilloise" pushed the two apart.
     Left alone the stub is two characters, dropped by tokset, and the clubs
     match on the name that actually distinguishes them. */
  /* Only expansions an actual miss called for. A speculative "univ" ->
     "universidad" looked harmless and broke Romania: Rapid Bucuresti v Univ.
     Craiova had been matching, and Craiova is Universitatea, not Universidad,
     so the expansion pushed the two spellings apart. An abbreviation means
     different things in different languages - leave the stub alone unless a
     real miss shows it has to go. */
  /* Same club, different language. */
  s=s.replace(/\bvienna\b/g,"wien");
  /* Cross-feed spelling variants seen in the wild (RU/AR leagues). */
  s=s.replace(/\bdynamo\b/g,"dinamo").replace(/\btogliatti\b/g,"tolyatti")
     .replace(/\bjrs\b/g,"juniors").replace(/\bjr\b/g,"juniors");
  s=s.replace(/\bman united\b/g,"manchester united").replace(/\bman city\b/g,"manchester city")
     .replace(/\bpsg\b/g,"paris").replace(/\bparis sg\b/g,"paris").replace(/\bparis saint germain\b/g,"paris")
     .replace(/\bspurs\b/g,"tottenham").replace(/\bwolves\b/g,"wolverhampton")
     .replace(/\bnott m forest\b/g,"nottingham forest").replace(/\bnottm forest\b/g,"nottingham forest")
     .replace(/\bwest brom\b/g,"west bromwich").replace(/\bespanyol\b/g,"espanol")
     .replace(/\bolympiacos\b/g,"olympiakos").replace(/\baustria lustenau\b/g,"lustenau")
     /* Transliteration and abbreviation seen across the two feeds. Krylia and
        Krylya are the same Samara club spelt two ways, and one feed adds the
        city while the other does not - collapsing the spelling lets ordinary
        word containment do the rest. "Rvs" is how the Scottish feed shortens
        Rovers. */
     .replace(/\bkrylya\b/g,"krylia").replace(/\brvs\b/g,"rovers")
     .replace(/\ba lustenau\b/g,"lustenau").replace(/\batromitos athinon\b/g,"atromitos");
  s=s.replace(/^\s*sporting\s*$/,"sp lisbon");
  s=s.replace(/\b(pa|sp|rj|mg|rs|sc|pr|ce|ba|go|pe|df|am|mt|ms|es|pb|rn|al|pi|ma|to|ap|ac|ro|rr|se)\b/g," ");
  s=s.replace(/\b(fc|fk|cf|afc|ac|as|sv|us|ss|ssc|cd|ca|sk|if|bk|clube|club|do|da|de|dos|das|the|ec|se|ad|aa|cr|futebol)\b/g," ");
  s=s.replace(/\s+/g," ").trim();
  /* Apply aliases AFTER cleaning so we match the canonical form */
  if (TEAM_ALIASES[s]) s = TEAM_ALIASES[s];
  /* ...then put the alias through the same transliteration collapse the rest of
     the name already went through. Without this an alias had to be written in
     the collapsed spelling to work at all: "seinajoen jk" never matched the
     feed, because the feed's own "Seinajoen JK" had already become
     "seinajon jk" up above, and "vaasan" had become "vasan". Aliases can now be
     written the way the club is actually spelt. */
  s = s.replace(/oe/g,"o").replace(/aa/g,"a").replace(/\s+/g," ").trim();
  return s;
}
/* Cached for the same reason normTeam above is, and measured the same way.
   normTeam was memoised and these two were not, which left the saving half
   collected: simTeams calls tokset twice and teamMarkers twice on every
   comparison, and attachEventIds' global fallback compares every fixture
   against every event on the feed. On the live payload - 462 fixtures, a
   2,003-event feed - that is 1.85 million simTeams calls, and caching these
   two took the block from 7,358ms to 2,094ms.
   Safe because both are pure functions of one string AND because each has
   exactly one caller which only ever reads the result: sameVariant reads
   teamMarkers' object, simTeams iterates tokset's array. Neither mutates.
   If that ever stops being true, these have to return copies. */
function tokset(s){
  var k=s||"";
  var C=tokset.C||(tokset.C=Object.create(null));
  var hit=C[k];
  if(hit!==undefined) return hit;
  var v=normTeam(k).split(" ").filter(function(w){return w.length>=3;});
  /* On the function, not in a module-level var, and capped like NT_CACHE.
     Two test files lift these functions out of the page by name and run them
     standalone; a cache declared outside would be undefined there, and the
     first thing anyone would do is stub it in the test - which is a second
     place to keep in step. Self-contained, it travels. */
  tokset.n=tokset.n||0;
  if(tokset.n<20000){C[k]=v;tokset.n++;}
  return v;
}
/* A reserve, youth or women's side is not its first team.
   Every string matcher gets this wrong by default and this one did: tokset
   drops tokens under three characters, which is exactly what "II" and "B"
   are, and the containment rule then scores "Stuttgart" against
   "Stuttgart II" at 1.8 - the same score it gives a genuine match. Measured
   before the fix, all of these collided at 1.80: Stuttgart II, Bayern Munich
   II, Real Madrid B, Jong Ajax, Jong PSV, Barcelona U19, Chelsea Women. These
   are real fixtures on the same card - Jong Ajax and Jong PSV play in the
   Eerste Divisie - so this could hang a reserve game's odds on a first-team
   pick, and the kick-off fallback below would have accepted it.
   Markers are compared as a SET that must agree exactly, separately from
   string similarity, because it is a different question. Mirrors markers()
   in lib/oracle.js, which got this guard when the same bug bit the results
   matcher; the odds matcher never had it. */
function teamMarkers(s){
  /* Cached alongside tokset above - see that comment for the measurement and
     for why this is safe. This is the more expensive of the two: it runs
     normalize("NFD") and three regexes over the raw name on every call, and
     sameVariant asks for BOTH sides before simTeams scores anything at all.
     The cache hangs off the function rather than sitting in a module-level
     var, and that is deliberate: test/variant.test.js lifts this function out
     of the page by name and evaluates it on its own, so a cache declared
     outside it would be undefined there. Self-contained, it travels. */
  var ck=s||"";
  var C=teamMarkers.C||(teamMarkers.C=Object.create(null));
  var hit=C[ck];
  if(hit!==undefined) return hit;
  var out={}, n=0;
  var raw=" "+String(s==null?"":s).toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g," ")+" ";
  function add(k){ if(!out[k]){out[k]=1;n++;} }
  /* Anchored to the END of the name. A reserve side is "Sociedad B",
     "Portland Timbers II", "Rosenborg BK 2" - the marker is always a
     suffix. Matching it anywhere would catch the Danish club B 93 and the
     Faroese B36 and B68, whose names simply begin with a B, and then a
     feed writing "B93" against one writing "B 93" would disagree about
     the marker and refuse a perfectly good match. */
  if(/ (ii|2|b) $/.test(raw)) add("reserves");
  /* A HYPHENATED NUMBER IS A RESERVE SIDE WHEREVER IT SITS. The rule above is
     anchored to the end of the name for good reason - see the comment - but
     the Russian feeds write the second team as "Dinamo-2 Makhachkala" and
     "Spartak-2 Moscow", with the city still to come. Measured: our first-team
     "Dinamo Makhachkala" scored 1.00 against "FC Dinamo-2 Makhachkala" with no
     marker found on either side.
     The hyphen is what makes this safe to read anywhere in the name, so it is
     tested against the ORIGINAL string, before punctuation is flattened to
     spaces. B 93 and B36 carry no hyphen and are untouched. */
  if(/-\s?(2|3|ii|iii)\b/i.test(String(s==null?"":s))) add("reserves");
  if(/ iii $/.test(raw)) add("third");
  if(/ (u ?1[5-9]|u ?2[0-3]) /.test(raw)) add("youth");
  /* ZhFK is the Russian women's-club prefix, transliterated. Measured: our
     "Krylya Sovetov" scored 1.80 against "Zhfk Krylya Sovetov Samara" - the
     women's side of the same club, an exact containment with no marker
     anywhere for the guard to catch. Wfc and Zhfc are the same abbreviation
     spelt differently. */
  if(/ (women|feminin|femenino|femenina|frauen|ladies|zhfk|zhfc|wfc) /.test(raw)) add("women");
  if(/ (reserves?|academy|youth|jugend|primavera|junioren) /.test(raw)) add("youth");
  /* Dutch reserve sides are named "Jong Ajax", with no numeral at all. */
  if(/ jong /.test(raw)) add("reserves");
  out.__n=n;
  /* Capped for the same reason NT_CACHE is: club names, not user input, but a
     runaway feed should not grow this without bound. */
  teamMarkers.n=teamMarkers.n||0;
  if(teamMarkers.n<20000){C[ck]=out;teamMarkers.n++;}
  return out;
}
function sameVariant(a,b){
  var A=teamMarkers(a), B=teamMarkers(b);
  if(A.__n===B.__n){
    for(var k in A){ if(k!=="__n" && !B[k]) return false; }
    return true;
  }
  /* A FIRST TEAM WHOSE NAME ENDS IN A MARKER. Willem II is an Eredivisie club,
     not anybody's reserve side, and the marker rule is anchored to the end of
     the name - so "Willem II" reads as a reserve team while "Willem II
     Tilburg" does not, the two disagree, and simTeams returns 0. Measured: the
     fixture could never be matched at all, whatever the feed called it.
     The direction is what tells the two cases apart, and it is exact:
       marked name is a WORD-PREFIX of the unmarked one   -> same club
         "Willem II" inside "Willem II Tilburg" - the II belongs to the name,
         and the extra words are the rest of the club, not a squad.
       unmarked name is a word-prefix of the marked one   -> different
         "Stuttgart" against "Stuttgart II" - the marker is a suffix on a name
         that stands alone without it, which is exactly a reserve side.
     Everything else stays refused, so B 93 and Rosenborg BK 2 are untouched. */
  var marked   = A.__n>B.__n ? a : b;
  var unmarked = A.__n>B.__n ? b : a;
  var nm=normTeam(marked), nu=normTeam(unmarked);
  if(!nm||!nu) return false;
  return nm.length<nu.length && containsWords(nu,nm) && nu.indexOf(nm)===0;
}
/* Is `inner` present in `outer` as a run of whole words? */
function containsWords(outer,inner){
  if(!inner||inner.length>outer.length) return false;
  var i=outer.indexOf(inner);
  while(i>=0){
    var beforeOk = i===0 || outer.charAt(i-1)===" ";
    var end=i+inner.length;
    /* A trailing s still ends the word. Nordic and Spanish names carry it as a
       genitive or a feminine ending, not as a different club: Djurgarden
       against "Djurgardens IF", Aalesund against "Aalesunds FK", Espanol
       against "Union Espanola". Measured over 1.56m live name pairs, those
       three were the only real clubs a strict boundary lost, and allowing the
       one letter brings back none of the coincidences - every one of those
       fails on the character BEFORE the match, not after it. */
    if(end<outer.length && (outer.charAt(end)==="s"||outer.charAt(end)==="a")) end++;
    var afterOk = end===outer.length || outer.charAt(end)===" ";
    if(beforeOk&&afterOk) return true;
    i=outer.indexOf(inner,i+1);
  }
  return false;
}
function simTeams(a,b){
  var na=normTeam(a),nb=normTeam(b);
  if(!na||!nb) return 0;
  /* Asked before similarity, not after: a containing name scores 1.8 and
     would otherwise sail past every check below. */
  if(!sameVariant(a,b)) return 0;
  if(na===nb) return 2.0;  // max score for perfect match
  /* CONTAINMENT, ON WORD BOUNDARIES. A plain indexOf matches inside a word,
     and the names this feed carries are full of the resulting nonsense:
     "Tanta" sits inside "Farul ConsTANTA" and "Sparta" inside "SPARTAk
     Moscow", both scoring 1.8 - the score reserved for an exact or containing
     name. Measured on the live feeds, those two alone were one date check away
     from booking somebody onto the wrong fixture, and a wrong match is the one
     failure nothing downstream can correct.
     Requiring the shorter name to start and end on a word boundary keeps every
     real case - "Otelul" in "Otelul Galati", "Kalamata" in "PAE PS Kalamata" -
     and drops the coincidences. */
  if(containsWords(na,nb)||containsWords(nb,na)) return 1.8;
  var ta=tokset(a),tb=tokset(b),sh=0;
  /* "Urawa Reds" against "Urawa Red Diamonds" turned on nothing more than a
     plural: "reds" and "red" are not equal, and the prefix rule below needs
     four characters on both sides, which "red" does not have. A trailing s is
     not a different club. */
  function same(x,y){
    if(x===y) return true;
    if(x.length>=4&&y.length>=4&&(x.indexOf(y)===0||y.indexOf(x)===0)) return true;
    var sx=x.replace(/s$/,""), sy=y.replace(/s$/,"");
    return sx.length>=3&&sx===sy;
  }
  ta.forEach(function(x){ if(tb.some(function(y){return same(x,y);})) sh++; });
  return sh/Math.max(1,Math.min(ta.length,tb.length));
}
/* SportyBet sends startTime as epoch milliseconds, not as a date string, so
   Date.parse on it returns NaN - which is how the kick-off matcher below came
   to compare every event against NaN and quietly reject all of them. Takes a
   number, a numeric string, or a date string. */
function evStart(m){
  var t=m&&m.startTime;
  if(t==null) return NaN;
  if(typeof t==="number") return t;
  var n=Number(t);
  if(isFinite(n)&&n>1e11) return n;
  return Date.parse(t);
}
/* Two events with the same name are not the same match if they kick off two
   days apart. Reported: a slip booked from "Barcelona v Vallecano" in La
   Liga came back with an Ecuadorian game on it.
   "Barcelona SC" - Barcelona Sporting Club, Guayaquil - normalises to
   exactly "barcelona", because the SC is stripped as a Brazilian state
   code (Santa Catarina). So the home sides matched perfectly, and the
   away sides decided it: our feed writes "Vallecano" where SportyBet
   writes "Rayo Vallecano", which an alias folded to "rayo" - scoring
   ZERO against ours - while "Vallecano" matched "Independiente del VALLE"
   at 1.0 through the token prefix rule. The Ecuador fixture won 3.0 to
   2.0 and the right game lost to the wrong one.
   Measured on the live feed: of 214 attached fixtures, 212 sit within
   fifteen minutes of their event and one more within seven hours (a
   provisional time). The only one outside a day was this bug, at 52.5
   hours. A day is therefore a wide, safe fence.
   Permissive when either time is missing: no time is not evidence of a
   mismatch, and refusing on it would drop good matches whenever the feed
   omits a kick-off. */
var MATCH_WINDOW_MS=24*60*60*1000;
function sameSlot(f,m){
  if(!f||!f.kickoff) return true;
  var t=evStart(m); if(!isFinite(t)) return true;
  var k=Date.parse(f.kickoff); if(!isFinite(k)) return true;
  return Math.abs(t-k)<=MATCH_WINDOW_MS;
}
function attachTo(f,m,B){
  f[B.id]=m.eventId;
  f[B.odds]=m.odds||{};
  /* Only the bookmaker we price from moves the model. */
  if(B.blend) blendFixture(f);
}
/* THE FEEDS THEMSELVES, KEPT.
 *
 * Both bookmakers' event lists used to be consumed here and thrown away: what
 * survived was the ids attachEventIds managed to pin onto our own fixtures.
 * That made our board the only route between the two books, so a leg on a game
 * we do not carry - a reserve league, a country we have no results for - could
 * be read and split but never converted, because converting went their id ->
 * our fixture -> the other book's id and the middle step did not exist.
 * Keeping the list costs one reference and removes the middle step: a leg can
 * be matched straight against the other book's own events. See feedMatch. */
var FEED={};
/* A READ THAT LANDED BEFORE THE PRICES DID.
 *
 * byoRead can finish in a few hundred milliseconds while /api/fixtures is
 * still in flight, and the panel it draws asks questions that need prices: is
 * there a safer market on this game, does this bookmaker publish one. Asked
 * too early the answer is no to everything, and the offer never appeared -
 * measured on a real eleven-leg code, where three legs had a safer version and
 * the box came back empty.
 * So the panel is redrawn when the board changes under it. Not while the
 * reader is in the middle of something: a code on screen, or a conversion or a
 * swap already answered, means the redraw would take away what they were
 * looking at. */
function refreshByoPanels(){
  try{
    if(!BYO.legs||!BYO.legs.length) return;
    var out=$("byoOut"); if(!out||!out.innerHTML) return;
    if(document.getElementById("codeModal")) return;
    /* In flight counts as busy. The boxes are EMPTY between the tap and the
       reply, so content alone said "not busy" and the redraw took the panel
       out from under a booking that was already paid for. */
    if(BYO._booking) return;
    var busy=["byoConvOut","byoSaferOut"].some(function(id){
      var el=$(id); return el&&el.innerHTML.trim(); });
    if(busy) return;
    renderByo();
  }catch(e){}
}
function attachEventIds(sporty,B){
  B=B||BOOKS.sporty;
  if(!sporty||!sporty.length) return 0;
  try{ FEED[B.key]=sporty; }catch(e){}
  /* Verbose per-fixture match logging is opt-in: add ?debug=1 (or #debug) to the
     URL. Off by default so visitors get a clean console and we skip the
     full-feed closest-match scan that only exists to diagnose misses. */
  var SPORTY_DEBUG=false;
  try{SPORTY_DEBUG=/[?&]debug=1\b/.test(location.search)||/\bdebug\b/.test(location.hash);}catch(e){}
  var byDate={};
  sporty.forEach(function(m){
    if(!m.eventId||!m.startTime) return;
    var k=new Date(m.startTime).toISOString().slice(0,10);
    (byDate[k]=byDate[k]||[]).push(m);
  });
  /* WHAT THIS BOOKMAKER HAS PUBLISHED, and it is much less than the board.
     Checked on Bet9ja's live feed, 8 Sep: 385 events for 12 Sep, 232 for the
     13th, then 54, then 21 - and on the 15th they carry LaLiga, the EFL Cup
     and the Scottish Premiership and nothing else. So our Championship,
     Superettan and Ekstraklasa fixtures for that date are not misspelt, they
     are not listed yet, and printing them as NO MATCH buried the misses that
     ARE worth an alias under a pile that no alias can fix.
     Two questions answer it. Is the fixture past the last event they carry at
     all, and does the feed carry ANY event in that competition on that date -
     matching on the country word, which both feeds put first and neither
     abbreviates. */
  var feedMax=0, byLeagueDay={};
  sporty.forEach(function(m){
    var t=evStart(m);
    if(isFinite(t)&&t>feedMax) feedMax=t;
    if(!isFinite(t)) return;
    var day=new Date(t).toISOString().slice(0,10);
    /* Bet9ja carries the country in its own field; SportyBet's league string
       opens with it, as ours does. */
    var ctry=String(m.country||String(m.league||"").split(" ")[0]).toLowerCase();
    if(ctry) byLeagueDay[ctry+"|"+day]=1;
  });
  var hasCountries=Object.keys(byLeagueDay).length>0;
  var hits=0, nearMisses=0, noMatches=0, goneFromFeed=0, notListed=0;
  DATA.fixtures.forEach(function(f){
    var cand=[];
    /* Candidate window: ±3 days around our fixture date (SportyBet's UTC start
       can land a day either side of our local date, esp. late-night SA/MX games). */
    [-3,-2,-1,0,1,2,3].forEach(function(o){
      var dt=new Date(f.date+"T12:00:00Z"); dt.setUTCDate(dt.getUTCDate()+o);
      var k=dt.toISOString().slice(0,10);
      if(byDate[k]) cand=cand.concat(byDate[k]);
    });
    var best=null,bestScore=0;
    /* Exact-normalized match first: normTeam folds every known alias.
       An exact match on BOTH sides is allowed past the kick-off fence, and
       only that case is. The fence exists because of the Barcelona SC
       booking, and that was a FUZZY pairing - the home sides matched exactly
       while "Vallecano" scored 1.00 against "Independiente del VALLE" through
       the token prefix rule - so a test demanding both sides normalise
       identically cannot reach it. Bet9ja lists a La Liga round twelve days
       out on a provisional day, which put two fixtures more than 24 hours
       from ours with names that agreed perfectly. Measured before shipping
       (scripts/b9match.js --wide): Bet9ja 230 -> 232 of 238, SportyBet
       unchanged at 238. */
    var fh=normTeam(f.home),fa=normTeam(f.away);
    for(var i=0;i<cand.length;i++){
      if(normTeam(cand[i].homeTeam)===fh && normTeam(cand[i].awayTeam)===fa){best=cand[i];bestScore=99;break;}
    }
    if(!best) cand.forEach(function(m){
      if(!sameSlot(f,m)) return;
      /* Per-side scoring: BOTH sides must meet minimum (0.6), then combine */
      var sHome = simTeams(f.home, m.homeTeam);
      var sAway = simTeams(f.away, m.awayTeam);
      if (sHome >= 0.6 && sAway >= 0.6) {
        var combined = sHome + sAway;
        if (combined > bestScore) { bestScore = combined; best = m; }
      }
    });
    if(best && bestScore >= 1.2){  // lowered from 1.3
      attachTo(f,best,B); hits++; return;
    }
    /* Fallback: search ALL sporty events (not just ±3 days) with stricter threshold */
    var gb=null,gs=0;
    sporty.forEach(function(m){
      /* The widest net of the three, so it needs the fence most: this one
         searches every event on the feed regardless of date. */
      if(!sameSlot(f,m)) return;
      var sHome = simTeams(f.home, m.homeTeam);
      var sAway = simTeams(f.away, m.awayTeam);
      if (sHome >= 0.7 && sAway >= 0.7) {  // stricter for global search
        var combined = sHome + sAway;
        if (combined > gs) { gs = combined; gb = m; }
      }
    });
    if(gb && gs >= 1.4){  // lowered from 1.6
      attachTo(f,gb,B); hits++; return;
    }
    /* ------------------------------------------- reconcile by kick-off time
       Names are the weakest thing to match on, and the alias list only ever
       grows: every miss so far has been the same fixture spelt differently,
       and each one needed a human to notice and write a rule.
       The clock does not need a rule. Every miss had one side already certain
       - "Velez Sarsfield" against "Velez Sarsfield", "Salzburg" against
       "Salzburg" - and a kick-off to the minute. So: among the events starting
       at the same moment, if exactly one has a side we are already sure of,
       that is the fixture, whatever the other side is called.
       Uniqueness is what makes this safe. A full round kicks off together, so
       the same time alone means nothing; one certain side alone means nothing
       either, since a club plays many matches. Both together, with no second
       candidate, leave nothing else it could be. */
    var myKick = f.kickoff ? Date.parse(f.kickoff) : NaN;
    if (isFinite(myKick)) {
      var sameTime = [];
      sporty.forEach(function(m){
        var t = evStart(m);
        if (!isFinite(t) || Math.abs(t - myKick) > 10*60*1000) return;
        var sh = simTeams(f.home, m.homeTeam), sa = simTeams(f.away, m.awayTeam);
        /* One side at 1.8 is an exact or containing name, not a coincidence. */
        if (Math.max(sh, sa) >= 1.8) sameTime.push({m:m, sh:sh, sa:sa, sum:sh+sa});
      });
      /* Not "exactly one candidate" - on a Saturday a dozen games kick off
         together and several will share a common club word, so that test almost
         never fired when it was needed. What matters is that one candidate is
         clearly ahead of the rest: the best total at this kick-off, winning by
         a margin no near-miss could close. A second candidate within 0.4 means
         the clock cannot tell them apart, and then it is right to give up. */
      if (sameTime.length) {
        sameTime.sort(function(a,b){return b.sum-a.sum;});
        var top = sameTime[0];
        var clear = sameTime.length === 1 || (top.sum - sameTime[1].sum) >= 0.4;
        if (clear) {
          attachTo(f,top.m,B); hits++;
          if (SPORTY_DEBUG) try{console.log("["+B.key+"] BY KICK-OFF:", f.home, "v", f.away,
            "->", top.m.homeTeam, "v", top.m.awayTeam,
            "(sides", top.sh.toFixed(2), "/", top.sa.toFixed(2),
            "| runner-up", sameTime[1]?sameTime[1].sum.toFixed(2):"none", ")");}catch(e){}
          return;
        }
      }
    }

    /* Debug logging (opt-in via ?debug=1). Counts stay live for the summary. */
    if (bestScore > 0 && bestScore < 1.2) {
      nearMisses++;
      if (SPORTY_DEBUG) try{console.log("["+B.key+"] NEAR MISS:", f.home, "v", f.away, "->", best?.homeTeam, "v", best?.awayTeam, "score:", bestScore.toFixed(2));}catch(e){}
    }
    if (!best && bestScore === 0) {
      noMatches++;
      /* A game that has kicked off is gone from SportyBet's fixtures feed -
         they list what can still be bet on, and we keep the day's card on the
         board long after that. So an unmatched game that has already started
         is the expected outcome, not a naming failure, and logging it buries
         the ones that are still worth fixing. Counted, not printed. */
      var _started = (typeof notStarted==="function") && !notStarted(f);
      var _kick = f.kickoff ? Date.parse(f.kickoff) : NaN;
      var _country = String(f.league||"").split(" ")[0].toLowerCase();
      var _unpublished = !_started && (
        (isFinite(_kick) && feedMax && _kick > feedMax) ||
        (hasCountries && !byLeagueDay[_country+"|"+f.date]));
      if (_started) { goneFromFeed++; }
      else if (_unpublished) { notListed++; }
      else if (SPORTY_DEBUG) {
        /* Ungated closest event in the WHOLE feed - tells us "not in feed" (closest
           is unrelated, low score) vs "named differently" (closest IS this game). */
        var dbgBest=null, dbgScore=-1;
        sporty.forEach(function(m){
          var s = simTeams(f.home, m.homeTeam) + simTeams(f.away, m.awayTeam);
          if (s > dbgScore) { dbgScore = s; dbgBest = m; }
        });
        try{console.log("["+B.key+"] NO MATCH:", f.home, "v", f.away, "| league:", f.league, "| date:", f.date,
          "|| closest in feed:", dbgBest?(dbgBest.homeTeam+" v "+dbgBest.awayTeam):"(none)",
          "score:", dbgScore.toFixed(2),
          "start:", dbgBest?new Date(dbgBest.startTime).toISOString().slice(0,10):"-");}catch(e){}
      }
    }
  });
  try{console.log("["+B.key+"] matched "+hits+"/"+DATA.fixtures.length+" from "+sporty.length+
    " events (near:"+nearMisses+", none:"+noMatches+", of which "+goneFromFeed+
    " already kicked off and "+notListed+" not published by them yet; feed runs to "+
    (feedMax?new Date(feedMax).toISOString().slice(0,10):"?")+")");}catch(e){}
  return hits;
}

/* ---- the booking half of a bookmaker -----------------------------------
   Below attachEventIds on purpose. The matching tests evaluate the source
   from `var BOOKS={` to the end of attachEventIds, so anything in that
   range runs when they do - and this half needs endpoints, localStorage
   and a DOM. The table above is shared; everything that books lives here. */
/* Which book the buttons act on. Remembered, because somebody who banks with
   Bet9ja banks with Bet9ja every time and should not have to say so twice. */
var BOOK_KEY="sw.book";
var BOOKMAKER="sporty";
try{ var _b=localStorage.getItem(BOOK_KEY); if(_b&&BOOKS[_b]) BOOKMAKER=_b; }catch(e){}
function curBook(){ return BOOKS[BOOKMAKER]||BOOKS.sporty; }
function setBook(k){
  if(!BOOKS[k]||k===BOOKMAKER) return;
  BOOKMAKER=k;
  /* Its ids are what every badge, count and booking on the next repaint will
     ask about, and repaintAfterMatch runs again when they land. */
  try{ ensureBookFeed(k); }catch(e){}
  try{ localStorage.setItem(BOOK_KEY,k); }catch(e){}
  /* Whatever the last book said about this slip is now about the wrong book.
     "bet9ja doesn't have 2 of these games" is not true of SportyBet, and
     leaving it up covered the button that would have found that out. */
  try{ clearPrompts(); }catch(e){}
  /* The badges on every leg say whether THIS book has the game, so they all
     change meaning at once. */
  try{ renderBuilder(); }catch(e){}
  try{ if($("mySheet")&&$("mySheet").classList.contains("on")) renderMySheet(); }catch(e){}
  try{ paintBookPickers(); }catch(e){}
}
/* The event id this book knows the fixture by. Picks carry SportyBet's id
   inline from when they were built, so read the fixture rather than the pick -
   one of the two ids would otherwise always be missing. */
function bookWire(){
  BOOKS.sporty.book=BOOK_URL;
  BOOKS.sporty.open=SPORTY_URL;
  BOOKS.sporty.sel=function(c){return {eventId:bookIdOf(c,BOOKS.sporty),prediction:c.code};};
  BOOKS.sporty.codeOf=function(d){return d&&d.booking_code;};
  /* SportyBet lists team totals on roughly half its card and one leg it
     cannot take rejects the whole ticket, so a real price in the listing is
     the proof the market exists. */
  /* JUDGED ON THE GAME NOW, LIKE THE OTHER TWO, and for the reason their own
     comments give: a feed that does not list every market cannot be used to
     prove a market absent. SportyBet's does not - see `full` on the table
     above and JTEJA5, four legs refused here that the bookmaker took. What
     stays is the check that matters and never lied: does this book list the
     game. A market they turn out not to price comes back named, and the retry
     drops exactly that leg. */
  BOOKS.sporty.priced=function(c){ return !!bookIdOf(c,BOOKS.sporty); };

  /* `label` is the name in a sentence; `mark` is the brand drawn in its own
     colours, for the places that show a logo rather than say a word. */
  BOOKS.sporty.mark="<span class='sbm'>SportyBet</span>";
  BOOKS.bet9ja.mark="<span class='b9m'><span class='b9r'>bet</span>"+
    "<span class='b9g'>9ja</span></span>";

  BOOKS.bet9ja.book=B9_BOOK_URL;
  BOOKS.bet9ja.open=B9_URL;
  BOOKS.bet9ja.sel=function(c){return {eventId:bookIdOf(c,BOOKS.bet9ja),code:c.code};};
  BOOKS.bet9ja.codeOf=function(d){return d&&d.code;};
  /* Bet9ja is judged on the event, not on the listed price, and that is not
     an oversight. Their per-league feed ignores the market group, so it never
     carries a team-goals price - but the booking route reads the event itself,
     which has about thirteen hundred markets, and books it happily. Requiring
     a listed price here would refuse legs the bookmaker will take. If it turns
     out not to price one, it now says so by name and the retry drops it. */
  BOOKS.bet9ja.priced=function(c){ return !!bookIdOf(c,BOOKS.bet9ja); };

  BOOKS.betking.mark="<span class='bkm'><span class='bkk'>Bet</span>"+
    "<span class='bkg'>King</span></span>";
  BOOKS.betking.book=BK_BOOK_URL;
  BOOKS.betking.open=BK_URL;
  BOOKS.betking.sel=function(c){return {eventId:bookIdOf(c,BOOKS.betking),code:c.code};};
  BOOKS.betking.codeOf=function(d){return d&&d.code;};
  /* Judged on the event, not on the listed price - the same call as Bet9ja
     and for the same reason. Their day feed has no team-goals price on any
     fixture, while the booking route reads the event's own card and books it.
     A leg they turn out not to price comes back named, and the retry drops
     exactly that one. */
  BOOKS.betking.priced=function(c){ return !!bookIdOf(c,BOOKS.betking); };
}
/* A question on screen and a Get code button beside it are two ways to do the
   same thing, and the button knows nothing about the choice being offered -
   press it and you are asked again. So while a confirmation is up, the button
   that raised it stands down. The card carries its own Book and Cancel. */
function promptFoot(target){
  return $(target==="myBookResult"?"mySheetFoot":"bldFoot");
}
function showPrompt(target,html){
  var el=$(target); if(!el) return false;
  el.innerHTML=html;
  var f=promptFoot(target); if(f) f.classList.add("prompting");
  return true;
}
function clearPrompt(target){
  var el=$(target); if(el) el.innerHTML="";
  var f=promptFoot(target); if(f) f.classList.remove("prompting");
}
/* Every prompt on the page, whichever slip raised it. */
function clearPrompts(){ clearPrompt("bookResult"); clearPrompt("myBookResult"); }
/* Will this book actually take this leg?
   bookIdOf answers a narrower question: does the book have the GAME. It says
   nothing about the market, and Bet9ja carries plenty of fixtures without
   carrying every line on them. Counting ids alone reported a whole slip as
   bookable, the API then refused a leg, and the reader watched a game vanish
   after booking with only a warning to explain it. The count is supposed to
   be the warning.
   If we hold no prices for this book at all we know nothing, and the id is
   the honest guess - reporting nought of twenty-two because a feed has not
   finished loading is worse than being optimistic. */
/* WILL THIS BOOK TAKE THIS LEG? ONE FUNCTION, THREE ANSWERS.
 *
 * This question was being answered in five places and got the same thing wrong
 * three times: the slider, the API's pre-flight, and bookTakes each read "no
 * price in our cache" as "this book has not got it". The cache holds what the
 * SWEEP fetches - 24 markets - so anything outside that list is absent from it
 * on every fixture, and judging those against it refuses them everywhere.
 * Reported last as Inter v Udinese: 28 priced keys on the fixture and every new
 * market refused.
 *
 * A boolean cannot say the thing that matters, which is why the mistake kept
 * coming back. There are three states:
 *
 *   "priced"     we hold this book's own price for this market. Proof it exists.
 *   "not-priced" we hold this book's prices for this fixture and this market is
 *                not among them. Proof it does NOT exist - only ever said about
 *                a market the sweep actually fetches.
 *   "unknown"    we cannot tell from here: a market the sweep never asks for, a
 *                fixture we hold no prices for, or a book whose cache is not its
 *                whole book. The booking route reads the event itself and
 *                refuses by name, so "unknown" is sent and answered honestly.
 *
 * Everything else asks THIS. Nothing else may index an odds cache to decide
 * whether a leg can be booked - test/bookability.test.js enforces that.
 */
/* TWO QUESTIONS, NOT ONE, and keeping them apart is the point. "Does this book
   list the GAME" is answered by an event id, which arrives asynchronously -
   attachEventIds runs after boot - so a missing id means "not yet", never "no".
   Folding it in here would empty both builders every time the id feed was slow,
   which the original comment on this code warned about in as many words. So
   bookVerdict answers only about the MARKET, and the callers that are about to
   send something to a bookmaker add the id check themselves. */
function bookVerdict(f,code,B){
  B=B||curBook();
  /* Bet9ja's bulk endpoint returns a handful of markets whatever you ask it
     for, out of the hundreds it sells, so its cache proves nothing either way. */
  if(!B.full) return "unknown";
  if(!fetchedMarket(code)) return "unknown";
  var o=f&&f[B.odds];
  if(!o||!Object.keys(o).length) return "unknown";
  var v=o[code];
  return (v&&v>1.01)?"priced":"not-priced";
}
/* The two questions the callers actually ask, both in terms of the one above. */
function bookMayTake(f,code,B){ return bookVerdict(f,code,B)!=="not-priced"; }
function bookIsPriced(f,code,B){ return bookVerdict(f,code,B)==="priced"; }
/* The old body of this function is now bookVerdict above, which says WHY
   rather than only yes or no. Kept as the name every call site already uses. */
function bookTakes(c,B){
  B=B||curBook();
  /* Booking needs both: the book must list the game AND must not be known to
     refuse the market. */
  if(!bookIdOf(c,B)) return false;
  var f=(c&&c.f)||fixtureById(c&&c.id);
  return bookMayTake(f,c&&c.code,B);
}
function bookIdOf(c,B){
  B=B||curBook();
  var f=(c&&c.f)||fixtureById(c&&c.id);
  /* The fixture first, because a later match run updates it and the pick's
     copy is a snapshot from when the pick was made. The pick second, because
     picks are built carrying `eventId` and one can outlive the fixture it came
     from - a slip restored from storage after the board has moved on. Reading
     only the fixture dropped exactly those legs. */
  return (f&&f[B.id])||(c&&c[B.id])||null;
}
bookWire();

/* The picker. Two pills, each carrying how much of the slip that book can
   take - the count is the whole reason this is a choice and not a preference,
   because Bet9ja does not carry every game SportyBet does. */
/* The slip the picker governs, which is My slip and only My slip.
   There used to be a second one on the builder page. It was wrong twice over:
   it showed above a slip of nought games before anything was conjured, and it
   showed through underneath the sheet as a duplicate pair of pills. The
   builder does not need one anyway - the choice is remembered in sw.book, so
   setting it once where the slip is visible governs every booking including
   the ones started from the builder's own foot. */
function pickerPicks(){
  try{
    return MYSLIP.map(function(x){return {id:x.id,f:fixtureById(x.id),code:x.code};});
  }catch(e){ return []; }
}
function paintBookPickerWith(el,picks){
  if(!el) return;
  /* Nothing to book is no choice to make. */
  if(!picks.length){ el.hidden=true; el.innerHTML=""; return; }
  el.hidden=false;

  var n=picks.length;
  var html="<span class='bookpick-l'>Book with</span>";
  /* Derived from the table rather than listed again. A third book added to
     BOOKS and forgotten here is a book nobody can choose. */
  Object.keys(BOOKS).forEach(function(k){
    var B=BOOKS[k];
    var got=picks.filter(function(c){return bookTakes(c,B);}).length;
    /* Only worth showing when it is not the whole slip - "12/12" on both pills
       is noise that makes the row look like a warning. */
    var cnt=(got<n)?("<small>"+got+"/"+n+"</small>"):"";
    html+="<button type='button' class='bp"+(BOOKMAKER===k?" on":"")+"' data-book='"+k+"'"+
      " aria-label='"+esc(B.label)+"' aria-pressed='"+(BOOKMAKER===k)+"'>"+B.mark+cnt+"</button>";
  });
  el.innerHTML=html;
}
/* My slip is the default source, which is right for the sheet and wrong for
   the builder - the builder passes its own picks in. */
function paintBookPicker(el){ paintBookPickerWith(el,pickerPicks()); }
function paintBookPickers(){
  /* The pills carry how much of the slip each book can take, and that count is
     the whole reason this is a choice. So a picker on screen is the other
     signal that the other feeds are wanted. */
  try{ Object.keys(BOOKS).forEach(ensureBookFeed); }catch(e){}
  try{ document.querySelectorAll('[data-bookpick]:not([data-bookpick="build"])')
    .forEach(paintBookPicker); }catch(e){}
  /* "book them to SportyBet" is a promise about which app the code opens in,
     and it was hardcoded - so choosing Bet9ja left the sheet still naming
     SportyBet above a button that would produce a Bet9ja code. */
  try{
    var sub=$("mySheetSub");
    if(sub) sub.innerHTML="Predictions you picked - book them to "+curBook().mark+".";
    var ap=$("bldApprox");
    if(ap) ap.textContent="*Est. odds are a rough model guide - real "+
      curBook().label+" odds are usually lower.";
    /* THE OFFER CARD PROMISED ONE BOOKMAKER OUT OF THREE. It is the first
       thing a reader meets and it said "Build me a SportyBet slip" whatever
       book they had chosen - so a BetKing reader was invited to build a slip
       for somebody else's app, and the card's own sub-line promised a
       SportyBet code above a button that would produce a BetKing one. Same
       rule as the two lines above it: name the book the reader is actually on,
       and let the picker change it. */
    var cl=document.querySelector(".sc-go-primary .sc-lbl");
    if(cl) cl.innerHTML="Build me a "+curBook().mark+" slip";
    var tz=$("scTease");
    if(tz) tz.textContent="We pick the games. You get a "+curBook().label+
      " code to play them.";
  }catch(e){}
  /* The board's Book all carries a count of the games this book can take, so
     it goes stale the moment the book changes - same reason as the sentences
     above. */
  try{ renderBookAll(); }catch(e){}
  paintMyNote();
}
/* Repainted with the picker, not only with the sheet: switching book is
   exactly when this sentence stops or starts being true. */
function paintMyNote(){
  var n=$("myNote"); if(!n) return;
  try{
    var picks=pickerPicks();
    var hint=picks.length?bookOnlyHint(picks):"";
    n.textContent=hint;
    n.hidden=!hint;
  }catch(e){ n.textContent=""; n.hidden=true; }
}
document.addEventListener("click",function(e){
  var b=e.target&&e.target.closest&&e.target.closest("[data-book]");
  if(!b) return;
  e.preventDefault();
  setBook(b.getAttribute("data-book"));
  paintBookPickers();
});
/* Every leg shows "no ID" until this has run, because that badge is simply
   the absence of an event id. So a single bad moment upstream - the API
   restarting, a phone between cells - used to poison the whole session: the
   fetch failed, the error was swallowed, nothing retried, and every game on
   the slip read as unavailable on SportyBet until the page was reloaded.
   It retries now, backing off, and repaints when a late attempt lands so the
   badges clear themselves instead of lying until the next render. */
/* Bet9ja's feed is one object keyed by event id, and it names the two sides in
   a single "Home - Away" string. Reshaped here, once, into what the matcher
   already speaks, rather than teaching the matcher a second dialect.
   " - " and not "-": plenty of clubs carry a hyphen (Union Saint-Gilloise),
   and splitting on the bare character cuts them in half. */
function b9Rows(matches){
  var out=[];
  for(var k in matches){
    var m=matches[k]; if(!m||!m.eventId) continue;
    var bits=String(m.teams||"").split(" - ");
    if(bits.length<2) continue;
    out.push({eventId:m.eventId,
              homeTeam:bits[0].trim(),
              awayTeam:bits.slice(1).join(" - ").trim(),
              startTime:Date.parse(m.kickoff),
              league:m.league,country:m.country,odds:m.odds||{}});
  }
  return out;
}
/* Failing here costs the Bet9ja button on a leg and nothing else: the board,
   the model and the SportyBet code are all untouched. So one quiet attempt,
   no retry ladder, and never a thrown error. */
async function loadBet9ja(){ return loadSecondBook(BET9JA_FIXTURES,BOOKS.bet9ja); }
/* BetKing's feed is the same shape - one object keyed by event id, the two
   sides in a single "Home - Away" string - so it goes through b9Rows rather
   than a second reshaper that would drift from it. */
async function loadBetKing(){ return loadSecondBook(BETKING_FIXTURES,BOOKS.betking); }
async function loadSecondBook(url,B){
  try{
    var r=await fetch(url,{headers:{Accept:"application/json"}});
    if(!r.ok) return 0;                 /* 503 while their sweep is still cold */
    var d=await r.json();
    var rows=b9Rows((d&&d.matches)||{});
    var n=rows.length?attachEventIds(rows,B):0;
    if(n) refreshByoPanels();
    return n;
  }catch(e){ return 0; }
}
/* Bet9ja never blocks the board. SportyBet is awaited because the model wants
   its prices before the first paint; Bet9ja only decides whether a second
   button appears on a leg, so it rides alongside and repaints if it lands. */
/* "SportyBet code in one tap", where the name flickers.
 *
 * SportyBet is where it rests and where it returns. This is a SportyBet site -
 * the hero button says so and most readers arriving have an account there - so
 * the line reads "SportyBet" almost all of the time and shows the other two the
 * way a sign shows a second language: briefly, then back. Cycling evenly
 * through three would have said the opposite of what is true.
 *
 * The box is SportyBet's width and stays there, so nothing on the line ever
 * moves. A visitor wider than that is scaled down to fit - football.com
 * arrives a little smaller than the name it interrupts, which is the correct
 * order of importance said in the type rather than in a caption.
 *
 * Paused when the tab is hidden, and never started at all for a reader who has
 * asked their machine for less motion: a glitch in the first screenful is
 * exactly the kind that hurts. They get "SportyBet", still and correct.
 */
function startBookCycle(){
  var host=document.getElementById("bkCycle");
  if(!host) return;
  var items=[].slice.call(host.querySelectorAll(".bkc-i"));
  if(items.length<2) return;
  var home=items[0], away=items.slice(1), w=[];

  function measure(){
    w=items.map(function(e){ return e.scrollWidth; });
    if(!w[0]) return;
    host.style.width=w[0]+"px";
    /* Anything wider than the resting name is scaled to fit it. Uniform, not
       scaleX: squeezing one axis warps the letterforms, and these are logos.
       A transform does not change the layout box, which is why the container
       still needs min-width:0 to hold the narrower width. */
    items.forEach(function(e,i){
      e.style.transform = (i && w[i] > w[0]) ? "scale(" + (w[0] / w[i]).toFixed(4) + ")" : "";
    });
  }
  /* After the webfont, or the widths are the fallback face's and every name
     sits a few pixels wrong for the rest of the session. */
  try{ (document.fonts?document.fonts.ready:Promise.resolve()).then(measure); }
  catch(e){ measure(); }

  try{
    if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  }catch(e){}

  /* The two halves overlap by about a tenth of a second. That overlap is the
     effect: for those few frames the outgoing name is showing its bottom bands
     and the incoming one its top, so the eye reads one tearing into the other.
     Sequencing them end to end instead gives a blink, which is what this
     looked like before. */
  function swap(from,to){
    host.classList.remove("tw"); void host.offsetWidth; host.classList.add("tw");
    from.classList.add("glx-out");
    setTimeout(function(){
      to.classList.add("on","glx-in");
    },120);
    setTimeout(function(){
      from.classList.remove("on","glx-out");
    },220);
    setTimeout(function(){
      to.classList.remove("glx-in");
      host.classList.remove("tw");
    },440);
  }

  var n=0, timer=null;
  function excursion(){
    var other=away[n%away.length]; n++;
    swap(home,other);
    /* Long enough to be read, short enough that the line is SportyBet again
       before anyone wonders whether it changed for good. */
    setTimeout(function(){ swap(other,home); },1500);
  }
  function run(){ if(!timer) timer=setInterval(excursion,6000); }
  function halt(){ if(timer){ clearInterval(timer); timer=null; } }
  document.addEventListener("visibilitychange",function(){
    if(document.hidden) halt(); else run();
  });
  run();
}
try{ startBookCycle(); }catch(e){}

/* ONE BOOK'S FEED, FETCHED WHEN THAT BOOK IS ACTUALLY WANTED.
   Both second books used to load on every page view: 186 KB of Bet9ja and
   606 KB of BetKing over the wire, brotli'd, for readers who mostly use one
   book and often never open a slip at all. BetKing alone is the largest thing
   the site sends.
   Fetched once each, on the first moment the answer is needed - the reader
   picks that book, or a picker is drawn that has to count what each book can
   take. Memoised on the promise, not a boolean, so two callers in the same
   frame share one request instead of racing two. */
var BOOK_FEED={};
function ensureBookFeed(k){
  /* SportyBet is the board's own prices, loaded before this ever runs. */
  if(!k||k==="sporty"||BOOK_FEED[k]) return BOOK_FEED[k]||Promise.resolve(0);
  var load=k==="bet9ja"?loadBet9ja:k==="betking"?loadBetKing:null;
  if(!load) return Promise.resolve(0);
  BOOK_FEED[k]=load().then(function(n){ if(n) repaintAfterMatch(); return n; })
    .catch(function(){ return 0; });
  return BOOK_FEED[k];
}
function loadBet9jaSoon(){
  /* Only the book the reader is already on. The others wait to be asked. */
  try{ ensureBookFeed(BOOKMAKER); }catch(e){}
}
var SPORTY_TRIES=0;
async function loadSporty(){
  var attempts=0;
  while(attempts<3){
    attempts++;
    try{
      var r=await fetch(SPORTY_FIXTURES,{headers:{Accept:"application/json"}});
      if(r.ok){
        var d=await r.json();
        if(d&&d.matches&&d.matches.length){
          var n=attachEventIds(d.matches,BOOKS.sporty);
          if(n) refreshByoPanels();
          /* Only repaint for a rescue - on the first load the caller paints
             straight after us and doing it twice just flashes the board. */
          if(n&&SPORTY_TRIES>0) repaintAfterMatch();
          SPORTY_TRIES++;
          return n;
        }
      }
    }catch(e){}
    if(attempts<3) await new Promise(function(res){setTimeout(res,700*attempts);});
  }
  SPORTY_TRIES++;
  return 0;
}
/* Redraw whatever is currently showing ids, without disturbing anything the
   user is part-way through. */
function repaintAfterMatch(){
  try{
    if($("mySheet")&&$("mySheet").classList.contains("on")) renderMySheet();
    if(typeof paint==="function") paint();
    paintBookPickers();
  }catch(e){}
}

function riskParams(r){
  var f=r/100;
  // when there are plenty of fixtures, keep the floor higher so even "risky" stays safer
  var pool=0; try{pool=DATA.fixtures.filter(function(x){return notStarted(x);}).length;}catch(e){}
  var floorBoost = pool>=40 ? 0.10 : pool>=25 ? 0.06 : 0;
  var span = pool>=40 ? 0.22 : pool>=25 ? 0.26 : 0.30;
  return {minConf:Math.min(0.75,(0.72+floorBoost)-span*f), maxGames:Math.round(3+f*32),
    tier:(r<33?0:(r<66?1:2))};
}
function riskWord(r){return r<20?"Safest":r<40?"Safe":r<60?"Balanced":r<80?"Bold":"Risky";}
/* "High scoring" is the model's own Over-2.5 read, not a league list - so it
   follows Eliteserien, the Eredivisie and whoever else is scoring this season
   without anyone maintaining names. Same bar the "Over 2.5" category uses. */
const HIGH_SCORING_O25=0.60;
function preferGoalsOverDouble(f,best,allowed,minConf){
  if(!best||(best.code!=="1X"&&best.code!=="X2")) return best;
  if(f.o25==null||f.o25<HIGH_SCORING_O25) return best;
  if(allowed && allowed.indexOf("OVER_1.5")<0) return best;
  var ov=mProb(f,"OVER_1.5");
  if(ov==null||isNaN(ov)||ov<minConf) return best;
  return {code:"OVER_1.5",p:ov};
}
/* Black or white on a given fill, decided by WCAG contrast ratio rather than
   by eye. Used by the payout chips, whose fill hue changes per chip. */
function hslToRgb(h,s,l){
  h=(h%360)/360;
  var a=s*Math.min(l,1-l);
  function f(n){
    var k=(n+h*12)%12;
    return l-a*Math.max(-1,Math.min(k-3,Math.min(9-k,1)));
  }
  return [f(0),f(8),f(4)];
}
function relLum(rgb){
  var c=rgb.map(function(v){
    return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
}
/* Two-tone haptic for the conjure: a short tap, a gap, then a longer one, so
   it lands as "done" rather than as a single buzz. Touch devices only -
   navigator.vibrate does not exist on a desktop, and is ignored where the
   platform or the user has it switched off. Silent when reduced motion is
   asked for, since that setting is about being left alone. */
function buzz(pattern){
  try{
    if(REDUCED) return;
    if(!("vibrate" in navigator)) return;
    if(!matchMedia("(hover:none) and (pointer:coarse)").matches) return;
    navigator.vibrate(pattern);
  }catch(e){}
}
/* Two tones for the conjure: it is the moment something was made. */
function buzzConjure(){ buzz([14,45,26]); }
/* One short tick for navigation: enough to feel, not enough to notice. */
function buzzTap(){ buzz(10); }
function inkOn(h,s,l){
  var L=relLum(hslToRgb(h,s,l));
  var white=1.05/(L+0.05), black=(L+0.05)/0.05;
  return black>=white?"#14140F":"#ffffff";
}
/* Every market the slider may draw from, by risk tier. This has to list a
   code before the market toggles can mean anything: the toggles filter this
   list down, they never add to it, so a market missing here is a switch that
   silently returns nothing however it is set.
   Tiers match the chips: safe markets are the ones that win most often, and
   the ones that pay are unlocked as the slider goes up. */
function allowedMarkets(t){
  var m=["1X","X2","OVER_1.5","1","2",
         /* One side finding the net at all - the likeliest thing on the card
            after a double chance. */
         "HOME_OVER_0.5","AWAY_OVER_0.5"];
  if(t>=1) m=m.concat(["12","OVER_2.5"]);
  if(t>=2) m=m.concat(["GG","OVER_3.5","FH_OVER_0.5",
                       "HOME_OVER_1.5","AWAY_OVER_1.5"]);
  /* THE COMBINATIONS SIT WHERE THEIR RECORD PUTS THEM, not where they felt
     they belonged. Measured over 2,377 held-out matches: result or over 1.5
     lands 87%, draw or over 1.5 84%, result or both score 81% - all of them
     safer than Over 1.5 at 78%, which has been tier 0 since the beginning. So
     those three are tier 0 and the rest sit a rung up, at the level of the
     markets they actually resemble.
     Putting them all at tier 1 was why a reader on the default risk setting
     could switch a chip on and get nothing: the chip was allowed and the
     market was not. */
  m=m.concat(["MIX_1_OV_1.5","MIX_2_OV_1.5",   /* 87% - Bet9ja only */
              "MIX_X_OV_1.5",                  /* 84% - Bet9ja only */
              "MIXGG_1","MIXGG_2"]);           /* 81% */
  if(t>=1) m=m.concat(["MIX_X_OV_2.5",         /* 74% */
                       "MIX_1_OV_2.5","MIX_2_OV_2.5",  /* 72% */
                       "MIXGG_X"]);            /* 64% */
  /* WIN A HALF IS GATED BY THE FLOOR AND NOTHING ELSE.
     It sat at tier 2, then tier 1, both times on its average - 60.0% across
     945 graded matches - and an average across every fixture is the wrong
     number to gate a market with, because a tier fires before any probability
     is read. Measured on the live board: Bayern at home to Union Berlin reads
     80% and Man City against Norwich 78%, while a Madrid derby reads 53%. The
     first two clear what Safe asks for and the third does not, which is
     exactly the judgement minConf exists to make.
     So no tier at all, and the floor does the work: 75% at Safe admits the
     mismatches and nothing else, 72% at Balanced, and the even games fall out
     on their own merits rather than because of the market they are in. The
     chip is still off until somebody turns it on. */
  m=m.concat(["WINHALF_H_Y","WINHALF_A_Y"]);
  return m;
}
/* IS THAT PRICE THEIRS OR OURS?
 *
 * A leg at 1.02 is a real SportyBet price on a market the sweep fetches -
 * their own number for a near-certainty. A leg on a market the sweep does not
 * fetch has no price of ours to show, so what appears is oddOf(p): an estimate
 * derived from our probability, and 53-64% cannot look like 1.02 however it is
 * derived. Both numbers sat in the same column looking equally authoritative.
 * The estimate is marked now, so a reader can tell which is a quote and which
 * is arithmetic. */
function estimatedOdd(f,c){ return !hasRealOdd(f,c); }
function oddCell(f,c,p){
  var v=legOdd(f,c,p);
  if(!(v&&isFinite(v)&&v>1)) return "-";
  return estimatedOdd(f,c)
    ? "<span title='Our estimate - "+esc((curBook()&&curBook().label)||"the bookmaker")+
      " prices this market at the till'>~"+v.toFixed(2)+"</span>"
    : v.toFixed(2);
}

/* THE BET UNDER AN EARLY PAYOUT. 1UP and 2UP settle exactly like the market
   they sit on, with one extra way to win: the side goes a goal (or two) up at
   some point and it pays there and then. We do not model when a team goes
   ahead - that is a path through the match, not a final score - so the market
   underneath is what we price it at.
   THAT IS A FLOOR, NOT A GUESS. p(1UP) is at least p(the bet under it), so
   reading a promotion at its base can only ever understate the leg. Every
   caller is safe in that direction: a leg is never sold as stronger than it
   is, and a ticket of them is never flattered.
   Asked for after a 45-leg code, 8B9WJU, came back 42 legs of these with no
   number on any of them - which left the whole editor blind. */
function mProb(f,c){
  /* A CONVERTED LEG CAN HAVE NO FIXTURE AT ALL. Since feedMatch, a game we
     hold no results for crosses on the other book's own event, and there is
     nothing of ours behind it to price. Null is the honest answer and every
     caller already treats it as "we cannot price this one". */
  if(!f) return null;
  switch(c){
    /* The promotions, read at the bet underneath them. In the switch rather
       than a table beside it so anything that lifts this function out - the
       test harnesses do, to run the shipped code - carries the rule with it. */
    case"UP1_1":case"UP2_1":return mProb(f,"1");
    case"UP1_X":case"UP2_X":return mProb(f,"X");
    case"UP1_2":case"UP2_2":return mProb(f,"2");
    case"DC1UP_1X":return mProb(f,"1X");
    case"DC1UP_12":return mProb(f,"12");
    case"DC1UP_X2":return mProb(f,"X2");
    case"1":return f.home_p;case"X":return f.draw_p;case"2":return f.away_p;
    case"1X":return f.dc1x;case"X2":return f.dcx2;
    case"12":return f.anybody!=null?f.anybody:f.dc12;
    case"OVER_1.5":return f.o15;case"OVER_2.5":return f.o25;case"GG":return f.btts;
    case"FH_OVER_0.5":return f.fh_o05;
    case"OVER_3.5":return f.o35;
    case"HOME_OVER_0.5":return f.h_o05;case"HOME_OVER_1.5":return f.h_o15;
    case"AWAY_OVER_0.5":return f.a_o05;case"AWAY_OVER_1.5":return f.a_o15;
    /* A RESULT CROSSED WITH GOALS, which both books sell as one market. Every
       one of these is a sum over the same scoreline matrix the plain markets
       come from, so they agree with them by construction rather than by
       coincidence - see lib/model.js. */
    case"MIX_X_OV_2.5":return f.draw_o25;
    case"MIXGG_X":return f.draw_btts;
    case"MIXGG_1":return f.home_btts;case"MIXGG_2":return f.away_btts;
    case"MIX_1_OV_2.5":return f.home_o25;case"MIX_2_OV_2.5":return f.away_o25;
    /* Bet9ja sells 1.5 on this family and SportyBet does not. Priced so the
       number exists the day there is somewhere to book it. */
    case"MIX_X_OV_1.5":return f.draw_o15;
    case"MIX_1_OV_1.5":return f.home_o15;case"MIX_2_OV_1.5":return f.away_o15;
    /* Win either half. Both books sell it per side, and neither side can be
       settled by a full-time score - see gradeLeg, which answers null. */
    case"WINHALF_H_Y":return f.h_win_half;
    case"WINHALF_A_Y":return f.a_win_half;}
  return null;
}
/* Which markets have actually been graded, and enough times to mean something.
 *
 * The site publishes a record and stakes everything on it. A market that has
 * never appeared in that record has no business being the first thing the
 * wizard reaches for.
 *
 * That is not hypothetical. Team over 0.5 was switched on by default on 31 Aug
 * and immediately became the model's strongest call on 27 of 34 fixtures, so
 * the wizard led with it on every lopsided game - the weaker side to score,
 * against Barcelona, against Liverpool. Reported as: "you shouldnt pick a less
 * favoured game because you want to hit the target... its about the likelyhood
 * of the games coming." The sharper version is that we did not KNOW the
 * likelihood, because 216 graded results contained not one of them.
 *
 * Read off the published record rather than hard-coded, so a market earns its
 * place by accumulating results and this restriction lifts itself. Nobody has
 * to remember to come back and remove it. */
/* Markets SportyBet lists on effectively every event (99-100% of 1,232 live
   events measured 31 Aug). Used only when we have NO prices for a fixture and
   are picking on our own estimated odds - see pickFrom and buildPicks. Team
   goals sit at 70-76% and were booking-rejecting about one leg in four. */
/* A MARKET SOME BOOKMAKERS SELL AND OTHERS DO NOT.
   Everything else here is book-agnostic: the same code books anywhere, and the
   reader's choice of bookmaker changes nothing about what we pick. This family
   breaks that. Bet9ja and BetKing both sell 1X2-or-Over/Under at 1.5 and
   SportyBet's card stops at 2.5, so a draw-or-over-1.5 leg is bookable at two
   of the three and nowhere at the third - measured across all three
   catalogues, see PASSTHROUGH_MAP in the API.
   The rule is one map and one question, asked in three places: the slider does
   not pick what the current book cannot take, the chip says which books it
   needs, and booking refuses rather than sending a leg that will be rejected
   with the whole ticket behind it.
   A LIST, NOT A NAME, and it became one the day BetKing was read back. This
   held the string "bet9ja" from the day the family was added, which was true
   of two books and was then asserted about a third that nobody had asked.
   BetKing's catalogue carries the whole rung - betking.py maps all three signs
   against market 9648 - and a reader's own BetKing code, D12WXN, came back
   holding "Chance Mix Total Goals 1.5/X or Over" and the away sign beside it.
   The home sign was booked to confirm it rather than inferred from the other
   two: MQ29ZR, Liverpool v Tottenham, read back intact. So the chip had been
   sending BetKing readers to Bet9ja to book a bet BetKing was selling them. */
var BOOK_ONLY={"MIX_X_OV_1.5":["bet9ja","betking"],
  /* The whole 1.5 rung of the 1X2-or-Over/Under family: draw, home and away.
     SportyBet's card starts at 2.5 on all three.
     THE UNDER SIDE AND THE 3.5 RUNG ARE NOT MISSING - they are declined. Both
     books map MIX_*_UN_1.5 and the whole 3.5 rung as well, and adding them was
     offered and turned down on 13 Sep: they are low-probability bets, so they
     would widen the risky end of a board whose seven newest markets have not
     yet graded a single live result. Revisit when those have a record, not
     before. */
  "MIX_1_OV_1.5":["bet9ja","betking"],"MIX_2_OV_1.5":["bet9ja","betking"]};
function bookAllows(code,B){
  var only=BOOK_ONLY[code];
  return !only || only.indexOf((B&&B.key)||(curBook()&&curBook().key))>=0;
}
/* "Bet9ja", "Bet9ja or BetKing", "Bet9ja, BetKing or X" - in one place, because
   four sentences on screen name these books and a list joined by hand in each
   of them drifts the first time a book is added. */
function bookNames(keys,join){
  var l=(keys||[]).map(function(k){return BOOKS[k]?BOOKS[k].label:k;});
  if(l.length<2) return l[0]||"";
  return l.slice(0,-1).join(", ")+" "+(join||"or")+" "+l[l.length-1];
}
/* THE FOURTH PLACE THE QUESTION HAS TO BE ASKED: out loud, to the reader.
   The three above are all refusals - the slider will not pick it, the chip
   will not turn on, booking will not send it - and a refusal the reader cannot
   see reads as the button being broken. Reported as: edit a game and "it
   doesnt show me get code until i choose a bookie", with nothing on screen
   saying which bookie or why.
   Names the market in the reader's own words and the books that sell it, and
   the picker is on screen directly above wherever this is printed. */
function bookOnlyHint(picks,B){
  B=B||curBook();
  var want=null, names=[];
  (picks||[]).forEach(function(c){
    if(!c) return;
    var only=BOOK_ONLY[c.code];
    if(!only||only.indexOf(B.key)>=0) return;
    want=only;
    var f=c.f||fixtureById(c.id);
    var l=f?mLabel(f,c.code).replace(/<[^>]+>/g,""):c.code;
    if(names.indexOf(l)<0) names.push(l);
  });
  if(!want) return "";
  var have=want.filter(function(k){return !!BOOKS[k];});
  if(!have.length) return "";
  var lbl=bookNames(have);
  return "Only "+lbl+" sell"+(have.length>1?"":"s")+" "+
    (names.length>2?names.length+" of these bets":names.join(" and "))+
    ", so tap "+(have.length>1?"one of them":lbl)+" above to get a code for this slip.";
}
var SAFE_UNPRICED={"1":1,"2":1,"X":1,"1X":1,"X2":1,"12":1};
function safeUnpriced(code){ return !!SAFE_UNPRICED[code]; }
/* How much of an estimated price we are willing to believe when it is
   competing against a published one. 0.85 was picked to be felt rather than
   argued: at the risky end it costs an off-sweep leg about a sixth of its
   odds advantage, which is enough that a real quote wins a close call and
   not so much that a genuinely better market can never get in. */
var ESTIMATE_SHRINK=0.85;
/* WHICH MARKETS THE ODDS CACHE CAN EVEN CONTAIN.
 *
 * sportyOdds holds what the sweep fetches, and the sweep fetches the markets
 * we model - nothing else. So for a combination like "home or both score" the
 * cache is silent whether SportyBet sells it or not, and "no price here" is
 * not evidence of anything.
 *
 * Both builders read that silence as "this leg cannot be placed, drop the
 * fixture", which is right for a team-total (listed on about 70% of the card,
 * and booking one that is missing takes the whole slip down) and wrong for
 * every market outside the sweep. Reported as chips that turn on and produce
 * "no games to conjure": every candidate was being dropped before it could be
 * scored. Same mistake the API pre-flight made on the same markets, for the
 * same reason - see _unbookable in server.py. */
function fetchedMarket(code){
  return !!SAFE_UNPRICED[code] ||
    /^(OVER|UNDER)_[13]\.5$/.test(code) || code==="OVER_2.5" || code==="UNDER_2.5" ||
    code==="GG" || code==="NG" || code==="FH_OVER_0.5" ||
    /^(HOME|AWAY)_OVER_[01]\.5$/.test(code);
}
var MIN_GRADED=10;
function codeMarket(c){
  switch(c){
    case"1":case"2":case"X":return"Match result";
    case"1X":case"X2":case"12":return"Double chance";
    case"GG":return"Both to score";
    case"FH_OVER_0.5":return"First-half goal";
    case"OVER_1.5":return"Over 1.5";
    case"OVER_2.5":return"Over 2.5";
    case"OVER_3.5":return"Over 3.5";
    case"HOME_OVER_0.5":case"AWAY_OVER_0.5":return"Team over 0.5";
    case"HOME_OVER_1.5":case"AWAY_OVER_1.5":return"Team over 1.5";
    /* Same names lib/model.js grades them under, so a chip cannot be offered
       by default until its family has a record. */
    case"WINHALF_H_Y":case"WINHALF_A_Y":return"Win either half";
    case"MIX_X_OV_1.5":return"Draw or over 1.5";
    case"MIX_1_OV_1.5":case"MIX_2_OV_1.5":return"Result or over 1.5";
    case"MIX_X_OV_2.5":return"Draw or over 2.5";
    case"MIXGG_X":return"Draw or both score";
    case"MIXGG_1":case"MIXGG_2":return"Result or both score";
    case"MIX_1_OV_2.5":case"MIX_2_OV_2.5":return"Result or over 2.5";}
  return null;
}
/* Same families lib/grade.js groups the record by, so the two agree. */
function provenMarkets(){
  var out={};
  try{
    /* `markets` grades EVERY market on every held-out match, so each one gets
       the whole window. `byMarket` only ever recorded the headline tip, which
       meant the markets competed for the same few hundred matches and the ones
       that can never headline - team goals, Over 2.5, both teams to score -
       had no record at all and could never earn one. Fall back to byMarket so
       a payload baked before this existed still behaves. */
    var rows=(DATA.record&&(DATA.record.markets||DATA.record.byMarket))||[];
    rows.forEach(function(m){
      if(m&&m.market&&m.total>=MIN_GRADED) out[m.market]=1; });
  }catch(e){}
  return out;
}
/* Unknown codes count as proven: the guard exists to hold back markets we can
   see have no record, not to block anything the mapping has not met yet. */
function isProven(c,prov){ var m=codeMarket(c); return !m || !!prov[m]; }
/* Did one leg land? Keyed on the market code rather than the tip label, since a
   slip's legs are chosen by code and need not be the fixture's own tip.
   Returns null for anything a final score cannot settle, and callers treat that
   as ungraded rather than as a loss - the same rule lib/grade.js follows. */
function gradeLeg(f,c,hg,ag){
  if(typeof hg!=="number"||typeof ag!=="number"||isNaN(hg)||isNaN(ag)) return null;
  var d=hg-ag, tot=hg+ag, both=hg>0&&ag>0;
  switch(c){
    case"1": return d>0;
    case"2": return d<0;
    case"X": return d===0;
    case"1X": return d>=0;
    case"X2": return d<=0;
    case"12": return d!==0;
    case"GG": return both;
    case"OVER_1.5": return tot>1.5;
    case"OVER_2.5": return tot>2.5;
    case"OVER_3.5": return tot>3.5;
    case"HOME_OVER_0.5": return hg>0.5;
    case"HOME_OVER_1.5": return hg>1.5;
    case"AWAY_OVER_0.5": return ag>0.5;
    case"AWAY_OVER_1.5": return ag>1.5;
    /* The combinations settle on the full-time score like everything above
       them: a result OR a goals line, either half of which is enough. */
    case"MIX_X_OV_1.5": return d===0||tot>1.5;
    case"MIX_1_OV_1.5": return d>0||tot>1.5;
    case"MIX_2_OV_1.5": return d<0||tot>1.5;
    case"MIX_X_OV_2.5": return d===0||tot>2.5;
    case"MIX_1_OV_2.5": return d>0||tot>2.5;
    case"MIX_2_OV_2.5": return d<0||tot>2.5;
    case"MIXGG_X": return d===0||both;
    case"MIXGG_1": return d>0||both;
    case"MIXGG_2": return d<0||both;
  }
  return null;   /* first-half markets and anything unknown */
}
function mLabel(f,c){
  switch(c){case"1":return esc(f.home)+" to win";case"2":return esc(f.away)+" to win";
    case"X":return"Draw";case"1X":return esc(f.home)+" or draw";
    case"X2":return esc(f.away)+" or draw";case"12":return"Any team to win";
    case"OVER_1.5":return"Over 1.5 goals";case"OVER_2.5":return"Over 2.5 goals";
    case"GG":return"Both teams to score";
    case"FH_OVER_0.5":return"Goal in 1st half";
    case"OVER_3.5":return"Over 3.5 goals";
    case"HOME_OVER_0.5":return esc(f.home)+" over 0.5 goals";
    case"AWAY_OVER_0.5":return esc(f.away)+" over 0.5 goals";
    case"HOME_OVER_1.5":return esc(f.home)+" over 1.5 goals";
    case"AWAY_OVER_1.5":return esc(f.away)+" over 1.5 goals";
    /* Markets we move but never predict - see PASSTHROUGH_MAP in the API.
       1UP and 2UP are the early-payout promotion both books run: the bet pays
       as soon as that side goes one (or two) goals ahead, whatever the final
       score. The whole Over lines push on the exact number, which is what
       makes them a different bet from the .5 line beside them. */
    case"UP1_1":return esc(f.home)+" 1UP";
    case"UP1_X":return"Draw 1UP";
    case"UP1_2":return esc(f.away)+" 1UP";
    case"UP2_1":return esc(f.home)+" 2UP";
    case"UP2_X":return"Draw 2UP";
    case"UP2_2":return esc(f.away)+" 2UP";
    case"OVER_2":return"Over 2 goals";
    case"OVER_3":return"Over 3 goals";
    case"UNDER_2":return"Under 2 goals";
    case"UNDER_3":return"Under 3 goals";}
  /* 1X2-or-Over/Under, which is parameterised rather than a fixed list: three
     sides by two directions by whichever line the book sells. Built here so a
     new line needs no new case. */
  var side3=function(k){return k==="1"?esc(f.home):(k==="2"?esc(f.away):"Draw");};
  var mx=/^MIX_([12X])_(OV|UN)_([\d.]+)$/.exec(c||"");
  if(mx) return side3(mx[1])+" or "+(mx[2]==="OV"?"over ":"under ")+mx[3]+" goals";
  /* Everything the converter learned to read today. Parameterised rather than
     a case each, because the lines and thresholds come from whatever the books
     are selling. Unlabelled, these printed as their own codes on the panel -
     "CORNERS_OV_8.5" where a sentence belongs. */
  var mg=/^MIX(GG|NG)_([12X])$/.exec(c||"");
  if(mg) return side3(mg[2])+" or "+(mg[1]==="GG"?"both teams to score":"no goals");
  var cd=/^CARD_([HA])_(\d)$/.exec(c||"");
  if(cd) return (cd[1]==="H"?esc(f.home):esc(f.away))+" "+cd[2]+"+ cards";
  var cn=/^CORNERS_(OV|UN)_([\d.]+)$/.exec(c||"");
  if(cn) return (cn[1]==="OV"?"Over ":"Under ")+cn[2]+" corners";
  /* EVERY FAMILY ADDED FROM A READER'S CODE ON 14 SEP. These are pass-through
     markets - we move them, we never predict them - but the editor and the
     splitter both draw a leg through this function, so an unnamed one prints
     its own code on the panel while somebody is deciding what to do with it. */
  var cs=/^CORNERS_([HA])_(OV|UN)_([\d.]+)$/.exec(c||"");
  if(cs) return (cs[1]==="H"?esc(f.home):esc(f.away))+" "+
    (cs[2]==="OV"?"over ":"under ")+cs[3]+" corners";
  /* Double chance with the 1UP promotion: the same sign, paid early if the
     side goes a goal up. */
  var d1=/^DC1UP_(1X|12|X2)$/.exec(c||"");
  if(d1) return (d1[1]==="1X"?esc(f.home)+" or draw"
    :(d1[1]==="12"?esc(f.home)+" or "+esc(f.away):"Draw or "+esc(f.away)))+", 1UP";
  /* Goals inside the opening minutes. Both numbers are the bet. */
  var eg=/^EARLY_(OV|UN)_(\d+)_([\d.]+)$/.exec(c||"");
  if(eg) return (eg[1]==="OV"?"Over ":"Under ")+eg[3]+
    " goals in the first "+eg[2]+" minutes";
  /* "Excluded number of goals" is a bet that the total is anything BUT this
     number, which reads backwards unless it is said plainly. */
  var xg=/^EXGOALS_(FH_)?(\d)$/.exec(c||"");
  if(xg) return "Not exactly "+xg[2]+(xg[2]==="5"?"+":"")+" goal"+
    (xg[2]==="1"?"":"s")+(xg[1]?" in the first half":"");
  /* THE TRANCHE TAKEN FROM THEIR CATALOGUE, not from a complaint. Same rule as
     everything above: the editor and the splitter draw each leg through here,
     so a market with no sentence prints its own code. */
  var fg=/^FIRSTGOAL(_FH|_SH)?_(1|N|2)$/.exec(c||"");
  if(fg){
    var half=fg[1]==="_FH"?" in the first half":(fg[1]==="_SH"?" in the second half":"");
    if(fg[2]==="N") return "No goal"+(half||" at all");
    return (fg[2]==="1"?esc(f.home):esc(f.away))+" to score first"+half;
  }
  var ex=/^EXACT(_FH|_SH)?_(\d)$/.exec(c||"");
  if(ex){
    var top=ex[1]==="_FH"?3:(ex[1]==="_SH"?2:6);
    var w=ex[1]==="_FH"?" in the first half":(ex[1]==="_SH"?" in the second half":"");
    return "Exactly "+ex[2]+(+ex[2]===top?"+":"")+" goal"+(ex[2]==="1"?"":"s")+w;
  }
  var tg=/^TEAMGOALS_([HA])_(\d)$/.exec(c||"");
  if(tg) return (tg[1]==="H"?esc(f.home):esc(f.away))+
    (tg[2]==="3"?" to score 3+":" to score exactly "+tg[2]);
  var gr=/^GOALRANGE_(\d)(?:_(\d))?$/.exec(c||"");
  if(gr) return gr[2]?(gr[1]+"-"+gr[2]+" goals"):(gr[1]+"+ goals");
  var wm=/^MARGIN_(?:([HA])(\d)|DRAW)$/.exec(c||"");
  if(wm) return wm[1]===undefined?"Draw, any score"
    :((wm[1]==="H"?esc(f.home):esc(f.away))+" by "+wm[2]+(wm[2]==="3"?"+":"")+
      " goal"+(wm[2]==="1"?"":"s"));
  /* Two markets, each a Yes/No, so "No" to the over one is NOT the under one -
     it is "at least one half stayed under", which is why the negative is
     spelled out rather than swapped for the opposite market. */
  var bh=/^BOTHHALVES_(OV|UN)_([YN])$/.exec(c||"");
  if(bh){
    var side=bh[1]==="OV"?"over":"under";
    return bh[2]==="Y" ? ("Both halves "+side+" 1.5 goals")
                       : ("Not both halves "+side+" 1.5 goals");
  }
  var hs=/^(FH|SH)_(HOME|AWAY)_(OVER|UNDER)_([\d.]+)$/.exec(c||"");
  if(hs) return (hs[2]==="HOME"?esc(f.home):esc(f.away))+" "+
    (hs[3]==="OVER"?"over ":"under ")+hs[4]+" goals in the "+
    (hs[1]==="FH"?"first":"second")+" half";
  /* THE SIBLING FAMILIES: half-versions and per-team versions of markets
     already named above. Each reads the same way its twin does, with the half
     or the side said out loud. */
  var eh=/^(FH_|SH_)?EH_(\d)_(\d)_(1|X|2)$/.exec(c||"");
  if(eh){
    /* A scoreline head start, so the side NOT named is the one carrying it:
       "0:1" means the away team begins a goal up. Said plainly, because
       "Home (0:1)" on its own has sent people the wrong way. */
    var ehWhen=eh[1]==="FH_"?" in the first half":(eh[1]==="SH_"?" in the second half":"");
    var homeLeads=+eh[2]>0, amt=Math.max(+eh[2],+eh[3]);
    var lead=(homeLeads?esc(f.home):esc(f.away))+" +"+amt;
    if(eh[4]==="X") return "Draw with "+lead+ehWhen;
    var picksLeader=(eh[4]==="1")===homeLeads;
    /* Naming the same club twice - "Newcastle to win with Newcastle +1" - is
       how the first version read. Say the head start once, on whichever side
       is carrying it. */
    if(picksLeader) return lead+" to win"+ehWhen;
    return (eh[4]==="1"?esc(f.home):esc(f.away))+" to beat "+lead+ehWhen;
  }
  var hah=/^(FH|SH)_AH_(1|2)_(-?[\d.]+)$/.exec(c||"");
  if(hah) return (hah[2]==="1"?esc(f.home):esc(f.away))+" "+
    (+hah[3]>0?"+":"")+hah[3]+" in the "+(hah[1]==="FH"?"first":"second")+" half";
  var fm=/^FH_MIX_(1|X|2)_(OV|UN)_([\d.]+)$/.exec(c||"");
  if(fm) return (fm[1]==="1"?esc(f.home):(fm[1]==="2"?esc(f.away):"Draw"))+
    " and "+(fm[2]==="OV"?"over ":"under ")+fm[3]+" goals in the first half";
  var cr=/^CORNRANGE_(?:([HA])_)?(\d+)(?:_(\d+))?$/.exec(c||"");
  if(cr){
    var who=cr[1]?((cr[1]==="H"?esc(f.home):esc(f.away))+" "):"";
    return who+(cr[3]?(cr[2]+"-"+cr[3]):(cr[2]+"+"))+" corners";
  }
  var fc=/^FH_CARD(UN)?_([HA])_(\d)$/.exec(c||"");
  if(fc) return (fc[2]==="H"?esc(f.home):esc(f.away))+
    (fc[1]?" under ":" ")+fc[3]+(fc[1]?"":"+")+" booking"+(fc[3]==="1"&&!fc[1]?"":"s")+
    " in the first half";
  var sh=/^SH_(OVER|UNDER)_([\d.]+)$/.exec(c||"");
  if(sh) return (sh[1]==="OVER"?"Over ":"Under ")+sh[2]+" goals in the second half";
  /* One side's goals as a range: 12 is one to two, 13 is one to three or more,
     33 is three or more. */
  var gb=/^BOUNDS_([HA])_(\d)(\d)?$/.exec(c||"");
  if(gb){
    var who=gb[1]==="H"?esc(f.home):esc(f.away);
    if(gb[3]===undefined) return who+" to score exactly "+gb[2];
    if(gb[2]===gb[3]) return who+" to score "+gb[2]+"+";
    return who+" to score "+gb[2]+"-"+gb[3]+(gb[3]==="3"?"+":"");
  }
  var wh=/^WINHALF_([HA])_([YN])$/.exec(c||"");
  if(wh) return (wh[1]==="H"?esc(f.home):esc(f.away))+
    (wh[2]==="Y"?" to win a half":" not to win a half");
  /* Which half carried more of something. One shape for four families: goals
     for the match, goals for one side, bookings and corners. The tie outcome
     is a real selection on all of them, not a fallback, so it gets a sentence
     of its own rather than reading as a missing case. */
  var hh=/^HIGHHALF_(?:([HA])_)?([12E])$/.exec(c||"");
  if(hh){
    var who=hh[1]==="H"?esc(f.home):(hh[1]==="A"?esc(f.away):"");
    if(hh[2]==="E") return who?who+" score the same in both halves"
      :"Both halves score the same";
    return (who?who+" score more":"More goals")+
      " in the "+(hh[2]==="1"?"1st":"2nd")+" half";
  }
  var hc=/^(HMC|HALFCORNER)_([12E])$/.exec(c||"");
  if(hc){
    var what=hc[1]==="HMC"?"bookings":"corners";
    if(hc[2]==="E") return "Both halves have the same "+what;
    return "More "+what+" in the "+(hc[2]==="1"?"1st":"2nd")+" half";
  }
  /* AWARDED, not scored. The distinction is the reason this leg can never be
     converted to SportyBet, so the label must not blur it. */
  var pn=/^PEN_([YN])$/.exec(c||"");
  if(pn) return pn[1]==="Y"?"A penalty is awarded":"No penalty awarded";
  var db=/^DNB_([12])$/.exec(c||"");
  if(db) return side3(db[1])+", draw no bet";
  var d2=/^DC2_(1X|12|X2)$/.exec(c||"");
  if(d2) return "2nd half: "+(d2[1]==="1X"?esc(f.home)+" or draw"
    :(d2[1]==="12"?esc(f.home)+" or "+esc(f.away):"draw or "+esc(f.away)));
  /* The line is the HOME team's on both books, so the away side of it is the
     inverse - printing the raw number against the away name would say the
     opposite of the bet. */
  var ah=/^AH_([12])_(-?[\d.]+)$/.exec(c||"");
  if(ah){
    var n=parseFloat(ah[2]);
    var shown=ah[1]==="1"?n:-n;
    return (ah[1]==="1"?esc(f.home):esc(f.away))+" "+(shown>0?"+":"")+shown;
  }
  return c;
}
/* How many of your still-running slips already carry this fixture.
   Reported: "i had one game spoil 8 of my tickets yesterday because it was
   everywhere." Measured on a live board: build eight tickets and four games
   appear in all eight, and eight games appear in six or more. That is not a
   shuffling problem - shuffling rearranges one ticket. Each build was simply
   independent, so neither builder had any idea what was already on your other
   slips, and the best legs went into every one of them.
   The harm is correlated risk: eight tickets sharing a leg are not eight bets,
   they are one bet with extra steps, and a single result takes the lot.
   Only slips still running count. A settled one is history and carries no risk,
   and legs whose game has kicked off cannot be avoided any more either. */
function slipUse(){
  var m={};
  /* The slip already on screen counts too, not just saved ones.
     Shipped first reading SLIPS alone, which meant it did nothing at all
     unless you had saved each ticket - and reported as exactly that:
     conjure six times without saving and all eleven games came back
     identical, because slipUse saw an empty list. Saving is a deliberate
     step here, so most people building a few tickets in a row never
     trigger it, and the guard was inert precisely when it was wanted.
     wspConjure calls wspBuild BEFORE it replaces MYSLIP, so during the
     build this still holds the previous conjure - which is what makes a
     re-conjure move off the games you are looking at. */
  try{
    (MYSLIP||[]).forEach(function(l){
      if(!l||!l.id) return;
      var f=fixtureById(l.id);
      if(f&&!notStarted(f)) return;
      m[l.id]=(m[l.id]||0)+1;
    });
  }catch(e){}
  try{
    (SLIPS||[]).forEach(function(s){
      if(!s||s.settled) return;
      (s.legs||[]).forEach(function(l){
        if(!l||!l.id) return;
        var f=fixtureById(l.id);
        if(f&&!notStarted(f)) return;      /* already under way - nothing to spread */
        m[l.id]=(m[l.id]||0)+1;
      });
    });
  }catch(e){}
  return m;
}
/* Bounded, like the league and market spreads beside it: a clearly better leg
   still wins, but it takes something to beat a game you are not already exposed
   to. Not exclusion - if the board is thin, or you genuinely want that game,
   it can still come through. */
var SPREAD_PEN=0.15;    /* wizard: added to _cost, where the whole spread is ~0.9 */
var SPREAD_MULT=0.85;   /* slider: multiplies the ranking key */
function buildPicks(){
  /* The book being built for, read once. Every price question below is
     asked of THIS book - the peeks it replaced all read sportyOdds, so a
     Bet9ja slip was being judged against SportyBet's prices. */
  var B=curBook();
  var p=riskParams(BUILD.risk), allowed=allowedMarkets(p.tier), cand=[];
  var mkOn={"1X":BUILD.mk.wd,"X2":BUILD.mk.wd,"12":BUILD.mk.any,"1":BUILD.mk.out,"2":BUILD.mk.out,
    "OVER_1.5":BUILD.mk.o15,"OVER_2.5":BUILD.mk.o25,"OVER_3.5":BUILD.mk.o35,
    "FH_OVER_0.5":BUILD.mk.fh,
    "HOME_OVER_0.5":BUILD.mk.tts,"AWAY_OVER_0.5":BUILD.mk.tts,
    "HOME_OVER_1.5":BUILD.mk.tts2,"AWAY_OVER_1.5":BUILD.mk.tts2,"GG":BUILD.mk.both,
    /* One chip per family, both sides of it behind the same switch: which of
       home or away goes on the slip is the model's call, not a second toggle
       for the reader to get wrong. */
    "MIX_X_OV_2.5":BUILD.mk.dro25,"MIXGG_X":BUILD.mk.drgg,
    "MIXGG_1":BUILD.mk.rsgg,"MIXGG_2":BUILD.mk.rsgg,
    "MIX_1_OV_2.5":BUILD.mk.rso25,"MIX_2_OV_2.5":BUILD.mk.rso25,
    "MIX_X_OV_1.5":BUILD.mk.dro15,
    "MIX_1_OV_1.5":BUILD.mk.rso15,"MIX_2_OV_1.5":BUILD.mk.rso15,
    "WINHALF_H_Y":BUILD.mk.weh,"WINHALF_A_Y":BUILD.mk.weh};
  allowed=allowed.filter(function(c){return mkOn[c]!==false && bookAllows(c,curBook());});
  var f0=BUILD.risk/100;
  function h32(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967296;}
  scopeFixtures().forEach(function(f){
    if(TOP_ONLY && isLowerFixture(f)) return;
    var homeFav=f.home_p>f.away_p;
    function sane(c){
      if(c==="1"&&!homeFav) return false;
      if(c==="2"&&homeFav) return false;
      if(c==="1X"&&!homeFav) return false;
      if(c==="X2"&&homeFav) return false;
      return true;
    }
    /* Prefer a leg SportyBet will actually take.
       The wizard has done this for a while; the slider never did, and picked
       purely on model merit - which is why a slip built here could look
       perfect and then be refused whole, since one unplaceable leg among forty
       loses all forty. Measured on the live board: 1X2 and double chance are
       priced on 100% of our fixtures, goals and GG on 93-94%, team totals on
       88-90%. Per leg that is fine; across an eight-leg slip on team totals it
       is a 62% chance of at least one leg that cannot be placed.
       The rule is the wizard's, verbatim in spirit: among the markets that
       pass the sanity check, keep the ones carrying a real SportyBet odd. If
       none do BUT the fixture is priced, SportyBet lists this game and does
       not list any market we offer on it, so the leg cannot be placed and the
       fixture is dropped. If the fixture has no prices at all we know nothing
       - the odds feed may simply be slow - and an estimate stays the honest
       best guess, exactly as before. Conflating those two cases would empty
       the builder whenever the feed is down, which is a far worse failure than
       the one being fixed. */
    /* THE ONE QUESTION, ASKED ONCE - see bookVerdict. This used to be three
       separate peeks into sportyOdds, which is also how it judged prices at
       SportyBet while the reader was booking to Bet9ja. */
    var usable=allowed.filter(sane);
    var byVerdict={priced:[],unknown:[]};
    usable.forEach(function(c){
      var v=bookVerdict(f,c,B);
      if(byVerdict[v]) byVerdict[v].push(c);
    });
    /* A quote first, then anything the cache cannot speak for. "not-priced" is
       the only refusal, and it is only ever said about a market the sweep
       actually fetches. */
    if(byVerdict.priced.length||byVerdict.unknown.length){
      usable=byVerdict.priced.concat(byVerdict.unknown);
    } else if(pricedFixture(f,B)) return;
    /* Same rule as the wizard: with no prices for this fixture we are guessing,
       so guess only among markets this book always lists. */
    else { usable=usable.filter(function(c){ return safeUnpriced(c); });
           if(!usable.length) return; }

    var best=null,bestScore=-1;
    usable.forEach(function(c){
      var v=mProb(f,c);
      if(v==null||isNaN(v)||v<p.minConf) return;
      var score=(1-f0)*v + f0*(oddOf(v)/12);
      /* A QUOTE OUTRANKS AN ESTIMATE ON A CLOSE CALL.
         The old rule was blunter - "when real odds exist for any candidate,
         only those are considered" - and it existed because a market picked off
         an estimate might not be listed at all, which takes the whole ticket
         down. That reason does not apply to a market we map on both books and
         book every day; what remains is that the number itself is ours rather
         than theirs, and ours reads high.
         So an off-sweep leg competes, and pays for the privilege: its odds are
         shrunk before scoring, which leaves it winning only where it is
         clearly the better bet and never on a tie. A real 1.02 leg keeps its
         place in the mix exactly as it always has. */
      if(!fetchedMarket(c)) score-=f0*(oddOf(v)/12)*(1-ESTIMATE_SHRINK);
      /* Goals lean: in a high-scoring game, nudge the over markets up so they can
         beat the safe double-chance picks. Driven by the model's own Over-2.5
         probability, so it favours high-scoring leagues (Eliteserien, Eredivisie,
         Swiss) automatically - no hardcoded league list. */
      if((c==="OVER_1.5"||c==="OVER_2.5") && f.o25!=null) score*=1+Math.max(0,f.o25-0.5)*0.8;
      score*=1+(h32(fid(f)+"|"+c+"|"+(BUILD.seed||0))-0.5)*(0.9+0.8*f0);
      if(score>bestScore){bestScore=score;best={code:c,p:v};}
    });
    /* In a game the model expects goals in, a double chance is the timid pick:
       it needs the favourite not to lose, in a match likely to be open. If
       Over 1.5 clears the same confidence bar, take it instead. The lean above
       only nudges the score and double chance could still out-rank it; this
       decides it outright, which is what was being asked of the shuffle. */
    best=preferGoalsOverDouble(f,best,usable,p.minConf);
    if(best){
      /* Every market this fixture could offer, so the slip can spread across
         markets instead of stacking one. Same reason as the league spread. */
      var alts=[];
      usable.forEach(function(c){
        var v=mProb(f,c);
        if(v==null||isNaN(v)||v<p.minConf) return;
        /* The same score the market was chosen by above, kept so the spread
           below can prefer a different market without abandoning what the risk
           dial asked for. Scoring alternatives by probability alone broke the
           dial outright: at high risk it quietly went back to safe markets and
           the odds stopped rising with the slider. */
        var sc=(1-f0)*v + f0*(oddOf(v)/12);
        if((c==="OVER_1.5"||c==="OVER_2.5") && f.o25!=null) sc*=1+Math.max(0,f.o25-0.5)*0.8;
        alts.push({code:c,p:v,score:sc});
      });
      cand.push({f:f,id:fid(f),code:best.code,p:best.p,eventId:f.eventId||null,_alts:alts});
    }
  });
  var _use=slipUse();
  var removedCount=Object.keys(BUILD.removed).length;
  var cap=Math.max(0,p.maxGames-removedCount);
  /* Europe first. South American games are held back unless Europe can't fill
     the slip, or the user has reshuffled a couple of times and clearly wants a
     different mix. Once allowed in they're penalised rather than cut, so Europe
     still leads while a few South American games come through. */
  var euroN=cand.filter(function(c){return !isSouthAmerican(c.f)&&!isAsian(c.f);}).length;
  /* "Can't fill the slip" means exactly that: fewer European candidates than
     the dial asked for. This used to read `euroN < Math.min(cap,
     SA_MIN_EURO)`, which with a cap of six or more is just `euroN < 6` - an
     absolute floor that ignores how many games were actually wanted.
     That produced a slip that SHRANK as risk rose. Measured on Today+Late,
     14 fixtures: risk 40 gave 11 games (5 European, 6 South American), and
     risk 50 gave 7 - because Europe crossed six candidates, South America
     was excluded outright, and the six it lost outnumbered the two Europe
     gained. Seven games against a cap of nineteen, with the dial insisting
     it wanted nineteen.
     The comment above already said "unless Europe can't fill the slip"; the
     code just did not implement it. The older note here worried a relative
     test would call Europe scarce almost every day - measured, it does not:
     on a full card Europe alone fills every cap up to 35, so this is false
     there and nothing changes. It only fires in the thin windows where the
     slip was visibly short. */
  var saMode=(euroN<cap)?"fill":((BUILD.shuffles||0)>=2?"mix":"exclude");
  if(saMode==="exclude") cand=cand.filter(function(c){return !isSouthAmerican(c.f);});
  /* Eased: these were 0.6 and 0.85, which held back the whole continent for
     the sins of one league. The goals exemption in saWeight does the real
     discriminating now, so the blanket number can be lighter. */
  var saPenalty=(saMode==="mix")?0.75:0.92;
  /* Asia is held back harder and for longer than South America: three
     shuffles rather than two before it mixes in, and never at the safe
     setting unless Europe genuinely cannot fill the slip. Somebody on
     "Safest" is asking for the picks most likely to land, and these are the
     leagues the model knows least well. */
  var asiaMode=(euroN<Math.min(cap,ASIA_MIN_EURO))?"fill"
              :((BUILD.shuffles||0)>=3&&p.tier>0?"mix":"exclude");
  if(asiaMode==="exclude") cand=cand.filter(function(c){return !isAsian(c.f);});
  /* Measured against a real card before choosing these.
     A penalty does nothing useful in "mix": with about a hundred and fifty
     European candidates for thirty-three places, any multiplier below one
     keeps Asian games out entirely - 0.45, 0.65 and 0.85 all produced zero.
     So the honest choice is between "never" and "on merit", and somebody who
     has shuffled three times has asked for a different mix. On merit that is
     roughly two legs in thirty-three, which is a sprinkle rather than a flood.
     "fill" is the thin-card case where they come in regardless, held back
     hardest at the safe setting - that is where landing matters most, and it
     is the one place these leagues should almost never appear. */
  var asiaPenalty=(asiaMode==="mix")?1:(p.tier>0?0.8:0.5);
  cand.sort(function(a,b){
    var ka=(f0<0.5?a.p:oddOf(a.p)), kb=(f0<0.5?b.p:oddOf(b.p));
    if(isSouthAmerican(a.f))ka*=saWeight(a.f,saPenalty);
    if(isSouthAmerican(b.f))kb*=saWeight(b.f,saPenalty);
    if(isAsian(a.f))ka*=asiaPenalty; if(isAsian(b.f))kb*=asiaPenalty;
    ka*=1+(h32(a.id+"|s"+(BUILD.seed||0))-0.5)*(0.9+f0); kb*=1+(h32(b.id+"|s"+(BUILD.seed||0))-0.5)*(0.9+f0);
    /* Push down what your open slips already hold, so a second ticket is a
       second bet rather than the same one again. */
    ka*=Math.pow(SPREAD_MULT,_use[a.id]||0); kb*=Math.pow(SPREAD_MULT,_use[b.id]||0);
    return kb-ka;
  });
  cand=cand.filter(function(c){return !BUILD.removed[c.id];});
  /* HOW MANY LEGS WERE ACTUALLY AVAILABLE, recorded where it is knowable.
     The note under a short slip first counted the games clearing the floor
     itself, which reads high: it cannot see the bookmaker-odds rule, the
     continent rules or the reader's own removals, all of which have run by
     here. Counting after them is the difference between "three of thirty-five"
     with no explanation and the sentence that explains it. */
  BUILD._pool=cand.length;
  /* League diversity: prefer spreading picks across leagues, softly. `cand` is
     already sorted best-first; we take from the top but add a small rank penalty
     per leg already drawn from the same country, so one league can't dominate the
     slip. A clearly better pick from a saturated league still gets in. Mirrors
     the wizard's soft cap. */
  var picked=[],lc={},mc={},usedIx={},LEAGUE_PEN=3,MARKET_PEN=0.06;
  /* The market is settled when the leg is taken, not before, with a penalty for
     one already well used - exactly as the wizard does it. Choosing each
     fixture's best market independently stacks the slip onto whichever market
     happens to win most often, which at the safe end of the dial was 75% of
     legs on a single market. Bounded and small: a clearly better market still
     wins, and with only one market enabled there is nothing else to reach for,
     so a single-market ticket is still exactly what the toggles give you. */
  function marketFor(c){
    var alts=c._alts||[];
    if(alts.length<2) return c;
    var best=null,bs=-Infinity;
    for(var j=0;j<alts.length;j++){
      var a=alts[j];
      /* Proportional, so the penalty means the same thing wherever on the dial
         the scores happen to sit. */
      var sc=(a.score||a.p)*(1-MARKET_PEN*(mc[a.code]||0));
      if(sc>bs){bs=sc;best=a;}
    }
    if(best){ c.code=best.code; c.p=best.p; }
    return c;
  }
  while(picked.length<cap){
    var bi=-1,bs=Infinity;
    for(var i=0;i<cand.length;i++){ if(usedIx[i]) continue;
      var s=i+LEAGUE_PEN*(lc[countryOf(cand[i].f.league)]||0); if(s<bs){bs=s;bi=i;} }
    if(bi<0) break;
    usedIx[bi]=1;
    marketFor(cand[bi]);
    picked.push(cand[bi]);
    var cc=countryOf(cand[bi].f.league); lc[cc]=(lc[cc]||0)+1;
    mc[cand[bi].code]=(mc[cand[bi].code]||0)+1;
  }
  BUILD.picks=picked;
  return picked;
}
function oddOf(p){var q=Math.max(0.06,Math.min(0.97,p));return Math.pow(1/q,0.85);}
/* A PRICE WE DO NOT HAVE IS NOT A PRICE. oddOf(null) clamps its way to 10.93
   and hands back a number that looks exactly like a real one - that is the
   x10.93 a single converted handicap leg was projected at on the live site.
   A pass-through market has no probability at all, so there is nothing to
   estimate from, and 0 is the answer every caller here already treats as
   "not priced" (they all test >1.01 or skip it). */
/* THE PRICE WE SHOW IS THE SELECTED BOOK'S, WHEN WE HOLD IT.
 *
 * This read f.sportyOdds whatever book was chosen, so a Bet9ja or BetKing slip
 * displayed SportyBet's numbers - every leg, every total, the shared payload
 * and the record. Reported as "the odds are a little off" on a BetKing slip,
 * and measured on 701 fixtures both books carry, 9,683 comparisons: median
 * -0.72% per leg, 7.5% of legs more than 5% apart, worst 43%. Per leg that is
 * noise; a slip total is a product, so 22 legs at the median compounds to about
 * 8-15% - and the sign is the bad one, since BetKing is mostly SHORTER than
 * SportyBet, so we were overstating what the punter would be paid.
 *
 * The fallback deliberately stays as it was. "Their price, else our estimate"
 * was the tempting rule and it buys a regression: measured 14 Sep, BetKing's
 * feed carries no team-goals and no first-half line at all (0%), Bet9ja's
 * carries neither those nor GG/NG (0%), and team-over-0.5 is a default chip.
 * So that rule would replace a real published price with a model estimate on a
 * large share of legs. This way is never worse than before and better wherever
 * we actually hold the book's own quote - which for BetKing is 97-100% of the
 * core markets, better than our own SportyBet sweep manages.
 *
 * `B` is explicit only where a caller must NOT follow the reader's choice -
 * see the slip of the day. */
function legOdd(f,code,p,B){
  B=B||curBook();
  var own=f&&f[B.odds]&&f[B.odds][code];
  if(own&&own>1.01) return own;
  var o=f&&f.sportyOdds&&f.sportyOdds[code];
  if(o&&o>1.01) return o;
  return (p!=null&&isFinite(p))?oddOf(p):0;
}
/* Does SportyBet price this exact market on this fixture? A real odd in
   sportyOdds came FROM SportyBet, so its presence is proof the market
   exists and its absence is proof it does not. */
/* Kept as a name, delegated as a rule: one definition of "we hold this
   book's own price", in bookVerdict. */
function hasRealOdd(f,c,B){ return bookIsPriced(f,c,B||curBook()); }
/* Do we know anything at all about this fixture's prices? Having no prices
   is not the same as having prices that exclude our market. */
function pricedFixture(f,B){
  B=B||curBook();
  try{ var o=f&&f[B.odds]; return !!(o&&Object.keys(o).length); }
  catch(e){ return false; }
}
/* Every leg carries this book's own quote, not an estimate of ours. Asked
   through bookVerdict so there is one definition of "a real price". */
function oddsAreReal(picks,B){
  B=B||curBook();
  return !!picks.length&&picks.every(function(c){
    return bookIsPriced(c.f||fixtureById(c.id),c.code,B); });
}
function notStarted(f){if(f&&f.kickoff){return new Date(f.kickoff).getTime()>Date.now();}return isUpcoming(f);}
/* A leg with no price multiplies by nothing rather than by noise. Every pick
   the builders make carries a probability, so this is the converted-slip case
   and only that: the total it gives back is then a floor over the legs we can
   price, which is why splitBoxHTML refuses to draw payouts at all when one of
   them is unpriced. */
function totalOdds(picks){
  return picks.reduce(function(t,c){
    var o=legOdd(c.f,c.code,c.p);
    return (o&&isFinite(o)&&o>1)?t*o:t;},1);
}
async function bookSlip(){
  var B=curBook();
  var picks = BUILD.picks;
  /* A LEG THIS BOOKMAKER CANNOT TAKE STOPS THE WHOLE TICKET, so it is caught
     here rather than by the bookmaker. One refused selection refuses the slip
     behind it, and the reply that comes back names a market rather than a
     reason anybody can act on. The slider will not pick these - see
     bookAllows - so this is for a slip built before the book was switched, or
     one a reader assembled by hand. Offered as a switch rather than a
     refusal: the leg is perfectly bookable, just not here. */
  var wrongBook=picks.filter(function(c){return !bookAllows(c.code,B);});
  if(wrongBook.length){
    /* ONE BUTTON PER BOOK THAT SELLS IT, rather than a favourite picked off
       the front of the list. Two books sell the 1.5 rung and choosing between
       them for the reader would move their whole slip to a bookmaker they may
       not hold an account with, on a tap that said only "Use". */
    var need=(BOOK_ONLY[wrongBook[0].code]||["bet9ja"]).filter(function(k){return !!BOOKS[k];});
    if(!need.length) need=["bet9ja"];
    $("bookResult").innerHTML="<div class='confirm-card'><p><b>"+
      wrongBook.length+" leg"+(wrongBook.length===1?"":"s")+"</b> on this slip "+
      (wrongBook.length===1?"is":"are")+" sold by "+bookNames(need)+" and not by "+
      B.label+". Book the whole slip at "+bookNames(need)+" instead?</p>"+
      "<div class='ca'>"+need.map(function(k){
        return "<button class='confirm-go' type='button' data-use='"+esc(k)+"'>Use "+
          esc(BOOKS[k].label)+"</button>";}).join("")+
      "<button class='confirm-cancel' type='button'>Cancel</button></div></div>";
    $("bookResult").querySelectorAll(".confirm-go").forEach(function(btn){
      btn.addEventListener("click",function(){
        setBook(btn.dataset.use);
        $("bookResult").innerHTML="";
        bookSlip();
      });
    });
    $("bookResult").querySelector(".confirm-cancel").addEventListener("click",function(){
      $("bookResult").innerHTML="";
    });
    return;
  }
  var has=function(c){return !!bookIdOf(c,B);};
  var bookable=picks.filter(has);
  var missing=picks.filter(function(c){return !has(c);});

  /* If some picks have no id for this book, try to match them first before
     giving up. Only SportyBet is worth awaiting - Bet9ja loads once at boot
     and a game it does not carry will not appear by asking again. */
  if(missing.length > 0 && B.key==="sporty"){
    $("bookResult").innerHTML="<div class='code-info'>Matching "+B.mark+" events...</div>";
    await loadSporty();
    /* Re-evaluate after matching */
    picks = BUILD.picks;  // refresh in case DATA.fixtures updated
    bookable = picks.filter(has);
    missing = picks.filter(function(c){return !has(c);});
  }

  if(!bookable.length){
    $("bookResult").innerHTML="<div class='code-err'>None of these games are on "+
      B.mark+" right now, so a code can't be created. Try lowering the risk, or "+
      "check back nearer kickoff.</div>";
    return;
  }
  if(missing.length){
    /* Said once, short. It was "1 game isn't available on Bet9ja yet. Book
       the other 2 without it?" - two sentences and a trailing clause to carry
       one fact and one question. */
    showPrompt("bookResult","<div class='confirm-card'><p>"+B.mark+" doesn't have "+
      missing.length+" of these games.</p>"+
      "<div class='ca'><button class='confirm-go' type='button'>Book the other "+
      (bookable.length===1?"one":bookable.length)+"</button>"+
      "<button class='confirm-cancel' type='button'>Cancel</button></div></div>");
    $("bookResult").querySelector(".confirm-go").addEventListener("click",function(){
      clearPrompt("bookResult");
      if(!confirmDropUnpriced(bookable,"bookResult",doBook,B)) doBook(bookable);});
    $("bookResult").querySelector(".confirm-cancel").addEventListener("click",function(){clearPrompt("bookResult");});
    return;
  }
  if(confirmDropUnpriced(bookable,"bookResult",doBook,B)) return;
  doBook(bookable);
}
/* Does SportyBet actually price this exact pick?
   Having an eventId only says the MATCH is listed. A slip dies on the market:
   we price every fixture for every market we model, SportyBet does not carry
   all of them (team totals are missing on roughly half its card), and one leg
   it cannot take rejects the whole ticket. A real odd in sportyOdds is proof
   the market exists, because that number came from SportyBet. */
/* Kept as a name because the board and the badges still ask specifically
   about SportyBet. The pre-flight asks the CURRENT book instead. */
function hasSportyMarket(c){ return BOOKS.sporty.priced(c); }
/* Ask before booking rather than after failing.
   Both slips used to send everything, let SportyBet refuse the lot, and then
   quietly retry a subset - which showed "SportyBet wouldn't take this slip"
   whenever the retry conditions did not hold, and never told anyone which game
   was the problem. The legs that cannot be placed are knowable up front, so
   the choice belongs to the reader before the ticket is spent.
   Returns true when it has taken over and is waiting on an answer. */
/* The bookmaker refused some legs. Ask, rather than deciding for them.
   Both booking paths used to drop the refused legs and re-send on their own,
   flashing a note as they went - and My slip went further and deleted those
   legs from the reader's own slip before asking. A slip is somebody's choice;
   a bookmaker refusing part of it is a reason to ask, not a licence to edit.
   The same card as the pre-flight, because it is the same question arriving a
   moment later - the only difference is that this one had to be sent to find
   out. */
function confirmAfterRefusal(target,names,keep,B,go){
  var n=names.length, list=names.slice(0,4);
  showPrompt(target,"<div class='confirm-card'><p><b>"+B.mark+" can't take "+n+
    " of these</b>"+
    (list.length?"<span class='cf-list'>"+list.map(esc).join("<br>")+
      (n>list.length?"<br>and "+(n-list.length)+" more":"")+"</span>":"")+
    "</p><div class='ca'><button class='confirm-go' type='button'>Book the other "+
    (keep===1?"one":keep)+"</button>"+
    "<button class='confirm-cancel' type='button'>Cancel</button></div></div>");
  var el=$(target); if(!el) return;
  el.querySelector(".confirm-go").addEventListener("click",function(){
    clearPrompt(target); go();});
  el.querySelector(".confirm-cancel").addEventListener("click",function(){
    clearPrompt(target);});
}
function confirmDropUnpriced(picks,target,go,B){
  B=B||curBook();
  var priced=picks.filter(function(c){return B.priced(c);});
  var un=picks.length-priced.length;
  if(!un) return false;
  var el=$(target); if(!el) return false;
  /* A book whose feed is not the whole book is judged on whether it carries
     the GAME, so the honest sentence is about the game and not about the
     market - saying it "isn't offering that market" would be a guess, and
     usually a wrong one. Read off `full` rather than named, or the third book
     inherits SportyBet's sentence and tells people something untrue. */
  var byEvent=!B.full;
  if(!priced.length){
    clearPrompt(target);
    el.innerHTML="<div class='code-err'><b>"+B.mark+
      (byEvent?" doesn't have "+(picks.length===1?"this game.":"any of these games."):
               " isn't offering "+(picks.length===1?"this market.":"any of these markets."))+"</b>"+
      /* "the other bookmaker" was true while there were two of them. */
      "<span>"+(byEvent?"Try another bookmaker.":
        "Swap for another market, or try again nearer kickoff.")+"</span></div>";
    return true;
  }
  var names=picks.filter(function(c){return !B.priced(c);})
    .map(function(c){var f=(c&&c.f)||fixtureById(c.id);
      return f?(f.home+" v "+f.away):null;}).filter(Boolean).slice(0,4);
  showPrompt(target,"<div class='confirm-card'><p><b>"+B.mark+" can't take "+un+
    " pick"+(un===1?"":"s")+"</b>"+
    (names.length?"<span class='cf-list'>"+names.map(esc).join("<br>")+
      (un>names.length?"<br>and "+(un-names.length)+" more":"")+"</span>":"")+
    "</p><div class='ca'><button class='confirm-go' type='button'>Book the other "+
    (priced.length===1?"one":priced.length)+"</button>"+
    "<button class='confirm-cancel' type='button'>Cancel</button></div></div>");
  el.querySelector(".confirm-go").addEventListener("click",function(){
    clearPrompt(target); go(priced);});
  el.querySelector(".confirm-cancel").addEventListener("click",function(){clearPrompt(target);});
  return true;
}
function doBook(picks,retried,B){
  B=B||curBook();
  var sel=picks.map(function(c){return B.sel(c);});
  if(!sel.length) return;
  BUILD.booking=true; renderBuilder();
  /* Not on a retry: the caller has just written which pick it dropped and
     why, and clearing here wiped that within the same tick - so the note
     never reached the screen and the recovery looked like a stall. */
  if(!retried) $("bookResult").innerHTML="";
  bookFetch(sel,B)
    .then(function(d){
      BUILD.booking=false; renderBuilder();
      var code=B.codeOf(d);
      if(d&&d.success&&code){
        showCode(code,"bookResult",function(){
          rememberSlip(picks,totalOdds(picks),code);},B,picks);
      } else {
        /* SportyBet can reject individual markets ("no market") when our pick
           used an estimated odd for a market it doesn't list. Retry once with
           only the legs carrying real SportyBet odds - those are verified to
           exist. Toggling slider/wizard used to be the manual workaround. */
        var rejected=!d||!d.success;
        var safe=dropUnbookable(picks,d,B);
        if(rejected&&!retried&&safe.length>=1&&safe.length<picks.length){
          var _kept={}; safe.forEach(function(c){_kept[c.id+"|"+c.code]=1;});
          var _out=picks.filter(function(c){return !_kept[c.id+"|"+c.code];})
            .map(function(c){var f=c.f||fixtureById(c.id);
              return f?(f.home+" v "+f.away):"One pick";});
          confirmAfterRefusal("bookResult",_out,safe.length,B,function(){
            doBook(safe,true,B);});
        } else {
          $("bookResult").innerHTML=bookErrHTML(d,B);
        }
      }
    })
    .catch(function(){
      BUILD.booking=false; renderBuilder();
      $("bookResult").innerHTML="<div class='code-err'>Couldn't reach the booking "+
        "service. Check your connection and try again.</div>";
    });
}
/* The state half of Clear, without the repaint. Both Clear buttons run this -
   the trash in the builder foot and the one in the My slip sheet - because
   they are the same slip seen from two places, and a Clear that emptied one
   view while the other still showed the games and the odds was the whole
   complaint. Keep them on one definition rather than two that drift.
   Clear BOTH builders so "clear" means clear whichever mode you switch to next
   (slider and wizard keep separate slips, which otherwise looks like cleared
   games "coming back" when you switch modes). */
function clearSlipState(){
  BUILD.picks.forEach(function(c){BUILD.removed[c.id]=1;});
  WSP.conjured=false; WSP.removed={}; WSP._slip=null; WSP._sig=null;
  $("bookResult").innerHTML="";
  var to=$("totOdds"); if(to) to.textContent="-";
}
function clearSlip(){
  clearSlipState();
  renderBuilder();
}
/* ---- shared booking-code card, share + copy + open ---- */
/* Booking code appears as a compact centred modal (green glass) over a dimmed
   scrim - not an elongated inline block. hostId kept for call-site compat. */
/* `save` is a function that files this slip in Your slips, or null when
   there is nothing to file. Passing it makes saving an offer rather than
   something that already happened. */
/* Read a freshly minted code back and return the picks it actually contains.
   Matched on the book's own event id plus our market code, because that pair is
   what was sent and what comes back - team names do not survive the round trip
   on either book. A leg we cannot match is treated as dropped, which is the
   safe direction: it understates the slip rather than claiming a game the code
   does not hold. */
function reconcileCode(code,picks,B){
  B=B||curBook();
  /* Only a book whose codes we can READ can be reconciled. /api/slip refuses
     an unknown bookmaker with a 400, which this would have handled correctly
     and silently - one wasted round trip per booking, for an answer known
     before it was asked. BetKing's read endpoint is open and mapped in
     betking.py; what is missing is the market table on the way back, so this
     flips to true in the same change that adds it. */
  if(!B.readable) return Promise.resolve(null);
  return fetch("/api/slip?book="+encodeURIComponent(B.key)+"&code="+encodeURIComponent(code),
               {headers:{Accept:"application/json"}})
    .then(function(r){return r.json();})
    .then(function(d){
      if(!d||!d.success||!Array.isArray(d.legs)) return null;
      var held={};
      d.legs.forEach(function(l){ held[String(l.eventId)+"|"+String(l.prediction)]=1; });
      var kept=picks.filter(function(c){
        return held[String(bookIdOf(c,B))+"|"+String(c.code)]; });
      /* Nothing matched at all means the shapes disagree, not that the slip is
         empty - say nothing rather than tell somebody their code is void. */
      return kept.length?kept:null;
    });
}
function showCode(code,hostId,save,B,picks){
  B=B||curBook();
  /* The host still holds whatever was last written there, and after a partial
     booking that is "...booking the other 2..." - a progress note with a
     spinner in it. The code has arrived, so the progress is over; leaving it
     up left a spinner turning behind the modal and still turning after the
     modal was closed. Reported as a loading animation that never ends. */
  try{ var _h=$(hostId); if(_h) _h.innerHTML=""; }catch(e){}
  var old=document.getElementById("codeModal");
  if(old) old.remove();
  var wrap=document.createElement("div");
  wrap.id="codeModal";
  wrap.className="code-modal-scrim";
  var _fb=footballLink(code);
  wrap.innerHTML="<div class='code-card code-card--modal code-card--"+
    (B.skin||"sb")+
    "' role='dialog' aria-modal='true' aria-label='Booking code'>"+
    "<button class='code-x' type='button' aria-label='Close'>"+
      "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' aria-hidden='true'><path d='M6 6l12 12M18 6L6 18'/></svg></button>"+
    "<i>Your "+B.mark+" booking code</i>"+
    "<b>"+esc(code)+"</b>"+
    /* The warning belongs here, on the one screen a reader always sees after
       booking, rather than somewhere they may never look. */
    quotaNoteHTML(SW_QUOTA_LEFT)+
    /* Three rows, narrowing to a point. What you do with the code sits at the
       top as a small pair; the one thing most people are here to do sits alone
       under it, with nothing beside it to share the attention; and the other
       book that takes the same code sits last, said as a sentence. */
    "<div class='code-acts'>"+
      "<button class='code-copy' type='button'>Copy</button>"+
      "<button class='share-btn' type='button' data-sh='1'>↗ Share</button>"+
    "</div>"+
    /* Filled only when the read-back says the bookmaker kept fewer legs than
       we sent - see reconcileCode. Empty and marginless otherwise, so a slip
       that went through whole says nothing about it. */
    "<div class='code-kept' aria-live='polite'></div>"+
    /* Every booked slip used to be filed in Your slips automatically,
       so a code pulled to compare odds, or to see what a x50k looks
       like, landed in the record beside the ones actually staked - and
       the running tally counted it. Keeping a slip is now a decision.
       The code is still yours either way: this saves the record, not
       the bet. */
    (save?"<div class='code-keep'>"+
      "<button class='code-save' type='button'>Save to Your slips</button>"+
      "<span class='code-keep-n'>Only saved slips count towards your record.</span>"+
    "</div>":"")+
    /* A book with no deep link gets a sentence, not a link that looks like
       one. BetKing reads a booking code from the betslip's own box and from
       nowhere in the URL, so "Open in BetKing" with the code appended would
       land the reader on their board with an empty slip and no idea why. */
    "<div class='code-opens'>"+
      (B.open
        ? "<a class='code-open' href='"+B.open+encodeURIComponent(code)+
            "' target='_blank' rel='noopener'>Open in "+B.mark+"</a>"
        : "<span class='code-paste'>Paste this code into the booking code box "+
            "on your "+B.mark+" betslip.</span>")+
    "</div>"+
    /* Offered after the code, not instead of it: the slip they asked for is
       booked and above this. Only when there are legs to deal and at least
       two tickets' worth of them - and the prices are printed on the buttons,
       because "split it" sounds free and is not. */
    splitBoxHTML(picks)+
    /* Same code, same slip, other book. This was a footnote saying it "also
       works on football.com", which left anyone who uses that app to copy the
       code and go and find it. The sentence stays - it is what makes the pill
       make sense - but the name is now the way in. */
    (B.key==="sporty"?"<p class='code-also'>Works on "+
      "<a class='code-open-alt' href=\""+esc(_fb.href)+"\""+
        (_fb.blank?" target='_blank'":"")+" rel='noopener'>"+
        "football<span class='fb-dot'>.</span>com</a></p>":"")+
    "</div>";
  document.body.appendChild(wrap);
  /* A fixed scrim stops clicks, not the wheel: the board went on scrolling
     behind the code, and on a phone the modal appeared to drift off. Locked
     while it is open, and only while it is open. */
  var _ovf=document.body.style.overflow;
  document.body.style.overflow="hidden";
  function close(){wrap.remove();document.body.style.overflow=_ovf;}
  wrap.addEventListener("click",function(e){if(e.target===wrap)close();});
  wrap.querySelector(".code-x").addEventListener("click",close);
  wrap.querySelector(".code-copy").addEventListener("click",function(){
    copyText(code);
    this.textContent="Copied"; var s=this;
    setTimeout(function(){s.textContent="Copy";},1600);});
  /* WHAT THE BOOKMAKER KEPT, WHICH IS NOT ALWAYS WHAT WE SENT.
     A booking route refuses a leg it cannot map, but the BOOKMAKER is under no
     such obligation: send twenty-four selections and a code can come back
     carrying twenty-one, with the three it would not take dropped silently and
     a code returned as a success. Everything downstream then described the
     slip we asked for rather than the one the code contains - the odds on the
     share card were the total of all twenty-four, which is a number the reader
     cannot win.
     So the code is read back, once, and anything that quotes a total waits for
     that answer: the share link's stored payload, the split box, and the line
     under the code. Read, not re-derived - the only authority on what a code
     holds is the book that issued it. Best effort: a read that fails leaves
     what we sent on screen, which is exactly today's behaviour. */
  var _live=picks;
  function _useKept(kept){
    _live=kept;
    rememberShortLink(code,kept,B);
    try{ wireSplit(wrap,kept,B); }catch(e){}
  }
  rememberShortLink(code,picks,B);
  wrap.querySelector("[data-sh]").addEventListener("click",function(){shareCode(code,_live,B);});
  wireSplit(wrap,picks,B);
  reconcileCode(code,picks,B).then(function(kept){
    if(!kept||kept.length>=picks.length) return;
    _useKept(kept);
    var lost=picks.length-kept.length;
    var box=wrap.querySelector(".code-kept");
    if(box) box.innerHTML="<b>"+B.mark+" kept "+kept.length+" of "+picks.length+
      "</b><span>"+lost+" game"+(lost===1?"":"s")+" "+(lost===1?"was":"were")+
      " dropped at their end, so this code pays about ×"+
      totalOdds(kept).toFixed(2)+" - not the total the builder showed.</span>";
  }).catch(function(){});
  var sv=wrap.querySelector(".code-save");
  if(sv) sv.addEventListener("click",function(){
    try{ save(); }catch(e){}
    sv.textContent="Saved"; sv.disabled=true; sv.classList.add("done");
    var n=wrap.querySelector(".code-keep-n");
    if(n) n.textContent="In Your slips. It will be graded as the games finish.";
  });
}
/* ---- splitting one slip into several tickets ---- */
function splitBoxHTML(picks,oddsOf){
  if(!picks||!picks.length) return "";
  var inner=splitBoxInner(picks,oddsOf);
  return inner?("<div class='code-split' id='codeSplit'>"+inner+"</div>"):"";
}

/* One place where a split is started, so the quota check cannot be skipped by
   a second call site later. */
function wireSplit(wrap,picks,B,opt){
  var box=wrap.querySelector(opt&&opt.sel||"#codeSplit");
  if(!box) return;
  box.querySelectorAll(".sp-way").forEach(function(b){
    b.addEventListener("click",function(){
      var n=+b.dataset.n;
      /* Splitting mints a code per ticket, so it costs what it looks like it
         costs. Said before the first request rather than after the third one
         fails with a quota message. */
      if(SW_QUOTA_LEFT!==null&&isFinite(+SW_QUOTA_LEFT)&&+SW_QUOTA_LEFT<n){
        /* Said above the buttons, not instead of them: with two codes left
           and three tickets asked for, two tickets is still affordable and
           replacing the row would have taken that away as well. */
        var q=box.querySelector(".sp-q");
        if(q) q.outerHTML="<p class='sp-q sp-short'>"+n+" tickets needs "+n+
          " booking codes and you have "+(+SW_QUOTA_LEFT===0?"none":(+SW_QUOTA_LEFT))+
          " left today. More after midnight.</p>";
        return;
      }
      splitAndBook(picks,n,box,B,opt);
    });
  });
}


/* WHY ANYBODY WANTS THIS. An eight-leg slip at x500 is a lottery ticket: one
   goal in one game and the whole thing is gone. The same eight legs as two
   tickets of four pay about x22 each, and two tickets lose independently -
   which is the difference between a bet that can half-win and one that cannot.
   Nobody is talked into it here; the payout of each ticket is printed before
   the buttons are pressed, because the honest headline is that splitting
   LOWERS the maximum return. */

/* Deal the legs out like cards rather than cutting the slip in half.
   A contiguous chop puts the confident end of the slip in ticket one and the
   long shots in the last one, so one ticket is nearly certain and another is
   nearly hopeless - which is not what "split it" means to anybody. Dealing
   round-robin keeps the counts even to within one leg and spreads the prices,
   so the tickets are siblings. */
function splitPicks(picks,n){
  var out=[],i;
  for(i=0;i<n;i++) out.push([]);
  for(i=0;i<picks.length;i++) out[i%n].push(picks[i]);
  return out;
}

/* How many ways this slip can be cut. Two legs is the floor for a ticket -
   a "split" that hands somebody a single is a different bet, not a split. */
function splitWays(len){
  var max=Math.min(4,Math.floor(len/2)), out=[];
  for(var n=2;n<=max;n++) out.push(n);
  return out;
}

/* THE WAYS THAT FIT A BETSLIP. splitWays offers two, three and four, which is
   the right offer for a slip that is already bookable. At the cap it is not:
   170 picks in two tickets is 85 on a ticket and no betslip takes that. So the
   ways over the limit are dropped and the rest stand - the reader still gets a
   choice up to four, it is only the ones that cannot be placed that go.
   When nothing up to four fits, the limit itself names the number, which is
   the only honest offer left. */
function capWays(len){
  var fits=splitWays(len).filter(function(n){return Math.ceil(len/n)<=BETSLIP_MAX;});
  return fits.length?fits:[Math.ceil(len/BETSLIP_MAX)];
}
/* The row of ticket counts, priced by leg count rather than payout: at the cap
   the question is "will this fit", and the odds of each part are already on
   screen above. */
function capWaysHTML(picks){
  return "<div class='sp-ways'>"+capWays(picks.length).map(function(n){
    var parts=splitPicks(picks,n);
    return "<button class='sp-way' type='button' data-n='"+n+"'><b>"+n+
      " tickets</b><span>"+parts.map(function(p){return p.length;}).join(" + ")+
      " games</span></button>";}).join("")+"</div>";
}
function splitRowHTML(n,parts,B){
  return "<div class='sp-row'><b>"+n+" tickets</b>"+
    "<span>"+parts.map(function(p){return p.length+" games at x"+
      totalOdds(p).toFixed(p.length>4?0:1);}).join(" &middot; ")+"</span></div>";
}

/* Books each ticket in turn and writes the codes into the modal.
   One at a time rather than all at once: the codes come from the bookmaker a
   request at a time whatever we do, the quota counts them one at a time, and a
   burst of four is the shape of traffic that got this project block-paged
   once already. */
function splitAndBook(picks,n,host,B,opt){
  opt=opt||{};
  /* A leg from somebody else's code is not one of our picks - it has no
     fixture behind it and no probability, only what the bookmaker said. The
     dealing and the booking are identical either way, so the two callers
     differ by these two functions rather than by a second copy of all this. */
  var selOf=opt.selOf||function(c){return B.sel(c);};
  var oddsOf=opt.oddsOf||totalOdds;
  var parts=splitPicks(picks,n);
  host.innerHTML="<div class='sp-out' aria-live='polite'><div class='sp-wait'>"+
    "<span class='mini-load'></span>Booking "+n+" tickets…</div></div>";
  var out=host.querySelector(".sp-out");
  var done=[];
  function step(i){
    if(i>=parts.length){ renderSplit(out,done,B,oddsOf); return; }
    bookFetch(parts[i].map(selOf),B)
      .then(function(d){
        var code=d&&d.success&&B.codeOf(d);
        done.push({legs:parts[i],code:code||null,
                   why:code?null:bookErrText(d,B)});
      })
      .catch(function(){
        done.push({legs:parts[i],code:null,why:"Couldn't reach the booking service."});
      })
      .then(function(){
        var w=out.querySelector(".sp-wait");
        if(w) w.innerHTML="<span class='mini-load'></span>"+
          "Booking ticket "+(i+2>parts.length?parts.length:i+2)+" of "+parts.length+"…";
        step(i+1);
      });
  }
  step(0);
}

/* Plain words for a refusal, reusing the card the booking path already builds
   so the two never drift into saying different things about one failure. */
function bookErrText(d,B){
  var tmp=document.createElement("div");
  tmp.innerHTML=bookErrHTML(d,B);
  /* The headline alone. That card is built as a headline plus an explanation,
     and flattening the whole thing reads as a stutter: "SportyBet wouldn't
     take this slip. SportyBet rejected the slip." */
  var b=tmp.querySelector("b");
  return ((b&&b.textContent)||tmp.textContent||"That ticket was refused.")
    .trim().slice(0,120);
}

function renderSplit(out,done,B,oddsOf){
  oddsOf=oddsOf||totalOdds;
  var ok=done.filter(function(t){return t.code;});
  out.innerHTML="<div class='sp-head'>"+
      (ok.length===done.length
        ? done.length+" tickets, "+done.length+" codes"
        : ok.length+" of "+done.length+" tickets booked")+"</div>"+
    done.map(function(t,i){
      var odds=oddsOf(t.legs);
      return "<div class='sp-t"+(t.code?"":" sp-bad")+"'>"+
        "<span class='sp-n'>"+(i+1)+"</span>"+
        (t.code
          ? "<b>"+esc(t.code)+"</b><span class='sp-m'>"+t.legs.length+
            " games &middot; x"+odds.toFixed(odds>=100?0:2)+"</span>"+
            "<button class='sp-copy' type='button' data-c='"+esc(t.code)+
              "' aria-label='Copy ticket "+(i+1)+"'>Copy</button>"+
            (B.open
              ? "<a class='sp-open' href='"+B.open+encodeURIComponent(t.code)+
                  "' target='_blank' rel='noopener'>Open</a>"
              : "")
          : "<b class='sp-none'>Not booked</b><span class='sp-m'>"+esc(t.why||"")+"</span>")+
        "</div>";}).join("")+
    (ok.length?"<p class='sp-note'>Each code is its own ticket. Load them one "+
      "at a time in "+B.mark+".</p>":"");
  out.querySelectorAll(".sp-copy").forEach(function(b){
    b.addEventListener("click",function(){
      copyText(b.dataset.c);
      b.textContent="Copied";
      setTimeout(function(){b.textContent="Copy";},1600);});});
}

/* ---- a code somebody else built ---- */
/* THE READ IS NOT A TRANSCRIPT, and the panel is built around that. Both books
   drop events from a coupon on their own schedule and neither says how many
   legs there were, so what comes back can be shorter than what was booked and
   there is no way to tell from the response. Every screen here therefore says
   what WE READ, shows the games, and lets the reader judge - it never claims to
   be their slip. */
/* DROPPING STARTS ON, because it is half of what "edit my ticket" means.
   Asked plainly: "when we gamblers say we want a ticket edited, we want to
   remove picks that are not likely, and some options changed to safer ones."
   It shipped with saferDrop false, so three of the four levels only ever
   swapped markets - a reader who chose Safest expecting a cleaned ticket got
   no removals at all, and had to notice a switch to find the other half.
   Nothing is destructive: the panel lists every leg it would take out, with
   the price before and after, and books nothing until the button is pressed.
   The switch is still there to turn it off. */
var BYO={book:"sporty",to:null,legs:null,booked:null,dropped:null,code:"",reline:false,saferDrop:true,saferHow:"normal",saferSwapOn:true,saferShuffle:0,job:null};

function byoSel(leg){
  /* SportyBet's route takes `prediction`; both other books take `code`. Read
     off the table (BOOKS[k].arg) rather than named here, so a fourth book is
     one table row and not a hunt for every string comparison. */
  var B=BOOKS[BYO.book]||BOOKS.sporty, o={eventId:leg.eventId};
  o[B.arg||"prediction"]=leg.prediction;
  return o;
}
/* Their prices, not ours. A borrowed slip has no fixture behind it and no
   probability - the only honest number is the one the bookmaker printed. */
function byoOdds(legs){
  return legs.reduce(function(t,l){
    var o=+l.odds; return t*(isFinite(o)&&o>1?o:1);},1);
}
function byoBook(){ return BOOKS[BYO.book]||BOOKS.sporty; }
function legStarted(l){
  /* THE BOOKMAKER'S OWN VERDICT FIRST, when we have it. A leg the board has
     let go is named by asking SportyBet for that event, and the answer carries
     the match status: H1, HT, H2 or ENDED all mean the game is on or over.
     That is a fact, where a kickoff time compared against this device's clock
     is a guess - and the clock was all this had until now. */
  var st=String((l&&l.status)||"").toUpperCase();
  if(st&&st!=="NOT_STARTED") return true;
  var t=l&&l.kickoff?Date.parse(l.kickoff):NaN;
  return isFinite(t)&&t<=Date.now();
}

function byoRead(){
  var inp=$("byoCode"), out=$("byoOut");
  if(!inp||!out) return;
  var code=(inp.value||"").trim().toUpperCase();
  if(!/^[A-Za-z0-9]{4,16}$/.test(code)){
    out.innerHTML="<div class='code-err'><b>That does not look like a booking code.</b>"+
      "<span>Codes are 4 to 16 letters and numbers, no spaces.</span></div>";
    return;
  }
  BYO.legs=null; BYO.code=code;
  /* EVERY BOOK MATTERS HERE, so this is the third place that asks for the
     feeds. A conversion pairs the code's book with the target's, and feedMatch
     reads the target's own events for games our board does not carry - with no
     feed that answer is silently "they do not list this game". refreshByoPanels
     redraws the panel when they land. */
  try{ Object.keys(BOOKS).forEach(ensureBookFeed); }catch(e){}
  out.innerHTML="<div class='byo-wait'><span class='mini-load'></span>Reading "+
    byoBook().label+" code "+esc(code)+"…</div>";
  fetch("/api/slip?book="+encodeURIComponent(BYO.book)+"&code="+encodeURIComponent(code),
        {headers:{Accept:"application/json"}})
    .then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});})
    .then(function(res){
      if(!res.ok||!res.d||!res.d.success){
        var gone=!!(res.d&&res.d.notFound);
        /* The likeliest cause by far, and one the reader can act on: the two
           books issue codes that look alike and neither will read the
           other's. Repeating the server's own sentence under a headline that
           already said it taught nobody anything. */
        var why=gone
          ? "Check the code, and check the bookmaker above - "+byoBook().label+
            " will not read a code from the other one."
          : ((res.d&&res.d.error)||"that code could not be read");
        out.innerHTML="<div class='code-err'><b>"+
          (gone?"No slip behind that code.":"Couldn't read that code.")+
          "</b><span>"+esc(String(why))+"</span></div>";
        return;
      }
      BYO.legs=res.d.legs||[];
      /* WHAT THE CODE HELD BEFORE ITS GAMES STARTED. A leg leaves the coupon
         the moment its fixture kicks off, so an afternoon read is shorter than
         the slip somebody was handed that morning - measured on a BetKing code
         booked with four legs and reading back with one four hours later.
         Only BetKing tells us; the other two thin out just as quietly and say
         nothing, so these stay null and the line is simply not drawn. */
      BYO.booked=res.d.booked||null;
      BYO.dropped=res.d.removed||null;
      renderByo();
    })
    .catch(function(){
      out.innerHTML="<div class='code-err'><b>Couldn't reach the reader.</b>"+
        "<span>Check your connection and try again.</span></div>";
    });
}

/* HOW LIKELY IS A LEG WE DID NOT CHOOSE?
 *
 * Two answers, in order, and the order is the honest part. Where the game is
 * on our board and the market is one we model, the answer is our own
 * probability - that is the thing this site exists to produce. Where it is
 * not, the only number in the room is the price the bookmaker put on it, and
 * 1/odds is that price read as a chance. It carries their margin, so it reads
 * a little high on every leg equally; as a way of ordering legs from likeliest
 * to least it is fine, and as a published probability it would not be, which
 * is why it is never shown as one.
 * Nothing at all for a leg with no price and no fixture - and that sorts last
 * rather than pretending to be a coin flip. */
function legChance(l,B){
  var f=(l&&l.prediction)?fixtureByLeg(l,B):null;
  var p=f?mProb(f,l.prediction):null;
  if(p!=null&&isFinite(p)) return {p:p,src:"model"};
  var o=+((l||{}).odds);
  if(isFinite(o)&&o>1.01) return {p:1/o,src:"book"};
  return {p:null,src:null};
}
/* The legs a trim would keep, likeliest first, and the ones it would drop.
   Sorted on the chance above; ties break on the bookmaker's price so the order
   is stable rather than dependent on how the read happened to arrive. */
function trimPlan(legs,B,drop){
  var scored=(legs||[]).map(function(l,i){
    var c=legChance(l,B);
    return {leg:l,i:i,p:(c.p==null?-1:c.p),src:c.src};
  });
  scored.sort(function(a,b){ return (b.p-a.p) || ((+b.leg.odds||0)-(+a.leg.odds||0)); });
  var keepN=Math.max(1,scored.length-Math.max(0,drop|0));
  return {keep:scored.slice(0,keepN), cut:scored.slice(keepN)};
}

/* THE SAFER VERSION OF THE SAME BET, ON THE SAME GAME.
 *
 * Asked for: run a pasted ticket past the model and soften it. Every entry
 * here keeps the fixture and widens the outcome - a win becomes a win-or-draw,
 * a goals line drops a rung - so the leg still turns on the game they picked.
 * Nothing crosses to another fixture and nothing is invented: if a market has
 * no safer sibling we sell, it is left exactly as it was.
 *
 * The draw is the one that needs saying. "Draw" softens into whichever double
 * chance contains it and our model rates higher, which is a real change of
 * bet - it is shown like every other change, with both numbers, before
 * anything is booked. */
var SAFER={"1":"1X","2":"X2",
  /* The promotion rides along: the leg stays on the same game and the same
     side, and widens the outcome exactly as a plain result would. Priced at
     the market underneath (see mProb), so the gain this is judged on is a
     conservative one - the real 1UP is worth a little more than the number.
     DC1UP_* is deliberately absent: it is already a double chance and there is
     nothing wider to move it to. */
  "UP1_1":"1X","UP2_1":"1X","UP1_2":"X2","UP2_2":"X2",
  "OVER_2.5":"OVER_1.5","OVER_3.5":"OVER_2.5",
  "HOME_OVER_1.5":"HOME_OVER_0.5","AWAY_OVER_1.5":"AWAY_OVER_0.5",
  "MIX_X_OV_2.5":"MIX_X_OV_1.5","MIX_1_OV_2.5":"MIX_1_OV_1.5",
  "MIX_2_OV_2.5":"MIX_2_OV_1.5",
  /* BOTH TEAMS TO SCORE, SOFTENED INTO ANY TWO GOALS. The same game and the
     same idea - goals - with one condition dropped: over 1.5 does not care who
     scores them, and on a card where one side is much stronger that is where
     both-score tickets die. A real change of bet, shown with both numbers like
     the draw is. */
  "GG":"OVER_1.5"};
/* WHERE THE TABLE ALONE CANNOT DECIDE, because the safer version depends on
   which side the model likes. Same shape as the draw's rule, which has always
   picked between 1X and X2 rather than hard-coding one. */
function saferPick(f,from){
  if(from==="X"||from==="UP1_X"||from==="UP2_X")
    return (mProb(f,"1X")>=mProb(f,"X2"))?"1X":"X2";
  /* Two goals from anybody, softened to one goal from whoever is likelier to
     get it. Fewer goals asked for, and the side chosen on the model rather
     than on the fixture's home advantage. */
  if(from==="OVER_1.5")
    return (mProb(f,"HOME_OVER_0.5")>=mProb(f,"AWAY_OVER_0.5"))
      ? "HOME_OVER_0.5" : "AWAY_OVER_0.5";
  return SAFER[from]||null;
}
/* How much better it has to get to be worth changing somebody's bet. Eight
   points: below that the two markets are close enough that the swap is churn,
   and churn on a stranger's ticket is the thing not to do. */
var SAFER_MIN_GAIN=0.08;
/* HOW HARD TO PUSH, AS THREE WORDS INSTEAD OF A NUMBER.
   The same two dials sit behind all three: how much better a bet has to get
   before we touch it, and how weak a leg has to be before we offer to take it
   out. "Light" only moves what is clearly worth moving; "Strong" moves
   anything that gains at all and offers to drop more. Nobody has to know that
   is what the words mean. */
var SAFER_STRENGTH={
  /* AUTO IS A DECISION, NOT A SETTING. Both switches on, and numbers between
     Normal and Strong: swap anything that gains five points, drop anything
     under 55% we cannot improve. It is the answer for somebody who does not
     want to weigh two switches and three words - "you decide" - and it is
     still shown in full before it books anything. */
  /* `steps` is how many rungs down the ladder a leg may travel. One is the
     neighbouring market - over 2.5 to over 1.5. Two lets a leg keep going
     while it keeps helping, so over 3.5 can reach over 1.5 and both-score can
     land on one team's goal. That is what makes the three levels change the
     BET rather than only how keen we are to touch it. */
  /* THE WORDS NAME WHAT THE READER GETS, NOT HOW HARD WE PUSH. They used to
     read Light / Normal / Strong, and "Strong" is the wrong word twice over on
     a betting page: it sounds like a bolder bet when it means the opposite -
     the lowest bar to change a leg, the furthest a leg may travel, and the
     most legs offered up for removal. Every one of these dials moves in one
     direction, safety, so the labels say so and the scale reads in order. */
  auto:{gain:0.05,under:0.55,steps:2,label:"Let us decide",
        note:"We fix what we can and drop what we cannot",
        swap:true,drop:true},
  light:{gain:0.14,under:0.50,steps:1,label:"Light touch",
         note:"Only the legs that clearly need it"},
  normal:{gain:0.08,under:0.60,steps:1,label:"Balanced",note:"Our usual call"},
  strong:{gain:0.03,under:0.70,steps:3,label:"Safest",
          note:"Change anything that helps, as far as it helps"}
};
function saferDial(){ return SAFER_STRENGTH[BYO.saferHow]||SAFER_STRENGTH.normal; }

function saferSwap(l,B){
  if(!l||!l.prediction) return null;
  var f=fixtureByLeg(l,B); if(!f) return null;      /* no numbers, no opinion */
  var from=l.prediction;
  var pOld=mProb(f,from);
  if(pOld==null) return null;                       /* nothing to measure from */
  /* DOWN THE LADDER WHILE IT KEEPS HELPING, as far as the dial allows. A rung
     the book will not take is stepped OVER rather than stopping the walk:
     over 3.5 can still reach over 1.5 on a book that does not sell 2.5. The
     furthest usable rung wins, because that is the safest one. */
  var cur=from, opts=[], steps=saferDial().steps||1;
  for(var i=0;i<steps;i++){
    var to=saferPick(f,cur);
    if(!to||to===from) break;
    var pNew=mProb(f,to);
    if(pNew==null) break;
    /* This book must sell it, and a published price is the proof the market
       exists on this game - one leg the book refuses takes the whole slip
       down. Asked through bookVerdict rather than by reading the cache here,
       so the editor cannot drift from the builders: "not-priced" is the only
       refusal, and only ever about a market the sweep fetches. */
    if(bookAllows(to,B)&&bookVerdict(f,to,B)!=="not-priced"&&(pNew-pOld)>=saferDial().gain)
      opts.push({to:to,pNew:pNew});
    cur=to;
  }
  if(!opts.length) return null;
  /* THE FURTHEST RUNG BY DEFAULT, AND THE NEXT ONE ALONG ON A SHUFFLE.
     Every rung in here already passed the same tests - the book sells it, it
     is priced, and it gains more than the dial asks - so any of them is an
     honest answer and the safest is simply the last one. Shuffle walks back up
     the ladder one rung at a time and wraps, which is what gives a reader a
     different edit without loosening a single rule. Legs with one option are
     unmoved by it, which is why the button only appears when some leg has
     two. */
  var n=BYO.saferShuffle||0;
  var best=opts[(opts.length-1-(n%opts.length)+opts.length)%opts.length];
  return {leg:l,f:f,from:from,to:best.to,pOld:pOld,pNew:best.pNew,
          oddOld:+l.odds||null, oddNew:(f[B.odds]||{})[best.to]||null};
}
/* THE LEGS A SWAP CANNOT HELP, which is a different question from the legs
   somebody wants gone. A market with no safer sibling on a game the model
   rates poorly is the weakest thing on the ticket and there is nothing to do
   with it except leave it or drop it - so that is offered as a choice rather
   than decided here. Sixty per cent is the line: above it a leg is doing its
   job, below it and unimprovable it is the one dragging the slip down. */
var SAFER_DROP_UNDER=0.60;   /* the default; saferDial() moves it */
function saferDroppable(legs,B,plan){
  var swapped={}; (plan||[]).forEach(function(p){ swapped[p.leg.eventId+"|"+p.from]=1; });
  return (legs||[]).filter(function(l){
    if(swapped[l.eventId+"|"+l.prediction]) return false;
    var c=legChance(l,B);
    return c.p==null || c.p<saferDial().under;
  });
}
function saferPlan(legs,B){
  if(!saferDial().swap&&!BYO.saferSwapOn) return [];
  var out=[];
  (legs||[]).forEach(function(l){ var sw=saferSwap(l,B); if(sw) out.push(sw); });
  return out;
}
/* What the ticket pays after the swaps, in the bookmaker's own numbers where
   they have published them. A leg we cannot price is counted and said rather
   than folded into a total that looks exact. */
function saferOdds(legs,plan,B){
  var byLeg={}; plan.forEach(function(p){ byLeg[p.leg.eventId+"|"+p.from]=p; });
  var odds=1, known=0, unknown=0;
  (legs||[]).forEach(function(l){
    var sw=byLeg[l.eventId+"|"+l.prediction];
    var o=sw?sw.oddNew:(+l.odds||null);
    if(o&&isFinite(o)&&o>1){ odds*=o; known++; } else unknown++;
  });
  return {odds:odds,known:known,unknown:unknown};
}

function renderByo(){
  var out=$("byoOut"); if(!out) return;
  var legs=BYO.legs||[];
  /* A market we do not map cannot be re-booked, so it cannot be dealt into a
     ticket either. Named rather than quietly dropped: a split that returns
     fewer games than the code held is exactly the failure this panel exists to
     avoid. */
  /* A GAME THAT HAS KICKED OFF COMES OUT OF THE TICKET.
     Neither book will take it, so a slip built with one in it is refused
     whole - and the reader is left reading a bookmaker's rejection instead of
     a sentence from us. Dropped here, once, so the split and the conversion
     both honour it rather than each deciding for itself.
     An unknown kickoff is not a started one: SportyBet's read carries no time
     for a game we do not hold, and refusing on a blank is refusing on nothing.
     Those go through and the bookmaker answers for them. */
  var started=legs.filter(legStarted);
  var usable=legs.filter(function(l){return l.prediction&&!legStarted(l);});
  var stuck=legs.length-usable.length-started.length;
  var B=byoBook();
  var rows=legs.map(function(l){
    /* NOBODY KNOWS WHAT sr:match:72203052 IS. The bookmaker's read gives us
       its own event id and, for a game we do not carry, no team names at all -
       and printing the id was showing the reader our plumbing where a
       sentence belongs. The leg is still listed, because a slip with a game we
       cannot name is a fact they have to see; it is named in words. */
    /* Named from our board where we still hold it, and from the bookmaker's own
       event where we do not - which is most often a game that has kicked off,
       since the board drops a fixture at the whistle. "A game we don't carry"
       is now said only when neither could name it. */
    var name=(l.home||l.away)?(esc(l.home||"?")+" v "+esc(l.away||"?")
      ):("A game we don't carry");
    var gone=legStarted(l);
    return "<div class='byo-l"+((l.prediction&&!gone)?"":" byo-l-stuck")+"'>"+
      "<span class='byo-t'>"+name+"</span>"+
      "<span class='byo-k'>"+(gone?"Already started"
        :(l.prediction?mLabel({home:l.home||"Home",away:l.away||"Away"},l.prediction)
                      :"Market we don't carry"))+"</span>"+
      "<span class='byo-o'>"+(isFinite(+l.odds)&&+l.odds>1?"x"+(+l.odds).toFixed(2)
        :"<i class='byo-np'>no price</i>")+"</span>"+
    "</div>";}).join("");
  /* THE COUNT FIRST, THE REASONS AFTER. What a reader wants in the first
     second is how much of their slip survives, and that was buried in a
     paragraph under the list. Said once, in words, above the games. */
  var away=legs.length-usable.length;
  /* "All 11 available" over a row showing a dash is a contradiction the reader
     has to resolve for us. The dash means the bookmaker published no price for
     that leg, which has nothing to do with whether we can re-book it - so the
     row says that in words now, and the count says what it actually counts. */
  /* THE PRICE COUNT IS GONE FROM THIS LINE, deliberately. It counted legs we
     hold no price for, which is a statement about OUR cache - the sweep asks
     for the 24 markets the model prices and a pass-through market is not among
     them - and it read as a warning about the bookmaker. On a real code it was
     also most of the slip: 21 of 26 usable legs on HCVKA1, every one of them a
     market SportyBet quotes perfectly well. The count now says only what a
     reader acts on, which is how much of their slip can move. */
  out.innerHTML="<div class='byo-res'>"+
    "<div class='byo-head'><b>"+legs.length+" game"+(legs.length===1?"":"s")+
      " read</b><span>from "+B.label+" code "+esc(BYO.code)+"</span></div>"+
    "<button class='byo-clear' type='button' aria-label='Clear this code'>Clear</button>"+
    "<p class='byo-count'>"+
      (away
        ? "<b>"+usable.length+" we can use</b> · "+away+" we cannot"
        : "<b>We can use all "+legs.length+"</b>")+

    "</p>"+
    /* FOLDED, BECAUSE THE JOBS ARE BELOW IT. Eleven rows of games pushed Edit
       for me off the bottom of a phone, and the list is reference material -
       what matters first is how many survived and what can be done with them.
       Open is one tap and the count above it already says the important part. */
    "<details class='byo-legs-fold'><summary>See the "+legs.length+" game"+
      (legs.length===1?"":"s")+"</summary>"+
      "<div class='byo-legs'>"+rows+"</div></details>"+
    /* Said every time, not only when it bites. The reader is the only one who
       knows how many games they put in. */
    /* WHAT THE CODE HELD THIS MORNING, WHEN THE BOOK WILL SAY.
       A leg leaves the coupon the moment its fixture kicks off, so an
       afternoon read is shorter than the slip somebody was handed - four legs
       down to one in four hours on a real BetKing code. Showing the remainder
       with only a hedge underneath reads as "your code had one game in it",
       which is a different and worse claim than "three have started".
       Drawn only when the book actually reports it. BetKing does; the other
       two thin out just as quietly and tell us nothing, and inventing the
       sentence for them would be guessing at somebody's slip. */
    (BYO.booked&&BYO.booked>legs.length
      ? "<p class='byo-note byo-gone'><b>This code was booked with "+
          BYO.booked+" games.</b> "+(BYO.booked-legs.length)+
          " already kicked off, so "+B.label+" no longer "+
          ((BYO.booked-legs.length)===1?"returns it":"returns them")+"."+
          /* Named where they are named. Their list carries a null for a leg
             they will not name even to themselves, which is dropped upstream -
             so the count above can exceed the names below, and the sentence is
             written not to promise otherwise. */
          ((BYO.dropped&&BYO.dropped.length)
            ? " <span class='byo-gone-n'>"+
                BYO.dropped.slice(0,4).map(esc).join(" · ")+
                (BYO.dropped.length>4?" and "+(BYO.dropped.length-4)+" more":"")+
              "</span>"
            : "")+
        "</p>"
      : "")+
    "<p class='byo-note'>This is what "+B.label+" gives back for that code today. "+
      "If a game has already finished, it may no longer be in there."+
      (started.length?" "+started.length+" of these "+(started.length===1?"has":"have")+
        " kicked off already and cannot go on a new ticket, so "+
        (started.length===1?"it is":"they are")+" left out.":"")+
      /* usable, not legs minus stuck: the started ones came out too, and
         quoting a number that still counted them promised a longer ticket
         than the split would actually produce. */
      (stuck?" We cannot re-book "+stuck+" of these, so "+(usable.length?
        "a split would leave "+usable.length+".":"there is nothing to split."):"")+
    "</p>"+
    /* WHAT CAN BE DONE WITH IT IS NOT LISTED HERE ANY MORE. The three jobs sit
       above this box, on screen before a code is even typed - see #byoJobs -
       so a reader learns the page can do three things without having to read a
       slip first and scroll past two of them. */
  "</div>";
  var clr=out.querySelector('.byo-clear');
  if(clr) clr.addEventListener('click',byoReset);
  paintJobs(usable,B);
}

/* WHICH JOBS THIS SLIP CAN ACTUALLY TAKE.
   A dead button with a reason beats a live one that fails: splitting four
   games is a split, splitting two is not, and a slip with nothing we can
   re-book cannot be moved anywhere. */
function paintJobs(usable,B){
  var jobs=$("byoJobs"); if(!jobs) return;
  var conv=$("byoJobConv");
  if(conv) conv.textContent="Convert to "+convTarget(B).label;
  var can={edit:usable.length>=1,convert:usable.length>=1,split:usable.length>=4};
  jobs.querySelectorAll("[data-job]").forEach(function(b){
    var k=b.dataset.job;
    b.disabled=!can[k];
    b.classList.toggle("on",BYO.job===k&&!!can[k]);
    b.title=can[k]?"":(k==="split"?"A split needs at least four games we can re-book"
                                  :"Nothing on this code we can re-book");
    if(!b._w){
      b._w=1;
      b.addEventListener("click",function(){
        if(b.disabled) return;
        BYO.job=(BYO.job===b.dataset.job)?null:b.dataset.job;
        paintJobs(usable,B);
        renderStage(usable,B);
      });
    }
  });
}

/* One job on screen at a time, in the same place every time.
 *
 * WORKING, THEN THE ANSWER. Reading a slip of forty legs against a board of
 * five hundred fixtures is thousands of comparisons, and on a cheap phone that
 * is a visible pause with nothing on screen to explain it. The stage says what
 * it is doing first and computes on the next frame, so the page never looks
 * like it swallowed the tap. It also means the work happens once per press
 * rather than on every keystroke, which is the only scaling this needs: every
 * one of these jobs is arithmetic in the reader's own browser, and the server
 * sees nothing until a booking button is pressed.
 *
 * AND A WAY BACK. Every job can be left - the button that opened it closes it,
 * and each stage carries its own Cancel - so nobody is stuck looking at an
 * offer they did not want. Nothing is booked by opening one. */
function renderStage(usable,B){
  var st=$("byoStage"); if(!st) return;
  if(!BYO.job||!usable.length){ st.innerHTML=""; return; }
  st.innerHTML="<div class='byo-working'><span class='mini-load'></span>"+
    "Checking "+usable.length+" game"+(usable.length===1?"":"s")+"…</div>";
  var job=BYO.job;
  /* Two frames: one to paint the message, one to do the work. */
  requestAnimationFrame(function(){ setTimeout(function(){
    if(BYO.job!==job) return;            /* they moved on while we were busy */
    if(job==="split"){
      st.innerHTML="<div class='code-split' id='byoSplit'>"+splitBoxInner(usable,byoOdds)+"</div>";
      wireSplit(st,usable,B,{sel:"#byoSplit",selOf:byoSel,oddsOf:byoOdds});
    }else if(job==="convert"){
      st.innerHTML="<div id='byoConv'></div>"; renderConvert();
    }else{
      st.innerHTML="<div class='byo-safer' id='byoSafer'>"+saferBoxInner(usable,B)+"</div>";
      wireSafer(st,usable,B);
    }
    var foot=document.createElement("div");
    foot.className="byo-stage-foot";
    foot.innerHTML="<button class='byo-cancel' type='button'>Cancel</button>"+
      "<button class='byo-reset' type='button'>Start over</button>";
    st.appendChild(foot);
    foot.querySelector(".byo-cancel").addEventListener("click",function(){
      BYO.job=null; paintJobs(usable,B); renderStage(usable,B);
      try{ $("byo").scrollIntoView({behavior:"smooth",block:"start"}); }catch(e){}
    });
    foot.querySelector(".byo-reset").addEventListener("click",byoReset);
  },0); });
}

/* BACK TO AN EMPTY BOX. Not a page reload: the board behind this took seconds
   to arrive and throwing it away to clear a text field would be rude on a
   connection that paid for it. */
function byoReset(){
  BYO.legs=null; BYO.booked=null; BYO.dropped=null; BYO.code=""; BYO.job=null;
  BYO.saferDrop=true; BYO.saferSwapOn=true; BYO.saferHow="normal"; BYO.saferShuffle=0; BYO.reline=false;
  var inp=$("byoCode"); if(inp) inp.value="";
  var out=$("byoOut"); if(out) out.innerHTML="";
  var st=$("byoStage"); if(st) st.innerHTML="";
  var jobs=$("byoJobs");
  if(jobs) jobs.querySelectorAll("[data-job]").forEach(function(b){
    b.disabled=true; b.classList.remove("on"); });
  try{ $("byo").scrollIntoView({behavior:"smooth",block:"start"}); }catch(e){}
  if(inp) try{ inp.focus(); }catch(e){}
}

/* ---- converting a code from one book to the other ---- */
/* WHY THIS NEEDS NO NEW TABLE AND NO NEW MATCHER.
   The obvious build is a crosswalk of SportyBet selection ids against Bet9ja
   odds keys, derived by sampling both catalogues. It is not needed for the
   markets we model, because the board already holds the answer: attachEventIds
   binds every fixture to BOTH books at boot, so a fixture carries SportyBet's
   event id and Bet9ja's side by side, and MARKET_MAP already speaks both
   sides of the 24 markets we price. So a conversion is three lookups - their
   event id to our fixture, our fixture to the other book's event id, their
   market to ours - and the slip that comes out is an ordinary slip of ours
   that the existing booking path can take.
   The matcher is the shipped one for the same reason mkcode.js lifts it
   rather than reimplementing: a second copy would book against a pairing we
   do not ship, and that failure looks like a code for the wrong fixture. */
function fixtureByBookId(id,B){
  if(id==null) return null;
  /* Bare DATA, not window.DATA: it is declared with `let`, which makes a
     global binding and NOT a property of window - so the guarded form was
     always undefined and this returned "not a game on our board" for every
     leg, including ones sitting on the board. */
  var key=String(id), list=(typeof DATA!=="undefined"&&DATA.fixtures)||[];
  for(var i=0;i<list.length;i++){
    var f=list[i];
    if(f[B.id]!=null&&String(f[B.id])===key) return f;
  }
  return null;
}
/* WITH THREE BOOKS THERE IS NO "THE OTHER ONE".
   This was BOOKS[B.key==="sporty"?"bet9ja":"sporty"], which answered the only
   question two books can ask. A third makes the target a choice, so the
   conversion carries one: BYO.to names it and these two functions are the only
   things that resolve it. Order is the table's order, so the default target is
   stable rather than whichever key the object happened to yield first. */
function otherBooks(B){
  return Object.keys(BOOKS).filter(function(k){ return k!==B.key; })
    .map(function(k){ return BOOKS[k]; });
}
/* The book a conversion is heading FOR. Falls back to the first other book
   rather than to a fixed name, so removing a book from the table cannot leave
   this pointing at one that is gone. A stored choice that equals the source -
   which happens the moment somebody switches the source to the book they were
   converting to - is ignored rather than allowed to convert a slip to itself. */
function convTarget(from){
  from=from||byoBook();
  var alt=otherBooks(from);
  var pick=BYO.to&&BOOKS[BYO.to];
  return (pick&&pick.key!==from.key)?pick:alt[0];
}
/* The target, as the same pills the source uses - the reader has already
   learned what those mean six inches higher up, and a second control with its
   own look would read as a different kind of choice. */
function convTargetPicker(from){
  from=from||byoBook();
  var to=convTarget(from);
  return "<div class='byo-to'><span class='byo-to-l'>Convert to</span>"+
    "<div class='byo-book' role='group' aria-label='Which bookmaker to convert to'>"+
    otherBooks(from).map(function(B){
      return "<button class='byo-b"+(B.key===to.key?" on":"")+"' type='button'"+
        " data-conv-to='"+B.key+"' aria-pressed='"+(B.key===to.key)+"'"+
        " aria-label='"+esc(B.label)+"'>"+B.mark+"</button>";
    }).join("")+"</div></div>";
}

/* THE OTHER BOOK'S OWN EVENT, FOUND WITHOUT US IN THE MIDDLE.
 *
 * For a game on our board the route is their id -> our fixture -> the other
 * book's id, and that is the better route: it goes through a pairing we ship
 * and test. This is for the legs that route cannot carry - a game we hold no
 * results for and therefore never had a fixture for. It matches the leg's own
 * teams and kickoff against the target book's feed with the SAME rules
 * attachEventIds uses, one hop instead of two.
 * The fence matters more here than anywhere, because there is no league to
 * disagree about: two clubs called Inter, one in Milan and one in Turku, are
 * separated by kickoff alone. */
function feedMatch(l,to){
  var list=FEED[to.key]||[];
  if(!l||!l.home||!l.away||!list.length) return null;
  var ev={homeTeam:l.home,awayTeam:l.away,startTime:l.kickoff};
  var lh=normTeam(l.home),la=normTeam(l.away);
  var best=null,bestScore=0;
  for(var i=0;i<list.length;i++){
    var m=list[i];
    if(!m||!m.eventId) continue;
    /* sameSlot wants a fixture-shaped first argument: kickoff as a string. */
    if(!sameSlot({kickoff:new Date(l.kickoff).toISOString()},m)) continue;
    if(normTeam(m.homeTeam)===lh&&normTeam(m.awayTeam)===la) return m;
    var sh=simTeams(l.home,m.homeTeam), sa=simTeams(l.away,m.awayTeam);
    if(sh>=0.6&&sa>=0.6&&(sh+sa)>bestScore){ bestScore=sh+sa; best=m; }
  }
  return bestScore>=1.2?best:null;
}

/* WHEN THE ID MISSES BUT THE GAME IS RIGHT THERE.
 *
 * Reported on code QER25G: "some of the games are not on our board", and one
 * of the four it named was Gaziantep v Fenerbahce - which the board carries,
 * with a SportyBet id on it. The ids simply differed. The slip said
 * sr:match:72723196 and our fixture said sr:match:73436482, and both answer on
 * SportyBet's own event endpoint with the same two teams and the same kickoff:
 * they list some fixtures twice, and our matcher bound to one copy while the
 * punter's slip was built from the other.
 *
 * So the id is the fast path, not the only one. A leg that misses is matched
 * on what the bookmaker's read already gives us - both team names and the
 * kickoff - using the SAME rules attachEventIds uses, because a second matcher
 * would pair games this one would not and the failure looks like a slip for
 * the wrong fixture. Exact on both sides wins outright; otherwise both sides
 * must clear 0.6 and the pair 1.2, and the kickoff fence applies either way.
 */
function fixtureByLeg(l,B){
  var direct=l?fixtureByBookId(l.eventId,B):null;
  if(direct) return direct;
  if(!l||!l.home||!l.away) return null;
  var list=(typeof DATA!=="undefined"&&DATA.fixtures)||[];
  /* The shape sameSlot and simTeams expect of a feed event. */
  var ev={homeTeam:l.home,awayTeam:l.away,startTime:l.kickoff};
  var lh=normTeam(l.home),la=normTeam(l.away);
  var best=null,bestScore=0;
  for(var i=0;i<list.length;i++){
    var f=list[i];
    if(!sameSlot(f,ev)) continue;
    if(normTeam(f.home)===lh&&normTeam(f.away)===la) return f;
    var sh=simTeams(f.home,l.home), sa=simTeams(f.away,l.away);
    if(sh>=0.6&&sa>=0.6&&(sh+sa)>bestScore){ bestScore=sh+sa; best=f; }
  }
  return bestScore>=1.2?best:null;
}

/* Everything the panel needs to say, worked out before anything is drawn:
   what carries over, what does not, and why not - one reason per leg. */
/* THE LINES ONE BOOK PRICES AND THE OTHER DOES NOT.
   SportyBet sells Over 2 and Over 3; Bet9ja's card stops at the .5 lines. A
   whole line and the .5 below it are NOT the same bet - Over 2 returns the
   stake on exactly two goals where Over 1.5 has already won - so moving one to
   the other changes what was staked on.
   Asked for deliberately, and done openly: the leg converts to the nearest
   line the other book actually sells, and every screen that shows it says it
   was changed. It is never applied to a leg that could have moved untouched. */
/* A WHOLE LINE THAT HAS TO BECOME A HALF LINE, AND WHICH WAY IT MOVES.
   Over 3.0 pays on four, pushes on exactly three; Over 2.5 pays on three. So
   the half-line neighbour is not "the next one along", it is the one that is
   NEVER WORSE for the punter - down for an over, UP for an under. Getting that
   backwards turns a stake-back into a loss on the one scoreline the whole
   substitution is about, and it would look identical on the slip.
   The price moves with it. This is a real change to somebody's bet, which is
   why every leg it touches is counted and named on screen rather than done
   quietly. */
var NEAREST_LINE={"OVER_2":"OVER_1.5","OVER_3":"OVER_2.5",
                  "UNDER_2":"UNDER_2.5","UNDER_3":"UNDER_3.5"};
/* The same rule on a handicap, where it is arithmetic rather than a table -
   there are 64 Asian codes and listing them would be 64 chances to fumble a
   sign. A whole-ball line pushes when the margin lands exactly on it, so the
   generous neighbour is always half a goal FURTHER IN THE PUNTER'S FAVOUR:
   -1 becomes -0.5 (a one-goal win stops being a push and becomes a win), +1
   becomes +1.5. In our own notation, where AH_2_-1 means the AWAY side giving
   one, that is the same +0.5 either side - so one line of arithmetic covers
   both.
   Quarter balls are left alone. They do not push, so they have nothing to fix,
   and their neighbour is a quarter of a goal away rather than a half. */
function ahReline(code){
  var m=/^(AH_[12])_(-?\d+)$/.exec(code||"");
  if(!m) return null;
  return m[1]+"_"+(Number(m[2])+0.5);
}
/* Both, in the order a caller wants them: the table first because it is exact,
   the arithmetic second. */
function nearestLine(code){ return NEAREST_LINE[code]||ahReline(code); }

/* THE SECOND TIER, AND WHY IT IS A SWITCH RATHER THAN A DEFAULT.
   1X2-or-Over/Under is the family these codes lean on hardest - 45 legs of
   180. SportyBet sells it only at 2.5, Bet9ja only at 1.5 and 3.5, and nothing
   overlaps, so the leg cannot travel without its line changing. Unlike Over 2
   to Over 1.5, which differ only on the exact score, this moves a whole goal.
   That is a different bet by any reading, so it is offered rather than done.
   ONE DIRECTION ONLY. Bet9ja's 1.5 and 3.5 each have exactly one place to go,
   so the move is unambiguous. Going the other way 2.5 sits between their two
   lines with no honest nearest, and picking one would be inventing a
   preference on somebody else's money - so that direction is refused and says
   which lines they do sell. */
function mixReline(code){
  var m=/^(MIX_[12X]_(?:OV|UN))_(?:1\.5|3\.5)$/.exec(code||"");
  return m?(m[1]+"_2.5"):null;
}

function byoConversion(){
  var from=byoBook(), to=convTarget(from);
  var picks=[], stuck=[], changed=[], offer=[];
  (BYO.legs||[]).forEach(function(l){
    var f=l.prediction?fixtureByLeg(l,from):null;
    var id=f?f[to.id]:null;
    /* A GAME WE DO NOT CARRY CAN STILL CROSS. If the board cannot pair it, the
       other book's own feed is asked directly - see feedMatch. The pick then
       carries that id rather than a fixture, which bookIdOf already prefers
       when a fixture has nothing to say. */
    var direct=(!l.prediction||legStarted(l))?null:((!f||id==null)?feedMatch(l,to):null);
    if(direct) id=direct.eventId;
    if(legStarted(l)) stuck.push({leg:l,why:"this game has already started"});
    else if(!l.prediction) stuck.push({leg:l,why:"a market we don't carry"});
    else if(id==null&&!f) stuck.push({leg:l,why:to.label+" doesn't list this game"});
    else if(id==null) stuck.push({leg:l,why:to.label+" doesn't list this game"});
    else {
      /* Only when the line itself cannot travel. A market the other book
         sells is never substituted. */
      var code=l.prediction, near=nearestLine(code), mix=mixReline(code);
      /* Read off the table, not off the name. This was `to.key==="bet9ja"`,
         which is true of exactly the book it was written for - BetKing does
         not sell a whole line either and got none of this, so nine legs of a
         real 39-leg ticket stuck for want of a rule that already existed. */
      if(near && !to.wholeLines){
        changed.push({leg:l, from:code, to:near});
        code=near;
      } else if(mix && to.key==="sporty"){
        /* Offered, never assumed - see mixReline. */
        if(!BYO.reline){ offer.push({leg:l, from:code, to:mix}); return; }
        changed.push({leg:l, from:code, to:mix});
        code=mix;
      }
      /* NO BRANCH FOR 1X2-or-Over/Under GOING TO BET9JA, and that is the fix
         rather than an omission. This dropped every such leg with "Bet9ja
         sells this at 1.5 and 3.5, not 2.5", which was true of the market it
         was looking at and false of the book: their 2.5 lives under a
         different key entirely, S_CHANCEMIXGGOU, and bet9ja.py has mapped it
         since a punter's real code turned it up. Both tables carry MIX_*_2.5,
         so the leg crosses untouched like any other shared market. */
      /* mProb, not f[code]: the payload keys probabilities as o15/o25/btts,
         so indexing it with a market code gave undefined, and undefined
         reached oddOf and came back NaN - which is what put "about xNaN"
         on the panel. A pass-through market has no probability at all, and
         mProb answers null for those rather than guessing. */
      /* WITH NO FIXTURE THERE IS NO PROBABILITY AND NO id() - only the other
         book's event. mProb answers null for it, which convOdds already reads
         as "we cannot price this leg", and the booking reads the id off the
         pick the way it does for a slip restored from storage. */
      var pick=f?{id:fid(f),code:code,f:f,p:mProb(f,code)}
               :{id:null,code:code,f:null,p:null,home:l.home,away:l.away};
      pick[to.id]=id;
      picks.push(pick);
    }
  });
  return {from:from,to:to,picks:picks,stuck:stuck,changed:changed,offer:offer};
}
/* Their price where the other book has published one, ours only as a last
   resort - a converted slip is worth what the book taking it pays. */
/* WHAT A CONVERTED SLIP IS WORTH, AND WHEN TO ADMIT WE DO NOT KNOW.
   Three sources, in order. The book that will take it, if it has published a
   price - that is the real answer. Our own estimate, but ONLY for a market we
   model, because that is the only kind we have an opinion about. Nothing
   otherwise.
   Counting "nothing" as 1 was wrong and it showed: a single Le Mans +0.5 at
   1.55 was projected on the live site as x10.93, because mProb has no answer
   for a handicap and the estimate fell through to noise. A wrong number beside
   a booking button is worse than no number, so the unknown legs are counted
   and said rather than folded into a total that looks precise. */
function convOdds(picks){
  var to=convTarget();
  var odds=1, known=0, unknown=0;
  picks.forEach(function(c){
    var o=(c.f&&c.f[to.odds]||{})[c.code];
    if(!(o&&o>1.01)){
      /* Our estimate is only defensible where we have a probability. */
      var p=mProb(c.f,c.code);
      o=(p!=null&&isFinite(p))?legOdd(c.f,c.code,p):null;
    }
    if(o&&isFinite(o)&&o>1){ odds*=o; known++; }
    else unknown++;
  });
  return {odds:odds, known:known, unknown:unknown};
}

function renderConvert(){
  var host=$("byoConv"); if(!host) return;
  var c=byoConversion();
  if(!c.picks.length){
    host.innerHTML="<div class='code-err'><b>Nothing here can move to "+c.to.label+".</b>"+
      "<span>"+esc(c.stuck.length?c.stuck[0].why:"no legs")+"</span></div>";
    return;
  }
  var od=convOdds(c.picks);
  /* Silent when nothing can be priced, qualified when only some of it can.
     "about x8.20" on two of five legs is a number somebody will read as the
     whole slip. */
  var oddsTxt = od.known===0 ? "no prices published yet"
    : ("about x"+od.odds.toFixed(od.odds>=100?0:2)+
       (od.unknown?" on "+od.known+" of "+c.picks.length+" legs":""));
  host.innerHTML="<div class='byo-conv'>"+
    /* WHICH BOOK IT IS HEADING FOR, since there is more than one answer now.
       Drawn above the count because the count is ABOUT the target - "3 of 5
       games move to Bet9ja" says nothing until you know why Bet9ja. */
    convTargetPicker(c.from)+
    "<div class='byo-head'><b>"+c.picks.length+" of "+(BYO.legs||[]).length+
      " games move to "+esc(c.to.label)+"</b><span>"+oddsTxt+"</span></div>"+
    /* Drawn whenever the slip HAS legs this governs, ticked or not. Keyed on
       c.offer alone it vanished the moment it was ticked - the legs moved into
       c.changed, the offer emptied, and there was no way to untick it. */
    (function(){
      var relinable=c.offer.concat(c.changed.filter(function(x){return mixReline(x.from);}));
      if(!relinable.length) return "";
      return "<div class='byo-offer'><label class='byo-sw'>"+
        "<input type='checkbox' id='byoReline'"+(BYO.reline?" checked":"")+">"+
        "<span>Also move "+relinable.length+" leg"+(relinable.length===1?"":"s")+
        " by changing the line</span></label>"+
        "<p class='byo-note'>"+esc(c.to.label)+" sells "+
        esc(mLabel({home:"Home",away:"Away"},relinable[0].from))+" only at 2.5. "+
        "Moving it changes the bet by a whole goal - not the same thing as the "+
        "half-line above.</p></div>";
    })()+
    (c.changed.length
      ? "<p class='byo-note byo-changed'><b>"+c.changed.length+
        (c.changed.length===1?" leg was":" legs were")+" changed to a line "+
        esc(c.to.label)+" sells:</b> "+c.changed.slice(0,3).map(function(x){
          return esc(mLabel({home:x.leg.home||"Home",away:x.leg.away||"Away"},x.from))+
            " → "+esc(mLabel({home:x.leg.home||"Home",away:x.leg.away||"Away"},x.to));
        }).join("; ")+(c.changed.length>3?"; and "+(c.changed.length-3)+" more":"")+
        ". Not the same bet: a whole line returns the stake on the exact score, "+
        "the half line does not.</p>"
      : "")+
    (c.stuck.length
      ? "<p class='byo-note'>Left behind: "+c.stuck.slice(0,4).map(function(x){
          return esc((x.leg.home||"a game")+" v "+(x.leg.away||"")+" - "+x.why);}).join("; ")+
        (c.stuck.length>4?"; and "+(c.stuck.length-4)+" more":"")+
        ". A converted slip is not the same bet as the one you pasted.</p>"
      : "")+
    "<div class='byo-acts'>"+
      "<button class='byo-go' id='byoConvGo' type='button'>Get the "+esc(c.to.label)+" code</button>"+
      "<button class='byo-cancel' id='byoConvX' type='button'>Cancel</button>"+
    "</div>"+
    "<div id='byoConvOut'></div>"+
  "</div>";
  $("byoConvX").addEventListener("click",function(){ host.innerHTML=""; });
  /* Switching the target rebuilds the whole panel, because every number in it
     is about that book: which legs cross, what they are priced at, which lines
     had to change. Repainting only the pills would leave the count and the
     odds describing the book they used to point at. */
  host.querySelectorAll("[data-conv-to]").forEach(function(b){
    b.addEventListener("click",function(){
      if(BYO.to===b.dataset.convTo) return;
      BYO.to=b.dataset.convTo;
      renderConvert();
      paintJobs((BYO.legs||[]).filter(function(l){return l.prediction;}),byoBook());
    });
  });
  var sw=$("byoReline");
  if(sw) sw.addEventListener("change",function(){ BYO.reline=sw.checked; renderConvert(); });
  $("byoConvGo").addEventListener("click",function(){
    var b=$("byoConvGo"); b.disabled=true; b.textContent="Booking…";
    /* The ordinary booking path, on ordinary picks. Nothing about a converted
       slip is special once it is expressed in our own shape. */
    bookFetch(c.picks.map(function(x){return c.to.sel(x);}),c.to)
      .then(function(d){
        var code=d&&d.success&&c.to.codeOf(d);
        if(code){ showCode(code,"byoConvOut",null,c.to,c.picks); }
        else { $("byoConvOut").innerHTML=bookErrHTML(d,c.to);
               b.disabled=false; b.textContent="Get the "+c.to.label+" code"; }
      })
      .catch(function(){
        $("byoConvOut").innerHTML="<div class='code-err'><b>Couldn't reach the "+
          "booking service.</b><span>Check your connection and try again.</span></div>";
        b.disabled=false; b.textContent="Get the "+c.to.label+" code";
      });
  });
}

/* THE SWAPS ON OFFER, EVERY ONE OF THEM PRICED BOTH WAYS.
   Nothing here books anything: this is the sentence a reader needs before they
   agree to have their bet changed, which is why both probabilities and both
   payouts are on screen before the button exists. */
/* A MARKET WE CANNOT PRICE, WHICH IS MOST OF SOME TICKETS.
   1UP and 2UP pay early the moment a side goes a goal ahead. That is a path
   through the match, not a final score, and the model prices final scores - so
   mProb answers null and every rule in this editor is blind to them.
   Reported on a real 45-leg SportyBet code, 8B9WJU: 42 of its legs were
   UP1_*, UP2_* or DC1UP_*, and "Edit for me" could do nothing with any of
   them. It is not going to pretend otherwise - stripping the promotion is
   NOT a softer bet, it is the same bet with the early payout taken away, and
   DC1UP_1X would become a strictly worse 1X. So the honest move is to say
   which legs cannot be judged and why, and leave the ticket alone. */
function promoLegs(legs){
  return (legs||[]).filter(function(l){
    return /^(UP[12]_|DC1UP_)/.test(String(l&&l.prediction||""));
  });
}
function saferBoxInner(legs,B){
  var plan=saferPlan(legs,B);
  var promo=promoLegs(legs);
  /* Only when it is the whole story. A couple of promotion legs among twenty
     ordinary ones is a footnote; forty-two of forty-five is the answer. */
  if(!plan.length&&promo.length&&promo.length>=Math.ceil(legs.length*0.6)){
    return "<p class='byo-note'><b>"+promo.length+" of these "+legs.length+
      " legs are 1UP or 2UP.</b> Those pay early the moment a side goes a goal "+
      "up, which is not something our model can price - it works on final "+
      "scores. Taking the promotion off would not make them safer either: it "+
      "is the same bet without the early payout.</p>"+
      "<p class='byo-note'>So there is nothing here we can honestly improve. "+
      "<b>Convert</b> and <b>Split it</b> both still work on this code.</p>";
  }
  var dial0=saferDial();
  var dropOn=dial0.drop||BYO.saferDrop;
  var drop=dropOn?saferDroppable(legs,B,plan):[];
  var could=saferDroppable(legs,B,plan);
  var dropKey={}; drop.forEach(function(l){ dropKey[l.eventId+"|"+l.prediction]=1; });
  var kept=legs.filter(function(l){ return !dropKey[l.eventId+"|"+l.prediction]; });
  var before=byoOdds(legs), after=saferOdds(kept,plan,B);

  /* THE CONTROLS FIRST, THEN WHAT THEY DID. A reader who changes a switch
     wants to see the answer change, so the switches sit above the answer and
     the numbers redraw under them. */
  var dial=saferDial();
  var chips=Object.keys(SAFER_STRENGTH).map(function(k){
    var d=SAFER_STRENGTH[k];
    return "<button class='sf-chip"+(BYO.saferHow===k?" on":"")+"' type='button' data-how='"+
      k+"'>"+d.label+"</button>";
  }).join("");

  /* A LONG SLIP IS A LIST, NOT A WALL. Twelve changes on a forty-leg ticket
     printed twelve rows and pushed the price and the button off the screen, so
     the first six are shown and the rest are counted. The count is the part
     that matters; the rows are there to prove it is not doing anything
     strange. */
  var SHOW=6;
  var rows=plan.slice(0,SHOW).map(function(p){
    var f={home:p.leg.home||"Home",away:p.leg.away||"Away"};
    return "<div class='sf-row'><span class='sf-g'>"+
      esc((p.leg.home||"?")+" v "+(p.leg.away||"?"))+"</span>"+
      "<span class='sf-m'>"+mLabel(f,p.from)+" <i>"+P0(p.pOld)+"%</i>"+
      " → <b>"+mLabel(f,p.to)+"</b> <i>"+P0(p.pNew)+"%</i></span></div>";
  }).join("")+
  (plan.length>SHOW?"<p class='byo-note sf-more'>and "+(plan.length-SHOW)+
    " more like these</p>":"");

  /* A SHUFFLE THAT CHANGES NOTHING IS A LIE, so the button only exists when a
     leg actually has a second rung to offer. Counted by asking the ladder for
     this leg at the next shuffle and seeing whether any answer moves. */
  var alt=0;
  (function(){
    var was=BYO.saferShuffle||0;
    try{
      BYO.saferShuffle=was+1;
      var other=saferPlan(legs,B);
      var by={}; plan.forEach(function(p){ by[p.leg.eventId+"|"+p.from]=p.to; });
      other.forEach(function(p){
        if(by[p.leg.eventId+"|"+p.from]&&by[p.leg.eventId+"|"+p.from]!==p.to) alt++;
      });
    }finally{ BYO.saferShuffle=was; }
  })();
  var nothing = !plan.length && !drop.length;
  return "<p class='sp-q'>Edit for me</p>"+
    "<div class='sf-opts'>"+
      /* On Auto the two switches are what Auto means, so they are shown
         ticked and locked rather than hidden - the reader can see exactly what
         it decided, and one tap on another word gives them back. */
      "<label class='byo-sw"+(dial0.swap?" is-auto":"")+"'><input type='checkbox' id='sfSwap'"+
        ((dial0.swap||BYO.saferSwapOn)?" checked":"")+(dial0.swap?" disabled":"")+
        "><span>Make hard legs easier</span></label>"+
      "<label class='byo-sw"+(dial0.drop?" is-auto":"")+"'><input type='checkbox' id='sfDrop'"+
        (dropOn?" checked":"")+(dial0.drop?" disabled":"")+
        "><span>Take out legs we cannot fix"+
        (could.length?" ("+could.length+")":"")+"</span></label>"+
      "<div class='sf-how'><span class='sf-how-l'>How much?</span>"+chips+
        "<i class='sf-how-n'>"+esc(dial.note)+"</i></div>"+
      /* Offered beside the strength rather than inside it: the strength says
         how far we may go, this says show me another way of going there. */
      (alt?"<button class='sf-chip sf-shuffle' id='sfShuffle' type='button'>"+
        "Shuffle <i>"+alt+" leg"+(alt===1?"":"s")+" could go another way</i></button>":"")+
    "</div>"+
    (nothing
      ? "<p class='byo-note'>Nothing to change at this setting. Try <b>Strong</b>, "+
        "or keep the slip as it is - it may already be fine.</p>"
      : (plan.length
          ? "<p class='byo-note'>"+plan.length+" leg"+(plan.length===1?"":"s")+
            " move to an easier bet on the same game. The rest stay as they are.</p>"+
            "<div class='sf-rows'>"+rows+"</div>"
          : "")+
        (drop.length
          ? "<p class='byo-note sf-cut'>Taking out "+drop.length+": "+
            drop.slice(0,3).map(function(l){
              return esc((l.home||"a game")+" v "+(l.away||""));}).join("; ")+
            (drop.length>3?"; and "+(drop.length-3)+" more":"")+"</p>"
          : "")+
        "<p class='byo-note sf-odds'>about x"+before.toFixed(2)+" → <b>x"+
          after.odds.toFixed(2)+"</b>"+
          (after.unknown?" on "+after.known+" of "+kept.length+" games":"")+
          ". Safer legs pay less. That is the swap.</p>"+
        "<div class='byo-acts'><button class='byo-go' id='byoSaferGo' type='button'>"+
          "Do it and give me a code</button></div><div id='byoSaferOut'></div>");
}
/* One ticket, booked only when the button is pressed, and only ever at the
   book the code came from - a swap is not a conversion. */
function wireSafer(wrap,legs,B){
  var box=wrap.querySelector("#byoSafer"); if(!box) return;
  function redraw(){
    box.innerHTML=saferBoxInner(legs,B);
    wireSafer(wrap,legs,B);              /* the box was redrawn, so rewire it */
  }
  var dr=box.querySelector("#sfDrop");
  if(dr) dr.addEventListener("change",function(){ BYO.saferDrop=dr.checked; redraw(); });
  var sp=box.querySelector("#sfSwap");
  if(sp) sp.addEventListener("change",function(){ BYO.saferSwapOn=sp.checked; redraw(); });
  box.querySelectorAll("[data-how]").forEach(function(c){
    /* A different strength is a different ladder, so the shuffle starts over
       rather than carrying an offset into a set of rungs it was never counted
       against. */
    c.addEventListener("click",function(){ BYO.saferHow=c.dataset.how; BYO.saferShuffle=0; redraw(); });
  });
  var sh=box.querySelector("#sfShuffle");
  if(sh) sh.addEventListener("click",function(){
    BYO.saferShuffle=(BYO.saferShuffle||0)+1; redraw(); });
  var go=box.querySelector("#byoSaferGo"); if(!go) return;
  go.addEventListener("click",function(){
    var plan=saferPlan(legs,B);
    var byLeg={}; plan.forEach(function(p){ byLeg[p.leg.eventId+"|"+p.from]=p.to; });
    var gone={};
    if(saferDial().drop||BYO.saferDrop) saferDroppable(legs,B,plan).forEach(function(l){
      gone[l.eventId+"|"+l.prediction]=1; });
    /* The slip's own event ids, with a market changed on some of them - and
       whatever the reader chose to leave out left out. */
    var sels=legs.filter(function(l){ return !gone[l.eventId+"|"+l.prediction]; })
      .map(function(l){
      var code=byLeg[l.eventId+"|"+l.prediction]||l.prediction;
      var o={eventId:l.eventId}; o[B.arg||"prediction"]=code; return o;
    });
    go.disabled=true; go.textContent="Booking…";
    /* THE PANEL CAN LEAVE WHILE THE REQUEST IS STILL IN THE AIR.
       #byoSaferOut is drawn inside the safer panel, and refreshByoPanels
       redraws that panel whenever ids land - loadSporty retries for seconds
       after boot. Its `busy` guard checks whether these boxes have CONTENT,
       and between the tap and the reply this one is empty, so the guard waves
       the redraw through and the node the reply is addressed to is gone.
       Reported from Sentry on a Twitter in-app browser on an iPhone, where a
       slow network holds that window open long enough to hit every time:
       "TypeError: null is not an object (evaluating $("byoSaferOut").innerHTML=)".
       Two halves: the panel is marked busy for the whole flight, and every
       write checks the box is still there. The flag alone would not do - the
       reader can switch view or read another code - and the guard alone would
       lose the answer silently. */
    BYO._booking=true;
    var done=function(){ BYO._booking=false;
      go.disabled=false; go.textContent="Apply and get a code"; };
    bookFetch(sels,B).then(function(d){
      var out=$("byoSaferOut");
      var code=d&&d.success&&B.codeOf(d);
      if(code){
        BYO._booking=false;
        if(!out) return;            /* the code is minted; nowhere left to draw it */
        out.innerHTML="";
        showCode(code,"byoSaferOut",null,B,plan.map(function(p){
          return {id:p.f?fid(p.f):null,code:p.to,f:p.f,p:p.pNew};
        }));
      }else{
        if(out) out.innerHTML=bookErrHTML(d,B);
        done();
      }
    }).catch(function(){
      var out=$("byoSaferOut");
      if(out) out.innerHTML="<div class='code-err'><b>Couldn't reach the "+
        "booking service.</b><span>Check your connection and try again.</span></div>";
      done();
    });
  });
}

/* WHAT A TRIM WOULD COST AND WHAT IT WOULD LEAVE.
   Priced with the bookmaker's own odds, like everything else on a borrowed
   slip: this ticket will be booked at their prices, not ours. */
/* HOW MANY LEGS A TRIM SHOULD OFFER TO CUT.
 *
 * It offered one, two or three, which is right for the six-leg slip it was
 * written against and meaningless for a forty-leg one: dropping three of forty
 * changes nothing anybody can feel. The choices are a share of the slip now -
 * roughly a tenth, a quarter and a third - so a big ticket gets big options
 * and a small one still gets "drop one".
 * Never below one, never enough to leave fewer than two legs, and duplicates
 * collapse: on a five-leg slip a tenth and a quarter are both one.
 */
function trimWays(n){
  if(n<3) return [];
  var out=[];
  [0.1,0.25,0.34].forEach(function(share){
    var k=Math.max(1,Math.round(n*share));
    if(k>n-2) k=n-2;                       /* two legs is the floor of a slip */
    if(k>=1&&out.indexOf(k)<0) out.push(k);
  });
  return out;
}
function trimBoxInner(legs,B){
  var ways0=trimWays(legs.length);
  if(!ways0.length) return "";
  var ways=[];
  ways0.forEach(function(n){
    var plan=trimPlan(legs,B,n);
    ways.push("<button class='sp-way' type='button' data-drop='"+n+"'>"+
      "<b>Drop "+n+"</b><span>"+plan.keep.length+" left, about x"+
      byoOdds(plan.keep.map(function(k){return k.leg;})).toFixed(2)+"</span></button>");
  });
  var worst=trimPlan(legs,B,1).cut[0];
  return "<p class='sp-q'>Run it past our model?</p>"+
    "<p class='byo-note byo-trim-n'>The likeliest legs stay exactly as they are - "+
    "same games, same markets, nothing swapped. "+
    (worst? "First to go: "+esc((worst.leg.home||"a game")+" v "+(worst.leg.away||""))+
      (worst.src==="model"?" ("+P0(worst.p)+"% on our model)"
        :(worst.src==="book"?" (the longest price on the slip)":" (nothing to judge it on)"))+"."
      :"")+"</p>"+
    "<div class='sp-ways'>"+ways.join("")+"</div>";
}
/* One ticket out the other side, booked exactly the way a split books one of
   its parts - same path, same quota, same refusal handling. */
function wireTrim(wrap,legs,B){
  var box=wrap.querySelector("#byoTrim"); if(!box) return;
  box.querySelectorAll("[data-drop]").forEach(function(b){
    b.addEventListener("click",function(){
      var plan=trimPlan(legs,B,+b.dataset.drop);
      var kept=plan.keep.map(function(k){return k.leg;});
      box.innerHTML="<p class='sp-q'>Dropped "+plan.cut.length+", keeping "+kept.length+"</p>"+
        "<p class='byo-note'>Out: "+plan.cut.map(function(c){
          return esc((c.leg.home||"a game")+" v "+(c.leg.away||""));}).join("; ")+"</p>"+
        "<div class='sp-out' aria-live='polite'></div>";
      splitAndBook(kept,1,box.querySelector(".sp-out"),B,
        {selOf:byoSel,oddsOf:byoOdds,sel:".sp-out"});
    });
  });
}

/* The inside of the split box, so the modal and this panel share one set of
   buttons and one set of prices rather than two that drift. */
function splitBoxInner(picks,oddsOf){
  /* A SPLIT IS STILL OFFERED WHEN THE PAYOUT IS NOT KNOWN.
     A converted slip can carry a market we never price - a handicap, corners -
     and there is no probability behind it to estimate from. The first fix took
     the whole box away, which removed a working feature to avoid printing one
     wrong number. The dealing does not need a price; only the label does. So
     the tickets are still offered and the button says where the price will
     come from instead of inventing one.
     Only on the default path: the BYO panel passes its own oddsOf, which
     prices legs with the bookmaker's published numbers, and its legs carry no
     fixture for legOdd to read. */
  var blind = !oddsOf && picks.some(function(c){
    var o=legOdd(c.f||fixtureById(c.id),c.code,c.p);
    return !(o&&isFinite(o)&&o>1.01);});
  oddsOf=oddsOf||totalOdds;
  var ways=splitWays(picks.length);
  if(!ways.length) return "";
  return "<p class='sp-q'>Split it into separate tickets?</p>"+
    "<div class='sp-ways'>"+ways.map(function(n){
      var parts=splitPicks(picks,n);
      var each=parts.map(function(p){return oddsOf(p);});
      var lo=Math.min.apply(null,each), hi=Math.max.apply(null,each);
      var pay=lo.toFixed(lo>=100?0:1)+(hi-lo>0.05?"-"+hi.toFixed(hi>=100?0:1):"");
      return "<button class='sp-way' type='button' data-n='"+n+"'>"+
        "<b>"+n+" tickets</b><span>"+
        (blind?"priced at the bookmaker":"about x"+pay+" each")+
        "</span></button>";}).join("")+
    "</div>";
}

(function(){
  var go=$("byoGo"), inp=$("byoCode"), sec=$("byo");
  if(!go||!inp||!sec) return;
  go.addEventListener("click",byoRead);
  inp.addEventListener("keydown",function(e){ if(e.key==="Enter") byoRead(); });
  sec.querySelectorAll(".byo-b").forEach(function(b){
    b.addEventListener("click",function(){
      BYO.book=b.dataset.book;
      /* Only the SOURCE row, or this would light a target pill too - both
         rows are .byo-b on purpose, and the target pills live inside the
         conversion panel that is about to be thrown away anyway. */
      sec.querySelectorAll(".byo-book:not(.byo-to .byo-book) .byo-b")
        .forEach(function(o){ o.classList.toggle("on",o===b); });
      /* The legs in view came from another book and mean nothing here. */
      BYO.legs=null; $("byoOut").innerHTML="";
      /* A target chosen against the old source may BE the new source, and a
         slip cannot be converted to the book it came from. convTarget ignores
         that case anyway; clearing it here means the pills show the real
         default rather than a choice that is being quietly overridden. */
      BYO.to=null;
    });
  });

  /* ARRIVING WITH A CODE ALREADY IN HAND.
     /convert-a-booking-code is a page a search sends people to, and it has no
     converter of its own on purpose - a second implementation would drift from
     this one and the drift books somebody's slip against a pairing we do not
     ship. Its form submits here instead, so the only converter on the site is
     the one below.
       ?to=<book>    the book they want a code FOR, which is how the form asks
       ?book=<book>  the book the code came FROM, for a link built by hand
       ?go=convert   open the conversion once the read lands
     Either of the first two names the pair; `book` wins when both are present.
     The code is shape-checked with the same rule the input enforces, so a
     crafted link cannot make this send anything the box could not. */
  try{
    var q=new URLSearchParams(location.search||"");
    var to=(q.get("to")||"").toLowerCase(), from=(q.get("book")||"").toLowerCase();
    /* ?to= NAMES THE TARGET, NOT THE SOURCE. With two books, "they want a
       Bet9ja code" implied "from SportyBet" and this guessed it. With three it
       implies nothing, so the guess is gone: ?to= sets the target and the
       source stays whatever ?book= said, or the default. A link carrying only
       ?to= still opens the converter on the right target with the code in the
       box, which is all that page's form was ever asking for. */
    if(BOOKS[to]) BYO.to=to;
    var src=BOOKS[from]?from:(BOOKS[to]?(to==="sporty"?"bet9ja":"sporty"):null);
    var code=(q.get("code")||"").trim().toUpperCase();
    if(src&&/^[A-Za-z0-9]{4,16}$/.test(code)){
      BYO.book=src;
      sec.querySelectorAll(".byo-b").forEach(function(o){
        o.classList.toggle("on",o.dataset.book===src);});
      inp.value=code;
      /* THE READ MUST NOT DEPEND ON THE VIEW SWITCH. This ran as
         setView(...); byoRead(); inside one try, and setView throws at boot -
         it repaints a view whose payload has not landed - so the whole block
         was swallowed and the reader arrived at a filled box that had read
         nothing. The switch is cosmetic; the read is the point. */
      try{ setView("convert"); }catch(e){}
      byoRead();
      /* ?go=convert OPENS THE CONVERSION, IT DOES NOT BOOK ONE. The panel it
         opens only says what would move and what would not; the code is still
         minted by the reader pressing the button in it. A link that booked on
         arrival would spend somebody's daily allowance for them. */
      var go=(q.get("go")||"").toLowerCase(), t0=Date.now();
      /* Three things have to arrive first and none is instant: the legs, the
         board, and the bookmaker ids ATTACHED to that board. DATA.fixtures
         lands with the payload and carries no eventId at all until
         attachEventIds has run against both feeds, so a check for fixtures
         alone clicked too early and the panel answered "not a game on our
         board" for every leg of a slip that converts perfectly well by hand. */
      (function arrive(){
        var fx=(typeof DATA!=="undefined"&&DATA.fixtures)||[];
        var bound=fx.some(function(f){return f.eventId!=null;})&&
                  fx.some(function(f){return f.b9EventId!=null;});
        var ready=BYO.legs&&bound;
        if(!ready&&Date.now()-t0<20000) return setTimeout(arrive,300);
        try{
          if(go==="convert"&&ready){ var cb=$("byoConvBtn"); if(cb) cb.click(); }
          sec.scrollIntoView({behavior:"smooth",block:"start"});
        }catch(e){}
      })();
    }
  }catch(e){ /* a malformed query string is not a reason to break the page */ }
})();

function shareText(picks,odds,code){
  var lines=picks.slice(0,6).map(function(c){return "\u2022 "+c.f.home+" v "+c.f.away+" - "+
    mLabel(c.f,c.code).replace(/<[^>]+>/g,"")+" ("+P0(c.p)+"%)";});
  var t="\ud83e\uddd9 My Soccerwizard slip - "+picks.length+" games at "+odds.toFixed(2)+" odds\n"+lines.join("\n");
  if(code) t+="\n\n"+curBook().label+" code: "+code;
  return t;
}
function doShare(text,url){
  if(navigator.share){ navigator.share({title:"SoccerWizard slip",text:text,url:url}).catch(function(){}); }
  else if(copyText(text+(url?"\n"+url:""))){
    alert("Slip copied - paste it anywhere to share."); }
}
/* Render a slip as a picture and share that.
   A link is close to useless where this spreads: WhatsApp shows a URL as a
   line of grey text nobody taps, while an image gets looked at, and the
   booking code inside it is readable without leaving the chat. Drawn on a
   canvas rather than fetched, so it works offline and costs no round trip.
   Falls back to the text share wherever files cannot be shared - which is
   most desktop browsers - so nothing is lost by trying. */
function slipImage(picks, odds, code){
  const W=1080, PAD=64;
  const rows=picks.slice(0,10);
  /* Room for the header block, the rows, the code bar and a footer clear of
     it. Worked out rather than guessed: the first version put the footer
     inside the code bar and the caption on top of the odds. */
  const ROW=76, TOP=360, BAR=96;
  const H=TOP+rows.length*ROW+20+BAR+64;
  const c=document.createElement("canvas");
  c.width=W; c.height=H;
  const g=c.getContext("2d");

  g.fillStyle="#0d0d0f"; g.fillRect(0,0,W,H);
  /* A red wash at the top so the card reads as ours at thumbnail size, where
     no text survives. */
  const grad=g.createLinearGradient(0,0,W,300);
  grad.addColorStop(0,"rgba(230,57,70,.22)"); grad.addColorStop(1,"rgba(230,57,70,0)");
  g.fillStyle=grad; g.fillRect(0,0,W,300);

  g.fillStyle="#f2f1f0";
  g.font="800 46px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  g.fillText("Soccerwizard",PAD,96);
  g.fillStyle="#e63946";
  g.font="800 30px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  g.fillText(rows.length+"-game slip",PAD,150);

  g.fillStyle="#f2b84b";
  g.font="800 92px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  g.fillText("×"+(+odds||1).toFixed(2),PAD,258);
  /* Under the number, not beside it - measureText gives the width but the
     odds are set at 92px, so anything sharing that baseline sits on top of
     the digits rather than after them. */
  g.fillStyle="#8b8b90";
  g.font="600 26px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  g.fillText("estimated return",PAD,296);

  let y=TOP;
  rows.forEach(function(pk){
    const f=pk.f||fixtureById(pk.id)||{};
    g.fillStyle="#17171a"; g.fillRect(PAD,y-40,W-PAD*2,64);
    g.fillStyle="#f2f1f0";
    g.font="700 28px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    const teams=((f.home||"")+" v "+(f.away||"")).slice(0,38);
    g.fillText(teams,PAD+20,y);
    g.fillStyle="#f2b84b";
    g.font="800 26px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    const lab=(typeof mLabel==="function"&&f.home?mLabel(f,pk.code):pk.code||"").slice(0,26);
    const lw=g.measureText(lab).width;
    g.fillText(lab,W-PAD-20-lw,y);
    y+=ROW;
  });

  const barTop=y+20;
  if(code){
    g.fillStyle="#e63946";
    g.fillRect(PAD,barTop,W-PAD*2,BAR);
    g.fillStyle="#fff";
    g.font="800 32px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
    g.fillText("SportyBet code",PAD+24,barTop+58);
    g.font="800 50px ui-monospace,SFMono-Regular,Menlo,monospace";
    const cw=g.measureText(code).width;
    g.fillText(code,W-PAD-24-cw,barTop+62);
  }
  /* Below the bar, never over it. */
  g.fillStyle="#6b6b70";
  g.font="600 22px system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
  g.fillText("skypredict-theta.vercel.app",PAD,barTop+BAR+40);
  return c;
}
async function shareSlipImage(picks, odds, code, fallbackText){
  try{
    const canvas=slipImage(picks,odds,code);
    const blob=await new Promise(function(res){canvas.toBlob(res,"image/png");});
    if(blob&&navigator.canShare){
      const file=new File([blob],"soccerwizard-slip.png",{type:"image/png"});
      if(navigator.canShare({files:[file]})){
        await navigator.share({files:[file],text:fallbackText||""});
        return true;
      }
    }
  }catch(e){}
  return false;
}
/* A link that renders the slip itself, read by /s (see lib/sliplink.js).
   Everything the page needs travels inside the link: teams, date, market,
   odds and confidence. It is deliberately NOT a list of fixture ids - a
   fixture can leave the board while its match is still being played, and a
   link keyed on ids would then resolve to nothing, silently, on somebody
   else's post.
   The separators and the field order must match lib/sliplink.js exactly.
   index.html cannot import from lib/, so a test round-trips this encoder
   through that decoder and fails loudly if either side drifts. */
const SLIP_FS="\u001f", SLIP_RS="\u001e";
function slipName(s){
  return String(s==null?"":s).replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,40);
}
/* Takes builder picks ({f,code,p}) or My slip legs ({id,code,p}), which is
   why the fixture is resolved here rather than assumed. A leg whose fixture
   has gone is dropped: a slip missing a game is bad, a link that will not
   open at all is worse, and the reader still gets the rest of what they
   built. */
/* ALL OF THE SLIP OR NONE OF IT. A leg that cannot be encoded used to be
   skipped, which shared a shorter slip than the one that was booked and said
   nothing about it - and lib/sliplink.js refuses a partial slip for the same
   reason at the other end. A converted slip is the case that makes this bite:
   its markets are pass-through ones the link does not carry, so the honest
   answer is no slip link at all and the booking code shared on its own. */
/* WHAT A SHARE LINK CAN CARRY, which is not everything a slip can hold.
   lib/sliplink.js refuses a code it does not know, so encoding one produces a
   link that is long AND dead: the short-link post is rejected, the fallback URL
   goes out, and it opens on "that slip has a bet we do not offer". A converted
   slip is full of pass-through markets nobody here predicts, so this is not a
   corner case. Mirrors sliplink's MARKETS keys and test/sliplink.test.js fails
   if the two ever drift. */
var LINK_MARKETS={"1":1,"2":1,"X":1,"1X":1,"X2":1,"12":1,
  "OVER_1.5":1,"OVER_2.5":1,"OVER_3.5":1,"GG":1,"FH_OVER_0.5":1,
  "HOME_OVER_0.5":1,"AWAY_OVER_0.5":1,"HOME_OVER_1.5":1,"AWAY_OVER_1.5":1,
  "MIX_1_OV_1.5":1,"MIX_2_OV_1.5":1,"MIX_X_OV_1.5":1,
  "MIX_1_OV_2.5":1,"MIX_2_OV_2.5":1,"MIX_X_OV_2.5":1,
  "MIXGG_1":1,"MIXGG_2":1,"MIXGG_X":1,"WINHALF_H_Y":1,"WINHALF_A_Y":1};
function slipPayload(items){
  var rows=[], bad=false;
  (items||[]).slice(0,40).forEach(function(c){
    if(c&&!LINK_MARKETS[c.code]){ bad=true; return; }
    var f=c.f||fixtureById(c.id);
    /* A fixture that has left the board is still dropped and the rest of the
       slip still travels - that is a decision of its own, pinned in
       test/sliplink.test.js, and this is not reopening it. */
    if(!f||!f.home||!f.away||!f.date||!c.code) return;
    var od=legOdd(f,c.code,c.p), p=+c.p;
    /* The link carries a probability per leg and lib/sliplink.js rejects the
       lot if one is missing, so a leg without one cannot travel either. */
    if(!(od>1.01)||!isFinite(p)||p<=0){ bad=true; return; }
    rows.push([slipName(f.home),slipName(f.away),String(f.date),String(c.code),
      od.toFixed(2),Math.round(p*100)].join(SLIP_FS));
  });
  return bad?"":rows.join(SLIP_RS);
}
/* The code and the book travel with the link. Without them the page has no
   code to show and falls back to SportyBet, so a Bet9ja slip arrived saying
   "SportyBet booking code" over a button into the wrong app. */
function slipUrl(items,code,book){
  try{
    var raw=slipPayload(items);
    if(!raw) return null;
    var bytes=new TextEncoder().encode(raw),bin="";
    for(var i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]);
    var u=location.origin+"/s?p="+
      btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    if(code) u+="&c="+encodeURIComponent(code);
    if(book) u+="&b="+encodeURIComponent(book);
    return u;
  }catch(e){ return null; }
}
/* The short share link.
   `/s?p=...` carries the whole slip in the URL and runs to four hundred
   characters, which is fine on X and miserable in WhatsApp. The booking code
   is already a short unique name for this slip, so the payload is posted once
   and the link becomes `/s/MS0LJY`.
   It is posted rather than looked up from SportyBet on the way back: their
   endpoint returns event ids with no team names, and the only feed that maps
   those ids to teams drops a match at kick-off, so a link built that way would
   lose its games a few hours after it was sent.
   Best effort. If the post fails the long link still works, so nothing is
   lost and nothing is waited for. */
var SHORT_LINKS={};
function shortSlipUrl(code){ return code&&SHORT_LINKS[code]||null; }
function rememberShortLink(code,items,B){
  try{
    if(!code) return;
    var raw=slipPayload(items);
    if(!raw) return;
    var bytes=new TextEncoder().encode(raw),bin="";
    for(var i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]);
    var p=btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    fetch("/api/share",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({code:code,book:(B&&B.key)||(curBook()&&curBook().key)||"sporty",p:p})})
      .then(function(r){return r.json();})
      .then(function(d){ if(d&&d.ok) SHORT_LINKS[code]=location.origin+"/s/"+encodeURIComponent(code); })
      .catch(function(){});
  }catch(e){}
}
/* THE SAME SHORT LINK FOR A SLIP THAT HAS NO BOOKING CODE.
   rememberShortLink above is keyed on the code, which slip-of-the-day does not
   have until somebody books it - so its Share button fell through to
   `/s?p=...` and put 401 characters of base64 into a WhatsApp message. The key
   here is the payload's own SHA-256, first six bytes, behind an `S-` prefix:
   deterministic, so sharing the same slip twice reuses one row, and prefixed
   because a bookmaker's code is alphanumeric and can therefore never collide
   with it.
   Registered when the section renders, never on the tap: navigator.share has
   to be reachable from the gesture, and a share that waits on a round trip is
   a share that silently does nothing. If the round trip has not landed the
   long link still goes, which is what happens today. */
var SHORT_SLIP=null;   // {raw, url} - raw pins the url to the slip it came from
function rememberSlipLink(items,book){
  try{
    var raw=slipPayload(items);
    if(!raw||!(window.crypto&&crypto.subtle)) return;
    var bytes=new TextEncoder().encode(raw),bin="";
    for(var i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]);
    var p=btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
    crypto.subtle.digest("SHA-256",bytes).then(function(h){
      var key="S-"+Array.prototype.map.call(new Uint8Array(h).slice(0,6),function(b){
        return ("0"+b.toString(16)).slice(-2);}).join("").toUpperCase();
      return fetch("/api/share",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({code:key,book:book||"sporty",p:p})})
        .then(function(r){return r.json();})
        .then(function(d){ if(d&&d.ok) SHORT_SLIP={raw:raw,url:location.origin+"/s/"+key}; });
    }).catch(function(){});
  }catch(e){}
}
function shareSlip(picks,odds){
  const txt=shareText(picks,odds,null);
  /* Pinned to the payload: a cached link from a slip that has since been
     rebuilt would send somebody else's games. */
  var short=null;
  try{ if(SHORT_SLIP&&SHORT_SLIP.raw===slipPayload(picks)) short=SHORT_SLIP.url; }catch(e){}
  shareSlipImage(picks,odds,null,txt).then(function(ok){
    if(!ok) doShare(txt,short||slipUrl(picks)||location.href);
  });
}
/* The link points at the slip on our own site rather than straight into
   the bookmaker. A shared code used to send the reader to SportyBet - the
   one place they could already reach - while the games, the confidence and
   our record never travelled with it. The slip page carries the code
   onward, so nothing is lost. It also stopped saying "SportyBet" on a
   Bet9ja code. */
function shareCode(code,picks,B){
  var bk=(B&&B.key)||(curBook()&&curBook().key)||"sporty";
  doShare("\ud83e\uddd9 My Soccerwizard slip. Code: "+code,
          shortSlipUrl(code)||slipUrl(picks,code,bk)||(SPORTY_URL+encodeURIComponent(code)));
}
function bookList(picks,resultId,btnId,label){
  var bookable=picks.filter(function(c){return c.eventId;});
  var missing=picks.filter(function(c){return !c.eventId;});
  if(!bookable.length){$(resultId).innerHTML="<div class='code-err'>None of these are on SportyBet right now, so a code can't be created.</div>";return;}
  if(missing.length){
    $(resultId).innerHTML="<div class='confirm-card'><p>"+missing.length+" game"+(missing.length===1?" isn't":"s aren't")+" available on SportyBet yet. Book the other "+bookable.length+"?</p><div class='ca'><button class='confirm-go' type='button'>Book "+bookable.length+"</button><button class='confirm-cancel' type='button'>Clear</button></div></div>";
    $(resultId).querySelector(".confirm-go").addEventListener("click",function(){doBookList(bookable,resultId,btnId,label);});
    $(resultId).querySelector(".confirm-cancel").addEventListener("click",function(){$(resultId).innerHTML="";});
    return;
  }
  doBookList(bookable,resultId,btnId,label);
}
/* Book-all: turns every tip currently on the board into one slip at whichever
   book is selected. It reuses the same picks the cards show, so what you see is
   what gets booked, and it asks first because a 20-leg acca is not something to
   fire by accident. */
function bookAllPicks(){
  var out=[];
  shown().forEach(function(f){
    if(!notStarted(f)) return;
    var code=tipCode(f); if(!code) return;
    out.push({f:f,id:fid(f),code:code,p:f.tip_p,eventId:f.eventId||null});
  });
  return out;
}
function renderBookAll(){
  var btn=$("bookAll"); if(!btn) return;
  var picks=bookAllPicks();
  /* Whether a game can be booked is a question about the book in play, and
     `c.eventId` is SportyBet's id - so the count on the button, and the list
     behind it, were SportyBet's answer read out to a reader on BetKing. */
  var bookable=picks.filter(function(c){return bookTakes(c,curBook());});
  btn.classList.toggle("show",bookable.length>=2);
  var n=$("bookAllN"); if(n) n.textContent=bookable.length;
}
function confirmBookAll(){
  var picks=bookAllPicks();
  var host=$("bookAllResult"); if(!host) return;
  /* THREE BOOKS, ONE OF THEM NAMED. Every sentence here said SportyBet, which
     was true when it was the only book and has been wrong since Bet9ja and
     BetKing shipped: the reader on BetKing was told their own games were not
     on a bookmaker they are not using. The toggle already knows which book is
     in play, and the cap is the same 50 at all three. */
  var B=curBook();
  var bookable=picks.filter(function(c){return bookTakes(c,B);});
  /* NAMING THE BOOK IS NOT THE SAME AS OFFERING IT. The prompt reads the
     toggle, but the toggle lives on the builder and in My slip - a reader who
     opened the board and tapped Book all had no way to change book without
     leaving the prompt. The pills carry each book's count of these games, so
     "none of these are on X" now comes with the two books that do have them.
     No data-bookpick attribute: paintBookPickers repaints those from My slip,
     which is not the list this card is about. Clicks are delegated off
     [data-book], so the pills work wherever they are drawn. */
  function wirePicker(){
    var el=host.querySelector(".bookpick");
    paintBookPickerWith(el,picks);
    if(el) el.addEventListener("click",function(e){
      if(e.target.closest("[data-book]")) setTimeout(confirmBookAll,0);
    });
  }
  if(!bookable.length){
    host.innerHTML="<div class='code-err'>None of these games are on "+
      B.mark+" right now.</div><div class='bookpick'></div>";
    wirePicker();
    return;
  }
  var odds=bookable.reduce(function(t,c){return t*legOdd(c.f,c.code,c.p);},1);
  var skipped=picks.length-bookable.length;
  /* Rather than silently truncating, say what will happen and point at the
     slip sheet, where trimming is easy. See BETSLIP_MAX. */
  var CAP=BETSLIP_MAX, over=bookable.length>CAP;
  var going=over?bookable.slice(0,CAP):bookable;
  var goingOdds=going.reduce(function(t,c){return t*legOdd(c.f,c.code,c.p);},1);
  host.innerHTML="<div class='confirm-card' id='bookAllCard'><p>Book all <b>"+bookable.length+
    "</b> Soccerwizard tips on this page as one slip?<br><span style='font-weight:600;color:var(--soft)'>"+
    "Estimated odds \u00d7"+(over?goingOdds:odds).toFixed(2)+
    (skipped?" \u00b7 "+skipped+" not on "+B.mark+" yet, skipped":"")+
    "</span></p>"+
    "<div class='bookpick'></div>"+
    (over?"<div class='cap-warn'><b>"+B.mark+" only takes "+CAP+" games per slip.</b>"+
      "Book the first "+CAP+" and the last "+(bookable.length-CAP)+
      " are left off, or keep them all across several tickets.</div>":"")+
    "<div class='ca'>"+
    "<button class='confirm-go' type='button'>"+(over?"Book first "+CAP:"Book all "+bookable.length)+"</button>"+
    "<button class='confirm-trim' type='button'>Review &amp; trim</button>"+
    "<button class='confirm-cancel' type='button'>Cancel</button></div>"+
    /* THE SAME THIRD ANSWER THE SLIP SHEET GIVES. This prompt sent the reader
       to My slip to delete games by hand, which is the one outcome nobody
       wants; the splitter keeps every tip on the board and deals it across
       tickets that fit. Offered whether or not the board is over the cap -
       twenty tips as two tickets of ten is a different bet, not a workaround. */
    (bookable.length>=4?capWaysHTML(bookable):"")+"</div>";
  function fillSlip(){
    MYSLIP=MYSLIP.filter(function(x){return !x.auto;})
      .concat(bookable.map(function(c){return {id:c.id,code:c.code,label:mLabel(c.f,c.code),p:c.p,auto:true};}));
    var seen={}; MYSLIP=MYSLIP.filter(function(x){if(seen[x.id])return false;seen[x.id]=1;return true;});
    saveMy(); renderFab();
  }
  /* The picks go into My slip on the way out whichever answer is taken, so the
     sheet still shows what was booked. Through wireSplit for the same reason
     the slip sheet is: the quota check lives there and a second call site
     would walk past it. */
  host.querySelectorAll(".sp-way").forEach(function(b){
    b.addEventListener("click",fillSlip);
  });
  wirePicker();
  wireSplit(host,bookable,B,{sel:"#bookAllCard"});
  host.querySelector(".confirm-go").addEventListener("click",function(){
    fillSlip();
    window.__wizChime&&window.__wizChime();
    doBookList(going,"bookAllResult","bookAll","Book all tips");
  });
  host.querySelector(".confirm-trim").addEventListener("click",function(){
    /* Load every pick into the slip and open it, so the user removes what they
       want, then books from the sheet. This is how they confirm and trim. */
    fillSlip(); host.innerHTML=""; openMySheet();
  });
  host.querySelector(".confirm-cancel").addEventListener("click",function(){host.innerHTML="";});
  host.scrollIntoView({block:"nearest"});
}
if($("bookAll")) $("bookAll").addEventListener("click",confirmBookAll);

function doBookList(picks,resultId,btnId,label,B){
  B=B||curBook();
  /* A pick with no id at this book cannot be sent - the server would be asked
     to price `null` and refuse the whole slip over it. */
  var going=picks.filter(function(c){return !!bookIdOf(c,B);});
  var sel=going.map(function(c){return B.sel(c);});
  if(!sel.length){
    $(resultId).innerHTML="<div class='code-err'>None of these games are on "+
      B.mark+" right now, so a code can't be created.</div>";
    return;
  }
  var btn=$(btnId); if(btn){btn.disabled=true;btn.textContent="Booking\u2026";}
  $(resultId).innerHTML="";
  bookFetch(sel,B)
    .then(function(d){
      if(btn){btn.disabled=false;btn.textContent=label;}
      var code=B.codeOf(d);
      if(d&&d.success&&code){
        showCode(code,resultId,function(){
          rememberSlip(going,totalOdds(going),code);},B,going);
      }
      else{ $(resultId).innerHTML=bookErrHTML(d,B); }
    })
    .catch(function(){ if(btn){btn.disabled=false;btn.textContent=label;}
      $(resultId).innerHTML=bookErrHTML({_kind:"net"},B); });
}
/* ---- Slip of the Day: safe pre-built acca ---- */
var SOTD=[];
/* Slip of the day aims at double the stake - as near to two as it can get,
   from whichever side lands closer.
   It used to take the four best picks and let the total fall where it fell.
   A hard ceiling at two was the obvious fix and it was the wrong one: on a
   four-game card it dropped the last leg and finished at 1.70, when keeping
   it would have finished at 2.18. Stopping short misses the target by more
   than going slightly over does, and a little over two is still a slip that
   roughly doubles your money.
   So: fill with the safest games while they fit under two, then look at one
   more. Take it when it lands nearer to two than stopping here would, and
   when it does not sail past the hard limit. Either way that is the end of
   it - candidates arrive safest-first, which is also shortest-priced, so
   every leg after this one is longer still. */
const SOTD_TARGET_ODDS=2.0;
/* Far enough past the target to keep a leg worth keeping, close enough that
   this never quietly becomes a long-odds accumulator. */
const SOTD_HARD_MAX=2.4;
const SOTD_MAX_LEGS=8;
/* THE SLIP OF THE DAY IS PRICED ON SPORTYBET, WHATEVER THE READER PICKED.
   It is locked for the day (saveSotdLock) and it is the same slip for
   everyone. Letting legOdd follow the reader's book would compose a different
   slip per reader against a target of 2.0, and whichever reader loaded the
   page first would write THEIR book's version into the lock. Same failure as
   pick-of-the-day being recomputed in the browser: anything that must stay
   put has to be decided against one fixed input. */
function sotdUnderCap(cand){
  var pick=[],prod=1;
  for(var i=0;i<cand.length && pick.length<SOTD_MAX_LEGS;i++){
    var o=legOdd(cand[i].f,cand[i].code,cand[i].p,BOOKS.sporty);
    if(!(o>1)) continue;
    var next=prod*o;
    if(next<=SOTD_TARGET_ODDS){ pick.push(cand[i]); prod=next; continue; }
    if(next<=SOTD_HARD_MAX &&
       Math.abs(next-SOTD_TARGET_ODDS)<Math.abs(prod-SOTD_TARGET_ODDS)){
      pick.push(cand[i]); prod=next;
    }
    break;
  }
  /* Some days two is not reachable at all - a thin card, or the safest games
     priced so long that even one sails past the limit. Rather than show a
     one-leg "slip" or nothing, fall back to what this always did. */
  return pick.length>=2 ? pick : cand.slice(0,4);
}
/* The slip of the day, once chosen, is the slip of that day.
   It used to be rebuilt from scratch on every render out of games that had not
   kicked off, so the moment one of its legs started it fell out of the pool and
   a different game took its place - the card quietly rewrote itself through the
   afternoon, and anyone who had booked it watched it turn into a slip they had
   not backed. Worse, it can only ever have looked right: a slip you cannot
   check afterwards is not a claim, it is a moving target.
   So it is locked per day, the way the Pick of the day is. Legs are stored by
   fixture id and read back whatever state those games are now in. */
function sotdLockKey(dateStr){ return "sw.sotd."+dateStr; }
function loadSotdLock(dateStr){
  try{ var raw=localStorage.getItem(sotdLockKey(dateStr));
    if(!raw) return null;
    var v=JSON.parse(raw);
    return (v&&Array.isArray(v.legs)&&v.legs.length>=2)?v:null;
  }catch(e){ return null; }
}
function saveSotdLock(dateStr,legs){
  try{
    localStorage.setItem(sotdLockKey(dateStr),JSON.stringify({
      date:dateStr, legs:legs.map(function(c){return {id:c.id,code:c.code,p:c.p};})
    }));
    /* Same rule as the pick's keys: a day that has been and gone is dead, the
       rest are still worth holding. */
    for(var i=localStorage.length-1;i>=0;i--){
      var k=localStorage.key(i);
      if(!k||k.indexOf("sw.sotd.")!==0) continue;
      var d=k.slice(8);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||dayOff(d)<0) localStorage.removeItem(k);
    }
  }catch(e){}
}
function renderSlipOfDay(){
  var host=$("sotd"); if(!host) return;
  /* onDay() now keeps today's kicked-off games for the board; a slip must not
     offer them, so filter back to what can still be booked. */
  var games=onDay().filter(notStarted); if(!games.length) games=ahead();
  /* A cup tie between divisions is priced off an assumed gap between those
     divisions, not off anything measured - see TIER_EDGE in the build. It can
     sit on the board; it has no business in the slip built from the safest
     numbers on the card. */
  games=games.filter(function(f){return !f.cross_tier;});
  var allowed=["1X","X2","OVER_1.5","1","2"], cand=[];
  games.forEach(function(f){
    var best=null;
    allowed.forEach(function(c){var v=mProb(f,c);
      if(v==null||isNaN(v)||v<0.70)return; if(!best||v>best.p)best={code:c,p:v};});
    if(best) cand.push({f:f,id:fid(f),code:best.code,p:best.p,eventId:f.eventId||null});
  });
  /* Safest first, which is also cheapest first - a higher confidence always
     carries a shorter price - so filling in this order fits the most legs
     under the ceiling. */
  /* Confidence alone put the leagues the model knows least well at the top of
     the slip, which is exactly backwards - a fit with little behind it does not
     produce cautious numbers, it produces confident ones nobody has earned.
     `thin` marks a fixture whose weaker side has little recent history, which
     is the honest measure of that, and it stays.

     What has gone is the second demerit, a flag for any Asian league. It was
     added because the Chinese Super League is not thin - all eight of its
     fixtures cleared the support bar - so sorting on support alone left them
     near the top. But it sorted ahead of confidence, which made it a ban
     rather than a demerit, and it was answering a question about quality with
     a fact about geography. Our own table has China Super League at tier 1,
     level with the Premier League, while England League 1 is 3 and Conference
     National is 5 - so the rule was pushing the slip DOWN the league ladder in
     the name of pushing it up.
     League quality is carried by tierScore now: a step down in tier costs two
     points of confidence. A top-flight game leads on a day that has one, and a
     lower-tier standout has to be clearly better to outrank it rather than
     merely present. */
  function sotdDemerit(f){ return (f.thin?1:0); }
  cand.sort(function(a,b){
    return sotdDemerit(a.f)-sotdDemerit(b.f) ||
      (tierScore(b.p,b.f)-tierScore(a.p,a.f));
  });

  /* The day this slip belongs to. Held to today while today still has a card,
     so the slip does not jump to tomorrow's games the moment the last of
     today's kicks off - the same rule the Pick of the day follows. */
  var _sdDay=allOnDay(0).length?allOnDay(0):allOnDay(V.off);
  var _sdDate=_sdDay.length?_sdDay[0].date:null;
  var lock=_sdDate?loadSotdLock(_sdDate):null;
  if(lock){
    /* Read the locked legs back as they stand now - kicked off, finished or
       still to come. A leg whose fixture has gone from the payload entirely is
       dropped rather than faked. */
    var back=[];
    lock.legs.forEach(function(l){
      var f=fixtureById(l.id); if(!f) return;
      back.push({f:f,id:l.id,code:l.code,p:(l.p!=null?l.p:mProb(f,l.code)),eventId:f.eventId||null});
    });
    if(back.length>=2) SOTD=back;
    else { SOTD=sotdUnderCap(cand); if(SOTD.length>=2&&_sdDate) saveSotdLock(_sdDate,SOTD); }
  } else {
    SOTD=sotdUnderCap(cand);
    if(SOTD.length>=2&&_sdDate) saveSotdLock(_sdDate,SOTD);
  }
  if(SOTD.length<2){host.innerHTML="";return;}
  /* Priced on SportyBet like the legs it is a total of - see sotdUnderCap. */
  var odds=SOTD.reduce(function(t,c){return t*legOdd(c.f,c.code,c.p,BOOKS.sporty);},1);
  /* A leg that has kicked off cannot be booked, whatever SportyBet still lists,
     so the button goes by what is actually still open rather than by whether an
     event id exists. */
  var started=SOTD.filter(function(c){return !notStarted(c.f);}).length;
  var bookable=SOTD.filter(function(c){return c.eventId&&notStarted(c.f);}).length;
  host.innerHTML=
    "<section class='sotd'>"+
      "<div class='sotd-top'><svg width='15' height='15' viewBox='0 0 24 24' fill='currentColor'>"+
        "<path d='M12 2l2.4 6.9 7.1.4-5.5 4.6 1.8 7-5.8-4-5.8 4 1.8-7L2.5 9.3l7.1-.4z'/></svg>"+
        "<b>Slip of the day</b><span class='k'>"+SOTD.length+" bankers</span></div>"+
      "<h2>The safest slip today</h2>"+
      "<p class='sub'>Our highest-confidence picks, combined into one bet - no building needed.</p>"+
      /* Once a leg has been played it shows how it went rather than the
         confidence we had beforehand - the slip stays put now, so it has to be
         readable after the fact as well as before it. */
      "<div class='sotd-legs'>"+SOTD.map(function(c){
        var st=null; try{st=fixtureState(c.f);}catch(e){}
        var right="<span class='lg-c'>"+P0(c.p)+"%</span>", cls="";
        if(st&&st.kind==="ft"&&st.hg!=null){
          var v=null; try{v=gradeLeg(c.f,c.code,st.hg,st.ag);}catch(e){}
          cls=(v===true?" won":(v===false?" lost":""));
          right="<span class='lg-c res'>"+st.hg+"-"+st.ag+"</span>";
        } else if(st&&st.kind==="live"&&st.hg!=null){
          cls=" live";
          right="<span class='lg-c res'>"+st.hg+"-"+st.ag+"</span>";
        }
        return "<div class='sotd-leg"+cls+"'><span class='lg-t'>"+esc(c.f.home)+" v "+esc(c.f.away)+
          "</span><span class='lg-p'>"+mLabel(c.f,c.code)+"</span>"+right+"</div>";
      }).join("")+"</div>"+
      "<div class='sotd-foot'><div class='sotd-odds'><i>Est. odds*</i><b>~\u00d7"+odds.toFixed(2)+"</b></div>"+
        "<button class='share-btn' id='sotdShare'>\u2197 Share</button>"+
        "<button class='sotd-btn' id='sotdBook'"+(bookable?"":" disabled")+">Book this slip</button></div>"+
      "<div class='bld-note' id='sotdNote'></div><div id='sotdResult'></div>"+
      renderNotif()+
    "</section>";
  $("sotdBook").addEventListener("click",function(){bookList(SOTD,"sotdResult","sotdBook","Book this slip");});
  $("sotdShare").addEventListener("click",function(){shareSlip(SOTD,odds);});
  rememberSlipLink(SOTD,(curBook()&&curBook().key)||"sporty");
  wireNotif();
  var note=$("sotdNote");
  if(started>=SOTD.length)
    note.textContent="These games have started - today's slip stays here so you can see how it finished.";
  else if(started)
    note.textContent=started+" of "+SOTD.length+" have kicked off, so this can no longer be booked in full.";
  else if(!bookable) note.textContent="Booking opens when these games are live on SportyBet.";
  else if(bookable<SOTD.length) note.textContent=bookable+" of "+SOTD.length+" bookable right now.";
}
/* ---- Daily streak ---- */
function renderStreak(){
  var el=$("streak"); if(!el) return;
  var today=new Date().toISOString().slice(0,10);
  var last=null,streak=0;
  try{last=localStorage.getItem("sw.lastseen");streak=+(localStorage.getItem("sw.streak")||0);}catch(e){}
  if(last!==today){
    var y=new Date(Date.now()-86400000).toISOString().slice(0,10);
    streak=(last===y)?streak+1:1;
    try{localStorage.setItem("sw.lastseen",today);localStorage.setItem("sw.streak",streak);}catch(e){}
  }
  /* Keeps trust-i, so it carries the same separator dot as every other item
     on the row. It used to swap the class out and lead with a flame instead:
     one item with a glyph where its neighbours have a dot, which beside the
     real dot next to it read as two marks in a row. */
  if(streak>=2){el.hidden=false;el.className="trust-i streak";
    /* The flame was an emoji, which renders as a different picture on every
       platform and is the clearest tell of a generated interface. The words
       carry it on their own. */
    el.innerHTML="<b>"+streak+"-day streak</b>";}
  else el.hidden=true;
}
/* ---- Board header ----
   Says what the board is and how much of it there is, so arriving at it feels
   like reaching a section rather than stopping halfway down a page. Counts
   follow the current filter, so it stays honest when the list is narrowed. */
/* On a wide screen the Add-all pill belongs on the heading line, above the
   day arrows: the heading names the day and the pill acts on that day, while
   the view toggle beside its old home changes something else entirely.
   The node is moved rather than duplicated, and only above 720px - on a phone
   it has its own place in the row below, tuned across three breakpoints, and
   none of that should shift. */
var BA_MQ=window.matchMedia("(min-width:721px)");
function placeBookAll(){
  var row=document.querySelector(".bookall-row");
  var slot=$("baSlot"), top=document.querySelector(".toprow"),
      date=document.querySelector(".datebar");
  if(!row||!slot||!top) return;
  if(BA_MQ.matches){ if(row.parentNode!==slot) slot.appendChild(row); }
  else if(row.parentNode!==top){ top.insertBefore(row, date||null); }
}
try{ BA_MQ.addEventListener("change",placeBookAll); }
catch(e){ try{ BA_MQ.addListener(placeBookAll); }catch(e2){} }

/* Whether the rail is allowed to pin itself to the screen.
   Pinning caps its height, and a capped column that does not fit grows a
   scrollbar inside the page - a second, easily missed thing to scroll, which
   is what this is here to prevent. No fixed breakpoint can answer it: the
   record card appears once somebody has built a slip, the coach note sits
   there until it is dismissed, and the reasons list is however long today's
   pick needs. So it is measured. Unpinned the rail is a plain block with no
   cap, so its scrollHeight is the full content height; if that fits the room
   a pinned column would get, it may pin, and otherwise it flows with the page
   where the page's own scrollbar reaches all of it.
   The 4px is slack, so a card growing by a line does not flip it back and
   forth on the same screen. */
var RAIL_MQ=window.matchMedia("(min-width:1060px) and (min-height:820px)");
function fitRail(){
  var rail=document.querySelector(".home-rail"), de=document.documentElement;
  if(!rail) return;
  if(!RAIL_MQ.matches){ de.classList.remove("rail-fits"); return; }
  de.classList.remove("rail-fits");          // measure it uncapped
  var fits = rail.scrollHeight + 4 <= window.innerHeight - 20;
  de.classList.toggle("rail-fits", fits);
}
(function(){
  var t=null;
  function soon(){ clearTimeout(t); t=setTimeout(fitRail,120); }
  window.addEventListener("resize",soon);
  try{ RAIL_MQ.addEventListener("change",soon); }
  catch(e){ try{ RAIL_MQ.addListener(soon); }catch(e2){} }
  /* The cards are rendered and re-rendered at various points - a settled slip,
     a dismissed coach note, a new pick of the day - and each one changes the
     answer. Watching the column itself covers all of them without every
     render having to remember to ask. */
  var rail=document.querySelector(".home-rail");
  if(rail && "ResizeObserver" in window) new ResizeObserver(soon).observe(rail);
  if(rail && "MutationObserver" in window)
    new MutationObserver(soon).observe(rail,{childList:true,subtree:true});
  fitRail();
})();
function renderBoardHead(list){
  var h=$("boardHead"); if(!h) return;
  placeBookAll();
  if(V.off<0){
    var rs=resultsOnDay();
    h.innerHTML="<h2>Results</h2><p>"+esc(dayName(V.off))+" · "+rs.length+
      " game"+(rs.length===1?"":"s")+" graded</p>";
    return;
  }
  var n=(list||[]).length, lg={};
  (list||[]).forEach(function(f){lg[f.league]=1;});
  var m=Object.keys(lg).length;
  var when=V.off===0?"Today's":(V.off===1?"Tomorrow's":esc(dayName(V.off))+"'s");
  h.innerHTML="<h2>"+when+" predictions</h2><p>"+
    n+" game"+(n===1?"":"s")+(m?" · "+m+" league"+(m===1?"":"s"):"")+"</p>"+
    formNote();
}
/* HOW OLD THE FORM BEHIND THESE PICKS IS, SAID OUT LOUD.
   The board carries no sign of this on its own. When football-data is down the
   build serves its result files from the committed floor - the site stays up,
   which is the point - but the model is then fitted on whatever the floor last
   held. Measured 6 Sep 2026 during a real outage: nine divisions had any of the
   current season at all, six to thirty-six days behind, and every other
   division was on last season. Every number on the page looked exactly as it
   always does.
   generatedAt is no help here: it says the BOARD is ten minutes old, which is
   true and completely misleading about the ratings underneath it.
   Quiet on a normal day. Under three days behind with a healthy feed is the
   ordinary gap between rounds and saying so would be noise, so this shows only
   when the feed actually failed, or when the form is old enough to matter
   whatever the reason. */
function formNote(){
  var d=DATA||{};
  var days=d.formStaleDays;
  if(days==null||!isFinite(days)) return "";
  var degraded=(+d.degradedSources||0)>0;
  if(!degraded && days<3) return "";
  var age=(days===0)?"is current":((days===1?"is 1 day":"is "+days+" days")+" old");
  var why=degraded
    ? "the results feed is unavailable, so ratings have not updated"
    : "ratings have not updated";
  return "<p class='board-stale'>Form data "+esc(age)+" · "+esc(why)+
    (d.formThrough?" since "+esc(d.formThrough):"")+"</p>";
}

/* ---- First-run coaching ----
   Nothing on the board ever explained itself. A tip anchored to the actual
   call teaches better than a floating box of instructions, and it does not
   block anything - blocking overlays get dismissed unread, because people
   reflexively hunt for the close button. Shown until dismissed, then never
   again. Deliberately does NOT open the match sheet: in Cards view that is a
   modal, and springing one on a first-time visitor takes the page away from
   them. The pulse draws the eye; the visitor still decides. */
const COACH_KEY="sw.coached.v1";
function coachSeen(){
  try{return localStorage.getItem(COACH_KEY)==="1";}catch(e){return true;}
}
function coachDone(){
  try{localStorage.setItem(COACH_KEY,"1");}catch(e){}
  var c=document.querySelector(".coach"); if(c) c.parentNode.removeChild(c);
  document.querySelectorAll(".coach-look").forEach(function(el){
    el.classList.remove("coach-look");});
}
function runCoach(o){
  o=o||{};
  if(!o.force&&coachSeen()) return;
  var card=document.querySelector("#list .m")||document.querySelector("#list .lrow");
  if(!card) return;
  var old=document.querySelector(".coach");
  if(old) old.parentNode.removeChild(old);

  var tip=card.querySelector(".tipbox")||card.querySelector(".lt-tip");
  if(tip) tip.classList.add("coach-look");

  var c=document.createElement("div");
  c.className="coach";
  /* Names the ring rather than gesturing at a position, so the words work
     wherever on the card the call happens to sit. The verb follows the input
     device, not the screen width - a touch laptop is still tapped. */
  c.innerHTML="<div class='coach-tx'><b>The outlined row is our call.</b>"+
    "<span>The number beside it is how sure we are. "+
    "<span class='v-tap'>Tap</span><span class='v-click'>Click</span> any match "+
    "for every option we predict, and add any of them to your slip.</span></div>"+
    "<button class='coach-x' type='button'>Got it</button>";
  /* A list row toggles open when clicked, so the tip must swallow its own. */
  c.addEventListener("click",function(e){e.stopPropagation();});
  c.querySelector(".coach-x").addEventListener("click",function(e){
    e.stopPropagation(); coachDone();});
  card.appendChild(c);

  if(o.scroll){
    try{card.scrollIntoView({behavior:"smooth",block:"center"});}
    catch(e){card.scrollIntoView();}
  }
}

/* ---- Builder coach ----
   The toggle names two tools without saying what either does to you. This
   opens from the ? beside it, and shows itself once to anyone who has not
   seen it, so a first-timer is told rather than left to experiment. */
const BLD_COACH_KEY="sw.bldcoached.v1";
function bldCoachSeen(){
  try{return localStorage.getItem(BLD_COACH_KEY)==="1";}catch(e){return true;}
}
function renderBldCoach(open){
  var host=$("bldCoach"), btn=$("bldHelp");
  if(!host) return;
  if(!open){ host.innerHTML=""; if(btn) btn.classList.remove("on"); return; }
  if(btn) btn.classList.add("on");
  host.innerHTML=
    "<div class='bld-coach'>"+
      "<h4>Two ways to the same slip</h4>"+
      "<ul>"+
        "<li class='bc-wiz'><span class='bc-num'>1</span><span><b>Wizard</b> - "+
          "you name the payout you want, say &times;100, and we choose the games "+
          "that get there. Best if you know what you want to win.</span></li>"+
        "<li class='bc-slide'><span class='bc-num'>2</span><span><b>Slider</b> - "+
          "you set how much risk you are happy with and we pick to match. Best if "+
          "you care more about the odds of landing than the size of the return.</span></li>"+
        /* The reader's book, not a book. This named SportyBet outright while
           the reader may be on any of three, and it is the line that says what
           they walk away with. */
        "<li><span class='bc-num'>3</span><span>Either way you get a booking code "+
          "for "+curBook().label+", and you can drop any game you do not fancy "+
          "before you take it.</span></li>"+
      "</ul>"+
      "<button class='bc-x' type='button'>Got it</button>"+
    "</div>";
  host.querySelector(".bc-x").addEventListener("click",function(){
    try{localStorage.setItem(BLD_COACH_KEY,"1");}catch(e){}
    renderBldCoach(false);
  });
}
function wireBldHelp(){
  var btn=$("bldHelp"); if(!btn||btn._w) return;
  btn._w=1;
  btn.addEventListener("click",function(){
    renderBldCoach(!btn.classList.contains("on"));
  });
}

/* ---- Board cap ----
   A phone opening straight onto a hundred-plus fixtures is a wall, and the
   newcomer we care about has already been given the day's pick above it. Show
   a screenful and let people ask for the rest; once asked, it stays asked for
   the session. Desktop is untouched - it has the room, and the CSS that does
   the capping only exists under 720px. */
var BOARD_ALL=false;
const BOARD_CAP_AT=12;
function applyBoardCap(n){
  var host=$("listMore"); if(!host) return;
  var many=n>BOARD_CAP_AT;
  document.documentElement.classList.toggle("board-cap",many&&!BOARD_ALL);
  if(!many||BOARD_ALL){host.innerHTML="";return;}
  host.innerHTML="<button class='list-more' type='button'>Show all "+n+" games</button>";
  var b=host.querySelector("button");
  if(b) b.addEventListener("click",function(){
    BOARD_ALL=true;
    document.documentElement.classList.remove("board-cap");
    host.innerHTML="";
  });
}

/* ---- Yesterday, in one sentence ----
   The first question a newcomer has is whether any of this works, and the
   honest answer is a number we already compute. It used to be a chip in the
   trust row that nobody reads. Graded from the results feed rather than
   recordYest, which is a one-day backtest and is often null. */
/* HOW MANY OF YESTERDAY'S TIPS ARE STILL OUT, and how many there were.
   Three sources, best first, because each knows something the next does not:

   1. This reader's own sticky copy of yesterday's board. Exact, and the count
      of what they were actually shown - but only a returning reader has it.
   2. publishedByDate, from the build. The same figure for everybody, carried
      forward across days because the board holds today and onward and a day's
      fixtures vanish the moment it rolls over.
   3. pendingByDate - rows the record holds and cannot confirm. Narrower than it
      sounds: a tip is only filed while its fixture is still on the board, so a
      late game with no build before midnight is never written down at all and
      never appears here.

   Why this matters: on 2 Sep the board carried 40 fixtures and 31 were graded,
   pendingByDate was empty, and a first-time reader was shown "18 of 31 tips
   landed, 58%" with nothing saying nine were still out. Reported as: how we did
   yesterday is damning when all fixtures have not been graded. A partial day
   presented as a finished one is the same mistake the board made when it called
   a match a hit before the backend had graded it.

   Never negative, and never claims MORE are pending than were published. */
function yestCounts(graded){
  var day=isoOffset(-1), predicted=0;
  try{
    var raw=localStorage.getItem(STICKY_PFX+day);
    if(raw){ var arr=JSON.parse(raw); if(Array.isArray(arr)) predicted=arr.length; }
  }catch(e){}
  if(predicted<=graded){
    try{
      var pub=+((DATA.publishedByDate||{})[day])||0;
      if(pub>predicted) predicted=pub;
    }catch(e){}
  }
  if(predicted<=graded){
    try{
      var held=+((DATA.pendingByDate||{})[day])||0;
      if(held>0) predicted=graded+held;
    }catch(e){}
  }
  var pending=predicted>graded?predicted-graded:0;
  return {predicted:pending?predicted:graded, pending:pending};
}
function renderDaily(){
  var host=$("daily"); if(!host) return;
  var res=(DATA.results||[]).filter(function(r){return dayOff(r.date)===-1;});
  var rec=DATA.record;
  if(!res.length&&(!rec||!rec.total)){host.innerHTML="";return;}

  var hit=res.filter(function(r){return r.hit;}).length;
  var pct=res.length?Math.round(100*hit/res.length):0;
  /* How many we actually published that day, which is not the same as how
     many have been graded. Results arrive over two or three days, so the
     morning after a full card we typically hold four or five of them - and
     "1 of 4 tips landed" then reads as though we had made four tips, on a day
     we made thirty-eight. Understating our own card is a worse error than
     saying nothing.
     The day's fixtures are kept under sw.day.<date> so the board can survive
     the feed dropping them, which gives the real figure - to anyone who had
     the page open that day. A first-time reader had no such record, so the
     line was dropped and the card read "6 of 6 tips landed, 100%" on a
     morning when six of thirty games had been graded. That is our own card
     understated to a tenth of its size, and it reads as a boast.
     The build now publishes how many it is holding for want of a confirmed
     score, so the same sentence is available to everybody; the stored board
     is still preferred where it exists, being the count of what we actually
     showed rather than of what is queued. */
  var _yc=yestCounts(res.length), predicted=_yc.predicted, pending=_yc.pending;
  var head="<div class='daily-h'><b>How we did yesterday</b>"+
    (res.length?"<span class='dl-when'>"+esc(dayDate(-1))+"</span>":"")+"</div>";

  var body;
  if(res.length){
    body="<div class='daily-score'><span class='dl-big num'>"+hit+"</span>"+
      /* "28 of 35 graded so far" was read - correctly, by the wording - as
         "28 of the 35 have been graded", implying seven still pending. The
         28 is the number that LANDED; 35 is how many have been graded. The
         label described the wrong quantity, so the card looked broken on a
         day when every result was in. Reported as "this says 28 of 35
         graded. but all 36 are graded".
         "tips landed" is what the record line below this already says, and
         the percentage pill beside it agrees. Whether more results are still
         to come is a separate sentence, and it already has one. */
      "<span class='dl-of'>of "+res.length+" tips landed</span>"+
      "<span class='dl-pill "+(pct>=50?"good":"bad")+"'>"+pct+"%</span></div>"+
      "<div class='daily-bar'><i style='width:"+pct+"%'></i></div>"+
      (pending?"<div class='daily-pending'>"+pending+" of yesterday's "+predicted+
        " games are still being graded - results arrive over the next day or two.</div>":"");
  } else {
    /* "Nothing finished yesterday" claimed to know something we do not. An
       empty results list means we have no grades for that day - which happens
       both when no games were on and when they were played and simply have not
       been graded yet, since grading runs with the build. Say what is actually
       true: the results are not in. */
    body="<div class='daily-empty'>Yesterday's results aren't in yet - "+
      "they arrive once the day's games are graded.</div>";
  }

  var foot="";
  if(rec&&rec.total){
    foot="<div class='daily-foot'>Over the last "+(rec.days||0)+" days, <b>"+
      rec.correct+" of "+rec.total+"</b> tips landed ("+
      Math.round(100*rec.correct/rec.total)+"%). Every tip is checked against "+
      "the final score.</div>";
  }
  /* Every graded day is already reachable through the day stepper, thirteen
     of them, and nothing on the page said so. The claim above is the site's
     strongest one, so the evidence for it should be one tap away rather than
     something you find by pressing an arrow enough times. */
  var back=(DATA.results||[]).length
    ? "<button class='daily-back' id='dailyBack' type='button'>See past results</button>" : "";
  host.innerHTML="<div class='daily'>"+head+body+foot+back+"</div>";
  var db=$("dailyBack");
  if(db) db.addEventListener("click",function(){
    /* The most recent day that actually has grades, not simply yesterday -
       which is frequently still empty while the build catches up. */
    var days=activeDays().filter(function(o){return o<0;});
    var target=days.length?Math.max.apply(null,days):-1;
    /* Same state the day arrows set, so the board treats this exactly as if
       the day had been stepped to by hand. */
    V.off=target; V.dayPicked=true; V.country=""; V.league="";
    render();
    var b=$("boardHead"); if(b) b.scrollIntoView({behavior:"smooth",block:"start"});
  });
}
/* The hero's own proof line. Same numbers as the recap card below it, read
   from the same place - the offer has to be believable at the moment it is
   made, not a scroll later. */
function renderProof(){
  var el=$("scProof"); if(!el) return;
  var rec=DATA.record;
  if(!rec||!rec.total){el.hidden=true;el.innerHTML="";return;}
  var pct=Math.round(100*rec.correct/rec.total);
  el.hidden=false;
  el.innerHTML="<span><b>"+pct+"% of our tips landed</b> over the last "+
    (rec.days||0)+" days · every one checked against the final score</span>";
}

/* ---- Accuracy record (renders only with real data) ---- */
/* Hit rate over the last N days, graded from the results feed. A short window
   is a small sample and swings hard; showing it beside the long one is what
   keeps a cold week readable as a cold week rather than as the whole story. */
function windowRecord(days){
  var res=(DATA.results||[]).filter(function(r){
    var o=dayOff(r.date); return o<0 && o>=-days;
  });
  if(!res.length) return null;
  var hit=res.filter(function(r){return r.hit;}).length;
  return {correct:hit,total:res.length,pct:Math.round(100*hit/res.length),days:days};
}
/* The headline percentage is a blend, and a blend moves with its mix rather
   than with the model: folding Over 1.5 into the graded set lifted the overall
   figure several points on its own, because Over 1.5 lands more often than a
   double chance does. Shown per market that is visible instead of flattering,
   and it answers the question a reader actually has - not "how good are you"
   but "how good are you at the kind of call I am about to follow".
   Thin samples are shown with their count rather than hidden: a market we have
   called four times says so, and 4/4 reads as the small number it is. */
function marketBreakdownHTML(rec){
  var rows=(rec&&rec.byMarket)||[];
  if(rows.length<2) return "";
  var vis=rows.filter(function(m){return m.total>=3;}).slice(0,6);
  if(vis.length<2) return "";
  return "<div class='rec-mk'>"+
    "<div class='rec-mk-h'>By market</div>"+
    vis.map(function(m){
      var p=Math.round(100*m.correct/m.total);
      var thin=m.total<10;
      return "<div class='rec-mk-row"+(thin?" thin":"")+"'>"+
        "<span class='mk-n'>"+esc(m.market)+"</span>"+
        "<span class='mk-bar'><i style='width:"+p+"%'></i></span>"+
        "<span class='mk-p'>"+p+"%</span>"+
        "<span class='mk-c'>"+m.correct+"/"+m.total+"</span></div>";
    }).join("")+
  "</div>";
}
function renderRecord(){
  var host=$("record"); if(!host) return;
  var rec=DATA.record;
  if(!rec||!rec.total){host.innerHTML="";return;}
  var pct=Math.round(100*rec.correct/rec.total);
  /* This is the one claim no rival tips site makes: a graded, calibrated
     history. It gets a real panel - both windows, how well the stated
     confidence matched reality, and yesterday - because it is the reason to
     trust every other number on the page.
     Nothing here is hidden on a bad run. A record that only appears when it
     flatters is what every tipster site already does, and it would make the
     heading above it a lie. The short window is shown instead, so a poor week
     reads as a poor week next to the longer record it sits inside. */
  var b=rec.brier;
  var cal=(b==null)?null:(b<=0.18?"Excellent":b<=0.21?"Good":b<=0.24?"Fair":"Rough");
  var yest=DATA.recordYest;
  var wk=windowRecord(7);
  var cold=wk&&wk.pct<pct-5;
  host.innerHTML=
    "<div class='rec-panel'>"+
      "<div class='rec-head'><b>Our record, graded honestly</b>"+
        "<span>every tip checked against the result</span></div>"+
      "<div class='rec-grid'>"+
        (wk?"<div class='rec-cell'><b class='pc"+(cold?" cool":"")+"'>"+wk.pct+"%</b>"+
          "<i>last 7 days \u00b7 "+wk.correct+"/"+wk.total+"</i></div>":"")+
        "<div class='rec-cell'><b class='pc'>"+pct+"%</b><i>last "+
          (rec.days||21)+" days \u00b7 "+rec.correct+"/"+rec.total+"</i></div>"+
        (cal?"<div class='rec-cell'><b>"+cal+"</b><i>calibration</i></div>":"")+
        (yest&&yest.total?"<div class='rec-cell'><b>"+yest.correct+"/"+yest.total+
          "</b><i>yesterday</i></div>":"")+
      "</div>"+
      "<div class='rec-bar'><i style='width:"+pct+"%'></i></div>"+
      marketBreakdownHTML(rec)+
      "<div class='rec-foot'>"+
        (cold?"A short week swings hard - seven days is a small sample, and the "+
              (rec.days||21)+"-day figure is the honest one. ":"")+
        (cal?"When we say 70%, it lands near 70% - ":"")+
        "measured on games the model had not seen.</div>"+
    "</div>";
}
/* ---- Notifications opt-in ----
   What this can honestly do is tell you the moment your slip finishes, while
   the site is open in a tab. It cannot wake a closed phone: that needs a push
   service and a server holding subscriptions, neither of which exists here.
   The old copy promised a daily nudge that nothing ever sent, which is worse
   than offering nothing - so it now describes the thing it actually does. */
function renderNotif(host){
  if(!("Notification" in window)) return "";
  return "<div class='notif'><span>Get told the moment your slip settles.</span>"+
    "<button id='notifBtn' type='button'></button></div>";
}
/* Fires once per slip. The flag rides in the slip itself, so a reload cannot
   announce the same result twice. */
function notifySettled(list){
  if(!list||!list.length) return;
  if(!("Notification" in window)||Notification.permission!=="granted") return;
  var changed=false;
  list.forEach(function(s){
    if(s.told) return;
    s.told=true; changed=true;
    var body=s.won
      ? "All "+s.legs.length+" landed. That paid ×"+s.odds.toFixed(2)+"."
      : s.hits+" of "+s.legs.length+" landed this time.";
    try{ new Notification(s.won?"Your slip won":"Your slip is settled",
      {body:body, tag:"slip-"+s.sid, icon:"/icon-192-maskable.png"}); }catch(e){}
  });
  if(changed) saveSlips();
}
function wireNotif(){
  var b=$("notifBtn"); if(!b) return;
  function paintBtn(){
    var on=(window.Notification&&Notification.permission==="granted");
    b.textContent=on?"Reminders on":"Turn on reminders";
    b.classList.toggle("on",on);
  }
  paintBtn();
  b.addEventListener("click",function(){
    if(!("Notification" in window)) return;
    Notification.requestPermission().then(function(p){
      paintBtn();
      if(p==="granted"){try{new Notification("SoccerWizard",
        {body:"Done. We'll tell you as soon as one of your slips finishes.",
         icon:"/icon-192-maskable.png"});}catch(e){}}
    });
  });
}
/* ============================================================ live scores */
/* Same-origin so Vercel's CDN absorbs the polling - see lib/upstream.js. */
const LIVE_URL="/api/live";
var LIVE={matches:[],at:0,timer:null,loading:false,prev:{},flash:{},filter:"",store:{},lit:{},favOnly:false};
/* Followed matches: ids kept in localStorage so the star survives a refresh.
   These are also the only games worth a notification - following a match is
   the user saying "tell me about this one". */
var LIVEFAV={};
try{LIVEFAV=JSON.parse(localStorage.getItem("sw.livefav")||"{}");}catch(e){LIVEFAV={};}
function saveLiveFav(){try{localStorage.setItem("sw.livefav",JSON.stringify(LIVEFAV));}catch(e){}}
function isLiveFav(id){return !!LIVEFAV[id];}
function toggleLiveFav(id){
  if(LIVEFAV[id]) delete LIVEFAV[id]; else LIVEFAV[id]=1;
  saveLiveFav();
  if(LIVEFAV[id]&&window.Notification&&Notification.permission==="default"){
    try{Notification.requestPermission();}catch(e){}
  }
  window.swToast&&window.swToast(LIVEFAV[id]?"Following - you'll be alerted on goals":"Stopped following","ok","lvfav");
  renderLive();
}
var COUNTRY_ISO={argentina:"ar",australia:"au",austria:"at",azerbaijan:"az",belgium:"be",
  bolivia:"bo",brazil:"br",bulgaria:"bg",canada:"ca",chile:"cl",china:"cn",colombia:"co",
  "costa rica":"cr",croatia:"hr",cyprus:"cy","czech republic":"cz",czechia:"cz",denmark:"dk",
  ecuador:"ec",egypt:"eg","el salvador":"sv",england:"gb-eng",estonia:"ee",finland:"fi",
  france:"fr",georgia:"ge",germany:"de",greece:"gr",guatemala:"gt",honduras:"hn",hungary:"hu",
  iceland:"is",india:"in",indonesia:"id",iran:"ir",ireland:"ie",israel:"il",italy:"it",
  japan:"jp",kazakhstan:"kz","korea republic":"kr","south korea":"kr",kuwait:"kw",latvia:"lv",
  lithuania:"lt",luxembourg:"lu",malaysia:"my",mexico:"mx",morocco:"ma",netherlands:"nl",
  "new zealand":"nz",nigeria:"ng","northern ireland":"gb-nir",norway:"no",panama:"pa",
  paraguay:"py",peru:"pe",poland:"pl",portugal:"pt",qatar:"qa",romania:"ro",russia:"ru",
  "saudi arabia":"sa",scotland:"gb-sct",serbia:"rs",singapore:"sg",slovakia:"sk",slovenia:"si",
  "south africa":"za",spain:"es",sweden:"se",switzerland:"ch",thailand:"th",tunisia:"tn",
  turkey:"tr","turkiye":"tr",ukraine:"ua","united states":"us",usa:"us",uruguay:"uy",
  venezuela:"ve",vietnam:"vn",wales:"gb-wls"};
var COUNTRY_NAMES=Object.keys(COUNTRY_ISO).sort(function(a,b){return b.length-a.length;});
function liveCountry(l){
  var s=(l||"").toLowerCase();
  for(var i=0;i<COUNTRY_NAMES.length;i++){
    var n=COUNTRY_NAMES[i];
    if(s===n||s.indexOf(n+" ")===0) return (l||"").slice(0,n.length);
  }
  return (l||"").split(" ")[0];
}
function liveComp(l){var c=liveCountry(l);return (l||"").slice(c.length).trim()||l;}
function liveFlag(c){
  var code=COUNTRY_ISO[(c||"").toLowerCase()];
  if(!code) return intlGlobe(c);
  return "<img class='flag' src='https://flagcdn.com/w40/"+code+".png' "+
    "srcset='https://flagcdn.com/w80/"+code+".png 2x' alt='' aria-hidden='true' loading='lazy'>";
}
function esc2(s){return esc(s==null?"":s);}
/* Grade a tip against a score. This is lib/grade.js, inlined - the page is one
   standalone file and cannot require it - and test/grade.test.js holds the two
   to the same answers.
   What it replaced ended on "return res(tot>=2)", a guess for every label it
   did not recognise: "Over 2.5" landed on a 1-1, and "Under 2.5" was inverted
   outright, a goalless draw reading as a miss. Harmless while it only coloured
   a badge; not harmless once the full-time ledger began writing the verdict
   down as a result. Nothing is guessed here - an unknown label, or a first-half
   market with no half-time score, comes back "unknown" and callers must treat
   that as ungraded rather than as a miss. */
function tipEval(f){
  var t=(f&&f.tip!=null)?String(f.tip).trim():"";
  return function(h,a){
    if(typeof h!=="number"||typeof a!=="number"||isNaN(h)||isNaN(a)) return "unknown";
    var diff=h-a, tot=h+a, both=h>0&&a>0, m;
    function res(v){return v==null?"unknown":(v?"win":"lose");}
    if(t==="Home win") return res(diff>0);
    if(t==="Away win") return res(diff<0);
    if(t==="Draw") return res(diff===0);
    if(t==="Both teams score") return res(both);
    /* No half-time score in the live feed, so this cannot be settled. */
    if(/^First half goal/i.test(t)) return "unknown";
    if(t.indexOf("1X")===0) return res(diff>=0);
    if(t.indexOf("X2")===0) return res(diff<=0);
    if(t.indexOf("12")===0) return res(diff!==0);
    m=/^Draw or over\s*([\d.]+)/i.exec(t);
    if(m) return res(diff===0||tot>parseFloat(m[1]));
    if(/^Draw or both/i.test(t)) return res(diff===0||both);
    m=/^Both score and over\s*([\d.]+)/i.exec(t);
    if(m) return res(both&&tot>parseFloat(m[1]));
    m=/^Over\s*([\d.]+)/i.exec(t);
    if(m) return res(tot>parseFloat(m[1]));
    m=/^Under\s*([\d.]+)/i.exec(t);
    if(m) return res(tot<parseFloat(m[1]));
    return "unknown";
  };
}
function matchPrediction(lm){
  var best=null,bs=0;
  DATA.fixtures.forEach(function(f){
    var o=dayOff(f.date); if(o< -1||o>1) return;
    /* Same per-side floor and tag check as liveMatchFor - a combined score
       alone let a women's side carry a match against the men's fixture. */
    if(teamTag(lm.home)!==teamTag(f.home)||teamTag(lm.away)!==teamTag(f.away)) return;
    var sh=simTeams(f.home,lm.home), sa=simTeams(f.away,lm.away);
    if(sh<0.6||sa<0.6) return;
    var s=sh+sa; if(s>bs){bs=s;best=f;}
  });
  return bs>=1.3?best:null;
}
async function fetchLive(){
  if(LIVE.loading) return;
  LIVE.loading=true;
  var rb=$("liveRefresh"); if(rb) rb.classList.add("spin");
  try{
    var r=await fetch(LIVE_URL,{headers:{Accept:"application/json"}});
    var d=await r.json();
    if(d&&d.matches){
      /* SRL / eSoccer are simulated games, not real matches - drop them. */
      d.matches=d.matches.filter(function(m){
        var s=((m.league||"")+" "+(m.home||"")+" "+(m.away||"")).toLowerCase();
        return !/\bsrl\b|esoccer|e-?football|cyber|simulat|virtual|\b8 ?mins?\b|\b10 ?mins?\b|\b12 ?mins?\b/.test(s);
      });
      var flash={};
      d.matches.forEach(function(m){
        var id=m.eventId||(m.home+m.away);
        var p=LIVE.prev[id];
        var h=m.homeScore||0, a=m.awayScore||0;
        if(p){
          if(h>p.h||a>p.a) flash[id]={h:h>p.h,a:a>p.a};
        }
        LIVE.prev[id]={h:h,a:a};
      });
      LIVE.flash=flash;
      var _n=Date.now();Object.keys(flash).forEach(function(id){LIVE.lit[id]={h:flash[id].h,a:flash[id].a,until:_n+60000};});
      var now=Date.now(), cur={};
      d.matches.forEach(function(m){var id=m.eventId||(m.home+m.away);cur[id]=1;LIVE.store[id]={m:m,ts:now};});
      var arr=[];
      Object.keys(LIVE.store).forEach(function(id){
        var e=LIVE.store[id];
        if(cur[id]){arr.push(e.m);}
        else if(now-e.ts<600000){var mm={};for(var k in e.m)mm[k]=e.m[k];mm.status="FT";arr.push(mm);}
        else{delete LIVE.store[id];}
      });
      LIVE.matches=arr;
    }
    LIVE.at=Date.now();
  }catch(e){}
  LIVE.loading=false;
  if(rb) rb.classList.remove("spin");
  /* Before anything repaints: a game that has just finished is written into the
     ledger now, while the feed still has it. Ten minutes later it is gone. */
  try{ recordFinishedFixtures(); }catch(e){}
  /* Note which of our fixtures are in the feed right now. When one drops out
     of a later poll, that absence is what tells us it has finished. */
  try{ noteLiveSeen(); }catch(e){}
  syncLiveDots();
  renderLiveStrip();
  /* Scores just moved, so anything derived from them is stale. */
  formIndexInvalidate();
  /* Form strips carry today's in-play result, so they move with the feed. */
  try{refreshFormStrips();}catch(e){}
  /* Same for the per-fixture live / full-time badges on the day's board. */
  try{refreshFixtureStates();}catch(e){}
  /* Keep the locked Pick of the Day mirroring the live score / full-time result
     as fresh scores arrive (only meaningful on the predictions/home view). */
  if(typeof renderPotd==="function" && !document.documentElement.classList.contains("mode-live")
     && !document.documentElement.classList.contains("mode-build")) { try{renderPotd();}catch(e){} }
  if(document.documentElement.classList.contains("mode-live")) renderLive();
}
/* ------------------------------------------------------- full-time ledger
   The results feed is the slowest thing here. football-data publishes in
   batches, so the newest day it covers runs a few days behind - which is why
   walking back through the days runs out at Tuesday - and lib/build.js only
   grades a match whose league the model was fitted on, so a cup tie never gets
   a result at all. Meanwhile the live feed has been putting the final score on
   the prediction page all day and then throwing it away.
   So write it down. When a game we predicted reaches full time, grade our own
   tip against the score that was on screen and keep it. This is merged
   underneath the server's results and never over them: a graded result from
   the build always wins, and this only fills the days and the cup ties it
   cannot reach. */
/* v2: v1 was written by the grader that guessed at any label it did not know,
   so a stored "Over 2.5" or "Under 2.5" row from it may be graded the wrong
   way. There is no telling which rows are affected without regrading, and this
   record is meant to be the trustworthy one - so v1 is dropped rather than
   carried forward. A few days of history is a cheap price for not publishing a
   number built on guesses. */
/* v3: every score v2 holds was read from a live feed that was publishing the
   FIRST HALF as the current score. The upstream scraper took gameScore[0] -
   the opening period - instead of setScore, the running total, so any match
   that scored after the break was recorded at its half-time score and graded
   on it. Bayern Munich went into the ledger as 1-0, and our Over 1.5 tip on it
   as a loss; the match finished 5-1.
   45 of the 71 live games on the board were wrong the moment it was found, so
   there is no picking out the bad rows - a 1-0 that was really 1-0 and a 1-0
   that was really 5-1 look identical here. The whole ledger goes. */
var FT_KEY="sw.ft.v3", FT_KEEP_DAYS=21;
var FTLOG=[];
try{FTLOG=JSON.parse(localStorage.getItem(FT_KEY)||"[]");}catch(e){FTLOG=[];}
if(!Array.isArray(FTLOG)) FTLOG=[];
try{localStorage.removeItem("sw.ft.v1");localStorage.removeItem("sw.ft.v2");}catch(e){}
function ftKey(date,home,away){return date+"|"+normTeam(home)+"|"+normTeam(away);}
function saveFTLog(){
  try{
    /* Same window the record is measured over - past that nothing reads it. */
    FTLOG=FTLOG.filter(function(r){return r&&r.date&&dayOff(r.date)>=-FT_KEEP_DAYS;});
    localStorage.setItem(FT_KEY,JSON.stringify(FTLOG));
  }catch(e){}
}
/* Fill the gaps in DATA.results with what we wrote down, leaving the server's
   own grading exactly as it is. */
function mergeFTLog(){
  var added=0;
  try{
    if(!Array.isArray(DATA.results)) DATA.results=[];
    var have={};
    DATA.results.forEach(function(x){have[ftKey(x.date,x.home,x.away)]=1;});
    FTLOG.forEach(function(r){
      var k=ftKey(r.date,r.home,r.away);
      if(have[k]) return;
      DATA.results.push(r); have[k]=1; added++;
    });
    if(added) DATA.results.sort(function(a,b){return a.date<b.date?1:-1;});
  }catch(e){}
  return added;
}
/* One pass over the board: anything the feed now calls finished is graded and
   written down. Idempotent - already logged or already graded by the server is
   skipped - so it is safe on every poll.
   The time guard matters: a match that simply drops out of the feed is held for
   ten minutes with status forced to "FT" (see fetchLive), which is a guess, not
   a result. Requiring a full match length since kickoff keeps a mid-game feed
   hiccup from being written down as a final score. */
function recordFinishedFixtures(){
  var added=0;
  try{
    var seen={}; FTLOG.forEach(function(r){seen[ftKey(r.date,r.home,r.away)]=1;});
    var served={}; (DATA.results||[]).forEach(function(x){served[ftKey(x.date,x.home,x.away)]=1;});
    (DATA.fixtures||[]).forEach(function(f){
      if(!f||!f.tip||!f.date||!f.home||!f.away) return;
      var k=ftKey(f.date,f.home,f.away);
      if(seen[k]||served[k]) return;
      var t=kickMs(f);
      if(t==null||Date.now()-t<MATCH_LEN_MS) return;
      /* Two ways a match reaches full time here, and the feed only ever
         admits to one of them.
         If it says FT, believe it. It almost never does: this feed drops a
         match the moment it ends rather than marking it finished, which is
         why this ledger stayed empty for weeks while games were being played
         in front of it.
         So the other way is absence. A fixture we watched, last seen deep
         enough into the second half, that is no longer in the feed has
         finished, and the last score we saw is the one it finished on. The
         80th-minute bar is what keeps a feed hiccup at 55 minutes from being
         written down as a result - a missing result is recoverable, a wrong
         one is not. */
      var lm=liveForFixture(f), hg=null, ag=null;
      if(lm&&lm.homeScore!=null&&lm.awayScore!=null&&statusText(lm).ft){
        hg=lm.homeScore; ag=lm.awayScore;
      }else if(!lm){
        var last=LIVE_LAST[fid(f)];
        if(!last||last.minute<LATE_MINUTE) return;
        hg=last.hg; ag=last.ag;
      }
      if(hg==null||ag==null) return;
      var v=tipEval(f)(hg,ag);
      /* Only write down what we can actually settle. A tip we cannot grade
         from a final score has no business being stored as a miss. */
      if(v==="unknown") return;
      FTLOG.push({date:f.date,league:f.league||"",home:f.home,away:f.away,
        hg:hg,ag:ag,tip:f.tip,hit:v==="win",
        tip_p:(f.tip_p!=null?f.tip_p:null),ours:1,at:Date.now()});
      seen[k]=1; added++;
    });
    if(added){
      saveFTLog(); mergeFTLog();
      try{console.log("[ft] recorded "+added+" full-time result(s) from the live feed");}catch(e){}
    }
  }catch(e){}
  return added;
}
function statusText(m){
  if(m.status==="FT"||m.status==="AET"||m.status==="PEN") return {t:"FT",ft:true};
  if(m.status==="HT") return {t:"HT",ft:false};
  return {t:(m.minute!=null?m.minute+"\u2019":"Live"),ft:false};
}
function scorersHTML(m){
  var hs=(m.homeGoals||[]).map(function(g){return "<div class='sr h'><span>\u26bd "+esc2(g.player)+"</span><span class='mn'>"+esc2(g.minute)+"\u2019</span></div>";});
  var as=(m.awayGoals||[]).map(function(g){return "<div class='sr a'><span class='mn'>"+esc2(g.minute)+"\u2019</span><span>\u26bd "+esc2(g.player)+"</span></div>";});
  if(!hs.length&&!as.length) return "";
  return "<div class='lv-scorers'>"+hs.join("")+as.join("")+"</div>";
}
function reds(n){var s="";for(var i=0;i<(n||0);i++)s+="<span class='lv-red'></span>";return s;}
function oddsHTML(m){
  if(!m.odds) return "";
  var o=m.odds;
  function b(k,v){return v?"<span>"+k+" "+(+v).toFixed(2)+"</span>":"";}
  var h=b("1",o.home)+b("X",o.draw)+b("2",o.away);
  return h?"<div class='lv-odds'>"+h+"</div>":"";
}
function tipHTML(m){
  var f=matchPrediction(m);
  if(!f) return oddsHTML(m)?"<div class='lv-tip'>"+oddsHTML(m)+"</div>":"";
  var st=tipEval(f)(m.homeScore||0,m.awayScore||0);
  var badge=st==="win"?"<span class='lv-badge win'>Tip winning</span>":
            st==="lose"?"<span class='lv-badge lose'>Tip behind</span>":
            "<span class='lv-badge level'>Level</span>";
  return "<div class='lv-tip'><span class='lbl'>Our tip:</span> "+esc(plainTip(f))+" "+badge+oddsHTML(m)+"</div>";
}
function liveCardHTML(m){
  var st=statusText(m);
  var id=m.eventId||(m.home+m.away);
  var hl=(m.homeScore!=null&&m.awayScore!=null&&m.homeScore>m.awayScore);
  var al=(m.homeScore!=null&&m.awayScore!=null&&m.awayScore>m.homeScore);
  return "<div class='lv"+(st.ft?" ft-row":"")+"' data-ev=\""+esc(id)+"\">"+
    "<div class='lv-top'><span class='lv-lg'>"+esc2(liveComp(m.league))+"</span>"+
      "<span class='lv-status"+(st.ft?" ft":"")+"'>"+(st.ft?"":"<span class='live-dot'></span>")+st.t+"</span>"+
      "<button class='lv-star"+(isLiveFav(id)?" on":"")+"' type='button' data-lvfav=\""+esc(id)+"\" "+
        "aria-label='Follow this match'>"+(isLiveFav(id)?"\u2605":"\u2606")+"</button></div>"+
    "<div class='lv-teams'>"+
      "<div class='lv-tm"+(hl?" lead":"")+"'>"+esc2(m.home)+reds(m.homeReds)+"</div>"+
      "<div class='lv-sc"+(hl?" lead":"")+"' data-side='h'>"+(m.homeScore!=null?m.homeScore:"-")+"</div>"+
      "<div class='lv-tm"+(al?" lead":"")+"'>"+esc2(m.away)+reds(m.awayReds)+"</div>"+
      "<div class='lv-sc"+(al?" lead":"")+"' data-side='a'>"+(m.awayScore!=null?m.awayScore:"-")+"</div>"+
    "</div>"+
    scorersHTML(m)+tipHTML(m)+
  "</div>";
}
function renderLiveSegments(live){
  var byC={};
  live.forEach(function(m){var c=liveCountry(m.league||"");if(!c)return;byC[c]=(byC[c]||0)+1;});
  var countries=Object.keys(byC).sort();
  if(LIVE.filter&&countries.indexOf(LIVE.filter)<0) LIVE.filter="";
  var wrap=$("liveSelWrap"),sel=$("liveCountrySel"); if(!wrap||!sel) return;
  if(countries.length<2){wrap.hidden=true;return;}
  wrap.hidden=false;
  sel.innerHTML="<option value=''>All countries ("+live.length+")</option>"+
    countries.map(function(c){return "<option value=\""+esc(c)+"\""+(LIVE.filter===c?" selected":"")+
      ">"+esc(c)+" ("+byC[c]+")</option>";}).join("");
  if(!sel._w){sel._w=1;sel.addEventListener("change",function(){LIVE.filter=sel.value;renderLive();});}
}
function applyGoalFX(host){
  Object.keys(LIVE.flash).forEach(function(id){
    var card=host.querySelector('.lv[data-ev="'+(window.CSS&&CSS.escape?CSS.escape(id):id.replace(/([:.])/g,"\\$1"))+'"]');
    if(!card) return;
    card.classList.add("just-scored");
    var f=LIVE.flash[id];
    if(f.h){var e=card.querySelector('.lv-sc[data-side="h"]'); if(e){e.classList.add("pop","scored");e.insertAdjacentHTML("afterbegin","<span class='goal-tag'>GOAL</span>");}}
    if(f.a){var e2=card.querySelector('.lv-sc[data-side="a"]'); if(e2){e2.classList.add("pop","scored");e2.insertAdjacentHTML("afterbegin","<span class='goal-tag'>GOAL</span>");}}
  });
  LIVE.flash={};
  var now3=Date.now();
  Object.keys(LIVE.lit).forEach(function(id){
    var L=LIVE.lit[id];if(L.until<now3){delete LIVE.lit[id];return;}
    var card=host.querySelector('.lv[data-ev="'+(window.CSS&&CSS.escape?CSS.escape(id):id.replace(/([:.])/g,"\\$1"))+'"]');
    if(!card)return;card.classList.add("just-scored");
    if(L.h){var eh=card.querySelector('.lv-sc[data-side="h"]');if(eh)eh.classList.add("lit");}
    if(L.a){var ea=card.querySelector('.lv-sc[data-side="a"]');if(ea)ea.classList.add("lit");}
  });
}
function renderLive(){
  var host=$("liveList"); if(!host) return;
  if(!LIVE.matches.length){
    if($("liveSelWrap")){$("liveSelWrap").hidden=true;}
    host.innerHTML="<div class='live-empty'><b>No live matches right now</b>"+
      "Check back when games are in play - this updates automatically.</div>";
    $("liveSub").textContent="Football matches in play right now, updating automatically.";
    return;
  }
  renderLiveSegments(LIVE.matches);
  var favN=LIVE.matches.filter(function(m){return isLiveFav(m.eventId||(m.home+m.away));}).length;
  var shown=LIVE.matches.filter(function(m){
    if(LIVE.favOnly && !isLiveFav(m.eventId||(m.home+m.away))) return false;
    return !LIVE.filter||liveCountry(m.league||"")===LIVE.filter;});
  $("liveSub").textContent=LIVE.matches.length+" match"+(LIVE.matches.length===1?"":"es")+" in play \u00b7 updates every 30s";
  var tabs="<div class='lv-tabs'>"+
    "<button class='lv-tab"+(LIVE.favOnly?"":" on")+"' data-lvt='all' type='button'>All live</button>"+
    "<button class='lv-tab"+(LIVE.favOnly?" on":"")+"' data-lvt='fav' type='button'>\u2605 Following"+
      (favN?" <i>"+favN+"</i>":"")+"</button></div>";
  if(LIVE.favOnly && !shown.length){
    host.innerHTML=tabs+"<div class='live-empty'><b>No followed matches in play</b>"+
      "Tap the star on any live game to follow it and get alerted when it scores.</div>";
    wireLiveTabs(host); return;
  }
  var byCn={};
  shown.forEach(function(m){var c=liveCountry(m.league||"");(byCn[c]=byCn[c]||[]).push(m);});
  var TOPC=["England","Spain","Italy","Germany","France","Netherlands","Portugal","Brazil","Argentina"];
  var countries=Object.keys(byCn).sort(function(a,b){
    var ia=TOPC.indexOf(a),ib=TOPC.indexOf(b);
    if(ia<0)ia=99; if(ib<0)ib=99;
    return ia!==ib ? ia-ib : a.localeCompare(b);});
  host.innerHTML=tabs+countries.map(function(c){
    LIVE.lvLeague=LIVE.lvLeague||{};
    var all=byCn[c].slice().sort(function(a,b){
      var fa=statusText(a).ft?1:0,fb=statusText(b).ft?1:0;
      if(fa!==fb) return fa-fb;
      return (a.league||"").localeCompare(b.league||"");
    });
    var leagues=[]; all.forEach(function(m){if(leagues.indexOf(m.league)<0)leagues.push(m.league);});
    var sel=LIVE.lvLeague[c]||"";
    var list=sel?all.filter(function(m){return m.league===sel;}):all;
    var chips = leagues.length>1 ? "<div class='lv-lgs'>"+
      "<button class='lv-lg-chip"+(!sel?" on":"")+"' data-lvc=\""+esc2(c)+"\" data-lvl=''>All</button>"+
      leagues.map(function(l){return "<button class='lv-lg-chip"+(sel===l?" on":"")+"' data-lvc=\""+esc2(c)+"\" data-lvl=\""+esc2(l)+"\">"+esc2(liveComp(l))+"</button>";}).join("")+"</div>" : "";
    return "<div class='lv-grp'><div class='lv-grp-h'>"+liveFlag(c)+
      "<span>"+esc2(c)+"</span><span class='gc'>"+byCn[c].length+"</span></div>"+chips+
      list.map(liveCardHTML).join("")+"</div>";
  }).join("");
  wireLiveTabs(host);
  applyGoalFX(host);
}
function wireLiveTabs(host){
  host.querySelectorAll("[data-lvc]").forEach(function(b){
    b.addEventListener("click",function(){LIVE.lvLeague=LIVE.lvLeague||{};
      LIVE.lvLeague[b.getAttribute("data-lvc")]=b.getAttribute("data-lvl")||"";renderLive();});});
  host.querySelectorAll("[data-lvt]").forEach(function(b){
    b.addEventListener("click",function(){LIVE.favOnly=(b.dataset.lvt==="fav");renderLive();});});
  host.querySelectorAll("[data-lvfav]").forEach(function(b){
    b.addEventListener("click",function(e){e.stopPropagation();toggleLiveFav(b.getAttribute("data-lvfav"));});});
}
function tickerEvents(){
  var evs=[], now=Date.now();
  LIVE.matches.forEach(function(m){
    var id=m.eventId||(m.home+m.away), st=statusText(m);
    var sc=(m.homeScore!=null?m.homeScore:"-")+"-"+(m.awayScore!=null?m.awayScore:"-");
    var L=LIVE.lit[id];
    var hs=m.homeScore,as=m.awayScore;
    var lead=(hs!=null&&as!=null)?(hs>as?"h":(as>hs?"a":"")):"";
    if(L&&L.until>now){ evs.push({kind:"goal",fresh:(L.until-now)>27000,
      home:m.home,away:m.away,sc:sc,min:st.t,lead:lead,gh:L.h,ga:L.a}); }
    else if((m.homeReds||0)+(m.awayReds||0)>0 && !st.ft){ evs.push({kind:"red",
      home:m.home,away:m.away,sc:sc,min:st.t,lead:lead}); }
    else if(m.status==="HT"){ evs.push({kind:"ht",home:m.home,away:m.away,sc:sc,min:"HT",lead:lead}); }
    else if(st.ft){ evs.push({kind:"ft",home:m.home,away:m.away,sc:sc,min:"FT",lead:lead}); }
  });
  var order={goal:0,red:1,ht:2,ft:3};
  evs.sort(function(a,b){return order[a.kind]-order[b.kind];});
  return evs;
}
function tickerItemHTML(e){
  var tag,ic;
  var S="<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>";
  if(e.kind==="goal"){tag="";ic="";}
  else if(e.kind==="red"){tag="Red card";ic="<span class='tk-ic'>"+S+"<rect x='7' y='4' width='10' height='16' rx='2'/></svg></span>";}
  else if(e.kind==="ht"){tag="Half-time";ic="<span class='tk-ic'>"+S+"<circle cx='12' cy='12' r='9'/><path d='M12 8v4l2.5 1.5'/></svg></span>";}
  else{tag="Full-time";ic="<span class='tk-ic'>"+S+"<circle cx='12' cy='12' r='9'/><path d='M8.5 12.5l2.4 2.4 4.6-5'/></svg></span>";}
  var draw=(e.kind==="ft"&&e.lead===""&&/^\d+-\d+$/.test(e.sc));
  var gtag="<span class='tk-tag tk-goaltag'>GOAL</span>";
  var scHTML;
  if(e.kind==="goal"&&e.fresh){var pr=String(e.sc).split("-");
    scHTML="<b class='tk-sc'><span class='"+(e.gh?"glow":"")+"'>"+pr[0]+"</span>-<span class='"+(e.ga?"glow":"")+"'>"+pr[1]+"</span></b>";}
  else scHTML="<b class='tk-sc'>"+e.sc+"</b>";
  var homeSpan="<span class='"+(e.lead==="h"?"tk-lead":"")+"'>"+(e.kind==="goal"&&e.fresh&&e.gh?gtag+" ":"")+esc2(e.home)+"</span>";
  var awaySpan="<span class='"+(e.lead==="a"?"tk-lead":"")+"'>"+esc2(e.away)+(e.kind==="goal"&&e.fresh&&e.ga?" "+gtag:"")+"</span>";
  return "<span class='tk-item tk-"+e.kind+(e.fresh?" flash":"")+(e.lead?" tk-lead-"+e.lead:"")+(draw?" tk-draw":"")+"'>"+ic+
    (tag?"<span class='tk-tag'>"+tag+"</span>":"")+
    "<span>"+homeSpan+" "+scHTML+" "+awaySpan+"</span>"+
    "<span class='tk-min'>"+e.min+"</span></span>";
}
/* The pulse is a nudge toward live action you are not currently looking at, so
   the bottom-tab one goes quiet while you are on the Live scores page itself.
   The top-nav one needs no such guard - that whole tab is hidden there. */
function syncLiveDots(){
  var any=!!(typeof LIVE==="object"&&LIVE.matches&&LIVE.matches.length);
  var here=document.documentElement.classList.contains("mode-live");
  var d=$("liveDot"); if(d) d.hidden=!any;
  var dB=$("liveDotB"); if(dB) dB.hidden=!any||here;
}
function renderLiveStrip(){
  var wrap=$("liveStripWrap"),host=$("liveStrip"); if(!wrap||!host) return;
  var root=document.documentElement;
  if(root.classList.contains("mode-build")||root.classList.contains("mode-live")){wrap.hidden=true;return;}
  var evs=tickerEvents();
  if(!evs.length){wrap.hidden=true;host.innerHTML="";LIVE._tksig="";return;}
  wrap.hidden=false;
  var sig=evs.map(function(e){return e.kind+e.home+e.sc+e.min;}).join("|");
  if(sig===LIVE._tksig) return;
  LIVE._tksig=sig;
  var items=evs.map(tickerItemHTML).join("");
  if(evs.length<=2){ host.innerHTML=items; host.style.animation="none"; host.style.justifyContent="center"; }
  else { var reps=evs.length<4?3:2; var big=""; for(var r=0;r<reps;r++) big+=items;
    host.innerHTML=big; host.style.animation=""; host.style.justifyContent="";
    host.style.animationDuration=Math.max(20,evs.length*6)+"s"; }
  var all=$("liveStripAll");
  if(all&&!all._w){all._w=1;all.addEventListener("click",function(e){e.preventDefault();setView("live");});}
}
function startLive(){
  fetchLive();
  if(LIVE.timer) clearInterval(LIVE.timer);
  LIVE.timer=setInterval(function(){ if(!document.hidden) fetchLive(); },30000);
}
/* ===================================================== my slip (manual pick) */
var MYSLIP=[];
try{MYSLIP=JSON.parse(localStorage.getItem("sw.myslip")||"[]");}catch(e){MYSLIP=[];}
function saveMy(){try{localStorage.setItem("sw.myslip",JSON.stringify(MYSLIP));}catch(e){}}
function myslipHas(id,code){return MYSLIP.some(function(x){return x.id===id&&x.code===code;});}
function myOdds(){return MYSLIP.reduce(function(t,x){return t*legOdd(fixtureById(x.id),x.code,x.p);},1);}
/* The markets a leg can be changed to. Only ones carrying a SportyBet code:
   we predict more than we can book - under 2.5, first-half goals and the
   combos have no code - so offering those here would quietly build a leg
   that fails when the code is generated. Order follows the expanded card,
   so the same match reads the same way in both places. */
/* WHAT A LEG CAN BE CHANGED TO - DERIVED, NOT MAINTAINED.
 *
 * This was a hand-written list of fifteen markets, and it stayed at fifteen
 * for the month after seven more were added: a reader could hold a Result-or-GG
 * leg with no way to reach that market on another game. Adding a market touched
 * four places and only two of them complained, so this was one of the silent
 * ones.
 *
 * It now reads the chip table - MKT_BY_CHIP, the same table the builders and
 * emptyWhy use - so a market the builders can pick is a market this menu can
 * offer, automatically. A new chip needs no edit here at all.
 *
 * Two things are still decided rather than derived:
 *   the DRAW is left out. Every other option is a shade of the same bet; the
 *     draw is the outcome the model ranks third on most fixtures, and the
 *     builders stop and ask before switching it on (askDrawOn). A dropdown
 *     cannot ask, and a one-tap swap onto the least likely result is not a
 *     swap anybody meant to make. It stays buildable in the wizard.
 *   the ORDER is the expanded card's, so the same match reads the same way in
 *     both places. Anything the chip table adds later lands after the fifteen
 *     that have an order, in the table's own order.
 */
var SWAP_ORDER=["1","2","1X","X2","12","OVER_1.5","OVER_2.5","GG",
  "FH_OVER_0.5","OVER_3.5","HOME_OVER_0.5","AWAY_OVER_0.5",
  "HOME_OVER_1.5","AWAY_OVER_1.5"];
var SWAP_NEVER={"X":1};
function swapOptions(f){
  if(!f) return [];
  var seen={}, out=[];
  Object.keys(MKT_BY_CHIP).forEach(function(k){
    (MKT_BY_CHIP[k]||[]).forEach(function(code){
      if(seen[code]||SWAP_NEVER[code]) return;
      seen[code]=1;
      /* The label the rest of the page prints for this leg, stripped of the
         markup mLabel puts round a team name - a menu row is plain text. */
      var label=mLabel(f,code).replace(/<[^>]+>/g,"");
      out.push({code:code,label:label,p:mProb(f,code)});
    });
  });
  out.sort(function(a,b){
    var ia=SWAP_ORDER.indexOf(a.code), ib=SWAP_ORDER.indexOf(b.code);
    return (ia<0?99:ia)-(ib<0?99:ib);
  });
  /* No probability means no opinion, and a market this book will not sell is
     not an option however well we rate it. */
  return out.filter(function(o){return o.p!=null&&!isNaN(o.p)&&bookAllows(o.code);});
}
function renderFab(){var fab=$("myFab"); if(!fab) return; fab.hidden=MYSLIP.length===0;
  var c=$("myFabC"); if(c) c.textContent=MYSLIP.length;}
function clearMy(){
  MYSLIP=[]; saveMy(); renderFab();
  /* Abandon any booking still in flight and put its button back. Clearing left
     "Booking..." disabled for as long as the request ran, and if it never
     settled the button stayed dead - add one pick back and there it was, stuck,
     with no way to try again. */
  MYBOOK_GEN++; resetMyBookBtn();
  var mo=$("myTotOdds"); if(mo) mo.textContent="-";
  document.querySelectorAll("[data-add].on").forEach(function(b){b.classList.remove("on");b.textContent="+";});
  $("myBookResult").innerHTML="";
  /* Clearing the slip clears the ticket behind it. Leaving the builder preview
     showing the games and the odds you just threw away would be describing a
     slip that no longer exists - and since the sheet covers that preview, you
     only saw it on closing the sheet, which read as the Clear having been
     ignored. Same reset the builder's own trash button runs, so both buttons
     mean one thing. Back to the unset state - pick a payout and conjure. */
  try{
    WSP.odds=null;
    clearSlipState();
    /* The builder writes its picks into MYSLIP on every render, which is what
       makes the slider and the slip feel like one thing. Here it was the bug:
       Clear emptied the slip and then called renderBuilder to repaint the
       preview, and that render put the very same legs straight back before the
       sheet was drawn. The slip never cleared. Once the slider has been touched
       the sync is unconditional, so this happened on every Clear from the
       slider page - and since a phone leaves :hover on the last thing tapped,
       the button stayed red as well, which is why it read as jammed rather than
       as undoing its own work.
       Suppress the sync for this one repaint, and lower touched afterwards so
       an incidental render cannot resurrect the slip either. Moving the slider
       or changing a filter raises it again, so the next deliberate act brings
       the sync straight back. */
    BUILD_NOSYNC=true; BUILD.touched=false;
    try{
      if(document.documentElement.classList.contains("mode-build")) renderBuilder();
      if(typeof renderSlipTease==="function") renderSlipTease();
    }finally{ BUILD_NOSYNC=false; }
  }catch(e){ BUILD_NOSYNC=false; }
  renderMySheet();
}
function flyToSlip(srcEl){
  try{
    if(REDUCED||!srcEl)return;
    var fab=$("myFab"); if(!fab||fab.hidden)return;
    var f=fab.getBoundingClientRect();
    /* The My slip button lives at the bottom of the screen, but most adds come
       from the sheet, which is also at the bottom - and while it is open the
       button is behind it. Flying to something covered looked like the chip
       heading off upwards for no reason. Aim at the button only when it can
       actually be seen; otherwise let the count badge do the talking. */
    if(f.width===0||f.bottom<0||f.top>window.innerHeight) return;
    var sheetOpen=(typeof anyOverlayOpen==="function")&&anyOverlayOpen();
    if(sheetOpen) return;
    var s=srcEl.getBoundingClientRect();
    var chip=document.createElement("div"); chip.className="fly-chip"; chip.textContent="+1";
    chip.style.left=s.left+"px"; chip.style.top=s.top+"px";
    document.body.appendChild(chip);
    requestAnimationFrame(function(){
      /* Centre to centre, so it lands on the button rather than beside it -
         the y leg was measuring edge to edge while the x leg used the centre. */
      chip.style.transform="translate("+
        ((f.left+f.width/2)-(s.left+chip.offsetWidth/2))+"px,"+
        ((f.top+f.height/2)-(s.top+chip.offsetHeight/2))+"px) scale(.4)";
      chip.style.opacity="0";});
    setTimeout(function(){chip.remove();
      fab.classList.remove("pop"); void fab.offsetWidth; fab.classList.add("pop");},560);
  }catch(e){}
}
function toggleMy(id,code,label,p,srcEl){
  var i=-1; for(var k=0;k<MYSLIP.length;k++){if(MYSLIP[k].id===id&&MYSLIP[k].code===code){i=k;break;}}
  if(i>=0) MYSLIP.splice(i,1); else {
    /* `k` is the kickoff, written down at the moment the leg is added - see
       pruneMy for why a leg has to carry its own clock. */
    MYSLIP.push({id:id,code:code,label:label,p:+p,k:kickoffOf(id)}); flyToSlip(srcEl);
    /* Heads-up if this game isn't on SportyBet yet - it can still be added, and
       we'll retry matching at book time, but the user should know up front. */
    var _f=fixtureById(id);
    if(_f && !_f.eventId){ try{loadSporty().then(repaintAfterMatch);}catch(e){}
      window.swToast&&window.swToast("Added - not on SportyBet yet, we'll match it when you book","info","noid"); }
  }
  saveMy(); renderFab(); syncAddBtn(id,code);
  if($("mySheet")&&$("mySheet").classList.contains("on")) renderMySheet();
}
/* Repaint the add buttons for one match+market wherever they sit on the
   board, so the tick agrees with the slip. Shared by adding and by changing
   a pick - a change has to repaint two markets, the one being left and the
   one being taken. */
function syncAddBtn(id,code){
  document.querySelectorAll("[data-add='"+id+"'][data-code='"+code+"']").forEach(function(b){
    var on=myslipHas(id,code); b.classList.toggle("on",on);
    /* The tick is the only thing that used to change, and a tick is not a
       state anything but an eye can read. */
    b.setAttribute("aria-pressed",on?"true":"false");
    if(b.classList.contains("m-add")){var ic=b.querySelector(".ma-ic"); if(ic)ic.innerHTML=on?CHK:PLUS; if(b.lastChild)b.lastChild.textContent=on?" Added":" Add to slip";}
    else b.textContent=on?"\u2713":"+";});
}
/* Change one leg's market, keeping its place in the slip.
   The total is derived from MYSLIP every time the sheet renders, so
   re-rendering IS the recalculation: there is no second copy of the odds to
   keep in step, and no way for the number at the bottom to drift from the
   legs above it. */
/* A small menu anchored to the row, rather than a native select.
   A select was the right instinct - it is the control people know - but on a
   phone the OS opens it as a full-screen page, which is an enormous response
   to changing one leg and hides the slip you are comparing against. This is
   the same list, next to the row it belongs to.
   Positioned fixed and parented to the body on purpose: inside the sheet it
   would be clipped by the scrolling list it has to overlap. */
var SWAPMENU=null;
function closeSwapMenu(){
  if(!SWAPMENU) return;
  var btn=SWAPMENU._btn;
  SWAPMENU.remove(); SWAPMENU=null;
  if(btn) btn.setAttribute("aria-expanded","false");
  document.removeEventListener("mousedown",swapAway,true);
  document.removeEventListener("touchstart",swapAway,true);
  document.removeEventListener("keydown",swapKey,true);
  window.removeEventListener("resize",closeSwapMenu);
}
/* The trigger is "outside" the menu, so a press on it closed the menu here
   and the click that followed opened it straight back up - the icon looked
   dead however many times you tapped it. Leave the trigger alone and let its
   own handler do the toggling. */
function swapAway(e){
  if(!SWAPMENU) return;
  if(SWAPMENU.contains(e.target)) return;
  var t=SWAPMENU._btn;
  if(t&&(t===e.target||t.contains(e.target))) return;
  closeSwapMenu();
}
function swapKey(e){ if(e.key==="Escape"){ e.preventDefault(); closeSwapMenu(); } }
function openSwapMenu(btn){
  /* Second tap on the same row closes it. */
  var wasOpen = SWAPMENU && SWAPMENU._btn===btn;
  closeSwapMenu();
  if(wasOpen) return;
  var id=btn.dataset.myswap, code=btn.dataset.code;
  var f=fixtureById(id); if(!f) return;
  var opts=swapOptions(f); if(opts.length<2) return;
  var m=document.createElement("div");
  m.className="swap-menu"; m._btn=btn; m.setAttribute("role","listbox");
  m.innerHTML=opts.map(function(o){
    return "<button type='button' role='option' class='swap-opt"+(o.code===code?" on":"")+"'"+
      (o.code===code?" aria-selected='true'":"")+" data-c=\""+esc(o.code)+"\">"+
      "<span class='sw-n'>"+esc(o.label)+"</span>"+
      "<span class='sw-p'>"+P0(o.p)+"%</span>"+
      "<span class='sw-o'>×"+legOdd(f,o.code,o.p).toFixed(2)+"</span></button>";
  }).join("");
  document.body.appendChild(m);
  /* Below the row if it fits, above if it does not - and then clamped into
     the viewport regardless. Choosing a side is not enough on its own: a row
     near the bottom of a tall sheet can sit past the fold entirely, and
     flipping a 272px menu above a trigger that is itself off-screen just
     moves the overflow. Fit the menu to whichever side has more room, then
     pin it inside the edges. */
  var r=btn.getBoundingClientRect(), mw=m.offsetWidth;
  var vh=window.innerHeight, vw=window.innerWidth, PAD=8;
  var below=vh-r.bottom-6-PAD, above=r.top-6-PAD;
  var room=Math.max(below,above,120);
  if(m.offsetHeight>room) m.style.maxHeight=Math.min(room,vh-2*PAD)+"px";
  var mh=m.offsetHeight;
  var top=(below>=mh)?(r.bottom+6):(above>=mh?(r.top-mh-6):(below>=above?r.bottom+6:r.top-mh-6));
  top=Math.min(Math.max(PAD,top),Math.max(PAD,vh-mh-PAD));
  var left=Math.min(Math.max(PAD,r.left),Math.max(PAD,vw-mw-PAD));
  m.style.top=top+"px"; m.style.left=left+"px";
  btn.setAttribute("aria-expanded","true");
  SWAPMENU=m;
  m.querySelectorAll("[data-c]").forEach(function(b){
    b.addEventListener("click",function(){
      var nc=b.dataset.c; closeSwapMenu(); swapMy(id,code,nc);
    });
  });
  /* Deferred, or the click that opened this would immediately close it. */
  setTimeout(function(){
    document.addEventListener("mousedown",swapAway,true);
    document.addEventListener("touchstart",swapAway,true);
    document.addEventListener("keydown",swapKey,true);
    window.addEventListener("resize",closeSwapMenu);
  },0);
}
/* The day picker under "Today only". Same popover mechanics as the leg swap
   menu - built on open so it always lists the days that actually have games
   right now, positioned against its trigger, dismissed on outside tap / Escape
   / resize. */
var DAYMENU=null;
function closeDayMenu(){
  if(!DAYMENU) return;
  var btn=DAYMENU._btn;
  DAYMENU.remove(); DAYMENU=null;
  if(btn) btn.setAttribute("aria-expanded","false");
  document.removeEventListener("mousedown",dayAway,true);
  document.removeEventListener("touchstart",dayAway,true);
  document.removeEventListener("keydown",dayKey,true);
  window.removeEventListener("resize",closeDayMenu);
}
function dayAway(e){
  if(!DAYMENU) return;
  if(DAYMENU.contains(e.target)) return;
  var t=DAYMENU._btn;
  if(t&&(t===e.target||t.contains(e.target))) return;
  closeDayMenu();
}
function dayKey(e){ if(e.key==="Escape"){ e.preventDefault(); closeDayMenu(); } }
function openDayMenu(btn){
  var wasOpen=DAYMENU&&DAYMENU._btn===btn;
  closeDayMenu();
  if(wasOpen) return;
  var list=dayPickList();
  if(!list.length) return;
  var m=document.createElement("div");
  m.className="swap-menu day-menu"; m._btn=btn; m.setAttribute("role","listbox");
  /* Above the days, not under them: the menu holds every day the payload
     carries - sixteen of them today - and anything below that list is past
     the fold of a scrolling menu, which is the same as not being offered.
     It is also the wider answer, and the pill it drops out of reads as the
     narrow window, so the choices run narrow-last. */
  m.innerHTML=SPAN_CHOICES.map(function(n){
    var cur=(SCOPE==="span"&&SPAN===n);
    var s0=list[0];
    return "<button type='button' role='option' class='day-opt day-span"+(cur?" on":"")+"'"+
      (cur?" aria-selected='true'":"")+" data-span='"+n+"'>"+
      "<span class='dy-n'>"+esc(spanName(n))+"</span>"+
      "<span class='dy-d'>"+esc(dayDate(s0))+" - "+esc(dayDate(s0+n-1))+"</span>"+
      "<span class='dy-c'>"+spanBuildable(n,s0)+"</span></button>";
  }).join("")+
  list.map(function(o){
    var cur=(SCOPE==="day"&&o===SDAY);
    return "<button type='button' role='option' class='day-opt"+(cur?" on":"")+"'"+
      (cur?" aria-selected='true'":"")+" data-off='"+o+"'>"+
      "<span class='dy-n'>"+esc(dayName(o))+"</span>"+
      "<span class='dy-d'>"+esc(dayDate(o))+"</span>"+
      "<span class='dy-c'>"+dayBuildable(o)+"</span></button>";
  }).join("");
  document.body.appendChild(m);
  var r=btn.getBoundingClientRect(), mw=m.offsetWidth;
  var vh=window.innerHeight, vw=window.innerWidth, PAD=8;
  var below=vh-r.bottom-6-PAD, above=r.top-6-PAD;
  var room=Math.max(below,above,120);
  if(m.offsetHeight>room) m.style.maxHeight=Math.min(room,vh-2*PAD)+"px";
  var mh=m.offsetHeight;
  var top=(below>=mh)?(r.bottom+6):(above>=mh?(r.top-mh-6):(below>=above?r.bottom+6:r.top-mh-6));
  top=Math.min(Math.max(PAD,top),Math.max(PAD,vh-mh-PAD));
  var left=Math.min(Math.max(PAD,r.left),Math.max(PAD,vw-mw-PAD));
  m.style.top=top+"px"; m.style.left=left+"px";
  btn.setAttribute("aria-expanded","true");
  DAYMENU=m;
  m.querySelectorAll("[data-span]").forEach(function(b){
    b.addEventListener("click",function(){
      var n=parseInt(b.dataset.span,10); closeDayMenu();
      /* Same reset as every other window change: the pool moved. */
      if(setSpan(n)){
        BUILD.removed={}; BUILD.touched=true;
        WSP.removed={}; WSP._slip=null; WSP._sig=null;
        $("bookResult").innerHTML=""; renderBuilder();
      }
    });
  });
  m.querySelectorAll("[data-off]").forEach(function(b){
    b.addEventListener("click",function(){
      var off=parseInt(b.dataset.off,10); closeDayMenu();
      /* Same reset as the window and bucket switches: the pool changed, so a
         removal list and any code from the old pool are stale. */
      if(setDay(off)){
        BUILD.removed={}; BUILD.touched=true;
        WSP.removed={}; WSP._slip=null; WSP._sig=null;
        $("bookResult").innerHTML=""; renderBuilder();
      }
    });
  });
  setTimeout(function(){
    document.addEventListener("mousedown",dayAway,true);
    document.addEventListener("touchstart",dayAway,true);
    document.addEventListener("keydown",dayKey,true);
    window.addEventListener("resize",closeDayMenu);
  },0);
}
function swapMy(id,oldCode,newCode){
  if(oldCode===newCode) return;
  var f=fixtureById(id); if(!f) return;
  var opts=swapOptions(f), pick=null;
  for(var k=0;k<opts.length;k++){ if(opts[k].code===newCode){pick=opts[k];break;} }
  if(!pick) return;
  /* SportyBet takes one pick per match, so moving onto a market this match
     already occupies would build a slip that cannot be booked. */
  closeSwapMenu();
  if(myslipHas(id,newCode)){
    window.swToast&&window.swToast("That pick is already on your slip","info","dupswap");
    renderMySheet(); return;
  }
  for(var i=0;i<MYSLIP.length;i++){
    if(MYSLIP[i].id===id&&MYSLIP[i].code===oldCode){
      MYSLIP[i].code=newCode; MYSLIP[i].label=pick.label; MYSLIP[i].p=+pick.p;
      /* Changing a leg makes it yours.
         auto:true means "machine-picked, replace me on the next shuffle", and
         a swapped leg kept carrying it - so a reshuffle deleted the market the
         user had just chosen and put the model's original pick back. Reported
         as: "i changed an option, when i shuffled, it changed the game i
         changed to the default one it initially predicted for me."
         Both builders filter on this flag before refilling, so clearing it is
         what makes an edited leg survive either of them. */
      MYSLIP[i].auto=false;
      break;
    }
  }
  saveMy(); renderFab();
  syncAddBtn(id,oldCode); syncAddBtn(id,newCode);
  /* A code generated from the old legs no longer describes this slip. */
  var br=$("myBookResult"); if(br) br.innerHTML="";
  renderMySheet();
}
/* While a sheet covers the page, the page itself must not scroll - a drag
   that starts on the sheet's own chrome would otherwise pan the board behind
   it. Locking the body is the ordinary way to do that, and unlike
   touch-action on the bar it leaves every button in the sheet alone. */
function lockBody(on){
  try{
    var b=document.body;
    if(on){
      if(!b.dataset.lockY){ b.dataset.lockY=String(window.scrollY||0); }
      b.style.overflow="hidden";
    }else{
      b.style.overflow="";
      delete b.dataset.lockY;
    }
  }catch(e){}
}
function openMySheet(){renderMySheet();$("scrim").classList.add("on");$("mySheet").classList.add("on");lockBody(true);pushOverlay();}
function wireSlipsSheet(){
  var x=$("slipsSheet-x"); if(x&&!x._w){x._w=1;x.addEventListener("click",closeSlipsSheet);}
}
function closeMySheet(){$("scrim").classList.remove("on");$("mySheet").classList.remove("on");
  /* Only release the page if no other sheet is still up. */
  if(!$("sheet")||!$("sheet").classList.contains("on")) lockBody(false);}
/* DROP THE LEGS WHOSE MATCHES HAVE BEEN AND GONE, and write that down.
 *
 * ONE rule, because there used to be two and they disagreed. The first kept a
 * leg whose fixture could not be found; the second, immediately after, dropped
 * it. The second won and saveMy() wrote it down, so a leg was deleted from
 * somebody's slip for good. A leg goes only when we can SEE that its match is
 * past: not finding the fixture is not evidence of anything, because the board
 * drops a match at kick-off and carries cup ties only while the bookmaker
 * lists them. This list is saved, so a wrong drop cannot be taken back.
 *
 * IT USED TO PRUNE AND THEN THROW THE RESULT AWAY. The length was read AFTER
 * the filter and compared with itself, so `MYSLIP.length!==_b` was false on
 * every run and neither saveMy() nor renderFab() ever fired. The slip was
 * tidied for as long as the sheet was open and the old legs were back on the
 * next reload - which is why a reader who conjured a slip yesterday came back
 * to "My slip 28" with most of those games already played. Conjured legs are
 * written to localStorage with auto:true, so they persist by design; nothing
 * was persisting their removal.
 *
 * Called from the sheet AND once the board lands, because the badge is on
 * screen long before anybody opens the sheet, and a count of dead legs is a
 * worse lie than no count. Returns true when it changed something.
 *
 * AND A LEG NOW CARRIES ITS OWN CLOCK, which is what actually empties a stale
 * slip. Keeping a leg whose fixture we cannot find is the right rule and it is
 * also why a slip grew forever: yesterday's games are not on today's board, so
 * every one of them was unfindable, and unfindable meant kept. The board can
 * only speak for today. A kickoff recorded when the leg was added speaks for
 * itself, so a leg that names a time in the past goes whether the board
 * remembers the game or not - and one from before this shipped, with no time
 * on it, still falls back to the old rule and is never dropped on a guess. */
function kickoffOf(id,f){
  f=f||fixtureById(id);
  var t=f&&f.kickoff?Date.parse(f.kickoff):NaN;
  return isFinite(t)?t:null;
}
function pruneMy(){
  var before=MYSLIP.length;
  MYSLIP=MYSLIP.filter(function(x){
    if(x.k&&x.k<=Date.now()) return false;
    var f=fixtureById(x.id);
    if(!f) return true;
    return notStarted(f)&&isUpcoming(f);
  });
  if(MYSLIP.length===before) return false;
  saveMy(); renderFab();
  return true;
}
function renderMySheet(){
  paintBookPickers();
  var body=$("mySheetBody"); if(!body) return;
  /* ONE rule, because there used to be two and they disagreed. The first
     kept a leg whose fixture could not be found; the second, immediately
     after, dropped it. The second won and saveMy() wrote it down, so a leg
     was deleted from somebody's slip for good.
     A leg goes only when we can SEE that its match is past. Not finding the
     fixture is not evidence of anything: the board drops a match at
     kick-off and carries cup ties only while the bookmaker lists them, so
     "gone from the board" happens to games that are still being played.
     This list is saved, so a wrong drop cannot be taken back. */
  pruneMy();
  if(!MYSLIP.length){
    body.innerHTML="<div class='bld-empty'><b>Your slip is empty</b>Tap + on any prediction to add it here.</div>";
    $("mySheetFoot").hidden=true; $("myBookResult").innerHTML=""; return;
  }
  $("mySheetFoot").hidden=false;
  /* Shuffle belongs to a conjured slip only - it rebuilds the machine picks,
     which would be a strange thing to do to a slip somebody assembled. */
  /* Shuffle belongs to the builder. It rebuilds the machine-picked legs, which
     is a thing you do while choosing a slip - not while looking at one from the
     board, where the wizard is not even on screen. Offering it there was also
     what made it look broken after a reload: the slip is stored and the wizard
     is not, so the button came back with nothing behind it.
     Two conditions, both required: there are conjured legs to rebuild, and you
     are somewhere that rebuilding makes sense. */
  var shuf=$("mySheetShuffle");
  if(shuf) shuf.hidden = !MYSLIP.some(function(x){return x.auto;})
    || !document.documentElement.classList.contains("mode-build");
  body.innerHTML=MYSLIP.map(function(x){
    var f=fixtureById(x.id);
    var teams=f?esc(f.home)+" v "+esc(f.away):"Match";
    var noid=(f&&f.eventId)?"":"<span class='sp-noid' title='Not on SportyBet yet - can&apos;t auto-book'>no ID</span>";
    /* Every other thing we predict for this match, so a leg can be changed
       without leaving the slip and hunting the board for the same game.
       A native select is deliberate: on a phone it opens the OS picker
       people already know, and it keeps the rows around it still - a panel
       that expanded in place would shove the rest of the slip down while
       you are comparing this leg against it. */
    var opts=f?swapOptions(f):[];
    var picker=(opts.length>1)
      ? "<div class='sp-swap'><button type='button' class='sp-swap-btn' "+
          "data-myswap=\""+esc(x.id)+"\" data-code=\""+esc(x.code)+"\" "+
          "aria-haspopup='listbox' aria-expanded='false' "+
          "aria-label=\"Change the pick for "+teams+"\">"+
          "<span class='sp-swap-lbl'>"+esc(x.label)+"</span></button></div>"
      : "<div class='sp-meta'>"+esc(x.label)+"</div>";
    return "<div class='sp-row'>"+
      "<div class='sp-main'><div class='sp-teams'>"+teams+noid+"</div>"+
        picker+"</div>"+
      /* This leg's price. The duplicate was the copy printed inside the pick
         control itself - this column was never the problem, and without it a
         slip shows a total with nothing to add up to it. */
      "<span class='sp-odd'>"+(x.p>0?oddCell(f,x.code,x.p):"-")+"</span>"+
      "<button class='sp-x' data-myrm='"+x.id+"|"+x.code+"' aria-label='Remove'>"+XSVG+"</button>"+
    "</div>";
  }).join("");
  $("myTotOdds").textContent="\u00d7"+myOdds().toFixed(2);
  body.querySelectorAll("[data-myrm]").forEach(function(b){
    b.addEventListener("click",function(){var p=b.dataset.myrm.split("|"); toggleMy(p[0],p[1]);});});
  body.querySelectorAll("[data-myswap]").forEach(function(b){
    b.addEventListener("click",function(e){ e.stopPropagation(); openSwapMenu(b); });});
  /* Scrolling the legs would leave the menu floating over the wrong row. */
  if(!body._swapScroll){ body._swapScroll=1;
    body.addEventListener("scroll",function(){ closeSwapMenu(); },{passive:true}); }
}
async function bookMy(){
  MYSLIP=MYSLIP.filter(function(x){var f=fixtureById(x.id);return !f||notStarted(f);});
  /* Carry `id` and the fixture itself, not just the code and event.
     Without them the booking pre-flight cannot tell whether SportyBet
     prices this market: hasSportyMarket resolves through c.f or c.id,
     found neither, and judged every leg unplaceable - reporting
     "SportyBet isn't offering any of these markets" on a slip showing its
     odds on screen, and blocking booking from My slip entirely.
     The board path always passed the fixture, which is why this survived
     testing there and shipped anyway. */
  var B=curBook();
  var has=function(c){return !!bookIdOf(c,B);};
  var picks=MYSLIP.map(function(x){var f=fixtureById(x.id);
    return {id:x.id,f:f,code:x.code,p:x.p,eventId:(f&&f.eventId)||null};});
  var bookable=picks.filter(has);
  var missing=picks.filter(function(c){return !has(c);});

  /* Only SportyBet is worth awaiting - see bookSlip. */
  if(missing.length > 0 && B.key==="sporty"){
    $("myBookResult").innerHTML="<div class='code-info'>Matching "+B.mark+" events…</div>";
    await loadSporty();
    /* Re-evaluate after matching */
    picks=MYSLIP.map(function(x){var f=fixtureById(x.id);
      return {id:x.id,f:f,code:x.code,p:x.p,eventId:(f&&f.eventId)||null};});
    bookable=picks.filter(has);
    missing=picks.filter(function(c){return !has(c);});
    if($("mySheet")&&$("mySheet").classList.contains("on")) renderMySheet();
  }

  if(!bookable.length){$("myBookResult").innerHTML="<div class='code-err'>None of these are on "+B.mark+" right now, so a code can't be created.</div>";return;}
  var byEv={},dups=0;
  bookable.forEach(function(c){var k=bookIdOf(c,B);byEv[k]=(byEv[k]||0)+1;if(byEv[k]===2)dups++;});
  if(dups){
    var uniq=[],seenEv={};
    bookable.forEach(function(c){var k=bookIdOf(c,B);if(!seenEv[k]){seenEv[k]=1;uniq.push(c);}});
    showPrompt("myBookResult","<div class='confirm-card'><p>You have the same match picked more than once. "+B.mark+" takes one pick per match - book "+uniq.length+" unique game"+(uniq.length===1?"":"s")+"?</p><div class='ca'><button class='confirm-go' type='button'>Book "+uniq.length+"</button><button class='confirm-cancel' type='button'>Cancel</button></div></div>");
    $("myBookResult").querySelector(".confirm-go").addEventListener("click",function(){
      clearPrompt("myBookResult");
      if(!confirmDropUnpriced(uniq,"myBookResult",doBookMy,B)) doBookMy(uniq);});
    $("myBookResult").querySelector(".confirm-cancel").addEventListener("click",function(){clearPrompt("myBookResult");});
    return;
  }
  if(missing.length){
    showPrompt("myBookResult","<div class='confirm-card'><p>"+B.mark+" doesn't have "+
      missing.length+" of these games.</p>"+
      "<div class='ca'><button class='confirm-go' type='button'>Book the other "+
      (bookable.length===1?"one":bookable.length)+"</button>"+
      "<button class='confirm-cancel' type='button'>Cancel</button></div></div>");
    $("myBookResult").querySelector(".confirm-go").addEventListener("click",function(){
      clearPrompt("myBookResult");
      if(!confirmDropUnpriced(bookable,"myBookResult",doBookMy,B)) doBookMy(bookable);});
    $("myBookResult").querySelector(".confirm-cancel").addEventListener("click",function(){clearPrompt("myBookResult");});
    return;
  }
  /* MORE SELECTIONS THAN THE BETSLIP TAKES.
     "Add all" caps what it books, but its "confirm and trim" branch loads every
     pick into the slip and hands the reader here - and on a full Saturday card
     that is well over fifty. Booking from the sheet never counted them, so a
     code was made, the reader opened it, and SportyBet refused the lot with
     "Bet Limit Reached". Nothing failed on our side to tell us.
     Asked rather than trimmed silently, the same as every other thing this
     path refuses: they chose these games and they should choose which go. */
  if(bookable.length>BETSLIP_MAX){
    var _fit=bookable.slice(0,BETSLIP_MAX), _cut=bookable.length-BETSLIP_MAX;
    /* THE THIRD ANSWER: KEEP THEM ALL, ACROSS SEVERAL TICKETS. Book 50 throws
       the rest away and Let me trim asks the reader to do it by hand - both
       lose games they chose. Reported by a reader with 170 on the slip. The
       splitter already deals legs round-robin and books a ticket at a time, so
       this is the same machinery the code modal offers, aimed at the cap:
       every way on offer leaves each ticket inside the limit. Up to four, like
       everywhere else a split is offered - one forced number is a fact, not a
       choice, and two, three and four tickets are different bets. */
    showPrompt("myBookResult","<div class='confirm-card' id='myCapCard'><p>"+B.mark+" takes "+
      BETSLIP_MAX+" picks on one slip and you have "+bookable.length+
      ". Book the first "+BETSLIP_MAX+", split them across several tickets, "+
      "or close this and remove "+_cut+
      "?</p><div class='ca'><button class='confirm-go' type='button'>Book "+
      BETSLIP_MAX+"</button><button class='confirm-cancel' type='button'>"+
      "Let me trim</button></div>"+capWaysHTML(bookable)+"</div>");
    /* Through wireSplit, never straight to splitAndBook: the quota check that
       stops a four-ticket split costing codes the reader does not have lives
       there, and a second call site would skip it. */
    wireSplit($("myBookResult"),bookable,B,{sel:"#myCapCard"});
    $("myBookResult").querySelector(".confirm-go").addEventListener("click",function(){
      clearPrompt("myBookResult");
      if(!confirmDropUnpriced(_fit,"myBookResult",doBookMy,B)) doBookMy(_fit);});
    $("myBookResult").querySelector(".confirm-cancel").addEventListener("click",function(){clearPrompt("myBookResult");});
    return;
  }
  if(confirmDropUnpriced(bookable,"myBookResult",doBookMy,B)) return;
  doBookMy(bookable);
}
/* Bumped whenever the slip is emptied or rebuilt, so a booking still in the
   air can tell that the slip it was for no longer exists. */
var MYBOOK_GEN=0;
function resetMyBookBtn(){
  var b=$("myBookBtn"); if(b){ b.disabled=false; b.textContent="Get code"; }
}
function doBookMy(bookable,retried,B){
  B=B||curBook();
  var sel=bookable.map(function(c){return B.sel(c);});
  var gen=MYBOOK_GEN;
  var btn=$("myBookBtn"); if(btn){btn.disabled=true;btn.textContent="Booking…";}
  /* Not on a retry: the caller has just written which pick it dropped and
     why, and clearing here wiped that within the same tick - so the note
     never reached the screen and the recovery looked like a stall. */
  if(!retried) $("myBookResult").innerHTML="";
  bookFetch(sel,B)
    .then(function(d){
      /* Cleared while we waited: this code is for a slip that is gone, so
         showing it would hand somebody a ticket they no longer hold. */
      if(gen!==MYBOOK_GEN) return;
      resetMyBookBtn();
      var _code=B.codeOf(d);
      if(d&&d.success&&_code){
        /* What was BOOKED, which after a retry is not the whole slip. Taken
           from MYSLIP so the legs keep their labels, but narrowed to the ones
           actually sent - saving all of them would file a ticket claiming
           games the code does not contain, and those legs would then be graded
           against a bet nobody holds. */
        var _sent={}; bookable.forEach(function(c){_sent[c.id+"|"+c.code]=1;});
        var _legs=MYSLIP.filter(function(x){return _sent[x.id+"|"+x.code];});
        var _od=_legs.reduce(function(t,x){
          return t*legOdd(fixtureById(x.id),x.code,x.p);},1);
        showCode(_code,"myBookResult",function(){
          rememberSlip(_legs,_od,_code);},B,_legs);
      }
      else{
        /* The builder no longer offers a market SportyBet does not list, but a
           slip can outlive the card it was built from - a market pulled after
           the pick was made, or a slip restored from storage days later. One
           unplaceable leg loses all forty, so drop the legs whose odds we
           never verified and try once more. The board's own Get code has done
           this for a while; My slip had nothing and simply failed. */
        var safe=dropUnbookable(bookable,d,B);
        if(!retried&&safe.length>=1&&safe.length<bookable.length){
          var _keep={}; safe.forEach(function(c){_keep[c.id+"|"+c.code]=1;});
          var _dropped=MYSLIP.filter(function(x){return !_keep[x.id+"|"+x.code];});
          /* Name the match, not just the market. "Over 1.5 goals isn't on
             SportyBet" leaves the reader hunting through their own slip for
             which game it means - the same complaint that put the team names
             into the booking pre-flight. */
          var _who=function(x){var f=fixtureById(x.id);
            return f?(f.home+" v "+f.away+(x.label?" - "+x.label:"")):(x.label||"One pick");};
          confirmAfterRefusal("myBookResult",_dropped.map(_who),safe.length,B,function(){
            /* Only now. Taking the refused legs out of the slip itself, not
               just out of the request: left in, the code says three games
               while the sheet above it lists four and totals odds for all of
               them, and the odd we had for the refused one is gone by now so
               its price would fall back to our own estimate. Correct - but it
               is an edit to somebody's slip, so it waits for them to agree. */
            MYSLIP=MYSLIP.filter(function(x){return _keep[x.id+"|"+x.code];});
            saveMy(); renderFab();
            if($("mySheet")&&$("mySheet").classList.contains("on")) renderMySheet();
            doBookMy(safe,true,B);
          });
          return;
        }
        $("myBookResult").innerHTML=bookErrHTML(d,B);
      }
    }).catch(function(){
      if(gen!==MYBOOK_GEN) return;
      resetMyBookBtn();
      $("myBookResult").innerHTML=bookErrHTML({_kind:"net"},B);});
}
document.addEventListener("click",function(e){
  var a=e.target.closest&&e.target.closest("[data-add]");
  if(a){e.preventDefault();e.stopPropagation();
    toggleMy(a.dataset.add,a.dataset.code,a.dataset.label,a.dataset.p,a);}
});
function setView(v){
  var root=document.documentElement;
  /* Leaving the board pushes a history entry, so the browser's Back button
     returns here instead of leaving the site. popstate already knew how to
     handle this - there was simply never an entry to pop. Guarded so
     returning to the board, or re-selecting the view you are on, does not
     stack entries you then have to press Back through. */
  try{
    if(v!=="pred" && V.view!==v && !root.classList.contains("mode-"+v))
      history.pushState({sw:"view",v:v},"");
  }catch(e){}
  root.classList.toggle("mode-build",v==="build");
  root.classList.toggle("mode-live",v==="live");
  root.classList.toggle("mode-convert",v==="convert");
  /* mode-pred drives the phone-only rule that keeps the Live tab in the header
     on the home page. Without it that CSS never fires and the nav stays hidden. */
  root.classList.toggle("mode-pred",v==="pred");
  V.view=v;
  try{sessionStorage.setItem("sw.viewtab",v);}catch(e){}
  /* Guarded like the bottom-bar buttons just below, which always have been.
     An unguarded $() here throws on a null and abandons the rest of setView -
     the live dots, the builder render, the scroll reset - so one missing
     element took the whole view change with it rather than just itself. */
  var tp0=$("tab-pred"), tl0=$("tab-live"), tb0=$("tab-build");
  if(tp0) tp0.classList.toggle("on",v==="pred");
  if(tl0) tl0.classList.toggle("on",v==="live");
  if(tb0) tb0.classList.toggle("on",v==="build");
  var tc0=$("tab-convert"); if(tc0) tc0.classList.toggle("on",v==="convert");
  var bp=$("bt-pred"),bl=$("bt-live"),bb=$("bt-build"),bc=$("bt-convert");
  if(bp)bp.classList.toggle("on",v==="pred");
  if(bl)bl.classList.toggle("on",v==="live");
  if(bb)bb.classList.toggle("on",v==="build");
  /* The circle marks where you are, and the converter is a where now. */
  if(bc)bc.classList.toggle("on",v==="convert");
  /* A tab for the page you are already on is only ever a way back, so it is
     not drawn at all - that goes for Live scores and Build too, not just
     Predictions, and it is what keeps the header from crowding the wordmark on
     a narrow screen. The bottom bar still carries all three. */
  var tp=$("tab-pred"); if(tp&&tp.childNodes[0]) tp.childNodes[0].nodeValue = (v==="pred") ? "Predictions" : "Home";
  [["tab-live","live"],["tab-build","build"],["tab-convert","convert"]].forEach(function(t){
    var el=$(t[0]); if(el) el.classList.toggle("hide-tab",v===t[1]);
  });
  syncLiveDots();
  if(v==="build") renderBuilder();
  if(v==="live"){ renderLive(); fetchLive(); try{window.__wireAlert&&window.__wireAlert();}catch(e){} }
  if(v==="pred") renderLiveStrip();
  for(var k in LOPEN) delete LOPEN[k];
  if(typeof closeSheet==="function") closeSheet();
  window.scrollTo(0,0);
}
function setMode(build){ setView(build?"build":"pred"); }
$("tab-pred").addEventListener("click",function(){setView("pred");});
$("tab-live").addEventListener("click",function(){setView("live");});
$("tab-build").addEventListener("click",function(){setView("build");});
$("liveRefresh").addEventListener("click",fetchLive);
$("bt-pred").addEventListener("click",function(){buzzTap();setView("pred");});
$("bt-live").addEventListener("click",function(){buzzTap();setView("live");});
$("bt-build").addEventListener("click",function(){buzzTap();setView("build");});
/* THE CONVERTER HAS A WAY IN NOW. It sits at the foot of the builder, which is
   two taps and a scroll from anywhere, and the owner has said twice they could
   not find it. It is not a view of its own - it is one panel inside the
   builder - so this is an action rather than a tab: switch to the builder, put
   the panel on screen, and put the cursor in the box.
   After setView, never before: setView ends by scrolling the window to the top,
   so a scroll that ran first was undone the moment the view changed. */
function goConvert(){
  setView("convert");
  var box=$("byoCode");
  /* Not on a phone: focusing raises the keyboard over the panel the reader was
     just sent to look at. */
  try{ if(box&&window.matchMedia("(min-width:721px)").matches) box.focus(); }catch(e){}
}
$("tab-convert").addEventListener("click",goConvert);
$("bt-convert").addEventListener("click",function(){buzzTap();goConvert();});
$("logo").addEventListener("click",function(e){e.preventDefault();setView("pred");});
(function(){
  var cta=$("slipCta"); if(!cta) return;
  function goMode(mode){ try{localStorage.setItem("sw.mode",mode);}catch(e){} BUILD.mode=mode; setView("build"); }
  cta.querySelectorAll("[data-scmode]").forEach(function(b){
    b.addEventListener("click",function(e){e.stopPropagation();goMode(b.dataset.scmode);});
  });
  /* The second path is not another builder - it is the board. It used to say
     "Choose games myself" and go to the slider, which chooses for you; the
     label promised something the button did not do. */
  var browse=$("scBrowse");
  if(browse) browse.addEventListener("click",function(e){
    e.stopPropagation();
    setView("pred");
    /* setView scrolls to the top, so this has to run after it. Land on the
       board's own heading rather than on a card: the heading is the thing
       that makes the tap feel like an arrival. */
    setTimeout(function(){
      var h=$("boardHead");
      if(h){ try{h.scrollIntoView({behavior:"smooth",block:"start"});}
             catch(err){h.scrollIntoView();} }
      /* Not forced: someone who has already said "Got it" should not be taught
         again every time they use this button to reach the board. */
      runCoach();
    },60);
  });
  /* Card click (not on a button) opens the builder in the current mode */
  /* The whole card used to be clickable, so anywhere in the panel - the
     headline, the proof line, dead space - took you to the builder. Only the
     buttons should act, and the panel now says so by not moving under the
     cursor either. */
})();
/* Live payout teaser: run a default wizard build and show its real games+odds
   on the hero CTA and sticky bar, so the pitch is a concrete number, not a verb. */
function renderSlipTease(){
  try{
    var r=wspBuild();
    var sub=$("scTease"), sb=$("sbSub");
    if(r&&r.picks&&r.picks.length>=2){
      /* Say what they get, in the fewest plain words: how many games, roughly
         what it pays, and that a SportyBet code comes out of it. */
      /* Not "today's": the wizard builds from whatever window the visitor has
         chosen, which defaults to every upcoming game - so on a day with four
         fixtures it was offering a 23-game slip and calling it today's. Say
         what it is instead of implying a day it does not belong to. */
      var msg="Your slip: "+r.picks.length+" games \u00b7 about \u00d7"+
              r.odds.toFixed(0)+" \u00b7 SportyBet code ready";
      var short=r.picks.length+" games \u00b7 about \u00d7"+r.odds.toFixed(0)+
              " \u00b7 code ready";
      if(sub) sub.textContent=msg;
      if(sb) sb.textContent=short;
    }
  }catch(e){}
}
/* Sticky slip bar: show once the hero CTA has scrolled out of view. */
(function(){
  var cta=$("slipCta"),bar=$("slipbar"),btn=$("slipbarBtn");
  if(!cta||!bar||!btn) return;
  btn.addEventListener("click",function(){setView("build");});
  function inPred(){var r=document.documentElement;return !r.classList.contains("mode-build")&&!r.classList.contains("mode-live");}
  if("IntersectionObserver" in window){
    new IntersectionObserver(function(es){
      bar.classList.toggle("show",inPred()&&!es[0].isIntersecting);
    },{rootMargin:"-60px 0px 0px 0px"}).observe(cta);
  }
})();
/* Draggable floating button, shared by My slip and the Wizard.
   Three things this has to get right on a phone:
   - only the click handler toggles. Opening on touchend as well meant the
     click the browser sends immediately afterwards saw the panel already
     open and shut it again, so the button looked dead.
   - a position saved on a wide screen lands off-canvas on a phone, so
     anything restored is clamped back into view.
   - a finger never holds still, so a tap is allowed some slop before it
     counts as a drag. */
function makeFab(id,key,isOpen,open,close){
  var fab=$(id); if(!fab) return;
  var moved=false,sx=0,sy=0,ox=0,oy=0,drag=false;
  function clamp(){
    if(!fab.style.left) return;
    var w=fab.offsetWidth||56,h=fab.offsetHeight||56;
    fab.style.left=Math.max(6,Math.min(window.innerWidth-w-6,parseFloat(fab.style.left)||6))+"px";
    fab.style.top=Math.max(6,Math.min(window.innerHeight-h-6,parseFloat(fab.style.top)||6))+"px";
  }
  try{var sp=JSON.parse(localStorage.getItem(key)||"null");
    if(sp){fab.style.left=sp.x+"px";fab.style.top=sp.y+"px";
      fab.style.right="auto";fab.style.bottom="auto";clamp();}}catch(e){}
  window.addEventListener("resize",clamp);
  function down(e){drag=true;moved=false;var t=e.touches?e.touches[0]:e;
    sx=t.clientX;sy=t.clientY;var r=fab.getBoundingClientRect();ox=r.left;oy=r.top;}
  function move(e){if(!drag)return;var t=e.touches?e.touches[0]:e;
    var dx=t.clientX-sx,dy=t.clientY-sy;
    if(Math.abs(dx)+Math.abs(dy)>10)moved=true;
    if(!moved)return;
    fab.style.left=Math.max(6,Math.min(window.innerWidth-fab.offsetWidth-6,ox+dx))+"px";
    fab.style.top=Math.max(6,Math.min(window.innerHeight-fab.offsetHeight-6,oy+dy))+"px";
    fab.style.right="auto";fab.style.bottom="auto";
    if(e.cancelable)e.preventDefault();}
  function up(){if(!drag)return;drag=false;
    if(moved){try{localStorage.setItem(key,JSON.stringify(
      {x:parseFloat(fab.style.left),y:parseFloat(fab.style.top)}));}catch(e){}}}
  fab.addEventListener("mousedown",down);document.addEventListener("mousemove",move);document.addEventListener("mouseup",up);
  fab.addEventListener("touchstart",down,{passive:false});document.addEventListener("touchmove",move,{passive:false});document.addEventListener("touchend",up);
  fab.addEventListener("click",function(e){e.preventDefault();
    if(moved)return; if(isOpen())close(); else open();});
}
makeFab("myFab","sw.fabpos",
  function(){return $("mySheet").classList.contains("on");},openMySheet,closeMySheet);$("mySheet-x").addEventListener("click",closeMySheet);
$("myBookBtn").addEventListener("click",bookMy);
$("myClearBtn").addEventListener("click",clearMy);
/* Reshuffle the conjured legs without leaving the sheet. wspConjure rebuilds,
   refills My slip and repaints this sheet, so there is nothing to do after. */
(function(){
  var b=$("mySheetShuffle"); if(!b) return;
  b.addEventListener("click",function(){
    if(typeof wspConjure!=="function") return;
    /* The slip is stored and the wizard is not. Reload the page and the
       conjured legs come back - so this button appears, because auto legs
       exist - while WSP.odds is null again, which makes wspBuild return an
       empty slip and the click do visibly nothing.
       Aim at the slip already in front of you. Somebody holding a x40
       reshuffles because they want a different x40, so the total on screen
       is the target, and it needs no payout to be chosen a second time. */
    if(WSP.odds==null){
      var cur=myOdds();
      if(isFinite(cur)&&cur>1.05) WSP.odds=Math.round(cur*100)/100;
    }
    if(WSP.odds==null){
      window.swToast&&window.swToast("Pick a target payout to shuffle","info","noodds");
      setView("build"); return;
    }
    wspConjure(true);
  });
})();
document.addEventListener("click",function(e){
  var b=e.target.closest(".more-collapse"); if(!b) return;
  e.stopPropagation();
  var sh=b.closest(".sheet"); if(sh){var x=sh.querySelector(".sheet-x"); if(x)x.click(); return;}
  var row=b.closest(".lrow");
  if(row){ setRowOpen(row,false);
    var t=row.querySelector(".lrow-toggle"); if(t) t.focus();
    return;}
  var card=b.closest(".m"); if(card)card.classList.remove("open");
});
/* ---- Wizard's Special jackpot builder ---- */
/* odds starts null, the way BUILD.risk does. A pre-picked payout meant the
   wizard had already decided for you: a slip existed, the hero advertised
   it, and Conjure would fill My slip before you had chosen anything. */
/* The chosen payout outlives the tab. Without it a reload leaves a conjured
   slip on screen with nothing behind it, and every control that rebuilds
   comes back empty. */
/* Where the jackpot tier starts. A slip priced at or above this is a swing at
   a life-changing payout rather than a considered bet, and the site treats it
   as its own thing: it needs the whole card to reach, it is allowed more legs
   than anything else here, and it is kept out of the running record - see
   myRecord. Nothing about it touches the accuracy figure on the front page,
   which is measured on single tips by the build and never on what anyone
   books. */
const JACKPOT_ODDS=20000;
/* Forty legs is the limit everywhere else. The jackpot tier gets fifty, so
   that the choice between few big prices and many small ones stays open here
   instead of collapsing to whichever style happens to fit: at 1.25 a leg,
   forty could not reach x20000 at all and forty-five only just did, which made
   "safer, more games" the one style that could not do the thing it is for.
   Fifty leaves it room at both targets.
   Note this is a ceiling, not a promise. The builder only uses games it has a
   real SportyBet price for, so a thin card can still come back short - and it
   says so rather than padding the slip out with markets that would be rejected
   at booking. */
/* BOTH BOOKS REFUSE A BETSLIP OF MORE THAN 50 SELECTIONS. SportyBet says so
   in as many words - "There cannot be over 50 selections within a betslip" -
   and Bet9ja is the same, so this is one number rather than one per book.
   If that ever stops being true it belongs on the BOOKS table, not forked
   at each call site.
   The limit is on the BETSLIP, not on making the code - their share endpoint
   takes as many as you send it and hands back a perfectly good code, which is
   why a previous session booked 199 legs "successfully" and recorded that
   there is no practical ceiling. There is. It appears when a person opens the
   code, and nothing on our side ever hears about it: our API sees a success,
   Sentry sees nothing, and the reader sees a dialog they cannot get past.
   An upstream that answers success with something unusable is worse than one
   that errors, so the check has to be ours. */
const BETSLIP_MAX=50;
const JACKPOT_LEG_CAP=50;
function isJackpotOdds(o){ return typeof o==="number" && o>=JACKPOT_ODDS; }
var WSP={odds:null,legodd:1.4,everyGame:false,mk:{wd:true,any:false,out:true,o15:true,o25:false,o35:false,fh:false,tts:true,tts2:false,both:false,dro25:false,drgg:false,rsgg:false,rso25:false,dro15:false,rso15:false,weh:false,draw:false},seed:Math.floor(Math.random()*1e6),shuffles:0,conjured:false,removed:{}};
/* `slider:false` - Balanced is what a reader lands on, not Auto.
   Measured 3 Sep over ten seeds on the 386-fixture board, counting how often
   each method gave the highest chance of the slip landing AT THE PAYOUT ASKED
   FOR: Balanced 43%, Fewer 37%, More 18%, Auto 2%. Auto won nothing at five of
   the six rungs. It is not that the Slider picks badly - at a fair book the
   expected value is the same either way - it is that it answers a different
   question. Its risk dial has about a hundred notches and it stops at the first
   one that CLEARS the target, so at x100 the median Auto slip pays x200: double
   what was asked, on a slip half as likely to come in. Someone who typed x100
   asked for x100. Auto stays one tap away for anyone who wants it. */
/* One entry per toggle, so turning everything else off leaves exactly one
   market and every leg of the slip is that market. That is the whole point
   of splitting the goals group: an all-Over-1.5 or all-first-half ticket is
   just this list with one thing in it. */
/* The payout target is deliberately NOT restored from a previous visit.
   Coming back to a wizard already set to x1000 was reported as a bug, and it
   is the same trap as a stored time-of-day filter: a narrowing choice made
   days ago, still in force, with nothing on screen saying so. The wizard's
   first-run state says "pick a payout - we'll find the games that reach it",
   and that is the right thing to show someone arriving fresh. Any stored value
   is cleared so nobody is left holding one. */
try{localStorage.removeItem("sw.wspodds");}catch(e){}
function wspMarkets(){var m=[];
  if(WSP.mk.wd)m=m.concat(["1X","X2"]);
  /* Either team to win. The wizard used to have no key for this at all, so the
     "Any winner" chip was drawn and could be tapped but changed nothing here -
     a market you could select and not get. Everything it needs already existed:
     dc12 for the probability, and no favourite rule, because either side
     winning does not depend on which one is favourite. */
  if(WSP.mk.any)m.push("12");
  if(WSP.mk.out)m=m.concat(["1","2"]);
  if(WSP.mk.o15)m.push("OVER_1.5");
  if(WSP.mk.o25)m.push("OVER_2.5");
  if(WSP.mk.o35)m.push("OVER_3.5");
  if(WSP.mk.fh)m.push("FH_OVER_0.5");
  /* Both sides go in the pool and the better one wins on its own merits.
     Unlike a match result, backing either team to score is a real bet
     regardless of who is favourite. */
  if(WSP.mk.tts)m=m.concat(["HOME_OVER_0.5","AWAY_OVER_0.5"]);
  if(WSP.mk.tts2)m=m.concat(["HOME_OVER_1.5","AWAY_OVER_1.5"]);
  if(WSP.mk.both)m.push("GG");
  /* THE DRAW, AND ONLY WHEN ASKED FOR. Off by default and absent from the
     Slider entirely: allowedMarkets never lists "X" and neither does the
     Slider's mkOn map, so no risk setting can reach a draw however far the
     dial goes. That is deliberate - the Slider picks on confidence against a
     floor, and a draw never clears a confidence floor worth having. Somebody
     who wants draws is making a different bet, and has to say so. */
  if(WSP.mk.draw)m.push("X");
  /* THE COMBINATIONS. Left out when they shipped, which made their chips
     controls that turn on and do nothing: the Slider knew them through
     allowedMarkets and the wizard did not, so a reader who switched the old
     chips off and these on was told there were no games to conjure. Both sides
     of a two-sided family go in the pool; which one is used is the model's
     call, the same as team goals above. */
  if(WSP.mk.dro25)m.push("MIX_X_OV_2.5");
  if(WSP.mk.drgg)m.push("MIXGG_X");
  if(WSP.mk.rsgg)m=m.concat(["MIXGG_1","MIXGG_2"]);
  if(WSP.mk.rso25)m=m.concat(["MIX_1_OV_2.5","MIX_2_OV_2.5"]);
  if(WSP.mk.weh)m=m.concat(["WINHALF_H_Y","WINHALF_A_Y"]);
  /* Bet9ja's own lines. bookAllows keeps them out of a SportyBet slip, and the
     filter below is what stops the wizard building one it cannot book. */
  if(WSP.mk.dro15)m.push("MIX_X_OV_1.5");
  if(WSP.mk.rso15)m=m.concat(["MIX_1_OV_1.5","MIX_2_OV_1.5"]);
  return m.filter(function(c){ return bookAllows(c,curBook()); });}

/* WHICH CHIP IS LIT. One line, and kept as a function rather than reading
   WSP.legodd in both places: the chip row and the preview cache key both ask
   this, so what the row shows cannot drift from what gets built. It briefly had
   a fourth answer, "slider", when Auto was a chip in this row. */
function wspStyleOn(){
  return WSP.legodd;
}

function wspBuild(){
  /* The Wizard's own method, always. It used to hand a payout to the Slider
     whenever the Slider could reach it, which on a big card was every rung on
     the ladder - so the Slip style chips changed nothing and were not even
     drawn. The Slider is its own tab now, reached by the link under the chips.
     See renderWizardPanel. */
  /* No handover any more. The Wizard was given a payout and quietly answered
     it with the Slider's method whenever the Slider could reach it, which is
     how "fewer games, bigger odds" came to do nothing on a big card. The Slider
     is a tab, reached by the link under Slip style. See renderWizardPanel. */
  var allowed=wspMarkets(),all=[];
  var seed=WSP.seed||0, shuffles=WSP.shuffles||0;
  function h32(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967296;}
  scopeFixtures().forEach(function(f){
    if(TOP_ONLY && isLowerFixture(f)) return;
    if(WSP.removed && WSP.removed[fid(f)]) return;
    var homeFav=f.home_p>f.away_p,cands=[];
    allowed.forEach(function(c){
      if(c==="1"&&!homeFav)return; if(c==="2"&&homeFav)return;
      if(c==="1X"&&!homeFav)return; if(c==="X2"&&homeFav)return;
      var v=mProb(f,c); if(v==null||isNaN(v))return;
      /* A DRAW NEVER CLEARS A HALF. Three-way probability puts it around 0.28
         on a typical fixture and it tops out near 0.33, so the flat 0.5 floor
         below rejects every one of them - adding "X" to the market list without
         this would have produced a toggle that turned on and changed nothing,
         which is the failure this builder keeps having.
         0.26 comes from measurement, not taste. Over 863 held-out matches on
         3 Sep 2026 the model's draw probability reached 0.30 on TWO of them -
         a floor there is a toggle that turns on and returns nothing. At 0.26
         and above it covers about a third of the card and those fixtures drew
         29.7% of the time, so the bar admits draws that actually land more
         often than the 24.2% base. The model reads low on draws, which is the
         same under-confidence the calibration work found elsewhere. */
      var floor=(c==="X")?0.26:(c==="GG")?0.42:0.5;
      if(v<floor)return;
      cands.push({f:f,id:fid(f),code:c,p:v,od:legOdd(f,c,v)});
    });
    if(!cands.length)return;
    var best=cands.reduce(function(a,b){return b.p>a.p?b:a;});
    /* Same rule the slider uses: in a game the model expects goals in, take
       Over 1.5 over a double chance. Both shuffles should behave alike. */
    var swapped=preferGoalsOverDouble(f,best,allowed,0.5);
    if(swapped!==best){
      var m=cands.filter(function(c){return c.code==="OVER_1.5";})[0];
      if(m) best=m;
    }
    best.cands=cands; all.push(best);
  });
  // Seed jitter so each shuffle surfaces a different mix; SA penalty keeps
  // Europe ahead even once South America is allowed into the pool.
  function key(c){return c.p*(1+(h32(c.id+"|"+seed)-0.5)*1.15);}
  function ranked(list,pen,asiaPen){
    function w(c){
      var m=1;
      /* A DRAW PAYS NO REGIONAL PENALTY, and leaving it to saWeight would have
         been worse than useless here: that function waives the penalty for
         fixtures the model expects GOALS in, so on a draw slip it would rank
         the high-scoring South American games above the grinding ones - the
         exact opposite of what a draw wants. The penalty exists to keep these
         leagues out of goals markets; on the one market where they are the
         best source on the board it has no business applying at all. */
      if(c.code==="X") return 1;
      if(isSouthAmerican(c.f)) m*=saWeight(c.f,pen);
      if(isAsian(c.f)) m*=(asiaPen==null?1:asiaPen);
      return m;
    }
    return list.slice().sort(function(a,b){ return key(b)*w(b)-key(a)*w(a); });}
  function accumulate(list){
    /* Spread the risk across MORE legs at a target per-leg odds derived from the
       payout, and - crucially - pick EACH fixture's market to sit near that
       target. A high payout pulls in the bigger-odds markets the user enabled
       (outright wins, both-teams-score); a low one favours safe double-chance.
       That is what makes the Slip-style and market toggles actually bite. */
    /* SportyBet has no practical ceiling here - 199 legs in one code came
       back fine - but forty is the limit that matters, and it is not a
       technical one. Forty legs is already the riskiest thing this site will
       build; a hundred and twenty priced at fifty billion is not a slip
       anybody can win, it is a lottery ticket wearing one. "Every game that
       qualifies" changes which games go in, never how many past this. */
    /* 1.4 is the Balanced chip. The default used to be 1.35, which matches no
       chip at all - so a first-time visitor got a slip built to a style that
       none of the three buttons showed as chosen, and tapping Balanced
       silently changed the result while appearing to change nothing. */
    var T=WSP.odds, cap=isJackpotOdds(T)?JACKPOT_LEG_CAP:40, per=WSP.legodd||1.4;
    /* Nothing to aim at yet - say so with an empty slip rather than
       inventing a target. */
    if(T==null && !WSP.everyGame) return {picks:[],odds:1,conf:0};
    /* "Every game that qualifies" asks a different question from "how many
       legs reach this payout", so the payout stops driving the count. Take
       the lot, up to the cap. */
    /* want and g are worked out further down, once the bookability helpers
       exist - the leg count depends on what the enabled markets actually cost,
       and that cannot be measured until we can tell a real odd from a guess.
       See reachablePerLeg. */
    var want, g;
    /* Prefer markets with REAL SportyBet odds: a market chosen off an estimated
       odd may not exist for that event at SportyBet, and the booking call then
       fails with "Sporty rejected the slip" (the "no market" error). When real
       odds exist for any candidate, only those are considered. */
    /* SPORTYBET'S PRICES ON PURPOSE, EVEN FOR ANOTHER BOOK'S SLIP, and this is
       not the legOdd bug repeated. These three - hasReal, priced, overpriced -
       ask "does this market exist on this fixture at all", and only SportyBet's
       feed can answer it: our sweep of the other two carries a handful of
       markets whatever we ask for, so bookVerdict returns "unknown" for them by
       design. Reading f[B.odds] here would treat BetKing's missing team-goals
       line as proof they do not sell it, when their own event card lists it -
       the builder would simply stop offering a default chip. Markets track each
       other across books (median 0.72% apart on the 9,683 prices compared on
       14 Sep), so SportyBet's listing is a sound proxy for all three, and
       overpriced's 5-point bar was fitted to SportyBet's board mean of -3.5
       and would mean something different against another distribution. */
    function hasReal(c){var o=c.f&&c.f.sportyOdds&&c.f.sportyOdds[c.code];return !!(o&&o>1.01);}
    /* Only markets SportyBet actually lists for this event.
       It used to fall back to the estimated-odds candidates when none of a
       fixture's markets were real - "prefer real, settle for anything". That
       put legs on the slip that cannot be placed: half the card carries no
       team-totals market at all (888 of 1797 fixtures on the day this was
       found), and asking to book one returns "invalid event data, no market
       there" and takes the whole slip down with it. One bad leg among forty
       loses all forty.
       A bet that cannot be placed is not a bet, so the fixture is dropped
       instead. The slip gets shorter; it also gets bookable. */
    /* Do we know what SportyBet lists for this fixture at all? Having no
       prices is not the same as having prices that exclude our market, and
       conflating them empties the whole builder whenever the odds feed is
       slow or down - a far worse failure than the one being fixed. */
    function priced(f){
      try{ return !!(f&&f.sportyOdds&&Object.keys(f.sportyOdds).length); }
      catch(e){ return false; }
    }
    /* How much probability a leg buys per unit of odds it costs.
       This replaced "pick the market whose odds sit nearest a per-leg target".
       With a payout to reach, the target fixes the PRODUCT of the odds, so the
       only question that matters is which legs get there with the fewest
       chances to be wrong - and that is this ratio, not raw confidence.
       Measured on a live board: reaching x10 out of the highest-confidence
       markets takes 25 legs and lands 2.9% of the time; out of the best-edge
       markets it takes 7 and lands 21.5%. Seven times better, from the same
       board and the same model. The safest tips are safest because they pay
       least, so more of them are needed, and the compounding eats the safety
       and then some.
       Both logs are negative-over-positive, so the value is negative and
       LARGER is better. */
    function edge(c){
      var od=c.od;
      if(!(od>1.0001)) return -Infinity;
      var pr=Math.min(0.999,Math.max(0.001,c.p));
      return Math.log(pr)/Math.log(od);
    }
    /* WHICH MARKET on a given fixture is a different question from which
       fixtures to use, and it wants a different answer.
       Ranking markets by edge too was measured and rejected: it reaches for
       the longer market on every fixture, which dropped average confidence
       from 69% to 58% while the landing rate rose. Efficiency across fixtures
       is worth having; buying it twice on the same match is not, because the
       second helping comes straight out of how sure we are of each pick.
       So the safest market we can actually book, always. The efficiency comes
       from choosing WHICH fixtures to back, below. */
    /* The safest market that reaches the odds this SLIP STYLE is built around.
       Both halves matter and dropping either one breaks something:
       Safest-with-no-floor makes every leg roughly 1.2-1.4, so the leg count
       can barely move and all three styles collapsed onto the same 20-23 leg
       slip - the buttons stopped meaning anything.
       Floor-with-no-safety reaches for the longest market on every fixture and
       cost eight points of average confidence.
       So: `g` is the per-leg odds this style needs across `want` legs, and
       among the markets that clear it we take the highest probability. A small
       tolerance below g, because insisting on the exact figure throws away a
       much safer market that falls a hair short.
       This is what makes the styles a real choice rather than three names for
       one slip. More games means shorter legs and more of them, each one
       likelier on its own; fewer games means longer legs and fewer, less
       likely one by one. That trade is the honest content of the setting. */
    /* How far above the per-leg need a market may sit before it stops being a
       fit for THIS slip.
       The floor alone was half a rule. It said "long enough" and never said
       "not longer than we asked for", so on a lopsided match - where every safe
       market is priced at 1.03 to 1.14 - the only thing clearing a 1.25 need was
       the underdog side at 1.91, and the slip took it. Not because it wanted
       risk, but because safety had been filtered out and nothing stopped the
       overshoot.
       Reported as: Estoril and Vallecano to score arriving on a "more games,
       lesser odds" slip and surviving every shuffle. Both were the top two by
       edge on the board, at 64-65% confidence, in a style whose name promises
       the opposite.
       Measured on that board at g=1.25: ceilings of x1.25, x1.30, x1.40 and
       x1.50 all give the same 12 fixtures in band at 75% average confidence,
       and x1.75 lets both offenders back in at 74%. A flat plateau, so x1.40
       sits in the middle of it rather than on the edge of a cliff - this is not
       tuned to one afternoon. */
    /* WHAT A LEG ACTUALLY COSTS IN THE MARKETS THAT ARE ON.
       The per-leg target used to be the Slip-style figure outright - 1.4 for
       Balanced - and the band below spans 0.92 to 1.40 of it, so the builder
       would only ever accept legs priced about 1.3 to 2.0. That is fine while
       the enabled markets can be bought at those prices. It is fatal the
       moment they cannot.
       Reported as: turning on Draw and getting "No games to conjure", and
       getting it on "all upcoming" too - which is the tell, because that path
       pins g at 1.01 and so narrows the ceiling to 1.41 rather than widening
       anything. A draw is priced around 3.2. Every draw overshot the band,
       nothing sat under it, so bestOf returned null on EVERY fixture and the
       slip came back empty. The toggle turned on and returned nothing, which
       is the exact failure this builder keeps having.
       So ask the board rather than assuming: take each fixture's cheapest
       bookable candidate and use the median across fixtures. With the usual
       spread of markets on that lands near 1.05 and max() below leaves the
       Slip style in charge exactly as before - this changes nothing for any
       existing slip. It only bites when the user has narrowed the markets to
       ones that are inherently long, and then it tells the truth: a slip of
       draws reaches x100 in five legs, not fourteen. */
    function reachablePerLeg(){
      var mins=[];
      list.forEach(function(c){
        var cs=c.cands||[{f:c.f,id:c.id,code:c.code,p:c.p,od:c.od}];
        var usable=cs.filter(hasReal).concat(
          cs.filter(function(x){ return !fetchedMarket(x.code); }));
        if(!usable.length){
          if(cs.length&&priced(cs[0].f)) return;   // unbookable, dropped anyway
          usable=cs.filter(function(x){ return safeUnpriced(x.code); });
        }
        if(!usable.length) return;
        mins.push(usable.reduce(function(a,b){ return b.od<a.od?b:a; }).od);
      });
      if(!mins.length) return 1.01;
      mins.sort(function(a,b){ return a-b; });
      return mins[Math.floor(mins.length/2)] || 1.01;
    }
    var reach=reachablePerLeg();
    /* The style still sets the ambition; the board sets the floor. */
    var perEff=Math.max(per, reach);
    want=WSP.everyGame
      ? Math.min(cap,list.length)
      : Math.max(4, Math.min(cap, Math.ceil(Math.log(T)/Math.log(perEff))));
    /* With no payout to hit there is no per-leg target to aim at either, so
       aim low: the nearest-to-target rule below then picks each game's safest
       available market instead of stretching for odds. Low still has to mean
       reachable, though - pinned flat at 1.01 this was the second half of the
       empty-draw-slip bug. */
    g=WSP.everyGame ? Math.max(1.01, reach*0.95) : Math.pow(T,1/want);
    /* The value cap sits ABOVE the OVERSHOOT constant deliberately.
       test/overshoot.test.js finds bestOf by taking the first
       `function ` after `var OVERSHOOT=`, so a function declared
       between the two is lifted instead of bestOf and every test in
       that file throws. Keep bestOf the first function after it. */
    /* DO NOT BUY OUR OWN DISAGREEMENT WITH THE BOOK.
       Measured on a 394-fixture board, our probability minus the bookmaker's
       implied one, averaged:

         every priced option on the board   -3.5 pts   we are higher on 26%
         "more games" legs chosen           -0.6 pts   ...on 39%
         "balanced" legs chosen            +10.1 pts   ...on 80%
         "fewer games" legs chosen         +14.8 pts   ...on 100%

       The model is not over-confident - across the whole board it sits BELOW
       the book on every market. What went wrong is what the builder SELECTS.
       On a lopsided fixture every safe market is priced 1.05-1.10, all of it
       under the band, so the only thing in range is the unlikely thing; and
       then `edge` prefers exactly those, because a high probability at a long
       price looks efficient. But a high probability at a long price is, by
       definition, where our number disagrees with the market's - so the band
       and the edge ranking together act as a filter that isolates our own
       errors, and the higher the per-leg target the purer that filter gets.
       At "fewer games" it was 100% pure.

       Reported as: "Monaco against PSG to score, Betis to score against
       Madrid - these teams are playing against giants and might not be able
       to score". Correct. Across 1,752 matches in five top leagues, against a
       favourite at 65%+ the underdog scored in 52-56% of them; those legs
       were claiming 63-74%.

       THIS IS NOT A RULE AGAINST TEAM-TO-SCORE. That market grades 81.6%
       against 78% claimed and is one of the best calibrated on the board - a
       ban on it was tried before and was wrong. The aggregate is carried by
       FAVOURITES scoring, which happens 91-98% of the time; the underdog
       subset is where it breaks, and the average hides it. So the rule is
       about the gap, not the market, and it applies to every market equally.

       5 points, because the board's own mean is -3.5: a leg we like five
       points more than the book is ordinary disagreement, and +10 to +15 is
       where the losers live. Only real prices are judged - an estimated odd
       carries no opinion from anybody to disagree with. */
    var VALUE_CAP=0.05;
    function overpriced(c){
      var od=c.f&&c.f.sportyOdds&&c.f.sportyOdds[c.code];
      if(!(od>1.01)) return false;          /* no book price, no opinion */
      return (c.p - 1/od) > VALUE_CAP;
    }
    var OVERSHOOT=1.40;
    var PROVEN=provenMarkets();
    function bestOf(pool){
      /* Applied to the whole pool before anything is ranked, so a capped leg
         cannot win the band, the under-band fallback, or the tie-break. If it
         empties the fixture, the fixture is dropped - there are 394 of them
         and this one was only ever going to be sold on our own error. */
      pool=pool.filter(function(c){ return !overpriced(c); });
      if(!pool.length) return null;
      var lo=g*0.92, hi=g*OVERSHOOT;
      /* In the band: the safest one, exactly as before. */
      var band=pool.filter(function(c){ return c.od>=lo&&c.od<=hi; });
      /* A market with a published record comes first. Only when nothing
         proven fits this slip do we reach for one we have never graded. */
      var tried=band.filter(function(c){ return isProven(c.code,PROVEN); });
      if(tried.length) return tried.reduce(function(a,b){ return b.p>a.p?b:a; });
      if(band.length) return band.reduce(function(a,b){ return b.p>a.p?b:a; });
      /* Everything too SHORT is fine - it just carries less toward the payout,
         and the ranking below already knows that. But "take the longest of
         those" was the wrong way to choose between them: on Benfica v Estoril
         the short markets are 1X at 1.03/82%, Over 1.5 at 1.09/81% and Benfica
         at 1.14/60%, and longest-wins picks the 60% one - the least confident
         of the three - for four pence of extra payout.
         Reported as: "benfica still has usable markets in my opinion." It does,
         and they are the other two.
         So rank them the way every other choice here is ranked: by edge, the
         probability bought per unit of odds. That takes Over 1.5 (-2.44) over
         Benfica (-3.95) and over 1X (-6.83), which is both the safest usable
         leg and the one that carries most per chance of being wrong. */
      var under=pool.filter(function(c){ return c.od<lo; });
      var underOk=under.filter(function(c){ return isProven(c.code,PROVEN); });
      if(underOk.length) return underOk.reduce(function(a,b){ return edge(b)>edge(a)?b:a; });
      if(under.length) return under.reduce(function(a,b){ return edge(b)>edge(a)?b:a; });
      /* Only markets far longer than this slip asked for. That is the fixture
         offering a bet nobody ordered, so it is declined rather than stretched
         to fit. Dropping one fixture costs a leg; taking it costs the meaning
         of the style. */
      return null;
    }
    function pickFrom(cs){
      var real=cs.filter(hasReal);
      if(real.length) return bestOf(real);
      /* Prices exist for this fixture and none of our markets is among them,
         so the leg cannot be placed - drop the fixture. With no prices at all
         we know nothing, and an estimated odd is the honest best guess. */
      /* Off-sweep markets first: the cache has nothing to say about them, so
         a fixture that carries prices for other markets must not take them
         down with it. */
      var offSweep=cs.filter(function(c){ return !fetchedMarket(c.code); });
      if(offSweep.length) return bestOf(offSweep);
      if(cs.length&&priced(cs[0].f)) return null;
      /* No prices at all for this fixture, so these are our own estimates.
         Stay inside the markets SportyBet always carries: a guessed team-goals
         leg is listed on only ~70-76% of events and was coming back as "no
         market" at booking time. */
      var guessable=cs.filter(function(c){ return safeUnpriced(c.code); });
      return guessable.length?bestOf(guessable):null;
    }
    var chosen=[];
    list.forEach(function(c){
      var cs=c.cands||[{f:c.f,id:c.id,code:c.code,p:c.p,od:c.od}];
      var pick=pickFrom(cs);
      if(!pick) return;
      /* The alternatives a later phase may swap this leg to, and they must
         carry the value cap too. Two loops below reach into _alts to LENGTHEN
         a leg - the overshoot trim and the "still short" rescue - and neither
         re-checks how the price got there. Filtering bestOf alone left a hole
         they both walked through: Porto v Moreirense went on a slip at 2.45
         with our number 15 points above the book, which is exactly the leg
         the cap exists to refuse. Filter once, here, and no phase can
         reinstate one. */
      var alts=cs.filter(hasReal);
      if(!alts.length) alts=cs;
      var altsOk=alts.filter(function(x){ return !overpriced(x); });
      chosen.push({f:c.f,id:c.id,code:pick.code,p:pick.p,od:pick.od,
                   _alts:altsOk.length?altsOk:[pick]});
    });
    /* Soft league cap: spread legs across leagues instead of stacking one, but
       only as a PREFERENCE - the payout target is never sacrificed for it. A
       per-league penalty nudges selection away from leagues already well
       represented; because it's small and bounded, a leg that's a much better
       odds fit still wins. Applied in BOTH phases so the fill-to-target step
       (below) can't quietly re-stack one league. LEAGUE_PEN is the dial:
       higher = more spread, lower = closer to pure odds-proximity. */
    var LEAGUE_PEN=0.30;
    function lgOf(c){return countryOf(c.f.league);}
    /* Order the fixtures the same way: best probability-per-unit-of-odds first,
       so the slip reaches its payout through the fewest results that have to
       come in. `_cost` is minimised below, hence the negation.
       Slip style still bites, and still means what it says. It tilts the
       ranking toward shorter or longer legs, which is what changes how many
       games end up on the slip - it just no longer does so by ignoring which
       legs are actually worth taking. The tilt is deliberately smaller than
       the edge term, so a much better leg still wins whatever the style. */
    /* Raised from 0.35, which was too weak to matter once legs were ranked
       by edge: all three styles returned the same 18-21 leg slip, so the
       buttons had stopped doing anything. At 1.2 the spread is visible
       again - roughly 25 legs against 21 at a x1000 target - without
       swamping the ranking that makes the slip worth taking. "Fewer games"
       is floor-limited by the board: below about twenty legs there are
       simply not enough long-odds games to reach a big payout. */
    var styleTilt=(per<=1.3?-1.2:(per>=1.6?1.2:0));
    /* Read once, before the costs are set - it is the same for every leg. */
    var _use=slipUse();
    chosen.forEach(function(c){
      /* Shuffle jitter, widening each time it is asked for.
         Reported: "when i shuffle, some games dont leave the ticket".
         Measured on a x100 target: 24 candidates for a 12-leg slip, costs
         running 0.55 to 1.43. Around the cutoff the gaps between adjacent
         legs are 0.003 to 0.046, so a jitter of +/-0.05 swaps those freely -
         eight of the twelve slots did rotate. But the best leg sat at 0.55
         with a 0.22 gap to the next, and the twelfth at about 1.06, so the
         top six could not be displaced by any amount this jitter could
         reach. Those were the six that never left.
         Widening it flat would mean routinely trading a 0.55 leg for a 1.0
         one - paying for variety with the quality that makes the slip worth
         taking. So it escalates instead: the first shuffle varies the
         margins, and somebody still shuffling on the fourth is plainly
         asking for different GAMES rather than a different arrangement of
         the same ones. Same escalation the South America and Asia gates use
         a few lines down, and for the same reason. */
      var jit=Math.min(0.50,0.10+0.13*shuffles);
      /* THE ONE LEG A SHUFFLE COULD NEVER MOVE.
         Reported: "it took me about 30 shuffles before the biggest odd on my
         slip was shuffled out." Arithmetic, not luck. The style tilt is
         1.2 x log(odds), so at "Fewer games" a 1.9 leg sits 0.55 below a 1.2
         one before anything else is counted - and the jitter spans at most
         +/-0.25, so no draw of it can span that gap. The only thing that could
         was SPREAD_PEN, a flat 0.15 for being on the slip already, which needs
         to stack four deep to matter and only stacks through saved slips.
         So the penalty for "you are already on this ticket" now escalates the
         way the jitter does. A first shuffle nudges; the fourth is a reader
         plainly asking for different games and pushes 0.6, past any tilt a leg
         on this board can earn. Capped, so a shuffled slip never turns into
         the worst legs available. */
      var repeat=Math.min(0.90,SPREAD_PEN*(1+0.9*shuffles));
      c._cost=-(edge(c)+styleTilt*Math.log(c.od))+(h32(c.id+"|s"+seed)-0.5)*jit
        +repeat*(_use[c.id]||0);
      /* A fixture SportyBet lists no prices for at all is still allowed - not
         knowing its markets is not the same as knowing it has none - but it
         goes to the back of the queue. Its odds are our estimate rather than a
         quote, and it is the one leg that might not be placeable, so there is
         no reason to reach for it while priced fixtures remain. */
      if(!priced(c.f)) c._cost+=1.0;
    });
    var picks=[],used={},prod=1,lc={},mc={};
    /* Spread across MARKETS as well as leagues.
       Choosing each fixture's safest market independently collapses the whole
       slip onto one market, because whichever market is safest tends to be
       safest on every game - enable Team over 0.5 and a team scoring at all is
       the safest thing on the board, so all forty legs became Team over 0.5.
       Reported as the wizard ignoring the other options, and it was: they were
       selected, they were eligible, and nothing ever reached them.
       So the market is settled when the leg is taken rather than before, with a
       penalty for one already well used - the same shape as the league spread
       beside it. Small and bounded, so a clearly safer market still wins; it
       takes several legs of the same market before another gets the nod.
       Turning every other market OFF still gives a single-market ticket,
       because then there is nothing else to reach for - which is the point of
       the toggles. */
    var MARKET_PEN=0.055;
    function marketFor(c){
      var alts=c._alts||[];
      if(alts.length<2) return c;
      var best=null,bs=-Infinity,floor2=g*0.92;
      /* Only markets that still reach the style's per-leg odds, or the spread
         would quietly hand back the shorter legs bestOf just ruled out and
         undo the style along with them. */
      var elig=alts.filter(function(a){ return a.od>=floor2; });
      if(!elig.length) elig=alts;
      for(var i=0;i<elig.length;i++){
        var a=elig[i];
        /* Never trade a placeable leg for one SportyBet does not price. */
        if(hasReal(c)&&!hasReal(a)) continue;
        var sc=Math.log(Math.max(0.001,a.p))-MARKET_PEN*(mc[a.code]||0);
        if(sc>bs){bs=sc;best=a;}
      }
      if(!best) return c;
      c.code=best.code; c.p=best.p; c.od=best.od;
      return c;
    }
    function take(c){
      marketFor(c);
      used[c.id]=1; picks.push(c); prod*=c.od;
      lc[lgOf(c)]=(lc[lgOf(c)]||0)+1; mc[c.code]=(mc[c.code]||0)+1;
    }
    /* Phase 1 - take the best-ranked legs, spread across leagues, but stop the
       moment the payout is reached. `want` is now a ceiling rather than a
       quota: it is what slip style asks for, and there is no reason to keep
       adding results that have to come in after the target is already met.
       That alone was most of why "Safer, more games" landed least often. */
    while(picks.length<want && (WSP.everyGame||WSP.odds==null||prod<T)){
      /* The multiple still needed. Null when there is no payout to aim at. */
      var need1=(WSP.everyGame||WSP.odds==null)?null:T/prod;
      var b1=null,s1=Infinity, fin1=null,f1=Infinity;
      for(var i=0;i<chosen.length;i++){ var c=chosen[i]; if(used[c.id]) continue;
        var pen1=LEAGUE_PEN*(lc[lgOf(c)]||0);
        var sc=c._cost+pen1; if(sc<s1){s1=sc;b1=c;}
        /* A leg that on its own carries us over the line. */
        if(need1!=null && c.od>=need1){
          var over1=Math.log(c.od/need1)+pen1;
          if(over1<f1){f1=over1;fin1=c;} } }
      /* If any single leg finishes the slip, take the one that clears the
         target by the LEAST rather than the best-ranked one.
         Phase 2 has done this for a while; phase 1 did not, and phase 1 is
         where most slips actually finish - so the careful rule below almost
         never ran. Sitting on x45 against a x50 target, this loop would take
         its best-ranked leg at 1.55 and hand back x70.
         Reported as: "i asked for 50 odds, it gave me 70. theres no need to
         over compensate and pick crazy games like so." Exactly right, and the
         overshoot is what forced the crazy games: a target beaten by 40% was
         reached through longer legs than the payout ever needed, which on a
         lopsided fixture means the weaker side to score.
         The promise is still "at least what you asked for". It is simply no
         longer beaten by more than it needs to be. */
      var take1=fin1||b1;
      if(!take1) break; take(take1);
    }
    /* THE STYLE ASKED FOR A LENGTH, SO HONOUR IT BEFORE ADDING LEGS.
       Reported with two screenshots of the same board and the same payout:
       "More games" returned 17 legs and "Fewer games" returned 20. Reproduced
       on the live board at x100 - 1.25 gave 20 legs, 1.4 gave 16, and 1.7 gave
       20, with a geometric mean leg of 1.267 against 1.334 for Balanced. The
       chips were inverted in fact as well as in name.
       The mechanism: want is ceil(log T / log per), so "Fewer games" stops
       phase 1 at nine legs. Nine legs at what this board actually pays reached
       about x38 of the x100 asked for, and phase 2 then padded the gap with
       eleven legs averaging 1.05 - a result that has to come in for four per
       cent of odds, eleven times over. The slip ended longer than the one built
       to be long, and weaker.
       Lengthening the legs it already has is what "Fewer games, bigger odds"
       means, and the loop to do it was already here - it just sat AFTER the
       padding, as a last resort for a thin card. It runs first now: reach the
       payout through the legs the style asked for, and only add more when the
       markets on those legs cannot get there. "More games" is unaffected, since
       its phase 1 reaches the target before want runs out. */
    if(picks.length>=want) lengthenToTarget();
    /* Phase 2 - still short of the target, so add legs until it is reached.
       This used to take the BIGGEST remaining odds every time, to "close the
       gap fast". That overshoots by construction, and measurably: across 105
       wizard slips it never once undershot, cleared the target by more than
       10% on 79 of them, and ran 1.30x over in the median case. On 69 slips
       dropping a single leg would have landed closer to what was asked for.
       That is not a free bonus. An extra leg is another result that has to
       come in, and on those slips it cost 31% of the chance of landing - a
       x1000 request quietly became a longer, less likely x1399.
       So: once ANY single leg can carry us over the line, take the one that
       clears it by the least. Only while no single leg is enough does taking
       the biggest still make sense, which is the case this rule started from.
       The target is still always reached - "at least what you asked for" is
       the promise - it is simply no longer beaten by more than it needs to be. */
    while(prod<T && picks.length<cap){
      var need=T/prod;                 // the multiple still required
      var enough=null,eScore=Infinity, big=null,bScore=-Infinity;
      for(var k=0;k<chosen.length;k++){ var c2=chosen[k]; if(used[c2.id]) continue;
        var pen=LEAGUE_PEN*(lc[lgOf(c2)]||0);
        if(c2.od>=need){
          /* Overshoot this leg would cause, in log space, plus the usual nudge
             toward a league not already represented. */
          var over=Math.log(c2.od/need)+pen;
          if(over<eScore){eScore=over;enough=c2;}
        } else {
          var sc2=Math.log(c2.od)-pen;
          if(sc2>bScore){bScore=sc2;big=c2;}
        }
      }
      var next=enough||big;
      if(!next) break;
      take(next);
    }
    /* Still short after every fixture on the board has been used. That happens
       on a thin card, and the promise is "at least the payout you asked for" -
       so lengthen legs rather than hand back a slip that misses.
       Cheapest first: each step costs the least confidence per unit of odds it
       buys, which is the same measure the fixtures were ranked by. Nothing is
       lengthened unless the target genuinely cannot be reached without it, so
       on an ordinary board this loop never runs at all. */
    function lengthenToTarget(){
      if(WSP.everyGame || T==null || !(prod<T)) return;
      for(var guard=0; guard<200 && prod<T; guard++){
        var bestSwap=null, bestCost=Infinity;
        for(var pi=0; pi<picks.length; pi++){
          var leg=picks[pi];
          for(var ai=0; ai<(leg._alts||[]).length; ai++){
            var alt=leg._alts[ai];
            if(!(alt.od>leg.od)) continue;
            /* Never lengthen a placeable leg into one that cannot be booked. */
            if(hasReal(leg)&&!hasReal(alt)) continue;
            /* Nor lengthen a graded market into one we have never checked.
               This loop exists to reach the payout, and reaching it through a
               market with no record is exactly the trade the user rejected:
               "thats not how our gambling works... its about the likelyhood
               of the games coming." If the board cannot get there on tested
               markets, the slip comes back short and says so. */
            if(isProven(leg.code,PROVEN)&&!isProven(alt.code,PROVEN)) continue;
            /* Confidence given up per unit of odds gained. */
            var cost=(Math.log(leg.p)-Math.log(Math.max(0.001,alt.p)))/
                     (Math.log(alt.od)-Math.log(leg.od));
            if(cost<bestCost){ bestCost=cost; bestSwap={leg:leg,alt:alt}; }
          }
        }
        if(!bestSwap) break;
        prod=prod/bestSwap.leg.od*bestSwap.alt.od;
        bestSwap.leg.code=bestSwap.alt.code;
        bestSwap.leg.p=bestSwap.alt.p;
        bestSwap.leg.od=bestSwap.alt.od;
      }
    }
    lengthenToTarget();
    /* Whether we got there. The promise used to be "at least the payout you
       asked for", kept by stretching legs until the number was met. That is
       the wrong promise: it buys a figure with games we would not otherwise
       have chosen. Report the shortfall instead and let the slip be honest. */
    /* EVERY STYLE LANDS ON THE SAME SLIP WHEN THE BOARD RUNS OUT.
       Reported as "I change slip style and it stays on 21 games". It was not
       the chips: on a one-day window at x2000 the pool holds 21 games we rate,
       every style asks for more legs than that or cannot reach the payout
       inside its own leg count, and both phases stop on an empty pool. Three
       chips over a number none of them can move is the dead-controls failure,
       so the panel says which it is - and it can only be said from here,
       because `want` is not what pins it and the pool size is not visible
       outside this function. */
    return {picks:picks,odds:prod,short:(!WSP.everyGame&&T!=null&&prod<T*0.995),
            exhausted:(!WSP.everyGame&&T!=null&&picks.length>=chosen.length)};
  }
  var euro=all.filter(function(c){return !isSouthAmerican(c.f)&&!isAsian(c.f);});
  /* Same policy as the slider builder: Europe alone unless there are too few
     European games to make a slip, or the user has reshuffled a couple of
     times. "fill" keeps Europe ahead with a light penalty; "mix" (shuffling)
     lets more South America through. A high payout Europe can't reach is not
     a reason to reach for South America - the slip just falls short, and the
     user can shuffle if they want to chase it with a wider net. */
  var saMode=(euro.length<SA_MIN_EURO)?"fill":(shuffles>=2?"mix":"exclude");
  /* Asia waits longer than South America - three shuffles rather than two -
     and only joins at all once Europe cannot fill the slip on its own. Its own
     bar, lower than South America's: sharing SA_MIN_EURO meant any thinned
     card let Japan and China straight in. */
  var asiaMode=(euro.length<ASIA_MIN_EURO)?"fill":(shuffles>=3?"mix":"exclude");
  /* A DRAW REOPENS THE DOOR, FOR THE DRAW AND NOTHING ELSE.
     The exclusion above exists because these leagues grind: they are a poor
     source of goals markets, which is what the rest of this builder is mostly
     buying. For a DRAW that same grinding is the merit, not the fault.
     Measured on a 409-fixture board: South American fixtures average a draw
     probability of 0.298 against 0.262 everywhere else, and 86% of them clear
     the draw floor against 58% of the rest. They are the single most
     draw-prone region on the card - and every one of them was being removed
     from the pool before ranking began, because with a full European card
     saMode and asiaMode both settle on "exclude" and only 2-3 shuffles undo
     it. Reported as: "im barely seeing any of those there".
     So a fixture barred by region is readmitted when the user has asked for
     draws AND the fixture actually offers one. It comes back carrying ONLY
     its draw candidate: admitted for the draw, it cannot then be spent on an
     Over 1.5 - which would be the exclusion quietly leaking through a door
     opened for something else. */
  var drawsOn=!!(WSP.mk&&WSP.mk.draw);
  var poolList=[];
  all.forEach(function(c){
    var barred=(saMode==="exclude"&&isSouthAmerican(c.f))||
               (asiaMode==="exclude"&&isAsian(c.f));
    if(!barred){ poolList.push(c); return; }
    if(!drawsOn) return;
    var dc=(c.cands||[]).filter(function(x){return x.code==="X";});
    if(!dc.length) return;
    poolList.push({f:c.f,id:c.id,code:"X",p:dc[0].p,od:dc[0].od,cands:dc});
  });
  var pool=ranked(poolList,
                  saMode==="mix"?0.75:0.92,
                  asiaMode==="mix"?1:0.8);
  return accumulate(pool);
}
/* THE HIGHEST PAYOUT THIS BOARD CAN ACTUALLY BUILD, asked of the builder.
   Reported: on a card full of games, typing anything over x6,000 answered "that
   needs a wider window" - while the Slider, on that same day at its riskiest,
   built over x100,000. Both are true of the same fixtures, so one of them was
   lying about the board, and it was this one: the jackpot rungs were gated on
   SCOPE==="all" and nothing else. The window is not the question. A thin
   Tuesday with eleven games cannot reach x20,000 on any scope and a full
   Saturday reaches it on Today alone, and only the pool knows which is in front
   of the reader.
   Measured by asking for more than any board holds and reading what comes back
   short - wspBuild already returns its best effort and says it fell short, so
   there is no second estimator here to disagree with the first.
   Cached on everything the pool depends on EXCEPT the payout, which is the one
   thing it must not depend on: renderWizardPanel runs on every chip tap. */
var WSP_REACH={sig:null,max:0};
function wspMaxReach(){
  var sig=[wspStyleOn(),JSON.stringify(WSP.mk),!!TOP_ONLY,SCOPE,SDAY,SPAN,TOD,
           !!WSP.everyGame,WSP.seed,WSP.shuffles,
           Object.keys(WSP.removed||{}).length].join("|");
  if(WSP_REACH.sig===sig) return WSP_REACH.max;
  var was=WSP.odds;
  try{
    WSP.odds=1e12;
    var r=wspBuild();
    WSP_REACH.max=(r&&isFinite(r.odds))?r.odds:0;
  }catch(e){
    /* Never let a probe decide nothing can be built: on an error the ladder
       falls back to offering the jackpot rungs, which is what it did before
       this existed. */
    WSP_REACH.max=Infinity;
  }
  WSP.odds=was;
  WSP_REACH.sig=sig;
  return WSP_REACH.max;
}
// --- Wizard panel rendering (replaces renderWsp) ---
/* WHICH TOGGLE PRODUCES WHICH LEG. Kept beside the chips rather than derived,
   because the mapping is the one thing that would silently rot: a market added
   to wspMarkets and not to this list simply stops being reported on. */
var MKT_CODES={wd:["1X","X2"],any:["12"],out:["1","2"],o15:["OVER_1.5"],
  o25:["OVER_2.5"],o35:["OVER_3.5"],fh:["FH_OVER_0.5"],
  tts:["HOME_OVER_0.5","AWAY_OVER_0.5"],tts2:["HOME_OVER_1.5","AWAY_OVER_1.5"],
  both:["GG"],draw:["X"]};

/* A MARKET YOU SWITCHED ON THAT CHANGED NOTHING LOOKS BROKEN.
   Measured on a 394-fixture board: turning "Team over 1.5" on at Balanced
   produces a slip byte-identical to leaving it off, and turning on Over 3.5
   does the same. Neither is a fault - a team scoring twice is genuinely
   unlikely, only 101 of 790 candidates clear the 50% floor, and the survivors
   are priced 1.9 to 3.0 while the Balanced band is 1.28 to 1.95. At Fewer
   games the band moves to 1.53-2.34 and four of nine legs become team-over-1.5
   immediately.
   But the panel said none of that, and a control that visibly does nothing is
   indistinguishable from one that is broken - the same failure as the league
   picker showing five of twenty-eight leagues correctly and explaining
   nothing. So name it, and say where it WOULD work. */
function idleMarkets(picks){
  var used={}; (picks||[]).forEach(function(p){ used[p.code]=1; });
  var out=[];
  Object.keys(MKT_CODES).forEach(function(k){
    if(!WSP.mk[k]) return;
    if(MKT_CODES[k].some(function(c){ return used[c]; })) return;
    out.push(k);
  });
  return out;
}
/* WHY IT SAT OUT. Three different answers and only one of them is worth
   acting on, so guessing between them is worse than saying nothing.
     "floor"     nothing on the card clears the market's confidence bar
     "range"     it would appear at a longer slip style - actionable
     "outranked" it is in range, another market was simply safer every time
   The middle one is decided by ASKING rather than by modelling the band: the
   slip is rebuilt at the longest style and we look. Reconstructing `g` out
   here would mean a second copy of the per-leg target arithmetic, which is
   exactly the sort of thing that drifts and then gives confident wrong advice.
   One extra build of a 400-fixture board costs a few milliseconds, and only
   when a market actually sat out. */
function idleReason(k, longStyle){
  var codes=MKT_CODES[k], any=false;
  scopeFixtures().forEach(function(f){
    codes.forEach(function(c){
      var p=mProb(f,c);
      if(p==null||isNaN(p)) return;
      var floor=(c==="X")?0.26:(c==="GG")?0.42:0.5;
      if(p>=floor) any=true;
    });
  });
  if(!any) return "floor";
  return codes.some(function(c){ return longStyle[c]; }) ? "range" : "outranked";
}
/* What the slip would contain at the longest style, so idleReason can check
   whether a market is merely priced out of the one in use. Built once per
   note however many markets sat out. */
function longStyleCodes(){
  var was=WSP.legodd, seen={};
  try{
    WSP.legodd=1.7;
    wspBuild().picks.forEach(function(p){ seen[p.code]=1; });
  }catch(e){}
  WSP.legodd=was;
  return seen;
}
function renderIdleMarkets(picks){
  var host=$("mkIdle"); if(!host) return;
  var idle=idleMarkets(picks);
  if(!idle.length){ host.innerHTML=""; return; }
  /* The label is read off the chip itself, not from a second copy of the
     list. MKT_CFG is local to renderShared, and duplicating its labels here
     would give the same market two names that drift apart the first time one
     is reworded. The chip is what the reader is looking at, so the note should
     use its exact words. */
  var names=idle.map(function(k){
    var el=document.querySelector('.mkt-chip[data-m="'+k+'"] span:not(.tier-badge):not(.mkt-icon)');
    return (el&&el.textContent.trim())||k;
  });
  /* One line however many markets sat out - a list of reasons is longer than
     the chip row it is explaining, and on a phone that is most of a screen.
     So the reasons are collapsed to the most useful one present: if any of
     them would come back at a longer style, that is the sentence worth
     showing, because it is the only one the reader can act on. */
  var longStyle=(WSP.legodd<1.7)?longStyleCodes():{};
  var reasons=idle.map(function(k){ return idleReason(k,longStyle); });
  var reason = reasons.indexOf("range")>=0 ? "range"
             : (reasons.indexOf("outranked")>=0 ? "outranked" : "floor");
  var tail = (reason==="floor")
    ? "no game clears its confidence bar today."
    : (reason==="range")
      ? "priced above this slip style - try <b>Fewer games</b>."
      : "a safer market won on every game.";
  host.innerHTML="<p class='mk-idle'><span>"+esc(names.join(", "))+
    "</span> added nothing: "+tail+"</p>";
}

function wspConjure(shuffle){
  if(shuffle){WSP.seed=Math.floor(Math.random()*1e6);WSP.shuffles=(WSP.shuffles||0)+1;}
  /* A fresh conjure is a new question, so the shuffle escalation starts over.
     The counter only ever incremented, which would have left a session that
     shuffled once permanently jittery for every target chosen afterwards. */
  else {WSP.removed={};WSP.shuffles=0;}
  WSP._sig=null;  // force a fresh build (not the cached slip)
  WSP.conjured=true;
  var r=wspBuild();
  if(!r.picks.length){WSP.conjured=false;window.swToast&&window.swToast("No games to conjure right now","err");return;}
  renderBuilder();
  /* Deferred, because working out WHY a market sat out costs a second build of
     the whole board - up to 260ms measured on a 400-fixture card, and a phone
     is slower than that. The slip is what was asked for; a footnote explaining
     a chip must not stand in front of it. Rendered on the next frame, by which
     time the sheet is already up. */
  setTimeout(function(){ try{ renderIdleMarkets(r.picks); }catch(e){} },0);
  /* The conjured legs go into My slip and the sheet comes up with them. The
     wizard panel keeps the numbers - games, confidence, odds - and the slip
     itself is read where it can be acted on, which is also where Get code
     lives. auto:true marks them as machine-picked, so a later conjure
     replaces them and leaves anything hand-picked alone. */
  MYSLIP=MYSLIP.filter(function(x){return !x.auto;})
    .concat(r.picks.map(function(c){
      return {id:c.id,code:c.code,label:mLabel(c.f,c.code),p:c.p,auto:true,
              k:kickoffOf(c.id,c.f)};}));
  var seen={}; MYSLIP=MYSLIP.filter(function(x){
    if(seen[x.id])return false;seen[x.id]=1;return true;});
  saveMy(); renderFab(); openMySheet();
  /* Straight to the bottom - the last legs and the total are what you want to
     see, and no animation, because it should already be there. */
  try{var mb=$("mySheetBody"); if(mb) mb.scrollTop=mb.scrollHeight;}catch(e){}
  window.__wizChime&&window.__wizChime();
  /* Say what was actually built. When the board could not reach the target on
     markets we have a record for, tell the person plainly instead of quietly
     handing them a smaller number. Reported: "you shouldnt pick a less
     favoured game because you want to hit the target." So we no longer do, and
     the honest consequence is that some targets are not reachable today. */
  /* WHEN THE NUMBER IS NOT THE NUMBER THEY ASKED FOR, SAY SO.
     Reported: "Result or over 1.5" at Balanced returns forty games at about
     x2,000 against a much smaller target. Nothing is broken - those legs pay
     about x1.2 each and the builder stops at the leg that first clears the
     target, so with cheap legs it walks past it and with the leg cap it walks
     a long way past. But a reader who typed a number and got twenty times it
     is owed the reason, not left to work out which setting did it.
     Two directions, one sentence each, and both name the lever that fixes it:
     short is a market problem, far over is a price-per-game problem. */
  var T=WSP.odds, per=(r.picks.length?Math.pow(r.odds,1/r.picks.length):0);
  var missNote="";
  if(r.short){
    missNote="We could not reach ×"+(+T).toFixed(0)+" today. Best from the markets "+
      "you picked is ×"+r.odds.toFixed(0)+" on "+r.picks.length+" games. "+
      "Switch on more markets, or ask for less.";
    window.swToast&&window.swToast("Best we can build today is ×"+r.odds.toFixed(0)+
      " from "+r.picks.length+" games we rate","info","wspshort");
  } else if(T!=null&&r.odds>T*1.5&&r.picks.length>1){
    missNote="You asked for ×"+(+T).toFixed(0)+" and this pays ×"+r.odds.toFixed(0)+
      ". The markets you picked pay about ×"+per.toFixed(2)+" a game, so the slip "+
      "has to be long and it jumps past your number. Fewer, riskier markets "+
      "get closer.";
    window.swToast&&window.swToast("Closest we can get is ×"+r.odds.toFixed(0)+
      " - see the note on the slip","info","wspover");
  } else {
    window.swToast&&window.swToast((shuffle?"Reshuffled - ":"Conjured ")+r.picks.length+" games · ~×"+r.odds.toFixed(0),"ok");
  }
  /* On the slip, not only in a toast: a toast is gone in two seconds and this
     explains the number they are looking at. */
  try{
    var body=$("mySheetBody");
    if(body){
      var oldNote=body.querySelector(".wsp-miss"); if(oldNote) oldNote.remove();
      if(missNote){
        var el=document.createElement("p");
        el.className="byo-note wsp-miss";
        el.textContent=missNote;
        body.appendChild(el);
      }
    }
  }catch(e){}
}

// --- Mode toggle + renderBuilder dispatcher ---
/* ---- Builder settings dock ----
   Mirrors the mode toggle and summarises what the slip is being built from,
   so neither has to be scrolled back to. Shown only once the real controls
   have left the screen, and only on a desktop. */
function bldSummary(){
  var mkN=0; try{
    mkN=BUILD.mode==="wizard"
      ? Object.keys(WSP.mk).filter(function(k){return WSP.mk[k];}).length
      : marketCount();
  }catch(e){}
  var lead;
  if(BUILD.mode==="wizard"){
    lead = (WSP.odds==null) ? "No payout yet" : "×"+WSP.odds;
  } else {
    lead = (BUILD.risk==null) ? "No risk set" : riskWord(BUILD.risk);
  }
  return lead+" · "+mkN+" market"+(mkN===1?"":"s")+
         (TOP_ONLY?" · top flight":"");
}
function renderBldDock(){
  var dock=$("bldDock"); if(!dock) return;
  dock.hidden=false;
  var tx=$("bdSumTx"); if(tx) tx.textContent=bldSummary();
  dock.querySelectorAll("[data-bdmode]").forEach(function(b){
    b.classList.toggle("on",b.getAttribute("data-bdmode")===BUILD.mode);
    b.setAttribute("aria-pressed",b.getAttribute("data-bdmode")===BUILD.mode?"true":"false");
  });
  if(dock._w) return;
  dock._w=1;
  dock.querySelectorAll("[data-bdmode]").forEach(function(b){
    b.addEventListener("click",function(){
      var m=b.getAttribute("data-bdmode");
      if(m===BUILD.mode) return;
      BUILD.mode=m; try{localStorage.setItem("sw.mode",m);}catch(e){}
      renderBuilder();
    });
  });
  var sum=$("bdSum");
  if(sum) sum.addEventListener("click",function(){
    var head=document.querySelector(".bld-mode-row")||document.querySelector(".bld-head");
    if(head) try{head.scrollIntoView({behavior:REDUCED?"auto":"smooth",block:"start"});}
             catch(e){head.scrollIntoView();}
  });
  /* Watches the real toggle: while it is on screen the dock stays out of the
     way, because two copies of the same control at once is just noise. */
  var head=document.querySelector(".bld-mode-row");
  if(head&&"IntersectionObserver" in window){
    new IntersectionObserver(function(es){
      dock.classList.toggle("on",!es[0].isIntersecting);
    },{threshold:0}).observe(head);
  }
}
/* WHICH CODES EACH CHIP GOVERNS. The slider's mkOn map already knows this
   pairing, but backwards - code to switch - and emptyWhy has to go the other
   way to name the chip that fell short. One table, read twice, beats two
   tables that can disagree. */
var MKT_BY_CHIP={wd:["1X","X2"],any:["12"],out:["1","2"],
  o15:["OVER_1.5"],o25:["OVER_2.5"],o35:["OVER_3.5"],fh:["FH_OVER_0.5"],
  tts:["HOME_OVER_0.5","AWAY_OVER_0.5"],tts2:["HOME_OVER_1.5","AWAY_OVER_1.5"],
  both:["GG"],
  dro25:["MIX_X_OV_2.5"],drgg:["MIXGG_X"],rsgg:["MIXGG_1","MIXGG_2"],
  rso25:["MIX_1_OV_2.5","MIX_2_OV_2.5"],dro15:["MIX_X_OV_1.5"],
  rso15:["MIX_1_OV_1.5","MIX_2_OV_1.5"],weh:["WINHALF_H_Y","WINHALF_A_Y"],
  draw:["X"]};

/* WHY THE SLIP IS EMPTY, NAMED.
 *
 * "No games match. Adjust risk or markets" is true of every empty slip and
 * useful for none of them. Reported on Win a half: switched on, nothing built
 * at Safe or Balanced, no explanation - and the reason was never the board. A
 * market can be missing for exactly two reasons and the reader can act on
 * both:
 *   the risk dial has not unlocked it yet - it is a tier above where the
 *   slider sits, so no fixture was ever offered to it;
 *   or it is unlocked and the confidence floor is above anything it reaches
 *   today - Win a half tops out near 64% on a normal card and Safe asks 75%.
 * Both are answered by moving one control, so the sentence names which. */
/* THE CHIP TABLE, HOISTED OUT OF renderShared - AND THAT WAS A BUG, NOT A
   TIDY-UP. `var MKT_CFG` was declared inside renderShared, so emptyWhy below
   referenced a name that did not exist at its own scope: every call threw
   ReferenceError into its own try/catch and returned "". The whole function
   was dead from the day it was written, and every reader got the generic
   "No games match. Adjust risk or markets." it exists to replace.
   Declared here and filled by renderShared, which always runs first. */
var MKT_CFG=[];
/* Which market on the card falls short of the floor, and by how much - the one
   fact behind both an empty slip and a short one. */
function floorGap(){
  var p=riskParams(BUILD.risk), allowed=allowedMarkets(p.tier);
  var on=MKT_CFG.filter(function(m){
    return !(m.wizardOnly||BUILD.mk[m.k]===false); });
  if(!on.length) return null;
  var fx=scopeFixtures()||[], best=0, bestName="", over=0;
  var codes=[];
  on.forEach(function(m){
    allowed.forEach(function(c){
      if((MKT_BY_CHIP[m.k]||[]).indexOf(c)>=0) codes.push({c:c,label:m.label});
    });
  });
  /* GAMES, not game-market pairs. A fixture where both Over 2.5 and Both to
     score clear is still one leg - the builder takes the best market per
     match - so counting pairs would report a pool twice the size of the slip
     it can build and the sentence would never fire. */
  fx.forEach(function(f){
    var hit=false;
    codes.forEach(function(x){
      var v=mProb(f,x.c);
      if(v==null||isNaN(v)) return;
      if(v>best){ best=v; bestName=x.label; }
      if(v>=p.minConf) hit=true;
    });
    if(hit) over++;
  });
  if(!best) return null;
  return {best:best, name:bestName, need:p.minConf, over:over,
          word:riskWord(BUILD.risk), max:p.maxGames};
}
/* How many games on the card this chip could actually put on a slip at a given
   setting. The floor, the tier and the bookmaker all get a say - the three
   things that can make a chip look switched on and do nothing. */
function chipGames(k,r){
  var p=riskParams(r), allowed=allowedMarkets(p.tier);
  var codes=(MKT_BY_CHIP[k]||[]).filter(function(c){
    return allowed.indexOf(c)>=0 && bookAllows(c,curBook()); });
  if(!codes.length) return 0;
  var fx=scopeFixtures()||[], n=0;
  fx.forEach(function(f){
    for(var i=0;i<codes.length;i++){
      var v=mProb(f,codes[i]);
      if(v!=null&&!isNaN(v)&&v>=p.minConf){ n++; return; }
    }
  });
  return n;
}
/* THE DIAL IS THE ANSWER TO A TIER LOCK, SO THE CHIP MAY AS WELL TURN IT.
   The bookmaker lock has offered the switch for a while - "A CHIP LOCKED BY
   THE BOOKMAKER IS A QUESTION, NOT A WALL" - and the tier lock still just
   refused, on the reasoning that the slider is sitting right there. It is, and
   a reader who taps Over 2.5 at Safe has just said what they want; being told
   nothing and shown nothing is not an answer.
   Finds the LOWEST setting where the chip can fill, so the dial moves as
   little as it has to. Three games rather than one: sliding the whole dial to
   produce a single leg is a worse trade than staying put. */
function riskThatFills(k){
  if(BUILD.mode!=="slider") return null;
  var first=null;
  for(var r=0;r<=100;r+=5){
    var n=chipGames(k,r);
    if(n>=3) return r;
    if(n>=1&&first==null) first=r;
  }
  return first;
}
/* Moved through the input itself, so the fill, the zone colour, the ticks and
   the haptic all happen exactly as they do under a finger - one code path for
   the dial rather than two that can drift. */
function slideRisk(r){
  var el=$("risk");
  BUILD.risk=r; BUILD.touched=true;
  try{localStorage.setItem("sw.risk",String(r));}catch(e){}
  if(el){
    el.value=r;
    try{
      el.dispatchEvent(new Event("input",{bubbles:true}));
      el.dispatchEvent(new Event("change",{bubbles:true}));
      return;
    }catch(e){}
  }
  renderBuilder();
}
function emptyWhy(){
  try{
    var p=riskParams(BUILD.risk), allowed=allowedMarkets(p.tier);
    var on=[];
    MKT_CFG.forEach(function(m){
      if(m.wizardOnly||BUILD.mk[m.k]===false) return;
      on.push(m);
    });
    if(!on.length) return "Switch a market on to build anything.";
    var locked=on.filter(function(m){ return p.tier<m.tier; });
    if(locked.length===on.length){
      return locked.map(function(m){return m.label;}).join(" and ")+
        (locked.length===1?" unlocks":" unlock")+" further right on the dial.";
    }
    /* Unlocked, so ask what they actually reach on today's card. */
    var fx=scopeFixtures()||[], best=0, bestName="";
    on.forEach(function(m){
      var codes=allowed.filter(function(c){ return (MKT_BY_CHIP[m.k]||[]).indexOf(c)>=0; });
      codes.forEach(function(c){
        fx.forEach(function(f){
          var v=mProb(f,c);
          if(v!=null&&v>best){ best=v; bestName=m.label; }
        });
      });
    });
    if(best&&best<p.minConf){
      return bestName+" tops out at "+Math.round(best*100)+"% on today's games and "+
        riskWord(BUILD.risk)+" asks for "+Math.round(p.minConf*100)+
        "%. Slide right, or switch on a safer market.";
    }
  }catch(e){}
  return "";
}
function renderBuilder(){
  paintBookPickers();
  /* The wizard shows the numbers and keeps the slip itself for the sheet. */
  document.documentElement.classList.toggle("wiz-mode",BUILD.mode==="wizard");
  renderBldDock();
  wireBldHelp();
  /* Shown unprompted only to someone who has never dismissed it. */
  if(!bldCoachSeen()) renderBldCoach(true);
  // Sync shared controls state from BUILD/WSP
  renderShared();
  // Render mode-specific panel
  if(BUILD.mode==="slider") renderSliderPanel();
  else renderWizardPanel();
  // Render unified output (stats, slip, footer)
  renderBuilderOutput();
}
function renderShared(){
  var p = BUILD.risk===null ? {tier:1, minConf:0.65, maxGames:18} : riskParams(BUILD.risk);
  /* Assigned, not declared: the `var` that used to be here made this array
     local and left emptyWhy reading a name from a scope that had none. */
  MKT_CFG=[
    {k:"wd", label:"Win or draw", tier:0, sub:"1X, X2", icon:'<path d="M20 6L10 17L6 13"/>'},
    {k:"any", label:"Any winner", tier:1, sub:"12", icon:'<path d="M2 12h20M6 8l-4 4 4 4M18 8l4 4-4 4"/>'},
    {k:"out", label:"Outright win", tier:1, sub:"1, 2", icon:'<path d="M5 12H19M19 12L12 5M19 12L12 19"/>'},
    /* Goals used to be one chip that quietly meant Over 1.5 at a safe setting
       and Over 2.5 at a risky one. That made an all-one-market ticket
       impossible: you could not ask for Over 1.5 and be sure that is what you
       got. Each line is its own switch now. */
    {k:"o15", label:"Over 1.5", tier:0, sub:"Over 1.5", icon:'<circle cx="12" cy="12" r="10"/><path d="M12 8V12M12 16H12.01"/>'},
    {k:"o25", label:"Over 2.5", tier:1, sub:"Over 2.5", icon:'<circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/>'},
    /* Predicted since day one, bookable only now that market 68 is fetched. */
    {k:"o35", label:"Over 3.5", tier:2, sub:"Over 3.5", icon:'<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/>'},
    {k:"fh", label:"1st half", tier:2, sub:"FH over 0.5", icon:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l3.5 2"/>'},
    /* One side's goals rather than the two added together. Both sides go in
       the pool; whichever the model likes better is the one that gets used. */
    {k:"tts", label:"Team over 0.5", tier:0, sub:"One side's goals", icon:'<path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M12 7v10"/>'},
    {k:"tts2", label:"Team over 1.5", tier:2, sub:"One side's goals", icon:'<path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/><path d="M9 9h6M9 15h6"/>'},
    {k:"both", label:"Both score", tier:2, sub:"GG", icon:'<path d="M17 21V5A2 2 0 0015 3H9A2 2 0 007 5V21"/><path d="M7 7H17"/><path d="M9 11H15"/><path d="M9 15H15"/><path d="M9 19H15"/>'},
    /* A RESULT OR GOALS, ONE MARKET. Both bookmakers sell these as a single
       selection, so a leg books like any other; the model prices them off the
       same scoreline matrix as everything above. All four start off - see
       BUILD.mk - because none of them has a graded result yet. */
    {k:"dro25", label:"Draw or o2.5", tier:1, sub:"X or over 2.5", icon:'<path d="M4 12h16"/><path d="M12 5v14"/>'},
    {k:"drgg", label:"Draw or GG", tier:1, sub:"X or both score", icon:'<path d="M4 12h16"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>'},
    {k:"rsgg", label:"Result or GG", tier:0, sub:"1 or 2, or both score", icon:'<path d="M5 19L12 5l7 14"/><path d="M8 15h8"/>'},
    {k:"rso25", label:"Result or o2.5", tier:1, sub:"1 or 2, or over 2.5", icon:'<path d="M5 19L12 5l7 14"/><circle cx="12" cy="17" r="1.6"/>'},
    /* THE ONE MARKET THAT NARROWS YOUR CHOICE OF BOOKMAKER. Bet9ja and BetKing
       sell this family at 1.5; SportyBet's card starts at 2.5. The chip says
       so, and asks before it turns on, rather than failing quietly at the
       booking step. `only` is a list - see BOOK_ONLY, which is the same fact
       keyed by market code. */
    {k:"dro15", label:"Draw or o1.5", tier:0, sub:"X or over 1.5", only:["bet9ja","betking"],
     icon:'<path d="M4 12h16"/><path d="M9 8l3-3 3 3"/>'},
    /* WIN EITHER HALF. Graded on 945 held-out matches before it was offered:
       60.0% against 58.9% predicted, the closest of any market here bar the
       match result itself. Both books sell it per side. */
    {k:"rso15", label:"Result or o1.5", tier:0, sub:"1 or 2, or over 1.5", only:["bet9ja","betking"],
     icon:'<path d="M5 19L12 5l7 14"/><path d="M9 9l3-3 3 3"/>'},
    {k:"weh", label:"Win a half", tier:0, sub:"Either half", icon:'<path d="M12 4v16"/><path d="M5 8h4"/><path d="M15 16h4"/>'},
    /* WIZARD ONLY. The Slider cannot build a draw - "X" is in neither
       allowedMarkets nor its mkOn map - so drawing this chip in the Slider
       would be a control that turns on and does nothing, which is exactly the
       failure this panel has had before. Filtered out below rather than shown
       greyed, because there is no risk setting that would ever unlock it. */
    {k:"draw", label:"Draw", tier:2, sub:"X", wizardOnly:true, warn:true, icon:'<path d="M4 12h16"/><circle cx="12" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/>'}
  ];
  (function(){
    var lg=$("bldLeagues"),mkw=$("bldMk"); if(!lg||!mkw) return;
    lg.querySelectorAll("[data-btp]").forEach(function(c){c.classList.toggle("on",(c.dataset.btp==="true")===!!TOP_ONLY);});
    var html=MKT_CFG.filter(function(m){
      return !m.wizardOnly || BUILD.mode==="wizard";
    }).map(function(m){
      /* A wizard-only market is not in BUILD.mk at all, so asking BUILD
         whether it is on would answer "undefined !== false" - true - and draw
         the chip lit while the builder treated it as off. */
      var enabled=m.wizardOnly ? (WSP.mk[m.k]===true) : (BUILD.mk[m.k]!==false);
      // Tier locks are a slider concept (unlock riskier markets as you slide up).
      // The wizard has its own market model, so nothing is tier-locked there -
      // otherwise "Both score" (tier 2) shows greyed out and can't be enabled.
      var locked=(BUILD.mode!=="wizard") && (p.tier < m.tier);
      /* A market the CURRENT bookmaker does not sell is locked for the same
         reason a tier lock is: it cannot produce a leg, so a chip that lights
         up is a control that does nothing. It unlocks by switching book, and
         the badge below says which one. */
      var wrongBook=!!(m.only && m.only.indexOf(curBook().key)<0);
      if(wrongBook) locked=true;
      var tierLabel=["Safe","Balanced","Risky"][m.tier];
      var subLabel=m.sub;
      if(m.tierMax!==undefined && p.tier >= m.tierMax){
        tierLabel=["Safe","Balanced","Risky"][m.tierMax];
        subLabel=m.subMax;
      }
      var unlockClass=(window._prevTier!==undefined && p.tier > window._prevTier && p.tier >= m.tier && window._prevTier < m.tier) ? " unlocking" : "";
      /* Not `disabled` when the lock is the bookmaker's: a disabled button
         cannot be tapped and this one has something to say. */
      return "<button class='mkt-chip"+(enabled?" on":"")+(locked?" locked":"")+unlockClass+
        (wrongBook?" wrong-book":"")+(m.warn?" is-draw":"")+"' data-m='"+m.k+"'"+
        /* NOT DISABLED ANY MORE, AND THAT IS THE WHOLE FIX. A disabled button
           fires no click at all, so the tier-locked chips never reached the
           handler below - the dial-moving branch would have been dead code.
           The wrong-book chips were already left enabled for exactly this
           reason; the tier lock now works the same way and keeps only the
           dimmed `locked` look. */
        (m.only?" data-only='"+m.only.join(",")+"'":"")+
        (locked&&!wrongBook?" title='Tap to move the dial to where this can fill'":"")+
        " type='button'>"+
        "<span class='mkt-icon' aria-hidden='true'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>"+m.icon+"</svg></span>"+
        "<span>"+m.label+"</span>"+
        (m.only
          ? "<span class='tier-badge only-badge' title='"+
            (wrongBook ? "Switch to "+bookNames(m.only)+" to use this market"
                       : bookNames(m.only,"and")+" sell this line; SportyBet does not")+
            /* ONE BOOK GETS ITS NAME, TWO GET A COUNT. The chip is a nowrap
               grid cell 113px wide at the six-column breakpoint and narrower
               on a phone, and "Bet9ja or BetKing only" does not fit beside a
               label - it would push the palette out of its column. The names
               are in the tooltip and in the prompt the chip now raises, both
               of which have room to say them. */
            "'>"+esc(m.only.length>1 ? m.only.length+" books" : bookNames(m.only))+" only</span>"
          : "<span class='tier-badge' title='Unlocks at "+tierLabel+" tier'>T"+(m.tier+1)+"</span>")+
        "</button>";
    }).join("");
    mkw.innerHTML=html;
    mkw.querySelectorAll("[data-m]").forEach(function(c){
      c.addEventListener("click",function(){
        /* A CHIP LOCKED BY THE BOOKMAKER IS A QUESTION, NOT A WALL. Bet9ja and
           BetKing sell the 1.5 rung and SportyBet does not, so on a SportyBet
           slip these chips were dead and tapping one did nothing at all -
           reported as "greyed out and doesn't work", which is exactly what it
           was. It asks instead: the prompt names the books that sell it and
           moves the whole builder to whichever one the reader picks, which is
           the only thing that could have made the chip work anyway.
           IT ASKS EVEN WHEN THE CURRENT BOOK IS ONE OF THEM. Turning this on
           quietly on a Bet9ja slip builds a ticket that no longer travels: the
           reader can no longer switch to SportyBet without losing legs, and
           nothing said so at the moment they chose it. The market itself is
           fine - it is the narrowing that has to be consented to, and it is
           the same sentence either way.
           A TIER LOCK IS THE SAME QUESTION and now gets the same answer: the
           dial moves to the lowest setting where this market can actually
           fill, and says so. It used to refuse silently, on the reasoning that
           the slider was right there - which assumed the reader knew that a
           greyed chip meant "slide right", and nothing on screen said it. */
        var only=c.dataset.only?c.dataset.only.split(","):null;
        /* ON THE WAY ON ONLY - turning it off costs the reader nothing and
           needs no ceremony, the same rule the draw chip follows. The second
           half of the test is the chip that is already on and has been
           stranded: switch book with this market lit and it stays lit while
           the new book cannot sell it, so tapping it is a request to fix that
           and not a request to turn it off. */
        if(only&&(!c.classList.contains("on")||only.indexOf(curBook().key)<0)){
          askBookOnly(c.dataset.m,only);
          return;
        }
        var k=c.dataset.m;
        if(c.classList.contains("locked")){
          var toR=riskThatFills(k);
          var lbl=(MKT_CFG.filter(function(x){return x.k===k;})[0]||{}).label||"this market";
          if(toR==null){
            /* Honest refusal beats a dial that moves and still builds nothing:
               the market is unreachable on TODAY's card, not at this setting. */
            try{ window.swToast&&window.swToast(lbl+" doesn't reach any setting on today's games","","tierfill"); }catch(e){}
            return;
          }
          BUILD.mk[k]=true; WSP.mk[k]=true;
          try{ window.swToast&&window.swToast("Moved to "+riskWord(toR)+" - that's where "+
            lbl+" can fill","","tierfill"); }catch(e){}
          slideRisk(toR);
          return;
        }
        /* "DON'T TURN OFF THE LAST MARKET" HAS TO COUNT THE SET THAT IS
           GOVERNING. It counted BUILD.mk alone, which stopped being the whole
           picture the moment the draw moved into WSP.mk on its own: in wizard
           mode with the draw on and everything else off, BUILD.mk still saw one
           market left and refused to let it go - so an all-draw slip, the exact
           thing the draw toggle exists for, could not be built. Reported as
           "it won't let me pick just draw without another option".
           The wizard builds from WSP.mk and the slider from BUILD.mk, so the
           guard asks whichever one is about to be used. */
        var gov=(BUILD.mode==="wizard") ? WSP.mk : BUILD.mk;
        var on=Object.keys(gov).filter(function(x){return gov[x];});
        if(gov[k]&&on.length===1) return;
        /* THE DRAW ASKS FIRST, and only on the way ON. Turning it off is the
           safe direction and needs no ceremony; turning it on puts the least
           likely of three results on a slip, and somebody who taps a chip in a
           row of nine has not necessarily read what this one does. Every other
           market here is a shade of the same bet - this one is a different
           bet, so it is the one place a tap is not enough. */
        var cfg=MKT_CFG.filter(function(x){return x.k===k;})[0];
        if(cfg&&cfg.wizardOnly){
          /* Never touches BUILD.mk - see the note on its declaration. */
          /* The note describes the slip that was built, so it stops being
             true the moment the markets change. Clear it here rather than
             leave a sentence about a market that is now off. */
          var _idle=$("mkIdle"); if(_idle) _idle.innerHTML="";
          if(cfg.warn&&!WSP.mk[k]){ askDrawOn(k); return; }
          WSP.mk[k]=!WSP.mk[k]; WSP._sig=null; renderBuilder(); return;
        }
        BUILD.mk[k]=!BUILD.mk[k];
        /* UNLOCKED AND STILL EMPTY IS THE SAME DEAD CONTROL. A tier lock is
           visible; a market that is simply over the floor on every game today
           is not, and switching it on at Safe changed the slip by nothing at
           all. Only when it reaches NOTHING here - a thin-but-real market
           keeps the setting the reader chose, and the note under the slip
           explains the shortfall. */
        if(BUILD.mk[k]&&BUILD.mode==="slider"&&chipGames(k,BUILD.risk)===0){
          var toFill=riskThatFills(k);
          if(toFill!=null&&toFill!==BUILD.risk){
            var mkLbl=(MKT_CFG.filter(function(x){return x.k===k;})[0]||{}).label||"that market";
            try{ window.swToast&&window.swToast("Moved to "+riskWord(toFill)+" - "+mkLbl+
              " reaches nothing at "+riskWord(BUILD.risk),"","tierfill"); }catch(e){}
            WSP.mk[k]=BUILD.mk[k];
            slideRisk(toFill);
            return;
          }
        }
        /* One chip, both builders. The two market sets now use the same keys,
           so this is a straight copy - no renaming, and nothing silently
           dropped. It used to translate "wd" to the wizard's "doubles" and
           throw "any" away, which is why Any winner looked available in wizard
           mode and did nothing. */
        WSP.mk[k]=BUILD.mk[k];
        renderBuilder();
      });
    });
    window._prevTier=p.tier;
  })();
  /* Said plainly and once, with the number that matters. "Least likely" is the
     honest framing: a draw is not a riskier version of the same bet, it is the
     outcome the model ranks third on most fixtures, and a slip carrying one is
     a different proposition from a slip that does not. */
  window.askDrawOn=function(k){
    if(!showPrompt("mkAsk",
      /* THE NUMBERS HERE ARE THE ONES THE BUILDER USES. They said 28% and 30%
         while the floor was 26%, which is a warning that misdescribes the
         thing it is warning about. 25% is where the model actually sits across
         the card - measured, most fixtures land in the 0.22-0.26 band - and 26%
         is the floor in wspBuild. If that floor moves, this moves with it. */
      "<div class='confirm-card'><p><b>Draws are the least likely result.</b> "+
      "Across the card the model puts a draw near <b>25%</b> - below either "+
      "side winning. We only pick one where it reaches 26%, and it will still "+
      "lose more often than it lands.</p>"+
      "<p>Add draws to what the builder can pick?</p>"+
      "<div class='ca'><button class='confirm-go' type='button'>Add draws</button>"+
      "<button class='confirm-cancel' type='button'>No thanks</button></div></div>")) return;
    var host=$("mkAsk");
    host.querySelector(".confirm-go").addEventListener("click",function(){
      clearPrompt("mkAsk");
      WSP.mk[k]=true;               /* the wizard only - never BUILD.mk */
      WSP._sig=null; renderBuilder();
    });
    host.querySelector(".confirm-cancel").addEventListener("click",function(){
      clearPrompt("mkAsk");
    });
  };
  /* WHICH APP THE CODE WILL OPEN IN, said before the slip is built rather than
     at the booking step. Two books sell the 1.5 rung and SportyBet does not,
     so switching this market on decides the reader's bookmaker for them - and
     it used to decide it silently: a tap on a SportyBet slip moved the whole
     builder to Bet9ja behind a toast, and a tap on a Bet9ja slip said nothing
     at all while quietly making the slip unbookable anywhere else.
     Asked for as: let the reader know this option is only available to BetKing
     and Bet9ja users. The books come from the chip's own `only` list, so a
     third book selling the family changes this sentence by being added to
     MKT_CFG and nowhere else. */
  window.askBookOnly=function(k,keys){
    var have=(keys||[]).filter(function(x){return !!BOOKS[x];});
    var cfg=MKT_CFG.filter(function(x){return x.k===k;})[0]||{};
    var lbl=cfg.label||"this market";
    var turnOn=function(book){
      clearPrompt("mkAsk");
      BUILD.mk[k]=true; WSP.mk[k]=true; WSP._sig=null;
      /* setBook renders the builder itself; only the same-book path has to. */
      if(book&&book!==curBook().key) setBook(book); else renderBuilder();
    };
    /* A chip that cannot raise its prompt must still work. Falling through to
       the plain toggle is the lesser failure: an unasked question beats a
       control that does nothing, which is the bug this chip already had. */
    if(!have.length||!$("mkAsk")){ turnOn(have[0]); return; }
    var here=have.indexOf(curBook().key)>=0;
    var lose=Object.keys(BOOKS).filter(function(x){return have.indexOf(x)<0;});
    /* TWO SHORT LINES, because this one is read on a phone inside the filters
       panel rather than in a modal with the screen to itself. The long version
       ran to five lines at 390px and the last of them sat on the panel's own
       bottom edge - reported as cut off. Same two facts, said once each: who
       sells it, and what the tap will do. */
    showPrompt("mkAsk",
      "<div class='confirm-card'><p><b>"+esc(lbl)+": "+esc(bookNames(have,"and"))+
      " only.</b> "+esc(bookNames(lose,"and"))+" "+(lose.length>1?"do":"does")+
      " not sell this line.</p>"+
      "<p>"+(here
        ? "You are on "+esc(curBook().label)+". Turn it on?"
        : "Switch book and turn it on?")+"</p>"+
      "<div class='ca'>"+
      (here ? "<button class='confirm-go' type='button' data-use='"+esc(curBook().key)+
              "'>Turn it on</button>" : "")+
      have.filter(function(x){return !here||x!==curBook().key;}).map(function(x){
        return "<button class='confirm-go' type='button' data-use='"+esc(x)+"'>"+
          (here?"Use ":"Switch to ")+esc(BOOKS[x].label)+"</button>";}).join("")+
      "<button class='confirm-cancel' type='button'>Cancel</button></div></div>");
    var h=$("mkAsk");
    h.querySelectorAll(".confirm-go").forEach(function(btn){
      btn.addEventListener("click",function(){ turnOn(btn.dataset.use); });
    });
    h.querySelector(".confirm-cancel").addEventListener("click",function(){
      clearPrompt("mkAsk");
    });
  };
  // Scope segment
  paintScope();
  // Leagues chips
  var lg=$("bldLeagues");
  if(lg){
    lg.querySelectorAll("[data-btp]").forEach(function(c){
      c.classList.toggle("on",(c.dataset.btp==="true")===!!TOP_ONLY);
    });
    if(!lg._wired){
      lg._wired=1;
      lg.querySelectorAll("[data-btp]").forEach(function(c){
        c.addEventListener("click",function(){
          setTopOnly(c.dataset.btp==="true");
          renderBuilder();
        });
      });
    }
  }
  renderLeaguePicker();
}
/* The league picker.
   Repainted with the rest of the builder because its contents depend on the
   day and time window above it - change those and a different set of leagues
   is available, with different counts. The open/closed state is deliberately
   kept on the element rather than in a variable, so a repaint does not shut a
   list somebody is halfway down. */
function renderLeaguePicker(){
  var open=$("lgpOpen"),box=$("lgpBox"),list=$("lgpList"),
      sum=$("lgpSum"),cnt=$("lgpCount"),clr=$("lgpClear");
  if(!open||!box||!list) return;

  var avail=leaguesOnBoard();
  var n=leagueChosenCount();
  /* Name the window this list describes.
     Without it, "5 available" reads as a broken picker. It was reported as
     one: with Early selected the list held five leagues while the reporter
     was looking at a day on which nearly every top flight was playing - all
     of them outside the Early window. The list was right and said nothing
     about why, which is the same thing as being wrong. */
  var win = (SCOPE==="all") ? "in all upcoming games"
          : (SCOPE==="span") ? ("in the next "+SPAN+" days")
          : ("playing "+(TOD==="all" ? "" :
              (TOD==="early"?"in the morning ":TOD==="mid"?"in the afternoon ":"in the evening "))+
             dayName(SDAY).toLowerCase());
  /* A stored pick for a league that is not playing today would otherwise show
     "2 leagues" over an empty board with nothing to un-tick. */
  var live=avail.filter(function(x){return BLD_LEAGUES[x.league];}).length;
  sum.textContent = !n ? "Any league"
    : (live ? live+" league"+(live===1?"":"s") : n+" picked, none playing");
  open.classList.toggle("narrowed",!!n);
  if(cnt) cnt.textContent=avail.length+" league"+(avail.length===1?"":"s")+" "+win;
  if(clr) clr.hidden=!n;

  /* A time window narrow enough to hide most of the card should say so here,
     beside the short list it caused, rather than leaving the reader to connect
     it to a segment further up the page. */
  var hint="";
  if(SCOPE==="day"&&TOD!=="all"){
    var allDay=DATA.fixtures.filter(function(f){
      return notStarted(f)&&dayOff(f.date)===SDAY;
    }).length;
    var here=scopeFixtures().length;
    if(allDay>here) hint="<div class='lgp-hint'>"+(allDay-here)+
      " more game"+((allDay-here)===1?"":"s")+" "+esc(dayName(SDAY).toLowerCase())+
      " outside this time window - switch to All day to see their leagues.</div>";
  }

  /* Said once, where the doubt actually is, rather than only in the summary
     button above the open panel. */
  var allIn = n ? "" : "<div class='lgp-allin'><b>All " + avail.length +
    " leagues are in.</b> Tap any to build from that one only.</div>";
  list.classList.toggle("all-in", !n);
  list.innerHTML = allIn + hint + (avail.length
    ? avail.map(function(x){
        return "<button class='lgp-row"+(BLD_LEAGUES[x.league]?" on":"")+"' type='button' "+
          "data-lg=\""+esc(x.league)+"\" aria-pressed='"+(!!BLD_LEAGUES[x.league])+"'>"+
          "<span class='lgp-tick' aria-hidden='true'>✓</span>"+
          "<span class='lgp-nm'>"+esc(compOf(x.league))+"<span class='lgp-ct'> · "+esc(countryOf(x.league))+"</span></span>"+
          "<span class='lgp-n'>"+x.n+"</span></button>";
      }).join("")
    : "<div class='lgp-empty'>No games in this window.</div>");

  list.querySelectorAll("[data-lg]").forEach(function(b){
    b.addEventListener("click",function(){
      var l=b.dataset.lg;
      setLeaguePicked(l,!BLD_LEAGUES[l]);
      /* The slip is built from a pool that just changed, so any conjured slip
         is stale. Drop it rather than leave legs from a league now excluded. */
      WSP._sig=null;
      renderBuilder();
    });
  });

  if(!open._wired){
    open._wired=1;
    open.addEventListener("click",function(){
      var showing=!box.hidden;
      box.hidden=showing;
      open.setAttribute("aria-expanded",String(!showing));
    });
    clr.addEventListener("click",function(e){
      e.stopPropagation();
      clearLeaguePicks();
      WSP._sig=null;
      renderBuilder();
    });
  }
}
function renderSliderPanel(){
  var firstVisit = BUILD.risk === null;
  var displayRisk = firstVisit ? 45 : BUILD.risk;
  var p = riskParams(displayRisk);
  $("risk").value=displayRisk;
  (function(){var _r=$("risk");if(_r){_r.style.setProperty("--fill",displayRisk+"%");_r.style.backgroundSize=displayRisk+"% 100%";
    var _z=displayRisk<33?"safe":displayRisk<66?"mid":"risky";var _sp=$("sliderPanel");if(_sp)_sp.setAttribute("data-zone",_z);
    _r.style.setProperty("--rz",_z==="safe"?"rgba(43,199,120,.35)":_z==="mid"?"rgba(242,184,75,.4)":"rgba(230,57,70,.4)");}})();
  $("riskName").textContent=firstVisit ? "-" : riskWord(BUILD.risk);
  // Slider panel visibility
  $("sliderPanel").hidden=false;
  $("wizardPanel").hidden=true;
  // Update mode buttons
  document.querySelectorAll(".bld-mode-btn").forEach(function(b){
    b.classList.toggle("on",b.dataset.mode===BUILD.mode);
    b.setAttribute("aria-selected",b.dataset.mode===BUILD.mode?"true":"false");
  });
}
function renderWizardPanel(){
  /* The last two are the jackpot tier. SportyBet's own top prize needs a
     payout in this range, and people come here wanting exactly that, so it is
     built rather than pretended away - but it is marked as what it is, and the
     note under the chips says how many results in a row it takes. Both sit
     inside the forty-leg cap: x20000 wants about nineteen legs at the bigger
     style, x50000 about twenty-one. */
  /* The jackpot tier needs the whole card - nineteen legs at the bigger style,
     forty-five at the smaller - and a single fixture day rarely holds that
     many games worth backing. Which was read as "so offer it only on All
     upcoming", and that is a guess about the board dressed as a rule: on a
     full Saturday the Slider reached x100,000 on Today while these chips
     refused x6,000 and asked for a wider window. Ask the pool instead - it
     knows how many games are in front of this reader and the scope does not.
     A target already chosen is still dropped when the pool can no longer
     reach it, rather than left selected against a board that cannot pay it. */
  var JACKPOT_FROM=JACKPOT_ODDS;
  var jackOK=(wspMaxReach()>=JACKPOT_FROM);
  if(!jackOK && isJackpotOdds(WSP.odds)){
    WSP.odds=null; WSP._sig=null; WSP._slip=null;
    try{localStorage.removeItem("sw.wspodds");}catch(e){}
  }
  /* x10 added at the bottom. It was missing and it is the rung most likely
     to actually land - three or four legs - which makes it the one worth
     showing a first-timer, not the one to hide. */
  /* ONE ladder, sliced. The two lists were written out separately, which is
     fine until something reads "the highest the wider window reaches" - the
     offer to switch scope promises exactly that number, and a second copy of
     it would drift the first time a rung is added or moved. */
  var WIDE_ODDS=[10,50,100,500,1000,2000,6000,20000,50000];
  var odds=jackOK?WIDE_ODDS:WIDE_ODDS.filter(function(o){return o<JACKPOT_FROM;});
  WSP._wideMaxTarget=WIDE_ODDS[WIDE_ODDS.length-1];
  /* The ceiling the chips currently express, so the custom box can clamp to
     the same limit. It moves with the board: the jackpot rungs appear
     whenever the pool in front of the reader can actually build them. */
  WSP._maxTarget=odds[odds.length-1];
  /* Named for what they change, not for a promise they cannot keep.
     "Safer, more games" was the reported-worst of the three and measurably
     the least likely to land: more legs is more results that have to come
     in, so a slip of safer picks spread wider is a longer shot, not a
     shorter one. Calling it "safer" told people the opposite of the truth
     and the confidence figure beside it agreed with the lie. These say what
     you get and let the chance figure say what it costs. */
  var styles=[[1.25,"More games","smaller odds"],[1.4,"Balanced",""],[1.7,"Fewer games","bigger odds"]];
  var html="";
  html += "<div class='wsp-lbl'>Pick a target payout</div><div class='wsp-chips' id='wspOddsChips'>"+
    odds.map(function(o,i){
      var hue=Math.round(145-145*(i/(odds.length-1)));
      /* The scale runs green to red, and white text on the yellow-greens in
         the middle - x100 and x500 - nearly vanished into the fill. The ink is
         chosen by contrast ratio against the actual colour, so every chip is
         readable whatever hue lands on it. */
      var big=o>=JACKPOT_FROM;
      return "<button class='wsp-chip wsp-risk"+(WSP.odds===o?" on":"")+(big?" wsp-jack":"")+
        "' style='--wr:hsl("+hue+",64%,46%);--wr-ink:"+inkOn(hue,0.64,0.46)+
        "' data-o='"+o+"'>\u00d7"+(o>=1000?(o/1000)+"k":o)+"</button>";}).join("")+
    /* The chips stay the way in: one tap, and the green-to-red hue says what
       kind of ask it is before you commit. The box is for someone who knows
       the number they want and it is not on the ladder - x250, x7500 - not a
       replacement for it. Typing five digits on a phone is slower than a tap
       and tells you nothing about the risk you are taking. */
    "<span class='wsp-cust'><span class='wsp-cust-x' aria-hidden='true'>×</span>"+
      "<input id='wspCust' class='wsp-cust-in' type='text' inputmode='numeric' "+
      "autocomplete='off' maxlength='5' placeholder='own' "+
      "aria-label='Your own target payout, from 2 to 50000' value='"+
      ((WSP.odds&&odds.indexOf(WSP.odds)<0)?WSP.odds:"")+"'></span>"+
    "</div>"+
    /* Where a target the current window cannot reach explains itself. Empty
       the rest of the time, and it carries no margin when empty. */
    "<div id='payAsk'></div>";
  /* What a jackpot ticket actually is, said before it is built rather than
     after it loses. The number of legs is the honest part - it is the thing
     that has to come in, and it is a different order of ask from a x50. */
  if(isJackpotOdds(WSP.odds)){
    var _per=WSP.legodd||1.35;
    var _legs=Math.max(4,Math.min(JACKPOT_LEG_CAP,Math.ceil(Math.log(WSP.odds)/Math.log(_per))));
    html += "<p class='wsp-hint wsp-hint-jack'><b>Jackpot ticket.</b> "+_legs+
      " results in a row, every one of them right. Long odds on purpose - this "+
      "is a swing at the big one, taken at your own risk, and it is kept out of "+
      "your running record.</p>";
  }
  /* The slider tells a first-timer to move it; the wizard said nothing and
     simply had a payout chosen already. With nothing picked, say what to do
     and keep Conjure out of reach until there is something to aim at. */
  if(WSP.odds==null)
    html += "<p class='wsp-hint'>Pick a payout above - we'll find the games that reach it.</p>";
  /* Slip style trades legs against odds while reaching the same payout, and
     the Slider is one of the four answers rather than a mode that replaces the
     other three.
     It used to be a hidden switch: below the Slider's ceiling it took over and
     the chips were not drawn at all. The ceiling is a property of the board and
     moves by five orders of magnitude between cards (93 on a thin midweek day,
     18,606,289 on All upcoming), so the chips were permanently dead on a big
     card and live on a small one, with nothing on screen naming the threshold
     that decided it. Reported as "fewer games bigger odds doesn't do that
     anymore" - and on All upcoming it genuinely never did, because the Slider
     was answering every rung on the ladder.
     Making it a choice also puts the trade in front of the reader instead of
     deciding it for them, which matters because the switch was never free:
     measured on a full Saturday with live prices, the Slider's method lost
     every rung, by 30 legs landing 0.001% against 16 landing 0.182% at x6000. */
  /* NO TARGET YET - which includes the moment the first keystroke lands in the
     custom box, because that clears the payout on purpose (see the input
     handler). wspBuild returns an empty slip while WSP.odds is null, so every
     style chip builds exactly the same nothing: the dead-controls failure
     again, and it flickered the chips in for the whole time it took to type a
     number that then hid them. The "Pick a payout above" hint above already
     says what to do, so nothing is drawn here. */
  if(WSP.everyGame){
    /* NO STYLE IN "EVERY GAME THAT QUALIFIES". The count is not derived from a
       payout here - `want` is min(cap, whatever qualifies) and `g` is pinned at
       1.01 - so legodd cannot move the leg count at all. Measured: all three
       styles return the same 40 legs. Chips reading "More games" and "Fewer
       games" over a count they cannot change is the dead-controls failure this
       panel keeps having, so they are not drawn and the reason is said. */
    html += "<p class='wsp-hint'><b>Every qualifying game goes in.</b> "+
      "The card decides how many, so there is no shorter or longer slip to "+
      "choose - turn this off to trade games against odds.</p>";
  } else {
    /* THE STYLE IS A PREFERENCE, NOT AN ANSWER TO THIS PAYOUT.
       It used to appear only once a target existed, on the no-dead-controls
       rule - three chips that all build the same empty slip are three dead
       controls. But legodd is not about the payout in front of you: it is
       remembered across builds and reloads, and setting it before choosing a
       number is pre-loading an answer rather than pressing a dead button. The
       "Pick a payout above" hint already says what is still missing, and the
       row flickering in and out as a custom number was typed was the same
       fault seen from the other side.
       Still absent in "every game that qualifies" above, where the count
       genuinely cannot move - that IS the dead-controls case. */
    /* A chip that cannot answer must not sit there selected. The Slider is
       offered only while it can actually reach the payout; past that the row
       falls back to a style rather than leaving a dead control lit, or worse,
       nothing lit at all. wspStyleOn decides, so this cannot disagree with what
       wspBuild does. */
    var _on=wspStyleOn();
    /* Wrapped: see .wsp-right - the columns must not share rows. */
    html += "<div class='wsp-right'>";
    html += "<div class='wsp-lbl'>Slip style</div><div class='wsp-chips' id='wspStyleChips'>"+
      styles.map(function(st){return "<button class='wsp-chip wsp-style"+(_on===st[0]?" on":"")+"' data-lo='"+st[0]+"'><b>"+st[1]+"</b>"+(st[2]?"<i>"+st[2]+"</i>":"")+"</button>";}).join("")+"</div>";
    /* AUTO WAS A CHIP HERE AND IS NOW A LINK OUT.
       As a chip it had to be greyed whenever the Slider could not reach the
       payout, which meant a control that changed appearance for a reason no
       reader could see - and it lost on every measurement anyway: over a full
       Saturday card with live SportyBet prices it built 30 legs landing 0.001%
       at x6000 where "Fewer games" built 16 landing 0.182%, and it never won a
       single rung. Keeping it as a fourth chip sold the worst option beside
       three better ones.
       The Slider is still there and still worth using - it just answers "how
       much risk", not "what payout", so it belongs behind its own tab rather
       than inside this row. A link says that honestly and never needs greying,
       because the Slider tab always works. */
    /* Where "every style builds the same slip" explains itself. Filled by
       renderBuilderOutput, which is the only place the pool size is known;
       empty and marginless the rest of the time, like #payAsk above. */
    html += "<p class='wsp-hint' id='wspExh' hidden></p>";
    /* "Or let the Slider pick the games" ran the width of the panel and read
       as an afterthought to the button under it, which is what "Or" makes
       anything sound like. It is a second way to build, so it gets a heading
       of its own and a name rather than a sentence - and its own colour,
       because it goes somewhere else rather than doing what the red button
       does. */
    html += "<div class='wsp-lbl wsp-auto-lbl'>Auto</div>";
    html += "<button class='wsp-slider-link' id='wspToSlider' type='button'>"+
      "<span class='wsl-t'>Let the Slider pick</span>"+
      "<span class='wsl-a' aria-hidden='true'>\u2192</span></button>";
    html += "</div>";
  }
  html +=
    "<button class='book-btn wsp-go"+(WSP.odds==null?" waiting":"")+
      "' id='wspGo' type='button'>Conjure ticket</button>";

  $("wizardPanel").innerHTML=html;
  // Panel visibility
  $("sliderPanel").hidden=true;
  $("wizardPanel").hidden=false;
  // Update mode buttons
  document.querySelectorAll(".bld-mode-btn").forEach(function(b){
    b.classList.toggle("on",b.dataset.mode===BUILD.mode);
    b.setAttribute("aria-selected",b.dataset.mode===BUILD.mode?"true":"false");
  });
  // Event listeners. Chips update the build INPUTS and refresh the stat tiles
  // (games / avg confidence / total odds) via the ghost preview - but the game
  // list itself stays hidden until Conjure is tapped, so Conjure keeps its
  // reveal moment.
  $("wspOddsChips").querySelectorAll("[data-o]").forEach(function(c){
    c.addEventListener("click",function(){WSP.odds=+c.dataset.o;WSP._sig=null;
      try{localStorage.setItem("sw.wspodds",String(WSP.odds));}catch(e){}
      renderBuilder();});
  });
  /* The custom box. Committed on blur or Enter rather than per keystroke, or
     typing "5000" would rebuild the slip at 5, 50 and 500 on the way. Clamped
     to the same ceiling the chips stop at: above that the wizard cannot reach
     the target from one card and would just return its longest slip while
     appearing to have hit a number nobody can hit. */
  /* A TARGET ONLY THE WIDER WINDOW CAN REACH.
     The ladder tops out at x6,000 on a single day and x50,000 on All upcoming,
     because the jackpot rungs want about twenty legs and one fixture day
     rarely holds that many worth backing. Typing x20,000 on Today used to be
     clamped to x6,000 in silence: the box changed under the fingers that had
     just typed it, and nothing said why or that the number asked for was
     available one tap away.
     So say it, and offer the tap. The offer is only made when it would
     actually work - above x50,000 there is no window that reaches it, and an
     offer that changes nothing is worse than the clamp it replaced. */
  /* The chips label a payout as x6k rather than x6000, so the sentence about
     them must read the same way or it looks like a different number. */
  function payLbl(n){ return n>=1000 ? (n/1000)+"k" : String(n); }
  window.askWiderWindow=function(typed,ceil){
    if(!showPrompt("payAsk",
      "<div class='confirm-card'><p><b>\u00d7"+payLbl(typed)+" needs a wider window.</b> "+
      "A narrow window rarely holds the games for it, so this one tops out at "+
      "<b>\u00d7"+payLbl(ceil)+"</b>. All upcoming can reach it.</p>"+
      "<div class='ca'><button class='confirm-go' type='button'>Use all upcoming</button>"+
      "<button class='confirm-cancel' type='button'>Keep \u00d7"+payLbl(ceil)+"</button></div></div>")) return;
    var host=$("payAsk");
    host.querySelector(".confirm-go").addEventListener("click",function(){
      clearPrompt("payAsk");
      /* setScope does the storing and the repaint; the rest is the same reset
         a scope button performs, because the pool the slip was drawn from has
         just changed and a removal list from the old one is stale. */
      if(setScope("all")){
        BUILD.removed={}; BUILD.touched=true;
        WSP.removed={}; WSP._slip=null; WSP._sig=null;
        var _br=$("bookResult"); if(_br) _br.innerHTML="";
      }
      WSP.odds=typed; WSP._sig=null;
      try{localStorage.setItem("sw.wspodds",String(typed));}catch(e){}
      renderBuilder();
    });
    host.querySelector(".confirm-cancel").addEventListener("click",function(){
      clearPrompt("payAsk");
    });
  };
  var _cust=$("wspCust");
  if(_cust){
    var commit=function(){
      var raw=String(_cust.value||"").replace(/[^0-9]/g,"");
      if(!raw){ return; }
      /* Clamped to the ladder's own ceiling rather than a flat 50000. On a
         single day the jackpot rungs are not offered at all, and a target
         above them was being silently wiped by the guard above - typing
         50000 on Today cleared the box and chose nothing. Landing on the
         highest reachable number says what happened. */
      var _ceil=WSP._maxTarget||50000;
      var _typed=parseInt(raw,10)||0;
      var v=Math.max(2,Math.min(_ceil,_typed));
      _cust.value=v;
      /* Clamped, and the wider window would not have clamped it. */
      var _needsWider=(_typed>_ceil && SCOPE!=="all" && _typed<=(WSP._wideMaxTarget||50000));
      WSP._typed="";
      if(v!==WSP.odds){
        WSP.odds=v; WSP._sig=null;
        try{localStorage.setItem("sw.wspodds",String(v));}catch(e){}
        renderBuilder();
        var again=$("wspCust"); if(again){ again.focus(); }
      }
      /* AFTER the render, never before. #payAsk lives inside the panel that
         renderBuilder replaces, so an ask raised first is wiped by the redraw
         that follows it - and silently, because showPrompt succeeded and the
         node it wrote into no longer exists. Caught in the browser, not by
         reading: the first version fired correctly and left nothing on
         screen. */
      if(_needsWider) askWiderWindow(_typed,_ceil);
    };
    _cust.addEventListener("blur",commit);
    _cust.addEventListener("keydown",function(e){
      if(e.key==="Enter"){ e.preventDefault(); commit(); }
    });
    /* Keep it to digits while typing, so the clamp never has to argue with a
       value the field itself allowed. */
    _cust.addEventListener("input",function(){
      var c=_cust.value.replace(/[^0-9]/g,"");
      if(c!==_cust.value) _cust.value=c;
      /* Starting your own number abandons the ladder. The chip stayed lit and
         the slip built for it stayed on screen until you committed, so the
         panel showed x1k selected, x1k's games below, and a half-typed
         different target in the box - three answers to one question.
         Only on the first keystroke: re-rendering per character would fight
         the typing. The value and caret are put back afterwards because the
         re-render builds a fresh input. */
      /* Typing a target is choosing one, even before it is committed - so the
         style row comes up with the first digit and goes with the last.
         Asked for: "when a user types in the xOwn input box, let the slip style
         show up. when he clear, let it vanish." */
      var hadTyped=!!(WSP._typed&&WSP._typed.length);
      WSP._typed=c;
      if(!c.length && hadTyped){
        renderBuilder();
        var back=$("wspCust"); if(back){ back.value=""; back.focus(); }
        return;
      }
      if(WSP.odds==null && !WSP.conjured){
        if(c.length && !hadTyped){
          renderBuilder();
          var first=$("wspCust");
          if(first){ first.value=c; first.focus();
            try{first.setSelectionRange(c.length,c.length);}catch(e){} }
        }
        return;
      }
      WSP.odds=null; WSP._sig=null; WSP._slip=null; WSP.conjured=false; WSP.removed={};
      try{localStorage.removeItem("sw.wspodds");}catch(e){}
      var _to=$("totOdds"); if(_to) _to.textContent="-";
      var _br=$("bookResult"); if(_br) _br.innerHTML="";
      renderBuilder();
      var again=$("wspCust");
      if(again){ again.value=c; again.focus();
        try{again.setSelectionRange(c.length,c.length);}catch(e){} }
    });
  }
  /* Absent until a payout is chosen, so still guarded. Unguarded this threw
     and took the whole panel down with it, which is a blank Wizard rather than
     a missing row. */
  var _sty=$("wspStyleChips");
  if(_sty) _sty.querySelectorAll("[data-lo]").forEach(function(c){
    c.addEventListener("click",function(){
      WSP.legodd=+c.dataset.lo;
      WSP._sig=null;renderBuilder();
      /* renderBuilder rebuilds the input, so a half-typed target would be lost
         by choosing a style for it - which is the one moment the row is on
         screen BECAUSE something is being typed. */
      if(WSP._typed&&WSP._typed.length){
        var keep=$("wspCust");
        if(keep){ keep.value=WSP._typed; keep.focus();
          try{keep.setSelectionRange(WSP._typed.length,WSP._typed.length);}catch(e){} }
      }
    });
  });
  /* Absent before a payout is chosen, like the chips it sits under. */
  var _toSlider=$("wspToSlider");
  if(_toSlider) _toSlider.addEventListener("click",function(){
    BUILD.mode="slider";
    try{localStorage.setItem("sw.mode","slider");}catch(e){}
    renderBuilder();
  });
  $("wspGo").addEventListener("click",function(){
    /* Disabled would have been silent about why. It stays pressable and says
       what is missing, then points at the chips that answer it. */
    if(WSP.odds==null){
      window.swToast&&window.swToast("Pick a target payout first","err");
      var chips=$("wspOddsChips");
      if(chips){
        chips.classList.remove("wsp-nudge"); void chips.offsetWidth;
        chips.classList.add("wsp-nudge");
        try{chips.scrollIntoView({behavior:REDUCED?"auto":"smooth",block:"center"});}catch(e){}
      }
      return;
    }
    buzzConjure(); wspConjure(false);});

}
function renderBuilderOutput(){
  var firstVisit = BUILD.risk === null;
  var displayRisk = firstVisit ? 45 : BUILD.risk;
  var p = riskParams(displayRisk);
  var isWiz = BUILD.mode==="wizard";
  var picks, wizGhost=false;
  if(isWiz){
    if(WSP.conjured){
      /* Cache the conjured slip and only rebuild when a build INPUT changes
         (payout, style, markets, shuffle seed, league filter, scope). A plain
         delete changes only WSP.removed - not the signature - so we filter the
         cached slip instead of rebuilding, which means a removed leg shrinks the
         slip and stays gone rather than getting back-filled to hit the target. */
      /* wspStyleOn(), not WSP.legodd directly, though today they return the
         same thing. The chip row is drawn from wspStyleOn and the slip is
         cached against it, so whatever the row shows and whatever gets built
         cannot drift apart. They did once: an Auto chip that could stop being
         answerable left the cached slip from one method sitting under a row
         lit for another. Auto is gone, but the coupling is the point and costs
         a function call. */
      var _sig=[WSP.odds,WSP.legodd,wspStyleOn(),WSP.seed,JSON.stringify(WSP.mk),!!TOP_ONLY,SCOPE,SDAY,SPAN,TOD,!!WSP.everyGame].join("|");
      if(WSP._sig!==_sig || !WSP._slip){
        var _r=wspBuild();
        WSP._slip=_r.picks.map(function(c){return {f:c.f,id:c.id,code:c.code,p:c.p,eventId:(c.f&&c.f.eventId)||null};});
        /* Cached with the slip, because the note below is drawn on every
           render and the pool size is only known while a build is running. */
        WSP._exh=!!_r.exhausted; WSP._short=!!_r.short;
        WSP._sig=_sig;
      }
      picks=WSP._slip.filter(function(c){return !WSP.removed[c.id];});
    } else {
      /* Not conjured yet: show a GHOST preview - stat tiles computed from a
         throwaway build so the numbers update as chips are tapped, but the
         game list stays hidden until Conjure. */
      wizGhost=true;
      /* Capped to match the build, not to a number of its own. This said 40
         while wspBuild was returning 45 for x20000 and 49 for x50000, so the
         preview reported forty games and odds well short of the target - and
         since the preview is what you read while choosing, the jackpot tier
         looked broken when only this line was. A preview that does not agree
         with the thing it previews is worse than no preview. */
      var _g=wspBuild();
      WSP._exh=!!_g.exhausted; WSP._short=!!_g.short;
      picks=_g.picks.map(function(c){return {f:c.f,id:c.id,code:c.code,p:c.p,eventId:(c.f&&c.f.eventId)||null};})
        .slice(0,isJackpotOdds(WSP.odds)?JACKPOT_LEG_CAP:40);
    }
  } else {
    picks = firstVisit ? [] : buildPicks();
  }
  BUILD.picks = picks;
  /* THE STYLE CHIPS, WHEN THE WINDOW HAS NOTHING LEFT TO TRADE.
     Every style uses the whole pool here, so all three land on the same games
     and the chips look broken. Say which it is, and name the window as the
     thing to change - that is the actionable half, exactly as the slider's
     "all that clear the bar in this window" does. Absent otherwise, so it
     never comments on a slip the styles CAN move. */
  var _exhEl=$("wspExh");
  if(_exhEl){
    var _sayExh=isWiz && WSP.odds!=null && !WSP.everyGame && WSP._exh && picks.length;
    _exhEl.hidden=!_sayExh;
    _exhEl.innerHTML=_sayExh
      ? "<b>This window holds "+picks.length+" games we rate.</b> Every style "+
        "uses all of them, so none of them changes the slip"+
        (WSP._short?" and ×"+WSP.odds+" is out of reach":"")+
        ". Widen the day span, or turn off top flight only, to trade games "+
        "against odds."
      : "";
  }
  // Risk bubble
  var _rb=$("riskBubble");
  if(_rb){ _rb.style.left="calc("+displayRisk+"% + "+(13-displayRisk*0.26)+"px)";
    _rb.textContent=firstVisit ? "-" : (picks.length
      ? picks.length+" game"+(picks.length===1?"":"s")
      : "No games"); }
  /* Risk sub text.
     When the slip is smaller than the dial asked for, say so and say why.
     Reported as "the slider being stuck at 9 games": on a narrow window - Today
     only, Late - the scope is 16 fixtures and only 9 of them carry a market
     clearing the bar, so from about 60 upward the dial moves and the slip
     cannot grow. Nothing on screen said that, which makes a working slider look
     broken. Naming the window is the actionable half: the fix is to widen it,
     not to keep dragging. */
  var _short = !firstVisit && picks.length < p.maxGames;
  $("riskSub").textContent=firstVisit ? "Move slider to build"
    : (picks.length+" game"+(picks.length===1?"":"s")+" \u00b7 "+P0(p.minConf)+"%+ confidence"+
       (_short ? " \u00b7 all that clear the bar in this window" : ""));
  // Stats
  var odds=totalOdds(picks);
  var real=oddsAreReal(picks), pre=real?"\u00d7":"~\u00d7";
  var avg=picks.length?picks.reduce(function(t,c){return t+c.p;},0)/picks.length:0;
  /* On a jackpot ticket the confidence tile is dropped rather than shown.
     It reads as the chance of the slip and it is nothing of the kind - it is
     the average of forty-odd legs, so a 79% sits above a ticket whose real
     chance of coming in is a fraction of one per cent. On an ordinary four-leg
     slip the average is a fair summary; here it flatters a lottery ticket, and
     the tier already says plainly what it is. Two tiles then, not three - the
     grid follows the count so the row stays even. */
  var _jackSlip=isJackpotOdds(WSP.odds)&&BUILD.mode==="wizard";
  var _statsEl=$("bldStats");
  _statsEl.classList.toggle("stats-2",_jackSlip);
  _statsEl.innerHTML=
    "<div class='stat'><span class='stat-ic'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='4' y='7' width='16' height='13' rx='2'/><path d='M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'/></svg></span><b>"+picks.length+"</b><i>Games</i></div>"+
    (_jackSlip?"":"<div class='stat'><span class='stat-ic'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z'/></svg></span><b>"+(picks.length?P0(avg)+"%":"-")+"</b><i>Average confidence</i></div>")+
    "<div class='stat odds'><span class='stat-ic'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='8'/><path d='M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3H10a1.5 1.5 0 0 0 0 3h4'/></svg></span><b id='totOdds'>"+(picks.length?pre+odds.toFixed(2):"-")+"</b>"+
      "<i>Total odds"+(picks.length&&!real?" (est.)":"")+"</i></div>";
  // Slip rows
  if(wizGhost){
    /* Ghost mode: numbers above are real, games hidden. Foot visibility is
       handled by the single source of truth at the end of this function. */
    $("slip").innerHTML="<div class='bld-empty'><b>"+picks.length+" game"+(picks.length===1?"":"s")+" ready</b>"+
      "<p>Tap Conjure to reveal your slip.</p></div>";
  } else if(!picks.length){
    var dry=(SCOPE!=="all")&&!scopeFixtures().length;
    /* Name the day that came up empty rather than always saying "today" - with
       a day picked, the blank board might be tomorrow or Saturday. */
    var dryDay=SCOPE==="span"?("in the next "+SPAN+" days")
      :(SDAY===0?"today":(SDAY===1?"tomorrow":dayName(SDAY)));
    $("slip").innerHTML="<div class='bld-empty'><b>"+(isWiz?(WSP.conjured?"No slip yet":"Ready when you are")+"":"Nothing in your slip")+"</b>"+
      (isWiz?(WSP.conjured?("No games match your wizard settings - try a lower payout"+(leaguesChosen()?", widen the leagues":"")+" or enable more markets."):"Tap a target payout to preview your slip.")
       : (dry?("No fixtures "+(SDAY===0?"left ":"")+dryDay+(TOD!=="all"?" in this time window":"")+(leaguesChosen()?" in the leagues you picked":"")+" - "+(leaguesChosen()?"widen the leagues":"switch to All upcoming")+" to keep building.")
         : (firstVisit ? "Move the slider to build a fresh set of games."
             : (emptyWhy()||"No games match. Adjust risk or markets."))))+"</div>";
  } else {
    $("slip").innerHTML=picks.map(function(c){
      var f=c.f, cf=conf(c.p);
      return "<div class='sp-row conf-"+cf+"'>"+
        "<div class='sp-main'><div class='sp-teams'>"+esc(f.home)+" v "+esc(f.away)+
          (c.eventId?"":"<span class='sp-noid' title='Not on SportyBet yet - can&apos;t auto-book'>no ID</span>")+"</div>"+
          "<div class='sp-meta'>"+compOf(f.league)+" \u00b7 "+dayName(dayOff(f.date))+" "+kickTime(f)+"</div></div>"+
        "<div class='sp-pick'><b>"+mLabel(f,c.code)+"</b><i>"+P0(c.p)+"%</i></div>"+
        "<span class='sp-odd'>"+oddCell(c.f,c.code,c.p)+"</span>"+
        "<button class='sp-x' data-rm='"+c.id+"' aria-label='Remove'>"+XSVG+"</button>"+
      "</div>";
    }).join("");
    $("slip").querySelectorAll("[data-rm]").forEach(function(b){
      b.addEventListener("click",function(){if(BUILD.mode==="wizard"){WSP.removed[b.dataset.rm]=1;}else{BUILD.removed[b.dataset.rm]=1;}renderBuilder();});});
  }
  /* A SHORT SLIP IS NOT A BROKEN ONE, AND IT HAS TO SAY SO.
     Reported: with Over 2.5 and Both to score on, the Slider "doesn't pick
     more than 2 odds while the wizard hits it". Both are working as built -
     the Slider picks on confidence and will not go below the floor the dial
     sets, while the wizard is aiming at a payout and takes what reaches it.
     Measured on a 404-game board with those two markets alone: 0 games clear
     Safe's 75%, 4 clear Balanced's 71%, 80 clear Risky's 60% - the best
     Over-2.5 read on the whole card was 73.7%. Nothing was failing; nothing
     said so either. */
  var sh=$("bldShort");
  if(sh){
    var g=(BUILD.mode==="slider"&&picks.length)?floorGap():null;
    var pool=(BUILD._pool==null)?(g&&g.over):BUILD._pool;
    if(g&&picks.length<g.max&&pool<=picks.length){
      sh.textContent=picks.length+" of the "+g.max+" games "+g.word+
        " allows: only "+(pool===1?"one game on this card clears "
                                  :pool+" games on this card clear ")+
        Math.round(g.need*100)+"% on the markets you have on"+
        /* Slide right is not advice at the right-hand end. */
        (BUILD.risk>=95 ? " - switch on more markets, or widen the leagues and days."
                        : " - slide right for a lower bar, or switch on more markets.");
      sh.hidden=false;
    }else{ sh.textContent=""; sh.hidden=true; }
  }
  // Sync to MYSLIP (slider once touched; wizard always reflects its preview)
  /* Never sync the ghost.
     Before Conjure is pressed the wizard renders a preview of what it would
     build - that is the point of it, you see the shape of the ticket while
     choosing a payout. But the sync condition asked only whether we were in
     wizard mode, so those preview legs went straight into My slip, and the
     slip filled itself before the button was touched. Conjure then appeared
     to do nothing, because its work was already on screen.
     A preview is a preview until somebody says yes. */
  if(!BUILD_NOSYNC && !wizGhost && (BUILD.touched || isWiz)){
    MYSLIP=MYSLIP.filter(function(x){return !x.auto;})
      .concat(picks.map(function(c){return {id:c.id,code:c.code,label:mLabel(c.f,c.code),p:c.p,auto:true};}));
    var _seen={}; MYSLIP=MYSLIP.filter(function(x){if(_seen[x.id])return false;_seen[x.id]=1;return true;});
    saveMy(); renderFab();
  }
  /* What the CURRENT book will take, not what SportyBet would. This counted
     c.eventId, which is SportyBet's id, so the note under a Bet9ja slip
     described SportyBet's coverage. */
  var canTake=picks.filter(function(c){return bookTakes(c);});
  var bookable=canTake.length;
  /* Which markets the shortfall is actually about. Bet9ja prices nine markets
     and no others - not team totals, not first-half, not both-to-score - so a
     leg on one of those is not unlucky, it can never be booked there. Naming
     them turns "3 of 26" into something the reader can act on by switching a
     toggle off. */
  var lostMk=[];
  picks.forEach(function(c){
    if(bookTakes(c)) return;
    var lbl=mLabel(c.f,c.code).replace(/<[^>]+>/g,"");
    if(lostMk.indexOf(lbl)<0) lostMk.push(lbl);
  });
  var btn=$("bookBtn");
  btn.disabled=BUILD.booking||!bookable;
  btn.textContent=BUILD.booking?"Booking\u2026":"Get code";
  // Hide footer actions when slip is empty, and in wizard GHOST mode (before
  // Conjure) - the earlier hide was being overridden here because ghost picks
  // are non-empty. This is the single source of truth for foot visibility.
  var foot=$("bldFoot");
  /* An inline style beats the html.wiz-mode rule in the stylesheet, so the
     wizard has to be excluded here too - otherwise conjuring puts the bar
     back. In the wizard the slip and Get code live in the My slip sheet;
     the panel keeps only the numbers. */
  var showFoot = (!isWiz && picks.length && !wizGhost && !firstVisit);
  if(foot) foot.style.display =
    showFoot ? "flex" : "none";
  /* The picker rides the same rule. Until now the slider had none at all,
     so Get code silently used whatever the My slip sheet was set to - and
     the wizard looked fine because its slip opens in that very sheet. */
  var bp=document.querySelector('[data-bookpick="build"]');
  /* Its own picks, not My slip's. Counted here rather than in
     paintBookPicker because only this function knows about wizard mode and
     the ghost preview. */
  try{ paintBookPickerWith(bp, showFoot ? picks.map(function(c){
    return {id:c.id,f:c.f||fixtureById(c.id),code:c.code};
  }) : []); }catch(e){}

  var note=$("bldNote");
  var onlyHint=bookOnlyHint(picks);
  if(!picks.length) note.textContent="";
  /* A market only the other book sells is a different fact from a market
     neither offers on this fixture, and only one of them can be acted on. */
  else if(onlyHint) note.textContent=onlyHint;
  else if(!bookable) note.textContent=curBook().label+" does not offer "+
    (lostMk.length?lostMk.join(" or "):"these markets")+" on this slip, so none of it can be booked there.";
  else if(bookable<picks.length) note.textContent=bookable+" of "+picks.length+
    " can be booked on "+curBook().label+
    (lostMk.length?" - it does not offer "+lostMk.join(" or ")+".":".");
  /* THE BOOK THIS SLIP IS ACTUALLY GOING TO, not the one we started life
     selling. Every other branch of this note already asks curBook(); the happy
     path named SportyBet outright, so switching to Bet9ja - which the 1.5-rung
     chips now do for you - left "Booking 24 selections to SportyBet" over a
     slip that was about to produce a Bet9ja code. */
  else note.textContent="Booking "+bookable+" selection"+(bookable===1?"":"s")+
    " to "+curBook().label+".";
}

renderFab();
var RISK_RAF=0;
$("risk").addEventListener("input",function(){
  BUILD.risk=+this.value; BUILD.touched=true;
  try{localStorage.setItem("sw.risk",BUILD.risk);}catch(e){}
  var pct=+this.value;
  this.style.setProperty('--fill',pct+'%');
  this.style.backgroundSize=pct+'% 100%';
  var zone=pct<33?"safe":pct<66?"mid":"risky";
  var sp=$("sliderPanel"); if(sp){var prev=sp.getAttribute("data-zone");sp.setAttribute("data-zone",zone);
    if(prev&&prev!==zone&&navigator.vibrate)navigator.vibrate(8);}
  this.style.setProperty('--rz',zone==="safe"?"rgba(43,199,120,.35)":zone==="mid"?"rgba(242,184,75,.4)":"rgba(230,57,70,.4)");
  var ti=$("risk").closest(".slider-panel").querySelector(".risk-ticks");
  if(ti){var sp2=ti.querySelectorAll("span");sp2.forEach(function(s,i){s.classList.toggle("zone-live",(zone==="safe"&&i===0)||(zone==="mid"&&i===1)||(zone==="risky"&&i===2));});}
  BUILD.removed={}; $("bookResult").innerHTML="";
  /* Coalesced to one rebuild per frame. A range input fires `input` on every
     pixel of a drag, and this handler used to run renderBuilder synchronously
     on each one - measured at 20.8ms on this desktop, of which 11.8ms is
     buildPicks over the whole card. Several of those inside one frame, on a
     phone that is several times slower, saturates the main thread and the
     handle visibly lags the finger. Reported as the slider feeling "glitchy
     and sticky".
     The cheap parts above - fill, zone, ticks, haptic - still run on every
     event, so the track keeps up with the thumb. Only the slip rebuild waits
     for the frame, and a queued one is never stacked. */
  if(!RISK_RAF) RISK_RAF=requestAnimationFrame(function(){ RISK_RAF=0; renderBuilder(); });
});
/* And once more when the drag ends, so the slip always settles on the value
   the thumb was finally left at rather than on the last frame that happened to
   render. */
$("risk").addEventListener("change",function(){
  if(RISK_RAF){ cancelAnimationFrame(RISK_RAF); RISK_RAF=0; }
  renderBuilder();
});
paintScope();
(function(){
  var seg=$("scopeSeg"); if(!seg) return;
  seg.querySelectorAll("[data-scope]").forEach(function(b){
    b.addEventListener("click",function(){
      if(!setScope(b.getAttribute("data-scope"))) return;
      BUILD.removed={}; BUILD.touched=true;
      $("bookResult").innerHTML=""; renderBuilder();
    });
  });
})();
(function(){
  var b=$("scopeDayBtn"); if(!b) return;
  b.addEventListener("click",function(e){ e.stopPropagation(); openDayMenu(b); });
})();
(function(){
  var seg=$("todSeg"); if(!seg) return;
  seg.querySelectorAll("[data-tod]").forEach(function(b){
    b.addEventListener("click",function(){
      if(!setTod(b.getAttribute("data-tod"))) return;
      /* Same reset as the window switch: the pool the slip was drawn from has
         changed, so a removal list and a code from the old pool are both
         stale. */
      BUILD.removed={}; BUILD.touched=true;
      WSP.removed={}; WSP._slip=null; WSP._sig=null;
      $("bookResult").innerHTML=""; renderBuilder();
    });
  });
})();
// Filters collapse (expanded on first visit; remembers choice after)
(function(){
  var t=document.getElementById("filtersToggle"),b=document.getElementById("filtersBody");
  if(!t||!b) return;
  /* OPEN, EVERYWHERE, UNTIL THE READER SAYS OTHERWISE.
     It used to start closed under 560px, on the reasoning that the panel is
     322px of a 390px screen and the defaults are already right for nearly
     everybody. The counter-argument won: a first-time visitor who cannot see
     the controls does not know the slip can be narrowed at all, and a panel
     they have to discover is worth less than the scroll it costs. One tap
     still shuts it, and a stored choice still wins on both sizes. */
  var open=true;
  try{
    var pref=localStorage.getItem("sw.filters");
    open=(pref===null) ? true : pref!=="0";
  }catch(e){}
  function apply(){ b.hidden=!open; t.setAttribute("aria-expanded",open?"true":"false"); }
  apply();
  t.addEventListener("click",function(){ open=!open; try{localStorage.setItem("sw.filters",open?"1":"0");}catch(e){} apply(); });
})();
// Mode toggle
document.querySelectorAll(".bld-mode-btn").forEach(function(btn){
  btn.addEventListener("click",function(){
    var mode=btn.dataset.mode;
    if(mode===BUILD.mode) return;
    BUILD.mode=mode;
    try{localStorage.setItem("sw.mode",mode);}catch(e){}
    renderBuilder();
  });
});
$("bookBtn").addEventListener("click",bookSlip);
$("clearBtn").addEventListener("click",clearSlip);
$("shuffleBtn").addEventListener("click",function(){if(BUILD.mode==="wizard"){wspConjure(true);return;}BUILD.touched=true;BUILD.seed=Math.floor(Math.random()*1e6);BUILD.shuffles=(BUILD.shuffles||0)+1;BUILD.removed={};$("bookResult").innerHTML="";renderBuilder();});

var CONTACT_EMAIL="hello@soccerwizard.live";
/* Contact dialog.
   "Contact" was a bare mailto: on a site where nothing else hands you off to
   an external app without warning - on a phone that either opens a mail client
   you may not use or does nothing at all, with no way to tell which. A dialog
   shows the address, lets it be copied, and keeps the mail app as a choice
   rather than the only route.
   Built on the booking-code modal shell so there is one kind of centred dialog
   here, not two that nearly match. */
function openContact(){
  var old=document.getElementById("contactModal"); if(old) old.remove();
  var wrap=document.createElement("div");
  wrap.id="contactModal"; wrap.className="code-modal-scrim";
  wrap.innerHTML="<div class='contact-card' role='dialog' aria-modal='true' aria-labelledby='contactTitle'>"+
    "<button class='code-x' type='button' aria-label='Close'>"+
      "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' aria-hidden='true'><path d='M6 6l12 12M18 6L6 18'/></svg></button>"+
    "<h3 id='contactTitle'>Contact us</h3>"+
    "<p>Spotted something wrong with a prediction, a result or a booking code? "+
      "Tell us and we will look. We read everything.</p>"+
    /* The address is the link. Reading it and clicking it are the same
       gesture, and hiding it behind a button called "Open mail app" made
       people copy it by selecting the text anyway. */
    "<div class='contact-mail'>"+
      "<a href='mailto:"+esc(CONTACT_EMAIL)+"'>"+esc(CONTACT_EMAIL)+"</a>"+
      "<button type='button' class='c-copy' aria-label='Copy email address'>Copy</button>"+
    "</div>"+
    "<div class='contact-acts'>"+
      "<a class='primary' href='mailto:"+esc(CONTACT_EMAIL)+"'>Send an email</a>"+
      "<a href='https://x.com/soccerwizardhq' target='_blank' rel='noopener'>Message on X</a>"+
    "</div></div>";
  function close(){ wrap.remove(); document.removeEventListener("keydown",onKey); }
  function onKey(e){ if(e.key==="Escape") close(); }
  wrap.querySelector(".code-x").addEventListener("click",close);
  /* Clicking the backdrop closes; clicking inside the card must not. */
  wrap.addEventListener("click",function(e){ if(e.target===wrap) close(); });
  document.addEventListener("keydown",onKey);
  var cp=wrap.querySelector(".c-copy");
  cp.addEventListener("click",function(){
    copyText(CONTACT_EMAIL);
    var was=cp.textContent; cp.textContent="Copied";
    setTimeout(function(){ cp.textContent=was; },1500);
  });
  document.body.appendChild(wrap);
  /* Focus the close button so the dialog is reachable from the keyboard the
     moment it opens, and Escape has something to act on. */
  try{ wrap.querySelector(".code-x").focus(); }catch(e){}
}
(function(){ var b=$("contactBtn"); if(b) b.addEventListener("click",openContact); })();
/* ------------------------------------------------------------- theming */
const SUN='<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
const MOON='<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>';
function setTheme(t){
  document.documentElement.setAttribute("data-theme",t);
  try{localStorage.setItem("sw.theme",t);}catch(e){}
  const i=$("tglicon"); if(i) i.innerHTML=(t==="dark")?SUN:MOON;
  const m=document.querySelector('meta[name="theme-color"]');
  if(m) m.setAttribute("content",t==="dark"?"#0D0D0F":"#D9D7DE");
}
(function(){
  let t=null; try{t=localStorage.getItem("sw.theme");}catch(e){}
  setTheme(t||"dark");
  $("tgl").addEventListener("click",function(){
    setTheme(document.documentElement.getAttribute("data-theme")==="dark"?"light":"dark");});
})();
var _scrollIdle=null;
addEventListener("scroll",function(){
  /* A scroll handler is the worst place to assume an element is there:
     it runs dozens of times a second, so one missing node is not one
     error but a stream of them, and every frame of scrolling throws. */
  var _top=$("top"); if(_top) _top.classList.toggle("stuck",scrollY>10);
  /* Fades the floating buttons while the page moves - see .myfab above. The
     class is dropped a beat after scrolling stops rather than on every frame,
     so the button is not flickering its way down the page. */
  var r=document.documentElement;
  if(!r.classList.contains("scrolling")) r.classList.add("scrolling");
  clearTimeout(_scrollIdle);
  _scrollIdle=setTimeout(function(){r.classList.remove("scrolling");},320);
},{passive:true});

function paint(){
  (DATA.fixtures||[]).forEach(refineTip);
  /* Grade anything the newest results can settle before drawing, so the card
     below never shows a slip as running when its last game has finished. */
  try{ notifySettled(settleSlips()); }catch(e){}
  /* Safety dedupe: a swapped-orientation duplicate (PSG v Rennes AND Rennes v
     PSG on the same day) must never render twice. Keep the first seen per
     date+unordered-pair. */
  (function(){
    if(!DATA.fixtures) return;
    var seen={},out=[];
    DATA.fixtures.forEach(function(f){
      var k=f.date+"|"+[String(f.home).toLowerCase(),String(f.away).toLowerCase()].sort().join("|");
      if(seen[k]) return; seen[k]=1; out.push(f);
    });
    DATA.fixtures=out;
  })();
  /* Restore saved view tab (pred/live/build) on reload. Default is "pred". */
  setView(V.view || "pred");
  let d=DATA.generated||"";
  try{d=new Date(d+"T00:00:00Z").toLocaleDateString(undefined,
    {day:"numeric",month:"short",timeZone:"UTC"});}catch(e){}
  $("when").textContent=d;
  var w2=$("when2"); if(w2) w2.textContent=d;
  renderStreak();
  /* The recap chip that used to live here is now the #daily card at the top of
     the rail - same fact, somewhere people actually look. */
  var vs=$("v-cards"),vp=$("v-list");
  if(vs){vs.classList.toggle("on",!V.list); if(!vs._w){vs._w=1;vs.addEventListener("click",function(){setList(false);});}}
  if(vp){vp.classList.toggle("on",V.list); if(!vp._w){vp._w=1;vp.addEventListener("click",function(){setList(true);});}}
  $("foot").textContent="Built from "+DATA.matches.toLocaleString()+
    " past results across "+(DATA.leagues||[]).length+" leagues in season.";
  var yr=$("yr"); if(yr) yr.textContent=new Date().getFullYear();
  const box=$("q");
  if(box){let t=null;box.addEventListener("input",function(){
    clearTimeout(t);t=setTimeout(function(){V.q=box.value;render();},160);});}
  render();
  /* The scope segment is painted once at init, before any fixtures exist, and
     a page deep-linked to #build can draw the builder before the payload lands.
     Repaint it whenever data settles so the day pill's count and the picker's
     rows are drawn from the same fixtures - otherwise the pill reads a stale 0
     while the on-open menu shows the real number. */
  try{paintScope();}catch(e){}
}

/* --------------------------------------------------------- live data
   The payload is baked into a static file at deploy time. Preferring it means
   the page loads from the CDN with no serverless invocation at all - fast for
   the visitor, and the reason a crowd costs no more than one person. Building
   inside a request takes tens of seconds, so whoever arrived on a cold cache
   used to wait for it.
   /api/predictions is the fallback and the freshness path: if the baked file
   has aged past the window the CDN would have cached it for anyway, we paint
   it immediately and quietly fetch the live one behind it. */
/* ---------------------------------------------- the day's card stands all day
   A prediction should stay on the board until the day's football is actually
   over. The feeds do not promise that: SportyBet supplies most of the card and
   drops a match once it has been played, so a game that kicked off at 19:45 can
   disappear at the next refresh - which is how an EFL Cup tie went missing from
   today's board mid-evening, result and all.
   So we keep our own copy of today's fixtures and put back anything a newer
   payload has lost. Only today is held, and only until the date rolls over: a
   day that has been and gone is pruned, so this never grows. A fixture that was
   genuinely called off will linger until midnight, which is the right side to
   err on - the board saying a game exists is recoverable, the board silently
   losing a tip people are tracking is not. */
var STICKY_PFX="sw.day.";
function localTodayISO(){ return isoOffset(0); }
/* The same local calendar day the sticky store is keyed on, offset by days.
   Built from the local date rather than from an ISO string so it cannot slip
   a day for anyone west of UTC, which is the whole reason the store uses a
   local key in the first place. */
function isoOffset(off){
  var n=new Date(); n.setDate(n.getDate()+(off||0));
  var p=function(x){return ("0"+x).slice(-2);};
  return n.getFullYear()+"-"+p(n.getMonth()+1)+"-"+p(n.getDate());
}
function pruneStickyDays(){
  try{ for(var i=localStorage.length-1;i>=0;i--){ var k=localStorage.key(i);
    if(!k||k.indexOf(STICKY_PFX)!==0) continue;
    var d=k.slice(STICKY_PFX.length);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||dayOff(d)<0) localStorage.removeItem(k);
  } }catch(e){}
}
function saveStickyDay(){
  try{
    var today=(DATA.fixtures||[]).filter(function(f){return dayOff(f.date)===0;});
    if(!today.length) return;
    localStorage.setItem(STICKY_PFX+localTodayISO(),JSON.stringify(today));
  }catch(e){}
}
function mergeStickyDay(){
  try{
    var raw=localStorage.getItem(STICKY_PFX+localTodayISO()); if(!raw) return 0;
    var saved=JSON.parse(raw); if(!Array.isArray(saved)||!saved.length) return 0;
    var have={}; (DATA.fixtures||[]).forEach(function(f){have[fid(f)]=1;});
    var back=saved.filter(function(f){
      return f&&f.date&&dayOff(f.date)===0&&!have[fid(f)];});
    if(back.length) DATA.fixtures=(DATA.fixtures||[]).concat(back);
    return back.length;
  }catch(e){ return 0; }
}
/* Restore what a payload has lost, then store the union, so the day only ever
   accumulates. Called wherever DATA is replaced. */
function holdTheDay(){
  try{
    var n=mergeStickyDay();
    if(n) try{console.log("[sticky] restored "+n+" fixture(s) the feed dropped");}catch(e){}
    saveStickyDay(); pruneStickyDays();
    /* A fresh payload arrives with only the server's results, so the days we
       recorded ourselves have to be put back under them each time. */
    var m=mergeFTLog();
    if(m) try{console.log("[ft] filled "+m+" result(s) the feed has not published");}catch(e){}
  }catch(e){}
}
/* PAYLOAD_MAX_AGE_MS lived here and decided when to re-fetch the payload from
   /api/predictions. Nothing re-fetches it now - see the note in load() - so a
   threshold for "old enough to go and ask again" has nothing to govern. The
   payload's actual age is still shown to the reader as "last updated". */
async function fetchJSON(url){
  const r=await fetch(url,{headers:{Accept:"application/json"}});
  if(!r.ok){
    const body=await r.json().catch(function(){return {};});
    throw new Error(body.error||("the server returned "+r.status));
  }
  return r.json();
}
function payloadAge(p){
  var t=(p&&p.generatedAt)?Date.parse(p.generatedAt):NaN;
  return isNaN(t)?Infinity:(Date.now()-t);
}
function usablePayload(p){return !!(p&&Array.isArray(p.fixtures)&&p.fixtures.length);}
async function fetchPayload(){
  /* Both routes are tried more than once. The static file can 404 for a few
     seconds while a deploy replaces it, and the function behind the API can
     be cold at the same moment - a deploy is exactly when both are shaky.
     One unlucky pass used to throw all the way out to the error screen and
     stay there until somebody reloaded by hand. */
  var lastErr=null;
  for(var attempt=1;attempt<=3;attempt++){
    try{
      const p=await fetchJSON("/predictions.json");
      if(usablePayload(p)) return {payload:p};
    }catch(e){ lastErr=e; }
    try{
      const q=await fetchJSON("/api/predictions");
      /* Last time round, take whatever the API gave rather than throwing:
         a thin payload still renders something, an exception renders nothing. */
      if(usablePayload(q)||attempt===3) return {payload:q};
    }catch(e){ lastErr=e; }
    if(attempt<3) await new Promise(function(r){setTimeout(r,700*attempt);});
  }
  throw lastErr||new Error("predictions could not be loaded");
}
/* Counts only consecutive failures - reset the moment a load succeeds, so a
   blip today does not use up the retries for a blip an hour from now. */
var LOAD_RETRY=0;
/* Writing the board, guarded.
   Six places set this innerHTML straight off a $() lookup, including load()'s
   own error handler - so if the element were ever missing, the handler for the
   failure would fail too, and the second throw would replace the first. That
   is how a 404 on /api/fixtures surfaced in Sentry as "Cannot set properties
   of null" with nothing about the fetch in it. */
function setBoard(html){ var el=$("list"); if(el) el.innerHTML=html; return !!el; }

async function load(){
  setBoard("<div class='none'><span class='mini-load'></span><b>Loading predictions</b>"+
    "<p>Building from the latest results - just a moment.</p></div>");
  try{
    const got=await fetchPayload();
    DATA=got.payload;
    holdTheDay();
    await loadSporty();
    loadBet9jaSoon();
    LOAD_RETRY=0;
    /* The first moment fixtureById can answer, so the first moment the saved
       slip can be judged. Before this the badge is drawn from whatever was in
       localStorage, including yesterday's conjured legs. */
    try{ pruneMy(); }catch(e){}
    settleSlips();   /* first pass on load: results are already old news */
    startLive();
    paint();
    hideLoader();
    /* THE FRESHNESS FETCH IS GONE, and this is the note for whoever wonders
       where it went. It called /api/predictions whenever the baked payload was
       over six hours old - which is most of the day - and repainted only if the
       answer came back NEWER. It never could. Both sides read the same file:
       within a deployment the baked payload cannot change, and a new deployment
       replaces the static file and the function bundle together. So the
       comparison was always equal and the repaint never ran.
       That would merely have been waste, except /api/predictions used to BUILD:
       577 invocations in 12 hours, 8 hours of active CPU, every one killed at
       60 seconds, and 47,000 requests to football-data.co.uk. This line is
       where most of those came from. */
  }catch(err){
    var w=$("when"); if(w) w.textContent="-";
    /* Keep trying rather than sitting there. The usual cause is a deploy
       swapping the payload out underneath a visitor, which resolves in
       seconds - and "reload to try again" put the fix on the person least
       equipped to know it was temporary. */
    var willRetry=LOAD_RETRY<4;
    setBoard("<div class='none'>"+
      (willRetry?"<span class='mini-load'></span>":"")+
      "<b>Predictions unavailable</b><p>"+esc(err.message||err)+". "+
      (willRetry?"Trying again…":"Please reload the page.")+"</p></div>");
    hideLoader();
    if(willRetry){
      LOAD_RETRY++;
      /* Nothing awaits this, so a throw here has nowhere to go but
         window.onunhandledrejection. */
      setTimeout(function(){ load().catch(function(){}); }, Math.min(12000,1800*LOAD_RETRY));
    }
  }
}
function hideLoader(){
  /* Ahead of the early return on purpose: this runs again on a retry, when the
     loader element is already gone, and the height reserves must come off even
     then. See the `html.booting` block in the stylesheet. */
  document.documentElement.classList.remove("booting");
  var l=$("loader"); if(!l) return; l.classList.add("hide");
  setTimeout(function(){if(l&&l.parentNode) l.parentNode.removeChild(l);},500);}
setTimeout(hideLoader,8000);
/* THE BOTTOM BAR NO LONGER HIDES, AND THE OBSERVER THAT HID IT IS GONE.
   It used to disappear while the slip CTA was on screen, on the reasoning that
   two ways into the builder at once is clutter. That reasoning died when the
   masthead's nav was dropped on phones: this bar is now the only way to reach
   Home, Build or Live, and navigation that hides itself is not navigation.
   It was also broken. The element it watched was resolved once at load -
   `.slip-cta || .top` - so on the builder, where .slip-cta is display:none, a
   zero-box element never intersected and the bar was pinned open; the .top
   fallback could never fire either, since a position:sticky header always
   intersects. Both facts were measured on the live site before this went. */
/* Desktop: the offer follows you down. Same observer, same rule - it shows
   only once the real button has left the screen, so the two are never both
   on it. Hidden outright on the builder and the live page, where it would be
   offering you the thing you are already looking at. */
(function(){
  var fab=document.getElementById("ctaFab");
  var cta=document.querySelector(".slip-cta");
  if(!fab||!cta||!("IntersectionObserver" in window)) return;
  function allowed(){
    var c=document.documentElement.classList;
    return !c.contains("mode-build") && !c.contains("mode-live");
  }
  var out=false;
  function apply(){
    var show=out&&allowed();
    fab.hidden=!show;
    /* Flipped on the next frame so the transition has a state to move from -
       set together with hidden it would simply appear. */
    if(show) requestAnimationFrame(function(){fab.classList.add("on");});
    else fab.classList.remove("on");
  }
  new IntersectionObserver(function(es){ out=!es[0].isIntersecting; apply(); },
    {rootMargin:"-8px 0px 0px 0px"}).observe(cta);
  fab.addEventListener("click",function(){
    try{localStorage.setItem("sw.mode","wizard");}catch(e){}
    BUILD.mode="wizard"; setView("build");
    apply();   /* it just sent you to the builder; it should not still be there */
  });
  /* Watch the state rather than guess at what changed it. The previous version
     re-checked after a click on a nav tab, which missed every other way the
     view changes - this button itself, the two buttons on the offer card, the
     logo, the back button. Tapping this one took you to the builder and left
     it sitting there, which is exactly the case it exists to avoid.
     setView swaps these classes, so the classes are the thing to observe. */
  new MutationObserver(apply).observe(document.documentElement,
    {attributes:true, attributeFilter:["class"]});
})();
/* ============================================= premium enhancement engine */
(function(){
  var host=document.createElement('div');host.id='toasts';document.body.appendChild(host);
  window.swToast=function(msg,kind,key){var t=document.createElement('div');t.className='toast '+(kind||'');
    if(key){var old=host.querySelector('[data-k="'+key+'"]');if(old)old.remove();t.setAttribute('data-k',key);}
    t.textContent=msg;host.appendChild(t);requestAnimationFrame(function(){t.classList.add('in');});
    setTimeout(function(){t.classList.remove('in');setTimeout(function(){t.remove();},300);},2600);};
  document.addEventListener('click',function(e){
    var el=e.target.closest('button,.lrow,.m,.gl-card,.ls-card,.vt,.navt,.mkt,.cat');
    if(!el)return;
    /* NOT ON A CONTROL THAT ALREADY ANSWERS THE TAP.
       The ink is a circle scaled 2.6 times inside overflow:hidden, so on a
       short wide box it is CLIPPED TO THE BOX and reads as a pale rectangle
       flashing behind the thing you pressed - reported on the bottom bar as
       "a white boxy shadow when clicked", and visible on the book toggle for
       the same reason. Those controls answer instantly on their own: the bar
       moves its red disc, the toggle swaps its brand ring. A ripple on top of
       an answer is noise wearing the shape of a bug. */
    if(el.closest('.btabs,.byo-book,.byo-jobs')) return;
    var r=el.getBoundingClientRect(),d=Math.max(r.width,r.height);
    if(getComputedStyle(el).position==='static')el.style.position='relative';
    el.classList.add('rip');
    var ink=document.createElement('span');ink.className='rip-ink';
    ink.style.width=ink.style.height=d+'px';
    ink.style.left=(e.clientX-r.left-d/2)+'px';ink.style.top=(e.clientY-r.top-d/2)+'px';
    el.appendChild(ink);setTimeout(function(){ink.remove();},560);
  },true);
  var REDU=window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var io=new IntersectionObserver(function(es){es.forEach(function(en){if(!en.isIntersecting)return;
    io.unobserve(en.target);countUp(en.target);});},{threshold:.6});
  function countUp(el){
    if(el._done)return;var m=el.textContent.match(/-?\d[\d,]*\.?\d*/);if(!m)return;el._done=1;
    if(REDU)return;
    var prefix=el.textContent.slice(0,m.index),suffix=el.textContent.slice(m.index+m[0].length);
    var target=parseFloat(m[0].replace(/,/g,''));if(isNaN(target))return;
    var dec=(m[0].split('.')[1]||'').length,final=el.textContent,t0=null,dur=620;
    function step(ts){if(!t0)t0=ts;var k=Math.min(1,(ts-t0)/dur);var v=target*(1-Math.pow(1-k,3));
      el.textContent=prefix+(dec?v.toFixed(dec):Math.round(v).toLocaleString())+suffix;
      if(k<1)requestAnimationFrame(step);else el.textContent=final;}
    requestAnimationFrame(step);
  }
  window.__observeNums=function(root){(root||document).querySelectorAll('.big.num,.stat b,.gl-pc,.record-stat .pc,.sotd-odds b').forEach(function(el){if(!el._done)io.observe(el);});};
  /* Goal fest and Biggest scoreline used to be built here and inserted
     under the Pick of the day. They were asked for removal, and they had
     appeared to go - but only because this whole block was never running:
     it closed on "});" instead of "})();", so __afterRender never existed
     to call the builder. Fixing that brought them straight back. Removed
     properly this time, on every screen. The .glance and .gl-* rules in the
     stylesheet no longer match anything. */
  function hashColor(s){var h=0;for(var i=0;i<s.length;i++)h=s.charCodeAt(i)+((h<<5)-h);return 'hsl('+(Math.abs(h)%360)+',52%,42%)';}
  var CREST={};
  window.__monograms=function(){
    document.querySelectorAll('.teams .tn, .tnames .tn').forEach(function(tn){
      if(tn.querySelector('.mono'))return;var nm=(tn.textContent||'').trim();if(!nm)return;
      var mono=document.createElement('span');mono.className='mono';
      mono.style.background=hashColor(nm);
      var url=CREST[nm];
      if(url){var img=new Image();img.onload=function(){mono.classList.add('has-crest');mono.textContent='';mono.appendChild(img);};img.src=url;}
      mono.textContent=nm.replace(/[^A-Za-z ]/g,'').slice(0,2).toUpperCase();
      tn.insertBefore(mono,tn.firstChild);
    });
  };
  window.__setCrests=function(map){CREST=map||{};if(window.render)render();};
  window.__afterRender=function(){try{window.__monograms();}catch(e){}try{window.__observeNums();}catch(e){}try{window.__wireAlert();}catch(e){}try{window.__settleRecord();}catch(e){}};
  document.addEventListener('keydown',function(e){
    if(e.key==='/'&&!/input|textarea|select/i.test((document.activeElement||{}).tagName||'')){
      var q=document.getElementById('q');if(q){e.preventDefault();q.focus();}}
  });
  ['bookResult','myBookResult','sotdResult'].forEach(function(id){var el=document.getElementById(id);if(!el)return;
    new MutationObserver(function(){if(el.querySelector('.code-err'))window.swToast("Couldn't get a code",'err');}).observe(el,{childList:true});});
  /* Sound toggle removed at owner's request (persistently broken across
     rebuilds). Goal notifications still fire for followed matches; only the
     audio path and its UI control are gone. */
  window.__wizChime=function(){};   /* chime call sites become silent no-ops */
  window.__wireAlert=function(){};  /* legacy render hook becomes a no-op */

  window.__settleRecord=function(){var bar=document.querySelector('.record-bar i');if(!bar||bar._settled)return;bar._settled=1;var w=bar.style.width;bar.style.width='0%';requestAnimationFrame(function(){requestAnimationFrame(function(){bar.style.width=w;});});};
  if(typeof render==='function'){var __ro=render;render=function(){__ro.apply(this,arguments);window.__afterRender();};}
  if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}
  var _dip=null;
  var bar=document.getElementById('instBar');
  var _standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone;
  /* Installed once, never offered again - remembered, because a browser tab
     cannot see that the app exists on the home screen. display-mode only says
     whether *this* window is the app. */
  var _installed=false;
  try{_installed=localStorage.getItem('sw.installed')==='1';}catch(e){}
  /* Hidden for this visit only. The offer stands until the app is installed,
     so a dismissal lasts the page view rather than for ever - otherwise one
     stray tap retires it permanently. */
  var _hidNow=false;
  function offerInstall(){
    if(!bar) return;
    bar.hidden = _standalone || _installed || _hidNow;
  }
  /* The offer no longer waits for beforeinstallprompt. That event is Chrome's
     alone - Safari never fires it, Firefox never fires it, and Chrome itself
     fires it once, early, and not again - so hanging the only install button
     on it meant most people never saw one. The bar stands on the simpler
     question of whether the app is already installed, and the prompt, when it
     does arrive, only decides what tapping Install can do: fire the real
     dialog, or explain where the browser keeps it. */
  offerInstall();
  function takeEvent(){
    if(window.__swInstallEvent){ _dip=window.__swInstallEvent; offerInstall(); }
  }
  window.addEventListener('sw-installable',takeEvent);
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();_dip=e;offerInstall();});
  takeEvent();
  window.addEventListener('appinstalled',function(){
    _installed=true; offerInstall();
    try{localStorage.setItem('sw.installed','1');}catch(e){}
    window.swToast&&window.swToast('Installed','ok');});
  var _iOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  /* Chrome can tell us the app is already on the device even from a browser
     tab, which is the one case the bar would otherwise get wrong: installed,
     but opened from a link rather than the home screen. It only reports apps
     the manifest lists under related_applications, so the manifest names this
     PWA as one of its own - without that entry this always came back empty and
     the offer stood in front of people who had already taken it. */
  /* AND THE SAME CALL HAS TO BE ABLE TO SAY NO.
     Reported: "i have uninstalled it and i try to install and it says
     installed." The flag above is written when an install is seen and was
     never cleared by anything except a prompt firing - so a phone the app was
     removed from kept a stored "1" and kept insisting. An empty answer here is
     not silence, it is Chrome saying the app is not on this device, and it
     clears the flag and puts the offer back. */
  var _relatedSaysNo=false;
  try{
    if(navigator.getInstalledRelatedApps){
      navigator.getInstalledRelatedApps().then(function(apps){
        if(apps&&apps.length){ _installed=true; offerInstall();
          try{localStorage.setItem('sw.installed','1');}catch(e){} return; }
        _relatedSaysNo=true;
        if(_installed){ _installed=false;
          try{localStorage.removeItem('sw.installed');}catch(e){} }
        offerInstall();
      }).catch(function(){});
    }
  }catch(e){}
  /* The signal that does not depend on the manifest being read correctly, or
     on having been here when the install happened: Chrome does not fire
     beforeinstallprompt for a site that is already installed. So on Android,
     no prompt within a couple of seconds means there is nothing to offer -
     either it is installed, or this browser will not install it - and either
     way the bar has no business being there.
     Not applied to iOS, which never fires the event at all and where the bar
     is the only route to the Share-sheet instructions. */
  if(/android/i.test(navigator.userAgent)&&!_iOS){
    setTimeout(function(){
      /* Unless the device has already answered. "No prompt in 2.5s" is a guess
         that the app is installed; getInstalledRelatedApps coming back empty is
         the device saying it is not, and a guess must not overrule it. */
      if(_relatedSaysNo) return;
      if(!_dip&&!window.__swInstallEvent&&!_installed){
        _installed=true; offerInstall();
      }
    },2500);
  }
  function fireInstall(e){
    e.prompt();
    e.userChoice&&e.userChoice.then(function(c){
      if(c&&c.outcome==='accepted'){
        _installed=true; offerInstall();
        try{localStorage.setItem('sw.installed','1');}catch(e2){}
      } _dip=null; });
  }
  /* WHERE THIS BROWSER KEEPS ITS INSTALL, in that browser's own words.
     Reported: "why is mobile redirecting me to go click 3 dots on my samsung
     before i install?" Two faults behind it.
     Samsung Internet is the default browser on a Samsung phone and it does not
     fire beforeinstallprompt at all, so the fallback is the only route - and
     the fallback named Chrome's 3-dot menu, which Samsung Internet does not
     have. Its install lives behind the hamburger at the BOTTOM of the screen,
     under "Add page to". Sending someone to a menu their browser does not have
     is worse than saying nothing.
     Firefox has its own wording again, and everything else keeps Chrome's. */
  function installHint(){
    var ua=navigator.userAgent;
    if(/SamsungBrowser/i.test(ua))
      return 'Tap ☰ at the bottom, then "Add page to" → "Home screen"';
    if(/Firefox|FxiOS/i.test(ua))
      return 'Open the menu, then "Install" / "Add to Home screen"';
    if(/android/i.test(ua))
      return 'Tap the 3-dot menu, then "Install app" / "Add to Home screen"';
    return 'In Chrome or Edge, click the install icon in the address bar';
  }
  /* AND CHROME MAY SIMPLY NOT HAVE FIRED YET. beforeinstallprompt lands a
     second or two after load, while the bar is shown immediately - so a tap in
     that window used to fall straight through to the instructions even in the
     browser that was about to offer the real dialog. Wait once, briefly, and
     only where the event actually exists. */
  var _waiting=false;
  function doInstall(){
    if(_dip){ fireInstall(_dip); return; }
    if(_iOS){ showIosSteps(); return; }
    var ua=navigator.userAgent;
    var canPrompt=/android/i.test(ua)&&!/SamsungBrowser|Firefox/i.test(ua);
    if(canPrompt&&!_waiting){
      _waiting=true;
      var done=false;
      var go=function(){
        if(done) return; done=true;
        window.removeEventListener('beforeinstallprompt',onEvt);
        _waiting=false;
        if(_dip){ fireInstall(_dip); return; }
        /* CHROME STAYING SILENT MEANS ONE OF TWO THINGS, and they need
           opposite answers. Either this browser cannot install the site - say
           where its menu is - or it already has, in which case Chrome
           deliberately never fires the event and "tap the 3-dot menu" sends
           somebody to install an app that is on their home screen already.
           getInstalledRelatedApps answers that, and the manifest names this
           PWA under related_applications so it can. */
        var told=false;
        var fallback=function(){
          if(told) return; told=true;
          window.swToast&&window.swToast(installHint(),'ok','ins');
        };
        try{
          if(navigator.getInstalledRelatedApps){
            var t=setTimeout(fallback,700);
            navigator.getInstalledRelatedApps().then(function(apps){
              clearTimeout(t);
              if(told) return;
              told=true;
              if(apps&&apps.length){
                _installed=true; offerInstall();
                try{localStorage.setItem('sw.installed','1');}catch(e2){}
                window.swToast&&window.swToast('Already installed - open Soccerwizard from your home screen','ok','ins');
              }else{
                window.swToast&&window.swToast(installHint(),'ok','ins');
              }
            }).catch(function(){ clearTimeout(t); fallback(); });
            return;
          }
        }catch(e3){}
        fallback();
      };
      var onEvt=function(e){ e.preventDefault(); _dip=e; offerInstall(); go(); };
      window.addEventListener('beforeinstallprompt',onEvt);
      setTimeout(go,1200);
      return;
    }
    window.swToast&&window.swToast(installHint(),'ok','ins');
  }
  /* WHICH iOS BROWSER THIS IS, because the answer changes the instructions and
     one of the three cannot install at all.
     An in-app browser - X, Instagram, Facebook - has no Add to Home Screen,
     and the campaign drives X traffic, so this is not an edge case: it is the
     likeliest way an iPhone reaches the site. Telling that reader to "tap
     Share" sends them looking for something that is not there.
     Detected on the UA tokens rather than on navigator.standalone being
     undefined: that is also true in Chrome for iOS, which CAN install, and
     calling Chrome an in-app browser would send working installs to a dead
     end. */
  function iosInstallKind(ua){
    ua = String(ua || "");
    if(/FBAN|FBAV|Instagram|Twitter|Line\/|MicroMessenger|Snapchat|TikTok/i.test(ua)) return "inapp";
    if(/CriOS/i.test(ua)) return "chrome";
    if(/FxiOS|EdgiOS/i.test(ua)) return "other";
    return "safari";
  }
  var SHARE_ICON = "<span class='is-ic' aria-hidden='true'><svg viewBox='0 0 24 24' "+
    "fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' "+
    "stroke-linejoin='round'><path d='M12 15V3M8 7l4-4 4 4'/>"+
    "<path d='M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6'/></svg></span>";
  function showIosSteps(){
    var box=document.getElementById('iosSteps'),
        head=document.getElementById('iosStepsH'),
        list=document.getElementById('iosStepsL'),
        note=document.getElementById('iosStepsN');
    if(!box||!list) return;
    var kind=iosInstallKind(navigator.userAgent), html="", noteTx="";
    if(kind==="inapp"){
      head.textContent="Open this in Safari first";
      html="<li>Tap the <b>\u22ef</b> or <b>Share</b> button in this app\u2019s browser bar.</li>"+
           "<li>Choose <b>Open in Safari</b> (or <b>Open in browser</b>).</li>"+
           "<li>In Safari, tap <b>Install</b> here again.</li>";
      noteTx="Apps opened inside X, Instagram or Facebook cannot add anything "+
             "to the Home Screen \u2014 only Safari can.";
    } else if(kind==="chrome"){
      head.textContent="Add Soccerwizard to your Home Screen";
      html="<li>Tap the <b>Share</b> button "+SHARE_ICON+" in the address bar.</li>"+
           "<li>Tap <b>Add to Home Screen</b>.</li>"+
           "<li>Tap <b>Add</b>.</li>";
    } else if(kind==="other"){
      head.textContent="Add Soccerwizard to your Home Screen";
      html="<li>Open this page in <b>Safari</b>.</li>"+
           "<li>Tap the <b>Share</b> button "+SHARE_ICON+", then <b>Add to Home Screen</b>.</li>";
    } else {
      head.textContent="Add Soccerwizard to your Home Screen";
      html="<li>Tap the <b>Share</b> button "+SHARE_ICON+" at the <b>bottom</b> of the screen.</li>"+
           "<li>Scroll down and tap <b>Add to Home Screen</b>.</li>"+
           "<li>Tap <b>Add</b>, top right.</li>";
    }
    list.innerHTML=html;
    if(note){ note.textContent=noteTx; note.hidden=!noteTx; }
    box.hidden=false;
    try{ box.scrollIntoView({block:'nearest',behavior:'smooth'}); }catch(e){}
  }
  var isx=document.getElementById('iosStepsX');
  if(isx) isx.addEventListener('click',function(){
    var b=document.getElementById('iosSteps'); if(b) b.hidden=true; });
  /* Hidden with the bar it belongs to, or a dismissed offer leaves its
     instructions behind. */
  window.__hideIosSteps=function(){ var b=document.getElementById('iosSteps');
    if(b) b.hidden=true; };
  var ig=document.getElementById('instGo'); if(ig) ig.addEventListener('click',doInstall);
  var ix=document.getElementById('instX');
  if(ix) ix.addEventListener('click',function(){ _hidNow=true;
    window.__hideIosSteps&&window.__hideIosSteps(); offerInstall(); });
  /* A stale flag from a phone the app was removed from would hide the offer
     for good, so a prompt arriving is taken as proof it is not installed. */
  window.addEventListener('beforeinstallprompt',function(){
    if(_installed){ _installed=false;
      try{localStorage.removeItem('sw.installed');}catch(e){}
      offerInstall(); }
  });
/* This closed on "});" - a parenthesised function expression, defined and then
   dropped on the floor. Valid JavaScript, so nothing ever threw and the board
   carried on rendering; everything inside simply did not exist. That is the
   whole of this block: toasts, the install offer, the "/" search shortcut, the
   booking-error watcher. Every caller guards with "window.swToast &&", so a
   missing swToast is silent by design - which is why it went unnoticed. */
})();

/* ==========================================================================
   Desktop Parallax Controller - Mouse-following 3D depth
   Only runs on desktop (min-width: 1060px) with hover and no reduced-motion.
   ========================================================================== */
(function(){
  var mq = window.matchMedia('(min-width: 1060px) and (hover: hover) and (prefers-reduced-motion: no-preference)');
  if(!mq.matches) return;
  return; // mouse-follow parallax disabled: it moved the whole page on scroll/hover

  var raf = 0;
  var cx = window.innerWidth / 2;
  var cy = window.innerHeight / 2;

  function onMove(e){
    cx = window.innerWidth / 2;
    cy = window.innerHeight / 2;
    var rx = (e.clientY - cy) / cy * 6;  // ±6° pitch
    var ry = (e.clientX - cx) / cx * -6; // ±6° yaw
    if(raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function(){
      document.querySelectorAll('[data-parallax]').forEach(function(el){
        var depth = parseFloat(el.dataset.parallax) || 1;
        el.style.transform = 'rotateX(' + (rx * depth) + 'deg) rotateY(' + (ry * depth) + 'deg)';
      });
    });
  }

  document.addEventListener('mousemove', onMove, {passive: true});

  // Handle resize
  window.addEventListener('resize', function(){
    cx = window.innerWidth / 2;
    cy = window.innerHeight / 2;
  });

  // Listen for media query changes (e.g., user toggles reduced motion)
  mq.addEventListener ? mq.addEventListener('change', function(e){
    if(!e.matches) {
      document.removeEventListener('mousemove', onMove);
      document.querySelectorAll('[data-parallax]').forEach(function(el){
        el.style.transform = '';
      });
    }
  }) : mq.addListener && mq.addListener(function(e){
    if(!e.matches) {
      document.removeEventListener('mousemove', onMove);
      document.querySelectorAll('[data-parallax]').forEach(function(el){
        el.style.transform = '';
      });
    }
  });
})();

load().catch(function(){});


















(function(){
  var pill=document.getElementById('netpill'),txt=document.getElementById('netpillTxt'),t=null;
  function show(on){
    clearTimeout(t);
    pill.classList.toggle('on',on); pill.classList.toggle('off',!on);
    txt.textContent=on?'Back online':"You're offline";
    pill.classList.add('show');
    if(on) t=setTimeout(function(){pill.classList.remove('show');},2200);
  }
  window.addEventListener('offline',function(){show(false);});
  window.addEventListener('online',function(){show(true);});
  if(!navigator.onLine) show(false);
})();




