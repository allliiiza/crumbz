/* crumbz buddies
   - pinchy the crab scuttles along the bottom of the screen and does the talking:
     he reacts to what you pick and chats when you click him.
   - the starfish climbs out of the crumbz logo when you arrive, follows you around,
     hops whenever you pick something, and swims back to the logo when you're idle.
   - the tide along the bottom swells when your mouse comes near and splashes on picks.
   app.js tells them what's happening through "crumbz" events. */
(() => {
  "use strict";

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const KEY = "crumbz.buddies";
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isOff = () => document.documentElement.classList.contains("buddies-off");

  function makeBuddy(cls, src, label, tag = "button") {
    const el = document.createElement(tag);
    if (tag === "button") { el.type = "button"; el.setAttribute("aria-label", label); }
    else el.setAttribute("aria-hidden", "true");
    el.className = `buddy ${cls}`;
    el.innerHTML = `<div class="buddy__body"><img src="${src}" alt=""></div>`;
    document.body.append(el);
    return { el, x: 0, y: 0, w: 0, h: 0 };
  }
  function measure(b) {
    const r = b.el.getBoundingClientRect();
    b.w = r.width || 60;
    b.h = r.height || 50;
  }
  function hop(b) {
    b.el.classList.remove("is-hop");
    void b.el.offsetWidth;
    b.el.classList.add("is-hop");
    setTimeout(() => b.el.classList.remove("is-hop"), 520);
  }

  /* ───────── pinchy the crab ───────── */
  const crab = makeBuddy("buddy--crab", "assets/crab.png", "pinchy the crab, say hi");
  Object.assign(crab, { tx: 0, until: 0, moving: false, timer: 0 });
  crab.bubble = document.createElement("div");
  crab.bubble.className = "bubble";
  crab.bubble.setAttribute("role", "status");
  crab.bubble.setAttribute("aria-live", "polite");
  document.body.append(crab.bubble);

  let mouseX = innerWidth / 2, mouseY = innerHeight / 2, lastMove = 0;
  /* the tide along the bottom: swells when your mouse comes near, splashes when you pick things */
  const tide = document.getElementById("tide");
  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    mouseX = e.clientX; mouseY = e.clientY; lastMove = performance.now();
    if (tide && !reduceMotion) tide.classList.toggle("is-swell", e.clientY > innerHeight - 130);
  }, { passive: true });
  addEventListener("mouseout", (e) => { if (!e.relatedTarget && tide) tide.classList.remove("is-swell"); });
  function splash() {
    if (!tide || reduceMotion || isOff()) return;
    tide.classList.remove("is-splash");
    void tide.offsetWidth;
    tide.classList.add("is-splash");
    setTimeout(() => tide.classList.remove("is-splash"), 750);
  }

  const crabY = () => innerHeight - crab.h - (innerWidth < 760 ? 12 : 20); // feet in the surf
  function newCrabTarget() {
    const max = innerWidth - crab.w - 8;
    // half the time pinchy heads toward you, the rest he wanders
    crab.tx = Math.random() < 0.5 ? clamp(mouseX - crab.w / 2 + rand(-60, 60), 8, max) : rand(8, max);
    crab.moving = true;
  }

  function placeBubble() {
    const b = crab.bubble;
    const bw = b.offsetWidth, bh = b.offsetHeight;
    if (innerWidth < 760) {
      // phones: talk sideways, down in the sand strip, so buttons stay visible
      const right = crab.x + crab.w + 8 + bw < innerWidth - 4;
      const left = right ? crab.x + crab.w + 6 : Math.max(4, crab.x - bw - 6);
      const top = Math.min(innerHeight - bh - 4, crab.y + crab.h - bh);
      b.classList.add("is-side");
      b.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      return;
    }
    b.classList.remove("is-side");
    const cx = crab.x + crab.w / 2;
    const left = clamp(cx - 34, 8, innerWidth - bw - 8);
    const top = crab.y - bh - 14;
    b.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    b.style.setProperty("--tail", `${clamp(cx - left - 8, 14, bw - 30)}px`);
  }

  function say(text, ms = 2800) {
    if (isOff()) return;
    crab.bubble.textContent = text;
    crab.bubble.classList.add("is-on");
    placeBubble();
    hop(crab);
    clearTimeout(crab.timer);
    crab.timer = setTimeout(() => crab.bubble.classList.remove("is-on"), ms);
  }

  crab.el.addEventListener("click", () => {
    crab.moving = false;
    crab.el.classList.remove("is-walking");
    crab.until = performance.now() + 2500;
    say(pick(POKE));
  });

  /* ───────── the starfish ───────── */
  const logoStar = document.querySelector(".logo__star");
  const star = makeBuddy("buddy--star", "assets/starfish.png", "", "div");
  Object.assign(star, { state: "home", tx: 0, ty: 0, idleAt: 0, spin: 0 });
  let lastTap = null;
  addEventListener("pointerdown", (e) => { lastTap = { x: e.clientX, y: e.clientY }; }, { passive: true, capture: true });

  function homeRect() {
    const r = logoStar ? logoStar.getBoundingClientRect() : { left: 20, top: 20, width: 40, height: 38 };
    return { x: r.left + r.width / 2 - star.w / 2, y: r.top + r.height / 2 - star.h / 2 };
  }
  function starOut(tx, ty, stay = 6000) {
    if (isOff() || reduceMotion) { if (logoStar) hopLogo(); return; }
    if (star.state === "home") {
      const h = homeRect();
      star.x = h.x; star.y = h.y;
      star.el.classList.add("is-out");
      logoStar && logoStar.classList.add("is-away");
    }
    star.state = "out";
    if (tx != null) { star.tx = tx; star.ty = ty; }
    star.idleAt = performance.now() + stay;
  }
  function hopLogo() {
    if (!logoStar) return;
    logoStar.animate([{ transform: "rotate(-12deg)" }, { transform: "translateY(-10px) rotate(20deg)" }, { transform: "rotate(-12deg)" }], { duration: 500, easing: "ease-out" });
  }
  // when you pick something, the starfish bounces over to it and hops
  function starCheer() {
    splash();
    const t = lastTap || { x: innerWidth / 2, y: innerHeight / 2 };
    starOut(clamp(t.x + 26, 8, innerWidth - star.w - 8), clamp(t.y - star.h - 10, 8, innerHeight - star.h - 8), 5000);
    hop(star);
  }

  /* ───────── one loop moves everyone ───────── */
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // crab
    crab.y = crabY();
    if (crab.moving) {
      const dx = crab.tx - crab.x, step = 75 * dt;
      if (Math.abs(dx) <= step) {
        crab.x = crab.tx; crab.moving = false;
        crab.el.classList.remove("is-walking");
        crab.until = now + rand(1800, 5200);
      } else {
        crab.x += Math.sign(dx) * step;
        crab.el.classList.add("is-walking");
      }
    } else if (now > crab.until) newCrabTarget();
    crab.el.style.transform = `translate(${Math.round(crab.x)}px, ${Math.round(crab.y)}px)`;
    if (crab.bubble.classList.contains("is-on")) placeBubble();

    // starfish
    if (star.state !== "home") {
      if (star.state === "out") {
        // trail a little behind the mouse while you're moving it
        if (now - lastMove < 1500) {
          star.tx = clamp(mouseX + 22, 8, innerWidth - star.w - 8);
          star.ty = clamp(mouseY + 18, 8, innerHeight - star.h - 8);
          star.idleAt = Math.max(star.idleAt, now + 2500);
        }
        if (now > star.idleAt) star.state = "back";
      }
      if (star.state === "back") { const h = homeRect(); star.tx = h.x; star.ty = h.y; }
      const k = 1 - Math.pow(0.002, dt); // smooth follow
      const vx = (star.tx - star.x) * k;
      star.x += vx;
      star.y += (star.ty - star.y) * k;
      star.spin += vx * 1.5;
      if (star.state === "back" && Math.hypot(star.tx - star.x, star.ty - star.y) < 2) {
        star.state = "home";
        star.el.classList.remove("is-out");
        logoStar && logoStar.classList.remove("is-away");
      }
      star.el.style.transform = `translate(${Math.round(star.x)}px, ${Math.round(star.y)}px) rotate(${Math.round(star.spin) % 360}deg)`;
    }

    requestAnimationFrame(tick);
  }

  /* ───────── what pinchy says ───────── */
  const POKE = [
    "hi!! i'm pinchy 🦀", "pinch pinch", "where are we eating?", "i'm a crab, not a critic", "snip snip, let's eat",
    "sideways to snacks!", "fish tacos?", "i'd eat there", "swimming to brunch", "feed me pls",
  ];
  const PLAN = {
    morning: ["coffee first. always ☕", "a morning person, love it"],
    lunch: ["midday munchies!", "lunch is the best meal, fight me"],
    treat: ["dessert is a food group 🍡", "sweet tooth, same"],
    dinner: ["the main event!", "dinner plans? fancy"],
    drinks: ["cheers to that 🥂", "a little nightcap?"],
  };
  const CITY = {
    home: "staying local, cute 🏡",
    "San Francisco": "sf! sourdough and fog 🌁",
    "San Diego": "fish tacos by the beach 🌊",
    "San Jose": "san jose has the best pho, just saying",
    Seattle: "coffee capital ☕",
    Honolulu: "poke bowls, please 🌺",
    "Las Vegas": "buffet era 🎰",
    "Los Angeles": "taco trucks everywhere 🌮",
    Vancouver: "sushi heaven 🍣",
  };
  const DIST = { 2: "a little stroll, perfect", 6: "quick hop it is", 15: "adventure time!", 40: "road trip snacks?" };
  const FRESH = { new: "somewhere new, so brave ✨", fav: "the classics never miss", either: "best of both worlds" };

  function react(d) {
    const cheer = () => starCheer();
    switch (d.type) {
      case "view":
        if (d.view === "quiz" && d.step === 0) say("ooh, what are we eating today?");
        if (d.view === "passport") say(d.stamps ? `${d.stamps === 1 ? "a stamp" : "stamps"}! look at you` : "no stamps yet… let's fix that");
        if (d.view === "home" && d.first) {
          setTimeout(() => starOut(innerWidth * 0.42, innerHeight * 0.4, 7000), 700);
          setTimeout(() => say("hi! i'm pinchy 🦀 let's find you some food"), 1600);
        }
        break;
      case "option":
        if (d.on) cheer();
        if (d.key === "plan") say(d.on ? pick(PLAN[d.value] || ["yum"]) : "fair, skipping that one");
        if (d.key === "where") say(d.on ? CITY[d.value] || `${d.value}! great pick` : `ok, not ${d.value} this time`);
        if (d.key === "tags" && d.on) say(pick([`${d.value}? good choice`, "you have taste", "ooh love that", `${d.value} sounds so good rn`]));
        break;
      case "all-day": cheer(); say("a full food day?? iconic"); break;
      case "answer":
        cheer();
        if (d.key === "dist") say(DIST[d.value] || "nice");
        if (d.key === "fresh") say(FRESH[d.value] || "nice");
        break;
      case "day": say(d.count ? "your table's ready! pick your spots" : "hmm, try another city?"); break;
      case "surprise": cheer(); say(d.mode === "city" ? `a whole day in ${d.city}? easy breezy` : "road trip! a little bit of everywhere 🚗"); break;
      case "add": cheer(); say(pick([`ooh, ${d.name}!`, `${d.name}? chef's kiss`, "great pick", "adding that to my list too"])); break;
      case "unpick": say("changed your mind? valid"); break;
      case "save-day": cheer(); say("saved! now actually go 😤"); break;
      case "stamp": cheer(); say(pick(["stamp collected!! 🎉", "how was it?? tell me everything"])); break;
      case "save-later": if (d.on) { cheer(); say("bookmarked ♡"); } break;
    }
  }
  addEventListener("crumbz", (e) => react(e.detail || {}));

  /* ───────── show / hide ───────── */
  const toggle = document.getElementById("buddyToggle");
  function setOn(on) {
    document.documentElement.classList.toggle("buddies-off", !on);
    if (!on && star.state !== "home") {
      star.state = "home";
      star.el.classList.remove("is-out");
      logoStar && logoStar.classList.remove("is-away");
    }
    if (toggle) {
      toggle.textContent = on ? "hide pinchy & the starfish" : "bring back pinchy & the starfish";
      toggle.setAttribute("aria-pressed", on);
    }
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch (_) {}
  }
  let saved = "on";
  try { saved = localStorage.getItem(KEY) || "on"; } catch (_) {}
  setOn(saved !== "off");
  if (toggle) toggle.addEventListener("click", () => setOn(isOff()));

  /* ───────── start ───────── */
  function start() {
    measure(crab); measure(star);
    crab.x = 24; crab.y = crabY();
    crab.el.style.transform = `translate(${crab.x}px, ${crab.y}px)`;
    if (reduceMotion) return; // pinchy stays put but still talks; the starfish stays on the logo
    crab.until = performance.now() + 1200;
    requestAnimationFrame(tick);
  }
  addEventListener("resize", () => {
    measure(crab); measure(star);
    crab.x = clamp(crab.x, 8, innerWidth - crab.w - 8);
    if (reduceMotion) { crab.y = crabY(); crab.el.style.transform = `translate(${crab.x}px, ${crab.y}px)`; }
  });
  if (document.readyState === "complete") start(); else addEventListener("load", start);

  window.crumbzBuddies = { say };
})();
