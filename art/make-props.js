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
// Full jack-o'-lantern mask; keep the existing calendar prop name.
piece('pumpkin-hat','hat',[48,15],im=>{
  const shade=[187,87,38], glow=[255,213,101];
  rect(im,47,10,5,9,green); rect(im,51,10,5,3,green);
  for(let y=15;y<=62;y++) for(let x=19;x<=77;x++) {
    if(((x-48)/29)**2+((y-38)/24)**2<0.98) {
      const rib=Math.abs(x-48)>19 || Math.abs(x-48)<2;
      im.set(x,y,rib?shade:orange);
    }
  }
  // Carved triangular eyes and nose, with a warm interior.
  for(const cx of [36,60]) for(let row=0;row<8;row++) rect(im,cx-Math.floor(row*.65),29+row,Math.floor(row*.65)*2+1,1,glow);
  for(let row=0;row<5;row++) rect(im,48-Math.floor(row/2),39+row,Math.floor(row/2)*2+1,1,glow);
  for(let y=48;y<=55;y++) {
    const inset=y>52?(y-52)*2:0; rect(im,32+inset,y,33-2*inset,1,C.out);
  }
  rect(im,35,49,27,3,glow); rect(im,40,52,17,2,glow);
  rect(im,41,48,4,4,orange); rect(im,53,51,4,4,orange);
});
// Anchor is master [48,15]; jaw row 60 is +45, eyes row 42 is +27.
// Negative pivots deliberately place these pieces below the head anchor.
piece('scarf','neck',[48,-13],im=>{
  rect(im,28,29,41,7,red); rect(im,57,34,8,16,red);
  for(let x=32;x<67;x+=5) rect(im,x,30,2,4,redShade);
  rect(im,58,40,6,2,gold); rect(im,58,46,6,2,gold);
});
// A tilted teal cap and shades share the awake-only summer prop.
piece('sunglasses','face',[48,15],im=>{
  const teal=[48,108,119], light=[73,143,151];
  for(let y=9;y<=23;y++) {
    const inset=y<14?14-y:0; rect(im,30+inset,y,34-inset,1,teal);
  }
  rect(im,31,19,33,4,light); rect(im,48,23,25,4,teal);
  rect(im,39,12,3,4,gold); rect(im,37,13,7,2,gold);
  rect(im,29,40,17,9,C.dark); rect(im,51,40,17,9,C.dark); rect(im,45,41,7,3,C.dark);
  rect(im,32,42,4,2,[109,146,160]); rect(im,54,42,4,2,[109,146,160]);
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

