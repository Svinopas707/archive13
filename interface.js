'use strict';
(() => {
  class ArchiveInterface {
    constructor(model,onSuspend) {
      this.model=model;this.onSuspend=onSuspend;this.page=0;this.tab='equipment';this.awardKey='';
      this.media=matchMedia('(max-width: 1000px)');this.compact=this.media.matches;this.open=!this.compact;
      this.journal=document.getElementById('journal');this.trigger=document.getElementById('journal-trigger');
      this.tabs=[document.getElementById('tab-equipment'),document.getElementById('collection-toggle'),document.getElementById('daily-tab'),document.getElementById('awards')];
      this.trigger.addEventListener('click',()=>this.setOpen(true,true));
      for(const id of ['journal-close','journal-scrim'])document.getElementById(id).addEventListener('click',()=>this.setOpen(false,true));
      this.tabs.forEach((button,i)=>{
        button.addEventListener('click',()=>this.setTab(['equipment','inventory','daily','award'][i]));
        button.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const next=(i+(e.key==='ArrowRight'?1:3))%4;this.setTab(['equipment','inventory','daily','award'][next]);this.tabs[next].focus();});
      });
      document.getElementById('page-prev').addEventListener('click',()=>{this.page=Math.max(0,this.page-1);this.renderPages();});
      document.getElementById('page-next').addEventListener('click',()=>{this.page=Math.min(2,this.page+1);this.renderPages();});
      this.media.addEventListener('change',()=>{this.compact=this.media.matches;this.setOpen(!this.compact);});
      this.setOpen(this.open);this.setTab('equipment');
    }
    get suspended(){return this.compact&&this.open;}
    setOpen(value,focus=false){
      this.open=this.compact?value:true;this.journal.hidden=!this.open;
      const modal=this.compact&&this.open;
      document.getElementById('journal-scrim').hidden=!modal;
      document.querySelector('.workspace').inert=modal;document.querySelector('.room-header').inert=modal;
      document.body.classList.toggle('journal-open',modal);this.trigger.setAttribute('aria-expanded',String(this.open));
      if(modal){this.journal.setAttribute('role','dialog');this.journal.setAttribute('aria-modal','true');this.journal.setAttribute('aria-labelledby','journal-title');}
      else{this.journal.removeAttribute('role');this.journal.removeAttribute('aria-modal');this.journal.removeAttribute('aria-labelledby');}
      this.onSuspend();
      if(focus){if(this.open)this.tabs[['equipment','inventory','daily','award'].indexOf(this.tab)].focus();else this.trigger.focus();}
    }
    setTab(tab){
      this.tab=tab;const names=['equipment','inventory','daily','award'];
      names.forEach((name,i)=>{const active=name===tab;document.getElementById(name+'-panel').hidden=!active;this.tabs[i].setAttribute('aria-selected',String(active));this.tabs[i].tabIndex=active?0:-1;});
      const titles={equipment:['Журнал заявок','Оборудование для ночной смены'],inventory:['Опись имущества','Дела, переданные на списание'],daily:['Записка на сегодня','Три задания и фиксированные премии'],award:['Личное дело','Поощрения сотрудника архива']};
      document.getElementById('journal-title').textContent=titles[tab][0];document.getElementById('journal-subtitle').textContent=titles[tab][1];
      this.update(this.model);this.renderPages();
    }
    renderPages(){
      [...document.querySelectorAll('.upgrade')].forEach((row,i)=>row.hidden=Math.floor(i/5)!==this.page);
      document.getElementById('page-prev').disabled=this.page===0;document.getElementById('page-next').disabled=this.page===2;
      document.getElementById('journal-page').textContent=`Лист ${this.page+1} из 3`;
      document.getElementById('upgrade-list').hidden=this.page===2;document.getElementById('boost-list').hidden=this.page!==2;document.querySelector('.ledger-columns').hidden=this.page===2;
    }
    handleKey(e){
      if(!this.suspended)return false;
      if(e.code==='Escape'){e.preventDefault();this.setOpen(false,true);return true;}
      if(e.code==='Tab'){
        e.preventDefault();const focusable=[...this.journal.querySelectorAll('button:not(:disabled)')].filter(el=>el.getClientRects().length&&el.tabIndex>=0);
        const index=focusable.indexOf(document.activeElement),next=(index+(e.shiftKey?-1:1)+focusable.length)%focusable.length;focusable[next]?.focus();
      }
      return true;
    }
    onPurchase(kind){const row=document.querySelector(`[data-kind="${kind}"]`);row?.classList.add('approved');setTimeout(()=>row?.classList.remove('approved'),650);}
    update(m){
      document.getElementById('journal-funds').textContent=`${Math.floor(m.cash).toLocaleString('ru-RU')} ₽`;
      
      if(this.tab!=='award')return;
      const key=`${m.total}:${m.awards.size}:${m.stats.calls}:${m.stats.bins}:${m.stats.planes}`;
      if(key===this.awardKey)return;this.awardKey=key;
      document.getElementById('award-summary').textContent=`Получено ${m.awards.size} из 22. Каждая награда добавляет 2% к оплате предметов.`;
      document.getElementById('award-entries').innerHTML=ArchiveModel.ACHIEVEMENTS.map(a=>`<div class="award-entry ${m.awards.has(a.id)?'earned':''}"><div><b>${a.name}</b><small>${a.desc}</small></div><span>${m.awards.has(a.id)?'Получена':'—'}</span></div>`).join('');
    }
  }
  globalThis.ArchiveInterface=ArchiveInterface;
})();
