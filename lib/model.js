"use strict";


/* ==================================================================
   MATH
   ================================================================== */

const LG_C = [76.18009172947146,-86.50532032941677,24.01409824083091,
  -1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];

function lgamma(x){
  let y=x, tmp=x+5.5;
  tmp -= (x+0.5)*Math.log(tmp);
  let ser=1.000000000190015;
  for(let j=0;j<6;j++) ser += LG_C[j]/++y;
  return -tmp+Math.log(2.5066282746310005*ser/x);
}

function poissonLogPmf(k, lam){
  if(lam<=0) return k===0?0:-Infinity;
  return k*Math.log(lam)-lam-lgamma(k+1);
}

/* Gamma(shape=k, scale=1/k) discretised on a grid. Mean is 1 by
   construction, so it rescales the match's goal expectation without
   changing its average. */
function gammaNodes(k, n){
  n = n || 60;
  const hiMult = 1 + 5/Math.sqrt(k);
  const zMax = Math.min(6, hiMult*1.6);
  const step = zMax/n;
  const z=[], w=[];
  let tot=0;
  const logNorm = k*Math.log(k) - lgamma(k);
  for(let i=0;i<n;i++){
    const zi = (i+0.5)*step;
    const logp = logNorm + (k-1)*Math.log(zi) - k*zi;
    const pi = Math.exp(logp)*step;
    z.push(zi); w.push(pi); tot+=pi;
  }
  for(let i=0;i<n;i++) w[i]/=tot;
  return {z:z, w:w};
}

const MAXG = 12;

/* Joint scoreline distribution under a shared Gamma multiplier. */
function scoreMatrix(lh, la, k){
  const nd = gammaNodes(k, 48);
  const m = [];
  for(let i=0;i<=MAXG;i++) m.push(new Float64Array(MAXG+1));
  for(let q=0;q<nd.z.length;q++){
    const zi=nd.z[q], wq=nd.w[q];
    const ph=new Float64Array(MAXG+1), pa=new Float64Array(MAXG+1);
    for(let g=0;g<=MAXG;g++){
      ph[g]=Math.exp(poissonLogPmf(g, lh*zi));
      pa[g]=Math.exp(poissonLogPmf(g, la*zi));
    }
    for(let i=0;i<=MAXG;i++)
      for(let j=0;j<=MAXG;j++) m[i][j]+=wq*ph[i]*pa[j];
  }
  let s=0;
  for(let i=0;i<=MAXG;i++) for(let j=0;j<=MAXG;j++) s+=m[i][j];
  for(let i=0;i<=MAXG;i++) for(let j=0;j<=MAXG;j++) m[i][j]/=s;
  return m;
}

function overProb(m, line){
  let p=0;
  for(let i=0;i<=MAXG;i++)
    for(let j=0;j<=MAXG;j++) if(i+j>line) p+=m[i][j];
  return p;
}

/* ---------------------------------------------------------- de-vig */

function devigMultiplicative(o,u){
  const a=1/o, b=1/u, s=a+b;
  return a/s;
}
function devigPower(o,u){
  const a=1/o, b=1/u;
  let lo=0.5, hi=3.0;
  const f=n=>Math.pow(a,n)+Math.pow(b,n)-1;
  if(f(lo)*f(hi)>0) return devigMultiplicative(o,u);
  for(let i=0;i<80;i++){
    const mid=(lo+hi)/2;
    if(f(lo)*f(mid)<=0) hi=mid; else lo=mid;
  }
  const n=(lo+hi)/2;
  const pa=Math.pow(a,n), pb=Math.pow(b,n);
  return pa/(pa+pb);
}
function devigShin(o,u){
  const a=1/o, b=1/u, s=a+b;
  const tp=z=>{
    const f=p=>(Math.sqrt(z*z+4*(1-z)*p*p/s)-z)/(2*(1-z));
    return [f(a), f(b)];
  };
  const g=z=>{const t=tp(z); return t[0]+t[1]-1;};
  let lo=1e-9, hi=0.4;
  if(g(lo)*g(hi)>0) return devigPower(o,u);
  for(let i=0;i<80;i++){
    const mid=(lo+hi)/2;
    if(g(lo)*g(mid)<=0) hi=mid; else lo=mid;
  }
  const t=tp((lo+hi)/2);
  return t[0]/(t[0]+t[1]);
}
const DEVIG={multiplicative:devigMultiplicative,power:devigPower,shin:devigShin};

