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

  try { popup.opener = window; } catch(e) {}
  popup.focus();

  if (popup.document && popup.document.getElementById('ns-main-app-container')) {
    if (typeof popup.__nsRehookOpener === 'function') popup.__nsRehookOpener(window);
    return;
  }

  const doc = popup.document;
  doc.open();
  doc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>NetSuite Inspector</title></head><body style="margin:0;padding:0;background:rgb(18,18,20);overflow:hidden;width:100vw;height:100vh;user-select:text;-webkit-user-select:text;"></body></html>');
  doc.close();

  function runInspectorApp() {
    const UI_ID = 'ns-main-app-container';
    const cache = {
      contacts: new Map(),
      clients: new Map(),
      clientContacts: new Map(),
      eventAttendance: new Map(),
      contactSchedules: new Map(),
      weekHeaders: new WeakMap()
    };

    let activeClientInternalId = null;
    let activeClientName = '';
    let activeContactId = null;
    let activeContactName = '';
    let activePdfUrl = '';
    let activeAttendeeId = null;
    let seminarPipWin = null;
    let pdfPipWin = null;
    let outlookWindow = null;
    let cachedMatchingSeminars = null;

    /* Absolute URL Resolver for Cross-Window & PiP Navigation */



    /* Geometry Memory: Track and save window position and size */
    let lastSavedGeom = '';

    window.addEventListener('resize', saveWindowGeometry);
    window.addEventListener('beforeunload', saveWindowGeometry);
    window.addEventListener('pagehide', saveWindowGeometry);
    setInterval(saveWindowGeometry, 1500);

    /* Text-Only Highlighter Styles */

    /* Name-Only Highlighter */

    window.addEventListener('pagehide', () => {
      try {
        const oWin = window.opener;
        if (oWin && !oWin.closed) {
          if (oWin.__nsInspectorActiveHandler === onBoardClick) {
            oWin.__nsInspectorActiveHandler = null;
          }
          const oDoc = oWin.document;
          if (oDoc) {
            oDoc.querySelectorAll('.ns-inspector-active-highlight').forEach(node => {
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
          }
        }
      } catch (e) {}
    });

    /* PDF.js Dynamic Loader */

    /* PDF Text Layer Extractor */

    /* Universal Date Normalizer */

    /* Extract Attendee Status from a fetched NetSuite record page (edit OR view mode) */

    /* Extract Date Substring and ISO from Line */

    /* Relationships Subtab Full Contact Discovery with Pagination */

    /* Comprehensive Contact Page Attendance/Scheduling (custom26) Machine Parser */

    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      html, body {
        margin: 0; padding: 0; width: 100%; height: 100%;
        overflow: hidden; background: rgb(18, 18, 20);
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
        font-size: 13px; color: rgb(244, 244, 245);
        user-select: text !important;
        -webkit-user-select: text !important;
      }
      ::-webkit-scrollbar { width: 5px; height: 5px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 999px; }

      .nav-bar {
        display: flex; background: rgba(24, 24, 27, 0.98);
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        padding: 8px 12px; align-items: center; justify-content: space-between; flex-shrink: 0;
        user-select: none; -webkit-user-select: none;
      }
      .app-title { font-weight: 700; font-size: 13px; color: white; display: flex; align-items: center; gap: 8px; user-select: none; -webkit-user-select: none; }

      .content-viewport { width: 100%; height: calc(100% - 46px); overflow: hidden; position: relative; }
      .view-pane { width: 100%; height: 100%; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }

      .pill {
        display: inline-block; padding: 2px 7px; border-radius: 999px;
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.18);
        color: rgb(228, 228, 231); letter-spacing: 0.5px; white-space: nowrap;
        user-select: none; -webkit-user-select: none;
      }

      .btn {
        padding: 7px 12px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px;
        display: inline-flex; align-items: center; justify-content: center; text-decoration: none;
        transition: all 0.2s ease; border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.08); color: rgb(250, 250, 250);
        user-select: none; -webkit-user-select: none;
      }
      .btn:hover { background: rgba(255, 255, 255, 0.14); }
      .btn-solid { background: linear-gradient(180deg, white 0%, rgb(228, 228, 231) 100%); color: rgb(9, 9, 11); border: 1px solid white; font-weight: 700; }
      .btn-solid:hover { background: rgb(212, 212, 216); }

      .glass-card {
        background: rgba(255, 255, 255, 0.035); border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px; padding: 10px 12px;
        user-select: text !important; -webkit-user-select: text !important;
      }
      .card-contact { border-left: 3px solid rgb(129, 140, 248); }
      .title-contact { color: rgb(129, 140, 248) !important; }
      .card-client { border-left: 3px solid rgb(56, 189, 248); }
      .title-client { color: rgb(56, 189, 248) !important; }
      .card-schedule { border-left: 3px solid rgb(251, 191, 36); }
      .title-schedule { color: rgb(251, 191, 36) !important; }
      .card-notes { border-left: 3px solid rgb(52, 211, 153); }
      .title-notes { color: rgb(52, 211, 153) !important; }

      .field-label {
        font-size: 10px; text-transform: uppercase; font-weight: 700;
        color: rgb(161, 161, 170); letter-spacing: 0.6px; margin-bottom: 2px;
        user-select: text !important; -webkit-user-select: text !important;
      }
      .field-value {
        font-size: 12px; color: rgb(250, 250, 250); font-weight: 500; word-break: break-word;
        user-select: text !important; -webkit-user-select: text !important; cursor: text;
      }
      .field-value a { color: rgb(250, 250, 250); text-decoration: none; cursor: pointer; }
      .field-value a:hover { color: rgb(56, 189, 248); }

      input[type="text"], textarea {
        width: 100%; background: rgba(9, 9, 11, 0.65); border: 1px solid rgba(255, 255, 255, 0.14);
        color: rgb(250, 250, 250); padding: 7px 11px; border-radius: 8px; font-size: 12px; outline: none;
        user-select: text !important; -webkit-user-select: text !important;
      }
      .search-results {
        max-height: 130px; overflow-y: auto; background: rgba(18, 18, 20, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 10px; display: none; margin-top: 4px;
      }
      .search-item { padding: 7px 12px; cursor: pointer; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: rgb(228, 228, 231); }
      .search-item:hover { background: rgba(255, 255, 255, 0.12); color: white; }

      .scroll-box {
        font-size: 11px; color: rgb(212, 212, 216); max-height: 52px; overflow-y: auto;
        background: rgba(9, 9, 11, 0.5); padding: 6px 8px; border-radius: 6px; white-space: pre-wrap;
        user-select: text !important; -webkit-user-select: text !important; cursor: text;
      }
      .notes-container {
        max-height: 155px; overflow-y: auto; background: rgba(9, 9, 11, 0.5);
        padding: 8px 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 8px;
        user-select: text !important; -webkit-user-select: text !important;
      }
      .note-item {
        border-left: 2px solid rgb(52, 211, 153); padding-left: 8px;
        user-select: text !important; -webkit-user-select: text !important;
      }
      .note-header { font-size: 11px; color: rgb(161, 161, 170); display: flex; justify-content: space-between; margin-bottom: 3px; }
      .note-author { font-weight: 700; color: rgb(250, 250, 250); user-select: text !important; -webkit-user-select: text !important; }
      .note-body {
        font-size: 13px; color: rgb(244, 244, 245); white-space: pre-wrap; word-break: break-word;
        user-select: text !important; -webkit-user-select: text !important; cursor: text;
      }
    `;
    document.head.appendChild(style);

    const appContainer = document.createElement('div');
    appContainer.id = UI_ID;
    appContainer.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; position:relative;';
    document.body.appendChild(appContainer);

    const seminarPill = document.getElementById('ns-seminar-pip-pill');
    const btnScan60d = document.getElementById('ns-insp-btn-scan-60d');

    /* Status Badge Resolver */

    /* Standalone 30-Day Office Outlook Window Scanner */
    btnScan60d.onclick = async () => {
      if (!activeClientInternalId) {
        alert('Please click on an attendee or client on the board first.');
        return;
      }

      const scanClientId = activeClientInternalId;
      const scanClientName = activeClientName || 'Selected Client';
      const scanContactId = activeContactId;
      const scanContactName = activeContactName;

      const outWidth = 920;
      const outHeight = 670;
      const currX = window.screenX !== undefined ? window.screenX : window.screenLeft;
      const currY = window.screenY !== undefined ? window.screenY : window.screenTop;
      const outLeft = Math.max(10, currX - outWidth - 15 >= 0 ? currX - outWidth - 15 : 20);
      const outTop = Math.max(20, currY);

      if (outlookWindow && !outlookWindow.closed) {
        outlookWindow.focus();
      } else {
        outlookWindow = window.open('', 'NSOutlook60DayWindow', `popup=1,width=${outWidth},height=${outHeight},left=${outLeft},top=${outTop},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no`);
      }

      if (!outlookWindow) {
        alert('Pop-up Blocked! Please allow pop-ups to view the 30-Day Office Outlook.');
        return;
      }

      const outDoc = outlookWindow.document;
      outDoc.open();
      outDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>30-Day Outlook • ${scanClientName}</title>
          <style>
            * { box-sizing: border-box; }
            html, body {
              margin: 0; padding: 0; width: 100%; height: 100%;
              overflow: hidden; background: rgb(18, 18, 20);
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
              font-size: 13px; color: rgb(244, 244, 245);
              user-select: text; -webkit-user-select: text;
              display: flex; flex-direction: column;
            }
            ::-webkit-scrollbar { width: 6px; height: 6px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 999px; }

            .nav-bar {
              display: flex; justify-content: space-between; align-items: center;
              padding: 10px 14px; background: rgba(24, 24, 27, 0.98);
              border-bottom: 1px solid rgba(255, 255, 255, 0.12); flex-shrink: 0;
            }
            .btn {
              padding: 5px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;
              border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(255, 255, 255, 0.08);
              color: rgb(250, 250, 250); text-decoration: none; transition: all 0.2s ease;
            }
            .btn:hover { background: rgba(255, 255, 255, 0.15); }
            .pill {
              display: inline-block; padding: 3px 8px; border-radius: 999px;
              font-size: 10px; font-weight: 700; text-transform: uppercase;
              letter-spacing: 0.5px; white-space: nowrap;
            }
            .contact-link {
              font-weight: 700; color: white; text-decoration: none; cursor: pointer;
              transition: color 0.15s ease;
            }
            .contact-link:hover {
              color: #38bdf8; text-decoration: underline;
            }
            .status-edit-link {
              display: inline-block; cursor: pointer; text-decoration: none !important;
            }
            .status-edit-link .pill {
              cursor: pointer !important; transition: transform 0.15s ease, filter 0.15s ease;
            }
            .status-edit-link:hover .pill {
              transform: scale(1.05); filter: brightness(1.25);
            }
            .table-wrap { flex: 1; overflow-y: auto; padding: 12px; }
            .table-60d { width: 100%; border-collapse: collapse; font-size: 12px; }
            .table-60d th {
              position: sticky; top: 0; background: rgb(24, 24, 27); z-index: 10;
              padding: 10px 8px; text-align: left; color: rgb(161, 161, 170);
              font-weight: 700; border-bottom: 2px solid rgba(255, 255, 255, 0.14);
            }
            .table-60d td {
              padding: 9px 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.06);
              vertical-align: middle; color: rgb(244, 244, 245);
            }
            .table-60d tr:hover { background: rgba(255, 255, 255, 0.035); }
          </style>
        </head>
        <body>
          <div class="nav-bar">
            <div>
              <div style="font-weight:700; font-size:14px; color:#38bdf8;">📅 Office 30-Day Attendance Outlook</div>
              <div id="out-client-header" style="font-size:11px; color:rgb(161,161,170); margin-top:2px;">Client: ${scanClientName}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <button id="out-btn-copy-sched" class="btn" style="background:rgba(251,191,36,0.15); color:#fbbf24; border:1px solid rgba(251,191,36,0.4);" title="Copy grouped Scheduled contacts and dates">📋 Copy Scheduled</button>
              <button id="out-btn-close" class="btn">✕ Close</button>
            </div>
          </div>

          <div id="out-progress-box" style="padding:8px 14px; font-size:11px; color:rgb(251,191,36); background:rgba(251,191,36,0.08); border-bottom:1px solid rgba(251,191,36,0.2); display:flex; align-items:center; gap:8px;">
            <span>Resolving contact schedules and statuses: </span>
            <strong id="out-progress-count">0 / 0</strong>
          </div>

          <div class="table-wrap">
            <table class="table-60d">
              <thead>
                <tr>
                  <th style="width:25%;">Attendee</th>
                  <th style="width:30%;">Course / Seminar</th>
                  <th style="width:16%;">Date</th>
                  <th style="width:12%;">Status</th>
                  <th style="width:9%;">Timeline</th>
                  <th style="width:8%;">Actions</th>
                </tr>
              </thead>
              <tbody id="out-tbody">
                <tr><td colspan="6" style="text-align:center; color:rgb(161,161,170); padding:30px;">Discovering office contacts (Relationships subtab)...</td></tr>
              </tbody>
            </table>
          </div>
        </body>
        </html>
      `);
      outDoc.close();

      const outCloseBtn = outDoc.getElementById('out-btn-close');
      if (outCloseBtn) outCloseBtn.onclick = () => { outlookWindow.close(); };

      const outCopySchedBtn = outDoc.getElementById('out-btn-copy-sched');
      const progressBox = outDoc.getElementById('out-progress-box');
      const progressCount = outDoc.getElementById('out-progress-count');
      const tbody = outDoc.getElementById('out-tbody');

      let currentUpcomingEvents = [];



      if (outCopySchedBtn) {
        outCopySchedBtn.onclick = async () => {
          const scheduledOnly = currentUpcomingEvents.filter(ev => {
            const s = (ev.status || '').trim().toLowerCase();
            const t = (ev.title || '').trim().toLowerCase();

            if (s.includes('change') || s.includes('resched') || t.includes('schedule change') || t.includes('sched change')) {
              return false;
            }

            return s === 'scheduled' || (s.startsWith('sched') && !s.includes('change'));
          });

          if (!scheduledOnly.length) {
            const orig = outCopySchedBtn.textContent;
            outCopySchedBtn.textContent = 'None Scheduled';
            setTimeout(() => { outCopySchedBtn.textContent = orig; }, 2000);
            return;
          }

          const courseGroups = new Map();
          scheduledOnly.forEach(ev => {
            const courseTitle = ev.title || 'Scheduled Seminar';
            if (!courseGroups.has(courseTitle)) {
              courseGroups.set(courseTitle, []);
            }
            courseGroups.get(courseTitle).push(`${ev.contactName} - ${ev.dateStr}`);
          });

          const outputBlocks = [];
          for (const [courseTitle, attendees] of courseGroups.entries()) {
            outputBlocks.push(`${courseTitle}\n` + attendees.join('\n'));
          }
          const exportText = outputBlocks.join('\n\n');

          try {
            await copyToClipboard(exportText);
            const orig = outCopySchedBtn.textContent;
            outCopySchedBtn.textContent = `✓ Copied (${scheduledOnly.length})!`;
            outCopySchedBtn.style.color = '#4ade80';
            outCopySchedBtn.style.borderColor = 'rgba(74, 222, 128, 0.5)';
            setTimeout(() => {
              outCopySchedBtn.textContent = orig;
              outCopySchedBtn.style.color = '#fbbf24';
              outCopySchedBtn.style.borderColor = 'rgba(251, 191, 36, 0.4)';
            }, 2500);
          } catch (err) {
            alert('Failed to copy to clipboard:\n\n' + exportText);
          }
        };
      }

      try {
        const [contacts, clientAttendance] = await Promise.all([
          getAllClientContacts(scanClientId),
          getAllAttendance(scanClientId).catch(() => [])
        ]);

        if (scanContactId && !contacts.some(c => c.id === scanContactId)) {
          contacts.push({ id: scanContactId, name: scanContactName || 'Selected Attendee', position: '' });
        }

        if (outlookWindow.closed) return;

        if (!contacts.length) {
          progressBox.style.display = 'none';
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:rgb(248,113,113); padding:30px;">No registered contacts found under Relationships tab.</td></tr>';
          return;
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const thirtyDaysOut = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

        const upcomingEvents = [];
        let processedCount = 0;
        progressCount.textContent = `0 / ${contacts.length}`;

        const chunkSize = 2;
        for (let i = 0; i < contacts.length; i += chunkSize) {
          if (outlookWindow.closed) return;
          const chunk = contacts.slice(i, i + chunkSize);

          await Promise.all(chunk.map(async (contact) => {
            const pdfUrl = `/app/site/hosting/scriptlet.nl?script=customscript_scs_contact_sched_20_pdf_sl&deploy=customdeploy_scs_contact_sched_20_pdf_sl&contactId=${contact.id}`;
            
            const [schedRecords, pdfLines] = await Promise.all([
              getContactSchedulingRecords(contact.id).catch(() => []),
              extractLinesFromPdf(pdfUrl).catch(() => [])
            ]);

            // 1. Process records discovered directly from contact scheduling subtabs
            schedRecords.forEach(rec => {
              if (rec.iso) {
                const p = rec.iso.split('-').map(Number);
                const dt = new Date(p[0], p[1] - 1, p[2]);

                if (!isNaN(dt.getTime()) && dt >= now && dt <= thirtyDaysOut) {
                  const diffDays = Math.ceil((dt - now) / (1000 * 60 * 60 * 24));
                  const k = `${contact.id}_${rec.title}_${rec.iso}`;

                  if (!upcomingEvents.some(x => x.key === k)) {
                    upcomingEvents.push({
                      key: k,
                      contactName: contact.name,
                      contactId: contact.id,
                      position: contact.position || 'Contact',
                      title: rec.title,
                      dateStr: rec.rawDate,
                      iso: rec.iso,
                      status: rec.status || 'Scheduled',
                      editUrl: rec.editUrl || '',
                      timestamp: dt.getTime(),
                      diffDays,
                      pdfUrl
                    });
                  }
                }
              }
            });

            // 2. Correlate with PDF text extract layer and enrich missing edit links
            for (let lineIdx = 0; lineIdx < pdfLines.length; lineIdx++) {
              const line = pdfLines[lineIdx];
              const dateInfo = extractDateFromLine(line);

              if (dateInfo && dateInfo.iso) {
                const p = dateInfo.iso.split('-').map(Number);
                const dt = new Date(p[0], p[1] - 1, p[2]);

                if (!isNaN(dt.getTime()) && dt >= now && dt <= thirtyDaysOut) {
                  const diffDays = Math.ceil((dt - now) / (1000 * 60 * 60 * 24));
                  let cleanTitle = line.replace(dateInfo.rawDate, '')
                                       .replace(/\b(edit|view|scheduled|confirmed|completed|rescheduled|schedule\s*change|the|on|dates?)\b/gi, '')
                                       .replace(/[^a-zA-Z0-9\s&/'"-]/g, ' ')
                                       .replace(/\s+/g, ' ')
                                       .trim();

                  if (cleanTitle.length < 4) {
                    const prevLine = lineIdx > 0 ? pdfLines[lineIdx - 1] : '';
                    const nextLine = lineIdx + 1 < pdfLines.length ? pdfLines[lineIdx + 1] : '';

                    if (prevLine && !extractDateFromLine(prevLine)) {
                      cleanTitle = prevLine.replace(/\b(edit|view|scheduled|confirmed|completed|rescheduled)\b/gi, '').trim();
                    } else if (nextLine && !extractDateFromLine(nextLine)) {
                      cleanTitle = nextLine.replace(/\b(edit|view|scheduled|confirmed|completed|rescheduled)\b/gi, '').trim();
                    } else {
                      cleanTitle = 'Scheduled Seminar';
                    }
                  }

                  const matchedSchedule = schedRecords.find(sr => 
                    (sr.iso && sr.iso === dateInfo.iso) || 
                    areDatesSameWeek(sr.iso, dateInfo.iso) ||
                    (sr.title && cleanTitle && (sr.title.toLowerCase().includes(cleanTitle.toLowerCase()) || cleanTitle.toLowerCase().includes(sr.title.toLowerCase())))
                  );

                  const matchedClientAtt = clientAttendance.find(ca =>
                    (ca.contactId === contact.id || (ca.contactName && ca.contactName.toLowerCase().includes(contact.name.toLowerCase()))) &&
                    ((ca.date && dateInfo.rawDate && ca.date.includes(dateInfo.rawDate)) || areDatesSameWeek(normalizeDate(ca.date), dateInfo.iso) ||
                     (ca.eventTitle && cleanTitle && (ca.eventTitle.toLowerCase().includes(cleanTitle.toLowerCase()) || cleanTitle.toLowerCase().includes(ca.eventTitle.toLowerCase()))))
                  );

                  const resolvedEdit = matchedSchedule?.editUrl || matchedClientAtt?.editUrl || '';
                  const resolvedStatus = matchedSchedule?.status || matchedClientAtt?.status || 'Scheduled';

                  const k = `${contact.id}_${cleanTitle}_${dateInfo.iso}`;
                  const existingIdx = upcomingEvents.findIndex(x => x.key === k || (x.contactId === contact.id && (x.iso === dateInfo.iso || areDatesSameWeek(x.iso, dateInfo.iso))));

                  if (existingIdx !== -1) {
                    if (resolvedStatus && (!upcomingEvents[existingIdx].status || upcomingEvents[existingIdx].status === 'Scheduled')) {
                      upcomingEvents[existingIdx].status = resolvedStatus;
                    }
                    if (resolvedEdit && !upcomingEvents[existingIdx].editUrl) {
                      upcomingEvents[existingIdx].editUrl = resolvedEdit;
                    }
                  } else {
                    upcomingEvents.push({
                      key: k,
                      contactName: contact.name,
                      contactId: contact.id,
                      position: contact.position || 'Contact',
                      title: cleanTitle,
                      dateStr: dateInfo.rawDate,
                      iso: dateInfo.iso,
                      status: resolvedStatus,
                      editUrl: resolvedEdit,
                      timestamp: dt.getTime(),
                      diffDays,
                      pdfUrl
                    });
                  }
                }
              }
            }

            processedCount++;
            if (!outlookWindow.closed) {
              progressCount.textContent = `${processedCount} / ${contacts.length}`;
            }
          }));
        }

        if (outlookWindow.closed) return;
        progressBox.style.display = 'none';

        if (!upcomingEvents.length) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:rgb(161,161,170); padding:30px;">No upcoming sessions scheduled in the next 60 days for this office.</td></tr>';
          return;
        }

        upcomingEvents.sort((a, b) => a.timestamp - b.timestamp);
        currentUpcomingEvents = upcomingEvents;

        tbody.innerHTML = upcomingEvents.map(ev => {
          let badge = `<span class="pill" style="background:rgba(56,189,248,0.2); color:#38bdf8; border:1px solid rgba(56,189,248,0.4);">In ${ev.diffDays} day(s)</span>`;
          if (ev.diffDays === 0) badge = `<span class="pill" style="background:rgba(34,197,94,0.25); color:#4ade80; border:1px solid rgba(34,197,94,0.6);">Today</span>`;
          else if (ev.diffDays === 1) badge = `<span class="pill" style="background:rgba(251,191,36,0.2); color:#fbbf24; border:1px solid rgba(251,191,36,0.4);">Tomorrow</span>`;

          const fullPdfUrl = toAbsoluteNsUrl(ev.pdfUrl);
          const fullContactUrl = toAbsoluteNsUrl('/app/common/entity/contact.nl?id=' + ev.contactId);
          
          let rawEdit = ev.editUrl;
          if (!rawEdit && ev.contactId) {
            rawEdit = `/app/common/entity/contact.nl?id=${ev.contactId}&selectedtab=custom26&e=T`;
          }
          const fullEditUrl = toAbsoluteNsUrl(rawEdit);

          return `
            <tr>
              <td>
                <a href="${fullContactUrl}" target="_blank" class="contact-link" title="Open Contact File">${ev.contactName} ↗</a>
                <div style="font-size:10px; color:rgb(161,161,170);">${ev.position}</div>
              </td>
              <td style="font-weight:600; color:#fbbf24;">${ev.title}</td>
              <td style="white-space:nowrap;">${ev.dateStr}</td>
              <td style="white-space:nowrap;">
                <a href="${fullEditUrl}" data-action-edit="${fullEditUrl}" target="_blank" class="status-edit-link" title="Click to open Edit record">
                  ${getStatusBadge(ev.status || 'Scheduled')}
                </a>
              </td>
              <td style="white-space:nowrap;">${badge}</td>
              <td style="white-space:nowrap;">
                <button class="pill" style="cursor:pointer; background:rgba(192,132,252,0.2); color:rgb(192,132,252); border:1px solid rgba(192,132,252,0.4);" data-action-pdf="${fullPdfUrl}" data-action-name="${ev.contactName}">📄 PDF</button>
              </td>
            </tr>
          `;
        }).join('');

        tbody.querySelectorAll('.status-edit-link').forEach(link => {
          link.onclick = (e) => {
            const editUrl = link.getAttribute('data-action-edit') || link.getAttribute('href');
            if (!editUrl) return;

            const curX = outlookWindow.screenX !== undefined ? outlookWindow.screenX : outlookWindow.screenLeft;
            const curY = outlookWindow.screenY !== undefined ? outlookWindow.screenY : outlookWindow.screenTop;
            const curW = outlookWindow.outerWidth || 920;

            let targetLeft = curX + curW + 15;
            if (targetLeft + 860 > (window.screen.availWidth || 1920)) {
              targetLeft = Math.max(10, curX - 875);
              if (targetLeft <= 10) targetLeft = Math.max(20, curX + 30);
            }
            const targetTop = Math.max(20, curY);

            const winFeatures = `popup=1,width=860,height=820,left=${targetLeft},top=${targetTop},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`;

            try {
              const editWin = outlookWindow.open(editUrl, 'NSEditRecordWindow_' + Date.now(), winFeatures);
              if (editWin && !editWin.closed) {
                editWin.focus();
                e.preventDefault();
                return;
              }
            } catch (err) {}

            try {
              const rootWin = window.opener || window;
              const editWin = rootWin.open(editUrl, 'NSEditRecordWindow_' + Date.now(), winFeatures);
              if (editWin && !editWin.closed) {
                editWin.focus();
                e.preventDefault();
                return;
              }
            } catch (err) {}
          };
        });

        tbody.querySelectorAll('[data-action-pdf]').forEach(btn => {
          btn.onclick = () => {
            activePdfUrl = btn.getAttribute('data-action-pdf');
            activeContactName = btn.getAttribute('data-action-name');
            openPdfPiP();
          };
        });

      } catch (err) {
        if (!outlookWindow.closed) {
          progressBox.style.display = 'none';
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:rgb(248,113,113); padding:30px;">Scan failed: ${err.message}</td></tr>`;
        }
      }
    };




















        /* Resilient Multi-Attendee Attendance Parsing */



    /* Multi-Strategy Client & Contact Resolver with Colon Extraction */


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

    /* Active Delegator Rehook Mechanism */
    window.__nsRehookOpener = function(explicitOpener) {
      try {
        if (explicitOpener && !explicitOpener.closed) {
          try { window.opener = explicitOpener; } catch (e) {}
        }
        const oWin = window.opener;
        if (!oWin || oWin.closed) { setBridgeStatus(false); return; }
        const oDoc = oWin.document;
        if (oDoc && oDoc.body) {
          ensureBoardStyles(oDoc);

          oWin.__nsInspectorActiveHandler = onBoardClick;

          if (!oWin.__nsInspectorListenerInstalled) {
            oWin.__nsInspectorListenerInstalled = true;
            oDoc.addEventListener('click', function(e) {
              if (typeof oWin.__nsInspectorActiveHandler === 'function') {
                try {
                  oWin.__nsInspectorActiveHandler(e);
                } catch (err) {
                  oWin.__nsInspectorActiveHandler = null;
                }
              }
            }, true);
          }

          setBridgeStatus(true);
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
