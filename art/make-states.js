const sharp=require('sharp');
const F=96, GROUND=95; // last opaque row of every frame
const FUR=[155,91,65],OUT=[84,35,34],DARK=[38,37,36],MUZ=[238,196,145],PAD=[195,120,89],PINK=[232,112,136],WHITE=[252,235,219];
class Img{constructor(w,h,d){this.w=w;this.h=h;this.d=d||Buffer.alloc(w*h*4)}
 get(x,y){if(x<0||y<0||x>=this.w||y>=this.h)return null;const i=(y*this.w+x)*4;return this.d[i+3]?[this.d[i],this.d[i+1],this.d[i+2]]:null}
 set(x,y,c){if(x<0||y<0||x>=this.w||y>=this.h)return;const i=(y*this.w+x)*4;if(!c){this.d[i+3]=0;return}this.d[i]=c[0];this.d[i+1]=c[1];this.d[i+2]=c[2];this.d[i+3]=255}
 clone(){return new Img(this.w,this.h,Buffer.from(this.d))}
 blit(src,ox,oy,rows){for(let y=0;y<src.h;y++){if(rows&&(y<rows[0]||y>rows[1]))continue;for(let x=0;x<src.w;x++){const c=src.get(x,y);if(c)this.set(x+ox,y+oy,c)}}}
 bottom(){for(let y=this.h-1;y>=0;y--)for(let x=0;x<this.w;x++)if(this.get(x,y))return y;return -1}}
const lum=c=>0.3*c[0]+0.59*c[1]+0.11*c[2];
const isSteam=(c,x,y)=>c&&x>=20&&x<=36&&y>=40&&y<=53&&lum(c)>110&&Math.max(...c)-Math.min(...c)<70;
function steamMask(b){const m=[];for(let y=40;y<=53;y++)for(let x=20;x<=36;x++)if(isSteam(b.get(x,y),x,y))m.push([x,y]);return m}
function removeSteam(b){const m=steamMask(b),k=new Set(m.map(p=>p+''));for(const [x,y] of m){let c=null;for(let dx=1;dx<10&&!c;dx++){for(const X of [x-dx,x+dx]){const q=b.get(X,y);if(q&&!k.has([X,y]+'')){c=q;break}}}b.set(x,y,c)}return m}
function moveSteam(b,dy,mirror){const m=steamMask(b);const cols=m.map(([x,y])=>b.get(x,y));removeSteam(b);m.forEach(([x,y],i)=>{const X=mirror?(20+36-x):x;b.set(X,y+dy,cols[i])})}
const EYES=[[14,27],[36,27]]; // 7x8 boxes
function clearEye(b,ex,ey){for(let y=ey;y<ey+8;y++)for(let x=ex;x<ex+7;x++){const c=b.get(x,y);if(c&&(lum(c)<60||lum(c)>200))b.set(x,y,FUR)}}
function closedEyes(b){for(const [ex,ey] of EYES){clearEye(b,ex,ey);[[0,31],[6,31],[1,32],[2,32],[3,32],[4,32],[5,32]].forEach(([dx,y])=>b.set(ex+dx,y,OUT))}}
function happyEyes(b){for(const [ex,ey] of EYES){clearEye(b,ex,ey);[[0,32],[1,31],[2,30],[3,30],[4,30],[5,31],[6,32],[1,32],[5,32]].forEach(([dx,y])=>b.set(ex+dx,y,DARK))}}
function surprisedMouth(b){for(let y=36;y<=40;y++)for(let x=22;x<=35;x++){const c=b.get(x,y);if(c&&lum(c)<60)b.set(x,y,MUZ)}
 [[27,37],[28,37],[29,37],[26,38],[30,38],[26,39],[30,39],[27,40],[28,40],[29,40]].forEach(([x,y])=>b.set(x,y,OUT));[[27,38],[28,38],[29,38],[27,39],[28,39],[29,39]].forEach(([x,y])=>b.set(x,y,[120,40,45]))}
function shiftRows(b,y0,y1,dy){const n=b.clone();for(let y=y0;y<=y1;y++)for(let x=0;x<b.w;x++)n.set(x,y,null);for(let y=y0;y<=y1;y++)for(let x=0;x<b.w;x++){const c=b.get(x,y);if(c)n.set(x,y+dy,c)}
 // fill gap above moved block (dy>0) by repeating row y0-1
 if(dy>0)for(let g=0;g<dy;g++)for(let x=0;x<b.w;x++){const c=b.get(x,y0-1);if(c&&!n.get(x,y0+g))n.set(x,y0+g,c)}return n}
