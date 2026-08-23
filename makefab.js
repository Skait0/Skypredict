// Extracted makeFab from index.html for testing
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