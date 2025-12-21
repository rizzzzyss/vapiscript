<script>
/* ============================================= */
/* COMPLETE JAVASCRIPT - TOOL CALL RESPONSE     */
/* Button clicks now work with Vapi!            */
/* ============================================= */

(() => {
  // =========================
  // CONFIG
  // =========================
  const ASSISTANT_ID = "f672758a-e394-4c2e-a0f1-f82e85273f35";
  const CREATE_CALL_ENDPOINT = "https://vapi-ws-bridge.rizwin.workers.dev/";
  const BRIDGE_SECRET = null;
  const UI_EVENT_ENDPOINT = null;
  const AUDIO_CONFIG = {
    workletBufferSize: 512,
    outputSampleRate: 16000,
    connectionTimeoutMs: 8000,
    minQueueAheadSec: 0.05,
    maxQueueAheadSec: 0.8,
  };

  // =========================
  // STATUS INDICATOR CONFIG
  // =========================
  const STATUS_CONFIG = {
    IDLE_TIMEOUT_MS: 8000,
    IDLE_REMINDER_INTERVAL_MS: 15000,
    USER_SPEAKING_DECAY_MS: 800,
    AI_SPEAKING_DECAY_MS: 500,
  };

  const STATUS_MESSAGES = {
    connecting: "Connecting...",
    listening: "Listening...",
    userSpeaking: "You're speaking...",
    aiSpeaking: "AI speaking...",
    idle: ["Still there? 👋", "Say something...", "Tap or speak 🎤", "Hello? 👂"],
    processing: "Processing...",
  };

  // =========================
  // VOICE ACTIVITY DETECTION (VAD) CONFIG
  // =========================
  const VAD_CONFIG = {
    speechThreshold: 0.018,
    silenceThreshold: 0.008,
    speechCheckIntervalMs: 50,
    minSpeechDurationMs: 100,
    debug: false,
  };

  // =========================
  // DOM
  // =========================
  const pillWrap = document.getElementById("vapi-ws-pill");
  const pill = document.getElementById("vapiCallBtn");
  const icon = document.getElementById("vapiBtnIcon");
  const overlay = document.getElementById("vapiOverlay");
  const vapiTitle = document.getElementById("vapiTitle");
  const vapiSub = document.getElementById("vapiSub");
  const backBtn = document.getElementById("vapiBackBtn");
  const closeBtn = document.getElementById("vapiCloseBtn");
  const screenCards = document.getElementById("vapiScreenCards");
  const screenQuestion = document.getElementById("vapiScreenQuestion");
  const screenPreview = document.getElementById("vapiScreenPreview");
  const screenEmail = document.getElementById("vapiScreenEmail");
  const cardsGrid = document.getElementById("vapiCardsGrid");
  const hintEl = document.getElementById("vapiHint");
  const confirmMultiBtn = document.getElementById("vapiConfirmMultiBtn");
  const questionTextEl = document.getElementById("vapiQuestionText");
  const textInput = document.getElementById("vapiTextInput");
  const submitTextBtn = document.getElementById("vapiSubmitTextBtn");
  const previewHtmlEl = document.getElementById("vapiPreviewHtml");
  const previewLinkEl = document.getElementById("vapiPreviewLink");
  const approveBtn = document.getElementById("vapiApproveBtn");
  const emailInput = document.getElementById("vapiEmailInput");
  const sendEmailBtn = document.getElementById("vapiSendEmailBtn");

  // Status indicator elements
  const statusIndicator = document.getElementById("vapiStatusIndicator");
  const statusText = document.getElementById("vapiStatusText");
  const statusIcon = document.getElementById("vapiStatusIcon");

  if (!pill || !icon || !overlay) return;

  // =========================
  // TOOL CALL TRACKING (NEW)
  // =========================
  let pendingToolCallId = null;
  let pendingToolName = null;

  // =========================
  // STATUS STATE MANAGEMENT
  // =========================
  const statusState = {
    current: 'idle',
    lastUserSpeechTime: 0,
    lastAiSpeechTime: 0,
    idleTimeoutId: null,
    idleReminderIndex: 0,
    isActive: false,
    inputAudioLevel: 0,
    isSpeechActive: false,
    speechStartTime: 0,
    speechCheckInterval: null,
  };

  function updateStatusIndicator(state, customMessage = null) {
    if (!statusIndicator || !statusState.isActive) return;
    
    if (state === 'listening' && statusState.current === 'aiSpeaking' && window.vapiIsSpeaking) {
      return;
    }
    
    statusState.current = state;
    
    statusIndicator.classList.remove(
      'state-connecting', 
      'state-listening', 
      'state-user-speaking', 
      'state-ai-speaking', 
      'state-idle'
    );
    
    const micIcon = statusIcon?.querySelector('.mic-icon');
    const speakerIcon = statusIcon?.querySelector('.speaker-icon');
    const waveIcon = statusIcon?.querySelector('.wave-icon');
    
    if (micIcon) micIcon.style.display = 'none';
    if (speakerIcon) speakerIcon.style.display = 'none';
    if (waveIcon) waveIcon.style.display = 'none';
    
    let message = customMessage;
    
    switch (state) {
      case 'connecting':
        statusIndicator.classList.add('state-connecting');
        if (micIcon) micIcon.style.display = 'block';
        message = message || STATUS_MESSAGES.connecting;
        break;
        
      case 'listening':
        statusIndicator.classList.add('state-listening');
        if (micIcon) micIcon.style.display = 'block';
        message = message || STATUS_MESSAGES.listening;
        resetIdleTimer();
        break;
        
      case 'userSpeaking':
        statusIndicator.classList.add('state-user-speaking');
        if (waveIcon) waveIcon.style.display = 'block';
        message = message || STATUS_MESSAGES.userSpeaking;
        clearIdleTimer();
        break;
        
      case 'aiSpeaking':
        statusIndicator.classList.add('state-ai-speaking');
        if (speakerIcon) speakerIcon.style.display = 'block';
        message = message || STATUS_MESSAGES.aiSpeaking;
        clearIdleTimer();
        break;
        
      case 'idle':
        statusIndicator.classList.add('state-idle');
        if (micIcon) micIcon.style.display = 'block';
        const idleMessages = STATUS_MESSAGES.idle;
        message = message || idleMessages[statusState.idleReminderIndex % idleMessages.length];
        statusState.idleReminderIndex++;
        scheduleIdleReminder();
        break;
        
      case 'processing':
        statusIndicator.classList.add('state-listening');
        if (micIcon) micIcon.style.display = 'block';
        message = message || STATUS_MESSAGES.processing;
        break;
    }
    
    if (statusText) statusText.textContent = message;
  }

  function resetIdleTimer() {
    clearIdleTimer();
    statusState.idleTimeoutId = setTimeout(() => {
      if (statusState.isActive && statusState.current === 'listening') {
        updateStatusIndicator('idle');
      }
    }, STATUS_CONFIG.IDLE_TIMEOUT_MS);
  }

  function clearIdleTimer() {
    if (statusState.idleTimeoutId) {
      clearTimeout(statusState.idleTimeoutId);
      statusState.idleTimeoutId = null;
    }
  }

  function scheduleIdleReminder() {
    clearIdleTimer();
    statusState.idleTimeoutId = setTimeout(() => {
      if (statusState.isActive && statusState.current === 'idle') {
        updateStatusIndicator('idle');
      }
    }, STATUS_CONFIG.IDLE_REMINDER_INTERVAL_MS);
  }

  function showStatusIndicator() {
    if (statusIndicator) {
      statusIndicator.style.display = 'flex';
      statusState.isActive = true;
      statusState.idleReminderIndex = 0;
      document.body.classList.add('vapi-call-active');
    }
  }

  function hideStatusIndicator() {
    if (statusIndicator) {
      statusIndicator.style.display = 'none';
      statusState.isActive = false;
      clearIdleTimer();
      stopVADCheck();
      document.body.classList.remove('vapi-call-active');
    }
  }

  // =========================
  // VOICE ACTIVITY DETECTION (VAD) FUNCTIONS
  // =========================
  function calculateRMS(pcmData) {
    let sumSquares = 0;
    for (let i = 0; i < pcmData.length; i++) {
      const normalized = pcmData[i] / 32768;
      sumSquares += normalized * normalized;
    }
    return Math.sqrt(sumSquares / pcmData.length);
  }

  function processAudioForVAD(audioBuffer) {
    // Skip VAD while AI is speaking
    if (window.vapiIsSpeaking) return;

    const pcmData = new Int16Array(audioBuffer);
    const rms = calculateRMS(pcmData);
    statusState.inputAudioLevel = rms;

    if (VAD_CONFIG.debug && rms > 0.005) {
      console.log(`[VAD] RMS: ${rms.toFixed(4)} | Threshold: ${VAD_CONFIG.speechThreshold} | Speaking: ${statusState.isSpeechActive}`);
    }

    const now = Date.now();

    if (rms > VAD_CONFIG.speechThreshold) {
      statusState.lastUserSpeechTime = now;
      
      if (!statusState.isSpeechActive) {
        statusState.speechStartTime = now;
        statusState.isSpeechActive = true;
        
        setTimeout(() => {
          if (statusState.isSpeechActive && 
              (Date.now() - statusState.speechStartTime) >= VAD_CONFIG.minSpeechDurationMs) {
            onUserSpeechDetected();
          }
        }, VAD_CONFIG.minSpeechDurationMs);
      }
    }
  }

  function startVADCheck() {
    stopVADCheck();
    
    statusState.speechCheckInterval = setInterval(() => {
      if (statusState.isSpeechActive) {
        const timeSinceLastSpeech = Date.now() - statusState.lastUserSpeechTime;
        
        if (timeSinceLastSpeech > STATUS_CONFIG.USER_SPEAKING_DECAY_MS) {
          statusState.isSpeechActive = false;
          onUserSpeechEnded();
        }
      }
    }, VAD_CONFIG.speechCheckIntervalMs);
  }

  function stopVADCheck() {
    if (statusState.speechCheckInterval) {
      clearInterval(statusState.speechCheckInterval);
      statusState.speechCheckInterval = null;
    }
    statusState.isSpeechActive = false;
    statusState.inputAudioLevel = 0;
  }

  function onUserSpeechDetected() {
    if (window.vapiIsSpeaking) return;
    
    if (statusState.current !== 'userSpeaking') {
      updateStatusIndicator('userSpeaking');
    }
  }

  function onUserSpeechEnded() {
    if (window.vapiIsSpeaking) return;
    
    if (statusState.current === 'userSpeaking') {
      updateStatusIndicator('listening');
    }
  }

  function onAiSpeechStarted() {
    statusState.lastAiSpeechTime = Date.now();
    updateStatusIndicator('aiSpeaking');
  }

  function onAiSpeechEnded() {
    setTimeout(() => {
      if (statusState.current === 'aiSpeaking' && !window.vapiIsSpeaking) {
        updateStatusIndicator('listening');
      }
    }, STATUS_CONFIG.AI_SPEAKING_DECAY_MS);
  }

  // =========================
  // BUTTON STATE
  // =========================
  const buttonConfig = {
    idle: {
      color: "rgb(37, 211, 102)",
      icon: "https://unpkg.com/lucide-static@0.321.0/icons/phone.svg",
    },
    loading: {
      color: "rgb(93, 124, 202)",
      icon: "https://unpkg.com/lucide-static@0.321.0/icons/loader-2.svg",
    },
    active: {
      color: "rgb(255, 0, 0)",
      icon: "https://unpkg.com/lucide-static@0.321.0/icons/phone-off.svg",
    },
  };

  function setState(state) {
    const s = buttonConfig[state];
    pill.style.background = s.color;
    icon.src = s.icon;
    if (state === "idle") {
      pill.style.animation = "vapi-pulse-ring 2s infinite";
      icon.style.animation = "none";
    } else if (state === "loading") {
      pill.style.animation = "none";
      icon.style.animation = "vapi-spin 1s linear infinite";
    } else {
      pill.style.animation = "none";
      icon.style.animation = "none";
    }
  }
  setState("idle");

  // =========================
  // UI STATE
  // =========================
  window.__vapiUi = window.__vapiUi || {
    flow: null,
    step: null,
    pendingField: null,
    mode: "single",
    max: 1,
    selected: new Set(),
    collected: {},
    lastCategory: null,
  };

  function setHeader(title, sub) {
    if (vapiTitle) vapiTitle.textContent = title || "";
    if (vapiSub) vapiSub.textContent = sub || "";
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
  const ok = window.confirm(
    "If you close now, you will lose the data and you must start from the beginning. Close anyway?"
  );
  if (!ok) return;

  // ✅ If call is active, end it too
  if (isActive) {
    stopCall(true);
    setState("idle");
  } else {
    hideOverlay();
  }
}

function showScreen(which) {
  showOverlay();
  setUiProcessing(false);
  
  // Re-enable inputs
  if (textInput) textInput.disabled = false;
  if (emailInput) emailInput.disabled = false;
  
  // ✅ Reset all card buttons
  if (cardsGrid) {
    [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach((b) => {
      b.disabled = false;
      b.style.opacity = '1';
    });
  }
  
  [screenCards, screenQuestion, screenPreview, screenEmail].forEach((s) => {
    if (s) {
      s.classList.remove("is-active");
      s.style.opacity = '1';
      s.style.pointerEvents = 'auto';
    }
  });
  which?.classList.add("is-active");
}

  overlay.addEventListener("click", (e) => {
  if (e.target === overlay) attemptCloseOverlay();
});
closeBtn?.addEventListener("click", attemptCloseOverlay);
  backBtn?.addEventListener("click", () => {
    sendToolResult({ action: "back", category: window.__vapiUi.lastCategory });
    hideOverlay();
  });

  async function uiEvent(type, payload = {}) {
    if (!UI_EVENT_ENDPOINT) return;
    try {
      await fetch(UI_EVENT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          payload,
          ui: {
            flow: window.__vapiUi.flow,
            step: window.__vapiUi.step,
            pendingField: window.__vapiUi.pendingField,
            collected: window.__vapiUi.collected,
          },
        }),
      });
    } catch {}
  }

  // =========================
  // TOOL RESULT - SEND TO VAPI (NEW)
  // =========================
  let socket = null;  // Declare socket globally for sendToolResult access

 // =========================
