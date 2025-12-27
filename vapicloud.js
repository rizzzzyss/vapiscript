(function() {
  'use strict';
  
  // Wait for DOM to be ready
  function init() {
    
    // ============================================
    // EXISTING CONSTANTS (UNCHANGED)
    // ============================================
    
    const ASSISTANT_ID = "f672758a-e394-4c2e-a0f1-f82e85273f35",
      CREATE_CALL_ENDPOINT = "https://vapi-ws-bridge.rizwin.workers.dev/",
      BRIDGE_SECRET = null,
      UI_EVENT_ENDPOINT = null,
      AUDIO_CONFIG = {
        workletBufferSize: 512,
        outputSampleRate: 16000,
        connectionTimeoutMs: 8000,
        minQueueAheadSec: .05,
        maxQueueAheadSec: .8
      },
      STATUS_CONFIG = {
        IDLE_TIMEOUT_MS: 8000,
        IDLE_REMINDER_INTERVAL_MS: 15000,
        USER_SPEAKING_DECAY_MS: 800,
        AI_SPEAKING_DECAY_MS: 500
      },
      STATUS_MESSAGES = {
        connecting: "Connecting...",
        listening: "Listening...",
        userSpeaking: "You're speaking...",
        aiSpeaking: "AI speaking...",
        idle: ["Still there? 👋", "Say something...", "Tap or speak 🎤", "Hello? 👂"],
        processing: "Processing..."
      },
      VAD_CONFIG = {
        speechThreshold: .018,
        silenceThreshold: .008,
        speechCheckIntervalMs: 50,
        minSpeechDurationMs: 100,
        debug: false
      };

    // ============================================
    // NEW CONSTANTS (BRD FEATURE)
    // ============================================
    
    // !!! IMPORTANT: UPDATE THESE WITH YOUR WORKER URLs !!!
    const GEMINI_WORKER_URL = "https://geminiworker.rizwin.workers.dev"; 
    const RESEND_WORKER_URL = "https://resendworker.rizwin.workers.dev"; 
    const WORKER_SECRET = "xK9#mP2$vL5nQ8wR"; // Set if you configured WORKER_SECRET in your workers
    const BRD_PDF_WORKER_URL = "https://brd-pdf-link.rizwin.workers.dev";

    const ADMIN_EMAIL = "rizwinazeez@gmail.com";
    
    const BRD_CONFIG = {
      generateDesignFor: ["Website Development"],
      maxUploadSizeMB: 5
    };

    // ============================================
    // EXISTING DOM REFERENCES (UNCHANGED)
    // ============================================

    const pillWrap = document.getElementById("vapi-ws-pill"),
      pill = document.getElementById("vapiCallBtn"),
      icon = document.getElementById("vapiBtnIcon"),
      overlay = document.getElementById("vapiOverlay"),
      vapiTitle = document.getElementById("vapiTitle"),
      vapiSub = document.getElementById("vapiSub"),
      backBtn = document.getElementById("vapiBackBtn"),
      closeBtn = document.getElementById("vapiCloseBtn"),
      screenCards = document.getElementById("vapiScreenCards"),
      screenQuestion = document.getElementById("vapiScreenQuestion"),
      screenPreview = document.getElementById("vapiScreenPreview"),
      screenEmail = document.getElementById("vapiScreenEmail"),
      cardsGrid = document.getElementById("vapiCardsGrid"),
      hintEl = document.getElementById("vapiHint"),
      confirmMultiBtn = document.getElementById("vapiConfirmMultiBtn"),
      questionTextEl = document.getElementById("vapiQuestionText"),
      textInput = document.getElementById("vapiTextInput"),
      submitTextBtn = document.getElementById("vapiSubmitTextBtn"),
      previewHtmlEl = document.getElementById("vapiPreviewHtml"),
      previewLinkEl = document.getElementById("vapiPreviewLink"),
      approveBtn = document.getElementById("vapiApproveBtn"),
      emailInput = document.getElementById("vapiEmailInput"),
      sendEmailBtn = document.getElementById("vapiSendEmailBtn"),
      statusIndicator = document.getElementById("vapiStatusIndicator"),
      statusText = document.getElementById("vapiStatusText"),
      statusIcon = document.getElementById("vapiStatusIcon");

    // ============================================
    // NEW DOM REFERENCES (BRD FEATURE)
    // ============================================
    
    const screenLoading = document.getElementById("vapiScreenLoading"),
      loadingText = document.getElementById("vapiLoadingText"),
      loadingProgress = document.getElementById("vapiLoadingProgress");
    
    const screenBRD = document.getElementById("vapiScreenBRD"),
      brdContent = document.getElementById("vapiBRDContent"),
      brdResetBtn = document.getElementById("vapiBRDResetBtn"),
      brdDesignSection = document.getElementById("vapiBRDDesignSection"),
      brdDesignPreview = document.getElementById("vapiBRDDesignPreview"),
      brdDesignImage = document.getElementById("vapiBRDDesignImage"),
      brdDesignCaption = document.getElementById("vapiBRDDesignCaption"),
      brdUploadBtn = document.getElementById("vapiBRDUploadBtn"),
      brdUploadInput = document.getElementById("vapiBRDUploadInput"),
      brdUploadPreview = document.getElementById("vapiBRDUploadPreview"),
      brdEmailInput = document.getElementById("vapiBRDEmailInput"),
      brdSubmitBtn = document.getElementById("vapiBRDSubmitBtn");
    
    const screenSuccess = document.getElementById("vapiScreenSuccess"),
      successEmail = document.getElementById("vapiSuccessEmail"),
      successNewBtn = document.getElementById("vapiSuccessNewBtn"),
      successDownloadBtn = document.getElementById("vapiSuccessDownloadBtn");

    if (!pill || !icon || !overlay) {
      console.error('[Vapi] Required DOM elements not found.');
      return;
    }

    console.log('[Vapi] Initializing voice assistant...');

    // ============================================
    // STATE VARIABLES
    // ============================================

    let pendingToolCallId = null,
      pendingToolName = null,
      socket = null,
      playCtx,
      nextPlayTime = 0,
      analyser,
      analyserData,
      isActive = false,
      aiLastLoudAt = 0,
      stream,
      audioContext,
      workletNode,
      source;

    const AI_LEVEL_START = .055,
      AI_LEVEL_END = .03,
      AI_END_HOLD_MS = 450;

    window.vapiAudioLevel = window.vapiAudioLevel || 0;
    window.vapiIsSpeaking = window.vapiIsSpeaking || false;

    const statusState = {
      current: "idle",
      lastUserSpeechTime: 0,
      lastAiSpeechTime: 0,
      idleTimeoutId: null,
      idleReminderIndex: 0,
      isActive: false,
      inputAudioLevel: 0,
      isSpeechActive: false,
      speechStartTime: 0,
      speechCheckInterval: null
    };

    // ============================================
    // BRD MODE LOCK - Blocks ALL AI commands
    // ============================================
    let inBRDMode = false;
    
    let generatedBRD = {
      originalHtml: "",
      html: "",
      designImageBase64: null,
      designImageUrl: null,
      designSource: null,
      userUploadedImageBase64: null,
      userUploadedImageName: null,
      pdfBase64: null,
      pdfBlob: null,
      pdfFilename: null
    };


const wrap = document.getElementById("vapi-ws-pill");
const btn  = document.getElementById("vapiCallBtn");

btn?.addEventListener("click", () => {
  wrap?.classList.add("is-open");
});

document.getElementById('vapiSuccessCloseBtn')?.addEventListener('click', () => {
  inBRDMode = false;
  
  window.__vapiUi.collected = {};
  window.__vapiUi.selected.clear();
  window.__vapiUi.flow = null;
  window.__vapiUi.step = null;
  window.__vapiUi.pendingField = null;
  window.__vapiUi.lastCategory = null;
  
  generatedBRD = { 
    originalHtml: "", 
    html: "", 
    designImageBase64: null, 
    designImageUrl: null, 
    designSource: null, 
    userUploadedImageBase64: null, 
    userUploadedImageName: null, 
    pdfBase64: null, 
    pdfBlob: null, 
    pdfFilename: null,
    downloadUrl: null
  };
  
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('vapi-overlay-open');
  
  [screenCards, screenQuestion, screenPreview, screenEmail, screenLoading, screenBRD, screenSuccess].forEach(s => {
    if (s) s.classList.remove('is-active');
  });
  
  if (closeBtn) closeBtn.style.display = '';
  if (backBtn) backBtn.style.display = '';
});


function initBRDScrollHint() {
  const card = document.getElementById('vapiCard');
  const hint = document.getElementById('scrollHint');
  
  if (!card || !hint) return;
  
  hint.style.opacity = '1';
  
  setTimeout(() => {
    card.scrollTo({ top: 80, behavior: 'smooth' });
    setTimeout(() => {
      card.scrollTo({ top: 0, behavior: 'smooth' });
    }, 800);
  }, 500);
  
  card.onscroll = function() {
    const isAtBottom = this.scrollHeight - this.scrollTop <= this.clientHeight + 100;
    hint.style.opacity = isAtBottom ? '0' : '1';
  };
}
    
    
    // ============================================
    // STATUS INDICATOR FUNCTIONS
    // ============================================

    function updateStatusIndicator(e, t = null) {
      if (!statusIndicator || !statusState.isActive) return;
      if (e === "listening" && statusState.current === "aiSpeaking" && window.vapiIsSpeaking) return;
      statusState.current = e;
      statusIndicator.classList.remove("state-connecting", "state-listening", "state-user-speaking", "state-ai-speaking", "state-idle");
      const n = statusIcon?.querySelector(".mic-icon"),
        i = statusIcon?.querySelector(".speaker-icon"),
        s = statusIcon?.querySelector(".wave-icon");
      n && (n.style.display = "none");
      i && (i.style.display = "none");
      s && (s.style.display = "none");
      let a = t;
      switch (e) {
        case "connecting":
          statusIndicator.classList.add("state-connecting");
          n && (n.style.display = "block");
          a = a || STATUS_MESSAGES.connecting;
          break;
        case "listening":
          statusIndicator.classList.add("state-listening");
          n && (n.style.display = "block");
          a = a || STATUS_MESSAGES.listening;
          resetIdleTimer();
          break;
        case "userSpeaking":
          statusIndicator.classList.add("state-user-speaking");
          s && (s.style.display = "block");
          a = a || STATUS_MESSAGES.userSpeaking;
          clearIdleTimer();
          break;
        case "aiSpeaking":
          statusIndicator.classList.add("state-ai-speaking");
          i && (i.style.display = "block");
          a = a || STATUS_MESSAGES.aiSpeaking;
          clearIdleTimer();
          break;
        case "idle":
          statusIndicator.classList.add("state-idle");
          n && (n.style.display = "block");
          const o = STATUS_MESSAGES.idle;
          a = a || o[statusState.idleReminderIndex % o.length];
          statusState.idleReminderIndex++;
          scheduleIdleReminder();
          break;
        case "processing":
          statusIndicator.classList.add("state-listening");
          n && (n.style.display = "block");
          a = a || STATUS_MESSAGES.processing;
          break;
      }
      statusText && (statusText.textContent = a);
    }

    function resetIdleTimer() {
      clearIdleTimer();
      statusState.idleTimeoutId = setTimeout(() => {
        statusState.isActive && statusState.current === "listening" && updateStatusIndicator("idle");
      }, STATUS_CONFIG.IDLE_TIMEOUT_MS);
    }

    function clearIdleTimer() {
      statusState.idleTimeoutId && (clearTimeout(statusState.idleTimeoutId), statusState.idleTimeoutId = null);
    }

    function scheduleIdleReminder() {
      clearIdleTimer();
      statusState.idleTimeoutId = setTimeout(() => {
        statusState.isActive && statusState.current === "idle" && updateStatusIndicator("idle");
      }, STATUS_CONFIG.IDLE_REMINDER_INTERVAL_MS);
    }

    function showStatusIndicator() {
      statusIndicator && (statusIndicator.style.display = "flex", statusState.isActive = true, statusState.idleReminderIndex = 0, document.body.classList.add("vapi-call-active"));
    }

    function hideStatusIndicator() {
      statusIndicator && (statusIndicator.style.display = "none", statusState.isActive = false, clearIdleTimer(), stopVADCheck(), document.body.classList.remove("vapi-call-active"));
    }

    // ============================================
    // VAD FUNCTIONS
    // ============================================

    function calculateRMS(e) {
      let t = 0;
      for (let n = 0; n < e.length; n++) {
        const i = e[n] / 32768;
        t += i * i;
      }
      return Math.sqrt(t / e.length);
    }

    function processAudioForVAD(e) {
      if (window.vapiIsSpeaking) return;
      const t = new Int16Array(e),
        n = calculateRMS(t);
      statusState.inputAudioLevel = n;
      const i = Date.now();
      n > VAD_CONFIG.speechThreshold && (statusState.lastUserSpeechTime = i, statusState.isSpeechActive || (statusState.speechStartTime = i, statusState.isSpeechActive = true, setTimeout(() => {
        statusState.isSpeechActive && Date.now() - statusState.speechStartTime >= VAD_CONFIG.minSpeechDurationMs && onUserSpeechDetected();
      }, VAD_CONFIG.minSpeechDurationMs)));
    }

    function startVADCheck() {
      stopVADCheck();
      statusState.speechCheckInterval = setInterval(() => {
        if (statusState.isSpeechActive) {
          Date.now() - statusState.lastUserSpeechTime > STATUS_CONFIG.USER_SPEAKING_DECAY_MS && (statusState.isSpeechActive = false, onUserSpeechEnded());
        }
      }, VAD_CONFIG.speechCheckIntervalMs);
    }

    function stopVADCheck() {
      statusState.speechCheckInterval && (clearInterval(statusState.speechCheckInterval), statusState.speechCheckInterval = null);
      statusState.isSpeechActive = false;
      statusState.inputAudioLevel = 0;
    }

    function onUserSpeechDetected() {
      window.vapiIsSpeaking || statusState.current !== "userSpeaking" && updateStatusIndicator("userSpeaking");
    }

    function onUserSpeechEnded() {
      window.vapiIsSpeaking || statusState.current === "userSpeaking" && updateStatusIndicator("listening");
    }

    function onAiSpeechStarted() {
      statusState.lastAiSpeechTime = Date.now();
      updateStatusIndicator("aiSpeaking");
    }

    function onAiSpeechEnded() {
      setTimeout(() => {
        statusState.current === "aiSpeaking" && !window.vapiIsSpeaking && updateStatusIndicator("listening");
      }, STATUS_CONFIG.AI_SPEAKING_DECAY_MS);
    }

    // ============================================
    // BUTTON STATE
    // ============================================

    const buttonConfig = {
      idle: { color: "rgb(37, 211, 102)", icon: "https://unpkg.com/lucide-static@0.321.0/icons/phone.svg" },
      loading: { color: "rgb(93, 124, 202)", icon: "https://unpkg.com/lucide-static@0.321.0/icons/loader-2.svg" },
      active: { color: "rgb(255, 0, 0)", icon: "https://unpkg.com/lucide-static@0.321.0/icons/phone-off.svg" }
    };

    function setState(e) {
      const t = buttonConfig[e];
      pill.style.background = t.color;
      icon.src = t.icon;
      e === "idle" ? (pill.style.animation = "vapi-pulse-ring 2s infinite", icon.style.animation = "none") : e === "loading" ? (pill.style.animation = "none", icon.style.animation = "vapi-spin 1s linear infinite") : (pill.style.animation = "none", icon.style.animation = "none");
    }

    setState("idle");

    // ============================================
    // UI STATE
    // ============================================

    window.__vapiUi = window.__vapiUi || {
      flow: null, step: null, pendingField: null, mode: "single", max: 1, selected: new Set, collected: {}, lastCategory: null
    };

    function setHeader(e, t) {
      vapiTitle && (vapiTitle.textContent = e || "");
      vapiSub && (vapiSub.textContent = t || "");
    }

    function showOverlay() {
      overlay.classList.add("is-open");
      overlay.setAttribute("aria-hidden", "false");
      document.body.classList.add("vapi-overlay-open");
    }

    // MODIFIED: Block hide when in BRD mode
    function hideOverlay() {
      if (inBRDMode) {
        console.log("[hideOverlay] BLOCKED - in BRD mode");
        return;
      }
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden", "true");
      window.__vapiUi.selected.clear();
      document.body.classList.remove("vapi-overlay-open");
    }

    // MODIFIED: Block close when in BRD mode
   /* function attemptCloseOverlay() {
      if (inBRDMode) {
        alert("Please complete or submit your BRD first.");
        return;
      }
      if (!confirm("If you close now, you will lose the data and you must start from the beginning. Close anyway?")) return;
      isActive ? (stopCall(true), setState("idle")) : hideOverlay();
    }*/

    function attemptCloseOverlay() {
  if (inBRDMode) {
    const ok = confirm("Close BRD and lose changes?");
    if (!ok) return;
    inBRDMode = false;
    if (closeBtn) closeBtn.style.display = '';
    if (backBtn) backBtn.style.display = '';
  }
  isActive ? (stopCall(true), setState("idle")) : hideOverlay();
}


    // MODIFIED: Added new screens
    function showScreen(e) {
      showOverlay();
      setUiProcessing(false);
      textInput && (textInput.disabled = false);
      emailInput && (emailInput.disabled = false);
      cardsGrid && [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach(t => {
        t.disabled = false;
        t.style.opacity = "1";
      });
      [screenCards, screenQuestion, screenPreview, screenEmail, screenLoading, screenBRD, screenSuccess].forEach(t => {
        t && (t.classList.remove("is-active"), t.style.opacity = "1", t.style.pointerEvents = "auto");
      });

       if (e === screenSuccess) {
    if (closeBtn) closeBtn.style.display = "none";
  } else {
    if (closeBtn) closeBtn.style.display = "";
  }
      e?.classList.add("is-active");
    }

    // MODIFIED: Block backdrop click in BRD mode
    overlay.addEventListener("click", e => {
      if (inBRDMode) return;
      e.target === overlay && attemptCloseOverlay();
    });

   closeBtn?.addEventListener("click", attemptCloseOverlay);

/*// ADD THESE TWO LINES ↓
document.getElementById('vapiPreviewHeaderCloseBtn')?.addEventListener('click', attemptCloseOverlay);
document.getElementById('vapiPreviewFooterCloseBtn')?.addEventListener('click', attemptCloseOverlay);
// ↑ END
*/
backBtn?.addEventListener("click", () => {
  if (inBRDMode) return;
  sendToolResult({ action: "back", category: window.__vapiUi.lastCategory });
  hideOverlay();
});

    // ============================================
    // TOOL RESULT & MESSAGE FUNCTIONS
    // ============================================

    function sendToolResult(e) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      const t = pendingToolCallId;
      if (!t) {
        sendAsUserMessage(typeof e == "string" ? e : e.value || e.userInput || JSON.stringify(e));
        return;
      }
      const n = typeof e == "string" ? e : JSON.stringify(e);
      socket.send(JSON.stringify({ type: "tool-calls-result", toolCallResult: { toolCallId: t, result: n } }));
      socket.send(JSON.stringify({ type: "add-message", message: { role: "tool", tool_call_id: t, content: n } }));
      pendingToolCallId = null;
      pendingToolName = null;
    }

    function sendAsUserMessage(e) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "add-message", message: { role: "user", content: e } }));
    }

    const norm = e => String(e || "").toLowerCase().trim().replace(/\s+/g, " "),
      hasVal = e => !(e === void 0 || e === null || e === "" || Array.isArray(e) && e.length === 0);

    function escapeHtml(e) {
      return String(e ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    function setCollected(e, t) {
      e && (window.__vapiUi.collected[e] = t);
    }

    // ============================================
    // CATEGORY CARDS CONFIG
    // ============================================

    const CATEGORY_CARDS = {
      main_menu: { title: "Main Menu", sub: "Please choose one.", flow: "main", step: "MAIN_MENU", field: "service", mode: "single", options: ["Website Development", "ERP Implementation", "Digital Marketing", "Consulting"], hint: "🗣️ say: Website, ERP, Marketing, or Consulting" },
      website_mode: { title: "Website Development", sub: "Do you want a ready template or a custom website?", flow: "website", step: "WEBSITE_MODE", field: "website_mode", mode: "single", options: ["Template", "Custom"], hint: "🗣️ Say the type (or tap)." },
      website_platform: { title: "Platform", sub: "Which platform do you prefer?", flow: "website", step: "WEBSITE_PLATFORM", field: "website_platform", mode: "single", options: ["Webflow", "WordPress", "Other"], hint: "🗣️ say the platform name" },
      website_industry: { title: "Industry", sub: "Which industry is this for?", flow: "website", step: "WEBSITE_INDUSTRY", field: "website_industry", mode: "single", options: ["Real Estate", "Healthcare", "Restaurant", "Construction", "Logistics", "Education", "Retail", "Services", "Other"], hint: "🗣️ say your industry" },
      website_site_type: { title: "Website Type", sub: "Do you need a landing page, a company profile, or a portal?", flow: "website", step: "WEBSITE_TYPE", field: "website_site_type", mode: "single", options: ["Landing Page", "Company Profile", "Portal"], hint: "🗣️ say the type" },
      erp_vendor: { title: "ERP Vendor", sub: "Which ERP are you considering?", flow: "erp", step: "ERP_VENDOR", field: "erp_vendor", mode: "single", options: ["Odoo", "SAP", "Oracle", "Dynamics 365", "Not sure (recommend)"], hint: "🗣️ say the ERP name" },
      erp_industry: { title: "ERP Industry", sub: "Choose your industry.", flow: "erp", step: "ERP_INDUSTRY", field: "erp_industry", mode: "single", options: ["Manufacturing", "Trading", "Services", "Construction"], hint: "🗣️ say your industry" },
      erp_modules: { title: "Modules", sub: "Pick 3-5 modules.", flow: "erp", step: "ERP_MODULES", field: "erp_modules", mode: "multi", max: 5, options: ["Sales", "Purchase", "Inventory", "Accounting", "Manufacturing", "Projects", "HR"], hint: "🗣️ say them (e.g., 'Sales, Purchase, Inventory')" },
      erp_integrations: { title: "Integrations", sub: "Do you need integrations?", flow: "erp", step: "ERP_INTEGRATIONS", field: "erp_integrations", mode: "single", options: ["POS", "eCommerce", "WMS", "Bank", "None"], hint: "say what you need" },
      marketing_channel: { title: "Digital Marketing", sub: "Which area do you want help with?", flow: "marketing", step: "MKT_CHANNEL", field: "marketing_channel", mode: "single", options: ["SEO", "Google Ads", "Meta Ads", "Social Media Management", "Branding/Content"], hint: "say the service" },
      consulting_topic: { title: "Consulting", sub: "What kind of consulting do you need?", flow: "consulting", step: "CONSULT_TOPIC", field: "consulting_topic", mode: "single", options: ["Strategy", "AI / Automation", "ERP / Operations", "Website / Product", "Other"], hint: "🗣️ say the topic" }
    };

    // ============================================
    // QUESTIONS CONFIG
    // ============================================

    const QUESTIONS = {
      website_goal: { flow: "website", field: "website_goal", title: "Website Goal", question: "What is the main goal? Leads, bookings, sales, or info?", placeholder: "Leads / bookings / sales / info", inputType: "text" },
      website_features: { flow: "website", field: "website_features", title: "Must-have features", question: "List up to 3 must-have features.", placeholder: "Feature 1, Feature 2, Feature 3", inputType: "text" },
      website_sections: { flow: "website", field: "website_sections", title: "Sections / Features", question: "What key sections/features do you need (max 5)?", placeholder: "Home, About, Services, Contact", inputType: "text" },
      website_reference_sites: { flow: "website", field: "website_reference_sites", title: "Reference", question: "Any reference websites you like? (optional)", placeholder: "Paste URLs (optional)", inputType: "url" },
      website_content_ready: { flow: "website", field: "website_content_ready", title: "Content readiness", question: "Do you have logo, text, and images ready?", placeholder: "Yes / No / Partially", inputType: "text" },
      website_timeline: { flow: "website", field: "website_timeline", title: "Timeline", question: "When do you want to go live?", placeholder: "e.g., 2 weeks / 1 month", inputType: "text" },
      erp_users_count: { flow: "erp", field: "erp_users_count", title: "Users", question: "How many users will use the ERP?", placeholder: "e.g., 10", inputType: "number" },
      erp_data_readiness: { flow: "erp", field: "erp_data_readiness", title: "Data readiness", question: "Do you have masters in Excel?", placeholder: "Yes / No / Partially", inputType: "text" },
      erp_timeline: { flow: "erp", field: "erp_timeline", title: "Go-live", question: "What is your go-live target?", placeholder: "e.g., March 2026", inputType: "text" },
      marketing_goal: { flow: "marketing", field: "marketing_goal", title: "Marketing Goal", question: "What is your goal?", placeholder: "Leads / sales / traffic / brand", inputType: "text" },
      marketing_location_targeting: { flow: "marketing", field: "marketing_location_targeting", title: "Targeting", question: "Which locations do you want to target?", placeholder: "e.g., Dubai, UAE", inputType: "text" },
      marketing_current_assets: { flow: "marketing", field: "marketing_current_assets", title: "Current assets", question: "Do you already have a website/landing page/social pages?", placeholder: "Website / landing / socials", inputType: "text" },
      marketing_timeline: { flow: "marketing", field: "marketing_timeline", title: "Timeline", question: "When do you want to start?", placeholder: "e.g., ASAP / next week", inputType: "text" },
      consulting_current_situation: { flow: "consulting", field: "consulting_current_situation", title: "Current situation", question: "What's the current situation?", placeholder: "Brief context", inputType: "text" },
      consulting_desired_outcome: { flow: "consulting", field: "consulting_desired_outcome", title: "Desired outcome", question: "What outcome do you want?", placeholder: "Desired result", inputType: "text" },
      consulting_urgency: { flow: "consulting", field: "consulting_urgency", title: "Urgency", question: "How urgent is this?", placeholder: "Today / this week / this month", inputType: "text" },
      collect_email: { flow: "all", field: "email", title: "Your Email", question: "Where should we send your requirements?", placeholder: "name@email.com", inputType: "email" }
    };

    // ============================================
    // RENDER FUNCTIONS
    // ============================================

    function renderCardsFromConfig(e) {
      window.__vapiUi.flow = e.flow || window.__vapiUi.flow;
      window.__vapiUi.step = e.step || window.__vapiUi.step;
      window.__vapiUi.pendingField = e.field || window.__vapiUi.pendingField;
      window.__vapiUi.mode = e.mode || "single";
      window.__vapiUi.max = Math.max(1, Number(e.max || 1));
      window.__vapiUi.selected.clear();
      setHeader(e.title || "Say your choice", e.sub || "Say one of the options (or tap).");
      hintEl && (hintEl.textContent = e.hint || "🗣️ Just say it");
      confirmMultiBtn && (confirmMultiBtn.style.display = e.mode === "multi" ? "inline-flex" : "none", confirmMultiBtn.disabled = true);
      if (!cardsGrid) return;
      cardsGrid.innerHTML = "";
      (e.options || []).forEach(n => {
        const s = document.createElement("button");
        s.type = "button";
        s.className = "vapi-cardbtn";
        s.textContent = n;
        s.addEventListener("click", async () => {
          if (window.__vapiUi.mode === "multi") {
            window.__vapiUi.selected.has(n) ? window.__vapiUi.selected.delete(n) : window.__vapiUi.selected.size < window.__vapiUi.max && window.__vapiUi.selected.add(n);
            s.classList.toggle("is-selected", window.__vapiUi.selected.has(n));
            confirmMultiBtn && (confirmMultiBtn.disabled = window.__vapiUi.selected.size === 0);
            setCollected(window.__vapiUi.pendingField, Array.from(window.__vapiUi.selected));
            return;
          }
          [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach(a => a.classList.remove("is-selected"));
          s.classList.add("is-selected");
          setCollected(window.__vapiUi.pendingField, n);
          setUiProcessing(true);
          [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach(a => { a.disabled = true; a.style.opacity = "0.6"; });
          sendToolResult({ field: window.__vapiUi.pendingField, value: n, userSelected: n });
          sendAsUserMessage(n);
        });
        cardsGrid.appendChild(s);
      });
      showScreen(screenCards);
    }

    confirmMultiBtn?.addEventListener("click", async () => {
      const e = Array.from(window.__vapiUi.selected);
      if (!e.length) return;
      const t = window.__vapiUi.pendingField;
      setCollected(t, e);
      const n = e.join(", ");
      setUiProcessing(true);
      sendToolResult({ field: t, values: e, userSelected: n });
      setTimeout(() => { pendingToolCallId || sendAsUserMessage(`I selected: ${n}`); }, 300);
    });

    sendEmailBtn?.addEventListener("click", async () => {
      const e = String(emailInput?.value || "").trim();
      if (!e) return;
      setCollected("email", e);
      setUiProcessing(true);
      emailInput && (emailInput.disabled = true);
      sendToolResult({ field: "email", value: e, email: e, collected: window.__vapiUi.collected });
      setTimeout(() => { pendingToolCallId || sendAsUserMessage(`My email is ${e}`); }, 300);
    });

    function renderQuestionByKey(e) {
      const t = QUESTIONS[e];
      if (!t) return;
      window.__vapiUi.flow = t.flow || window.__vapiUi.flow;
      window.__vapiUi.pendingField = t.field || window.__vapiUi.pendingField;
      window.__vapiUi.lastCategory = e;
      setHeader(t.title || "Quick question", "🗣️ Speak your answer OR ⌨️ type below");
      questionTextEl && (questionTextEl.textContent = t.question || "");
      textInput && (textInput.value = "", textInput.placeholder = t.placeholder || "Type here...", textInput.type = t.inputType || "text");
      showScreen(screenQuestion);
    }

    submitTextBtn?.addEventListener("click", async () => {
      const e = String(textInput?.value || "").trim();
      if (!e) return;
      const t = window.__vapiUi.pendingField;
      setCollected(t, e);
      setUiProcessing(true);
      textInput && (textInput.disabled = true);
      sendToolResult({ field: t, value: e, userInput: e });
      setTimeout(() => { pendingToolCallId || sendAsUserMessage(`My answer for ${t} is: ${e}`); }, 300);
    });

    function generatePreviewHtml(e) {
      const t = window.__vapiUi.collected || {}, n = [];
      const i = (s, a) => {
        const o = t[s];
        if (!hasVal(o)) return;
        const l = Array.isArray(o) ? o.join(", ") : String(o);
        n.push(`<div style="padding:10px 0;border-bottom:1px solid #eee;"><div style="font-weight:900">${escapeHtml(a)}</div><div style="opacity:.85">${escapeHtml(l)}</div></div>`);
      };
      if (e === "preview_website") { i("service", "Service"); i("website_mode", "Mode"); i("website_platform", "Platform"); i("website_industry", "Industry"); i("website_site_type", "Type"); i("website_goal", "Goal"); i("website_features", "Features"); i("website_sections", "Sections"); i("website_content_ready", "Content ready"); i("website_reference_sites", "Reference sites"); i("website_timeline", "Timeline"); }
      else if (e === "preview_erp") { i("service", "Service"); i("erp_vendor", "ERP Vendor"); i("erp_industry", "Industry"); i("erp_users_count", "Users"); i("erp_modules", "Modules"); i("erp_data_readiness", "Data ready"); i("erp_integrations", "Integrations"); i("erp_timeline", "Go-live"); }
      else if (e === "preview_marketing") { i("service", "Service"); i("marketing_channel", "Channel"); i("marketing_goal", "Goal"); i("marketing_location_targeting", "Locations"); i("marketing_current_assets", "Assets"); i("marketing_timeline", "Timeline"); }
      else if (e === "preview_consulting") { i("service", "Service"); i("consulting_topic", "Topic"); i("consulting_current_situation", "Situation"); i("consulting_desired_outcome", "Outcome"); i("consulting_urgency", "Urgency"); }
      return n.length ? `<div>${n.join("")}</div>` : '<div style="font-weight:800;opacity:.75">No data captured yet.</div>';
    }

   function renderPreview(e) {
      setHeader("Requirement Preview", "Approve or go back to edit.");
      previewHtmlEl && (previewHtmlEl.innerHTML = generatePreviewHtml(e));
      previewLinkEl && (previewLinkEl.style.display = "none");
      /* if (closeBtn) closeBtn.style.display = 'inline-block';*/

      showScreen(screenPreview);
    }
   /*     function renderPreview(e) {
      setHeader("Requirement Preview", "Approve or go back to edit.");
      previewHtmlEl && (previewHtmlEl.innerHTML = generatePreviewHtml(e));
      previewLinkEl && (previewLinkEl.style.display = "none");
            if (closeBtn) closeBtn.style.display = 'inline-block';

  const previewHeaderBtn = document.getElementById('vapiPreviewHeaderCloseBtn');
  const previewFooterBtn = document.getElementById('vapiPreviewFooterCloseBtn');
  if (previewHeaderBtn) previewHeaderBtn.style.display = 'inline-block';
  if (previewFooterBtn) previewFooterBtn.style.display = 'inline-block';
                                                  
      showScreen(screenPreview);
    }
    */

    // ============================================
    // APPROVE BUTTON - TRIGGERS BRD MODE
    // ============================================

    approveBtn?.addEventListener("click", async () => {
      console.log("[Click] Approving preview - Starting BRD generation");
      
      // LOCK BRD MODE
      inBRDMode = true;
      console.log("[BRD Mode] LOCKED");
      
      // Clear pending tool calls
      pendingToolCallId = null;
      pendingToolName = null;
      
      // Hide close/back buttons
     /* if (closeBtn) closeBtn.style.display = 'none';*/
      if (backBtn) backBtn.style.display = 'none';
      
      setUiProcessing(true);
      
      // Start BRD generation
      await generateFullBRD();
    });

    // MODIFIED: Block when in BRD mode
    function renderEmailScreen() {
      if (inBRDMode) {
        console.log("[renderEmailScreen] BLOCKED - in BRD mode");
        return;
      }
      setHeader("Submit", "Where should we send this?");
      emailInput && (emailInput.value = "");
      window.__vapiUi.pendingField = "email";
      showScreen(screenEmail);
    }

    function autoFillParentFields(e) {
      const t = window.__vapiUi.collected;
      if (e.startsWith("website_") && !t.service) t.service = "Website Development";
      if (e.startsWith("erp_") && !t.service) t.service = "ERP Implementation";
      if (e.startsWith("marketing_") && !t.service) t.service = "Digital Marketing";
      if (e.startsWith("consulting_") && !t.service) t.service = "Consulting";
    }

    function autoFillFromQuestionKey(e) {
      const t = window.__vapiUi.collected;
      if (e.startsWith("website_") && !t.service) t.service = "Website Development";
      if (e.startsWith("erp_") && !t.service) t.service = "ERP Implementation";
      if (e.startsWith("marketing_") && !t.service) t.service = "Digital Marketing";
      if (e.startsWith("consulting_") && !t.service) t.service = "Consulting";
    }

    // ============================================
    // HANDLE TOOL CALLS - BLOCKS IN BRD MODE
    // ============================================

    function handleToolCalls(e) {
      const t = e?.message ?? e,
        n = t?.toolCallList ?? t?.toolCalls ?? [];
      n.forEach(i => {
        const s = i?.id || i?.toolCallId || i?.tool_call_id,
          a = i?.function?.name || i?.name;
        console.log("[ToolCall] Received:", a);
        
        // BLOCK ALL IN BRD MODE
        if (inBRDMode) {
          console.log("[ToolCall] BLOCKED -", a, "- in BRD mode");
          return;
        }
        
        let o = i?.function?.arguments ?? i?.arguments ?? {};
        typeof o == "string" && (o = JSON.parse(o || "{}"));
        
        if (a === "ui_show_cards" && o.category) {
          pendingToolCallId = s;
          pendingToolName = a;
          window.__vapiUi.lastCategory = o.category;
          autoFillParentFields(o.category);
          const l = CATEGORY_CARDS[o.category] || CATEGORY_CARDS.main_menu;
          window.__vapiUi.pendingField = l.field;
          renderCardsFromConfig(l);
          return;
        }
        if (a === "ui_ask_question") {
          pendingToolCallId = s;
          pendingToolName = a;
          const l = o.question_key;
          if (!l || !QUESTIONS[l]) return;
          autoFillFromQuestionKey(l);
          renderQuestionByKey(l);
          return;
        }
        if (a === "ui_show_preview" && (o.preview_type || o.category)) {
          pendingToolCallId = s;
          pendingToolName = a;
          renderPreview(o.preview_type || o.category);
          return;
        }
        if (a === "ui_show_email") {
          pendingToolCallId = s;
          pendingToolName = a;
          renderEmailScreen();
          return;
        }
        if (a === "ui_close") {
          hideOverlay();
        }
      });
    }

    // ============================================
    // VOICE TO UI - BLOCKS IN BRD MODE
    // ============================================

    function tryMatchOptionFromCards(e) {
      const t = CATEGORY_CARDS[window.__vapiUi.lastCategory];
      if (!t) return null;
      const n = norm(e);
      if (!n) return null;
      for (const s of (t.options || [])) {
        const a = norm(s);
        if (n === a || n.includes(a)) return s;
      }
      if (window.__vapiUi.lastCategory === "main_menu") {
        if (n.includes("website") || n.includes("web")) return "Website Development";
        if (n.includes("erp") || n.includes("odoo") || n.includes("sap")) return "ERP Implementation";
        if (n.includes("marketing") || n.includes("seo") || n.includes("ads")) return "Digital Marketing";
        if (n.includes("consult") || n.includes("strategy")) return "Consulting";
      }
      return null;
    }

    function applyVoiceToUI(e) {
      if (inBRDMode) {
        console.log("[applyVoiceToUI] BLOCKED - in BRD mode");
        return;
      }
      const t = String(e || "").trim();
      if (!t) return;
      if (screenCards?.classList.contains("is-active")) {
        const n = CATEGORY_CARDS[window.__vapiUi.lastCategory];
        if (!n) return;
        if (n.mode === "multi") {
          const i = norm(t).split(/[,\s]+/).filter(Boolean), s = [];
          for (const a of i) {
            const o = n.options.find(l => norm(l) === a || norm(l).includes(a) || a.includes(norm(l)));
            o && s.push(o);
          }
          if (s.length) {
            s.slice(0, n.max || 5).forEach(a => window.__vapiUi.selected.add(a));
            setCollected(n.field, Array.from(window.__vapiUi.selected));
            [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach(a => { a.classList.toggle("is-selected", window.__vapiUi.selected.has(a.textContent)); });
            confirmMultiBtn && (confirmMultiBtn.disabled = window.__vapiUi.selected.size === 0);
          }
          return;
        }
        const i = tryMatchOptionFromCards(t);
        if (!i) return;
        setCollected(n.field, i);
        [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach(s => { s.classList.toggle("is-selected", norm(s.textContent) === norm(i)); });
        return;
      }
      if (screenQuestion?.classList.contains("is-active")) {
        window.__vapiUi.pendingField && (setCollected(window.__vapiUi.pendingField, t), textInput && (textInput.value = t));
        return;
      }
      if (screenEmail?.classList.contains("is-active") && t.includes("@")) {
        setCollected("email", t);
        emailInput && (emailInput.value = t);
      }
    }

    // ============================================
    // AUDIO PLAYBACK
    // ============================================

    function playPcm16(e, t = 16000) {
      playCtx || (playCtx = new(window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive", sampleRate: t }));
      analyser || (analyser = playCtx.createAnalyser(), analyser.fftSize = 256, analyser.smoothingTimeConstant = .85, analyserData = new Uint8Array(analyser.frequencyBinCount), analyser.connect(playCtx.destination));
      let n = 0;
      for (let l = 0; l < e.length; l++) n += Math.abs(e[l]);
      n / e.length / 32768 > .01 && (window.vapiIsSpeaking = true, onAiSpeechStarted());
      const i = new Float32Array(e.length);
      for (let l = 0; l < e.length; l++) i[l] = e[l] / 32768;
      const s = playCtx.createBuffer(1, i.length, t);
      s.copyToChannel(i, 0);
      const a = playCtx.createBufferSource();
      a.buffer = s;
      a.connect(analyser);
      a.onended = () => { playCtx && playCtx.currentTime >= nextPlayTime - .05 && (window.vapiIsSpeaking = false, onAiSpeechEnded()); };
      const o = playCtx.currentTime;
      nextPlayTime <= o ? nextPlayTime = o + AUDIO_CONFIG.minQueueAheadSec : nextPlayTime - o > AUDIO_CONFIG.maxQueueAheadSec;
      a.start(nextPlayTime);
      nextPlayTime += s.duration;
    }

    function updateAudioLevel() {
      if (analyser) {
        analyser.getByteFrequencyData(analyserData);
        let t = 0;
        for (let n = 0; n < analyserData.length; n++) t += analyserData[n];
        window.vapiAudioLevel = t / analyserData.length / 255;
      } else window.vapiAudioLevel *= .85;
      const e = Math.max(0, Math.min(1, window.vapiAudioLevel || 0)), t = performance.now();
      e > AI_LEVEL_START ? (aiLastLoudAt = t, window.vapiIsSpeaking || (window.vapiIsSpeaking = true, onAiSpeechStarted())) : window.vapiIsSpeaking && e < AI_LEVEL_END && t - aiLastLoudAt > AI_END_HOLD_MS && (window.vapiIsSpeaking = false, onAiSpeechEnded());
      const n = 1 + e * .08;
      pillWrap ? pillWrap.style.transform = `translateX(-50%) scale(${n})` : pill.style.transform = `scale(${n})`;
      isActive && requestAnimationFrame(updateAudioLevel);
    }

    // ============================================
    // WEBSOCKET & CALL FUNCTIONS
    // ============================================

    async function createWebsocketCallUrl() {
      const e = { "content-type": "application/json" };
      BRIDGE_SECRET && (e["x-bridge-secret"] = BRIDGE_SECRET);
      const t = await fetch(CREATE_CALL_ENDPOINT, { method: "POST", headers: e, body: JSON.stringify({ assistantId: ASSISTANT_ID }) });
      const n = await t.json().catch(() => ({}));
      if (!t.ok) throw new Error(n?.vapiError?.message || "Worker/Vapi error");
      if (!n.websocketCallUrl) throw new Error("No websocketCallUrl returned");
      return n.websocketCallUrl;
    }

    function createWorkletProcessorBlob() {
      const e = `class VapiAudioProcessor extends AudioWorkletProcessor{constructor(){super();this.bufferSize=${AUDIO_CONFIG.workletBufferSize};this.buffer=new Float32Array(this.bufferSize);this.bufferIndex=0;this.inputSampleRate=sampleRate;this.outputSampleRate=16000;this.needsResampling=Math.abs(this.inputSampleRate-this.outputSampleRate)>100}resample(input){if(!this.needsResampling)return input;const ratio=this.inputSampleRate/this.outputSampleRate;const len=Math.floor(input.length/ratio);const out=new Float32Array(len);for(let i=0;i<len;i++){const idx=i*ratio;const f=Math.floor(idx);const c=Math.min(f+1,input.length-1);out[i]=input[f]*(1-(idx-f))+input[c]*(idx-f)}return out}floatTo16BitPCM(arr){const out=new Int16Array(arr.length);for(let i=0;i<arr.length;i++){const s=Math.max(-1,Math.min(1,arr[i]));out[i]=s<0?s*32768:s*32767}return out}process(inputs){const input=inputs[0];if(!input||!input[0])return true;for(let i=0;i<input[0].length;i++){this.buffer[this.bufferIndex++]=input[0][i];if(this.bufferIndex>=this.bufferSize){const resampled=this.resample(this.buffer);const pcm=this.floatTo16BitPCM(resampled);this.port.postMessage(pcm.buffer,[pcm.buffer]);this.bufferIndex=0;this.buffer=new Float32Array(this.bufferSize)}}return true}}registerProcessor('vapi-audio-processor',VapiAudioProcessor);`;
      return URL.createObjectURL(new Blob([e], { type: "application/javascript" }));
    }

    function extractTranscriptMessage(e) {
      const t = e?.transcript || e?.text || e?.content || e?.message?.content || e?.message?.text;
      if (!t) return null;
      const n = e?.role || e?.speaker || e?.from;
      const i = n === "user" || n === "human" || n === "client" || e?.speaker === "user" || e?.from === "user";
      const s = e?.isFinal === true || e?.final === true || e?.transcriptType === "final";
      const a = e?.type === "transcript";
      return a && i && s ? String(t) : null;
    }

    async function startCall() {
      setState("loading");
      showStatusIndicator();
      updateStatusIndicator("connecting");
      nextPlayTime = 0;
      window.vapiAudioLevel = 0;
      window.vapiIsSpeaking = false;
      playCtx = playCtx || new(window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
      try { await playCtx.resume(); } catch {}
      const e = await createWebsocketCallUrl();
      socket = new WebSocket(e);
      socket.binaryType = "arraybuffer";
      const t = setTimeout(() => {
        socket?.readyState !== WebSocket.OPEN && (stopCall(false), setState("idle"), hideStatusIndicator(), alert("Connection timeout."));
      }, AUDIO_CONFIG.connectionTimeoutMs);
      socket.onopen = async () => {
        clearTimeout(t);
        stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
          try { window.stopHandMode?.(); } catch (err) { console.warn('[HAND] stopHandMode failed', err); }

        audioContext = new(window.AudioContext || window.webkitAudioContext);
        await audioContext.resume();
        const n = createWorkletProcessorBlob();
        await audioContext.audioWorklet.addModule(n);
        URL.revokeObjectURL(n);
        source = audioContext.createMediaStreamSource(stream);
        const i = audioContext.createGain();
        i.gain.value = 4.0;
        workletNode = new AudioWorkletNode(audioContext, "vapi-audio-processor");
        workletNode.port.onmessage = s => { socket?.readyState === WebSocket.OPEN && socket.send(s.data); processAudioForVAD(s.data); };
        source.connect(i);
        i.connect(workletNode);
        startVADCheck();
        isActive = true;
        setState("active");
        updateStatusIndicator("listening");
        updateAudioLevel();
      };
      socket.onmessage = async n => {
        if (n.data instanceof ArrayBuffer) { const s = new Int16Array(n.data); s.length > 0 && playPcm16(s, AUDIO_CONFIG.outputSampleRate); return; }
        const i = s => {
          let a;
          try { a = JSON.parse(s); } catch { return; }
          const o = a?.message ?? a;
          if (o?.type === "tool-calls") { handleToolCalls(a); return; }
          const l = extractTranscriptMessage(o);
          l && applyVoiceToUI(l);
        };
        if (typeof n.data == "string") return i(n.data);
        if (n.data instanceof Blob) try { i(await n.data.text()); } catch {}
      };
      socket.onerror = () => { stopCall(false); setState("idle"); };
      socket.onclose = () => { stopCall(false); setState("idle"); };
    }

    function stopCall(e = true) {
      window.vapiAudioLevel = 0;
      window.vapiIsSpeaking = false;
      isActive = false;
      stopVADCheck();
      try { e && socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "end-call" })); } catch {}
      try { workletNode?.disconnect(); } catch {}
      try { source?.disconnect(); } catch {}
      try { audioContext?.close(); } catch {}
      try { stream?.getTracks().forEach(t => t.stop()); } catch {}
      try { socket?.close(); } catch {}
      socket = stream = audioContext = workletNode = source = null;
      nextPlayTime = 0;
      pendingToolCallId = null;
      pendingToolName = null;
      pillWrap ? pillWrap.style.transform = "translateX(-50%) scale(1)" : pill.style.transform = "scale(1)";
      if (!inBRDMode) hideOverlay();
      hideStatusIndicator();
    }

    function setUiProcessing(e) {
      submitTextBtn && (submitTextBtn.disabled = e);
      confirmMultiBtn && (confirmMultiBtn.disabled = e || window.__vapiUi.selected.size === 0);
      sendEmailBtn && (sendEmailBtn.disabled = e);
      approveBtn && (approveBtn.disabled = e);
      textInput && (textInput.disabled = e);
      emailInput && (emailInput.disabled = e);
      const t = document.querySelector(".vapi-screen.is-active");
      t && (t.style.opacity = e ? "0.7" : "1", t.style.pointerEvents = e ? "none" : "auto");
      updateStatusIndicator(e ? "processing" : "listening");
    }

    pill.addEventListener("click", async () => {
      try { isActive ? stopCall(true) : await startCall(); isActive || setState("idle"); }
      catch (e) { stopCall(false); setState("idle"); alert(e?.message || "Failed to start call"); }
    });

    window.addEventListener("beforeunload", () => { isActive && stopCall(false); });

    // ============================================
    // BRD GENERATION FUNCTIONS
    // ============================================

    function updateLoadingStatus(message, step) {
      if (loadingText) loadingText.textContent = message;
      if (loadingProgress) {
        const dots = loadingProgress.querySelectorAll('.progress-dot');
        dots.forEach((dot, index) => { dot.classList.toggle('active', index < step); });
      }
    }

    async function generateBRDText(collected) {
      const headers = { "Content-Type": "application/json" };
      if (WORKER_SECRET) headers["X-Worker-Secret"] = WORKER_SECRET;
      const response = await fetch(`${GEMINI_WORKER_URL}/generate-brd`, { method: "POST", headers, body: JSON.stringify({ collected }) });
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error?.error || "Failed to generate BRD"); }
      const data = await response.json();
      return data.html;
    }

    async function generateDesignImage(collected) {
      const headers = { "Content-Type": "application/json" };
      if (WORKER_SECRET) headers["X-Worker-Secret"] = WORKER_SECRET;
      const response = await fetch(`${GEMINI_WORKER_URL}/generate-design`, { method: "POST", headers, body: JSON.stringify({ collected }) });
      if (!response.ok) return null;
      return await response.json();
    }

    async function generateFullBRD() {
      const collected = window.__vapiUi.collected;
      showScreen(screenLoading);
      updateLoadingStatus("Generating your BRD...", 1);
      
      try {
        updateLoadingStatus("Creating document content...", 1);
        const brdHtml = await generateBRDText(collected);
        generatedBRD.html = brdHtml;
        generatedBRD.originalHtml = brdHtml;
        
        if (BRD_CONFIG.generateDesignFor.includes(collected.service)) {
          updateLoadingStatus("Creating design mockup...", 2);
          const designData = await generateDesignImage(collected);
          if (designData) {
            if (designData.image) {
              generatedBRD.designImageBase64 = designData.image;
              generatedBRD.designImageUrl = `data:${designData.mimeType || 'image/png'};base64,${designData.image}`;
              generatedBRD.designSource = "gemini";
            } else if (designData.imageUrl) {
              generatedBRD.designImageUrl = designData.imageUrl;
              generatedBRD.designSource = "placeholder";
            }
          }
        }
        
        updateLoadingStatus("Preparing preview...", 3);
        await new Promise(resolve => setTimeout(resolve, 500));
        renderBRDViewer();
        
      } catch (error) {
        console.error('[BRD Generation Error]', error);
        alert('Failed to generate BRD: ' + error.message);
        inBRDMode = false;
        if (closeBtn) closeBtn.style.display = '';
        if (backBtn) backBtn.style.display = '';
        showScreen(screenPreview);
      }
    }

    function renderBRDViewer() {
      const collected = window.__vapiUi.collected;
      if (brdContent) brdContent.innerHTML = generatedBRD.html;
      
      if (brdDesignSection) {
        if (generatedBRD.designImageUrl) {
          brdDesignSection.classList.add('is-visible');
          if (brdDesignImage) brdDesignImage.src = generatedBRD.designImageUrl;
          if (brdDesignCaption) brdDesignCaption.textContent = generatedBRD.designSource === "gemini" ? "AI-Generated Design Mockup" : "Design Preview (Placeholder)";
        } else {
          brdDesignSection.classList.remove('is-visible');
        }
      }
      
      if (brdUploadPreview) { brdUploadPreview.innerHTML = ""; brdUploadPreview.classList.remove('has-file'); }
      if (brdEmailInput && collected.email) brdEmailInput.value = collected.email;
      if (brdSubmitBtn) {
        brdSubmitBtn.disabled = false;
        const submitText = brdSubmitBtn.querySelector('.submit-text');
        if (submitText) submitText.textContent = "Submit & Send BRD";
      }
      showScreen(screenBRD);
    }

    function handleDesignUpload(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) { alert('Please upload an image file'); return; }
      if (file.size > BRD_CONFIG.maxUploadSizeMB * 1024 * 1024) { alert(`File too large. Max: ${BRD_CONFIG.maxUploadSizeMB}MB`); return; }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Full = e.target.result;
        generatedBRD.userUploadedImageBase64 = base64Full.split(',')[1];
        generatedBRD.userUploadedImageName = file.name;
        if (brdUploadPreview) {
          brdUploadPreview.innerHTML = `<div class="upload-preview-item"><img src="${base64Full}" alt="Uploaded design"><span>${escapeHtml(file.name)}</span><button type="button" class="remove-upload" title="Remove">×</button></div>`;
          brdUploadPreview.classList.add('has-file');
          brdUploadPreview.querySelector('.remove-upload')?.addEventListener('click', removeUploadedDesign);
        }
      };
      reader.readAsDataURL(file);
    }

    function removeUploadedDesign() {
      generatedBRD.userUploadedImageBase64 = null;
      generatedBRD.userUploadedImageName = null;
      if (brdUploadInput) brdUploadInput.value = "";
      if (brdUploadPreview) { brdUploadPreview.innerHTML = ""; brdUploadPreview.classList.remove('has-file'); }
    }

    function resetBRDContent() {
      if (brdContent && generatedBRD.originalHtml) brdContent.innerHTML = generatedBRD.originalHtml;
    }

/*function stripHtmlWrapper(html) {
  if (!html) return "";
  
  let content = html;
  
  // Remove document tags
  content = content.replace(/<!DOCTYPE[^>]*>/gi, "");
  content = content.replace(/<html[^>]*>/gi, "");
  content = content.replace(/<\/html>/gi, "");
  content = content.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");
  content = content.replace(/<body[^>]*>/gi, "");
  content = content.replace(/<\/body>/gi, "");
  content = content.replace(/<meta[^>]*>/gi, "");
  content = content.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "");
  
  // ✅ Also remove style tags that might conflict
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  
  content = content.trim();
  
  console.log("[stripHtmlWrapper] Stripped:", html.length, "→", content.length);
  
  return content;
}*/

  /*  function stripHtmlWrapper(html) {
  if (!html) return "";
  let content = html;
  content = content.replace(/<!DOCTYPE[^>]*>/gi, "");
  content = content.replace(/<html[^>]*>/gi, "");
  content = content.replace(/<\/html>/gi, "");
  content = content.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");
  content = content.replace(/<body[^>]*>/gi, "");
  content = content.replace(/<\/body>/gi, "");
  content = content.replace(/<meta[^>]*>/gi, "");
  content = content.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "");
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  return content.trim();
}*/
    /*function stripHtmlWrapper(html) {
  if (!html) return "";
  let content = html;
  content = content.replace(/<!DOCTYPE[^>]*>/gi, "");
  content = content.replace(/<html[^>]*>/gi, "");
  content = content.replace(/<\/html>/gi, "");
  content = content.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");
  content = content.replace(/<body[^>]*>/gi, "");
  content = content.replace(/<\/body>/gi, "");
  content = content.replace(/<meta[^>]*>/gi, "");
  content = content.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "");
  // Remove Gemini's BRD header (keep your custom one)
  content = content.replace(/<h1[^>]*>[\s\S]*?Business Requirements Document[\s\S]*?<\/h1>/gi, "");
  content = content.replace(/<p[^>]*>\s*<strong>\s*Project:\s*<\/strong>[\s\S]*?<\/p>/gi, "");
  content = content.replace(/<p[^>]*>\s*<strong>\s*Date:\s*<\/strong>[\s\S]*?<\/p>/gi, "");
  return content.trim();
}
*/
    function stripHtmlWrapper(html) {
  if (!html) return "";
  let content = html;
  content = content.replace(/<!DOCTYPE[^>]*>/gi, "");
  content = content.replace(/<html[^>]*>/gi, "");
  content = content.replace(/<\/html>/gi, "");
  content = content.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "");
  content = content.replace(/<body[^>]*>/gi, "");
  content = content.replace(/<\/body>/gi, "");
  content = content.replace(/<meta[^>]*>/gi, "");
  content = content.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "");
  content = content.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Remove inline background styles
  content = content.replace(/background-color:\s*#[a-fA-F0-9]+;?/gi, "");
  content = content.replace(/background:\s*#[a-fA-F0-9]+;?/gi, "");
  content = content.replace(/background-color:\s*rgb[^;]+;?/gi, "");
  content = content.replace(/background:\s*rgb[^;]+;?/gi, "");
  content = content.replace(/background-color:\s*white;?/gi, "");
  content = content.replace(/background:\s*white;?/gi, "");
  content = content.replace(/color:\s*#555;?/gi, "");
  return content.trim();
}
    function buildPDFContent() {
  const collected = window.__vapiUi.collected || {};
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  let editedBRD = (brdContent?.innerHTML && brdContent.innerHTML.trim())
    ? brdContent.innerHTML
    : (generatedBRD.html || "");
  editedBRD = stripHtmlWrapper(editedBRD);
  
  let html = `
    <style>
      h1, h2, h3, h4, h5, h6 { 
        page-break-inside: avoid; 
        page-break-after: avoid; 
        margin-top: 15px;
      }
      img { 
        page-break-inside: avoid; 
        display: block;
        margin: 15px auto;
        max-width: 100%;
      }
      p, ul, ol, li { 
        page-break-inside: avoid; 
        margin-bottom: 8px;
      }
    </style>
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; background:#fff;">
      <div style="text-align: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #D4AF37; page-break-after: avoid;">
        <h1 style="color: #333; margin: 0; font-size: 24px;">BUSINESS REQUIREMENTS DOCUMENT</h1>
        <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">${escapeHtml(collected.service || "Project")} | ${today}</p>
      </div>
      <div style="margin-bottom: 20px;">
        ${editedBRD}
      </div>
  `;
  
  if (generatedBRD.userUploadedImageBase64) {
    html += `
      <div style="margin-bottom: 20px; page-break-inside: avoid;">
        <h2 style="color: #333; border-bottom: 2px solid #D4AF37; padding-bottom: 8px;">
          Client Reference Design
        </h2>
        <div style="text-align: center; margin-top: 15px;">
          <img
            src="data:image/png;base64,${generatedBRD.userUploadedImageBase64}"
            style="max-width: 100%; max-height: 400px; border: 1px solid #ddd; border-radius: 8px;"
            alt="Client Design"
          >
        </div>
      </div>
    `;
  }
  
  html += `
      <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center;">
        <p style="color: #888; font-size: 11px; margin: 0;">
          Generated by BRD Generator | Contact: ${escapeHtml(ADMIN_EMAIL)}
        </p>
      </div>
    </div>
  `;
  
  return html;
}
/*function buildPDFContent() {
  const collected = window.__vapiUi.collected || {};
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  let editedBRD = (brdContent?.innerHTML && brdContent.innerHTML.trim())
    ? brdContent.innerHTML
    : (generatedBRD.html || "");
  editedBRD = stripHtmlWrapper(editedBRD);
  
  const pageBreakStyles = `
    <style>
      h1, h2, h3, h4, h5, h6 { 
        page-break-inside: avoid; 
        page-break-after: avoid; 
        margin-top: 15px;
      }
      img { 
        page-break-inside: avoid; 
        display: block;
        margin: 15px auto;
        max-width: 100%;
      }
      p, div, ul, ol, li { 
        page-break-inside: avoid; 
        margin-bottom: 8px;
      }
    </style>
  `;
  
  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; background:#fff;">
      <div style="text-align: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 3px solid #D4AF37;">
        <h1 style="color: #333; margin: 0; font-size: 24px;">BUSINESS REQUIREMENTS DOCUMENT</h1>
        <p style="color: #666; margin: 5px 0 0 0; font-size: 14px;">${escapeHtml(collected.service || "Project")} | ${today}</p>
      </div>
      ${pageBreakStyles}
      <div style="margin-bottom: 20px;">
        ${editedBRD}
      </div>
  `;
  
  if (generatedBRD.userUploadedImageBase64) {
    html += `
      <div style="margin-bottom: 20px; page-break-inside: avoid;">
        <h2 style="color: #333; border-bottom: 2px solid #D4AF37; padding-bottom: 8px;">
          Client Reference Design
        </h2>
        <div style="text-align: center; margin-top: 15px;">
          <img
            src="data:image/png;base64,${generatedBRD.userUploadedImageBase64}"
            style="max-width: 100%; max-height: 400px; border: 1px solid #ddd; border-radius: 8px;"
            alt="Client Design"
          >
        </div>
      </div>
    `;
  }
  
  html += `
      <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; text-align: center;">
        <p style="color: #888; font-size: 11px; margin: 0;">
          Generated by BRD Generator | Contact: ${escapeHtml(ADMIN_EMAIL)}
        </p>
      </div>
    </div>
  `;
  
  return html;
}*/
    
/*function buildPDFContent() {
  const collected = window.__vapiUi.collected || {};
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  let editedBRD = (brdContent?.innerHTML && brdContent.innerHTML.trim())
    ? brdContent.innerHTML
    : (generatedBRD.html || "");

  // ✅ Strip the HTML wrapper (fixes zero-height canvas issue)
  editedBRD = stripHtmlWrapper(editedBRD);

  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #333; background:#fff;">
      <div style="text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #D4AF37;">
        <h1 style="color: #333; margin: 0; font-size: 28px;">BUSINESS REQUIREMENTS DOCUMENT</h1>
        <p style="color: #666; margin: 10px 0 0 0;">${escapeHtml(collected.service || "Project")} | ${today}</p>
      </div>

      <div style="margin-bottom: 40px;">
        ${editedBRD}
      </div>
  `;

  if (generatedBRD.userUploadedImageBase64) {
    html += `
      <div style="margin-bottom: 40px;">
        <h2 style="color: #333; border-bottom: 2px solid #D4AF37; padding-bottom: 10px;">
          Client Reference Design
        </h2>
        <div style="text-align: center; margin-top: 20px;">
          <img
            src="data:image/png;base64,${generatedBRD.userUploadedImageBase64}"
            style="max-width: 100%; max-height: 400px; border: 1px solid #ddd; border-radius: 8px;"
            alt="Client Design"
          >
        </div>
      </div>
    `;
  }

  html += `
      <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
        <p style="color: #888; font-size: 12px; margin: 0;">
          Generated by BRD Generator<br>
          Contact: ${escapeHtml(ADMIN_EMAIL)}
        </p>
      </div>
    </div>
  `;

  return html;
}

*/
/*async function generatePDF() {
  const log = (...a) => console.log("%c[PDF]", "color:#0aa;font-weight:700", ...a);
  const err = (...a) => console.error("%c[PDF]", "color:#f00;font-weight:700", ...a);

  log("========== PDF GENERATION START ==========");

  // ✅ Ensure jsPDF is loaded
  if (!window.jspdf?.jsPDF) {
    log("Loading jsPDF...");
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
      script.onload = () => {
        log("jsPDF loaded successfully");
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load jsPDF"));
      document.head.appendChild(script);
    });
  }

  // ✅ Ensure html2canvas is loaded
  if (typeof html2canvas === "undefined") {
    log("Loading html2canvas...");
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.onload = () => {
        log("html2canvas loaded successfully");
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load html2canvas"));
      document.head.appendChild(script);
    });
  }

  // ✅ Verify both are ready
  if (!window.jspdf?.jsPDF) {
    throw new Error("jsPDF not available");
  }
  if (typeof html2canvas === "undefined") {
    throw new Error("html2canvas not available");
  }

  log("✅ All libraries loaded");

  const collected = window.__vapiUi?.collected || {};
  const pdfContent = buildPDFContent();
  
  log("Content length:", pdfContent?.length || 0);

  // Create iframe to isolate from Three.js
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: 850px;
    height: 1200px;
    border: none;
    background: #fff;
    z-index: 999999;
  `;
  document.body.appendChild(iframe);

  await new Promise(r => setTimeout(r, 100));

  const iframeDoc = iframe.contentDocument;
  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
          font-family: Arial, sans-serif; 
          padding: 40px;
          background: #fff;
          color: #333;
          line-height: 1.6;
        }
        h1 { color: #333; font-size: 24px; margin-bottom: 20px; }
        h2 { color: #333; font-size: 18px; margin: 20px 0 10px; border-bottom: 2px solid #D4AF37; padding-bottom: 5px; }
        h3 { color: #444; font-size: 16px; margin: 15px 0 8px; }
        p { margin: 10px 0; }
        ul, ol { padding-left: 20px; margin: 10px 0; }
        li { margin: 5px 0; }
        strong { color: #D4AF37; }
      </style>
    </head>
    <body>${pdfContent}</body>
    </html>
  `);
  iframeDoc.close();

  await new Promise(r => setTimeout(r, 300));

  log("Iframe size:", iframeDoc.body.scrollWidth, "x", iframeDoc.body.scrollHeight);

  try {
    log("Generating canvas...");
    const canvas = await html2canvas(iframeDoc.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: iframeDoc.body.scrollWidth,
      height: iframeDoc.body.scrollHeight
    });

    log("Canvas size:", canvas.width, "x", canvas.height);

    if (canvas.height === 0) {
      throw new Error("Canvas height is 0");
    }

    log("Creating PDF...");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - (margin * 2);
    
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgHeight = (canvas.height * contentWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = margin;
    let page = 1;

    // Add first page
    pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, imgHeight);
    heightLeft -= (pageHeight - margin * 2);
    log("Page", page, "added");

    // Add more pages if needed
    while (heightLeft > 0) {
      pdf.addPage();
      page++;
      position = margin - (page - 1) * (pageHeight - margin * 2);
      pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, imgHeight);
      heightLeft -= (pageHeight - margin * 2);
      log("Page", page, "added");
    }

    const pdfBlob = pdf.output('blob');
    log("PDF size:", pdfBlob.size, "bytes");

    if (pdfBlob.size < 5000) {
      throw new Error("PDF too small");
    }

    // Convert to base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });

    // Store results
    const service = (collected.service || "Project").replace(/\s+/g, "-");
    const date = new Date().toISOString().split("T")[0];
    const filename = `BRD-${service}-${date}.pdf`;

    generatedBRD.pdfBlob = pdfBlob;
    generatedBRD.pdfBase64 = base64;
    generatedBRD.pdfFilename = filename;

    log("✅ PDF generated successfully!");
    log("========== PDF SUCCESS ==========");

    return { blob: pdfBlob, base64, filename };

  } catch (error) {
    err("PDF generation failed:", error.message);
    throw error;

  } finally {
    iframe.remove();
    log("Cleanup complete");
  }
}*/
/*async function generatePDF() {
  const log = (...a) => console.log("%c[PDF]", "color:#0aa;font-weight:700", ...a);
  const err = (...a) => console.error("%c[PDF]", "color:#f00;font-weight:700", ...a);

  log("========== PDF GENERATION START ==========");

  // ✅ Ensure jsPDF is loaded
  if (!window.jspdf?.jsPDF) {
    log("Loading jsPDF...");
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
      script.onload = () => {
        log("jsPDF loaded successfully");
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load jsPDF"));
      document.head.appendChild(script);
    });
  }

  // ✅ Ensure html2canvas is loaded
  if (typeof html2canvas === "undefined") {
    log("Loading html2canvas...");
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.onload = () => {
        log("html2canvas loaded successfully");
        resolve();
      };
      script.onerror = () => reject(new Error("Failed to load html2canvas"));
      document.head.appendChild(script);
    });
  }

  log("✅ All libraries loaded");

  const collected = window.__vapiUi?.collected || {};
  const pdfContent = buildPDFContent();
  
  log("Content length:", pdfContent?.length || 0);

  // Create iframe to isolate from parent page styles
  const iframe = document.createElement('iframe');
  iframe.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: 850px;
    height: 1200px;
    border: none;
    background: #fff;
    z-index: 999999;
  `;
  document.body.appendChild(iframe);

  await new Promise(r => setTimeout(r, 100));

  const iframeDoc = iframe.contentDocument;
  iframeDoc.open();
  iframeDoc.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
          font-family: Arial, sans-serif; 
          padding: 40px;
          background: #fff;
          color: #333;
          line-height: 1.6;
          overflow: visible;
        }
        h1, h2, h3 { page-break-inside: avoid; }
        img { max-width: 100%; page-break-inside: avoid; }
        div { page-break-inside: auto; }
      </style>
    </head>
    <body>${pdfContent}</body>
    </html>
  `);
  iframeDoc.close();

  // Wait for iframe to fully render
  await new Promise(resolve => {
    iframe.onload = () => resolve();
    setTimeout(resolve, 300);
  });

  try {
    // Wait for all images to load to prevent layout shifts
    log("Waiting for images...");
    const images = iframeDoc.querySelectorAll('img');
    await Promise.all(Array.from(images).map(img => {
      return new Promise((resolve) => {
        if (img.complete) resolve();
        else img.onload = () => resolve();
        img.onerror = () => resolve(); // Resolve even on error
      });
    }));
    log("✅ All images loaded");

    // Ensure iframe renders at full content height
    iframe.style.height = 'auto';
    iframe.style.width = '850px';
    iframeDoc.body.style.minHeight = 'auto';
    iframeDoc.body.style.overflow = 'visible';

    // Force reflow
    const scrollHeight = iframeDoc.body.scrollHeight;
    const scrollWidth = iframeDoc.body.scrollWidth;
    log("Content dimensions:", scrollWidth, "x", scrollHeight);

    // Generate canvas with exact dimensions
    log("Generating canvas...");
    const canvas = await html2canvas(iframeDoc.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: scrollWidth,
      height: scrollHeight,
      windowWidth: scrollWidth,
      windowHeight: scrollHeight,
      onclone: (clonedDoc) => {
        clonedDoc.body.style.overflow = 'visible';
        clonedDoc.body.style.position = 'static';
      }
    });

    log("Canvas size:", canvas.width, "x", canvas.height);

    if (canvas.height === 0) {
      throw new Error("Canvas height is 0 - content not rendered");
    }

    log("Creating PDF...");
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const contentWidth = pageWidth - (margin * 2);
    
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgHeight = (canvas.height * contentWidth) / canvas.width;

    // Pagination loop - FIXED to prevent cutting
    let heightLeft = imgHeight;
    let position = margin; // Start at top margin
    let page = 1;

    // Add first page
    pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, imgHeight);
    heightLeft -= (pageHeight - margin * 2);
    log("Page", page, "added - Height left:", heightLeft);

    // Add remaining pages
    while (heightLeft > 0) {
      pdf.addPage();
      page++;
      
      // Move canvas UP to show next portion (negative position)
      position = -(imgHeight - heightLeft - margin);
      
      pdf.addImage(imgData, 'JPEG', margin, position, contentWidth, imgHeight);
      heightLeft -= (pageHeight - margin * 2);
      log("Page", page, "added - Position:", position, "Height left:", heightLeft);
    }

    // Generate final PDF
    const pdfBlob = pdf.output('blob');
    log("✅ PDF created - Size:", pdfBlob.size, "bytes");

    if (pdfBlob.size < 5000) {
      throw new Error("PDF too small (< 5KB)");
    }

    // Convert to base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });

    // Store results
    const service = (collected.service || "Project").replace(/\s+/g, "-");
    const date = new Date().toISOString().split("T")[0];
    const filename = `BRD-${service}-${date}.pdf`;

    generatedBRD.pdfBlob = pdfBlob;
    generatedBRD.pdfBase64 = base64;
    generatedBRD.pdfFilename = filename;

    log("✅ PDF generation successful!");
    log("========== PDF SUCCESS ==========");

    return { blob: pdfBlob, base64, filename };

  } catch (error) {
    err("PDF generation failed:", error.message);
    throw error;

  } finally {
    // Clean up iframe
    iframe.remove();
    log("Cleanup complete");
  }
}
*/
    /* =============================================
   PRODUCTION: generatePDF() (same structure)
   - keeps your iframe approach
   - loads jsPDF + html2canvas if missing
   - removes duplicate inner BRD title (so only top header appears once)
   - SMARTCUT (prefer whitespace => avoid splitting text)
   - optional footer to make bottom whitespace look intentional
   ============================================= */
/* =============================================
   FINAL PRODUCTION generatePDF()
   - Works with your buildPDFContent() exactly
   - Keeps old generatedBRD.pdfBase64/pdfBlob/pdfFilename
   - SmartCut (avoid split lines)
   - Reserves footer space (footer won't cut content)
   - Removes duplicate BRD headings safely (keep first)
   ============================================= */

/*async function generatePDF() {
  const log = (...a) => console.log("%c[PDF]", "color:#0aa;font-weight:700", ...a);
  const err = (...a) => console.error("%c[PDF]", "color:#f00;font-weight:700", ...a);

  log("========== PDF GENERATION START ==========");

  // ----------------------------
  // Load deps (cdn)
  // ----------------------------
  if (!window.jspdf?.jsPDF) {
    log("Loading jsPDF...");
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load jsPDF"));
      document.head.appendChild(s);
    });
  }

  if (typeof window.html2canvas === "undefined") {
    log("Loading html2canvas...");
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load html2canvas"));
      document.head.appendChild(s);
    });
  }

  const collected = window.__vapiUi?.collected || {};
  const pdfContent = buildPDFContent(); // <-- your existing function

  // ----------------------------
  // Helpers
  // ----------------------------
  const blobToBase64 = (blob) =>
    new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.readAsDataURL(blob);
    });

  const addFooter = (pdf, pageNum, totalPages) => {
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    pdf.setLineWidth(0.2);
    pdf.line(10, pageH - 12, pageW - 10, pageH - 12);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(`Page ${pageNum} of ${totalPages}`, pageW - 10, pageH - 6, { align: "right" });
  };

  const rowIsWhiteEnough = (canvas, y, minRatio = 0.995) => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;
    if (y < 0 || y >= h) return false;

    const row = ctx.getImageData(0, y, w, 1).data;
    const step = Math.max(2, Math.floor(w / 220));
    let white = 0, total = 0;

    for (let x = 0; x < w; x += step) {
      const i = x * 4;
      const r = row[i], g = row[i + 1], b = row[i + 2], a = row[i + 3];
      if (a < 10 || (r >= 248 && g >= 248 && b >= 248)) white++;
      total++;
    }
    return (white / total) >= minRatio;
  };

  const findWhitespaceCutY = (canvas, idealCutY, searchUpPx = 220, searchDownPx = 25) => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const w = canvas.width;
    const h = canvas.height;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    const startY = clamp(Math.floor(idealCutY - searchUpPx), 0, h - 1);
    const endY = clamp(Math.floor(idealCutY + searchDownPx), 0, h - 1);

    const whiteRatioAtRow = (y) => {
      const row = ctx.getImageData(0, y, w, 1).data;
      const step = Math.max(2, Math.floor(w / 220));
      let white = 0, total = 0;
      for (let x = 0; x < w; x += step) {
        const i = x * 4;
        const r = row[i], g = row[i + 1], b = row[i + 2], a = row[i + 3];
        if (a < 10) { white++; total++; continue; }
        if (r >= 248 && g >= 248 && b >= 248) white++;
        total++;
      }
      return total ? white / total : 0;
    };

    const isGoodGap = (y) => {
      const needConsecutive = 10;
      for (let k = 0; k < needConsecutive; k++) {
        if (y + k >= h) return false;
        if (whiteRatioAtRow(y + k) < 0.995) return false;
      }
      return true;
    };

    for (let y = Math.floor(idealCutY); y >= startY; y--) {
      if (isGoodGap(y)) return y;
    }
    for (let y = Math.floor(idealCutY) + 1; y <= endY; y++) {
      if (isGoodGap(y)) return y;
    }
    return clamp(Math.floor(idealCutY), 0, h);
  };

  // ----------------------------
  // iframe render surface
  // ----------------------------
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `
    position: fixed; left: -99999px; top: 0;
    width: 850px; height: 1200px;
    border: none; background: #fff; z-index: 999999;
  `;
  document.body.appendChild(iframe);
  await new Promise((r) => setTimeout(r, 100));

  const iframeDoc = iframe.contentDocument;
  iframeDoc.open();
  iframeDoc.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            background: #fff;
            color: #333;
            line-height: 1.6;
            overflow: visible;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          img { max-width: 100%; display: block; }
        </style>
      </head>
      <body>${pdfContent}</body>
    </html>
  `);
  iframeDoc.close();
  await new Promise((r) => setTimeout(r, 300));

  try {
    // Wait images
    const images = iframeDoc.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map(
        (img) =>
          new Promise((resolve) => {
            if (img.complete) resolve();
            else img.onload = img.onerror = () => resolve();
          })
      )
    );
    log("✅ Images loaded");

    // ✅ Remove duplicate BRD titles inside editedBRD (keep the first/cover)
    (() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
      const hs = Array.from(iframeDoc.querySelectorAll("h1,h2,h3"));
      const matches = hs.filter((h) => {
        const t = norm(h.textContent);
        return t === "business requirements document" || t === "business requirements document (brd)";
      });
      for (let i = 1; i < matches.length; i++) matches[i].remove();
    })();

    // Ensure full height
    iframe.style.height = Math.max(1200, iframeDoc.body.scrollHeight + 120) + "px";
    await new Promise((r) => setTimeout(r, 80));

    const scrollWidth = iframeDoc.body.scrollWidth;
    const scrollHeight = iframeDoc.body.scrollHeight;
    log("Content size:", `${scrollWidth}x${scrollHeight}px`);

    // Render full canvas
    const canvas = await html2canvas(iframeDoc.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      width: scrollWidth,
      height: scrollHeight,
      windowWidth: scrollWidth,
      windowHeight: scrollHeight,
      onclone: (clonedDoc) => {
        clonedDoc.body.style.overflow = "visible";
        clonedDoc.body.style.position = "static";
        clonedDoc.documentElement.style.background = "#fff";
        clonedDoc.body.style.background = "#fff";
      }
    });

    if (!canvas || canvas.width === 0 || canvas.height === 0) throw new Error("Canvas is empty");

    // ----------------------------
    // PDF pagination (SmartCut)
    // ----------------------------
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;

    // ✅ Reserve space for footer so it never cuts content
    const footerReserveMm = 14;
    const printableW = pageW - margin * 2;
    const printableH = pageH - margin * 2 - footerReserveMm;

    const pageSliceHpx = Math.floor(canvas.width * (printableH / printableW));
    const maxPages = 12;

    let y = 0;
    const pages = [];

    while (y < canvas.height) {
      if (pages.length >= maxPages) throw new Error("Pagination runaway (maxPages hit).");

      const remaining = canvas.height - y;

      // last page
      if (remaining <= pageSliceHpx) {
        const sliceH = remaining;
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceH;
        pageCanvas.getContext("2d").drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        pages.push({
          imgData: pageCanvas.toDataURL("image/jpeg", 0.92),
          sliceHmm: (sliceH * printableW) / canvas.width
        });
        break;
      }

      // smart cut near ideal
      const idealCut = y + pageSliceHpx;
      let cutY = findWhitespaceCutY(canvas, idealCut, 220, 25);

      // clamp upward until cut line is definitely white (prevents half-line at top next page)
      for (let i = 0; i < 320; i++) {
        const yy = cutY - i;
        if (yy <= y + 260) break; // avoid tiny pages
        if (rowIsWhiteEnough(canvas, yy, 0.995)) { cutY = yy; break; }
      }

      let sliceH = cutY - y;
      if (sliceH < 260) sliceH = pageSliceHpx;

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceH;
      pageCanvas.getContext("2d").drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);

      pages.push({
        imgData: pageCanvas.toDataURL("image/jpeg", 0.92),
        sliceHmm: (sliceH * printableW) / canvas.width
      });

      y += sliceH;
    }

    // Write pages + footer
    const totalPages = pages.length;
    for (let i = 0; i < totalPages; i++) {
      if (i > 0) pdf.addPage();
      pdf.addImage(pages[i].imgData, "JPEG", margin, margin, printableW, pages[i].sliceHmm);
      addFooter(pdf, i + 1, totalPages);
    }

    const pdfBlob = pdf.output("blob");
    log(`✅ PDF complete: ${totalPages} pages, ${(pdfBlob.size / 1024).toFixed(1)} KB`);

    // ✅ Like old: write to generatedBRD (submitBRD expects this)
    const service = String(collected.service || "Project").replace(/\s+/g, "-");
    const date = new Date().toISOString().split("T")[0];
    const filename = `BRD-${service}-${date}.pdf`;

    generatedBRD.pdfBlob = pdfBlob;
    generatedBRD.pdfBase64 = await blobToBase64(pdfBlob);
    generatedBRD.pdfFilename = filename;

    // Auto-download
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return { blob: pdfBlob, filename, pages: totalPages };
  } catch (e) {
    err("PDF generation failed:", e?.message || e);
    throw e;
  } finally {
    iframe.remove();
    log("Cleanup complete");
  }
}*/


  /*  async function sendBRDEmail(userEmail) {
      const collected = window.__vapiUi.collected;
      const projectSummary = {};
      Object.entries(collected).forEach(([key, value]) => { if (value) projectSummary[key] = Array.isArray(value) ? value.join(', ') : value; });
      
      const headers = { "Content-Type": "application/json" };
      if (WORKER_SECRET) headers["X-Worker-Secret"] = WORKER_SECRET;
      
      const response = await fetch(`${RESEND_WORKER_URL}/send-brd`, {
        method: "POST", headers,
        body: JSON.stringify({ userEmail, userName: userEmail.split('@')[0], projectType: collected.service || 'Project', projectSummary, pdfBase64: generatedBRD.pdfBase64, pdfFilename: generatedBRD.pdfFilename })
      });
      
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error?.error || 'Failed to send email'); }
      return await response.json();
    }
*/
/*async function submitBRD() {
  const userEmail = brdEmailInput?.value?.trim();
  if (!userEmail || !userEmail.includes('@')) { 
    alert('Please enter a valid email'); 
    brdEmailInput?.focus();
    return; 
  }
  
  if (brdSubmitBtn) {
    brdSubmitBtn.disabled = true;
    const submitText = brdSubmitBtn.querySelector('.submit-text');
    if (submitText) submitText.textContent = "Generating & Sending...";
  }
  
  try {
    const pdfHtml = buildPDFContent();
    
    const response = await fetch(`${BRD_PDF_WORKER_URL}/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userEmail: userEmail,
        pdfHtml: pdfHtml
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || "Failed to send BRD");
    }
    
    showSuccessScreen(userEmail);
    
  } catch (error) {
    console.error('[Submit BRD Error]', error);
    alert('Failed: ' + error.message);
    if (brdSubmitBtn) {
      brdSubmitBtn.disabled = false;
      const t = brdSubmitBtn.querySelector('.submit-text');
      if (t) t.textContent = "Submit & Send BRD";
    }
  }
}*/
    async function submitBRD() {
  const userEmail = brdEmailInput?.value?.trim();
  if (!userEmail || !userEmail.includes('@')) { 
    alert('Please enter a valid email'); 
    brdEmailInput?.focus();
    return; 
  }
  
  if (brdSubmitBtn) {
    brdSubmitBtn.disabled = true;
    const submitText = brdSubmitBtn.querySelector('.submit-text');
    if (submitText) submitText.textContent = "Generating & Sending...";
  }
  
  try {
    const pdfHtml = buildPDFContent();
    
    const response = await fetch(`${BRD_PDF_WORKER_URL}/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userEmail: userEmail,
        pdfHtml: pdfHtml
      })
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || "Failed to send BRD");
    }
    
    // Save download URL
    generatedBRD.downloadUrl = result.downloadUrl;
    
    showSuccessScreen(userEmail);
    
  } catch (error) {
    console.error('[Submit BRD Error]', error);
    alert('Failed: ' + error.message);
    if (brdSubmitBtn) {
      brdSubmitBtn.disabled = false;
      const t = brdSubmitBtn.querySelector('.submit-text');
      if (t) t.textContent = "Submit & Send BRD";
    }
  }
}

    function showSuccessScreen(userEmail) {
      if (successEmail) successEmail.innerHTML = `<p>📧 Sent to: <strong>${escapeHtml(userEmail)}</strong></p><p>📧 Copy to: <strong>${escapeHtml(ADMIN_EMAIL)}</strong></p>`;
      showScreen(screenSuccess);
    }

 /*  function downloadPDF() {
      if (!generatedBRD.pdfBlob) { alert('No PDF available'); return; }
      const url = URL.createObjectURL(generatedBRD.pdfBlob);
      const a = document.createElement('a');
      a.href = url; a.download = generatedBRD.pdfFilename || 'BRD.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
*/
    function downloadPDF() {
  if (!generatedBRD.downloadUrl) { 
    alert('No PDF available'); 
    return; 
  }
  window.open(generatedBRD.downloadUrl, '_blank');
}
    function startNewProject() {
      // UNLOCK BRD MODE
      inBRDMode = false;
      console.log("[BRD Mode] UNLOCKED");
      
      if (closeBtn) closeBtn.style.display = '';
      if (backBtn) backBtn.style.display = '';
      
      window.__vapiUi.collected = {};
      window.__vapiUi.selected.clear();
      window.__vapiUi.flow = null;
      window.__vapiUi.step = null;
      window.__vapiUi.pendingField = null;
      window.__vapiUi.lastCategory = null;
      
      generatedBRD = { originalHtml: "", html: "", designImageBase64: null, designImageUrl: null, designSource: null, userUploadedImageBase64: null, userUploadedImageName: null, pdfBase64: null, pdfBlob: null, pdfFilename: null };
      
      if (brdEmailInput) brdEmailInput.value = "";
      if (brdUploadInput) brdUploadInput.value = "";
      if (emailInput) emailInput.value = "";
      
      hideOverlay();
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================

    brdUploadBtn?.addEventListener("click", () => { brdUploadInput?.click(); });
    brdUploadInput?.addEventListener("change", handleDesignUpload);
    brdResetBtn?.addEventListener("click", resetBRDContent);
    brdSubmitBtn?.addEventListener("click", submitBRD);
    successDownloadBtn?.addEventListener("click", downloadPDF);
    successNewBtn?.addEventListener("click", startNewProject);

    // ============================================
    // DEBUG
    // ============================================

    window.__vapiDebug = {
      getCollected: () => window.__vapiUi.collected,
      getGeneratedBRD: () => generatedBRD,
      getBRDMode: () => inBRDMode,
      unlockBRDMode: () => { inBRDMode = false; if (closeBtn) closeBtn.style.display = ''; console.log("BRD mode unlocked"); },
      testPDFContent: () => buildPDFContent()  
    };

    console.log('[Vapi] Voice assistant initialized with BRD Mode lock!');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
