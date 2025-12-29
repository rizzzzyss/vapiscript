(function() {
  'use strict';
  
  // ============================================
  // ERROR NOTIFICATION SYSTEM (Glassy UI)
  // ============================================
  
  let notificationContainer = null;
  const activeNotifications = new Map();

  function initNotificationContainer() {
    if (notificationContainer) return;
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'vapi-error-notifications';
    notificationContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999999;
      max-width: 400px;
      pointer-events: none;
    `;
    
    if (!document.getElementById('vapi-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'vapi-notification-styles';
      style.textContent = `
        @keyframes vapi-slide-in {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes vapi-slide-out {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(120%); opacity: 0; }
        }
        @keyframes vapi-progress {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `;
      document.head.appendChild(style);
    }
    
    document.body.appendChild(notificationContainer);
  }

  function showNotification(message, type = 'error', duration = 5000) {
    try {
      initNotificationContainer();

      const id = Date.now() + Math.random();
      const notification = document.createElement('div');
      
      const icons = { error: '❌', warning: '⚠️', info: 'ℹ️', success: '✅' };
      const colors = {
        error: 'rgba(239, 68, 68, 0.95)',
        warning: 'rgba(245, 158, 11, 0.95)',
        info: 'rgba(59, 130, 246, 0.95)',
        success: 'rgba(34, 197, 94, 0.95)'
      };

      notification.style.cssText = `
        background: ${colors[type] || colors.error};
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 16px 20px;
        margin-bottom: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        pointer-events: auto;
        cursor: pointer;
        animation: vapi-slide-in 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        align-items: flex-start;
        gap: 12px;
        position: relative;
        overflow: hidden;
      `;

      const escapeMsg = String(message).replace(/</g, '&lt;').replace(/>/g, '&gt;');

      notification.innerHTML = `
        <div style="font-size: 20px; flex-shrink: 0;">${icons[type]}</div>
        <div style="flex: 1; padding-right: 8px;">
          <strong style="display: block; margin-bottom: 4px; font-weight: 600;">
            ${type.charAt(0).toUpperCase() + type.slice(1)}
          </strong>
          <div style="opacity: 0.95; font-weight: 400;">${escapeMsg}</div>
        </div>
        <button style="
          background: rgba(255, 255, 255, 0.2);
          border: none;
          color: white;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
          transition: background 0.2s;
        ">×</button>
      `;

      if (duration > 0) {
        const progressBar = document.createElement('div');
        progressBar.style.cssText = `
          position: absolute;
          bottom: 0;
          left: 0;
          height: 3px;
          background: rgba(255, 255, 255, 0.6);
          width: 100%;
          transform-origin: left;
          animation: vapi-progress ${duration}ms linear;
        `;
        notification.appendChild(progressBar);
      }

      notificationContainer.appendChild(notification);
      activeNotifications.set(id, notification);

      let timeoutId;
      if (duration > 0) {
        timeoutId = setTimeout(() => removeNotification(id), duration);
      }

      const closeBtn = notification.querySelector('button');
      const dismiss = () => {
        if (timeoutId) clearTimeout(timeoutId);
        removeNotification(id);
      };
      
      closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        dismiss();
      });
      notification.addEventListener('click', dismiss);

      return id;
    } catch (error) {
      console.error('[Notification Error]', error);
    }
  }

  function removeNotification(id) {
    try {
      const notification = activeNotifications.get(id);
      if (!notification) return;

      notification.style.animation = 'vapi-slide-out 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
      
      setTimeout(() => {
        notification.remove();
        activeNotifications.delete(id);
      }, 300);
    } catch (error) {
      console.error('[Remove Notification Error]', error);
    }
  }

  // ============================================
  // ERROR LOGGING
  // ============================================

  const errorLog = [];
  const MAX_LOG_SIZE = 50;

  function logError(error, context = {}) {
    try {
      const errorEntry = {
        timestamp: new Date().toISOString(),
        message: error?.message || String(error),
        stack: error?.stack,
        context: context,
        userAgent: navigator.userAgent
      };

      errorLog.push(errorEntry);
      
      if (errorLog.length > MAX_LOG_SIZE) {
        errorLog.shift();
      }

      console.error('[VAPI Error]', errorEntry);
      return errorEntry;
    } catch (e) {
      console.error('[Error Logging Failed]', e);
    }
  }

  // ============================================
  // SAFE FETCH WITH RETRY
  // ============================================

  async function safeFetch(url, options = {}, config = {}) {
    const {
      timeout = 30000,
      retries = 3,
      retryDelay = 1000,
      showNotification: notify = true
    } = config;

    let lastError;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
          error.status = response.status;
          error.response = response;
          throw error;
        }

        return response;

      } catch (error) {
        lastError = error;
        
        const isNetworkError = error.name === 'TypeError' || error.name === 'AbortError';
        const isServerError = error.status >= 500;
        
        if (attempt < retries && (isNetworkError || isServerError)) {
          if (notify && attempt === 0) {
            showNotification(`Connection issue. Retrying... (${attempt + 1}/${retries})`, 'warning', 3000);
          }
          await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
          continue;
        }

        logError(error, { url, attempt, context: 'fetch' });
        
        if (notify) {
          let message = 'Request failed. Please try again.';
          if (error.name === 'AbortError') {
            message = 'Request timeout. Please check your connection.';
          } else if (error.status === 403 || error.status === 401) {
            message = 'Authentication failed. Please reconnect.';
          } else if (error.status === 404) {
            message = 'Service not found.';
          } else if (error.status >= 500) {
            message = 'Server error. Please try again later.';
          }
          showNotification(message, 'error');
        }
        
        throw error;
      }
    }

    throw lastError;
  }

  // ============================================
  // FILE VALIDATION
  // ============================================

  function validateFile(file, options = {}) {
    try {
      const {
        maxSizeMB = 5,
        allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      } = options;

      if (!file) {
        throw new Error('No file selected');
      }

      const maxSizeBytes = maxSizeMB * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        throw new Error(`File size exceeds ${maxSizeMB}MB limit`);
      }

      if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
        throw new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`);
      }

      if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
        throw new Error('Invalid file name');
      }

      return { valid: true, file };

    } catch (error) {
      logError(error, { file: file?.name, context: 'file_validation' });
      showNotification(error.message, 'error');
      return { valid: false, error: error.message };
    }
  }

  // ============================================
  // SAFE AUDIO INITIALIZATION
  // ============================================

  async function initAudioSafely(initFn) {
    try {
      return await initFn();
    } catch (error) {
      logError(error, { context: 'audio_init' });

      let message = 'Audio setup failed. Please check your device settings.';
      
      if (error.name === 'NotAllowedError') {
        message = 'Microphone access denied. Please grant permission and try again.';
      } else if (error.name === 'NotFoundError') {
        message = 'No microphone found. Please connect a microphone.';
      } else if (error.name === 'NotReadableError') {
        message = 'Microphone is in use by another application.';
      }

      showNotification(message, 'error');
      throw error;
    }
  }

  async function initCameraSafely(initFn) {
    try {
      return await initFn();
    } catch (error) {
      logError(error, { context: 'camera_init' });
      
      let message = 'Camera setup failed. Please check your device settings.';
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        message = 'Camera access denied. Please grant permission in your browser settings and try again.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        message = 'No camera found. Please connect a webcam.';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        message = 'Camera is already in use by another application or tab.';
      } else if (error.name === 'OverconstrainedError') {
        message = 'The requested camera resolution is not supported by your device.';
      } else if (error.name === 'AbortError') {
        message = 'Camera initialization was aborted due to a hardware issue.';
      }
      
      showNotification(message, 'error');
      throw error;
    }
  }

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
  connectionTimeoutMs: 15000,
  minQueueAheadSec: .05,
  maxQueueAheadSec: .8
      },
      STATUS_CONFIG = {
        IDLE_TIMEOUT_MS: 8000,
        IDLE_REMINDER_INTERVAL_MS: 15000,
        USER_SPEAKING_DECAY_MS: 800,
        AI_SPEAKING_DECAY_MS: 500,
        AUTO_DISCONNECT_IDLE_MS: 30000,
        DISCONNECT_WARNING_MS: 20000
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
    
    const GEMINI_WORKER_URL = "https://geminiworker.rizwin.workers.dev"; 
    const RESEND_WORKER_URL = "https://resendworker.rizwin.workers.dev"; 
    const WORKER_SECRET = "xK9#mP2$vL5nQ8wR";
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

    const screenCalendly = document.getElementById("vapiScreenCalendly"),
      calendlyWidget = document.getElementById("calendlyWidget"),
      skipCalendlyBtn = document.getElementById("vapiSkipCalendly");

    const processingOverlay = document.getElementById('vapiProcessingOverlay');

    function showProcessing(message = 'Processing...') {
      if (processingOverlay) {
        const textEl = processingOverlay.querySelector('.processing-text');
        if (textEl) textEl.textContent = message;
        processingOverlay.classList.add('is-active');
        console.log('[Processing] Showing:', message);
      }
    }
    
    function hideProcessing() {
      if (processingOverlay) {
        processingOverlay.classList.remove('is-active');
        console.log('[Processing] Hidden');
      }
    }
    
    if (!pill || !icon || !overlay) {
      logError(new Error('Required DOM elements not found'), { context: 'dom_init' });
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
      speechCheckInterval: null,
      autoDisconnectTimeoutId: null,
      lastUserActivityTime: 0,
      lastAiActivityTime: 0,
      lastToolActivityTime: 0,
      hasShownWarning: false
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

    // ============================================
    // TOOL CALL MANAGER CLASS
    // ============================================

    class ToolCallManager {
      constructor() {
        this.pendingCalls = new Map();
        this.config = {
          responseTimeout: 12000,    // Wait 12s for response
          maxRetries: 2,             // Retry twice on failure
          retryDelay: 2000          // 2s base delay (progressive)
        };
        this.currentMessageId = null;
      }

      /**
       * Send tool result with auto-retry logic
       */
      async sendToolResult(data) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          console.warn('[ToolManager] Socket not ready');
          return;
        }

        const toolCallId = pendingToolCallId;
        if (!toolCallId) {
          // No pending tool call - send as user message
          sendAsUserMessage(typeof data === "string" ? data : data.value || data.userInput || JSON.stringify(data));
          return;
        }

        const result = typeof data === "string" ? data : JSON.stringify(data);
        const messageId = `${toolCallId}-${Date.now()}`;
        
        this.currentMessageId = messageId;
        this.pendingCalls.set(messageId, {
          toolCallId,
          result,
          timestamp: Date.now(),
          resolved: false
        });

        console.log('[ToolManager] Sending tool result:', { messageId, toolCallId });
        
        try {
          await this.sendWithRetry(messageId, result, toolCallId, 1);
        } catch (error) {
          console.error('[ToolManager] Failed after all retries:', error);
          hideProcessing();
          showNotification('Failed to process request. Please try again.', 'error', 5000);
          
          // Clean up
          pendingToolCallId = null;
          pendingToolName = null;
          this.pendingCalls.delete(messageId);
        }
      }

      /**
       * Core retry logic with exponential backoff
       */
      async sendWithRetry(messageId, result, toolCallId, attempt) {
        console.log(`[ToolManager] Attempt ${attempt}/${this.config.maxRetries + 1} for ${messageId}`);
        
        try {
          // Send the tool result
          socket.send(JSON.stringify({ 
            type: "tool-calls-result", 
            toolCallResult: { toolCallId, result }
          }));
          
          socket.send(JSON.stringify({ 
            type: "add-message", 
            message: { role: "tool", tool_call_id: toolCallId, content: result }
          }));

          // Wait for response with timeout
          const responseReceived = await this.waitForResponse(messageId);
          
          if (responseReceived) {
            console.log('[ToolManager] Response received successfully');
            this.pendingCalls.delete(messageId);
            pendingToolCallId = null;
            pendingToolName = null;
            return;
          }

          // No response received within timeout
          throw new Error('Response timeout');

        } catch (error) {
          console.warn(`[ToolManager] Attempt ${attempt} failed:`, error.message);
          
          // Check if we should retry
          if (attempt <= this.config.maxRetries) {
            const delay = this.config.retryDelay * attempt; // Progressive delay: 2s, 4s
            
            showNotification(
              `Retrying... (${attempt}/${this.config.maxRetries})`, 
              'warning', 
              3000
            );
            
            await this.sleep(delay);
            return this.sendWithRetry(messageId, result, toolCallId, attempt + 1);
          }
          
          // Max retries exceeded
          throw new Error(`Max retries (${this.config.maxRetries}) exceeded`);
        }
      }

      /**
       * Wait for response with timeout
       */
      waitForResponse(messageId) {
        return new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            console.warn('[ToolManager] Response timeout for:', messageId);
            hideProcessing(); // Hide loader on timeout
            resolve(false);
          }, this.config.responseTimeout);

          // Check periodically if response was received
          const checkInterval = setInterval(() => {
            const call = this.pendingCalls.get(messageId);
            if (!call || call.resolved) {
              clearTimeout(timeoutId);
              clearInterval(checkInterval);
              resolve(true);
            }
          }, 100);
        });
      }

      /**
       * Called when new tool call arrives (marks previous as received)
       */
      onResponseReceived() {
        if (this.currentMessageId) {
          const call = this.pendingCalls.get(this.currentMessageId);
          if (call) {
            console.log('[ToolManager] Marking response as received:', this.currentMessageId);
            call.resolved = true;
          }
        }
      }

      /**
       * Cleanup all pending calls
       */
      reset() {
        console.log('[ToolManager] Resetting all pending calls');
        this.pendingCalls.clear();
        this.currentMessageId = null;
      }

      /**
       * Helper: sleep for given milliseconds
       */
      sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }
    }

    // ============================================
    // INITIALIZE TOOL MANAGER
    // ============================================

    const toolManager = new ToolCallManager();

    // ============================================
    // BUTTON & UI SETUP
    // ============================================

    const wrap = document.getElementById("vapi-ws-pill");
    const btn  = document.getElementById("vapiCallBtn");

    btn?.addEventListener("click", () => {
      wrap?.classList.add("is-open");
    });

    document.getElementById('vapiSuccessCloseBtn')?.addEventListener('click', () => {
      inBRDMode = false;

      if (isActive) {
        console.log('[Success Close] Ending voice call');
        stopCall(true);
        setState("idle");
      }
      
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

    // ============================================
    // ACTIVITY-BASED AUTO-DISCONNECT
    // ============================================

    function checkInactivity() {
      if (!statusState.isActive) return;
      
      const now = Date.now();
      const timeSinceUserActivity = now - statusState.lastUserActivityTime;
      const timeSinceAiActivity = now - statusState.lastAiActivityTime;
      const timeSinceToolActivity = now - statusState.lastToolActivityTime;
      
      const lastActivity = Math.min(timeSinceUserActivity, timeSinceAiActivity, timeSinceToolActivity);
      
      if (lastActivity >= STATUS_CONFIG.DISCONNECT_WARNING_MS && !statusState.hasShownWarning) {
        statusState.hasShownWarning = true;
        const remainingSeconds = Math.ceil((STATUS_CONFIG.AUTO_DISCONNECT_IDLE_MS - lastActivity) / 1000);
        showNotification(
          `No activity detected. Call will end in ${remainingSeconds} seconds...`, 
          'warning', 
          (STATUS_CONFIG.AUTO_DISCONNECT_IDLE_MS - lastActivity)
        );
        updateStatusIndicator("idle", "⚠️ Ending call soon...");
      }
      
      if (lastActivity >= STATUS_CONFIG.AUTO_DISCONNECT_IDLE_MS) {
        console.log('[Auto-Disconnect] No activity for 30 seconds:', {
          userIdle: timeSinceUserActivity,
          aiIdle: timeSinceAiActivity,
          toolIdle: timeSinceToolActivity
        });
        showNotification('Call ended due to inactivity', 'info', 4000);
        stopCall(true);
        setState("idle");
      }
    }

    function startActivityMonitoring() {
      clearActivityMonitoring();
      
      const now = Date.now();
      statusState.lastUserActivityTime = now;
      statusState.lastAiActivityTime = now;
      statusState.lastToolActivityTime = now;
      statusState.hasShownWarning = false;
      
      statusState.autoDisconnectTimeoutId = setInterval(() => {
        checkInactivity();
      }, 2000);
    }

    function clearActivityMonitoring() {
      if (statusState.autoDisconnectTimeoutId) {
        clearInterval(statusState.autoDisconnectTimeoutId);
        statusState.autoDisconnectTimeoutId = null;
      }
      statusState.hasShownWarning = false;
    }

    function recordUserActivity() {
      statusState.lastUserActivityTime = Date.now();
      statusState.hasShownWarning = false;
    }

    function recordAiActivity() {
      statusState.lastAiActivityTime = Date.now();
      statusState.hasShownWarning = false;
    }

    function recordToolActivity() {
      statusState.lastToolActivityTime = Date.now();
      statusState.hasShownWarning = false;
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
      statusIndicator && (statusIndicator.style.display = "none", statusState.isActive = false, clearIdleTimer(), clearActivityMonitoring(), stopVADCheck(), document.body.classList.remove("vapi-call-active"));
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
      recordUserActivity();
    }

    function onUserSpeechEnded() {
      window.vapiIsSpeaking || statusState.current === "userSpeaking" && updateStatusIndicator("listening");
    }

    function onAiSpeechStarted() {
      statusState.lastAiSpeechTime = Date.now();
      updateStatusIndicator("aiSpeaking");
      recordAiActivity();
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

    function attemptCloseOverlay() {
      if (inBRDMode) {
        const ok = confirm("Close BRD and lose changes?");
        if (!ok) return;
        inBRDMode = false;
        if (closeBtn) closeBtn.style.display = '';
        if (backBtn) backBtn.style.display = '';
      } else if (isActive) {
        if (!confirm("This will end your voice call and you'll lose your progress. Close anyway?")) {
          return;
        }
      } else {
        if (!confirm("If you close now, you will lose the data and you must start from the beginning. Close anyway?")) {
          return;
        }
      }
      
      if (isActive) {
        console.log('[Close] Ending voice call');
        stopCall(true);
        setState("idle");
      }
      
      hideOverlay();
    }

    function showScreen(e) {
      hideProcessing();
      showOverlay();
      setUiProcessing(false);
      textInput && (textInput.disabled = false);
      emailInput && (emailInput.disabled = false);
      cardsGrid && [...cardsGrid.querySelectorAll(".vapi-cardbtn")].forEach(t => {
        t.disabled = false;
        t.style.opacity = "1";
      });
      [screenCards, screenQuestion, screenPreview, screenEmail, screenLoading, screenBRD, screenSuccess, screenCalendly].forEach(t => {
        t && (t.classList.remove("is-active"), t.style.opacity = "1", t.style.pointerEvents = "auto");
      });

      if (e === screenSuccess) {
        if (closeBtn) closeBtn.style.display = "none";
      } else {
        if (closeBtn) closeBtn.style.display = "";
      }
      e?.classList.add("is-active");
    }

    overlay.addEventListener("click", e => {
      if (inBRDMode) return;
      e.target === overlay && attemptCloseOverlay();
    });

    closeBtn?.addEventListener("click", attemptCloseOverlay);

    backBtn?.addEventListener("click", () => {
      if (inBRDMode) return;
      sendToolResult({ action: "back", category: window.__vapiUi.lastCategory });
      hideOverlay();
    });

    // ============================================
    // TOOL RESULT & MESSAGE FUNCTIONS - UPDATED
    // ============================================

    function sendToolResult(e) {
      // Use the tool manager for all tool results
      toolManager.sendToolResult(e);
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
          recordUserActivity();
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
          showProcessing('Processing selection...');
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
      recordUserActivity();
      const e = Array.from(window.__vapiUi.selected);
      if (!e.length) return;
      const t = window.__vapiUi.pendingField;
      setCollected(t, e);
      const n = e.join(", ");
      showProcessing('Processing selections...');
      setUiProcessing(true);
      sendToolResult({ field: t, values: e, userSelected: n });
      setTimeout(() => { pendingToolCallId || sendAsUserMessage(`I selected: ${n}`); }, 300);
    });

    sendEmailBtn?.addEventListener("click", async () => {
      recordUserActivity();
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
      recordUserActivity();
      const e = String(textInput?.value || "").trim();
      if (!e) return;
      
      const t = window.__vapiUi.pendingField;
      setCollected(t, e);
      
      showProcessing('Sending your answer...');
      
      setUiProcessing(true);
      textInput && (textInput.disabled = true);
      sendToolResult({ field: t, value: e, userInput: e });
      
      setTimeout(() => { 
        if (!pendingToolCallId) {
          sendAsUserMessage(`My answer for ${t} is: ${e}`); 
        }
      }, 300);
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
      showScreen(screenPreview);
    }

    // ============================================
    // APPROVE BUTTON - TRIGGERS BRD MODE
    // ============================================

    approveBtn?.addEventListener("click", async () => {
      console.log("[Click] Approving preview");
      
      const service = window.__vapiUi.collected?.service;
      
      if (service === "Consulting") {
        showCalendlyForConsulting();
        return;
      }
      
      inBRDMode = true;
      console.log("[BRD Mode] LOCKED");
      
      pendingToolCallId = null;
      pendingToolName = null;
      
      if (backBtn) backBtn.style.display = 'none';
      
      setUiProcessing(true);
      
      await generateFullBRD();
    });

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
    // HANDLE TOOL CALLS - UPDATED WITH TOOL MANAGER
    // ============================================

    function handleToolCalls(e) {
      hideProcessing(); // ✅ Hide loader immediately
      toolManager.onResponseReceived(); // ✅ Mark previous calls complete
      
      const t = e?.message ?? e,
        n = t?.toolCallList ?? t?.toolCalls ?? [];
      
      recordToolActivity();
      
      n.forEach(i => {
        const s = i?.id || i?.toolCallId || i?.tool_call_id,
          a = i?.function?.name || i?.name;
        console.log("[ToolCall] Received:", a);
        
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
          
          if (l === "collect_email") {
            console.log("[ToolCall] collect_email question - routing by service");
            const service = window.__vapiUi.collected?.service;
            
            if (service === "Consulting") {
              console.log("[Email Step] Consulting flow → opening Calendly");
              showCalendlyForConsulting();
              return;
            }
            
            (async () => {
              try {
                inBRDMode = true;
                if (backBtn) backBtn.style.display = "none";
                setUiProcessing(true);
                console.log("[Email Step] Non-consulting flow → generating BRD");
                await generateFullBRD();
              } catch (err) {
                console.error("[BRD Generation Error]", err);
              }
            })();
            return;
          }
          
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
          console.log("[ToolCall] ui_show_email (backup handler) - routing by service");
          const service = window.__vapiUi.collected?.service;
          
          if (service === "Consulting") {
            console.log("[Email Screen] Consulting flow → opening Calendly");
            showCalendlyForConsulting();
            return;
          }
          
          (async () => {
            try {
              inBRDMode = true;
              if (backBtn) backBtn.style.display = "none";
              setUiProcessing(true);
              console.log("[Email Screen] Non-consulting flow → generating BRD");
              await generateFullBRD();
            } catch (err) {
              console.error("[BRD Generation Error]", err);
            }
          })();
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
    // WEBSOCKET & CALL FUNCTIONS (WITH ERROR HANDLING)
    // ============================================

    async function createWebsocketCallUrl() {
      try {
        const headers = { "content-type": "application/json" };
        if (BRIDGE_SECRET) headers["x-bridge-secret"] = BRIDGE_SECRET;
        
        const response = await safeFetch(CREATE_CALL_ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({ assistantId: ASSISTANT_ID })
        }, {
          timeout: 30000,
          retries: 2
        });
        
        const data = await response.json().catch(() => ({}));
        
        if (!data.websocketCallUrl) {
          throw new Error("No websocketCallUrl returned");
        }
        
        return data.websocketCallUrl;
        
      } catch (error) {
        logError(error, { context: 'create_websocket_url' });
        throw error;
      }
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

    function showCalendlyForConsulting() {
      const collected = window.__vapiUi.collected || {};
      
      console.log('[Calendly] Showing Calendly for consulting', collected);
      
      const params = new URLSearchParams();
      
      if (collected.email) {
        params.append('email', collected.email);
      }
      
      if (collected.consulting_topic) {
        params.append('a1', collected.consulting_topic);
      }
      if (collected.consulting_current_situation) {
        params.append('a2', collected.consulting_current_situation);
      }
      if (collected.consulting_desired_outcome) {
        params.append('a3', collected.consulting_desired_outcome);
      }
      if (collected.consulting_urgency) {
        params.append('a4', collected.consulting_urgency);
      }
      
      const calendlyUrl = `https://calendly.com/rizwinazeez/30min?${params.toString()}`;
      
      console.log('[Calendly] Loading with URL:', calendlyUrl);
      
      showScreen(screenCalendly);
      
      if (window.Calendly) {
        if (calendlyWidget) {
          calendlyWidget.innerHTML = '';
        }
        
        window.Calendly.initInlineWidget({
          url: calendlyUrl,
          parentElement: calendlyWidget,
          prefill: {
            email: collected.email || '',
            customAnswers: {
              a1: collected.consulting_topic || '',
              a2: collected.consulting_current_situation || '',
              a3: collected.consulting_desired_outcome || '',
              a4: collected.consulting_urgency || ''
            }
          }
        });
        
        showNotification('Schedule your consulting call', 'info', 3000);
      } else {
        console.error('[Calendly] Widget library not loaded yet, retrying...');
        
        setTimeout(() => {
          if (window.Calendly) {
            showCalendlyForConsulting();
          } else {
            showNotification('Calendar widget failed to load. Please refresh the page.', 'error');
          }
        }, 1000);
      }
    }

    async function startCall() {
      console.log('[START CALL] Requested. isActive:', isActive, 'socket state:', socket?.readyState);
      
      if (isActive) {
        console.warn('[START CALL] Call already active, ignoring');
        return;
      }
      
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        console.warn('[START CALL] Previous socket not closed (state:', socket.readyState, '), waiting...');
        showNotification('Please wait a moment before starting a new call', 'info', 2000);
        return;
      }
      
      console.log('[START CALL] Resetting tool state');
      resetToolCallState();
      
      console.log('[START CALL] Starting new call...');
      setState("loading");
      showStatusIndicator();
      updateStatusIndicator("connecting");
      nextPlayTime = 0;
      window.vapiAudioLevel = 0;
      window.vapiIsSpeaking = false;
      playCtx = playCtx || new(window.AudioContext || window.webkitAudioContext)({ latencyHint: "interactive" });
      
      try { 
        await playCtx.resume(); 
      } catch (err) {
        logError(err, { context: 'audio_context_resume' });
      }
      
      try {
        console.log('[START CALL] Creating WebSocket URL...');
        const wsUrl = await createWebsocketCallUrl();
        console.log('[START CALL] Got URL, creating WebSocket...');
        
        socket = new WebSocket(wsUrl);
        socket.binaryType = "arraybuffer";
        
        const connectionTimeout = setTimeout(() => {
          console.error('[START CALL] Connection timeout! State:', socket?.readyState);
          if (socket?.readyState !== WebSocket.OPEN) {
            stopCall(false);
            setState("idle");
            hideStatusIndicator();
            showNotification("Connection timeout. Please try again.", 'error');
          }
        }, AUDIO_CONFIG.connectionTimeoutMs);
        
        socket.onopen = async () => {
          try {
            clearTimeout(connectionTimeout);
            console.log('[WebSocket] Connection opened successfully!');
            
            console.log('[WebSocket] Requesting microphone...');
            stream = await initAudioSafely(async () => {
              return await navigator.mediaDevices.getUserMedia({
                audio: {
                  channelCount: 1,
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
                }
              });
            });
            
            console.log('[WebSocket] Microphone granted, setting up audio...');
            
            try { 
              window.stopHandMode?.(); 
            } catch (err) { 
              console.warn('[HAND] stopHandMode failed', err); 
            }
            
            audioContext = new(window.AudioContext || window.webkitAudioContext);
            await audioContext.resume();
            
            const workletBlob = createWorkletProcessorBlob();
            await audioContext.audioWorklet.addModule(workletBlob);
            URL.revokeObjectURL(workletBlob);
            
            source = audioContext.createMediaStreamSource(stream);
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 4.0;
            
            workletNode = new AudioWorkletNode(audioContext, "vapi-audio-processor");
            workletNode.port.onmessage = msg => { 
              socket?.readyState === WebSocket.OPEN && socket.send(msg.data); 
              processAudioForVAD(msg.data); 
            };
            
            source.connect(gainNode);
            gainNode.connect(workletNode);
            
            startVADCheck();
            isActive = true;
            setState("active");
            updateStatusIndicator("listening");
            updateAudioLevel();
            startActivityMonitoring();
            
            console.log('[WebSocket] Setup complete!');
            showNotification("Connected successfully", 'success', 2000);
            
          } catch (error) {
            console.error('[WebSocket] Setup error:', error);
            logError(error, { context: 'websocket_onopen' });
            stopCall(false);
            setState("idle");
            hideStatusIndicator();
          }
        };
        
        socket.onmessage = async msg => {
          try {
            if (msg.data instanceof ArrayBuffer) { 
              const pcm = new Int16Array(msg.data); 
              pcm.length > 0 && playPcm16(pcm, AUDIO_CONFIG.outputSampleRate); 
              return; 
            }
            
            const processMessage = message => {
              let parsed;
              try { parsed = JSON.parse(message); } catch { return; }
              const content = parsed?.message ?? parsed;
              if (content?.type === "tool-calls") { 
                handleToolCalls(parsed); 
                return; 
              }
              const transcript = extractTranscriptMessage(content);
              transcript && applyVoiceToUI(transcript);
            };
            
            if (typeof msg.data == "string") return processMessage(msg.data);
            if (msg.data instanceof Blob) {
              try { 
                processMessage(await msg.data.text()); 
              } catch (err) {
                logError(err, { context: 'blob_text' });
              }
            }
          } catch (error) {
            logError(error, { context: 'websocket_onmessage' });
          }
        };
        
        socket.onerror = (error) => { 
          console.error('[WebSocket] ERROR:', error, 'State:', socket?.readyState);
          logError(new Error('WebSocket error'), { context: 'websocket_onerror', error });
          
          if (isActive) {
            showNotification(
              "Connection issue detected. Attempting to reconnect...", 
              "warning", 
              5000
            );
          }
        };
        
        socket.onclose = (event) => {
          console.log('[WebSocket] Closed. Code:', event.code, 'Reason:', event.reason || 'none', 'Clean:', event.wasClean);
          
          const wasActive = isActive;
          
          if (isActive) {
            stopCall(false);
          }
          
          const isNormalClosure = 
            event.code === 1000 || 
            event.code === 1001 || 
            event.code === 1005 || 
            !wasActive;
          
          if (!isNormalClosure) {
            console.error('[WebSocket] Abnormal closure:', event.code, event.reason);
            showNotification(
              "Connection lost. Please try again.", 
              "error", 
              5000
            );
          } else {
            console.log('[WebSocket] Normal closure');
          }
        };
        
      } catch (error) {
        console.error('[START CALL] Error:', error);
        logError(error, { context: 'start_call' });
        stopCall(false);
        setState("idle");
        hideStatusIndicator();
      }
    }

    function stopCall(sendEndSignal = true) {
      console.log('[STOP CALL] Starting cleanup. sendEndSignal:', sendEndSignal, 'isActive:', isActive);
      
      window.vapiAudioLevel = 0;
      window.vapiIsSpeaking = false;
      isActive = false;
      
      stopVADCheck();
      clearActivityMonitoring();
      
      // ✅ Reset tool manager
      toolManager.reset();
      
      try { 
        if (sendEndSignal && socket?.readyState === WebSocket.OPEN) {
          console.log('[STOP CALL] Sending end-call message');
          socket.send(JSON.stringify({ type: "end-call" })); 
        }
      } catch (err) {
        console.warn('[STOP CALL] Could not send end signal:', err);
      }
      
      try { 
        if (workletNode) {
          workletNode.port.onmessage = null;
          workletNode.disconnect();
          console.log('[STOP CALL] Worklet disconnected');
        }
      } catch (e) {
        console.warn('[STOP CALL] Worklet disconnect error:', e);
      }
      
      try { 
        if (source) {
          source.disconnect();
          console.log('[STOP CALL] Source disconnected');
        }
      } catch (e) {
        console.warn('[STOP CALL] Source disconnect error:', e);
      }
      
      try { 
        if (audioContext && audioContext.state !== 'closed') {
          audioContext.close();
          console.log('[STOP CALL] Audio context closed');
        }
      } catch (e) {
        console.warn('[STOP CALL] Audio context close error:', e);
      }
      
      try { 
        if (stream) {
          stream.getTracks().forEach(track => {
            track.stop();
            console.log('[STOP CALL] Track stopped:', track.kind);
          });
        }
      } catch (e) {
        console.warn('[STOP CALL] Track stop error:', e);
      }
      
      try { 
        if (socket) {
          const socketState = socket.readyState;
          console.log('[STOP CALL] Closing socket, readyState:', socketState);
          
          socket.onopen = null;
          socket.onmessage = null;
          socket.onerror = null;
          socket.onclose = null;
          
          if (socketState === WebSocket.OPEN || socketState === WebSocket.CONNECTING) {
            socket.close(1000, 'Client closed');
          }
        }
      } catch (e) {
        console.warn('[STOP CALL] Socket close error:', e);
      }
      
      socket = null;
      stream = null;
      audioContext = null;
      workletNode = null;
      source = null;
      nextPlayTime = 0;
      
      pendingToolCallId = null;
      pendingToolName = null;
      
      analyser = null;
      analyserData = null;

      if (pillWrap) pillWrap.style.transform = "translateX(-50%) scale(1)";
      else if (pill) pill.style.transform = "scale(1)";
      
      if (!inBRDMode) {
        hideOverlay();
      } else {
        showNotification('Voice call ended. You can continue working on your document.', 'info', 3000);
      }
      
      hideStatusIndicator();
      setState("idle");
      
      setUiProcessing(false);
      
      console.log('[STOP CALL] Cleanup complete');
    }

    function resetToolCallState() {
      console.log('[Reset Tool State] Clearing pending tool calls');
      pendingToolCallId = null;
      pendingToolName = null;
      setUiProcessing(false);
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
      } catch (error) { 
        logError(error, { context: 'pill_click' });
        stopCall(false); 
        setState("idle"); 
      }
    });

    window.addEventListener("beforeunload", () => { isActive && stopCall(false); });

    // ============================================
    // BRD GENERATION FUNCTIONS (WITH ERROR HANDLING)
    // ============================================

    function updateLoadingStatus(message, step) {
      if (loadingText) loadingText.textContent = message;
      if (loadingProgress) {
        const dots = loadingProgress.querySelectorAll('.progress-dot');
        dots.forEach((dot, index) => { dot.classList.toggle('active', index < step); });
      }
    }

    async function generateBRDText(collected) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (WORKER_SECRET) headers["X-Worker-Secret"] = WORKER_SECRET;
        
        const response = await safeFetch(`${GEMINI_WORKER_URL}/generate-brd`, {
          method: "POST",
          headers,
          body: JSON.stringify({ collected })
        }, {
          timeout: 60000,
          retries: 2
        });
        
        const data = await response.json();
        return data.html;
        
      } catch (error) {
        logError(error, { context: 'generate_brd_text' });
        throw error;
      }
    }

    async function generateDesignImage(collected) {
      try {
        const headers = { "Content-Type": "application/json" };
        if (WORKER_SECRET) headers["X-Worker-Secret"] = WORKER_SECRET;
        
        const response = await safeFetch(`${GEMINI_WORKER_URL}/generate-design`, {
          method: "POST",
          headers,
          body: JSON.stringify({ collected })
        }, {
          timeout: 60000,
          retries: 1,
          showNotification: false
        });
        
        return await response.json();
        
      } catch (error) {
        logError(error, { context: 'generate_design_image' });
        return null;
      }
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
      logError(error, { context: 'generate_full_brd' });
      showNotification('Failed to generate BRD: ' + error.message, 'error');
      inBRDMode = false;
      if (closeBtn) closeBtn.style.display = '';
      if (backBtn) backBtn.style.display = '';
      showScreen(screenPreview);
    }
  }

  skipCalendlyBtn?.addEventListener("click", () => {
    if (confirm("Skip scheduling for now? You can always book a call later.")) {
      if (isActive) {
        console.log('[Calendly Skip] Ending voice call');
        stopCall(true);
        setState("idle");
      }
      showNotification('You can schedule a call anytime from our website!', 'info', 5000);
      hideOverlay();
      
      window.__vapiUi.collected = {};
      window.__vapiUi.selected.clear();
      window.__vapiUi.flow = null;
      window.__vapiUi.step = null;
      window.__vapiUi.pendingField = null;
      window.__vapiUi.lastCategory = null;
    }
  });

  window.addEventListener('message', function(e) {
    if (e.data.event && e.data.event.indexOf('calendly') === 0) {
      if (e.data.event === 'calendly.event_scheduled') {
        console.log('[Calendly] Event scheduled!', e.data);
        if (isActive) {
          stopCall(true);
          setState("idle");
        }
        showNotification('Call scheduled successfully! Check your email for confirmation.', 'success', 5000);
        
        setTimeout(() => {
          hideOverlay();
          
          window.__vapiUi.collected = {};
          window.__vapiUi.selected.clear();
          window.__vapiUi.flow = null;
          window.__vapiUi.step = null;
          window.__vapiUi.pendingField = null;
          window.__vapiUi.lastCategory = null;
        }, 3000);
      }
    }
  });

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
    
    if (brdUploadPreview) { 
      brdUploadPreview.innerHTML = ""; 
      brdUploadPreview.classList.remove('has-file'); 
    }
    
    if (brdSubmitBtn) {
      brdSubmitBtn.disabled = false;
      const submitText = brdSubmitBtn.querySelector('.submit-text');
      if (submitText) submitText.textContent = "Submit & View Proposal";
    }
    
    initBRDScrollHint();
    showScreen(screenBRD);
  }

  function handleDesignUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    const validation = validateFile(file, {
      maxSizeMB: BRD_CONFIG.maxUploadSizeMB,
      allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    });
    
    if (!validation.valid) {
      if (brdUploadInput) brdUploadInput.value = "";
      return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const base64Full = e.target.result;
        generatedBRD.userUploadedImageBase64 = base64Full.split(',')[1];
        generatedBRD.userUploadedImageName = file.name;
        
        if (brdUploadPreview) {
          const sanitizedFileName = escapeHtml(file.name);
          brdUploadPreview.innerHTML = `
            <div class="upload-preview-item">
              <img src="${base64Full}" alt="Uploaded design">
              <span>${sanitizedFileName}</span>
              <button type="button" class="remove-upload" title="Remove">×</button>
            </div>
          `;
          brdUploadPreview.classList.add('has-file');
          brdUploadPreview.querySelector('.remove-upload')?.addEventListener('click', removeUploadedDesign);
        }
        
        showNotification('Image uploaded successfully!', 'success', 3000);
        
      } catch (error) {
        logError(error, { context: 'file_upload_process' });
        showNotification('Failed to process image', 'error');
      }
    };
    
    reader.onerror = () => {
      logError(new Error('File read error'), { context: 'file_reader' });
      showNotification('Failed to read file', 'error');
    };
    
    reader.readAsDataURL(file);
  }

  function removeUploadedDesign() {
    generatedBRD.userUploadedImageBase64 = null;
    generatedBRD.userUploadedImageName = null;
    if (brdUploadInput) brdUploadInput.value = "";
    if (brdUploadPreview) { 
      brdUploadPreview.innerHTML = ""; 
      brdUploadPreview.classList.remove('has-file'); 
    }
  }

  function resetBRDContent() {
    if (brdContent && generatedBRD.originalHtml) {
      brdContent.innerHTML = generatedBRD.originalHtml;
    }
  }

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

  async function submitBRD() {
    const userEmail = ADMIN_EMAIL;
    
    if (brdSubmitBtn) {
      brdSubmitBtn.disabled = true;
      const submitText = brdSubmitBtn.querySelector('.submit-text');
      if (submitText) submitText.textContent = "Generating Proposal...";
    }
    
    try {
      const pdfHtml = buildPDFContent();
      
      const response = await safeFetch(`${BRD_PDF_WORKER_URL}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: userEmail,
          pdfHtml: pdfHtml
        })
      }, {
        timeout: 90000,
        retries: 2
      });
      
      const result = await response.json();
      generatedBRD.downloadUrl = result.downloadUrl;
      
      showNotification('Proposal generated successfully!', 'success', 3000);
      
      showSuccessScreen();
      
    } catch (error) {
      logError(error, { context: 'submit_brd' });
      if (brdSubmitBtn) {
        brdSubmitBtn.disabled = false;
        const t = brdSubmitBtn.querySelector('.submit-text');
        if (t) t.textContent = "Submit & View Proposal";
      }
    }
  }

  function showSuccessScreen() {
    if (successEmail) {
      successEmail.innerHTML = `
        <p style="text-align: center; color: #666; margin: 20px 0;">
          Your proposal has been generated and is ready for review!
        </p>
      `;
    }
    showScreen(screenSuccess);
  }

  function downloadPDF() {
    if (!generatedBRD.downloadUrl) { 
      showNotification('No PDF available', 'warning');
      return; 
    }
    window.open(generatedBRD.downloadUrl, '_blank');
  }

  function startNewProject() {
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
    testPDFContent: () => buildPDFContent(),
    getErrorLog: () => errorLog,
    clearErrorLog: () => errorLog.length = 0,
    getToolManager: () => toolManager
  };

  console.log('[Vapi] Voice assistant initialized with error handling and tool call retry system!');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();