// TOOL RESULT - SEND TO VAPI (FIXED)
// =========================
function sendToolResult(result) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.log("[ToolResult] Socket not open");
    return;
  }

  // Store ID before clearing
  const toolCallId = pendingToolCallId;
  
  if (!toolCallId) {
    console.log("[ToolResult] No pending tool call ID - sending as user message instead");
    sendAsUserMessage(typeof result === 'string' ? result : result.value || result.userInput || JSON.stringify(result));
    return;
  }

  const resultString = typeof result === 'string' ? result : JSON.stringify(result);
  
  // Method 1: Vapi tool-calls-result format
  const payload1 = {
    type: "tool-calls-result",
    toolCallResult: {
      toolCallId: toolCallId,
      result: resultString
    }
  };

  console.log("[ToolResult] Sending tool-calls-result:", payload1);
  socket.send(JSON.stringify(payload1));

  // Method 2: Also try add-message with tool role (some Vapi versions need this)
  const payload2 = {
    type: "add-message",
    message: {
      role: "tool",
      tool_call_id: toolCallId,
      content: resultString
    }
  };
  
  console.log("[ToolResult] Also sending add-message:", payload2);
  socket.send(JSON.stringify(payload2));
  
  // Clear pending AFTER sending
  pendingToolCallId = null;
  pendingToolName = null;
}

