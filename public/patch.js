(() => {
  const isLocalHost = (host) => host === "localhost" || host === "127.0.0.1" || /^192\.168\./.test(host);
  const button = document.getElementById("mobileShareButton");
  if (!button || isLocalHost(location.hostname)) return;

  button.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const panel = document.getElementById("mobileSharePanel");
      const link = document.getElementById("mobileShareLink");
      const qr = document.getElementById("mobileShareQr");
      const url = location.origin + "/";
      if (!panel || !link || !qr) return;
      link.textContent = url;
      link.href = url;
      qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
      panel.classList.toggle("hidden");
      if (!panel.classList.contains("hidden")) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
    true
  );
})();

(() => {
  const narrowQuery = "(max-width: 760px)";
  const workspace = () => document.querySelector(".workspace");
  const readPane = () => document.querySelector(".readPane");

  const style = document.createElement("style");
  style.textContent = `
    .mobileBackButton {
      display: none;
      width: fit-content;
      margin-bottom: 10px;
      background: #211f1d;
      color: #fff;
    }
    @media (max-width: 760px) {
      .workspace.mobileReading .messagePane {
        display: none;
      }
      .workspace.mobileReading .readPane {
        min-height: calc(100dvh - 16px);
      }
      .mobileBackButton {
        display: inline-flex;
        position: sticky;
        top: 8px;
        z-index: 5;
      }
    }
  `;
  document.head.appendChild(style);

  const back = document.createElement("button");
  back.type = "button";
  back.className = "mobileBackButton";
  back.textContent = "メール一覧へ";
  readPane()?.prepend(back);

  const closeReader = () => {
    workspace()?.classList.remove("mobileReading");
    requestAnimationFrame(() => document.getElementById("messageList")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

  back.addEventListener("click", closeReader);

  const openReader = () => {
    if (!matchMedia(narrowQuery).matches) return;
    const area = workspace();
    area?.classList.add("mobileReading");
    requestAnimationFrame(() => area?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  if (typeof window.selectMessage === "function") {
    const originalSelectMessage = window.selectMessage;
    window.selectMessage = async (...args) => {
      const result = await originalSelectMessage(...args);
      openReader();
      return result;
    };
  }

  if (typeof window.showInsight === "function") {
    const originalShowInsight = window.showInsight;
    window.showInsight = (...args) => {
      closeReader();
      return originalShowInsight(...args);
    };
  }

  matchMedia(narrowQuery).addEventListener("change", (event) => {
    if (!event.matches) workspace()?.classList.remove("mobileReading");
  });
})();

(() => {
  const applyMobileControlScroll = () => {
    if (!matchMedia("(max-width: 760px)").matches) return;
    const collapsed = window.scrollY > 2;
    document.body.classList.toggle("controlsCollapsed", collapsed);
    document.getElementById("controlToggleButton")?.setAttribute("aria-expanded", String(!collapsed));
  };

  window.addEventListener("scroll", applyMobileControlScroll, { passive: true });
  window.addEventListener("resize", applyMobileControlScroll);
  applyMobileControlScroll();
})();
