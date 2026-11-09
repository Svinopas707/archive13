'use strict';
// Independent rules and original balance for Archive 13.
(() => {
  const ITEMS = [
    ['Стикер','paper',6,1,1,'#e0cd81',0], ['Записка','paper',12,1.1,1,'#e8e0c7',1],
    ['Счёт-фактура','paper',24,1.2,1.1,'#d9dfce',2], ['Сертификат акций','paper',45,1.35,1.2,'#cedbc2',2],
    ['Секретное дело','folder',80,1.6,1.5,'#c7a574',4], ['Дискета','floppy',140,1.8,1.1,'#586585',6],
    ['Корпоративная карта','card',240,1.5,.8,'#a9c6bd',5], ['Одноразовый телефон','phone',400,2.25,1.7,'#7d9292',8],
    ['Жёсткий диск','drive',650,2.5,2,'#a8b4ac',9], ['Ноутбук','laptop',1050,3,2.5,'#8e9e97',10],
    ['Золотой слиток','gold',1700,3.3,2.2,'#ddbd56',11]
  ].map(([name,material,value,resistance,bulk,color,sprite],id)=>({id,name,material,value,resistance,bulk,color,sprite}));
  const CASE_COSTS=[95,300,780,1900,4000,16000,42000,105000,260000,620000];
  const DAILY_TASKS=[{id:'urgent',label:'Списать 2 срочных предмета вовремя',stat:'urgent',need:2,factor:8},{id:'orders',label:'Сдать 3 полных мешка',stat:'fullBins',need:3,factor:12},{id:'shred',label:'Уничтожить 100 предметов',stat:'total',need:100,factor:18}];
  const BOOSTS={espresso:{name:'Двойной эспрессо',duration:120,cooldown:600,factor:12},overtime:{name:'Сверхурочная смена',duration:900,cooldown:1800,factor:45}};
  const UPGRADES = {
    blades:{name:'Острые ножи',desc:'Скорость резки +40% за уровень',icon:'≋',base:100,growth:2.6,max:8},
    tier:{name:'Новое дело',desc:'Открывает более дорогие предметы',icon:'▣',base:35,growth:2.5,max:ITEMS.length-1},
    fan:{name:'Вентилятор',desc:'Меньше нагрев, быстрее остывание',icon:'✳',base:120,growth:2.8,max:5},
    fuse:{name:'Предохранитель',desc:'Мотор раньше выходит из термозащиты',icon:'ϟ',base:180,growth:3,max:4},
    bin:{name:'Большая корзина',desc:'+5 к вместимости за уровень',icon:'▤',base:110,growth:2.6,max:6},
    compactor:{name:'Уплотнитель',desc:'Предметы занимают меньше места',icon:'⇣',base:240,growth:3,max:4},
    cross:{name:'Поперечная резка',desc:'Конфетти вместо полосок. Оплата +50%',icon:'⁙',base:1800,growth:1,max:1},
    recycle:{name:'Договор переработки',desc:'Оплата +10%/ур.; полная корзина ×2',icon:'♲',base:220,growth:3,max:5},
    intern:{name:'Ночной стажёр',desc:'Сам подаёт предметы и бережёт мотор',icon:'☷',base:1400,growth:3,max:5},
    bagger:{name:'Автосмена мешков',desc:'Сам освобождает полную корзину',icon:'↻',base:4500,growth:1,max:1}
  };
  const ACHIEVEMENTS = [
    ['first','Первая стружка','Уничтожить первый предмет',m=>m.total>=1],
    ['hundred','Бумажный след','Уничтожить 100 предметов',m=>m.total>=100],
    ['thousand','Архивная гора','Уничтожить 1000 предметов',m=>m.total>=1000],
    ['overheat','Горячая работа','Довести мотор до термозащиты',m=>m.stats.overheats>=1],
    ['red','На красной черте','Завершить предмет при нагреве ×2',m=>m.stats.red>=1],
    ['red50','Закалённый сотрудник','50 предметов в красной зоне',m=>m.stats.red>=50],
    ['bin','Пакет готов','Опустошить корзину',m=>m.stats.bins>=1],
    ['bins25','Раздельный сбор','Опустошить корзину 25 раз',m=>m.stats.bins>=25],
    ['cross','Праздник конфетти','Установить поперечную резку',m=>m.levels.cross>0],
    ['intern','Есть кому поручить','Нанять стажёра',m=>m.levels.intern>0],
    ['fan','Хладнокровие','Вентилятор 5 уровня',m=>m.levels.fan>=5],
    ['drive','Без восстановления','Уничтожить жёсткий диск',m=>m.stats.drive>=1],
    ['laptop','Ошибка системы','Уничтожить ноутбук',m=>m.stats.laptop>=1],
    ['gold','Золотой стандарт','Уничтожить золотой слиток',m=>m.stats.gold>=1],
    ['million','Семь знаков','Заработать миллион за одну смену',m=>m.shiftEarned>=1000000],
    ['win','Дело закрыто','Выполнить наряд ночной смены',m=>m.stats.wins>=1],
    ['urgent','Срочно — значит срочно','Уничтожить срочный предмет вовремя',m=>m.stats.urgent>=1],
    ['urgent10','Любимчик начальства','10 срочных предметов вовремя',m=>m.stats.urgent>=10],
    ['streak','Рабочий ритм','Серия из 10 предметов',m=>m.stats.bestStreak>=10],
    ['secret','Только для своих','10 секретных предметов',m=>m.stats.secret>=10],
    ['plane','Воздушная почта','Поймать 10 самолётиков',m=>m.stats.planes>=10],
    ['pumpkin','Вне очереди','Списать 13 особых архивных папок',m=>m.stats.pumpkins>=13]
  ].map(([id,name,desc,check])=>({id,name,desc,check}));
  const finite=(n,fallback=0)=>Number.isFinite(Number(n))?Number(n):fallback;
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  class ArchiveModel {
    constructor(saved={}) {
      this.cash=Math.max(0,finite(saved.cash));
      this.levels=Object.fromEntries(Object.entries(UPGRADES).map(([k,v])=>[k,clamp(Math.floor(finite(saved.levels?.[k])),0,v.max)]));
      this.night=clamp(Math.floor(finite(saved.night,1)),1,1000); this.total=Math.max(0,Math.floor(finite(saved.total)));
      this.stats=Object.fromEntries(['overheats','red','bins','fullBins','drive','laptop','gold','wins','urgent','bestStreak','secret','planes','pumpkins','calls','earned','purchases'].map(k=>[k,Math.max(0,finite(saved.stats?.[k]))]));
      this.awards=new Set(Array.isArray(saved.awards)?saved.awards.filter(id=>ACHIEVEMENTS.some(a=>a.id===id)):[]); this.pendingAwards=[];
      this.lastSaved=finite(saved.savedAt); this.dailyKey=typeof saved.dailyKey==='string'?saved.dailyKey:'';
      if(![3,4].includes(saved.version)){const legacy=[0,1,2,3,4,6,6,7,7,8,9,10];this.levels.tier=legacy[Math.min(11,Math.max(0,Math.floor(finite(saved.levels?.tier))))];}
      this.daily=saved.daily&&/^\d{4}-\d{2}-\d{2}$/.test(saved.daily.date)&&Array.isArray(saved.daily.claimed)&&saved.daily.base?{date:saved.daily.date,claimed:[...new Set(saved.daily.claimed.filter(id=>DAILY_TASKS.some(t=>t.id===id)))],base:Object.fromEntries(['urgent','purchases','total','bins','fullBins'].map(k=>[k,Math.max(0,finite(saved.daily.base[k],k==='bins'?this.stats.bins:0))])),rewards:saved.daily.rewards?{...saved.daily.rewards}:null}:null;
      this.boosts=Object.fromEntries(Object.keys(BOOSTS).map(k=>[k,{left:clamp(finite(saved.boosts?.[k]?.left),0,BOOSTS[k].duration),cooldown:clamp(finite(saved.boosts?.[k]?.cooldown),0,BOOSTS[k].cooldown),unit:Math.max(0,finite(saved.boosts?.[k]?.unit))}]));
      this.bagTimer=0;this.caseReady=false;
      this.internEnabled=saved.internEnabled!==false; this.internCooling=false;
      this.heat=0; this.fill=0; this.binValue=0; this.progress=0; this.count=0; this.remaining=100;
      this.jammed=false; this.ended=false; this.won=false; this.lastPressure=0; this.recentReward=0;
      this.recentItem=ITEMS[0]; this.recycleReward=0; this.streak=0; this.streakAge=999; this.chainValid=false; this.shiftEarned=0;
      this.elapsed=0; this.plane=0; this.nextPlane=18; this.call=null; this.nextCall=26;
      this.urgent=0; this.secret=false; this.special=false; this.itemId=this.levels.tier; this.started=false;
      if([2,3,4].includes(saved.version)&&saved.shift&&typeof saved.shift==='object') this.restoreShift(saved.shift);
      if(saved.version!==4){this.ended=false;this.won=false;this.call=null;this.itemId=Math.min(this.levels.tier,this.itemId);}
      this.contract=this.makeContract();
      if(saved.version===4&&saved.contract?.night===this.night)this.contract.qualified=clamp(Math.floor(finite(saved.contract.qualified)),0,this.contract.required);
      this.caseReady=this.contractComplete;
      if(this.daily&&!this.daily.rewards)this.daily.rewards=this.issueDailyRewards();
      if(saved.version!==4)this.boosts=Object.fromEntries(Object.keys(BOOSTS).map(k=>[k,{left:0,cooldown:0,unit:0}]));
      this.checkAwards(); this.pendingAwards=[];
    }
    // Preserve the rare-event payout and legacy save counters, using archive artwork.
    get item(){return this.special?{...ITEMS[4],id:0,name:'Особая архивная папка',value:ITEMS[this.itemId].value,bulk:2,resistance:1.8}:ITEMS[this.itemId];}
    get capacity(){return 8+this.levels.bin*5;}
    makeContract(){return {night:this.night,target:Math.min(400,40+(this.night-1)*20),tier:Math.min(ITEMS.length-1,this.night*2),required:Math.min(100,8+(this.night-1)*4),qualified:0};}
    get contractComplete(){return this.count>=this.contract.target&&this.contract.qualified>=this.contract.required;}
    get campaignComplete(){return this.night>10||(this.night===10&&this.ended&&this.won);}
    get target(){return this.contract.target;}
    get nightPay(){return 1+Math.min(this.night-1,20)*.15;}
    get modifier(){return {name:'Ночной архив',desc:'Подача мышью · полные мешки дороже.',heat:1,resistance:1};}
    get multiplier(){return this.heat>=75?2:this.heat>=45?1.5:1;}
    get awardBonus(){return 1+this.awards.size*.02;}
    get full(){return this.fill>=this.capacity-.0001;}
    get restartHeat(){return 35+this.levels.fuse*10;}
    get premium(){return Math.round(ITEMS[this.contract.tier].value*this.contract.required*this.nightPay*.25);}
    cost(kind){const d=UPGRADES[kind];return !d||this.levels[kind]>=d.max?Infinity:kind==='tier'?CASE_COSTS[this.levels.tier]:Math.round(d.base*d.growth**this.levels[kind]);}
    availableLevel(kind){const min={cross:3,intern:3,bagger:5,compactor:2}[kind]||0;if(this.levels.tier<min)return 0;return kind==='tier'?ITEMS.length-1:Math.min(UPGRADES[kind]?.max||0,1+Math.floor(this.levels.tier*.7));}
    lockReason(kind){if(this.levels[kind]>=this.availableLevel(kind)&&this.levels[kind]<UPGRADES[kind]?.max){const min={cross:3,intern:3,bagger:5,compactor:2}[kind]||0,tier=Math.min(10,Math.max(min,Math.ceil(this.levels[kind]/.7)));return `После дела «${ITEMS[tier].name}»`;}return '';}
    buy(kind){const cost=this.cost(kind);if(!Number.isFinite(cost)||this.lockReason(kind)||this.cash<cost)return false;this.cash-=cost;this.levels[kind]++;this.stats.purchases++;this.checkAwards();return true;}
    credit(amount){if(this.offlineWork)amount=Math.min(amount,Math.max(0,this.offlineLimit-(this.cash-this.offlineStart)));this.cash+=amount;this.stats.earned+=amount;this.shiftEarned+=amount;}
    empty(){
      const amount=this.fill,wasFull=this.full;this.recycleReward=0;if(amount<=0)return 0;
      this.recycleReward=Math.max(1,Math.round(this.binValue*.05*(this.full&&this.levels.recycle?2:1)));
      this.credit(this.recycleReward);this.fill=0;this.binValue=0;this.bagTimer=0;this.stats.bins++;if(wasFull)this.stats.fullBins++;this.checkAwards();return amount;
    }
    checkAwards(){for(const a of ACHIEVEMENTS)if(!(this.offlineWork&&a.id==='million')&&!this.awards.has(a.id)&&a.check(this)){this.awards.add(a.id);this.pendingAwards.push(a.id);}}
    internPressure(){
      if(!this.levels.intern||!this.internEnabled)return 0;
      if(this.heat>=70)this.internCooling=true;if(this.heat<=32)this.internCooling=false;
      return this.internCooling?0:.18+this.levels.intern*.055;
    }
    catchPlane(){if(this.plane<=0||this.ended)return 0;this.plane=0;this.stats.planes++;this.heat=Math.max(0,this.heat-12);const reward=Math.round(ITEMS[this.itemId].value*this.nightPay*.75);this.credit(reward);this.checkAwards();return reward;}
    nextItem(offline=false){this.itemId=this.total%4===0?Math.max(0,this.levels.tier-1):this.levels.tier;this.secret=!offline&&this.total%7===0;this.urgent=!offline&&this.total%5===0?10:0;this.special=!offline&&this.total%19===0;}
    complete(events,offline){
      const item=this.item;this.recentItem={...item};
      this.streak=offline?0:this.chainValid?this.streak+1:1;this.stats.bestStreak=Math.max(this.stats.bestStreak,this.streak);
      const combo=1+Math.min(10,Math.max(0,this.streak-1))*.05;
      const bonus=Math.min(4,1+(this.multiplier-1)+(this.levels.cross?.5:0)+this.levels.recycle*.1+(this.awardBonus-1)+(combo-1)+(this.secret?1:0)+(this.urgent>0?.5:0)+(this.special?2:0));
      const base=Math.round(item.value*this.nightPay*bonus*(offline?.2:1));
      const active=Object.values(this.boosts).find(b=>b.left>0),extra=active?Math.min(base,Math.round(active.unit*bonus*(offline?.2:1))):0;
      this.recentReward=base+extra;
      this.credit(this.recentReward);this.binValue+=this.recentReward;this.fill=Math.min(this.capacity,this.fill+item.bulk/(1+this.levels.compactor*.15));
      this.total++;if(!offline)this.count++;if(this.multiplier===2)this.stats.red++;
      if(Object.hasOwn(this.stats,item.material))this.stats[item.material]++;
      if(this.special)this.stats.pumpkins++;if(this.secret)this.stats.secret++;
      if(this.urgent>0){this.stats.urgent++;events.push('urgent-complete');}
      if(!offline){if(item.id>=this.contract.tier&&!this.special)this.contract.qualified=Math.min(this.contract.required,this.contract.qualified+1);this.caseReady=this.contractComplete;}
      this.progress=0;this.streakAge=0;this.chainValid=false;this.nextItem(offline);events.push('shredded');if(this.full)events.push('full');this.checkAwards();
    }
    tick(dt,pressure,offline=false){
      if((!offline&&this.ended)||!Number.isFinite(dt)||dt<=0)return [];
      dt=Math.min(dt,.1);const events=[];
      if(!offline){
        this.elapsed+=dt;this.started=true;this.advanceBoosts(dt);
        if(this.urgent>0){this.urgent=Math.max(0,this.urgent-dt);if(this.urgent===0)events.push('urgent-missed');}
        if(this.plane>0)this.plane=Math.max(0,this.plane-dt);
        if(this.elapsed>=this.nextPlane){this.plane=10;this.nextPlane=this.elapsed+35;events.push('plane');}

      }
      this.streakAge+=dt;if(this.progress===0&&this.streakAge>2.5)this.streak=0;
      if(this.full&&this.levels.bagger){this.bagTimer+=dt;if(this.bagTimer>=1.2){this.empty();events.push('auto-empty');}}else this.bagTimer=0;
      pressure=clamp(finite(pressure),0,1);if(!pressure)pressure=this.internPressure();
      const running=pressure>0&&!this.jammed&&!this.full;this.lastPressure=running?pressure:0;
      if(running){
        if(this.progress===0)this.chainValid=this.streakAge<=2.5;
        this.heat=Math.min(100,this.heat+Math.max(.5,(4+pressure*16)*this.modifier.heat/(1+this.levels.fan*.35))*dt);
        if(this.heat>=100){this.jammed=true;this.stats.overheats++;this.streak=0;this.chainValid=false;events.push('overheat');this.checkAwards();}
        else{this.progress+=(.14+pressure*.39)*(1+this.levels.blades*.4)/(this.item.resistance*this.modifier.resistance)*dt;if(this.progress>=1)this.complete(events,offline);}
      }else{const cooling=this.jammed?20+this.levels.fan*4:14+this.levels.fan*4;this.heat=Math.max(0,this.heat-cooling*dt);if(this.jammed&&this.heat<=this.restartHeat){this.jammed=false;events.push('cooled');}}
      return events;
    }
    closeCase(){if(!this.contractComplete||this.ended)return false;this.ended=true;this.won=true;this.stats.wins++;this.credit(this.premium);this.checkAwards();return true;}
    nextNight(){
      if(!this.ended||!this.won)return false;this.night++;
      Object.assign(this,{heat:0,fill:0,binValue:0,bagTimer:0,progress:0,count:0,shiftEarned:0,remaining:100,jammed:false,ended:false,won:false,caseReady:false,lastPressure:0,streak:0,streakAge:999,chainValid:false,elapsed:0,plane:0,nextPlane:18,call:null,itemId:this.levels.tier,secret:false,urgent:0,special:false,started:false});this.contract=this.makeContract();return true;
    }
    ensureDaily(date){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||this.daily?.date>=date)return false;
      this.daily={date,claimed:[],base:{urgent:this.stats.urgent,purchases:this.stats.purchases,bins:this.stats.bins,fullBins:this.stats.fullBins,total:this.total},rewards:this.issueDailyRewards()};return true;
    }
    dailyProgress(id){const task=DAILY_TASKS.find(t=>t.id===id);if(!task||!this.daily)return 0;const current=task.stat==='total'?this.total:this.stats[task.stat];return Math.min(task.need,Math.max(0,current-finite(this.daily.base?.[task.stat])));}
    issueDailyRewards(){return Object.fromEntries(DAILY_TASKS.map(t=>[t.id,Math.round(ITEMS[this.levels.tier].value*this.nightPay*t.factor)]));}
    dailyReward(id){return Math.max(0,finite(this.daily?.rewards?.[id]));}
    claimDaily(date,id,{rewarded=false}={}){this.ensureDaily(date);const task=DAILY_TASKS.find(t=>t.id===id);if(!task||date!==this.daily?.date||this.daily.claimed.includes(id)||this.dailyProgress(id)<task.need)return 0;const reward=this.dailyReward(id)*(rewarded?2:1);this.daily.claimed.push(id);this.credit(reward);return reward;}
    get boostMultiplier(){return Object.values(this.boosts).some(b=>b.left>0)?2:1;}
    boostCost(kind){return BOOSTS[kind]?Math.round(ITEMS[this.levels.tier].value*this.nightPay*BOOSTS[kind].factor):Infinity;}
    canRewardedEspresso(){return this.levels.tier>=2&&this.boosts.espresso.cooldown<=0&&this.boostMultiplier===1;}
    activateBoost(kind,{rewarded=false}={}){const def=BOOSTS[kind],cost=this.boostCost(kind);if(rewarded&&(kind!=='espresso'||!this.canRewardedEspresso()))return false;if(!def||this.boosts[kind].cooldown>0||this.boostMultiplier>1||(!rewarded&&this.cash<cost))return false;if(!rewarded)this.cash-=cost;this.boosts[kind]={left:def.duration,cooldown:def.cooldown,unit:ITEMS[this.levels.tier].value*this.nightPay};return true;}
    advanceBoosts(seconds){for(const b of Object.values(this.boosts)){b.left=Math.max(0,b.left-seconds);b.cooldown=Math.max(0,b.cooldown-seconds);}}
    advanceOffline(seconds){
      const before=this.cash,totalBefore=this.total;seconds=clamp(finite(seconds),0,28800);
      if(!this.levels.intern||!this.internEnabled||seconds<1){this.advanceBoosts(seconds);return {seconds,cash:0,items:0};}
      const shift=this.shiftState();this.offlineStart=this.cash;this.offlineLimit=Math.round((Number.isFinite(this.cost('tier'))?this.cost('tier'):ITEMS[this.levels.tier].value*60)*.5);this.offlineWork=true;this.progress=0;this.urgent=0;this.secret=false;this.special=false;this.itemId=this.levels.tier;
      let simulated=0;for(let t=0;t<seconds;t+=.1){const step=Math.min(.1,seconds-t);this.advanceBoosts(step);simulated+=step;this.tick(Math.min(.1,seconds-t),0,true);if((this.full&&!this.levels.bagger)||this.cash-this.offlineStart>=this.offlineLimit)break;}
      this.advanceBoosts(Math.max(0,seconds-simulated));const production={heat:this.heat,fill:this.fill,binValue:this.binValue,bagTimer:this.bagTimer};this.restoreShift(shift);Object.assign(this,production);this.offlineWork=false;this.lastPressure=0;this.pendingAwards=[];
      return {seconds,cash:this.cash-before,items:this.total-totalBefore};
    }
    shiftState(){return Object.fromEntries(['heat','fill','binValue','progress','count','remaining','jammed','ended','won','streak','streakAge','chainValid','shiftEarned','elapsed','plane','nextPlane','call','nextCall','urgent','secret','special','itemId','started','internCooling','caseReady','bagTimer'].map(k=>[k,typeof this[k]==='object'&&this[k]!==null?{...this[k]}:this[k]]));}
    restoreShift(s){
      for(const k of ['jammed','ended','won','chainValid','secret','special','started','internCooling','caseReady'])if(typeof s[k]==='boolean')this[k]=s[k];
      for(const k of ['heat','fill','binValue','progress','count','remaining','streak','streakAge','shiftEarned','elapsed','plane','nextPlane','nextCall','urgent','itemId','bagTimer'])if(Number.isFinite(s[k]))this[k]=Math.max(0,s[k]);
      this.itemId=clamp(Math.floor(this.itemId),0,this.levels.tier);this.progress=clamp(this.progress,0,.99999);this.heat=clamp(this.heat,0,100);this.fill=clamp(this.fill,0,this.capacity);this.remaining=clamp(this.remaining,0,100);
      this.call=null;
    }
    save(timestamp=Date.now()){return {version:4,contract:{...this.contract},daily:this.daily,boosts:this.boosts,cash:this.cash,levels:{...this.levels},night:this.night,total:this.total,stats:{...this.stats},awards:[...this.awards],savedAt:timestamp,dailyKey:this.dailyKey,internEnabled:this.internEnabled,shift:this.shiftState()};}
  }
  ArchiveModel.ITEMS=ITEMS;ArchiveModel.DAILY_TASKS=DAILY_TASKS;ArchiveModel.BOOSTS=BOOSTS;ArchiveModel.UPGRADES=UPGRADES;ArchiveModel.ACHIEVEMENTS=ACHIEVEMENTS;
  globalThis.ArchiveModel=ArchiveModel;if(typeof module!=='undefined')module.exports=ArchiveModel;
})();






