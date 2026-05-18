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

(() => {
  const enabledKey = "email-ai-auto-sync-enabled";
  const seenKey = "email-ai-auto-sync-seen";
  const intervalMs = 60 * 1000;
  let timer = null;
  let running = false;

  const style = document.createElement("style");
  style.textContent = `
    .autoSyncButton.isOn {
      background: #211f1d;
      color: #fff;
      border-color: #211f1d;
    }
    .autoSyncButton.isChecking {
      opacity: 0.72;
    }
  `;
  document.head.appendChild(style);

  const notifyInApp = (message) => {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(window.__autoSyncToastTimer);
    window.__autoSyncToastTimer = setTimeout(() => toast.classList.add("hidden"), 5200);
  };

  const readSeen = () => {
    try {
      return new Set(JSON.parse(localStorage.getItem(seenKey) || "[]"));
    } catch {
      return new Set();
    }
  };

  const writeSeen = (messages) => {
    const ids = messages.map((message) => `${message.accountEmail || ""}:${message.id}`).filter(Boolean).slice(0, 200);
    localStorage.setItem(seenKey, JSON.stringify(ids));
  };

  const fetchJson = async (path) => {
    const response = await fetch(path, { headers: { "content-type": "application/json" } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "同期に失敗しました");
    return body;
  };

  const showSystemNotification = (messages) => {
    if (!("Notification" in window) || Notification.permission !== "granted" || !messages.length) return;
    const first = messages[0];
    const title = messages.length === 1 ? "新しいメールが届きました" : `新しいメールが${messages.length}件届きました`;
    const body = messages.length === 1
      ? `${first.from?.name || first.from?.email || "送信者不明"}: ${first.subject || "(件名なし)"}`
      : `${first.subject || "(件名なし)"} ほか`;
    const notification = new Notification(title, {
      body,
      icon: "/icons/icon.svg",
      tag: "email-ai-new-mail"
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  };

  const checkMail = async ({ baseline = false } = {}) => {
    if (running) return;
    running = true;
    button.classList.add("isChecking");
    try {
      const status = await fetchJson("/api/status");
      if (!status.gmailConnected) return;

      const params = new URLSearchParams({
        q: "in:inbox newer_than:7d",
        max: "20",
        mode: "metadata",
        account: "all"
      });
      const body = await fetchJson(`/api/messages?${params}`);
      const messages = body.messages || [];
      const seen = readSeen();
      const fresh = messages.filter((message) => !seen.has(`${message.accountEmail || ""}:${message.id}`));
      writeSeen(messages);

      if (!baseline && fresh.length) {
        notifyInApp(`新しいメールが${fresh.length}件届きました。同期します。`);
        showSystemNotification(fresh);
        if (typeof window.loadMessages === "function") window.loadMessages();
      }
    } catch (error) {
      notifyInApp(error.message);
    } finally {
      running = false;
      button.classList.remove("isChecking");
    }
  };

  const start = () => {
    localStorage.setItem(enabledKey, "1");
    button.classList.add("isOn");
    button.textContent = "自動同期 ON";
    clearInterval(timer);
    checkMail({ baseline: true });
    timer = setInterval(() => checkMail(), intervalMs);
  };

  const stop = () => {
    localStorage.setItem(enabledKey, "0");
    button.classList.remove("isOn");
    button.textContent = "自動同期";
    clearInterval(timer);
    timer = null;
  };

  const headerActions = document.querySelector(".headerActions");
  if (!headerActions) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "utilityButton autoSyncButton";
  button.textContent = "自動同期";
  headerActions.insertBefore(button, document.getElementById("loadButton"));

  button.addEventListener("click", async () => {
    if (localStorage.getItem(enabledKey) === "1") {
      stop();
      notifyInApp("自動同期をオフにしました。");
      return;
    }

    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
    start();
    const notificationsOn = "Notification" in window && Notification.permission === "granted";
    notifyInApp(notificationsOn ? "自動同期と通知をオンにしました。" : "自動同期をオンにしました。通知はブラウザで許可すると届きます。");
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && localStorage.getItem(enabledKey) === "1") checkMail();
  });

  if (localStorage.getItem(enabledKey) === "1") start();
})();
