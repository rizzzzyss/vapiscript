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
    const GEMINI_WORKER_URL = "https://geminiworker.rizwin.workers.dev"; // Replace with your worker URL
    const RESEND_WORKER_URL = "https://resendworker.rizwin.workers.dev"; // Replace with your worker URL
    const WORKER_SECRET = "xK9#mP2$vL5nQ8wR"; // Set if you configured WORKER_SECRET in your workers
    
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
    
    // Loading Screen
    const screenLoading = document.getElementById("vapiScreenLoading"),
      loadingText = document.getElementById("vapiLoadingText"),
      loadingProgress = document.getElementById("vapiLoadingProgress");
    
    // BRD Viewer Screen
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
    
    // Success Screen
    const screenSuccess = document.getElementById("vapiScreenSuccess"),
      successEmail = document.getElementById("vapiSuccessEmail"),
      successNewBtn = document.getElementById("vapiSuccessNewBtn"),
      successDownloadBtn = document.getElementById("vapiSuccessDownloadBtn");

    if (!pill || !icon || !overlay) {
      console.error('[Vapi] Required DOM elements not found. Make sure HTML is loaded before this script.');
      console.log('[Vapi] Missing elements:', { pill: !!pill, icon: !!icon, overlay: !!overlay });
      return;
    }

    console.log('[Vapi] Initializing voice assistant...');

    // ============================================
    // EXISTING STATE VARIABLES (UNCHANGED)
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
    // NEW STATE VARIABLES (BRD FEATURE)
    // ============================================
    
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

    // ============================================
    // EXISTING FUNCTIONS (UNCHANGED)
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
      VAD_CONFIG.debug && n > .005 && console.log(`[VAD] RMS: ${n.toFixed(4)} | Threshold: ${VAD_CONFIG.speechThreshold} | Speaking: ${statusState.isSpeechActive}`);
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

    const buttonConfig = {
      idle: {
        color: "rgb(37, 211, 102)",
        icon: "https://unpkg.com/lucide-static@0.321.0/icons/phone.svg"
      },
      loading: {
        color: "rgb(93, 124, 202)",
        icon: "https://unpkg.com/lucide-static@0.321.0/icons/loader-2.svg"
      },
      active: {
        color: "rgb(255, 0, 0)",
        icon: "https://unpkg.com/lucide-static@0.321.0/icons/phone-off.svg"
      }
    };

    function setState(e) {
      const t = buttonConfig[e];
      pill.style.background = t.color;
      icon.src = t.icon;
      e === "idle" ? (pill.style.animation = "vapi-pulse-ring 2s infinite", icon.style.animation = "none") : e === "loading" ? (pill.style.animation = "none", icon.style.animation = "vapi-spin 1s linear infinite") : (pill.style.animation = "none", icon.style.animation = "none");
    }

    setState("idle");

    window.__vapiUi = window.__vapiUi || {
      flow: null,
      step: null,
      pendingField: null,
      mode: "single",
      max: 1,
      selected: new Set,
      collected: {},
      lastCategory: null
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

    function hideOverlay() {
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden", "true");
      window.__vapiUi.selected.clear();
      document.body.classList.remove("vapi-overlay-open");
    }

    function attemptCloseOverlay() {
      if (!confirm("If you close now, you will lose the data and you must start from the beginning. Close anyway?")) return;
      isActive ? (stopCall(true), setState("idle")) : hideOverlay();
    }

    // MODIFIED: Added new screens to showScreen function
    function showScreen(e) {
      showOverlay();
      setUiProcessing(false);
      textInput && (textInput.disabled = false);
      emailInput && (emailInput.disabled = false);
      cardsGrid && [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach(t => {
        t.disabled = false;
        t.style.opacity = "1";
      });
      // Updated to include new screens
      [screenCards, screenQuestion, screenPreview, screenEmail, screenLoading, screenBRD, screenSuccess].forEach(t => {
        t && (t.classList.remove("is-active"), t.style.opacity = "1", t.style.pointerEvents = "auto");
      });
      e?.classList.add("is-active");
    }

    overlay.addEventListener("click", e => {
      e.target === overlay && attemptCloseOverlay();
    });

    closeBtn?.addEventListener("click", attemptCloseOverlay);

    backBtn?.addEventListener("click", () => {
      sendToolResult({
        action: "back",
        category: window.__vapiUi.lastCategory
      });
      hideOverlay();
    });

    function sendToolResult(e) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.log("[ToolResult] Socket not open");
        return;
      }
      const t = pendingToolCallId;
      if (!t) {
        console.log("[ToolResult] No pending tool call ID - sending as user message instead");
        sendAsUserMessage(typeof e == "string" ? e : e.value || e.userInput || JSON.stringify(e));
        return;
      }
      const n = typeof e == "string" ? e : JSON.stringify(e),
        i = {
          type: "tool-calls-result",
          toolCallResult: {
            toolCallId: t,
            result: n
          }
        };
      console.log("[ToolResult] Sending tool-calls-result:", i);
      socket.send(JSON.stringify(i));
      const s = {
        type: "add-message",
        message: {
          role: "tool",
          tool_call_id: t,
          content: n
        }
      };
      console.log("[ToolResult] Also sending add-message:", s);
      socket.send(JSON.stringify(s));
      pendingToolCallId = null;
      pendingToolName = null;
    }

    function sendAsUserMessage(e) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.log("[UserMessage] Socket not open");
        return;
      }
      const t = {
        type: "add-message",
        message: {
          role: "user",
          content: e
        }
      };
      console.log("[UserMessage] Sending:", t);
      socket.send(JSON.stringify(t));
    }

    const norm = e => String(e || "").toLowerCase().trim().replace(/\s+/g, " "),
      hasVal = e => !(e === void 0 || e === null || e === "" || Array.isArray(e) && e.length === 0);

    function escapeHtml(e) {
      return String(e ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
    }

    function setCollected(e, t) {
      e && (window.__vapiUi.collected[e] = t);
    }

    const CATEGORY_CARDS = {
      main_menu: {
        title: "Main Menu",
        sub: "Please choose one.",
        flow: "main",
        step: "MAIN_MENU",
        field: "service",
        mode: "single",
        options: ["Website Development", "ERP Implementation", "Digital Marketing", "Consulting"],
        hint: "🗣️ say: Website, ERP, Marketing, or Consulting"
      },
      website_mode: {
        title: "Website Development",
        sub: "Do you want a ready template or a custom website?",
        flow: "website",
        step: "WEBSITE_MODE",
        field: "website_mode",
        mode: "single",
        options: ["Template", "Custom"],
        hint: "🗣️ Say the type (or tap)."
      },
      website_platform: {
        title: "Platform",
        sub: "Which platform do you prefer?",
        flow: "website",
        step: "WEBSITE_PLATFORM",
        field: "website_platform",
        mode: "single",
        options: ["Webflow", "WordPress", "Other"],
        hint: "🗣️ say the platform name"
      },
      website_industry: {
        title: "Industry",
        sub: "Which industry is this for?",
        flow: "website",
        step: "WEBSITE_INDUSTRY",
        field: "website_industry",
        mode: "single",
        options: ["Real Estate", "Healthcare", "Restaurant", "Construction", "Logistics", "Education", "Retail", "Services", "Other"],
        hint: "🗣️ say your industry"
      },
      website_site_type: {
        title: "Website Type",
        sub: "Do you need a landing page, a company profile, or a portal?",
        flow: "website",
        step: "WEBSITE_TYPE",
        field: "website_site_type",
        mode: "single",
        options: ["Landing Page", "Company Profile", "Portal"],
        hint: "🗣️ say the type"
      },
      erp_vendor: {
        title: "ERP Vendor",
        sub: "Which ERP are you considering?",
        flow: "erp",
        step: "ERP_VENDOR",
        field: "erp_vendor",
        mode: "single",
        options: ["Odoo", "SAP", "Oracle", "Dynamics 365", "Not sure (recommend)"],
        hint: "🗣️ say the ERP name"
      },
      erp_industry: {
        title: "ERP Industry",
        sub: "Choose your industry.",
        flow: "erp",
        step: "ERP_INDUSTRY",
        field: "erp_industry",
        mode: "single",
        options: ["Manufacturing", "Trading", "Services", "Construction"],
        hint: "🗣️ say your industry"
      },
      erp_modules: {
        title: "Modules",
        sub: "Pick 3-5 modules.",
        flow: "erp",
        step: "ERP_MODULES",
        field: "erp_modules",
        mode: "multi",
        max: 5,
        options: ["Sales", "Purchase", "Inventory", "Accounting", "Manufacturing", "Projects", "HR"],
        hint: "🗣️ say them (e.g., 'Sales, Purchase, Inventory')"
      },
      erp_integrations: {
        title: "Integrations",
        sub: "Do you need integrations?",
        flow: "erp",
        step: "ERP_INTEGRATIONS",
        field: "erp_integrations",
        mode: "single",
        options: ["POS", "eCommerce", "WMS", "Bank", "None"],
        hint: "say what you need"
      },
      marketing_channel: {
        title: "Digital Marketing",
        sub: "Which area do you want help with?",
        flow: "marketing",
        step: "MKT_CHANNEL",
        field: "marketing_channel",
        mode: "single",
        options: ["SEO", "Google Ads", "Meta Ads", "Social Media Management", "Branding/Content"],
        hint: "say the service (e.g., 'SEO' or 'Google Ads')"
      },
      consulting_topic: {
        title: "Consulting",
        sub: "What kind of consulting do you need?",
        flow: "consulting",
        step: "CONSULT_TOPIC",
        field: "consulting_topic",
        mode: "single",
        options: ["Strategy", "AI / Automation", "ERP / Operations", "Website / Product", "Other"],
        hint: "🗣️ say the topic"
      }
    };

    const QUESTIONS = {
      website_goal: {
        flow: "website",
        field: "website_goal",
        title: "Website Goal",
        question: "What is the main goal? Leads, bookings, sales, or info?",
        placeholder: "Leads / bookings / sales / info",
        inputType: "text"
      },
      website_features: {
        flow: "website",
        field: "website_features",
        title: "Must-have features",
        question: "List up to 3 must-have features (e.g., WhatsApp, booking, login, payment, multilingual).",
        placeholder: "Feature 1, Feature 2, Feature 3",
        inputType: "text"
      },
      website_sections: {
        flow: "website",
        field: "website_sections",
        title: "Sections / Features",
        question: "For a custom website: what key sections/features do you need (max 5)?",
        placeholder: "Home, About, Services, Contact, ...",
        inputType: "text"
      },
      website_reference_sites: {
        flow: "website",
        field: "website_reference_sites",
        title: "Reference",
        question: "Any reference websites you like? (optional)",
        placeholder: "Paste URLs (optional)",
        inputType: "url"
      },
      website_content_ready: {
        flow: "website",
        field: "website_content_ready",
        title: "Content readiness",
        question: "Do you have logo, text, and images ready?",
        placeholder: "Yes / No / Partially",
        inputType: "text"
      },
      website_timeline: {
        flow: "website",
        field: "website_timeline",
        title: "Timeline",
        question: "When do you want to go live?",
        placeholder: "e.g., 2 weeks / 1 month",
        inputType: "text"
      },
      erp_users_count: {
        flow: "erp",
        field: "erp_users_count",
        title: "Users",
        question: "How many users will use the ERP?",
        placeholder: "e.g., 10",
        inputType: "number"
      },
      erp_data_readiness: {
        flow: "erp",
        field: "erp_data_readiness",
        title: "Data readiness",
        question: "Do you have masters in Excel (products/customers/vendors)?",
        placeholder: "Yes / No / Partially",
        inputType: "text"
      },
      erp_timeline: {
        flow: "erp",
        field: "erp_timeline",
        title: "Go-live",
        question: "What is your go-live target?",
        placeholder: "e.g., March 2026",
        inputType: "text"
      },
      marketing_goal: {
        flow: "marketing",
        field: "marketing_goal",
        title: "Marketing Goal",
        question: "What is your goal? Leads, sales, traffic, or brand?",
        placeholder: "Leads / sales / traffic / brand",
        inputType: "text"
      },
      marketing_location_targeting: {
        flow: "marketing",
        field: "marketing_location_targeting",
        title: "Targeting",
        question: "Which locations do you want to target?",
        placeholder: "e.g., Dubai, UAE",
        inputType: "text"
      },
      marketing_current_assets: {
        flow: "marketing",
        field: "marketing_current_assets",
        title: "Current assets",
        question: "Do you already have a website/landing page/social pages?",
        placeholder: "Website / landing / socials",
        inputType: "text"
      },
      marketing_timeline: {
        flow: "marketing",
        field: "marketing_timeline",
        title: "Timeline",
        question: "When do you want to start?",
        placeholder: "e.g., ASAP / next week",
        inputType: "text"
      },
      consulting_current_situation: {
        flow: "consulting",
        field: "consulting_current_situation",
        title: "Current situation",
        question: "What's the current situation?",
        placeholder: "Brief context",
        inputType: "text"
      },
      consulting_desired_outcome: {
        flow: "consulting",
        field: "consulting_desired_outcome",
        title: "Desired outcome",
        question: "What outcome do you want?",
        placeholder: "Desired result",
        inputType: "text"
      },
      consulting_urgency: {
        flow: "consulting",
        field: "consulting_urgency",
        title: "Urgency",
        question: "How urgent is this?",
        placeholder: "Today / this week / this month",
        inputType: "text"
      },
      collect_email: {
        flow: "all",
        field: "email",
        title: "Your Email",
        question: "Where should we send your requirements?",
        placeholder: "name@email.com",
        inputType: "email"
      }
    };

    function renderCardsFromConfig(e) {
      window.__vapiUi.flow = e.flow || window.__vapiUi.flow;
      window.__vapiUi.step = e.step || window.__vapiUi.step;
      window.__vapiUi.pendingField = e.field || window.__vapiUi.pendingField;
      window.__vapiUi.mode = e.mode || "single";
      window.__vapiUi.max = Math.max(1, Number(e.max || 1));
      window.__vapiUi.selected.clear();
      setHeader(e.title || "Say your choice", e.sub || "Say one of the options (or tap).");
      hintEl && (hintEl.textContent = e.hint || "🗣️ Just say it (you can also tap a card).");
      confirmMultiBtn && (confirmMultiBtn.style.display = e.mode === "multi" ? "inline-flex" : "none", confirmMultiBtn.disabled = true);
      if (!cardsGrid) return;
      cardsGrid.innerHTML = "";
      const t = Array.isArray(e.options) ? e.options : [];
      t.forEach(n => {
        const i = n,
          s = document.createElement("button");
        s.type = "button";
        s.className = "vapi-cardbtn";
        s.textContent = n;
        s.addEventListener("click", async () => {
          if (window.__vapiUi.mode === "multi") {
            window.__vapiUi.selected.has(i) ? window.__vapiUi.selected.delete(i) : window.__vapiUi.selected.size < window.__vapiUi.max && window.__vapiUi.selected.add(i);
            s.classList.toggle("is-selected", window.__vapiUi.selected.has(i));
            confirmMultiBtn && (confirmMultiBtn.disabled = window.__vapiUi.selected.size === 0);
            setCollected(window.__vapiUi.pendingField, Array.from(window.__vapiUi.selected));
            return;
          }
          [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach(a => a.classList.remove("is-selected"));
          s.classList.add("is-selected");
          setCollected(window.__vapiUi.pendingField, i);
          console.log("[Click] Sending selection:", i);
          setUiProcessing(true);
          [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach(a => {
            a.disabled = true;
            a.style.opacity = "0.6";
          });
          sendToolResult({
            field: window.__vapiUi.pendingField,
            value: i,
            userSelected: i
          });
          sendAsUserMessage(i);
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
      console.log("[Click] Submitting multi-selection for field:", t, "values:", n);
      setUiProcessing(true);
      sendToolResult({
        field: t,
        values: e,
        userSelected: n
      });
      setTimeout(() => {
        pendingToolCallId || sendAsUserMessage(`I selected: ${n}`);
      }, 300);
    });

    sendEmailBtn?.addEventListener("click", async () => {
      const e = String(emailInput?.value || "").trim();
      if (!e) return;
      setCollected("email", e);
      console.log("[Click] Submitting email:", e);
      setUiProcessing(true);
      emailInput && (emailInput.disabled = true);
      sendToolResult({
        field: "email",
        value: e,
        email: e,
        collected: window.__vapiUi.collected
      });
      setTimeout(() => {
        pendingToolCallId || sendAsUserMessage(`My email is ${e}`);
      }, 300);
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
      console.log("[Click] Submitting text for field:", t, "value:", e);
      setUiProcessing(true);
      textInput && (textInput.disabled = true);
      sendToolResult({
        field: t,
        value: e,
        userInput: e
      });
      setTimeout(() => {
        pendingToolCallId || sendAsUserMessage(`My answer for ${t} is: ${e}`);
      }, 300);
    });

    function generatePreviewHtml(e) {
      const t = window.__vapiUi.collected || {},
        n = [],
        i = (s, a) => {
          const o = t[s];
          if (!hasVal(o)) return;
          const l = Array.isArray(o) ? o.join(", ") : String(o);
          n.push(`<div style="padding:10px 0;border-bottom:1px solid #eee;"><div style="font-weight:900">${escapeHtml(a)}</div><div style="opacity:.85">${escapeHtml(l)}</div></div>`);
        };
      e === "preview_website" ? (i("service", "Service Selected"), i("website_mode", "Mode"), i("website_platform", "Platform"), i("website_industry", "Industry"), i("website_site_type", "Type"), i("website_goal", "Goal"), i("website_features", "Must-have features"), i("website_sections", "Sections / Features"), i("website_content_ready", "Content ready"), i("website_reference_sites", "Reference sites"), i("website_timeline", "Timeline")) : e === "preview_erp" ? (i("service", "Service Selected"), i("erp_vendor", "ERP Vendor"), i("erp_industry", "Industry"), i("erp_users_count", "Users"), i("erp_modules", "Modules"), i("erp_data_readiness", "Excel masters ready"), i("erp_integrations", "Integrations"), i("erp_timeline", "Go-live target")) : e === "preview_marketing" ? (i("service", "Service Selected"), i("marketing_channel", "Channel"), i("marketing_goal", "Goal"), i("marketing_location_targeting", "Target locations"), i("marketing_current_assets", "Current assets"), i("marketing_timeline", "Timeline")) : e === "preview_consulting" && (i("service", "Service Selected"), i("consulting_topic", "Topic"), i("consulting_current_situation", "Current situation"), i("consulting_desired_outcome", "Desired outcome"), i("consulting_urgency", "Urgency"));
      return n.length ? `<div>${n.join("")}</div>` : '<div style="font-weight:800;opacity:.75">No data captured yet.</div>';
    }

    function renderPreview(e) {
      setHeader("Requirement Preview", "Approve or go back to edit.");
      previewHtmlEl && (previewHtmlEl.innerHTML = generatePreviewHtml(e));
      previewLinkEl && (previewLinkEl.style.display = "none");
      showScreen(screenPreview);
    }

    // MODIFIED: approveBtn now triggers BRD generation
    approveBtn?.addEventListener("click", async () => {
      console.log("[Click] Approving preview - Starting BRD generation");
      setUiProcessing(true);
      
      // Send approval to AI (keeps conversation flow)
      sendToolResult({
        action: "approved",
        collected: window.__vapiUi.collected
      });
      sendAsUserMessage("I approve this");
      
      // Start BRD generation
      await generateFullBRD();
    });

    function renderEmailScreen() {
      setHeader("Submit", "Where should we send this?");
      emailInput && (emailInput.value = "");
      window.__vapiUi.pendingField = "email";
      showScreen(screenEmail);
    }

    function autoFillParentFields(e) {
      const t = window.__vapiUi.collected;
      e.startsWith("website_") && !t.service && (console.log("[AutoFill] Setting service = Website Development"), t.service = "Website Development");
      e.startsWith("erp_") && !t.service && (console.log("[AutoFill] Setting service = ERP Implementation"), t.service = "ERP Implementation");
      e.startsWith("marketing_") && !t.service && (console.log("[AutoFill] Setting service = Digital Marketing"), t.service = "Digital Marketing");
      e.startsWith("consulting_") && !t.service && (console.log("[AutoFill] Setting service = Consulting"), t.service = "Consulting");
    }

    function autoFillFromQuestionKey(e) {
      const t = window.__vapiUi.collected;
      e.startsWith("website_") && !t.service && (t.service = "Website Development");
      e.startsWith("erp_") && !t.service && (t.service = "ERP Implementation");
      e.startsWith("marketing_") && !t.service && (t.service = "Digital Marketing");
      e.startsWith("consulting_") && !t.service && (t.service = "Consulting");
    }

    function handleToolCalls(e) {
      const t = e?.message ?? e,
        n = t?.toolCallList ?? t?.toolCalls ?? [];
      n.forEach(i => {
        const s = i?.id || i?.toolCallId || i?.tool_call_id,
          a = i?.function?.name || i?.name;
        console.log("[ToolCall] Received:", a, "ID:", s);
        let o = i?.function?.arguments ?? i?.arguments ?? {};
        typeof o == "string" && (o = JSON.parse(o || "{}"));
        if (a === "ui_show_cards" && o.category) {
          pendingToolCallId = s;
          pendingToolName = a;
          window.__vapiUi.lastCategory = o.category;
          console.log("[ToolCall] Set lastCategory to:", o.category);
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
          const l = o.preview_type || o.category;
          renderPreview(l);
          return;
        }
        if (a === "ui_show_email") {
          pendingToolCallId = s;
          pendingToolName = a;
          renderEmailScreen();
          return;
        }
        a === "ui_close" && hideOverlay();
      });
    }

    function tryMatchOptionFromCards(e) {
      const t = CATEGORY_CARDS[window.__vapiUi.lastCategory];
      if (!t) return null;
      const n = norm(e);
      if (!n) return null;
      const i = t.options || [];
      for (const s of i) {
        const a = norm(s);
        if (n === a || n.includes(a)) return s;
      }
      if (window.__vapiUi.lastCategory === "main_menu") {
        if (n.includes("website") || n.includes("web")) return "Website Development";
        if (n.includes("erp") || n.includes("odoo") || n.includes("sap") || n.includes("oracle") || n.includes("dynamics")) return "ERP Implementation";
        if (n.includes("marketing") || n.includes("seo") || n.includes("ads")) return "Digital Marketing";
        if (n.includes("consult") || n.includes("strategy") || n.includes("advice") || n.includes("meeting")) return "Consulting";
      }
      return null;
    }

    function applyVoiceToUI(e) {
      const t = String(e || "").trim();
      if (!t) return;
      if (screenCards?.classList.contains("is-active")) {
        const n = CATEGORY_CARDS[window.__vapiUi.lastCategory];
        if (!n) return;
        if (n.mode === "multi") {
          const i = norm(t).split(/[,\s]+/).filter(Boolean),
            s = [];
          for (const a of i) {
            const o = n.options.find(l => norm(l) === a || norm(l).includes(a) || a.includes(norm(l)));
            o && s.push(o);
          }
          s.length && (s.slice(0, n.max || 5).forEach(a => window.__vapiUi.selected.add(a)), setCollected(n.field, Array.from(window.__vapiUi.selected)), [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach(a => {
            a.classList.toggle("is-selected", window.__vapiUi.selected.has(a.textContent));
          }), confirmMultiBtn && (confirmMultiBtn.disabled = window.__vapiUi.selected.size === 0));
          return;
        }
        const i = tryMatchOptionFromCards(t);
        if (!i) return;
        setCollected(n.field, i);
        [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach(s => {
          s.classList.toggle("is-selected", norm(s.textContent) === norm(i));
        });
        return;
      }
      if (screenQuestion?.classList.contains("is-active")) {
        window.__vapiUi.pendingField && (setCollected(window.__vapiUi.pendingField, t), textInput && (textInput.value = t));
        return;
      }
      screenEmail?.classList.contains("is-active") && t.includes("@") && (setCollected("email", t), emailInput && (emailInput.value = t));
    }

    function playPcm16(e, t = 16000) {
      playCtx || (playCtx = new(window.AudioContext || window.webkitAudioContext)({
        latencyHint: "interactive",
        sampleRate: t
      }));
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
      a.onended = () => {
        playCtx && playCtx.currentTime >= nextPlayTime - .05 && (window.vapiIsSpeaking = false, onAiSpeechEnded());
      };
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
      const e = Math.max(0, Math.min(1, window.vapiAudioLevel || 0)),
        t = performance.now();
      e > AI_LEVEL_START ? (aiLastLoudAt = t, window.vapiIsSpeaking || (window.vapiIsSpeaking = true, onAiSpeechStarted())) : window.vapiIsSpeaking && e < AI_LEVEL_END && t - aiLastLoudAt > AI_END_HOLD_MS && (window.vapiIsSpeaking = false, onAiSpeechEnded());
      const n = 1 + e * .08;
      pillWrap ? pillWrap.style.transform = `translateX(-50%) scale(${n})` : pill.style.transform = `scale(${n})`;
      isActive && requestAnimationFrame(updateAudioLevel);
    }

    async function createWebsocketCallUrl() {
      const e = {
        "content-type": "application/json"
      };
      BRIDGE_SECRET && (e["x-bridge-secret"] = BRIDGE_SECRET);
      const t = await fetch(CREATE_CALL_ENDPOINT, {
          method: "POST",
          headers: e,
          body: JSON.stringify({
            assistantId: ASSISTANT_ID
          })
        }),
        n = await t.json().catch(() => ({}));
      if (!t.ok) throw new Error(n?.vapiError?.message || "Worker/Vapi error");
      if (!n.websocketCallUrl) throw new Error("No websocketCallUrl returned");
      return n.websocketCallUrl;
    }

    function createWorkletProcessorBlob() {
      const e = `class VapiAudioProcessor extends AudioWorkletProcessor{constructor(){super();this.bufferSize=${AUDIO_CONFIG.workletBufferSize};this.buffer=new Float32Array(this.bufferSize);this.bufferIndex=0;this.inputSampleRate=sampleRate;this.outputSampleRate=16000;this.needsResampling=Math.abs(this.inputSampleRate-this.outputSampleRate)>100}resample(input){if(!this.needsResampling)return input;const ratio=this.inputSampleRate/this.outputSampleRate;const len=Math.floor(input.length/ratio);const out=new Float32Array(len);for(let i=0;i<len;i++){const idx=i*ratio;const f=Math.floor(idx);const c=Math.min(f+1,input.length-1);out[i]=input[f]*(1-(idx-f))+input[c]*(idx-f)}return out}floatTo16BitPCM(arr){const out=new Int16Array(arr.length);for(let i=0;i<arr.length;i++){const s=Math.max(-1,Math.min(1,arr[i]));out[i]=s<0?s*32768:s*32767}return out}process(inputs){const input=inputs[0];if(!input||!input[0])return true;for(let i=0;i<input[0].length;i++){this.buffer[this.bufferIndex++]=input[0][i];if(this.bufferIndex>=this.bufferSize){const resampled=this.resample(this.buffer);const pcm=this.floatTo16BitPCM(resampled);this.port.postMessage(pcm.buffer,[pcm.buffer]);this.bufferIndex=0;this.buffer=new Float32Array(this.bufferSize)}}return true}}registerProcessor('vapi-audio-processor',VapiAudioProcessor);`;
      return URL.createObjectURL(new Blob([e], {
        type: "application/javascript"
      }));
    }

    function extractTranscriptMessage(e) {
      const t = e?.transcript || e?.text || e?.content || e?.message?.content || e?.message?.text;
      if (!t) return null;
      const n = e?.role || e?.speaker || e?.from,
        i = n === "user" || n === "human" || n === "client" || e?.speaker === "user" || e?.from === "user",
        s = e?.isFinal === true || e?.final === true || e?.transcriptType === "final",
        a = e?.type === "transcript";
      return a && i && s ? String(t) : null;
    }

    async function startCall() {
      setState("loading");
      showStatusIndicator();
      updateStatusIndicator("connecting");
      nextPlayTime = 0;
      window.vapiAudioLevel = 0;
      window.vapiIsSpeaking = false;
      playCtx = playCtx || new(window.AudioContext || window.webkitAudioContext)({
        latencyHint: "interactive"
      });
      try {
        await playCtx.resume();
      } catch {}
      const e = await createWebsocketCallUrl();
      socket = new WebSocket(e);
      socket.binaryType = "arraybuffer";
      const t = setTimeout(() => {
        socket?.readyState !== WebSocket.OPEN && (stopCall(false), setState("idle"), hideStatusIndicator(), alert("Connection timeout. Check your network/worker."));
      }, AUDIO_CONFIG.connectionTimeoutMs);
      socket.onopen = async () => {
        clearTimeout(t);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        audioContext = new(window.AudioContext || window.webkitAudioContext);
        await audioContext.resume();
        const n = createWorkletProcessorBlob();
        await audioContext.audioWorklet.addModule(n);
        URL.revokeObjectURL(n);
        source = audioContext.createMediaStreamSource(stream);
        const i = audioContext.createGain();
        i.gain.value = 2.5;
        workletNode = new AudioWorkletNode(audioContext, "vapi-audio-processor");
        workletNode.port.onmessage = s => {
          socket?.readyState === WebSocket.OPEN && socket.send(s.data);
          processAudioForVAD(s.data);
        };
        source.connect(i);
        i.connect(workletNode);
        startVADCheck();
        isActive = true;
        setState("active");
        updateStatusIndicator("listening");
        updateAudioLevel();
      };
      socket.onmessage = async n => {
        if (n.data instanceof ArrayBuffer) {
          const s = new Int16Array(n.data);
          s.length > 0 && playPcm16(s, AUDIO_CONFIG.outputSampleRate);
          return;
        }
        const i = s => {
          let a;
          try {
            a = JSON.parse(s);
          } catch {
            return;
          }
          const o = a?.message ?? a;
          console.log("[WS Message]", o?.type, o);
          if (o?.type === "tool-calls") {
            handleToolCalls(a);
            return;
          }
          const l = extractTranscriptMessage(o);
          l && applyVoiceToUI(l);
        };
        if (typeof n.data == "string") return i(n.data);
        if (n.data instanceof Blob) try {
          i(await n.data.text());
        } catch {}
      };
      socket.onerror = () => {
        stopCall(false);
        setState("idle");
      };
      socket.onclose = () => {
        stopCall(false);
        setState("idle");
      };
    }

    function stopCall(e = true) {
      window.vapiAudioLevel = 0;
      window.vapiIsSpeaking = false;
      isActive = false;
      stopVADCheck();
      try {
        e && socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify({
          type: "end-call"
        }));
      } catch {}
      try {
        workletNode?.disconnect();
      } catch {}
      try {
        source?.disconnect();
      } catch {}
      try {
        audioContext?.close();
      } catch {}
      try {
        stream?.getTracks().forEach(t => t.stop());
      } catch {}
      try {
        socket?.close();
      } catch {}
      socket = stream = audioContext = workletNode = source = null;
      nextPlayTime = 0;
      pendingToolCallId = null;
      pendingToolName = null;
      pillWrap ? pillWrap.style.transform = "translateX(-50%) scale(1)" : pill.style.transform = "scale(1)";
      hideOverlay();
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
      try {
        isActive ? stopCall(true) : await startCall();
        isActive || setState("idle");
      } catch (e) {
        stopCall(false);
        setState("idle");
        alert(e?.message || "Failed to start call");
      }
    });

    window.addEventListener("beforeunload", () => {
      isActive && stopCall(false);
    });

    // ============================================
    // NEW FUNCTIONS (BRD FEATURE)
    // ============================================

    /**
     * Update loading screen status
     */
    function updateLoadingStatus(message, step) {
      if (loadingText) loadingText.textContent = message;
      
      if (loadingProgress) {
        const dots = loadingProgress.querySelectorAll('.progress-dot');
        dots.forEach((dot, index) => {
          dot.classList.toggle('active', index < step);
        });
      }
    }

    /**
     * Call Gemini Worker to generate BRD text
     */
    async function generateBRDText(collected) {
      const headers = { "Content-Type": "application/json" };
      if (WORKER_SECRET) headers["X-Worker-Secret"] = WORKER_SECRET;
      
      const response = await fetch(`${GEMINI_WORKER_URL}/generate-brd`, {
        method: "POST",
        headers,
        body: JSON.stringify({ collected })
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || "Failed to generate BRD");
      }
      
      const data = await response.json();
      return data.html;
    }

    /**
     * Call Gemini Worker to generate design mockup
     */
    async function generateDesignImage(collected) {
      const headers = { "Content-Type": "application/json" };
      if (WORKER_SECRET) headers["X-Worker-Secret"] = WORKER_SECRET;
      
      const response = await fetch(`${GEMINI_WORKER_URL}/generate-design`, {
        method: "POST",
        headers,
        body: JSON.stringify({ collected })
      });
      
      if (!response.ok) {
        console.warn("Design generation failed, continuing without design");
        return null;
      }
      
      const data = await response.json();
      return data;
    }

    /**
     * Main function to generate full BRD
     */
    async function generateFullBRD() {
      const collected = window.__vapiUi.collected;
      
      // Show loading screen
      showScreen(screenLoading);
      updateLoadingStatus("Generating your BRD...", 1);
      
      try {
        // Step 1: Generate BRD text
        updateLoadingStatus("Creating document content...", 1);
        const brdHtml = await generateBRDText(collected);
        generatedBRD.html = brdHtml;
        generatedBRD.originalHtml = brdHtml;
        
        // Step 2: Generate design mockup (only for websites)
        if (BRD_CONFIG.generateDesignFor.includes(collected.service)) {
          updateLoadingStatus("Creating design mockup...", 2);
          const designData = await generateDesignImage(collected);
          
          if (designData) {
            if (designData.image) {
              // Base64 image from Gemini
              generatedBRD.designImageBase64 = designData.image;
              generatedBRD.designImageUrl = `data:${designData.mimeType || 'image/png'};base64,${designData.image}`;
              generatedBRD.designSource = "gemini";
            } else if (designData.imageUrl) {
              // Placeholder URL
              generatedBRD.designImageUrl = designData.imageUrl;
              generatedBRD.designSource = "placeholder";
            }
          }
        }
        
        updateLoadingStatus("Preparing preview...", 3);
        
        // Small delay for UX
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Step 3: Show BRD viewer
        renderBRDViewer();
        
      } catch (error) {
        console.error('[BRD Generation Error]', error);
        alert('Failed to generate BRD: ' + error.message);
        showScreen(screenPreview); // Go back to preview
      }
    }

    /**
     * Render the BRD viewer screen
     */
    function renderBRDViewer() {
      const collected = window.__vapiUi.collected;
      
      // Set BRD content (editable)
      if (brdContent) {
        brdContent.innerHTML = generatedBRD.html;
      }
      
      // Show design preview (only for websites with design)
      if (brdDesignSection) {
        if (generatedBRD.designImageUrl) {
          brdDesignSection.classList.add('is-visible');
          if (brdDesignImage) {
            brdDesignImage.src = generatedBRD.designImageUrl;
          }
          if (brdDesignCaption) {
            brdDesignCaption.textContent = generatedBRD.designSource === "gemini" 
              ? "AI-Generated Design Mockup" 
              : "Design Preview (Placeholder)";
          }
        } else {
          brdDesignSection.classList.remove('is-visible');
        }
      }
      
      // Clear upload preview
      if (brdUploadPreview) {
        brdUploadPreview.innerHTML = "";
        brdUploadPreview.classList.remove('has-file');
      }
      
      // Pre-fill email if collected
      if (brdEmailInput && collected.email) {
        brdEmailInput.value = collected.email;
      }
      
      // Reset submit button
      if (brdSubmitBtn) {
        brdSubmitBtn.disabled = false;
        brdSubmitBtn.querySelector('.submit-text').textContent = "Submit & Send BRD";
      }
      
      // Show screen
      showScreen(screenBRD);
    }

    /**
     * Handle design file upload
     */
    function handleDesignUpload(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please upload an image file (PNG, JPG, etc.)');
        return;
      }
      
      // Validate file size
      if (file.size > BRD_CONFIG.maxUploadSizeMB * 1024 * 1024) {
        alert(`File too large. Maximum size: ${BRD_CONFIG.maxUploadSizeMB}MB`);
        return;
      }
      
      // Read as base64
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Full = e.target.result;
        const base64Data = base64Full.split(',')[1];
        
        generatedBRD.userUploadedImageBase64 = base64Data;
        generatedBRD.userUploadedImageName = file.name;
        
        // Show preview
        if (brdUploadPreview) {
          brdUploadPreview.innerHTML = `
            <div class="upload-preview-item">
              <img src="${base64Full}" alt="Uploaded design">
              <span>${escapeHtml(file.name)}</span>
              <button type="button" class="remove-upload" title="Remove">×</button>
            </div>
          `;
          brdUploadPreview.classList.add('has-file');
          
          // Add remove handler
          const removeBtn = brdUploadPreview.querySelector('.remove-upload');
          removeBtn?.addEventListener('click', removeUploadedDesign);
        }
      };
      reader.readAsDataURL(file);
    }

    /**
     * Remove uploaded design
     */
    function removeUploadedDesign() {
      generatedBRD.userUploadedImageBase64 = null;
      generatedBRD.userUploadedImageName = null;
      
      if (brdUploadInput) brdUploadInput.value = "";
      if (brdUploadPreview) {
        brdUploadPreview.innerHTML = "";
        brdUploadPreview.classList.remove('has-file');
      }
    }

    /**
     * Reset BRD to original
     */
    function resetBRDContent() {
      if (brdContent && generatedBRD.originalHtml) {
        brdContent.innerHTML = generatedBRD.originalHtml;
      }
    }

    /**
     * Build PDF HTML content
     */
    function buildPDFContent() {
      const collected = window.__vapiUi.collected;
      const today = new Date().toLocaleDateString("en-US", { 
        year: "numeric", 
        month: "long", 
        day: "numeric" 
      });
      
      // Get edited BRD content
      const editedBRD = brdContent?.innerHTML || generatedBRD.html;
      
      let html = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #333;">
          <!-- Header -->
          <div style="text-align: center; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid #D4AF37;">
            <h1 style="color: #333; margin: 0; font-size: 28px;">BUSINESS REQUIREMENTS DOCUMENT</h1>
            <p style="color: #666; margin: 10px 0 0 0;">
              ${escapeHtml(collected.service || 'Project')} | ${today}
            </p>
            ${collected.email ? `<p style="color: #888; margin: 5px 0 0 0;">Client: ${escapeHtml(collected.email)}</p>` : ''}
          </div>
          
          <!-- BRD Content -->
          <div style="margin-bottom: 40px;">
            ${editedBRD}
          </div>
      `;
      
      // Add AI generated design (if exists)
      if (generatedBRD.designImageUrl) {
        html += `
          <div style="margin-bottom: 40px; page-break-before: auto;">
            <h2 style="color: #333; border-bottom: 2px solid #D4AF37; padding-bottom: 10px;">
              Design Preview
            </h2>
            <div style="text-align: center; margin-top: 20px;">
              <img src="${generatedBRD.designImageUrl}" 
                   style="max-width: 100%; max-height: 400px; border: 1px solid #ddd; border-radius: 8px;"
                   alt="Website Design Mockup">
              <p style="color: #888; font-size: 12px; margin-top: 10px;">
                ${generatedBRD.designSource === "gemini" ? "AI-Generated Design Mockup" : "Design Preview"}
              </p>
            </div>
          </div>
        `;
      }
      
      // Add user uploaded design (if exists)
      if (generatedBRD.userUploadedImageBase64) {
        html += `
          <div style="margin-bottom: 40px;">
            <h2 style="color: #333; border-bottom: 2px solid #D4AF37; padding-bottom: 10px;">
              Client Reference Design
            </h2>
            <div style="text-align: center; margin-top: 20px;">
              <img src="data:image/png;base64,${generatedBRD.userUploadedImageBase64}" 
                   style="max-width: 100%; max-height: 400px; border: 1px solid #ddd; border-radius: 8px;"
                   alt="Client Uploaded Design">
              <p style="color: #888; font-size: 12px; margin-top: 10px;">
                ${escapeHtml(generatedBRD.userUploadedImageName || 'Client Reference')}
              </p>
            </div>
          </div>
        `;
      }
      
      // Footer
      html += `
          <!-- Footer -->
          <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center;">
            <p style="color: #888; font-size: 12px; margin: 0;">
              Generated by BRD Generator<br>
              Contact: ${ADMIN_EMAIL}
            </p>
          </div>
        </div>
      `;
      
      return html;
    }

    /**
     * Generate PDF using html2pdf.js
     */
    async function generatePDF() {
      // Check if html2pdf is available
      if (typeof html2pdf === 'undefined') {
        throw new Error('html2pdf.js library not loaded. Please add it to your page.');
      }
      
      const pdfContent = buildPDFContent();
      const collected = window.__vapiUi.collected;
      
      // Create temporary container
      const container = document.createElement('div');
      container.innerHTML = pdfContent;
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '800px';
      document.body.appendChild(container);
      
      // Generate filename
      const service = (collected.service || 'Project').replace(/\s+/g, '-');
      const date = new Date().toISOString().split('T')[0];
      const filename = `BRD-${service}-${date}.pdf`;
      
      // PDF options
      const options = {
        margin: [10, 10, 10, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { 
          scale: 2, 
          useCORS: true,
          logging: false,
          allowTaint: true
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait' 
        }
      };
      
      try {
        // Generate PDF blob
        const pdfBlob = await html2pdf().set(options).from(container).outputPdf('blob');
        
        // Convert to base64
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(pdfBlob);
        });
        
        generatedBRD.pdfBlob = pdfBlob;
        generatedBRD.pdfBase64 = base64;
        generatedBRD.pdfFilename = filename;
        
        return { blob: pdfBlob, base64, filename };
        
      } finally {
        document.body.removeChild(container);
      }
    }

    /**
     * Send BRD email via Resend Worker
     */
    async function sendBRDEmail(userEmail) {
      const collected = window.__vapiUi.collected;
      
      // Build project summary
      const projectSummary = {};
      Object.entries(collected).forEach(([key, value]) => {
        if (value) {
          projectSummary[key] = Array.isArray(value) ? value.join(', ') : value;
        }
      });
      
      const payload = {
        userEmail: userEmail,
        userName: userEmail.split('@')[0],
        projectType: collected.service || 'Project',
        projectSummary: projectSummary,
        pdfBase64: generatedBRD.pdfBase64,
        pdfFilename: generatedBRD.pdfFilename
      };
      
      const headers = { "Content-Type": "application/json" };
      if (WORKER_SECRET) headers["X-Worker-Secret"] = WORKER_SECRET;
      
      const response = await fetch(`${RESEND_WORKER_URL}/send-brd`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || error?.message || 'Failed to send email');
      }
      
      return await response.json();
    }

    /**
     * Submit BRD - generate PDF and send email
     */
    async function submitBRD() {
      const userEmail = brdEmailInput?.value?.trim();
      
      // Validate email
      if (!userEmail || !userEmail.includes('@')) {
        alert('Please enter a valid email address');
        brdEmailInput?.focus();
        return;
      }
      
      // Update button state
      if (brdSubmitBtn) {
        brdSubmitBtn.disabled = true;
        const submitText = brdSubmitBtn.querySelector('.submit-text');
        if (submitText) submitText.textContent = "Generating PDF...";
      }
      
      try {
        // Step 1: Generate PDF
        await generatePDF();
        
        // Step 2: Send email
        if (brdSubmitBtn) {
          const submitText = brdSubmitBtn.querySelector('.submit-text');
          if (submitText) submitText.textContent = "Sending email...";
        }
        await sendBRDEmail(userEmail);
        
        // Step 3: Show success
        showSuccessScreen(userEmail);
        
      } catch (error) {
        console.error('[Submit BRD Error]', error);
        alert('Failed to submit BRD: ' + error.message);
        
        // Reset button
        if (brdSubmitBtn) {
          brdSubmitBtn.disabled = false;
          const submitText = brdSubmitBtn.querySelector('.submit-text');
          if (submitText) submitText.textContent = "Submit & Send BRD";
        }
      }
    }

    /**
     * Show success screen
     */
    function showSuccessScreen(userEmail) {
      // Set email info
      if (successEmail) {
        successEmail.innerHTML = `
          <p>📧 Sent to: <strong>${escapeHtml(userEmail)}</strong></p>
          <p>📧 Copy to: <strong>${escapeHtml(ADMIN_EMAIL)}</strong></p>
        `;
      }
      
      showScreen(screenSuccess);
    }

    /**
     * Download PDF
     */
    function downloadPDF() {
      if (!generatedBRD.pdfBlob) {
        alert('No PDF available. Please try again.');
        return;
      }
      
      const url = URL.createObjectURL(generatedBRD.pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = generatedBRD.pdfFilename || 'BRD.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    /**
     * Start new project - reset everything
     */
    function startNewProject() {
      // Reset collected data
      window.__vapiUi.collected = {};
      window.__vapiUi.selected.clear();
      window.__vapiUi.flow = null;
      window.__vapiUi.step = null;
      window.__vapiUi.pendingField = null;
      window.__vapiUi.lastCategory = null;
      
      // Reset generated BRD
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
        pdfFilename: null
      };
      
      // Clear inputs
      if (brdEmailInput) brdEmailInput.value = "";
      if (brdUploadInput) brdUploadInput.value = "";
      if (emailInput) emailInput.value = "";
      
      // Hide overlay
      hideOverlay();
    }

    // ============================================
    // NEW EVENT LISTENERS (BRD FEATURE)
    // ============================================

    // Upload button click
    brdUploadBtn?.addEventListener("click", () => {
      brdUploadInput?.click();
    });

    // File input change
    brdUploadInput?.addEventListener("change", handleDesignUpload);

    // Reset BRD button
    brdResetBtn?.addEventListener("click", resetBRDContent);

    // Submit BRD button
    brdSubmitBtn?.addEventListener("click", submitBRD);

    // Success screen - Download PDF
    successDownloadBtn?.addEventListener("click", downloadPDF);

    // Success screen - New Project
    successNewBtn?.addEventListener("click", startNewProject);

    // ============================================
    // DEBUG (EXISTING + NEW)
    // ============================================

    window.__vapiDebug = {
      getAudioLevel: () => statusState.inputAudioLevel,
      isSpeaking: () => statusState.isSpeechActive,
      isAiSpeaking: () => window.vapiIsSpeaking,
      setThreshold: e => {
        VAD_CONFIG.speechThreshold = e;
        console.log(`Threshold set to ${e}`);
      },
      enableDebug: () => {
        VAD_CONFIG.debug = true;
        console.log("VAD debug enabled");
      },
      disableDebug: () => {
        VAD_CONFIG.debug = false;
        console.log("VAD debug disabled");
      },
      getStatus: () => statusState.current,
      getPendingToolCall: () => ({
        id: pendingToolCallId,
        name: pendingToolName
      }),
      testToolResult: e => sendToolResult(e),
      testUserMessage: e => sendAsUserMessage(e),
      // New BRD debug functions
      getCollected: () => window.__vapiUi.collected,
      getGeneratedBRD: () => generatedBRD,
      testBRDGeneration: () => generateFullBRD(),
      testPDFGeneration: () => generatePDF()
    };

    console.log('[Vapi] Voice assistant initialized successfully!');
    console.log('[Vapi] BRD feature enabled');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM is already ready
    init();
  }
})();