'use strict';
// Small presentation springs. They never own game progress, heat or rewards.
(() => {
  class ArchiveFeel {
    static gaugeAngle(heat){return Math.PI*.75+Math.max(0,Math.min(100,Number.isFinite(heat)?heat:0))/100*Math.PI*1.5;}
    static heatBand(heat,jammed=false){return jammed?'locked':heat>=75?'hot':heat>=45?'warm':'safe';}
    static material(material){
      return ({paper:{teeth:18,kick:.28,pitch:1700,length:.045,gain:.018},folder:{teeth:16,kick:.45,pitch:1100,length:.065,gain:.026},floppy:{teeth:12,kick:1.3,pitch:740,length:.065,gain:.045},card:{teeth:10,kick:1,pitch:1350,length:.04,gain:.04},phone:{teeth:14,kick:1.5,pitch:630,length:.085,gain:.048},drive:{teeth:13,kick:1.8,pitch:950,length:.09,gain:.045},laptop:{teeth:16,kick:1.6,pitch:540,length:.08,gain:.048},gold:{teeth:10,kick:2.2,pitch:2100,length:.11,gain:.04},pumpkin:{teeth:12,kick:.8,pitch:340,length:.08,gain:.04}})[material]||ArchiveFeel.material('paper');
    }
    static cuts(before,after,material){const teeth=ArchiveFeel.material(material).teeth;return Math.max(0,Math.floor(Math.min(1,after)*teeth)-Math.floor(Math.max(0,before)*teeth));}
    static feedPressure(distance){return distance<=12?0:Math.max(0,Math.min(1,.2+(distance-12)/120));}
    static planePose(t,width,height,direction=1){
      t=Math.max(0,Math.min(1,t));const u=1-t;
      const x=-80+(width+160)*t;
      const ys=[.23,.02,.42,.15].map(v=>v*height);
      const y=u*u*u*ys[0]+3*u*u*t*ys[1]+3*u*t*t*ys[2]+t*t*t*ys[3];
      const dy=3*u*u*(ys[1]-ys[0])+6*u*t*(ys[2]-ys[1])+3*t*t*(ys[3]-ys[2]);
      return {x:direction>0?x:width-x,y,angle:Math.atan2(dy,width+160)*180/Math.PI*(direction>0?1:-1),bank:Math.sin(t*Math.PI*4)*5};
    }
    constructor() { this.power=0;this.phase=0;this.rock=0;this.rockV=0;this.grip=0;this.gripV=0;this.arrival=1;this.impact=0;this.gauge=0;this.gaugeV=0;this.time=0;this.pointerX=0;this.pointerY=0;this.bite=0; }
    cut(count,material){if(count<=0)return;const profile=ArchiveFeel.material(material);this.kick(-profile.kick*Math.min(2,count));this.bite=Math.min(1,this.bite+.35*count);}
    kick(amount) { this.rockV+=amount;this.impact=Math.min(1,this.impact+Math.abs(amount)*.025); }
    arrived() { this.arrival=0;this.kick(-2.5); }
    update(dt,{power=0,heat=0,grip=0,dragX=0,paused=false,reduced=false}={}) {
      if(paused)return;
      dt=Math.max(0,Math.min(.05,dt));this.time+=dt;this.pointerX+=(dragX-this.pointerX)*(1-Math.exp(-dt*16));
      this.power+=(power-this.power)*(1-Math.exp(-dt*(power>this.power?28:10)));
      this.phase+=dt*(19+this.power*54);this.arrival=Math.min(1,this.arrival+dt*4.5);
      this.impact*=Math.exp(-dt*8);
      this.bite*=Math.exp(-dt*24);
      // Substeps keep the spring stable through a slow frame.
      for(let t=0;t<dt;t+=1/180){const step=Math.min(1/180,dt-t);
        this.rockV+=(-this.rock*210-this.rockV*14)*step;this.rock+=this.rockV*step;
        this.gripV+=((grip-this.grip)*180-this.gripV*20)*step;this.grip+=this.gripV*step;
        this.gaugeV+=((heat-this.gauge)*82-this.gaugeV*18)*step;this.gauge+=this.gaugeV*step;
      }
      this.rock=Math.max(-1.5,Math.min(1.5,this.rock));
      if(reduced){this.rock=0;this.rockV=0;this.grip=0;this.arrival=1;}
    }
  }
  ArchiveFeel.Grip=class {
    constructor(){this.current=null;}
    begin(p,id){if(this.current)return false;this.current={x:p.x,currentX:p.x,y:p.y,current:p.y,id};return true;}
    move(p,id){if(this.current?.id===id){this.current.current=p.y;this.current.currentX=p.x;}}
    get pressure(){return this.current?ArchiveFeel.feedPressure(this.current.current-this.current.y):0;}
    end(){const id=this.current?.id;this.current=null;return id;}
    consume(events){if(events.includes('shredded'))return this.end();}
  };
  ArchiveFeel.Notices=class {
    constructor(){this.current=null;this.queue=[];}
    push({text,title='',priority=0,duration=5,key=text}){
      if(this.current?.key===key)return;
      this.queue=this.queue.filter(n=>n.key!==key);
      const n={text,title,priority,key,left:Math.max(1,duration)};
      if(!this.current||priority>this.current.priority){if(this.current)this.queue.push(this.current);this.current=n;}
      else this.queue.push(n);
      this.queue.sort((a,b)=>b.priority-a.priority);this.queue=this.queue.slice(0,4);
    }
    next(){this.current=this.queue.shift()||null;}
    clear(key){this.queue=this.queue.filter(n=>n.key!==key);if(this.current?.key===key)this.next();}
    tick(dt,paused=false){if(paused)return;dt=Math.max(0,dt);for(const n of this.queue)n.left-=dt;this.queue=this.queue.filter(n=>n.left>0);if(this.current){this.current.left-=dt;if(this.current.left<=0)this.next();}}
  };
  globalThis.ArchiveFeel=ArchiveFeel;
  if(typeof module!=='undefined')module.exports=ArchiveFeel;
})();
