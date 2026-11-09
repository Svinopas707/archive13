'use strict';
// Pikabu SDK contract checked against the official documentation on 2026-11-02.
// Production has no simulated success path: only the SDK can confirm a reward.
(() => {
  const safeNumber=value=>Number.isFinite(value)&&value>=0?value:0;
  const deadline=(promise,ms)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('SDK timeout')),ms);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
  let scriptPromise, sdkPromise;
  async function initializeSDK(){
    if(typeof window==='undefined')return null;
    if(document.querySelector('meta[name="archive-platform"]')?.content==='yandex'){
      if(!window.YaGames)await deadline(new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/sdk.js';script.onload=resolve;script.onerror=()=>reject(Error('Yandex SDK load failed'));document.head.append(script);}),8000);
      const ysdk=await deadline(window.YaGames.init(),8000);return ArchiveYandex.create(ysdk);
    }
    if(window.PkbSDK)return deadline(window.PkbSDK.init(),8000);
    // The official SDK is supported in the platform iframe, not on a standalone page.
    if(window.parent===window)return null;
    if(!scriptPromise)scriptPromise=deadline(new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://games.pikabu.ru/sdk/sdk.js';script.async=true;
      script.onload=()=>resolve(window.PkbSDK);script.onerror=()=>reject(new Error('SDK load failed'));document.head.append(script);
    }),8000);
    const factory=await scriptPromise;return factory?deadline(factory.init(),8000):null;
  }
  function loadSDK(){if(!sdkPromise)sdkPromise=initializeSDK();return sdkPromise;}
  class ArchivePlatform {
    static loadSDK(){return loadSDK();}
    constructor({sdk=null,loader=loadSDK,now=()=>Date.now(),onBlock=()=>{},onAvailability=()=>{},onError=()=>{},storage=typeof localStorage!=='undefined'?localStorage:null}={}){
      this.sdk=sdk;this.loader=loader;this.now=now;this.onBlock=onBlock;this.onAvailability=onAvailability;this.onError=onError;this.storage=storage;
      this.ready=false;this.busy=false;this.available={rewarded:false,fullscreen:false};this.history={activeSeconds:0,lastFullscreenAt:0,lastRewardedAt:0,lastAttemptNight:0};
      try{const saved=JSON.parse(storage?.getItem('archive13-ad-history-v1')||'{}');for(const key of Object.keys(this.history))this.history[key]=safeNumber(saved[key]);}catch{}
    }
    start(assets=Promise.resolve()){
      if(!this._startPromise)this._startPromise=(async()=>{try{const sdk=this.sdk||await this.loader();await assets;if(!sdk)return false;this.sdk=sdk;await sdk.gameStarted();this.ready=true;await this.refreshAvailability();return true;}catch(error){this.onError(error);return false;}})();
      return this._startPromise;
    }
    persistHistory(){try{this.storage?.setItem('archive13-ad-history-v1',JSON.stringify(this.history));}catch{}}
    setGameplay(active){if(!this.ready)return;const playing=!!active&&!this.busy;if(playing===this.playing)return;this.playing=playing;try{this.sdk?.gameplay?.(playing);}catch(error){this.onError(error);}}
    recordPlay(seconds){if(!this.busy)this.history.activeSeconds+=safeNumber(seconds);}
    async canShow(kind){const api=this.ready&&this.sdk?.ads?.[kind];if(!api||api.isSupported!==true)return false;try{return (await deadline(api.canShow(),5000))===true;}catch(error){this.onError(error);return false;}}
    refreshAvailability(){
      if(this._availabilityPromise)return this._availabilityPromise;
      this._availabilityPromise=(async()=>{const [rewarded,fullscreen]=await Promise.all([this.canShow('rewarded'),this.canShow('fullscreen')]);this.available={rewarded,fullscreen};this.onAvailability(this.available);return this.available;})().finally(()=>{this._availabilityPromise=null;});
      return this._availabilityPromise;
    }
    async requestRewarded(grant){
      if(this.busy)return {status:'busy'};
      if(!this.ready)return {status:'unavailable'};
      this.busy=true;this.setGameplay(false);this.onBlock(true);
      try{
        if(!await this.canShow('rewarded'))return {status:'unavailable'};
        const result=await this.sdk.ads.rewarded.show();
        if(result?.rendered===true){this.history.lastRewardedAt=this.now();this.persistHistory();}
        if(result?.rendered!==true||result.reward!==true)return {status:'closed'};
        const granted=await grant();return {status:granted===false?'stale':'rewarded'};
      }catch(error){this.onError(error);return {status:'error'};}
      finally{this.busy=false;this.onBlock(false);void this.refreshAvailability();}
    }
    async betweenNights(completedNight){
      if(this.busy||!this.ready||!Number.isInteger(completedNight)||completedNight<2||completedNight%2!==0||this.history.activeSeconds<180||this.history.lastAttemptNight===completedNight)return false;
      const time=this.now();if((this.history.lastFullscreenAt&&time-this.history.lastFullscreenAt<180000)||(this.history.lastRewardedAt&&time-this.history.lastRewardedAt<120000))return false;
      this.history.lastAttemptNight=completedNight;this.persistHistory();this.busy=true;this.setGameplay(false);this.onBlock(true);
      try{if(!await this.canShow('fullscreen'))return false;const result=await this.sdk.ads.fullscreen.show();if(result?.rendered!==true)return false;this.history.lastFullscreenAt=this.now();this.persistHistory();return true;}
      catch(error){this.onError(error);return false;}
      finally{this.busy=false;this.onBlock(false);void this.refreshAvailability();}
    }
  }
  globalThis.ArchivePlatform=ArchivePlatform;
  if(typeof module!=='undefined')module.exports=ArchivePlatform;
})();
