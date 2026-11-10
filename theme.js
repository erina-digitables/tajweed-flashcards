/* Light/dark theme toggle. Loaded in <head> so the saved choice applies before the page draws.
 * With no saved choice the app follows the device's light/dark setting. */
(function () {
  "use strict";
  var KEY = "tq.theme";
  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function saved() {
    try { var v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : null; } catch (e) { return null; }
  }
  function current() {
    return saved() || (media && media.matches ? "dark" : "light");
  }
  function apply(theme) {
    if (theme) root.setAttribute("data-theme", theme); else root.removeAttribute("data-theme");
  }

  apply(saved());

  function syncButtons() {
    var dark = current() === "dark";
    var buttons = document.querySelectorAll(".theme-toggle");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("is-dark", dark);
      var label = dark ? "Switch to light mode" : "Switch to dark mode";
      buttons[i].setAttribute("aria-label", label);
      buttons[i].setAttribute("title", label);
      buttons[i].setAttribute("aria-pressed", dark ? "true" : "false");
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    syncButtons();
    document.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest(".theme-toggle");
      if (!btn) return;
      var next = current() === "dark" ? "light" : "dark";
      try { localStorage.setItem(KEY, next); } catch (err) { /* storage blocked: still switch for this page */ }
      apply(next);
      syncButtons();
    });
    if (media && media.addEventListener) {
      media.addEventListener("change", function () { if (!saved()) syncButtons(); });
    }
  });
})();
