(function () {
  "use strict";
  function initTabs() {
    const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
    const panels = Array.from(document.querySelectorAll('[role="tabpanel"]'));

    function activate(tab) {
      const panelId = tab.getAttribute("aria-controls");
      tabs.forEach((t) => {
        const active = t === tab;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", String(active));
        t.tabIndex = active ? 0 : -1;
      });
      panels.forEach((p) => {
        const active = p.id === panelId;
        p.classList.toggle("active", active);
        p.hidden = !active;
      });
      window.SynthXState.data.activeTab = tab.id;
      window.SynthXLogger?.log("tab", tab.id);
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", (event) => {
        const index = tabs.indexOf(tab);
        if (event.key === "ArrowRight") { event.preventDefault(); tabs[(index + 1) % tabs.length].focus(); }
        if (event.key === "ArrowLeft") { event.preventDefault(); tabs[(index - 1 + tabs.length) % tabs.length].focus(); }
        if (event.key === "Home") { event.preventDefault(); tabs[0]?.focus(); }
        if (event.key === "End") { event.preventDefault(); tabs[tabs.length - 1]?.focus(); }
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(tab); }
      });
    });
  }
  window.SynthXTabs = { init: initTabs };
})();
