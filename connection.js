(function initializeConnection(root) {
  "use strict";

  function createClient({ onState = () => {}, onData, probeMs = 2000, connectMs = 30000 } = {}) {
    let state = { status: "checking", version: "", message: "" };
    let probeId = null;
    let requestId = null;
    let probeTimer;
    let connectTimer;
    let canConnect = false;
    let legacyPending = Boolean(onData && new URLSearchParams(root.location.hash.slice(1)).get("handoff"));
    const id = () => root.crypto.randomUUID();
    const post = (type, detail = {}) => root.postMessage({ source: "ULSA_GPA_WEB", type, ...detail }, root.location.origin);
    const update = (status, message = "") => { state = { ...state, status, message }; onState({ ...state }); };

    function check() {
      if (requestId || legacyPending || probeId) return;
      probeId = id();
      // Preserve the reason for retrying (expired login or a failed import) on focus.
      const preserveStatus = ["auth", "error", "success"].includes(state.status);
      if (!preserveStatus) update("checking");
      probeTimer = root.setTimeout(() => {
        probeId = null;
        canConnect = false;
        update("unavailable", "Có thể tiện ích chưa cài, đang tắt hoặc trang chưa được tải lại. Hãy kiểm tra trong cùng hồ sơ Chrome.");
      }, probeMs);
      post("CHAM_GPA_PING", { requestId: probeId });
    }

    function connect() {
      if (!onData || !canConnect || requestId || legacyPending) return;
      root.clearTimeout(probeTimer);
      probeId = null;
      requestId = id();
      update("connecting", "Đang lấy bảng điểm và chương trình đào tạo từ cổng sinh viên…");
      connectTimer = root.setTimeout(() => {
        requestId = null;
        update("error", "Cổng trường phản hồi quá lâu. Hãy kiểm tra trang trường rồi thử kết nối lại.");
      }, connectMs);
      post("CHAM_GPA_CONNECT", { requestId });
    }

    function cancel() {
      root.clearTimeout(connectTimer);
      root.clearTimeout(probeTimer);
      requestId = null;
      probeId = null;
      legacyPending = false;
      update(canConnect ? "ready" : "unavailable");
    }

    function receive(event) {
      if (event.source !== root || event.origin !== root.location.origin || event.data?.source !== "ULSA_GPA_EXTENSION") return;
      const data = event.data;
      if (data.type === "CHAM_GPA_STATUS") {
        if (!probeId || data.requestId !== probeId) return;
        root.clearTimeout(probeTimer);
        probeId = null;
        state.version = typeof data.version === "string" && /^\d+(\.\d+){1,3}$/.test(data.version) ? data.version : "không rõ";
        canConnect = Array.isArray(data.capabilities) && data.capabilities.includes("connectFromWeb");
        if (!canConnect) return update("outdated", "Tiện ích này chưa hỗ trợ kết nối từ website. Cập nhật bản mới hoặc dùng Phân tích GPA trong popup.");
        if (!["auth", "error", "success"].includes(state.status)) update("ready");
        else onState({ ...state });
        return;
      }
      if (!["ULSA_GPA_DATA", "ULSA_GPA_IMPORT_ERROR"].includes(data.type)) return;
      const matchingRequest = requestId && data.requestId === requestId;
      const matchingLegacy = legacyPending && !data.requestId;
      if (!matchingRequest && !matchingLegacy) return;
      root.clearTimeout(connectTimer);
      requestId = null;
      legacyPending = false;
      if (data.type === "ULSA_GPA_IMPORT_ERROR") {
        update(data.code === "AUTH_REQUIRED" ? "auth" : "error", data.message || "Không thể nhận bảng điểm. Hãy thử lại hoặc import Excel.");
        return;
      }
      try {
        onData(data.payload);
        post("ULSA_GPA_IMPORT_ACK", { requestId: data.requestId });
        update("success", "Bảng điểm đã sẵn sàng. Bạn có thể bắt đầu lập kế hoạch.");
      } catch (error) {
        // Never acknowledge a payload that failed domain validation/import.
        update("error", error?.message || "Bảng điểm không đúng định dạng. Hãy kết nối lại.");
      }
    }

    root.addEventListener("message", receive);
    const onFocus = () => check();
    root.addEventListener("focus", onFocus);
    if (legacyPending) {
      update("connecting", "Đang nhận bảng điểm từ tiện ích…");
      connectTimer = root.setTimeout(() => {
        legacyPending = false;
        update("error", "Không nhận được bảng điểm. Hãy mở lại tiện ích hoặc dùng file Excel dự phòng.");
        check();
      }, connectMs);
      post("ULSA_GPA_WEB_READY");
    } else check();
    return { check, connect, cancel, getState: () => ({ ...state, canConnect }), destroy() {
      cancel();
      root.removeEventListener("message", receive);
      root.removeEventListener("focus", onFocus);
    } };
  }

  function mount({ onData } = {}) {
    const document = root.document;
    const panel = document.querySelector("[data-extension-connection]");
    if (!panel) return null;
    const title = panel.querySelector("[data-connection-title]");
    const message = panel.querySelector("[data-connection-message]");
    const install = panel.querySelector("[data-connection-install]");
    const connect = panel.querySelector("[data-connection-connect]");
    const retry = panel.querySelector("[data-connection-retry]");
    const home = panel.querySelector("[data-connection-home]");
    const labels = {
      checking: "Đang kiểm tra tiện ích…", unavailable: "Chưa kết nối được Chạm GPA",
      ready: "Đã kết nối Chạm GPA", outdated: "Cần cập nhật tiện ích",
      connecting: "Đang lấy bảng điểm…", auth: "Cần đăng nhập cổng sinh viên",
      error: "Chưa lấy được bảng điểm", success: "Đã nhận bảng điểm",
    };
    const mobile = /Android|iPhone|iPad|iPod/i.test(root.navigator.userAgent) ||
      (/Mac/.test(root.navigator.platform) && root.navigator.maxTouchPoints > 1);
    document.querySelectorAll("[data-mobile-note]").forEach((node) => { node.hidden = !mobile; });
    const client = createClient({ onData, onState(state) {
      panel.dataset.state = state.status;
      title.textContent = labels[state.status] + (state.status === "ready" ? ` · v${state.version}` : "");
      message.textContent = state.message || (state.status === "ready"
        ? "Dùng phiên đăng nhập ULSA trong cùng Chrome. Không nhập tài khoản hoặc mật khẩu vào Chạm GPA."
        : "Cài một lần để chuyển bảng điểm sang kế hoạch của bạn.");
      const ready = ["ready", "auth", "error", "success", "connecting"].includes(state.status);
      if (install) {
        install.hidden = ready || state.status === "checking";
        install.textContent = state.status === "outdated" ? "Cập nhật Chạm GPA" : "Cài tiện ích Chạm GPA";
        install.href = state.status === "outdated" ? "install.html#update" : "install.html";
      }
      if (connect) {
        connect.hidden = !onData || !ready;
        connect.disabled = state.status === "connecting";
        connect.textContent = state.status === "auth" ? "Tôi đã đăng nhập — Kết nối lại"
          : state.status === "connecting" ? "Đang lấy bảng điểm…" : "Kết nối bảng điểm";
      }
      retry.disabled = ["checking", "connecting"].includes(state.status);
      retry.textContent = state.status === "unavailable" ? "Đã cài? Kiểm tra lại" : "Kiểm tra lại tiện ích";
      if (home) home.hidden = !ready || state.status === "connecting";
    } });
    retry.addEventListener("click", () => client.check());
    connect?.addEventListener("click", () => {
      // Connection errors without a successful probe must not expose a dead button.
      if (client.getState().canConnect) client.connect(); else client.check();
    });
    panel.querySelector("[data-connection-refresh]")?.addEventListener("click", () => root.location.reload());
    return client;
  }

  root.ChamGpaConnection = { createClient, mount };
})(globalThis);
