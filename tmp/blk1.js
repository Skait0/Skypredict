
"use strict";
const $=function(id){return document.getElementById(id);};
/* the same drawn cross the static close buttons use - see .sheet-x in the css */
var XSVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const P0=function(x){return Math.round(x*100);};
var CHK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;display:block"><path d="M5 13l4 4L19 7"/></svg>';
var PLUS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" style="width:12px;height:12px;display:block"><path d="M12 5v14M5 12h14"/></svg>';
function conf(p){var pc=Math.round(p*100);return pc>=70?"strong":pc>=55?"lean":"slight";}
function confLabel(p){var pc=Math.round(p*100);return pc>=70?"Strong":pc>=55?"Likely":"Slight";}
function verdict(p){var pc=Math.round(p*100);return pc>=70?"Good bet":pc>=55?"Worth a look":"Risky pick";}
const V={off:0,country:"",league:"",q:"",cat:"all",list:true};
try{var _sv=localStorage.getItem("sw.view"); if(_sv) V.list=(_sv==="list");}catch(e){}
let DATA={generated:"",matches:0,leagues:[],fixtures:[],results:[]};
const REDUCED=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if(REDUCED) document.documentElement.classList.add("reduce");
const SHUT={};
const LOPEN={};

function esc(s){return String(s).replace(/[&<>"]/g,function(c){
  return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];});}
function fid(f){return "m"+(f.date+f.home+f.away).replace(/[^a-zA-Z0-9]/g,"");}
function countryOf(l){return l.split(" ")[0];}
/* CONMEBOL countries. Only Argentina and Brazil are in the feeds today, but
   the whole set is listed so a new South American league is handled the moment
   it appears rather than slipping through as if it were European. The builders
   hold these back behind Europe; countryOf() gives the league's leading word. */
var SA_COUNTRIES={Argentina:1,Bolivia:1,Brazil:1,Chile:1,Colombia:1,Ecuador:1,
  Paraguay:1,Peru:1,Uruguay:1,Venezuela:1};
/* "Fixtures are not a lot" = fewer than this many European games to choose
   from. Below it a slip would be thin, so South America is allowed in to pad
   it; at or above it Europe stands on its own. An absolute floor, not a share
   of the risk-slider cap - that cap runs to ~35, so a relative test would rate
   Europe "scarce" almost every day and defeat the whole point. */
var SA_MIN_EURO=6;
/* Lower divisions (2nd tiers and below) - some days the board is mostly these
   and the user wants top-flight only. One shared setting drives both builders. */
function isLowerLeague(l){return /\bchampionship\b|\bleague [12]\b|\bconference\b|\bligue 2\b|\bserie b\b|\bla liga 2\b|\bbundesliga 2\b/i.test(l||"");}
var TOP_ONLY=false; try{TOP_ONLY=localStorage.getItem("sw.toponly")==="1";}catch(e){}
function setTopOnly(v){TOP_ONLY=!!v;try{localStorage.setItem("sw.toponly",v?"1":"0");}catch(e){}}
function isSAleague(l){return !!SA_COUNTRIES[countryOf(l||"")];}
function isSouthAmerican(f){return isSAleague((f&&f.league)||"");}
/* Predicted scoreline from expected goals. On a rounded tie, break toward the
   side the model leans on, so it never shows a draw against a "No draw" tip;
   a genuine draw is kept only when the draw is the most likely single result. */