function kellyFraction(p, odds){
  const b=odds-1;
  if(b<=0) return 0;
  return Math.max(0,(p*b-(1-p))/b);
}

/* ==================================================================
   CSV PARSING AND FORMAT DETECTION
   ================================================================== */

function parseCSV(text){
  const rows=[];
  let row=[], cur="", inQ=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQ){
      if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else inQ=false; }
      else cur+=c;
    } else if(c==='"') inQ=true;
    else if(c===','){ row.push(cur); cur=""; }
    else if(c==='\n'){ row.push(cur); rows.push(row); row=[]; cur=""; }
    else if(c!=='\r') cur+=c;
  }
  if(cur.length||row.length){ row.push(cur); rows.push(row); }
  return rows.filter(r=>r.some(c=>c.trim()!==""));
}

function parseDate(s){
  s=(s||"").trim();
  let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if(m){
    let y=+m[3]; if(y<100) y+= (y<70?2000:1900);
    return new Date(Date.UTC(y,+m[2]-1,+m[1]));
  }
  m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if(m) return new Date(Date.UTC(+m[1],+m[2]-1,+m[3]));
  const d=new Date(s);
  return isNaN(d)?null:d;
}

const DIV_NAMES={
  E0:"England Premier League", E1:"England Championship",
  E2:"England League 1", E3:"England League 2",
  EC:"England Conference National",
  SC0:"Scotland Premiership", SC1:"Scotland Championship",
  SC2:"Scotland League 1", SC3:"Scotland League 2",
  D1:"Germany Bundesliga 1", D2:"Germany Bundesliga 2",
  I1:"Italy Serie A", I2:"Italy Serie B",
  SP1:"Spain La Liga 1", SP2:"Spain La Liga 2",
  F1:"France Ligue 1", F2:"France Ligue 2",
  N1:"Netherlands Eredivisie", B1:"Belgium Pro League",
  P1:"Portugal Primeira Liga", T1:"Turkey Super Lig",
  G1:"Greece Super League"
};

function combineLeague(country, league){
  const c=(country||"").trim(), l=(league||"").trim();
  if(c&&l) return c+" "+l;
  return l||c||"League";
}

/* Odds column preferences, best first. Avg is the market average and is a
   better benchmark than any single book. C suffix means closing. */
const O25_OPEN=["Avg>2.5","BbAv>2.5","B365>2.5","P>2.5","Max>2.5"];
const U25_OPEN=["Avg<2.5","BbAv<2.5","B365<2.5","P<2.5","Max<2.5"];
const O25_CLOSE=["AvgC>2.5","B365C>2.5","PC>2.5","MaxC>2.5"];
const U25_CLOSE=["AvgC<2.5","B365C<2.5","PC<2.5","MaxC<2.5"];

function pick(hdr,names){
  for(const n of names){ const i=hdr.indexOf(n); if(i>=0) return i; }
  return -1;
}

