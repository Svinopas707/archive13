'use strict';
(async () => {
  const $ = id => document.getElementById(id);
  const key = 'archive13-prototype-v1';
  let booted=false,saveConflict=false;
  const store=new ArchivePersistence({onStatus(status){
    const provider=store.sdk?.name||'Пикабу';
    const labels={loading:'Загружаем смену…',local:'Сохранено на устройстве',pending:'Синхронизация с платформой…',cloud:`Сохранено в ${provider}`,offline:'Облако недоступно · копия на устройстве',conflict:'Другая сессия · загрузите актуальную смену',unavailable:'Сохранение недоступно'};
    $('save-status').textContent=labels[status]||labels.local;
    $('sync-reload').hidden=status!=='conflict'&&!(status==='offline'&&store.blocked);
    if(status==='conflict'){saveConflict=true;if(booted&&!adBusy)showSaveConflict();}
  }});
  const saved=await store.open();
  const model = new ArchiveModel(saved);
  const { ITEMS, UPGRADES, ACHIEVEMENTS } = ArchiveModel;
  model.ensureDaily(localDate());
  $('daily-list').innerHTML=ArchiveModel.DAILY_TASKS.map(t=>`<section class="daily-row"><b>${t.label}</b><small id="daily-progress-${t.id}"></small><button class="paper-claim" data-daily="${t.id}" disabled>В работе</button><button class="paper-claim ad-offer" data-daily-ad="${t.id}" hidden></button></section>`).join('');
  const offline = model.advanceOffline(model.lastSaved ? Math.max(0, (Date.now() - model.lastSaved) / 1000) : 0);
  $('upgrade-list').innerHTML = Object.entries(UPGRADES).map(([kind, def]) => `<button class="upgrade" data-kind="${kind}"><span class="upgrade-icon">${ArchiveArt.icon(kind)}</span><span class="upgrade-copy"><b>${def.name}</b><small>${def.desc}</small><i class="level"></i><span class="order-state"></span></span><strong class="price"></strong></button>`).join('');
  const canvas = $('scene'), ctx = canvas.getContext('2d');
  let worldW = 900, scale = 1, started = model.started, paused = false;
  const grip=new ArchiveFeel.Grip(),notices=new ArchiveFeel.Notices();
  let particles = [], rewards = [], last = performance.now(), now = 0;
  let sound = saved.soundEnabled !== false, audio, motorGain, motorFilter, motorTone, toneGain, audioReady = false, lastFocus, grainBuffer,audioMaster;
  let restartArmed=false,saveTransition=false,adBusy=false,platformPaused=false,platformResume=false;
  let lastUI = '', shake = 0, modalMode = 'pause', hiddenAt = 0, saveTime = 0;
  let collectionLevel = -1, awardTimer,goalTier=-1,hotTip=false,binTip=false;
  let inputEventAt=0,frameIntervals=[],metricTime=0,heatWarned=model.heat>=75;
  const orderBenefits={blades:'Резка +40% за уровень',fan:'Меньше нагрев · быстрее остывает',fuse:'Раньше снимает термозащиту',bin:'Ещё 5 мест в корзине',compactor:'Меньше объём каждого предмета',cross:'Оплата +50% · мелкое конфетти',recycle:'Оплата +10% · полные мешки дороже',intern:'Сам подаёт предметы и делает паузы',bagger:'Сам меняет полный мешок'};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const kinds = ['АКТ О СПИСАНИИ', 'СЛУЖЕБНАЯ ЗАПИСКА', 'ОТЧЁТ ОБ ОТЧЁТАХ', 'КОПИЯ КОПИИ', 'СЕКРЕТНАЯ СМЕТА', 'ПЛАН ПО ОТМЕНЕ ПЛАНА'];
  const upgrades = [...document.querySelectorAll('.upgrade')];
  const awardNotice = document.createElement('div'); awardNotice.className = 'award-notice'; awardNotice.hidden = true; awardNotice.setAttribute('role', 'status'); document.body.append(awardNotice);
  function showAwards() {
    if (!model.pendingAwards.length) return;
    const ids = model.pendingAwards.splice(0), first = ACHIEVEMENTS.find(a => a.id === ids[0]);
    awardNotice.textContent = `НАГРАДА: ${first.name}${ids.length > 1 ? ` и ещё ${ids.length - 1}` : ''} · оплата +${ids.length * 2}%`;
    awardNotice.hidden = false; clearTimeout(awardTimer); awardTimer = setTimeout(() => { awardNotice.hidden = true; }, 4500);
  }
  function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function persist() {if(saveTransition)return;store.write({...model.save(),soundEnabled:sound});}
  function toast(text,duration=5,options={}){notices.push({text,duration:Math.max(5,duration),title:'Записка по смене',...options});}
  function updateNotice(dt){
    notices.tick(dt,paused||adBusy||ui.suspended||document.hidden||model.ended);
    const fallback=model.jammed?{title:'Термозащита',text:`Отпусти предмет. Мотор перезапустится после охлаждения до ${model.restartHeat}°.`,priority:4}:model.full?{title:'Мешок заполнен',text:model.levels.bagger?'Автомат меняет мешок.':'Нажми на корзину, чтобы сменить мешок.',priority:4}:{title:grip.current?'Подача предмета':'Подача вручную',text:grip.current?'Тяни вниз для резки. Отпусти, чтобы охладить мотор.':'Возьми предмет и потяни вниз. Каждый следующий — новым захватом.',priority:0};
    const n=notices.current&&notices.current.priority>=fallback.priority?notices.current:fallback;
    if($('toast-title').textContent!==n.title)$('toast-title').textContent=n.title;
    if($('toast-message').textContent!==n.text)$('toast-message').textContent=n.text;
    $('toast').dataset.tone=n.priority>=4?'alert':n.priority>=2?'event':'tip';
    $('toast').closest('.notice-slot').dataset.tone=$('toast').dataset.tone;
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    scale = rect.height / 620; worldW = rect.width / scale;canvas.closest('.desk').style.setProperty('--scene-scale',String(scale));
    const slip=document.querySelector('.quota-slip');canvas.closest('.desk').style.setProperty('--slip-height',`${slip.offsetHeight}px`);slip.style.top=`${Math.max(120,Math.min(155,rect.height-slip.offsetHeight-45))}px`;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  new ResizeObserver(resize).observe(document.querySelector('.quota-slip'));
  function initAudio() {
    if(adBusy)return;
    if (audioReady) { audio?.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      audio = new AC();audioMaster=audio.createGain();audioMaster.gain.value=.7;audioMaster.connect(audio.destination);
      const buffer = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate), data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = audio.createBufferSource(); source.buffer = buffer; source.loop = true;
      motorFilter = audio.createBiquadFilter(); motorFilter.type = 'lowpass'; motorFilter.frequency.value = 300;
      motorGain = audio.createGain(); motorGain.gain.value = 0;
      source.connect(motorFilter).connect(motorGain).connect(audioMaster); source.start();grainBuffer=buffer;
      motorTone=audio.createOscillator();motorTone.type='sawtooth';toneGain=audio.createGain();toneGain.gain.value=0;
      const toneFilter=audio.createBiquadFilter();toneFilter.type='lowpass';toneFilter.frequency.value=340;
      motorTone.connect(toneFilter).connect(toneGain).connect(audioMaster);motorTone.start();
      audioReady = true; canvas.dataset.audioState=audio.state;
    } catch (error) { sound = false; canvas.dataset.audioState='unavailable';canvas.dataset.audioReason=error.message; }
  }
  function beep(freq = 440, length = .1) {
    if (!sound || !audioReady || document.hidden || adBusy) return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(freq, audio.currentTime);
    gain.gain.setValueAtTime(.045, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + length);
    oscillator.connect(gain).connect(audioMaster); oscillator.start(); oscillator.stop(audio.currentTime + length);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
  function audioTick() {
    if (!audioReady) return;
    const active = sound && started && !paused && !adBusy && !ui.suspended && !document.hidden && !model.ended;
    audioMaster.gain.setTargetAtTime(active?.7:0,audio.currentTime,.008);
    if(document.hidden&&audio.state==='running')void audio.suspend().catch(()=>{});
    const power = active ? model.lastPressure : 0;
    const hard=!['paper','folder'].includes(model.item.material),load=art.feel.bite;
    const pulse=.82+.18*Math.sin(now*(hard?43:67));
    motorGain.gain.setTargetAtTime(power ? (.035 + power * .065)*pulse : 0, audio.currentTime, power?.025:.08);
    motorFilter.frequency.setTargetAtTime((hard?340:650)+power*650, audio.currentTime,.035);
    toneGain.gain.setTargetAtTime(power?(.012+power*.02)*pulse:0,audio.currentTime,power?.025:.1);
    motorTone.frequency.setTargetAtTime(43+power*47-load*(hard?17:5)-model.heat*.09-(hard?Math.sin(now*20)*2:0),audio.currentTime,.025);
  }
  function cuttingSound(material){
    if(!sound||!audioReady||document.hidden||adBusy||audio.state!=='running')return;
    const p=ArchiveFeel.material(material),source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();
    source.buffer=grainBuffer;source.playbackRate.value=.92+Math.random()*.16;
    filter.type=['paper','folder'].includes(material)?'highpass':'bandpass';filter.frequency.value=p.pitch;filter.Q.value=material==='gold'?5:.8;
    gain.gain.setValueAtTime(p.gain,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+p.length);
    source.connect(filter).connect(gain).connect(audioMaster);source.start(0,Math.random());source.stop(audio.currentTime+p.length);
    source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  function crunch(hard=false) {
    if(!sound||!audioReady||document.hidden||adBusy)return;
    const duration=hard?.14:.1,buffer=audio.createBuffer(1,Math.ceil(audio.sampleRate*duration),audio.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<data.length;i++){const t=i/data.length;data[i]=(Math.random()*2-1)*Math.exp(-t*(hard?9:5))*(hard?1:1-t);}
    const source=audio.createBufferSource(),filter=audio.createBiquadFilter(),gain=audio.createGain();source.buffer=buffer;filter.type=hard?'bandpass':'highpass';filter.frequency.value=hard?1500:900;filter.Q.value=.7;gain.gain.value=hard?.14:.07;
    source.connect(filter).connect(gain).connect(audioMaster);source.start();source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  $('sound').addEventListener('click', e => {
    sound = !sound; if (sound) initAudio();
    $('sound').textContent = sound ? 'Звук вкл' : 'Звук выкл';
    $('sound').setAttribute('aria-pressed', String(sound));
    $('sound').setAttribute('aria-label', sound ? 'Отключить звук' : 'Включить звук');
    audioTick();persist();if(e.detail>0)$('sound').blur();
  });
  function begin() { if (adBusy || paused || model.ended) return false; started = true; if (sound) initAudio(); return true; }
  function release(id=grip.end()) {if(id!==undefined&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
  function point(e) { const rect = canvas.getBoundingClientRect(); return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale }; }
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || adBusy || paused || model.ended) return;
    const p = point(e), cx = worldW / 2;
    if(art.hitItem(model,cx,p)){
      if(model.full||model.jammed){toast(model.full?'Нажми на корзину, чтобы сменить мешок.':'Мотор остывает. Дай ему немного времени.');return;}
      e.preventDefault();
      if (!begin()) return;
      inputEventAt=performance.now();
      grip.begin(p,e.pointerId); art.onEvent('grip',model); canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing';
    } else if (Math.abs(p.x - cx) < 172 && p.y > 365 && p.y < 550) emptyBin();
  });
  canvas.addEventListener('pointermove', e => {
    const position=point(e);art.pointerTarget={x:(position.x/worldW-.5)*2,y:(position.y/620-.5)*2};
    if (grip.current && grip.current.id === e.pointerId) {grip.move(position,e.pointerId);}
    else {const p=point(e),dx=Math.abs(p.x-worldW/2);canvas.style.cursor=art.hitItem(model,worldW/2,p)?'grab':dx<172&&p.y>365&&p.y<550?'pointer':'default';}
  });
  canvas.addEventListener('pointerleave',()=>{art.pointerTarget={x:0,y:0};});
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { release(); canvas.style.cursor = 'grab'; });
  function emptyBin() {
    if (adBusy || paused || ui.suspended || model.ended) return;
    if (!model.empty()) { toast('Корзина уже пуста. За работу!'); return; }
    notices.clear('full');art.onEvent('empty',model); particles = []; toast(`Вторсырьё принято: +${model.recycleReward.toLocaleString('ru-RU')} ₽`); crunch(true); showAwards(); persist(); updateUI();
  }
  function catchPlane() {
    if (adBusy || paused) return;
    notices.clear('plane');const reward = model.catchPlane();
    if (reward) { toast(`Авиапочта: +${reward.toLocaleString('ru-RU')} ₽ и −12° нагрева`); beep(880,.15); showAwards(); persist(); updateUI(); }
  }
  $('plane').addEventListener('click', catchPlane);
  $('intern-toggle').addEventListener('click', () => {
    if (adBusy || paused || !model.levels.intern) return;
    model.internEnabled = !model.internEnabled; persist(); updateUI();
  });
  document.querySelectorAll('[data-daily]').forEach(button=>button.addEventListener('click',()=>{if(adBusy||paused)return;const reward=model.claimDaily(localDate(),button.dataset.daily);if(reward){toast(`Задание принято: +${reward.toLocaleString('ru-RU')} ₽`,5);persist();updateUI();}}));
  for(const kind of Object.keys(ArchiveModel.BOOSTS))$('boost-'+kind).addEventListener('click',()=>{if(adBusy||paused)return;if(model.activateBoost(kind)){toast(`${ArchiveModel.BOOSTS[kind].name}: доплата включена`,5);persist();updateUI();}});
  $('close-case').addEventListener('click',()=>{if(!adBusy&&!paused&&model.closeCase())endShift();});
  document.addEventListener('keydown', e => {
    if(adBusy)return;
    if(ui.handleKey(e))return;
    if (e.code === 'Escape') { e.preventDefault(); if (!model.ended) setPause(!paused); return; }
    if (e.code === 'Tab' && !$('overlay').hidden) {
      e.preventDefault();const buttons=[...document.querySelectorAll('.modal button:not(:disabled)')].filter(b=>b.getClientRects().length);const index=buttons.indexOf(document.activeElement);buttons[(index+(e.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();return;
    }
  });
  function openModal(eyebrow, title, text, button) {
    restartArmed=false;$('new-game').textContent='Начать с нуля';$('save-tools').hidden=true;
    lastFocus = document.activeElement;
    $('modal-details').replaceChildren(); document.querySelector('.modal').classList.remove('awards-modal');
    $('modal-eyebrow').textContent = eyebrow; $('modal-title').textContent = title;
    $('modal-text').textContent = text; $('resume').textContent = button;
    $('overlay').hidden = false; $('resume').focus();
    document.querySelector('.shell').inert = true;
  }
  function showSaveConflict(){
    setPause(true);$('modal-title').textContent='Смена изменилась.';$('modal-text').textContent='Сохранение изменено в другой сессии или не может быть прочитано. Текущая копия осталась на устройстве. Загрузи актуальную смену перед продолжением.';$('resume').textContent='ЗАГРУЗИТЬ АКТУАЛЬНУЮ СМЕНУ';$('save-tools').hidden=true;
  }
  function setPause(value) {
    if((saveConflict||platformPaused)&&!value)return;
    if (adBusy || model.ended) return;
    paused = value; release();if(!value&&sound&&!document.hidden)initAudio();
    if (value) { modalMode = 'pause'; openModal('ПЕРЕРЫВ НА ЧАЙ', 'Тишина в архиве.', 'Смена на паузе. Бумаги подождут.', 'ВЕРНУТЬСЯ К РАБОТЕ');$('save-tools').hidden=false;$('restore-game').hidden=!store.readBackup(); }
    else { $('overlay').hidden = true; document.querySelector('.shell').inert = false; lastFocus?.focus(); }
    platform.setGameplay(started&&!paused&&!adBusy&&!ui.suspended&&!document.hidden&&!model.ended);audioTick();
  }
  async function replaceSave(restore=false){
    if(adBusy||saveTransition)return;
    persist();saveTransition=true;$('new-game').disabled=true;$('restore-game').disabled=true;
    const success=await (restore?store.restore():store.reset());
    if(success){location.reload();return;}
    saveTransition=false;$('new-game').disabled=false;$('restore-game').disabled=false;
    $('modal-text').textContent='Не удалось подтвердить сохранение. Текущая смена и резервная копия сохранены на устройстве. Попробуй снова после восстановления связи.';
  }
  $('new-game').addEventListener('click',()=>{
    if(!restartArmed){restartArmed=true;$('modal-text').textContent='Начать новую игру с нуля? Текущий прогресс останется в резервной копии и его можно будет восстановить здесь же.';$('new-game').textContent='Да, начать с нуля';return;}
    void replaceSave();
  });
  $('restore-game').addEventListener('click',()=>{void replaceSave(true);});
  $('sync-reload').addEventListener('click',()=>{persist();saveTransition=true;location.reload();});
  $('pause').addEventListener('click', () => setPause(!paused));
  $('resume').addEventListener('click', async () => {
    if(adBusy||platformPaused)return;
    if(saveConflict){persist();saveTransition=true;location.reload();return;}
    if (model.ended) {
      await platform.betweenNights(model.night);
      model.nextNight(); started = false; paused = false; particles = []; rewards = [];
      $('overlay').hidden = true; document.querySelector('.shell').inert = false; canvas.focus(); persist();
      toast('Новая ночь: новый наряд, тариф +15%. Начни подачу, когда будешь готов.', 6); updateUI();
    } else setPause(false);
  });
  document.addEventListener('visibilitychange', () => {
    if(adBusy){hiddenAt=0;release();audioTick();return;}
    if (document.hidden) { hiddenAt = Date.now(); if (started && !model.ended && !paused) setPause(true); release(); persist(); audioTick(); }
    else if (hiddenAt) { const report = model.advanceOffline((Date.now() - hiddenAt) / 1000); hiddenAt = 0; if (report.items) toast(`Стажёр списал ${report.items} предметов: +${report.cash.toLocaleString('ru-RU')} ₽`,8); persist(); updateUI(); }
  });
  window.addEventListener('blur', () => { if(adBusy)return;release(); if (started && !model.ended && !paused) setPause(true); });
  window.addEventListener('pagehide',()=>{persist();platform.persistHistory();if(!saveTransition)void store.flush();});
  upgrades.forEach(button=>button.addEventListener('click',e=>{
    if(adBusy||paused)return;const kind=button.dataset.kind,firstHire=kind==='intern'&&!model.levels.intern;
    if(model.buy(kind)){
      beep(660,.15);showAwards();ui.onPurchase(kind);persist();updateUI();
      if(kind==='tier'||firstHire){
        if(ui.compact)ui.setOpen(false,true);paused=true;release();modalMode='reveal';
        const item=ITEMS[model.levels.tier];
        openModal('ЗАЯВКА ОДОБРЕНА',firstHire?'Стажёр принят на смену.':`Выдано новое дело: ${item.name}`,firstHire?'Ты нанял стажёра через журнал заявок. Он сам подаёт предметы, делает перерыв для охлаждения и зарабатывает в отсутствие до 8 часов. На полной корзине остановится, если не установлен автомат мешков. Отключить его можно по табелю под столом.':`Базовая оплата: ${item.value.toLocaleString('ru-RU')} ₽ — в ${(item.value/ITEMS[Math.max(0,item.id-1)].value).toLocaleString('ru-RU',{maximumFractionDigits:1})} раза выше предыдущего дела. Текущий предмет остаётся в работе; новое дело поступит после его уничтожения.`,firstHire?'К РАБОТЕ':'ПРИНЯТЬ ДЕЛО');
        if(!firstHire)$('modal-details').innerHTML=`<div class="case-reveal">${art.evidenceIcon(item.id)}</div>`;
        audioTick();
      }else toast('Заявка одобрена. Оборудование установлено.');
    }
    if(e.detail>0)button.blur();
  }));
  $('next-case').addEventListener('click',()=>{if(paused||adBusy)return;ui.page=0;ui.setTab('equipment');ui.setOpen(true,true);ui.renderPages();document.querySelector('[data-kind="tier"]').focus();});
  function updateUI() {
    if(adBusy)return;
    const s = model;
    $('sound').textContent=sound?'Звук вкл':'Звук выкл';$('sound').setAttribute('aria-pressed',String(sound));$('sound').setAttribute('aria-label',sound?'Отключить звук':'Включить звук');
    document.body.classList.toggle('motor-running',s.lastPressure>0);
    document.body.classList.toggle('motor-hot',s.heat>75);
    canvas.closest('.desk').dataset.heat=ArchiveFeel.heatBand(s.heat,s.jammed);
    $('night').textContent = String(s.night).padStart(2, '0');$('shift-caption').textContent=s.night>10?'Дополнительная смена':'Ночная смена';$('campaign-count').hidden=s.night>10; $('cash').textContent=s.cash>=1e6?`${(s.cash/1e6).toLocaleString('ru-RU',{maximumFractionDigits:2})} млн`:Math.floor(s.cash).toLocaleString('ru-RU');$('cash').title=`${Math.floor(s.cash).toLocaleString('ru-RU')} ₽`;
    model.ensureDaily(localDate());
    const tasks=ArchiveModel.DAILY_TASKS;
    $('daily-summary').textContent=`Выполнено ${s.daily.claimed.length} из ${tasks.length}`;
    for(const task of tasks){const done=s.daily.claimed.includes(task.id),progress=s.dailyProgress(task.id),button=document.querySelector(`[data-daily="${task.id}"]`);$('daily-progress-'+task.id).textContent=`${progress} / ${task.need} · премия ${s.dailyReward(task.id).toLocaleString('ru-RU')} ₽`;button.disabled=done||progress<task.need;button.textContent=done?'Принято':progress>=task.need?'Получить премию':'В работе';const ad=document.querySelector(`[data-daily-ad="${task.id}"]`);ad.hidden=done||progress<task.need||!platform.available.rewarded;ad.textContent=`Реклама · ${(s.dailyReward(task.id)*2).toLocaleString('ru-RU')} ₽ (×2)`;}
    const next=ITEMS[s.levels.tier+1],goal=$('next-case');
    const details=['','Длиннее лист · оплата ×2','Первое дело по наряду','Ценная бумага с высокой ставкой','Плотная папка · больше сопротивление','Первый пластик · осколки вместо полос','Тонкий пластик · быстрая подача','Корпус и плата · сухой треск','Металл · тяжёлые осколки','Крупный корпус · высокая ставка','Последнее дело · тяжёлая металлическая подача'];
    if(goalTier!==s.levels.tier){goalTier=s.levels.tier;goal.querySelector('.next-case-icon').innerHTML=art.evidenceIcon(next?next.id:s.levels.tier);goal.querySelector('b').textContent=next?next.name:'Опись полностью открыта';goal.querySelector('.next-case-detail').textContent=next?details[next.id]:'Итоговая проверка — после десяти закрытых нарядов';}
    goal.disabled=!next;goal.classList.toggle('ready',!!next&&s.cash>=s.cost('tier'));
    goal.querySelector('.next-case-price').textContent=next?(s.cash>=s.cost('tier')?`Можно получить · ${s.cost('tier').toLocaleString('ru-RU')} ₽`:`Осталось ${Math.ceil(s.cost('tier')-s.cash).toLocaleString('ru-RU')} ₽ · ставка ${Math.round(next.value*s.nightPay).toLocaleString('ru-RU')} ₽`):`${Math.min(10,s.night-1)} / 10 нарядов сдано · ${s.contract.qualified} / ${s.contract.required} по классу`;
    goal.querySelector('i').style.width=next?`${Math.min(100,s.cash/s.cost('tier')*100)}%`:'100%';
    $('count').textContent=`${s.count} / ${s.contract.target}`;
    $('quota-bar').style.width=`${Math.min(100,s.count/s.contract.target*100)}%`;
    $('quota-text').textContent=`Из них не ниже класса «${ITEMS[s.contract.tier].name}»`;
    $('contract-grade').textContent=`${s.contract.qualified} / ${s.contract.required} по классу`;
    $('plan-stamp').textContent=s.won?'ПРИНЯТО':s.caseReady?'ИСПОЛНЕНО':'В РАБОТЕ';$('plan-stamp').classList.toggle('completed',s.caseReady);
    $('modifier').textContent = `${s.modifier.name} · ${s.modifier.desc}`;
    $('night-pay').textContent = `ОПЛАТА ×${s.nightPay.toLocaleString('ru-RU')}`;
    $('item-name').textContent = s.item.name;
    $('item-bonus').textContent = `${Math.round(s.item.value * s.nightPay).toLocaleString('ru-RU')} ₽${s.secret ? ' · СЕКРЕТНО +100%' : ''}${s.urgent > 0 ? ` · СРОЧНО ${Math.ceil(s.urgent)}с +50%` : ''}`;
    document.querySelector('.item-line').classList.toggle('hot', s.secret || s.urgent > 0);
    $('streak').textContent = `СЕРИЯ ${s.streak}${s.streak > 1 ? ` · +${Math.min(10,s.streak-1)*5}%` : ''}`;
    $('awards').textContent = `Награды · ${s.awards.size}`;
    $('pay-bonus').textContent = `Награды: +${s.awards.size * 2}% к оплате предметов`;
    $('plane').hidden = s.plane <= 0 || s.ended;if(s.plane<=0)notices.clear('plane');
    const intern = $('intern-toggle'); intern.disabled = !s.levels.intern;
    intern.setAttribute('aria-pressed', String(s.internEnabled && s.levels.intern > 0));
    intern.classList.toggle('working', s.levels.intern > 0 && s.internEnabled);
    intern.querySelector('b').textContent = !s.levels.intern ? 'Стажёр не нанят' : s.internEnabled ? 'Стажёр работает' : 'Стажёр отдыхает';
    intern.querySelector('small').textContent=s.levels.intern?`Нанят в журнале · ур. ${s.levels.intern} · нажми для ${s.internEnabled?'отдыха':'работы'}`:'Сначала одобри найм в журнале заявок';
    if (collectionLevel !== s.levels.tier) {
      collectionLevel = s.levels.tier; $('collection-count').textContent = `Выдано ${collectionLevel + 1} из ${ITEMS.length} дел`;
      $('collection').innerHTML = ITEMS.map(item => `<div class="case-item ${item.id > collectionLevel ? 'locked' : ''}"><b>${art.evidenceIcon(item.id)}</b><span>${item.name}</span><small>${item.id > collectionLevel ? 'ЗАКРЫТО' : `${item.value.toLocaleString('ru-RU')} ₽ × НОЧЬ`}</small></div>`).join('');
    }
    $('heat').textContent = `${Math.round(s.heat)}°`; $('heat').style.color = s.heat >= 75 ? 'var(--red)' : 'var(--ink)';
    const worked=Math.floor(s.elapsed);$('clock').textContent=`${String(Math.floor(worked/60)).padStart(2,'0')}:${String(worked%60).padStart(2,'0')}`;
    const active=Object.entries(s.boosts).find(([,b])=>b.left>0),format=sec=>{const whole=Math.ceil(sec);return `${Math.floor(whole/60)}:${String(whole%60).padStart(2,'0')}`;};
    $('ad-espresso').hidden=!platform.available.rewarded||s.levels.tier<2;$('ad-espresso').disabled=!s.canRewardedEspresso();
    $('ad-espresso').querySelector('span').textContent=s.boosts.espresso.cooldown>0?`Снова через ${format(s.boosts.espresso.cooldown)}`:s.boostMultiplier>1?'Уже действует другой пропуск':'Смотреть рекламу';
    $('boost-status').textContent=active?`Доплата · ${format(active[1].left)}`:'Обычная оплата';
    for(const [kind,def]of Object.entries(ArchiveModel.BOOSTS)){const button=$('boost-'+kind),state=s.boosts[kind],cost=s.boostCost(kind);button.querySelector('small').textContent=`До ${Math.round((state.left>0?state.unit:ITEMS[s.levels.tier].value*s.nightPay)*4).toLocaleString('ru-RU')} ₽ доплаты за предмет · ${kind==='espresso'?'2':'15'} мин`;button.disabled=paused||state.cooldown>0||s.boostMultiplier>1||s.cash<cost;button.querySelector('span').textContent=state.left>0?`Действует · ${format(state.left)}`:state.cooldown>0?`Снова через ${format(state.cooldown)}`:s.boostMultiplier>1?'Уже действует другой пропуск':`Одобрить · ${cost.toLocaleString('ru-RU')} ₽`;}
    $('close-case').disabled=!s.caseReady||s.ended;$('close-case').textContent=s.caseReady?'Сдать наряд':'Выполнить наряд';
    $('bin-label').textContent = `${Number(s.fill.toFixed(1))} / ${s.capacity}`; canvas.classList.toggle('bin-full', s.full);
    const state = s.jammed ? '● ТЕРМОЗАЩИТА' : s.full ? s.levels.bagger?'● СМЕНА МЕШКА':'● КОРЗИНА ПОЛНА' : s.lastPressure > 0 ? `● РЕЗКА · ×${String(s.multiplier).replace('.', ',')}` : '● МАШИНА ГОТОВА';
    if (lastUI !== state) { $('machine-state').textContent = state; $('machine-state').classList.toggle('danger', s.jammed || s.full); lastUI = state; }
    upgrades.forEach(button => {
      const kind = button.dataset.kind, cost = s.cost(kind), level = s.levels[kind];
      const locked=s.lockReason(kind);button.disabled=!!locked||s.cash<cost||!Number.isFinite(cost);
      button.dataset.state=!Number.isFinite(cost)?'max':locked?'locked':s.cash>=cost?'available':'short';
      button.querySelector('.price').textContent = locked?'Позже':Number.isFinite(cost) ? `${cost.toLocaleString('ru-RU')} ₽` : 'Выдано';
      button.querySelector('.price').dataset.action=button.disabled?'':kind==='tier'?'Получить':'Установить';
      button.querySelector('.order-state').textContent=locked?'Откроется позже':!Number.isFinite(cost)?'Установлено':s.cash>=cost?'Можно заказать':`Ещё ${Math.ceil(cost-s.cash).toLocaleString('ru-RU')} ₽`;
      button.title = locked|| (Number.isFinite(cost)&&s.cash<cost?`Не хватает ${Math.ceil(cost-s.cash).toLocaleString('ru-RU')} ₽`:'');
      button.querySelector('small').textContent=locked||orderBenefits[kind]||UPGRADES[kind].desc;
      if (kind === 'tier') button.querySelector('small').textContent = level < ITEMS.length-1 ? `${ITEMS[level + 1].name} · ${ITEMS[level + 1].value.toLocaleString('ru-RU')} ₽ за предмет` : 'Все дела открыты';
      const levelBar = button.querySelector('.level');
      if (levelBar.dataset.value !== String(level)) { levelBar.textContent = UPGRADES[kind].max===1 ? '' : `${level} / ${UPGRADES[kind].max}`;levelBar.setAttribute('aria-label',`Уровень ${level} из ${UPGRADES[kind].max}`); levelBar.dataset.value = level; }
      button.setAttribute('aria-label', `${button.querySelector('b').textContent}. Уровень ${level} из ${UPGRADES[kind].max}. ${Number.isFinite(cost) ? `Цена ${cost} рублей.` : 'Максимальный уровень.'}`);
    });
    ui.update(s);
  }
  function spawnBits(amount, burst = false) {
    if (reduced) amount = Math.min(amount, 2);
    const item = burst ? model.recentItem : model.item;
    const hard = !['paper','folder'].includes(item.material), confetti = !!model.levels.cross;
    for (let i = 0; i < amount; i++) {
      particles.push({ x: worldW / 2 + (Math.random() - .5) * 165, y: 351, vx: (Math.random() - .5) * (burst ? 150 : 60), vy: hard ? 70+Math.random()*140 : 20+Math.random()*50, angle: Math.random() * 3, spin: (Math.random() - .5) * (hard?12:6), life: 2.3 + Math.random(),material:item.material,seed:Math.random()*30,hard, width: 3 + Math.random() * (hard ? 10 : 5), length: confetti ? 4 + Math.random()*5 : hard ? 6 + Math.random()*13 : 12 + Math.random()*25, color:hard?(item.material==='gold'?(i%2?'#c3a14a':'#e8cd76'):item.material==='drive'?(i%2?'#98a69e':'#d9dfd7'):['phone','laptop'].includes(item.material)?(i%3?'#3d6551':'#222e29'):item.color):(i%3?item.color:'#e5dfbd') });
    }
    if (particles.length > 180) particles.splice(0, particles.length - 180);
  }
  function rect(x, y, w, h, fill, radius = 0) {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
  }
  function text(value, x, y, font, fill, align = 'left') { ctx.fillStyle = fill; ctx.font = font; ctx.textAlign = align; ctx.fillText(value, x, y); }
  function drawItem(s, c) {
    if (art.drawEvidence(ctx,s,c,reduced,now)) return;
    const item = s.item, type = item.material;
    const height = type === 'phone' ? 175 : type === 'card' ? 115 : type === 'gold' ? 115 : type === 'pumpkin' ? 140 : 184;
    const width = type === 'phone' ? 96 : type === 'floppy' ? 172 : type === 'laptop' ? 265 : 200;
    ctx.save(); ctx.beginPath(); ctx.rect(c-155,4,310,215); ctx.clip();
    ctx.translate(c+art.feel.pointerX*(1-s.progress), 218-height+s.progress*height); ctx.rotate((reduced?0:Math.sin(now*22)*s.lastPressure*.003)-.016);
    ctx.shadowColor='#080b07aa'; ctx.shadowBlur=9; ctx.shadowOffsetY=4; rect(-width/2+3,4,width,height,'#13251e88',3); ctx.shadowBlur=0; ctx.shadowOffsetY=0;
    if (type === 'pumpkin') {
      rect(-8,-12,16,30,'#748058',3);
      for (let i=0;i<5;i++) { ctx.beginPath();ctx.ellipse(-55+i*27,height/2,40-i%2*5,height/2,0,0,Math.PI*2);ctx.fillStyle=i%2?'#bc7337':'#d69147';ctx.fill(); }
      text('ИНВ. 013',0,90,'bold 15px monospace','#5c4a2f','center');
    } else {
      const surface=ctx.createLinearGradient(-width/2,0,width/2,height); surface.addColorStop(0,item.color);surface.addColorStop(1,item.color+'d9');rect(-width/2,0,width,height,surface,type==='phone'?13:3);ctx.strokeStyle='#fff2cc33';ctx.lineWidth=1;ctx.strokeRect(-width/2+1,1,width-2,height-2);
      if (['paper','folder'].includes(type)) {
        rect(-width/2,0,width,6,type==='folder'?'#9b8057':'#c1b99c');
        text(`ФОРМА 13–${String(s.total+1).padStart(3,'0')}`,-83,25,'8px monospace','#616952');
        text(item.id===0?kinds[s.total%kinds.length]:item.name.toUpperCase(),-83,48,'bold 10px monospace','#404d40');
        rect(-83,59,166,1,'#a1a789');
        for(let i=0;i<5;i++){rect(-83,75+i*12,120+((i*19+s.total*7)%46),2,'#a9ad94');if(i===1||i===3)rect(-68+i*13,71+i*12,42+i*9,8,'#4b5348');}
        ctx.save();ctx.translate(23,145);ctx.rotate(-.14);ctx.strokeStyle='#a65d4e';ctx.lineWidth=2;ctx.strokeRect(-52,-13,104,27);text('В УТИЛЬ',0,5,'bold 16px monospace','#a65d4e','center');ctx.restore();
        text('Подпись: __________',-83,170,'8px monospace','#858a76');
      } else if (type === 'card') {
        rect(-85,15,45,58,'#dbe2cd',2);text('13',-62,52,'bold 27px monospace','#5a786e','center');
        text('ПРОПУСК',-25,30,'bold 13px monospace','#2c4a40');text('ДОСТУП ЗАКРЫТ',-25,49,'8px monospace','#2c4a40');
        for(let i=0;i<30;i++)rect(-84+i*5,87,i%3?2:4,15,'#304a40');
      } else if (type === 'floppy') {
        rect(-62,0,124,56,'#bfc8b6',2);rect(-28,4,42,46,'#52606b');rect(-64,75,128,93,'#ece1c6',2);
        text('АРХИВ_1998',0,105,'bold 13px monospace','#4b574c','center');text('НЕ КОПИРОВАТЬ',0,126,'9px monospace','#8b5b4b','center');
        rect(-74,165,12,11,'#283d36');rect(62,165,12,11,'#283d36');
      } else if (type === 'tape') {
        rect(-90,20,180,125,'#232f2a',7);rect(-75,34,150,62,'#c5c1a4',3);
        for(const x of [-42,42]){ctx.beginPath();ctx.arc(x,66,19,0,Math.PI*2);ctx.fillStyle='#374a3d';ctx.fill();ctx.beginPath();ctx.arc(x,66,7,0,Math.PI*2);ctx.fillStyle='#c0b997';ctx.fill();}
        text('ЗАПИСЬ СОВЕЩАНИЯ',0,121,'10px monospace','#b3c0a5','center');
      } else if (type === 'phone') {
        rect(-42,9,84,153,'#1b3030',9);rect(-35,20,70,115,'#568477',3);text('ДАННЫЕ',0,64,'11px monospace','#d2e4b9','center');text('УДАЛИТЬ?',0,84,'10px monospace','#d2e4b9','center');
        rect(-14,5,28,3,'#273b35',1);ctx.beginPath();ctx.arc(0,150,7,0,Math.PI*2);ctx.strokeStyle='#8a9e91';ctx.stroke();
      } else if (type === 'drive') {
        rect(-88,12,176,160,'#c2ccc0',5);ctx.beginPath();ctx.arc(-8,91,56,0,Math.PI*2);ctx.fillStyle='#8c9b91';ctx.fill();
        ctx.beginPath();ctx.arc(-8,91,38,0,Math.PI*2);ctx.fillStyle='#c8d2c4';ctx.fill();rect(-16,84,16,16,'#64796b',8);
        ctx.strokeStyle='#4b6154';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(65,142);ctx.lineTo(-10,91);ctx.stroke();text('HDD · 13 TB',0,32,'9px monospace','#3f5848','center');
      } else if (type === 'laptop') {
        rect(-125,5,250,140,'#405c54',6);rect(-114,15,228,118,'#1b322b',3);text('ARCHIVE_13',0,62,'bold 21px monospace','#cbd998','center');text('СЛЕДОВ НЕ ОСТАВЛЯТЬ',0,85,'10px monospace','#a9b9a0','center');
        rect(-132,145,264,36,'#abb7a3',3);for(let i=0;i<25;i++)rect(-117+i*9,152,5,11,'#5e7565');
      } else if (type === 'gold') {
        ctx.fillStyle='#a88932';ctx.beginPath();ctx.moveTo(-100,height);ctx.lineTo(-78,0);ctx.lineTo(78,0);ctx.lineTo(100,height);ctx.fill();rect(-76,5,152,height-10,'#ddbe60',3);
        text('999.9',0,48,'bold 26px Georgia','#8f7026','center');text('БЮРО БУМАЖНЫХ ДЕЛ',0,73,'9px monospace','#8f7026','center');
      }
    }
    if(s.secret){rect(-width/2+5,5,width-10,26,'#7b3b2c',1);text('СОВЕРШЕННО СЕКРЕТНО',0,22,'bold 9px monospace','#f3dfb4','center');}
    if(s.urgent>0){rect(width/2-40,height-37,37,30,'#b9653b',2);text(`${Math.ceil(s.urgent)}с`,width/2-21,height-17,'bold 13px monospace','#fff0c5','center');}
    ctx.restore();
  }
  const art = new ArchiveArt();art.feel.gauge=model.heat;
  const ui = new ArchiveInterface(model,()=>{release();audioTick();});
  const platform=new ArchivePlatform({sdk:store.sdk,loader:async()=>store.sdk,
    onBlock(value){
      adBusy=value;release();model.lastPressure=0;audioTick();
      if(audioReady){if(value)void audio.suspend().catch(()=>{});else if(sound&&!document.hidden)void audio.resume().catch(()=>{});}
      document.querySelector('.shell').inert=value||paused||model.ended;
      $('overlay').inert=value;$('journal-scrim').inert=value;
      if(value){persist();hiddenAt=0;}
      else{
        if(document.hidden)hiddenAt=Date.now();
        if(saveConflict)showSaveConflict();
        else if(started&&!model.ended&&(document.hidden||!document.hasFocus()))setPause(true);
        updateUI();
      }
    },
    onAvailability(){updateUI();},
    onError(error){console.warn('Platform SDK:',error);}
  });
  store.sdk?.onPause?.(value=>{
    if(adBusy)return;
    if(platformPaused===value)return;
    if(value){platformResume=!paused&&!model.ended;platformPaused=true;setPause(true);}
    else{platformPaused=false;if(platformResume&&!document.hidden&&!saveConflict)setPause(false);platformResume=false;}
  });
  async function rewarded(grant,message){
    if(adBusy||paused)return;
    const result=await platform.requestRewarded(()=>{const ok=grant();if(ok)persist();return !!ok;});
    toast(result.status==='rewarded'?message:result.status==='stale'?'Бонус уже недоступен.':'Бонус не получен. Обычная оплата доступна.',5);updateUI();
  }
  document.querySelectorAll('[data-daily-ad]').forEach(button=>button.addEventListener('click',()=>{
    const date=localDate(),id=button.dataset.dailyAd,amount=model.dailyReward(id)*2;
    void rewarded(()=>model.claimDaily(date,id,{rewarded:true}),`Задание принято: +${amount.toLocaleString('ru-RU')} ₽`);
  }));
  $('ad-espresso').addEventListener('click',()=>{void rewarded(()=>model.activateBoost('espresso',{rewarded:true}),'Эспрессо получен: доплата на 2 минуты.');});
  art.loaded.then(() => { document.body.classList.add('art-ready'); });
  function render(dt) {
    art.dragOffsetX=grip.current?Math.max(-50,Math.min(50,grip.current.currentX-grip.current.x)):0;
    art.dragGrip=grip.current?Math.max(-1,Math.min(1,(grip.current.currentX-grip.current.x)/85)):0;
    art.render({ctx, w:worldW, s:model, now, dt, particles, paused:paused||adBusy||ui.suspended, reduced, shake, drawItem, rewards, items:ITEMS});
    particles = particles.filter(p => p.life > 0 && p.y < 570);
    rewards = rewards.filter(r => r.life > 0);
    shake = Math.max(0, shake - dt * 8);
  }
  let uiTime = 0, bitTime = 0, availabilityTime=0, cloudTime=0;
  function endShift() {
    release(); model.lastPressure = 0; persist(); modalMode = 'end';
    const win = model.won;
    if(model.night===10&&model.campaignComplete){
      openModal('ИТОГОВАЯ ПРОВЕРКА','Архив принят.',`Десять ночных нарядов закрыты. Всего списано: ${model.total.toLocaleString('ru-RU')}. Вся опись открыта, премия ${model.premium.toLocaleString('ru-RU')} ₽ зачислена. Можно продолжить дополнительные смены — оборудование и деньги остаются.`,'ПРОДОЛЖИТЬ РАБОТУ');
      $('modal-details').innerHTML='<div class="archive-certificate"><span>БЮРО БУМАЖНЫХ ДЕЛ</span><b>СЛЕДОВ НЕ ОСТАЛОСЬ</b><small>Десять нарядов · проверка пройдена</small></div>';return;
    }
    openModal(win ? 'ПРОВЕРКА ПРОЙДЕНА' : 'ПРОВЕРКА НАЧАЛАСЬ', win ? 'Чисто сработано.' : 'В архиве ещё следы.', win ? `Дело закрыто. Премия: ${model.premium.toLocaleString('ru-RU')} ₽. Следующая ночь: новый наряд и тариф +15%. Деньги и оборудование остаются.` : `Уничтожено ${model.count} из ${model.target} предметов. Деньги и улучшения остаются — попробуй ещё раз.`, win ? 'СЛЕДУЮЩАЯ СМЕНА →' : 'ПОВТОРИТЬ СМЕНУ');
  }
  function frame(time) {
    const interval=time-last,dt = Math.min(interval / 1000, .05); last = time; now += dt;
    let pressure = 0;
    pressure=grip.pressure;
    if (started && !paused && !adBusy && !ui.suspended && !document.hidden && !model.ended) {
      platform.recordPlay(dt);
      const previousProgress=model.progress,material=model.item.material;
      const events = model.tick(dt, pressure);
      const completedPointer=grip.consume(events);if(completedPointer!==undefined)release(completedPointer);
      canvas.dataset.gripped=String(!!grip.current);
      const cuts=ArchiveFeel.cuts(previousProgress,events.includes('shredded')?1:model.progress,material);
      if(cuts){art.feel.cut(cuts,material);cuttingSound(material);}
      canvas.dataset.feed=model.lastPressure.toFixed(2);canvas.dataset.progress=model.progress.toFixed(3);
      const paper=['paper','folder'].includes(model.item.material);
      if (model.lastPressure && (!paper||model.levels.cross)) { bitTime += dt * (paper?23:11+pressure*14); if (bitTime >= 1) { spawnBits(Math.floor(bitTime)); bitTime %= 1; } }
      for (const event of events) {
        art.onEvent(event,model);
        if (event === 'shredded') { if(model.total===1)toast('Первая оплата в кассе. Следующее дело отмечено под столом.',6); if(!['paper','folder'].includes(model.recentItem.material)||model.levels.cross)spawnBits(13, true); rewards.push({ text: `+${model.recentReward} ₽`, life: 1.6 }); crunch(!['paper','folder'].includes(model.recentItem.material)); persist(); }
        if (event === 'overheat') { shake = reduced ? 0 : 5; toast(`Отпусти предмет. Мотор должен остыть до ${model.restartHeat}°.`,8,{key:'heat',title:'Мотор перегрелся',priority:4}); beep(130, .4); }
        if (event === 'cooled'){notices.clear('heat');toast('Мотор остыл. Возьми предмет и продолжай.',5,{key:'cooled',title:'Снова в работе',priority:2});beep(620,.07);}
        if(event==='full')toast(model.levels.bagger?'Автомат меняет мешок.':'Нажми на корзину, чтобы сменить мешок.',8,{key:'full',title:'Мешок заполнен',priority:4});
        if (event === 'auto-empty') { notices.clear('full');particles = []; toast(`Автосмена мешка · переработка +${model.recycleReward.toLocaleString('ru-RU')} ₽`); persist(); }
        if (event === 'urgent-complete') toast('Предмет списан вовремя. Бонус +50% зачислен.',6,{title:'Срочное выполнено',priority:2});
        if (event === 'urgent-missed') toast('Предмет остаётся в работе, но оплата уже обычная.',6,{title:'Срочность истекла',priority:2});
        if (event === 'plane') toast('Нажми на летящий самолётик: деньги и охлаждение мотора.',8,{key:'plane',title:'Авиапочта!',priority:3});
        if (event === 'win' || event === 'timeout') {
          endShift();
        }
      }
      if(model.heat<55){heatWarned=false;notices.clear('hot-warning');}
      if(!heatWarned&&model.heat>=75&&!model.jammed){heatWarned=true;beep(520,.1);toast('Оплата ×2. Отпусти предмет, чтобы не перегреть мотор.',6,{key:'hot-warning',title:'Красная зона',priority:2});}
      if(!hotTip&&model.total<12&&model.heat>=45){hotTip=true;toast('Стрелка в жёлтой зоне: оплата ×1,5. Следи за нагревом.',6);}
      if(!binTip&&model.fill/model.capacity>.8&&!model.levels.bagger){binTip=true;toast('Мешок почти полон. Когда заполнится, нажми на стекло корзины.',6);}
      showAwards();
    } else model.lastPressure = 0;
    cloudTime+=dt;if(cloudTime>=20&&!document.hidden){cloudTime=0;if(store.dirty)void store.flush();}
    platform.setGameplay(started&&!paused&&!adBusy&&!platformPaused&&!ui.suspended&&!document.hidden&&!model.ended);
    availabilityTime+=dt;if(availabilityTime>=20&&!adBusy&&!document.hidden){availabilityTime=0;void platform.refreshAvailability();}
    audioTick();uiTime += dt; if (uiTime > .08) { updateUI(); uiTime = 0; }
    saveTime += dt; if (saveTime > 5 && !document.hidden) { persist(); platform.persistHistory();saveTime = 0; }
    updateNotice(dt);
    const plane=$('plane');
    if(model.plane>0&&!model.ended){
      const box=canvas.getBoundingClientRect(),t=1-model.plane/10,direction=Math.floor(model.nextPlane/35)%2?1:-1;
      const pose=ArchiveFeel.planePose(t,box.width,box.height,direction);
      plane.style.left=`${reduced?box.width*.82:pose.x}px`;plane.style.top=`${reduced?box.height*.19:pose.y}px`;
      plane.style.transform=`translate(-50%,-50%) rotate(${reduced?0:pose.angle+pose.bank*.35}deg)`;
      plane.querySelector('svg').style.transform=`scaleX(${direction}) scaleY(${reduced?1:1+Math.sin(t*Math.PI*6)*.055})`;
      plane.dataset.flightProgress=t.toFixed(3);
    }
    render(dt); requestAnimationFrame(frame);
    // Diagnostic attributes stay out of the player's UI. Input metric ends at
    // submitted draw commands, not at physical display presentation.
    if(inputEventAt){canvas.dataset.inputDrawMs=Math.max(0,performance.now()-inputEventAt).toFixed(1);inputEventAt=0;}
    if(started&&!paused&&!adBusy&&!ui.suspended&&!document.hidden&&interval>0&&interval<150){frameIntervals.push(interval);if(frameIntervals.length>120)frameIntervals.shift();metricTime+=dt;if(metricTime>.5){const sample=[...frameIntervals].sort((a,b)=>a-b);canvas.dataset.frameMedianMs=sample[Math.floor(sample.length*.5)].toFixed(1);canvas.dataset.frameP95Ms=sample[Math.floor(sample.length*.95)].toFixed(1);metricTime=0;}}
  }
  if (offline.items) toast(`Пока тебя не было, стажёр списал ${offline.items} предметов: +${offline.cash.toLocaleString('ru-RU')} ₽`, 12);
  persist(); updateUI(); resize();updateNotice(0);
  if (model.ended) endShift();
  else if (model.started) { setPause(true); $('modal-text').textContent = `Смена восстановлена: уничтожено ${model.count} предметов.${offline.items ? ` Стажёр заработал ${offline.cash.toLocaleString('ru-RU')} ₽.` : ''}${model.levels.intern?' Стажёр уже нанят в сохранённой смене; его табель находится под столом.':''} Продолжи, когда будешь готов.`; }
  await art.loaded;
  $('boot-screen').hidden=true;booted=true;document.querySelector('.shell').inert=paused||model.ended;
  if(saveConflict)showSaveConflict();
  void platform.start(art.loaded);
  if(store.dirty)void store.flush();
  requestAnimationFrame(frame);
})().catch(error=>{console.error('Archive startup:',error);const boot=document.getElementById('boot-screen');if(boot){boot.hidden=false;boot.textContent='Архив не открылся. Обнови страницу — сохранение останется на месте.';}});