function scoreLine(f){
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
function onDay(){return ahead().filter(function(f){return dayOff(f.date)===V.off;});}
function activeDays(){
  const s={};
  ahead().forEach(function(f){s[dayOff(f.date)]=1;});
  (DATA.results||[]).forEach(function(r){s[dayOff(r.date)]=1;});
  return Object.keys(s).map(Number).sort(function(a,b){return a-b;});
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
function shown(){
  const q=V.q.trim().toLowerCase(), t=catTest(V.cat);
  return onDay().filter(function(f){
    if(V.country&&countryOf(f.league)!==V.country) return false;
    if(V.league&&f.league!==V.league) return false;
    if(!t(f)) return false;
    if(q&&(f.league+" "+f.home+" "+f.away).toLowerCase().indexOf(q)<0) return false;
    return true;});
}

function plainTip(f){
  const t=f.tip;
  if(t==="Home win") return f.home+" to win";
  if(t==="Away win") return f.away+" to win";
  if(t==="Draw") return "A draw";
  if(t==="Both teams score") return "Both teams score";
  if(t==="First half goal") return "A goal in the first half";
  if(t.indexOf("1X")===0) return f.home+" to win or draw";
  if(t.indexOf("X2")===0) return f.away+" to win or draw";
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
function blendFixture(f){
  var o=f.sportyOdds; if(!o) return; var B=0.30;
  if(o["1"]&&o["X"]&&o["2"]){
    var m=_devig3(o["1"],o["X"],o["2"]);
    if(m){
      f.home_p=f.home_p*(1-B)+m[0]*B; f.draw_p=f.draw_p*(1-B)+m[1]*B; f.away_p=f.away_p*(1-B)+m[2]*B;
      var s=f.home_p+f.draw_p+f.away_p; if(s>0){f.home_p/=s;f.draw_p/=s;f.away_p/=s;}
      f.dc1x=f.home_p+f.draw_p; f.dcx2=f.draw_p+f.away_p; f.dc12=f.home_p+f.away_p; f.anybody=f.dc12;
    }
  }
  function two(ov,un,field){ if(o[ov]&&o[un]){var a=1/o[ov],b=1/o[un],s=a+b; if(s>0) f[field]=f[field]*(1-B)+(a/s)*B;} }
  two("OVER_2.5","UNDER_2.5","o25"); two("OVER_1.5","UNDER_1.5","o15"); two("GG","NG","btts");
  var c=tipCode(f);
  if(c){var mp={"1":f.home_p,"2":f.away_p,"X":f.draw_p,"1X":f.dc1x,"X2":f.dcx2,"12":f.dc12,"OVER_2.5":f.o25,"OVER_1.5":f.o15,"GG":f.btts};
    if(mp[c]!=null) f.tip_p=mp[c];}
  f.blended=true;
}
function valPill(f){return isValue(f)?"<span class='pill value'>\u2726 Better price</span>":"";}
function valMark(f){return isValue(f)?"<span class='vmark' title='Better price - our odds beat SportyBet'>\u2726 Better price</span>":"";}

/* -------------------------------------------------------- pick of the day
   Chosen by confidence, then explained. A pick with no reasoning is just a
   number, and numbers without reasons are what every tipster site sells. */
function renderPotd(){
  const ps=onDay();
  if(!ps.length){$("potd").innerHTML="";return;}
  const top=ps.slice().sort(function(a,b){return b.tip_p-a.tip_p;})[0];

  const reasons=[];
  const hf=top.home_p>top.away_p;
  const strong=hf?top.home:top.away;
  const xgLead=Math.abs(top.lh-top.la);
  if(xgLead>=0.5)
    reasons.push("<b>"+esc(strong)+"</b> are expected to score "+
      xgLead.toFixed(1)+" more goals than their opponent");
  const form=hf?top.form_home:top.form_away;
  if(form&&form.length){
    const w=form.filter(function(x){return x==="W";}).length;
    if(w>=3) reasons.push("<b>"+esc(strong)+"</b> have won "+w+
      " of their last "+form.length);
  }
  if(top.o25>=0.6) reasons.push("Goals look likely, over 2.5 at <b>"+
    P0(top.o25)+"%</b>");
  else if((1-top.o25)>=0.6) reasons.push("A tight game, under 2.5 at <b>"+
    P0(1-top.o25)+"%</b>");
  /* Only cite value when it points the same way as the pick. Quoting an
     edge on the opposite side reads as the page arguing with itself. */
  if(top.value&&top.value.edge>=0.03){
    const vp=top.value.pick.toLowerCase();
    const agrees=vp.indexOf(strong.toLowerCase())>=0 ||
      (vp.indexOf("over")>=0&&top.o25>=0.6) ||
      (vp.indexOf("under")>=0&&(1-top.o25)>=0.6);
    if(agrees) reasons.push("The bookies rate this shorter than we do, <b>"+
      (top.value.edge*100).toFixed(0)+" points</b> of value on "+esc(top.value.pick));
  }
  reasons.push("Our model puts this at <b>"+P0(top.tip_p)+
    "%</b>, the strongest call on today's card");

  $("potd").innerHTML=
    "<section class='potd'>"+
      "<div class='potd-top'>"+
        "<svg width='15' height='15' viewBox='0 0 24 24' fill='currentColor'>"+
          "<path d='M12 2l2.4 6.9 7.1.4-5.5 4.6 1.8 7-5.8-4-5.8 4 1.8-7L2.5 9.3l7.1-.4z'/></svg>"+
        "<b>Pick of the day</b>"+
        "<span class='k'>"+esc(compOf(top.league))+"</span>"+
      "</div>"+
      "<div class='potd-body'>"+
        "<div class='potd-grid'>"+
          "<div><h2>"+esc(plainTip(top))+"</h2>"+
            "<p class='meta'>"+esc(top.home)+" v "+esc(top.away)+" &middot; "+
              dayName(dayOff(top.date))+" "+esc(kickTime(top))+"</p></div>"+
          "<div class='big num'>"+P0(top.tip_p)+"<em>%</em></div>"+
        "</div>"+
        "<div class='why'><span class='eyebrow'>Why we like it</span><ul>"+
          reasons.map(function(r){
            return "<li><span class='dot'></span><span>"+r+"</span></li>";}).join("")+
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

/* --------------------------------------------------------------- controls */
function renderCats(){
  const base=onDay().filter(function(f){
    if(V.country&&countryOf(f.league)!==V.country) return false;
    if(V.league&&f.league!==V.league) return false;
    return true;});
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
    if(up.length){ var busiest=up[0], bn=-1;
      up.forEach(function(o){var n=ahead().filter(function(f){return dayOff(f.date)===o;}).length;
        if(n>bn){bn=n;busiest=o;}});
      V.off=busiest;
    } else { V.off=days[days.length-1]; }
  }
  const i=days.indexOf(V.off);
  $("dname").textContent=dayName(V.off);
  $("ddate").textContent=dayDate(V.off);
  $("prev").disabled=(i<=0);
  $("next").disabled=(i<0||i>=days.length-1);
  $("prev").onclick=function(){if(i>0){V.off=days[i-1];V.country="";V.league="";render();}};
  $("next").onclick=function(){if(i<days.length-1){V.off=days[i+1];V.country="";V.league="";render();}};

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
  var add=(code&&id)?"<button class='opt-add"+(on?" on":"")+"' data-add='"+id+"' data-code='"+code+"' data-label=\""+name+"\" data-p='"+v.toFixed(3)+"' aria-label='Add to slip'>"+(on?"\u2713":"+")+"</button>":"";
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
    "<div class='grp'><h4>Who wins</h4><div class='opts'>"+
      opt(esc(f.home)+" to win",f.home_p,f.home_p>=.6,"1",id)+
      opt(esc(f.away)+" to win",f.away_p,f.away_p>=.6,"2",id)+
      opt("Draw",f.draw_p,f.draw_p>=.4,"X",id)+
      opt(esc(f.home)+" or draw",f.dc1x,f.dc1x>=.75,"1X",id)+
      opt(esc(f.away)+" or draw",f.dcx2,f.dcx2>=.75,"X2",id)+
      opt("Any team to win",noDraw,noDraw>=.75,"12",id)+"</div></div>"+
    "<div class='grp'><h4>Goals</h4><div class='opts'>"+
      opt("Over 1.5 goals",f.o15,f.o15>=.75,"OVER_1.5",id)+
      opt("Over 2.5 goals",f.o25,f.o25>=.6,"OVER_2.5",id)+
      opt("Under 2.5 goals",1-f.o25,(1-f.o25)>=.6)+
      opt("Both teams score",f.btts,f.btts>=.6,"GG",id)+
      opt("Goal in 1st half",f.fh_o05,f.fh_o05!=null&&f.fh_o05>=.7)+"</div></div>"+
    "<div class='grp'><h4>Combos</h4><div class='opts'>"+
      opt("Both score + over 2.5",f.btts_o25,f.btts_o25!=null&&f.btts_o25>=.55)+
      opt("Draw or over 2.5",f.draw_o25,f.draw_o25!=null&&f.draw_o25>=.7)+
      opt("Draw or both score",f.draw_btts,f.draw_btts!=null&&f.draw_btts>=.7)+
    "</div></div>"+
    "<button class='more-collapse' type='button'>Collapse \u25b4</button></div>";
}
function formHTML(arr){
  if(!arr||!arr.length) return "";
  return "<span class='form'>"+arr.slice(0,5).map(function(r){
    return "<i class='"+r+"'>"+r+"</i>";}).join("")+"</span>";
}

function matchHTML(f){
  const hw=f.home_p>f.away_p&&f.home_p>f.draw_p;
  const aw=f.away_p>f.home_p&&f.away_p>f.draw_p;
  const cf=conf(f.tip_p);
  const pills=[];
  var _sc=scoreLine(f).split("-"); var _mgn=Math.abs((+_sc[0])-(+_sc[1]));
  if(f.draw_watch && _mgn<=1) pills.push("<span class='pill draw'>Could be a draw</span>");
  if(f.o25>=0.66) pills.push("<span class='pill goals'>Goals likely</span>");
  var _vb=valPill(f); if(_vb) pills.unshift(_vb);
  return "<article class='m conf-"+cf+"' id='"+fid(f)+"'>"+
    "<button class='m-btn' data-fx='"+fid(f)+"'>"+
      "<span class='m-top'><span class='t'>"+esc(kickTime(f))+"</span>"+pills.join("")+"</span>"+
      "<span class='teams'>"+
        "<span class='tnames'>"+
          "<span class='tn"+(hw?" win":"")+"'>"+
            "<span class='who'><span>"+esc(f.home)+"</span>"+formHTML(f.form_home)+"</span>"+
            "<span class='g num' title='Goals we expect them to score'>"+
              f.lh.toFixed(1)+"</span></span>"+
          "<span class='tn"+(aw?" win":"")+"'>"+
            "<span class='who'><span>"+esc(f.away)+"</span>"+formHTML(f.form_away)+"</span>"+
            "<span class='g num' title='Goals we expect them to score'>"+
              f.la.toFixed(1)+"</span></span>"+
        "</span>"+
        "<span class='sc'><b class='num'>"+scoreLine(f)+"</b><i>score</i></span>"+
      "</span>"+
      "<span class='pbar'>"+
        "<i style='flex:"+(f.home_p*100).toFixed(1)+";background:var(--win)'></i>"+
        "<i style='flex:"+(f.draw_p*100).toFixed(1)+";background:var(--grey)'></i>"+
        "<i style='flex:"+(f.away_p*100).toFixed(1)+";background:var(--cream)'></i>"+
      "</span>"+
      "<span class='legend'>"+
        "<b><i style='background:var(--win)'></i>Home "+P0(f.home_p)+"%</b>"+
        "<b><i style='background:var(--grey)'></i>Draw "+P0(f.draw_p)+"%</b>"+
        "<b><i style='background:var(--cream)'></i>Away "+P0(f.away_p)+"%</b>"+
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
    (tipCode(f)?"<button class='m-add' data-add='"+fid(f)+"' data-code='"+tipCode(f)+"' data-label=\""+esc(plainTip(f))+"\" data-p='"+f.tip_p.toFixed(3)+"' type='button'><span class='ma-ic'>"+PLUS+"</span> Add to slip</button>":"")+
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
function listRowHTML(f){
  const cf=conf(f.tip_p), id=fid(f), openCls=LOPEN[id]?" open":"";
  const lead=(f.home_p>=f.draw_p&&f.home_p>=f.away_p)?"h":(f.away_p>=f.draw_p?"a":"d");
  return "<div class='lrow conf-"+cf+openCls+"' data-lf='"+id+"'>"+
    "<span class='lt-time'>"+esc(kickTime(f))+"</span>"+
    "<span class='lt-match'><span class='tm'>"+esc(f.home)+"</span><span class='vs'>v</span><span class='tm'>"+esc(f.away)+"</span></span>"+
    "<span class='lt-p"+(lead==="h"?" lead":"")+"'>"+P0(f.home_p)+"<small>%</small></span>"+
    "<span class='lt-p"+(lead==="d"?" lead":"")+"'>"+P0(f.draw_p)+"<small>%</small></span>"+
    "<span class='lt-p"+(lead==="a"?" lead":"")+"'>"+P0(f.away_p)+"<small>%</small></span>"+
    "<span class='lt-tip'><span class='vdot'></span><span class='tx' title=\""+esc(plainTip(f))+"\">"+esc(plainTip(f))+"</span>"+
      "<i class='grade'>"+P0(f.tip_p)+"%</i></span>"+
    "<span class='lt-score' title='Predicted score'>"+scoreLine(f)+"</span>"+
    "<span class='lt-chev' aria-hidden='true'>\u25be</span>"+
    "<div class='lmore'><button class='lmore-x' type='button' aria-label='Collapse'>▴</button>"+moreHTML(f)+"</div>"+
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
  if(!rs.length){$("list").innerHTML=head+"<div class='none'><b>No results for this day</b><p>Play a day forward for upcoming games.</p></div>";return;}
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
  $("list").innerHTML=html;
}
function render(){
  document.documentElement.classList.toggle("list",!!V.list);
  renderControls(); renderCats();
  if(V.off<0){ document.documentElement.classList.add("is-results");
    $("potd").innerHTML="";$("sotd").innerHTML="";$("record").innerHTML="";
    renderResults(); return; }
  document.documentElement.classList.remove("is-results");
  renderPotd(); renderSlipOfDay(); renderRecord(); renderBookAll();
  const list=shown();
  if(!list.length){
    $("list").innerHTML="<div class='none'><b>No games in this filter</b>"+
      "<p>Try another category or day. New fixtures arrive Friday for the weekend.</p></div>";
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
  const tops=favL.length?[]:TOP_LEAGUES.filter(function(l){return byL[l]&&!isSAleague(l);});
  if(tops.length)
    html+="<div class='faves-h'><h2>Top leagues</h2><span>"+
      tops.reduce(function(n,l){return n+byL[l].length;},0)+" games</span></div>"+
      tops.map(function(l){return blockFor(l,byL[l],true);}).join("");
  const done={}; favL.concat(tops).forEach(function(l){done[l]=1;});

  const byC={};
  Object.keys(byL).forEach(function(l){
    if(done[l]) return;
    const c=countryOf(l);(byC[c]=byC[c]||[]).push(l);});
  html+=Object.keys(byC).sort(function(a,b){
    var fa=isFav("c:"+a)?0:1, fb=isFav("c:"+b)?0:1;
    return fa-fb || a.localeCompare(b);
  }).map(function(c){
    const ls=byC[c].sort();
    const n=ls.reduce(function(t,l){return t+byL[l].length;},0);
    return "<section class='country"+(SHUT[c]?" shut":"")+"'>"+
      "<div class='country-h' role='button' tabindex='0' data-toggle=\""+esc(c)+"\">"+
        "<span class='chev'>\u25be</span><h2>"+flagFor(c)+"<span>"+esc(c)+"</span></h2>"+
        "<button class='star' data-fav=\"c:"+esc(c)+"\" aria-pressed='"+isFav("c:"+c)+"' aria-label='Pin country'>"+(isFav("c:"+c)?"\u2605":"\u2606")+"</button>"+
        "<span class='count'>"+n+"</span></div>"+
      "<div class='country-body'>"+ls.map(function(l){
        return blockFor(l,byL[l]);}).join("")+"</div></section>";}).join("");
  $("list").innerHTML=_thin+html;
  document.querySelectorAll(".lrow").forEach(function(r){
    r.addEventListener("click",function(e){
      if(e.target.closest(".opt-add")||e.target.closest(".m-add")) return;
      var id=r.dataset.lf; var open=!LOPEN[id]; LOPEN[id]=open; r.classList.toggle("open",open);});
    var xb=r.querySelector(".lmore-x");
    if(xb) xb.addEventListener("click",function(e){e.stopPropagation();
      var id=r.dataset.lf; LOPEN[id]=false; r.classList.remove("open");});
    var xc=r.querySelector(".lmore-close");
    if(xc) xc.addEventListener("click",function(e){e.stopPropagation();
      var id=r.dataset.lf; LOPEN[id]=false; r.classList.remove("open");});});

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
$("scrim").addEventListener("click",function(){closeSheet();closeMySheet();});
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
  }});

/* ============================================================ build a slip */
var BUILD={risk:null,removed:{},picks:[],booking:false,seed:Math.floor(Math.random()*1e6),shuffles:0,mk:{dc:true,out:true,goals:true,both:true},touched:false,mode:"slider"};
try{var rr=localStorage.getItem("sw.risk"); if(rr!=null) BUILD.risk=+rr;}catch(e){}
try{var rm=localStorage.getItem("sw.mode"); if(rm==="slider"||rm==="wizard") BUILD.mode=rm;}catch(e){}
/* Ticket window. "day" holds every leg inside today, so the whole slip settles
   the same evening; "all" runs for as long as there are fixtures published.
   One shared preference, so the slider builder and Wizard's Special can never
   disagree about which games are on the table. */
var SCOPE="all";
try{var sc0=localStorage.getItem("sw.scope"); if(sc0==="day"||sc0==="all") SCOPE=sc0;}catch(e){}
function scopeFixtures(){
  return DATA.fixtures.filter(function(f){
    if(!notStarted(f)) return false;
    return SCOPE!=="day"||dayOff(f.date)===0;
  });
}
function paintScope(){
  var seg=$("scopeSeg"); if(!seg) return;
  seg.querySelectorAll("[data-scope]").forEach(function(b){
    var on=b.getAttribute("data-scope")===SCOPE;
    b.classList.toggle("on",on);
    b.setAttribute("aria-pressed",on?"true":"false");
  });
}
/* Persist and repaint only - callers decide what to re-render, because a change
   made from the Wizard's Special sheet must not flip BUILD.touched and rewrite
   the slip the user just conjured. */
function setScope(s){
  if((s!=="day"&&s!=="all")||s===SCOPE) return false;
  SCOPE=s; try{localStorage.setItem("sw.scope",s);}catch(e){}
  paintScope(); return true;
}
const BOOK_URL="https://web-production-798c0.up.railway.app/api/generate-booking-code";
const SPORTY_URL="https://www.sportybet.com/ng/?shareCode=";
const SPORTY_FIXTURES="https://web-production-798c0.up.railway.app/api/fixtures";
function normTeam(s){
  s=(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  s=s.replace(/ø/g,"o").replace(/æ/g,"ae").replace(/å/g,"a").replace(/ß/g,"ss")
     .replace(/đ/g,"d").replace(/ð/g,"d").replace(/ł/g,"l").replace(/ı/g,"i").replace(/þ/g,"th");
  s=s.replace(/[`'.\-]/g," ");
  s=s.replace(/\butd\b/g,"united");
  s=s.replace(/\bman united\b/g,"manchester united").replace(/\bman city\b/g,"manchester city")
     .replace(/\bpsg\b/g,"paris").replace(/\bparis sg\b/g,"paris").replace(/\bparis saint germain\b/g,"paris")
     .replace(/\bspurs\b/g,"tottenham").replace(/\bwolves\b/g,"wolverhampton")
     .replace(/\bnott m forest\b/g,"nottingham forest").replace(/\bnottm forest\b/g,"nottingham forest")
     .replace(/\bwest brom\b/g,"west bromwich").replace(/\bespanyol\b/g,"espanol")
     .replace(/\bolympiacos\b/g,"olympiakos").replace(/\baustria lustenau\b/g,"lustenau")
     .replace(/\ba lustenau\b/g,"lustenau").replace(/\batromitos athinon\b/g,"atromitos");
  s=s.replace(/^\s*sporting\s*$/,"sp lisbon");
  s=s.replace(/\b(pa|sp|rj|mg|rs|sc|pr|ce|ba|go|pe|df|am|mt|ms|es|pb|rn|al|pi|ma|to|ap|ac|ro|rr|se)\b/g," ");
  s=s.replace(/\b(fc|cf|afc|ac|as|sv|us|ss|ssc|cd|ca|sk|if|bk|clube|club|do|da|de|dos|das|the|ec|se|ad|aa|cr|futebol)\b/g," ");
  return s.replace(/\s+/g," ").trim();
}
function tokset(s){return normTeam(s).split(" ").filter(function(w){return w.length>=3;});}
function simTeams(a,b){
  var na=normTeam(a),nb=normTeam(b);
  if(!na||!nb) return 0;
  if(na===nb) return 1;
  if(na.indexOf(nb)>=0||nb.indexOf(na)>=0) return 0.9;
  var ta=tokset(a),tb=tokset(b),sh=0;
  ta.forEach(function(x){
    if(tb.some(function(y){return x===y||(x.length>=4&&y.length>=4&&(x.indexOf(y)===0||y.indexOf(x)===0));})) sh++;
  });
  return sh/Math.max(1,Math.min(ta.length,tb.length));
}
function attachEventIds(sporty){
  if(!sporty||!sporty.length) return 0;
  var byDate={};
  sporty.forEach(function(m){
    if(!m.eventId||!m.startTime) return;
    var k=new Date(m.startTime).toISOString().slice(0,10);
    (byDate[k]=byDate[k]||[]).push(m);
  });
  var hits=0;
  DATA.fixtures.forEach(function(f){
    var cand=[];
    [-2,-1,0,1,2].forEach(function(o){
      var dt=new Date(f.date+"T12:00:00Z"); dt.setUTCDate(dt.getUTCDate()+o);
      var k=dt.toISOString().slice(0,10);
      if(byDate[k]) cand=cand.concat(byDate[k]);
    });
    var best=null,bestScore=0;
    cand.forEach(function(m){
      var s=simTeams(f.home,m.homeTeam)+simTeams(f.away,m.awayTeam);
      if(s>bestScore){bestScore=s;best=m;}
    });
    if(best&&bestScore>=1.3){f.eventId=best.eventId;f.sportyOdds=best.odds||{};blendFixture(f);hits++;return;}
    var gb=null,gs=0;
    sporty.forEach(function(m){
      var s=simTeams(f.home,m.homeTeam)+simTeams(f.away,m.awayTeam);
      if(s>gs){gs=s;gb=m;}
    });
    if(gb&&gs>=1.6){f.eventId=gb.eventId;f.sportyOdds=gb.odds||{};blendFixture(f);hits++;}
  });
  try{console.log("[sporty] matched "+hits+"/"+DATA.fixtures.length+" from "+sporty.length+" events");}catch(e){}
  return hits;
}
async function loadSporty(){
  try{
    var r=await fetch(SPORTY_FIXTURES,{headers:{Accept:"application/json"}});
    var d=await r.json();
    if(d&&d.matches) return attachEventIds(d.matches);
  }catch(e){}
  return 0;
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
function allowedMarkets(t){
  var m=["1X","X2","OVER_1.5","1","2"];
  if(t>=1) m=m.concat(["12","OVER_2.5"]);
  if(t>=2) m=m.concat(["GG"]);
  return m;
}
function mProb(f,c){
  switch(c){case"1":return f.home_p;case"X":return f.draw_p;case"2":return f.away_p;
    case"1X":return f.dc1x;case"X2":return f.dcx2;
    case"12":return f.anybody!=null?f.anybody:f.dc12;
    case"OVER_1.5":return f.o15;case"OVER_2.5":return f.o25;case"GG":return f.btts;}
  return null;
}
function mLabel(f,c){
  switch(c){case"1":return esc(f.home)+" to win";case"2":return esc(f.away)+" to win";
    case"X":return"Draw";case"1X":return esc(f.home)+" or draw";
    case"X2":return esc(f.away)+" or draw";case"12":return"Any team to win";
    case"OVER_1.5":return"Over 1.5 goals";case"OVER_2.5":return"Over 2.5 goals";
    case"GG":return"Both teams to score";}
  return c;
}
function buildPicks(){
  var p=riskParams(BUILD.risk), allowed=allowedMarkets(p.tier), cand=[];
  var mkOn={"1X":BUILD.mk.dc,"X2":BUILD.mk.dc,"12":BUILD.mk.dc,"1":BUILD.mk.out,"2":BUILD.mk.out,"OVER_1.5":BUILD.mk.goals,"OVER_2.5":BUILD.mk.goals,"GG":BUILD.mk.both};
  allowed=allowed.filter(function(c){return mkOn[c]!==false;});
  var f0=BUILD.risk/100;
  function h32(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967296;}
  scopeFixtures().forEach(function(f){
    if(TOP_ONLY && isLowerLeague(f.league)) return;
    var homeFav=f.home_p>f.away_p;
    function sane(c){
      if(c==="1"&&!homeFav) return false;
      if(c==="2"&&homeFav) return false;
      if(c==="1X"&&!homeFav) return false;
      if(c==="X2"&&homeFav) return false;
      return true;
    }
    var best=null,bestScore=-1;
    allowed.forEach(function(c){
      if(!sane(c)) return;
      var v=mProb(f,c);
      if(v==null||isNaN(v)||v<p.minConf) return;
      var score=(1-f0)*v + f0*(oddOf(v)/12);
      score*=1+(h32(fid(f)+"|"+c+"|"+(BUILD.seed||0))-0.5)*(0.9+0.8*f0);
      if(score>bestScore){bestScore=score;best={code:c,p:v};}
    });
    if(best) cand.push({f:f,id:fid(f),code:best.code,p:best.p,eventId:f.eventId||null});
  });
  var removedCount=Object.keys(BUILD.removed).length;
  var cap=Math.max(0,p.maxGames-removedCount);
  /* Europe first. South American games are held back unless Europe can't fill
     the slip, or the user has reshuffled a couple of times and clearly wants a
     different mix. Once allowed in they're penalised rather than cut, so Europe
     still leads while a few South American games come through. */
  var euroN=cand.filter(function(c){return !isSouthAmerican(c.f);}).length;
  var saMode=(euroN<Math.min(cap,SA_MIN_EURO))?"fill":((BUILD.shuffles||0)>=2?"mix":"exclude");
  if(saMode==="exclude") cand=cand.filter(function(c){return !isSouthAmerican(c.f);});
  var saPenalty=(saMode==="mix")?0.6:0.85;
  cand.sort(function(a,b){
    var ka=(f0<0.5?a.p:oddOf(a.p)), kb=(f0<0.5?b.p:oddOf(b.p));
    if(isSouthAmerican(a.f))ka*=saPenalty; if(isSouthAmerican(b.f))kb*=saPenalty;
    ka*=1+(h32(a.id+"|s"+(BUILD.seed||0))-0.5)*(0.9+f0); kb*=1+(h32(b.id+"|s"+(BUILD.seed||0))-0.5)*(0.9+f0);
    return kb-ka;
  });
  cand=cand.filter(function(c){return !BUILD.removed[c.id];}).slice(0,cap);
  BUILD.picks=cand;
  return cand;
}
function oddOf(p){var q=Math.max(0.06,Math.min(0.97,p));return Math.pow(1/q,0.85);}
function legOdd(f,code,p){var o=f&&f.sportyOdds&&f.sportyOdds[code];return (o&&o>1.01)?o:oddOf(p);}
function oddsAreReal(picks){return picks.length&&picks.every(function(c){var o=c.f&&c.f.sportyOdds&&c.f.sportyOdds[c.code];return o&&o>1.01;});}
function notStarted(f){if(f&&f.kickoff){return new Date(f.kickoff).getTime()>Date.now();}return isUpcoming(f);}
function totalOdds(picks){
  return picks.reduce(function(t,c){return t*legOdd(c.f,c.code,c.p);},1);
}
function renderBuilder(){
  // If risk not set yet (first visit), show empty state without generating picks
  var firstVisit = BUILD.risk === null;
  var p = firstVisit ? {tier:1, minConf:0.65, maxGames:18} : riskParams(BUILD.risk);
  // --- Unified Market Palette config ---
  var MKT_CFG=[
    {k:"dc", label:"Double chance", tier:0, sub:"1X, X2, 12"},
    {k:"out", label:"Outright wins", tier:1, sub:"1, 2"},
    {k:"goals", label:"Goals", tier:0, sub:"Over 1.5", tierMax:2, subMax:"Over 2.5"},
    {k:"both", label:"Both score", tier:2, sub:"GG"}
  ];
  (function(){
    var lg=$("bldLeagues"),mkw=$("bldMk"); if(!lg||!mkw) return;
    lg.querySelectorAll("[data-btp]").forEach(function(c){c.classList.toggle("on",(c.dataset.btp==="true")===!!TOP_ONLY);});
    // Render unified market palette
    var html=MKT_CFG.map(function(m){
      var enabled=BUILD.mk[m.k]!==false;
      var locked=p.tier < m.tier;
      var tierLabel=["Safe","Balanced","Risky"][m.tier];
      var subLabel=m.sub;
      if(m.tierMax!==undefined && p.tier >= m.tierMax){
        tierLabel=["Safe","Balanced","Risky"][m.tierMax];
        subLabel=m.subMax;
      }
      var unlockClass=(window._prevTier!==undefined && p.tier > window._prevTier && p.tier >= m.tier && window._prevTier < m.tier) ? " unlocking" : "";
      return "<button class='mkt-chip"+(enabled?" on":"")+(locked?" locked":"")+unlockClass+"' data-m='"+m.k+"' "+(locked?"disabled":"")+" type='button'>"+
        "<span>"+m.label+"</span>"+
        "<span class='tier-badge' title='Unlocks at "+tierLabel+" tier'>T"+(m.tier+1)+"</span>"+
        "</button>";
    }).join("");
    mkw.innerHTML=html;
    // Click handlers
    mkw.querySelectorAll("[data-m]").forEach(function(c){
      c.addEventListener("click",function(){
        var k=c.dataset.m;
        var on=Object.keys(BUILD.mk).filter(function(x){return BUILD.mk[x];});
        if(BUILD.mk[k]&&on.length===1) return;
        BUILD.mk[k]=!BUILD.mk[k];
        renderBuilder();
      });
    });
    // Remember tier for unlock animation next render
    window._prevTier=p.tier;
  })();
  // Default slider position for first visit (visual only, not "touched")
  var displayRisk = firstVisit ? 45 : BUILD.risk;
  $("risk").value=displayRisk;
  $("riskName").textContent=firstVisit ? "\u2014" : riskWord(BUILD.risk);
  var picks = firstVisit ? [] : buildPicks();
  $("riskSub").textContent=firstVisit ? "Move slider to build" : (picks.length+" game"+(picks.length===1?"":"s")+
    " \u00b7 "+P0(p.minConf)+"%+ confidence");
  // markets chips - now rendered in unified palette above
  // Stats. Total odds reads as the third figure here rather than as its own
  // block down in the footer: the grid was already three columns wide with a
  // .stat.odds rule waiting on it, and since renderBuilder runs on every
  // slider tick the payout previews live while you drag.
  var odds=totalOdds(picks);
  var real=oddsAreReal(picks), pre=real?"\u00d7":"~\u00d7";
  var avg=picks.length?picks.reduce(function(t,c){return t+c.p;},0)/picks.length:0;
  $("bldStats").innerHTML=
    "<div class='stat'><b>"+picks.length+"</b><i>Games</i></div>"+
    "<div class='stat'><b>"+(picks.length?P0(avg)+"%":"-")+"</b><i>Avg confidence</i></div>"+
    "<div class='stat odds'><b id='totOdds'>"+(picks.length?pre+odds.toFixed(2):"-")+"</b>"+
      "<i>Total odds"+(picks.length&&!real?" (est.)":"")+"</i></div>";
  // The bubble under the thumb spends its width on the two figures that move
  // as you drag; the risk word is already named above the slider and on the
  // ticks below it, so repeating it there earned nothing.
  var _rb=$("riskBubble");
  if(_rb){ _rb.style.left="calc("+displayRisk+"% + "+(13-displayRisk*0.26)+"px)";
    _rb.textContent=firstVisit ? "\u2014" : (picks.length
      ? picks.length+" game"+(picks.length===1?"":"s")
      : "No games"); }
  // slip rows
  if(!picks.length){
    var dry=(SCOPE==="day")&&!scopeFixtures().length;
    $("slip").innerHTML="<div class='bld-empty'><b>Nothing in your slip</b>"+
      (dry?"No fixtures left today - switch to All upcoming to keep building."
         : (firstVisit ? "Move the slider to build a fresh set of games." : "No games match \u2014 adjust risk or markets."))+"</div>";
  } else {
    $("slip").innerHTML=picks.map(function(c){
      var f=c.f, cf=conf(c.p);
      return "<div class='sp-row conf-"+cf+"'>"+
        "<div class='sp-main'><div class='sp-teams'>"+esc(f.home)+" v "+esc(f.away)+
          (c.eventId?"":"<span class='sp-noid' title='Not on SportyBet yet - can&apos;t auto-book'>no ID</span>")+"</div>"+
          "<div class='sp-meta'>"+compOf(f.league)+" \u00b7 "+dayName(dayOff(f.date))+" "+kickTime(f)+"</div></div>"+
        "<div class='sp-pick'><b>"+mLabel(f,c.code)+"</b><i>"+P0(c.p)+"%</i></div>"+
        "<span class='sp-odd'>"+legOdd(c.f,c.code,c.p).toFixed(2)+"</span>"+
        "<button class='sp-x' data-rm='"+c.id+"' aria-label='Remove'>"+XSVG+"</button>"+
      "</div>";
    }).join("");
    $("slip").querySelectorAll("[data-rm]").forEach(function(b){
      b.addEventListener("click",function(){BUILD.removed[b.dataset.rm]=1;renderBuilder();});});
  }
  // one slip: keep manual picks, refresh the builder-generated ones (only after the user engages the slider)
  if(BUILD.touched){
    MYSLIP=MYSLIP.filter(function(x){return !x.auto;})
      .concat(picks.map(function(c){return {id:c.id,code:c.code,label:mLabel(c.f,c.code),p:c.p,auto:true};}));
    var _seen={}; MYSLIP=MYSLIP.filter(function(x){if(_seen[x.id])return false;_seen[x.id]=1;return true;});
    saveMy(); renderFab();
  }
  var bookable=picks.filter(function(c){return c.eventId;}).length;
  var btn=$("bookBtn");
  btn.disabled=BUILD.booking||!bookable;
  btn.textContent=BUILD.booking?"Booking\u2026":"Get code";
  // Hide footer actions when slip is empty
  var foot=$("bldFoot");
  if(foot) foot.style.display = picks.length ? "flex" : "none";
  var note=$("bldNote");
  if(!picks.length) note.textContent="";
  else if(!bookable) note.textContent="These fixtures have no SportyBet event ID yet, so they can't be booked automatically.";
  else if(bookable<picks.length) note.textContent=bookable+" of "+picks.length+" games are on SportyBet right now - you can book those and skip the rest.";
  else note.textContent="Booking "+bookable+" selection"+(bookable===1?"":"s")+" to SportyBet.";
}
function bookSlip(){
  var bookable=BUILD.picks.filter(function(c){return c.eventId;});
  var missing=BUILD.picks.filter(function(c){return !c.eventId;});
  if(!bookable.length){
    $("bookResult").innerHTML="<div class='code-err'>None of these games are on "+
      "SportyBet right now, so a code can't be created. Try lowering the risk, or "+
      "check back nearer kickoff.</div>";
    return;
  }
  if(missing.length){
    $("bookResult").innerHTML="<div class='confirm-card'><p>"+missing.length+
      " game"+(missing.length===1?" isn't":"s aren't")+" available on SportyBet yet. "+
      "Book the other "+bookable.length+" without "+(missing.length===1?"it":"them")+"?</p>"+
      "<div class='ca'><button class='confirm-go' type='button'>Book "+bookable.length+
      " game"+(bookable.length===1?"":"s")+"</button>"+
      "<button class='confirm-cancel' type='button'>Cancel</button></div></div>";
    $("bookResult").querySelector(".confirm-go").addEventListener("click",function(){doBook(bookable);});
    $("bookResult").querySelector(".confirm-cancel").addEventListener("click",function(){$("bookResult").innerHTML="";});
    return;
  }
  doBook(bookable);
}
function doBook(picks){
  var sel=picks.map(function(c){return {eventId:c.eventId,prediction:c.code};});
  if(!sel.length) return;
  BUILD.booking=true; renderBuilder();
  $("bookResult").innerHTML="";
  fetch(BOOK_URL,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({selections:sel})})
    .then(function(r){return r.json();})
    .then(function(d){
      BUILD.booking=false; renderBuilder();
      if(d&&d.success&&d.booking_code){
        showCode(d.booking_code,"bookResult");
      } else {
        var why=d&&d.detail?(typeof d.detail==="string"?d.detail:JSON.stringify(d.detail)):(d&&d.message?d.message:"");
        $("bookResult").innerHTML="<div class='code-err'>Couldn't generate a code"+
          (why?": "+esc(why):"")+". Please try again.</div>";
      }
    })
    .catch(function(){
      BUILD.booking=false; renderBuilder();
      $("bookResult").innerHTML="<div class='code-err'>Couldn't reach the booking "+
        "service. Check your connection and try again.</div>";
    });
}
function clearSlip(){
  BUILD.picks.forEach(function(c){BUILD.removed[c.id]=1;});
  $("bookResult").innerHTML="";
  var to=$("totOdds"); if(to) to.textContent="-";
  renderBuilder();
}
/* ---- shared booking-code card, share + copy + open ---- */
function showCode(code,hostId){
  var host=$(hostId); if(!host) return;
  host.innerHTML="<div class='code-card'>"+
    "<button class='code-x' type='button' aria-label='Close'>"+
      "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' aria-hidden='true'><path d='M6 6l12 12M18 6L6 18'/></svg></button>"+
    "<i>Your SportyBet booking code</i>"+
    "<b>"+esc(code)+"</b>"+
    "<div class='code-acts'>"+
      "<button class='code-copy' type='button'>Copy code</button>"+
      "<button class='share-btn' type='button' data-sh='1'>\u2197 Share</button>"+
      "<a class='code-open' href='"+SPORTY_URL+encodeURIComponent(code)+
        "' target='_blank' rel='noopener'>Open in SportyBet</a>"+
    "</div></div>";
  host.querySelector(".code-x").addEventListener("click",function(){host.innerHTML="";});
  host.querySelector(".code-copy").addEventListener("click",function(){
    if(navigator.clipboard) navigator.clipboard.writeText(code);
    this.textContent="Copied"; var s=this;
    setTimeout(function(){s.textContent="Copy code";},1600);});
  host.querySelector("[data-sh]").addEventListener("click",function(){shareCode(code);});
}
function shareText(picks,odds,code){
  var lines=picks.slice(0,6).map(function(c){return "\u2022 "+c.f.home+" v "+c.f.away+" - "+
    mLabel(c.f,c.code).replace(/<[^>]+>/g,"")+" ("+P0(c.p)+"%)";});
  var t="\u26bd My SoccerWizard slip - "+picks.length+" games @ \u00d7"+odds.toFixed(2)+"\n"+lines.join("\n");
  if(code) t+="\n\nSportyBet code: "+code;
  return t;
}
function doShare(text,url){
  if(navigator.share){ navigator.share({title:"SoccerWizard slip",text:text,url:url}).catch(function(){}); }
  else if(navigator.clipboard){ navigator.clipboard.writeText(text+(url?"\n"+url:""));
    alert("Slip copied - paste it anywhere to share."); }
}
function shareSlip(picks,odds){ doShare(shareText(picks,odds,null),location.href); }
function shareCode(code){ doShare("\u26bd My SoccerWizard SportyBet slip. Code: "+code, SPORTY_URL+encodeURIComponent(code)); }
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
/* Book-all: turns every tip currently on the board into one SportyBet slip.
   It reuses the same picks the cards show, so what you see is what gets booked,
   and it asks first because a 20-leg acca is not something to fire by accident. */
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
  var bookable=picks.filter(function(c){return c.eventId;});
  btn.classList.toggle("show",bookable.length>=2);
  var n=$("bookAllN"); if(n) n.textContent=bookable.length;
}
function confirmBookAll(){
  var picks=bookAllPicks();
  var bookable=picks.filter(function(c){return c.eventId;});
  var host=$("bookAllResult"); if(!host) return;
  if(!bookable.length){
    host.innerHTML="<div class='code-err'>None of these games are on SportyBet right now.</div>";
    return;
  }
  var odds=bookable.reduce(function(t,c){return t*legOdd(c.f,c.code,c.p);},1);
  var skipped=picks.length-bookable.length;
  /* SportyBet caps a slip at 50 selections. Rather than silently truncating,
     say what will happen and point at the slip sheet, where trimming is easy. */
  var CAP=50, over=bookable.length>CAP;
  var going=over?bookable.slice(0,CAP):bookable;
  var goingOdds=going.reduce(function(t,c){return t*legOdd(c.f,c.code,c.p);},1);
  host.innerHTML="<div class='confirm-card'><p>Book all <b>"+bookable.length+
    "</b> Soccerwizard tips on this page as one slip?<br><span style='font-weight:600;color:var(--soft)'>"+
    "Estimated odds \u00d7"+(over?goingOdds:odds).toFixed(2)+
    (skipped?" \u00b7 "+skipped+" not on SportyBet yet, skipped":"")+
    "</span></p>"+
    (over?"<div class='cap-warn'><b>SportyBet only takes 50 games per slip.</b>"+
      "The first "+CAP+" will be loaded and the last "+(bookable.length-CAP)+
      " left off. To choose which ones make it, open <b>My slip</b> and remove a few first.</div>":"")+
    "<div class='ca'>"+
    "<button class='confirm-go' type='button'>"+(over?"Book first "+CAP:"Book all "+bookable.length)+"</button>"+
    "<button class='confirm-trim' type='button'>Review &amp; trim</button>"+
    "<button class='confirm-cancel' type='button'>Cancel</button></div></div>";
  function fillSlip(){
    MYSLIP=MYSLIP.filter(function(x){return !x.auto;})
      .concat(bookable.map(function(c){return {id:c.id,code:c.code,label:mLabel(c.f,c.code),p:c.p,auto:true};}));
    var seen={}; MYSLIP=MYSLIP.filter(function(x){if(seen[x.id])return false;seen[x.id]=1;return true;});
    saveMy(); renderFab();
  }
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

function doBookList(picks,resultId,btnId,label){
  var sel=picks.map(function(c){return {eventId:c.eventId,prediction:c.code};});
  if(!sel.length) return;
  var btn=$(btnId); if(btn){btn.disabled=true;btn.textContent="Booking\u2026";}
  $(resultId).innerHTML="";
  fetch(BOOK_URL,{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({selections:sel})})
    .then(function(r){return r.json();})
    .then(function(d){
      if(btn){btn.disabled=false;btn.textContent=label;}
      if(d&&d.success&&d.booking_code) showCode(d.booking_code,resultId);
      else{var why=d&&d.detail?(typeof d.detail==="string"?d.detail:JSON.stringify(d.detail)):(d&&d.message?d.message:"");
        $(resultId).innerHTML="<div class='code-err'>Couldn't generate a code"+(why?": "+esc(why):"")+".</div>";}
    })
    .catch(function(){ if(btn){btn.disabled=false;btn.textContent=label;}
      $(resultId).innerHTML="<div class='code-err'>Couldn't reach the booking service.</div>"; });
}
/* ---- Slip of the Day: safe pre-built acca ---- */
var SOTD=[];
function renderSlipOfDay(){
  var host=$("sotd"); if(!host) return;
  var games=onDay(); if(!games.length) games=ahead();
  var allowed=["1X","X2","OVER_1.5","1","2"], cand=[];
  games.forEach(function(f){
    var best=null;
    allowed.forEach(function(c){var v=mProb(f,c);
      if(v==null||isNaN(v)||v<0.70)return; if(!best||v>best.p)best={code:c,p:v};});
    if(best) cand.push({f:f,id:fid(f),code:best.code,p:best.p,eventId:f.eventId||null});
  });
  cand.sort(function(a,b){return b.p-a.p;});
  SOTD=cand.slice(0,4);
  if(SOTD.length<2){host.innerHTML="";return;}
  var odds=SOTD.reduce(function(t,c){return t*legOdd(c.f,c.code,c.p);},1);
  var bookable=SOTD.filter(function(c){return c.eventId;}).length;
  host.innerHTML=
    "<section class='sotd'>"+
      "<div class='sotd-top'><svg width='15' height='15' viewBox='0 0 24 24' fill='currentColor'>"+
        "<path d='M12 2l2.4 6.9 7.1.4-5.5 4.6 1.8 7-5.8-4-5.8 4 1.8-7L2.5 9.3l7.1-.4z'/></svg>"+
        "<b>Slip of the day</b><span class='k'>"+SOTD.length+" bankers</span></div>"+
      "<h2>The safest slip today</h2>"+
      "<p class='sub'>Our highest-confidence picks, combined into one bet - no building needed.</p>"+
      "<div class='sotd-legs'>"+SOTD.map(function(c){
        return "<div class='sotd-leg'><span class='lg-t'>"+esc(c.f.home)+" v "+esc(c.f.away)+
          "</span><span class='lg-p'>"+mLabel(c.f,c.code)+"</span><span class='lg-c'>"+P0(c.p)+"%</span></div>";
      }).join("")+"</div>"+
      "<div class='sotd-foot'><div class='sotd-odds'><i>Est. odds*</i><b>~\u00d7"+odds.toFixed(2)+"</b></div>"+
        "<button class='share-btn' id='sotdShare'>\u2197 Share</button>"+
        "<button class='sotd-btn' id='sotdBook'"+(bookable?"":" disabled")+">Book this slip</button></div>"+
      "<div class='bld-note' id='sotdNote'></div><div id='sotdResult'></div>"+
      renderNotif()+
    "</section>";
  $("sotdBook").addEventListener("click",function(){bookList(SOTD,"sotdResult","sotdBook","Book this slip");});
  $("sotdShare").addEventListener("click",function(){shareSlip(SOTD,odds);});
  wireNotif();
  var note=$("sotdNote");
  if(!bookable) note.textContent="Booking opens when these games are live on SportyBet.";
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
  if(streak>=2){el.hidden=false;el.className="streak";
    el.innerHTML="<b>\ud83d\udd25 "+streak+"-day streak</b>";}
  else el.hidden=true;
}
/* ---- Accuracy record (renders only with real data) ---- */
function renderRecord(){
  var host=$("record"); if(!host) return;
  var rec=DATA.record;
  if(!rec||!rec.total){host.innerHTML="";return;}
  var pct=Math.round(100*rec.correct/rec.total);
  /* This is the one claim no rival tips site makes: a graded, calibrated
     history. It gets a real panel - the count, the hit rate, how well the
     stated confidence matched reality, and yesterday - because it is the
     reason to trust every other number on the page. */
  var b=rec.brier;
  var cal=(b==null)?null:(b<=0.18?"Excellent":b<=0.21?"Good":b<=0.24?"Fair":"Rough");
  var yest=DATA.recordYest;
  host.innerHTML=
    "<div class='rec-panel'>"+
      "<div class='rec-head'><b>Our record, graded honestly</b>"+
        "<span>every tip checked against the result</span></div>"+
      "<div class='rec-grid'>"+
        "<div class='rec-cell'><b class='pc'>"+pct+"%</b><i>hit rate</i></div>"+
        "<div class='rec-cell'><b>"+rec.correct+"/"+rec.total+"</b><i>tips landed"+
          (rec.days?" \u00b7 "+rec.days+"d":"")+"</i></div>"+
        (cal?"<div class='rec-cell'><b>"+cal+"</b><i>calibration</i></div>":"")+
        (yest&&yest.total?"<div class='rec-cell'><b>"+yest.correct+"/"+yest.total+
          "</b><i>yesterday</i></div>":"")+
      "</div>"+
      "<div class='rec-bar'><i style='width:"+pct+"%'></i></div>"+
      "<div class='rec-foot'>"+(cal?"When we say 70%, it lands near 70% - ":"")+
        "measured on games the model had not seen.</div>"+
    "</div>";
}
/* ---- Notifications opt-in ---- */
function renderNotif(host){
  if(!("Notification" in window)) return "";
  return "<div class='notif'><span>Never miss the daily slip.</span>"+
    "<button id='notifBtn' type='button'></button></div>";
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
      if(p==="granted"){try{new Notification("SoccerWizard",{body:"Great - we'll nudge you when a fresh slip lands."});}catch(e){}}
    });
  });
}
/* ============================================================ live scores */
const LIVE_URL="https://web-production-798c0.up.railway.app/api/livescores";
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
function tipEval(f){
  var t=f.tip||"";
  return function(h,a){
    var tot=h+a, both=h>0&&a>0;
    function res(ok){return ok?"win":"lose";}
    if(t==="Home win") return h>a?"win":(h===a?"level":"lose");
    if(t==="Away win") return a>h?"win":(a===h?"level":"lose");
    if(t==="Draw") return h===a?"win":"lose";
    if(t==="Both teams score") return res(both);
    if(t==="First half goal") return res(tot>0);
    if(t.indexOf("1X")===0) return h>=a?"win":"lose";
    if(t.indexOf("X2")===0) return a>=h?"win":"lose";
    if(t.indexOf("12")===0) return h!==a?"win":"lose";
    if(t.indexOf("Draw or over")===0) return res(h===a||tot>2);
    if(t.indexOf("Draw or both")===0) return res(h===a||both);
    if(t.indexOf("Both score and")===0) return res(both&&tot>2);
    return res(tot>=2);
  };
}
function matchPrediction(lm){
  var best=null,bs=0;
  DATA.fixtures.forEach(function(f){
    var o=dayOff(f.date); if(o< -1||o>1) return;
    var s=simTeams(f.home,lm.home)+simTeams(f.away,lm.away);
    if(s>bs){bs=s;best=f;}
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
  syncLiveDots();
  renderLiveStrip();
  if(document.documentElement.classList.contains("mode-live")) renderLive();
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
function renderFab(){var fab=$("myFab"); if(!fab) return; fab.hidden=MYSLIP.length===0;
  var c=$("myFabC"); if(c) c.textContent=MYSLIP.length;}
function clearMy(){
  MYSLIP=[]; saveMy(); renderFab();
  var mo=$("myTotOdds"); if(mo) mo.textContent="-";
  document.querySelectorAll("[data-add].on").forEach(function(b){b.classList.remove("on");b.textContent="+";});
  $("myBookResult").innerHTML=""; renderMySheet();
}
function flyToSlip(srcEl){
  try{
    if(REDUCED||!srcEl)return;
    var fab=$("myFab"); if(!fab)return;
    var s=srcEl.getBoundingClientRect(), f=fab.getBoundingClientRect();
    var chip=document.createElement("div"); chip.className="fly-chip"; chip.textContent="+1";
    chip.style.left=s.left+"px"; chip.style.top=s.top+"px";
    document.body.appendChild(chip);
    requestAnimationFrame(function(){
      chip.style.transform="translate("+(f.left-s.left+f.width/2)+"px,"+(f.top-s.top)+"px) scale(.4)";
      chip.style.opacity="0";});
    setTimeout(function(){chip.remove();
      fab.classList.remove("pop"); void fab.offsetWidth; fab.classList.add("pop");},560);
  }catch(e){}
}
function toggleMy(id,code,label,p,srcEl){
  var i=-1; for(var k=0;k<MYSLIP.length;k++){if(MYSLIP[k].id===id&&MYSLIP[k].code===code){i=k;break;}}
  if(i>=0) MYSLIP.splice(i,1); else { MYSLIP.push({id:id,code:code,label:label,p:+p}); flyToSlip(srcEl); }
  saveMy(); renderFab();
  document.querySelectorAll("[data-add='"+id+"'][data-code='"+code+"']").forEach(function(b){
    var on=myslipHas(id,code); b.classList.toggle("on",on);
    if(b.classList.contains("m-add")){var ic=b.querySelector(".ma-ic"); if(ic)ic.innerHTML=on?CHK:PLUS; if(b.lastChild)b.lastChild.textContent=on?" Added":" Add to slip";}
    else b.textContent=on?"\u2713":"+";});
  if($("mySheet")&&$("mySheet").classList.contains("on")) renderMySheet();
}
function openMySheet(){renderMySheet();$("scrim").classList.add("on");$("mySheet").classList.add("on");pushOverlay();}
function closeMySheet(){$("scrim").classList.remove("on");$("mySheet").classList.remove("on");}
function renderMySheet(){
  var body=$("mySheetBody"); if(!body) return;
  MYSLIP=MYSLIP.filter(function(x){var f=fixtureById(x.id);return !f||notStarted(f);});
  var _b=MYSLIP.length;
  MYSLIP=MYSLIP.filter(function(x){var f=fixtureById(x.id);return f&&isUpcoming(f);});
  if(MYSLIP.length!==_b){saveMy();renderFab();}
  if(!MYSLIP.length){
    body.innerHTML="<div class='bld-empty'><b>Your slip is empty</b>Tap + on any prediction to add it here.</div>";
    $("mySheetFoot").hidden=true; $("myBookResult").innerHTML=""; return;
  }
  $("mySheetFoot").hidden=false;
  body.innerHTML=MYSLIP.map(function(x){
    var f=fixtureById(x.id);
    var teams=f?esc(f.home)+" v "+esc(f.away):"Match";
    var noid=(f&&f.eventId)?"":"<span class='sp-noid' title='Not on SportyBet yet - can&apos;t auto-book'>no ID</span>";
    return "<div class='sp-row'>"+
      "<div class='sp-main'><div class='sp-teams'>"+teams+noid+"</div>"+
        "<div class='sp-meta'>"+esc(x.label)+"</div></div>"+
      "<div class='sp-pick'><i>"+P0(x.p)+"%</i></div>"+
      "<span class='sp-odd'>"+(x.p>0?legOdd(fixtureById(x.id),x.code,x.p).toFixed(2):"-")+"</span>"+
      "<button class='sp-x' data-myrm='"+x.id+"|"+x.code+"' aria-label='Remove'>"+XSVG+"</button>"+
    "</div>";
  }).join("");
  $("myTotOdds").textContent="\u00d7"+myOdds().toFixed(2);
  body.querySelectorAll("[data-myrm]").forEach(function(b){
    b.addEventListener("click",function(){var p=b.dataset.myrm.split("|"); toggleMy(p[0],p[1]);});});
}
function bookMy(){
  MYSLIP=MYSLIP.filter(function(x){var f=fixtureById(x.id);return !f||notStarted(f);});
  var picks=MYSLIP.map(function(x){var f=fixtureById(x.id);return {code:x.code,eventId:(f&&f.eventId)||null};});
  var bookable=picks.filter(function(c){return c.eventId;});
  var missing=picks.filter(function(c){return !c.eventId;});
  if(!bookable.length){$("myBookResult").innerHTML="<div class='code-err'>None of these are on SportyBet right now, so a code can't be created.</div>";return;}
  var byEv={},dups=0;
  bookable.forEach(function(c){byEv[c.eventId]=(byEv[c.eventId]||0)+1;if(byEv[c.eventId]===2)dups++;});
  if(dups){
    var uniq=[],seenEv={};
    bookable.forEach(function(c){if(!seenEv[c.eventId]){seenEv[c.eventId]=1;uniq.push(c);}});
    $("myBookResult").innerHTML="<div class='confirm-card'><p>You have the same match picked more than once. SportyBet takes one pick per match - book "+uniq.length+" unique game"+(uniq.length===1?"":"s")+"?</p><div class='ca'><button class='confirm-go' type='button'>Book "+uniq.length+"</button><button class='confirm-cancel' type='button'>Cancel</button></div></div>";
    $("myBookResult").querySelector(".confirm-go").addEventListener("click",function(){doBookMy(uniq);});
    $("myBookResult").querySelector(".confirm-cancel").addEventListener("click",function(){$("myBookResult").innerHTML="";});
    return;
  }
  if(missing.length){
    $("myBookResult").innerHTML="<div class='confirm-card'><p>"+missing.length+" game"+(missing.length===1?" isn't":"s aren't")+" available on SportyBet yet. Book the other "+bookable.length+"?</p><div class='ca'><button class='confirm-go' type='button'>Book "+bookable.length+"</button><button class='confirm-cancel' type='button'>Cancel</button></div></div>";
    $("myBookResult").querySelector(".confirm-go").addEventListener("click",function(){doBookMy(bookable);});
    $("myBookResult").querySelector(".confirm-cancel").addEventListener("click",function(){$("myBookResult").innerHTML="";});
    return;
  }
  doBookMy(bookable);
}
function doBookMy(bookable){
  var sel=bookable.map(function(c){return {eventId:c.eventId,prediction:c.code};});
  var btn=$("myBookBtn"); if(btn){btn.disabled=true;btn.textContent="Booking\u2026";}
  $("myBookResult").innerHTML="";
  fetch(BOOK_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({selections:sel})})
    .then(function(r){return r.json();}).then(function(d){
      if(btn){btn.disabled=false;btn.textContent="Get code";}
      if(d&&d.success&&d.booking_code) showCode(d.booking_code,"myBookResult");
      else{var why=d&&d.detail?(typeof d.detail==="string"?d.detail:JSON.stringify(d.detail)):(d&&d.message?d.message:"");
        $("myBookResult").innerHTML="<div class='code-err'>Couldn't generate a code"+(why?": "+esc(why):"")+".</div>";}
    }).catch(function(){if(btn){btn.disabled=false;btn.textContent="Get code";}
      $("myBookResult").innerHTML="<div class='code-err'>Couldn't reach the booking service.</div>";});
}
document.addEventListener("click",function(e){
  var a=e.target.closest&&e.target.closest("[data-add]");
  if(a){e.preventDefault();e.stopPropagation();
    toggleMy(a.dataset.add,a.dataset.code,a.dataset.label,a.dataset.p,a);}
});
function setView(v){
  var root=document.documentElement;
  root.classList.toggle("mode-build",v==="build");
  root.classList.toggle("mode-live",v==="live");
  /* mode-pred drives the phone-only rule that keeps the Live tab in the header
     on the home page. Without it that CSS never fires and the nav stays hidden. */
  root.classList.toggle("mode-pred",v==="pred");
  $("tab-pred").classList.toggle("on",v==="pred");
  $("tab-live").classList.toggle("on",v==="live");
  $("tab-build").classList.toggle("on",v==="build");
  var bp=$("bt-pred"),bl=$("bt-live"),bb=$("bt-build");
  if(bp)bp.classList.toggle("on",v==="pred");
  if(bl)bl.classList.toggle("on",v==="live");
  if(bb)bb.classList.toggle("on",v==="build");
  /* A tab for the page you are already on is only ever a way back, so it is
     not drawn at all - that goes for Live scores and Build too, not just
     Predictions, and it is what keeps the header from crowding the wordmark on
     a narrow screen. The bottom bar still carries all three. */
  var tp=$("tab-pred"); if(tp){ if(tp.childNodes[0]) tp.childNodes[0].nodeValue="Home"; }
  [["tab-pred","pred"],["tab-live","live"],["tab-build","build"]].forEach(function(t){
    var el=$(t[0]); if(el) el.classList.toggle("hide-tab",v===t[1]);
  });
  syncLiveDots();
  if(v==="build") renderBuilder();
  if(v==="live"){ renderLive(); fetchLive(); }
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
$("bt-pred").addEventListener("click",function(){setView("pred");});
$("bt-live").addEventListener("click",function(){setView("live");});
$("bt-build").addEventListener("click",function(){setView("build");});
$("logo").addEventListener("click",function(e){e.preventDefault();setView("pred");});
if($("slipCta"))$("slipCta").addEventListener("click",function(){setView("build");});
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
document.addEventListener("click",function(e){
  var b=e.target.closest(".more-collapse"); if(!b) return;
  e.stopPropagation();
  var sh=b.closest(".sheet"); if(sh){var x=sh.querySelector(".sheet-x"); if(x)x.click(); return;}
  var row=b.closest(".lrow"); if(row){if(window.LOPEN)LOPEN[row.dataset.lf]=false;row.classList.remove("open"); return;}
  var card=b.closest(".m"); if(card)card.classList.remove("open");
});
/* ---- Wizard's Special jackpot builder ---- */
var WSP={odds:500,legodd:1.35,mk:{doubles:true,out:true,goals:true,both:true},seed:Math.floor(Math.random()*1e6),shuffles:0};
function wspMarkets(){var m=[];if(WSP.mk.doubles)m=m.concat(["1X","X2"]);if(WSP.mk.out)m=m.concat(["1","2"]);if(WSP.mk.goals)m=m.concat(["OVER_1.5","OVER_2.5"]);if(WSP.mk.both)m.push("GG");return m;}
function wspBuild(){
  var allowed=wspMarkets(),all=[];
  var seed=WSP.seed||0, shuffles=WSP.shuffles||0;
  function h32(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967296;}
  scopeFixtures().forEach(function(f){
    if(TOP_ONLY && isLowerLeague(f.league)) return;
    var homeFav=f.home_p>f.away_p,best=null;
    allowed.forEach(function(c){
      if(c==="1"&&!homeFav)return; if(c==="2"&&homeFav)return;
      if(c==="1X"&&!homeFav)return; if(c==="X2"&&homeFav)return;
      var v=mProb(f,c); if(v==null||isNaN(v)||v<0.5)return;
      if(!best||v>best.p) best={f:f,id:fid(f),code:c,p:v,od:legOdd(f,c,v)};
    });
    if(best)all.push(best);
  });
  // Seed jitter so each shuffle surfaces a different mix; SA penalty keeps
  // Europe ahead even once South America is allowed into the pool.
  function key(c){return c.p*(1+(h32(c.id+"|"+seed)-0.5)*1.15);}
  function ranked(list,pen){return list.slice().sort(function(a,b){
    return key(b)*(isSouthAmerican(b.f)?pen:1)-key(a)*(isSouthAmerican(a.f)?pen:1);});}
  function accumulate(list){
    /* Spread the risk: reach the target with MORE legs at modest odds rather
       than a few long shots. We aim for a per-leg odds of ~1.5 (about 65-70%
       each), derive how many legs that needs for the target, then pick the
       legs whose odds sit closest to that mark. Bigger target -> more legs,
       not riskier games. Top up with the biggest remaining odds only if short. */
    var T=WSP.odds, cap=40, per=WSP.legodd||1.35;
    var want=Math.max(4, Math.min(cap, Math.ceil(Math.log(T)/Math.log(per))));
    var g=Math.pow(T,1/want);
    var ranked=list.slice().sort(function(a,b){
      return Math.abs(Math.log(a.od)-Math.log(g))-Math.abs(Math.log(b.od)-Math.log(g));});
    var picks=[],used={},prod=1;
    for(var i=0;i<ranked.length&&picks.length<want;i++){
      var c=ranked[i]; used[c.id]=1; picks.push(c); prod*=c.od;
    }
    if(prod<T){
      var rest=list.filter(function(c){return !used[c.id];}).sort(function(a,b){return b.od-a.od;});
      for(var j=0;j<rest.length&&picks.length<cap&&prod<T;j++){
        used[rest[j].id]=1; picks.push(rest[j]); prod*=rest[j].od;
      }
    }
    return {picks:picks,odds:prod};
  }
  var euro=all.filter(function(c){return !isSouthAmerican(c.f);});
  /* Same policy as the slider builder: Europe alone unless there are too few
     European games to make a slip, or the user has reshuffled a couple of
     times. "fill" keeps Europe ahead with a light penalty; "mix" (shuffling)
     lets more South America through. A high payout Europe can't reach is not
     a reason to reach for South America - the slip just falls short, and the
     user can shuffle if they want to chase it with a wider net. */
  var saMode=(euro.length<SA_MIN_EURO)?"fill":(shuffles>=2?"mix":"exclude");
  var pool=(saMode==="exclude")?ranked(euro,1):ranked(all,saMode==="mix"?0.6:0.85);
  return accumulate(pool);
}
// --- Wizard panel rendering (replaces renderWsp) ---
function renderWizardPanel(){
  var odds=[50,100,500,1000,2000,6000];
  var styles=[[1.25,"Safer, more games"],[1.4,"Balanced"],[1.7,"Fewer, bigger games"]];
  var mk=[["doubles","Safe doubles"],["out","Outright wins"],["goals","Goals"],["both","Both score"]];
  var html="";
  html += "<div class='wsp-lbl'>Target payout</div><div class='wsp-chips' id='wspOddsChips'>"+
    odds.map(function(o){return "<button class='wsp-chip"+(WSP.odds===o?" on":"")+"' data-o='"+o+"'>\u00d7"+o+"</button>";}).join("")+"</div>";
  html += "<div class='wsp-lbl'>Slip style</div><div class='wsp-chips' id='wspStyleChips'>"+
    styles.map(function(st){return "<button class='wsp-chip"+(WSP.legodd===st[0]?" on":"")+"' data-lo='"+st[0]+"'>"+st[1]+"</button>";}).join("")+"</div>";
  html += "<div class='wsp-acts'>"+
    "<button class='clear-btn wsp-shuffle' id='wspShuffle' type='button'>\u21bb Shuffle</button>"+
    "<button class='book-btn wsp-go' id='wspGo' type='button'>\u2728 Conjure</button>"+
    "</div>";
  $("wizardPanel").innerHTML=html;
  // Event listeners
  $("wspOddsChips").querySelectorAll("[data-o]").forEach(function(c){
    c.addEventListener("click",function(){WSP.odds=+c.dataset.o;renderWizardPanel();});
  });
  $("wspStyleChips").querySelectorAll("[data-lo]").forEach(function(c){
    c.addEventListener("click",function(){WSP.legodd=+c.dataset.lo;renderWizardPanel();});
  });
  $("wspShuffle").addEventListener("click",function(){
    WSP.seed=Math.floor(Math.random()*1e6);WSP.shuffles=(WSP.shuffles||0)+1;
    renderWizardPanel();
    window.swToast&&window.swToast("Reshuffled","ok","shuffle");
  });
  $("wspGo").addEventListener("click",function(){wspConjure(false);});
}
function wspConjure(shuffle){
  if(shuffle){WSP.seed=Math.floor(Math.random()*1e6);WSP.shuffles=(WSP.shuffles||0)+1;}
  var r=wspBuild();
  if(!r.picks.length){window.swToast&&window.swToast("No games to conjure right now","err");return;}
  MYSLIP=MYSLIP.filter(function(x){return !x.auto;})
    .concat(r.picks.map(function(c){return {id:c.id,code:c.code,label:mLabel(c.f,c.code),p:c.p,auto:true};}));
  var seen={};MYSLIP=MYSLIP.filter(function(x){if(seen[x.id])return false;seen[x.id]=1;return true;});
  saveMy();renderFab();openMySheet();
  window.__wizChime&&window.__wizChime();
  window.swToast&&window.swToast((shuffle?"Reshuffled - ":"Conjured ")+r.picks.length+" games \u00b7 ~\u00d7"+r.odds.toFixed(0),"ok");
}

// --- Mode toggle + renderBuilder dispatcher ---
function renderBuilder(){
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
  var MKT_CFG=[
    {k:"dc", label:"Double chance", tier:0, sub:"1X, X2, 12"},
    {k:"out", label:"Outright wins", tier:1, sub:"1, 2"},
    {k:"goals", label:"Goals", tier:0, sub:"Over 1.5", tierMax:2, subMax:"Over 2.5"},
    {k:"both", label:"Both score", tier:2, sub:"GG"}
  ];
  (function(){
    var lg=$("bldLeagues"),mkw=$("bldMk"); if(!lg||!mkw) return;
    lg.querySelectorAll("[data-btp]").forEach(function(c){c.classList.toggle("on",(c.dataset.btp==="true")===!!TOP_ONLY);});
    var html=MKT_CFG.map(function(m){
      var enabled=BUILD.mk[m.k]!==false;
      var locked=p.tier < m.tier;
      var tierLabel=["Safe","Balanced","Risky"][m.tier];
      var subLabel=m.sub;
      if(m.tierMax!==undefined && p.tier >= m.tierMax){
        tierLabel=["Safe","Balanced","Risky"][m.tierMax];
        subLabel=m.subMax;
      }
      var unlockClass=(window._prevTier!==undefined && p.tier > window._prevTier && p.tier >= m.tier && window._prevTier < m.tier) ? " unlocking" : "";
      return "<button class='mkt-chip"+(enabled?" on":"")+(locked?" locked":"")+unlockClass+"' data-m='"+m.k+"' "+(locked?"disabled":"")+" type='button'>"+
        "<span>"+m.label+"</span>"+
        "<span class='tier-badge' title='Unlocks at "+tierLabel+" tier'>T"+(m.tier+1)+"</span>"+
        "</button>";
    }).join("");
    mkw.innerHTML=html;
    mkw.querySelectorAll("[data-m]").forEach(function(c){
      c.addEventListener("click",function(){
        var k=c.dataset.m;
        var on=Object.keys(BUILD.mk).filter(function(x){return BUILD.mk[x];});
        if(BUILD.mk[k]&&on.length===1) return;
        BUILD.mk[k]=!BUILD.mk[k];
        // Sync to WSP
        var wspKey = k==="dc"?"doubles":k==="out"?"out":k==="goals"?"goals":"both";
        WSP.mk[wspKey]=BUILD.mk[k];
        renderBuilder();
      });
    });
    window._prevTier=p.tier;
  })();
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
}
function renderSliderPanel(){
  var firstVisit = BUILD.risk === null;
  var p = firstVisit ? {tier:1, minConf:0.65, maxGames:18} : riskParams(BUILD.risk);
  var displayRisk = firstVisit ? 45 : BUILD.risk;
  $("risk").value=displayRisk;
  $("riskName").textContent=firstVisit ? "\u2014" : riskWord(BUILD.risk);
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
  var odds=[50,100,500,1000,2000,6000];
  var styles=[[1.25,"Safer, more games"],[1.4,"Balanced"],[1.7,"Fewer, bigger games"]];
  var html="";
  html += "<div class='wsp-lbl'>Target payout</div><div class='wsp-chips' id='wspOddsChips'>"+
    odds.map(function(o){return "<button class='wsp-chip"+(WSP.odds===o?" on":"")+"' data-o='"+o+"'>\u00d7"+o+"</button>";}).join("")+"</div>";
  html += "<div class='wsp-lbl'>Slip style</div><div class='wsp-chips' id='wspStyleChips'>"+
    styles.map(function(st){return "<button class='wsp-chip"+(WSP.legodd===st[0]?" on":"")+"' data-lo='"+st[0]+"'>"+st[1]+"</button>";}).join("")+"</div>";
  html += "<div class='wsp-acts'>"+
    "<button class='clear-btn wsp-shuffle' id='wspShuffle' type='button'>\u21bb Shuffle</button>"+
    "<button class='book-btn wsp-go' id='wspGo' type='button'>\u2728 Conjure</button>"+
    "</div>";
  $("wizardPanel").innerHTML=html;
  // Panel visibility
  $("sliderPanel").hidden=true;
  $("wizardPanel").hidden=false;
  // Update mode buttons
  document.querySelectorAll(".bld-mode-btn").forEach(function(b){
    b.classList.toggle("on",b.dataset.mode===BUILD.mode);
    b.setAttribute("aria-selected",b.dataset.mode===BUILD.mode?"true":"false");
  });
  // Event listeners
  $("wspOddsChips").querySelectorAll("[data-o]").forEach(function(c){
    c.addEventListener("click",function(){WSP.odds=+c.dataset.o;renderWizardPanel();});
  });
  $("wspStyleChips").querySelectorAll("[data-lo]").forEach(function(c){
    c.addEventListener("click",function(){WSP.legodd=+c.dataset.lo;renderWizardPanel();});
  });
  $("wspShuffle").addEventListener("click",function(){
    WSP.seed=Math.floor(Math.random()*1e6);WSP.shuffles=(WSP.shuffles||0)+1;
    renderWizardPanel();
    window.swToast&&window.swToast("Reshuffled","ok","shuffle");
  });
  $("wspGo").addEventListener("click",function(){wspConjure(false);});
}
function renderBuilderOutput(){
  var firstVisit = BUILD.risk === null;
  var p = firstVisit ? {tier:1, minConf:0.65, maxGames:18} : riskParams(BUILD.risk);
  var displayRisk = firstVisit ? 45 : BUILD.risk;
  var picks = firstVisit ? [] : buildPicks();
  // Risk bubble
  var _rb=$("riskBubble");
  if(_rb){ _rb.style.left="calc("+displayRisk+"% + "+(13-displayRisk*0.26)+"px)";
    _rb.textContent=firstVisit ? "\u2014" : (picks.length
      ? picks.length+" game"+(picks.length===1?"":"s")
      : "No games"); }
  // Risk sub text
  $("riskSub").textContent=firstVisit ? "Move slider to build" : (picks.length+" game"+(picks.length===1?"":"s")+
    " \u00b7 "+P0(p.minConf)+"%+ confidence");
  // Stats
  var odds=totalOdds(picks);
  var real=oddsAreReal(picks), pre=real?"\u00d7":"~\u00d7";
  var avg=picks.length?picks.reduce(function(t,c){return t+c.p;},0)/picks.length:0;
  $("bldStats").innerHTML=
    "<div class='stat'><b>"+picks.length+"</b><i>Games</i></div>"+
    "<div class='stat'><b>"+(picks.length?P0(avg)+"%":"-")+"</b><i>Avg confidence</i></div>"+
    "<div class='stat odds'><b id='totOdds'>"+(picks.length?pre+odds.toFixed(2):"-")+"</b>"+
      "<i>Total odds"+(picks.length&&!real?" (est.)":"")+"</i></div>";
  // Slip rows
  if(!picks.length){
    var dry=(SCOPE==="day")&&!scopeFixtures().length;
    $("slip").innerHTML="<div class='bld-empty'><b>Nothing in your slip</b>"+
      (dry?"No fixtures left today - switch to All upcoming to keep building."
         : (firstVisit ? "Move the slider to build a fresh set of games." : "No games match \u2014 adjust risk or markets."))+"</div>";
  } else {
    $("slip").innerHTML=picks.map(function(c){
      var f=c.f, cf=conf(c.p);
      return "<div class='sp-row conf-"+cf+"'>"+
        "<div class='sp-main'><div class='sp-teams'>"+esc(f.home)+" v "+esc(f.away)+
          (c.eventId?"":"<span class='sp-noid' title='Not on SportyBet yet - can&apos;t auto-book'>no ID</span>")+"</div>"+
          "<div class='sp-meta'>"+compOf(f.league)+" \u00b7 "+dayName(dayOff(f.date))+" "+kickTime(f)+"</div></div>"+
        "<div class='sp-pick'><b>"+mLabel(f,c.code)+"</b><i>"+P0(c.p)+"%</i></div>"+
        "<span class='sp-odd'>"+legOdd(c.f,c.code,c.p).toFixed(2)+"</span>"+
        "<button class='sp-x' data-rm='"+c.id+"' aria-label='Remove'>"+XSVG+"</button>"+
      "</div>";
    }).join("");
    $("slip").querySelectorAll("[data-rm]").forEach(function(b){
      b.addEventListener("click",function(){BUILD.removed[b.dataset.rm]=1;renderBuilder();});});
  }
  // Sync to MYSLIP (only after user engages slider)
  if(BUILD.touched){
    MYSLIP=MYSLIP.filter(function(x){return !x.auto;})
      .concat(picks.map(function(c){return {id:c.id,code:c.code,label:mLabel(c.f,c.code),p:c.p,auto:true};}));
    var _seen={}; MYSLIP=MYSLIP.filter(function(x){if(_seen[x.id])return false;_seen[x.id]=1;return true;});
    saveMy(); renderFab();
  }
  var bookable=picks.filter(function(c){return c.eventId;}).length;
  var btn=$("bookBtn");
  btn.disabled=BUILD.booking||!bookable;
  btn.textContent=BUILD.booking?"Booking\u2026":"Get code";
  // Hide footer actions when slip is empty
  var foot=$("bldFoot");
  if(foot) foot.style.display = picks.length ? "flex" : "none";
  var note=$("bldNote");
  if(!picks.length) note.textContent="";
  else if(!bookable) note.textContent="These fixtures have no SportyBet event ID yet, so they can't be booked automatically.";
  else if(bookable<picks.length) note.textContent=bookable+" of "+picks.length+" games are on SportyBet right now - you can book those and skip the rest.";
  else note.textContent="Booking "+bookable+" selection"+(bookable===1?"":"s")+" to SportyBet.";
}

renderFab();
$("risk").addEventListener("input",function(){
  BUILD.risk=+this.value; BUILD.touched=true;
  try{localStorage.setItem("sw.risk",BUILD.risk);}catch(e){}
  BUILD.removed={}; $("bookResult").innerHTML=""; renderBuilder();});
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
$("shuffleBtn").addEventListener("click",function(){BUILD.touched=true;BUILD.seed=Math.floor(Math.random()*1e6);BUILD.shuffles=(BUILD.shuffles||0)+1;BUILD.removed={};$("bookResult").innerHTML="";renderBuilder();window.swToast&&window.swToast("Slip reshuffled","ok","shuffle");});

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
addEventListener("scroll",function(){
  $("top").classList.toggle("stuck",scrollY>10);},{passive:true});

function paint(){
  (DATA.fixtures||[]).forEach(refineTip);
  let d=DATA.generated||"";
  try{d=new Date(d+"T00:00:00Z").toLocaleDateString(undefined,
    {day:"numeric",month:"short",timeZone:"UTC"});}catch(e){}
  $("when").textContent=d;
  var w2=$("when2"); if(w2) w2.textContent=d;
  renderStreak();
  var rc=$("recap"); if(rc){ var ry=DATA.recordYest;
    if(ry&&ry.total){ rc.hidden=false; rc.innerHTML="\uD83D\uDC4D Yesterday <b>"+ry.correct+" of "+ry.total+"</b> tips landed"; }
    else if(DATA.record&&DATA.record.total){ rc.hidden=false; rc.innerHTML="\uD83D\uDC4D Lately <b>"+DATA.record.correct+" of "+DATA.record.total+"</b> tips landed"; }
    else rc.hidden=true; }
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
}

/* --------------------------------------------------------- live data */
async function load(){
  $("list").innerHTML="<div class='none'><span class='mini-load'></span><b>Loading predictions</b>"+
    "<p>Building from the latest results - just a moment.</p></div>";
  try{
    const r=await fetch("/api/predictions",{headers:{Accept:"application/json"}});
    if(!r.ok){
      const body=await r.json().catch(function(){return {};});
      throw new Error(body.error||("the server returned "+r.status));
    }
    DATA=await r.json();
    await loadSporty();
    startLive();
    paint();
    hideLoader();
  }catch(err){
    var w=$("when"); if(w) w.textContent="-";
    $("list").innerHTML="<div class='none'><b>Predictions unavailable</b>"+
      "<p>"+esc(err.message||err)+". This usually clears within a few "+
      "minutes. Reload to try again.</p></div>";
    hideLoader();
  }
}
function hideLoader(){var l=$("loader"); if(!l) return; l.classList.add("hide");
  setTimeout(function(){if(l&&l.parentNode) l.parentNode.removeChild(l);},500);}
setTimeout(hideLoader,8000);
/* The bar appears once the main call to action has scrolled away - while the
   CTA is on screen there is already a way into the slip builder, so a second
   one underneath it is just clutter. Falls back to the header if the CTA is
   absent (Live and Build pages). */
(function(){var cta=document.querySelector(".slip-cta")||document.querySelector(".top"),
    bt=document.querySelector(".btabs");
  if(!cta||!bt||!("IntersectionObserver" in window))return;
  new IntersectionObserver(function(es){bt.classList.toggle("hide",es[0].isIntersecting);},
    {rootMargin:"-4px 0px 0px 0px"}).observe(cta);})();
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
  window.__buildGlance=function(){
    var g=document.getElementById('glance'),root=document.documentElement;
    if(root.classList.contains('mode-build')||root.classList.contains('mode-live')){if(g)g.style.display='none';return;}
    var games=(typeof shown==='function')?shown():[];
    games=games.filter(function(f){return (typeof notStarted!=='function')||notStarted(f);});
    if(games.length<2){if(g)g.style.display='none';return;}
    if(!g){g=document.createElement('div');g.id='glance';g.className='glance';
      var potd=document.getElementById('potd');if(!potd)return;potd.parentNode.insertBefore(g,potd.nextSibling);}
    g.style.display='';
    var byId={},uniq=[];
    games.forEach(function(f){var k=fid(f);if(!byId[k]){byId[k]=1;uniq.push(f);}});
    function pick(arr,used){for(var i=0;i<arr.length;i++){if(!used[fid(arr[i])])return arr[i];}return arr[0];}
    var used={};
    var goals=pick(uniq.slice().sort(function(a,b){return (b.o25||0)-(a.o25||0);}),used);used[fid(goals)]=1;
    var big=pick(uniq.slice().sort(function(a,b){return (b.lh+b.la)-(a.lh+a.la);}),used);used[fid(big)]=1;
    function card(cls,k,f,pc,sub){return "<div class='gl-card "+cls+"' data-fx='"+fid(f)+"'>"+
      "<div class='gl-txt'><div class='gl-k'><span class='dot'></span>"+k+"</div>"+
      "<div class='gl-team'>"+esc(plainTip(f))+"</div>"+
      "<div class='gl-sub'>"+esc(f.home)+" v "+esc(f.away)+" \u00b7 "+sub+"</div></div>"+
      "<div class='gl-pc'>"+pc+"</div></div>";}
    g.innerHTML=card('value','Goal fest',goals,P0(goals.o25||0)+'%','over 2.5')+
      card('score','Biggest scoreline',big,scoreLine(big),compOf(big.league));
    g.querySelectorAll('[data-fx]').forEach(function(c){c.addEventListener('click',function(){if(typeof openSheet==='function')openSheet(c.dataset.fx);});});
    window.__observeNums(g);
  };
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
  window.__afterRender=function(){try{window.__buildGlance();}catch(e){}try{window.__monograms();}catch(e){}try{window.__observeNums();}catch(e){}try{window.__wireAlert();}catch(e){}try{window.__settleRecord();}catch(e){}};
  document.addEventListener('keydown',function(e){
    if(e.key==='/'&&!/input|textarea|select/i.test((document.activeElement||{}).tagName||'')){
      var q=document.getElementById('q');if(q){e.preventDefault();q.focus();}}
  });
  ['bookResult','myBookResult','sotdResult'].forEach(function(id){var el=document.getElementById(id);if(!el)return;
    new MutationObserver(function(){if(el.querySelector('.code-err'))window.swToast("Couldn't get a code",'err');}).observe(el,{childList:true});});
  var AC=null,soundOn=false;try{soundOn=localStorage.getItem('sw.sound')==='1';}catch(e){}
  var goalAudio=null;
  function beep(){try{if(!goalAudio){goalAudio=new Audio('/goal.mp3');goalAudio.volume=0.7;}goalAudio.currentTime=0;goalAudio.play().catch(function(){});}catch(e){}}
  /* A short spell-cast shimmer, synthesised rather than downloaded: a rising
     minor arpeggio with a little detune, so it lands as "magic" instead of a
     UI blip - and costs no extra kilobytes on a phone connection. It rides the
     same mute switch as goal alerts, so there is one control, not two. */
  function wizChime(soft){
    if(!soundOn) return;
    try{
      AC=AC||new (window.AudioContext||window.webkitAudioContext)();
      if(AC.state==='suspended') AC.resume();
      var t0=AC.currentTime, notes=soft?[784,1046]:[523,784,1046,1318];
      var peak=soft?0.05:0.09;
      notes.forEach(function(f,i){
        [0,7].forEach(function(det){
          var o=AC.createOscillator(), g=AC.createGain();
          o.type='triangle'; o.frequency.value=f+det;
          o.connect(g); g.connect(AC.destination);
          var t=t0+i*(soft?0.05:0.07);
          g.gain.setValueAtTime(0.0001,t);
          g.gain.exponentialRampToValueAtTime(peak,t+0.015);
          g.gain.exponentialRampToValueAtTime(0.0001,t+(soft?0.28:0.5));
          o.start(t); o.stop(t+(soft?0.3:0.55));
        });
      });
    }catch(e){}
  }
  window.__wizChime=wizChime;

  if(typeof applyGoalFX==='function'){var __ag=applyGoalFX;applyGoalFX=function(h){
    var ids=Object.keys(LIVE.flash||{}), n=ids.length;
    __ag(h);
    if(n&&soundOn)beep();
    /* Following a match is the user asking to be told about it, so a goal there
       earns a notification even when the app is in the background. */
    if(n&&window.Notification&&Notification.permission==="granted"){
      ids.forEach(function(id){
        if(!(typeof isLiveFav==="function"&&isLiveFav(id))) return;
        var m=null;
        (LIVE.matches||[]).forEach(function(x){if((x.eventId||(x.home+x.away))===id)m=x;});
        if(!m) return;
        try{new Notification("\u26bd GOAL - "+m.home+" "+
          (m.homeScore!=null?m.homeScore:"-")+"-"+(m.awayScore!=null?m.awayScore:"-")+
          " "+m.away,{body:liveComp(m.league||""),tag:"sw-goal-"+id});}catch(e){}
      });
    }
  };}
  window.__wireAlert=function(){var b=document.getElementById('liveAlert');if(!b||b._w)return;b._w=1;
    var base='<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>';
    var ON=base+'<path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>';
    var OFF=base+'<line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>';
    function pa(){b.classList.toggle('on',soundOn);b.setAttribute('aria-pressed',soundOn);b.title=soundOn?'Goal alerts on':'Goal alerts off';b.innerHTML=soundOn?ON:OFF;}
    pa();b.addEventListener('click',function(){soundOn=!soundOn;try{localStorage.setItem('sw.sound',soundOn?'1':'0');}catch(e){}if(soundOn)beep();pa();window.swToast(soundOn?'Goal alerts on':'Goal alerts off','ok','alert');});};
  window.__settleRecord=function(){var bar=document.querySelector('.record-bar i');if(!bar||bar._settled)return;bar._settled=1;var w=bar.style.width;bar.style.width='0%';requestAnimationFrame(function(){requestAnimationFrame(function(){bar.style.width=w;});});};
  if(typeof render==='function'){var __ro=render;render=function(){__ro.apply(this,arguments);window.__afterRender();};}
  if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}
  var _dip=null, ib=document.getElementById('installBtn');
  var _standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone;
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();_dip=e;if(ib)ib.hidden=false;});
  window.addEventListener('appinstalled',function(){if(ib)ib.hidden=true;window.swToast&&window.swToast('Installed','ok');});
  var _iOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  if(ib&&_iOS&&!_standalone) ib.hidden=false;
  if(ib) ib.addEventListener('click',function(){
    if(_dip){ _dip.prompt(); _dip.userChoice&&_dip.userChoice.then(function(c){
      if(c&&c.outcome==='accepted'){ib.hidden=true;} _dip=null; }); return; }
    if(_iOS){ window.swToast&&window.swToast('Tap the Share icon, then "Add to Home Screen"','ok','ins'); return; }
    var isAndroid=/android/i.test(navigator.userAgent);
    window.swToast&&window.swToast(isAndroid
      ? 'Tap the 3-dot menu, then "Install app" / "Add to Home screen"'
      : 'In Chrome or Edge, click the install icon in the address bar','ok','ins');
  });
});

/* ==========================================================================
   Desktop Parallax Controller — Mouse-following 3D depth
   Only runs on desktop (min-width: 1060px) with hover and no reduced-motion.
   ========================================================================== */
(function(){
  var mq = window.matchMedia('(min-width: 1060px) and (hover: hover) and (prefers-reduced-motion: no-preference)');
  if(!mq.matches) return;

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
      document.removeEventEventListener('mousemove', onMove);
      document.querySelectorAll('[data-parallax]').forEach(function(el){
        el.style.transform = '';
      });
    }
  });
})();

load();
