(function initializeOnboarding(root) {
  "use strict";
  root.document.addEventListener("DOMContentLoaded", () => {
    const document = root.document;
    document.getElementById("copyrightYear").textContent = String(new Date().getFullYear());
    const initialPlatform = /Mac/.test(root.navigator.platform) && root.navigator.maxTouchPoints <= 1 ? "macos" : "windows";
    function selectPlatform(platform) {
      if (!["windows", "macos"].includes(platform)) return;
      document.querySelectorAll("[data-platform]").forEach((node) => { node.hidden = node.dataset.platform !== platform; });
      document.querySelectorAll('input[name="platform"]').forEach((input) => { input.checked = input.value === platform; });
    }
    document.querySelectorAll('input[name="platform"]').forEach((input) => {
      input.addEventListener("change", () => selectPlatform(input.value));
    });
    selectPlatform(initialPlatform);
    const address = document.getElementById("extensionsAddress");
    const status = document.getElementById("copyStatus");
    document.getElementById("copyAddressButton").addEventListener("click", async () => {
      try {
        await root.navigator.clipboard.writeText(address.value);
        status.textContent = "Đã sao chép. Mở tab Chrome mới, dán vào thanh địa chỉ và nhấn Enter.";
      } catch {
        address.focus();
        address.select();
        status.textContent = "Chưa sao chép tự động được. Địa chỉ đã được chọn: nhấn Ctrl+C (Windows) hoặc ⌘C (Mac) để sao chép.";
      }
    });
    function revealHash() {
      const target = document.getElementById(root.location.hash.slice(1));
      if (target?.tagName === "DETAILS") target.open = true;
    }
    root.addEventListener("hashchange", revealHash);
    revealHash();
    root.chamGpaConnection = root.ChamGpaConnection.mount();
  });
})(globalThis);