function normalise(rows){
  const hdr=rows[0].map(h=>h.trim());
  const H=n=>hdr.indexOf(n);
  let iL,iD,iH,iA,iHG,iAG, layout, iC=-1, iHTH=-1, iHTA=-1, iHST=-1, iAST=-1;

  if(H("FTHG")>=0 && H("HomeTeam")>=0){
    layout="football-data main";
    iL=H("Div"); iD=H("Date"); iH=H("HomeTeam"); iA=H("AwayTeam");
    iHG=H("FTHG"); iAG=H("FTAG"); iHTH=H("HTHG"); iHTA=H("HTAG");
    iHST=H("HST"); iAST=H("AST");
  } else if(H("HG")>=0 && H("Home")>=0){
    layout="football-data extra";
    iL=H("League"); iC=H("Country");
    iD=H("Date"); iH=H("Home"); iA=H("Away"); iHG=H("HG"); iAG=H("AG");
  } else if(H("home_goals")>=0){
    layout="generic";
    iL=H("league"); iD=H("date"); iH=H("home_team"); iA=H("away_team");
    iHG=H("home_goals"); iAG=H("away_goals");
  } else {
    return {error:"Could not recognise the columns. Expected either "+
      "football-data.co.uk format (Div, Date, HomeTeam, AwayTeam, FTHG, FTAG) "+
      "or generic (date, league, home_team, away_team, home_goals, away_goals)."};
  }

  const iOO=pick(hdr,O25_OPEN), iUO=pick(hdr,U25_OPEN);
  const iOC=pick(hdr,O25_CLOSE), iUC=pick(hdr,U25_CLOSE);

  const out=[]; let skipped=0;
  for(let r=1;r<rows.length;r++){
    const c=rows[r];
    const hg=parseInt(c[iHG],10), ag=parseInt(c[iAG],10);
    const d=parseDate(c[iD]);
    const home=(c[iH]||"").trim(), away=(c[iA]||"").trim();
    if(!d||isNaN(hg)||isNaN(ag)||!home||!away){ skipped++; continue; }
    let lg;
    if(iC>=0){ lg=combineLeague(c[iC], iL>=0?c[iL]:""); }
    else { lg=(iL>=0?(c[iL]||"").trim():"League");
           if(DIV_NAMES[lg]) lg=DIV_NAMES[lg]; }
    if(!lg) lg="League";
    const num=i=>{ if(i<0) return null; const v=parseFloat(c[i]);
      return (isFinite(v)&&v>1.01)?v:null; };
    const half=(i)=>{ if(i<0) return null; const v=parseInt(c[i],10);
      return isNaN(v)?null:v; };
    out.push({date:d, league:lg, home:home, away:away, hg:hg, ag:ag,
      hth:half(iHTH), hta:half(iHTA), hst:half(iHST), ast:half(iAST),
      oo:num(iOO), uo:num(iUO), oc:num(iOC), uc:num(iUC)});
  }
  return {matches:out, layout:layout, skipped:skipped,
    hasOdds:iOO>=0&&iUO>=0, hasClose:iOC>=0&&iUC>=0};
}

/* ==================================================================
   MODEL FIT
   ================================================================== */

function buildIndex(matches){
  const teams=[], tIdx={}, leagues=[], lIdx={}, teamLeague=[];
  for(const m of matches){
    if(!(m.league in lIdx)){ lIdx[m.league]=leagues.length; leagues.push(m.league); }
    for(const t of [m.home,m.away]){
      if(!(t in tIdx)){ tIdx[t]=teams.length; teams.push(t); teamLeague.push(lIdx[m.league]); }
    }
  }
  return {teams,tIdx,leagues,lIdx,teamLeague};
}

/* Time-weighted Poisson regression with league intercepts, fitted by Adam.
   Attack and defence are centred inside each league after every step:
   because no team plays outside its league, a league intercept and its
   teams' mean rating are otherwise interchangeable, and the scoring rate
   would hide inside the team ratings instead of the league term. */
