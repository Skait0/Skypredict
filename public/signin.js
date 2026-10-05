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
    return "Something went wrong. Try again.";
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
    ".swsi{position:fixed;left:0;right:0;bottom:0;z-index:9991;max-width:480px;margin:0 auto;background:var(--si-card);color:var(--si-text);border-radius:26px 26px 0 0;"+
      "border-top:1px solid var(--si-line);padding:12px 20px calc(20px + env(safe-area-inset-bottom));transform:translateY(105%);transition:transform .45s cubic-bezier(.2,.9,.25,1);max-height:92vh;overflow:auto}"+
    ".swsi.on{transform:none}.swsi.page{position:relative;transform:none;border-radius:20px;border:1px solid var(--si-line);margin:24px auto;z-index:auto;max-height:none}"+
    ".swsi-grab{width:38px;height:4px;border-radius:4px;background:var(--si-line);margin:0 auto 10px}.swsi.page .swsi-grab,.swsi.page .swsi-x{display:none}"+
    ".swsi-x{position:absolute;right:14px;top:14px;width:32px;height:32px;border-radius:50%;border:0;background:var(--si-card2);color:var(--si-soft);font-size:18px;cursor:pointer;z-index:3}"+
    ".swsi-form{transition:opacity .3s}.swsi-form.gone{opacity:0;pointer-events:none;height:0;overflow:hidden}"+
    ".swsi-h{font-size:23px;font-weight:800;letter-spacing:-.025em;line-height:1.1;margin:4px 40px 6px 0}.swsi-h i{font-style:normal;color:var(--si-act-ink)}"+
    ".swsi-s{color:var(--si-soft);font-size:13px;margin:0 0 14px;line-height:1.45}"+
    ".swsi-seal{position:relative;margin:0 0 14px}.swsi-slip{background:var(--si-bg);border:1px solid var(--si-line);border-radius:14px;padding:10px 14px 8px}"+
    ".swsi-slip .r{display:flex;justify-content:space-between;font-size:12px;padding:4px 0;color:var(--si-soft)}.swsi-slip .r span{filter:blur(2.4px)}"+
    ".swsi-slip em{font:700 14px 'Roboto Condensed',sans-serif;font-style:normal;color:var(--si-odds)}"+
    ".swsi-slip .t{display:flex;justify-content:space-between;align-items:baseline;border-top:1px dashed var(--si-line);margin-top:4px;padding-top:6px;font:700 10px 'Roboto Condensed',sans-serif;letter-spacing:.14em;color:var(--si-faint)}"+
    ".swsi-slip .t em{font-size:19px}"+
    ".swsi-wax{position:absolute;right:14px;top:50%;margin-top:-33px;width:66px;height:66px;border-radius:50%;transform:rotate(-10deg);display:flex;align-items:center;justify-content:center;"+
      "background:radial-gradient(circle at 36% 30%,rgba(255,255,255,.35),transparent 38%),radial-gradient(circle at 50% 55%,var(--si-act),var(--si-act) 60%,color-mix(in srgb,var(--si-act) 60%,black) 100%);"+
      "box-shadow:0 6px 16px rgba(0,0,0,.45),inset 0 -3px 6px rgba(0,0,0,.3);animation:swsi-throb 2.6s ease-in-out infinite}"+
    "@keyframes swsi-throb{50%{box-shadow:0 6px 16px rgba(0,0,0,.45),inset 0 -3px 6px rgba(0,0,0,.3),0 0 0 9px var(--si-glow-soft)}}"+
    ".swsi-dorm{position:relative;height:118px;margin:-2px -20px 12px;overflow:hidden;perspective:500px;border-bottom:1px solid var(--si-line)}"+
    ".swsi-dorm .tb{position:absolute;left:50%;top:-50px;width:250px;margin-left:-125px;transform:rotateX(52deg);transform-origin:50% 100%}"+
    ".swsi-dorm .dl{fill:none;stroke:var(--si-faint);stroke-opacity:.4;stroke-width:1.4}.swsi-dorm .dd{fill:var(--si-card2);stroke:var(--si-grey);stroke-width:1.6}"+
    ".swsi-dorm .dx{stroke:var(--si-grey);stroke-width:2.2;stroke-linecap:round}.swsi-dorm .em{fill:var(--si-act);animation:swsi-br 2.4s ease-in-out infinite}"+
    "@keyframes swsi-br{0%,100%{opacity:.3}50%{opacity:1}}"+
    ".swsi-dorm .fb{position:absolute;inset:0;background:linear-gradient(180deg,transparent 40%,var(--si-card))}"+
    ".swsi-dorm .lb{position:absolute;left:0;right:0;bottom:8px;text-align:center;font:700 9.5px 'Roboto Condensed',sans-serif;letter-spacing:.24em;color:var(--si-faint)}.swsi-dorm .lb b{color:var(--si-act-ink)}"+
    ".swsi-g{min-height:44px}.swsi-gbtn{width:100%;height:44px;border-radius:999px;border:1px solid var(--si-line);background:#fff;color:rgba(0,0,0,.87);font:600 14px Roboto,Arial,sans-serif;cursor:pointer}"+
    ".swsi-or{display:flex;align-items:center;gap:10px;color:var(--si-faint);font:700 10.5px 'Roboto Condensed',sans-serif;letter-spacing:.16em;margin:12px 0}"+
    ".swsi-or:before,.swsi-or:after{content:'';flex:1;height:1px;background:var(--si-line)}"+
    ".swsi-row{display:flex;gap:8px}.swsi input[type=email]{flex:1;min-width:0;height:44px;border-radius:12px;background:var(--si-bg);border:1px solid var(--si-line);color:var(--si-text);padding:0 14px;font:inherit;font-size:16px}"+
    ".swsi-go{height:44px;padding:0 16px;border:0;border-radius:12px;background:var(--si-act);color:#fff;font:inherit;font-weight:800;font-size:14px;cursor:pointer}"+
    ".swsi-go.wide{width:100%;margin-top:10px}.swsi-go[disabled]{opacity:.6;cursor:wait}"+
    ".swsi-ts{margin:10px 0 0;min-height:65px}"+
    ".swsi-code{position:relative;display:flex;gap:6px;margin:4px 0 0}.swsi-code span{flex:1;height:50px;border-radius:10px;background:var(--si-bg);border:1px solid var(--si-line);display:flex;align-items:center;justify-content:center;font:800 22px 'Roboto Condensed',sans-serif}"+
    ".swsi-code span.cur{border-color:var(--si-act);box-shadow:0 0 0 3px var(--si-wash)}"+
    ".swsi-code input{position:absolute;inset:0;width:100%;height:100%;opacity:0;font-size:16px}"+
    ".swsi-opt{display:flex;gap:10px;align-items:flex-start;margin:12px 0 0;font-size:12.5px;color:var(--si-soft);line-height:1.4;cursor:pointer}"+
    ".swsi-opt input{appearance:none;-webkit-appearance:none;flex:none;width:18px;height:18px;margin:1px 0 0;border-radius:5px;border:1.5px solid var(--si-grey);display:grid;place-items:center}"+
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

  function header(action,detail){
    if(detail&&detail.odds){
      var rows=(detail.rows||[]).slice(0,3).map(function(r){ return "<div class='r'><span>"+esc(r.t)+"</span><em>"+esc(r.o)+"</em></div>"; }).join("");
      return "<div class='swsi-seal'><div class='swsi-slip'>"+rows+"<div class='t'><span>"+esc(detail.legs||"")+" LEGS · "+esc(String(detail.book||"").toUpperCase())+
        "</span><em>"+esc(detail.odds)+"</em></div></div><div class='swsi-wax' aria-hidden='true'><svg width='42' height='42' viewBox='0 0 44 44' fill='none' stroke='rgba(255,255,255,.85)' stroke-width='1.6' stroke-linecap='round'>"+
        "<circle cx='22' cy='22' r='17' stroke-opacity='.45'/><path d='M22 13l6 4.4-2.3 7h-7.4l-2.3-7z' fill='rgba(255,255,255,.85)' stroke='none'/><path d='M22 13V7M28 17.4l5.5-2M25.7 24.4l3.5 4.8M18.3 24.4l-3.5 4.8M16 17.4l-5.5-2'/></svg></div></div>";
    }
    return "<div class='swsi-dorm' aria-hidden='true'><div class='tb'><svg width='250' height='190' viewBox='0 0 250 190'>"+
      "<rect class='dl' x='6' y='6' width='238' height='178' rx='5'/><line class='dl' x1='6' y1='95' x2='244' y2='95'/><circle class='dl' cx='125' cy='95' r='24'/><path class='dl' d='M85 6v30h80V6'/><path class='dl' d='M85 184v-30h80v30'/>"+
      "<circle class='dd' cx='125' cy='170' r='6'/><circle class='dd' cx='52' cy='140' r='6'/><circle class='dd' cx='104' cy='112' r='6'/><circle class='dd' cx='190' cy='124' r='6'/><circle class='dd' cx='200' cy='70' r='6'/><circle class='dd' cx='120' cy='60' r='6'/><circle class='dd' cx='140' cy='30' r='6'/>"+
      "<path class='dx' d='M84 126l7 7m0-7l-7 7M160 100l7 7m0-7l-7 7M160 58l7 7m0-7l-7 7'/><circle class='em' cx='125' cy='170' r='3.2'/></svg></div>"+
      "<div class='fb'></div><div class='lb'>THE MOVE IS SET · <b>YOU TAKE THE KICK-OFF</b></div></div>";
  }

  function build(page){
    if(!d.getElementById("swsi-css")){ var st=d.createElement("style"); st.id="swsi-css"; st.textContent=CSS; d.head.appendChild(st); }
    box=d.createElement("div"); box.className="swsi sw-tok"+(page?" page":""); box.setAttribute("role","dialog"); box.setAttribute("aria-modal",page?"false":"true"); box.setAttribute("aria-labelledby","swsiH");
    box.innerHTML="<div class='swsi-grab'></div><button class='swsi-x' type='button' aria-label='Close'>×</button>"+
      "<div class='swsi-form'><div class='swsi-head'></div><p class='swsi-h' id='swsiH'></p><p class='swsi-s'>Free. Your slips follow you to every phone and laptop.</p>"+
      "<p class='swsi-flag' hidden></p>"+
      "<div class='swsi-gwrap'><div class='swsi-g'></div><button class='swsi-gbtn' type='button' hidden>Continue with Google</button><div class='swsi-or'>OR EMAIL ME A CODE</div></div>"+
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
    $(".swsi-again").addEventListener("click",function(){ $(".swsi-cf").hidden=true; $(".swsi-ef").hidden=false; say(""); googleShown(true); });
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
    var sid=SESS, gcid=meta("sw-gcid"), slot=$(".swsi-g"), fallback=setTimeout(function(){ if(live(sid)&&!slot.querySelector("iframe")) $(".swsi-gbtn").hidden=false; },2000);
    if(!gcid){ clearTimeout(fallback); $(".swsi-gbtn").hidden=false; return; }
    req("POST","/api/auth/google/nonce",{},function(st,j){
      if(!live(sid)){ clearTimeout(fallback); return; }
      if(st!==200||!j.nonce){ clearTimeout(fallback); $(".swsi-gbtn").hidden=false; return; }
      NONCE=j;
      function go(){ if(!live(sid)) return; var g=root.google&&root.google.accounts&&root.google.accounts.id; if(!g) return;
        g.initialize({client_id:gcid,nonce:j.nonce,callback:onCredential,use_fedcm_for_prompt:true,auto_select:false,itp_support:true,context:"signin",cancel_on_tap_outside:false});
        g.renderButton(slot,{theme:"filled_black",shape:"pill",text:"continue_with",size:"large",width:Math.min(400,slot.offsetWidth||320)});
        try{ g.prompt(); }catch(e){} }
      if(root.google&&root.google.accounts) go();
      else { root.swGisLoad=go; script("https://accounts.google.com/gsi/client?onload=swGisLoad","swsi-gis"); }
    });
  }
  function onCredential(resp){
    if(!resp||!resp.credential||!NONCE) return;
    var sid=SESS, o=cur; if(!live(sid)) return;
    playSpell();
    req("POST","/api/auth/google/onetap",{credential:resp.credential,nonce_id:NONCE.nonce_id,optin:optin()},function(st,j){
      if(!live(sid)) return;
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
      tsId=root.turnstile.render($(".swsi-ts"),{sitekey:key,theme:"auto",callback:function(t){ TS=t; },"expired-callback":function(){ TS=null; }}); }
    if(root.turnstile) go(); else { root.swTsLoad=go; script("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=swTsLoad","swsi-ts"); }
  }
  function sendCode(ev){
    if(ev) ev.preventDefault();
    var b=$(".swsi-ef .swsi-go"); EMAIL=$(".swsi-ef input").value.replace(/^\s+|\s+$/g,"");
    if(!EMAIL) return say(errText(400,{error:"bad_email"}));
    if(!TS&&meta("sw-ts")) return say("Wait for the check to finish, then tap Send.");
    b.disabled=true; say("");
    req("POST","/api/auth/email/send",{email:EMAIL,turnstile:TS},function(st,j){
      b.disabled=false; TS=null; try{ if(root.turnstile&&tsId!=null) root.turnstile.reset(tsId); }catch(e){}
      if(st!==200) return say(errText(st,j));
      $(".swsi-ef").hidden=true; googleShown(false); $(".swsi-to").textContent=EMAIL;
      $(".swsi-h").innerHTML="Check your <i>email</i>"; $(".swsi-s").hidden=true; $(".swsi-head").hidden=true;
      $(".swsi-cf").hidden=false; $(".swsi-code input").value=""; $(".swsi-code input").focus();
    });
  }
  function verifyCode(ev){
    if(ev) ev.preventDefault();
    var sid=SESS, o=cur, b=$(".swsi-cf .swsi-go"); if(b.disabled) return;
    b.disabled=true; say(""); playSpell();
    req("POST","/api/auth/email/verify",{email:EMAIL,code:$(".swsi-code input").value,optin:optin()},function(st,j){
      b.disabled=false;
      if(!live(sid)) return;
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
  function authed(j,email,o){
    if(spell){ spell.step(1); if(root.swSpell&&root.swSpell.firstName) spell.setName(root.swSpell.firstName(j.name,email)); }
    var fire=once(function(){ if(o.onDone) o.onDone(); });
    var finish=function(){ if(!spell){ close(); fire(); return; }
      pend=fire; spell.finish(function(){ pend=null; close(); fire(); }); };
    if(o.afterAuth) o.afterAuth(j,finish); else finish();
  }

  function reset(o){
    SESS++; var p=pend; pend=null; cur=o; TS=null; EMAIL=""; NONCE=null; if(spell){ spell.stop(); spell=null; }
    if(tsId!=null){ try{ root.turnstile.reset(tsId); }catch(e){} }
    $(".swsi-spell").classList.remove("on"); $(".swsi-spell").innerHTML="";
    $(".swsi-form").classList.remove("gone");
    $(".swsi-head").hidden=false; $(".swsi-head").innerHTML=header(o.action,o.detail);
    $(".swsi-h").innerHTML="Sign in to <i>"+esc(HEAD[o.action]||HEAD.book)+"</i>"; $(".swsi-s").hidden=false;
    $(".swsi-ef").hidden=false; $(".swsi-cf").hidden=true; $(".swsi-gbtn").hidden=true; $(".swsi-gbtn").disabled=false;
    $(".swsi-g").innerHTML=""; say(""); googleShown(true);
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
