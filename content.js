/**
 * Handshake Trust Checker
 * Content script for analyzing job postings on Handshake
 * 
 * This script automatically scans job listings and individual job postings
 * to identify potential scams, ghost jobs, and suspicious content.
 */

(function () {
  // Prevent multiple initializations
  if (window.__HTC_INIT__) return;
  window.__HTC_INIT__ = true;

  /* ============================================
     RED FLAG PATTERNS
     ============================================
     Each pattern includes:
     - pattern: Regular expression to match
     - name: Human-readable description
     - weight: Severity score (higher = more concerning)
  */

  const RED_FLAGS = [
    // === FINANCIAL EXPLOITATION (Critical Risk) ===
    { pattern: /immediate\s*hire/i, name: "Immediate hire pressure", weight: 12 },
    { pattern: /send\s*payment|pay\s*us|payment\s*required/i, name: "Payment request", weight: 20 },
    { pattern: /training\s*fee|course\s*fee|certification\s*fee|starter\s*kit\s*fee/i, name: "Training/starter fee required", weight: 20 },
    { pattern: /upfront\s*fee|application\s*fee|processing\s*fee|registration\s*fee|setup\s*fee/i, name: "Upfront fee required", weight: 20 },
    { pattern: /wire\s*transfer|western\s*union|moneygram/i, name: "Wire transfer mention", weight: 18 },
    { pattern: /gift\s*cards?|prepaid\s*card|itunes|steam\s*card|amazon\s*card/i, name: "Gift card payment", weight: 18 },
    { pattern: /deposit\s*required|security\s*deposit|refundable\s*deposit/i, name: "Deposit required", weight: 18 },
    { pattern: /buy\s*(equipment|supplies|inventory)|purchase\s*(kit|materials)/i, name: "Must purchase materials", weight: 16 },
    { pattern: /investment\s*required|invest\s*your\s*(own\s*)?money/i, name: "Investment required", weight: 18 },
    { pattern: /cash\s*app|venmo|zelle|paypal\s*friends/i, name: "Peer-to-peer payment apps", weight: 15 },

    // === UNREALISTIC PROMISES (High Risk) ===
    { pattern: /work from home and earn thousands|make \$\d+k? from home/i, name: "Unrealistic earnings claim", weight: 15 },
    { pattern: /quick\s*money|easy\s*money|fast\s*cash|instant\s*pay/i, name: "Quick money promise", weight: 15 },
    { pattern: /guaranteed\s*income|guaranteed\s*earnings|guaranteed\s*salary/i, name: "Guaranteed income claim", weight: 14 },
    { pattern: /\$\d{1,3},?\d{3,}\+?\s*per\s*(week|day)|weekly\s*pay\s*\$\d{3,}|\$\d{3,}\s*daily/i, name: "Unusually high daily/weekly pay", weight: 12 },
    { pattern: /unlimited\s*earning\s*potential|earn\s*as\s*much\s*as\s*you\s*want|sky'?s?\s*the\s*limit/i, name: "Unlimited earnings claim", weight: 12 },
    { pattern: /get\s*rich|make\s*millions|financial\s*freedom|retire\s*early/i, name: "Get rich quick language", weight: 14 },
    { pattern: /six[- ]figure\s*income|7[- ]figure|multiple\s*income\s*streams/i, name: "Inflated income promises", weight: 12 },
    { pattern: /work\s*\d+\s*hours?\s*per\s*week.*\$\d{3,}/i, name: "Unrealistic hourly rate", weight: 10 },
    { pattern: /passive\s*income|residual\s*income/i, name: "Passive income claims", weight: 8 },

    // === MINIMAL REQUIREMENTS (Medium-High Risk) ===
    { pattern: /no\s*experience\s*(required|needed)|anyone\s*can\s*do|zero\s*experience/i, name: "No experience required", weight: 8 },
    { pattern: /no\s*degree\s*required|no\s*college|no\s*education\s*required/i, name: "No qualifications needed", weight: 6 },
    { pattern: /no\s*skills?\s*needed|no\s*background\s*check/i, name: "No skills or background check", weight: 10 },
    { pattern: /start\s*immediately|start\s*today|begin\s*right\s*away/i, name: "Start immediately pressure", weight: 10 },
    { pattern: /no\s*interview\s*required|hire\s*without\s*interview|skip\s*the\s*interview/i, name: "No interview required", weight: 14 },

    // === EVASIVE COMMUNICATION (High Risk) ===
    { pattern: /telegram|whatsapp|signal|wickr|kik/i, name: "Unofficial messaging app", weight: 12 },
    { pattern: /contact\s+via\s+dm|direct\s+message|dm\s+me|message\s+me\s+directly/i, name: "DM-only contact", weight: 10 },
    { pattern: /apply\s+via\s+google\s+form|docs\.google\.com\/forms|bit\.ly|tinyurl|goo\.gl/i, name: "External application form", weight: 10 },
    { pattern: /@(gmail|yahoo|hotmail|outlook|aol|protonmail)\.com/i, name: "Personal email domain", weight: 8 },
    { pattern: /send\s*resume\s*to|email\s*resume\s*to.*@(gmail|yahoo|hotmail)/i, name: "Non-corporate email for applications", weight: 12 },
    { pattern: /text\s*us\s*at|sms\s*to|call\s*this\s*number/i, name: "Informal contact method", weight: 8 },
    { pattern: /respond\s*with.*in\s*subject|reply\s*with\s*code/i, name: "Unusual application instructions", weight: 6 },

    // === URGENCY & SCARCITY TACTICS (Medium Risk) ===
    { pattern: /limited\s*spots?|only\s*\d+\s*positions?|filling\s*fast/i, name: "Artificial scarcity", weight: 6 },
    { pattern: /hiring\s*now|act\s*fast|don'?t\s*miss|hurry|urgent/i, name: "Urgency pressure", weight: 6 },
    { pattern: /first\s*come\s*first\s*serve|while\s*supplies\s*last/i, name: "FCFS pressure tactics", weight: 6 },
    { pattern: /limited\s*time\s*offer|offer\s*expires|deadline\s*approaching/i, name: "Time pressure", weight: 5 },

    // === VAGUE OR SUSPICIOUS CONTENT (Medium-High Risk) ===
    { pattern: /work\s*from\s*anywhere|100%\s*remote|location\s*independent|digital\s*nomad/i, name: "Overly vague location", weight: 3 },
    { pattern: /mystery\s*shopper|secret\s*shopper|product\s*tester|review\s*writer/i, name: "Common scam job title", weight: 12 },
    { pattern: /package\s*forwarding|reshipping|parcel\s*receiving|repackaging/i, name: "Package forwarding scam", weight: 18 },
    { pattern: /data\s*entry.*work.*home|envelope\s*stuffing|assembly\s*at\s*home/i, name: "Classic work-from-home scam", weight: 14 },
    { pattern: /process\s*payments|payment\s*processor|financial\s*agent/i, name: "Money mule indicators", weight: 16 },
    { pattern: /personal\s*assistant.*remote|virtual\s*assistant.*immediately/i, name: "Suspicious remote assistant", weight: 8 },
    { pattern: /customer\s*service.*work.*home.*immediately/i, name: "Rushed remote CS role", weight: 6 },

    // === MLM & PYRAMID SCHEMES (High Risk) ===
    { pattern: /multi[-\s]?level|mlm|network\s*marketing|pyramid/i, name: "MLM/pyramid language", weight: 16 },
    { pattern: /recruit.*friends|bring.*team|referral\s*bonus|downline|upline/i, name: "Recruitment-focused", weight: 14 },
    { pattern: /be\s*your\s*own\s*boss|entrepreneur\s*opportunity|own\s*business/i, name: "Vague entrepreneurship", weight: 7 },
    { pattern: /independent\s*distributor|sales\s*representative.*unlimited/i, name: "MLM distributor language", weight: 10 },
    { pattern: /commission\s*only|100%\s*commission|no\s*base\s*salary/i, name: "Commission-only pay", weight: 8 },

    // === CRYPTOCURRENCY & INVESTMENT SCAMS (High Risk) ===
    { pattern: /crypto(?:currency)?|bitcoin|blockchain\s*opportunity|NFT|web3/i, name: "Cryptocurrency mention", weight: 10 },
    { pattern: /forex\s*trading|day\s*trading|stock\s*trading\s*from\s*home/i, name: "Trading opportunity scam", weight: 12 },
    { pattern: /invest\s*in\s*crypto|cryptocurrency\s*investor/i, name: "Crypto investment scheme", weight: 14 },

    // === IDENTITY THEFT RISKS (Critical Risk) ===
    { pattern: /social\s*security|ssn|driver'?s?\s*license.*upfront|copy\s*of\s*id\s*card/i, name: "Sensitive documents requested upfront", weight: 18 },
    { pattern: /credit\s*check\s*fee|background\s*check\s*fee|credit\s*report\s*required/i, name: "Fee for background check", weight: 14 },
    { pattern: /bank\s*account\s*details|routing\s*number|account\s*number.*required/i, name: "Bank details requested early", weight: 16 },
    { pattern: /passport\s*copy|birth\s*certificate|tax\s*id/i, name: "Excessive personal documents", weight: 14 },

    // === UNPROFESSIONAL PRESENTATION (Low-Medium Risk) ===
    { pattern: /click\s*here|click\s*now|apply\s*here.*http/i, name: "Suspicious links", weight: 6 },
    { pattern: /this\s*is\s*not\s*a\s*scam|100%\s*legit|completely\s*legitimate/i, name: "Defensive legitimacy claims", weight: 10 },
    { pattern: /too\s*good\s*to\s*be\s*true|you\s*won'?t\s*believe/i, name: "TGTBT language", weight: 8 },
  ];

  // Keywords indicating legitimate job content
  const JOB_KEYWORDS = [
    /responsibil/i,
    /qualification/i,
    /requirement/i,
    /preferred/i,
    /benefits?/i,
    /job description/i,
    /application deadline/i,
    /what you'll do/i,
    /who you are/i,
    /about the role/i,
    /apply now/i
  ];

  /* ============================================
     UTILITY FUNCTIONS
     ============================================ */

  const byId = (id) => document.getElementById(id);
  
  const debounce = (fn, ms = 300) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), ms);
    };
  };

  // Constants
  const DETAIL_ROOT_ID = "htc-detailed-badge-root";
  const SIMPLE_CLASS = "htc-badge htc-badge-simple";
  const BADGED_ATTR = "data-htc";

  /* ============================================
     JOB ANALYSIS ENGINE
     ============================================ */

  function analyzeJob(jobText, includeReasons = false) {
    const reasons = [];
    const text = (jobText || "").toLowerCase();

    // Check for red flags
    RED_FLAGS.forEach(flag => {
      if (flag.pattern.test(text)) {
        if (includeReasons) {
          reasons.push(`🚩 ${flag.name}`);
        }
      }
    });

    // Check for suspiciously short description
    if (text.length < 120) {
      if (includeReasons) {
        reasons.push("🚩 Suspiciously short description");
      }
    }

    if (includeReasons) {
      // Detect job responsibilities
      const responsibilityKeywords = [
        /responsibilit/i, /\bduties\b/i, /\bduty\b/i,
        /what you('ll| will) do/i, /what you('ll| will) be doing/i,
        /your role/i, /the role/i, /this role/i,
        /you will/i, /you('ll| will) be/i,
        /day[- ]?to[- ]?day/i, /tasks include/i,
        /job functions?/i, /essential functions/i,
        /responsible for/i, /responsibilities include/i,
        /job description/i, /position description/i,
        /work with/i, /collaborate with/i,
        /\b(manage|develop|create|lead|coordinate|assist|support|maintain|implement|execute|perform|conduct|analyze|prepare|review|ensure|provide|deliver|handle|process)\b/i
      ];
      const hasResponsibilities = responsibilityKeywords.some(pattern => pattern.test(text));

      // Detect qualifications
      const qualificationKeywords = [
        /qualifications?/i, /requirements?/i,
        /\bskills?\b/i, /experience/i,
        /must have/i, /should have/i,
        /what (we're|we are) looking for/i,
        /ideal candidate/i, /you('ll| will) need/i,
        /what you bring/i, /preferred experience/i,
        /minimum requirements/i, /required skills/i
      ];
      const hasQualifications = qualificationKeywords.some(pattern => pattern.test(text));

      // Detect company information
      const companyInfoKeywords = [
        /about (us|the company|our (team|company|organization|mission|culture))/i,
        /who we are/i, /company (overview|description|profile)/i,
        /our story/i, /founded in/i, /we are a/i,
        /our mission/i, /we specialize/i, /we provide/i,
        /leading provider/i
      ];
      const hasCompanyInfo = companyInfoKeywords.some(pattern => pattern.test(text));

      // Check for spelling errors (indicator of unprofessional posting)
      const typoIndicators = [
        /responsibiliit/i, /responsiblities/i, /responsabilities/i,
        /qualfications?/i, /quallifications?/i, /requirments?/i,
        /experiance/i, /recieve/i, /seperate/i, /occured/i,
        /begining/i, /succesful/i, /profesional/i,
        /managment/i, /enviroment/i
      ];
      const typoCount = typoIndicators.filter(pattern => pattern.test(text)).length;
      
      if (typoCount >= 2) {
        reasons.push("🚩 Multiple spelling errors detected");
      }

      // Flag missing essential sections (only for substantial postings)
      if (!hasResponsibilities && text.length > 400) {
        reasons.push("🚩 Missing job responsibilities");
      }
      if (!hasQualifications && text.length > 400) {
        reasons.push("🚩 Missing qualifications/requirements");
      }
      if (!hasCompanyInfo && text.length > 600) {
        reasons.push("🚩 Missing company information");
      }

      // Identify positive signals
      if (text.length > 500 && hasResponsibilities && hasQualifications) {
        reasons.push("✓ Detailed, structured job posting");
      }
      if (/benefits|health insurance|401k|pto|paid time off|dental|vision|retirement/i.test(text)) {
        reasons.push("✓ Benefits mentioned");
      }
      if (/salary range|compensation range|pay range|\$[\d,]+\s*-\s*\$[\d,]+/i.test(text)) {
        reasons.push("✓ Salary range provided");
      }
      if (/interview process|application process|hiring process|next steps/i.test(text)) {
        reasons.push("✓ Clear hiring process outlined");
      }
      if (hasCompanyInfo && /founded|established|since \d{4}|years of experience|industry leader/i.test(text)) {
        reasons.push("✓ Established company background");
      }
      if (/career growth|professional development|training opportunities|advancement/i.test(text)) {
        reasons.push("✓ Career development opportunities");
      }
      if (/work[- ]life balance|flexible schedule|hybrid|remote options/i.test(text)) {
        reasons.push("✓ Work-life balance mentioned");
      }
      if (/contact.*hr|human resources|recruiting team|talent acquisition/i.test(text)) {
        reasons.push("✓ Professional HR contact");
      }

      // Default message if no findings
      if (reasons.length === 0) {
        reasons.push("✓ No red flags detected");
      }
    }

    return { reasons: reasons.slice(0, 8) };
  }

  /* ============================================
     URL VALIDATION
     ============================================ */

  function isJobPage() {
    const pathname = window.location.pathname.toLowerCase();
    return pathname.startsWith('/job-search') || pathname.startsWith('/jobs');
  }

  /* ============================================
     STATE MANAGEMENT
     ============================================ */

  const badgeFor = new WeakMap();
  const detailedBadgeFor = new WeakMap();
  let lastScannedUrl = "";
  let expandAttempted = false;

  function resetForNewRoute() {
    expandAttempted = false;
    lastScannedUrl = location.href;
    const existingBadge = byId(DETAIL_ROOT_ID);
    if (existingBadge?.parentNode) {
      existingBadge.parentNode.removeChild(existingBadge);
    }
  }

  /* ============================================
     TEXT EXTRACTION
     ============================================ */

  function extractText(node) {
    let text = (node.innerText || node.textContent || "").trim();

    // Include text from header elements
    const headers = node.querySelectorAll('strong, b, u, em, h1, h2, h3, h4, h5, h6');
    headers.forEach(header => {
      const headerText = (header.innerText || header.textContent || "").trim();
      if (headerText && !text.includes(headerText)) {
        text += " " + headerText;
      }
    });

    return text;
  }

  /* ============================================
     AUTO-EXPAND FUNCTIONALITY
     ============================================ */

  function autoExpandJobDescription() {
    if (expandAttempted) return false;
    expandAttempted = true;

    const expandSelectors = [
      'button[aria-label*="more" i]',
      'button[aria-label*="expand" i]',
      '[role="button"][aria-expanded="false"]',
      'button[class*="expand" i]',
      'button[class*="more" i]',
      'a[class*="show-more" i]',
      '.show-more-button',
      '.read-more-button'
    ];

    let clicked = false;

    for (const selector of expandSelectors) {
      try {
        const buttons = document.querySelectorAll(selector);
        buttons.forEach(btn => {
          const text = (btn.textContent || btn.getAttribute('aria-label') || '').toLowerCase();
          if (/more|expand|full|complete|entire/i.test(text) && btn.offsetParent !== null) {
            btn.click();
            clicked = true;
          }
        });
      } catch (e) {
        // Silently handle selector errors
      }
    }

    // Check main content area for expand buttons
    const mainContent = document.querySelector('main, [role="main"]');
    if (mainContent) {
      const buttons = Array.from(mainContent.querySelectorAll('button, [role="button"]'));
      buttons.forEach(btn => {
        const text = (btn.textContent || '').trim().toLowerCase();
        if ((text === 'more' || text === 'show more' || text === 'read more' || text === 'see more') && btn.offsetParent !== null) {
          btn.click();
          clicked = true;
        }
      });
    }

    return clicked;
  }

  /* ============================================
     JOB CARD DETECTION
     ============================================ */

  function candidateJobCards() {
    const selectors = [
      '[data-qa*="job" i]',
      '[data-testid*="job" i]',
      'div[class*="JobCard"]',
      'div[class*="job-card"]',
      'div[class*="job-list-item"]',
      'a[href*="/jobs/"]',
      '[role="listitem"]'
    ];

    const cards = new Set();
    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(node => {
          if (node instanceof HTMLElement) {
            cards.add(node);
          }
        });
      } catch (e) {
        // Silently handle selector errors
      }
    });

    return Array.from(cards);
  }

  function isLikelyJobCard(node, text) {
    if (!text || text.length < 40) return false;

    try {
      if (node.matches('[data-qa*="job" i], [data-testid*="job" i], [data-test*="job" i]')) return true;
      if (node.matches('div[class*="JobCard"], div[class*="job-card"], div[class*="job-list-item"]')) return true;
      if (node.matches('a[href*="/jobs/"]')) return true;
      if (node.matches('[role="listitem"]') && /job/i.test(text)) return true;
    } catch (e) {
      // Silently handle matching errors
    }

    const keywordHits = JOB_KEYWORDS.reduce((count, re) => count + (re.test(text) ? 1 : 0), 0);
    return keywordHits >= 2 && text.length < 1000;
  }

  /* ============================================
     MAIN JOB CONTENT DETECTION
     ============================================ */

  function findMainJobContent() {
    const strategies = [
      // Strategy 1: Find within main content area
      () => {
        const main = document.querySelector('main, [role="main"], #main-content');
        if (main) {
          const candidates = Array.from(main.querySelectorAll('div, section, article'))
            .filter(el => {
              const t = extractText(el);
              return t.length > 400 &&
                /responsibilit|qualification|requirement|description/i.test(t) &&
                !el.closest('[class*="sidebar" i], [class*="similar" i], aside') &&
                !el.querySelector('.htc-badge-container');
            })
            .sort((a, b) => extractText(b).length - extractText(a).length);
          return candidates[0] || null;
        }
        return null;
      },

      // Strategy 2: Find by data attributes or class names
      () => {
        const selectors = [
          '[data-testid*="description" i]',
          '[data-qa*="description" i]',
          '[class*="JobDescription" i]',
          '[class*="job-description" i]',
          '[class*="job-details" i]',
          '[class*="JobDetails" i]',
          '[id*="job-description" i]'
        ];
        for (const sel of selectors) {
          try {
            const el = document.querySelector(sel);
            if (el && extractText(el).length > 400 && !el.querySelector('.htc-badge-container')) {
              return el;
            }
          } catch (e) {
            // Continue to next selector
          }
        }
        return null;
      },

      // Strategy 3: Find by proximity to h1
      () => {
        const h1 = document.querySelector('h1');
        if (h1 && /\w{3,}/.test(h1.textContent || "")) {
          const container = h1.closest('article, section, main, div[class*="content" i]');
          if (container && extractText(container).length > 400 && !container.querySelector('.htc-badge-container')) {
            return container;
          }
        }
        return null;
      },

      // Strategy 4: Find largest content block
      () => {
        const candidates = Array.from(document.querySelectorAll('div, section, article'))
          .filter(el => {
            const t = extractText(el);
            const rect = el.getBoundingClientRect?.() || { width: 0 };
            return t.length > 500 && rect.width > 300 &&
              !el.closest('[class*="sidebar" i], [class*="similar" i], [class*="recommendation" i], aside') &&
              !el.querySelector('.htc-badge-container');
          })
          .sort((a, b) => extractText(b).length - extractText(a).length);
        return candidates[0] || null;
      }
    ];

    for (const strategy of strategies) {
      const result = strategy();
      if (result) return result;
    }

    return null;
  }

  /* ============================================
     BADGE RENDERING
     ============================================ */

  function upsertCardBadge(card, result) {
    if (byId(DETAIL_ROOT_ID)) return;

    let badge = badgeFor.get(card);
    if (!badge || !badge.isConnected) {
      badge = document.createElement("span");
      badge.className = SIMPLE_CLASS;
      badge.style.cssText = "display:inline-block;margin:.25rem 0 .25rem .5rem;padding:.2rem .5rem;border-radius:.5rem;font:500 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;vertical-align:middle";

      const titleElement = card.querySelector('h1, h2, h3, h4, [data-testid*="title" i], [data-qa*="title" i], [class*="title" i]');
      (titleElement || card).insertAdjacentElement("afterend", badge);

      badgeFor.set(card, badge);
      card.setAttribute(BADGED_ATTR, "scanned");
    }

    badge.textContent = "Scanned ✓";
    badge.style.backgroundColor = "#64748b";
  }

  function upsertDetailedBadge(container, result) {
    let root = byId(DETAIL_ROOT_ID);
    
    if (!root) {
      root = document.createElement("div");
      root.id = DETAIL_ROOT_ID;
      root.className = "htc-badge-container";

      const anchor = container.querySelector('h1, h2, [data-testid*="title" i], [data-qa*="title" i]') || container;
      anchor.insertAdjacentElement("afterend", root);
      detailedBadgeFor.set(container, root);
    }

    root.innerHTML = `
      <div class="htc-details">
        <div class="htc-details-header">Here's what we found on this job posting:</div>
        <ul class="htc-reasons">
          ${result.reasons.map(r => `<li>${r}</li>`).join("")}
        </ul>
        <div class="htc-disclaimer">
          <span class="htc-disclaimer-icon">⚠️</span>
          <span class="htc-disclaimer-text">This tool provides guidance only. We are not responsible for your decisions when applying to jobs. Our results may be invalid. Always conduct your own research.</span>
        </div>
      </div>
    `;
  }

  /* ============================================
     SCANNING FUNCTIONS
     ============================================ */

  function scanJobCards() {
    const cards = candidateJobCards();

    for (const card of cards) {
      const text = extractText(card);
      if (isLikelyJobCard(card, text)) {
        const result = analyzeJob(text, false);
        upsertCardBadge(card, result);
      }
    }
  }

  function scanDetailedJobPosting() {
    if (byId(DETAIL_ROOT_ID)) return;

    const expanded = autoExpandJobDescription();
    if (expanded) {
      setTimeout(performDetailedScan, 1000);
    } else {
      performDetailedScan();
    }
  }

  function performDetailedScan() {
    if (byId(DETAIL_ROOT_ID)) return;

    const container = findMainJobContent();
    if (!container) return;

    const text = extractText(container);
    if (text.length < 300) return;

    const result = analyzeJob(text, true);
    upsertDetailedBadge(container, result);
  }

  function scanAll() {
    if (!isJobPage()) return;

    if (location.href !== lastScannedUrl) {
      resetForNewRoute();
    }

    scanJobCards();
    scanDetailedJobPosting();
  }

  /* ============================================
     OBSERVERS & EVENT HANDLERS
     ============================================ */

  const debouncedScan = debounce(scanAll, 400);

  // Watch for DOM changes
  const observer = new MutationObserver((mutations) => {
    const hasNewNodes = mutations.some(m => m.addedNodes && m.addedNodes.length > 0);
    if (hasNewNodes) {
      debouncedScan();
    }
  });

  try {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {
    // Silently handle observation errors
  }

  // Handle SPA navigation
  function handleRouteChange() {
    resetForNewRoute();
    debouncedScan();
  }

  (function (history) {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      const result = originalPushState.apply(history, args);
      handleRouteChange();
      return result;
    };

    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(history, args);
      handleRouteChange();
      return result;
    };
  })(window.history);

  window.addEventListener("popstate", handleRouteChange);

  // Poll for URL changes (fallback)
  let lastPolledUrl = location.href;
  setInterval(() => {
    if (location.href !== lastPolledUrl) {
      lastPolledUrl = location.href;
      handleRouteChange();
    }
  }, 700);

  // Listen for manual scan requests from popup
  chrome.runtime?.onMessage?.addListener?.((message, sender, sendResponse) => {
    if (message?.type === "HANDSHAKE_SCAN") {
      scanAll();
      sendResponse?.({ ok: true });
    }
  });

  /* ============================================
     INITIALIZATION
     ============================================ */

  lastScannedUrl = location.href;
  setTimeout(scanAll, 800);

  console.log("[Handshake Trust Checker] Initialized successfully");
})();
