const canvas=document.getElementById('prop'),ctx=canvas.getContext('2d',{willReadFrequently:true});
const images={};let revision=0;let view='jar',held=false,pointer=null,through=true;
const setThrough=on=>{if(on!==through){through=on;window.jar.setClickThrough(on);}};
function opaque(e){const r=canvas.getBoundingClientRect(),x=Math.floor(e.clientX-r.left),y=Math.floor(e.clientY-r.top);return x>=0&&y>=0&&x<canvas.width&&y<canvas.height&&ctx.getImageData(x,y,1,1).data[3]>0;}
function finish(cancel=false){if(!held)return;held=false;window.jar.release(cancel);if(pointer!==null&&canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);pointer=null;setThrough(true);}
window.jar.onState(async state=>{
 const token=++revision;
 if(state.view==='jar'&&state.open===false&&held){held=false;if(pointer!==null&&canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);pointer=null;}
 view=state.view;const name=view==='treat'?state.treat:(state.open?'jar-open':'jar');
 if(!['jar','jar-open','cookie','honey','berries'].includes(name))return;
 if(!images[name])images[name]=new Promise(resolve=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>resolve(null);im.src='/assets/props/'+name+'.png';});
 const image=await images[name];if(!image){window.jar.assetFailed();return;}
 // A slow image must not repaint an older state over the newest state.
 if(token!==revision)return;
 canvas.width=image.width;canvas.height=image.height;ctx.imageSmoothingEnabled=false;ctx.drawImage(image,0,0);
 if(view==='treat')setThrough(true);
});
window.addEventListener('pointermove',e=>{if(view==='treat')return;if(held){if(!(e.buttons&1))finish(true);return;}setThrough(!opaque(e));});
canvas.addEventListener('pointerdown',e=>{if(e.button!==0||view!=='jar'||!opaque(e))return;held=true;pointer=e.pointerId;try{canvas.setPointerCapture(pointer);}catch{finish(true);return;}window.jar.grab();});
window.addEventListener('pointerup',e=>{if(e.button===0)finish();});
canvas.addEventListener('lostpointercapture',()=>finish(true));
window.addEventListener('pointercancel',()=>finish(true));
window.addEventListener('blur',()=>finish(true));
window.addEventListener('pointerleave',()=>{if(!held)setThrough(true);});
