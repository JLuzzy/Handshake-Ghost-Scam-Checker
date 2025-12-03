/* Handshake Trust Checker – auto-scan + no-duplicate detailed badge */
(function () {
  // --- singleton guard ---
  if (window.__HTC_INIT__) return;
  window.__HTC_INIT__ = true;

  // ====== CONFIG / RULES ======
  const RED_FLAGS = [
    // Financial exploitation red flags
    { pattern: /immediate\s*hire/i, name: "Immediate hire pressure", weight: 12 },
    { pattern: /send\s*payment|pay\s*us|payment\s*required/i, name: "Payment request", weight: 20 },
    { pattern: /training\s*fee|course\s*fee|certification\s*fee/i, name: "Training fee required", weight: 20 },
    { pattern: /upfront\s*fee|application\s*fee|processing\s*fee|registration\s*fee/i, name: "Upfront fee required", weight: 20 },
    { pattern: /wire\s*transfer|western\s*union|moneygram/i, name: "Wire transfer mention", weight: 18 },
    { pattern: /gift\s*cards?|prepaid\s*card|itunes|steam\s*card/i, name: "Gift card mention", weight: 18 },
    { pattern: /deposit\s*required|security\s*deposit/i, name: "Deposit required", weight: 18 },
    
    // Unrealistic promises
    { pattern: /work from home and earn thousands|make \$\d+k? from home/i, name: "Unrealistic earnings claim", weight: 15 },
    { pattern: /quick\s*money|easy\s*money|fast\s*cash/i, name: "Quick money promise", weight: 15 },
    { pattern: /no\s*experience\s*(required|needed)|anyone\s*can\s*do/i, name: "No experience required", weight: 8 },
    { pattern: /guaranteed\s*income|guaranteed\s*earnings/i, name: "Guaranteed income claim", weight: 12 },
    { pattern: /\$\d{1,3},?\d{3,}\+?\s*per\s*(week|day)|weekly\s*pay\s*\$\d{3,}/i, name: "Unusually high weekly/daily pay", weight: 10 },
    { pattern: /unlimited\s*earning\s*potential|earn\s*as\s*much\s*as\s*you\s*want/i, name: "Unlimited earnings claim", weight: 10 },
    
    // Evasive communication
    { pattern: /telegram|whatsapp|signal|wickr/i, name: "Unofficial communication channel", weight: 10 },
    { pattern: /contact\s+via\s+dm|direct\s+message|dm\s+me|message\s+me\s+directly/i, name: "DM-only contact", weight: 8 },
    { pattern: /apply\s+via\s+google\s+form|docs\.google\.com\/forms|bit\.ly|tinyurl/i, name: "External application form", weight: 8 },
    { pattern: /personal\s*email|gmail|yahoo|hotmail|outlook\.com/i, name: "Personal email domain", weight: 6 },
    { pattern: /send\s*resume\s*to|email\s*resume\s*to.*@(gmail|yahoo|hotmail)/i, name: "Non-corporate email for applications", weight: 10 },
    
    // Vague or suspicious content
    { pattern: /limited\s*spots?|only\s*\d+\s*positions?|hiring\s*now|act\s*fast/i, name: "Artificial scarcity", weight: 5 },
    { pattern: /no\s*interview\s*required|hire\s*without\s*interview/i, name: "No interview required", weight: 12 },
    { pattern: /work\s*from\s*anywhere|location\s*independent|digital\s*nomad/i, name: "Overly flexible location", weight: 4 },
    { pattern: /mystery\s*shopper|secret\s*shopper|product\s*tester/i, name: "Common scam job title", weight: 10 },
    { pattern: /package\s*forwarding|reshipping|parcel\s*receiving/i, name: "Package forwarding (common scam)", weight: 15 },
    { pattern: /data\s*entry.*work.*home|envelope\s*stuffing/i, name: "Classic scam job type", weight: 12 },
    
    // Crypto/MLM red flags
    { pattern: /crypto(?:currency)?|bitcoin|blockchain\s*opportunity/i, name: "Cryptocurrency mention", weight: 8 },
    { pattern: /multi[-\s]?level|mlm|network\s*marketing|pyramid/i, name: "MLM/pyramid scheme language", weight: 15 },
    { pattern: /recruit.*friends|bring.*team|referral\s*bonus/i, name: "Recruitment-focused", weight: 10 },
    { pattern: /be\s*your\s*own\s*boss|entrepreneur\s*opportunity/i, name: "Vague entrepreneurship pitch", weight: 6 },
    
    // Identity theft risks
    { pattern: /social\s*security|ssn|driver'?s?\s*license.*upfront|copy\s*of\s*id\s*card/i, name: "Requesting sensitive documents upfront", weight: 15 },
    { pattern: /credit\s*check\s*fee|background\s*check\s*fee/i, name: "Fee for background check", weight: 12 },
  ];

  const JOB_KEYWORDS = [
    /responsibil/i, /qualification/i, /requirement/i, /preferred/i, /benefits?/i,
    /job description/i, /application deadline/i, /what you'll do/i, /who you are/i, /about the role/i, /apply now/i
  ];

  // ====== UTILS ======
  const byId = (id) => document.getElementById(id);
  const textOf = (n) => (n?.innerText || n?.textContent || "").trim();
  const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const DETAIL_ROOT_ID = "htc-detailed-badge-root";
  const SIMPLE_CLASS = "htc-badge htc-badge-simple";
  const BADGED_ATTR = "data-htc";

  function analyzeJob(jobText, includeReasons = false) {
    let score = 100;
    const reasons = [];
    const text = (jobText || "").toLowerCase();

    RED_FLAGS.forEach(flag => {
      if (flag.pattern.test(text)) {
        score -= flag.weight;
        if (includeReasons) reasons.push(`🚩 ${flag.name}`);
      }
    });

    if (text.length < 120) { score -= 10; if (includeReasons) reasons.push("🚩 Suspiciously short description"); }
    const capsWords = jobText.match(/[A-Z]{3,}/g) || [];
    if (capsWords.length > 15) { score -= 4; if (includeReasons) reasons.push("🚩 Excessive use of capital letters"); }

    if (includeReasons) {
      // Enhanced detection for responsibilities - including common misspellings
      const responsibilityKeywords = [
        /responsibilit/i,
        /responsibiliit/i,        // Common typo: double 'i'
        /responsiblities/i,       // Common typo: missing 'i'
        /responsabilities/i,      // Common typo: 'a' instead of 'i'
        /\bduties\b/i,
        /\bduty\b/i,
        /what you('ll| will) do/i,
        /your role/i,
        /day[- ]?to[- ]?day/i,
        /daily tasks/i,
        /key tasks/i,
        /main tasks/i,
        /job functions?/i,
        /primary duties/i,
        /core duties/i
      ];
      const hasResponsibilities = responsibilityKeywords.some(pattern => pattern.test(text));
      
      // Enhanced detection for qualifications - including common misspellings
      const qualificationKeywords = [
        /qualifications?/i,
        /qualfications?/i,         // Common typo: missing 'i'
        /quallifications?/i,       // Common typo: double 'l'
        /requirements?/i,
        /requirments?/i,          // Common typo: missing 'e'
        /\bskills?\b/i,
        /\bskils?\b/i,            // Common typo: single 'l'
        /experience/i,
        /experiance/i,            // Common typo: 'a' instead of 'e'
        /must have/i,
        /should have/i,
        /what (we're|we are) looking for/i,
        /ideal candidate/i,
        /you('ll| will) need/i,
        /what you bring/i,
        /preferred experience/i
      ];
      const hasQualifications = qualificationKeywords.some(pattern => pattern.test(text));
      
      // Enhanced detection for company info - including common misspellings
      const companyInfoKeywords = [
        /about (us|the company|our (team|company|organization|mission|culture))/i,
        /who we are/i,
        /company (overview|description|profile)/i,
        /our story/i
      ];
      const hasCompanyInfo = companyInfoKeywords.some(pattern => pattern.test(text));

      // Check for excessive typos/misspellings as a red flag itself
      const typoIndicators = [
        /responsibiliit/i,
        /responsiblities/i,
        /responsabilities/i,
        /qualfications?/i,
        /quallifications?/i,
        /requirments?/i,
        /experiance/i,
        /\bskils?\b/i,
        /recieve/i,              // receive misspelled
        /seperate/i,             // separate misspelled
        /occured/i,              // occurred misspelled
        /begining/i,             // beginning misspelled
        /succesful/i,            // successful misspelled
        /profesional/i,          // professional misspelled
        /managment/i,            // management misspelled
        /enviroment/i            // environment misspelled
      ];
      
      const typoCount = typoIndicators.filter(pattern => pattern.test(text)).length;
      if (typoCount >= 2) {
        score -= 6;
        reasons.push("🚩 Multiple spelling errors detected");
      }

      // Add debug logging
      console.log('[HTC] Detection Results:', { hasResponsibilities, hasQualifications, hasCompanyInfo, typoCount, textLength: text.length });

      if (!hasResponsibilities && text.length > 200) { score -= 8; reasons.push("🚩 Missing job responsibilities"); }
      if (!hasQualifications && text.length > 200) { score -= 8; reasons.push("🚩 Missing qualifications/requirements"); }
      if (!hasCompanyInfo && text.length > 300) { score -= 5; reasons.push("🚩 Missing company information"); }

      if (text.length > 500 && hasResponsibilities && hasQualifications) reasons.push("✓ Detailed, structured job posting");
      if (/benefits|health insurance|401k|pto|paid time off/i.test(text)) reasons.push("✓ Benefits mentioned");
      if (/equal opportunity employer|eeo|diversity/i.test(text)) reasons.push("✓ Professional EEO statement");
      if (reasons.length === 0) reasons.push("✓ No red flags detected");
    }

    const finalScore = Math.max(0, Math.min(100, score));
    const label = finalScore >= 80 ? "High Trust" : finalScore >= 50 ? "Medium Trust" : "Low Trust";
    const color = finalScore >= 80 ? "#16a34a" : finalScore >= 50 ? "#f59e0b" : "#dc2626";
    return { score: finalScore, label, color, reasons: reasons.slice(0, 6) };
  }

  // ====== STATE ======
  const badgeFor = new WeakMap();
  const detailedBadgeFor = new WeakMap();
  let lastScannedUrl = "";
  let expandAttempted = false;

  function resetForNewRoute() {
    expandAttempted = false;
    lastScannedUrl = location.href;
    const old = byId(DETAIL_ROOT_ID);
    if (old?.parentNode) old.parentNode.removeChild(old);
  }

  function extractText(node) {
    // Get all text content including from child elements
    let text = (node.innerText || node.textContent || "").trim();
    
    // Also check for text in strong, b, u, em tags that might be headers
    const headers = node.querySelectorAll('strong, b, u, em, h1, h2, h3, h4, h5, h6');
    headers.forEach(header => {
      const headerText = (header.innerText || header.textContent || "").trim();
      if (headerText && !text.includes(headerText)) {
        text += " " + headerText;
      }
    });
    
    return text;
  }

  // ====== AUTO-EXPAND ======
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
            console.log('[HTC] Auto-clicking expand button:', text);
            btn.click();
            clicked = true;
          }
        });
      } catch (e) {}
    }

    const mainContent = document.querySelector('main, [role="main"]');
    if (mainContent) {
      const buttons = Array.from(mainContent.querySelectorAll('button, [role="button"]'));
      buttons.forEach(btn => {
        const text = (btn.textContent || '').trim().toLowerCase();
        if ((text === 'more' || text === 'show more' || text === 'read more' || text === 'see more') && btn.offsetParent !== null) {
          console.log('[HTC] Auto-clicking expand button in main:', text);
          btn.click();
          clicked = true;
        }
      });
    }

    return clicked;
  }

  // ====== DETECTION ======
  function candidateJobCards() {
    const selectors = [
      '[data-qa*="job" i]','[data-testid*="job" i]','div[class*="JobCard"]','div[class*="job-card"]',
      'div[class*="job-list-item"]','a[href*="/jobs/"]','[role="listitem"]'
    ];
    const set = new Set();
    selectors.forEach(sel => {
      try { document.querySelectorAll(sel).forEach(node => { if (node instanceof HTMLElement) set.add(node); }); } catch {}
    });
    return Array.from(set);
  }

  function isLikelyJobCard(node, text) {
    if (!text || text.length < 40) return false;
    try {
      if (node.matches('[data-qa*="job" i], [data-testid*="job" i], [data-test*="job" i]')) return true;
      if (node.matches('div[class*="JobCard"], div[class*="job-card"], div[class*="job-list-item"]')) return true;
      if (node.matches('a[href*="/jobs/"]')) return true;
      if (node.matches('[role="listitem"]') && /job/i.test(text)) return true;
    } catch {}
    const hits = JOB_KEYWORDS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);
    return hits >= 2 && text.length < 1000;
  }

  function findMainJobContent() {
    const strategies = [
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
      () => {
        const sels = [
          '[data-testid*="description" i]','[data-qa*="description" i]','[class*="JobDescription" i]',
          '[class*="job-description" i]','[class*="job-details" i]','[class*="JobDetails" i]','[id*="job-description" i]'
        ];
        for (const sel of sels) {
          try {
            const el = document.querySelector(sel);
            if (el && extractText(el).length > 400 && !el.querySelector('.htc-badge-container')) return el;
          } catch {}
        }
        return null;
      },
      () => {
        const h1 = document.querySelector('h1');
        if (h1 && /\w{3,}/.test(h1.textContent || "")) {
          const container = h1.closest('article, section, main, div[class*="content" i]');
          if (container && extractText(container).length > 400 && !container.querySelector('.htc-badge-container')) return container;
        }
        return null;
      },
      () => {
        const all = Array.from(document.querySelectorAll('div, section, article'))
          .filter(el => {
            const t = extractText(el);
            const r = el.getBoundingClientRect?.() || { width: 0 };
            return t.length > 500 && r.width > 300 &&
                   !el.closest('[class*="sidebar" i], [class*="similar" i], [class*="recommendation" i], aside') &&
                   !el.querySelector('.htc-badge-container');
          })
          .sort((a, b) => extractText(b).length - extractText(a).length);
        return all[0] || null;
      }
    ];
    for (const s of strategies) { const res = s(); if (res) return res; }
    return null;
  }

  // ====== RENDER (idempotent) ======
  function upsertCardBadge(card, result) {
    if (byId(DETAIL_ROOT_ID)) return;

    let badge = badgeFor.get(card);
    if (!badge || !badge.isConnected) {
      badge = document.createElement("span");
      badge.className = SIMPLE_CLASS;
      badge.style.cssText = "display:inline-block;margin:.25rem 0 .25rem .5rem;padding:.2rem .5rem;border-radius:.5rem;font:500 12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;vertical-align:middle";
      const head = card.querySelector('h1, h2, h3, h4, [data-testid*="title" i], [data-qa*="title" i], [class*="title" i]');
      (head || card).insertAdjacentElement("afterend", badge);
      badgeFor.set(card, badge);
      card.setAttribute(BADGED_ATTR, "scanned");
      card.setAttribute("data-htc-score", String(result.score));
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

  // ====== SCANS ======
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
    if (byId(DETAIL_ROOT_ID)) {
      console.log('[HTC] Detailed badge already exists, skipping');
      return;
    }
    
    const expanded = autoExpandJobDescription();
    if (expanded) {
      console.log('[HTC] Content expanded, waiting 1 second for full load...');
      setTimeout(() => {
        performDetailedScan();
      }, 1000);
    } else {
      performDetailedScan();
    }
  }

  function performDetailedScan() {
    if (byId(DETAIL_ROOT_ID)) {
      console.log('[HTC] Badge exists, skipping performDetailedScan');
      return;
    }
    
    const container = findMainJobContent();
    if (!container) return;
    const text = extractText(container);
    console.log(`[HTC] Scanning ${text.length} characters of content`);
    if (text.length < 300) return;
    const result = analyzeJob(text, true);
    upsertDetailedBadge(container, result);
  }

  function scanAll() {
    if (location.href !== lastScannedUrl) resetForNewRoute();
    scanJobCards();
    scanDetailedJobPosting();
  }

  // ====== OBSERVER ======
  const debScan = debounce(scanAll, 400);
  const observer = new MutationObserver((muts) => {
    let added = false;
    for (const m of muts) { if (m.addedNodes && m.addedNodes.length) { added = true; break; } }
    if (added) debScan();
  });
  try { observer.observe(document.documentElement, { childList: true, subtree: true }); } catch {}

  // ====== SPA ROUTE HOOKS ======
  function routeChanged() { resetForNewRoute(); debScan(); }
  (function (history) {
    const push = history.pushState, replace = history.replaceState;
    history.pushState = function (...a) { const r = push.apply(history, a); routeChanged(); return r; };
    history.replaceState = function (...a) { const r = replace.apply(history, a); routeChanged(); return r; };
  })(window.history);
  window.addEventListener("popstate", routeChanged);

  let hrefPoll = location.href;
  setInterval(() => {
    if (location.href !== hrefPoll) { hrefPoll = location.href; routeChanged(); }
  }, 700);

  // ====== POPUP MESSAGE ======
  chrome.runtime?.onMessage?.addListener?.((msg, _sender, sendResponse) => {
    if (msg?.type === "HANDSHAKE_SCAN") {
      scanAll();
      sendResponse?.({ ok: true });
    }
  });

  // ====== INITIAL ======
  lastScannedUrl = location.href;
  setTimeout(scanAll, 800);

  console.log("[HTC] Handshake Trust Checker: auto-scan + dedupe initialized");
})();
