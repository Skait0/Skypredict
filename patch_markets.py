import io, sys
p = r'C:\Users\DELL\Desktop\Skypredict\public\index.html'
s = io.open(p, encoding='utf-8').read()
n = 0

def rep(old, new, label, count=1):
    global s, n
    c = s.count(old)
    if c != count:
        print('MISS[%s] expected %d got %d' % (label, count, c))
        sys.exit(1)
    s = s.replace(old, new); n += 1
    print('ok   ' + label)

# ---- 1. HTML: Replace "Include markets" + #mkts with unified market palette ----
rep(
'''      <div class="wsp-lbl">Include markets</div>
      <div class="wsp-chips" id="bldMk">
        <button class="wsp-chip" type="button" data-bmk="dc">Double chance</button>
        <button class="wsp-chip" type="button" data-bmk="out">Outright wins</button>
        <button class="wsp-chip" type="button" data-bmk="goals">Goals</button>
        <button class="wsp-chip" type="button" data-bmk="both">Both score</button>
      </div>
      <div class="mkts" id="mkts"></div>''',
'''      <div class="wsp-lbl">Include markets</div>
      <div class="wsp-chips mkt-palette" id="bldMk"></div>''',
'1 HTML: unified market palette'
)

# ---- 2. CSS: Add styles for unified market palette chips ----
rep(
'''.mkts{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px;padding-top:15px;border-top:1px solid var(--line-soft)}
.mkt{font-size:12px;font-weight:700;padding:6px 11px;border-radius:99px;
  background:var(--raise);color:var(--faint);border:1px solid transparent;transition:all .15s}
.mkt.on{background:var(--green-wash);color:var(--green-ink);border-color:var(--green)}''',
'''.mkts{display:flex;flex-wrap:wrap;gap:7px;margin-top:16px;padding-top:15px;border-top:1px solid var(--line-soft)}
.mkt{font-size:12px;font-weight:700;padding:6px 11px;border-radius:99px;
  background:var(--raise);color:var(--faint);border:1px solid transparent;transition:all .15s}
.mkt.on{background:var(--green-wash);color:var(--green-ink);border-color:var(--green)}

/* Unified market palette - replaces both "Include markets" and #mkts */
.mkt-palette{display:flex;flex-wrap:wrap;gap:7px}
.mkt-chip{display:inline-flex;align-items:center;gap:6px;background:var(--card-2);
  border:1px solid var(--line);color:var(--soft);font:inherit;font-weight:700;
  font-size:13px;padding:9px 14px;border-radius:99px;cursor:pointer;
  transition:background .15s,border-color .15s,color .15s,opacity .15s,transform .1s}
.mkt-chip.on{background:var(--red);border-color:var(--red);color:#fff;
  box-shadow:0 2px 8px rgba(230,57,70,.3)}
.mkt-chip.locked{opacity:.35;cursor:not-allowed}
.mkt-chip .tier-badge{display:inline-flex;align-items:center;justify-content:center;
  min-width:18px;height:18px;font-size:10px;font-weight:800;color:var(--faint);
  background:var(--raise);border:1px solid var(--line-soft);border-radius:99px;padding:0 6px}
.mkt-chip.on .tier-badge{background:rgba(255,255,255,.2);color:#fff;border-color:rgba(255,255,255,.3)}
.mkt-chip.unlocking{animation:mktUnlock .35s ease}
@keyframes mktUnlock{0%{transform:scale(.92);opacity:0}60%{transform:scale(1.04)}100%{transform:scale(1);opacity:1}}
@media(max-width:560px){.mkt-chip{padding:8px 11px;font-size:12px}.mkt-chip .tier-badge{min-width:16px;height:16px;font-size:9px;padding:0 5px}}''',
'2 CSS: unified market palette styles'
)

# ---- 3. JS: Build market config and render unified palette in renderBuilder ----
rep(
'''function renderBuilder(){
  var p=riskParams(BUILD.risk);
  (function(){
    var lg=$("bldLeagues"),mkw=$("bldMk"); if(!lg||!mkw) return;
    lg.querySelectorAll("[data-btp]").forEach(function(c){c.classList.toggle("on",(c.dataset.btp==="true")===!!TOP_ONLY);});
    mkw.querySelectorAll("[data-bmk]").forEach(function(c){c.classList.toggle("on",BUILD.mk[c.dataset.bmk]!==false);});
    if(!lg._w){lg._w=1;lg.querySelectorAll("[data-btp]").forEach(function(c){c.addEventListener("click",function(){setTopOnly(c.dataset.btp==="true");renderBuilder();});});}
    if(!mkw._w){mkw._w=1;mkw.querySelectorAll("[data-bmk]").forEach(function(c){c.addEventListener("click",function(){var k=c.dataset.bmk;var on=Object.keys(BUILD.mk).filter(function(x){return BUILD.mk[x];});if(BUILD.mk[k]&&on.length===1)return;BUILD.mk[k]=!BUILD.mk[k];renderBuilder();});});}
  })();''',
'''function renderBuilder(){
  var p=riskParams(BUILD.risk);
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
  })();''',
'3 JS: render unified market palette in renderBuilder'
)

# ---- 4. Remove the old #mkts rendering block (lines 2763-2767) ----
rep(
'''  // markets chips
  var groups=[["Double chance",0],["Over 1.5",0],["Outright wins",1],
    ["Any team",1],["Over 2.5",2],["Both score",2]];
  $("mkts").innerHTML=groups.map(function(g){
    return "<span class='mkt"+(p.tier>=g[1]?" on":"")+"'>"+g[0]+"</span>";}).join("");''',
'''  // markets chips - now rendered in unified palette above''',
'4 Remove old #mkts rendering'
)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('\n%d edits applied' % n)