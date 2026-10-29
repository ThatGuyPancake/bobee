// All calendar dates use the PC's local clock. Ranges include both endpoints.
export function easterSunday(year) {
  const a=year%19, b=Math.floor(year/100), c=year%100;
  const d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25), g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30, i=Math.floor(c/4), k=c%4;
  const l=(32+2*e+2*i-h-k)%7, m=Math.floor((a+11*h+22*l)/451);
  const n=h+l-7*m+114;
  return new Date(year,Math.floor(n/31)-1,n%31+1);
}
// Holidays precede seasons, so the first matching row owns each slot.
// Feb 29 is interpreted as the last day of February in every year.
export const OUTFIT_TABLE = [
  {from:[12,1],to:[12,26],slot:'hat',prop:'santa-hat',message:'christmas'},
  {from:[12,31],to:[1,1],slot:'hat',prop:'party-hat',message:'newyear'},
  {from:[2,14],to:[2,14],slot:'hat',prop:'heart-clip',message:'valentine'},
  {from:'goodFriday',to:'easterMonday',slot:'hat',prop:'bunny-ears',message:'easter'},
  {from:[10,24],to:[10,31],slot:'hat',prop:'pumpkin-hat',message:'halloween'},
  {from:[12,1],to:[2,29],slot:'neck',prop:'scarf',message:'winter'},
  {from:[3,20],to:[5,31],slot:'hat',prop:'flower-crown',message:'spring'},
  {from:[6,21],to:[8,31],slot:'face',prop:'sunglasses',message:'summer'},
];
function endpoint(value, year) {
  if(typeof value==='string') {
    const date=easterSunday(year); date.setDate(date.getDate()+(value==='goodFriday'?-2:1));
    return (date.getMonth()+1)*100+date.getDate();
  }
  const [month,day]=value;
  return month*100+Math.min(day,new Date(year,month,0).getDate());
}
export function outfitFor(date) {
  const out={hat:null,neck:null,face:null,messages:[]};
  const day=(date.getMonth()+1)*100+date.getDate(), year=date.getFullYear();
  for(const row of OUTFIT_TABLE) {
    const from=endpoint(row.from,year),to=endpoint(row.to,year);
    if(from<=to ? day>=from&&day<=to : day>=from||day<=to) {
      out[row.slot] ??= row.prop;
      if(!out.messages.includes(row.message)) out.messages.push(row.message);
    }
  }
  return out;
}

const HIDE_FACE = new Set(['sleep', 'sleep-pet', 'sleep-peek', 'yawn']);
export function createOutfitLayer({ anchors, props, images }) {
  let outfit = null, blushing = false;
  return {
    set(value) { outfit = value; },
    blush(on) { blushing = !!on; },
    draw(ctx, { animation, frame, dx, dy, scale }) {
      const anchor = anchors[animation]?.[frame];
      if (!Array.isArray(anchor) || anchor.length !== 2 || !anchor.every(Number.isFinite)) return;
      const [ax, ay] = anchor;
      if (blushing && animation === 'idle') {
        ctx.fillStyle = 'rgb(214, 120, 110)';
        // Master's cheek marks at x=31/61, y=47, relative to head [48,15].
        for (const ox of [-17, 13]) ctx.fillRect(dx + (ax + ox) * scale, dy + (ay + 32) * scale, 4 * scale, 2 * scale);
      }
      for (const slot of ['neck', 'hat', 'face']) {
        if (slot === 'face' && HIDE_FACE.has(animation)) continue;
        const name = outfit?.[slot], prop = props[name], image = images[name];
        if (!prop || !image || prop.slot !== slot || !Array.isArray(prop.pivot)) continue;
        const [px, py] = prop.pivot;
        if (![px, py].every(Number.isFinite)) continue;
        ctx.drawImage(image, dx + (ax - px) * scale, dy + (ay - py) * scale,
          (image.naturalWidth || image.width) * scale, (image.naturalHeight || image.height) * scale);
      }

    },
  };
}
