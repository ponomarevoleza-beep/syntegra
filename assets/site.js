/* SYNTEGRA — общий скрипт всех страниц.
   Настройки (вебхук Битрикс24, Метрика, мессенджер) задаются в src/content.py
   и подставляются сборщиком в window.SYN на каждой странице. */
(function(){
'use strict';

var CFG = window.SYN || {};
var RM  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var $   = function(s,c){return (c||document).querySelector(s)};
var $$  = function(s,c){return Array.prototype.slice.call((c||document).querySelectorAll(s))};

/* ── мобильное меню ── */
var header = $('#header'), burger = $('#burger'), nav = $('#nav');
function closeNav(){
  if (!nav) return;
  nav.classList.remove('open');
  burger.setAttribute('aria-expanded','false');
  document.body.style.overflow = '';
}
if (burger){
  burger.addEventListener('click', function(){
    var open = nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  });
  $$('#nav a').forEach(function(a){ a.addEventListener('click', closeNav) });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeNav() });
}

/* ── появление блоков и докрутка цифр ── */
function runCounter(el){
  var target = parseInt(el.getAttribute('data-count'), 10);
  var pre = el.getAttribute('data-prefix') || '';
  var suf = el.getAttribute('data-suffix') || '';
  var out = function(v){ el.innerHTML = pre + v + (suf ? '<i class="aff">' + suf + '</i>' : '') };
  if (RM){ out(target); return; }
  var dur = 1700, t0 = performance.now();
  (function step(now){
    var p = Math.min(1, (now - t0) / dur);
    out(Math.round(target * (1 - Math.pow(1 - p, 4))));
    if (p < 1) requestAnimationFrame(step);
  })(performance.now());
}
var io = new IntersectionObserver(function(entries){
  entries.forEach(function(en){
    if (!en.isIntersecting) return;
    en.target.classList.add('in');
    $$('[data-count]', en.target).forEach(runCounter);
    io.unobserve(en.target);
  });
}, {threshold:0.1, rootMargin:'0px 0px -6% 0px'});
$$('.rv').forEach(function(el){ io.observe(el) });

/* ── единый кадровый цикл прокрутки: шапка, шаги процесса, sticky-кнопка ──
   Позиции замеряются один раз; на прокрутку остаётся лёгкая проверка в кадре. */
var steps  = $$('#steps .step');
var stepAt = [];
var sticky = $('#sticky-cta');
var hideNear = $$('[data-hide-sticky]');   // рядом с этими блоками sticky-кнопка прячется
var hideAt = [];
var queued = false, stuck = null;

function measure(){
  var base = window.pageYOffset;
  stepAt = steps.map(function(s){ return s.getBoundingClientRect().top + base });
  hideAt = hideNear.map(function(el){
    var r = el.getBoundingClientRect(); return {top:r.top + base, bottom:r.bottom + base};
  });
}
function frame(){
  queued = false;
  var y = window.pageYOffset, vh = window.innerHeight;

  var nowStuck = y > 24;
  if (nowStuck !== stuck){ stuck = nowStuck; header && header.classList.toggle('stuck', nowStuck) }

  var line = y + vh * 0.72;
  for (var i = 0; i < steps.length; i++){
    var on = stepAt[i] < line;
    if (on !== steps[i]._on){ steps[i]._on = on; steps[i].classList.toggle('on', on) }
  }

  if (sticky){
    var hide = false;
    for (var j = 0; j < hideAt.length; j++){
      if (y + vh > hideAt[j].top + 80 && y < hideAt[j].bottom){ hide = true; break }
    }
    if (hide !== sticky._hide){ sticky._hide = hide; sticky.classList.toggle('hide', hide) }
  }
}
function onScroll(){ if (!queued){ queued = true; requestAnimationFrame(frame) } }
window.addEventListener('scroll', onScroll, {passive:true});
window.addEventListener('resize', function(){ measure(); onScroll() });
window.addEventListener('load',   function(){ measure(); onScroll() });
measure(); onScroll();

/* ── прорисовка контуров линией ── */
function drawPaths(nodes, dur, step, delay){
  nodes.forEach(function(el, i){
    var L = el.getTotalLength ? el.getTotalLength() : 0;
    if (!L) return;
    el.style.strokeDasharray  = L;
    el.style.strokeDashoffset = L;
    if (RM){ el.style.strokeDashoffset = 0; return; }
    el.style.transition = 'stroke-dashoffset ' + dur + 'ms cubic-bezier(.19,1,.22,1) ' + (delay + i * step) + 'ms';
    requestAnimationFrame(function(){ el.style.strokeDashoffset = 0 });
  });
}
drawPaths($$('.logo svg path, .logo svg use'), 1100, 140, 180);
drawPaths($$('.hm-net path'), 900, 90, 400);
drawPaths($$('.hm-hex, .hm-s'), 1700, 260, 700);

/* ── формы ────────────────────────────────────────────────────────
   Три типа: общая заявка, срочная («пришлите артикул»), заявка по направлению.
   Общее: честная валидация, ловушка для ботов, согласие на обработку данных,
   отправка в Битрикс24 через входящий вебхук, цель в Метрике. ── */
