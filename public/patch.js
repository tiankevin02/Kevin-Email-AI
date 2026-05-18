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
