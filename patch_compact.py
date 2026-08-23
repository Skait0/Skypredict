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

# 1. Move lmore-x to TOP of expanded area in list mode (inside more-pad)
rep(
'''    "<div class='lmore'>"+moreHTML(f)+"<button class='lmore-x' type='button'>Collapse \\u25b4</button></div>"+''',
'''    "<div class='lmore'><button class='lmore-x' type='button' aria-label='Collapse'>\u25b4</button>"+moreHTML(f)+"</div>"+''',
'1 move lmore-x to top in listRowHTML'
)

# 2. Make list mode expanded content more compact
rep(
'''.more-pad{padding:3px 12px 11px}
.grp{margin-top:10px}
.grp h4{margin-bottom:6px}
.opts{gap:6px}
.opt{padding:9px 11px}
.opt .p{margin-top:3px}''',
'''.more-pad{padding:2px 10px 8px}
.grp{margin-top:7px}
.grp h4{font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin-bottom:4px}
.opts{gap:4px}
.opt{padding:6px 9px;font-size:12.5px;border-radius:var(--r-sm)}
.opt .n{font-size:11.5px;font-weight:600}
.opt .p{font-size:15px;margin-top:2px;font-weight:800}''',
'2 compact list mode more-pad'
)

# 3. Make dense list mode lmore area compact (already has some rules, extend them)
rep(
'''.lrow.open .lmore{max-height:2000px;padding-top:7px}
.lmore{font-size:12.5px}
.lmore-x{margin-top:7px;padding:7px 12px}''',
'''.lrow.open .lmore{max-height:2000px;padding-top:0}
.lmore{font-size:12.5px}
.lmore-x{margin-top:0;padding:6px 10px;font-size:11px;border-radius:var(--r-sm);width:auto;min-width:36px;align-self:flex-start}''',
'3 compact dense list lmore-x at top'
)

# 4. In list mode, the lmore-x at top should be inline with the header, not full width
# Add style for lmore-x when it's the first child
rep(
'''.lmore-close{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:var(--r-sm);
  background:var(--raise);border:1px solid var(--line-soft);color:var(--soft);cursor:pointer;
  display:grid;place-items:center;padding:0;opacity:.7;transition:opacity .16s,background .16s}
.lmore-close svg{width:11px;height:11px}
.lmore-close:hover{opacity:1;background:var(--card);color:var(--text)}
.m .lmore-close{display:none}''',
'''.lmore-close{position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:var(--r-sm);
  background:var(--raise);border:1px solid var(--line-soft);color:var(--soft);cursor:pointer;
  display:grid;place-items:center;padding:0;opacity:.7;transition:opacity .16s,background .16s}
.lmore-close svg{width:11px;height:11px}
.lmore-close:hover{opacity:1;background:var(--card);color:var(--text)}
.m .lmore-close{display:none}

/* lmore-x at top of expanded area - compact, inline style */
.lmore > .lmore-x:first-child{margin:0 0 4px 0;padding:4px 8px;font-size:11px;border-radius:var(--r-sm);
  width:auto;min-width:32px;background:var(--card-2);border-color:var(--line-soft);color:var(--faint)}
.lmore > .lmore-x:first-child:hover{background:var(--card);color:var(--text);border-color:var(--soft)}''',
'4 lmore-x first-child compact style'
)

# 5. Also tighten the opt buttons in card mode (used by moreHTML)
rep(
'''.lmore .opt{padding:7px 10px;font-size:13px;white-space:nowrap}
.lmore .opt .n{font-size:12px}
.lmore .opt .p{font-size:15px;margin-top:3px}''',
'''.lmore .opt{padding:6px 9px;font-size:12.5px;white-space:nowrap;border-radius:var(--r-sm)}
.lmore .opt .n{font-size:11.5px;font-weight:600}
.lmore .opt .p{font-size:14.5px;margin-top:2px;font-weight:800}''',
'5 tighten lmore .opt buttons'
)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('\n%d edits applied' % n)