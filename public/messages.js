/* THE MESSAGE BOARD (owner, 14 Oct 2026: "make the notice a message board ... send
   broadcast to all users and also specific users ... a whole text editing suite
   where i can apply tiny gifs, emojis, links"). Three parts, one file:
   - clean(): the only HTML a message may carry. The server runs it before a
     message is stored (api/account.js send) and the page runs it again before
     anything is drawn, so neither side trusts the other.
   - the reader's side: the inbox (avatar menu > Messages), the badge on the
     avatar, and the newest unread message as a banner under the header. Readers
     cannot reply (owner, 14 Oct 2026: "remove the reply for readers except i
     say otherwise"); api/account.js REPLIES switches it back on.
   - the admin's side: the Messages tab (editor, who to send to, conversations)
     and the Readers tab (every account, search by name or email, the full
     customer view). Admin only: the server refuses every admin action to anyone
     else. Plain ES5, like account-ui.js. */
(function(root){
  "use strict";
  /* ---------------------------------------------------------------- shared */
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  /* Animated emoji: Google's Noto animated emoji (CC BY 4.0), cut to 64px in public/emo. */
  var EMO=[["1f525","fire"],["26bd","ball"],["1f3c6","trophy"],["1f947","gold medal"],["1f4b8","money flying"],["1f911","money face"],
    ["1f389","party"],["1f38a","confetti"],["1f973","party face"],["1f680","rocket"],["1f4af","100"],["1f44f","clap"],["1f64c","raised hands"],
    ["1f4aa","muscle"],["1f929","star struck"],["1f60e","cool"],["1f60d","heart eyes"],["1f602","tears of joy"],["1f923","rolling"],
    ["1f92f","mind blown"],["1f440","eyes"],["1f52e","crystal ball"],["2728","sparkles"],["1f31f","glowing star"],["26a1","lightning"],
    ["1f4a5","boom"],["2705","check"],["274c","cross"],["26a0_fe0f","warning"],["1f6a8","siren"],["1f514","bell"],["1f4e3","megaphone"],
    ["1f381","gift"],["1f451","crown"],["1f48e","gem"],["1f3af","bullseye"],["1f4c8","chart up"],["1f3b2","dice"],["1f340","clover"],
    ["1f64f","pray"],["2764_fe0f","heart"],["1f44d","thumbs up"],["1f44b","wave"],["1f91d","handshake"],["1fae1","salute"],["1f609","wink"],
    ["1f60f","smirk"],["1f92a","zany"],["1f914","thinking"],["1f92b","shush"],["1f924","drool"],["1f975","hot"],["1f976","cold"],
    ["1f631","scream"],["1f62d","sob"],["1f97a","pleading"],["1f621","angry"],["1f480","skull"],["1f47b","ghost"],["1f410","goat"],
    ["1f981","lion"],["1f308","rainbow"],["23f0","alarm"],["23f3","hourglass"],["1f198","sos"],
    /* 69 more (owner, 14 Oct 2026: "more tiny animated emojis") */
    ["1fa84","magic wand"],["1f948","silver medal"],["1f949","bronze medal"],["1f3c1","chequered flag"],["1f37e","champagne"],["1f37b","cheers"],
    ["1f942","clink"],["1f37f","popcorn"],["1f3b0","slot machine"],["1f4c9","chart down"],["1f600","grin"],["1f601","beaming"],
    ["1f606","laughing"],["1f605","sweat smile"],["1f643","upside down"],["1f970","in love"],["1f618","kiss"],["1f61c","tongue wink"],
    ["1f917","hug"],["1f92d","oops"],["1f644","eye roll"],["1f62c","grimace"],["1f634","sleepy"],["1f974","woozy"],
    ["1f635","dizzy face"],["1f920","cowboy"],["1f913","nerd"],["1f9d0","monocle"],["1f615","confused"],["1f62e","wow"],
    ["1f633","flushed"],["1f628","fearful"],["1f622","cry"],["1f624","huff"],["1f92c","cursing"],["1f608","devil"],
    ["1f921","clown"],["1f4a9","poop"],["1f916","robot"],["1f648","see no evil"],["1f49a","green heart"],["1f49b","yellow heart"],
    ["1f494","broken heart"],["1f496","sparkling heart"],["1f4ab","dizzy"],["1f44c","ok"],["270c_fe0f","victory"],["1f91e","fingers crossed"],
    ["1f919","call me"],["1f449","point right"],["1f446","point up"],["1f447","point down"],["1f44a","fist bump"],["270a","raised fist"],
    ["1f483","dance"],["1f327_fe0f","rain"],["1f32a_fe0f","tornado"],["1f30b","volcano"],["1f40d","snake"],["1f98a","fox"],
    ["1f985","eagle"],["1f984","unicorn"],["1f9e0","brain"],["1f60a","smile"],["1f62e_200d_1f4a8","phew"],["1f972","tear smile"],
    ["1f978","disguise"],["1f92e","sick"],["1f62a","sleepy tear"]];
  var TAGS={b:1,strong:1,i:1,em:1,u:1,s:1,strike:1,br:1,p:1,ul:1,ol:1,li:1,a:1,img:1,span:1,h3:1,blockquote:1};
  var DROP={script:1,style:1,iframe:1,object:1,embed:1,svg:1,math:1,template:1,noscript:1,textarea:1,select:1,title:1,head:1};
  var CLS=["m-big","m-small","m-gold","m-red","m-green","m-glow","m-center","m-wavy"];
  /* Emote motions, like a stream chat's emote modifiers (owner, 14 Oct 2026). CSS only. */
  var MOT=[["","None"],["m-wave","Wave"],["m-bounce","Bounce"],["m-wiggle","Wiggle"],["m-jello","Jello"],["m-spin","Spin"],["m-pulse","Pulse"]];
  function motOf(c){ var k=String(c||"").split(/\s+/).filter(function(x){ return x&&MOT.some(function(m){ return m[0]===x; }); })[0]; return k?" "+k:""; }
  var EMO_RE=/^\/emo\/[0-9a-f_]{2,20}\.webp$/;
  /* The Wizard's own emotes (owner, 14 Oct 2026; drawn from our logo with Nano
     Banana). [file, label, motion]: two-frame ones animate in the file and get
     no motion; the rest move with one of the MOT motions. Drawn bigger. */
  var WIZ_EMO=[["rave","glow sticks","m-bounce"],["rave2","glow sticks crossed","m-bounce"],["hype","hype","m-bounce"],["hype2","screaming joy","m-wiggle"],
    ["party","party","m-bounce"],["dj","dj","m-bounce"],["beat","on the beat","m-bounce"],["dance","dance",""],["clap","clap",""],["lol","lol",""],
    ["champagne","champagne","m-wiggle"],["trophy","trophy","m-bounce"],["money","money","m-bounce"],["fire","on fire","m-pulse"],["goal","goal","m-bounce"],
    ["header","header","m-wiggle"],["score","scores","m-bounce"],["keepy","keepy ups",""],["bicycle","bicycle kick","m-wiggle"],["banker","banker","m-jello"],
    ["landed","landed","m-bounce"],["x10","x10","m-bounce"],["crystal","crystal ball","m-pulse"],["crystal2","crystal ball glowing","m-pulse"],["wand","magic wand",""],
    ["spell","spell","m-pulse"],["lock","lock it in","m-wiggle"],["study","studying","m-wiggle"],["think","thinking","m-pulse"],["chef","chef kiss","m-pulse"],
    ["bless","blessing","m-pulse"],["pray","please land","m-pulse"],["gg","gg","m-bounce"],["cool","cool","m-pulse"],["heart","heart","m-pulse"],
    ["hi","hi","m-wave"],["wave","wave","m-wave"],["salute","salute","m-wave"],["pump","fist pump","m-bounce"],["point","point up","m-wiggle"],
    ["shock","shock","m-jello"],["sus","sus","m-wiggle"],["shh","shh","m-wiggle"],["popcorn","popcorn","m-bounce"],["facepalm","facepalm","m-jello"],
    ["nope","nope","m-wiggle"],["rage","rage","m-wiggle"],["cry","cry","m-jello"],["rip","torn slip","m-jello"],["sleep","sleep","m-pulse"],
    ["var","var","m-pulse"],["red","red card","m-wiggle"],["whistle","whistle","m-wiggle"],["scarf","scarf","m-wave"]];
  var WIZ_RE=/^\/emo\/wiz-[a-z0-9]{1,12}\.webp$/;
  /* The Founding Wizard crest (owner, 16 Oct 2026), the one site image a message may carry beyond emoji. */
  var FW_RE=/^\/fw\/crest(-sm)?\.webp$/;
  var GIF_RE=/^https:\/\/media\d?\.giphy\.com\/media\/[A-Za-z0-9._\-\/]{1,200}\.(gif|webp)$/;
  function unent(s){ return String(s).replace(/&nbsp;|&#160;/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">"); }
  /* A link goes to the web over https, or somewhere on our own site. */
  function okHref(u){ u=unent(u).replace(/^\s+|\s+$/g,"");
    return /^https:\/\/[^\s"'<>\\]+$/i.test(u)||/^\/(?!\/)[^\s"'<>\\]*$/.test(u)?u:null; }
  function attrsOf(s){ var o={}, re=/([a-zA-Z_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g, m;
    while((m=re.exec(s||""))) o[m[1].toLowerCase()]=m[2]!=null?m[2]:m[3]!=null?m[3]:m[4]; return o; }
  function classOf(c){ var k=String(c||"").split(/\s+/).filter(function(x){ return CLS.indexOf(x)>=0; }); return k.length?" class=\""+k.join(" ")+"\"":""; }
  function clean(html){
    var out="", drop=0;
    String(html==null?"":html).slice(0,40000).replace(/<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|(<)/g,
      function(m,close,tag,attrs,text,lt){
        if(text!=null){ if(!drop) out+=text.replace(/&(?![a-zA-Z]{2,8};|#\d{1,7};|#x[0-9a-fA-F]{1,6};)/g,"&amp;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); return ""; }
        if(lt){ if(!drop) out+="&lt;"; return ""; }
        if(!tag) return "";
        tag=tag.toLowerCase();
        if(DROP[tag]){ if(!/\/\s*$/.test(attrs||"")) drop=Math.max(0,drop+(close?-1:1)); return ""; }
        if(drop) return "";
        if(tag==="div") tag="p";
        if(!TAGS[tag]) return "";
        if(close){ if(tag!=="br"&&tag!=="img") out+="</"+tag+">"; return ""; }
        var a=attrsOf(attrs);
        if(tag==="br"){ out+="<br>"; return ""; }
        if(tag==="img"){ var src=unent(a.src||""), alt=esc(unent(a.alt||"").slice(0,40));
          if(EMO_RE.test(src)) out+="<img class=\"m-emo"+motOf(a["class"])+"\" src=\""+esc(src)+"\" alt=\""+alt+"\" width=\"28\" height=\"28\">";
          else if(WIZ_RE.test(src)) out+="<img class=\"m-emo m-wiz"+motOf(a["class"])+"\" src=\""+esc(src)+"\" alt=\""+alt+"\" width=\"44\" height=\"44\">";
          else if(FW_RE.test(src)) out+="<img class=\"m-crest\" src=\""+esc(src)+"\" alt=\""+alt+"\" width=\"160\" height=\"185\">";
          else if(GIF_RE.test(src)) out+="<img class=\"m-gif\" src=\""+esc(src)+"\" alt=\""+alt+"\" loading=\"lazy\">";
          return ""; }
        if(tag==="a"){ var h=okHref(a.href||""); out+=h?"<a href=\""+esc(h)+"\""+(h.charAt(0)==="/"?"":" target=\"_blank\" rel=\"noopener nofollow\"")+">":"<a>"; return ""; }
        out+="<"+tag+(/^(span|p|h3|li|blockquote)$/.test(tag)?classOf(a["class"]):"")+">";
        return "";
      });
    return out;
  }
  /* The words alone, for previews and the log. */
  function textOf(html){ return unent(String(html||"").replace(/<img[^>]*alt="([^"]*)"[^>]*>/g," $1 ").replace(/<(br|\/p|\/li|\/h3)[^>]*>/g," ").replace(/<[^>]*>/g,""))
    .replace(/\s+/g," ").replace(/^\s+|\s+$/g,""); }
  function isEmpty(html){ return !textOf(html)&&!/<img /.test(html); }
  /* Every account's first message (owner, 14 Oct 2026: "a welcome wizardy kind of
     message that also tells users how to use our website and why our site is the
     best"). Served by the inbox, dated when the account was made. */
  function emo(cp,alt){ return "<img class=\"m-emo\" src=\"/emo/"+cp+".webp\" alt=\""+alt+"\" width=\"28\" height=\"28\">"; }
  var WELCOME="<h3 class=\"m-big m-gold\">Welcome to the Wizard's tower "+emo("1f52e","crystal ball")+"</h3>"+
    "<p>The crystal ball is warm and today's board is live. Here is how to make it work for you:</p><ul>"+
    "<li><b>Read the board.</b> Every game gets our chance on every market, worked out from real results. The higher the %, the stronger the pick.</li>"+
    "<li><b>Build a slip.</b> Tap the picks you like, or let <b>Build me a slip</b> pick for you, and choose how safe you want it.</li>"+
    "<li><b>Book it in one tap.</b> Get a booking code for SportyBet, Bet9ja, BetKing, betPawa, 1xBet or Betway. Got a code already? Paste it in the converter and move it to another bookie.</li>"+
    "<li><b>Edit for me.</b> One tap swaps a risky leg for a safer bet on the same game.</li>"+
    "<li><b>Follow it live.</b> Your slips track themselves and tell you when they land "+emo("1f389","party")+"</li></ul>"+
    "<p><b><span class=\"m-glow\">Why the Wizard?</span></b> Our picks are numbers, not vibes. We show our record every day, wins and losses, so you always know how we are doing. Six bookies, one place, free.</p>"+
    "<p>Got a question, an idea or feedback? Reply right here, the Wizard reads every message. Or find us on <a href=\"https://t.me/soccerwizardTG\" target=\"_blank\" rel=\"noopener nofollow\">Telegram</a> or <a href=\"https://x.com/soccerwizardhq\" target=\"_blank\" rel=\"noopener nofollow\">X</a> "+emo("2728","sparkles")+"</p>"+
    "<p class=\"m-small\">18+ · Stake only what you can afford to lose.</p>";
  /* GIFT A PASS (owner, 16 Oct 2026): the message a gifted user gets, built here so
     the server (api/account.js) and the admin's preview are the same words. A gift
     opens with the gift box, in gold like the welcome; a reimbursement says so,
     plainly. No `until` (the preview) leaves the date out: the server stacks the
     days on whatever pass they hold, so only it knows the end. */
  function giftHtml(reason,label,until,note){
    var day=until?new Date(until).toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"Africa/Lagos"}):"";
    var head=reason==="gift"?"<h3 class=\"m-big m-gold\">"+emo("1f381","gift")+" A gift from Soccerwizard</h3>":"<h3 class=\"m-big\">Reimbursement</h3>";
    var line="We've put a "+label+" on your account"+(reason==="gift"?", on us":" to make it right")+
      ": 20 booking codes a day"+(day?" until "+day:"")+".";
    var esc=function(s){ return String(s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); };
    return head+"<p>"+line+"</p>"+(note?"<p>"+esc(note).replace(/\n/g,"<br>")+"</p>":"");
  }
  /* WELCOME, FOUNDING WIZARD (owner, 16 Oct 2026): sent once, when someone's first
     founder pass is paid (api/pay.js). The crest leads, like the gift box. */
  function founderHtml(no){
    return "<p><img src=\"/fw/crest.webp\" alt=\"Founding Wizard crest\"></p>"+
      "<h3 class=\"m-big m-gold\">Welcome, Founding Wizard"+(no?" No. "+no:"")+"</h3>"+
      "<p>You are one of the first 500 to back Soccerwizard, and we will not forget it. "+
      "Your Founding Wizard crest is on your profile for good, and your first three month passes stay at the founders' price.</p>"+
      "<p>Thank you for believing in the Wizard early. Reply here any time: we read every message.</p>";
  }
  var api={clean:clean,textOf:textOf,isEmpty:isEmpty,okHref:okHref,EMO:EMO,MOT:MOT,WIZ:WIZ_EMO,WELCOME:WELCOME,giftHtml:giftHtml,founderHtml:founderHtml};
  if(typeof module!=="undefined"&&module.exports){ module.exports=api; return; }
  if(!root.document) return;

  /* ------------------------------------------------------------------ page */
  var d=root.document;
  function acct(){ return root.swAcct||{st:{}}; }
  function on(){ var a=acct(); return !!(a.st&&a.st.on&&a.req); }
  function isAdmin(){ if(root.swAdminLive!==true) return false; try{ return localStorage.getItem("sw.role")==="admin"; }catch(e){ return false; } }
  function ago(iso){ var t=Date.parse(iso); if(!isFinite(t)) return "";
    var m=Math.round((Date.now()-t)/60000);
    return m<1?"just now":m<60?m+" min ago":m<1440?Math.round(m/60)+" h ago":Math.round(m/1440)===1?"yesterday":Math.round(m/1440)+" days ago"; }
  function when(iso){ try{ return new Date(iso).toLocaleString(undefined,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}); }catch(e){ return ""; } }
  var CSS=
    /* the message itself, everywhere it is drawn */
    ".m-body{font-size:14px;line-height:1.5;overflow-wrap:anywhere}.m-body p,.m-body h3,.m-body ul,.m-body ol,.m-body blockquote{margin:0 0 8px}.m-body>:last-child{margin-bottom:0}"+
    ".m-body h3{font-size:16px;font-weight:800}.m-body ul,.m-body ol{padding-left:20px}.m-body li{margin:3px 0}.m-body a{color:var(--accent);font-weight:700}"+
    ".m-body blockquote{border-left:3px solid var(--accent);padding-left:10px;color:var(--soft)}"+
    ".m-big{font-size:1.3em;font-weight:800}.m-crest{display:block;width:160px;height:auto;margin:4px auto 2px}.m-small{font-size:.82em;color:var(--faint)}.m-gold{color:var(--accent)}.m-red{color:var(--red-ink)}.m-green{color:var(--green-ink)}.m-center{text-align:center}"+
    ".m-glow{color:var(--accent);text-shadow:0 0 10px rgba(242,184,75,.75),0 0 2px rgba(242,184,75,.9)}"+
    ".m-emo{width:1.75em;height:1.75em;vertical-align:-.45em;display:inline-block}.m-gif{display:block;max-width:100%;height:auto;max-height:180px;border-radius:8px;margin:6px 0}"+
    /* the banner under the header */
    ".swm-ban{display:flex;gap:12px;align-items:flex-start;max-width:1100px;margin:10px auto 0;padding:12px 14px;border-radius:12px;border:1px solid var(--accent);"+
      "background:linear-gradient(135deg,rgba(242,184,75,.14),rgba(230,57,70,.08)) var(--card);box-sizing:border-box;animation:swmIn .35s cubic-bezier(.23,1,.32,1)}"+
    "@keyframes swmIn{from{opacity:0;transform:translateY(-6px)}}"+
    ".swm-ban .m-body{flex:1;min-width:0;max-height:4.6em;overflow:hidden;-webkit-mask-image:linear-gradient(#000 70%,transparent);mask-image:linear-gradient(#000 70%,transparent)}"+
    ".swm-ban .m-body .m-gif{display:none}.swm-gifchip{display:inline-block;margin-top:2px;font-size:11.5px;font-weight:800;color:var(--accent);border:1px solid var(--accent-rim);border-radius:99px;padding:2px 8px}.swm-ban-b{display:flex;flex-direction:column;gap:6px;flex:none}"+
    ".swm-ban button{border:0;border-radius:6px;font:inherit;font-size:12.5px;font-weight:800;padding:6px 10px;cursor:pointer}"+
    ".swm-ban .swm-open{background:var(--accent);color:var(--on-accent)}.swm-ban .swm-x{background:none;color:var(--soft)}"+
    "@media(max-width:720px){.swm-ban{margin:8px 12px 0}}"+
    /* the inbox and threads */
    ".swm-thread{display:flex;flex-direction:column;gap:10px;margin:4px 0 14px}"+
    ".swm-msg{max-width:88%;padding:11px 13px;border-radius:14px;background:var(--card);border:1px solid var(--line)}"+
    ".swm-msg.swm-me{align-self:flex-end;background:var(--card-2);border-color:transparent;border-bottom-right-radius:4px}.swm-msg.swm-wiz{border-bottom-left-radius:4px}"+
    ".swm-msg.swm-new{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent-rim)}"+
    ".swm-meta{display:flex;gap:8px;align-items:center;font-size:11.5px;font-weight:700;color:var(--faint);margin-top:6px}.swm-meta button{margin-left:auto}"+
    ".swm-who{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;color:var(--accent);margin-bottom:6px}.swm-who img{width:22px;height:22px;border-radius:50%}"+
    ".swm-fold{display:flex;flex-direction:column}.swm-fold.swm-shut{cursor:pointer}"+
    ".swm-bc .swa-st{min-width:0;flex:1}.swm-bc-hd{display:block;width:100%;border:0;background:none;padding:0;color:inherit;font:inherit;text-align:left;cursor:pointer}"+
    ".swm-bc-hd b{display:block;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.swm-bc-hd small{display:block}"+
    ".swm-bc .m-body{margin-top:8px}.swm-bc .m-body[hidden]{display:none}"+
    ".swm-bc{flex-wrap:wrap}.swm-bc-acts{display:flex;gap:6px;flex-wrap:wrap;flex:none}.swa-pillbtn.swm-del-b{color:var(--red-ink)}"+
    "@media(max-width:520px){.swm-bc-acts{flex:1 1 100%;margin-top:8px}}"+
    ".swm-gone{border-top:1px solid var(--line)}.swm-gone summary{cursor:pointer;padding:12px;font-size:12.5px;font-weight:700;color:var(--faint)}.swm-gone-t{display:block;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"+
    ".swm-shut .m-body{max-height:3em;overflow:hidden;-webkit-mask-image:linear-gradient(#000 45%,transparent);mask-image:linear-gradient(#000 45%,transparent)}.swm-shut .m-body .m-gif{display:none}"+
    ".swm-tog{margin-left:auto;border:0;background:none;color:var(--accent);font:inherit;font-size:11.5px;font-weight:800;cursor:pointer;padding:2px 4px}.swm-meta .swm-tog{margin-left:auto}.swm-meta .swm-tog+.swm-del{margin-left:0}"+
    ".swm-del{border:0;background:none;color:var(--faint);font:inherit;font-size:11.5px;font-weight:800;cursor:pointer;padding:2px 4px}.swm-del:hover,.swm-del.swm-arm{color:var(--red-ink)}"+
    ".swm-rep{display:flex;gap:8px;align-items:flex-end;position:sticky;bottom:0;background:var(--bg);padding:8px 0 4px}"+
    ".swm-ping{display:flex;gap:10px;align-items:center;margin:0 0 12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);font-size:13.5px;line-height:1.35}.swm-ping span{flex:1}.swm-ping .swm-send{height:38px;padding:0 14px;font-size:13px}"+
    ".swm-rep textarea{flex:1;min-height:44px;max-height:140px;resize:vertical;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;font-size:14.5px;padding:10px 12px;box-sizing:border-box}"+
    ".swm-tag{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);border:1px solid var(--line);border-radius:4px;padding:1px 5px}"+
    /* the send button and its answer */
    ".swm-send{position:relative;flex:none;height:44px;padding:0 18px;border:0;border-radius:10px;background:var(--accent);color:var(--on-accent);font:inherit;font-size:14px;font-weight:800;cursor:pointer;transition:background .2s,transform .1s}"+
    ".swm-send:active{transform:scale(.97)}.swm-send[disabled]{opacity:.7;cursor:default}.swm-send.swm-ok{background:var(--green);color:#fff;opacity:1}.swm-send.swm-bad{background:var(--red-fill);color:#fff;opacity:1}"+
    ".swm-send.swm-wide{width:100%;margin:12px 0 4px;height:48px;font-size:15px}"+
    /* the editor */
    ".swm-ed{border:1px solid var(--line);border-radius:12px;background:var(--card);overflow:hidden}.swm-ed:focus-within{border-color:var(--accent)}"+
    ".swm-tb{display:flex;flex-wrap:wrap;gap:2px;padding:6px;border-bottom:1px solid var(--line);background:var(--card-2)}"+
    ".swm-tb button{min-width:34px;height:32px;padding:0 8px;border:0;border-radius:6px;background:none;color:var(--text);font:inherit;font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px}"+
    ".swm-tb button:hover,.swm-tb button[aria-pressed=true]{background:var(--raise)}.swm-tb .swm-sep{width:1px;background:var(--line);margin:4px 3px}"+
    ".swm-area{min-height:150px;max-height:420px;overflow-y:auto;padding:12px 14px;outline:none}.swm-area:empty:before{content:attr(data-ph);color:var(--faint)}"+
    ".swm-pop{border-top:1px solid var(--line);padding:10px;background:var(--card-2)}.swm-pop[hidden]{display:none}"+
    /* the phone picker, in the keyboard's place */
    ".swm-pop.swm-sheet{position:fixed;left:0;right:0;bottom:0;z-index:400;max-height:min(55vh,440px);overflow-y:auto;overscroll-behavior:contain;"+
      "border:1px solid var(--line);border-bottom:0;border-radius:16px 16px 0 0;padding:0 12px calc(12px + env(safe-area-inset-bottom));box-shadow:0 -10px 30px rgba(0,0,0,.45);"+
      "animation:swmUp .22s cubic-bezier(.23,1,.32,1)}@keyframes swmUp{from{transform:translateY(40px);opacity:0}}"+
    ".swm-sh-hd{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;margin:0 -12px 8px;padding:10px 12px;background:var(--card-2);border-bottom:1px solid var(--line)}"+
    ".swm-sh-hd span{font-size:13px;font-weight:800;color:var(--soft)}.swm-sh-done{border:0;border-radius:8px;background:var(--accent);color:var(--on-accent);font:inherit;font-size:13px;font-weight:800;padding:6px 14px;cursor:pointer}"+
    ".swm-sheet .swm-wizs,.swm-sheet .swm-emos,.swm-sheet .swm-gifs{max-height:none;overflow:visible}"+
    "@media (prefers-reduced-motion:reduce){.swm-pop.swm-sheet{animation:none}}"+
    ".m-emo.m-wiz{width:2.75em;height:2.75em;vertical-align:-1em}"+
    /* The tabs sit above the emotes, and the top row has room to bounce (owner,
       14 Oct 2026: the emotes "jump up way too close to the top that it hinders
       selection between the emotes and emoji"). */
    ".swm-etabs{position:relative;z-index:2;background:var(--card-2);display:flex;gap:4px;margin-bottom:8px}.swm-etabs button{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 12px;border:0;border-radius:8px;background:none;color:var(--soft);font:inherit;font-size:12.5px;font-weight:800;cursor:pointer}"+
    ".swm-etabs button[aria-selected=true]{background:var(--raise);color:var(--text)}.swm-etabs img{width:18px;height:18px}"+
    ".swm-wizs{display:grid;grid-template-columns:repeat(auto-fill,minmax(58px,1fr));gap:4px;padding-top:22px;max-height:260px;overflow-y:auto;overflow-x:hidden}.swm-wizs[hidden]{display:none}"+
    ".swm-wizs button{aspect-ratio:1;border:0;border-radius:10px;background:none;cursor:pointer;padding:3px}.swm-wizs button:hover{background:var(--raise)}.swm-wizs img{width:100%;height:100%}"+
    ".swm-emos{display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:4px;max-height:210px;overflow-y:auto}"+
    ".swm-emos button{aspect-ratio:1;border:0;border-radius:8px;background:none;cursor:pointer;padding:4px}.swm-emos button:hover{background:var(--raise)}.swm-emos img{width:100%;height:100%}"+
    ".swm-gifs{columns:3 96px;column-gap:6px;max-height:260px;overflow-y:auto;margin-top:8px}.swm-gifs button{display:block;width:100%;border:0;padding:0;margin:0 0 6px;background:none;cursor:pointer;border-radius:6px;overflow:hidden}.swm-gifs img{width:100%;display:block}"+
    /* gift a pass (admin reader card) */
    ".swm-giftf{margin:2px 0 16px}.swm-giftf .swa-lbl{margin:14px 0 6px}.swm-giftf .swa-lbl small{font-weight:600;margin-left:4px}"+
    ".swm-giftf .swa-seg{display:inline-flex;flex-wrap:wrap}"+
    ".swm-gnote{display:block;height:auto;min-height:84px;padding:10px 12px;font-size:14px;font-weight:500;line-height:1.5;resize:vertical}"+
    ".swm-gprev{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.55;color:var(--soft);overflow-wrap:anywhere}"+
    ".swm-gprev h3{margin:0 0 6px;font-size:15px}.swm-gprev p{margin:0 0 6px}.swm-gprev p:last-child{margin:0}"+
    ".swm-giftf .swa-outbtn{margin:16px 0 0}"+
    ".swm-row{display:flex;gap:6px}.swm-row .swa-in{flex:1;height:38px;font-size:14px}.swm-fine{font-size:11px;color:var(--faint);margin:6px 2px 0}"+
    /* who it goes to */
    ".swm-to{display:flex;gap:6px;margin:0 0 10px}.swm-to button{flex:1;height:38px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--soft);font:inherit;font-size:13px;font-weight:800;cursor:pointer}"+
    ".swm-to button[aria-pressed=true]{background:var(--red-fill);border-color:transparent;color:#fff}"+
    ".swm-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.swm-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 6px 4px 4px;border-radius:99px;background:var(--card-2);font-size:12.5px;font-weight:700}"+
    ".swm-chip img{width:22px;height:22px;border-radius:50%}.swm-chip button{border:0;background:none;color:var(--faint);font:inherit;font-size:15px;cursor:pointer;padding:0 4px;line-height:1}"+
    /* readers */
    ".swm-list{max-height:430px;overflow-y:auto}.swm-r{display:flex;align-items:center;gap:11px;width:100%;padding:10px 12px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;box-sizing:border-box}"+
    ".swm-r+.swm-r{border-top:1px solid var(--line)}.swm-r:hover,.swm-r.swm-hi{background:var(--card-2)}.swm-r img{width:36px;height:36px;border-radius:50%;flex:none;background:var(--card-2)}"+
    ".swm-r>span:not(.swm-unr){flex:1;min-width:0}.swm-r b{display:block;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.swm-r small{display:block;font-size:12px;color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}"+
    ".swm-r i{font-style:normal;font-size:11px;font-weight:700;color:var(--faint);flex:none}.swm-r mark{background:none;color:var(--accent)}"+
    ".swm-unr{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--red);color:#fff;font-size:10.5px;font-weight:800;line-height:18px;text-align:center;flex:none;box-sizing:border-box}"+
    ".swm-hero{display:flex;gap:14px;align-items:center;padding:16px;border:1px solid var(--line);border-radius:14px;background:linear-gradient(135deg,rgba(242,184,75,.12),transparent 60%) var(--card);margin-bottom:12px}"+
    ".swm-hero img{width:72px;height:72px;border-radius:50%;box-shadow:0 0 0 3px var(--accent-rim)}.swm-hero b{display:block;font-size:19px;font-weight:800}.swm-hero small{display:block;font-size:13px;color:var(--soft);overflow-wrap:anywhere}"+
    ".swm-pills{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.swm-pills span{font-size:11px;font-weight:800;padding:2px 7px;border-radius:99px;background:var(--card-2);color:var(--soft)}.swm-pills .swm-gold{color:var(--accent)}"+
    ".swm-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}.swm-grid div{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:10px;text-align:center}"+
    ".swm-grid b{display:block;font-size:20px;font-weight:800;font-variant-numeric:tabular-nums}.swm-grid small{font-size:11.5px;color:var(--faint);font-weight:700}"+
    ".swm-acts{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 12px}"+
    /* emote motions and wavy text */
    ".m-wave{animation:mWave 1.3s ease-in-out infinite;transform-origin:70% 85%}@keyframes mWave{0%,60%,100%{transform:rotate(0)}10%,30%{transform:rotate(14deg)}20%,40%{transform:rotate(-10deg)}}"+
    ".m-bounce{animation:mBounce .9s cubic-bezier(.3,0,.5,1) infinite;transform-origin:50% 100%}@keyframes mBounce{0%,100%{transform:translateY(0) scale(1.08,.92)}15%{transform:translateY(0) scale(.95,1.05)}50%{transform:translateY(-38%) scale(.96,1.04)}85%{transform:translateY(0) scale(1.06,.94)}}"+
    ".m-wiggle{animation:mWiggle .45s ease-in-out infinite alternate}@keyframes mWiggle{from{transform:rotate(-11deg)}to{transform:rotate(11deg)}}"+
    ".m-jello{animation:mJello 1.4s ease-in-out infinite}@keyframes mJello{0%,45%,100%{transform:skew(0,0)}10%{transform:skew(-14deg,-14deg)}18%{transform:skew(9deg,9deg)}26%{transform:skew(-5deg,-5deg)}34%{transform:skew(2deg,2deg)}}"+
    ".m-spin{animation:mSpin 1.8s linear infinite}@keyframes mSpin{to{transform:rotate(360deg)}}"+
    ".m-pulse{animation:mPulse 1.1s ease-in-out infinite}@keyframes mPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.28)}}"+
    ".m-wavy{white-space:pre-wrap}.m-wavy>span{display:inline-block;animation:mWavy 1.2s ease-in-out infinite}@keyframes mWavy{0%,100%{transform:translateY(0)}50%{transform:translateY(-.28em)}}"+
    ".m-wavy>span:nth-child(8n+2){animation-delay:.08s}.m-wavy>span:nth-child(8n+3){animation-delay:.16s}.m-wavy>span:nth-child(8n+4){animation-delay:.24s}.m-wavy>span:nth-child(8n+5){animation-delay:.32s}"+
    ".m-wavy>span:nth-child(8n+6){animation-delay:.4s}.m-wavy>span:nth-child(8n+7){animation-delay:.48s}.m-wavy>span:nth-child(8n){animation-delay:.56s}"+
    ".swm-mots{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}.swm-mots button{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 9px;border:1px solid var(--line);border-radius:99px;background:none;color:var(--soft);font:inherit;font-size:12px;font-weight:800;cursor:pointer}"+
    ".swm-mots button[aria-pressed=true]{background:var(--accent);border-color:transparent;color:var(--on-accent)}.swm-mots img{width:16px;height:16px}"+
    "@media (prefers-reduced-motion:reduce){.swm-ban,.m-wave,.m-bounce,.m-wiggle,.m-jello,.m-spin,.m-pulse,.m-wavy>span{animation:none}}";
  var styled=false;
  function style(){ if(styled) return; styled=true; var s=d.createElement("style"); s.textContent=CSS; d.head.appendChild(s); }

  /* The send button says what happened, on itself (owner: "i should see the message
     sent or broadcast sent confirmation on the send button"). */
  function sendState(btn,state,text){
    if(!btn.getAttribute("data-label")) btn.setAttribute("data-label",btn.textContent);
    clearTimeout(btn._t); btn.classList.remove("swm-ok","swm-bad");
    if(state==="busy"){ btn.disabled=true; btn.textContent="Sending..."; return; }
    btn.disabled=false;
    if(state==="ok"||state==="bad"){ btn.classList.add(state==="ok"?"swm-ok":"swm-bad"); btn.textContent=text;
      btn._t=setTimeout(function(){ btn.classList.remove("swm-ok","swm-bad"); btn.textContent=btn.getAttribute("data-label"); },state==="ok"?2600:3200); }
  }
  function errWords(code,j){
    if(code===0) return "No connection";
    if(code===429) return "Slow down a little";
    if(code===503) return j&&j.error==="no_key"?"GIF search needs a key":"Messages are not set up yet";
    if(j&&j.error==="too_long") return "Too long";
    if(j&&j.error==="empty") return "Write something first";
    return "Not sent, try again";
  }

  /* ---------------------------------------------- the reader: poll + badge */
  var state={msgs:[],unread:0,readAt:null,bannerAt:null,adminUnread:0,loaded:false};
  function poll(cb){
    if(!on()) return cb&&cb(null);
    acct().req("GET","/api/account/inbox",null,function(code,j){
      if(code===200&&j){ state.msgs=j.messages||[]; state.unread=j.unread|0; state.readAt=j.readAt||null; state.bannerAt=j.bannerAt||null;
        state.adminUnread=j.adminUnread|0; state.loaded=true; paint(); }
      if(cb) cb(code===200?j:null);
    });
  }
  /* The avatar's badge for a reader. The admin's avatar carries the admin count (index.html adminBadge). */
  function paint(){
    /* The admin's avatar carries the admin count, but the banner shows for them
       too, so they see what readers see (owner, 14 Oct 2026). */
    if(isAdmin()){ if(root.swAdminBadgeRefresh) root.swAdminBadgeRefresh(); banner(); return; }
    var acc=d.getElementById("hdAccount"); if(!acc) return;
    var b=acc.querySelector(".bt-badge"), n=state.unread;
    if(n){ if(!b){ b=d.createElement("b"); b.className="bt-badge"; acc.appendChild(b); } b.textContent=n>9?"9+":String(n); }
    else if(b) b.remove();
    banner();
  }
  /* The newest message the reader has not seen, under the header. Read it in the
     inbox or close it and it does not come back. */
  function banner(){
    var old=d.getElementById("swmBan");
    var since=Math.max(Date.parse(state.readAt||"")||0,Date.parse(state.bannerAt||"")||0);
    /* The welcome (id 0) waits in the inbox with the dot; the banner is only
       for the admin's broadcasts and direct messages (owner, 14 Oct 2026). */
    var m=state.msgs.filter(function(x){ return !x.mine&&x.id!==0&&Date.parse(x.at)>since; })[0];
    if(!m){ if(old) old.remove(); return; }
    if(old&&old.getAttribute("data-id")===String(m.id)) return;
    if(old) old.remove();
    var top=d.getElementById("top"); if(!top) return;
    style();
    var el=d.createElement("div"); el.className="swm-ban"; el.id="swmBan"; el.setAttribute("role","status"); el.setAttribute("data-id",String(m.id));
    /* A GIF is too big for the banner: it waits in the inbox, and a chip says so. */
    var body=clean(m.body), gif=/class="m-gif"/.test(body);
    el.innerHTML="<div class='m-body'>"+body+(gif?"<span class='swm-gifchip'>GIF · open to see it</span>":"")+"</div><div class='swm-ban-b'><button type='button' class='swm-open'>Open</button><button type='button' class='swm-x' aria-label='Close message'>Close</button></div>";
    el.querySelector(".swm-open").onclick=function(){ inbox(); };
    el.querySelector(".swm-x").onclick=function(){ el.remove(); state.bannerAt=new Date().toISOString();
      acct().req("POST","/api/account/msgread",{what:"banner"},function(){}); };
    var after=d.querySelector(".sw-notice")||top; after.insertAdjacentElement("afterend",el);
  }

  /* -------------------------------------------------------- the inbox view */
  var WIZ="<div class='swm-who'><img src='/wiz-logo.png' alt=''>The Wizard</div>";
  function bubble(m,since,admin){
    var cls=m.mine?"swm-me":"swm-wiz", fresh=!m.mine&&Date.parse(m.at)>since;
    return "<div class='swm-msg "+cls+(fresh?" swm-new":"")+"'>"+(m.mine?"":WIZ)+
      "<div class='m-body'>"+(m.mine?esc(m.body).replace(/\n/g,"<br>"):clean(m.body))+"</div>"+
      "<div class='swm-meta'>"+(m.bcast?"<span class='swm-tag'>To everyone</span>":"")+esc(when(m.at))+(admin||"")+"</div></div>";
  }
  function inbox(){
    if(!on()||!root.swAccountUI||!root.swAccountUI.view) return;
    style(); root.swAccountUI.close();
    /* Replies are back on (owner, 14 Oct 2026: "i want feedback from users").
       Plain text only: the server cleans it and every view escapes it. */
    /* NOTIFICATIONS OFF? SAY SO WHERE THE MESSAGES ARE (owner, 17 Oct 2026: "when i
       send messages to users, they should get the notification"). A push only
       reaches a phone that switched it on while signed in, and that switch lived
       in Settings alone. Shown only when this phone could have it and does not. */
    var v=root.swAccountUI.view("Messages","<div class='swm-ping' id='swmPing' hidden><span>Get a ping on your phone when the Wizard messages you.</span>"+
      "<button type='button' class='swm-send' id='swmPingGo'>Turn on</button></div>"+
      "<div class='swm-thread' id='swmThread'><p class='swa-note'>Loading...</p></div>"+
      "<div class='swm-rep'><textarea id='swmRe' maxlength='1000' rows='1' placeholder='Questions, ideas or feedback?' aria-label='Your reply'></textarea>"+
      "<button type='button' class='swm-send' id='swmReGo'>Send</button></div>");
    var box=v.querySelector("#swmThread"), ta=v.querySelector("#swmRe"), go=v.querySelector("#swmReGo");
    /* The answer is async and every account panel shares one box: a reader who left
       the inbox first has a different panel there, with no #swmPingGo (Sentry, 17 Oct 2026). */
    var P=root.swAccountUI.push, ping=v.querySelector("#swmPing"), pb=v.querySelector("#swmPingGo");
    if(P&&P.ok()&&root.Notification&&Notification.permission!=="denied") P.state(function(isOn){
      if(isOn||!ping.isConnected) return;
      ping.hidden=false;
      pb.onclick=function(){ sendState(pb,"busy");
        P.on(function(ok,m){ if(ok){ ping.hidden=true; } else sendState(pb,"bad",m); }); };
    });
    if(root.swAccountUI.mark) root.swAccountUI.mark("msgs");
    go.onclick=function(){
      var t=ta.value.replace(/^\s+|\s+$/g,""); if(!t){ ta.focus(); return; }
      sendState(go,"busy");
      acct().req("POST","/api/account/reply",{text:t},function(code,j){
        if(code!==200) return sendState(go,"bad",errWords(code,j));
        ta.value=""; sendState(go,"ok","✓ Sent");
        state.msgs.unshift({id:j.id,at:new Date().toISOString(),mine:true,body:t}); draw();
      });
    };
    /* Each message folds to one line; unread ones and the newest start open.
       Delete hides a message for this reader only (owner, 14 Oct 2026): first
       tap asks, second tap deletes. */
    var since=Date.parse(state.readAt||"")||0;
    function draw(){
      var list=state.msgs.slice().reverse(), newest=list.length?list[list.length-1].id:null;
      box.innerHTML=list.length?list.map(function(m){
        var open=m.id===newest||(!m.mine&&Date.parse(m.at)>since);
        return "<div class='swm-fold"+(open?"":" swm-shut")+"' data-id='"+esc(String(m.id))+"'>"+
          bubble(m,since,"<button type='button' class='swm-tog'>"+(open?"Less":"More")+"</button><button type='button' class='swm-del'>Delete</button>")+"</div>";
      }).join(""):"<p class='swa-note'>No messages.</p>";
      box.querySelectorAll(".swm-fold").forEach(function(f){
        var tog=f.querySelector(".swm-tog"), del=f.querySelector(".swm-del"), armed=null;
        function set(shut){ f.classList.toggle("swm-shut",shut); tog.textContent=shut?"More":"Less"; tog.setAttribute("aria-expanded",String(!shut)); }
        /* A message that fits in its folded height has nothing to fold. */
        var mb=f.querySelector(".m-body"), was=f.classList.contains("swm-shut");
        f.classList.add("swm-shut"); var fits=mb.scrollHeight<=mb.clientHeight+2&&!/class="m-gif"/.test(mb.innerHTML);
        if(!was) f.classList.remove("swm-shut");
        if(fits){ f.classList.remove("swm-shut"); tog.remove(); tog={setAttribute:function(){},textContent:""}; }
        tog.setAttribute("aria-expanded",String(!f.classList.contains("swm-shut")));
        tog.onclick=function(e){ e.stopPropagation(); set(!f.classList.contains("swm-shut")); };
        f.onclick=function(e){ if(f.classList.contains("swm-shut")&&!e.target.closest("button,a")) set(false); };
        del.onclick=function(){
          if(!armed){ del.textContent="Tap again to delete"; del.classList.add("swm-arm");
            armed=setTimeout(function(){ armed=null; del.textContent="Delete"; del.classList.remove("swm-arm"); },3000); return; }
          clearTimeout(armed); del.disabled=true; del.textContent="Deleting...";
          var id=f.getAttribute("data-id");
          acct().req("POST","/api/account/msghide",{id:Number(id)},function(code){
            if(code!==200){ del.disabled=false; del.textContent="Could not delete. Try again"; armed=null; return; }
            state.msgs=state.msgs.filter(function(x){ return String(x.id)!==id; }); draw(); paint();
          });
        };
      });
      var last=box.lastElementChild; if(last) try{ last.scrollIntoView({block:"end"}); }catch(e){}
    }
    poll(function(j){
      if(!j){ box.innerHTML="<p class='swa-note'>Could not load your messages. Try again in a moment.</p>"; return; }
      draw();
      /* Opening the inbox is reading it: the badge and the banner go. */
      acct().req("POST","/api/account/msgread",{what:"inbox"},function(code){
        if(code===200){ state.readAt=new Date().toISOString(); state.unread=0; paint(); } });
    });
  }

  /* ------------------------------------------------------- admin: shared */
  var readers=null;      // every account, from /api/account/readers
  function loadReaders(cb){
    if(readers) return cb(readers);
    acct().req("GET","/api/account/readers",null,function(code,j){
      if(code===200&&j&&j.readers){ readers=j.readers; return cb(readers); }
      cb(null,code,j);
    });
  }
  function nameOf(r){ return r.name||String(r.email||"").split("@")[0]; }
  function avOf(r){ return "/av/"+(/^[a-z0-9]{2,12}$/.test(r.avatar||"")?r.avatar:"fire")+".webp"; }
  function byId(id){ return (readers||[]).filter(function(r){ return r.id===id; })[0]||null; }
  /* Name or email, any part of it; names and emails that start with what was typed come first. */
  function match(list,q){
    q=String(q||"").toLowerCase().replace(/^\s+|\s+$/g,"");
    if(!q) return list.slice();
    var hit=[]; list.forEach(function(r){
      var n=nameOf(r).toLowerCase(), e=String(r.email||"").toLowerCase();
      var s=n.indexOf(q)===0||e.indexOf(q)===0?0:n.indexOf(q)>0||e.indexOf(q)>0?1:-1;
      if(s>=0) hit.push([s,r]); });
    return hit.sort(function(a,b){ return a[0]-b[0]; }).map(function(x){ return x[1]; });
  }
  function mark(text,q){ var t=String(text||""), i=q?t.toLowerCase().indexOf(q.toLowerCase()):-1;
    return i<0?esc(t):esc(t.slice(0,i))+"<mark>"+esc(t.slice(i,i+q.length))+"</mark>"+esc(t.slice(i+q.length)); }
  function rowHtml(r,q,extra){
    return "<button type='button' class='swm-r' data-rid='"+esc(r.id)+"'><img src='"+avOf(r)+"' alt='' loading='lazy'>"+
      "<span><b>"+mark(nameOf(r),q)+"</b><small>"+mark(r.email,q)+"</small></span>"+(extra||"<i>"+esc(ago(r.last_seen_at))+"</i>")+"</button>";
  }

  /* ---------------------------------------------------- admin: the editor */
  var I={
    b:"<b>B</b>",i:"<i style='font-family:serif'>I</i>",u:"<u>U</u>",s:"<s>S</s>",
    big:"<span style='font-size:15px'>A</span><span style='font-size:11px'>A</span>",
    list:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
    quote:'<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M4 11h4l-2 6h3l2-6V5H4zm9 0h4l-2 6h3l2-6V5h-7z"/></svg>',
    link:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
    clear:'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7V5h14v2M10 5l-3 14M5 19h6M15 14l5 5M20 14l-5 5"/></svg>'
  };
  function editorHtml(){
    function b(cmd,label,html){ return "<button type='button' data-cmd='"+cmd+"' aria-label='"+label+"' title='"+label+"'>"+html+"</button>"; }
    return "<div class='swm-ed'><div class='swm-tb' role='toolbar' aria-label='Formatting'>"+
      b("bold","Bold",I.b)+b("italic","Italic",I.i)+b("underline","Underline",I.u)+b("strikeThrough","Strike",I.s)+"<span class='swm-sep'></span>"+
      b("m-big","Big text",I.big)+b("m-gold","Gold","<b style='color:var(--accent);font-size:15px'>A</b>")+
      b("m-glow","Glow","<b class='m-glow' style='font-size:15px'>A</b>")+b("wavy","Wavy text","<b class='m-wavy' style='font-size:13px'><span>~</span><span>W</span><span>~</span></b>")+
      b("m-green","Green","<b style='color:var(--green-ink);font-size:15px'>A</b>")+b("m-red","Red","<b style='color:var(--red-ink);font-size:15px'>A</b>")+
      "<span class='swm-sep'></span>"+b("insertUnorderedList","Bullet list",I.list)+b("quote","Quote",I.quote)+b("center","Centre","≡")+
      b("link","Link",I.link)+b("emo","Animated emoji","<img src='/emo/1f525.webp' alt='' width='20' height='20'>")+b("gif","GIF","<b style='font-size:11px'>GIF</b>")+
      b("clear","Clear formatting",I.clear)+"</div>"+
      "<div class='swm-area m-body' contenteditable='true' role='textbox' aria-multiline='true' aria-label='Message' data-ph='Write something magic...'></div>"+
      "<div class='swm-pop' data-pop='link' hidden><div class='swm-row'><input class='swa-in' type='url' placeholder='https://... or /penalty' aria-label='Link address'>"+
        "<button type='button' class='swa-pillbtn' data-link-go>Add link</button></div></div>"+
      "<div class='swm-pop' data-pop='emo' hidden><div class='swm-etabs' role='tablist'><button type='button' role='tab' data-etab='wiz' aria-selected='true'>"+
        "<img src='/emo/wiz-hype.webp' alt='' width='18' height='18'>Wizard</button><button type='button' role='tab' data-etab='emo' aria-selected='false'>"+
        "<img src='/emo/1f525.webp' alt='' width='18' height='18'>Emoji</button></div>"+
      "<div class='swm-wizs' data-epane='wiz'>"+WIZ_EMO.map(function(e){
        return "<button type='button' data-wiz='"+e[0]+"' data-wmot='"+e[2]+"' title='"+esc(e[1])+"'><img class='"+e[2]+"' src='/emo/wiz-"+e[0]+".webp' alt='"+esc(e[1])+"' loading='lazy' width='48' height='48'></button>"; }).join("")+
        "</div><div data-epane='emo' hidden><div class='swm-mots' role='group' aria-label='Emoji motion'>"+MOT.map(function(m,i){
        return "<button type='button' data-mot='"+m[0]+"' aria-pressed='"+(i===0)+"'>"+(m[0]?"<img class='m-emo "+m[0]+"' src='/emo/26bd.webp' alt='' width='18' height='18'>":"")+m[1]+"</button>"; }).join("")+"</div><div class='swm-emos'>"+EMO.map(function(e){
        return "<button type='button' data-emo='"+e[0]+"' title='"+esc(e[1])+"'><img src='/emo/"+e[0]+".webp' alt='"+esc(e[1])+"' loading='lazy' width='32' height='32'></button>"; }).join("")+
        "</div><p class='swm-fine'>Animated emoji by Google (Noto, CC BY 4.0)</p></div></div>"+
      "<div class='swm-pop' data-pop='gif' hidden><div class='swm-row'><input class='swa-in' type='search' placeholder='Search GIFs' aria-label='Search GIFs'>"+
        "<button type='button' class='swa-pillbtn' data-gif-go>Search</button></div><div class='swm-gifs'></div><p class='swm-fine'>Powered by GIPHY</p></div></div>";
  }
  function wireEditor(box,a,say){
    var area=box.querySelector(".swm-area"), saved=null;
    function keep(){ var s=root.getSelection&&root.getSelection(); if(s&&s.rangeCount&&area.contains(s.anchorNode)) saved=s.getRangeAt(0).cloneRange(); }
    function back(){ area.focus(); var s=root.getSelection(); if(saved&&s){ s.removeAllRanges(); s.addRange(saved); } }
    area.addEventListener("keyup",keep); area.addEventListener("mouseup",keep); area.addEventListener("input",keep);
    d.addEventListener("selectionchange",function(){ if(d.activeElement===area) keep(); });
    /* ON A PHONE THE EMOJI AND GIF PICKERS TAKE THE KEYBOARD'S PLACE, the way
       WhatsApp, Telegram and Discord do it (owner, 14 Oct 2026: the picker sat
       behind the keyboard and scrolling it moved the cursor). Opening one closes
       the keyboard and slides the picker up from the bottom; a tap inserts at
       the remembered cursor without bringing the keyboard back; tapping the text
       or Done closes it. Desktop keeps the inline panel. */
    var touch=!!(root.matchMedia&&(root.matchMedia("(pointer:coarse)").matches||root.matchMedia("(max-width:720px)").matches));
    function sheetOpen(){ return !!box.querySelector(".swm-pop.swm-sheet:not([hidden])"); }
    function pop(name){
      box.querySelectorAll("[data-pop]").forEach(function(p){
        p.hidden=p.getAttribute("data-pop")!==name||!p.hidden;
        var sheet=touch&&(p.getAttribute("data-pop")==="emo"||p.getAttribute("data-pop")==="gif");
        p.classList.toggle("swm-sheet",sheet);
        if(sheet&&!p.querySelector(".swm-sh-hd")){
          var hd=d.createElement("div"); hd.className="swm-sh-hd";
          hd.innerHTML="<span>"+(p.getAttribute("data-pop")==="gif"?"GIFs":"Emotes and emoji")+"</span><button type='button' class='swm-sh-done'>Done</button>";
          hd.querySelector("button").addEventListener("mousedown",function(e){ e.preventDefault(); });
          hd.querySelector("button").onclick=function(){ p.hidden=true; };
          p.insertBefore(hd,p.firstChild);
        }
      });
      if(sheetOpen()){ keep(); area.blur(); }
    }
    area.addEventListener("pointerdown",function(){ if(sheetOpen()) box.querySelectorAll(".swm-pop.swm-sheet").forEach(function(p){ p.hidden=true; }); });
    function insert(html){
      if(!sheetOpen()){ back(); d.execCommand("insertHTML",false,html); keep(); return; }
      /* Into the remembered cursor, without focusing the text, so no keyboard. */
      var r=saved&&area.contains(saved.startContainer)?saved:null;
      if(!r){ r=d.createRange(); r.selectNodeContents(area); r.collapse(false); }
      var t=d.createElement("template"); t.innerHTML=html; var last=t.content.lastChild;
      r.deleteContents(); r.insertNode(t.content);
      if(last){ r=d.createRange(); r.setStartAfter(last); r.collapse(true); }
      saved=r;
    }
    /* Wrap the selection in a styled span; tapping the same style again on styled text takes it off. */
    function wrap(cls){
      back(); var s=root.getSelection(); if(!s||!s.rangeCount) return;
      var r=s.getRangeAt(0), host=r.commonAncestorContainer; host=host.nodeType===1?host:host.parentNode;
      var cur=host.closest&&host.closest("span."+cls);
      if(cur&&area.contains(cur)){ while(cur.firstChild) cur.parentNode.insertBefore(cur.firstChild,cur); cur.remove(); return; }
      if(r.collapsed) return say("Select some words first.");
      var sp=d.createElement("span"); sp.className=cls; sp.appendChild(r.extractContents()); r.insertNode(sp);
      s.removeAllRanges(); var nr=d.createRange(); nr.selectNodeContents(sp); s.addRange(nr); keep();
    }
    /* Wavy text: each letter its own span so it can ripple; again on wavy text turns it back to plain. */
    function wavy(){
      back(); var s=root.getSelection(); if(!s||!s.rangeCount) return;
      var r=s.getRangeAt(0), host=r.commonAncestorContainer; host=host.nodeType===1?host:host.parentNode;
      var cur=host.closest&&host.closest("span.m-wavy");
      if(cur&&area.contains(cur)){ cur.replaceWith(d.createTextNode(cur.textContent)); keep(); return; }
      var t=r.toString(); if(!t.replace(/\s/g,"")) return say("Select some words first.");
      if(t.length>60) return say("Wavy works on a few words at a time (60 letters).");
      var sp=d.createElement("span"); sp.className="m-wavy";
      Array.prototype.forEach.call(t,function(ch){ var c=d.createElement("span"); c.textContent=ch; sp.appendChild(c); });
      r.deleteContents(); r.insertNode(sp); s.removeAllRanges(); var nr=d.createRange(); nr.setStartAfter(sp); nr.collapse(true); s.addRange(nr); keep();
    }
    var mot="";
    box.querySelectorAll("[data-mot]").forEach(function(b){ b.addEventListener("mousedown",function(e){ e.preventDefault(); });
      b.onclick=function(){ mot=b.getAttribute("data-mot"); box.querySelectorAll("[data-mot]").forEach(function(x){ x.setAttribute("aria-pressed",String(x===b)); }); }; });
    box.querySelectorAll("[data-cmd]").forEach(function(btn){
      btn.addEventListener("mousedown",function(e){ e.preventDefault(); });   // keep the selection in the text
      btn.onclick=function(){
        var c=btn.getAttribute("data-cmd");
        if(c==="link"||c==="emo"||c==="gif"){ pop(c);
          var inp=box.querySelector("[data-pop='"+c+"'] input"); if(inp&&c==="link") inp.focus();
          if(c==="gif"&&!box.querySelector(".swm-gifs").childElementCount) gifs(""); return; }
        if(c==="wavy") return wavy();
        if(/^m-/.test(c)) return wrap(c);
        back();
        if(c==="quote") d.execCommand("formatBlock",false,"blockquote");
        else if(c==="center"){ var s=root.getSelection(), n=s&&s.anchorNode; n=n&&(n.nodeType===1?n:n.parentNode);
          var p=n&&n.closest&&n.closest("p,h3,div,blockquote,li"); if(!p||!area.contains(p)||p===area){ d.execCommand("formatBlock",false,"p"); n=root.getSelection().anchorNode; n=n&&(n.nodeType===1?n:n.parentNode); p=n&&n.closest&&n.closest("p"); }
          if(p&&area.contains(p)) p.classList.toggle("m-center"); }
        else if(c==="clear"){ d.execCommand("removeFormat"); d.execCommand("unlink"); }
        else d.execCommand(c);
        keep();
      };
    });
    var lk=box.querySelector("[data-pop='link'] input");
    function addLink(){
      var u=lk.value.replace(/^\s+|\s+$/g,""); if(!/^(https?:\/\/|\/)/i.test(u)) u="https://"+u.replace(/^\/+/,"");
      u=u.replace(/^http:/i,"https:");
      if(!api.okHref(u)) return say("That link does not look right.");
      back(); var s=root.getSelection();
      if(s&&!s.isCollapsed) d.execCommand("createLink",false,u); else insert("<a href=\""+esc(u)+"\">"+esc(u.replace(/^https:\/\//,""))+"</a>&nbsp;");
      lk.value=""; pop(null); keep();
    }
    box.querySelector("[data-link-go]").onclick=addLink;
    lk.onkeydown=function(e){ if(e.key==="Enter"){ e.preventDefault(); addLink(); } };
    box.querySelectorAll("[data-etab]").forEach(function(t){ t.addEventListener("mousedown",function(e){ e.preventDefault(); });
      t.onclick=function(){ var k=t.getAttribute("data-etab");
        box.querySelectorAll("[data-etab]").forEach(function(x){ x.setAttribute("aria-selected",String(x===t)); });
        box.querySelectorAll("[data-epane]").forEach(function(p){ p.hidden=p.getAttribute("data-epane")!==k; }); }; });
    box.querySelectorAll("[data-wiz]").forEach(function(b){ b.addEventListener("mousedown",function(e){ e.preventDefault(); });
      b.onclick=function(){ var k=b.getAttribute("data-wiz"), m=b.getAttribute("data-wmot");
        insert("<img class=\"m-emo m-wiz"+(m?" "+m:"")+"\" src=\"/emo/wiz-"+k+".webp\" alt=\""+esc(b.getAttribute("title"))+"\" width=\"44\" height=\"44\">"); }; });
    box.querySelectorAll("[data-emo]").forEach(function(b){ b.addEventListener("mousedown",function(e){ e.preventDefault(); });
      b.onclick=function(){ var k=b.getAttribute("data-emo"), n=b.getAttribute("title");
        insert("<img class=\"m-emo"+(mot?" "+mot:"")+"\" src=\"/emo/"+k+".webp\" alt=\""+esc(n)+"\" width=\"28\" height=\"28\">"); }; });
    var gq=box.querySelector("[data-pop='gif'] input"), gl=box.querySelector(".swm-gifs");
    function gifs(q){
      gl.innerHTML="<p class='swa-note'>Loading...</p>";
      a.req("GET","/api/account/gifs?q="+encodeURIComponent(q),null,function(code,j){
        if(code!==200){ gl.innerHTML="<p class='swa-note'>"+(j&&j.error==="no_key"?"GIF search needs a GIPHY key. Add GIPHY_API_KEY on Vercel (free at developers.giphy.com).":"Could not load GIFs. Try again.")+"</p>"; return; }
        gl.innerHTML=(j.gifs||[]).map(function(g){ return "<button type='button' data-gif='"+esc(g.url)+"' title='"+esc(g.title)+"'><img src='"+esc(g.url)+"' alt='"+esc(g.title)+"' loading='lazy'></button>"; }).join("")||"<p class='swa-note'>Nothing found.</p>";
        gl.querySelectorAll("[data-gif]").forEach(function(b){ b.addEventListener("mousedown",function(e){ e.preventDefault(); });
          b.onclick=function(){ insert("<img class=\"m-gif\" src=\""+esc(b.getAttribute("data-gif"))+"\" alt=\""+esc(b.getAttribute("title")||"GIF")+"\"><br>"); pop(null); }; });
      });
    }
    box.querySelector("[data-gif-go]").onclick=function(){ gifs(gq.value); };
    gq.onkeydown=function(e){ if(e.key==="Enter"){ e.preventDefault(); gifs(gq.value); } };
    /* Pasted text arrives as plain text: a paste from a web page brings its whole stylesheet. */
    area.addEventListener("paste",function(e){ var t=e.clipboardData&&e.clipboardData.getData("text/plain"); if(t==null) return;
      e.preventDefault(); d.execCommand("insertText",false,t); });
    return { html:function(){ return clean(area.innerHTML); }, clear:function(){ area.innerHTML=""; saved=null; }, focus:function(){ area.focus(); },
      set:function(h){ area.innerHTML=clean(h); saved=null; } };
  }

  /* -------------------------------------------- admin: the Messages tab */
  function messagesHtml(){
    return "<p class='swa-h' style='margin-top:6px'>New message</p>"+
      "<div class='swm-to' role='group' aria-label='Send to'><button type='button' data-to='all' aria-pressed='true'>Everyone</button><button type='button' data-to='some' aria-pressed='false'>Pick users</button></div>"+
      "<div id='swmPick' hidden><input class='swa-in' id='swmPickIn' type='search' autocomplete='off' placeholder='Name or email' aria-label='Find users to message'>"+
        "<div class='swa-card swm-list' id='swmPickList' hidden></div><div class='swm-chips' id='swmChips'></div></div>"+
      editorHtml()+
      "<button type='button' class='swm-send swm-wide' id='swmGo'>Broadcast to everyone</button>"+
      "<p class='swa-h'>Conversations</p><div class='swa-card' id='swmConvos'><div class='swa-set'><span class='swa-st'><small>Loading</small></span></div></div>"+
      "<div id='swmConvo' hidden></div>"+
      "<p class='swa-h'>Broadcasts sent</p><div class='swa-card' id='swmSent'><div class='swa-set'><span class='swa-st'><small>Loading</small></span></div></div>";
  }
  function messagesTab(v,a,say,setCount,goTab){
    style();
    var panel=v.querySelector("#swaTMsg"); panel.innerHTML=messagesHtml();
    var ed=wireEditor(panel,a,say), go=panel.querySelector("#swmGo"), mode="all", picked=[];
    /* The id of a sent broadcast being edited; Send becomes Save changes. */
    var editing=null;
    var pickBox=panel.querySelector("#swmPick"), pin=panel.querySelector("#swmPickIn"), plist=panel.querySelector("#swmPickList"), chips=panel.querySelector("#swmChips");
    function label(){ go.textContent=editing?"Save changes":mode==="all"?"Broadcast to everyone":picked.length?"Send to "+(picked.length===1?nameOf(byId(picked[0])||{}):picked.length+" users"):"Pick who gets it";
      go.setAttribute("data-label",go.textContent); }
    function paintChips(){ chips.innerHTML=picked.map(function(id){ var r=byId(id)||{id:id,email:id};
      return "<span class='swm-chip'><img src='"+avOf(r)+"' alt=''>"+esc(nameOf(r))+"<button type='button' data-unpick='"+esc(id)+"' aria-label='Remove "+esc(nameOf(r))+"'>×</button></span>"; }).join("");
      chips.querySelectorAll("[data-unpick]").forEach(function(b){ b.onclick=function(){ picked=picked.filter(function(x){ return x!==b.getAttribute("data-unpick"); }); paintChips(); label(); }; }); }
    function showPick(){
      loadReaders(function(list){
        if(!list){ plist.hidden=false; plist.innerHTML="<div class='swa-set'><span class='swa-st'><small>Could not load users.</small></span></div>"; return; }
        var q=pin.value, hits=match(list,q).filter(function(r){ return picked.indexOf(r.id)<0; }).slice(0,60);
        plist.hidden=false; plist.innerHTML=hits.map(function(r){ return rowHtml(r,q); }).join("")||"<div class='swa-set'><span class='swa-st'><small>No one matches.</small></span></div>";
        plist.querySelectorAll("[data-rid]").forEach(function(b){ b.addEventListener("mousedown",function(e){ e.preventDefault(); });
          b.onclick=function(){ picked.push(b.getAttribute("data-rid")); pin.value=""; paintChips(); label(); showPick(); }; });
      });
    }
    pin.addEventListener("focus",showPick); pin.addEventListener("input",showPick);
    pin.addEventListener("blur",function(){ setTimeout(function(){ plist.hidden=true; },150); });
    panel.querySelectorAll("[data-to]").forEach(function(b){ b.onclick=function(){
      mode=b.getAttribute("data-to"); panel.querySelectorAll("[data-to]").forEach(function(x){ x.setAttribute("aria-pressed",String(x===b)); });
      pickBox.hidden=mode!=="some"; label(); if(mode==="some") pin.focus(); }; });
    go.onclick=function(){
      var html=ed.html();
      if(api.isEmpty(html)){ ed.focus(); return sendState(go,"bad","Write something first"); }
      if(editing){ var id=editing; sendState(go,"busy");
        return a.req("POST","/api/account/edit",{id:id,html:html},function(code,j){
          if(code!==200) return sendState(go,"bad",errWords(code,j));
          sendState(go,"ok","✓ Saved"); say("Updated for everyone. No new ping."); editing=null; ed.clear(); setTimeout(label,2700); load(); }); }
      if(mode==="some"&&!picked.length){ pin.focus(); return sendState(go,"bad","Pick who gets it"); }
      if(mode==="all"&&!root.confirm("Send this to every user?")) return;
      sendState(go,"busy");
      a.req("POST","/api/account/send",{to:mode==="all"?"all":picked,html:html},function(code,j){
        if(code!==200) return sendState(go,"bad",errWords(code,j));
        sendState(go,"ok",mode==="all"?"✓ Broadcast sent":"✓ Message sent"+(picked.length>1?" to "+picked.length:""));
        say(j.pinged?"Pinged "+j.pinged+" phone"+(j.pinged===1?"":"s")+".":"In their inboxes. No phones pinged (none have notifications on, or it is quiet hours: they get it at 9am).");
        ed.clear(); picked=[]; paintChips(); setTimeout(label,2700); load();
      });
    };
    /* A reader picked from elsewhere (the customer view's "Message them"). */
    function to(id){ panel.querySelector("[data-to='some']").click(); if(picked.indexOf(id)<0) picked.push(id); paintChips(); label(); pin.blur(); ed.focus(); }
    function load(){
      a.req("GET","/api/account/threads",null,function(code,j){
        var cv=panel.querySelector("#swmConvos"), sent=panel.querySelector("#swmSent");
        if(code!==200){ var w="<div class='swa-set'><span class='swa-st'><small>"+(code===503?"Messages are not set up yet. Run sql/messages.sql in Supabase.":"Could not load messages.")+"</small></span></div>";
          cv.innerHTML=w; sent.innerHTML=w; return; }
        var seen=Date.parse(j.readAt||"")||0, by={}, order=[], bc=[], gone=[];
        (j.messages||[]).forEach(function(m){
          /* Only the admin's own broadcasts are drawn as HTML here; a row with no
             thread that is not from the admin is never treated as one. One the admin
             deleted from this list goes in `gone`: users still have it. */
          if(!m.user_id){ if(m.from_admin) (m.adminHidden?gone:bc).push(m); return; }
          if(!by[m.user_id]){ by[m.user_id]=[]; order.push(m.user_id); }
          by[m.user_id].push(m); });
        var unread=0;
        loadReaders(function(){
          cv.innerHTML=order.length?order.map(function(id){
            var t=by[id], r=byId(id)||{id:id,email:"Deleted account"}, last=t[0];
            var n=t.filter(function(m){ return !m.from_admin&&Date.parse(m.created_at)>seen; }).length; unread+=n;
            return rowHtml(r,"",n?"<span class='swm-unr'>"+n+"</span>":"<i>"+esc(ago(last.created_at))+"</i>").replace("<small>"+esc(r.email)+"</small>",
              "<small>"+(last.from_admin?"You: ":"")+esc(api.textOf(last.from_admin?last.body:esc(last.body)).slice(0,70))+"</small>"); }).join(""):
            "<div class='swa-set'><span class='swa-st'><small>No conversations yet. Replies from users show up here.</small></span></div>";
          setCount(v,"swaTMsg",unread?unread+" new":"");
          cv.querySelectorAll("[data-rid]").forEach(function(b){ b.onclick=function(){ convo(b.getAttribute("data-rid"),by[b.getAttribute("data-rid")]); }; });
          if(unread) a.req("POST","/api/account/msgread",{what:"inbox"},function(c2){ if(c2===200){ state.adminUnread=0; if(root.swAdminBadgeRefresh) root.swAdminBadgeRefresh(); } });
        });
        /* Each broadcast is one line until it is opened (owner, 14 Oct 2026:
           "sent broadcast should be collapsed till i open it"). */
        sent.innerHTML=bc.length?bc.map(function(m){
          var line=textOf(clean(m.body).replace(/<img[^>]*>/g," ")).slice(0,90)||"GIF";
          return "<div class='swa-set swm-bc'><span class='swa-st'><button type='button' class='swm-bc-hd' aria-expanded='false'>"+
            "<b>"+esc(line)+"</b><small>"+esc(when(m.created_at))+"</small></button>"+
            "<div class='m-body' hidden>"+clean(m.body)+"</div></span>"+
            "<span class='swm-bc-acts'><button type='button' class='swa-pillbtn' data-bc-edit='"+esc(String(m.id))+"'>Edit</button>"+
            "<button type='button' class='swa-pillbtn' data-bc-resend='"+esc(String(m.id))+"'>Resend</button>"+
            "<button type='button' class='swa-pillbtn swm-del-b' data-unsend='"+esc(String(m.id))+"'>Unsend</button>"+
            "<button type='button' class='swa-pillbtn' data-bc-del='"+esc(String(m.id))+"'>Delete</button></span></div>"; }).join(""):
          "<div class='swa-set'><span class='swa-st'><small>Nothing sent to everyone yet.</small></span></div>";
        /* DELETED HERE, STILL WITH USERS (owner, 16 Oct 2026): Delete only clears
           this list, so these stay reachable, folded at the foot, to Unsend. */
        if(gone.length) sent.insertAdjacentHTML("beforeend","<details class='swm-gone'><summary>Deleted from this list, still showing to users ("+gone.length+")</summary>"+
          gone.map(function(m){ var line=textOf(clean(m.body).replace(/<img[^>]*>/g," ")).slice(0,90)||"GIF";
            return "<div class='swa-set swm-bc'><span class='swa-st'><b class='swm-gone-t'>"+esc(line)+"</b><small>"+esc(when(m.created_at))+"</small></span>"+
              "<span class='swm-bc-acts'><button type='button' class='swa-pillbtn swm-del-b' data-unsend='"+esc(String(m.id))+"'>Unsend</button></span></div>"; }).join("")+
          "</details>");
        var bcBy={}; bc.forEach(function(m){ bcBy[String(m.id)]=m; });
        /* Edit: into the editor, and Send becomes Save changes for that message. */
        sent.querySelectorAll("[data-bc-edit]").forEach(function(b){ b.onclick=function(){
          var m=bcBy[b.getAttribute("data-bc-edit")]; if(!m) return;
          editing=String(m.id); ed.set(m.body); panel.querySelector("[data-to='all']").click(); label();
          try{ panel.scrollIntoView({block:"start",behavior:"smooth"}); }catch(e){} ed.focus(); }; });
        /* Resend: the same words as a new broadcast, which pings phones again. */
        sent.querySelectorAll("[data-bc-resend]").forEach(function(b){ b.onclick=function(){
          var m=bcBy[b.getAttribute("data-bc-resend")]; if(!m||!root.confirm("Send this to every user again?")) return; b.disabled=true;
          a.req("POST","/api/account/send",{to:"all",html:m.body},function(code,j){ b.disabled=false;
            if(code===200){ say("Sent again."+(j.pinged?" Pinged "+j.pinged+" phone"+(j.pinged===1?"":"s")+".":"")); load(); } else say(errWords(code,j)); }); }; });
        sent.querySelectorAll(".swm-bc-hd").forEach(function(h){ h.onclick=function(){
          var b=h.parentNode.querySelector(".m-body"), open=b.hidden; b.hidden=!open; h.setAttribute("aria-expanded",String(open)); }; });
        wireUnsend(sent);
      });
    }
    function wireUnsend(box){ box.querySelectorAll("[data-unsend]").forEach(function(b){ b.onclick=function(){
      if(!root.confirm("Unsend this? It disappears for every user.")) return; b.disabled=true;
      a.req("POST","/api/account/unsend",{id:b.getAttribute("data-unsend")},function(code,j){
        if(code===200){ say("Unsent. Users no longer see it."); if(editing===b.getAttribute("data-unsend")){ editing=null; ed.clear(); label(); } load(); } else { b.disabled=false; say(errWords(code,j)); } }); }; });
      /* Delete is for the admin only (owner, 14 Oct 2026): off this list, users keep it. */
      box.querySelectorAll("[data-bc-del]").forEach(function(b){ b.onclick=function(){
        if(!root.confirm("Delete this from your list? Users still have it. Use Unsend to take it from them.")) return; b.disabled=true;
        a.req("POST","/api/account/msghide",{id:Number(b.getAttribute("data-bc-del"))},function(code,j){
          if(code===200){ say("Deleted from your list. Users still have it."); load(); } else { b.disabled=false; say(errWords(code,j)); } }); }; }); }
    /* One reader's conversation, oldest first, with a reply box that sends to them. */
    function convo(id,list){
      var r=byId(id)||{id:id,email:""}, box=panel.querySelector("#swmConvo");
      box.hidden=false;
      box.innerHTML="<p class='swa-h'>"+esc(nameOf(r))+" <small>"+esc(r.email)+"</small></p><div class='swm-thread'>"+
        (list||[]).slice().reverse().map(function(m){ return bubble({id:m.id,at:m.created_at,mine:!m.from_admin,body:m.body},Infinity,
          m.from_admin?"<button type='button' class='swa-pillbtn' data-unsend='"+esc(String(m.id))+"'>Unsend</button>":""); }).join("")+
        "</div><div class='swm-acts'><button type='button' class='swa-pillbtn' data-reply-to>Reply with the editor</button><button type='button' class='swa-pillbtn' data-open-user>Open their profile</button></div>";
      /* In the admin's view the reader's words sit on the left and the admin's on the right. */
      box.querySelectorAll(".swm-msg").forEach(function(el){ el.classList.toggle("swm-me"); el.classList.toggle("swm-wiz"); });
      box.querySelectorAll(".swm-msg.swm-wiz .swm-who").forEach(function(w){ w.remove(); });
      wireUnsend(box);
      box.querySelector("[data-reply-to]").onclick=function(){ to(id); try{ panel.querySelector(".swm-ed").scrollIntoView({block:"center",behavior:"smooth"}); }catch(e){} };
      box.querySelector("[data-open-user]").onclick=function(){ goTab("swaTLk"); if(root.swMsg._openReader) root.swMsg._openReader(id); };
      try{ box.scrollIntoView({block:"start",behavior:"smooth"}); }catch(e){}
    }
    load();
    return { to:to, load:load };
  }

  /* ---------------------------------- admin: Readers, the customer view */
  function readersHtml(){
    return "<input class='swa-in' id='swmRdIn' type='search' autocomplete='off' autocapitalize='none' spellcheck='false' placeholder='Search by name or email' aria-label='Search users'>"+
      "<p class='swm-fine' id='swmRdN'></p><div class='swa-card swm-list' id='swmRdList' hidden></div><div id='swmRd' hidden></div>";
  }
  function readersTab(v,a,say,msgTab,goTab){
    style();
    var panel=v.querySelector("#swaTLk"); panel.innerHTML=readersHtml();
    var inp=panel.querySelector("#swmRdIn"), list=panel.querySelector("#swmRdList"), card=panel.querySelector("#swmRd"), n=panel.querySelector("#swmRdN"), hi=-1;
    function show(){
      loadReaders(function(all,code){
        if(!all){ list.hidden=false; list.innerHTML="<div class='swa-set'><span class='swa-st'><small>"+(code===503?"Users list is not set up yet. Run sql/messages.sql in Supabase.":"Could not load users.")+"</small></span></div>"; return; }
        var q=inp.value.replace(/^\s+|\s+$/g,""), hits=match(all,q);
        n.textContent=q?hits.length+" of "+all.length+" users":all.length+" users, most recently seen first";
        hi=-1; list.hidden=false; card.hidden=true;
        list.innerHTML=hits.slice(0,200).map(function(r){ return rowHtml(r,q); }).join("")||"<div class='swa-set'><span class='swa-st'><small>No one matches.</small></span></div>";
        list.querySelectorAll("[data-rid]").forEach(function(b){ b.onclick=function(){ open(b.getAttribute("data-rid")); }; });
      });
    }
    inp.addEventListener("focus",show); inp.addEventListener("input",show);
    inp.addEventListener("keydown",function(e){
      var rows=[].slice.call(list.querySelectorAll("[data-rid]")); if(!rows.length) return;
      if(e.key==="ArrowDown"||e.key==="ArrowUp"){ e.preventDefault(); hi=(hi+(e.key==="ArrowDown"?1:-1)+rows.length)%rows.length;
        rows.forEach(function(r,i){ r.classList.toggle("swm-hi",i===hi); }); try{ rows[hi].scrollIntoView({block:"nearest"}); }catch(x){} }
      if(e.key==="Enter"){ e.preventDefault(); open(rows[Math.max(hi,0)].getAttribute("data-rid")); } });
    function stat(num,label){ return "<div><b>"+esc(String(num))+"</b><small>"+esc(label)+"</small></div>"; }
    function row(k,val,btn){ return "<div class='swa-set'><span class='swa-st'><b>"+esc(k)+"</b><small>"+val+"</small></span>"+(btn||"")+"</div>"; }
    function open(id){
      list.hidden=true; card.hidden=false; n.textContent="";
      card.innerHTML="<p class='swa-note'>Loading...</p>";
      a.req("GET","/api/account/reader?id="+encodeURIComponent(id),null,function(code,r){
        if(code!==200||!r||!r.found){ card.innerHTML="<p class='swa-note'>"+(code===404?"That account no longer exists.":"Could not load this user.")+"</p>"; return; }
        var BOOK={sporty:"SportyBet",bet9ja:"Bet9ja",betking:"BetKing",betpawa:"betPawa",onexbet:"1xBet",betway:"Betway"};
        var devs=(r.devices||[]).map(function(x){ return esc((x.label||"Device")+" · "+ago(x.last_used_at)); }).join("<br>")||"None";
        var codes=r.codes==null?"Free users' codes are counted by device, not account.":
          (r.codes.length?r.codes.map(function(c){ return esc(c.code+" · "+(BOOK[c.book]||c.book)+" · "+c.status+" · "+ago(c.created_at)); }).join("<br>"):"No codes yet.");
        var rec=r.record||{}, thread=(r.thread||[]).slice().reverse();
        card.innerHTML="<button type='button' class='swa-back' data-back>‹ All users</button>"+
          "<div class='swm-hero'><img src='"+avOf(r)+"' alt=''><div style='min-width:0'><b>"+esc(nameOf(r))+"</b><small>"+esc(r.email)+"</small>"+
            "<div class='swm-pills'><span class='"+(r.role==="admin"||r.ff?"swm-gold":"")+"'>"+esc(r.plan||"Free plan")+"</span>"+(r.google?"<span>Google</span>":"<span>Email code</span>")+
            (r.push?"<span>Phone alerts on</span>":"")+(r.mail?"<span>Picks by email</span>":"")+"</div></div></div>"+
          "<div class='swm-grid'>"+stat(r.slips|0,"slips saved")+stat(rec.won|0,"slips won")+stat((r.devices||[]).length,"devices")+"</div>"+
          "<div class='swm-acts'><button type='button' class='swa-pillbtn' data-msg>Message them</button>"+
            (r.role!=="admin"?"<button type='button' class='swa-pillbtn' data-ff='"+(r.ff?"revoke":"grant")+"'>"+(r.ff?"Remove Family & friends":"Give Family & friends")+"</button>":"")+
            ((r.devices||[]).length&&r.role!=="admin"?"<button type='button' class='swa-pillbtn' data-out>Sign out everywhere</button>":"")+
            (r.role!=="admin"?"<button type='button' class='swa-pillbtn' data-gift aria-expanded='false' aria-controls='swmGift'>Gift a pass</button>":"")+"</div>"+
          /* GIFT A PASS (owner, 16 Oct 2026): POST /api/account/gift. Laid out like the
             admin's other forms - fields on the ground, the same segmented control as
             Settings for the two choices, one full-width gold action that names what it
             gives - with the user's message previewed from the same words the server
             sends (giftHtml). */
          (r.role!=="admin"?"<div class='swm-giftf' id='swmGift' hidden>"+
            "<span class='swa-lbl' id='swmGiftPassL'>Pass</span>"+
            "<div class='swa-seg' role='group' aria-labelledby='swmGiftPassL' data-gseg='pass'>"+
              "<button type='button' data-v='day' aria-pressed='true'>Day</button><button type='button' data-v='week' aria-pressed='false'>Week</button>"+
              "<button type='button' data-v='month' aria-pressed='false'>Month</button></div>"+
            "<span class='swa-lbl' id='swmGiftWhyL'>Reason</span>"+
            "<div class='swa-seg' role='group' aria-labelledby='swmGiftWhyL' data-gseg='why'>"+
              "<button type='button' data-v='gift' aria-pressed='true'>Gift</button><button type='button' data-v='reimburse' aria-pressed='false'>Reimbursement</button></div>"+
            "<label class='swa-lbl' for='swmGiftNote'>Note to them <small>optional</small></label>"+
            "<textarea class='swa-in swm-gnote' id='swmGiftNote' rows='3' maxlength='500' placeholder='Thanks for sticking with us.'></textarea>"+
            "<span class='swa-lbl'>What they'll see</span><div class='swm-gprev' aria-live='polite'></div>"+
            "<button type='button' class='swa-outbtn swa-go' data-giftgo></button></div>":"")+
          "<div class='swa-card'>"+row("Joined",esc(when(r.created_at)+" · "+ago(r.created_at)))+row("Last seen",esc(ago(r.last_seen_at)||"never"))+
            row("Signed in on",devs)+row("Default bookmaker",esc(BOOK[r.book]||"Not set"))+row("Theme",r.theme==="light"?"Light":"Dark")+
            row("Record",esc((rec.won|0)+" won of "+(rec.settled|0)+" settled"))+row("Codes booked",codes)+"</div>"+
          "<p class='swa-h'>Messages</p>"+(thread.length?"<div class='swm-thread'>"+thread.map(function(m){
            return bubble({id:m.id,at:m.created_at,mine:!m.from_admin,body:m.body},Infinity); }).join("")+"</div>":"<p class='swa-note'>No direct messages yet. They also get every broadcast.</p>");
        card.querySelectorAll(".swm-msg").forEach(function(el){ el.classList.toggle("swm-me"); el.classList.toggle("swm-wiz"); });
        card.querySelectorAll(".swm-msg.swm-wiz .swm-who").forEach(function(w){ w.remove(); });
        card.querySelector("[data-back]").onclick=function(){ show(); inp.focus(); };
        card.querySelector("[data-msg]").onclick=function(){ goTab("swaTMsg"); if(msgTab) msgTab.to(r.id); };
        var ff=card.querySelector("[data-ff]");
        if(ff) ff.onclick=function(){ ff.disabled=true; a.req("POST","/api/account/"+ff.getAttribute("data-ff"),{email:r.email},function(c2){
          if(c2===200){ say("Done."); readers=null; open(id); } else { ff.disabled=false; say("Something went wrong. Try again."); } }); };
        var gift=card.querySelector("[data-gift]"), gf=card.querySelector(".swm-giftf");
        if(gift&&gf){
          var PASS={day:"Day pass",week:"Week pass",month:"Month pass"};
          var go=gf.querySelector("[data-giftgo]"), note=gf.querySelector("#swmGiftNote"), prev=gf.querySelector(".swm-gprev");
          var pick=function(k){ var on=gf.querySelector("[data-gseg='"+k+"'] [aria-pressed='true']"); return on&&on.getAttribute("data-v"); };
          /* The preview and the button follow every choice, so what is given is never a guess. */
          var paint=function(){
            var p=pick("pass"), w=pick("why");
            prev.innerHTML=clean(giftHtml(w,PASS[p],null,note.value.replace(/^\s+|\s+$/g,"")));
            go.textContent="Give "+PASS[p]+(w==="gift"?" as a gift":" as a reimbursement");
          };
          gf.querySelectorAll("[data-gseg] button").forEach(function(b){ b.onclick=function(){
            b.parentNode.querySelectorAll("button").forEach(function(x){ x.setAttribute("aria-pressed",String(x===b)); }); paint(); }; });
          note.oninput=paint;
          paint();
          gift.onclick=function(){ gf.hidden=!gf.hidden; gift.setAttribute("aria-expanded",String(!gf.hidden));
            if(!gf.hidden) gf.querySelector("[data-gseg] [aria-pressed='true']").focus(); };
          go.onclick=function(){
            if(!root.confirm(go.textContent+" to "+nameOf(r)+"?")) return;
            go.disabled=true; var was=go.textContent; go.textContent="Giving…";
            a.req("POST","/api/account/gift",{id:r.id,pass:pick("pass"),reason:pick("why"),note:note.value},function(c2,j){
              go.disabled=false; go.textContent=was;
              if(c2===200&&j&&j.ok){
                var d=new Date(j.until).toLocaleDateString("en-GB",{day:"numeric",month:"short"});
                say("Given. "+nameOf(r)+"'s pass now runs until "+d+"."+(j.sent?"":" The message didn't send, so tell them yourself."));
                open(id);
              } else say(c2===503?"Couldn't give it. Has sql/gifts.sql been run in Supabase?":
                /* No answer may still have been given: check before a second try gifts twice. */
                !c2?"No answer. Reopen their profile and check their plan before trying again.":"Something went wrong. Nothing was given. Try again.");
            });
          };
        }
        var out=card.querySelector("[data-out]");
        if(out) out.onclick=function(){ if(!root.confirm("Sign "+r.email+" out on every device?")) return; out.disabled=true;
          a.req("POST","/api/account/signout",{email:r.email},function(c2){ if(c2===200){ say("Signed out on every device."); open(id); } else { out.disabled=false; say("Something went wrong. Try again."); } }); };
      });
    }
    root.swMsg._openReader=open;
    return { open:open };
  }
  /* Called by account-ui.js when the Admin view opens: fills both tabs. */
  function admin(v,a,say,setCount,goTab){
    readers=null;
    var m=messagesTab(v,a,say,setCount,goTab);
    readersTab(v,a,say,m,goTab);
  }

  root.swMsg={poll:poll,inbox:inbox,admin:admin,unread:function(){ return state.unread; },adminUnread:function(){ return state.adminUnread; }};
  /* Polled on load, every ten minutes while the app is open, and on coming back to it. */
  function tick(){ if(!d.hidden) poll(); }
  root.addEventListener("load",function(){ setTimeout(tick,3000); });
  setInterval(tick,10*60*1000);
  d.addEventListener("visibilitychange",tick);
})(typeof window!=="undefined"?window:this);