function fitModel(matches, opts, onProgress){
  const halfLife=opts.halfLife||200, reg=opts.reg||1.5;
  const iters=opts.iters||420;
  const idx=opts.index||buildIndex(matches);
  const nt=idx.teams.length, nl=idx.leagues.length;

  const ref=opts.reference||matches.reduce((a,m)=>m.date>a?m.date:a,matches[0].date);
  const decay=Math.log(2)/halfLife;

  const hi=new Int32Array(matches.length), ai=new Int32Array(matches.length),
        lg=new Int32Array(matches.length), hgv=new Float64Array(matches.length),
        agv=new Float64Array(matches.length), w=new Float64Array(matches.length);
  // Shots-on-target expected-goals blend. A team that "won 1-0 but was
  // outshot" is weaker than the scoreline; blending damps that luck. Only
  // main-league files carry shots, so matches without them use raw goals.
  const XW = (opts.xgWeight!=null)?opts.xgWeight:0.30;
  const XCONV = 0.31, XCAP = 5;
  let totalGoals=0, wsum=0;
  for(let i=0;i<matches.length;i++){
    const m=matches[i];
    hi[i]=idx.tIdx[m.home]; ai[i]=idx.tIdx[m.away]; lg[i]=idx.lIdx[m.league];
    let th=m.hg, ta=m.ag;
    if(XW>0 && m.hst!=null && m.ast!=null){
      const xh=Math.min(XCAP, m.hst*XCONV), xa=Math.min(XCAP, m.ast*XCONV);
      th=m.hg*(1-XW)+xh*XW; ta=m.ag*(1-XW)+xa*XW;
    }
    hgv[i]=th; agv[i]=ta;
    const age=Math.max(0,(ref-m.date)/86400000);
    w[i]=Math.exp(-decay*age); wsum+=w[i];
    totalGoals+=m.hg+m.ag;
  }

  const att=(opts.warm&&opts.warm.att)?opts.warm.att.slice():new Float64Array(nt);
  const def=(opts.warm&&opts.warm.def)?opts.warm.def.slice():new Float64Array(nt);
  const lgI=(opts.warm&&opts.warm.lgI)?opts.warm.lgI.slice():new Float64Array(nl);
  let hadv=(opts.warm&&opts.warm.hadv!==undefined)?opts.warm.hadv:0.22;
  if(!opts.warm){
    const gpg=totalGoals/matches.length;
    for(let l=0;l<nl;l++) lgI[l]=Math.log(Math.max(0.4,gpg/2.2));
  }

  const mAtt=new Float64Array(nt), vAtt=new Float64Array(nt);
  const mDef=new Float64Array(nt), vDef=new Float64Array(nt);
  const mLg=new Float64Array(nl), vLg=new Float64Array(nl);
  let mH=0,vH=0;
  const lr=0.06, b1=0.9, b2=0.999, eps=1e-8;

  const gAtt=new Float64Array(nt), gDef=new Float64Array(nt), gLg=new Float64Array(nl);

  const leagueTeams=[];
  for(let l=0;l<nl;l++) leagueTeams.push([]);
  for(let t=0;t<nt;t++) leagueTeams[idx.teamLeague[t]].push(t);

  function centre(arr){
    for(const grp of leagueTeams){
      if(!grp.length) continue;
      let s=0; for(const t of grp) s+=arr[t];
      const mu=s/grp.length;
      for(const t of grp) arr[t]-=mu;
    }
  }

  for(let it=1;it<=iters;it++){
    gAtt.fill(0); gDef.fill(0); gLg.fill(0);
    let gH=0;
    for(let i=0;i<matches.length;i++){
      const h=hi[i], a=ai[i], l=lg[i], wi=w[i];
      const lh=Math.exp(lgI[l]+att[h]-def[a]+hadv);
      const la=Math.exp(lgI[l]+att[a]-def[h]);
      const rh=wi*(hgv[i]-lh), ra=wi*(agv[i]-la);
      gAtt[h]+=rh; gDef[a]-=rh; gLg[l]+=rh; gH+=rh;
      gAtt[a]+=ra; gDef[h]-=ra; gLg[l]+=ra;
    }
    // L2 shrinkage toward the league mean
    for(let t=0;t<nt;t++){ gAtt[t]-=reg*att[t]; gDef[t]-=reg*def[t]; }

    for(let t=0;t<nt;t++){
      mAtt[t]=b1*mAtt[t]+(1-b1)*gAtt[t]; vAtt[t]=b2*vAtt[t]+(1-b2)*gAtt[t]*gAtt[t];
      att[t]+=lr*(mAtt[t]/(1-Math.pow(b1,it)))/(Math.sqrt(vAtt[t]/(1-Math.pow(b2,it)))+eps);
      mDef[t]=b1*mDef[t]+(1-b1)*gDef[t]; vDef[t]=b2*vDef[t]+(1-b2)*gDef[t]*gDef[t];
      def[t]+=lr*(mDef[t]/(1-Math.pow(b1,it)))/(Math.sqrt(vDef[t]/(1-Math.pow(b2,it)))+eps);
    }
    for(let l=0;l<nl;l++){
      mLg[l]=b1*mLg[l]+(1-b1)*gLg[l]; vLg[l]=b2*vLg[l]+(1-b2)*gLg[l]*gLg[l];
      lgI[l]+=lr*(mLg[l]/(1-Math.pow(b1,it)))/(Math.sqrt(vLg[l]/(1-Math.pow(b2,it)))+eps);
    }
    mH=b1*mH+(1-b1)*gH; vH=b2*vH+(1-b2)*gH*gH;
    hadv+=lr*(mH/(1-Math.pow(b1,it)))/(Math.sqrt(vH/(1-Math.pow(b2,it)))+eps);
    hadv=Math.max(-0.4,Math.min(0.8,hadv));

    centre(att); centre(def);
    if(onProgress && it%60===0) onProgress(it/iters);
  }

  /* Dispersion by moment matching. Under the shared multiplier,
     Var(total) = mu + mu^2/k, so k falls out of the excess variance. */
  let sMu2=0, sExcess=0;
  for(let i=0;i<matches.length;i++){
    const h=hi[i], a=ai[i], l=lg[i];
    const mu=Math.exp(lgI[l]+att[h]-def[a]+hadv)+Math.exp(lgI[l]+att[a]-def[h]);
    const t=hgv[i]+agv[i];
    sMu2+=mu*mu; sExcess+=(t-mu)*(t-mu)-mu;
  }
  let k = sExcess>1e-6 ? sMu2/sExcess : 200;
  k=Math.max(1.5,Math.min(400,k));

  // effective (time-weighted) match support per team, for uncertainty bands
  const teamW=new Float64Array(nt);
  for(let i=0;i<matches.length;i++){ teamW[hi[i]]+=w[i]; teamW[ai[i]]+=w[i]; }

  return {att:att, def:def, lgI:lgI, hadv:hadv, k:k, index:idx, teamW:teamW,
    halfLife:halfLife, reg:reg, effective:wsum, n:matches.length,
    reference:ref, gpg:totalGoals/matches.length};
}