// Alternative: Send as user message with context
function sendAsUserMessage(text) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.log("[UserMessage] Socket not open");
    return;
  }

  const payload = {
    type: "add-message",
    message: {
      role: "user",
      content: text
    }
  };

  console.log("[UserMessage] Sending:", payload);
  socket.send(JSON.stringify(payload));
}

  // =========================
  // UTIL
  // =========================
  const norm = (s) => String(s || "").toLowerCase().trim().replace(/\s+/g, " ");
  const hasVal = (v) => !(v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0));
  
  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setCollected(field, value) {
    if (!field) return;
    window.__vapiUi.collected[field] = value;
  }

  // =========================
  // CATEGORY MAP (UI CARDS)
  // =========================
  const CATEGORY_CARDS = {
    main_menu: {
      title: "Main Menu",
      sub: "Please choose one.",
      flow: "main",
      step: "MAIN_MENU",
      field: "service",
      mode: "single",
      options: ["Website Development", "ERP Implementation", "Digital Marketing", "Consulting"],
      hint: "🗣️ say: Website, ERP, Marketing, or Consulting",
    },
    website_mode: {
      title: "Website Development",
      sub: "Do you want a ready template or a custom website?",
      flow: "website",
      step: "WEBSITE_MODE",
      field: "website_mode",
      mode: "single",
      options: ["Template", "Custom"],
      hint: "🗣️ Say the type (or tap).'",
    },
    website_platform: {
      title: "Platform",
      sub: "Which platform do you prefer?",
      flow: "website",
      step: "WEBSITE_PLATFORM",
      field: "website_platform",
      mode: "single",
      options: ["Webflow", "WordPress", "Other"],
      hint: " 🗣️ say the platform name",
    },
    website_industry: {
      title: "Industry",
      sub: "Which industry is this for?",
      flow: "website",
      step: "WEBSITE_INDUSTRY",
      field: "website_industry",
      mode: "single",
      options: ["Real Estate", "Healthcare", "Restaurant", "Construction", "Logistics", "Education", "Retail", "Services", "Other"],
      hint: "🗣️ say your industry",
    },
    website_site_type: {
      title: "Website Type",
      sub: "Do you need a landing page, a company profile, or a portal?",
      flow: "website",
      step: "WEBSITE_TYPE",
      field: "website_site_type",
      mode: "single",
      options: ["Landing Page", "Company Profile", "Portal"],
      hint: "🗣️ say the type",
    },
    erp_vendor: {
      title: "ERP Vendor",
      sub: "Which ERP are you considering?",
      flow: "erp",
      step: "ERP_VENDOR",
      field: "erp_vendor",
      mode: "single",
      options: ["Odoo", "SAP", "Oracle", "Dynamics 365", "Not sure (recommend)"],
      hint: " 🗣️ say the ERP name",
    },
    erp_industry: {
      title: "ERP Industry",
      sub: "Choose your industry.",
      flow: "erp",
      step: "ERP_INDUSTRY",
      field: "erp_industry",
      mode: "single",
      options: ["Manufacturing", "Trading", "Services", "Construction"],
      hint: "🗣️ say your industry",
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
      hint: " 🗣️ say them (e.g., 'Sales, Purchase, Inventory')",
    },
    erp_integrations: {
      title: "Integrations",
      sub: "Do you need integrations?",
      flow: "erp",
      step: "ERP_INTEGRATIONS",
      field: "erp_integrations",
      mode: "single",
      options: ["POS", "eCommerce", "WMS", "Bank", "None"],
      hint: "say what you need",
    },
    marketing_channel: {
      title: "Digital Marketing",
      sub: "Which area do you want help with?",
      flow: "marketing",
      step: "MKT_CHANNEL",
      field: "marketing_channel",
      mode: "single",
      options: ["SEO", "Google Ads", "Meta Ads", "Social Media Management", "Branding/Content"],
      hint: "say the service (e.g., 'SEO' or 'Google Ads')",
    },
    consulting_topic: {
      title: "Consulting",
      sub: "What kind of consulting do you need?",
      flow: "consulting",
      step: "CONSULT_TOPIC",
      field: "consulting_topic",
      mode: "single",
      options: ["Strategy", "AI / Automation", "ERP / Operations", "Website / Product", "Other"],
      hint: "🗣️ say the topic",
    },
  };

  // =========================
  // QUESTIONS
  // =========================
  const QUESTIONS = {
    website_goal: {
      flow: "website",
      field: "website_goal",
      title: "Website Goal",
      question: "What is the main goal? Leads, bookings, sales, or info?",
      placeholder: "Leads / bookings / sales / info",
      inputType: "text",
    },
    website_features: {
      flow: "website",
      field: "website_features",
      title: "Must-have features",
      question: "List up to 3 must-have features (e.g., WhatsApp, booking, login, payment, multilingual).",
      placeholder: "Feature 1, Feature 2, Feature 3",
      inputType: "text",
    },
    website_sections: {
      flow: "website",
      field: "website_sections",
      title: "Sections / Features",
      question: "For a custom website: what key sections/features do you need (max 5)?",
      placeholder: "Home, About, Services, Contact, ...",
      inputType: "text",
    },
    website_reference_sites: {
      flow: "website",
      field: "website_reference_sites",
      title: "Reference",
      question: "Any reference websites you like? (optional)",
      placeholder: "Paste URLs (optional)",
      inputType: "url",
    },
    website_content_ready: {
      flow: "website",
      field: "website_content_ready",
      title: "Content readiness",
      question: "Do you have logo, text, and images ready?",
      placeholder: "Yes / No / Partially",
      inputType: "text",
    },
    website_timeline: {
      flow: "website",
      field: "website_timeline",
      title: "Timeline",
      question: "When do you want to go live?",
      placeholder: "e.g., 2 weeks / 1 month",
      inputType: "text",
    },
    erp_users_count: {
      flow: "erp",
      field: "erp_users_count",
      title: "Users",
      question: "How many users will use the ERP?",
      placeholder: "e.g., 10",
      inputType: "number",
    },
    erp_data_readiness: {
      flow: "erp",
      field: "erp_data_readiness",
      title: "Data readiness",
      question: "Do you have masters in Excel (products/customers/vendors)?",
      placeholder: "Yes / No / Partially",
      inputType: "text",
    },
    erp_timeline: {
      flow: "erp",
      field: "erp_timeline",
      title: "Go-live",
      question: "What is your go-live target?",
      placeholder: "e.g., March 2026",
      inputType: "text",
    },
    marketing_goal: {
      flow: "marketing",
      field: "marketing_goal",
      title: "Marketing Goal",
      question: "What is your goal? Leads, sales, traffic, or brand?",
      placeholder: "Leads / sales / traffic / brand",
      inputType: "text",
    },
    marketing_location_targeting: {
      flow: "marketing",
      field: "marketing_location_targeting",
      title: "Targeting",
      question: "Which locations do you want to target?",
      placeholder: "e.g., Dubai, UAE",
      inputType: "text",
    },
    marketing_current_assets: {
      flow: "marketing",
      field: "marketing_current_assets",
      title: "Current assets",
      question: "Do you already have a website/landing page/social pages?",
      placeholder: "Website / landing / socials",
      inputType: "text",
    },
    marketing_timeline: {
      flow: "marketing",
      field: "marketing_timeline",
      title: "Timeline",
      question: "When do you want to start?",
      placeholder: "e.g., ASAP / next week",
      inputType: "text",
    },
    consulting_current_situation: {
      flow: "consulting",
      field: "consulting_current_situation",
      title: "Current situation",
      question: "What's the current situation?",
      placeholder: "Brief context",
      inputType: "text",
    },
    consulting_desired_outcome: {
      flow: "consulting",
      field: "consulting_desired_outcome",
      title: "Desired outcome",
      question: "What outcome do you want?",
      placeholder: "Desired result",
      inputType: "text",
    },
    consulting_urgency: {
      flow: "consulting",
      field: "consulting_urgency",
      title: "Urgency",
      question: "How urgent is this?",
      placeholder: "Today / this week / this month",
      inputType: "text",
    },
    collect_email: {
      flow: "all",
      field: "email",
      title: "Your Email",
      question: "Where should we send your requirements?",
      placeholder: "name@email.com",
      inputType: "email",
    },
  };

  // =========================
  // RENDER HELPERS
  // =========================
  function renderCardsFromConfig(cfg) {
    window.__vapiUi.flow = cfg.flow || window.__vapiUi.flow;
    window.__vapiUi.step = cfg.step || window.__vapiUi.step;
    window.__vapiUi.pendingField = cfg.field || window.__vapiUi.pendingField;
    window.__vapiUi.mode = cfg.mode || "single";
    window.__vapiUi.max = Math.max(1, Number(cfg.max || 1));
    window.__vapiUi.selected.clear();

   setHeader(cfg.title || "Say your choice", cfg.sub || "Say one of the options (or tap).");
if (hintEl) hintEl.textContent = cfg.hint || "🗣️ Just say it (you can also tap a card).";
    if (confirmMultiBtn) {
      confirmMultiBtn.style.display = (cfg.mode === "multi") ? "inline-flex" : "none";
      confirmMultiBtn.disabled = true;
    }

    if (!cardsGrid) return;
    cardsGrid.innerHTML = "";
    const options = Array.isArray(cfg.options) ? cfg.options : [];

    options.forEach((label) => {
      const value = label;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vapi-cardbtn";
      btn.textContent = label;

     btn.addEventListener("click", async () => {
  if (window.__vapiUi.mode === "multi") {
    // Multi-select: toggle selection
    if (window.__vapiUi.selected.has(value)) window.__vapiUi.selected.delete(value);
    else {
      if (window.__vapiUi.selected.size >= window.__vapiUi.max) return;
      window.__vapiUi.selected.add(value);
    }
    btn.classList.toggle("is-selected", window.__vapiUi.selected.has(value));
    if (confirmMultiBtn) confirmMultiBtn.disabled = window.__vapiUi.selected.size === 0;
    setCollected(window.__vapiUi.pendingField, Array.from(window.__vapiUi.selected));
    return;
  }

  // Single select: select and send to Vapi
  [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach((b) => b.classList.remove("is-selected"));
  btn.classList.add("is-selected");
  setCollected(window.__vapiUi.pendingField, value);
  
  console.log("[Click] Sending selection:", value);
  
  // ✅ Show processing state - disable all cards
  setUiProcessing(true);
  [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach((b) => {
    b.disabled = true;
    b.style.opacity = '0.6';
  });
  
  sendToolResult({ 
    field: window.__vapiUi.pendingField, 
    value: value,
    userSelected: value 
  });
  
  sendAsUserMessage(value);
  
 
});

      cardsGrid.appendChild(btn);
    });

    showScreen(screenCards);
  }

  // Multi-select confirm button (UPDATED)
// Multi-select confirm (FIXED)
confirmMultiBtn?.addEventListener("click", async () => {
  const vals = Array.from(window.__vapiUi.selected);
  if (!vals.length) return;
  
  const field = window.__vapiUi.pendingField;
  setCollected(field, vals);
  
  const valuesString = vals.join(", ");
  console.log("[Click] Submitting multi-selection for field:", field, "values:", valuesString);
  
  // Show processing state
  setUiProcessing(true);
  
  sendToolResult({ 
    field: field, 
    values: vals,
    userSelected: valuesString 
  });
  
  setTimeout(() => {
    if (!pendingToolCallId) {
      sendAsUserMessage(`I selected: ${valuesString}`);
    }
  }, 300);
  

});

// Email submit (FIXED)
sendEmailBtn?.addEventListener("click", async () => {
  const email = String(emailInput?.value || "").trim();
  if (!email) return;
  
  setCollected("email", email);
  
  console.log("[Click] Submitting email:", email);
  
  // Show processing state
  setUiProcessing(true);
  if (emailInput) emailInput.disabled = true;
  
  sendToolResult({ 
    field: "email", 
    value: email,
    email: email,
    collected: window.__vapiUi.collected 
  });
  
  setTimeout(() => {
    if (!pendingToolCallId) {
      sendAsUserMessage(`My email is ${email}`);
    }
  }, 300);
  

});

  function renderQuestionByKey(key) {
    const q = QUESTIONS[key];
    if (!q) return;

    window.__vapiUi.flow = q.flow || window.__vapiUi.flow;
    window.__vapiUi.pendingField = q.field || window.__vapiUi.pendingField;
    window.__vapiUi.lastCategory = key;

    setHeader(q.title || "Quick question", "🗣️ Speak your answer OR ⌨️ type below");

    if (questionTextEl) questionTextEl.textContent = q.question || "";
    if (textInput) {
      textInput.value = "";
      textInput.placeholder = q.placeholder || "Type here...";
      textInput.type = q.inputType || "text";
    }

    showScreen(screenQuestion);
  }

// Text input submit (FIXED)

submitTextBtn?.addEventListener("click", async () => {
  const val = String(textInput?.value || "").trim();
  if (!val) return;
  
  const field = window.__vapiUi.pendingField;
  setCollected(field, val);
  
  console.log("[Click] Submitting text for field:", field, "value:", val);
  
  // Show processing state instead of hiding
  setUiProcessing(true);
  if (textInput) textInput.disabled = true;
  
  // Send tool result first
  sendToolResult({ 
    field: field, 
    value: val,
    userInput: val 
  });
  
  // Small delay then send user message as backup trigger
  setTimeout(() => {
    if (!pendingToolCallId) {
      sendAsUserMessage(`My answer for ${field} is: ${val}`);
    }
  }, 300);
  
  // DON'T hide overlay - let the next tool call handle the transition
  
});

function generatePreviewHtml(kind) {
    const d = window.__vapiUi.collected || {};
    const rows = [];
    const add = (k, label) => {
      const v = d[k];
      if (!hasVal(v)) return;
      const val = Array.isArray(v) ? v.join(", ") : String(v);
      rows.push(
        `<div style="padding:10px 0;border-bottom:1px solid #eee;">
          <div style="font-weight:900">${escapeHtml(label)}</div>
          <div style="opacity:.85">${escapeHtml(val)}</div>
        </div>`
      );
    };

     

    if (kind === "preview_website") {
     add("service", "Service Selected");
      add("website_mode", "Mode");
      add("website_platform", "Platform");
      add("website_industry", "Industry");
      add("website_site_type", "Type");
      add("website_goal", "Goal");
      add("website_features", "Must-have features");
      add("website_sections", "Sections / Features");
      add("website_content_ready", "Content ready");
      add("website_reference_sites", "Reference sites");
      add("website_timeline", "Timeline");
    } else if (kind === "preview_erp") {
     add("service", "Service Selected");
      add("erp_vendor", "ERP Vendor");
      add("erp_industry", "Industry");
      add("erp_users_count", "Users");
      add("erp_modules", "Modules");
      add("erp_data_readiness", "Excel masters ready");
      add("erp_integrations", "Integrations");
      add("erp_timeline", "Go-live target");
    } else if (kind === "preview_marketing") {
     add("service", "Service Selected");
      add("marketing_channel", "Channel");
      add("marketing_goal", "Goal");
      add("marketing_location_targeting", "Target locations");
      add("marketing_current_assets", "Current assets");
      add("marketing_timeline", "Timeline");
    } else if (kind === "preview_consulting") {
     add("service", "Service Selected");
      add("consulting_topic", "Topic");
      add("consulting_current_situation", "Current situation");
      add("consulting_desired_outcome", "Desired outcome");
      add("consulting_urgency", "Urgency");
    }

    if (!rows.length) return `<div style="font-weight:800;opacity:.75">No data captured yet.</div>`;
    return `<div>${rows.join("")}</div>`;
  }

  function renderPreview(kind) {
    setHeader("Requirement Preview", "Approve or go back to edit.");
    if (previewHtmlEl) previewHtmlEl.innerHTML = generatePreviewHtml(kind);
    if (previewLinkEl) previewLinkEl.style.display = "none";
    showScreen(screenPreview);
  }

  // Approve button (UPDATED)
approveBtn?.addEventListener("click", async () => {
  console.log("[Click] Approving preview");
  
  setUiProcessing(true);
  
  sendToolResult({ 
    action: "approved", 
    collected: window.__vapiUi.collected 
  });
  sendAsUserMessage("I approve this");
  

});

  function renderEmailScreen() {
    setHeader("Submit", "Where should we send this?");
    if (emailInput) emailInput.value = "";
    window.__vapiUi.pendingField = "email";
    showScreen(screenEmail);
  }

  // Email submit (UPDATED)
  sendEmailBtn?.addEventListener("click", async () => {
    const email = String(emailInput?.value || "").trim();
    if (!email) return;
    setCollected("email", email);
    
    console.log("[Click] Sending email:", email);
    sendToolResult({ 
      field: "email", 
      value: email,
      email: email,
      collected: window.__vapiUi.collected 
    });
    sendAsUserMessage(email);
    hideOverlay();
  });


// ═══════════════════════════════════════════════════════
// AUTO-FILL PARENT FIELDS BASED ON CATEGORY
// ═══════════════════════════════════════════════════════
function autoFillParentFields(category) {
  const d = window.__vapiUi.collected;
  
  // Website flow - auto-set service
  if (category.startsWith("website_") && !d.service) {
    console.log("[AutoFill] Setting service = Website Development");
    d.service = "Website Development";
  }
  
  // ERP flow - auto-set service
  if (category.startsWith("erp_") && !d.service) {
    console.log("[AutoFill] Setting service = ERP Implementation");
    d.service = "ERP Implementation";
  }
  
  // Marketing flow - auto-set service
  if (category.startsWith("marketing_") && !d.service) {
    console.log("[AutoFill] Setting service = Digital Marketing");
    d.service = "Digital Marketing";
  }
  
  // Consulting flow - auto-set service
  if (category.startsWith("consulting_") && !d.service) {
    console.log("[AutoFill] Setting service = Consulting");
    d.service = "Consulting";
  }
}

  // =========================
  // TOOL CALL HANDLER (UPDATED)
  // =========================
  function handleToolCalls(raw) {
    const m = raw?.message ?? raw;
    const list = m?.toolCallList ?? m?.toolCalls ?? [];

    list.forEach((tc) => {
      // STORE TOOL CALL ID (NEW)
      const toolCallId = tc?.id || tc?.toolCallId || tc?.tool_call_id;
      const toolName = tc?.function?.name || tc?.name;
      
      console.log("[ToolCall] Received:", toolName, "ID:", toolCallId);
      
      let args = tc?.function?.arguments ?? tc?.arguments ?? {};
      if (typeof args === "string") { 
        try { args = JSON.parse(args || "{}"); } 
        catch { args = {}; } 
      }

     if (toolName === "ui_show_cards" && args.category) {
  pendingToolCallId = toolCallId;
  pendingToolName = toolName;
  
  window.__vapiUi.lastCategory = args.category;
  console.log("[ToolCall] Set lastCategory to:", args.category);
  
  // ✅ Auto-fill parent fields before rendering
  autoFillParentFields(args.category);
  
  const cfg = CATEGORY_CARDS[args.category] || CATEGORY_CARDS.main_menu;
  window.__vapiUi.pendingField = cfg.field;
  
  renderCardsFromConfig(cfg);
  return;
}

    if (toolName === "ui_ask_question") {
  pendingToolCallId = toolCallId;
  pendingToolName = toolName;
  const questionKey = args.question_key;
  if (!questionKey || !QUESTIONS[questionKey]) return;
  
  // ✅ Auto-fill based on question prefix
  function autoFillFromQuestionKey(questionKey) {
  const d = window.__vapiUi.collected;
  
  if (questionKey.startsWith("website_") && !d.service) {
    d.service = "Website Development";
  }
  if (questionKey.startsWith("erp_") && !d.service) {
    d.service = "ERP Implementation";
  }
  if (questionKey.startsWith("marketing_") && !d.service) {
    d.service = "Digital Marketing";
  }
  if (questionKey.startsWith("consulting_") && !d.service) {
    d.service = "Consulting";
  }
}
  
  renderQuestionByKey(questionKey);
  return;
}

      if (toolName === "ui_show_preview" && (args.preview_type || args.category)) {
        pendingToolCallId = toolCallId;
        pendingToolName = toolName;
        const kind = args.preview_type || args.category;
        renderPreview(kind);
        return;
      }

      if (toolName === "ui_show_email") {
        pendingToolCallId = toolCallId;
        pendingToolName = toolName;
        renderEmailScreen();
        return;
      }

      if (toolName === "ui_close") {
        hideOverlay();
        return;
      }
    });
  }

  // =========================
  // VOICE CAPTURE (apply to UI)
  // =========================
  function tryMatchOptionFromCards(text) {
    const cfg = CATEGORY_CARDS[window.__vapiUi.lastCategory];
    if (!cfg) return null;
    const t = norm(text);
    if (!t) return null;

    const opts = cfg.options || [];
    for (const o of opts) {
      const on = norm(o);
      if (t === on) return o;
      if (t.includes(on)) return o;
    }

    if (window.__vapiUi.lastCategory === "main_menu") {
      if (t.includes("website") || t.includes("web")) return "Website Development";
      if (t.includes("erp") || t.includes("odoo") || t.includes("sap") || t.includes("oracle") || t.includes("dynamics")) return "ERP Implementation";
      if (t.includes("marketing") || t.includes("seo") || t.includes("ads")) return "Digital Marketing";
      if (t.includes("consult") || t.includes("strategy") || t.includes("advice") || t.includes("meeting")) return "Consulting";
    }

    return null;
  }

  function applyVoiceToUI(text) {
    const t = String(text || "").trim();
    if (!t) return;

    if (screenCards?.classList.contains("is-active")) {
      const cfg = CATEGORY_CARDS[window.__vapiUi.lastCategory];
      if (!cfg) return;

      if (cfg.mode === "multi") {
        const parts = norm(t).split(/[,\s]+/).filter(Boolean);
        const matched = [];
        for (const part of parts) {
          const m = cfg.options.find(o => norm(o) === part || norm(o).includes(part) || part.includes(norm(o)));
          if (m) matched.push(m);
        }
        if (matched.length) {
          matched.slice(0, cfg.max || 5).forEach(v => window.__vapiUi.selected.add(v));
          setCollected(cfg.field, Array.from(window.__vapiUi.selected));
          [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach((b) => {
            b.classList.toggle("is-selected", window.__vapiUi.selected.has(b.textContent));
          });
          if (confirmMultiBtn) confirmMultiBtn.disabled = window.__vapiUi.selected.size === 0;
        }
        return;
      }

      const picked = tryMatchOptionFromCards(t);
      if (!picked) return;
      setCollected(cfg.field, picked);
      [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach((b) => {
        b.classList.toggle("is-selected", norm(b.textContent) === norm(picked));
      });
      return;
    }

    if (screenQuestion?.classList.contains("is-active")) {
      if (window.__vapiUi.pendingField) {
        setCollected(window.__vapiUi.pendingField, t);
        if (textInput) textInput.value = t;
      }
      return;
    }

    if (screenEmail?.classList.contains("is-active")) {
      if (t.includes("@")) {
        setCollected("email", t);
        if (emailInput) emailInput.value = t;
      }
      return;
    }
  }

  // =========================
  // AUDIO + LIP SYNC
  // =========================
  let playCtx, nextPlayTime = 0;
  let analyser, analyserData;
  let isActive = false;
  window.vapiAudioLevel = window.vapiAudioLevel || 0;
  window.vapiIsSpeaking = window.vapiIsSpeaking || false;
const AI_LEVEL_START = 0.055;   // start speaking if above this
const AI_LEVEL_END   = 0.030;   // stop speaking if below this
const AI_END_HOLD_MS = 450;     // must be quiet this long to stop
let aiLastLoudAt = 0;

  function playPcm16(int16Array, sampleRate = 16000) {
    if (!playCtx) {
      playCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive", sampleRate });
    }
    if (!analyser) {
      analyser = playCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      analyserData = new Uint8Array(analyser.frequencyBinCount);
      analyser.connect(playCtx.destination);
    }

    // CHECK IF AI AUDIO HAS ACTUAL SOUND (FIXED)
    let sum = 0;
for (let i = 0; i < int16Array.length; i++) sum += Math.abs(int16Array[i]);
const avgLevel = sum / int16Array.length / 32768;
const hasSound = avgLevel > 0.01;

if (hasSound) {
  window.vapiIsSpeaking = true;
  onAiSpeechStarted();
}
    
    const floatData = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) floatData[i] = int16Array[i] / 32768;

    const buffer = playCtx.createBuffer(1, floatData.length, sampleRate);
    buffer.copyToChannel(floatData, 0);
    const src = playCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(analyser);
    src.onended = () => {
      if (playCtx && playCtx.currentTime >= nextPlayTime - 0.05) {
        window.vapiIsSpeaking = false;
        onAiSpeechEnded();
      }
    };

    const now = playCtx.currentTime;
    const queueAhead = nextPlayTime - now;
    if (nextPlayTime <= now) nextPlayTime = now + AUDIO_CONFIG.minQueueAheadSec;
    else if (queueAhead > AUDIO_CONFIG.maxQueueAheadSec) {
      // keep as-is
    }

    src.start(nextPlayTime);
    nextPlayTime += buffer.duration;
  }

 function updateAudioLevel() {
  // Always compute output level (don’t gate on vapiIsSpeaking)
  if (analyser) {
    analyser.getByteFrequencyData(analyserData);
    let sum = 0;
    for (let i = 0; i < analyserData.length; i++) sum += analyserData[i];
    window.vapiAudioLevel = (sum / analyserData.length) / 255;
  } else {
    window.vapiAudioLevel *= 0.85;
  }

  const level = Math.max(0, Math.min(1, window.vapiAudioLevel || 0));

  // ✅ Speaking state driven by REAL output loudness
  const now = performance.now();

  if (level > AI_LEVEL_START) {
    aiLastLoudAt = now;
    if (!window.vapiIsSpeaking) {
      window.vapiIsSpeaking = true;
      onAiSpeechStarted();
    }
  } else if (window.vapiIsSpeaking && level < AI_LEVEL_END) {
    if (now - aiLastLoudAt > AI_END_HOLD_MS) {
      window.vapiIsSpeaking = false;
      onAiSpeechEnded();
    }
  }

  // Keep your pill animation as-is
  const scale = 1 + level * 0.08;
  if (pillWrap) pillWrap.style.transform = `translateX(-50%) scale(${scale})`;
  else pill.style.transform = `scale(${scale})`;

  if (isActive) requestAnimationFrame(updateAudioLevel);
}

  // =========================
  // CREATE WS URL
  // =========================
  async function createWebsocketCallUrl() {
    const headers = { "content-type": "application/json" };
    if (BRIDGE_SECRET) headers["x-bridge-secret"] = BRIDGE_SECRET;

    const r = await fetch(CREATE_CALL_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ assistantId: ASSISTANT_ID }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.vapiError?.message || "Worker/Vapi error");
    if (!data.websocketCallUrl) throw new Error("No websocketCallUrl returned");
    return data.websocketCallUrl;
  }

  // =========================
  // MIC -> WORKLET -> WS
  // =========================
  function createWorkletProcessorBlob() {
    const code = `
class VapiAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = ${AUDIO_CONFIG.workletBufferSize};
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.inputSampleRate = sampleRate;
    this.outputSampleRate = 16000;
    this.needsResampling = Math.abs(this.inputSampleRate - this.outputSampleRate) > 100;
  }
  resample(input) {
    if (!this.needsResampling) return input;
    const ratio = this.inputSampleRate / this.outputSampleRate;
    const len = Math.floor(input.length / ratio);
    const out = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const idx = i * ratio;
      const f = Math.floor(idx);
      const c = Math.min(f + 1, input.length - 1);
      out[i] = input[f] * (1 - (idx - f)) + input[c] * (idx - f);
    }
    return out;
  }
  floatTo16BitPCM(arr) {
    const out = new Int16Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      const s = Math.max(-1, Math.min(1, arr[i]));
      out[i] = s < 0 ? s * 32768 : s * 32767;
    }
    return out;
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    for (let i = 0; i < input[0].length; i++) {
      this.buffer[this.bufferIndex++] = input[0][i];
      if (this.bufferIndex >= this.bufferSize) {
        const resampled = this.resample(this.buffer);
        const pcm = this.floatTo16BitPCM(resampled);
        this.port.postMessage(pcm.buffer, [pcm.buffer]);
        this.bufferIndex = 0;
        this.buffer = new Float32Array(this.bufferSize);
      }
    }
    return true;
  }
}
registerProcessor('vapi-audio-processor', VapiAudioProcessor);
`;
    return URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
  }

  // =========================
  // CALL MANAGEMENT
  // =========================
  let stream, audioContext, workletNode, source;

function extractTranscriptMessage(msg) {
  const text =
    msg?.transcript ||
    msg?.text ||
    msg?.content ||
    msg?.message?.content ||
    msg?.message?.text;

  if (!text) return null;

  const role = msg?.role || msg?.speaker || msg?.from;
  const isUser =
    role === "user" ||
    role === "human" ||
    role === "client" ||
    msg?.speaker === "user" ||
    msg?.from === "user";

  // ✅ FINAL only (remove `|| msg?.type === "transcript"`)
  const isFinal =
    msg?.isFinal === true ||
    msg?.final === true ||
    msg?.transcriptType === "final";

  // Most Vapi STT events come as type: "transcript"
  const isTranscript = msg?.type === "transcript";

  // Only use FINAL USER transcripts to fill UI
  if (isTranscript && isUser && isFinal) return String(text);

  return null;
}


  async function startCall() {
    setState("loading");
    showStatusIndicator();
    updateStatusIndicator('connecting');
    
    nextPlayTime = 0;
    window.vapiAudioLevel = 0;
    window.vapiIsSpeaking = false;
    playCtx = playCtx || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });

    try { await playCtx.resume(); } catch {}

    const websocketCallUrl = await createWebsocketCallUrl();
    socket = new WebSocket(websocketCallUrl);
    socket.binaryType = "arraybuffer";

    const openTimeout = setTimeout(() => {
      if (socket?.readyState !== WebSocket.OPEN) {
        stopCall(false);
        setState("idle");
        hideStatusIndicator();
        alert("Connection timeout. Check your network/worker.");
      }
    }, AUDIO_CONFIG.connectionTimeoutMs);

    socket.onopen = async () => {
      clearTimeout(openTimeout);

      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });

      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume();

      const workletUrl = createWorkletProcessorBlob();
      await audioContext.audioWorklet.addModule(workletUrl);
      URL.revokeObjectURL(workletUrl);

      source = audioContext.createMediaStreamSource(stream);
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 2.5;
      workletNode = new AudioWorkletNode(audioContext, "vapi-audio-processor");

      workletNode.port.onmessage = (e) => {
        if (socket?.readyState === WebSocket.OPEN) socket.send(e.data);
        processAudioForVAD(e.data);
      };

      source.connect(gainNode);
      gainNode.connect(workletNode);

      startVADCheck();

      isActive = true;
      setState("active");
      updateStatusIndicator('listening');
      updateAudioLevel();
    };

    socket.onmessage = async (event) => {
      if (event.data instanceof ArrayBuffer) {
        const audioData = new Int16Array(event.data);
        if (audioData.length > 0) playPcm16(audioData, AUDIO_CONFIG.outputSampleRate);
        return;
      }

      const handleText = (text) => {
        let raw;
        try { raw = JSON.parse(text); } catch { return; }
        const msg = raw?.message ?? raw;

        // Debug: Log all messages
        console.log("[WS Message]", msg?.type, msg);

        if (msg?.type === "tool-calls") {
          handleToolCalls(raw);
          return;
        }

        const userText = extractTranscriptMessage(msg);
        if (userText) {
          applyVoiceToUI(userText);
        }
      };

      if (typeof event.data === "string") return handleText(event.data);
      if (event.data instanceof Blob) {
        try { handleText(await event.data.text()); } catch {}
      }
    };

    socket.onerror = () => { stopCall(false); setState("idle"); };
    socket.onclose = () => { stopCall(false); setState("idle"); };
  }

  function stopCall(sendEnd = true) {
  window.vapiAudioLevel = 0;
  window.vapiIsSpeaking = false;
  isActive = false;

  stopVADCheck();

  try { if (sendEnd && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "end-call" })); } catch {}
  try { workletNode?.disconnect(); } catch {}
  try { source?.disconnect(); } catch {}
  try { audioContext?.close(); } catch {}
  try { stream?.getTracks().forEach((t) => t.stop()); } catch {}
  try { socket?.close(); } catch {}

  socket = stream = audioContext = workletNode = source = null;
  nextPlayTime = 0;
  pendingToolCallId = null;
  pendingToolName = null;

  if (pillWrap) pillWrap.style.transform = "translateX(-50%) scale(1)";
  else pill.style.transform = "scale(1)";

  // ✅ NEW: always close overlay when call ends (no confirm)
  hideOverlay();

  hideStatusIndicator();
}

