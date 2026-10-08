/* The Tactics Spell: the sign-in loader. A passing move on a tilted tactics
   board, paced by what the account is really doing: the keeper holds the
   ball until sign-in succeeds (step 1), the build-up keeps passing while the
   slips load, and only finish() - called when the first sync is back - sends
   it through the flick and the curler into the net. Colours are the site's
   own tokens via --si-* (defined by signin.js), so light and dark both work.
   Plain ES5. The pure parts are exported for test/spell.test.js. */
(function(root){
  "use strict";
  var PTS=[[128,246],[48,200],[100,160],[196,176],[210,104],[120,92],[140,52],[128,-4]];
  var XS=[[92,178],[168,138],[166,96],[112,60]], XHIT={2:0,4:1,5:2,6:3};
  var MAX_MS=20000, HOLD_MS=900, MIN_MS=1800;
  var CAPS=[["Signing you in","Checking your account"],["Pulling your slips","Your slips and favourites"],["",""]];

  /* What the ball does after player i has it. */
  function nextBeat(i,phase,finishing){
    if(i>=6) return {to:7,kind:"shot"};
    if(i===5) return {to:6,kind:"pass"};
    if(i===4) return finishing?{to:5,kind:"flick"}:{to:2,kind:"pass",loop:true};
    if(phase<1&&!finishing) return {hold:true};
    return {to:i+1,kind:"pass"};
  }
  function firstName(given,email){
    var n=String(given||"").replace(/^\s+|\s+$/g,"");
    if(!n) n=(String(email||"").split("@")[0].replace(/[^A-Za-z]+/g," ").replace(/^\s+|\s+$/g,"").split(" ")[0])||"";
    n=n.slice(0,20);
    return n?n.charAt(0).toUpperCase()+n.slice(1).toLowerCase():"";
  }
  var api={nextBeat:nextBeat,firstName:firstName,MAX_MS:MAX_MS,HOLD_MS:HOLD_MS,MIN_MS:MIN_MS};
  if(typeof module!=="undefined"&&module.exports){ module.exports=api; return; }
  if(!root.document) return;

  var d=root.document, NS="http://www.w3.org/2000/svg", seq=0;
  var CSS=".sws{position:relative;display:flex;flex-direction:column;height:100%;min-height:360px}"+
    /* The glow bleeds into the sign-in sheet's padding (12px top, 20px sides
       and foot) and no further: -30px reached 10px past the sheet, and the
       sheet's overflow:auto drew scrollbars on both sides (owner, 8 Oct 2026). */
    ".sws-flash{position:absolute;inset:-12px -20px -20px;background:radial-gradient(circle at 50% 30%,var(--si-glow),var(--si-glow-soft) 40%,transparent 70%);opacity:0;pointer-events:none;z-index:5}"+
    ".sws-flash.go{animation:sws-fl .7s ease-out}@keyframes sws-fl{0%{opacity:1}100%{opacity:0}}"+
    ".sws-hud{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--si-faint);height:22px}"+
    ".sws-hud b{color:var(--si-act-ink)}.sws-call{color:var(--si-act-ink);opacity:0;transition:opacity .2s}.sws-call.on{opacity:1}"+
    ".sws-stage{flex:1;position:relative;display:flex;align-items:center;justify-content:center;perspective:640px}"+
    ".sws-tilt{transform:rotateX(0) scale(.86);transform-style:preserve-3d;transition:transform 1.1s cubic-bezier(.2,.9,.25,1)}"+
    ".sws-tilt.up{transform:rotateX(32deg) scale(1) translateY(-4px)}"+
    ".sws-tilt.flat{transform:rotateX(0) scale(.9);transition:transform .7s cubic-bezier(.3,1.3,.4,1)}"+
    ".sws-tilt.shake{animation:sws-sh .42s}@keyframes sws-sh{20%{translate:-4px 2px}40%{translate:4px -3px}60%{translate:-3px 1px}80%{translate:2px -1px}}"+
    ".sws svg{width:256px;height:286px;max-width:100%;overflow:visible}"+
    ".sws-turf{fill:var(--si-card2);opacity:0;transition:opacity 1s}.sws-turf.on{opacity:.7}"+
    ".sws-pl{fill:none;stroke:var(--si-faint);stroke-opacity:.45;stroke-width:1.3;stroke-dasharray:1;stroke-dashoffset:1}"+
    ".sws-pl.on{transition:stroke-dashoffset .9s cubic-bezier(.6,.1,.3,1);stroke-dashoffset:0}"+
    ".sws-st0{stop-color:var(--si-act-ink)}.sws-st1{stop-color:var(--si-act);stop-opacity:0}"+
    ".sws-beam{opacity:0;transform-box:fill-box;transform-origin:50% 100%}.sws-beam.go{animation:sws-beam .55s ease-out}"+
    "@keyframes sws-beam{0%{opacity:0;transform:scaleY(.2)}30%{opacity:1;transform:scaleY(1)}100%{opacity:0;transform:scaleY(1.1)}}"+
    ".sws-dot{fill:var(--si-card);stroke:var(--si-grey);stroke-width:1.6;transform-box:fill-box;transform-origin:center;transform:scale(0);transition:fill .3s,stroke .3s,transform .35s cubic-bezier(.2,1.8,.4,1)}"+
    ".sws-dot.in{transform:scale(1)}.sws-dot.on{fill:var(--si-act);stroke:var(--si-act-ink)}"+
    ".sws-ring{fill:none;stroke:var(--si-act-ink);stroke-width:1.5;opacity:0;transform-box:fill-box;transform-origin:center}.sws-ring.go{animation:sws-ring .6s ease-out}"+
    "@keyframes sws-ring{0%{opacity:1;transform:scale(.6)}100%{opacity:0;transform:scale(2.8)}}"+
    ".sws-odd{font-size:10px;font-weight:800;font-variant-numeric:tabular-nums;fill:var(--si-odds);opacity:0;text-anchor:middle}.sws-odd.go{animation:sws-odd 1s ease-out forwards}"+
    "@keyframes sws-odd{0%{opacity:0;transform:translateY(4px)}25%{opacity:1}100%{opacity:0;transform:translateY(-16px)}}"+
    ".sws-x{stroke:var(--si-grey);stroke-width:2.2;stroke-linecap:round;opacity:0;transition:opacity .3s}.sws-x.in{opacity:1}.sws-shard{fill:var(--si-grey)}"+
    ".sws-pass{fill:none;stroke:var(--si-act);stroke-width:2;stroke-linecap:round;stroke-opacity:.7}"+
    ".sws-zap{fill:none;stroke:var(--si-act-ink);stroke-width:1.2;stroke-linejoin:round}.sws-tail circle{fill:var(--si-act-ink)}"+
    ".sws-shadow{fill:var(--si-text);opacity:.3}.sws-bf{fill:var(--si-ball);stroke:var(--si-line);stroke-width:.6}.sws-bi{fill:var(--si-ball-ink)}"+
    ".sws-net{stroke:var(--si-soft);stroke-opacity:.6;stroke-width:.8;fill:none;transform-box:fill-box;transform-origin:50% 100%}"+
    ".sws-net.go{stroke:var(--si-act-ink);stroke-opacity:1;animation:sws-bulge .6s cubic-bezier(.3,1.8,.4,1)}"+
    "@keyframes sws-bulge{40%{transform:scaleY(1.9) scaleX(1.1)}100%{transform:none}}"+
    ".sws-wave{fill:none;stroke:var(--si-act-ink);opacity:0}.sws-bits .r{fill:var(--si-act-ink)}.sws-bits .g{fill:var(--si-odds)}"+
    ".sws-pitch{transition:opacity .5s}.sws-pitch.out{opacity:.1}"+
    ".sws-hello{position:absolute;left:0;right:0;top:50%;margin-top:-36px;text-align:center;opacity:0;transform:scale(.5);transition:opacity .6s,transform .6s cubic-bezier(.2,1.5,.4,1);pointer-events:none}"+
    ".sws-hello.on{opacity:1;transform:none}.sws-hello small{display:block;font-size:11px;font-weight:800;letter-spacing:.09em;color:var(--si-odds);margin-bottom:6px}"+
    ".sws-hello b{font-size:30px;font-weight:800;letter-spacing:-.03em;line-height:1.05;color:var(--si-text)}.sws-hello i{font-style:normal;color:var(--si-act-ink)}"+
    ".sws-cap{min-height:40px;text-align:center}.sws-cap b{display:block;font-size:15px;color:var(--si-text)}"+
    ".sws-cap small{display:block;color:var(--si-soft);font-size:12.5px;font-weight:600;margin-top:3px}"+
    ".sws-retry{margin:8px auto 0;display:block;padding:10px 18px;border-radius:999px;border:0;background:var(--si-act);color:#fff;font:inherit;font-weight:800;cursor:pointer}"+
    "@media (prefers-reduced-motion:reduce){.sws *{animation:none!important;transition:none!important}}";
  var cssDone=false;
  function injectCss(){ if(cssDone) return; cssDone=true; var s=d.createElement("style"); s.textContent=CSS; d.head.appendChild(s); }

  function markup(id){
    var pl=["<rect class='sws-pl' pathLength='1' x='8' y='8' width='240' height='252' rx='6'/>",
      "<line class='sws-pl' pathLength='1' x1='8' y1='134' x2='248' y2='134'/>",
      "<circle class='sws-pl' pathLength='1' cx='128' cy='134' r='30'/>",
      "<path class='sws-pl' pathLength='1' d='M84 8v44h88V8'/>","<path class='sws-pl' pathLength='1' d='M106 8v16h44V8'/>",
      "<path class='sws-pl' pathLength='1' d='M102 52a30 30 0 0 0 52 0'/>","<path class='sws-pl' pathLength='1' d='M84 260v-44h88v44'/>",
      "<path class='sws-pl' pathLength='1' d='M102 216a30 30 0 0 1 52 0'/>"].join("");
    return "<div class='sws'><div class='sws-flash'></div>"+
      "<div class='sws-hud'><span class='sws-call'>&nbsp;</span><span>Pass <b class='sws-n'>0</b>/7</span></div>"+
      "<div class='sws-stage'><div class='sws-tilt'><svg viewBox='0 -18 256 296' aria-hidden='true'>"+
      "<defs><linearGradient id='"+id+"b' x1='0' y1='1' x2='0' y2='0'><stop offset='0' class='sws-st0'/><stop offset='1' class='sws-st1'/></linearGradient>"+
      "</defs>"+
      "<g class='sws-pitch'><rect class='sws-turf' x='8' y='8' width='240' height='252' rx='6'/>"+
      pl+
      "<path class='sws-net' d='M104 8V-10h48V8M112 -10V8M120 -10V8M128 -10V8M136 -10V8M144 -10V8M104 -4h48M104 2h48'/>"+
      "<g class='sws-xs'></g><g class='sws-passes'></g><g class='sws-players'></g>"+
      "<ellipse class='sws-shadow' rx='5' ry='2.2' opacity='0'/><g class='sws-tail'></g>"+
      "<g class='sws-ball' opacity='0'><circle r='6.5' class='sws-bf'/><path d='M0 -2.6l2.5 1.8-1 3H-1.5l-1-3z' class='sws-bi'/></g></g>"+
      "<circle class='sws-wave' cx='128' cy='4' r='4'/><g class='sws-bits'></g></svg></div>"+
      "<div class='sws-hello' role='status'><small>GOAL</small><b>You're in<span class='sws-nm'></span></b></div></div>"+
      "<div class='sws-cap' aria-live='polite'><b class='sws-c1'></b><small class='sws-c2'></small></div></div>";
  }

  function swSpell(mount,o){
    o=o||{}; injectCss();
    var id="sws"+(++seq); mount.innerHTML=markup(id);
    var q=function(s){ return mount.querySelector(s); }, qa=function(s){ return mount.querySelectorAll(s); };
    var reduce=!!(root.matchMedia&&root.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var phase=0, finishing=false, speed=1, stopped=false, doneCb=null, scored=false, name=o.name||"";
    var odds=(o.odds||[]).slice(0,6), t0=Date.now(), timers=[];
    function later(ms,f){ timers.push(setTimeout(function(){ if(!stopped) f(); },ms/speed)); }
    function tween(ms,f,cb,ease){ var s0=Date.now(), dur=ms/speed;
      (function tick(){ if(stopped) return; var k=Math.min(1,(Date.now()-s0)/dur); f(ease?ease(k):k);
        if(k<1) root.requestAnimationFrame(tick); else if(cb) cb(); })(); }
    function el(tag,a,p){ var e=d.createElementNS(NS,tag),k; for(k in a) e.setAttribute(k,a[k]); p.appendChild(e); return e; }
    function restart(n,c){ n.classList.remove(c); void n.getBoundingClientRect(); n.classList.add(c); }
    function cap(i){ q(".sws-c1").textContent=CAPS[i][0]; q(".sws-c2").textContent=CAPS[i][1]; if(i===2){ var r=q(".sws-retry"); if(r) r.parentNode.removeChild(r); } }
    function call(t){ var c=q(".sws-call"); c.textContent=t; c.classList.add("on"); later(900,function(){ c.classList.remove("on"); }); }
    function paintName(){ var n=q(".sws-nm"); n.innerHTML=""; if(name){ n.appendChild(d.createTextNode(", ")); var b=d.createElement("br"); n.appendChild(b); var i=d.createElement("i"); i.textContent=name; n.appendChild(i); } }

    var P=q(".sws-players"), X=q(".sws-xs"), i;
    for(i=0;i<7;i++){ var p=PTS[i];
      el("rect",{"class":"sws-beam",x:p[0]-5,y:p[1]-70,width:10,height:70,fill:"url(#"+id+"b)"},P);
      el("circle",{"class":"sws-ring",cx:p[0],cy:p[1],r:7},P);
      el("circle",{"class":"sws-dot",cx:p[0],cy:p[1],r:6.5},P);
      el("text",{"class":"sws-odd",x:p[0],y:p[1]-13},P); }
    for(i=0;i<XS.length;i++) el("path",{"class":"sws-x",d:"M"+(XS[i][0]-4)+" "+(XS[i][1]-4)+"l8 8m0-8l-8 8"},X);
    var beams=qa(".sws-beam"), rings=qa(".sws-ring"), dots=qa(".sws-dot"), odd=qa(".sws-odd"), xs=qa(".sws-x");
    var ball=q(".sws-ball"), sh=q(".sws-shadow"), tail=q(".sws-tail"), passes=q(".sws-passes"), bits=q(".sws-bits"), tilt=q(".sws-tilt");
    var trail=[]; for(i=0;i<8;i++) trail.push(el("circle",{r:(4.2-i*.45).toFixed(2),opacity:0},tail));
    cap(0); paintName();

    function place(x,y,h){ ball.setAttribute("transform","translate("+x.toFixed(1)+" "+(y-h).toFixed(1)+") scale("+(1+h/40).toFixed(2)+")");
      sh.setAttribute("cx",x); sh.setAttribute("cy",y+3); sh.setAttribute("rx",(5-h/14).toFixed(1)); sh.setAttribute("opacity",(.3-h/180).toFixed(2));
      trail.unshift(trail.pop()); trail[0].setAttribute("cx",x); trail[0].setAttribute("cy",y-h);
      for(var j=0;j<trail.length;j++) trail[j].setAttribute("opacity",(.55-j*.07).toFixed(2)); }
    function shatter(x,y){ for(var k=0;k<7;k++) (function(){ var s=el("path",{"class":"sws-shard",d:"M0-2.5L2 1.5-2 1.5z"},bits),
      a=Math.random()*Math.PI*2, v=10+Math.random()*16, r=Math.random()*360;
      tween(520,function(t){ s.setAttribute("transform","translate("+(x+Math.cos(a)*v*t)+" "+(y+Math.sin(a)*v*t)+") rotate("+(r+t*300)+")"); s.setAttribute("opacity",1-t); },
        function(){ if(s.parentNode) s.parentNode.removeChild(s); }); })(); }
    function zap(a,b){ var g=el("polyline",{"class":"sws-zap"},passes), n=0;
      (function f(){ if(n++>3||stopped){ if(g.parentNode) g.parentNode.removeChild(g); return; } var pts=a[0]+","+a[1];
        for(var s=1;s<6;s++){ var k=s/6; pts+=" "+(a[0]+(b[0]-a[0])*k+(Math.random()-.5)*10).toFixed(1)+","+(a[1]+(b[1]-a[1])*k+(Math.random()-.5)*10).toFixed(1); }
        g.setAttribute("points",pts+" "+b[0]+","+b[1]); later(55,f); })(); }
    var oi=0;
    function touch(k){ dots[k].classList.add("on"); restart(rings[k],"go");
      if(k>0&&odds.length){ odd[k].textContent=String(odds[oi++%odds.length]); restart(odd[k],"go"); }
      if(XHIT[k]!=null&&xs[XHIT[k]].classList.contains("in")){ xs[XHIT[k]].classList.remove("in"); shatter(XS[XHIT[k]][0],XS[XHIT[k]][1]); } }
    var cur=0, count=0;
    function beat(){
      if(stopped) return;
      var b=nextBeat(cur,phase,finishing);
      if(b.hold){ later(120,beat); return; }
      var a=PTS[cur], to=PTS[b.to], shot=b.kind==="shot", flick=b.kind==="flick";
      var bend=shot?-64:(cur%2?-28:28), mx=(a[0]+to[0])/2+bend, my=(a[1]+to[1])/2+(shot?14:0);
      var path=el("path",{"class":"sws-pass",d:"M"+a[0]+" "+a[1]+" Q"+mx+" "+my+" "+to[0]+" "+to[1]},passes);
      var L=path.getTotalLength(); path.style.strokeDasharray=L; path.style.strokeDashoffset=L;
      if(b.kind==="pass") zap(a,to);
      if(flick) call("Rainbow flick"); if(shot) call("Curler");
      var ease=shot?function(k){ return k<.15?k*2:(k<.85?.3+(k-.15)*.43:.6+(k-.85)*2.67); }:function(k){ return 1-Math.pow(1-k,2.2); };
      tween(shot?1500:flick?780:430,function(e){ path.style.strokeDashoffset=L*(1-e); var pt=path.getPointAtLength(L*e);
          place(pt.x,pt.y,flick?46*Math.sin(Math.PI*e):shot?10*Math.sin(Math.PI*e):4*Math.sin(Math.PI*e)); },
        function(){ cur=b.to; if(shot) return goal();
          count++; q(".sws-n").textContent=Math.min(count,6); touch(cur);
          path.style.transition="stroke-opacity .9s"; path.style.strokeOpacity=.15;
          later(flick?220:90,beat); },ease);
    }
    function goal(){
      scored=true; q(".sws-n").textContent="7"; ball.setAttribute("opacity",0); sh.setAttribute("opacity",0);
      for(var j=0;j<trail.length;j++) trail[j].setAttribute("opacity",0);
      restart(q(".sws-net"),"go"); restart(q(".sws-flash"),"go"); cap(2);
      try{ if(root.navigator&&root.navigator.vibrate) root.navigator.vibrate([20,40,30]); }catch(e){}
      var w=q(".sws-wave"); tween(700,function(t){ w.setAttribute("r",4+t*230); w.setAttribute("opacity",(1-t).toFixed(2)); w.setAttribute("stroke-width",(4-3*t).toFixed(2)); });
      for(var k=0;k<26;k++) (function(k){ var star=k%3===0, ang=Math.PI*(.02+.96*Math.random()), sp=30+Math.random()*90, rot=Math.random()*360,
        n=star?el("path",{"class":"g",d:"M0-4.5L1.1-1.1 4.5 0 1.1 1.1 0 4.5-1.1 1.1-4.5 0-1.1-1.1z"},bits):el("circle",{"class":k%2?"r":"g",r:(1.3+Math.random()*1.4).toFixed(1)},bits);
        tween(1000+Math.random()*400,function(t){ n.setAttribute("transform","translate("+(128+Math.cos(ang)*sp*t)+" "+(4+Math.sin(ang)*sp*t+30*t*t)+") rotate("+(rot+t*260)+")"); n.setAttribute("opacity",(1-t).toFixed(2)); }); })(k);
      tilt.classList.add("shake");
      later(380,function(){ tilt.classList.remove("up"); tilt.classList.remove("shake"); tilt.classList.add("flat"); q(".sws-pitch").classList.add("out"); paintName(); q(".sws-hello").classList.add("on");
        // the hold is real time, not scaled by speed: the spec says 900ms
        timers.push(setTimeout(function(){ if(stopped) return; clearTimeout(maxT); if(doneCb){ var f=doneCb; doneCb=null; f(); } },HOLD_MS)); });
    }
    function showFinal(){ scored=true; cap(2); q(".sws-pitch").classList.add("out"); paintName(); q(".sws-hello").classList.add("on");
      setTimeout(function(){ if(!stopped&&doneCb){ var f=doneCb; doneCb=null; f(); } },HOLD_MS); }

    var maxT=setTimeout(function(){ if(stopped||scored) return;
      q(".sws-c1").textContent="Still working. Check your connection."; q(".sws-c2").textContent="";
      if(o.onRetry&&!q(".sws-retry")){ var b=d.createElement("button"); b.type="button"; b.className="sws-retry"; b.textContent="Retry";
        b.onclick=function(){ o.onRetry(); }; q(".sws-cap").appendChild(b); } },MAX_MS);

    if(!reduce){
      later(80,function(){ tilt.classList.add("up"); q(".sws-turf").classList.add("on"); });
      var pls=qa(".sws-pl"); for(i=0;i<pls.length;i++) (function(l,i){ later(120+i*70,function(){ l.classList.add("on"); }); })(pls[i],i);
      for(i=0;i<7;i++) (function(i){ later(900+i*110,function(){ restart(beams[i],"go"); dots[i].classList.add("in"); }); })(i);
      for(i=0;i<xs.length;i++) (function(x,i){ later(1300+i*90,function(){ x.classList.add("in"); }); })(xs[i],i);
      later(2000,function(){ ball.setAttribute("opacity",1); place(PTS[0][0],PTS[0][1],0); touch(0); later(250,beat); });
    } else { for(i=0;i<7;i++) dots[i].classList.add("in"); }

    return {
      step:function(n){ if(n>phase){ phase=n; if(n<2) cap(n); } },
      setName:function(n){ name=n||""; },
      finish:function(cb){
        doneCb=cb; finishing=true; if(phase<1) phase=1;
        var wait=Math.max(0,MIN_MS-(Date.now()-t0));
        if(reduce){ setTimeout(function(){ if(!stopped) showFinal(); },wait); return; }
        speed=2;                  // the account is ready: play every remaining beat, just faster (the summon alone outlasts MIN_MS)
      },
      stop:function(){ stopped=true; clearTimeout(maxT); for(var k=0;k<timers.length;k++) clearTimeout(timers[k]); }
    };
  }
  root.swSpell=swSpell;
  root.swSpell.firstName=firstName;
})(typeof window!=="undefined"?window:this);
