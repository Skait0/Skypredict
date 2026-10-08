/* The sign-in sheet. Opens over the page when a signed-out reader taps
   something that needs an account (swGate in index.html), or fills /login.
   Google One Tap first (Google draws that button; we pick shape and words),
   the old redirect button where One Tap cannot show, the 6-digit email code
   always, and an unticked opt-in that rides on the sign-in request itself.
   Once signed in, the form fades and the Tactics Spell (spell.js) plays in
   the same sheet until the caller's afterAuth says the first sync is back.
   Colours are site tokens through --si-*; see TOKENS. Plain ES5. */
(function(root){
  "use strict";
  var WORDING="Email me the wizard's best picks. Unsubscribe any time.";
  var HEAD={book:"book this slip",build:"build a slip",slips:"see your slips"};
  var TOKENS=".sw-tok{--si-act:var(--red-fill,var(--brand));--si-act-ink:var(--red-ink,var(--brand));--si-odds:var(--win,var(--accent));"+
    "--si-grey:var(--grey,var(--d));--si-faint:var(--faint);--si-line:var(--line);--si-card:var(--card);--si-card2:var(--card-2,var(--card2));"+
    "--si-bg:var(--bg);--si-text:var(--text);--si-soft:var(--soft);--si-ball:var(--ball,#fff);--si-ball-ink:var(--ball-ink,var(--bg));"+
    "--si-glow:var(--red-glow,color-mix(in srgb,var(--si-act) 55%,transparent));--si-glow-soft:var(--red-glow-soft,color-mix(in srgb,var(--si-act) 28%,transparent));"+
    "--si-wash:var(--red-wash,color-mix(in srgb,var(--si-act) 13%,transparent))}";

  function errText(st,j){
    var e=j&&j.error;
    if(st===0) return "No connection. Check your data and try again.";
    if(st===404) return "Sign-in is not open yet.";
    if(e==="google_failed") return "Google sign-in didn't finish. Try again or use the email code.";
    if(e==="google_down") return "Google is slow right now. Use the email code.";
    if(e==="bad_email") return "Check the email address.";
    if(e==="bot") return "The check did not pass. Try again.";
    if(e==="slow_down") return "Too many tries. Try again in "+(j.minutes||15)+" minutes.";
    if(e==="send_failed") return "We could not send the email. Try again in a minute.";
    if(e==="wrong") return "Wrong code. "+j.left+(j.left===1?" try":" tries")+" left.";
    if(e==="dead") return "Too many wrong tries. Ask for a new code.";
    if(e==="expired") return "That code has expired. Ask for a new code.";
    if(e==="used") return "That code has been used. Ask for a new code.";
    /* Sign-in answers only www (guardPost checks the Origin). A reader on any
       other address got the catch-all and nothing to act on (8 Oct 2026). */
    if(e==="forbidden") return "Sign in at www.soccerwizard.live - this address can't sign you in.";
    /* The status rides along, so a screenshot of this says which failure it was. */
    return "Something went wrong ("+(e||st)+"). Try again.";
  }
  function env(ua,standalone){
    ua=String(ua||"");
    return {inapp:/FBAN|FBAV|Instagram|Twitter|Line\/|Telegram|WhatsApp|Snapchat|; wv\)/i.test(ua),
      iosApp:!!standalone&&/iphone|ipad|ipod/i.test(ua), standalone:!!standalone};
  }
  function once(fn){ var n=false; return function(){ if(n) return; n=true; return fn.apply(this,arguments); }; }
  var api={errText:errText,env:env,HEAD:HEAD,WORDING:WORDING,TOKENS:TOKENS,once:once};
  if(typeof module!=="undefined"&&module.exports){ module.exports=api; return; }
  if(!root.document) return;

  var d=root.document, ls=null; try{ ls=root.sessionStorage; }catch(e){}
  var CSS=TOKENS+
    ".swsi-scrim{position:fixed;inset:0;background:rgba(0,0,0,.55);opacity:0;pointer-events:none;transition:opacity .3s;z-index:9990}.swsi-scrim.on{opacity:1;pointer-events:auto}"+
    ".swsi{position:fixed;left:0;right:0;bottom:0;z-index:9991;max-width:480px;margin:0 auto;background:var(--si-card);color:var(--si-text);border-radius:20px 20px 0 0;"+
      "border-top:1px solid var(--si-line);padding:12px 20px calc(20px + env(safe-area-inset-bottom));transform:translateY(105%);transition:transform .45s cubic-bezier(.2,.9,.25,1);max-height:92vh;overflow:auto}"+
    ".swsi.on{transform:none}.swsi.page{position:relative;transform:none;border-radius:20px;border:1px solid var(--si-line);margin:24px auto;z-index:auto;max-height:none}"+
    ".swsi-grab{width:38px;height:4px;border-radius:4px;background:var(--si-line);margin:0 auto 10px}.swsi.page .swsi-grab,.swsi.page .swsi-x{display:none}"+
    ".swsi-x{position:absolute;right:12px;top:10px;width:34px;height:34px;border-radius:50%;border:0;background:var(--si-card2);color:var(--si-soft);cursor:pointer;z-index:3;display:flex;align-items:center;justify-content:center;padding:0}.swsi-x svg{width:16px;height:16px}"+
    ".swsi-form{transition:opacity .3s}.swsi-form.gone{opacity:0;pointer-events:none;height:0;overflow:hidden}"+
    ".swsi-h{font-size:23px;font-weight:800;letter-spacing:-.025em;line-height:1.1;margin:4px 40px 6px 0}.swsi-h i{font-style:normal;color:var(--si-act-ink)}"+
    ".swsi-s{color:var(--si-soft);font-size:13px;margin:0 0 14px;line-height:1.45}"+
    ".swsi-seal{position:relative;margin:28px 0 14px}.swsi-slip{background:var(--si-bg);border:1px solid var(--si-line);border-radius:12px;padding:10px 14px 8px}"+
    ".swsi-slip .r{display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:var(--si-soft)}.swsi-slip .r span{filter:blur(2.4px)}"+
    ".swsi-slip em{font-size:14px;font-weight:800;font-style:normal;font-variant-numeric:tabular-nums;color:var(--si-odds)}"+
    ".swsi-slip .t{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid var(--si-line);margin-top:4px;padding-top:7px;font-size:12.5px;font-weight:600;color:var(--si-soft)}.swsi-slip .t b{font-weight:800}"+
    ".swsi-slip .t em{font-size:19px}"+
    ".swsi-wax{position:absolute;left:38%;top:12px;width:46px;height:46px;border-radius:50%;transform:rotate(-8deg);display:flex;align-items:center;justify-content:center;"+
      "background:var(--si-act);box-shadow:0 0 0 3px var(--si-card),0 4px 10px rgba(0,0,0,.35)}"+
    ".swsi-g{min-height:44px;border-radius:999px;overflow:hidden}.swsi-g iframe{color-scheme:light}.swsi-gbtn{width:100%;height:44px;border-radius:999px;border:1px solid var(--si-line);background:#fff;color:rgba(0,0,0,.87);font:600 14px Roboto,Arial,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px}.swsi-gbtn svg{width:18px;height:18px;flex:none}"+
    ".swsi-or{display:flex;align-items:center;gap:10px;color:var(--si-faint);font-size:12.5px;font-weight:600;margin:12px 0}"+
    ".swsi-or:before,.swsi-or:after{content:'';flex:1;height:1px;background:var(--si-line)}"+
    ".swsi-row{display:flex;gap:8px}.swsi input[type=email]{flex:1;min-width:0;height:44px;border-radius:999px;background:var(--si-bg);border:1px solid var(--si-line);color:var(--si-text);padding:0 16px;font:inherit;font-size:16px}"+
    ".swsi-go{height:44px;padding:0 18px;border:0;border-radius:999px;background:var(--si-act);color:#fff;font:inherit;font-weight:800;font-size:14px;cursor:pointer}"+
    ".swsi-go.wide{width:100%;margin-top:10px}.swsi-go[disabled]{opacity:.6;cursor:wait}"+
    ".swsi-ts{margin:10px 0 0}.swsi-ts:empty{margin:0}"+
    ".swsi-code{position:relative;display:flex;gap:6px;margin:4px 0 0}.swsi-code span{flex:1;height:50px;border-radius:8px;background:var(--si-bg);border:1px solid var(--si-line);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;font-variant-numeric:tabular-nums}"+
    ".swsi-code span.cur{border-color:var(--si-act);box-shadow:0 0 0 3px var(--si-wash)}"+
    ".swsi-code input{position:absolute;inset:0;width:100%;height:100%;opacity:0;font-size:16px}"+
    ".swsi-opt{display:flex;gap:10px;align-items:flex-start;margin:12px 0 0;font-size:12.5px;color:var(--si-soft);line-height:1.4;cursor:pointer}"+
    ".swsi-opt input{appearance:none;-webkit-appearance:none;flex:none;width:18px;height:18px;margin:1px 0 0;border-radius:4px;border:1.5px solid var(--si-grey);display:grid;place-items:center}"+
    ".swsi-opt input:checked{background:var(--si-act);border-color:var(--si-act)}.swsi-opt input:checked:after{content:'';width:5px;height:9px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg) translate(-1px,-1px)}"+
    ".swsi-flag{border:1px solid var(--si-line);background:var(--si-bg);border-radius:12px;padding:10px 12px;margin:0 0 12px;color:var(--si-soft);font-size:12.5px;line-height:1.45}.swsi-flag b{color:var(--si-text)}"+
    ".swsi-msg{min-height:1.3em;margin:10px 0 0;font-weight:600;font-size:13px;color:var(--si-act-ink)}"+
    ".swsi-link{display:block;margin:12px auto 0;background:none;border:0;color:var(--si-act-ink);font:inherit;font-weight:700;font-size:13px;cursor:pointer}"+
    ".swsi-sent{display:flex;align-items:center;gap:10px;margin:0 0 12px;color:var(--si-soft);font-size:13px}.swsi-sent b{color:var(--si-text)}"+
    ".swsi-fine{font-size:11px;color:var(--si-faint);margin:10px 0 0;text-align:center}.swsi-fine a{color:var(--si-soft)}"+
    ".swsi-spell{display:none;height:430px}.swsi-spell.on{display:block}"+
    "[hidden]{display:none!important}"+
    "@media (prefers-reduced-motion:reduce){.swsi,.swsi *{animation:none!important;transition:none!important}}";

  var box=null, scrim=null, cur=null, spell=null, TS=null, tsId=null, EMAIL="", NONCE=null, gisLoaded=false, lastFocus=null, SESS=0, pend=null;
  var E=env(root.navigator&&root.navigator.userAgent,(root.matchMedia&&root.matchMedia("(display-mode: standalone)").matches)||(root.navigator&&root.navigator.standalone===true));
  function live(sid){ return sid===SESS&&!!box&&(box.classList.contains("on")||box.classList.contains("page")); }
  function $(s){ return box.querySelector(s); }
  function meta(n){ var m=d.querySelector('meta[name="'+n+'"]'); return m?m.getAttribute("content")||"":""; }
  function req(method,url,body,cb){
    var x=new XMLHttpRequest(); x.open(method,url,true);
    if(method==="POST"){ x.setRequestHeader("Content-Type","application/json"); x.setRequestHeader("X-SW-Request","1"); }
    x.timeout=15000;
    x.onload=function(){ var j={}; try{ j=JSON.parse(x.responseText); }catch(e){} cb(x.status,j); };
    x.onerror=x.ontimeout=function(){ cb(0,{}); };
    x.send(body?JSON.stringify(body):null);
  }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function say(t){ $(".swsi-msg").textContent=t||""; }
  function optin(){ var c=$(".swsi-optin"); return !!(c&&c.checked); }
  function script(src,id){ if(d.getElementById(id)) return; var s=d.createElement("script"); s.src=src; s.async=true; s.defer=true; s.id=id; d.head.appendChild(s); }

  /* The bookmaker as the site draws it (BOOKS.<key>.mark in index.html);
     plain text where BOOKS is absent, e.g. /login. */
  function mark(label){
    var B=root.BOOKS, k; label=String(label||"");
    if(B) for(k in B) if(B[k]&&B[k].label===label&&B[k].mark) return B[k].mark;
    return esc(label);
  }
  function header(action,detail){
    if(detail&&detail.odds){
      var rows=(detail.rows||[]).slice(0,3).map(function(r){ return "<div class='r'><span>"+esc(r.t)+"</span><em>"+esc(r.o)+"</em></div>"; }).join("");
      return "<div class='swsi-seal'><div class='swsi-slip'>"+rows+"<div class='t'><span><b>"+esc(detail.legs||"")+"</b> legs on "+mark(detail.book)+
        "</span><em>"+esc(detail.odds)+"</em></div></div><div class='swsi-wax' aria-hidden='true'><svg width='30' height='30' viewBox='0 0 44 44' fill='none' stroke='#fff' stroke-width='2.2' stroke-linecap='round'>"+
        "<circle cx='22' cy='22' r='17'/><path d='M22 13l6 4.4-2.3 7h-7.4l-2.3-7z' fill='#fff' stroke='none'/><path d='M22 13V7M28 17.4l5.5-2M25.7 24.4l3.5 4.8M18.3 24.4l-3.5 4.8M16 17.4l-5.5-2'/></svg></div></div>";
    }
    return "";
  }

  function build(page){
    if(!d.getElementById("swsi-css")){ var st=d.createElement("style"); st.id="swsi-css"; st.textContent=CSS; d.head.appendChild(st); }
    box=d.createElement("div"); box.className="swsi sw-tok"+(page?" page":""); box.setAttribute("role","dialog"); box.setAttribute("aria-modal",page?"false":"true"); box.setAttribute("aria-labelledby","swsiH");
    box.innerHTML="<div class='swsi-grab'></div><button class='swsi-x' type='button' aria-label='Close'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' aria-hidden='true'><path d='M6 6l12 12M18 6L6 18'/></svg></button>"+
      "<div class='swsi-form'><div class='swsi-head'></div><p class='swsi-h' id='swsiH'></p><p class='swsi-s'>Free. Your slips follow you to every phone and laptop.</p>"+
      "<p class='swsi-flag' hidden></p>"+
      "<div class='swsi-gwrap'><div class='swsi-g'></div><button class='swsi-gbtn' type='button' hidden><svg viewBox='0 0 48 48' aria-hidden='true'><path fill='#EA4335' d='M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.9 6.2C12.5 13.6 17.8 9.5 24 9.5z'/><path fill='#4285F4' d='M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z'/><path fill='#FBBC05' d='M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.4 0 20.1 0 24s1 7.6 2.7 10.8l7.8-6.2z'/><path fill='#34A853' d='M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z'/></svg>Continue with Google</button><div class='swsi-or'>or get a code by email</div></div>"+
      "<form class='swsi-ef' novalidate><div class='swsi-row'><input type='email' autocomplete='email' inputmode='email' maxlength='254' aria-label='Your email' placeholder='you@email.com'>"+
      "<button class='swsi-go' type='submit'>Send</button></div><div class='swsi-ts'></div></form>"+
      "<form class='swsi-cf' novalidate hidden><div class='swsi-sent'><span>6-digit code sent to<br><b class='swsi-to'></b></span></div>"+
      "<label class='swsi-code'><span></span><span></span><span></span><span></span><span></span><span></span>"+
      "<input inputmode='numeric' autocomplete='one-time-code' maxlength='9' aria-label='6-digit code'></label>"+
      "<button class='swsi-go wide' type='submit'>Sign in</button><button class='swsi-link swsi-again' type='button'>Use a different email</button></form>"+
      "<label class='swsi-opt'><input type='checkbox' class='swsi-optin'><span>"+WORDING+"</span></label>"+
      "<p class='swsi-msg' role='status' aria-live='polite'></p>"+
      "<p class='swsi-fine'>No password. We never post for you. <a href='/privacy'>Privacy</a></p></div>"+
      "<div class='swsi-spell'></div>";
    if(page){ (d.getElementById("swLogin")||d.body).appendChild(box); }
    else {
      scrim=d.createElement("div"); scrim.className="swsi-scrim"; d.body.appendChild(scrim); d.body.appendChild(box);
      scrim.addEventListener("click",close);
      d.addEventListener("keydown",function(e){ if(!box.classList.contains("on")) return;
        if(e.key==="Escape") close();
        if(e.key==="Tab"){ var f=box.querySelectorAll("button:not([hidden]),input,a[href],iframe"), v=[].filter.call(f,function(n){ return n.offsetParent!==null; });
          if(!v.length) return; var a=v[0], z=v[v.length-1];
          if(e.shiftKey&&d.activeElement===a){ e.preventDefault(); z.focus(); } else if(!e.shiftKey&&d.activeElement===z){ e.preventDefault(); a.focus(); } } });
      var y0=null; $(".swsi-grab").addEventListener("touchstart",function(e){ y0=e.touches[0].clientY; },{passive:true});
      $(".swsi-grab").addEventListener("touchend",function(e){ if(y0!=null&&e.changedTouches[0].clientY-y0>80) close(); y0=null; });
    }
    $(".swsi-x").addEventListener("click",close);
    $(".swsi-gbtn").addEventListener("click",redirectGoogle);
    $(".swsi-ef").addEventListener("submit",sendCode);
    $(".swsi-cf").addEventListener("submit",verifyCode);
    $(".swsi-again").addEventListener("click",function(){ titles(); $(".swsi-cf").hidden=true; $(".swsi-ef").hidden=false; say(""); googleShown(true); });
    var ci=$(".swsi-code input");
    ci.addEventListener("input",function(){ var v=ci.value.replace(/\D/g,"").slice(0,6), sp=$(".swsi-code").querySelectorAll("span");
      for(var i=0;i<6;i++){ sp[i].textContent=v.charAt(i); sp[i].className=i===v.length?"cur":""; }
      if(v.length===6) verifyCode(); });
  }

  function googleShown(on){
    var blocked=E.inapp||E.iosApp;
    $(".swsi-gwrap").hidden=!on||blocked;
    var f=$(".swsi-flag");
    if(blocked){ f.hidden=false; f.innerHTML=E.inapp?"<b>Google sign-in doesn't work inside this app.</b> Use your email below, or open this page in your browser."
      :"<b>Google sign-in doesn't work inside the installed iPhone app.</b> Use your email below."; }
    else f.hidden=true;
  }

  /* One Tap: nonce first, then Google's script, then its button and prompt.
     Nothing in 2s (blocked, FedCM off, no Google session) -> our own button. */
  function startGoogle(){
    if(E.inapp||E.iosApp) return;
    var sid=SESS, gcid=meta("sw-gcid"), slot=$(".swsi-g"), fallback=setTimeout(function(){ if(live(sid)&&!slot.querySelector("iframe")) ownButton(); },2000);
    if(!gcid){ clearTimeout(fallback); ownButton(); return; }
    req("POST","/api/auth/google/nonce",{},function(st,j){
      if(!live(sid)){ clearTimeout(fallback); return; }
      if(st!==200||!j.nonce){ clearTimeout(fallback); ownButton(); return; }
      NONCE=j;
      function go(){ if(!live(sid)) return; var g=root.google&&root.google.accounts&&root.google.accounts.id; if(!g) return;
        g.initialize({client_id:gcid,nonce:j.nonce,callback:onCredential,use_fedcm_for_prompt:true,auto_select:false,itp_support:true,context:"signin",cancel_on_tap_outside:false});
        /* Google's button wins whenever it arrives: if ours stood in while the
           script was slow, swap back in the same 44px (no jump). */
        slot.hidden=false; $(".swsi-gbtn").hidden=true;
        g.renderButton(slot,{theme:"filled_black",shape:"pill",text:"continue_with",size:"large",width:Math.min(400,slot.offsetWidth||320)});
        try{ g.prompt(); }catch(e){} }
      if(root.google&&root.google.accounts) go();
      else {
        /* Google's script has no ?onload= callback (that is Turnstile's API);
           it calls window.onGoogleLibraryLoad. With the query param the first
           open never drew Google's button or One Tap, only a second open did. */
        root.swGisLoad=go; root.onGoogleLibraryLoad=function(){ if(root.swGisLoad) root.swGisLoad(); };
        script("https://accounts.google.com/gsi/client","swsi-gis"); }
    });
  }
  function ownButton(){ $(".swsi-g").hidden=true; $(".swsi-gbtn").hidden=false; }
  function onCredential(resp){
    if(!resp||!resp.credential||!NONCE) return;
    var sid=SESS, o=cur; if(!live(sid)) return;
    playSpell();
    req("POST","/api/auth/google/onetap",{credential:resp.credential,nonce_id:NONCE.nonce_id,optin:optin()},function(st,j){
      if(!live(sid)){ if(st===200&&j.ok&&o.afterAuth) o.afterAuth(j,function(){}); return; }
      if(st===200&&j.ok) return authed(j,"",o);
      unplay(); say(errText(st,j)); NONCE=null; startGoogle();
    });
  }
  function redirectGoogle(){
    var sid=SESS, o=cur, b=$(".swsi-gbtn"); b.disabled=true; say("");
    try{ if(ls) ls.setItem("sw.gate",JSON.stringify({action:cur.action,detail:cur.detail||null,resume:cur.resume||""})); }catch(e){}
    var ret=cur.ret||"/"; ret+=(ret.indexOf("?")<0?"?":"&")+"signedin=1";
    req("POST","/api/auth/google/prepare",{"return":ret,optin:optin()},function(st,j){
      if(!live(sid)) return;
      if(st!==200||!j.start){ b.disabled=false; return say(errText(st,j)); }
      if(E.standalone){ root.open(j.start,"_blank"); say("Finish in the Google window, then come back here."); pollMe(0,sid,o); }
      else root.location.href=j.start;
    });
  }
  /* The installed Android app opens Google in a Chrome tab that shares the cookie jar. */
  function pollMe(n,sid,o){
    if(!live(sid)) return;
    if(n>300){ $(".swsi-gbtn").disabled=false; return say(errText(400,{error:"expired"})); }
    req("GET","/api/me",null,function(st,j){ if(!live(sid)) return;
      if(st===200&&j.signedIn){ playSpell(); return authed({ok:true,name:""},j.email||"",o); }
      setTimeout(function(){ pollMe(n+1,sid,o); },2000); });
  }

  function startTurnstile(){
    var key=meta("sw-ts"); if(!key) return;
    function go(){ if(!root.turnstile||tsId!=null) return;
      tsId=root.turnstile.render($(".swsi-ts"),{sitekey:key,theme:"auto",appearance:"interaction-only",size:"flexible",callback:function(t){ TS=t; },"expired-callback":function(){ TS=null; }}); }
    if(root.turnstile) go(); else { root.swTsLoad=go; script("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=swTsLoad","swsi-ts"); }
  }
  function sendCode(ev){
    if(ev) ev.preventDefault();
    var sid=SESS, b=$(".swsi-ef .swsi-go"); EMAIL=$(".swsi-ef input").value.replace(/^\s+|\s+$/g,"");
    if(!EMAIL) return say(errText(400,{error:"bad_email"}));
    if(!TS&&meta("sw-ts")) return say("Wait for the check to finish, then tap Send.");
    b.disabled=true; say("");
    req("POST","/api/auth/email/send",{email:EMAIL,turnstile:TS},function(st,j){
      b.disabled=false; TS=null; try{ if(root.turnstile&&tsId!=null) root.turnstile.reset(tsId); }catch(e){}
      if(!live(sid)) return;
      if(st!==200) return say(errText(st,j));
      $(".swsi-ef").hidden=true; googleShown(false); $(".swsi-to").textContent=EMAIL;
      $(".swsi-h").innerHTML="Check your <i>email</i>"; $(".swsi-h").hidden=false; $(".swsi-s").hidden=true; $(".swsi-head").hidden=true;
      $(".swsi-cf").hidden=false; $(".swsi-code input").value=""; $(".swsi-code input").focus();
    });
  }
  function verifyCode(ev){
    if(ev) ev.preventDefault();
    var sid=SESS, o=cur, b=$(".swsi-cf .swsi-go"); if(b.disabled) return;
    b.disabled=true; say(""); playSpell();
    req("POST","/api/auth/email/verify",{email:EMAIL,code:$(".swsi-code input").value,optin:optin()},function(st,j){
      b.disabled=false;
      if(!live(sid)){ if(st===200&&j.ok&&o.afterAuth) o.afterAuth(j,function(){}); return; }
      if(st===200&&j.ok) return authed(j,EMAIL,o);
      unplay(); say(errText(st,j));
    });
  }

  function playSpell(){
    if(spell) return;
    $(".swsi-form").classList.add("gone"); var m=$(".swsi-spell"); m.classList.add("on");
    spell=root.swSpell?root.swSpell(m,{odds:(cur.detail&&cur.detail.rows||[]).map(function(r){ return r.o; }),onRetry:function(){ unplay(); say("Try again."); }}):null;
  }
  function unplay(){ if(spell){ spell.stop(); spell=null; } $(".swsi-spell").classList.remove("on"); $(".swsi-spell").innerHTML=""; $(".swsi-form").classList.remove("gone"); }
  /* afterAuth(j,done) answers done() once the account is ready, or
     done(false) when it is not: then the sheet closes with no goal and no onDone. */
  function authed(j,email,o){
    var sid=SESS;
    if(spell){ spell.step(1); if(root.swSpell&&root.swSpell.firstName) spell.setName(root.swSpell.firstName(j.name,email)); }
    var fire=once(function(){ if(o.onDone) o.onDone(); });
    var finish=function(ok){
      if(ok===false){ if(!live(sid)) return; pend=null; unplay(); close(); return; }
      if(!spell){ close(); fire(); return; }
      pend=fire; spell.finish(function(){ pend=null; close(); fire(); }); };
    if(o.afterAuth) o.afterAuth(j,finish); else finish();
  }

  function titles(){
    /* /login already says "Sign in" and why above the card; the card repeating
       it read as two headlines. The page form starts at the buttons. */
    var pg=box.classList.contains("page");
    $(".swsi-head").hidden=false; $(".swsi-s").hidden=pg; $(".swsi-h").hidden=pg;
    $(".swsi-h").innerHTML="Sign in to <i>"+esc(HEAD[cur.action]||HEAD.book)+"</i>";
  }
  function reset(o){
    SESS++; var p=pend; pend=null; cur=o; TS=null; EMAIL=""; NONCE=null; if(spell){ spell.stop(); spell=null; }
    if(tsId!=null){ try{ root.turnstile.reset(tsId); }catch(e){} }
    $(".swsi-spell").classList.remove("on"); $(".swsi-spell").innerHTML="";
    $(".swsi-form").classList.remove("gone");
    $(".swsi-head").innerHTML=header(o.action,o.detail);
    titles();
    $(".swsi-ef").hidden=false; $(".swsi-cf").hidden=true; $(".swsi-gbtn").hidden=true; $(".swsi-gbtn").disabled=false;
    $(".swsi-g").innerHTML=""; $(".swsi-g").hidden=false; say(""); googleShown(true);
    if(p) p();
  }
  function open(o){
    o=o||{};
    if(!box) build(!!o.page);
    reset(o);
    if(!o.page){ lastFocus=d.activeElement; scrim.classList.add("on"); box.classList.add("on"); setTimeout(function(){ var x=$(".swsi-x"); if(x) x.focus(); },50); }
    startGoogle(); startTurnstile();
  }
  function resume(o){
    o=o||{}; if(!box) build(false); reset(o);
    scrim.classList.add("on"); box.classList.add("on");
    playSpell(); authed({ok:true,name:""},"",cur);
  }
  function close(){
    if(!box) return;
    SESS++; var p=pend; pend=null;
    if(spell){ spell.stop(); spell=null; }
    try{ if(root.google&&root.google.accounts) root.google.accounts.id.cancel(); }catch(e){}
    if(!box.classList.contains("page")){
      box.classList.remove("on"); if(scrim) scrim.classList.remove("on");
      if(lastFocus&&lastFocus.focus) try{ lastFocus.focus(); }catch(e){}
    }
    if(p) p();
  }
  root.swSignIn={open:open,resume:resume,close:close};
})(typeof window!=="undefined"?window:this);