/* Effective time-weighted match count for the weaker-supported side of a
   fixture. Few recent games -> low support -> confidence should be widened
   so thin data never masquerades as a strong pick. */
function support(model, home, away){
  const i=model.index; const h=i.tIdx[home], a=i.tIdx[away];
  if(h===undefined||a===undefined||!model.teamW) return 0;
  return Math.min(model.teamW[h], model.teamW[a]);
}

function predictTotals(model, home, away, league){
  const i=model.index;
  const h=i.tIdx[home], a=i.tIdx[away], l=i.lIdx[league];
  if(h===undefined||a===undefined||l===undefined) return null;
  const lh=Math.exp(model.lgI[l]+model.att[h]-model.def[a]+model.hadv);
  const la=Math.exp(model.lgI[l]+model.att[a]-model.def[h]);
  const m=scoreMatrix(lh,la,model.k);
  return {lh:lh, la:la, total:lh+la, matrix:m, k:model.k,
    o15:overProb(m,1.5), o25:overProb(m,2.5), o35:overProb(m,3.5)};
}

/* Fast path for backtesting: skips the full matrix. */
function quickOver(model, hIdx, aIdx, lIdx, line){
  const lh=Math.exp(model.lgI[lIdx]+model.att[hIdx]-model.def[aIdx]+model.hadv);
  const la=Math.exp(model.lgI[lIdx]+model.att[aIdx]-model.def[hIdx]);
  const nd=gammaNodes(model.k,32);
  let p=0;
  const cap=Math.ceil(line);
  for(let q=0;q<nd.z.length;q++){
    const z=nd.z[q];
    let under=0;
    for(let t=0;t<cap;t++){
      let pt=0;
      for(let i=0;i<=t;i++)
        pt+=Math.exp(poissonLogPmf(i,lh*z)+poissonLogPmf(t-i,la*z));
      under+=pt;
    }
    p+=nd.w[q]*(1-under);
  }
  return {p:Math.max(0,Math.min(1,p)), lh:lh, la:la};
}
function parseFixtures(text){
  const rows=parseCSV(text);
  if(rows.length<2) return {error:"That file had no rows in it."};
  const hdr=rows[0].map(h=>h.trim());
  const H=n=>hdr.indexOf(n);
  let iD=H("Date"),iT=H("Time"),iL=H("Div"),iH=H("HomeTeam"),iA=H("AwayTeam");
  let iC=H("Country");
  if(iH<0){iH=H("Home");iA=H("Away"); if(iL<0) iL=H("League");}
  if(iH<0){iH=H("home_team");iA=H("away_team");
    if(iL<0) iL=H("league"); if(iD<0) iD=H("date"); if(iT<0) iT=H("time");}
  if(iH<0||iA<0||iD<0)
    return {error:"Could not find Date, HomeTeam and AwayTeam columns."};
  const out=[];
  for(let r=1;r<rows.length;r++){
    const c=rows[r], d=parseDate(c[iD]);
    const h=(c[iH]||"").trim(), a=(c[iA]||"").trim();
    if(!d||!h||!a) continue;
    let lg;
    if(iC>=0){ lg=combineLeague(c[iC], iL>=0?c[iL]:""); }
    else { lg=(iL>=0?(c[iL]||"").trim():"");
           if(DIV_NAMES[lg]) lg=DIV_NAMES[lg]; }
    out.push({date:d,time:(iT>=0?(c[iT]||"").trim():""),league:lg,home:h,away:a});
  }
  return out.length?{fixtures:out}:{error:"No usable fixture rows."};
}

