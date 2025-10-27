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
      badge.className = "htc-badge";
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

    badge.textContent = `${result.label} (${result.score})`;
    badge.style.backgroundColor = result.color;
    badge.title = result.reasons.length
      ? result.reasons.join(" · ")
      : "No major red flags detected";
    card.setAttribute("data-htc", result.label);
    card.setAttribute("data-htc-score", String(result.score));
  }

  function extractText(node) {
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

  function candidateNodes() {
    const selectors = [
      '[data-qa*="job" i]',
      '[data-testid*="job" i]',
      '[data-test*="job" i]',
      'div[class*="JobCard"]',
      'div[class*="job-card"]',
      'div[class*="JobDetails"]',
      'article',
      'section',
      'main',
      '[role="listitem"]',
      'a[href*="/jobs/"]',
      'div[role="link"][data-job-id]'
    ];

    const set = new Set();
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(node => {
        if (node instanceof HTMLElement) set.add(node);
      });
    });

    document.querySelectorAll('h1, h2').forEach(heading => {
      if (!/job/i.test(heading.textContent || "")) return;
      const container = heading.closest('article, section, main, div');
      if (container && container instanceof HTMLElement) set.add(container);
    });

    return Array.from(set);
  }

  function scanJobs() {
    let foundAny = false;

    candidateNodes().forEach(node => {
      const text = extractText(node);
      if (!isLikelyJobNode(node, text)) return;
      if (!text) return;
      const result = analyzeJob(text);
      markCard(node, result);
      foundAny = true;
    });

    if (!foundAny) {
      const fallback = findPrimaryJobContainer();
      if (fallback) {
        const text = extractText(fallback);
        if (text) {
          const result = analyzeJob(text);
          markCard(fallback, result);
        }
      }
    }
  }

  function findPrimaryJobContainer() {
    const selectors = [
      '[data-testid*="job-details" i]',
      '[data-testid*="job-view" i]',
      '[data-qa*="job-details" i]',
      'main article',
      'main section',
      'main',
      'article'
    ];

    for (const sel of selectors) {
      const node = document.querySelector(sel);
      if (node && node instanceof HTMLElement && !isInExcludedSection(node)) {
        const text = extractText(node);
        if (text.length >= 40) {
          return node;
        }
      }
    }

    return null;
  }

  // Observe SPA updates
  const observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) {
        scanJobs();
        break;
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Listen for manual trigger from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "HANDSHAKE_SCAN") {
      scanJobs();
      sendResponse({ ok: true });
    }
  });

  // Initial scan after load
  setTimeout(scanJobs, 600);
})();
