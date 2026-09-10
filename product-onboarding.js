(function initializeProductOnboarding(root) {
  "use strict";

  const STORAGE_KEY = "cham-gpa:onboarding:v1";

  function readPreferences() {
    const defaults = { promptSeen: false, tourCompleted: false, customTipSeen: false };
    try {
      const saved = JSON.parse(root.localStorage.getItem(STORAGE_KEY) || "{}");
      return {
        promptSeen: saved.promptSeen === true,
        tourCompleted: saved.tourCompleted === true,
        customTipSeen: saved.customTipSeen === true,
      };
    } catch (_error) {
      return defaults;
    }
  }

  function mount() {
    const elements = Object.fromEntries([
      "headerHelpButton", "onboardingHelper", "onboardingChecklist", "onboardingChecklistToggle",
      "onboardingHelperLabel", "onboardingChecklistTitle", "closeChecklistButton", "replayTourButton",
      "onboardingWelcome", "onboardingWelcomeTitle", "startTourButton", "dismissWelcomeButton",
      "productTour", "tourProgress", "tourTitle", "tourDescription", "skipTourButton",
      "previousTourButton", "alternateTourButton", "nextTourButton", "coursePlanningPanel",
      "targetGpa", "automaticTab", "customTab", "automaticGenerateButton", "improvementPicker",
    ].map((id) => [id, document.getElementById(id)]));
    if (!elements.productTour || !elements.onboardingWelcome) return null;

    const dimmers = {
      top: elements.productTour.querySelector(".tour-dimmer-top"),
      right: elements.productTour.querySelector(".tour-dimmer-right"),
      bottom: elements.productTour.querySelector(".tour-dimmer-bottom"),
      left: elements.productTour.querySelector(".tour-dimmer-left"),
    };
    const spotlight = elements.productTour.querySelector(".tour-spotlight");
    const tourCard = elements.productTour.querySelector(".tour-card");
    const welcomeCard = elements.onboardingWelcome.querySelector(".onboarding-welcome-card");
    let preferences = readPreferences();
    let progress = { data: false, courses: false, target: false, plan: false };
    let hasCoursePlanning = true;
    let activeTour = null;
    let stepIndex = 0;
    let savedFocus = null;
    let coursePanelWasOpen = null;
    let completedLabelTimer = null;
    let customTourTimer = null;

    const mainSteps = [
      {
        target: ".metric-grid",
        mobileTarget: ".metric-card.metric-primary",
        title: "Hiểu GPA hiện tại",
        description: "GPA hiện tại là chỉ số dùng để đặt mục tiêu. Các thẻ còn lại cho biết GPA có tính F/F+, tín chỉ đã đạt và số môn chưa qua.",
      },
      {
        target: ".progress-panel",
        mobileTarget: ".progress-panel .section-heading",
        title: "Kiểm tra tiến độ học tập",
        description: "Xem môn bắt buộc còn thiếu và tiến độ từng nhóm tự chọn. Hoàn thành các môn này chưa đồng nghĩa đã đủ mọi điều kiện tốt nghiệp.",
      },
      {
        target: ".course-selection-help",
        title: "Chọn môn sẽ học",
        description: "Bật Học cho môn bạn dự định đăng ký, rồi kiểm tra Tính GPA. Môn bắt buộc được chọn sẵn; danh sách phân biệt môn mới và môn đã học nhưng chưa qua.",
        prepare() {
          if (elements.coursePlanningPanel && !elements.coursePlanningPanel.hidden) {
            elements.coursePlanningPanel.open = true;
          }
        },
      },
      {
        target: ".goal-strip",
        title: "Đặt GPA mục tiêu",
        description: "Mục tiêu phải lớn hơn GPA hiện tại và không vượt quá 4. Ví dụ GPA hiện tại là 2,50 thì mục tiêu phải lớn hơn 2,50.",
      },
      {
        target: "#plannerTabs",
        title: "Chọn cách lập kế hoạch",
        description: "Gợi ý tự động tạo ba phương án. Kế hoạch của tôi cho phép khóa điểm hệ 10 ở những môn bạn tự tin và để hệ thống tính phần còn lại.",
      },
    ];
    const customSteps = [
      {
        target: ".custom-course-section",
        title: "Nhập điểm bạn tự tin đạt được",
        description: "Nhập điểm dự kiến từ 4 đến 10. Nếu để trống, Chạm GPA sẽ tính mức điểm tối thiểu cần đạt cho môn đó.",
      },
      {
        target: "#improvementPicker > summary",
        title: "Thêm môn học cải thiện",
        description: "Bạn có thể chọn những môn đã qua nhưng chưa đạt A+ để mô phỏng học cải thiện. Hệ thống chỉ dùng các môn do bạn chủ động chọn.",
      },
    ];

    function savePreferences() {
      try {
        root.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          promptSeen: preferences.promptSeen === true,
          tourCompleted: preferences.tourCompleted === true,
          customTipSeen: preferences.customTipSeen === true,
        }));
      } catch (_error) {
        // The guide remains usable when browser storage is unavailable.
      }
    }

    function visibleChecklistKeys() {
      return hasCoursePlanning ? ["data", "courses", "target", "plan"] : ["data", "target", "plan"];
    }

    function updateChecklist() {
      if (!progress.data) {
        elements.onboardingHelper.hidden = true;
        return;
      }
      elements.onboardingHelper.hidden = false;
      const keys = visibleChecklistKeys();
      document.querySelectorAll("[data-checklist-item]").forEach((item) => {
        const key = item.dataset.checklistItem;
        item.hidden = !keys.includes(key);
        const complete = Boolean(progress[key]);
        item.classList.toggle("is-complete", complete);
        const mark = item.querySelector(".checklist-mark");
        if (mark) mark.textContent = complete ? "✓" : String(keys.indexOf(key) + 1);
      });
      const completeCount = keys.filter((key) => progress[key]).length;
      const allComplete = completeCount === keys.length;
      root.clearTimeout(completedLabelTimer);
      elements.onboardingHelper.classList.toggle("is-complete", allComplete);
      elements.onboardingHelperLabel.textContent = allComplete
        ? "✓ Đã tạo kế hoạch"
        : `Bắt đầu · ${completeCount}/${keys.length}`;
      elements.onboardingChecklistTitle.textContent = allComplete
        ? "Bạn đã tạo xong một kế hoạch"
        : "Bắt đầu với Chạm GPA";
      if (allComplete) {
        completedLabelTimer = root.setTimeout(() => {
          if (progress.plan) elements.onboardingHelperLabel.textContent = "Hướng dẫn";
        }, 2500);
      }
    }

    function setChecklistOpen(open, focus = false) {
      elements.onboardingChecklist.hidden = !open;
      elements.onboardingChecklistToggle.setAttribute("aria-expanded", String(open));
      if (open && focus) elements.closeChecklistButton.focus();
    }

    function focusableWithin(container) {
      return Array.from(container.querySelectorAll("button:not([disabled]):not([hidden]), a[href], input:not([disabled])"))
        .filter((node) => !node.closest("[hidden]"));
    }

    function trapFocus(event, container) {
      if (event.key !== "Tab") return;
      const focusable = focusableWithin(container);
      if (!focusable.length) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function showWelcome() {
      if (!progress.data || preferences.promptSeen || activeTour) return;
      savedFocus = document.activeElement;
      elements.onboardingWelcome.hidden = false;
      document.body.classList.add("onboarding-modal-open");
      root.requestAnimationFrame(() => welcomeCard.focus());
    }

    function closeWelcome(restoreFocus = true) {
      elements.onboardingWelcome.hidden = true;
      document.body.classList.remove("onboarding-modal-open");
      if (restoreFocus && savedFocus instanceof HTMLElement) savedFocus.focus();
    }

    function targetForStep(step) {
      const selector = root.innerWidth <= 680 && step.mobileTarget ? step.mobileTarget : step.target;
      const target = document.querySelector(selector);
      if (!target || target.hidden || target.closest("[hidden]")) return null;
      return target;
    }

    function availableSteps(kind) {
      const source = kind === "custom" ? customSteps : mainSteps;
      return source.filter((step) => targetForStep(step));
    }

    function positionTour() {
      if (!activeTour) return;
      const step = activeTour.steps[stepIndex];
      const target = targetForStep(step);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const gap = 8;
      const viewportWidth = root.innerWidth;
      const viewportHeight = root.innerHeight;
      const left = Math.max(gap, Math.min(viewportWidth - gap, rect.left - gap));
      const top = Math.max(gap, Math.min(viewportHeight - gap, rect.top - gap));
      const right = Math.max(left, Math.min(viewportWidth - gap, rect.right + gap));
      const bottom = Math.max(top, Math.min(viewportHeight - gap, rect.bottom + gap));
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);

      Object.assign(spotlight.style, {
        left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`,
      });
      Object.assign(dimmers.top.style, { left: "0", top: "0", width: "100vw", height: `${top}px` });
      Object.assign(dimmers.bottom.style, { left: "0", top: `${bottom}px`, width: "100vw", height: `${Math.max(0, viewportHeight - bottom)}px` });
      Object.assign(dimmers.left.style, { left: "0", top: `${top}px`, width: `${left}px`, height: `${height}px` });
      Object.assign(dimmers.right.style, { left: `${right}px`, top: `${top}px`, width: `${Math.max(0, viewportWidth - right)}px`, height: `${height}px` });

      if (viewportWidth <= 680) {
        tourCard.style.left = "12px";
        tourCard.style.right = "12px";
        tourCard.style.width = "auto";
        tourCard.style.top = "auto";
        tourCard.style.bottom = "12px";
        return;
      }
      tourCard.style.right = "auto";
      tourCard.style.bottom = "auto";
      const cardWidth = Math.min(410, viewportWidth - 24);
      tourCard.style.width = `${cardWidth}px`;
      const cardHeight = tourCard.getBoundingClientRect().height;
      const cardLeft = Math.max(12, Math.min(viewportWidth - cardWidth - 12, left));
      const below = bottom + 14;
      const cardTop = below + cardHeight <= viewportHeight - 12
        ? below
        : Math.max(12, top - cardHeight - 14);
      tourCard.style.left = `${cardLeft}px`;
      tourCard.style.top = `${cardTop}px`;
    }

    function renderTourStep() {
      if (!activeTour) return;
      const step = activeTour.steps[stepIndex];
      step.prepare?.();
      const target = targetForStep(step);
      if (!target) {
        activeTour.steps.splice(stepIndex, 1);
        if (!activeTour.steps.length) return closeTour();
        if (stepIndex >= activeTour.steps.length) stepIndex = activeTour.steps.length - 1;
        renderTourStep();
        return;
      }
      elements.tourProgress.textContent = `${stepIndex + 1}/${activeTour.steps.length}`;
      elements.tourTitle.textContent = step.title;
      elements.tourDescription.textContent = step.description;
      elements.previousTourButton.disabled = stepIndex === 0;
      const lastStep = stepIndex === activeTour.steps.length - 1;
      elements.alternateTourButton.hidden = !(activeTour.kind === "main" && lastStep);
      elements.nextTourButton.textContent = lastStep
        ? activeTour.kind === "main" ? "Xem gợi ý tự động" : "Xong"
        : "Tiếp theo";
      const previousScrollBehavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      target.scrollIntoView({ behavior: "auto", block: "center" });
      document.documentElement.style.scrollBehavior = previousScrollBehavior;
      root.requestAnimationFrame(() => root.requestAnimationFrame(() => {
        positionTour();
        tourCard.focus();
      }));
    }

    function startTour(kind = "main") {
      const welcomeWasOpen = !elements.onboardingWelcome.hidden;
      const focusBeforeWelcome = savedFocus;
      closeWelcome(false);
      setChecklistOpen(false);
      root.clearTimeout(customTourTimer);
      const steps = availableSteps(kind);
      if (!steps.length) return;
      savedFocus = welcomeWasOpen ? focusBeforeWelcome : document.activeElement;
      if (kind === "main" && elements.coursePlanningPanel && !elements.coursePlanningPanel.hidden) {
        coursePanelWasOpen = elements.coursePlanningPanel.open;
      }
      activeTour = { kind, steps };
      stepIndex = 0;
      elements.productTour.hidden = false;
      elements.productTour.setAttribute("aria-hidden", "false");
      document.body.classList.add("product-tour-open");
      renderTourStep();
    }

    function closeTour(restoreFocus = true) {
      if (!activeTour) return;
      const kind = activeTour.kind;
      activeTour = null;
      elements.productTour.hidden = true;
      elements.productTour.setAttribute("aria-hidden", "true");
      document.body.classList.remove("product-tour-open");
      if (kind === "main" && coursePanelWasOpen !== null && elements.coursePlanningPanel) {
        elements.coursePlanningPanel.open = coursePanelWasOpen;
        coursePanelWasOpen = null;
      }
      if (restoreFocus && savedFocus instanceof HTMLElement) savedFocus.focus();
    }

    function finishMainTour(tab) {
      preferences.promptSeen = true;
      preferences.tourCompleted = true;
      savePreferences();
      closeTour(false);
      const tabButton = tab === "custom" ? elements.customTab : elements.automaticTab;
      tabButton?.click();
      if (tab === "custom" && !preferences.customTipSeen) {
        root.clearTimeout(customTourTimer);
        customTourTimer = root.setTimeout(() => startTour("custom"), 350);
      } else {
        const destination = tab === "custom" ? document.getElementById("customPlanPanel") : elements.automaticGenerateButton;
        destination?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (destination instanceof HTMLButtonElement) destination.focus();
      }
    }

    function finishCustomTour() {
      preferences.customTipSeen = true;
      savePreferences();
      closeTour();
    }

    function skipActiveTour() {
      if (!activeTour) return;
      preferences.promptSeen = true;
      if (activeTour.kind === "custom") preferences.customTipSeen = true;
      savePreferences();
      closeTour();
    }

    function navigateChecklist(action) {
      setChecklistOpen(false);
      if (action === "courses") {
        if (elements.coursePlanningPanel && !elements.coursePlanningPanel.hidden) {
          elements.coursePlanningPanel.open = true;
          elements.coursePlanningPanel.scrollIntoView({ behavior: "smooth", block: "start" });
          elements.coursePlanningPanel.querySelector("summary")?.focus();
        }
        return;
      }
      if (action === "target") {
        elements.targetGpa.scrollIntoView({ behavior: "smooth", block: "center" });
        elements.targetGpa.focus();
        return;
      }
      elements.automaticTab?.click();
      elements.automaticGenerateButton?.scrollIntoView({ behavior: "smooth", block: "center" });
      elements.automaticGenerateButton?.focus();
    }

    elements.onboardingChecklistToggle.addEventListener("click", () => {
      setChecklistOpen(elements.onboardingChecklist.hidden);
    });
    elements.headerHelpButton.addEventListener("click", () => setChecklistOpen(true, true));
    elements.closeChecklistButton.addEventListener("click", () => {
      setChecklistOpen(false);
      elements.onboardingChecklistToggle.focus();
    });
    elements.replayTourButton.addEventListener("click", () => startTour("main"));
    elements.onboardingChecklist.addEventListener("click", (event) => {
      const action = event.target.closest("[data-checklist-action]")?.dataset.checklistAction;
      if (action) navigateChecklist(action);
    });
    elements.startTourButton.addEventListener("click", () => {
      preferences.promptSeen = true;
      savePreferences();
      startTour("main");
    });
    elements.dismissWelcomeButton.addEventListener("click", () => {
      preferences.promptSeen = true;
      savePreferences();
      closeWelcome();
    });
    elements.skipTourButton.addEventListener("click", skipActiveTour);
    elements.previousTourButton.addEventListener("click", () => {
      if (activeTour && stepIndex > 0) {
        stepIndex -= 1;
        renderTourStep();
      }
    });
    elements.nextTourButton.addEventListener("click", () => {
      if (!activeTour) return;
      if (stepIndex < activeTour.steps.length - 1) {
        stepIndex += 1;
        renderTourStep();
      } else if (activeTour.kind === "main") {
        finishMainTour("automatic");
      } else {
        finishCustomTour();
      }
    });
    elements.alternateTourButton.addEventListener("click", () => {
      if (activeTour?.kind === "main") finishMainTour("custom");
    });

    document.addEventListener("click", (event) => {
      if (elements.onboardingChecklist.hidden) return;
      if (!elements.onboardingHelper.contains(event.target) && event.target !== elements.headerHelpButton) {
        setChecklistOpen(false);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (!elements.onboardingWelcome.hidden) {
        if (event.key === "Escape") {
          event.preventDefault();
          preferences.promptSeen = true;
          savePreferences();
          closeWelcome();
        } else trapFocus(event, welcomeCard);
        return;
      }
      if (activeTour) {
        if (event.key === "Escape") {
          event.preventDefault();
          skipActiveTour();
        } else trapFocus(event, tourCard);
        return;
      }
      if (event.key === "Escape" && !elements.onboardingChecklist.hidden) {
        setChecklistOpen(false);
        elements.onboardingChecklistToggle.focus();
      }
    });
    root.addEventListener("resize", positionTour);
    root.addEventListener("scroll", positionTour, { passive: true });

    document.addEventListener("chamgpa:data-ready", (event) => {
      root.clearTimeout(customTourTimer);
      hasCoursePlanning = event.detail?.hasCoursePlanning !== false;
      progress = {
        data: true,
        courses: !hasCoursePlanning,
        target: false,
        plan: false,
      };
      updateChecklist();
      root.requestAnimationFrame(showWelcome);
    });
    document.addEventListener("chamgpa:planner-progress", (event) => {
      const detail = event.detail || {};
      if (detail.reason === "courses") {
        progress.courses = detail.coursesValid === true;
        progress.plan = false;
      }
      if (detail.reason === "target") {
        progress.target = detail.targetValid === true;
        progress.plan = false;
      }
      updateChecklist();
    });
    document.addEventListener("chamgpa:plan-generated", () => {
      progress.courses = true;
      progress.target = true;
      progress.plan = true;
      updateChecklist();
    });
    document.addEventListener("chamgpa:tab-changed", (event) => {
      if (event.detail?.tab !== "custom" || !progress.data || preferences.customTipSeen || activeTour || !elements.onboardingWelcome.hidden) return;
      root.clearTimeout(customTourTimer);
      customTourTimer = root.setTimeout(() => startTour("custom"), 350);
    });
    document.addEventListener("chamgpa:data-reset", () => {
      root.clearTimeout(customTourTimer);
      progress = { data: false, courses: false, target: false, plan: false };
      setChecklistOpen(false);
      closeWelcome(false);
      closeTour(false);
      elements.onboardingHelper.hidden = true;
    });

    return { startTour, updateChecklist };
  }

  document.addEventListener("DOMContentLoaded", () => {
    root.ChamGpaProductOnboarding = mount();
  });
})(globalThis);
