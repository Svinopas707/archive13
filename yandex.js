'use strict';
// Yandex Games SDK adapter. Official contracts checked 2026-11-04.
(() => {
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  const wait=promise=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Yandex player timeout')),8000);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
  class ArchiveYandex {
    static async create(ysdk){
      const adapter=new ArchiveYandex(ysdk);
      try{adapter.playerAPI=await wait(ysdk.getPlayer());adapter.player.id=String(adapter.playerAPI.getUniqueID());adapter.data=await wait(adapter.playerAPI.getData(['archive13-progress','archive13-backup']));adapter.readable=true;}
      catch(error){adapter.readError=error;}
      return adapter;
    }
    constructor(ysdk){
      this.ysdk=ysdk;this.provider='yandex';this.name='Яндекс Играх';this.player={id:'guest'};this.data={};this.readable=false;this.changingAccount=false;this.paused=false;this.pauseListeners=new Set();this.errorListeners=new Set();this.playing=false;
      this.storage={get:key=>{if(!this.readable||this.changingAccount)throw this.readError||Error('Player storage unavailable');return clone(this.data[key]);},set:(key,value)=>{if(!this.readable||this.changingAccount)throw Error('Player storage blocked');this.data[key]=clone(value);},flush:async()=>{if(!this.readable||this.changingAccount)return {success:false,reason:'REVISION_CONFLICT'};const snapshot=clone(this.data);await this.playerAPI.setData(snapshot,true);return {success:true};}};
      const ad=kind=>({isSupported:typeof ysdk.adv?.[kind==='rewarded'?'showRewardedVideo':'showFullscreenAdv']==='function',canShow:async()=>!this.changingAccount,show:()=>this.showAd(kind)});
      this.ads={rewarded:ad('rewarded'),fullscreen:ad('fullscreen')};
      ysdk.on?.('game_api_pause',()=>this.pause(true));ysdk.on?.('game_api_resume',()=>this.pause(false));
      const accountChange=()=>{this.changingAccount=true;this.pause(true);for(const fn of this.errorListeners)fn('REVISION_CONFLICT');};
      ysdk.on?.(ysdk.EVENTS?.ACCOUNT_SELECTION_DIALOG_OPENED||'ACCOUNT_SELECTION_DIALOG_OPENED',accountChange);
      ysdk.on?.(ysdk.EVENTS?.ACCOUNT_SELECTION_DIALOG_CLOSED||'ACCOUNT_SELECTION_DIALOG_CLOSED',accountChange);
    }
    pause(value){this.paused=value;for(const fn of this.pauseListeners)fn(value);}
    onPause(fn){this.pauseListeners.add(fn);fn(this.paused);return ()=>this.pauseListeners.delete(fn);}
    on(event,fn){if(event==='storageSaveError'){this.errorListeners.add(fn);if(this.changingAccount)fn('REVISION_CONFLICT');}}
    gameStarted(){this.ysdk.features?.LoadingAPI?.ready();}
    gameplay(value){if(value===this.playing)return;this.playing=value;if(value)this.ysdk.features?.GameplayAPI?.start();else this.ysdk.features?.GameplayAPI?.stop();}
    showAd(kind){
      return new Promise((resolve,reject)=>{
        let opened=false,rewarded=false,settled=false;
        const callbacks={onOpen(){opened=true;},onRewarded(){rewarded=true;},onClose(wasShown){if(settled)return;settled=true;const rendered=wasShown===true||(wasShown!==false&&opened);resolve({rendered,reward:kind==='rewarded'&&rendered&&rewarded});},onError(error){if(settled)return;settled=true;reject(error);}};
        try{if(kind==='rewarded')this.ysdk.adv.showRewardedVideo({callbacks});else this.ysdk.adv.showFullscreenAdv({callbacks});}catch(error){callbacks.onError(error);}
      });
    }
  }
  globalThis.ArchiveYandex=ArchiveYandex;
  if(typeof module!=='undefined')module.exports=ArchiveYandex;
})();