function markets(p, opts){
  opts = opts || {};

  /* Draws come out about a point low from a pure Poisson-style model, which
     is the same reason Dixon-Coles adds a low-score correction. Rather than
     patch each draw market separately, the fix is applied once to the
     diagonal of the scoreline matrix and everything is read off the result.
     That keeps the markets consistent with each other: "draw or BTTS" always
     equals draw plus BTTS minus their overlap, whatever the correction does.
     The boost was fitted on training data and checked on held-out matches. */
  const boost = (opts.drawBoost === undefined) ? 0.0703 : opts.drawBoost;
  const n = p.matrix.length;
  let m = p.matrix;
  if(boost > 0){
    m = p.matrix.map(row => Float64Array.from(row));
    let total = 0;
    for(let i=0;i<n;i++){ m[i][i] *= (1 + boost); }
    for(let i=0;i<n;i++) for(let j=0;j<n;j++) total += m[i][j];
    for(let i=0;i<n;i++) for(let j=0;j<n;j++) m[i][j] /= total;
  }

  let home=0, draw=0, away=0;
  for(let i=0;i<n;i++) for(let j=0;j<n;j++){
    if(i>j) home+=m[i][j]; else if(i===j) draw+=m[i][j]; else away+=m[i][j];
  }

  let btts=0, bttsDraw=0;
  for(let i=1;i<n;i++) for(let j=1;j<n;j++){
    btts+=m[i][j];
    if(i===j) bttsDraw+=m[i][j];
  }

  const over = (line)=>{
    let s=0;
    for(let i=0;i<n;i++) for(let j=0;j<n;j++) if(i+j>line) s+=m[i][j];
    return s;
  };
  const o15=over(1.5), o25=over(2.5), o35=over(3.5);

  // both teams score AND three or more goals: needs i>=1, j>=1, i+j>=3
  let bttsO25=0;
  for(let i=1;i<n;i++) for(let j=1;j<n;j++) if(i+j>2.5) bttsO25+=m[i][j];

  // draws that also go over 2.5 are 2-2, 3-3 and up
  let drawAndO25=0;
  for(let i=2;i<n;i++) if(2*i>2.5) drawAndO25+=m[i][i];

  /* First half. Roughly 45% of goals arrive before the interval, and that
     share is strikingly steady: across 22 leagues it sits between 0.430 and
     0.463. Where a league's own half-time data is available the measured
     share is used, otherwise the average.

     With the shared Gamma multiplier the chance of a goalless half has a
     closed form: E[exp(-cZ)] = (1 + c/k)^-k, so no numerical integration
     is needed here. */
  const share = opts.fhShare || 0.447;
  const k = opts.k || p.k || 200;
  const muFH = share * (p.lh + p.la);
  const fh05 = 1 - Math.pow(1 + muFH/k, -k);

  // most likely scoreline
  let bi=0,bj=0,bp=-1;
  for(let i=0;i<n;i++) for(let j=0;j<n;j++) if(m[i][j]>bp){bp=m[i][j];bi=i;bj=j;}

  return {
    home:home, draw:draw, away:away,
    dc1x:home+draw, dc12:home+away, dcx2:draw+away,
    anybodyWin:home+away,
    o15:o15, o25:o25, o35:o35, u25:1-o25,
    btts:btts, bttsNo:1-btts,
    bttsAndO25:bttsO25,
    drawOrO25:draw+o25-drawAndO25,
    drawOrBtts:draw+btts-bttsDraw,
    fhO05:fh05, fhU05:1-fh05,
    fhShare:share,
    score:bi+"-"+bj, scoreP:bp,
    lh:p.lh, la:p.la, total:p.total
  };
}