function goal(name){
  if (CFG.ym && window.ym){ try { ym(CFG.ym, 'reachGoal', name) } catch(e){} }
}
function markBad(el, bad){
  var f = el.closest('.field, .check'); if (f) f.classList.toggle('bad', bad);
  return !bad;
}
function leadFromForm(form){
  /* Раскладываем поля формы в лид Битрикс24 (crm.lead.add).
     Всё, что не ложится в стандартные поля, уходит в комментарий. */
  var d = {}, extra = [];
  $$('input, select, textarea', form).forEach(function(el){
    if (!el.name || el.type === 'file' || el.type === 'checkbox' || el.classList.contains('hp')) return;
    d[el.name] = el.value.trim();
  });
  var f = form.getAttribute('data-form');
  var title = {general:'Заявка с сайта', urgent:'СРОЧНЫЙ запрос с сайта', direction:'Заявка по направлению'}[f] || 'Заявка с сайта';
  if (d.direction) title += ' — ' + d.direction;
  ['direction','item','maker','deadline','task','comment'].forEach(function(k){
    if (d[k]) extra.push(({direction:'Направление',item:'Позиция',maker:'Производитель',deadline:'Срочность',
                          task:'Что нужно',comment:'Комментарий'})[k] + ': ' + d[k]);
  });
  var fileEl = $('input[type=file]', form);
  if (fileEl && fileEl.files && fileEl.files[0]) extra.push('Файл: ' + fileEl.files[0].name + ' (приложить вручную — вебхук файлы не принимает)');
  var fields = {TITLE:title, SOURCE_ID:'WEB', COMMENTS:extra.join('\n')};
  if (d.name)    fields.NAME = d.name;
  if (d.company) fields.COMPANY_TITLE = d.company;
  if (d.phone)   fields.PHONE = [{VALUE:d.phone, VALUE_TYPE:'WORK'}];
  if (d.email)   fields.EMAIL = [{VALUE:d.email, VALUE_TYPE:'WORK'}];
  if (d.contact) fields.COMMENTS = 'Контакт: ' + d.contact + '\n' + fields.COMMENTS;
  return fields;
}
function bindForm(form){
  var type = form.getAttribute('data-form') || 'general';
  var fileInput = $('input[type=file]', form);
  if (fileInput){
    var nameEl = $('[data-file-name]', form), hintEl = $('[data-file-hint]', form);
    fileInput.addEventListener('change', function(){
      var f = fileInput.files && fileInput.files[0];
      if (nameEl) nameEl.textContent = f ? f.name : nameEl.getAttribute('data-file-name');
      if (hintEl) hintEl.textContent = f ? (f.size/1024/1024).toFixed(2) + ' МБ · нажмите, чтобы заменить' : hintEl.getAttribute('data-file-hint');
    });
  }
  $$('input, textarea, select', form).forEach(function(el){
    el.addEventListener('input', function(){ var f = el.closest('.field, .check'); f && f.classList.remove('bad') });
    el.addEventListener('change', function(){ var f = el.closest('.field, .check'); f && f.classList.remove('bad') });
  });

  form.addEventListener('submit', function(e){
    e.preventDefault();
    var hp = $('.hp input', form);
    if (hp && hp.value){ return; }                      // бот заполнил ловушку — молча игнорируем

    var ok = true;
    $$('[required]', form).forEach(function(el){
      var v = el.value.trim(), bad = false;
      if (el.type === 'checkbox') bad = !el.checked;
      else if (el.type === 'email') bad = !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
      else if (el.type === 'tel')   bad = v.replace(/\D/g,'').length < 6;
      else bad = v.length < 2;
      ok = markBad(el, bad) && ok;
    });
    if (!ok){ var b = $('.bad input, .bad textarea, .bad select', form); b && b.focus(); return; }

    var btn = $('button[type=submit]', form), label = btn ? btn.innerHTML : '';
    var done = function(){
      form.classList.add('done');
      goal('form_' + type);
      var s = $('.sent', form); if (s) s.scrollIntoView({block:'center'});
    };
    var fail = function(){
      if (btn){ btn.disabled = false; btn.innerHTML = label; }
      alert('Не удалось отправить. Напишите, пожалуйста, на ' + (CFG.email || 'info@syntegra.su'));
    };
    if (!CFG.endpoint){ done(); return; }               // обработчик не подключён — показываем «спасибо»
    if (btn){ btn.disabled = true; btn.textContent = 'Отправляем…'; }
    fetch(CFG.endpoint.replace(/\/?$/, '/') + 'crm.lead.add.json', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({fields: leadFromForm(form)})
    }).then(function(r){ return r.ok ? done() : fail() }).catch(fail);
  });
}
$$('form[data-form]').forEach(bindForm);

/* ── Яндекс.Метрика: вставляется только когда задан номер счётчика ── */
if (CFG.ym){
  (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
  m[i].l=1*new Date();k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
  (window,document,'script','https://mc.yandex.ru/metrika/tag.js','ym');
  ym(CFG.ym, 'init', {clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:false});
}

})();
