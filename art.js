'use strict';
// Presentation only. All prices, timers, rewards and saved data live in model.js.
(() => {
  const load = src => new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });
  const shade = (hex, n) => `rgb(${[1,3,5].map(i => Math.max(0, Math.min(255, parseInt(hex.slice(i,i+2),16)+n))).join(',')})`;
  class ArchiveArt {
    static icon(kind) {
      const paths = {
        blades:'M5 5l14 14M9 3l12 12M3 9l12 12M5 5l4-2M3 9l2-4M19 19l2-4',
        tier:'M3 7h7l2 2h9v11H3zM4 7V4h8l2 2h6v3',
        fan:'M12 10C4-2 1 9 9 12C-2 20 9 23 12 15C20 27 23 15 15 12C26 4 15 1 12 9M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
        fuse:'M4 4v5l4 2-4 2v7M20 4v5l-4 2 4 2v7M9 3h6v18H9z',
        bin:'M5 6h14l-1 15H6zM3 6h18M9 3h6M9 10v7M15 10v7',
        compactor:'M4 4v16h16V4M7 13h10M12 3v7M9 7l3 3 3-3M7 17h10',
        cross:'M4 4l16 16M20 4L4 20M3 12h3M18 12h3M12 3v3M12 18v3',
        recycle:'M10 3h5l5 8M18 5l2 6-6-1M21 14l-3 6H8M13 23l-5-3 4-4M5 20l-4-7 5-8M1 6l5-1 1 6',
        intern:'M8 7a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4 22v-4c0-6 16-6 16 0v4M8 17v5M16 17v5',
        bagger:'M7 4h10l-2 5 4 10c1 4-15 4-14 0L9 9zM8 9h8M10 15h4M12 13v4'
      };
      return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[kind]||paths.tier}"/></svg>`;
    }
    constructor() {
      this.ready = false; this.pileKey = ''; this.lastBin = 0;
      this.feel=new ArchiveFeel();this.ribbons=[];this.ribbonClock=0;this.oldPile=null;this.binDrop=1;this.lastPower=0;this.pointer={x:0,y:0};this.pointerTarget={x:0,y:0};this.ribbonBatch=-1;this.ribbonStep=0;
      this.background = null; this.machine = null; this.atlas = null;
      this.bounds = [[57,59,262,276],[434,36,226,306],[784,36,247,313],[42,366,285,349],[406,369,283,331],[759,393,294,273],[64,734,280,284],[394,772,333,227],[816,714,179,319],[64,1043,268,352],[388,1041,346,356],[784,1144,249,222]];
      this.pile = document.createElement('canvas'); this.pile.width = 680; this.pile.height = 360;
      this.grain = document.createElement('canvas'); this.grain.width = 128; this.grain.height = 128;
      const g = this.grain.getContext('2d'), pixels = g.createImageData(128,128);
      for (let i=0;i<pixels.data.length;i+=4) { const n=Math.random()*255; pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=n; pixels.data[i+3]=16; }
      g.putImageData(pixels,0,0);
      this.loaded = Promise.all([load('assets/archive-night.png'),load('assets/shredder-body.png'),load('assets/evidence-atlas.png')]).then(([bg,machine,atlas]) => { this.background=bg;this.machine=machine;this.atlas=atlas;this.ready=true; });
    }
    evidenceIcon(id) {
      const b=this.bounds[ArchiveModel.ITEMS[id]?.sprite??0];
      return `<svg viewBox="${b.join(' ')}" aria-hidden="true" focusable="false"><image href="assets/evidence-atlas.png" x="0" y="0" width="1086" height="1448"/></svg>`;
    }
    onEvent(type,s) {
      if(type==='shredded'){this.feel.arrived();this.feel.kick(['paper','folder'].includes(s.recentItem.material)?5:12);}
      if(type==='overheat')this.feel.kick(-17);
      if(type==='empty'||type==='auto-empty'){
        const copy=document.createElement('canvas');copy.width=this.pile.width;copy.height=this.pile.height;copy.getContext('2d').drawImage(this.pile,0,0);this.oldPile=copy;this.binDrop=0;this.ribbons=[];this.ribbonBatch=-1;this.feel.kick(-5);
      }
      if(type==='grip')this.feel.kick(2);
    }
    drawRibbons(ctx,dt,s,c,paused,reduced) {
      if(reduced){this.ribbons=[];return;}
      const paper=['paper','folder'].includes(s.item.material)&&!s.levels.cross;
      if(!paused){
        // A bank of knives splits one sheet into a coherent curtain. The strands
        // stay in the outlet when feeding stops, then detach with that sheet.
        if(paper&&s.lastPressure>0&&s.progress>.04&&this.ribbonBatch!==s.total){
          this.ribbonBatch=s.total;
          for(let column=0;column<18;column++){
            const x=c-81+column*9.5,count=13,nodes=Array.from({length:count},(_,i)=>({x,y:351+i*.8,ox:x,y0:351+i*.8}));
            this.ribbons.push({nodes,x,age:0,batch:s.total,rest:.8,life:3.8,width:5.5+Math.random()*.9,color:column%5?s.item.color:'#bcb69a',seed:column*.7+s.total});
          }
        }
        if(this.ribbons.length>72)this.ribbons.splice(0,this.ribbons.length-72);
        this.ribbonStep+=Math.min(.05,dt);
        while(this.ribbonStep>=1/120){
          const step=1/120;this.ribbonStep-=step;
          for(const r of this.ribbons){
            const attached=r.batch===s.total&&paper;r.age+=step;if(!attached)r.life-=step;
            if(attached)r.rest=Math.min(13,1+s.progress*13);
            const rest=r.rest,n=r.nodes;
            for(let i=0;i<n.length;i++){
              const p=n[i];if(i===0&&attached){p.x=r.x;p.y=351;p.ox=p.x;p.y0=p.y;continue;}
              const vx=(p.x-p.ox)*.99,vy=(p.y-p.y0)*.994;p.ox=p.x;p.y0=p.y;
              p.x+=vx+Math.sin(this.feel.time*3+i*.9+r.seed)*70*step*step;p.y+=vy+620*step*step;
            }
            for(let pass=0;pass<5;pass++)for(let i=0;i<n.length-1;i++){
              const a=n[i],b=n[i+1],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,d=(len-rest)/len;
              if(i===0&&attached){b.x-=dx*d;b.y-=dy*d;}else{a.x+=dx*d*.5;a.y+=dy*d*.5;b.x-=dx*d*.5;b.y-=dy*d*.5;}
            }
            for(const p of n){const floor=538-s.fill/s.capacity*132*(.62+.38*(1-Math.min(1,Math.abs(p.x-c)/160)));if(p.y>floor){p.y=floor;p.y0=p.y+(p.y-p.y0)*.12;}p.x=Math.max(c-158,Math.min(c+158,p.x));}
          }
        }
      }
      this.ribbons=this.ribbons.filter(r=>r.life>0);
      for(const r of this.ribbons){const n=r.nodes;ctx.save();ctx.globalAlpha=Math.min(1,r.life*1.8);ctx.lineCap='round';ctx.lineJoin='round';
        for(let layer=0;layer<2;layer++){ctx.beginPath();ctx.moveTo(n[0].x,n[0].y+(!layer?1:0));for(let i=1;i<n.length-1;i++)ctx.quadraticCurveTo(n[i].x,n[i].y,(n[i].x+n[i+1].x)/2,(n[i].y+n[i+1].y)/2);ctx.lineTo(n[n.length-1].x,n[n.length-1].y);ctx.strokeStyle=layer?r.color:'#1a1d12aa';ctx.lineWidth=r.width+(layer?0:1.8);ctx.stroke();}
        ctx.strokeStyle='#5d655080';ctx.lineWidth=.7;for(let i=2;i<n.length-1;i+=3){ctx.beginPath();ctx.moveTo(n[i].x-1,n[i].y);ctx.lineTo(n[i+1].x-1,n[i+1].y);ctx.stroke();}ctx.restore();
      }
    }
    itemLayout(s,c){
      const sprite=s.item.sprite??0,b=this.bounds[sprite];let h=[112,184,184,184,180,122,165,125,180,184,177,110][sprite],w=h*b[2]/b[3];
      const maxWidth=sprite===10?242:202;if(w>maxWidth){h*=maxWidth/w;w=maxWidth;}
      const shift=this.feel.pointerX*(1-s.progress),top=218-h+s.progress*h;
      return {h,w,left:c-w/2+shift-8,right:c+w/2+shift+8,top:Math.min(top,194)-8,bottom:218};
    }
    hitItem(s,c,p){const r=this.itemLayout(s,c);return p.x>=r.left&&p.x<=r.right&&p.y>=r.top&&p.y<=r.bottom;}
    drawEvidence(ctx,s,c,reduced,now) {
      if(!this.atlas)return false;
      const sprite=s.item.sprite??0,b=this.bounds[sprite],{h,w}=this.itemLayout(s,c);
      const f=this.feel,paper=['paper','folder'].includes(s.item.material),power=f.power,free=1-s.progress;
      const entrance=reduced?0:(1-f.arrival)**3;
      const bite=reduced||paper?0:this.feel.bite*.009*power;
      ctx.save();ctx.beginPath();ctx.rect(c-160,-25,320,241);ctx.clip();
      ctx.translate(c+entrance*48+f.pointerX*free,218-h+(s.progress+bite)*h-entrance*36);
      ctx.rotate(reduced?-.012:-.012+f.grip*.10*free+Math.sin(f.phase)*power*(paper?.005:.016)+entrance*.18);
      ctx.shadowColor='#05080399';ctx.shadowBlur=9;ctx.shadowOffsetX=3;ctx.shadowOffsetY=4;
      if(paper&&!reduced){
        ctx.fillStyle='#090b0777';ctx.fillRect(-w/2+3,3,w,h);ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;
        const bend=(Math.sin(f.phase*.27)*power*3+f.grip*15+f.pointerX*.24)*free;
        const tension=power*(2+f.bite*5)*free;
        for(let y=0;y<h;y+=4){const rh=Math.min(4,h-y),t=y/h,dx=bend*(1-t)**2+Math.sin(t*Math.PI)*tension,sw=w*(1-Math.sin(t*Math.PI)*power*.035);
          ctx.drawImage(this.atlas,b[0],b[1]+y/h*b[3],b[2],rh/h*b[3],-sw/2+dx,y,sw,rh+.6);
        }
      }else{ctx.drawImage(this.atlas,...b,-w/2,0,w,h);ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0;}
      if(!paper&&s.progress>.32&&power>.2){
        const y=Math.max(5,h*(1-s.progress)-5);ctx.strokeStyle='#e1cfa180';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-w*.4,y+2);for(let i=0;i<9;i++)ctx.lineTo(-w*.4+i*w*.1,y+Math.sin(i*7.3)*3);ctx.stroke();
      }
      if(s.item.name==='Сертификат акций'){ctx.fillStyle='#d4dec7';ctx.fillRect(-w/2+10,12,w-20,52);ctx.textAlign='center';ctx.fillStyle='#3a5941';ctx.font='bold 10px Georgia';ctx.fillText('СЕРТИФИКАТ',0,28);ctx.font='18px Georgia';ctx.fillText('1 000',0,51);}
      if(s.special){ctx.save();ctx.translate(0,h*.34);ctx.rotate(-.09);ctx.fillStyle='#ede0bb';ctx.fillRect(-w*.43,-19,w*.86,43);ctx.strokeStyle='#8e3928';ctx.lineWidth=2;ctx.strokeRect(-w*.4,-16,w*.8,37);ctx.fillStyle='#8e3928';ctx.font='bold 11px monospace';ctx.textAlign='center';ctx.fillText('ВНЕ ОЧЕРЕДИ',0,-1);ctx.font='9px monospace';ctx.fillText('ОСОБАЯ ПРЕМИЯ +200%',0,13);ctx.restore();}
      if(s.secret){ctx.fillStyle='#762e21e6';ctx.fillRect(-w/2+5,9,w-10,22);ctx.fillStyle='#f1d5a1';ctx.font='bold 8px monospace';ctx.textAlign='center';ctx.fillText('СОВЕРШЕННО СЕКРЕТНО',0,24);}
      if(s.urgent>0){ctx.fillStyle='#a2562be6';ctx.fillRect(w/2-44,h-32,38,25);ctx.fillStyle='#f9e5b4';ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillText(`${Math.ceil(s.urgent)}с`,w/2-25,h-15);}
      ctx.restore();return true;
    }
    cover(ctx,img,w,h) {
      const scale=Math.max(w/img.width,h/img.height);const sw=w/scale,sh=h/scale;
      ctx.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,0,0,w,h);
    }
    updatePile(s, items) {
      const key=`${s.fill.toFixed(3)}:${s.capacity}:${s.levels.tier}:${s.levels.cross}`;
      if(this.pileKey===key)return;this.pileKey=key;
      const ctx=this.pile.getContext('2d');ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,340,180);
      const fill=s.fill/s.capacity, height=fill*143;
      const hard=!['paper','folder'].includes(items[s.levels.tier].material);
      const random=i=>{const v=Math.sin(i*127.1+41.7)*43758.5453;return v-Math.floor(v);};
      const count=Math.min(900,Math.ceil(fill*760));
      for(let i=0;i<count;i++) {
        const x=12+random(i+13)*316;
        const contour=height*(.62+.38*(1-Math.abs(x-170)/170));
        const y=169-random(i+700)*contour;
        const color=i%5===0?'#b5b8a3':i%7===0?'#c4b38f':items[s.levels.tier].color;
        ctx.save();ctx.translate(x,y);ctx.rotate((random(i+17)-.5)*(hard?4:1.9));
        ctx.shadowColor='#100e09aa';ctx.shadowBlur=2;ctx.shadowOffsetY=1;
        if(s.levels.cross||hard){ctx.fillStyle=shade(color,random(i+4)*30-20);ctx.fillRect(-3,-3,4+random(i+21)*(hard?8:4),4+random(i+36)*7);}
        else {
          const len=15+random(i+21)*25;
          ctx.strokeStyle=shade(color,-45);ctx.lineWidth=4.4;ctx.beginPath();ctx.moveTo(-len/2,2);ctx.bezierCurveTo(-len/5,-4,len/6,7,len/2,0);ctx.stroke();
          ctx.shadowBlur=0;ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-len/2,0);ctx.bezierCurveTo(-len/5,-6,len/6,5,len/2,-2);ctx.stroke();
          if(i%4===0){ctx.strokeStyle='#59614b';ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(-len/3,-1);ctx.lineTo(-len/6,-2);ctx.stroke();}
        }
        ctx.restore();
      }
    }
    render({ctx,w,s,now,dt,particles,paused,reduced,shake,drawItem,rewards,items}) {
      const c=w/2;
      const frozen=paused||s.ended||document.hidden;
      if(!frozen&&s.lastPressure>0&&this.lastPower===0)this.feel.kick(5);
      if(!frozen&&s.lastPressure===0&&this.lastPower>0)this.feel.kick(-3);
      this.lastPower=s.lastPressure;
      this.feel.update(dt,{power:s.lastPressure,heat:s.heat,grip:this.dragGrip||0,dragX:this.dragOffsetX||0,paused:frozen,reduced});
      if(!frozen){this.pointer.x+=(this.pointerTarget.x-this.pointer.x)*(1-Math.exp(-dt*5));this.pointer.y+=(this.pointerTarget.y-this.pointer.y)*(1-Math.exp(-dt*5));this.binDrop=Math.min(1,this.binDrop+dt*3.5);}
      ctx.clearRect(0,0,w,620);
      if(this.background){ctx.save();ctx.translate(-6+(reduced?0:this.pointer.x*4),-6+(reduced?0:this.pointer.y*3));this.cover(ctx,this.background,w+12,632);ctx.restore();}
      else {const gradient=ctx.createLinearGradient(0,0,0,620);gradient.addColorStop(0,'#232922');gradient.addColorStop(1,'#171a15');ctx.fillStyle=gradient;ctx.fillRect(0,0,w,620);}
      // The stage is a physical room. The HUD is HTML so its text stays readable.
      let light=ctx.createRadialGradient(c-200,230,20,c-90,350,450);light.addColorStop(0,'#f3be5b12');light.addColorStop(1,'#01060500');ctx.fillStyle=light;ctx.fillRect(0,0,w,620);
      ctx.save();ctx.translate(c,596);ctx.scale(1,.13);ctx.beginPath();ctx.ellipse(0,0,246,91,0,0,Math.PI*2);ctx.fillStyle='#050503a8';ctx.shadowColor='#030401';ctx.shadowBlur=20;ctx.fill();ctx.restore();
      const vibration=reduced?0:this.feel.power*Math.sin(this.feel.phase)*.8+this.feel.rock*2;
      ctx.save();ctx.translate(vibration,0);ctx.translate(c,594);ctx.rotate(reduced?0:this.feel.rock*.012);ctx.translate(-c,-594);
      // Opaque, recessed interior behind the transparent opening of the sprite.
      const well=ctx.createLinearGradient(c-165,370,c+165,545);well.addColorStop(0,'#131511');well.addColorStop(.55,'#24251b');well.addColorStop(1,'#090d0b');
      ctx.fillStyle=well;ctx.fillRect(c-166,373,332,181);
      this.updatePile(s,items);ctx.drawImage(this.pile,c-170,374+this.feel.impact*2,340,180);
      if(this.oldPile&&this.binDrop<1){ctx.save();ctx.beginPath();ctx.rect(c-165,375,330,180);ctx.clip();ctx.globalAlpha=1-this.binDrop;ctx.drawImage(this.oldPile,c-170,374+this.binDrop**2*240,340,180);ctx.restore();}
      if(this.machine)ctx.drawImage(this.machine,c-220,192,440,440*this.machine.height/this.machine.width);
      else {ctx.fillStyle='#c0b397';ctx.fillRect(c-220,192,440,170);ctx.fillRect(c-220,360,35,236);ctx.fillRect(c+185,360,35,236);ctx.fillRect(c-220,565,440,32);ctx.fillStyle='#151811';ctx.fillRect(c-170,211,340,12);}
      // Plate, lamps and needle are independently animated over the detailed body.
      ctx.save();ctx.translate(c-106,306);ctx.rotate(-.006);
      ctx.font='bold 16px Georgia';ctx.textAlign='center';ctx.fillStyle='#e7d9b8';ctx.shadowColor='#050704';ctx.shadowBlur=1;ctx.fillText('АРХИВ / 13',0,0);
      ctx.font='6px monospace';ctx.fillStyle='#afa88d';ctx.fillText('БЮРО БУМАЖНЫХ ДЕЛ',0,11);ctx.restore();
      // Cover the complete baked dial face, not its off-centre printed pivot.
      const gx=c+97,gy=298;
      const gauge=ctx.createRadialGradient(gx-7,gy-8,2,gx,gy,27.5);gauge.addColorStop(0,'#eee0b6');gauge.addColorStop(1,'#c5b485');
      ctx.fillStyle=gauge;ctx.beginPath();ctx.arc(gx,gy,27.5,0,Math.PI*2);ctx.fill();
      ctx.save();ctx.translate(gx,gy);
      for(const [start,end,color] of [[0,45,'#8a8965'],[45,75,'#bb883b'],[75,100,'#ac432b']]){
        ctx.strokeStyle=color;ctx.lineWidth=3.2;ctx.beginPath();ctx.arc(0,0,23,ArchiveFeel.gaugeAngle(start),ArchiveFeel.gaugeAngle(end));ctx.stroke();
      }
      for(let i=0;i<=20;i++){const a=ArchiveFeel.gaugeAngle(i*5);ctx.strokeStyle=i>=15?'#863723':'#5a583f';ctx.lineWidth=i%5===0?1.2:.65;ctx.beginPath();ctx.moveTo(Math.cos(a)*21,Math.sin(a)*21);ctx.lineTo(Math.cos(a)*(i%5===0?17:19),Math.sin(a)*(i%5===0?17:19));ctx.stroke();}
      ctx.fillStyle='#61573d';ctx.font='4.8px monospace';ctx.textAlign='center';ctx.fillText('0',-16,15);ctx.fillText('100',16,15);ctx.fillText('НАГРЕВ',0,12);
      const angle=ArchiveFeel.gaugeAngle(this.feel.gauge);
      ctx.strokeStyle=s.jammed?'#842b1c':'#34362b';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-Math.cos(angle)*4,-Math.sin(angle)*4);ctx.lineTo(Math.cos(angle)*20,Math.sin(angle)*20);ctx.stroke();ctx.beginPath();ctx.arc(0,0,2.8,0,Math.PI*2);ctx.fillStyle='#423e2d';ctx.fill();ctx.restore();
      const led=(x,y,color,glow)=>{ctx.save();ctx.shadowColor=color;ctx.shadowBlur=glow;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,3.1,0,Math.PI*2);ctx.fill();ctx.restore();};
      const band=ArchiveFeel.heatBand(s.heat,s.jammed),warning=band==='locked'||band==='hot';
      led(c+43,290,warning?'#ff784b':band==='warm'?'#e5b354':'#753c22',warning?18:band==='warm'?9:0);
      led(c+43,314,s.lastPressure?'#c1de73':'#5a7139',s.lastPressure?9:0);
      if(s.heat>75){ctx.save();ctx.globalCompositeOperation='screen';const hot=ctx.createRadialGradient(gx,gy,5,gx,gy,65);hot.addColorStop(0,`rgba(227,81,27,${(s.heat-75)/160})`);hot.addColorStop(1,'#a62a0000');ctx.fillStyle=hot;ctx.fillRect(gx-65,gy-65,130,130);ctx.restore();}
      // The paper is above the casing but clipped precisely into its top slot.
      drawItem(s,c);
      ctx.save();ctx.beginPath();ctx.rect(c-161,345,322,196);ctx.clip();
      this.drawRibbons(ctx,dt,s,c,frozen,reduced);
      for(const p of particles) {
        if(!frozen){
          const flutter=p.hard?0:Math.sin(this.feel.time*8+p.seed)*42;
          p.vx+=(flutter-p.vx*(p.hard?.7:2.2))*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=(p.hard?650:260)*dt;p.angle+=p.spin*dt;p.life-=dt;
          const floor=538-s.fill/s.capacity*132*(.62+.38*(1-Math.min(1,Math.abs(p.x-c)/160)));
          if(p.y>floor){p.y=floor;p.vy=-Math.abs(p.vy)*(p.hard?.24:.1);p.vx*=.62;p.spin*=.63;if(Math.abs(p.vy)<18)p.vy=0;}
          if(p.x<c-155||p.x>c+155){p.x=Math.max(c-155,Math.min(c+155,p.x));p.vx*=-.25;}
        }
        ctx.save();ctx.globalAlpha=Math.min(1,p.life*2);ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.fillStyle=p.color;
        if(p.hard){ctx.beginPath();ctx.moveTo(-p.width/2,-p.length/2);ctx.lineTo(p.width/2,-p.length*.32);ctx.lineTo(p.width*.27,p.length/2);ctx.lineTo(-p.width*.4,p.length*.25);ctx.closePath();ctx.fill();ctx.strokeStyle='#e5dbb955';ctx.lineWidth=.6;ctx.stroke();if(['phone','laptop'].includes(p.material)){ctx.fillStyle='#b8a45c';ctx.fillRect(-p.width*.25,-p.length*.15,Math.max(1,p.width*.2),2);ctx.strokeStyle='#81a47a';ctx.beginPath();ctx.moveTo(0,-p.length*.3);ctx.lineTo(0,p.length*.3);ctx.stroke();}else if(p.material==='drive'||p.material==='gold'){ctx.strokeStyle=p.material==='gold'?'#f8d677':'#e5ece7';ctx.beginPath();ctx.moveTo(-p.width*.3,0);ctx.lineTo(p.width*.2,-p.length*.1);ctx.stroke();}}
        else{ctx.scale(Math.max(.18,Math.abs(Math.cos(this.feel.time*4+p.seed))),1);ctx.fillRect(-p.width/2,-p.length/2,p.width,p.length);if(p.length>13){ctx.fillStyle='#47543c88';ctx.fillRect(-p.width/3,-p.length/4,p.width*.5,1);}}
        ctx.restore();
      }
      ctx.restore();
      // Two narrow reflected highlights convey a clear front panel.
      ctx.save();ctx.beginPath();ctx.roundRect(c-161,383,322,157,9);ctx.clip();ctx.fillStyle='#fff0b309';ctx.beginPath();ctx.moveTo(c-158,380);ctx.lineTo(c-120,380);ctx.lineTo(c-141,541);ctx.lineTo(c-160,541);ctx.fill();ctx.restore();
      ctx.textAlign='center';ctx.font='6px monospace';ctx.fillStyle=s.full?'#dd813b':'#7c7254';ctx.fillText(s.full?'КОРЗИНА ПОЛНА · ОЧИСТИТЬ':'ИНВ. № 000013 · НЕ ПОДАВАТЬ ПАЛЬЦЫ',c,590);
      ctx.restore();
      // Sparse atmospheric dust, motionless under reduced motion and on pause.
      if(!reduced){ctx.save();for(let i=0;i<17;i++){const t=this.feel.time;const x=(i*137.7+t*(2+i%3))%w,y=30+(i*49.3+t*(1+i%2))%500;ctx.fillStyle=`rgba(246,211,143,${.035+(i%3)*.012})`;ctx.fillRect(x,y,1.1,1.1);}ctx.restore();}
      for(const r of rewards){if(!frozen)r.life-=dt;ctx.save();ctx.globalAlpha=Math.min(1,r.life*2);ctx.font='bold 22px Georgia';ctx.textAlign='center';ctx.fillStyle='#f3d38c';ctx.shadowColor='#0e1109';ctx.shadowBlur=5;ctx.fillText(r.text,c+144,192-(1.6-r.life)*31);ctx.restore();}
      ctx.save();ctx.globalCompositeOperation='multiply';ctx.fillStyle=ctx.createPattern(this.grain,'repeat');ctx.globalAlpha=.5;ctx.fillRect(0,0,w,620);ctx.restore();
      const vignette=ctx.createRadialGradient(c,290,150,c,290,Math.max(390,w*.65));vignette.addColorStop(0,'#090d0900');vignette.addColorStop(1,'#05090794');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,620);
    }
  }
  globalThis.ArchiveArt=ArchiveArt;
})();