function bestTip(k){
  /* The headline call. Combination markets are only offered when they are
     meaningfully safer than the plain outcome, otherwise every tip collapses
     into "draw or something", which is technically likely and tells the
     reader nothing. */
  const cands=[
    {label:"Home win", p:k.home},
    {label:"Draw", p:k.draw},
    {label:"Away win", p:k.away},
    {label:"Over 2.5", p:k.o25},
    {label:"Under 2.5", p:k.u25},
    {label:"Both teams score", p:k.btts},
    {label:"First half goal", p:k.fhO05}
  ];
  const outright=Math.max(k.home,k.draw,k.away);
  const dc=[
    {label:"1X, home or draw", p:k.dc1x},
    {label:"12, anybody wins", p:k.dc12},
    {label:"X2, draw or away", p:k.dcx2}
  ].sort((a,b)=>b.p-a.p)[0];
  if(dc.p-outright>0.14) cands.push(dc);

  // combination markets need a clear margin over their strongest component
  if(k.drawOrO25 - Math.max(k.draw,k.o25) > 0.12)
    cands.push({label:"Draw or over 2.5", p:k.drawOrO25});
  if(k.drawOrBtts - Math.max(k.draw,k.btts) > 0.12)
    cands.push({label:"Draw or both score", p:k.drawOrBtts});
  if(k.bttsAndO25 > 0.55)
    cands.push({label:"Both score and over 2.5", p:k.bttsAndO25});

  return cands.sort((a,b)=>b.p-a.p)[0];
}

/* ------------------------------------------------------- name matching */
function normName(s){
  var x=(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9 ]/g," ")
    .replace(/\b(fc|afc|cf|sc|sv|ac|as|ss|us|vfl|vfb|tsg|fsv|bsc|if|ik|fk|bk|sk|gf|club)\b/g," ")
    .replace(/\s+/g," ").trim();
  /* SportyBet and football-data spell some clubs differently; fold both to one
     canonical token so the match succeeds. */
  x=x.replace(/\butd\b/g,"united")
     .replace(/\bpsg\b/g,"paris sg")
     .replace(/\bspurs\b/g,"tottenham").replace(/\bwolves\b/g,"wolverhampton")
     .replace(/\bnott m forest\b/g,"nottingham forest").replace(/\bnottm forest\b/g,"nottingham forest")
     .replace(/\bsheff (utd|united)\b/g,"sheffield united").replace(/\bsheff wed\b/g,"sheffield wednesday")
     .replace(/\bwest brom\b/g,"west bromwich").replace(/\bbrighton hove albion\b/g,"brighton")
     .replace(/^sporting$/,"sp lisbon");
  return x.replace(/\s+/g," ").trim();
}
function lev(a,b){
  if(a===b) return 0;
  const m=a.length,n=b.length; if(!m) return n; if(!n) return m;
  let prev=new Array(n+1),cur=new Array(n+1);
  for(let j=0;j<=n;j++) prev[j]=j;
  for(let i=1;i<=m;i++){
    cur[0]=i;
    for(let j=1;j<=n;j++)
      cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    const t=prev;prev=cur;cur=t;
  }
  return prev[n];
}
function matchTeam(idx, name, li){
  const pool=idx.teams.filter((t,ti)=>li==null||idx.teamLeague[ti]===li);
  if(pool.indexOf(name)>=0) return name;
  /* Reserve, youth and B sides must never resolve to the senior club - booking
     a youth game off a first-team prediction is the worst failure here. Reject
     them outright rather than risk a fuzzy hit. */
  if(/(^|\s)(jong|sub)\s/i.test(name) || /\b(ii|iii|b|2|3|u1[6-9]|u2[0-3]|srl|res|reserves)$/i.test(name.trim()))
    return null;
  const tgt=normName(name);
  let best=null,bs=0,second=0;
  for(const t of pool){
    const nt=normName(t);
    const s=1-lev(tgt,nt)/Math.max(tgt.length,nt.length,1);
    if(s>bs){second=bs;bs=s;best=t;} else if(s>second) second=s;
  }
  if(bs>=0.82&&bs-second>=0.06) return best;
  /* Vendors append a decoration football-data omits ("Ipswich Town" vs
     "Ipswich", "Fenerbahce Istanbul" vs "Fenerbahce"). Strip ONE trailing
     decoration and demand an EXACT, unique model name. Exactness is the safety:
     it can't cross "Sheffield United" onto "Sheffield Wednesday", or "Bristol
     Rovers" onto "Bristol City", because the remaining word must match whole. */
  const stripped=tgt.replace(/ (town|city|united|rovers|athletic|wanderers|county|istanbul|calcio|balompie|praia|futebol)$/,"").trim();
  if(stripped && stripped!==tgt){
    let hit=null,count=0;
    for(const t of pool){ if(normName(t)===stripped){count++;hit=t;if(count>1)break;} }
    if(count===1) return hit;
  }
  return null;
}

