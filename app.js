/* crumbz: turns a pile of saved spots into a plan for the day */
(() => {
  "use strict";

  const SPOTS = window.SPOTS || [];
  const HOME_CITY = "San Mateo"; // distances in the data are miles from 94403
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const EMOJI = {
    coffee: "☕", bakery: "🥐", sweets: "🍨", "boba & tea": "🧋", noodles: "🍜", japanese: "🍣",
    korean: "🥘", chinese: "🥟", thai: "🍛", vietnamese: "🍲", indian: "🫓", mexican: "🌮",
    "pizza & italian": "🍕", "burgers & sandwiches": "🍔", seafood: "🦐", hawaiian: "🌺",
    mediterranean: "🧆", bbq: "🍖", brunch: "🥞", drinks: "🍶", veggie: "🥗",
  };
  const emojiFor = (s) => (s.t.length ? EMOJI[s.t[0]] : s.c === "c" ? "☕" : "🍽️");
  const has = (s, ...tags) => s.t.some((t) => tags.includes(t));
  const onlyDrinks = (s) => s.t.length === 1 && s.t[0] === "drinks";

  /* the parts of a food day, in the order they happen */
  const SLOTS = {
    morning: { e: "☕", label: "morning coffee", time: "morning", sub: "coffee, pastries, brunch",
      test: (s) => has(s, "coffee", "bakery", "brunch") || (s.c === "c" && !has(s, "sweets", "boba & tea")) },
    lunch: { e: "🥪", label: "lunch", time: "midday", sub: "a sit-down or a quick bite",
      test: (s) => s.c === "r" && !onlyDrinks(s) && !has(s, "sweets", "coffee") },
    treat: { e: "🍡", label: "a sweet treat", time: "afternoon", sub: "dessert, boba, a little something",
      test: (s) => has(s, "sweets", "boba & tea") || (s.c === "c" && has(s, "bakery")) },
    dinner: { e: "🍜", label: "dinner", time: "evening", sub: "the main event",
      test: (s) => s.c === "r" && !onlyDrinks(s) && !has(s, "sweets", "coffee", "bakery", "brunch") },
    drinks: { e: "🍶", label: "drinks", time: "late", sub: "bars, wine, catching up",
      test: (s) => has(s, "drinks") },
  };
  const SLOT_ORDER = Object.keys(SLOTS);
  const CRAVING_SLOTS = ["lunch", "dinner"];

  /* ───────── storage (per browser) ───────── */
  const KEY = "crumbz.v1";
  let store = { visits: {}, saved: {}, days: [] };
  try { store = Object.assign(store, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (_) {}
  if (!Array.isArray(store.days)) store.days = [];
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (_) {} };
  const visited = (id) => !!store.visits[id];
  const isSaved = (id) => !!store.saved[id];

  /* ───────── helpers ───────── */
  const shuffle = (arr, seed) => {
    const a = arr.slice();
    let r = seed ?? 0;
    const rand = seed == null ? Math.random : () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const yelpUrl = (s) => `https://www.yelp.com/search?find_desc=${encodeURIComponent(s.n)}&find_loc=${encodeURIComponent(s.a || s.city)}`;
  const mapsUrl = (s) => s.m || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.n + " " + s.a)}`;
  const miles = (s) => (s.mi == null ? "" : s.mi < 0.2 ? "right around the corner" : `${s.mi} mi from home`);
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const prettyDate = (d) => new Date(d + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const listJoin = (arr) => (arr.length <= 2 ? arr.join(" & ") : `${arr.slice(0, -1).join(", ")} & ${arr[arr.length - 1]}`);

  /* let the beach buddies (buddies.js) know what's happening */
  const emit = (type, detail = {}) => dispatchEvent(new CustomEvent("crumbz", { detail: { type, ...detail } }));
  let firstView = true;
  let lastView = "";

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("is-on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("is-on"), 2200);
  }

  /* ───────── routing ─────────
     every screen has its own address (#/, #/plan/2, #/day, #/passport/days)
     so the browser's back / forward buttons and refresh all work. */
  let navCount = 0;          // how many in-app steps are behind us in history
  let dayReady = false;      // results exist for the current answers

  function show(view) {
    $$(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${view}`));
    window.scrollTo({ top: 0 });
  }
  function navigate(hash, { replace = false } = {}) {
    if (location.hash === hash) return route();
    if (replace) location.replace(hash);
    else { navCount++; location.hash = hash; }
  }
  function goBack(fallback) {
    if (navCount > 0) history.back();
    else navigate(fallback, { replace: true });
  }
  function go(view) {
    if (view === "home") navigate("#/");
    if (view === "quiz") { startQuiz(); navigate("#/plan/0"); }
    if (view === "passport") navigate(`#/passport/${tab}`);
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-go]");
    if (t) go(t.dataset.go);
  });

  /* remember the quiz + day for this tab, so a refresh doesn't lose them */
  const SESSION = "crumbz.session";
  function saveSession() {
    try { sessionStorage.setItem(SESSION, JSON.stringify({ answers, picks, extraCities, dayReady })); } catch (_) {}
  }
  function loadSession() {
    try {
      const d = JSON.parse(sessionStorage.getItem(SESSION));
      if (d && d.answers) { answers = d.answers; picks = d.picks || {}; extraCities = d.extraCities || []; return d; }
    } catch (_) {}
    return null;
  }

  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const [view, arg] = parts;
    if (view === "plan") {
      if (!answers.plan) { const d = loadSession(); if (!d) startQuiz(); }
      const list = steps();
      const n = Math.max(0, Math.min(Number(arg) || 0, list.length - 1));
      // can't skip ahead past an unanswered single-choice question
      let ok = 0;
      while (ok < n && (MULTI[list[ok]] ? true : list[ok] in answers)) ok++;
      step = Math.min(n, ok);
      if (String(step) !== arg) return navigate(`#/plan/${step}`, { replace: true });
      show("quiz");
      renderStep();
      emit("view", { view: "quiz", step });
    } else if (view === "day") {
      if (!dayReady) {
        const d = loadSession();
        if (d && d.dayReady) { buildDay({ keep: d.picks || {} }); dayReady = true; }
        else return navigate("#/", { replace: true });
      }
      show("results");
    } else if (view === "passport") {
      tab = ["stamps", "days", "saved"].includes(arg) ? arg : "stamps";
      $$(".tab").forEach((x) => { x.classList.toggle("is-active", x.dataset.tab === tab); x.setAttribute("aria-selected", x.dataset.tab === tab); });
      show("passport");
      renderPassport();
      if (lastView !== "passport") emit("view", { view: "passport", stamps: Object.keys(store.visits).length });
    } else {
      show("home");
      renderHome();
      $("#surpriseChoices").hidden = true;
      $("#surpriseBtn").setAttribute("aria-expanded", "false");
      emit("view", { view: "home", first: firstView });
    }
    firstView = false;
    lastView = view || "home";
  }
  window.addEventListener("hashchange", route);

  /* ───────── landing ───────── */
  const cityCounts = SPOTS.reduce((m, s) => ((m[s.city] = (m[s.city] || 0) + 1), m), {});
  const topCities = Object.entries(cityCounts).filter(([c]) => c).sort((a, b) => b[1] - a[1]);

  function renderHome() {

    renderSpecial();

    $("#cityStrip").innerHTML = topCities.slice(0, 14)
      .map(([c]) => `<button class="city-chip" data-city="${esc(c)}">${esc(c)}</button>`).join("");
  }

  /* today's special: every day of the week has a theme, and the special is a
     want-to-go spot near home that fits it. same pick all day; "another one" cycles. */
  const THEMES = [
    { name: "sweet sunday", tags: ["sweets", "boba & tea"], why: "sundays are for something sweet" },
    { name: "monday coffee run", tags: ["coffee", "bakery"], why: "easing into the week with a good coffee" },
    { name: "taco tuesday", tags: ["mexican"], why: "it's tuesday, so: tacos" },
    { name: "noodle wednesday", tags: ["noodles"], why: "midweek calls for a big bowl of noodles" },
    { name: "takeout thursday", tags: ["chinese", "korean", "thai"], why: "thursday's for chinese, korean or thai, your pick" },
    { name: "friday night bite", tags: ["pizza & italian", "burgers & sandwiches", "drinks", "bbq"], why: "it's friday night, keep it fun" },
    { name: "saturday brunch", tags: ["brunch", "bakery"], why: "slow saturday, brunch o'clock" },
  ];
  let specialTurn = 0;
  function renderSpecial() {
    const theme = THEMES[new Date().getDay()];
    const near = SPOTS.filter((s) => s.s === "want" && s.mi != null && s.mi <= 15 && !visited(s.id));
    const themed = near.filter((s) => has(s, ...theme.tags));
    const pool = themed.length ? themed : near;
    const list = shuffle(pool, Number(today().replace(/-/g, "")));
    const pick = list.length ? list[specialTurn % list.length] : null;
    $("#specialTitle").textContent = themed.length ? `today's special: ${theme.name}` : "today's special";
    $("#specialBody").innerHTML = pick
      ? `<h3 class="special__name">${esc(emojiFor(pick))} ${esc(pick.n)}</h3>
         <p class="special__meta">${themed.length ? esc(theme.why) + ". " : ""}it's in ${esc(pick.city)}, ${esc(pick.mi)} mi from home, and it's been waiting on your want-to-go list.</p>
         <div class="special__row">
           <a class="link-chip" href="${esc(mapsUrl(pick))}" target="_blank" rel="noopener">📍 directions</a>
           <a class="link-chip" href="${esc(yelpUrl(pick))}" target="_blank" rel="noopener">⭐ yelp</a>
           <button class="btn btn--soft btn--sm" data-visit="${pick.id}">i went!</button>
           ${list.length > 1 ? `<button class="link-btn special__next" id="specialNext">another one</button>` : ""}
         </div>`
      : `<p>every spot near home is stamped. time for a road trip.</p>`;
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#specialNext")) return;
    specialTurn++;
    renderSpecial();
  });

  $("#cityStrip").addEventListener("click", (e) => {
    const b = e.target.closest("[data-city]");
    if (!b) return;
    answers = { plan: ["morning", "lunch", "treat", "dinner", "drinks"], where: [b.dataset.city], dist: 40, fresh: "either", tags: [] };
    showResults();
  });

  $("#surpriseBtn").addEventListener("click", () => {
    const box = $("#surpriseChoices");
    box.hidden = !box.hidden;
    $("#surpriseBtn").setAttribute("aria-expanded", !box.hidden);
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-surprise]");
    if (b) surprise(b.dataset.surprise);
  });

  const AUTO_PLAN = ["morning", "lunch", "treat", "dinner"];
  function surprise(mode) {
    $("#surpriseChoices").hidden = true;
    $("#surpriseBtn").setAttribute("aria-expanded", "false");
    const base = { plan: AUTO_PLAN.slice(), dist: 10, fresh: "new", tags: [], auto: mode };
    if (mode === "city") {
      // a nearby city that has enough of your saves to cover the whole day
      const nearby = [...new Set(SPOTS.filter((s) => s.mi != null && s.mi <= 15).map((s) => s.city))].filter(Boolean);
      for (const fresh of ["new", "either"]) {
        const ok = nearby.filter((c) => AUTO_PLAN.every((slot) => slotMatches(slot, { ...base, where: [c], fresh }).length));
        if (ok.length) {
          const city = ok[Math.floor(Math.random() * ok.length)];
          answers = { ...base, where: [city], fresh };
          emit("surprise", { mode, city });
          return showResults({ autoPick: true });
        }
      }
    }
    answers = { ...base, where: ["home"], auto: "around" };
    emit("surprise", { mode: "around" });
    showResults({ autoPick: true });
  }
  $("#reshuffle").addEventListener("click", () => surprise(answers.auto));

  /* ───────── quiz ───────── */
  const DISTS = [
    { v: 2, e: "🚶", label: "walking distance", sub: "under 2 miles" },
    { v: 6, e: "🚲", label: "a quick hop", sub: "under 6 miles" },
    { v: 15, e: "🚗", label: "a little adventure", sub: "under 15 miles" },
    { v: 40, e: "🗺️", label: "anywhere in the bay", sub: "under 40 miles" },
  ];
  const FRESH = [
    { v: "new", e: "✨", label: "somewhere new", sub: "off the want-to-go list" },
    { v: "fav", e: "⭐", label: "old favorites", sub: "the comfort picks" },
    { v: "either", e: "🤷", label: "a mix of both", sub: "" },
  ];

  let answers = {};
  let step = 0;
  let extraCities = []; // cities added from the dropdown, so they show as chips

  function steps() {
    const s = ["plan", "where"];
    if ((answers.where || []).includes("home")) s.push("dist");
    s.push("fresh");
    const wantsMeal = (answers.plan || []).some((p) => CRAVING_SLOTS.includes(p));
    if (wantsMeal && (!("fresh" in answers) || tagOptions().length >= 2)) s.push("tags");
    return s;
  }
  const MULTI = { plan: true, where: true, tags: true };

  function inWhere(s, a, ignoreDist = false) {
    const w = a.where || [];
    if (w.includes(s.city)) return true;
    return w.includes("home") && s.mi != null && s.mi <= (ignoreDist ? 40 : a.dist || 40);
  }
  function freshOk(s, a) {
    if (a.fresh === "new") return s.s !== "fav" && !visited(s.id);
    if (a.fresh === "fav") return s.s === "fav" || (visited(s.id) && store.visits[s.id].rating >= 2);
    return true;
  }

  function slotMatches(slot, a, ignore = []) {
    const S = SLOTS[slot];
    const useTags = !ignore.includes("tags") && CRAVING_SLOTS.includes(slot) && (a.tags || []).length;
    return SPOTS.filter((s) =>
      S.test(s) &&
      inWhere(s, a, ignore.includes("dist")) &&
      (ignore.includes("fresh") || freshOk(s, a)) &&
      (!useTags || has(s, ...a.tags)));
  }

  function tagOptions() {
    const counts = {};
    const meals = (answers.plan || []).filter((p) => CRAVING_SLOTS.includes(p));
    const seen = new Set();
    meals.forEach((slot) => slotMatches(slot, answers, ["tags"]).forEach((s) => {
      if (seen.has(s.id)) return;
      seen.add(s.id);
      s.t.forEach((t) => { if (!["coffee", "bakery", "sweets", "boba & tea", "drinks"].includes(t)) counts[t] = (counts[t] || 0) + 1; });
    }));
    return Object.entries(counts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }

  function startQuiz() {
    answers = { plan: [], where: [], tags: [] }; // (no "auto" flag: this is your own plan)
    extraCities = [];
    step = 0;
    dayReady = false;
    saveSession();
  }

  function optBtn(value, e, label, sub, { pressed, multi, extra = "", count } = {}) {
    return `<button class="opt ${extra}" data-v="${esc(value)}" ${multi ? `aria-pressed="${!!pressed}"` : ""}>
      <span class="opt__emoji" aria-hidden="true">${e}</span>
      <span class="opt__text">${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ""}</span>
      ${count != null ? `<span class="n">${count}</span>` : ""}
      ${multi ? `<span class="opt__check" aria-hidden="true"></span>` : ""}
    </button>`;
  }

  function nextBar(key) {
    const n = (answers[key] || []).length;
    const optional = key === "tags";
    const label = optional && !n ? "no preference, next" : key === steps()[steps().length - 1] ? "plan my day" : "next";
    const hint = key === "plan" ? "pick as many as you like" : key === "where" ? "pick one place or a few" : "pick any, or skip";
    return `<div class="quiz__next">
      <button class="btn btn--primary" id="quizNext" ${!optional && !n ? "disabled" : ""}>${label}</button>
      <span class="quiz__hint">${n ? `${n} picked` : hint}</span>
    </div>`;
  }

  function renderStep() {
    const list = steps();
    const key = list[step];
    $("#quizDots").innerHTML = list.map((_, i) => `<li class="${i < step ? "is-done" : i === step ? "is-now" : ""}"></li>`).join("");
    let html = `<p class="quiz__step">question ${step + 1} of ${list.length}</p>`;
    const sel = (k, v) => (answers[k] || []).includes(v);

    if (key === "plan") {
      html += `<h1 class="quiz__q">what are the food plans today?</h1><div class="options">` +
        SLOT_ORDER.map((k) => optBtn(k, SLOTS[k].e, SLOTS[k].label, SLOTS[k].sub, { multi: true, pressed: sel("plan", k) })).join("") +
        `<button class="opt opt--all" data-all="1"><span class="opt__emoji" aria-hidden="true">🗓️</span><span class="opt__text">the whole day<small>all of the above</small></span></button>` +
        `</div>` + nextBar("plan");
    } else if (key === "where") {
      const quick = topCities.filter(([c]) => c !== HOME_CITY).slice(0, 7).map(([c]) => c);
      const cities = [...quick, ...extraCities.filter((c) => !quick.includes(c))];
      html += `<h1 class="quiz__q">where will you be?</h1><div class="options">` +
        optBtn("home", "🏡", "around home", `${HOME_CITY} and nearby`, { multi: true, pressed: sel("where", "home") }) +
        cities.map((c) => optBtn(c, "📍", c, `${cityCounts[c]} saved spots`, { multi: true, pressed: sel("where", c) })).join("") +
        `</div><div class="other-city"><label for="citySel">somewhere else?</label>
         <select id="citySel"><option value="">add a city…</option>${topCities.map(([c, n]) => `<option value="${esc(c)}">${esc(c)} (${n})</option>`).join("")}</select></div>` +
        nextBar("where");
    } else if (key === "dist") {
      html += `<h1 class="quiz__q">how far will you go from home?</h1><div class="options">` +
        DISTS.map((d) => optBtn(d.v, d.e, d.label, d.sub)).join("") + `</div>`;
    } else if (key === "fresh") {
      html += `<h1 class="quiz__q">somewhere new, or old favorites?</h1><div class="options">` +
        FRESH.map((f) => optBtn(f.v, f.e, f.label, f.sub)).join("") + `</div>`;
    } else if (key === "tags") {
      html += `<h1 class="quiz__q">craving anything for lunch or dinner?</h1><div class="options options--tags">` +
        tagOptions().map(([t, n]) => optBtn(t, EMOJI[t], t, `${n} spot${n === 1 ? "" : "s"}`, { multi: true, pressed: sel("tags", t) })).join("") +
        `</div>` + nextBar("tags");
    }
    const card = $("#quizCard");
    card.innerHTML = html;
    card.style.animation = "none"; card.offsetHeight; card.style.animation = "";
  }

  function advance() {
    saveSession();
    const list = steps();
    if (step + 1 < list.length) navigate(`#/plan/${step + 1}`);
    else showResults();
  }

  function toggleMulti(key, v, btn) {
    const arr = answers[key] || (answers[key] = []);
    const i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else arr.push(v);
    btn.setAttribute("aria-pressed", i < 0);
    dayReady = false;
    saveSession();
    emit("option", { key, value: v, on: i < 0 });
    // refresh just the next bar so the grid doesn't re-animate
    const bar = $(".quiz__next", $("#quizCard"));
    if (bar) bar.outerHTML = nextBar(key);
    $("#quizDots").innerHTML = steps().map((_, j) => `<li class="${j < step ? "is-done" : j === step ? "is-now" : ""}"></li>`).join("");
    const lbl = $(".quiz__step", $("#quizCard"));
    if (lbl) lbl.textContent = `question ${step + 1} of ${steps().length}`;
  }

  $("#quizCard").addEventListener("click", (e) => {
    const key = steps()[step];
    if (e.target.closest("#quizNext")) {
      if (key === "plan") answers.plan.sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));
      advance();
      return;
    }
    if (e.target.closest("[data-all]")) {
      answers.plan = SLOT_ORDER.slice();
      emit("all-day");
      advance();
      return;
    }
    const b = e.target.closest(".opt");
    if (!b) return;
    if (MULTI[key]) return toggleMulti(key, b.dataset.v, b);
    answers[key] = key === "dist" ? Number(b.dataset.v) : b.dataset.v;
    emit("answer", { key, value: answers[key] });
    if (key === "fresh") answers.tags = [];
    advance();
  });
  $("#quizCard").addEventListener("change", (e) => {
    if (e.target.id !== "citySel" || !e.target.value) return;
    const c = e.target.value;
    if (!answers.where.includes(c)) answers.where.push(c);
    if (!extraCities.includes(c)) extraCities.push(c);
    saveSession();
    renderStep();
  });
  $("#quizBack").addEventListener("click", () => goBack(step === 0 ? "#/" : `#/plan/${step - 1}`));

  /* ───────── results: the day ───────── */
  let slotState = {}; // slot -> { queue: [], pos, hand: [], loosened: [] }
  let picks = {};     // slot -> spot id

  function placeName(a) {
    const w = a.where.map((x) => (x === "home" ? "around home" : x));
    if (w.length === 1) return w[0] === "around home" ? "your day around home" : `your day in ${w[0]}`;
    return `your day in ${listJoin(w)}`;
  }

  function showResults({ autoPick = false } = {}) {
    buildDay({ autoPick });
    dayReady = true;
    saveSession();
    navigate("#/day");
    emit("day", { count: Object.values(slotState).reduce((n, st) => n + st.total, 0) });
  }

  function buildDay({ autoPick = false, keep = {} } = {}) {
    picks = { ...keep };
    slotState = {};
    const a = answers;
    $("#resultsTitle").textContent = placeName(a);

    const bits = [listJoin(a.plan.map((p) => SLOTS[p].label))];
    if (a.where.includes("home")) bits.push(`within ${a.dist || 40} miles of home`);
    if (a.fresh === "new") bits.push("somewhere new");
    if (a.fresh === "fav") bits.push("old favorites");
    if (a.tags && a.tags.length) bits.push(`leaning ${listJoin(a.tags)}`);
    $("#resultsSummary").textContent = a.auto === "city"
      ? `picked for you, all in ${a.where[0]} so you can stay put. swap anything you like, or shuffle again.`
      : a.auto === "around"
        ? "picked for you, hopping around a few cities near home. swap anything you like, or shuffle again."
        : bits.join(", ") + ". add one spot from each part of the day to build your plan.";
    $("#reshuffle").hidden = !a.auto;

    const shown = new Set();
    a.plan.forEach((slot) => {
      let matches = slotMatches(slot, a);
      const loosened = [];
      const tries = [["tags", "your craving"], ["fresh", "new vs. favorites"], ["dist", "the distance"]];
      const ignore = [];
      for (const [k, label] of tries) {
        if (matches.length >= 3) break;
        const more = slotMatches(slot, a, [...ignore, k]);
        if (more.length > matches.length) { ignore.push(k); loosened.push(label); matches = more; }
      }
      const queue = [...shuffle(matches.filter((s) => !visited(s.id))), ...shuffle(matches.filter((s) => visited(s.id)))];
      slotState[slot] = { queue, pos: 0, hand: [], loosened, total: matches.length };
      dealSlot(slot, shown);
      slotState[slot].hand.forEach((id) => shown.add(id));
      if (autoPick && slotState[slot].hand.length) picks[slot] = slotState[slot].hand[0];
    });
    Object.keys(picks).forEach((k) => { if (!slotState[k]) delete picks[k]; });
    renderSlots();
    renderDay();
  }

  function dealSlot(slot, avoid = new Set()) {
    const st = slotState[slot];
    const others = new Set([...avoid, ...Object.entries(slotState).filter(([k]) => k !== slot).flatMap(([, v]) => v.hand)]);
    const hand = [];
    let guard = 0;
    if (st.pos >= st.queue.length) st.pos = 0;
    while (hand.length < 3 && guard < st.queue.length) {
      const id = st.queue[st.pos % st.queue.length].id;
      st.pos++; guard++;
      if (!others.has(id) && !hand.includes(id)) hand.push(id);
    }
    // keep the current pick visible in its own row
    if (picks[slot] != null && !hand.includes(picks[slot])) hand[hand.length ? hand.length - 1 : 0] = picks[slot];
    st.hand = hand;
  }

  function renderSlots() {
    $("#slots").innerHTML = answers.plan.map((slot) => slotHTML(slot)).join("");
  }

  function slotHTML(slot) {
    const S = SLOTS[slot];
    const st = slotState[slot];
    const count = st.total;
    return `<section class="slot" id="slot-${slot}" aria-labelledby="slot-${slot}-title">
      <div class="slot__head">
        <span class="slot__emoji" aria-hidden="true">${S.e}</span>
        <div>
          <h2 class="slot__title" id="slot-${slot}-title">${esc(S.label)}</h2>
          <p class="slot__sub">${count ? `${count} of your spots fit` : "nothing saved here fits yet"}${st.loosened.length ? `, after loosening ${esc(listJoin(st.loosened))}` : ""}</p>
        </div>
        ${count > 3 ? `<button class="btn btn--soft btn--sm slot__more" data-more="${slot}">show 3 more</button>` : ""}
      </div>
      <div class="deck">${st.hand.length ? st.hand.map((id) => cardHTML(SPOTS[id], slot)).join("") :
        `<div class="empty"><p>none of your saves fit ${esc(S.label)} here. try adding another city.</p></div>`}</div>
    </section>`;
  }

  function renderDay() {
    const stops = answers.plan.map((slot) => {
      const S = SLOTS[slot];
      const s = picks[slot] != null ? SPOTS[picks[slot]] : null;
      return `<li class="stop ${s ? "is-set" : ""}">
        <span class="stop__dot" aria-hidden="true">${S.e}</span>
        <span class="stop__time">${esc(S.time)}</span>
        ${s ? `<a class="stop__name" href="#slot-${slot}">${esc(s.n)}</a><span class="stop__city">${esc(s.city)}</span>`
            : `<a class="stop__name stop__name--empty" href="#slot-${slot}">pick ${esc(S.label)}</a>`}
      </li>`;
    }).join("");
    $("#dayStops").innerHTML = stops;
    const n = Object.keys(picks).length;
    $("#dayTitle").textContent = n ? `my day so far (${n} of ${answers.plan.length})` : "my day so far";
    $("#saveDay").disabled = !n;
  }

  document.addEventListener("click", (e) => {
    const more = e.target.closest("[data-more]");
    if (more) {
      const slot = more.dataset.more;
      dealSlot(slot);
      $(`#slot-${slot}`).outerHTML = slotHTML(slot);
      return;
    }
    const add = e.target.closest("[data-pick]");
    if (add) {
      const slot = add.dataset.slot;
      const id = Number(add.dataset.pick);
      if (picks[slot] === id) delete picks[slot]; else picks[slot] = id;
      saveSession();
      const sec = $(`#slot-${slot}`);
      sec.outerHTML = slotHTML(slot);
      $$(`#slot-${slot} .card`).forEach((c) => (c.style.animation = "none"));
      renderDay();
      if (picks[slot] === id) { toast(`${SPOTS[id].n} added to your day`); emit("add", { name: SPOTS[id].n, slot }); }
      else emit("unpick");
    }
  });

  $("#saveDay").addEventListener("click", () => {
    const stops = answers.plan.filter((k) => picks[k] != null).map((k) => ({ slot: k, id: picks[k] }));
    if (!stops.length) return;
    store.days.unshift({ id: Date.now(), date: today(), title: placeName(answers), stops });
    persist();
    toast("day saved to your passport");
    emit("save-day");
  });

  const STATUS = { want: ["on your want-to-go list", "want"], fav: ["one of your favorites", "fav"], saved: ["saved a while back", "saved"] };

  function cardHTML(s, slot) {
    const v = store.visits[s.id];
    const [statusText, statusCls] = v ? [`you went ${prettyDate(v.date)}`, "fav"] : STATUS[s.s];
    const lists = s.l.slice(0, 2).map((l) => `<span class="tag tag--list">${esc(l)}</span>`).join("");
    const picked = slot && picks[slot] === s.id;
    return `<article class="card ${picked ? "is-picked" : ""}" data-id="${s.id}">
      ${v ? `<div class="card__stamp" aria-hidden="true"><span>${["", "🫠", "🙂", "🤙"][v.rating]}</span>ate<br>here</div>` : ""}
      <div class="card__top">
        <div class="card__emoji" aria-hidden="true">${emojiFor(s)}</div>
        <div>
          <h3 class="card__name">${esc(s.n)}</h3>
          <div class="card__meta">${esc(s.city)}${s.mi != null ? `, ${esc(miles(s))}` : ""}</div>
          <div class="card__status card__status--${statusCls}">${esc(statusText)}</div>
        </div>
      </div>
      ${s.t.length || lists ? `<div class="tags">${s.t.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}${lists}</div>` : ""}
      ${v && v.note ? `<p class="card__note">“${esc(v.note)}”</p>` : ""}
      <div class="card__links">
        <a class="link-chip" href="${esc(mapsUrl(s))}" target="_blank" rel="noopener">📍 maps</a>
        <a class="link-chip" href="${esc(yelpUrl(s))}" target="_blank" rel="noopener">⭐ yelp</a>
        <button class="link-chip save-btn" data-save="${s.id}" aria-pressed="${isSaved(s.id)}" aria-label="save for later">${isSaved(s.id) ? "♥" : "♡"}</button>
        <button class="link-chip" data-visit="${s.id}">${v ? "✎ note" : "i went!"}</button>
      </div>
      ${slot ? `<button class="btn ${picked ? "btn--primary" : "btn--outline"} btn--sm card__pick" data-pick="${s.id}" data-slot="${slot}" aria-pressed="${picked}">
        ${picked ? `✓ in my day` : `add to my day`}</button>` : ""}
    </article>`;
  }

  /* save + visit buttons work anywhere */
  document.addEventListener("click", (e) => {
    const sv = e.target.closest("[data-save]");
    if (sv) {
      const id = Number(sv.dataset.save);
      if (isSaved(id)) delete store.saved[id]; else store.saved[id] = Date.now();
      persist();
      $$(`[data-save="${id}"]`).forEach((b) => { b.setAttribute("aria-pressed", isSaved(id)); b.textContent = isSaved(id) ? "♥" : "♡"; });
      toast(isSaved(id) ? "saved for later ♥" : "removed from saved");
      emit("save-later", { on: isSaved(id) });
      if ($("#view-passport").classList.contains("is-active")) renderPassport();
      return;
    }
    const vb = e.target.closest("[data-visit]");
    if (vb) openVisit(Number(vb.dataset.visit));
  });

  /* ───────── visit dialog ───────── */
  const dlg = $("#visitDialog");
  const form = $("#visitForm");
  let visitId = null;

  function openVisit(id) {
    const s = SPOTS[id];
    const v = store.visits[id];
    visitId = id;
    $("#visitTitle").textContent = v ? `your note on ${s.n}` : `you went to ${s.n}!`;
    $("#visitPlace").textContent = `${s.city}${s.a ? ", " + s.a.split(",")[0] : ""}`;
    form.rating.value = String(v ? v.rating : 3);
    form.order.value = v ? v.order || "" : "";
    form.note.value = v ? v.note || "" : "";
    form.date.value = v ? v.date : today();
    $("#visitRemove").hidden = !v;
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }

  dlg.addEventListener("close", () => {
    const action = dlg.returnValue;
    dlg.returnValue = "";
    if (visitId == null) return;
    const s = SPOTS[visitId];
    if (action === "save") {
      const isNew = !store.visits[visitId];
      store.visits[visitId] = {
        rating: Number(form.rating.value), order: form.order.value.trim(),
        note: form.note.value.trim(), date: form.date.value || today(),
      };
      delete store.saved[visitId];
      persist();
      if (isNew) thunk(s, store.visits[visitId].date); else toast("note updated");
    } else if (action === "remove") {
      delete store.visits[visitId];
      persist();
      toast("stamp removed");
    }
    visitId = null;
    refreshCurrent();
  });

  function thunk(s, date) {
    $("#thunkCity").textContent = s.city || "~";
    $("#thunkDate").textContent = prettyDate(date);
    const el = $("#thunk");
    el.classList.remove("is-on"); el.offsetHeight; el.classList.add("is-on");
    clearTimeout(thunk._t);
    thunk._t = setTimeout(() => el.classList.remove("is-on"), 950);
    setTimeout(() => toast(`stamped! ${s.n} is in your passport`), 600);
    emit("stamp", { name: s.n });
  }

  function refreshCurrent() {
    if ($("#view-results").classList.contains("is-active")) {
      answers.plan.forEach((slot) => { $(`#slot-${slot}`).outerHTML = slotHTML(slot); });
      $$("#slots .card").forEach((c) => (c.style.animation = "none"));
    }
    if ($("#view-passport").classList.contains("is-active")) renderPassport();
    if ($("#view-home").classList.contains("is-active")) renderHome();
  }

  /* ───────── passport ───────── */
  let tab = "stamps";
  $$(".tab").forEach((t) => t.addEventListener("click", () => navigate(`#/passport/${t.dataset.tab}`)));

  function renderPassport() {
    const visits = Object.entries(store.visits).map(([id, v]) => ({ s: SPOTS[id], v })).filter((x) => x.s)
      .sort((a, b) => b.v.date.localeCompare(a.v.date));
    const cities = new Set(visits.map((x) => x.s.city)).size;
    const savedIds = Object.keys(store.saved).map(Number).filter((id) => SPOTS[id]);
    const parts = [];
    if (visits.length) parts.push(`${visits.length} stamp${visits.length === 1 ? "" : "s"} across ${cities} cit${cities === 1 ? "y" : "ies"}`);
    if (store.days.length) parts.push(`${store.days.length} planned day${store.days.length === 1 ? "" : "s"}`);
    if (savedIds.length) parts.push(`${savedIds.length} saved for later`);
    $("#passportSub").textContent = parts.length ? parts.join(", ") + "." : "every place you actually go gets a stamp here, with your notes.";

    $(".log-search").hidden = tab !== "stamps";
    $("#stampGrid").hidden = tab !== "stamps";
    $("#daysGrid").hidden = tab !== "days";
    $("#savedGrid").hidden = tab !== "saved";

    $("#stampGrid").innerHTML = visits.length
      ? visits.map(({ s, v }) => `<button class="pstamp" data-visit="${s.id}" aria-label="${esc(s.n)}, open note">
          <span class="pstamp__ink ink-${s.id % 4}" style="transform: rotate(${((s.id * 37) % 24) - 12}deg)">
            <span class="e">${emojiFor(s)}</span><span class="c">${esc(s.city)}</span><span class="d">${esc(prettyDate(v.date))}</span>
          </span>
          <span class="pstamp__name">${["", "🫠", "🙂", "🤙"][v.rating]} ${esc(s.n)}</span>
          ${v.note || v.order ? `<span class="pstamp__note">${esc(v.order ? v.order + (v.note ? ". " : "") : "")}${esc(v.note || "")}</span>` : ""}
        </button>`).join("")
      : `<div class="empty"><h3>no stamps yet</h3><p>plan a day, go eat, then tap “i went!” to stamp it here.</p><button class="btn btn--primary" data-go="quiz">plan today's food</button></div>`;

    $("#daysGrid").innerHTML = store.days.length
      ? store.days.map((d) => `<article class="ticket">
          <div class="ticket__head">
            <h3 class="ticket__title">${esc(d.title)}</h3>
            <span class="ticket__date">${esc(prettyDate(d.date))}</span>
          </div>
          <ol class="ticket__stops">${d.stops.filter((x) => SPOTS[x.id]).map((x) => {
            const s = SPOTS[x.id]; const S = SLOTS[x.slot] || { e: "🍽️", time: "" };
            return `<li><span class="ticket__time">${S.e} ${esc(S.time)}</span>
              <a href="${esc(mapsUrl(s))}" target="_blank" rel="noopener">${esc(s.n)}</a>
              <span class="ticket__city">${esc(s.city)}</span>
              <button class="ticket__went" data-visit="${s.id}">${visited(s.id) ? "✓ stamped" : "i went!"}</button></li>`;
          }).join("")}</ol>
          <button class="link-btn ticket__remove" data-del-day="${d.id}">remove this day</button>
        </article>`).join("")
      : `<div class="empty"><h3>no planned days yet</h3><p>build a day from your saves and tap “save this day.”</p><button class="btn btn--primary" data-go="quiz">plan today's food</button></div>`;

    $("#savedGrid").innerHTML = savedIds.length
      ? savedIds.map((id) => cardHTML(SPOTS[id])).join("")
      : `<div class="empty"><h3>nothing saved for later</h3><p>tap ♡ on any spot to keep it here.</p></div>`;
  }

  document.addEventListener("click", (e) => {
    const del = e.target.closest("[data-del-day]");
    if (!del) return;
    store.days = store.days.filter((d) => d.id !== Number(del.dataset.delDay));
    persist();
    renderPassport();
    toast("day removed");
  });

  $("#logSearch").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    const out = $("#logResults");
    if (q.length < 2) { out.innerHTML = ""; return; }
    const hits = SPOTS.filter((s) => s.n.toLowerCase().includes(q) || s.city.toLowerCase().startsWith(q)).slice(0, 8);
    out.innerHTML = hits.length
      ? hits.map((s) => `<li><span>${emojiFor(s)} ${esc(s.n)} <span class="mi">${esc(s.city)}</span></span><button data-visit="${s.id}">${visited(s.id) ? "edit" : "stamp it"}</button></li>`).join("")
      : `<li><span class="mi">no saved spot matches “${esc(q)}”.</span></li>`;
  });

  /* go */
  route();
})();
