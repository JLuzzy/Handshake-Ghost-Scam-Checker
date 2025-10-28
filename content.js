/* Handshake Trust Checker content script */
/*
what up




*/

(function() {
  const RED_FLAGS = [
    {
      pattern: /immediate\s*hire/i,
      deduction: 12,
      reason: "Promises immediate hire"
    },
    {
      pattern: /no\s*experience\s*required/i,
      deduction: 10,
      reason: "Says no experience is required"
    },
    {
      pattern: /work from home and earn thousands/i,
      deduction: 12,
      reason: "Overhypes work-from-home earnings"
    },
    {
      pattern: /send\s*payment/i,
      deduction: 16,
      reason: "Asks you to send money"
    },
    {
      pattern: /training\s*fee/i,
      deduction: 14,
      reason: "Mentions paying a training fee"
    },
    {
      pattern: /quick\s*money/i,
      deduction: 10,
      reason: "Promises quick money"
    },
    {
      pattern: /wire\s*transfer/i,
      deduction: 12,
      reason: "Requests a wire transfer"
    },
    {
      pattern: /gift\s*cards?/i,
      deduction: 14,
      reason: "Requests payment via gift cards"
    },
    {
      pattern: /telegram|whatsapp|signal/i,
      deduction: 18,
      reason: "Directs you to encrypted messengers"
    },
    {
      pattern: /crypto(?:currency)?/i,
      deduction: 12,
      reason: "References cryptocurrency payments"
    },
    {
      pattern: /upfront\s*fee/i,
      deduction: 16,
      reason: "Mentions an upfront fee"
    }
  ];

  const HEURISTICS = [
    {
      test: (text) => text.length < 120,
      deduction: 10,
      reason: "Description is unusually short"
    },
    {
      test: (text) => /\$?\s*\d{1,3},?\d{3,}/.test(text) && /per\s*week|daily|day/.test(text),
      deduction: 10,
      reason: "Promises abnormally high short-term pay"
    },
    {
      test: (text) => /apply\s+via\s+google\s+form|docs\.google\.com\/forms/i.test(text),
      deduction: 8,
      reason: "Sends you to a Google Form application"
    },
    {
      test: (text) => /contact\s+via\s+dm|direct\s+message/.test(text),
      deduction: 6,
      reason: "Requests contact over direct message"
    },
    {
      test: (text) => (text.match(/[A-Z]{3,}/g) || []).length > 15,
      deduction: 4,
      reason: "Uses excessive all-caps text"
    }
  ];

  const SECTION_EXCLUDE_PATTERNS = /(similar jobs|recommended jobs|more jobs like this|people also viewed|other opportunities)/i;
  const JOB_PATH_PATTERNS = [
    /\/jobs\b/i,
    /\/job\b/i,
    /\/stu\/jobs\//i,
    /\/stu\/postings\//i,
    /\/postings\//i
  ];

  function analyzeJob(jobText) {
    let score = 100;
    const text = jobText.toLowerCase();
    const reasons = [];

    RED_FLAGS.forEach(({ pattern, deduction, reason }) => {
      if (pattern.test(text)) {
        score -= deduction;
        reasons.push(reason);
      }
    });

    HEURISTICS.forEach(({ test, deduction, reason }) => {
      if (test(text)) {
        score -= deduction;
        reasons.push(reason);
      }
    });

    score = Math.max(0, Math.min(100, score));

    const label = score >= 80 ? "High Trust"
                : score >= 50 ? "Medium Trust"
                : "Low Trust";
    const color = score >= 80 ? "#16a34a"
                : score >= 50 ? "#f59e0b"
                : "#dc2626";
    return { score, label, color, reasons };
  }

  const badgeFor = new WeakMap();
  const BADGE_CLASS = "htc-badge";
  const STATUS_CLASS = "htc-status";
  const STATUS_VISIBLE_CLASS = "htc-status--visible";
  const STATUS_SPINNING_CLASS = "htc-status--spinning";
  const STATUS_TEXT_CLASS = "htc-status__text";
  const EXTENSION_ATTR = "data-htc-extension";
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

  function markCard(card, result) {
    let badge = badgeFor.get(card);
    if (!badge || !badge.isConnected) {
      badge = document.createElement("span");
      badge.className = BADGE_CLASS;
      badge.setAttribute(EXTENSION_ATTR, "");
      badgeFor.set(card, badge);

      const heading = card.querySelector(
        'h1, h2, h3, [data-testid*="title" i], [data-qa*="title" i]'
      );
      if (heading) {
        badge.classList.add("htc-badge-inline");
        heading.insertAdjacentElement("afterend", badge);
      } else {
        card.appendChild(badge);
      }
      card.style.scrollMarginTop = "96px";
    }

    badge.setAttribute(EXTENSION_ATTR, "");
    badge.textContent = `${result.label} (${result.score})`;
    badge.style.backgroundColor = result.color;
    badge.title = result.reasons.length
      ? result.reasons.join(" · ")
      : "No major red flags detected";
    card.setAttribute("data-htc", result.label);
    card.setAttribute("data-htc-score", String(result.score));
  }

  let statusHideTimer = 0;
  function ensureStatusIndicator() {
    let indicator = document.querySelector(`.${STATUS_CLASS}`);
    if (!(indicator instanceof HTMLElement)) {
      indicator = document.createElement("div");
      indicator.className = STATUS_CLASS;
      indicator.setAttribute(EXTENSION_ATTR, "");
      indicator.setAttribute("role", "status");
      indicator.setAttribute("aria-live", "polite");

      const text = document.createElement("span");
      text.className = STATUS_TEXT_CLASS;
      text.setAttribute(EXTENSION_ATTR, "");
      indicator.appendChild(text);

      (document.body || document.documentElement).appendChild(indicator);
    }

    const textEl = indicator.querySelector(`.${STATUS_TEXT_CLASS}`);
    return { indicator, textEl };
  }

  function hideStatusIndicator() {
    const indicator = document.querySelector(`.${STATUS_CLASS}`);
    if (!(indicator instanceof HTMLElement)) return;
    if (statusHideTimer) {
      clearTimeout(statusHideTimer);
      statusHideTimer = 0;
    }
    indicator.classList.remove(STATUS_VISIBLE_CLASS);
    indicator.classList.remove(STATUS_SPINNING_CLASS);
  }

  function showStatus(message, { spinning = false, hold = 2000 } = {}) {
    const { indicator, textEl } = ensureStatusIndicator();
    if (statusHideTimer) {
      clearTimeout(statusHideTimer);
      statusHideTimer = 0;
    }

    if (textEl) textEl.textContent = message;
    indicator.classList.add(STATUS_VISIBLE_CLASS);
    indicator.classList.toggle(STATUS_SPINNING_CLASS, spinning);

    if (!spinning) {
      statusHideTimer = window.setTimeout(() => {
        indicator.classList.remove(STATUS_VISIBLE_CLASS);
      }, hold);
    }
  }

  function extractText(node) {
    if (!(node instanceof HTMLElement)) return "";
    if (!node.isConnected) return "";

    // Prefer innerText to include visible text only
    const raw = (node.innerText || node.textContent || "").trim();
    if (!raw) return "";

    const BREAK_PATTERNS = [
      /(^|\n)\s*similar jobs\b/i,
      /(^|\n)\s*recommended jobs\b/i,
      /(^|\n)\s*people also viewed\b/i,
      /(^|\n)\s*more jobs like this\b/i,
      /(^|\n)\s*other opportunities\b/i
    ];

    let sanitized = raw;
    BREAK_PATTERNS.forEach(re => {
      const idx = sanitized.search(re);
      if (idx !== -1) {
        sanitized = sanitized.slice(0, idx);
      }
    });

    return sanitized.trim();
  }

  function isLikelyJobNode(node, text) {
    if (!text || text.length < 40) return false;

    if (isInExcludedSection(node)) return false;

    if (node.matches('[data-qa*="job" i], [data-testid*="job" i], [data-test*="job" i]')) return true;
    if (node.matches('div[class*="JobCard"], div[class*="job-card"], div[class*="JobDetails"]')) return true;
    if (node.matches('a[href*="/jobs/"]')) return true;
    if (node.getAttribute("role") === "link" && /jobs\//i.test(node.getAttribute("aria-label") || "")) return true;

    const keywordHits = JOB_KEYWORDS.reduce((acc, re) => acc + (re.test(text) ? 1 : 0), 0);
    if (keywordHits >= 2) return true;
    if (text.length > 320 && keywordHits >= 1) return true;

    if (node.querySelector('[data-testid*="description" i], [data-qa*="description" i]')) return true;

    return Boolean(node.dataset && (node.dataset.jobId || node.dataset.jobid));
  }

  function isInExcludedSection(node) {
    let current = node;
    while (current && current !== document.body) {
      const label = [
        current.getAttribute && current.getAttribute("data-testid"),
        current.getAttribute && current.getAttribute("data-qa"),
        current.getAttribute && current.getAttribute("aria-label"),
        current.id,
        typeof current.className === "string" ? current.className : ""
      ].filter(Boolean).join(" ");

      if (SECTION_EXCLUDE_PATTERNS.test(label)) {
        return true;
      }

      const heading = current.previousElementSibling;
      if (heading && heading.matches && heading.matches('h1, h2, h3, h4, h5')) {
        const headingText = heading.textContent || "";
        if (SECTION_EXCLUDE_PATTERNS.test(headingText)) {
          return true;
        }
      }

      current = current.parentElement;
    }

    return false;
  }

  const lastContentForNode = new WeakMap();

  function candidateNodes(primaryCandidate) {
    const selectors = [
      '[data-testid*="job-details" i]',
      '[data-testid*="job-view" i]',
      '[data-testid*="view-job" i]',
      '[data-testid*="viewjob" i]',
      '[data-testid*="job-body" i]',
      '[data-qa*="job-details" i]',
      '[data-qa*="view-job" i]',
      '[data-qa*="viewjob" i]',
      '[data-qa*="job-body" i]',
      'main [data-testid*="job" i]',
      'main [data-qa*="job" i]',
      'div[class*="JobCard"]',
      'div[class*="job-card"]',
      'div[class*="JobDetails"]',
      'div[class*="ViewJob"]',
      'div[class*="jobBody"]',
      'article[data-testid*="job" i]',
      'section[data-testid*="job" i]',
      'a[href*="/jobs/"]',
      'div[role="link"][data-job-id]'
    ];

    const set = new Set();
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(node => {
        if (node instanceof HTMLElement) set.add(node);
      });
    });

    if (primaryCandidate) {
      set.add(primaryCandidate);
    }

    document.querySelectorAll('h1, h2').forEach(heading => {
      if (!/job/i.test(heading.textContent || "")) return;
      const container = heading.closest('article, section, main, div');
      if (container && container instanceof HTMLElement) set.add(container);
    });

    return Array.from(set);
  }

  function scanJobs() {
    if (!isJobContext()) {
      const path = location.pathname || "";
      if (JOB_PATH_PATTERNS.some(re => re.test(path))) {
        showStatus("Waiting for job posting…", { spinning: true });
      } else {
        hideStatusIndicator();
      }
      return;
    }

    showStatus("Scanning…", { spinning: true });

    let markedCount = 0;

    const primary = findPrimaryJobContainer({ minimumText: 32 });
    const nodes = candidateNodes(primary);
    const MAX_ANALYZED_PER_SCAN = 6;

    nodes.some(node => {
      if (isInExcludedSection(node)) return false;
      const text = extractText(node);
      if (!isLikelyJobNode(node, text)) return;
      if (!text) return;

      if (lastContentForNode.get(node) === text) {
        if (badgeFor.get(node)) {
          markedCount += 1;
        }
        return false;
      }

      const result = analyzeJob(text);
      markCard(node, result);
      lastContentForNode.set(node, text);
      markedCount += 1;
      if (markedCount >= MAX_ANALYZED_PER_SCAN) {
        return true;
      }
      return false;
    });

    if (!markedCount) {
      const fallback = primary || findPrimaryJobContainer({ minimumText: 20 });
      if (fallback) {
        const text = extractText(fallback);
        if (text) {
          const result = analyzeJob(text);
          markCard(fallback, result);
          lastContentForNode.set(fallback, text);
          markedCount += 1;
        }
      }
    }

    const summary = markedCount
      ? (markedCount === 1
          ? "Scan complete — rated 1 posting"
          : `Scan complete — rated ${markedCount} postings`)
      : "Scan complete — no job content found";

    requestAnimationFrame(() => {
      showStatus(summary, { hold: 2200 });
    });
  }

  function isJobContext() {
    const dataset = document.body?.dataset || {};
    const datasetValues = Object.values(dataset).join(" ");
    if (/\bjob\b/i.test(datasetValues)) {
      return true;
    }

    const path = location.pathname || "";
    if (JOB_PATH_PATTERNS.some(re => re.test(path))) {
      return true;
    }

    if (document.querySelector('[data-testid*="job" i], [data-qa*="job" i], [data-test*="job" i], [data-testid*="view-job" i], [data-testid*="viewjob" i], [data-testid*="job-body" i], [data-qa*="view-job" i], [data-qa*="viewjob" i], [data-qa*="job-body" i]')) {
      return true;
    }

    const metaType = document.querySelector('meta[property="og:type"], meta[name="og:type"], meta[name="handshake-job-id"], meta[property="handshake:job-id"]');
    const metaContent = metaType?.getAttribute("content") || metaType?.content || "";
    if (/job|posting/i.test(metaContent)) {
      return true;
    }

    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of ldScripts) {
      try {
        const text = script.textContent || "";
        if (text && /JobPosting/i.test(text)) {
          return true;
        }
      } catch (err) {
        // ignore JSON parse issues
      }
    }

    const primary = findPrimaryJobContainer({ minimumText: 24 });
    if (primary) {
      const text = extractText(primary);
      if (text.length >= 60) {
        return true;
      }
    }

    return false;
  }

  let scanTimer = 0;
  const SCAN_DEBOUNCE_MS = 180;
  function scheduleScan(options = {}) {
    const { immediate = false } = options;
    if (scanTimer) {
      clearTimeout(scanTimer);
      scanTimer = 0;
    }

    if (immediate) {
      scanJobs();
      return;
    }

    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scanJobs();
    }, SCAN_DEBOUNCE_MS);
  }

  function findPrimaryJobContainer(options = {}) {
    const { minimumText = 40 } = options;
    const selectors = [
      '[data-testid*="job-details" i]',
      '[data-testid*="job-view" i]',
      '[data-testid*="view-job" i]',
      '[data-testid*="viewjob" i]',
      '[data-testid*="job-body" i]',
      '[data-qa*="job-details" i]',
      '[data-qa*="view-job" i]',
      '[data-qa*="viewjob" i]',
      '[data-qa*="job-body" i]',
      '[role="main"] article',
      '[role="main"] section',
      '[role="main"]',
      'main article',
      'main section',
      'main',
      'article'
    ];

    for (const sel of selectors) {
      const node = document.querySelector(sel);
      if (node && node instanceof HTMLElement && !isInExcludedSection(node)) {
        const text = extractText(node);
        if (text.length >= minimumText) {
          return node;
        }
      }
    }

    return null;
  }

  // Observe SPA updates
  const observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (!m.addedNodes || !m.addedNodes.length) {
        continue;
      }

      const meaningful = Array.from(m.addedNodes).some(node => {
        return node.nodeType === Node.ELEMENT_NODE && !(node instanceof HTMLElement && node.hasAttribute(EXTENSION_ATTR));
      });

      if (meaningful) {
        scheduleScan();
        break;
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Listen for manual trigger from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "HANDSHAKE_SCAN") {
      scheduleScan({ immediate: true });
      sendResponse({ ok: true });
    }
  });

  // Initial scan after load
  setTimeout(() => scheduleScan({ immediate: true }), 420);
  scheduleScan();
})();
