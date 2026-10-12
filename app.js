/* =========================================================
   Dr. Sofiane Zerrouki Clinic — Interactions
   GSAP + ScrollTrigger + Lenis (progressive enhancement)
   ========================================================= */
(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger) && !reducedMotion;

  if (!hasGSAP) root.classList.add('no-gsap');

  /* ---------- Smooth scroll (Lenis) ---------- */
  let lenis = null;
  if (hasGSAP && window.Lenis) {
    lenis = new Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // "Home" lands on the doctor hero (just below the cinema intro), not on the intro itself
  const scrollToTarget = (target) => {
    const offset = target.id === 'home' ? 0 : -96;
    if (lenis) lenis.scrollTo(target, { offset, duration: target.id === 'home' ? 1.8 : 1.4 });
    else window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + offset, behavior: reducedMotion ? 'auto' : 'smooth' });
  };

  const cinema = $('#cinema-intro');
  const introHeight = () => (cinema ? cinema.offsetHeight : 0);

  /* ---------- Header ---------- */
  const header = $('#siteHeader');
  let lastY = window.scrollY;
  const onScroll = () => {
    const y = window.scrollY;
    const ih = introHeight();
    header.classList.toggle('on-intro', !!cinema && y < ih * 0.7);
    header.classList.toggle('scrolled', y > ih + 20);
    const menuOpen = nav.classList.contains('is-open');
    header.classList.toggle('hide', !menuOpen && y > lastY && y > ih + window.innerHeight * 1.6);
    lastY = y;
  };

  /* ---------- Mobile menu ---------- */
  const menuToggle = $('#menuToggle');
  const nav = $('#mainNav');
  const setMenu = (open) => {
    nav.classList.toggle('is-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
  };
  menuToggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
  document.addEventListener('click', (e) => {
    if (nav.classList.contains('is-open') && !nav.contains(e.target) && !menuToggle.contains(e.target)) setMenu(false);
  });

  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Anchor links ---------- */
  $$('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      const target = id.length > 1 && $(id);
      if (!target) return;
      e.preventDefault();
      setMenu(false);
      scrollToTarget(target);
      history.replaceState(null, '', id);
    });
  });

  /* ---------- Nav: sliding indicator + scroll spy ---------- */
  const indicator = $('.nav-indicator');
  const navLinks = $$('.main-nav a[href^="#"]');
  const moveIndicator = () => {
    const active = $('.main-nav a.active');
    if (!active || !indicator) return;
    indicator.style.left = `${active.offsetLeft}px`;
    indicator.style.width = `${active.offsetWidth}px`;
  };
  const setActive = (id) => {
    navLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${id}`));
    moveIndicator();
  };
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting) setActive(entry.target.id); });
  }, { rootMargin: '-45% 0px -50% 0px' });
  navLinks.map((a) => $(a.getAttribute('href'))).filter(Boolean).forEach((s) => spy.observe(s));
  window.addEventListener('resize', () => { moveIndicator(); if (window.innerWidth > 960) setMenu(false); });
  document.fonts?.ready.then(moveIndicator);
  if (window.ResizeObserver) new ResizeObserver(moveIndicator).observe($('.main-nav ul'));
  moveIndicator();

  /* ---------- "Enters viewport once" helper ----------
     Uses ScrollTrigger when available (stays in sync with Lenis),
     IntersectionObserver otherwise. Callback receives the batch. */
  const onEnterView = (els, cb, start = 'top 88%') => {
    if (!els.length) return;
    if (hasGSAP) {
      gsap.registerPlugin(ScrollTrigger);
      ScrollTrigger.batch(els, { start, once: true, onEnter: cb });
      return;
    }
    const io = new IntersectionObserver((entries) => {
      const batch = entries.filter((e) => e.isIntersecting).map((e) => e.target);
      batch.forEach((el) => io.unobserve(el));
      if (batch.length) cb(batch);
    }, { rootMargin: '0px 0px -12% 0px' });
    els.forEach((el) => io.observe(el));
  };

  /* ---------- Reveal on scroll (staggered per batch) ---------- */
  onEnterView($$('[data-reveal]'), (batch) => batch.forEach((el, i) => {
    el.style.setProperty('--d', `${Math.min(i * 0.09, 0.45)}s`);
    el.classList.add('in');
  }));

  /* ---------- Counters ---------- */
  const formatNumber = (n, el) => el.dataset.format === 'thousands'
    ? Math.round(n).toLocaleString('en-US')
    : n.toFixed(Number(el.dataset.decimals || 0));
  const runCounter = (el) => {
    const target = parseFloat(el.dataset.count);
    if (reducedMotion) { el.textContent = formatNumber(target, el); return; }
    const duration = 2000;
    let start = null;
    const tick = (now) => {
      if (start === null) start = now + 400;
      const p = Math.max(0, Math.min((now - start) / duration, 1));
      el.textContent = formatNumber(target * (1 - Math.pow(1 - p, 4)), el);
      if (p < 1) requestAnimationFrame(tick);
    };
    el.textContent = formatNumber(0, el);
    requestAnimationFrame(tick);
  };
  onEnterView($$('[data-count]'), (batch) => batch.forEach(runCounter), 'top 92%');

  /* ---------- Spotlight on bento cards ---------- */
  $$('.bento-card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  });

  /* ---------- Cinema intro video ---------- */
  if (cinema) {
    const introVideo = $('#introVideo');
    const introPause = $('#introPause');
    let introPaused = false;
    const setIntroPaused = (paused) => {
      introPaused = paused;
      if (paused) introVideo.pause(); else introVideo.play().catch(() => {});
      introPause.classList.toggle('paused', paused);
      introPause.setAttribute('aria-label', paused ? 'تشغيل الفيديو' : 'إيقاف الفيديو مؤقتاً');
    };
    if (reducedMotion) setIntroPaused(true);
    introPause.addEventListener('click', () => setIntroPaused(!introPaused));
    new IntersectionObserver(([entry]) => {
      if (introPaused) return;
      if (entry.isIntersecting) introVideo.play().catch(() => {}); else introVideo.pause();
    }).observe(cinema);
    $('#introScroll').addEventListener('click', () => scrollToTarget($('#home')));
  }

  /* =========================================================
     GSAP SCENES
     ========================================================= */
  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    const doctor = $('.doctor-cut');
    const figure = $('#heroFigure');
    gsap.set(doctor, { xPercent: -50, x: 0 });

    // Cinema intro: text reveal on load
    if (cinema) {
      gsap.timeline({ defaults: { ease: 'expo.out' } })
        .from('.ci-media', { scale: 1.15, duration: 2.4 }, 0)
        .to('.ci-title .ln > span', { y: 0, duration: 1.4, stagger: 0.14 }, 0.3)
        .fromTo('[data-ci]', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 1.2, stagger: 0.12 }, 0.5);
    }

    // Doctor hero entrance — held until the intro starts to lift (or plays at once without intro)
    const intro = gsap.timeline({ defaults: { ease: 'expo.out' }, paused: !!cinema });
    intro
      .from('.hero-bg', { scale: 0.94, opacity: 0, duration: 1.4 }, 0)
      .to('.hero-title .ln > span', { y: 0, duration: 1.3, stagger: 0.12 }, 0.25)
      .fromTo('[data-hero="fade"]', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 1.1, stagger: 0.1 }, 0.45)
      .fromTo(doctor, { opacity: 0, y: 90, filter: 'blur(14px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.6 }, 0.35)
      .from('.rings i', { scale: 0.6, opacity: 0, duration: 1.6, stagger: 0.12 }, 0.5)
      .fromTo('.metric', { opacity: 0, scale: 0.85, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 1, stagger: 0.14, ease: 'back.out(1.7)' }, 0.9);

    // Orbs fly out from the doctor's chest
    const fromCenterX = (i, el) => figure.offsetWidth / 2 - (el.offsetLeft + el.offsetWidth / 2);
    const fromCenterY = (i, el) => figure.offsetHeight * 0.45 - (el.offsetTop + el.offsetHeight / 2);

    // Cinema intro: pin, then fade + slide up to unveil the hero underneath.
    // pinSpacing:false lets the hero scroll in *under* the intro, so when the intro is gone
    // the hero is exactly at the top — where its own pinned scene begins.
    if (cinema) {
      gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: cinema, start: 'top top', end: '+=100%', scrub: true,
          pin: true, pinSpacing: false, invalidateOnRefresh: true,
          onUpdate: (self) => { if (self.progress > 0.3 && !intro.isActive() && intro.progress() === 0) intro.play(); },
          onLeave: () => intro.progress() === 0 && intro.play(),
        },
      })
        .to('.ci-content', { yPercent: -35, opacity: 0, duration: 0.5 }, 0)
        .to('.ci-scroll, .ci-pause', { opacity: 0, duration: 0.2 }, 0)
        .to('.ci-media', { scale: 1.15, duration: 1 }, 0)
        // Curtain lift: the slide's bottom edge rises (rounded) and reveals the hero beneath
        .fromTo(cinema,
          { clipPath: 'inset(0% 0% 0% 0% round 0px 0px 0px 0px)' },
          { clipPath: 'inset(0% 0% 100% 0% round 0px 0px 48px 48px)', yPercent: -8, duration: 0.7 }, 0.3)
        .set(cinema, { autoAlpha: 0 }, 1);
      if (window.scrollY > introHeight() * 0.3) intro.play(); // page reloaded mid-scroll
    }

    const mm = gsap.matchMedia();

    mm.add('(min-width: 961px)', () => {
      const tl = gsap.timeline({
        scrollTrigger: { trigger: '.hero', start: 'top top', end: '+=120%', scrub: 1, pin: true, anticipatePin: 1, invalidateOnRefresh: true },
      });
      tl.fromTo('.metric', { opacity: 1, y: 0, scale: 1 }, { opacity: 0, y: -30, scale: 0.9, stagger: 0.04, duration: 0.35, immediateRender: false }, 0)
        .to('.hero-video', { scale: 1.25, duration: 1 }, 0)
        .to(doctor, { scale: 1.05, transformOrigin: '50% 100%', duration: 1 }, 0)
        .to('.rings i', { scale: 1.18, stagger: 0.05, duration: 0.8 }, 0)
        .fromTo('.orbit-path', { opacity: 0, rotation: -90, scale: 0.7 }, { opacity: 1, rotation: 0, scale: 1, duration: 0.7 }, 0.15)
        .fromTo('.orb',
          { opacity: 0, scale: 0.2, x: fromCenterX, y: fromCenterY },
          { opacity: 1, scale: 1, x: 0, y: 0, stagger: 0.07, duration: 0.6, ease: 'back.out(1.5)' }, 0.2)
        .to('.hero-content', { y: -24, duration: 1 }, 0)
        .to('.scroll-cue', { opacity: 0, duration: 0.2 }, 0);
      return () => gsap.set('.orb, .orbit-path', { clearProps: 'all' });
    });

    mm.add('(max-width: 960px)', () => {
      gsap.fromTo('.orb',
        { opacity: 0, scale: 0.2, x: fromCenterX, y: fromCenterY },
        { opacity: 1, scale: 1, x: 0, y: 0, stagger: 0.08, ease: 'back.out(1.6)',
          scrollTrigger: { trigger: figure, start: 'top 75%', end: 'center 45%', scrub: 1, invalidateOnRefresh: true } });
      gsap.set('.orbit-path', { opacity: 0.6 });
    });

    // Parallax floating elements
    $$('[data-parallax]').forEach((el) => {
      gsap.to(el, {
        y: Number(el.dataset.parallax), ease: 'none',
        scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    // Image depth parallax
    [['.b-media img', '.b-feature'], ['.endo-panel img', '.endo-panel'], ['.portrait img', '.portrait']].forEach(([img, trig]) => {
      const el = $(img);
      if (!el) return;
      gsap.fromTo(el, { yPercent: -6, scale: 1.14 }, {
        yPercent: 6, scale: 1.14, ease: 'none',
        scrollTrigger: { trigger: trig, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    // ECG line draws as you scroll
    gsap.to('#statsEcg', {
      strokeDashoffset: 0, ease: 'none',
      scrollTrigger: { trigger: '.stats-card', start: 'top 85%', end: 'bottom 30%', scrub: 1 },
    });

    // Steps progress track
    gsap.to('#trackFill', {
      width: '100%', ease: 'none',
      scrollTrigger: { trigger: '.steps-grid', start: 'top 85%', end: 'top 30%', scrub: 1 },
    });

    // Phones rise into the card
    gsap.from('.step .phone', {
      y: 120, ease: 'none', stagger: 0.1,
      scrollTrigger: { trigger: '.steps-grid', start: 'top bottom', end: 'bottom 70%', scrub: 1 },
    });

    window.addEventListener('load', () => ScrollTrigger.refresh());
  }

  /* ---------- Open / closed status (Algiers time) ---------- */
  const openStatus = $('#openStatus');
  const updateOpenStatus = () => {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Algiers', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date());
    const get = (t) => parts.find((p) => p.type === t)?.value;
    const minutes = Number(get('hour')) * 60 + Number(get('minute'));
    const schedule = { Sat: [510, 1020], Sun: [510, 1020], Mon: [510, 1020], Tue: [510, 1020], Wed: [510, 1020], Thu: [510, 780] };
    const slot = schedule[get('weekday')];
    const isOpen = !!slot && minutes >= slot[0] && minutes < slot[1];
    openStatus.textContent = isOpen ? 'العيادة مفتوحة الآن' : 'العيادة مغلقة حالياً';
    openStatus.className = `open-status ${isOpen ? 'is-open' : 'is-closed'}`;
  };
  if (openStatus) { updateOpenStatus(); setInterval(updateOpenStatus, 60_000); }

  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  /* =========================================================
     BOOKING MODAL
     ========================================================= */
  const modal = $('#bookingModal');
  const panel = $('.modal-panel', modal);
  const form = $('#bookingForm');
  const steps = $$('.form-step', form);
  const stepperItems = $$('#stepper li');
  const progressBar = $('#progressBar');
  const prevBtn = $('#prevStep');
  const nextBtn = $('#nextStep');
  const actions = $('#modalActions');
  const success = $('#formSuccess');
  const summary = $('#bookingSummary');
  const modalHead = $('.modal-head', modal);
  const TOTAL = steps.length;
  let current = 1;
  let lastFocused = null;

  const REASONS = { consult: 'استشارة عامة', gastroscopy: 'تنظير معدة', colonoscopy: 'تنظير قولون', followup: 'متابعة دورية' };
  const SHIFTS = { morning: 'فترة صباحية', evening: 'فترة مسائية' };
  const ICON_NEXT = '<svg class="ico"><use href="#i-arrow"/></svg>';
  const ICON_DONE = '<svg class="ico"><use href="#i-check"/></svg>';

  const dateInput = $('#date');
  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const maxDate = new Date(); maxDate.setMonth(maxDate.getMonth() + 3);
  dateInput.min = toISO(tomorrow);
  dateInput.max = toISO(maxDate);

  const showStep = (n) => {
    current = n;
    steps.forEach((s) => s.classList.toggle('is-active', Number(s.dataset.step) === n));
    stepperItems.forEach((li, i) => {
      li.classList.toggle('is-active', i + 1 === n);
      li.classList.toggle('is-done', i + 1 < n);
    });
    progressBar.style.width = `${(n / TOTAL) * 100}%`;
    prevBtn.hidden = n === 1;
    nextBtn.innerHTML = n === TOTAL ? `تأكيد الحجز ${ICON_DONE}` : `التالي ${ICON_NEXT}`;
    if (n === TOTAL) renderSummary();
    const first = $('input:not([type="radio"]), textarea, input[type="radio"]', steps[n - 1]);
    if (first && modal.classList.contains('is-open')) setTimeout(() => first.focus({ preventScroll: true }), 60);
  };

  const resetForm = () => {
    form.reset();
    $$('.has-error', form).forEach((f) => f.classList.remove('has-error'));
    $$('.error', form).forEach((e) => { e.textContent = ''; });
    success.hidden = true;
    actions.hidden = false;
    modalHead.hidden = false;
    nextBtn.classList.remove('is-loading');
    $('#notesCount').textContent = '0';
    formAlert.hidden = true;
    clearAvatar();
    stopCamera();
    showStep(1);
  };

  const openModal = (reason) => {
    lastFocused = document.activeElement;
    setMenu(false);
    resetForm();
    if (reason && REASONS[reason]) {
      const radio = $(`input[name="reason"][value="${reason}"]`, form);
      if (radio) radio.checked = true;
    }
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    lenis?.stop();
    setTimeout(() => $('#fullName').focus({ preventScroll: true }), 80);
  };

  const closeModal = () => {
    stopCamera();
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    lenis?.start();
    if (lastFocused) lastFocused.focus({ preventScroll: true });
  };

  $$('[data-open-booking]').forEach((btn) =>
    btn.addEventListener('click', (e) => { e.preventDefault(); openModal(btn.dataset.reason); }));
  $$('[data-close-booking]', modal).forEach((el) => el.addEventListener('click', closeModal));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modal.classList.contains('is-open')) closeModal();
      else if (nav.classList.contains('is-open')) { setMenu(false); menuToggle.focus(); }
    }
    if (e.key === 'Tab' && modal.classList.contains('is-open')) {
      const focusables = $$('button, input, textarea, [href]', panel)
        .filter((el) => el.offsetParent !== null && !el.disabled);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- Validation ---------- */
  const normalizePhone = (v) => v.replace(/[\s.\-()]/g, '').replace(/^(\+|00)213/, '0');
  const PHONE_RE = /^0[567]\d{8}$/;
  const dayOf = (v) => new Date(`${v}T12:00:00`).getDay();

  const setError = (el, msg) => {
    const wrap = el.closest('.field') || el.closest('.form-step');
    const err = $('.error', wrap);
    wrap.classList.toggle('has-error', !!msg);
    if (err) err.textContent = msg || '';
    return !msg;
  };

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const validators = {
    1: () => {
      const name = $('#fullName');
      const email = $('#email');
      const phone = $('#phone');
      const age = $('#age');
      const nameVal = name.value.trim().replace(/\s+/g, ' ');
      const ageVal = Number(age.value);
      return [
        setError(name, !nameVal ? 'يرجى إدخال الاسم الكامل' : (nameVal.split(' ').length < 2 || nameVal.length < 5) ? 'يرجى إدخال الاسم واللقب' : ''),
        setError(email, !email.value.trim() ? 'يرجى إدخال البريد الإلكتروني' : !EMAIL_RE.test(email.value.trim()) ? 'بريد إلكتروني غير صالح' : ''),
        setError(phone, !phone.value.trim() ? 'يرجى إدخال رقم الهاتف' : !PHONE_RE.test(normalizePhone(phone.value)) ? 'رقم غير صالح — 10 أرقام تبدأ بـ 05 أو 06 أو 07' : ''),
        setError(age, !age.value ? 'مطلوب' : (!Number.isInteger(ageVal) || ageVal < 1 || ageVal > 110) ? 'سن غير صالح' : ''),
      ].every(Boolean);
    },
    2: () => setError($('input[name="reason"]', form), $('input[name="reason"]:checked', form) ? '' : 'يرجى اختيار سبب الزيارة'),
    3: () => {
      const v = dateInput.value;
      let msg = '';
      if (!v) msg = 'يرجى اختيار التاريخ';
      else if (v < dateInput.min) msg = 'يرجى اختيار تاريخ ابتداءً من الغد';
      else if (v > dateInput.max) msg = 'الحجز متاح لمدة ثلاثة أشهر قادمة فقط';
      else if (dayOf(v) === 5) msg = 'العيادة مغلقة يوم الجمعة، يرجى اختيار يوم آخر';
      const okDate = setError(dateInput, msg);

      const shift = $('input[name="shift"]:checked', form);
      let shiftMsg = shift ? '' : 'يرجى اختيار الفترة';
      if (shift && v && shift.value === 'evening' && dayOf(v) === 4) shiftMsg = 'يوم الخميس: الفترة الصباحية فقط';
      const okShift = setError($('input[name="shift"]', form), shiftMsg);
      return okDate && okShift;
    },
    4: () => true,
  };

  // Live phone formatting: 05XX XX XX XX
  const phoneInput = $('#phone');
  phoneInput.addEventListener('input', () => {
    if (phoneInput.value.trim().startsWith('+')) return;
    const d = phoneInput.value.replace(/\D/g, '').slice(0, 10);
    phoneInput.value = [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8), d.slice(8, 10)].filter(Boolean).join(' ');
  });

  const clearError = (target) => {
    const wrap = target.closest('.has-error');
    if (!wrap) return;
    wrap.classList.remove('has-error');
    const err = $('.error', wrap);
    if (err) err.textContent = '';
  };
  form.addEventListener('input', (e) => clearError(e.target));
  form.addEventListener('change', (e) => clearError(e.target));

  const notes = $('#notes');
  notes.addEventListener('input', () => { $('#notesCount').textContent = notes.value.length; });

  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); nextBtn.click(); }
  });

  const escapeHTML = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const formatDate = (v) => new Intl.DateTimeFormat('ar-DZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${v}T12:00:00`));

  const renderSummary = () => {
    const data = new FormData(form);
    const rows = [
      ['المريض', data.get('fullName')?.trim()],
      ['البريد', data.get('email')?.trim()],
      ['الهاتف', normalizePhone(data.get('phone') || '')],
      ['سبب الزيارة', REASONS[data.get('reason')]],
      ['التاريخ', data.get('date') ? formatDate(data.get('date')) : ''],
      ['الفترة', SHIFTS[data.get('shift')]],
    ];
    summary.innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${escapeHTML(v || '—')}</b></div>`).join('');
  };

  prevBtn.addEventListener('click', () => { if (current > 1) showStep(current - 1); });
  nextBtn.addEventListener('click', () => {
    if (!validators[current]()) {
      const firstErr = $('.has-error input', steps[current - 1]);
      if (firstErr) firstErr.focus();
      return;
    }
    if (current < TOTAL) showStep(current + 1);
    else submitBooking();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); nextBtn.click(); });

  /* =========================================================
     PATIENT PHOTO — upload or selfie, compressed to a small JPEG data-URL
     ========================================================= */
  const AVATAR_SIZE = 320;            // px, square
  const AVATAR_MAX_BYTES = 140_000;   // keep well under the DB policy limit
  const avatarImg = $('#avatarImg');
  const avatarPreview = $('#avatarPreview');
  const avatarRemove = $('#avatarRemove');
  const avatarFile = $('#avatarFile');
  const avatarError = $('#avatarError');
  const cameraBox = $('#cameraBox');
  const cameraVideo = $('#cameraVideo');
  const formAlert = $('#formAlert');
  let avatarDataUrl = null;
  let cameraStream = null;

  const setAvatar = (url) => {
    avatarDataUrl = url;
    avatarImg.src = url;
    avatarImg.hidden = false;
    avatarRemove.hidden = false;
    avatarPreview.classList.add('has-img');
    avatarError.textContent = '';
  };
  function clearAvatar() {
    avatarDataUrl = null;
    avatarImg.removeAttribute('src');
    avatarImg.hidden = true;
    avatarRemove.hidden = true;
    avatarPreview.classList.remove('has-img');
    avatarFile.value = '';
    avatarError.textContent = '';
  }

  // Center-crop any drawable source to a square JPEG, stepping quality down until small enough
  const toCompressedDataUrl = (source, sw, sh, mirror = false) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    const side = Math.min(sw, sh);
    if (mirror) { ctx.translate(AVATAR_SIZE, 0); ctx.scale(-1, 1); }
    ctx.drawImage(source, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    let q = 0.85;
    let url = canvas.toDataURL('image/jpeg', q);
    while (url.length > AVATAR_MAX_BYTES && q > 0.4) { q -= 0.1; url = canvas.toDataURL('image/jpeg', q); }
    return url;
  };

  const loadImage = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });

  avatarFile.addEventListener('change', async () => {
    const file = avatarFile.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { avatarError.textContent = 'يرجى اختيار ملف صورة.'; return; }
    if (file.size > 15 * 1024 * 1024) { avatarError.textContent = 'حجم الصورة كبير جداً (الحد 15 ميغابايت).'; return; }
    try {
      const img = await loadImage(file);
      setAvatar(toCompressedDataUrl(img, img.naturalWidth, img.naturalHeight));
    } catch {
      avatarError.textContent = 'تعذّر قراءة الصورة، جرّب صورة أخرى.';
    }
  });
  avatarRemove.addEventListener('click', clearAvatar);

  function stopCamera() {
    cameraStream?.getTracks().forEach((t) => t.stop());
    cameraStream = null;
    cameraVideo.srcObject = null;
    cameraBox.hidden = true;
  }

  $('#avatarCamera').addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      // Fallback: mobile browsers open the front camera from a file input
      avatarFile.setAttribute('capture', 'user');
      avatarFile.click();
      avatarFile.removeAttribute('capture');
      return;
    }
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false });
      cameraVideo.srcObject = cameraStream;
      cameraBox.hidden = false;
      await cameraVideo.play();
    } catch {
      stopCamera();
      avatarError.textContent = 'تعذّر الوصول إلى الكاميرا. يمكنك رفع صورة بدلاً من ذلك.';
    }
  });
  $('#cameraCancel').addEventListener('click', stopCamera);
  $('#cameraShot').addEventListener('click', () => {
    if (!cameraVideo.videoWidth) return;
    setAvatar(toCompressedDataUrl(cameraVideo, cameraVideo.videoWidth, cameraVideo.videoHeight, true));
    stopCamera();
  });

  /* =========================================================
     TRIAGE (FastAPI) — optional; booking never depends on it
     ========================================================= */
  const getTriage = async (data) => {
    if (APP_MODE === 'demo') return null;
    if (typeof TRIAGE_API_URL === 'undefined' || !TRIAGE_API_URL) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    try {
      const res = await fetch(`${TRIAGE_API_URL}/api/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms: data.symptoms || '', visit_reason: data.reason, age: Number(data.age) || null }),
        signal: ctrl.signal,
      });
      return res.ok ? await res.json() : null;
    } catch {
      return null; // service offline → default to routine
    } finally {
      clearTimeout(timer);
    }
  };

  /* =========================================================
     SUBMIT → Supabase
     ========================================================= */
  const makeReference = () => `DZ-GASTRO-${Math.floor(1000 + Math.random() * 9000)}`;

  const insertAppointment = async (row) => {
    if (APP_MODE === 'demo') {
      // Portfolio interactions stay in memory; visitor data is never sent to a DB.
      return { ...row, id: `demo-${Date.now()}`, created_at: new Date().toISOString() };
    }
    // Insert only (no read-back): visitors are not allowed to SELECT under RLS.
    for (let attempt = 0; attempt < 4; attempt++) {
      const { error } = await supabaseClient.from('appointments').insert(row);
      if (!error) return row;
      if (error.code === '23505') { row.reference_code = makeReference(); continue; } // duplicate code → retry
      throw error;
    }
    throw new Error('reference_code_exhausted');
  };

  const showFormAlert = (msg) => { formAlert.textContent = msg; formAlert.hidden = false; };
  const restoreNext = () => { nextBtn.classList.remove('is-loading'); nextBtn.innerHTML = `تأكيد الحجز ${ICON_DONE}`; };

  const submitBooking = async () => {
    if (APP_MODE !== 'demo' && !supabaseClient) {
      showFormAlert('تعذّر الاتصال بنظام الحجز. تحقق من اتصالك بالإنترنت أو اتصل بالعيادة مباشرة.');
      return;
    }
    const data = Object.fromEntries(new FormData(form));
    data.phone = normalizePhone(data.phone);
    data.avatarUrl = avatarDataUrl;
    formAlert.hidden = true;
    nextBtn.classList.add('is-loading');
    nextBtn.textContent = 'جارٍ الإرسال…';

    const triage = await getTriage(data);
    const row = {
      full_name: data.fullName.trim().replace(/\s+/g, ' '),
      email: data.email.trim().toLowerCase(),
      phone: data.phone,
      age: parseInt(data.age, 10),
      avatar_url: data.avatarUrl || null,
      visit_reason: data.reason,
      appointment_date: data.date,
      shift: data.shift,
      symptoms: (data.symptoms || '').trim() || null,
      // Fail closed: an unavailable triage API must never downgrade a patient
      // to routine. The clinic can review these priority bookings manually.
      urgency: APP_MODE === 'demo' ? 'routine' : triage?.urgency || 'priority',
      status: 'pending',
      reference_code: makeReference(),
    };

    try {
      const saved = await insertAppointment(row);
      renderPass(saved, triage);
      steps.forEach((s) => s.classList.remove('is-active'));
      actions.hidden = true;
      modalHead.hidden = true;
      success.hidden = false;
      $('#copyCode').focus({ preventScroll: true });
    } catch (err) {
      console.error('Booking failed:', err);
      restoreNext();
      showFormAlert('عذراً، لم يتم تسجيل الحجز. يرجى المحاولة مرة أخرى أو الاتصال بالعيادة على 0550 00 00 00.');
    }
  };

  /* ---------- Digital appointment pass ---------- */
  const initials = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('');

  const renderPass = (row, triage) => {
    $('.success-msg').textContent = APP_MODE === 'demo'
      ? 'معاينة تجريبية: لم يُرسل طلب موعد، ولم تُحفظ البيانات. أعد تحميل الصفحة لمسح هذه البطاقة.'
      : 'سيتصل بك فريق العيادة خلال 24 ساعة لتأكيد الموعد. احتفظ بالرمز المرجعي.';
    const av = $('#passAvatar');
    av.replaceChildren();
    if (row.avatar_url) {
      const img = new Image();
      img.src = row.avatar_url;
      img.alt = '';
      av.append(img);
    } else {
      av.textContent = initials(row.full_name);
    }
    $('#copyCode').lastChild.textContent = ' نسخ الرمز';
    $('#passName').textContent = row.full_name;
    $('#passReason').textContent = REASONS[row.visit_reason];
    $('#passDate').textContent = formatDate(row.appointment_date);
    $('#passShift').textContent = SHIFTS[row.shift];
    $('#passCode').textContent = row.reference_code;
    $('#passQr').innerHTML = '<svg><use href="#i-logo"/></svg>';
    $('#appointmentPass').dataset.urgency = row.urgency;

    const note = $('#triageNote');
    const prep = $('#prepGuide');
    if (triage) {
      note.hidden = triage.urgency === 'routine';
      note.dataset.level = triage.urgency;
      note.textContent = triage.message;
      prep.hidden = false;
      $('summary', prep).textContent = triage.preparation.title;
      const fasting = $('.prep-fasting', prep);
      fasting.textContent = triage.preparation.fasting || '';
      fasting.hidden = !triage.preparation.fasting;
      $('ol', prep).replaceChildren(...triage.preparation.steps.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
      prep.open = row.visit_reason === 'gastroscopy' || row.visit_reason === 'colonoscopy';
    } else {
      note.hidden = false;
      note.dataset.level = 'priority';
      note.textContent = APP_MODE === 'demo'
        ? 'هذه معاينة تجريبية فقط. لم يُرسل طلب أو تُحفظ بياناتك.'
        : 'تعذّر إكمال الفرز الآلي. أُحيل طلبك إلى المراجعة اليدوية من فريق العيادة. إذا كانت لديك أعراض شديدة أو نزيف، اتصل بالعيادة أو توجّه إلى الاستعجالات فوراً.';
      prep.hidden = true;
    }
  };

  $('#copyCode').addEventListener('click', async (e) => {
    const code = $('#passCode').textContent;
    try {
      await navigator.clipboard.writeText(code);
      e.currentTarget.lastChild.textContent = ' تم النسخ ✓';
    } catch { /* clipboard blocked: code stays visible */ }
  });
})();