function setUiProcessing(isProcessing) {
  if (submitTextBtn) submitTextBtn.disabled = isProcessing;
  if (confirmMultiBtn) confirmMultiBtn.disabled = isProcessing || window.__vapiUi.selected.size === 0;
  if (sendEmailBtn) sendEmailBtn.disabled = isProcessing;
  if (approveBtn) approveBtn.disabled = isProcessing;
  if (textInput) textInput.disabled = isProcessing;
  if (emailInput) emailInput.disabled = isProcessing;
  
  // Add visual feedback
  const activeScreen = document.querySelector('.vapi-screen.is-active');
  if (activeScreen) {
    activeScreen.style.opacity = isProcessing ? '0.7' : '1';
    activeScreen.style.pointerEvents = isProcessing ? 'none' : 'auto';
  }
  
  updateStatusIndicator(isProcessing ? "processing" : "listening");
}

  // =========================
  // BUTTON CLICK
  // =========================
  pill.addEventListener("click", async () => {
    try {
      if (!isActive) await startCall();
      else { stopCall(true); setState("idle"); }
    } catch (err) {
      stopCall(false);
      setState("idle");
      alert(err?.message || "Failed to start call");
    }
  });

  window.addEventListener("beforeunload", () => {
    if (isActive) stopCall(false);
  });

  // =========================
  // DEBUG: Expose for console testing
  // =========================
  window.__vapiDebug = {
    getAudioLevel: () => statusState.inputAudioLevel,
    isSpeaking: () => statusState.isSpeechActive,
    isAiSpeaking: () => window.vapiIsSpeaking,
    setThreshold: (val) => { VAD_CONFIG.speechThreshold = val; console.log(`Threshold set to ${val}`); },
    enableDebug: () => { VAD_CONFIG.debug = true; console.log("VAD debug enabled"); },
    disableDebug: () => { VAD_CONFIG.debug = false; console.log("VAD debug disabled"); },
    getStatus: () => statusState.current,
    getPendingToolCall: () => ({ id: pendingToolCallId, name: pendingToolName }),
    testToolResult: (msg) => sendToolResult(msg),
    testUserMessage: (msg) => sendAsUserMessage(msg),
  };
})();
</script>