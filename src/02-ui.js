    function saveWindowGeometry() {
      try {
        const w = window.outerWidth || window.innerWidth;
        const h = window.outerHeight || window.innerHeight;
        const x = window.screenX !== undefined ? window.screenX : window.screenLeft;
        const y = window.screenY !== undefined ? window.screenY : window.screenTop;

        if (w >= 350 && h >= 400 && typeof x === 'number' && typeof y === 'number') {
          const geomKey = `${w}_${h}_${x}_${y}`;
          if (geomKey !== lastSavedGeom) {
            lastSavedGeom = geomKey;
            localStorage.setItem('ns_inspector_geom', JSON.stringify({ width: w, height: h, left: x, top: y }));
          }
        }
      } catch (e) {}
    }
    function ensureBoardStyles(doc) {
      if (!doc) return;
      let s = doc.getElementById('ns-inspector-board-styles');
      if (!s) {
        s = doc.createElement('style');
        s.id = 'ns-inspector-board-styles';
        (doc.head || doc.body).appendChild(s);
      }
      s.textContent = `
        .ns-inspector-active-highlight {
          background-color: #fef08a !important;
          color: #000000 !important;
          padding: 1px 4px !important;
          border-radius: 3px !important;
          display: inline-block !important;
          box-decoration-break: clone !important;
          -webkit-box-decoration-break: clone !important;
          box-shadow: none !important;
          outline: none !important;
          transform: none !important;
        }
        .ns-inspector-active-highlight a,
        .ns-inspector-active-highlight span,
        .ns-inspector-active-highlight div {
          color: #000000 !important;
          background: transparent !important;
          text-shadow: none !important;
        }
      `;
    }
    function highlightBoardElement(el) {
      try {
        if (!el) return;
        const targetDoc = el.ownerDocument || window.opener?.document || document;
        ensureBoardStyles(targetDoc);

        targetDoc.querySelectorAll('.ns-inspector-active-highlight').forEach(node => {
          node.classList.remove('ns-inspector-active-highlight');
          node.style.removeProperty('background-color');
          node.style.removeProperty('color');
          node.style.removeProperty('padding');
          node.style.removeProperty('border-radius');
          node.style.removeProperty('display');
          node.style.removeProperty('box-decoration-break');
          node.style.removeProperty('-webkit-box-decoration-break');
          node.style.removeProperty('box-shadow');
          node.style.removeProperty('outline');
          node.style.removeProperty('outline-offset');
          node.style.removeProperty('transform');
        });

        let target = el.querySelector('.attendeeName') || 
                     el.closest('.attendeeName') || 
                     el.querySelector('a[href*="contact.nl"]') || 
                     el.closest('a[href*="contact.nl"]') || 
                     el.querySelector('.attendeeNameWrap') || 
                     el.closest('.attendeeNameWrap');

        if (!target && (el.getAttribute('data-courseattendeeid') || el.closest('[data-courseattendeeid]'))) {
          const block = el.closest('[data-courseattendeeid]') || el;
          target = block.querySelector('.attendeeName, a, span') || block;
        }

        if (!target && (el.tagName === 'TD' || el.tagName === 'TH')) {
          target = el.querySelector('a, span, b, strong') || el;
        }

        if (!target) target = el;

        target.classList.add('ns-inspector-active-highlight');
        target.style.setProperty('background-color', '#fef08a', 'important');
        target.style.setProperty('color', '#000000', 'important');
        target.style.setProperty('padding', '1px 4px', 'important');
        target.style.setProperty('border-radius', '3px', 'important');
        target.style.setProperty('display', 'inline-block', 'important');
        target.style.setProperty('box-decoration-break', 'clone', 'important');
        target.style.setProperty('-webkit-box-decoration-break', 'clone', 'important');

        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
      } catch (err) {
        console.warn('Failed to highlight name on board:', err);
      }
    }
    appContainer.innerHTML = `
      <div class="nav-bar">
        <div class="app-title">
          <span>👤 Inspector</span>
          <span id="ns-seminar-pip-pill" class="pill" style="display:none; cursor:pointer; background:rgba(251, 191, 36, 0.2); color:rgb(251, 191, 36); border-color:rgba(251, 191, 36, 0.4);" title="Click to pop out Seminar Mini-Window">📅 Seminar Found ↗</span>
        </div>
        <span class="pill" id="ns-bridge-status" style="background:rgba(34, 197, 94, 0.2); color:rgb(74, 222, 128); border-color:rgba(34, 197, 94, 0.4);">● Connected</span>
      </div>

      <div class="content-viewport">
        <div class="view-pane" id="pane-inspector-view">
          <div>
            <input type="text" id="ns-insp-search" placeholder="Search attendee on board..." autocomplete="off" />
            <div class="search-results" id="ns-insp-dropdown"></div>
          </div>

          <div class="glass-card card-contact">
            <div class="field-label title-contact">Linked Contact File</div>
            <div id="ns-insp-contact-name" class="field-value" style="font-size:15px; font-weight:700; color:rgb(255, 255, 255); margin-top:3px;">-</div>
            <div class="field-label" style="margin-top:6px;">Position / Post</div>
            <div id="ns-insp-position" class="field-value" style="font-weight:600; color:rgb(228, 228, 231);">-</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:6px;">
              <div><div class="field-label">Direct Phone</div><div id="ns-insp-contact-phone" class="field-value">-</div></div>
              <div><div class="field-label" style="color:rgb(255, 255, 255);">Contact Email</div><div id="ns-insp-contact-email" class="field-value" style="font-size:11px; color:rgb(255, 255, 255);">-</div></div>
            </div>
            <div class="field-label" style="margin-top:6px;">Contact Comments</div>
            <div id="ns-insp-contact-comments" class="scroll-box">-</div>
          </div>

          <div class="glass-card card-client">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="field-label title-client">Linked Client Master</span>
              <span id="ns-insp-client-fetch-status" style="font-size:10px; color:rgb(161, 161, 170);">-</span>
            </div>
            <div id="ns-insp-full-client" class="field-value" style="font-weight:600; font-size:13px; margin-top:3px;">-</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:6px;">
              <div><div class="field-label">Work Phone</div><div id="ns-insp-work-phone" class="field-value">-</div></div>
              <div><div class="field-label" style="color:rgb(255, 255, 255);">Primary Email</div><div id="ns-insp-email" class="field-value" style="font-size:11px; color:rgb(255, 255, 255);">-</div></div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:6px;">
              <div><div class="field-label">Cell 1</div><div id="ns-insp-cell-1" class="field-value">-</div></div>
              <div><div class="field-label">Cell 2</div><div id="ns-insp-cell-2" class="field-value">-</div></div>
            </div>
            <div class="field-label" style="margin-top:6px;">Client Comments</div>
            <div id="ns-insp-comments" class="scroll-box">-</div>
            
            <button id="ns-insp-btn-scan-60d" class="btn btn-solid" style="margin-top:10px; width:100%; background:linear-gradient(180deg,#38bdf8 0%,#0284c7 100%); color:white; border:none; padding:8px 12px;">
              📅 Scan Office 30-Day Outlook (PDFs)
            </button>
          </div>

          <div class="glass-card card-schedule">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div><div class="field-label title-schedule">Scheduled Date & Status</div><div id="ns-insp-sched-day" class="field-value" style="font-size:12px; font-weight:600; line-height:1.5;">-</div></div>
              <span class="pill" id="ns-insp-pill-id">Attendee ID: --</span>
            </div>

            <div id="ns-insp-linked-event-box" style="display:none; margin-top:8px; padding:8px 10px; border-radius:8px; background:rgba(251, 191, 36, 0.12); border:1px solid rgba(251, 191, 36, 0.35);">
              <div class="field-label" style="color:rgb(251, 191, 36); font-size:10px; margin-bottom:4px;">📅 Attending Event This Week</div>
              <div id="ns-insp-linked-event-items" style="display:flex; flex-direction:column; gap:6px;"></div>
            </div>

            <div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255, 255, 255, 0.08); display:flex; flex-direction:column; gap:6px;">
              <button id="ns-insp-btn-pdf" class="btn" disabled>Print Schedule 2020 (PDF) ↗</button>
              <a id="ns-insp-btn-attendee" href="javascript:void(0)" target="_blank" class="btn" style="opacity:0.4; pointer-events:none;">Edit Custom Record (No. 56)</a>
            </div>
          </div>

          <div class="glass-card card-notes">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span class="field-label title-notes">5 Latest User Notes</span>
              <span id="ns-insp-notes-count" style="font-size:9px; color:rgb(161, 161, 170);">-</span>
            </div>
            <div id="ns-insp-notes-list" class="notes-container"><div style="color:rgb(161, 161, 170);">Waiting for click...</div></div>
            <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 8px; margin-top: 6px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span class="field-label title-notes">Add Note to Client</span>
                <span id="ns-insp-save-status" style="font-size:10px; color:rgb(161, 161, 170);"></span>
              </div>
              <textarea id="ns-insp-new-note" placeholder="Write a note to log under this client..." rows="2" style="resize:vertical;"></textarea>
              <div style="display:flex; justify-content:flex-end; margin-top:6px;">
                <button id="ns-insp-btn-save-note" class="btn btn-solid" style="padding:6px 14px; font-size:11px;" disabled>Save Note</button>
              </div>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:6px;">
            <a id="ns-insp-btn-contact" href="javascript:void(0)" target="_blank" class="btn" style="opacity:0.4; pointer-events:none;">Open Contact File (contact.nl)</a>
            <a id="ns-insp-btn-client" href="javascript:void(0)" target="_blank" class="btn" style="opacity:0.4; pointer-events:none;">Open Master Client File (custjob.nl)</a>
          </div>
        </div>
      </div>
    `;
    function getStatusBadge(status) {
      if (!status || /^(edit|view)$/i.test(status.trim())) return '';
      const s = status.trim().toLowerCase();
      let bg = 'rgba(255, 255, 255, 0.08)', color = 'rgb(228, 228, 231)', border = 'rgba(255, 255, 255, 0.18)';

      if (s.includes('resched') || s.includes('re-sched') || s.includes('schedule change') || s.includes('sched change')) {
        bg = 'rgba(249, 115, 22, 0.25)'; color = 'rgb(251, 146, 60)'; border = 'rgba(249, 115, 22, 0.5)';
      } else if (s.includes('noshow') || s.includes('no show') || s.includes('no-show') || s === 'ns' || s.includes('did not attend') || s.includes('absent')) {
        bg = 'rgba(239, 68, 68, 0.25)'; color = 'rgb(248, 113, 113)'; border = 'rgba(239, 68, 68, 0.6)';
      } else if (s.includes('cancel') || s.includes('cxl')) {
        bg = 'rgba(239, 68, 68, 0.15)'; color = 'rgb(252, 165, 165)'; border = 'rgba(239, 68, 68, 0.35)';
      } else if (s.includes('confirm')) {
        bg = 'rgba(34, 197, 94, 0.2)'; color = 'rgb(74, 222, 128)'; border = 'rgba(34, 197, 94, 0.4)';
      } else if (s.includes('attend') || s.includes('complet') || s.includes('present')) {
        bg = 'rgba(59, 130, 246, 0.2)'; color = 'rgb(96, 165, 250)'; border = 'rgba(59, 130, 246, 0.4)';
      } else if (s.includes('wait')) {
        bg = 'rgba(168, 85, 247, 0.2)'; color = 'rgb(192, 132, 252)'; border = 'rgba(168, 85, 247, 0.4)';
      } else if (s.includes('sched')) {
        bg = 'rgba(245, 158, 11, 0.2)'; color = 'rgb(251, 191, 36)'; border = 'rgba(245, 158, 11, 0.4)';
      } else if (s.includes('reg') || s.includes('enroll')) {
        bg = 'rgba(20, 184, 166, 0.2)'; color = 'rgb(45, 212, 191)'; border = 'rgba(20, 184, 166, 0.4)';
      } else if (s.includes('pend') || s.includes('tentat') || s.includes('standby') || s.includes('invited')) {
        bg = 'rgba(6, 182, 212, 0.2)'; color = 'rgb(103, 232, 249)'; border = 'rgba(6, 182, 212, 0.4)';
      } else if (s.includes('declin') || s.includes('refus')) {
        bg = 'rgba(156, 163, 175, 0.2)'; color = 'rgb(209, 213, 219)'; border = 'rgba(156, 163, 175, 0.4)';
      }

      return `<span class="pill" style="background:${bg}; color:${color}; border:1px solid ${border}; font-size:10px; font-weight:700;">${status}</span>`;
    }
      function copyToClipboard(textToCopy) {
        if (outlookWindow.navigator && outlookWindow.navigator.clipboard && outlookWindow.navigator.clipboard.writeText) {
          return outlookWindow.navigator.clipboard.writeText(textToCopy).catch(() => fallbackCopy(textToCopy));
        }
        return fallbackCopy(textToCopy);
      }
      function fallbackCopy(textToCopy) {
        try {
          const ta = outDoc.createElement('textarea');
          ta.value = textToCopy;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          outDoc.body.appendChild(ta);
          ta.select();
          outDoc.execCommand('copy');
          ta.remove();
          return Promise.resolve();
        } catch (e) {
          return Promise.reject(e);
        }
      }
    function setPdfPiPLoading(name) {
      if (!pdfPipWin || pdfPipWin.closed) return;
      try {
        const pDoc = pdfPipWin.document;
        pDoc.title = `Schedule PDF • Loading...`;
        const nameEl = pDoc.getElementById('pip-pdf-name');
        if (nameEl) nameEl.textContent = `• ${name || 'Attendee'} (Loading PDF...)`;
      } catch (e) {}
    }
    function updatePdfPiPIfOpen(url, name) {
      if (!pdfPipWin || pdfPipWin.closed) return;
      try {
        const pDoc = pdfPipWin.document;
        pDoc.title = `Schedule PDF • ${name || 'Attendee'}`;
        const nameEl = pDoc.getElementById('pip-pdf-name');
        if (nameEl) nameEl.textContent = `• ${name || 'Attendee'}`;
        const tabBtn = pDoc.getElementById('pip-pdf-tab');
        if (tabBtn) tabBtn.href = url || 'about:blank';
        const fr = pDoc.getElementById('pip-pdf-frame');
        if (fr && url && fr.src !== url) {
          fr.src = url;
        }
      } catch (e) {
        console.warn('Failed to update open PDF PiP window:', e);
      }
    }
    async function openPdfPiP() {
      if (!activePdfUrl) return;

      if (pdfPipWin && !pdfPipWin.closed) {
        updatePdfPiPIfOpen(activePdfUrl, activeContactName);
        pdfPipWin.focus();
        return;
      }

      const pipApi = window.opener?.documentPictureInPicture || window.documentPictureInPicture;
      if (pipApi) {
        try {
          pdfPipWin = await pipApi.requestWindow({ width: 720, height: 860 });
          const pDoc = pdfPipWin.document;
          pDoc.title = `Schedule PDF • ${activeContactName || 'Attendee'}`;

          const s = pDoc.createElement('style');
          s.textContent = `
            * { box-sizing: border-box; }
            html, body {
              margin: 0; padding: 0; width: 100%; height: 100%;
              overflow: hidden; background: rgb(18, 18, 20);
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
              display: flex; flex-direction: column;
              user-select: text; -webkit-user-select: text;
            }
            .pip-pdf-nav {
              display: flex; justify-content: space-between; align-items: center;
              padding: 8px 12px; background: rgba(24, 24, 27, 0.98);
              border-bottom: 1px solid rgba(255, 255, 255, 0.12); flex-shrink: 0;
              user-select: none; -webkit-user-select: none;
            }
            .pip-pdf-title {
              display: flex; align-items: center; gap: 8px; font-weight: 700;
              color: rgb(192, 132, 252); font-size: 12px;
            }
            .btn {
              padding: 4px 10px; border-radius: 6px; cursor: pointer; font-weight: 600;
              font-size: 11px; text-decoration: none; border: 1px solid rgba(255, 255, 255, 0.18);
              background: rgba(255, 255, 255, 0.08); color: rgb(250, 250, 250); transition: all 0.2s ease;
              user-select: none; -webkit-user-select: none;
            }
            .btn:hover { background: rgba(255, 255, 255, 0.14); }
            iframe { width: 100%; height: 100%; border: none; background: white; }
          `;
          pDoc.head.appendChild(s);

          pDoc.body.innerHTML = `
            <div class="pip-pdf-nav">
              <div class="pip-pdf-title">
                <span>📄 Schedule PDF Preview</span>
                <span id="pip-pdf-name" style="font-size:11px; color:rgb(161, 161, 170);">• ${activeContactName || 'Attendee'}</span>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <a id="pip-pdf-tab" href="${activePdfUrl}" target="_blank" class="btn">Open in Tab ↗</a>
                <button class="btn" id="pip-pdf-btn-close" style="padding:4px 8px;">✕</button>
              </div>
            </div>
            <div style="flex:1; position:relative; background:rgb(24, 24, 27);">
              <iframe id="pip-pdf-frame" src="${activePdfUrl}"></iframe>
            </div>
          `;

          pDoc.getElementById('pip-pdf-btn-close').onclick = () => { if (pdfPipWin) pdfPipWin.close(); };
          pdfPipWin.addEventListener('pagehide', () => { pdfPipWin = null; });
          return;
        } catch (e) {
          console.warn('Document PiP window creation for PDF failed, opening popup fallback:', e);
        }
      }

      window.open(activePdfUrl, 'NSSchedulePDFWindow_' + Date.now(), 'popup=1,width=750,height=880,menubar=no,toolbar=no,location=no,status=no,resizable=yes');
    }
    async function getSeminarPiPWindow() {
      if (seminarPipWin && !seminarPipWin.closed) {
        seminarPipWin.focus();
        return seminarPipWin;
      }

      const pipApi = window.opener?.documentPictureInPicture || window.documentPictureInPicture;
      if (!pipApi) {
        console.warn('Chrome Document Picture-in-Picture is not supported in this browser.');
        return null;
      }

      try {
        seminarPipWin = await pipApi.requestWindow({ width: 440, height: 500 });
        const pipDoc = seminarPipWin.document;
        pipDoc.title = 'Seminar Attendees (Always-on-Top)';

        const origin = getNsOrigin();
        if (origin && !pipDoc.querySelector('base')) {
          const baseEl = pipDoc.createElement('base');
          baseEl.href = origin + '/';
          pipDoc.head.appendChild(baseEl);
        }

        const s = pipDoc.createElement('style');
        s.textContent = `
          * { box-sizing: border-box; }
          html, body {
            margin: 0; padding: 0; width: 100%; height: 100%;
            overflow: hidden; background: rgb(18, 18, 20);
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
            font-size: 13px; color: rgb(244, 244, 245);
            user-select: text !important; -webkit-user-select: text !important;
          }
          ::-webkit-scrollbar { width: 5px; height: 5px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 999px; }

          .pip-nav {
            display: flex; justify-content: space-between; align-items: center;
            padding: 8px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(24, 24, 27, 0.98); flex-shrink: 0;
            user-select: none; -webkit-user-select: none;
          }
          .pip-body {
            padding: 12px; height: calc(100% - 45px); overflow-y: auto;
            display: flex; flex-direction: column; gap: 10px;
          }
          .glass-card {
            background: rgba(255, 255, 255, 0.035);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px; padding: 10px 12px;
            user-select: text !important; -webkit-user-select: text !important;
          }
          .card-contact { border-left: 3px solid rgb(129, 140, 248); }
          .pill {
            display: inline-block; padding: 2px 7px; border-radius: 999px;
            font-size: 10px; font-weight: 700; text-transform: uppercase;
            background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.18);
            color: rgb(228, 228, 231); letter-spacing: 0.5px; white-space: nowrap;
            user-select: none; -webkit-user-select: none;
          }
          .field-label {
            font-size: 10px; text-transform: uppercase; font-weight: 700;
            color: rgb(161, 161, 170); letter-spacing: 0.6px; margin-bottom: 2px;
            user-select: text !important; -webkit-user-select: text !important;
          }
          .field-value {
            font-size: 12px; color: rgb(250, 250, 250); font-weight: 500; word-break: break-word;
            user-select: text !important; -webkit-user-select: text !important; cursor: text;
          }
          .contact-card-info {
            user-select: text !important; -webkit-user-select: text !important; cursor: text;
          }
          a { color: rgb(250, 250, 250); text-decoration: none; cursor: pointer; }
          a:hover { color: rgb(56, 189, 248); }
        `;
        pipDoc.head.appendChild(s);

        pipDoc.body.innerHTML = `
          <div class="pip-nav">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:700; color:rgb(251, 191, 36); font-size:12px;">📅 Seminar Attendees</span>
              <span id="pip-contacts-count" class="pill" style="background:rgba(251, 191, 36, 0.2); color:rgb(251, 191, 36);">-</span>
            </div>
            <span class="pill" style="background:rgba(34, 197, 94, 0.2); color:rgb(74, 222, 128); border-color:rgba(34, 197, 94, 0.4);">● Pin</span>
          </div>
          <div class="pip-body">
            <div class="glass-card" style="border-left: 3px solid rgb(251, 191, 36);">
              <div class="field-label" style="color:rgb(251, 191, 36);">Scheduled Seminar</div>
              <div id="pip-event-title" class="field-value" style="font-size:13px; font-weight:700;">Loading...</div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; padding-top:6px; border-top:1px solid rgba(255, 255, 255, 0.08);">
                <span style="font-size:11px; color:rgb(161, 161, 170);" id="pip-event-client">Client: -</span>
                <span style="font-size:11px; color:rgb(228, 228, 231);" id="pip-event-dates">-</span>
              </div>
            </div>
            <div class="field-label" style="color:rgb(255, 255, 255); margin-top:4px;">Attending Contacts</div>
            <div id="pip-event-contacts-list" style="display:flex; flex-direction:column; gap:8px;">
              <div style="color:rgb(161, 161, 170);">Querying records...</div>
            </div>
          </div>
        `;

        seminarPipWin.addEventListener('pagehide', () => { seminarPipWin = null; });
        return seminarPipWin;
      } catch (err) {
        console.error('Failed to open Document Picture-in-Picture window:', err);
        return null;
      }
    }
    function closeSeminarPiP() {
      if (seminarPipWin && !seminarPipWin.closed) {
        seminarPipWin.close();
        seminarPipWin = null;
      }
    }
    async function renderSeminarInPiP(list, title, clientName, dates) {
      const win = await getSeminarPiPWindow();
      if (!win) return;
      const d = win.document;

      d.getElementById('pip-event-title').textContent = title;
      d.getElementById('pip-event-client').textContent = 'Client: ' + clientName;
      d.getElementById('pip-event-dates').innerHTML = dates;
      d.getElementById('pip-contacts-count').textContent = list.length + ' attendee(s)';

      const listContainer = d.getElementById('pip-event-contacts-list');
      if (!list.length) {
        listContainer.innerHTML = '<div style="color:rgb(161, 161, 170);">No matching contacts recorded.</div>';
        return;
      }

      listContainer.innerHTML = list.map(item => {
        const s = (item.status || '').toLowerCase();
        let cardBorder = '';
        if (s.includes('noshow') || s.includes('no show') || s.includes('no-show') || s === 'ns' || s.includes('did not attend') || s.includes('absent')) {
          cardBorder = 'border-left: 3px solid rgb(248, 113, 113) !important;';
        } else if (s.includes('resched') || s.includes('re-sched') || s.includes('schedule change') || s.includes('sched change')) {
          cardBorder = 'border-left: 3px solid rgb(251, 146, 60) !important;';
        } else if (s.includes('cancel') || s.includes('cxl')) {
          cardBorder = 'border-left: 3px solid rgb(239, 68, 68) !important;';
        } else if (s.includes('confirm')) {
          cardBorder = 'border-left: 3px solid rgb(74, 222, 128) !important;';
        } else if (s.includes('attend') || s.includes('complet') || s.includes('present')) {
          cardBorder = 'border-left: 3px solid rgb(96, 165, 250) !important;';
        } else if (s.includes('wait')) {
          cardBorder = 'border-left: 3px solid rgb(192, 132, 252) !important;';
        }

        const rawEditTarget = item.editUrl || (item.contactId ? '/app/common/entity/contact.nl?id=' + item.contactId + '&selectedtab=custom26&e=T' : '');
        const fullEditUrl = toAbsoluteNsUrl(rawEditTarget);
        const fullContactUrl = toAbsoluteNsUrl(item.contactId ? '/app/common/entity/contact.nl?id=' + item.contactId : '');

        return `
          <div class="glass-card card-contact" style="padding:10px 12px; ${cardBorder}" data-event-card="${item.contactId || item.contactName}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <a href="${fullContactUrl || 'javascript:void(0)'}" data-nav-url="${fullContactUrl}" target="_blank" rel="noopener noreferrer" style="font-weight:700; font-size:14px; color:white;">${item.contactName}</a>
              <div style="display:flex; align-items:center; gap:4px;">
                ${item.contactId ? `<span class="pill" style="cursor:pointer; background:rgba(192,132,252,0.2); color:rgb(192,132,252); border:1px solid rgba(192,132,252,0.4);" data-pdf-contact="${item.contactId}" data-pdf-name="${item.contactName}">📄 PDF</span>` : ''}
                ${fullEditUrl ? `<a href="${fullEditUrl}" data-nav-url="${fullEditUrl}" target="_blank" rel="noopener noreferrer" class="pill ns-pip-action-link" style="cursor:pointer; background:rgba(255, 255, 255, 0.12); color:rgb(244, 244, 245); border:1px solid rgba(255, 255, 255, 0.35); text-decoration:none;" title="Open Record in Edit Mode">EDIT ↗</a>` : ''}
                ${getStatusBadge(item.status || 'Status Unknown')}
              </div>
            </div>
            <div style="font-size:12px; font-weight:600; color:rgb(251, 191, 36); margin-top:2px;">${item.eventTitle || title}</div>
            <div class="contact-card-info" style="font-size:11px; margin-top:4px; border-top:1px solid rgba(255,255,255,0.06); padding-top:4px;">Loading contact details...</div>
          </div>
        `;
      }).join('');

      listContainer.querySelectorAll('[data-pdf-contact]').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const cId = btn.getAttribute('data-pdf-contact');
          const cNm = btn.getAttribute('data-pdf-name');
          if (cId) {
            activeContactId = cId;
            activeContactName = cNm;
            activePdfUrl = toAbsoluteNsUrl('/app/site/hosting/scriptlet.nl?script=customscript_scs_contact_sched_20_pdf_sl&deploy=customdeploy_scs_contact_sched_20_pdf_sl&contactId=' + cId);
            openPdfPiP();
          }
        };
      });

      listContainer.querySelectorAll('.ns-pip-action-link, a[data-nav-url]').forEach(a => {
        a.onclick = (e) => {
          const targetUrl = a.getAttribute('data-nav-url') || a.getAttribute('href');
          if (!targetUrl || targetUrl === 'javascript:void(0)' || targetUrl.startsWith('#')) return;

          try {
            const rootWin = window.opener?.opener || window.opener || window;
            if (rootWin && !rootWin.closed) {
              rootWin.open(targetUrl, '_blank');
              e.preventDefault();
              return;
            }
          } catch (err) {}
        };
      });

      list.forEach(item => {
        if (!item.contactId) return;
        getContactData(item.contactId).then(cData => {
          const card = listContainer.querySelector(`[data-event-card="${item.contactId || item.contactName}"] .contact-card-info`);
          if (card) {
            const phoneStr = cData.phone ? `<a href="tel:${cData.phone}">${cData.phone}</a>` : '-';
            const emailStr = cData.email ? `<a href="mailto:${cData.email}">${cData.email}</a>` : '-';
            card.innerHTML = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;"><div>Phone: ${phoneStr}</div><div>Email: ${emailStr}</div></div>`;
          }
        });
      });
    }
    function selectAttendee(attendee) {
      activeAttendeeId = attendee.id;
      activeClientInternalId = null;
      activeClientName = '';
      activeContactId = null;
      activeContactName = '';
      activePdfUrl = '';
      cachedMatchingSeminars = null;

      highlightBoardElement(attendee.element);

      setPdfPiPLoading(attendee.attendeeName);
      closeSeminarPiP();
      seminarPill.style.display = 'none';

      const eventBox = document.getElementById('ns-insp-linked-event-box');
      const eventItems = document.getElementById('ns-insp-linked-event-items');
      if (eventBox) eventBox.style.display = 'none';
      if (eventItems) eventItems.innerHTML = '';

      document.getElementById('ns-insp-contact-name').textContent = attendee.attendeeName || 'Loading...';
      document.getElementById('ns-insp-position').textContent = '...';
      document.getElementById('ns-insp-contact-phone').textContent = '...';
      document.getElementById('ns-insp-contact-email').innerHTML = '...';
      document.getElementById('ns-insp-contact-comments').textContent = '...';

      document.getElementById('ns-insp-sched-day').innerHTML = getAttendeeDates(attendee.element);
      document.getElementById('ns-insp-pill-id').textContent = 'Attendee ID: ' + attendee.id;

      document.getElementById('ns-insp-full-client').textContent = 'Loading...';
      document.getElementById('ns-insp-work-phone').textContent = '...';
      document.getElementById('ns-insp-email').innerHTML = '...';
      document.getElementById('ns-insp-cell-1').textContent = '...';
      document.getElementById('ns-insp-cell-2').textContent = '...';
      document.getElementById('ns-insp-comments').textContent = '...';
      document.getElementById('ns-insp-client-fetch-status').textContent = 'Fetching...';

      document.getElementById('ns-insp-notes-count').textContent = '-';
      document.getElementById('ns-insp-notes-list').innerHTML = '<div style="color:rgb(161, 161, 170);">Loading notes...</div>';
      document.getElementById('ns-insp-new-note').value = '';
      document.getElementById('ns-insp-save-status').textContent = '';
      document.getElementById('ns-insp-btn-save-note').disabled = true;
      document.getElementById('ns-insp-btn-pdf').disabled = true;

      const btnAttendee = document.getElementById('ns-insp-btn-attendee');
      btnAttendee.href = toAbsoluteNsUrl('/app/common/custom/custrecordentry.nl?rectype=56&id=' + attendee.id + '&e=T');
      btnAttendee.style.pointerEvents = 'auto';
      btnAttendee.style.opacity = '1';

      const btnContact = document.getElementById('ns-insp-btn-contact');
      btnContact.style.pointerEvents = 'none';
      btnContact.style.opacity = '0.35';

      fetchAttendeeRecord(attendee);
    }
    async function resolveEventClientAndContact(eventTarget, clickedCell, tr) {
      let detectedContactId = null;
      let clientInternalId = null;
      let clientDisplayText = '';

      const contactLink = eventTarget.closest('a[href*="contact.nl?id="]') || 
                          clickedCell.querySelector('a[href*="contact.nl?id="]') || 
                          (tr ? tr.querySelector('a[href*="contact.nl?id="]') : null);
      if (contactLink) {
        detectedContactId = contactLink.getAttribute('href')?.match(/[?&]id=(\d+)/)?.[1] || null;
      }

      const candidates = [clickedCell, eventTarget, tr].filter(Boolean);
      for (const el of candidates) {
        const cId = el.getAttribute('data-contactid') || el.dataset?.contactid;
        if (cId && /^\d+$/.test(cId) && !detectedContactId) detectedContactId = cId;

        const id = el.getAttribute('data-clientid') || el.getAttribute('data-customerid') || el.dataset?.clientid || el.dataset?.customerid;
        if (id && /^\d+$/.test(id) && !clientInternalId) clientInternalId = id;
      }

      if (!clientInternalId && tr) {
        const clientLink = tr.querySelector('a[href*="custjob.nl?id="], a[href*="customer.nl?id="], a[href*="company.nl?id="]');
        if (clientLink) {
          clientInternalId = clientLink.getAttribute('href')?.match(/[?&]id=(\d+)/)?.[1] || null;
          clientDisplayText = (clientLink.innerText || clientLink.textContent || '').trim();
        }
      }

      if (!clientInternalId && tr) {
        const clientCell = tr.querySelector('td.clientRecord, [data-clientid], [data-customerid]');
        if (clientCell) {
          const id = clientCell.getAttribute('data-clientid') || clientCell.getAttribute('data-customerid') || clientCell.dataset?.clientid || clientCell.dataset?.customerid;
          if (id && /^\d+$/.test(id)) clientInternalId = id;
          if (!clientDisplayText) clientDisplayText = (clientCell.innerText || clientCell.textContent || '').trim();
        }
      }

      if (!clientInternalId && tr) {
        const html = tr.outerHTML || '';
        const m = html.match(/(?:custjob\.nl|customer\.nl)\?[^"']*id=(\d+)/i) || html.match(/(?:customer|custjob|client)[^0-9]*(\d{4,})/i);
        if (m) clientInternalId = m[1];
      }

      if (!clientInternalId && tr) {
        let prev = tr.previousElementSibling;
        while (prev && !isSeminarHeader(prev)) {
          const id = prev.getAttribute('data-clientid') || prev.getAttribute('data-customerid') || prev.dataset?.clientid || prev.dataset?.customerid;
          if (id && /^\d+$/.test(id)) { clientInternalId = id; break; }
          const link = prev.querySelector('a[href*="custjob.nl?id="], a[href*="customer.nl?id="]');
          if (link) {
            const m = link.getAttribute('href')?.match(/[?&]id=(\d+)/);
            if (m) { clientInternalId = m[1]; break; }
          }
          prev = prev.previousElementSibling;
        }
      }

      if (!clientInternalId && detectedContactId) {
        try {
          const cData = await getContactData(detectedContactId);
          if (cData && cData.companyId) {
            clientInternalId = cData.companyId;
          }
        } catch (e) {}
      }

      if (!clientInternalId && clientDisplayText) {
        const m = clientDisplayText.match(/^(\d{3,})/);
        if (m) clientInternalId = m[1];
      }

      return { clientInternalId, detectedContactId, clientDisplayText };
    }
    async function selectEventAttendee(eventTarget) {
      const clickedCell = eventTarget.closest('td, th, [data-clientid], [data-customerid]') || eventTarget;
      const tr = clickedCell.closest('tr');

      highlightBoardElement(eventTarget);

      const nameEl = clickedCell.querySelector('.attendeeName') || clickedCell.closest('.attendeeName') || clickedCell;
      let rawText = '';
      if (nameEl) {
        const clone = nameEl.cloneNode(true);
        clone.querySelectorAll('.attendeeCount, i, span, svg').forEach(s => s.remove());
        rawText = (clone.innerText || clone.textContent || '').trim().replace(/\s+/g, ' ');
      }
      if (!rawText) rawText = (clickedCell.innerText || clickedCell.textContent || '').trim();

      let clientParsedName = '';
      let attendeeParsedName = rawText.replace(/\(\d+\)/g, '').trim();
      if (rawText.includes(':')) {
        const parts = rawText.split(':');
        clientParsedName = parts[0].trim();
        attendeeParsedName = parts.slice(1).join(':').replace(/\(\d+\)/g, '').trim();
      }

      const schedDatesHtml = getAttendeeDates(tr || clickedCell);
      const boardEvent = findBoardEvent(clickedCell);
      const eventDisplayHeader = boardEvent ? boardEvent.rawText : (rawText + ' Seminar');

      const isNoShow = !!(clickedCell.querySelector('.isNoShow') || /\bstatus(noshow|no-show|ns)\b/i.test(clickedCell.className) || /\bno[-\s]?show\b/i.test(clickedCell.innerText || ''));
      const isResched = !!(clickedCell.querySelector('.isResched') || /\bstatus(resched|rsch)\b/i.test(clickedCell.className) || /\bre[-\s]?sched(ule|uled)?\b/i.test(clickedCell.innerText || ''));
      const isCancel = !!(clickedCell.querySelector('.isCancel') || /\bstatus(cancel|cxl)\b/i.test(clickedCell.className) || /\bcancell?ed\b/i.test(clickedCell.innerText || ''));
      const isConf = !!(clickedCell.querySelector('.isConfirmed') || clickedCell.classList.contains('statusConf'));
      const isSchd = !!(clickedCell.classList.contains('statusSchd'));
      
      let fallbackStatus = '';
      if (isNoShow) fallbackStatus = 'No Show';
      else if (isResched) fallbackStatus = 'Rescheduled';
      else if (isCancel) fallbackStatus = 'Cancelled';
      else if (isConf) fallbackStatus = 'Confirmed';
      else if (isSchd) fallbackStatus = 'Scheduled';

      activeAttendeeId = null;
      activeContactId = null;
      activeContactName = attendeeParsedName || rawText;
      activePdfUrl = '';
      cachedMatchingSeminars = null;

      setPdfPiPLoading(attendeeParsedName);

      const eventBox = document.getElementById('ns-insp-linked-event-box');
      if (eventBox) eventBox.style.display = 'none';

      document.getElementById('ns-insp-contact-name').textContent = attendeeParsedName || 'Event Attendee';
      document.getElementById('ns-insp-position').textContent = 'Seminar Participant';
      document.getElementById('ns-insp-contact-phone').innerHTML = '...';
      document.getElementById('ns-insp-contact-email').innerHTML = '...';
      document.getElementById('ns-insp-contact-comments').textContent = 'Querying attendee file...';

      const dateBlock = (boardEvent && boardEvent.dateStr) ? `<div>${boardEvent.dateStr}</div>` : schedDatesHtml;
      document.getElementById('ns-insp-sched-day').innerHTML = `${dateBlock}${fallbackStatus ? `<div style="margin-top:4px;">${getStatusBadge(fallbackStatus)}</div>` : ''}`;

      document.getElementById('ns-insp-full-client').textContent = clientParsedName || 'Resolving client...';
      document.getElementById('ns-insp-work-phone').innerHTML = '...';
      document.getElementById('ns-insp-email').innerHTML = '...';
      document.getElementById('ns-insp-cell-1').innerHTML = '...';
      document.getElementById('ns-insp-cell-2').innerHTML = '...';
      document.getElementById('ns-insp-comments').textContent = '...';
      document.getElementById('ns-insp-client-fetch-status').textContent = 'Fetching...';
      document.getElementById('ns-insp-client-fetch-status').style.color = 'rgb(161, 161, 170)';

      document.getElementById('ns-insp-notes-count').textContent = '-';
      document.getElementById('ns-insp-notes-list').innerHTML = '<div style="color:rgb(161, 161, 170);">Loading notes...</div>';

      const win = await getSeminarPiPWindow();
      if (win) {
        const d = win.document;
        d.getElementById('pip-event-title').textContent = eventDisplayHeader;
        d.getElementById('pip-event-client').textContent = 'Client: ' + (clientParsedName || rawText);
        d.getElementById('pip-event-dates').innerHTML = dateBlock;
        d.getElementById('pip-contacts-count').textContent = 'Querying...';
        d.getElementById('pip-event-contacts-list').innerHTML = '<div style="color:rgb(161, 161, 170);">Querying records...</div>';
      }

      let { clientInternalId, detectedContactId, clientDisplayText } = await resolveEventClientAndContact(eventTarget, clickedCell, tr);
      activeClientInternalId = clientInternalId;
      activeClientName = clientDisplayText || clientParsedName || rawText;
      document.getElementById('ns-insp-pill-id').textContent = clientInternalId ? ('Client ID: ' + clientInternalId) : 'Event Mode';

      function applyContactToUi(cId, cData) {
        activeContactId = cId;
        activeContactName = cData.name || attendeeParsedName;
        document.getElementById('ns-insp-contact-name').textContent = activeContactName;
        document.getElementById('ns-insp-position').textContent = cData.position || 'Seminar Participant';
        document.getElementById('ns-insp-contact-phone').innerHTML = cData.phone ? `<a href="tel:${cData.phone}">${cData.phone}</a>` : '-';
        document.getElementById('ns-insp-contact-comments').textContent = cData.comments || 'None recorded';

        if (cData.email) {
          const rawSched = document.getElementById('ns-insp-sched-day')?.innerText.trim() || 'Scheduled Dates';
          const isDoctor = (cData.position || '').toLowerCase().includes('doctor');
          const greetingName = isDoctor && !/^dr\./i.test(activeContactName) ? `Dr. ${activeContactName}` : activeContactName;
          const subject = encodeURIComponent('Checking In: Travel Plans for MGE Course Sessions');
          const body = encodeURIComponent(`Hello ${greetingName},\n\nI hope you're doing well.\n\nI have you scheduled for the course room on the following dates:\n\n${rawSched}\n\nI wanted to check in and see if you've been able to make your flight and hotel reservations yet. Please let me know if you need any assistance with your travel plans.\n\nI look forward to hearing from you.`);
          document.getElementById('ns-insp-contact-email').innerHTML = `<a href="mailto:${cData.email.trim()}?subject=${subject}&body=${body}">${cData.email}</a>`;
        } else {
          document.getElementById('ns-insp-contact-email').innerHTML = '-';
        }

        const btnContact = document.getElementById('ns-insp-btn-contact');
        btnContact.href = toAbsoluteNsUrl('/app/common/entity/contact.nl?id=' + cId);
        btnContact.style.pointerEvents = 'auto';
        btnContact.style.opacity = '1';

        activePdfUrl = toAbsoluteNsUrl('/app/site/hosting/scriptlet.nl?script=customscript_scs_contact_sched_20_pdf_sl&deploy=customdeploy_scs_contact_sched_20_pdf_sl&contactId=' + cId);
        document.getElementById('ns-insp-btn-pdf').disabled = false;
        updatePdfPiPIfOpen(activePdfUrl, activeContactName);
      }

      if (detectedContactId) {
        getContactData(detectedContactId).then(cData => applyContactToUi(detectedContactId, cData));
      }

      const btnClient = document.getElementById('ns-insp-btn-client');
      if (clientInternalId) {
        btnClient.href = toAbsoluteNsUrl('/app/common/entity/custjob.nl?id=' + clientInternalId);
        btnClient.textContent = `Open Master Client File [id=${clientInternalId}]`;
        btnClient.style.pointerEvents = 'auto';
        btnClient.style.opacity = '1';
        document.getElementById('ns-insp-btn-save-note').disabled = false;

        const capturedId = clientInternalId;
        getClientData(capturedId, clientDisplayText || clientParsedName || rawText).then(clientData => {
          if (activeClientInternalId !== capturedId) return;

          document.getElementById('ns-insp-full-client').textContent = clientData.companyName || clientParsedName || rawText;
          document.getElementById('ns-insp-work-phone').innerHTML = clientData.workPhone ? `<a href="tel:${clientData.workPhone}">${clientData.workPhone}</a>` : '-';
          document.getElementById('ns-insp-email').innerHTML = clientData.email ? `<a href="mailto:${clientData.email}">${clientData.email}</a>` : '-';
          document.getElementById('ns-insp-comments').textContent = clientData.comments || 'None recorded';

          const formatContact = (name, phone) => (name && phone ? `${name}: <a href="tel:${phone}">${phone}</a>` : phone ? `<a href="tel:${phone}">${phone}</a>` : name || '-');
          document.getElementById('ns-insp-cell-1').innerHTML = formatContact(clientData.cell1Name, clientData.cell1Phone);
          document.getElementById('ns-insp-cell-2').innerHTML = formatContact(clientData.cell2Name, clientData.cell2Phone);

          const notesListEl = document.getElementById('ns-insp-notes-list');
          if (clientData.notes && clientData.notes.length > 0) {
            document.getElementById('ns-insp-notes-count').textContent = clientData.notes.length + ' note(s)';
            notesListEl.innerHTML = clientData.notes.map(n => `<div class="note-item"><div class="note-header"><span class="note-author">${n.author || 'NetSuite User'}</span><span>${n.date}</span></div><div class="note-body">${n.memo}</div></div>`).join('');
          } else {
            document.getElementById('ns-insp-notes-count').textContent = '0 notes';
            notesListEl.innerHTML = '<div style="color:rgb(161, 161, 170);">No user notes recorded.</div>';
          }
          document.getElementById('ns-insp-client-fetch-status').textContent = 'Resolved';
          document.getElementById('ns-insp-client-fetch-status').style.color = 'rgb(52, 211, 153)';

          if (!activeContactId && attendeeParsedName) {
            getAllClientContacts(capturedId).then(allContacts => {
              if (activeContactId) return;
              const found = allContacts.find(c => 
                c.name.toLowerCase().includes(attendeeParsedName.toLowerCase()) ||
                attendeeParsedName.toLowerCase().includes(c.name.toLowerCase())
              );
              if (found) {
                detectedContactId = found.id;
                getContactData(found.id).then(cData => applyContactToUi(found.id, cData));
              }
            });
          }
        }).catch(() => {
          if (activeClientInternalId === capturedId) {
            document.getElementById('ns-insp-client-fetch-status').textContent = 'Error';
            document.getElementById('ns-insp-client-fetch-status').style.color = 'rgb(248, 113, 113)';
          }
        });

        getAllAttendance(capturedId).then(allAttendance => {
          if (activeClientInternalId !== capturedId) return;

          const displayAttendance = (boardEvent && allAttendance.length > 0)
            ? allAttendance.filter(item => {
                const itemDate = normalizeDate(item.date);
                const validDates = boardEvent.allNormDates || [];
                const sig = getCanonicalKey(item.eventTitle, item.date);

                const isTitleMatch = Boolean(boardEvent.coreName && sig.coreName &&
                  (boardEvent.coreName.includes(sig.coreName) || sig.coreName.includes(boardEvent.coreName)));
                const isDateMatch = Boolean(itemDate && validDates.includes(itemDate));

                return isTitleMatch || isDateMatch;
              })
            : allAttendance;

          if (displayAttendance.length === 0 && attendeeParsedName) {
            displayAttendance.push({
              contactName: attendeeParsedName,
              contactId: detectedContactId || '',
              eventTitle: eventDisplayHeader,
              date: (boardEvent && boardEvent.dateStr) ? boardEvent.dateStr : 'This Week',
              status: fallbackStatus || 'Scheduled',
              editUrl: detectedContactId ? `/app/common/entity/contact.nl?id=${detectedContactId}&selectedtab=custom26&e=T` : ''
            });
          }

          cachedMatchingSeminars = {
            list: displayAttendance,
            title: eventDisplayHeader,
            clientName: clientParsedName || rawText,
            dates: dateBlock
          };
          renderSeminarInPiP(displayAttendance, eventDisplayHeader, clientParsedName || rawText, dateBlock);

          let targetContact = null;
          if (attendeeParsedName && displayAttendance.length > 0) {
            targetContact = displayAttendance.find(i => 
              i.contactName.toLowerCase().includes(attendeeParsedName.toLowerCase()) ||
              attendeeParsedName.toLowerCase().includes(i.contactName.toLowerCase())
            );
          }
          if (!targetContact && displayAttendance.length > 0) {
            targetContact = displayAttendance[0];
          }

          if (targetContact && targetContact.contactId) {
            getContactData(targetContact.contactId).then(cData => applyContactToUi(targetContact.contactId, cData));
          } else if (targetContact) {
            document.getElementById('ns-insp-contact-name').textContent = targetContact.contactName;
          }
        });
      } else {
        document.getElementById('ns-insp-full-client').textContent = clientParsedName || rawText || 'Client ID not detected';
        document.getElementById('ns-insp-client-fetch-status').textContent = 'Not Found';
        document.getElementById('ns-insp-client-fetch-status').style.color = 'rgb(251, 191, 36)';
        document.getElementById('ns-insp-notes-list').innerHTML = '<div style="color:rgb(161, 161, 170);">Click attendee or client link directly to load client notes.</div>';
        btnClient.style.pointerEvents = 'none';
        btnClient.style.opacity = '0.35';
        document.getElementById('ns-insp-btn-save-note').disabled = true;

        if (attendeeParsedName) {
          const singleFallback = [{
            contactName: attendeeParsedName,
            contactId: detectedContactId || '',
            eventTitle: eventDisplayHeader,
            date: (boardEvent && boardEvent.dateStr) ? boardEvent.dateStr : 'This Week',
            status: fallbackStatus || 'Scheduled',
            editUrl: detectedContactId ? `/app/common/entity/contact.nl?id=${detectedContactId}&selectedtab=custom26&e=T` : ''
          }];
          renderSeminarInPiP(singleFallback, eventDisplayHeader, clientParsedName || rawText, dateBlock);
        }
      }
    }
