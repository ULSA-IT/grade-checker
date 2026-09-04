(function exposeScoreInput(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.UlsaScoreInput = api;
})(globalThis, function createScoreInput() {
  "use strict";

  // Allow incomplete edits (e.g. "1" on the way to "10"). The domain still
  // validates the final lower bound and whether an improvement raises GPA.
  function isAllowedDraft(value) {
    return /^\d*(?:[.,]\d{0,2})?$/.test(value) &&
      (value === "" || value === "." || value === "," || Number(value.replace(",", ".")) <= 10);
  }

  function attach(input) {
    let previousValue = isAllowedDraft(input.value) ? input.value : "";
    let previousStart = previousValue.length;
    let previousEnd = previousValue.length;

    input.addEventListener("beforeinput", (event) => {
      previousStart = input.selectionStart;
      previousEnd = input.selectionEnd;
      // Composition, undo and non-cancelable edits are checked by the input
      // fallback, which also covers autofill and paste without event.data.
      if (!event.cancelable || event.isComposing || !event.inputType?.startsWith("insert")) return;
      const inserted = event.data ?? event.dataTransfer?.getData("text/plain");
      if (inserted == null) return;
      const candidate = input.value.slice(0, input.selectionStart) + inserted +
        input.value.slice(input.selectionEnd);
      if (!isAllowedDraft(candidate)) event.preventDefault();
    });

    input.addEventListener("input", (event) => {
      if (!isAllowedDraft(input.value)) {
        input.value = previousValue;
        input.setSelectionRange(previousStart, previousEnd);
        // A rejected edit must not change the stored plan or mark it stale.
        event.stopImmediatePropagation();
        return;
      }
      previousValue = input.value;
      previousStart = input.selectionStart;
      previousEnd = input.selectionEnd;
    });
  }

  return { attach, isAllowedDraft };
});