function headDown(b,dy){const body=b.clone();for(let y=0;y<48;y++)for(let x=0;x<b.w;x++)body.set(x,y,null);const head=b.clone();for(let y=48;y<b.h;y++)for(let x=0;x<b.w;x++)head.set(x,y,null);const n=new Img(b.w,b.h);n.blit(body,0,0);n.blit(head,0,dy);return n}
function heart(b,x,y){const p=["0110110","1111111","1111111","0111110","0011100","0001000"];p.forEach((r,j)=>[...r].forEach((ch,i)=>{if(ch==='1')b.set(x+i,y+j,PINK)}))}
function drop(b,x,y){[[1,0],[1,1],[0,2],[1,2],[2,2],[0,3],[1,3],[2,3],[1,4]].forEach(([i,j])=>b.set(x+i,y+j,[150,200,235]))}
function zz(){}
function walkBody(b){const n=b.clone();for(let y=67;y<b.h;y++)for(let x=0;x<b.w;x++)n.set(x,y,null);
 const rows=[[67,1],[68,2],[69,4]];for(const [y,r] of rows){const a=7+r,e=49-r;for(let x=a;x<=e;x++)n.set(x,y,(x===a||x===e||y===69)?OUT:FUR)}
 // clean tail column left of body
 for(let y=60;y<67;y++)for(let x=0;x<7;x++)n.set(x,y,null);return n}
function leg(n,x0,y0,h){
 // short leg column, then a round oval paw at the bottom
 const b=y0+h-1, footH=6, top=b-footH+1;
 for(let y=y0;y<top+2;y++)for(let x=x0+1;x<=x0+9;x++)n.set(x,y,(x===x0+1||x===x0+9)?OUT:FUR);
 const insets=[3,1,0,0,1,3], fx0=x0-1, fw=13;
 for(let r=0;r<footH;r++){const y=top+r,a=fx0+insets[r],e=fx0+fw-1-insets[r];
  for(let x=a;x<=e;x++){const edge=x===a||x===e||r===0&&(x<a+2||x>e-2)||r===footH-1;
   const sole=r>=footH-3&&!edge&&x>a+1&&x<e-1;n.set(x,y,edge?OUT:(sole?PAD:FUR))}}
 // little toe beans
 n.set(fx0+4,b-2,[217,142,113]);n.set(fx0+6,b-2,[217,142,113]);n.set(fx0+8,b-2,[217,142,113]);}
function frame(spr,ox,oy){const f=new Img(F,F);f.blit(spr,ox,oy);return f}
function place(spr,lift=0){const bt=spr.bottom();return frame(spr,Math.round((F-spr.w)/2),GROUND-bt-lift)}
async function strip(name,frames){const W=F*frames.length,s=new Img(W,F);frames.forEach((f,i)=>s.blit(f,i*F,0));await sharp(s.d,{raw:{width:W,height:F,channels:4}}).png().toFile(process.argv[2]+'/'+name+'.png');return s}
(async()=>{
const {data,info}=await sharp('../base.png').raw().toBuffer({resolveWithObject:true});const base=new Img(info.width,info.height,Buffer.from(data));
const S={};
// idle: steam drifts, gentle breath
const i0=base.clone();const i1=base.clone();moveSteam(i1,-1,false);const i2=headDown(base,1);moveSteam(i2,0,true);const i3=headDown(base,1);moveSteam(i3,-1,true);
S.idle=[i0,i1,i2,i3].map(x=>place(x));
// sleep: no steam, eyes closed, head nods
const sl=base.clone();removeSteam(sl);closedEyes(sl);S.sleep=[place(headDown(sl,2)),place(headDown(sl,3))];
// happy: ^^ eyes, hop + heart
const hp=base.clone();happyEyes(hp);const h0=place(hp);const h1=place(hp,5);heart(h1,Math.round((F-base.w)/2)+base.w-3,2);S.happy=[h0,h1];
// drag: surprised, feet dangle, sweat drop
const dg=base.clone();surprisedMouth(dg);const d0=shiftRows(dg,70,84,2);const d1=shiftRows(dg,70,84,3);const D0=place(d0),D1=place(d1);drop(D0,Math.round((F-base.w)/2)+base.w-6,30);drop(D1,Math.round((F-base.w)/2)+base.w-6,32);S.drag=[D0,D1];
// walk: standing on two little legs, holding the cup
const wb=walkBody(base);moveSteam(wb,0,false);
function walkFrame(liftL,liftR,bob,mirrorSteam){const n=new Img(base.w,base.h+12);n.blit(wb,0,0,[0,69]);if(mirrorSteam)moveSteam(n,0,true);leg(n,14,68,10-liftL);leg(n,32,68,10-liftR);for(const x0 of [14,32])for(let x=x0+2;x<x0+9;x++){n.set(x,68,FUR);n.set(x,69,FUR)}
 const f=place(n);if(bob){const g=new Img(F,F);g.blit(f,0,-1);return g}return f}
// keep feet planted: place() aligns lowest pixel; lifted leg is shorter so body stays level
S.walk=[walkFrame(4,0,false,false),walkFrame(0,0,true,true),walkFrame(0,4,false,false),walkFrame(0,0,true,true)];
for(const k of Object.keys(S))await strip(k,S[k]);
// preview sheet: each animation row, 3x, on desktop-ish bg
const rows=['idle','walk','happy','drag','sleep'];const PW=F*4,PH=F*rows.length,pv=new Img(PW,PH);
rows.forEach((r,j)=>S[r].forEach((f,i)=>pv.blit(f,i*F,j*F)));
await sharp(pv.d,{raw:{width:PW,height:PH,channels:4}}).resize(PW*3,PH*3,{kernel:'nearest'}).flatten({background:'#5b8fb9'}).png().toFile('../preview.png');
console.log('done');
})();
