// Code-drawn outfit pieces. Same opaque palette and pixel helpers as Bobee.
const fs = require('fs');
const path = require('path');
const { C, Img, readPng, writePng } = require('./pixels.js');
const dir = path.join(__dirname, '..', 'assets', 'props');
fs.mkdirSync(dir, { recursive: true });
const red = [190, 55, 64], redShade = [140, 43, 52], gold = [241, 186, 82];
const green = [86, 130, 83], pink = [232, 142, 161], orange = [221, 125, 55];
const props = {}, images = {};
function rect(im, x, y, w, h, c) {
  for (let yy=y; yy<y+h; yy++) for(let xx=x; xx<x+w; xx++) im.set(xx, yy, c);
}
function piece(name, slot, pivot, draw) {
  const mask = new Img(96,96); draw(mask);
  // Grow a one-pixel dark outline around the filled silhouette.
  const im = new Img(96,96);
  for(let y=1;y<95;y++) for(let x=1;x<95;x++) if(mask.get(x,y)) {
    for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]) im.set(x+dx,y+dy,C.out);
  }
  im.blit(mask); images[name]=im; props[name]={slot,pivot};
  writePng(path.join(dir,name+'.png'),im);
}
piece('santa-hat','hat',[48,20],im=>{
  for(let y=12;y<29;y++) { const t=y-12; rect(im,44-Math.floor(t*.55),y,8+Math.floor(t*.9),1,red); }
  rect(im,34,28,29,5,C.cream); rect(im,52,13,7,5,red); rect(im,56,16,6,6,C.cream);
});
piece('party-hat','hat',[48,17],im=>{
  for(let y=9;y<33;y++) { const r=Math.floor((y-9)*.5)+1; rect(im,48-r,y,r*2,1,y%7<3?gold:pink); }
  for(const [x,y,c] of [[29,14,gold],[64,12,pink],[29,25,green],[65,25,gold]]) rect(im,x,y,2,2,c);
});
piece('heart-clip','hat',[48,31],im=>{
  const rows=['.xxx.xxx.','xxxxxxxxx','xxxxxxxxx','.xxxxxxx.','..xxxxx..','...xxx...'];
  rows.forEach((r,y)=>[...r].forEach((c,x)=>{if(c==='x') im.set(58+x,30+y,pink);}));
});
piece('bunny-ears','hat',[48,20],im=>{
  for(const x of [36,53]) { rect(im,x,13,7,20,C.cream); rect(im,x+2,16,3,14,pink); }
  rect(im,34,31,29,4,C.cream);
});
piece('flower-crown','hat',[48,31],im=>{
  rect(im,30,30,37,3,green);
  for(const x of [33,43,53,63]) { rect(im,x-2,26,5,8,C.cream); rect(im,x-4,28,9,4,pink); rect(im,x-1,29,3,3,gold); }
});
piece('pumpkin-hat','hat',[48,23],im=>{
  rect(im,47,15,4,6,green);
  for(let y=21;y<33;y++) { const inset=y<24?24-y:y>30?y-30:0; rect(im,34+inset,y,29-2*inset,1,orange); }
  rect(im,43,24,2,3,C.out); rect(im,54,24,2,3,C.out); rect(im,46,29,7,2,gold);
});
// Anchor is master [48,15]; jaw row 60 is +45, eyes row 42 is +27.
// Negative pivots deliberately place these pieces below the head anchor.
piece('scarf','neck',[48,-13],im=>{
  rect(im,28,29,41,7,red); rect(im,57,34,8,16,red);
  for(let x=32;x<67;x+=5) rect(im,x,30,2,4,redShade);
  rect(im,58,40,6,2,gold); rect(im,58,46,6,2,gold);
});
piece('sunglasses','face',[48,3],im=>{
  rect(im,29,28,17,9,C.dark); rect(im,51,28,17,9,C.dark); rect(im,45,29,7,3,C.dark);
  rect(im,32,30,4,2,[109,146,160]); rect(im,54,30,4,2,[109,146,160]);
});
fs.writeFileSync(path.join(dir,'props.json'),JSON.stringify(props,null,2)+'\n');
const previewAt=process.argv.indexOf('--preview-props');
if(previewAt>=0) {
  const idle=readPng(path.join(dir,'../bobee/idle.png'));
  const anchor=JSON.parse(fs.readFileSync(path.join(dir,'../bobee/anchors.json'))).idle[0];
  const names=Object.keys(props), z=4, out=new Img(96*4*z,96*2*z);
  for(let y=0;y<out.h;y++) for(let x=0;x<out.w;x++) out.set(x,y,[70,150,115]);
  names.forEach((name,i)=>{
    const tile=new Img(96,96); tile.blit(idle,0,0,(x)=>x<96);
    const [px,py]=props[name].pivot; tile.blit(images[name],anchor[0]-px,anchor[1]-py);
    for(let y=0;y<96;y++) for(let x=0;x<96;x++) { const c=tile.get(x,y); if(c) rect(out,((i%4)*96+x)*z,(Math.floor(i/4)*96+y)*z,z,z,c); }
  });
  writePng(process.argv[previewAt+1],out);
}
console.log('outfit props generated');
