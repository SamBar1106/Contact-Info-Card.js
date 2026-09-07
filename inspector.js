(function(){
  const WIN_NAME = 'NSSchedulerInspectorAppWindow';

  /* Retrieve saved window geometry from localStorage with safe screen fallbacks */
  let savedGeom = null;
  try {
    savedGeom = JSON.parse(localStorage.getItem('ns_inspector_geom') || 'null');
  } catch (e) {}

  const defaultWidth = 490;
  const defaultHeight = Math.min(window.screen.availHeight - 60, 940);
  const defaultLeft = Math.max(20, window.screen.availWidth - defaultWidth - 25);
  const defaultTop = 30;

  const winWidth = (savedGeom && savedGeom.width >= 350) ? savedGeom.width : defaultWidth;
  const winHeight = (savedGeom && savedGeom.height >= 400) ? savedGeom.height : defaultHeight;
  
  const leftPos = (savedGeom && typeof savedGeom.left === 'number')
    ? Math.max(10, Math.min(savedGeom.left, window.screen.availWidth - 120))
    : defaultLeft;
  const topPos = (savedGeom && typeof savedGeom.top === 'number')
    ? Math.max(10, Math.min(savedGeom.top, window.screen.availHeight - 120))
    : defaultTop;

  const winFeatures = 'popup=1,width=' + winWidth + ',height=' + winHeight + ',left=' + leftPos + ',top=' + topPos + ',menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no';

  let popup = window.open('', WIN_NAME, winFeatures);
  if (!popup) {
    alert('Pop-up Blocked by Chrome!\n\n1. Click the lock/tune icon in the address bar.\n2. Set "Pop-ups and redirects" to Allow.\n3. Click this bookmark again.');
    return;
  }

  popup.focus();

  if (popup.document && popup.document.getElementById('ns-main-app-container')) {
    if (typeof popup.__nsRehookOpener === 'function') popup.__nsRehookOpener();
    return;
  }

  const doc = popup.document;
  doc.open();
  doc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>NetSuite Inspector</title></head><body style="margin:0;padding:0;background:rgb(18,18,20);overflow:hidden;width:100vw;height:100vh;user-select:none;"></body></html>');
  doc.close();

  function runInspectorApp() {
    const UI_ID = 'ns-main-app-container';
    const cache = {
      contacts: new Map(),
      clients: new Map(),
      eventAttendance: new Map(),
      weekHeaders: new WeakMap()
    };

    let activeClientInternalId = null;
    let activeContactId = null;
    let activeContactName = '';
    let activePdfUrl = '';
    let activeAttendeeId = null;
    let seminarPipWin = null;
    let pdfPipWin = null;
    let cachedMatchingSeminars = null;

    /* Geometry Memory: Track and save window position and size */
    let lastSavedGeom = '';
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

    window.addEventListener('resize', saveWindowGeometry);
    window.addEventListener('beforeunload', saveWindowGeometry);
    window.addEventListener('pagehide', saveWindowGeometry);
    setInterval(saveWindowGeometry, 1500);

    /* Zero-Layout-Shift Board Style Injector */
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
          box-shadow: inset 0 0 0 2px #ca8a04 !important;
          border-radius: 2px !important;
          transition: background-color 0.12s ease !important;
        }
        .ns-inspector-active-highlight,
        .ns-inspector-active-highlight a,
        .ns-inspector-active-highlight span,
        .ns-inspector-active-highlight div {
          color: #000000 !important;
          font-weight: 700 !important;
          text-shadow: none !important;
        }
      `;
    }

    /* Zero-Layout-Shift Board Highlighter */
    function highlightBoardElement(el) {
      try {
        if (!el) return;
        const targetDoc = el.ownerDocument || window.opener?.document || document;
        ensureBoardStyles(targetDoc);

        // Clear previous highlights
        targetDoc.querySelectorAll('.ns-inspector-active-highlight').forEach(node => {
          node.classList.remove('ns-inspector-active-highlight');
          node.style.removeProperty('box-shadow');
          node.style.removeProperty('background-color');
          node.style.removeProperty('border-radius');
          node.style.removeProperty('outline');
          node.style.removeProperty('outline-offset');
          node.style.removeProperty('transform');
        });

        // Resolve target element without breaking container dimensions
        const target = el.closest('[data-courseattendeeid]') || 
                       el.closest('.attendeeName') || 
                       el.closest('a[href*="contact.nl"]') || 
                       el.closest('td') || 
                       el;

        if (target) {
          target.classList.add('ns-inspector-active-highlight');

          // Direct inline styles that guarantee zero layout reflow
          target.style.setProperty('background-color', '#fef08a', 'important');
          target.style.setProperty('box-shadow', 'inset 0 0 0 2px #ca8a04', 'important');
          target.style.setProperty('border-radius', '2px', 'important');

          if (typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
          }
        }
      } catch (err) {
        console.warn('Failed to highlight element on board:', err);
      }
    }

    // Clean up highlights when the inspector closes
    window.addEventListener('pagehide', () => {
      try {
        const oDoc = window.opener?.document;
        if (oDoc) {
          oDoc.querySelectorAll('.ns-inspector-active-highlight').forEach(node => {
            node.classList.remove('ns-inspector-active-highlight');
            node.style.removeProperty('box-shadow');
            node.style.removeProperty('background-color');
            node.style.removeProperty('border-radius');
            node.style.removeProperty('outline');
            node.style.removeProperty('outline-offset');
            node.style.removeProperty('transform');
          });
        }
      } catch (e) {}
    });

    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      html, body {
        margin: 0; padding: 0; width: 100%; height: 100%;
        overflow: hidden; background: rgb(18, 18, 20);
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
        font-size: 13px; color: rgb(244, 244, 245); user-select: none;
      }
      ::-webkit-scrollbar { width: 5px; height: 5px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 999px; }

      .nav-bar {
        display: flex; background: rgba(24, 24, 27, 0.98);
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        padding: 8px 12px; align-items: center; justify-content: space-between; flex-shrink: 0;
      }
      .app-title { font-weight: 700; font-size: 13px; color: white; display: flex; align-items: center; gap: 8px; }

      .content-viewport { width: 100%; height: calc(100% - 46px); overflow: hidden; position: relative; }
      .view-pane { width: 100%; height: 100%; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }

      .pill {
        display: inline-block; padding: 2px 7px; border-radius: 999px;
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.18);
        color: rgb(228, 228, 231); letter-spacing: 0.5px; white-space: nowrap;
      }

      .btn {
        padding: 7px 12px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px;
        display: inline-flex; align-items: center; justify-content: center; text-decoration: none;
        transition: all 0.2s ease; border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.08); color: rgb(250, 250, 250);
      }
      .btn:hover { background: rgba(255, 255, 255, 0.14); }
      .btn-solid { background: linear-gradient(180deg, white 0%, rgb(228, 228, 231) 100%); color: rgb(9, 9, 11); border: 1px solid white; font-weight: 700; }
      .btn-solid:hover { background: rgb(212, 212, 216); }

      .glass-card { background: rgba(255, 255, 255, 0.035); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 10px 12px; }
      .card-contact { border-left: 3px solid rgb(129, 140, 248); }
      .title-contact { color: rgb(129, 140, 248) !important; }
      .card-client { border-left: 3px solid rgb(56, 189, 248); }
      .title-client { color: rgb(56, 189, 248) !important; }
      .card-schedule { border-left: 3px solid rgb(251, 191, 36); }
      .title-schedule { color: rgb(251, 191, 36) !important; }
      .card-notes { border-left: 3px solid rgb(52, 211, 153); }
      .title-notes { color: rgb(52, 211, 153) !important; }

      .field-label { font-size: 10px; text-transform: uppercase; font-weight: 700; color: rgb(161, 161, 170); letter-spacing: 0.6px; margin-bottom: 2px; }
      .field-value { font-size: 12px; color: rgb(250, 250, 250); font-weight: 500; word-break: break-word; }
      .field-value a { color: rgb(250, 250, 250); text-decoration: none; cursor: pointer; }
      .field-value a:hover { color: rgb(56, 189, 248); }

      input[type="text"], textarea {
        width: 100%; background: rgba(9, 9, 11, 0.65); border: 1px solid rgba(255, 255, 255, 0.14);
        color: rgb(250, 250, 250); padding: 7px 11px; border-radius: 8px; font-size: 12px; outline: none;
      }
      .search-results {
        max-height: 130px; overflow-y: auto; background: rgba(18, 18, 20, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 10px; display: none; margin-top: 4px;
      }
      .search-item { padding: 7px 12px; cursor: pointer; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: rgb(228, 228, 231); }
      .search-item:hover { background: rgba(255, 255, 255, 0.12); color: white; }

      .scroll-box { font-size: 11px; color: rgb(212, 212, 216); max-height: 52px; overflow-y: auto; background: rgba(9, 9, 11, 0.5); padding: 6px 8px; border-radius: 6px; white-space: pre-wrap; }
      .notes-container { max-height: 155px; overflow-y: auto; background: rgba(9, 9, 11, 0.5); padding: 8px 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 8px; }
      .note-item { border-left: 2px solid rgb(52, 211, 153); padding-left: 8px; }
      .note-header { font-size: 11px; color: rgb(161, 161, 170); display: flex; justify-content: space-between; margin-bottom: 3px; }
      .note-author { font-weight: 700; color: rgb(250, 250, 250); }
      .note-body { font-size: 13px; color: rgb(244, 244, 245); white-space: pre-wrap; word-break: break-word; }
    `;
    document.head.appendChild(style);

    const appContainer = document.createElement('div');
    appContainer.id = UI_ID;
    appContainer.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; position:relative;';
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
    document.body.appendChild(appContainer);

    const seminarPill = document.getElementById('ns-seminar-pip-pill');

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
              display: flex; flex-direction: column; user-select: none;
            }
            .pip-pdf-nav {
              display: flex; justify-content: space-between; align-items: center;
              padding: 8px 12px; background: rgba(24, 24, 27, 0.98);
              border-bottom: 1px solid rgba(255, 255, 255, 0.12); flex-shrink: 0;
            }
            .pip-pdf-title {
              display: flex; align-items: center; gap: 8px; font-weight: 700;
              color: rgb(192, 132, 252); font-size: 12px;
            }
            .btn {
              padding: 4px 10px; border-radius: 6px; cursor: pointer; font-weight: 600;
              font-size: 11px; text-decoration: none; border: 1px solid rgba(255, 255, 255, 0.18);
              background: rgba(255, 255, 255, 0.08); color: rgb(250, 250, 250); transition: all 0.2s ease;
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

        const s = pipDoc.createElement('style');
        s.textContent = `
          * { box-sizing: border-box; }
          html, body {
            margin: 0; padding: 0; width: 100%; height: 100%;
            overflow: hidden; background: rgb(18, 18, 20);
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
            font-size: 13px; color: rgb(244, 244, 245); user-select: none;
          }
          ::-webkit-scrollbar { width: 5px; height: 5px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 999px; }

          .pip-nav {
            display: flex; justify-content: space-between; align-items: center;
            padding: 8px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(24, 24, 27, 0.98); flex-shrink: 0;
          }
          .pip-body {
            padding: 12px; height: calc(100% - 45px); overflow-y: auto;
            display: flex; flex-direction: column; gap: 10px;
          }
          .glass-card {
            background: rgba(255, 255, 255, 0.035);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px; padding: 10px 12px;
          }
          .card-contact { border-left: 3px solid rgb(129, 140, 248); }
          .pill {
            display: inline-block; padding: 2px 7px; border-radius: 999px;
            font-size: 10px; font-weight: 700; text-transform: uppercase;
            background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.18);
            color: rgb(228, 228, 231); letter-spacing: 0.5px; white-space: nowrap;
          }
          .field-label { font-size: 10px; text-transform: uppercase; font-weight: 700; color: rgb(161, 161, 170); letter-spacing: 0.6px; margin-bottom: 2px; }
          .field-value { font-size: 12px; color: rgb(250, 250, 250); font-weight: 500; word-break: break-word; }
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

    /* Status Badge Resolver with Priority Matching for Rescheduled, No Show & All Statuses */
    function getStatusBadge(status) {
      if (!status) return '';
      const s = status.trim().toLowerCase();
      let bg = 'rgba(255, 255, 255, 0.08)', color = 'rgb(228, 228, 231)', border = 'rgba(255, 255, 255, 0.18)';

      if (s.includes('resched') || s.includes('re-sched')) {
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

      return `<span class="pill" style="background:${bg}; color:${color}; border-color:${border}; font-size:10px; font-weight:700;">${status}</span>`;
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
        } else if (s.includes('resched') || s.includes('re-sched')) {
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

        return `
          <div class="glass-card card-contact" style="padding:10px 12px; ${cardBorder}" data-event-card="${item.contactId || item.contactName}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <a href="${item.contactId ? '/app/common/entity/contact.nl?id=' + item.contactId : 'javascript:void(0)'}" target="_blank" style="font-weight:700; font-size:14px; color:white;">${item.contactName}</a>
              <div style="display:flex; align-items:center; gap:4px;">
                ${item.contactId ? `<span class="pill" style="cursor:pointer; background:rgba(192,132,252,0.2); color:rgb(192,132,252); border-color:rgba(192,132,252,0.4);" data-pdf-contact="${item.contactId}" data-pdf-name="${item.contactName}">📄 PDF</span>` : ''}
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
            activePdfUrl = '/app/site/hosting/scriptlet.nl?script=customscript_scs_contact_sched_20_pdf_sl&deploy=customdeploy_scs_contact_sched_20_pdf_sl&contactId=' + cId;
            openPdfPiP();
          }
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

    seminarPill.onclick = () => {
      if (cachedMatchingSeminars) {
        renderSeminarInPiP(cachedMatchingSeminars.list, cachedMatchingSeminars.title, cachedMatchingSeminars.clientName, cachedMatchingSeminars.dates);
      }
    };

    function getWeekHeaderMap(el) {
      const mainDoc = window.opener?.document || document;
      const weekContainer = (el && (el.closest('.wkTd') || el.closest('[id*="week-"]') || el.closest('table.wkTbl') || el.closest('table'))) || mainDoc;
      if (!weekContainer) return {};
      if (cache.weekHeaders.has(weekContainer)) return cache.weekHeaders.get(weekContainer);

      const map = {};
      weekContainer.querySelectorAll('thead th.dayTh, thead th[class*="day_"], th.dayTh, th[class*="day_"]').forEach(th => {
        const m = th.className.match(/\b(day_[a-z0-9]+)\b/i);
        if (m) {
          const txt = (th.innerText || th.textContent || '').replace(/\s+/g, ' ').trim();
          if (txt && !map[m[1].toLowerCase()]) map[m[1].toLowerCase()] = txt;
        }
      });

      const dayIndexMap = { 1: 'day_mon', 2: 'day_tue', 3: 'day_wed', 4: 'day_thu', 5: 'day_fri', 6: 'day_sat' };
      weekContainer.querySelectorAll('[id*="_day_"], [id*="day_"]').forEach(span => {
        const m = span.id.match(/day_(\d+)/i);
        if (m && dayIndexMap[m[1]]) {
          const key = dayIndexMap[m[1]];
          const th = span.closest('th, td');
          const sTxt = (span.innerText || span.textContent || '').trim();
          if (th && !map[key]) map[key] = (th.innerText || th.textContent || '').replace(/\s+/g, ' ').trim();
          else if (sTxt && !map[key]) map[key] = ({ day_mon: 'Mon - ', day_tue: 'Tue - ', day_wed: 'Wed - ', day_thu: 'Thu - ', day_fri: 'Fri - ', day_sat: 'Sat - ' }[key] || '') + sTxt;
        }
      });

      cache.weekHeaders.set(weekContainer, map);
      return map;
    }

    function getAttendeeDates(el) {
      const tr = el ? el.closest('tr') : null;
      if (!tr) return '-';
      const headerMap = getWeekHeaderMap(el);
      const cells = Array.from(tr.querySelectorAll('td'));
      const dayOrder = ['day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat', 'day_mon'];
      const scheduledList = [];

      cells.forEach(td => {
        if (td.classList.contains('statusSchd') || /\bstatus(schd|conf)/i.test(td.className)) {
          const m = td.className.match(/\b(day_[a-z0-9]+)\b/i);
          if (m) {
            const dayKey = m[1].toLowerCase();
            scheduledList.push({ dayKey, dateStr: headerMap[dayKey] || dayKey.replace('day_', '').toUpperCase() });
          }
        }
      });

      if (scheduledList.length === 0) {
        const m = el.className.match(/\b(day_[a-z0-9]+)\b/i);
        if (m && headerMap[m[1].toLowerCase()]) scheduledList.push({ dayKey: m[1].toLowerCase(), dateStr: headerMap[m[1].toLowerCase()] });
      }

      scheduledList.sort((a, b) => (dayOrder.indexOf(a.dayKey) - dayOrder.indexOf(b.dayKey)));
      const unique = [...new Set(scheduledList.map(x => x.dateStr))];
      if (unique.length === 0) return '-';
      return unique.length === 1 ? `<div>${unique[0]}</div>` : `<div>${unique[0]}</div><div>${unique[unique.length - 1]}</div>`;
    }

    function safeLookupSS1(recType, internalId, fieldId) {
      try {
        const oWin = window.opener || window;
        const fn = oWin.nlapiLookupField || oWin.parent?.nlapiLookupField;
        if (typeof fn === 'function') return fn(recType, internalId, fieldId) || '';
      } catch (e) {}
      return '';
    }

    function getNetSuiteViewField(doc, fieldId, labelFallbacks = []) {
      const el = doc.querySelector(`[aria-labelledby="${fieldId}_fs_lbl"], [id="${fieldId}_val"], [id="${fieldId}_fs"], [id*="${fieldId}_val"]`);
      if (el && (el.innerText || el.textContent || '').trim()) return (el.innerText || el.textContent || '').trim();
      const formInput = doc.querySelector(`input[name="${fieldId}"], textarea[name="${fieldId}"], select[name="${fieldId}"]`);
      if (formInput && formInput.value?.trim()) return formInput.value.trim();

      for (const lbl of labelFallbacks) {
        const labelEl = Array.from(doc.querySelectorAll('.smallgraytextnolink, .uir-field-label, td.label')).find(
          e => (e.innerText || e.textContent || '').trim().toLowerCase().startsWith(lbl.toLowerCase())
        );
        if (labelEl) {
          const next = labelEl.nextElementSibling || labelEl.closest('td')?.nextElementSibling;
          const nTxt = (next?.innerText || next?.textContent || '').trim();
          if (nTxt) return nTxt;
        }
      }
      return '';
    }

    function extractNotes(doc) {
      const rows = Array.from(doc.querySelectorAll('tr[id^="usernotesrow"], [id="usernotes_splits"] tr.uir-list-row-tr'));
      const notes = [];
      for (const row of rows) {
        if (notes.length >= 5) break;
        const cells = Array.from(row.querySelectorAll('td.uir-list-row-cell, td.listtext'));
        if (cells.length >= 4) {
          const date = (cells[1]?.innerText || cells[1]?.textContent || '').trim();
          const author = (cells[2]?.innerText || cells[2]?.textContent || '').trim();
          const memo = (cells[4]?.innerText || cells[4]?.textContent || cells[3]?.innerText || cells[3]?.textContent || '').trim();
          if (memo && !/author|date|memo/i.test(author) && !notes.some(n => n.memo === memo)) {
            notes.push({ date, author, memo, timestamp: Date.parse(date.replace(/-/g, ' ')) || 0 });
          }
        }
      }
      notes.sort((a, b) => b.timestamp - a.timestamp);
      return notes;
    }

    async function getClientData(clientInternalId, fallbackBoardName = '') {
      if (cache.clients.has(clientInternalId)) return cache.clients.get(clientInternalId);
      const res = await fetch('/app/common/entity/custjob.nl?id=' + clientInternalId);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      let resolvedCompany = safeLookupSS1('customer', clientInternalId, 'companyname') || safeLookupSS1('customer', clientInternalId, 'entitytitle');
      if (!resolvedCompany || /dashboard|customer 360|list view|search/i.test(resolvedCompany)) {
        const fieldVal = (doc.querySelector('[id="companyname_val"], [id*="companyname_val"], [id="entitytitle_val"], [id="altname_val"]')?.innerText || '').trim();
        resolvedCompany = (fieldVal && !/dashboard|customer 360|list view|search/i.test(fieldVal)) ? fieldVal : (fallbackBoardName || 'Client Master');
      }

      let notes = extractNotes(doc);
      if (notes.length === 0) {
        try {
          const noteRes = await fetch('/app/crm/common/note.nl?l=T&entity=' + clientInternalId);
          if (noteRes.ok) notes = extractNotes(new DOMParser().parseFromString(await noteRes.text(), 'text/html'));
        } catch (e) {}
      }

      const data = {
        companyName: resolvedCompany,
        workPhone: safeLookupSS1('customer', clientInternalId, 'phone') || getNetSuiteViewField(doc, 'phone', ['Work Phone', 'Phone']) || html.match(/id=["']phone_val["'][^>]*>([^<]+)</i)?.[1]?.trim() || '',
        email: safeLookupSS1('customer', clientInternalId, 'email') || getNetSuiteViewField(doc, 'email', ['Email']) || html.match(/id=["']email_val["'][^>]*>([^<]+)</i)?.[1]?.trim() || '',
        comments: safeLookupSS1('customer', clientInternalId, 'comments') || getNetSuiteViewField(doc, 'comments', ['Comments']) || 'None recorded',
        cell1Phone: safeLookupSS1('customer', clientInternalId, 'mobilephone') || getNetSuiteViewField(doc, 'mobilephone', ['Cell Phone 1']) || '',
        cell1Name: safeLookupSS1('customer', clientInternalId, 'custentity3') || getNetSuiteViewField(doc, 'custentity3', ['Cell 1 Name']) || '',
        cell2Phone: safeLookupSS1('customer', clientInternalId, 'custentitycellphone2') || getNetSuiteViewField(doc, 'custentitycellphone2', ['Cell Phone 2']) || '',
        cell2Name: safeLookupSS1('customer', clientInternalId, 'custentitycell2name') || getNetSuiteViewField(doc, 'custentitycell2name', ['Cell 2 Name']) || '',
        notes
      };

      cache.clients.set(clientInternalId, data);
      return data;
    }

    async function getContactData(contactId) {
      if (cache.contacts.has(contactId)) return cache.contacts.get(contactId);
      const res = await fetch('/app/common/entity/contact.nl?id=' + contactId);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      let companyId = safeLookupSS1('contact', contactId, 'company') || safeLookupSS1('contact', contactId, 'parentcustomer');
      if (!companyId) {
        const compLink = doc.querySelector('a[href*="custjob.nl?id="], a[href*="customer.nl?id="], [id="company_val"] a, [id="parent_val"] a');
        const m = (compLink?.getAttribute('href') || '').match(/[?&]id=(\d+)/);
        if (m) companyId = m[1];
      }
      if (!companyId) {
        const m = html.match(/(?:custjob\.nl|customer\.nl)\?[^"']*id=(\d+)/i);
        if (m) companyId = m[1];
      }

      const data = {
        name: safeLookupSS1('contact', contactId, 'entityid') || getNetSuiteViewField(doc, 'entityid', ['Contact', 'Name']) || (doc.querySelector('.uir-page-title, h1')?.innerText || '').trim(),
        position: safeLookupSS1('contact', contactId, 'title') || getNetSuiteViewField(doc, 'title', ['Position', 'Position/Post']) || '',
        email: safeLookupSS1('contact', contactId, 'email') || getNetSuiteViewField(doc, 'email', ['Email']) || html.match(/mailto:([^"'>\s]+)/i)?.[1] || '',
        phone: safeLookupSS1('contact', contactId, 'phone') || safeLookupSS1('contact', contactId, 'mobilephone') || getNetSuiteViewField(doc, 'mobilephone', ['Cell Phone 1']) || getNetSuiteViewField(doc, 'phone', ['Main Phone']) || html.match(/tel:([^"'>\s]+)/i)?.[1] || '',
        comments: safeLookupSS1('contact', contactId, 'comments') || getNetSuiteViewField(doc, 'comments', ['Comments']) || 'None recorded',
        companyId: companyId || ''
      };

      cache.contacts.set(contactId, data);
      return data;
    }

    function normalizeDate(dStr) {
      if (!dStr) return '';
      const s = String(dStr).replace(/\u00a0/g, ' ').trim();
      const isoM = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (isoM) return `${isoM[1]}-${String(isoM[2]).padStart(2, '0')}-${String(isoM[3]).padStart(2, '0')}`;
      const ddmmyyyy = s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/i);
      if (ddmmyyyy) {
        const months = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
        let yr = ddmmyyyy[3];
        if (yr.length === 2) yr = '20' + yr;
        return `${yr}-${months[ddmmyyyy[2].toLowerCase()] || '01'}-${String(ddmmyyyy[1]).padStart(2, '0')}`;
      }
      const slashM = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (slashM) {
        let yr = slashM[3];
        if (yr.length === 2) yr = '20' + yr;
        return `${yr}-${String(slashM[1]).padStart(2, '0')}-${String(slashM[2]).padStart(2, '0')}`;
      }
      return '';
    }

    function getCanonicalKey(rawStr, rawDate = '') {
      if (!rawStr) return { isoDate: '', coreName: '' };
      let s = String(rawStr).replace(/\u00a0/g, ' ').toLowerCase();
      let isoDate = '';
      const foundDate = s.match(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}-[a-z]{3}-\d{2,4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/i);
      if (foundDate) isoDate = normalizeDate(foundDate[0]);
      else if (rawDate) isoDate = normalizeDate(rawDate);
      s = s.replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}-[a-z]{3}-\d{2,4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi, ' ');
      s = s.replace(/\b(edit\s*\|\s*view|edit|view|livestream|virtual|online|in person|seminar|workshop|webinar|course)\b/gi, ' ');
      s = s.replace(/[^a-z0-9\s]/g, ' ');
      const coreName = s.split(/\s+/).filter(w => w && w !== 'the' && w !== 'and').join('');
      return { isoDate, coreName };
    }

    function isSeminarHeader(el) {
      if (!el || el.classList.contains('clientRecord') || el.hasAttribute('data-clientid') || el.querySelector('.attendeeName')) return false;
      if (el.classList.contains('eventRecord')) return true;
      const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!txt || txt.length > 160) return false;
      return /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}-[A-Za-z]{3}-\d{2,4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/i.test(txt);
    }

    function parseEventCell(el) {
      if (!el) return null;
      const rawText = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      const allDates = [];
      const matches = rawText.match(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}-[A-Za-z]{3}-\d{2,4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi) || [];
      matches.forEach(d => { const n = normalizeDate(d); if (n && !allDates.includes(n)) allDates.push(n); });
      const sig = getCanonicalKey(rawText, matches[0] || '');
      return { element: el, rawText, dateStr: matches[matches.length - 1] || (matches[0] || ''), allNormDates: allDates, coreName: sig.coreName };
    }

    function findBoardEvent(targetEl) {
      const cell = targetEl.closest('td, th');
      const tr = cell ? cell.closest('tr') : null;
      if (!cell || !tr) return null;
      if (isSeminarHeader(cell)) return parseEventCell(cell);
      let cur = tr.previousElementSibling;
      while (cur) {
        for (const c of cur.children) if (isSeminarHeader(c)) return parseEventCell(c);
        cur = cur.previousElementSibling;
      }
      const table = tr.closest('table');
      if (table) {
        const thead = table.querySelector('thead');
        if (thead) {
          for (const hr of thead.querySelectorAll('tr')) {
            for (const c of hr.children) if (isSeminarHeader(c)) return parseEventCell(c);
          }
        }
      }
      const oDoc = window.opener?.document || document;
      const candidates = Array.from(oDoc.querySelectorAll('.eventRecord, td[colspan], th[colspan]')).filter(isSeminarHeader);
      const prec = candidates.filter(ev => Boolean(cell.compareDocumentPosition(ev) & Node.DOCUMENT_POSITION_PRECEDING));
      return prec.length > 0 ? parseEventCell(prec[prec.length - 1]) : null;
    }

    function getOpenBoardDateInfo() {
      const oDoc = window.opener?.document || document;
      const exactDates = new Set();
      const boardEvents = [];

      oDoc.querySelectorAll('th.dayTh, th[class*="day_"], [id*="_day_"], [id*="day_"], thead th, .wkTbl th, .wkTd th').forEach(th => {
        const txt = (th.innerText || th.textContent || '').replace(/\s+/g, ' ').trim();
        const matches = txt.match(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}-[A-Za-z]{3}-\d{2,4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi) || [];
        matches.forEach(m => {
          const n = normalizeDate(m);
          if (n) exactDates.add(n);
        });
      });

      oDoc.querySelectorAll('.eventRecord, td[colspan], th[colspan]').forEach(el => {
        if (isSeminarHeader(el)) {
          const p = parseEventCell(el);
          if (p) {
            boardEvents.push(p);
            if (p.allNormDates) p.allNormDates.forEach(d => exactDates.add(d));
          }
        }
      });

      const weekRanges = [];
      exactDates.forEach(dStr => {
        const parts = dStr.split('-').map(Number);
        if (parts.length === 3) {
          const dt = new Date(parts[0], parts[1] - 1, parts[2]);
          if (!isNaN(dt.getTime())) {
            const day = dt.getDay();
            const diffToMon = day === 0 ? -6 : 1 - day;
            const mon = new Date(dt);
            mon.setDate(dt.getDate() + diffToMon);
            const sun = new Date(mon);
            sun.setDate(mon.getDate() + 6);
            const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            weekRanges.push({ start: toIso(mon), end: toIso(sun) });
          }
        }
      });

      return { exactDates, weekRanges, boardEvents };
    }

    function isEventInOpenWeeks(item, openBoardInfo) {
      const itemDate = normalizeDate(item.date);
      if (itemDate) {
        if (openBoardInfo.exactDates.has(itemDate)) return true;
        for (const r of openBoardInfo.weekRanges) {
          if (itemDate >= r.start && itemDate <= r.end) return true;
        }
      }

      if (openBoardInfo.boardEvents && openBoardInfo.boardEvents.length > 0) {
        const sig = getCanonicalKey(item.eventTitle, item.date);
        for (const bev of openBoardInfo.boardEvents) {
          if (bev.allNormDates && itemDate && bev.allNormDates.includes(itemDate)) return true;
          if (bev.coreName && sig.coreName && (bev.coreName.includes(sig.coreName) || sig.coreName.includes(bev.coreName))) {
            if (!itemDate) return true;
            for (const r of openBoardInfo.weekRanges) {
              if (itemDate >= r.start && itemDate <= r.end) return true;
            }
          }
        }
      }
      return false;
    }

    /* Column Header-Guided Attendance Parsing with Comprehensive Status Detection */
    async function getAllAttendance(clientId) {
      if (cache.eventAttendance.has(clientId)) return cache.eventAttendance.get(clientId);
      const res = await fetch(`/app/common/entity/custjob.nl?id=${clientId}&selectedtab=custom26`);
      const html = await res.text();
      const mainDoc = new DOMParser().parseFromString(html, 'text/html');
      const allDocs = [mainDoc];

      let pageIndices = [];
      const rangeEl = mainDoc.querySelector('[data-options*="recmachcustrecord_mge_event_clientrange"]');
      if (rangeEl) {
        try {
          const opts = JSON.parse((rangeEl.getAttribute('data-options') || '').replace(/&quot;/g, '"'));
          pageIndices = opts.map(o => String(o.value)).filter(v => v !== '0' && v !== '');
        } catch (e) {}
      }
      if (!pageIndices.length) {
        const m = (html || '').match(/\b1\s+to\s+(\d+)\s+of\s+(\d+)\b/i);
        if (m) {
          const totalPages = Math.ceil(parseInt(m[2], 10) / parseInt(m[1], 10));
          for (let p = 1; p < totalPages; p++) pageIndices.push(String(p));
        }
      }

      if (pageIndices.length > 0) {
        const urls = pageIndices.map(si => `/app/common/entity/custjob.nl?id=${clientId}&q=recmachcustrecord_mge_event_clientrange&si=${si}&f=T&machine=recmachcustrecord_mge_event_client`);
        const responses = await Promise.allSettled(urls.map(u => fetch(u).then(r => r.text())));
        responses.forEach(r => {
          if (r.status === 'fulfilled' && r.value) {
            allDocs.push(new DOMParser().parseFromString(r.value, 'text/html'));
          }
        });
      }

      const results = [];
      allDocs.forEach(d => {
        d.querySelectorAll('table').forEach(tbl => {
          if (tbl.id && /usernotes|messages|activities|media/i.test(tbl.id)) return;

          let colMap = { status: -1, date: -1, title: -1 };
          const headerRow = tbl.querySelector('tr.uir-list-header-tr, tr[id*="header"], tr:has(th), tr:has(td.listheadertd)');
          if (headerRow) {
            Array.from(headerRow.children).forEach((cell, idx) => {
              const hTxt = (cell.innerText || cell.textContent || '').trim().toLowerCase();
              if (hTxt.includes('status')) colMap.status = idx;
              else if (hTxt.includes('date')) colMap.date = idx;
              else if (hTxt.includes('event') || hTxt.includes('seminar') || hTxt.includes('title') || hTxt.includes('course')) colMap.title = idx;
            });
          }

          tbl.querySelectorAll('a[href*="contact.nl?id="], a[href*="/entity/contact.nl?id="]').forEach(cLink => {
            const row = cLink.closest('tr');
            if (!row || row.querySelector('th') || row === headerRow) return;

            const contactName = (cLink.innerText || cLink.textContent || '').trim();
            const contactId = cLink.getAttribute('href')?.match(/[?&]id=(\d+)/)?.[1] || '';
            if (!contactName) return;

            const cells = Array.from(row.querySelectorAll('td'));
            let attendanceStatus = '';
            let attendanceDate = '';
            let seminarTitle = '';

            if (colMap.status !== -1 && cells[colMap.status]) {
              attendanceStatus = (cells[colMap.status].innerText || cells[colMap.status].textContent || '').replace(/\s+/g, ' ').trim();
            }
            if (colMap.date !== -1 && cells[colMap.date]) {
              attendanceDate = (cells[colMap.date].innerText || cells[colMap.date].textContent || '').replace(/\s+/g, ' ').trim();
            }
            if (colMap.title !== -1 && cells[colMap.title]) {
              seminarTitle = (cells[colMap.title].innerText || cells[colMap.title].textContent || '').replace(/\s+/g, ' ').trim();
            }

            cells.forEach(cell => {
              if (cell.contains(cLink)) return;
              const text = (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim();
              if (!text || /^(edit|view)$/i.test(text)) return;

              if (!attendanceDate && /\b\d{1,2}-[A-Za-z]{3}-\d{2,4}\b|\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/i.test(text)) {
                attendanceDate = text;
              } else if (!attendanceStatus && /\b(scheduled|rescheduled|re-scheduled|resched|attended|confirmed|cancell?ed|no[-\s]?show|noshow|ns|registered|enrolled|waitlist(ed)?|wait[-\s]?list|completed|invited|declined|tentative|pending|standby|present|did not attend|absent)\b/i.test(text)) {
                attendanceStatus = text;
              } else if (!seminarTitle && text.length > 3) {
                const isStatusWord = /\b(scheduled|rescheduled|confirmed|cancell?ed|no[-\s]?show|attended|completed|waitlist)\b/i.test(text);
                if (!isStatusWord && !/^\d+$/.test(text)) {
                  seminarTitle = text;
                }
              }
            });

            if (seminarTitle || attendanceDate || attendanceStatus) {
              const compoundKey = `${contactName}_${seminarTitle}_${attendanceDate}_${attendanceStatus}`;
              if (!results.some(r => r.compoundKey === compoundKey)) {
                results.push({ 
                  contactName, 
                  contactId, 
                  eventTitle: seminarTitle, 
                  date: attendanceDate, 
                  status: attendanceStatus || 'Scheduled', 
                  compoundKey 
                });
              }
            }
          });
        });
      });

      cache.eventAttendance.set(clientId, results);
      return results;
    }

    async function fetchAttendeeRecord(attendee) {
      const attendeeId = attendee.id;
      try {
        const res = await fetch('/app/common/custom/custrecordentry.nl?rectype=56&id=' + attendeeId);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        doc.querySelectorAll('header, nav, [id="ns-header"], [id="recent-records"], [id="header"], .uir-header, [id="div__nav"]').forEach(e => e.remove());
        const mainForm = doc.querySelector('form[name="main_form"], form[id="main_form"], [id="div__body"]') || doc.body;

        let contactId = safeLookupSS1('customrecord56', attendeeId, 'custrecord_crs_attendee_contact') || safeLookupSS1('customrecord_crs_attendee', attendeeId, 'custrecord_crs_attendee_contact');
        if (!contactId) {
          const cf = mainForm.querySelector('[id*="crs_attendee_contact"], [id*="crs_att_contact"], [id*="attendee_contact"]');
          if (cf) {
            const m = ((cf.querySelector('a')?.getAttribute('href') || '') + ' ' + (cf.querySelector('a')?.getAttribute('onclick') || '')).match(/[?&]id=(\d+)/);
            if (m) contactId = m[1];
          }
        }
        if (!contactId) {
          const ca = mainForm.querySelector('a[href*="contact.nl?id="], a[onclick*="contact.nl?id="]');
          if (ca) {
            const m = ((ca.getAttribute('href') || '') + ' ' + (ca.getAttribute('onclick') || '')).match(/[?&]id=(\d+)/);
            if (m) contactId = m[1];
          }
        }

        let clientInternalId = safeLookupSS1('customrecord56', attendeeId, 'custrecord_crs_attendee_client') || safeLookupSS1('customrecord_crs_attendee', attendeeId, 'custrecord_crs_attendee_client');
        if (!clientInternalId) {
          const clf = mainForm.querySelector('[id*="crs_attendee_client"], [id*="crs_att_client"], [id*="attendee_client"]');
          if (clf) {
            const m = ((clf.querySelector('a')?.getAttribute('href') || '') + ' ' + (clf.querySelector('a')?.getAttribute('onclick') || '')).match(/[?&]id=(\d+)/);
            if (m) clientInternalId = m[1];
          }
        }
        if (!clientInternalId) {
          const cla = mainForm.querySelector('a[href*="custjob.nl?id="], a[onclick*="custjob.nl?id="]');
          if (cla) {
            const m = ((cla.getAttribute('href') || '') + ' ' + (cla.getAttribute('onclick') || '')).match(/[?&]id=(\d+)/);
            if (m) clientInternalId = m[1];
          }
        }

        let clientDisplayText = (mainForm.querySelector('[id*="crs_attendee_client"] a, a[href*="custjob.nl"]')?.innerText || '').trim() ||
                                (doc.body.innerText || '').match(/CLIENT\s*[*]*\s*([0-9]+\s+[^\n\r]+)/i)?.[1]?.trim() || attendee.fullName.split(':')[0].trim();
        if (!clientInternalId && clientDisplayText) {
          const m = clientDisplayText.match(/^(\d+)/);
          if (m) clientInternalId = m[1];
        }

        const clientEntityId = clientDisplayText.match(/^(\d+)/)?.[1] || 'N/A';
        const positionText = getNetSuiteViewField(doc, 'custrecord_crs_att_position', ['Position', 'Position/Post']) || '-';

        document.getElementById('ns-insp-full-client').textContent = clientDisplayText;

        const btnClient = document.getElementById('ns-insp-btn-client');
        if (clientInternalId) {
          activeClientInternalId = clientInternalId;
          btnClient.href = '/app/common/entity/custjob.nl?id=' + clientInternalId;
          btnClient.textContent = `Open Client (${clientEntityId}) [id=${clientInternalId}]`;
          btnClient.style.pointerEvents = 'auto';
          btnClient.style.opacity = '1';
          document.getElementById('ns-insp-btn-save-note').disabled = false;
        } else {
          btnClient.style.pointerEvents = 'none';
          btnClient.style.opacity = '0.35';
        }

        if (contactId) {
          activeContactId = contactId;
          activePdfUrl = '/app/site/hosting/scriptlet.nl?script=customscript_scs_contact_sched_20_pdf_sl&deploy=customdeploy_scs_contact_sched_20_pdf_sl&contactId=' + contactId;

          const btnContact = document.getElementById('ns-insp-btn-contact');
          btnContact.href = '/app/common/entity/contact.nl?id=' + contactId;
          btnContact.style.pointerEvents = 'auto';
          btnContact.style.opacity = '1';

          document.getElementById('ns-insp-btn-pdf').disabled = false;

          getContactData(contactId).then(cData => {
            activeContactName = cData.name || attendee.attendeeName;
            const finalPosition = cData.position || positionText;
            document.getElementById('ns-insp-contact-name').textContent = activeContactName;
            document.getElementById('ns-insp-position').textContent = finalPosition;
            document.getElementById('ns-insp-contact-phone').innerHTML = cData.phone ? `<a href="tel:${cData.phone}">${cData.phone}</a>` : '-';

            if (cData.email) {
              const rawSched = document.getElementById('ns-insp-sched-day')?.innerText.trim() || 'Scheduled Dates';
              const isDoctor = (finalPosition || '').toLowerCase().includes('doctor');
              const greetingName = isDoctor && !/^dr\./i.test(activeContactName) ? `Dr. ${activeContactName}` : activeContactName;
              const subject = encodeURIComponent('Checking In: Travel Plans for MGE Course Sessions');
              const body = encodeURIComponent(`Hello ${greetingName},\n\nI hope you're doing well.\n\nI have you scheduled for the course room on the following dates:\n\n${rawSched}\n\nI wanted to check in and see if you've been able to make your flight and hotel reservations yet. Please let me know if you need any assistance with your travel plans.\n\nI look forward to hearing from you.`);
              document.getElementById('ns-insp-contact-email').innerHTML = `<a href="mailto:${cData.email.trim()}?subject=${subject}&body=${body}">${cData.email}</a>`;
            } else {
              document.getElementById('ns-insp-contact-email').innerHTML = '-';
            }

            document.getElementById('ns-insp-contact-comments').textContent = cData.comments;
            updatePdfPiPIfOpen(activePdfUrl, activeContactName);
          });
        } else {
          activeContactName = attendee.attendeeName;
          document.getElementById('ns-insp-contact-name').textContent = activeContactName;
          document.getElementById('ns-insp-position').textContent = positionText;
          document.getElementById('ns-insp-contact-phone').textContent = '-';
          document.getElementById('ns-insp-contact-email').innerHTML = '-';
          document.getElementById('ns-insp-contact-comments').textContent = 'None recorded';
          const btnContact = document.getElementById('ns-insp-btn-contact');
          btnContact.style.pointerEvents = 'none';
          btnContact.style.opacity = '0.35';
          document.getElementById('ns-insp-btn-pdf').disabled = true;
          updatePdfPiPIfOpen('', activeContactName);
        }

        if (clientInternalId) {
          getClientData(clientInternalId, clientDisplayText).then(clientData => {
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
              notesListEl.innerHTML = '<div style="color:rgb(161, 161, 170);">No user notes recorded on client.</div>';
            }
            document.getElementById('ns-insp-client-fetch-status').textContent = 'Resolved';
            document.getElementById('ns-insp-client-fetch-status').style.color = 'rgb(52, 211, 153)';
          });

          getAllAttendance(clientInternalId).then(allAttendance => {
            const openBoardInfo = getOpenBoardDateInfo();

            const matches = allAttendance.filter(item => {
              const isThisContact = (contactId && item.contactId === contactId) ||
                (attendee.attendeeName && item.contactName.toLowerCase().includes(attendee.attendeeName.toLowerCase()));
              if (!isThisContact) return false;
              if (item.status && /cancel/i.test(item.status)) return false;
              return isEventInOpenWeeks(item, openBoardInfo);
            });

            const eventBox = document.getElementById('ns-insp-linked-event-box');
            const eventItems = document.getElementById('ns-insp-linked-event-items');

            if (matches.length > 0) {
              seminarPill.style.display = 'inline-block';
              seminarPill.textContent = `📅 Seminar Found (${matches.length}) ↗`;
              cachedMatchingSeminars = {
                list: matches,
                title: matches[0].eventTitle || 'Linked Seminar',
                clientName: clientDisplayText,
                dates: matches[0].date || '-'
              };
              renderSeminarInPiP(matches, cachedMatchingSeminars.title, clientDisplayText, cachedMatchingSeminars.dates);

              if (eventBox && eventItems) {
                eventBox.style.display = 'block';
                eventItems.innerHTML = matches.map((m, idx) => `
                  <div style="${idx > 0 ? 'border-top:1px solid rgba(251,191,36,0.2); padding-top:5px;' : ''}">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                      <span style="font-weight:700; color:#fff; font-size:12px;">${m.eventTitle || 'Linked Seminar'}</span>
                      ${getStatusBadge(m.status)}
                    </div>
                    <div style="font-size:11px; color:rgb(251, 191, 36); margin-top:2px;">${m.date || 'This Week'}</div>
                  </div>
                `).join('');
              }
            } else {
              seminarPill.style.display = 'none';
              cachedMatchingSeminars = null;
              closeSeminarPiP();
              if (eventBox && eventItems) {
                eventBox.style.display = 'none';
                eventItems.innerHTML = '';
              }
            }
          }).catch(() => {
            seminarPill.style.display = 'none';
            cachedMatchingSeminars = null;
            closeSeminarPiP();
            const eventBox = document.getElementById('ns-insp-linked-event-box');
            if (eventBox) eventBox.style.display = 'none';
          });
        } else {
          seminarPill.style.display = 'none';
          cachedMatchingSeminars = null;
          closeSeminarPiP();
          const eventBox = document.getElementById('ns-insp-linked-event-box');
          if (eventBox) eventBox.style.display = 'none';
        }
      } catch (err) {
        console.error('Attendee resolution error:', err);
      }
    }

    function selectAttendee(attendee) {
      activeAttendeeId = attendee.id;
      activeClientInternalId = null;
      activeContactId = null;
      activeContactName = '';
      activePdfUrl = '';
      cachedMatchingSeminars = null;

      /* Highlight clicked attendee on the main scheduling board */
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
      btnAttendee.href = '/app/common/custom/custrecordentry.nl?rectype=56&id=' + attendee.id + '&e=T';
      btnAttendee.style.pointerEvents = 'auto';
      btnAttendee.style.opacity = '1';

      const btnContact = document.getElementById('ns-insp-btn-contact');
      btnContact.style.pointerEvents = 'none';
      btnContact.style.opacity = '0.35';

      fetchAttendeeRecord(attendee);
    }

    /* Multi-Strategy Client & Contact Resolver for Event Mode */
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
        const id = el.getAttribute('data-clientid') || el.getAttribute('data-customerid') || el.dataset?.clientid || el.dataset?.customerid;
        if (id && /^\d+$/.test(id)) { clientInternalId = id; break; }
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

      /* Highlight clicked attendee on the main scheduling board */
      highlightBoardElement(eventTarget);

      const nameEl = clickedCell.querySelector('.attendeeName') || clickedCell.closest('.attendeeName') || clickedCell;
      let cleanAttendeeName = '';
      if (nameEl) {
        const clone = nameEl.cloneNode(true);
        clone.querySelectorAll('.attendeeCount, i, span, svg').forEach(s => s.remove());
        cleanAttendeeName = (clone.innerText || clone.textContent || '').trim().replace(/\s+/g, ' ');
      }
      if (!cleanAttendeeName) cleanAttendeeName = (clickedCell.innerText || clickedCell.textContent || '').trim();

      const schedDatesHtml = getAttendeeDates(tr || clickedCell);
      const boardEvent = findBoardEvent(clickedCell);
      const eventDisplayHeader = boardEvent ? boardEvent.rawText : (cleanAttendeeName + ' Seminar');

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
      activeContactName = cleanAttendeeName || '';
      activePdfUrl = '';
      cachedMatchingSeminars = null;

      setPdfPiPLoading(cleanAttendeeName);

      const eventBox = document.getElementById('ns-insp-linked-event-box');
      if (eventBox) eventBox.style.display = 'none';

      document.getElementById('ns-insp-contact-name').textContent = cleanAttendeeName || 'Event Attendee(s)';
      document.getElementById('ns-insp-position').textContent = 'Seminar Participant';
      document.getElementById('ns-insp-contact-phone').innerHTML = '...';
      document.getElementById('ns-insp-contact-email').innerHTML = '...';
      document.getElementById('ns-insp-contact-comments').textContent = 'Querying attendee file...';

      const dateBlock = (boardEvent && boardEvent.dateStr) ? `<div>${boardEvent.dateStr}</div>` : schedDatesHtml;
      document.getElementById('ns-insp-sched-day').innerHTML = `${dateBlock}${fallbackStatus ? `<div style="margin-top:4px;">${getStatusBadge(fallbackStatus)}</div>` : ''}`;

      document.getElementById('ns-insp-full-client').textContent = 'Resolving client...';
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
        d.getElementById('pip-event-client').textContent = 'Client: ' + cleanAttendeeName;
        d.getElementById('pip-event-dates').innerHTML = dateBlock;
        d.getElementById('pip-contacts-count').textContent = 'Querying...';
        d.getElementById('pip-event-contacts-list').innerHTML = '<div style="color:rgb(161, 161, 170);">Querying records...</div>';
      }

      const { clientInternalId, detectedContactId, clientDisplayText } = await resolveEventClientAndContact(eventTarget, clickedCell, tr);
      activeClientInternalId = clientInternalId;
      document.getElementById('ns-insp-pill-id').textContent = clientInternalId ? ('Client ID: ' + clientInternalId) : 'Event Mode';

      if (detectedContactId) {
        activeContactId = detectedContactId;
        const btnContact = document.getElementById('ns-insp-btn-contact');
        btnContact.href = '/app/common/entity/contact.nl?id=' + detectedContactId;
        btnContact.style.pointerEvents = 'auto';
        btnContact.style.opacity = '1';

        activePdfUrl = '/app/site/hosting/scriptlet.nl?script=customscript_scs_contact_sched_20_pdf_sl&deploy=customdeploy_scs_contact_sched_20_pdf_sl&contactId=' + detectedContactId;
        document.getElementById('ns-insp-btn-pdf').disabled = false;

        getContactData(detectedContactId).then(cData => {
          activeContactName = cData.name || cleanAttendeeName;
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

          updatePdfPiPIfOpen(activePdfUrl, activeContactName);
        });
      } else {
        document.getElementById('ns-insp-contact-comments').textContent = 'Viewing seminar attendance in Document Picture-in-Picture window.';
      }

      const btnClient = document.getElementById('ns-insp-btn-client');
      if (clientInternalId) {
        btnClient.href = '/app/common/entity/custjob.nl?id=' + clientInternalId;
        btnClient.textContent = `Open Master Client File [id=${clientInternalId}]`;
        btnClient.style.pointerEvents = 'auto';
        btnClient.style.opacity = '1';
        document.getElementById('ns-insp-btn-save-note').disabled = false;

        const capturedId = clientInternalId;
        getClientData(capturedId, clientDisplayText || cleanAttendeeName).then(clientData => {
          if (activeClientInternalId !== capturedId) return;

          document.getElementById('ns-insp-full-client').textContent = clientData.companyName || cleanAttendeeName;
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
        }).catch(() => {
          if (activeClientInternalId === capturedId) {
            document.getElementById('ns-insp-client-fetch-status').textContent = 'Error';
            document.getElementById('ns-insp-client-fetch-status').style.color = 'rgb(248, 113, 113)';
          }
        });

        getAllAttendance(capturedId).then(allAttendance => {
          if (activeClientInternalId !== capturedId) return;

          const displayAttendance = boardEvent
            ? allAttendance.filter(item => {
                const itemDate = normalizeDate(item.date);
                const validDates = boardEvent.allNormDates || [];
                if (itemDate && validDates.length > 0 && !validDates.includes(itemDate)) return false;
                const sig = getCanonicalKey(item.eventTitle, item.date);
                if (boardEvent.coreName && sig.coreName && (boardEvent.coreName.includes(sig.coreName) || sig.coreName.includes(boardEvent.coreName))) return true;
                return Boolean(itemDate && validDates.includes(itemDate));
              })
            : allAttendance;

          cachedMatchingSeminars = {
            list: displayAttendance,
            title: eventDisplayHeader,
            clientName: cleanAttendeeName,
            dates: dateBlock
          };
          renderSeminarInPiP(displayAttendance, eventDisplayHeader, cleanAttendeeName, dateBlock);

          if (!activeContactId && displayAttendance.length > 0) {
            const matched = displayAttendance.find(i => cleanAttendeeName && i.contactName.toLowerCase().includes(cleanAttendeeName.toLowerCase())) || displayAttendance[0];
            if (matched && matched.contactId) {
              activeContactId = matched.contactId;
              activeContactName = matched.contactName;
              activePdfUrl = '/app/site/hosting/scriptlet.nl?script=customscript_scs_contact_sched_20_pdf_sl&deploy=customdeploy_scs_contact_sched_20_pdf_sl&contactId=' + matched.contactId;
              document.getElementById('ns-insp-btn-pdf').disabled = false;
              updatePdfPiPIfOpen(activePdfUrl, activeContactName);

              getContactData(matched.contactId).then(cData => {
                document.getElementById('ns-insp-contact-name').textContent = cData.name || matched.contactName;
                document.getElementById('ns-insp-position').textContent = cData.position || 'Seminar Participant';
                document.getElementById('ns-insp-contact-phone').innerHTML = cData.phone ? `<a href="tel:${cData.phone}">${cData.phone}</a>` : '-';
                document.getElementById('ns-insp-contact-comments').textContent = cData.comments || 'None recorded';
                if (cData.email) {
                  document.getElementById('ns-insp-contact-email').innerHTML = `<a href="mailto:${cData.email.trim()}">${cData.email}</a>`;
                }
              });
            }
          }
        });
      } else {
        document.getElementById('ns-insp-full-client').textContent = cleanAttendeeName || 'Client ID not detected';
        document.getElementById('ns-insp-client-fetch-status').textContent = 'Not Found';
        document.getElementById('ns-insp-client-fetch-status').style.color = 'rgb(251, 191, 36)';
        document.getElementById('ns-insp-notes-list').innerHTML = '<div style="color:rgb(161, 161, 170);">Click attendee or client link directly to load client notes.</div>';
        btnClient.style.pointerEvents = 'none';
        btnClient.style.opacity = '0.35';
        document.getElementById('ns-insp-btn-save-note').disabled = true;
      }
    }

    document.getElementById('ns-insp-btn-pdf').onclick = openPdfPiP;

    document.getElementById('ns-insp-btn-save-note').onclick = async () => {
      const inp = document.getElementById('ns-insp-new-note');
      const st = document.getElementById('ns-insp-save-status');
      const btn = document.getElementById('ns-insp-btn-save-note');
      const val = inp.value.trim();
      if (!val || !activeClientInternalId) return;

      btn.disabled = true;
      st.textContent = 'Saving...';
      st.style.color = 'rgb(56, 189, 248)';

      try {
        const u = '/app/crm/common/note.nl?l=T&entity=' + activeClientInternalId;
        const res = await fetch(u);
        const form = new DOMParser().parseFromString(await res.text(), 'text/html').querySelector('form[name="main_form"], form[id="main_form"]');
        const fd = new FormData();
        form.querySelectorAll('input').forEach(i => { if (i.name && i.value !== undefined) fd.set(i.name, i.value); });
        fd.set('entity', activeClientInternalId);
        fd.set('note', val);
        await fetch(form.action || u, { method: 'POST', body: fd });

        const itemHtml = `<div class="note-item" style="border-left-color:rgb(56,189,248);"><div class="note-header"><span class="note-author">You</span><span>Just now</span></div><div class="note-body">${val}</div></div>`;
        const list = document.getElementById('ns-insp-notes-list');
        if (list.innerText.includes('No user notes') || list.innerText.includes('Loading') || list.innerText.includes('Waiting') || list.innerText.includes('Click attendee')) list.innerHTML = itemHtml;
        else list.insertAdjacentHTML('afterbegin', itemHtml);

        cache.clients.delete(activeClientInternalId);
        inp.value = '';
        st.textContent = 'Saved!';
        st.style.color = 'rgb(52, 211, 153)';
        setTimeout(() => { st.textContent = ''; btn.disabled = false; }, 3000);
      } catch (err) {
        st.textContent = 'Failed to save';
        st.style.color = 'rgb(248, 113, 113)';
        btn.disabled = false;
      }
    };

    const searchInp = document.getElementById('ns-insp-search');
    const searchDrop = document.getElementById('ns-insp-dropdown');

    searchInp.oninput = () => {
      const val = searchInp.value.trim().toLowerCase();
      if (!val) { searchDrop.style.display = 'none'; searchDrop.innerHTML = ''; return; }
      const doc = window.opener?.document;
      if (!doc) return;

      const items = Array.from(doc.querySelectorAll('[data-courseattendeeid]'))
        .filter(el => (el.innerText || el.textContent || '').trim().length > 0)
        .map(el => {
          const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
          const parts = t.split(':');
          return { id: el.dataset.courseattendeeid, fullName: t, attendeeName: parts.length > 1 ? parts.slice(1).join(':').trim() : t, element: el };
        })
        .filter(x => x.fullName.toLowerCase().includes(val) || x.id.includes(val));

      if (!items.length) {
        searchDrop.style.display = 'block';
        searchDrop.innerHTML = '<div style="padding:7px 12px; color:rgb(161,161,170); font-size:11px;">No matches found</div>';
        return;
      }
      searchDrop.style.display = 'block';
      searchDrop.innerHTML = items.slice(0, 12).map(x => `<div class="search-item" data-id="${x.id}"><strong>${x.fullName}</strong></div>`).join('');
    };

    searchDrop.onclick = (e) => {
      const itemEl = e.target.closest('.search-item');
      if (!itemEl) return;
      const doc = window.opener?.document;
      const el = doc?.querySelector(`[data-courseattendeeid="${itemEl.dataset.id}"]`);
      if (el) {
        const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
        const parts = text.split(':');
        selectAttendee({ id: el.dataset.courseattendeeid, element: el, fullName: text, attendeeName: parts.length > 1 ? parts.slice(1).join(':').trim() : text });
        searchDrop.style.display = 'none';
        searchInp.value = text;
      }
    };

    function onBoardClick(e) {
      const courseTarget = e.target.closest('[data-courseattendeeid]');
      if (courseTarget) {
        const text = (courseTarget.innerText || courseTarget.textContent || '').trim().replace(/\s+/g, ' ');
        const parts = text.split(':');
        selectAttendee({
          id: courseTarget.dataset.courseattendeeid,
          element: courseTarget,
          fullName: text,
          attendeeName: parts.length > 1 ? parts.slice(1).join(':').trim() : text
        });
        return;
      }

      const clientCell = e.target.closest('[data-clientid], [data-customerid], td.clientRecord');
      const attendeeNameEl = e.target.closest('.attendeeName, .attendeeNameWrap, [class*="attendee"]');
      const contactLinkEl = e.target.closest('a[href*="contact.nl?id="], a[href*="/entity/contact.nl?id="]');
      const eventRecordCell = e.target.closest('.eventRecord');
      const tdCell = e.target.closest('td, th');

      const isInEventSection = eventRecordCell || (tdCell && findBoardEvent(tdCell));

      if (clientCell || attendeeNameEl || contactLinkEl || isInEventSection) {
        selectEventAttendee(e.target);
      }
    }

    function setBridgeStatus(connected) {
      const badge = document.getElementById('ns-bridge-status');
      if (!badge) return;
      badge.textContent = connected ? '● Connected' : '○ Reconnecting...';
      badge.style.background = connected ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)';
      badge.style.color = connected ? 'rgb(74, 222, 128)' : 'rgb(251, 191, 36)';
      badge.style.borderColor = connected ? 'rgba(34, 197, 94, 0.4)' : 'rgba(245, 158, 11, 0.4)';
    }

    window.__nsRehookOpener = function() {
      try {
        if (!window.opener || window.opener.closed) { setBridgeStatus(false); return; }
        const oDoc = window.opener.document;
        if (oDoc && oDoc.body) {
          ensureBoardStyles(oDoc);

          if (!oDoc.__nsInspectorBridgeHooked) {
            oDoc.__nsInspectorBridgeHooked = true;
            oDoc.addEventListener('click', onBoardClick, true);
            setBridgeStatus(true);
          }
        }
      } catch (err) {
        setBridgeStatus(false);
      }
    };

    setInterval(window.__nsRehookOpener, 500);
    window.__nsRehookOpener();
  }

  const script = doc.createElement('script');
  script.textContent = '(' + runInspectorApp.toString() + ')();';
  doc.head.appendChild(script);
})();