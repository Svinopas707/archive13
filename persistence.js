'use strict';
// Pikabu storage.get/set are synchronous; only flush confirms server persistence.
(() => {
  const copy=value=>JSON.parse(JSON.stringify(value));
  const valid=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
    [1,2,3,4].includes(value.version)&&Number.isFinite(value.cash)&&value.cash>=0&&
    value.levels&&typeof value.levels==='object'&&!Array.isArray(value.levels);
  class ArchivePersistence {
    constructor({loader=()=>ArchivePlatform.loadSDK(),local,eventTarget=globalThis, onStatus=()=>{}}={}){
      if(local===undefined){try{local=globalThis.localStorage;}catch{local=null;}}
      this.local=local;this.loader=loader;this.onStatus=onStatus;this.cacheKey='archive13-prototype-v1';
      this.cloudKey='archive13-progress';this.backupKey='archive13-backup';this.current={};this.sdk=null;
      this.blocked=false;this.dirty=false;this.revision=0;this.status='loading';
      this.eventTarget=eventTarget;this.sessionId=globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);
    }
    get recoveryKey(){return this.cacheKey+':recovery:'+this.sessionId;}
    watch(){
      this.eventTarget?.addEventListener?.('storage',event=>{
        if(event.key!==this.cacheKey||!event.newValue||this.blocked)return;
        try{const value=JSON.parse(event.newValue);if(valid(value)&&value._cacheWriter&&value._cacheWriter!==this.sessionId){this.blocked=true;this.statusChanged('conflict');}}catch{}
      });
    }
    statusChanged(status){this.status=status;this.onStatus(status);}
    readLocal(key=this.cacheKey){try{const value=JSON.parse(this.local?.getItem(key)||'null');return valid(value)?value:null;}catch{return null;}}
    writeLocal(value,key=this.cacheKey){try{if(!this.local)return false;this.local.setItem(key,JSON.stringify(key===this.cacheKey?{...value,_cacheWriter:this.sessionId}:value));return true;}catch{return false;}}
    async open(){
      try{this.sdk=await this.loader();}catch{this.sdk=null;}
      if(!this.sdk){this.current=this.readLocal()||{};this.watch();this.statusChanged('local');return copy(this.current);}
      // Each platform player has their own browser recovery cache.
      this.cacheKey+=(this.sdk.provider==='yandex'?':yandex':'')+':player:'+String(this.sdk.player?.id||'guest');
      this.sdk.on?.('storageSaveError',reason=>this.storageError(reason));
      try{
        if(!this.sdk.storage?.get||!this.sdk.storage?.set)throw Error('Storage unavailable');
        const value=this.sdk.storage.get(this.cloudKey);
        if(value!==undefined&&value!==null&&!valid(value)){
          this.blocked=true;this.current=this.readLocal()||{};this.statusChanged('conflict');
        }else{
          this.current=value?copy(value):{};
          if(value)this.writeLocal(value);
          this.statusChanged('cloud');
        }
      }catch{
        // A failed read must never be followed by an empty cloud autosave.
        this.blocked=true;this.current=this.readLocal()||{};this.statusChanged('offline');
      }
      this.watch();return copy(this.current);
    }
    write(value){
      if(!valid(value))return false;
      this.current=copy(value);
      if(this.blocked)return this.writeLocal(this.current,this.recoveryKey);
      const localOK=this.writeLocal(this.current);
      if(!this.sdk){this.statusChanged(localOK?'local':'unavailable');return localOK;}
      try{this.sdk.storage.set(this.cloudKey,this.current);this.revision++;this.dirty=true;this.statusChanged('pending');return true;}
      catch{this.statusChanged('offline');return localOK;}
    }
    storageError(reason){
      if(reason==='REVISION_CONFLICT'){this.blocked=true;this.statusChanged('conflict');}
      else this.statusChanged('offline');
    }
    async flush(){
      if(this.blocked)return false;
      if(!this.sdk)return this.status==='local';
      if(this.flushing)return this.flushing;
      const revision=this.revision;
      this.flushing=(async()=>{
        try{
          const result=await this.sdk.storage.flush();
          if(result?.success===true){this.dirty=this.revision!==revision;this.statusChanged(this.dirty?'pending':'cloud');return true;}
          this.storageError(result?.reason);return false;
        }catch{this.statusChanged('offline');return false;}
      })().finally(()=>{this.flushing=null;});
      return this.flushing;
    }
    readBackup(){
      if(this.sdk&&!this.blocked){try{const value=this.sdk.storage.get(this.backupKey);if(valid(value))return value;}catch{}}
      return this.readLocal(this.cacheKey+'-backup');
    }
    async replaceWith(value){
      if(this.blocked||this.flushing||!valid(value))return false;
      const previous=copy(this.current);
      if(!valid(previous))return false;
      this.writeLocal(previous,this.cacheKey+'-backup');
      try{this.sdk?.storage.set(this.backupKey,previous);}catch{return false;}
      if(!this.write(value))return false;
      if(await this.flush())return true;
      // Restore the in-memory SDK slot too; no reload after failed confirmation.
      this.write(previous);return false;
    }
    reset(){return this.replaceWith({version:4,cash:0,levels:{},night:1,total:0,savedAt:Date.now()});}
    restore(){const backup=this.readBackup();return backup?this.replaceWith(backup):Promise.resolve(false);}
  }
  globalThis.ArchivePersistence=ArchivePersistence;
  if(typeof module!=='undefined')module.exports=ArchivePersistence;
})();
