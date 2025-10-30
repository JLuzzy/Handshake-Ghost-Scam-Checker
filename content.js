/* Handshake Trust Checker content script */

(function() {
  const RED_FLAGS = [
    { pattern: /immediate\s*hire/i, name: "Immediate hire pressure", weight: 12 },
    { pattern: /no\s*experience\s*(required|needed)/i, name: "No experience required", weight: 8 },
    { pattern: /work from home and earn thousands/i, name: "Unrealistic earnings claim", weight: 15 },
    { pattern: /send\s*payment/i, name: "Payment request", weight: 20 },
    { pattern: /training\s*fee/i, name: "Training fee required", weight: 20 },
    { pattern: /quick\s*money|easy\s*money/i, name: "Quick money promise", weight: 15 },
    { pattern: /wire\s*transfer/i, name: "Wire transfer mention", weight: 18 },
    { pattern: /gift\s*cards?/i, name: "Gift card mention", weight: 18 },
    { pattern: /telegram|whatsapp|signal/i, name: "Unofficial communication channel", weight: 10 },
    { pattern: /crypto(?:currency)?/i, name: "Cryptocurrency mention", weight: 8 },
    { pattern: /upfront\s*fee|application\s*fee/i, name: "Upfront fee required", weight: 20 },
    { pattern: /apply\s+via\s+google\s+form|docs\.google\.com\/forms/i, name: "External application form", weight: 8 },
    { pattern: /contact\s+via\s+dm|direct\s+message/i, name: "DM-only contact", weight: 6 },
    { pattern: /\$\d{1,3},?\d{3,}\+?\s*per\s*(week|day)/i, name: "Unusually high weekly/daily pay", weight: 10 },
    { pattern: /limited\s*spots?|only\s*\d+\s*positions?/i, name: "Artificial scarcity", weight: 5 }
  ];

  function analyzeJob(jobText, includeReasons = false) {
    let score = 100;
    const reasons = [];
    const text = jobText.toLowerCase();

    // Check red flags
    RED_FLAGS.forEach(flag => {
      if (flag.pattern.test(text)) {
        score -= flag.weight;
        if (includeReasons) {
          reasons.push(`-${flag.weight}: ${flag.name}`);
        }
      }
    });

    // Very short description
    if (text.length < 120) {
      score -= 10;
      if (includeReasons) reasons.push("-10: Suspiciously short description");
    }

    // Excessive caps
    const capsWords = text.match(/[A-Z]{3,}/g) || [];
    if (capsWords.length > 15) {
      score -= 4;
      if (includeReasons) reasons.push("-4: Excessive use of capital letters");
    }

    if (includeReasons) {
      // Missing key sections
      const hasResponsibilities = /responsibilit|duties|what you('ll| will) do/i.test(text);
      const hasQualifications = /qualification|requirement|skills|experience/i.test(text);
      const hasCompanyInfo = /about (us|the company|our (team|company))/i.test(text);
      
      if (!hasResponsibilities && text.length > 200) {
        score -= 8;
        reasons.push("-8: Missing job responsibilities");
      }
      if (!hasQualifications && text.length > 200) {
        score -= 8;
        reasons.push("-8: Missing qualifications/requirements");
      }
      if (!hasCompanyInfo && text.length > 300) {
        score -= 5;
        reasons.push("-5: Missing company information");
      }

      // Positive signals
      if (text.length > 500 && hasResponsibilities && hasQualifications) {
        reasons.push("✓ Detailed, structured job posting");
      }
      if (/benefits|health insurance|401k|pto|paid time off/i.test(text)) {
        reasons.push("✓ Benefits mentioned");
      }
      if (/equal opportunity employer|eeo|diversity/i.test(text)) {
        reasons.push("✓ Professional EEO statement");
      }

      if (reasons.length === 0) {
        reasons.push("✓ No red flags detected");
      }
    }

    const finalScore = Math.max(0, Math.min(100, score));
    const label = finalScore >= 80 ? "High Trust"
                : finalScore >= 50 ? "Medium Trust"
                : "Low Trust";
    const color = finalScore >= 80 ? "#16a34a"
                : finalScore >= 50 ? "#f59e0b"
                : "#dc2626";
    
    return { score: finalScore, label, color, reasons: reasons.slice(0, 6) };
  }

  const badgeFor = new WeakMap();
  const detailedBadgeFor = new WeakMap();
  
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

  // Simple badge for job cards in list view
  function markCard(card, result) {
    if (badgeFor.has(card) && badgeFor.get(card).isConnected) {
      return; // Already has a badge
    }

    const badge = document.createElement("span");
    badge.className = "htc-badge htc-badge-simple";
    badge.textContent = `${result.label} (${result.score})`;
    badge.style.backgroundColor = result.color;
    badgeFor.set(card, badge);

    const heading = card.querySelector(
      'h1, h2, h3, h4, [data-testid*="title" i], [data-qa*="title" i], [class*="title" i]'
    );
    
    if (heading) {
      heading.style.position = 'relative';
      heading.insertAdjacentElement("afterend", badge);
    } else {
      card.insertAdjacentElement("afterbegin", badge);
    }

    card.setAttribute("data-htc", result.label);
    card.setAttribute("data-htc-score", String(result.score));
  }

  // Detailed badge for opened job postings
  function markDetailedJobPosting(container, result) {
    // Check if this container or any parent already has a badge
    if (detailedBadgeFor.has(container) && detailedBadgeFor.get(container).isConnected) {
      return; // Already has detailed badge
    }
    
    // Check if there's already a badge in this container
    if (container.querySelector('.htc-badge-container')) {
      return;
    }

    const badgeContainer = document.createElement("div");
    badgeContainer.className = "htc-badge-container";
    detailedBadgeFor.set(container, badgeContainer);

    badgeContainer.innerHTML = `
      <div class="htc-badge htc-badge-detailed" style="background-color: ${result.color}">
        <span class="htc-score">${result.label} (${result.score})</span>
      </div>
      <div class="htc-details">
        <div class="htc-details-header">Analysis:</div>
        <ul class="htc-reasons">
          ${result.reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>
    `;

    const heading = container.querySelector('h1, h2, [data-testid*="title" i], [data-qa*="title" i]');
    if (heading) {
      heading.insertAdjacentElement("afterend", badgeContainer);
    } else {
      container.insertAdjacentElement("afterbegin", badgeContainer);
    }

    container.setAttribute("data-htc-detailed", result.label);
    
    console.log(`[HTC] Added detailed badge with score ${result.score}`);
  }

  function extractText(node) {
    return (node.innerText || node.textContent || "").trim();
  }

  function isLikelyJobCard(node, text) {
    if (!text || text.length < 40) return false;

    // Check for job-related attributes
    if (node.matches('[data-qa*="job" i], [data-testid*="job" i], [data-test*="job" i]')) return true;
    if (node.matches('div[class*="JobCard"], div[class*="job-card"], div[class*="job-list-item"]')) return true;
    if (node.matches('a[href*="/jobs/"]')) return true;
    if (node.matches('[role="listitem"]') && /job/i.test(text)) return true;

    // Check for job keywords
    const keywordHits = JOB_KEYWORDS.reduce((acc, re) => acc + (re.test(text) ? 1 : 0), 0);
    if (keywordHits >= 2 && text.length < 1000) return true;

    return false;
  }

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

    const set = new Set();
    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(node => {
          if (node instanceof HTMLElement) set.add(node);
        });
      } catch (e) {
        // Ignore selector errors
      }
    });

    return Array.from(set);
  }

  function findMainJobContent() {
    console.log("[HTC] Looking for main job content...");
    
    // Try multiple strategies to find the main job posting
    const strategies = [
      // Strategy 1: Look for main content areas with substantial text
      () => {
        const main = document.querySelector('main, [role="main"], #main-content');
        if (main) {
          // Find the largest text block that's not in a sidebar
          const candidates = Array.from(main.querySelectorAll('div, section, article'))
            .filter(el => {
              const text = extractText(el);
              // Must have substantial text and job-related content
              return text.length > 400 && 
                     /responsibilit|qualification|requirement|description/i.test(text) &&
                     !el.closest('[class*="sidebar" i], [class*="similar" i], aside') &&
                     !el.querySelector('.htc-badge-container'); // Skip if already has badge
            })
            .sort((a, b) => extractText(b).length - extractText(a).length);
          
          if (candidates.length > 0) {
            console.log(`[HTC] Found via main content strategy: ${extractText(candidates[0]).length} chars`);
            return candidates[0];
          }
        }
        return null;
      },
      
      // Strategy 2: Look for specific job description elements
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
              console.log(`[HTC] Found via selector: ${sel}`);
              return el;
            }
          } catch (e) {}
        }
        return null;
      },
      
      // Strategy 3: Find h1 and get its parent container
      () => {
        const h1 = document.querySelector('h1');
        if (h1 && /\w{3,}/.test(h1.textContent)) {
          let container = h1.closest('article, section, main, div[class*="content" i]');
          if (container && extractText(container).length > 400 && !container.querySelector('.htc-badge-container')) {
            console.log(`[HTC] Found via h1 parent container`);
            return container;
          }
        }
        return null;
      },
      
      // Strategy 4: Look for the largest content block on the page
      () => {
        const allDivs = Array.from(document.querySelectorAll('div, section, article'))
          .filter(el => {
            const text = extractText(el);
            const rect = el.getBoundingClientRect();
            // Must be visible, substantial, and not a sidebar/similar jobs section
            return text.length > 500 && 
                   rect.width > 300 && 
                   !el.closest('[class*="sidebar" i], [class*="similar" i], [class*="recommendation" i], aside') &&
                   !el.querySelector('.htc-badge-container');
          })
          .sort((a, b) => extractText(b).length - extractText(a).length);
        
        if (allDivs.length > 0) {
          console.log(`[HTC] Found via largest content block: ${extractText(allDivs[0]).length} chars`);
          return allDivs[0];
        }
        return null;
      }
    ];

    // Try each strategy in order
    for (const strategy of strategies) {
      const result = strategy();
      if (result) return result;
    }

    console.log("[HTC] Could not find main job content");
    return null;
  }

  // Scan job cards in list view
  function scanJobCards() {
    const cards = candidateJobCards();
    let scannedCount = 0;

    cards.forEach(card => {
      // Skip if already has badge
      if (badgeFor.has(card) && badgeFor.get(card).isConnected) {
        return;
      }

      const text = extractText(card);
      if (isLikelyJobCard(card, text)) {
        const result = analyzeJob(text, false);
        markCard(card, result);
        scannedCount++;
      }
    });

    if (scannedCount > 0) {
      console.log(`[HTC] Scanned ${scannedCount} job cards`);
    }
  }

  // Scan detailed job posting view
  function scanDetailedJobPosting() {
    const container = findMainJobContent();
    
    if (!container) {
      console.log("[HTC] No main job content found");
      return;
    }

    // Skip if already has detailed badge
    if (detailedBadgeFor.has(container) && detailedBadgeFor.get(container).isConnected) {
      console.log("[HTC] Main content already has badge");
      return;
    }

    const text = extractText(container);
    console.log(`[HTC] Analyzing main job content (${text.length} characters)`);
    
    if (text.length > 300) {
      const result = analyzeJob(text, true);
      markDetailedJobPosting(container, result);
    }
  }

  // Main scan function
  function scanAll() {
    console.log("[HTC] Running full scan...");
    scanJobCards();
    scanDetailedJobPosting();
  }

  // Observe page changes
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    
    for (const mutation of mutations) {
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        shouldScan = true;
        break;
      }
    }

    if (shouldScan) {
      setTimeout(scanAll, 400);
    }
  });

  observer.observe(document.documentElement, { 
    childList: true, 
    subtree: true 
  });

  // Listen for manual trigger from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "HANDSHAKE_SCAN") {
      console.log("[HTC] Manual scan triggered");
      scanAll();
      sendResponse({ ok: true });
    }
  });

  // Initial scans with multiple attempts
  setTimeout(scanAll, 1000);
  setTimeout(scanAll, 2500);
  setTimeout(scanAll, 4000);

  console.log("[HTC] Handshake Trust Checker loaded and ready");
})();