/* ---------------------------------------------------- grading + calibration */
function gradeTip(label, m){
  const t=m.hg-m.ag, tot=m.hg+m.ag, both=m.hg>0&&m.ag>0;
  if(label==="Home win") return t>0;
  if(label==="Away win") return t<0;
  if(label==="Draw") return t===0;
  if(label==="Over 2.5") return tot>2.5;
  if(label==="Under 2.5") return tot<2.5;
  if(label==="Both teams score") return both;
  if(label==="First half goal"){
    if(m.hth==null||m.hta==null) return null;
    return (m.hth+m.hta)>0;
  }
  if(label.indexOf("1X")===0) return t>=0;
  if(label.indexOf("12")===0) return t!==0;
  if(label.indexOf("X2")===0) return t<=0;
  if(label.indexOf("Draw or over")===0) return t===0||tot>2.5;
  if(label.indexOf("Draw or both")===0) return t===0||both;
  if(label.indexOf("Both score and")===0) return both&&tot>2.5;
  return null;
}

/* Walk-forward-lite calibration: fit on everything older than `days`, then
   grade the model's own headline tip against what actually happened in that
   held-out window. Returns the honest recent record plus a Brier score
   (lower is better). Never throws - a null result just hides the card. */
function backtest(matches, opts){
  opts=opts||{};
  const days=opts.days||21;
  if(!matches||matches.length<500) return null;
  let maxD=matches[0].date;
  for(const mm of matches) if(mm.date>maxD) maxD=mm.date;
  const cutoff=new Date(maxD.getTime()-days*86400000);
  const train=matches.filter(mm=>mm.date<cutoff);
  const test=matches.filter(mm=>mm.date>=cutoff);
  if(train.length<400||test.length<20) return null;
  const idx=buildIndex(train);
  const model=fitModel(train,{halfLife:opts.halfLife||200,reg:opts.reg||35,
    index:idx, xgWeight:opts.xgWeight});
  let total=0, correct=0, brier=0;
  for(const mm of test){
    if(idx.tIdx[mm.home]===undefined||idx.tIdx[mm.away]===undefined) continue;
    if(idx.lIdx[mm.league]===undefined) continue;
    const p=predictTotals(model,mm.home,mm.away,mm.league);
    if(!p) continue;
    const k=markets(p,{k:model.k});
    const tip=bestTip(k);
    const won=gradeTip(tip.label,mm);
    if(won===null) continue;
    total++; if(won) correct++;
    brier+=Math.pow((won?1:0)-tip.p,2);
  }
  if(!total) return null;
  return {total:total, correct:correct, days:days,
    brier:Math.round(brier/total*1000)/1000};
}

module.exports = {
  parseCSV, parseDate, DIV_NAMES, combineLeague, normalise, parseFixtures,
  buildIndex, fitModel, predictTotals, scoreMatrix, overProb,
  markets, bestTip, matchTeam, gradeTip, backtest, support
};
