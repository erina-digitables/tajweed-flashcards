/* Tajweed Flashcards
 * Static app: no server needed. Progress for signed-in students is kept in
 * this browser's localStorage; guests get the full app, but nothing is kept
 * after the tab is closed.
 */
(() => {
  "use strict";

  const CARDS = (window.TAJWEED_CARDS || []).filter((c) => c && c.id);
  const byId = new Map(CARDS.map((c) => [c.id, c]));
  const ALL_IDS = CARDS.map((c) => c.id);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- storage ----------
  const LS = safeStorage(() => window.localStorage);
  const SS = safeStorage(() => window.sessionStorage);
  function safeStorage(getter) {
    let s = null;
    try { s = getter(); } catch (e) { s = null; }
    return {
      get(k, d) { try { const v = s && s.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
      set(k, v) { try { s && s.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
      del(k) { try { s && s.removeItem(k); } catch (e) { /* ignore */ } },
    };
  }

  let profiles = LS.get("tq.profiles", {});
  let currentId = LS.get("tq.current", null);
  if (!profiles[currentId]) currentId = null;
  let guestData = SS.get("tq.g.data", null) || { cards: {}, sessions: [] };
  let data = loadData();
  let session = loadSession() || makeSession("full", ALL_IDS, false);
  let flipped = false;
  let busy = false;

  function loadData() {
    if (!currentId) return guestData;
    const d = LS.get("tq.p." + currentId, null) || {};
    return { cards: d.cards || {}, sessions: d.sessions || [] };
  }
  function saveData() {
    if (currentId) LS.set("tq.p." + currentId, data);
    else SS.set("tq.g.data", data);
  }
  function sessionStore() { return currentId ? LS : SS; }
  function sessionKey() { return currentId ? "tq.s." + currentId : "tq.s.guest"; }
  function saveSession() { sessionStore().set(sessionKey(), session); }
  function loadSession() {
    const s = sessionStore().get(sessionKey(), null);
    if (!s || !Array.isArray(s.order)) return null;
    // Drop cards that no longer exist (e.g. after the spreadsheet was updated).
    const answered = (s.log || []).filter((e) => byId.has(e.id));
    const done = new Set(answered.map((e) => e.id));
    const rest = s.order.slice(s.log ? s.log.length : 0).filter((id) => byId.has(id) && !done.has(id));
    s.log = answered;
    s.order = answered.map((e) => e.id).concat(rest);
    if (!s.order.length) return null;
    s.done = s.log.length >= s.order.length;
    return s;
  }

  function makeSession(mode, ids, shuffled, round = 1) {
    const order = ids.filter((id) => byId.has(id));
    if (shuffled) shuffle(order);
    return { mode, order, log: [], round, startedAt: Date.now(), done: false, summarySaved: false };
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- recording ----------
  function record(id, ok) {
    const c = data.cards[id] || (data.cards[id] = { right: 0, wrong: 0, last: null, at: 0 });
    const prev = { last: c.last, at: c.at };
    if (ok) c.right++; else c.wrong++;
    c.last = ok ? "right" : "wrong";
    c.at = Date.now();
    return prev;
  }
  function unrecord(entry) {
    const c = data.cards[entry.id];
    if (!c) return;
    if (entry.ok) c.right = Math.max(0, c.right - 1); else c.wrong = Math.max(0, c.wrong - 1);
    c.last = entry.prev ? entry.prev.last : null;
    c.at = entry.prev ? entry.prev.at : 0;
    if (!c.right && !c.wrong) delete data.cards[entry.id];
  }
  function counts(s = session) {
    let right = 0, wrong = 0;
    s.log.forEach((e) => (e.ok ? right++ : wrong++));
    return { right, wrong, total: s.order.length };
  }
  function saveSummary() {
    if (session.summarySaved) return;
    const { right, wrong, total } = counts();
    data.sessions.push({ at: Date.now(), mode: session.mode, round: session.round, total, right, wrong });
    if (data.sessions.length > 200) data.sessions.splice(0, data.sessions.length - 200);
    session.summarySaved = true;
  }

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    studyView: $("studyView"), doneView: $("doneView"),
    modeLabel: $("modeLabel"), counterNow: $("counterNow"), counterTotal: $("counterTotal"),
    barRight: $("barRight"), barWrong: $("barWrong"), tallyRight: $("tallyRight"), tallyWrong: $("tallyWrong"),
    stage: document.querySelector(".card-stage"), card: $("card"), qText: $("qText"), aText: $("aText"), aLabel: $("aLabel"),
    rightBtn: $("rightBtn"), wrongBtn: $("wrongBtn"), undoBtn: $("undoBtn"), shuffleBtn: $("shuffleBtn"), restartBtn: $("restartBtn"),
    ring: $("ring"), donePct: $("donePct"), doneTitle: $("doneTitle"), doneSub: $("doneSub"),
    redoBtn: $("redoBtn"), againBtn: $("againBtn"), shuffleAgainBtn: $("shuffleAgainBtn"), saveNote: $("saveNote"),
    missedWrap: $("missedWrap"), missedList: $("missedList"),
    profileBtn: $("profileBtn"), profileAvatar: $("profileAvatar"), profileLabel: $("profileLabel"),
    profileDialog: $("profileDialog"), profileList: $("profileList"), newName: $("newName"), createProfile: $("createProfile"),
    signOutWrap: $("signOutWrap"), signOutBtn: $("signOutBtn"),
    progressBtn: $("progressBtn"), progressDialog: $("progressDialog"), progressTitle: $("progressTitle"),
    progressBody: $("progressBody"), closeProgress: $("closeProgress"), toast: $("toast"),
  };

  function isArabic(text) {
    const ar = (text.match(/[؀-ۿ]/g) || []).length;
    const lat = (text.match(/[A-Za-z]/g) || []).length;
    return ar > 0 && ar >= lat;
  }
  function setText(node, text) {
    node.textContent = text;
    node.classList.toggle("ar", isArabic(text));
  }
  function modeName(s) {
    if (s.mode === "review") return "Reviewing mistakes" + (s.round > 1 ? " · round " + s.round : "");
    if (s.mode === "weak") return "Practising weak cards";
    return "Full set";
  }

  // ---------- rendering ----------
  function render() {
    renderProfile();
    if (!CARDS.length) {
      el.studyView.innerHTML = '<p class="empty">No flashcards found. Run tools/import_spreadsheet.py to create cards.js.</p>';
      return;
    }
    if (session.done) return renderDone();
    el.doneView.hidden = true;
    el.studyView.hidden = false;

    const { right, wrong, total } = counts();
    const idx = session.log.length;
    const card = byId.get(session.order[idx]);
    el.modeLabel.textContent = modeName(session);
    el.modeLabel.classList.toggle("review", session.mode !== "full");
    el.counterNow.textContent = Math.min(idx + 1, total);
    el.counterTotal.textContent = total;
    el.barRight.style.width = (right / total) * 100 + "%";
    el.barWrong.style.width = (wrong / total) * 100 + "%";
    el.tallyRight.textContent = right;
    el.tallyWrong.textContent = wrong;
    el.undoBtn.disabled = idx === 0;
    el.shuffleBtn.disabled = total - idx < 2;

    setText(el.qText, card.q);
    setText(el.aText, card.a || "");
    el.aLabel.hidden = !card.a; // blank cards stay completely blank
    setFlipped(flipped, true);
  }

  function setFlipped(v, instant) {
    flipped = v;
    if (instant) {
      el.card.style.transition = "none";
      el.card.classList.toggle("flipped", v);
      void el.card.offsetWidth;
      el.card.style.transition = "";
    } else {
      el.card.classList.toggle("flipped", v);
    }
    el.card.setAttribute("aria-label", v ? "Answer side. Press to flip back." : "Question side. Press to reveal the answer.");
  }

  function renderDone() {
    el.studyView.hidden = true;
    el.doneView.hidden = false;
    const { right, wrong, total } = counts();
    const pct = total ? Math.round((right / total) * 100) : 0;
    el.ring.style.setProperty("--pct", pct);
    el.donePct.textContent = pct + "%";
    el.doneTitle.textContent = wrong === 0 ? "Every card correct!" : session.mode === "full" ? "Set complete" : "Review complete";
    el.doneSub.textContent = wrong === 0
      ? `You knew all ${total} card${total === 1 ? "" : "s"}. Excellent work.`
      : `You knew ${right} of ${total}. ${wrong} card${wrong === 1 ? "" : "s"} still need${wrong === 1 ? "s" : ""} work.`;
    el.redoBtn.hidden = wrong === 0;
    el.redoBtn.textContent = `Redo mistakes only (${wrong})`;
    el.saveNote.textContent = currentId
      ? `Saved to ${profiles[currentId].name}'s progress.`
      : "You're studying as a guest. Sign in to keep progress between visits.";

    const missed = session.log.filter((e) => !e.ok);
    el.missedWrap.hidden = missed.length === 0;
    el.missedList.innerHTML = "";
    missed.forEach((e) => {
      const c = byId.get(e.id);
      const li = document.createElement("li");
      const q = document.createElement("div");
      q.className = "mq"; q.dir = "auto"; q.textContent = c.q || "(blank card)";
      li.appendChild(q);
      if (c.a) {
        const a = document.createElement("div");
        a.className = "ma" + (isArabic(c.a) ? " ar" : ""); a.dir = "auto"; a.textContent = c.a;
        li.appendChild(a);
      }
      el.missedList.appendChild(li);
    });
  }

  function renderProfile() {
    const p = currentId && profiles[currentId];
    el.profileAvatar.textContent = p ? initials(p.name) : "?";
    el.profileAvatar.classList.toggle("on", !!p);
    el.profileLabel.textContent = p ? p.name : window.innerWidth < 560 ? "Sign in" : "Guest · Sign in";
  }
  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  }

  // ---------- actions ----------
  function flip() {
    if (busy || session.done) return;
    setFlipped(!flipped);
  }

  function grade(ok) {
    if (busy || session.done) return;
    const id = session.order[session.log.length];
    const prev = record(id, ok);
    session.log.push({ id, ok, prev });
    if (session.log.length >= session.order.length) {
      session.done = true;
      saveSummary();
    }
    saveData();
    saveSession();

    const next = () => { flipped = false; render(); };
    if (reduceMotion) return next();
    busy = true;
    el.stage.classList.add(ok ? "leave-right" : "leave-left");
    setTimeout(() => {
      el.stage.classList.remove("leave-right", "leave-left");
      next();
      if (!session.done) {
        el.stage.classList.add("enter");
        setTimeout(() => el.stage.classList.remove("enter"), 320);
      }
      busy = false;
    }, 260);
  }

  function undo() {
    if (busy || !session.log.length) return;
    if (session.done && session.summarySaved) {
      data.sessions.pop();
      session.summarySaved = false;
    }
    session.done = false;
    unrecord(session.log.pop());
    saveData();
    saveSession();
    flipped = false;
    render();
    toast("Last answer undone");
  }

  function shuffleRemaining() {
    if (busy || session.done) return;
    const idx = session.log.length;
    const rest = session.order.slice(idx);
    if (rest.length < 2) return;
    session.order = session.order.slice(0, idx).concat(shuffle(rest));
    saveSession();
    flipped = false;
    render();
    toast(idx === 0 ? "Cards shuffled" : `Shuffled the ${rest.length} remaining cards`);
  }

  function start(newSession, message) {
    session = newSession;
    flipped = false;
    saveSession();
    render();
    if (message) toast(message);
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  }

  function restartFull(shuffled) {
    const midway = !session.done && session.log.length > 0;
    if (midway && !confirm("Restart the full set? Your place in this round will be lost (answers already given stay in your progress).")) return;
    start(makeSession("full", ALL_IDS, shuffled), shuffled ? "New shuffled round" : "Restarted the full set");
  }

  function redoMistakes() {
    const ids = [...new Set(session.log.filter((e) => !e.ok).map((e) => e.id))];
    if (!ids.length) return;
    const round = session.mode === "review" ? session.round + 1 : 1;
    start(makeSession("review", ids, false, round), `Reviewing ${ids.length} mistake${ids.length === 1 ? "" : "s"}`);
  }

  function practiseWeak() {
    const ids = ALL_IDS.filter((id) => data.cards[id] && data.cards[id].last === "wrong");
    if (!ids.length) return toast("No weak cards right now");
    el.progressDialog.close();
    start(makeSession("weak", ids, true), `Practising ${ids.length} weak card${ids.length === 1 ? "" : "s"}`);
  }

  // ---------- profiles ----------
  function openProfiles() {
    renderProfileList();
    el.signOutWrap.hidden = !currentId;
    el.newName.value = "";
    el.profileDialog.showModal();
  }

  function renderProfileList() {
    const list = Object.entries(profiles).sort((a, b) => a[1].name.localeCompare(b[1].name));
    el.profileList.innerHTML = "";
    if (!list.length) {
      el.profileList.innerHTML = '<div class="empty">No students on this device yet.</div>';
      return;
    }
    list.forEach(([id, p]) => {
      const d = LS.get("tq.p." + id, { sessions: [] }) || { sessions: [] };
      const sessions = (d.sessions || []).length;
      const last = sessions ? new Date(d.sessions[sessions - 1].at).toLocaleDateString() : null;
      const row = document.createElement("div");
      row.className = "profile-row" + (id === currentId ? " active" : "");
      row.innerHTML = `<span class="avatar on"></span><span class="pname"></span><span class="pmeta"></span>
        <button class="icon-btn" type="button" title="Remove student" aria-label="Remove student">×</button>`;
      row.querySelector(".avatar").textContent = initials(p.name);
      row.querySelector(".pname").textContent = p.name + (id === currentId ? " (signed in)" : "");
      row.querySelector(".pmeta").textContent = sessions ? `${sessions} set${sessions === 1 ? "" : "s"} · ${last}` : "No sets yet";
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.addEventListener("click", (e) => {
        if (e.target.closest(".icon-btn")) return removeProfile(id);
        switchProfile(id);
      });
      row.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === row) switchProfile(id); });
      el.profileList.appendChild(row);
    });
  }

  function createProfile() {
    const name = el.newName.value.trim().replace(/\s+/g, " ");
    if (!name) { el.newName.focus(); return; }
    const existing = Object.entries(profiles).find(([, p]) => p.name.toLowerCase() === name.toLowerCase());
    if (existing) return switchProfile(existing[0]);
    const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    profiles[id] = { name, created: Date.now() };
    LS.set("tq.profiles", profiles);
    switchProfile(id);
  }

  function removeProfile(id) {
    const p = profiles[id];
    if (!p || !confirm(`Remove ${p.name} and all of their saved progress from this device?`)) return;
    delete profiles[id];
    LS.set("tq.profiles", profiles);
    LS.del("tq.p." + id);
    LS.del("tq.s." + id);
    if (id === currentId) signOut(true);
    renderProfileList();
    renderProfile();
  }

  function switchProfile(id) {
    if (id === currentId) { el.profileDialog.close(); return; }
    const fromGuest = !currentId;
    const carried = fromGuest && session.log.length > 0 ? session : null;
    saveSession();

    currentId = id;
    LS.set("tq.current", id);
    data = loadData();

    if (fromGuest) {
      // Keep everything the guest did this visit: merge it into this student's record.
      Object.entries(guestData.cards).forEach(([cid, g]) => {
        const c = data.cards[cid] || (data.cards[cid] = { right: 0, wrong: 0, last: null, at: 0 });
        c.right += g.right;
        c.wrong += g.wrong;
        if (g.at >= c.at) { c.last = g.last; c.at = g.at; }
      });
      data.sessions = data.sessions.concat(guestData.sessions).sort((a, b) => a.at - b.at);
      SS.del("tq.s.guest");
      SS.del("tq.g.data");
      guestData = { cards: {}, sessions: [] };
    }
    if (carried) {
      session = carried;
    } else {
      session = loadSession() || makeSession("full", ALL_IDS, false);
    }
    saveData();
    saveSession();
    flipped = false;
    el.profileDialog.close();
    render();
    toast(`Signed in as ${profiles[id].name}` + (carried ? " · this round was saved" : ""));
  }

  function signOut(silent) {
    saveSession();
    currentId = null;
    LS.set("tq.current", null);
    guestData = { cards: {}, sessions: [] };
    data = guestData;
    SS.del("tq.s.guest");
    SS.del("tq.g.data");
    session = makeSession("full", ALL_IDS, false);
    flipped = false;
    if (el.profileDialog.open) el.profileDialog.close();
    render();
    if (!silent) toast("Signed out. Studying as guest.");
  }

  // ---------- progress ----------
  let progressTab = "weak";
  function openProgress() {
    renderProgress();
    el.progressDialog.showModal();
  }

  function renderProgress() {
    const p = currentId && profiles[currentId];
    el.progressTitle.textContent = p ? `${p.name}'s progress` : "Progress this visit";
    const stats = ALL_IDS.map((id) => ({ id, card: byId.get(id), s: data.cards[id] }));
    const studied = stats.filter((x) => x.s);
    const mastered = studied.filter((x) => x.s.last === "right").length;
    const weak = studied.filter((x) => x.s.last === "wrong").length;
    const r = studied.reduce((n, x) => n + x.s.right, 0);
    const w = studied.reduce((n, x) => n + x.s.wrong, 0);
    const acc = r + w ? Math.round((r / (r + w)) * 100) + "%" : "–";

    const body = el.progressBody;
    body.innerHTML = "";
    if (!p) {
      const call = document.createElement("div");
      call.className = "callout";
      call.innerHTML = '<span>As a guest, this resets when you close the tab. Sign in to keep a record for each student.</span>';
      const b = document.createElement("button");
      b.className = "btn btn-primary"; b.type = "button"; b.textContent = "Sign in";
      b.onclick = () => { el.progressDialog.close(); openProfiles(); };
      call.appendChild(b);
      body.appendChild(call);
    }

    const grid = document.createElement("div");
    grid.className = "stats";
    [
      [`${mastered}/${ALL_IDS.length}`, "Cards known"],
      [weak, "Need more work"],
      [`${studied.length}/${ALL_IDS.length}`, "Cards studied"],
      [acc, "Accuracy"],
      [data.sessions.length, "Sets finished"],
    ].forEach(([v, label]) => {
      const d = document.createElement("div");
      d.className = "stat";
      d.innerHTML = "<b></b><span></span>";
      d.querySelector("b").textContent = v;
      d.querySelector("span").textContent = label;
      grid.appendChild(d);
    });
    body.appendChild(grid);

    if (weak) {
      const b = document.createElement("button");
      b.className = "btn btn-primary"; b.type = "button";
      b.textContent = `Practise the ${weak} card${weak === 1 ? "" : "s"} that need work`;
      b.onclick = practiseWeak;
      body.appendChild(b);
    }

    const h = document.createElement("div");
    h.className = "section-title"; h.textContent = "Cards";
    body.appendChild(h);

    const tabs = document.createElement("div");
    tabs.className = "tabs";
    [["weak", "Need work"], ["right", "Known"], ["new", "Not studied"], ["all", "All cards"]].forEach(([key, label]) => {
      const t = document.createElement("button");
      t.type = "button"; t.className = "tab" + (progressTab === key ? " on" : ""); t.textContent = label;
      t.onclick = () => { progressTab = key; renderProgress(); };
      tabs.appendChild(t);
    });
    body.appendChild(tabs);

    let rows = stats;
    if (progressTab === "weak") rows = stats.filter((x) => x.s && x.s.last === "wrong");
    if (progressTab === "right") rows = stats.filter((x) => x.s && x.s.last === "right");
    if (progressTab === "new") rows = stats.filter((x) => !x.s);
    if (progressTab !== "new") rows = rows.slice().sort((a, b) => ((b.s ? b.s.wrong : -1) - (a.s ? a.s.wrong : -1)));

    if (!rows.length) {
      const e = document.createElement("div");
      e.className = "empty"; e.textContent = "No cards here yet.";
      body.appendChild(e);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "table-scroll";
      const table = document.createElement("table");
      table.className = "card-table";
      table.innerHTML = "<thead><tr><th>Question</th><th>Right</th><th>Wrong</th><th>Last</th></tr></thead>";
      const tb = document.createElement("tbody");
      rows.forEach(({ card, s }) => {
        const tr = document.createElement("tr");
        tr.innerHTML = '<td dir="auto"></td><td class="num"></td><td class="num"></td><td class="num"><span class="pill"></span></td>';
        tr.children[0].textContent = card.q || "(blank card)";
        tr.children[1].textContent = s ? s.right : 0;
        tr.children[2].textContent = s ? s.wrong : 0;
        const pill = tr.querySelector(".pill");
        pill.classList.add(s ? s.last : "none");
        pill.textContent = s ? (s.last === "right" ? "Knew it" : "Missed") : "New";
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      wrap.appendChild(table);
      body.appendChild(wrap);
    }

    const h2 = document.createElement("div");
    h2.className = "section-title"; h2.textContent = "Recent sets";
    body.appendChild(h2);
    const list = document.createElement("div");
    list.className = "sessions";
    const recent = data.sessions.slice(-10).reverse();
    if (!recent.length) list.innerHTML = '<div class="empty">No finished sets yet.</div>';
    recent.forEach((s) => {
      const row = document.createElement("div");
      row.className = "session-row";
      const when = new Date(s.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
      row.innerHTML = "<span></span><b></b>";
      row.children[0].textContent = `${when} · ${modeName(s)}`;
      row.children[1].textContent = `${s.right}/${s.total}`;
      list.appendChild(row);
    });
    body.appendChild(list);

    if (p && (studied.length || data.sessions.length)) {
      const foot = document.createElement("div");
      foot.className = "sheet-foot";
      const b = document.createElement("button");
      b.className = "btn btn-ghost"; b.type = "button"; b.textContent = "Reset this student's progress";
      b.onclick = () => {
        if (!confirm(`Clear all saved progress for ${p.name}?`)) return;
        data = { cards: {}, sessions: [] };
        saveData();
        start(makeSession("full", ALL_IDS, false));
        renderProgress();
      };
      foot.appendChild(b);
      body.appendChild(foot);
    }
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200);
  }

  // ---------- events ----------
  el.card.addEventListener("click", flip);
  el.rightBtn.addEventListener("click", () => grade(true));
  el.wrongBtn.addEventListener("click", () => grade(false));
  el.undoBtn.addEventListener("click", undo);
  el.shuffleBtn.addEventListener("click", shuffleRemaining);
  el.restartBtn.addEventListener("click", () => restartFull(false));
  el.redoBtn.addEventListener("click", redoMistakes);
  el.againBtn.addEventListener("click", () => restartFull(false));
  el.shuffleAgainBtn.addEventListener("click", () => restartFull(true));
  el.profileBtn.addEventListener("click", openProfiles);
  el.createProfile.addEventListener("click", createProfile);
  el.newName.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); createProfile(); } });
  el.signOutBtn.addEventListener("click", () => signOut(false));
  el.progressBtn.addEventListener("click", openProgress);
  el.closeProgress.addEventListener("click", () => el.progressDialog.close());
  [el.profileDialog, el.progressDialog].forEach((d) =>
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const onButton = t && t.tagName === "BUTTON";
    switch (e.key) {
      case " ":
      case "Enter":
        if (onButton) return; // let the focused button do its own thing
        e.preventDefault();
        if (!session.done) flip();
        break;
      case "ArrowRight": e.preventDefault(); grade(true); break;
      case "ArrowLeft": e.preventDefault(); grade(false); break;
      case "ArrowUp": case "ArrowDown": if (!session.done) { e.preventDefault(); flip(); } break;
      case "z": case "Z": case "Backspace": e.preventDefault(); undo(); break;
      case "s": case "S": shuffleRemaining(); break;
    }
  });

  render();
})();
