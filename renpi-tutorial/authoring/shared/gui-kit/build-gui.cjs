const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const sharp = require("sharp");

const root = __dirname;
const game = path.resolve(root, "../../../game");
const output = path.join(game, "gui/renpi");
const source = path.join(root, "svg");
const ink = "#FFF4ED";
const muted = "#A2A7B6";
const states = {
  idle:                 { fill: "#252A3B", edge: "#68708B", accent: "#EE6D68" },
  hover:                { fill: "#333549", edge: "#FFC0AC", accent: "#FFC0AC" },
  selected_idle:        { fill: "#653444", edge: "#EE6D68", accent: "#FFC0AC" },
  selected_hover:       { fill: "#7B3B4B", edge: "#FFD7C8", accent: "#FFF4ED" },
  insensitive:          { fill: "#272B37", edge: "#444A5D", accent: "#707788" },
  selected_insensitive: { fill: "#35303D", edge: "#615260", accent: "#9F7782" },
};
const assets = [];

function outline(w, h, c, i = 1) {
  return "M " + (i+c) + " " + i + " H " + (w-i-c) + " L " + (w-i) + " " + (i+c)
    + " V " + (h-i-c) + " L " + (w-i-c) + " " + (h-i) + " H " + (i+c)
    + " L " + i + " " + (h-i-c) + " V " + (i+c) + " Z";
}
function shell(w, h, c, s, opacity = 1) {
  return '<path d="' + outline(w,h,c) + '" fill="' + s.fill + '" fill-opacity="' + opacity
    + '" stroke="' + s.edge + '" stroke-width="2"/>';
}
function svg(w, h, body) {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h
    + '" viewBox="0 0 ' + w + ' ' + h + '">' + body + '</svg>';
}
async function asset(name, w, h, body, borders = null, padding = null) {
  const xml = svg(w,h,body);
  assert(!xml.includes("<text"), "Production assets must be text-free");
  fs.writeFileSync(path.join(source,name+".svg"),xml+"\n");
  const file = name+".png";
  await sharp(Buffer.from(xml)).png().toFile(path.join(output,file));
  const meta = await sharp(path.join(output,file)).metadata();
  const {data,info} = await sharp(path.join(output,file)).raw().toBuffer({resolveWithObject:true});
  assert.equal(meta.width,w); assert.equal(meta.height,h); assert.equal(info.channels,4);
  assert.equal(data[3],0,"Top-left corner must be transparent");
  assert(data.some((v,i)=>i%4===3 && v===255),"Asset needs opaque content");
  if(borders) assert(borders[0]+borders[2]<w && borders[1]+borders[3]<h);
  assets.push({file,width:w,height:h,frame_borders:borders,text_padding:padding,has_alpha:true});
}
function luminance(hex) {
  const v=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255)
    .map(x=>x<=0.04045?x/12.92:((x+0.055)/1.055)**2.4);
  return .2126*v[0]+.7152*v[1]+.0722*v[2];
}
function contrast(a,b) {
  const x=luminance(a),y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
async function labelSheet() {
  const layers=[],labels=[];
  async function place(file,x,y,w,label) {
    const bytes=await sharp(path.join(output,file+".png")).resize({width:w}).png().toBuffer();
    layers.push({input:bytes,left:x,top:y});
    if(label) labels.push('<text x="'+x+'" y="'+(y-12)+'" font-size="18" fill="#B8BECE">'+label+'</text>');
  }
  await place("namebox",48,150,320,"NAMEPLATE");
  await place("panel",1288,150,264,"NINE-SLICE PANEL");
  await place("textbox",48,290,1152,"DIALOGUE FRAME");
  for(const [i,s] of Object.keys(states).entries()) {
    await place("button_"+s,48+(i%3)*400,560+Math.floor(i/3)*124,360,s.toUpperCase());
    await place("choice_"+s,48+(i%2)*768,846+Math.floor(i/2)*106,720,"CHOICE / "+s.toUpperCase());
    await place("check_"+s,48+i*104,1230,48,i===0?"CHECKBOX / ALL SIX STATES":null);
  }
  await place("slider_right",760,1250,512,"SLIDER");
  const left=await sharp(path.join(output,"slider_left.png")).extract({left:0,top:0,width:270,height:16}).png().toBuffer();
  layers.push({input:left,left:760,top:1250});
  await place("slider_thumb_hover",1008,1226,64,null);
  await place("close_idle",1350,1230,48,"CLOSE");
  await place("close_hover",1410,1230,48,null);
  await place("continue",1500,1246,24,null);
  const backdrop=svg(1600,1360,'<rect width="1600" height="1360" fill="#151B29"/><g font-family="Arial, sans-serif"><text x="48" y="65" font-size="38" font-weight="700" fill="'+ink+'">REN’PI / INTERFACE KIT</text><text x="48" y="101" font-size="20" fill="#EE6D68">'+assets.length+' TRANSPARENT PNGs · EDITABLE SVGs · NO BAKED TEXT</text>'+labels.join("")+'</g>');
  await sharp(Buffer.from(backdrop)).composite(layers).png().toFile(path.join(root,"controls-preview.png"));
}
async function scenePreview() {
  const background=path.join(root,"../backgrounds/bg-study-day.png");
  const portrait=path.join(root,"../renpi-portraits/renpi-neutral.png");
  const layers=[
    {input:await sharp(portrait).resize(920,920).png().toBuffer(),left:60,top:52},
    {input:fs.readFileSync(path.join(output,"textbox.png")),left:96,top:764},
    {input:fs.readFileSync(path.join(output,"namebox.png")),left:144,top:720},
    {input:await sharp(path.join(output,"choice_idle.png")).resize(720,66).png().toBuffer(),left:1080,top:390},
    {input:await sharp(path.join(output,"choice_hover.png")).resize(720,66).png().toBuffer(),left:1080,top:476},
    {input:fs.readFileSync(path.join(output,"continue.png")),left:1756,top:996},
  ];
  const text=svg(1920,1080,'<g font-family="Microsoft YaHei, Arial, sans-serif" fill="'+ink+'"><text x="184" y="768" font-size="30" font-weight="700">Ren’Pi</text><text x="151" y="858" font-size="38">欢迎来到 Ren’Pi 教程。</text><text x="151" y="925" font-size="34">从一个场景开始，把你的故事变成可以运行的作品。</text><text x="1440" y="433" font-size="28" text-anchor="middle">开始第一节教程</text><text x="1440" y="519" font-size="28" text-anchor="middle">先看看功能介绍</text></g>');
  layers.push({input:Buffer.from(text),left:0,top:0});
  const composed=await sharp(background).resize(1920,1080).composite(layers).png().toBuffer();
  await sharp(composed).resize(1440,810).png().toFile(path.join(root,"scene-preview.png"));
}
async function main() {
  fs.mkdirSync(output,{recursive:true});fs.mkdirSync(source,{recursive:true});
  await asset("textbox",1728,288,
    shell(1728,288,28,{fill:"#242735",edge:"#7A7183"},.97)
    +'<path d="M30 3 H120 L140 11 H30 Z" fill="#EE6D68"/>'
    +'<path d="M12 60 V228" stroke="#FFC0AC" stroke-width="3"/>'
    +'<path d="M1690 262 H1702 V250" fill="none" stroke="#EE6D68" stroke-width="3"/>',
    [160,40,48,40],[56,52,64,40]);
  await asset("namebox",320,72,shell(320,72,16,{fill:"#963F50",edge:"#FFC0AC"})
    +'<path d="M16 20 V52" stroke="#FFC0AC" stroke-width="3"/>',
    [32,24,32,24],[40,14,32,14]);
  await asset("panel",800,640,shell(800,640,24,{fill:"#242735",edge:"#7A7183"})
    +'<path d="M27 3 H104 L120 11 H27 Z" fill="#EE6D68"/>'
    +'<path d="M768 606 H777 V597" fill="none" stroke="#FFC0AC" stroke-width="2"/>',
    [136,32,40,48],[40,40,40,40]);
  for(const [state,s] of Object.entries(states)) {
    const chosen=state.startsWith("selected");
    for(const [kind,w,h,c] of [["button",360,80,14],["choice",960,88,16]]) {
      let body=shell(w,h,c,s)
        +'<path d="M14 24 V'+(h-24)+'" stroke="'+s.accent+'" stroke-width="'+(chosen?6:3)+'"/>';
      if(state.includes("hover")) body+='<path d="'+outline(w,h,c-4,6)+'" fill="none" stroke="'+s.accent+'" stroke-opacity=".5"/>';
      if(chosen) body+='<path d="M'+(w-31)+' '+(h/2-5)+' L'+(w-26)+' '+(h/2)+' L'+(w-31)+' '+(h/2+5)+' L'+(w-36)+' '+(h/2)+' Z" fill="'+s.accent+'"/>';
      await asset(kind+"_"+state,w,h,body,[40,24,48,24],[40,16,48,16]);
    }
    let check=shell(48,48,8,s);
    if(chosen) check+='<path d="M13 24 L21 32 L35 16" fill="none" stroke="'+s.accent+'" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>';
    else check+='<path d="'+outline(48,48,5,8)+'" fill="none" stroke="'+s.edge+'" stroke-opacity=".65"/>';
    await asset("check_"+state,48,48,check);
  }
  for(const disabled of [false,true]) {
    const prefix=disabled?"slider_insensitive_":"slider_";
    for(const [side,fill] of [["left",disabled?"#796572":"#EE6D68"],["right",disabled?"#343A49":"#46516A"]]) {
      await asset(prefix+side,512,16,shell(512,16,5,{fill,edge:disabled?"#515767":"#8790A6"}),[8,0,8,0]);
    }
  }
  for(const state of ["idle","hover","insensitive"]) {
    const s=states[state];
    await asset("slider_thumb_"+state,64,48,shell(64,48,10,s)
      +'<path d="M28 16 V32 M36 16 V32" stroke="'+s.accent+'" stroke-width="3"/>');
    await asset("close_"+state,48,48,shell(48,48,8,s)
      +'<path d="M17 17 L31 31 M31 17 L17 31" stroke="'+s.accent+'" stroke-width="3" stroke-linecap="round"/>');
  }
  await asset("continue",24,16,'<path d="M2 2 H22 L12 13 Z" fill="#FFC0AC"/>');
  assert.equal(assets.length,32);
  const contrastChecks=Object.entries(states).map(([state,s])=>{
    const text=state.includes("insensitive")?muted:ink;
    const ratio=contrast(text,s.fill);assert(ratio>=4.5,state+" text contrast");
    return {state,text,background:s.fill,ratio};
  });
  for(const family of ["button","choice","check","slider_thumb","close"]) {
    const names=assets.filter(a=>a.file.startsWith(family+"_") && (family!=="slider_thumb"||a.file.includes("thumb")));
    let mask;
    for(const a of names) {
      const alpha=await sharp(path.join(output,a.file)).extractChannel("alpha").raw().toBuffer();
      if(mask) assert(alpha.equals(mask),family+" state silhouette changed");else mask=alpha;
    }
  }
  fs.writeFileSync(path.join(root,"manifest.json"),JSON.stringify({reference_resolution:[1920,1080],png_directory:output,source_directory:source,text_color:ink,disabled_text_color:muted,assets},null,2)+"\n");
  await labelSheet();await scenePreview();
  fs.writeFileSync(path.join(root,"validation.json"),JSON.stringify({checks:{asset_count:assets.length,exact_dimensions:true,alpha_channels:true,text_free_sources:true,identical_state_alpha_masks:true,valid_nine_slice_borders:true},contrast:contrastChecks,renpy_runtime_tested:false},null,2)+"\n");
  console.log("PASS: 32 PNG + 32 SVG; dimensions, alpha masks, 9-slice borders and text contrast.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
