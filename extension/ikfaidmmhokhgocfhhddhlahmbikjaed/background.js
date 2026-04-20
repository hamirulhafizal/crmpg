// ================= BUTTONS =================
const downloadCustomer = document.getElementById("btn-download-customer");
const downloadSales = document.getElementById("btn-download-sales");
const downloadGroupSales = document.getElementById("btn-download-group-sales");
const downloadPgmall = document.getElementById("btn-download-pgmall");
const downloadAutodebit = document.getElementById("btn-download-autodebit");

// ================= COMMON XLSX HELPER =================
function exportXLSX(data, filename, textCols = []) {
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Force TEXT type for selected columns
    textCols.forEach(col => {
        const colLetter = XLSX.utils.encode_col(col);
        Object.keys(ws).forEach(cell => {
            if (cell.startsWith(colLetter)) {
                ws[cell].t = 's';
            }
        });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filename);
}

// ================= CHROME SCRIPT EXEC =================
async function runInActiveTab(fn) {
    let [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: fn
    });
}

/** Run a function in the active tab and return its result (for sync). */
function runInActiveTabWithResult(fn) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs || !tabs[0]) {
                reject(new Error('No active tab'));
                return;
            }
            chrome.scripting.executeScript({
                target: {tabId: tabs[0].id},
                function: fn
            }, (results) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (results && results[0] && results[0].result !== undefined) {
                    resolve(results[0].result);
                } else {
                    reject(new Error('No data from page'));
                }
            });
        });
    });
}

/** Run a function in the active tab with arguments (MV3: func + args). */
function runInActiveTabWithResultArgs(fn, args) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs || !tabs[0]) {
                reject(new Error('No active tab'));
                return;
            }
            chrome.scripting.executeScript({
                target: {tabId: tabs[0].id},
                func: fn,
                args: args || []
            }, (results) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (results && results[0] && results[0].result !== undefined) {
                    resolve(results[0].result);
                } else {
                    reject(new Error('No data from page'));
                }
            });
        });
    });
}

/** Injected into pgmall.my to return customer rows as array of objects for sync. */
function getCustomerRowsForSync() {
    function toTitleCase(s) {
        if (!s || typeof s !== 'string') return s;
        return s.trim().split(/\s+/).map(function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join(' ');
    }
    const company = document.querySelector('#company_select') && document.querySelector('#company_select').value;
    const tables = document.querySelectorAll('.business-center-data-table');
    const table = tables[1];
    if (!table) return [];
    const tbody = table.querySelector('tbody');
    if (!tbody) return [];
    const trs = tbody.querySelectorAll('tr');
    const rows = [];
    const isCompany1 = company === '1';
    for (let i = 0; i < trs.length; i++) {
        const td = trs[i].querySelectorAll('td');
        if (td.length < 5) continue;
        const get = (idx) => (td[idx] && td[idx].textContent && td[idx].textContent.replace(/\s{2,}/g, ' ').trim()) || '';
        if (isCompany1) {
            rows.push({
                PGCode: get(1),
                Email: get(2),
                'Profile Verified': get(3),
                Name: toTitleCase(get(4)),
                'Parent Name': toTitleCase(get(5)),
                'D.O.B.': get(6),
                Rank: get(7),
                Branch: get(8),
                Telephone: get(9),
                'Total Frontline': get(10),
                'Empire Size': get(11),
                'Date Register': get(12),
                'Last Purchase Date': get(13)
            });
        } else {
            rows.push({
                PGCode: get(1),
                Email: get(2),
                Name: toTitleCase(get(3)),
                'D.O.B.': get(4),
                Rank: get(5),
                Telephone: get(6),
                'Total Frontline': get(7),
                'Empire Size': get(8),
                'Date Register': get(9),
                'Last Purchase Date': get(10)
            });
        }
    }
    return rows;
}

/**
 * Injected into bc.pgmall.my: fetch viewDownlineInfo for one page (filter_company=0).
 * First arg: page number (1-based). Returns { rows, totalPages } — totalPages set only when page === 1.
 */
async function fetchDownlineSinglePage(pageNum) {
    function toTitleCase(s) {
        if (!s || typeof s !== 'string') return s;
        return s.trim().split(/\s+/).map(function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join(' ');
    }
    function parseTotalPagesFromDoc(doc) {
        var el = doc.querySelector('.pagination-result-block');
        if (el) {
            var m = (el.textContent || '').match(/\(\s*(\d+)\s*Pages?\s*\)/i);
            if (m) return Math.max(1, parseInt(m[1], 10));
        }
        var links = doc.querySelectorAll('.pagination-count-block a[href*="page="]');
        var max = 1;
        for (var li = 0; li < links.length; li++) {
            try {
                var u = new URL(links[li].href);
                var p = parseInt(u.searchParams.get('page'), 10);
                if (!isNaN(p) && p > max) max = p;
            } catch (e) { /* skip */ }
        }
        return max;
    }
    var page = parseInt(pageNum, 10);
    if (isNaN(page) || page < 1) page = 1;

    var input = document.querySelector('input[name="current-customer-id"]');
    var customerId = input && input.value && String(input.value).trim();
    if (!customerId) {
        try {
            var u = new URL(window.location.href);
            customerId = u.searchParams.get('customer_id') || '';
        } catch (e) {
            customerId = '';
        }
    }
    if (!customerId) return { rows: [], totalPages: page === 1 ? 1 : null };

    var company = document.querySelector('#company_select') && document.querySelector('#company_select').value;
    var isCompany1 = company === '1';

    var params = new URLSearchParams();
    params.set('route', 'business/group_details/viewDownlineInfo');
    params.set('page', String(page));
    params.set('filter_company', '0');
    params.set('customer_id', customerId);

    var url = 'https://bc.pgmall.my/index.php?' + params.toString();
    var res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return { rows: [], totalPages: page === 1 ? 1 : null };

    var html = await res.text();
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var totalPages = null;
    if (page === 1) {
        totalPages = parseTotalPagesFromDoc(doc);
    }
    var table = doc.querySelector('#group_detail_info_table table.business-center-data-table');
    if (!table) return { rows: [], totalPages: totalPages };
    var tbody = table.querySelector('tbody');
    if (!tbody) return { rows: [], totalPages: totalPages };
    var trs = tbody.querySelectorAll('tr');
    var rows = [];
    for (var i = 0; i < trs.length; i++) {
        var td = trs[i].querySelectorAll('td');
        if (td.length < 5) continue;
        var get = function (idx) {
            return (td[idx] && td[idx].textContent && td[idx].textContent.replace(/\s{2,}/g, ' ').trim()) || '';
        };
        if (isCompany1) {
            rows.push({
                PGCode: get(1),
                Email: get(2),
                'Profile Verified': get(3),
                Name: toTitleCase(get(4)),
                'Parent Name': toTitleCase(get(5)),
                'D.O.B.': get(6),
                Rank: get(7),
                Branch: get(8),
                Telephone: get(9),
                'Total Frontline': get(10),
                'Empire Size': get(11),
                'Date Register': get(12),
                'Last Purchase Date': get(13)
            });
        } else {
            rows.push({
                PGCode: get(1),
                Email: get(2),
                Name: toTitleCase(get(3)),
                'D.O.B.': get(4),
                Rank: get(5),
                Telephone: get(6),
                'Total Frontline': get(7),
                'Empire Size': get(8),
                'Date Register': get(9),
                'Last Purchase Date': get(10)
            });
        }
    }
    return { rows: rows, totalPages: totalPages };
}

// ================= POPUP COMM =================
document.addEventListener('DOMContentLoaded', function () {
    const port = chrome.runtime.connect();
    document.getElementById('popupBtn')?.addEventListener('click', () => {
        port.postMessage({from: 'popup', start: 'Y'});
    });
});

// ================= DOWNLOAD CUSTOMER =================
downloadCustomer.addEventListener("click", () => runInActiveTab(() => {

    const company = $('#company_select').val();
    const tables = $('.business-center-data-table');
    const table = tables.eq(1);
    const data = [];

    if (company === '1') {
        data.push([
            'PGCode', 'Email', 'Profile Verified', 'Name', 'Parent Name',
            'D.O.B.', 'Rank', 'Branch', 'Telephone',
            'Total Frontline', 'Empire Size', 'Date Register',
            'Last Purchase Date', 'Autodebit', 'Amount', 'Date'
        ]);

        table.find("tbody>tr").each((_, tr) => {

            let auto = $(tr).find("td:eq(14)").text();
            let isAuto = 'No', amount = '', date = '';

            if (!auto.includes('No')) {
                const lines = auto.split(/\r?\n/);
                if (lines.length > 11) {
                    isAuto = 'Yes';
                    amount = lines[8].replace('RM', '').replace(',', '').trim();
                    date = lines[11].trim();
                }
            }

            data.push([
                $(tr).find("td:eq(1)").text(),
                $(tr).find("td:eq(2)").text(),
                $(tr).find("td:eq(3)").text(),
                $(tr).find("td:eq(4)").text(),
                $(tr).find("td:eq(5)").text().replace(/\s{2,}/g, ''),
                $(tr).find("td:eq(6)").text().replace(/\s{2,}/g, ''),
                $(tr).find("td:eq(7)").text(),
                $(tr).find("td:eq(8)").text().replace(/\s{2,}/g, '').replace(',', ''),
                $(tr).find("td:eq(9)").text().replace(/\s{2,}/g, '').trim(),
                $(tr).find("td:eq(10)").text(),
                $(tr).find("td:eq(11)").text(),
                $(tr).find("td:eq(12)").text(),
                $(tr).find("td:eq(13)").text(),
                isAuto,
                amount,
                date
            ]);
        });

        exportXLSX(data, 'customer.xlsx', [0, 8]);

    } else {
        data.push([
            'PGCode', 'Email', 'Name', 'D.O.B.', 'Rank',
            'Telephone', 'Total Frontline', 'Empire Size',
            'Date Register', 'Last Purchase Date'
        ]);

        table.find("tbody>tr").each((_, tr) => {
            data.push([
                $(tr).find("td:eq(1)").text(),
                $(tr).find("td:eq(2)").text(),
                $(tr).find("td:eq(3)").text().replace(/\s{2,}/g, ''),
                $(tr).find("td:eq(4)").text().replace(/\s{2,}/g, ''),
                $(tr).find("td:eq(5)").text(),
                $(tr).find("td:eq(6)").text().replace(/\s{2,}/g, '').trim(),
                $(tr).find("td:eq(7)").text().replace(/\s{2,}/g, ''),
                $(tr).find("td:eq(8)").text(),
                $(tr).find("td:eq(9)").text(),
                $(tr).find("td:eq(10)").text()
            ]);
        });

        exportXLSX(data, 'customer.xlsx', [0, 5]);
    }
}));

// ================= DOWNLOAD SALES =================
downloadSales.addEventListener("click", () => runInActiveTab(() => {

    const data = [];

    $("#personal_sales_table>tbody>tr").each((_, tr) => {
        let split = $(tr).find("td:eq(3)").text().split('(');
        data.push([
            $(tr).find("td:eq(0)").text(),
            $(tr).find("td:eq(1)").text(),
            $(tr).find("td:eq(2)").text(),
            split[0].trim(),
            split[1]?.replace(')', '').trim(),
            $(tr).find("td:eq(4)").text().replace(/\s{2,}/g, '').trim(),
            $(tr).find("td:eq(5)").text().replace(/\s{2,}/g, '').replace(',', '')
        ]);
    });

    exportXLSX(data, 'sales.xlsx', [5]);
}));

// ================= DOWNLOAD GROUP SALES =================
downloadGroupSales.addEventListener("click", () => runInActiveTab(() => {

    const data = [];

    $("#group_sales_table>tbody>tr").each((_, tr) => {
        let split = $(tr).find("td:eq(0)").text().split('(');
        data.push([
            split[0].trim(),
            split[1]?.replace(')', '').trim(),
            $(tr).find("td:eq(1)").text(),
            $(tr).find("td:eq(2)").text().replace(/\s{2,}/g, '').replace(',', '')
        ]);
    });

    exportXLSX(data, 'group_sales.xlsx', [1]);
}));

// ================= DOWNLOAD PGMALL =================
downloadPgmall.addEventListener("click", () => runInActiveTab(() => {

    const data = [];

    $("#personal_sales_active_ratio_table>tbody>tr").each((_, tr) => {
        data.push([
            $(tr).find("td:eq(1)").text().trim(),
            $(tr).find("td:eq(2)").text().trim(),
            $(tr).find("td:eq(3)").text(),
            $(tr).find("td:eq(4)").text(),
            $(tr).find("td:eq(5)").text(),
            $(tr).find("td:eq(6)").text(),
            $(tr).find("td:eq(7)").text().replace(',', ''),
            $(tr).find("td:eq(8)").text().replace(',', ''),
            $(tr).find("td:eq(9)").text()
        ]);
    });

    exportXLSX(data, 'pgmall.xlsx');
}));

// ================= DOWNLOAD AUTODEBIT =================
downloadAutodebit.addEventListener("click", () => runInActiveTab(() => {

    const data = [
        ['PGCode', 'Name', 'Telephone', 'Autodebit', 'Amount', 'Date']
    ];

    $("#gsap_direct_debit_table>tbody>tr").each((_, tr) => {
        let split = $(tr).find("td:eq(0)").text().split('(');
        data.push([
            split[0].trim(),
            split[1]?.replace(')', '').trim(),
            $(tr).find("td:eq(1)").text().replace(/\s{2,}/g, '').trim(),
            $(tr).find("td:eq(3)").text(),
            $(tr).find("td:eq(5)").text().replace(',', ''),
            $(tr).find("td:eq(2)").text()
        ]);
    });

    exportXLSX(data, 'autodebit.xlsx', [1, 2]);
}));

// ================= SYNC TO SUPABASE =================
(function () {
    const btnSync = document.getElementById('btn-sync-supabase');
    const btnSync2 = document.getElementById('btn-sync-supabase-2');
    const syncProgress = document.getElementById('syncProgress');
    const syncProgressFill = document.getElementById('syncProgressFill');
    const syncProgressText = document.getElementById('syncProgressText');
    const SYNC2_STATE_KEY = 'sync2_resume_state_v1';

    if (!syncProgress) return;
    if (!btnSync && !btnSync2) return;

    function setBusy(busy) {
        if (btnSync) btnSync.disabled = busy;
        if (btnSync2) btnSync2.disabled = busy;
    }

    function setProgress(pct, text) {
        if (syncProgressFill) syncProgressFill.style.width = (pct || 0) + '%';
        if (syncProgressText) syncProgressText.textContent = text || '';
    }

    function storageGet(key) {
        return new Promise(function (resolve) {
            chrome.storage.local.get(key, function (data) {
                resolve(data && data[key] !== undefined ? data[key] : null);
            });
        });
    }

    function storageSet(key, value) {
        return new Promise(function (resolve) {
            var payload = {};
            payload[key] = value;
            chrome.storage.local.set(payload, function () { resolve(); });
        });
    }

    function storageRemove(key) {
        return new Promise(function (resolve) {
            chrome.storage.local.remove(key, function () { resolve(); });
        });
    }

    async function getSync2State(userId) {
        var allState = await storageGet(SYNC2_STATE_KEY);
        if (!allState || typeof allState !== 'object') return null;
        return allState[userId] || null;
    }

    async function setSync2State(userId, patch) {
        var allState = await storageGet(SYNC2_STATE_KEY);
        if (!allState || typeof allState !== 'object') allState = {};
        allState[userId] = Object.assign({}, allState[userId] || {}, patch || {}, {
            updatedAt: Date.now()
        });
        await storageSet(SYNC2_STATE_KEY, allState);
    }

    async function clearSync2State(userId) {
        var allState = await storageGet(SYNC2_STATE_KEY);
        if (!allState || typeof allState !== 'object') return;
        if (!allState[userId]) return;
        delete allState[userId];
        if (Object.keys(allState).length === 0) {
            await storageRemove(SYNC2_STATE_KEY);
            return;
        }
        await storageSet(SYNC2_STATE_KEY, allState);
    }

    function getPageFromRowNumber(pageBreaks, rowNumber) {
        if (!Array.isArray(pageBreaks) || !pageBreaks.length || !rowNumber) return null;
        for (var i = 0; i < pageBreaks.length; i++) {
            if (rowNumber <= pageBreaks[i]) return i + 1;
        }
        return pageBreaks.length;
    }

    function parseDate(val) {
        if (!val) return null;
        if (typeof val !== 'string') val = String(val).trim();
        else val = val.trim();
        if (!val) return null;
        var iso = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return val;
        // Example: "Mar 26, 2025"
        var mon = val.match(/^([A-Za-z]{3,})\s+(\d{1,2}),\s+(\d{4})$/);
        if (mon) {
            var monthName = String(mon[1]).toLowerCase();
            var day = parseInt(mon[2], 10);
            var year = parseInt(mon[3], 10);
            var monthMap = {
                jan: 1, january: 1,
                feb: 2, february: 2,
                mar: 3, march: 3,
                apr: 4, april: 4,
                may: 5,
                jun: 6, june: 6,
                jul: 7, july: 7,
                aug: 8, august: 8,
                sep: 9, sept: 9, september: 9,
                oct: 10, october: 10,
                nov: 11, november: 11,
                dec: 12, december: 12
            };
            var mNum = monthMap[monthName];
            if (mNum) {
                return year + '-' + String(mNum).padStart(2, '0') + '-' + String(day).padStart(2, '0');
            }
        }
        var slash = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slash) {
            var d = parseInt(slash[1], 10);
            var m = parseInt(slash[2], 10);
            var y = parseInt(slash[3], 10);
            if (m > 12) { d = slash[2]; m = slash[1]; }
            return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        }
        return null;
    }

    /**
     * True when last purchase YYYY-MM-DD falls in the current calendar month (Malaysia),
     * matching app logic for Active / monthly buyer.
     */
    function isLastPurchaseInCurrentMalaysiaMonth(isoDateStr) {
        if (!isoDateStr || typeof isoDateStr !== 'string') return false;
        var match = isoDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return false;
        var ly = parseInt(match[1], 10);
        var lm = parseInt(match[2], 10);
        var fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: 'numeric' });
        var parts = fmt.formatToParts(new Date());
        var cy = parseInt(parts.find(function (p) { return p.type === 'year'; }).value, 10);
        var cm = parseInt(parts.find(function (p) { return p.type === 'month'; }).value, 10);
        return ly === cy && lm === cm;
    }

    function buildCustomerPayload(row, processed, userId) {
        var name = row.Name || row.name || null;
        var dob = row['D.O.B.'] || row['D.O.B'] || row.DOB || row.dob || null;
        var pgCode = row.PGCode || row.pg_code || null;
        var email = row.Email || row.email || null;
        var phone = row.Telephone || row.phone || null;
        var mainFields = ['name', 'dob', 'email', 'phone', 'location', 'gender', 'ethnicity', 'age', 'prefix', 'first_name', 'sender_name', 'save_name', 'pg_code', 'is_friend', 'Name', 'Email', 'Telephone', 'D.O.B.', 'PGCode', 'Gender', 'Ethnicity', 'Age', 'Prefix', 'FirstName', 'SenderName', 'SaveName', 'Location'];
        var originalData = {};
        Object.keys(row).forEach(function (k) {
            if (mainFields.indexOf(k) === -1 && k !== 'id' && k !== 'user_id') originalData[k] = row[k];
        });
        var lastPurchaseIso = parseDate(row['Last Purchase Date'] || row['last_purchase_date'] || null);
        var payload = {
            user_id: userId,
            name: name,
            dob: parseDate(dob),
            email: email,
            phone: phone,
            location: row.Location || row.location || null,
            gender: (processed && processed.Gender) || row.Gender || null,
            ethnicity: (processed && processed.Ethnicity) || row.Ethnicity || null,
            age: (processed && processed.Age) != null ? processed.Age : (row.Age != null ? row.Age : null),
            prefix: (processed && processed.Prefix) || row.Prefix || null,
            first_name: (processed && processed.FirstName) || row.FirstName || null,
            sender_name: (processed && processed.SenderName) || row.SenderName || null,
            save_name: (processed && processed.SaveName) || row.SaveName || null,
            pg_code: pgCode,
            last_purchase_at: lastPurchaseIso,
            is_monthly_buyer: isLastPurchaseInCurrentMalaysiaMonth(lastPurchaseIso),
            is_friend: false,
            original_data: Object.keys(originalData).length ? originalData : null
        };
        return payload;
    }

    async function syncRowsToSupabase(rows, supabaseUrl, anonKey, webappOrigin, userId, accessToken, progressOpts) {
        progressOpts = progressOpts || {};
        var rowStart = progressOpts.rowStart != null ? progressOpts.rowStart : 5;
        var rowEnd = progressOpts.rowEnd != null ? progressOpts.rowEnd : 90;
        var rowSpan = Math.max(1, rowEnd - rowStart);
        var startIndex = progressOpts.startIndex != null ? progressOpts.startIndex : 0;
        if (startIndex < 0) startIndex = 0;
        if (startIndex >= rows.length) startIndex = 0;

        var total = rows.length;
        var inserted = 0;
        var updated = 0;

        var pgCodes = rows.map(function (r) { return (r.PGCode || r.pg_code || '').trim(); }).filter(Boolean);
        var existingMap = {};
        if (pgCodes.length > 0) {
            var checkPct = progressOpts.existingCheckPct != null
                ? progressOpts.existingCheckPct
                : (rowStart > 18 ? rowStart - 5 : 2);
            setProgress(checkPct, 'Checking existing...');
            var url = supabaseUrl + '/rest/v1/customers?user_id=eq.' + userId + '&select=id,pg_code,is_friend';
            var headers = { apikey: anonKey, Authorization: 'Bearer ' + accessToken };
            if (pgCodes.length <= 100) {
                url += '&pg_code=in.(' + pgCodes.map(function (c) { return '"' + c.replace(/"/g, '""') + '"'; }).join(',') + ')';
            }
            try {
                var res = await fetch(url, { headers: headers });
                if (res.ok) {
                    var list = await res.json();
                    (list || []).forEach(function (c) {
                        if (c.pg_code) {
                            existingMap[c.pg_code] = { id: c.id, is_friend: c.is_friend === true };
                        }
                    });
                }
            } catch (e) { /* ignore */ }
            if (pgCodes.length > 100) {
                for (var b = 0; b < pgCodes.length; b += 100) {
                    var batch = pgCodes.slice(b, b + 100);
                    var batchUrl = supabaseUrl + '/rest/v1/customers?user_id=eq.' + userId + '&pg_code=in.(' + batch.map(function (c) { return '"' + c.replace(/"/g, '""') + '"'; }).join(',') + ')&select=id,pg_code,is_friend';
                    var r = await fetch(batchUrl, { headers: headers });
                    if (r.ok) {
                        var arr = await r.json();
                        (arr || []).forEach(function (c) {
                            if (c.pg_code) {
                                existingMap[c.pg_code] = { id: c.id, is_friend: c.is_friend === true };
                            }
                        });
                    }
                }
            }
        }

        for (var i = startIndex; i < rows.length; i++) {
            var pct = rowStart + Math.round((rowSpan * (i + 1)) / total);
            var progressText = null;
            if (typeof progressOpts.getRowProgressText === 'function') {
                progressText = progressOpts.getRowProgressText(i, total);
            }
            if (!progressText) {
                progressText = 'Processing row ' + (i + 1) + ' of ' + total + '...';
            }
            setProgress(pct, progressText);

            var row = rows[i];
            var processResult = null;
            try {
                var pr = await fetch(webappOrigin + '/api/openai/process-row', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rowData: row, rowNumber: i + 1 })
                });
                var data = await pr.json();
                if (pr.ok && data && data.result) {
                    processResult = data.result;
                }
            } catch (e) { /* use row only */ }

            var payload = buildCustomerPayload(row, processResult, userId);
            var pgCode = (payload.pg_code || '').trim();
            var existing = pgCode ? existingMap[pgCode] : null;
            var existingId = existing && existing.id;

            try {
                if (existingId) {
                    var patchBody = Object.assign({}, payload);
                    delete patchBody.is_friend;
                    if (pgCode && existing.is_friend === true) {
                        delete patchBody.name;
                        delete patchBody.sender_name;
                        delete patchBody.save_name;
                    }
                    var patchRes = await fetch(supabaseUrl + '/rest/v1/customers?id=eq.' + existingId, {
                        method: 'PATCH',
                        headers: {
                            apikey: anonKey,
                            Authorization: 'Bearer ' + accessToken,
                            'Content-Type': 'application/json',
                            Prefer: 'return=minimal'
                        },
                        body: JSON.stringify(patchBody)
                    });
                    if (patchRes.ok) updated++;
                } else {
                    var postRes = await fetch(supabaseUrl + '/rest/v1/customers', {
                        method: 'POST',
                        headers: {
                            apikey: anonKey,
                            Authorization: 'Bearer ' + accessToken,
                            'Content-Type': 'application/json',
                            Prefer: 'return=representation'
                        },
                        body: JSON.stringify(payload)
                    });
                    if (postRes.ok) {
                        var created = await postRes.json();
                        if (created && created[0] && created[0].id) {
                            inserted++;
                            if (pgCode) {
                                existingMap[pgCode] = {
                                    id: created[0].id,
                                    is_friend: created[0].is_friend === true
                                };
                            }
                        }
                    }
                }
            } catch (e) { /* skip row */ }
            if (typeof progressOpts.onRowProcessed === 'function') {
                try {
                    await progressOpts.onRowProcessed(i, total, row);
                } catch (e) { /* non-blocking */ }
            }
            await new Promise(function (r) { setTimeout(r, 80); });
        }

        setProgress(100, 'Done: ' + inserted + ' added, ' + updated + ' updated.');
        triggerConfetti();
        setBusy(false);
        setTimeout(function () {
            syncProgress.style.display = 'none';
        }, 3000);
    }

    async function runSync(rowsFetcher, loadingText, fetchErrorMsg) {
        try {
            var config = typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG : {};
            var supabaseUrl = config.SUPABASE_URL;
            var anonKey = config.SUPABASE_ANON_KEY;
            var webappOrigin = (config.WEBAPP_ORIGIN || '').replace(/\/$/, '');
            if (!supabaseUrl || !anonKey || !webappOrigin) {
                alert('Extension config missing: set SUPABASE_URL, SUPABASE_ANON_KEY and WEBAPP_ORIGIN in config.js');
                return;
            }

            var session = await new Promise(function (resolve) {
                chrome.storage.local.get('supabase_session', function (data) {
                    resolve(data.supabase_session || null);
                });
            });
            if (!session || !session.access_token || !session.user || !session.user.id) {
                alert('Please sign in first.');
                return;
            }

            var userId = session.user.id;
            var accessToken = session.access_token;

            setBusy(true);
            syncProgress.style.display = 'block';
            setProgress(0, loadingText);

            var rows;
            try {
                rows = await runInActiveTabWithResult(rowsFetcher);
            } catch (e) {
                syncProgress.style.display = 'none';
                setBusy(false);
                alert(fetchErrorMsg);
                return;
            }

            if (!rows || rows.length === 0) {
                setProgress(100, 'No rows found.');
                syncProgress.style.display = 'none';
                setBusy(false);
                return;
            }

            await syncRowsToSupabase(rows, supabaseUrl, anonKey, webappOrigin, userId, accessToken);
        } catch (e) {
            syncProgress.style.display = 'none';
            setBusy(false);
        }
    }

    var FETCH_PROGRESS_MAX = 38;

    async function runSyncDownlineAllPages() {
        try {
            var config = typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG : {};
            var supabaseUrl = config.SUPABASE_URL;
            var anonKey = config.SUPABASE_ANON_KEY;
            var webappOrigin = (config.WEBAPP_ORIGIN || '').replace(/\/$/, '');
            if (!supabaseUrl || !anonKey || !webappOrigin) {
                alert('Extension config missing: set SUPABASE_URL, SUPABASE_ANON_KEY and WEBAPP_ORIGIN in config.js');
                return;
            }

            var session = await new Promise(function (resolve) {
                chrome.storage.local.get('supabase_session', function (data) {
                    resolve(data.supabase_session || null);
                });
            });
            if (!session || !session.access_token || !session.user || !session.user.id) {
                alert('Please sign in first.');
                return;
            }

            var userId = session.user.id;
            var accessToken = session.access_token;
            var resumeState = await getSync2State(userId);

            setBusy(true);
            syncProgress.style.display = 'block';
            setProgress(0, 'Preparing sync...');

            if (
                resumeState &&
                resumeState.status === 'processing' &&
                Array.isArray(resumeState.rows) &&
                resumeState.rows.length > 0
            ) {
                var resumeFrom = Number(resumeState.nextRowIndex || 0);
                if (!isFinite(resumeFrom) || resumeFrom < 0) resumeFrom = 0;
                if (resumeFrom > resumeState.rows.length) resumeFrom = 0;
                setProgress(
                    40 + Math.round((57 * resumeFrom) / resumeState.rows.length),
                    'Resuming from row ' + (resumeFrom + 1) + ' of ' + resumeState.rows.length + '...'
                );
                await syncRowsToSupabase(resumeState.rows, supabaseUrl, anonKey, webappOrigin, userId, accessToken, {
                    rowStart: 40,
                    rowEnd: 97,
                    startIndex: resumeFrom,
                    getRowProgressText: function (rowIndex, totalRows) {
                        var rowNumber = rowIndex + 1;
                        var pageNumber = getPageFromRowNumber(resumeState.pageBreaks, rowNumber);
                        if (pageNumber && resumeState.totalPages) {
                            return 'Processing row ' + rowNumber + ' of ' + totalRows + ' (Page ' + pageNumber + '/' + resumeState.totalPages + ')...';
                        }
                        return 'Processing row ' + rowNumber + ' of ' + totalRows + '...';
                    },
                    onRowProcessed: async function (rowIndex) {
                        var rowNumber = rowIndex + 1;
                        await setSync2State(userId, {
                            status: 'processing',
                            nextRowIndex: rowNumber,
                            lastProcessedRow: rowNumber,
                            currentPage: getPageFromRowNumber(resumeState.pageBreaks, rowNumber) || null
                        });
                    }
                });
                await clearSync2State(userId);
                return;
            }

            setProgress(0, 'Extracting page 1...');
            await setSync2State(userId, {
                status: 'fetching',
                startedAt: Date.now(),
                currentPage: 1,
                totalPages: null,
                lastProcessedRow: 0,
                nextRowIndex: 0,
                rows: null,
                pageBreaks: null
            });

            var first;
            try {
                first = await runInActiveTabWithResultArgs(fetchDownlineSinglePage, [1]);
            } catch (e) {
                syncProgress.style.display = 'none';
                setBusy(false);
                alert('Could not fetch downline data. Open bc.pgmall.my (logged in) on a downline view with current-customer-id and try again.');
                return;
            }

            var totalPages = first && first.totalPages != null ? first.totalPages : 1;
            if (totalPages < 1) totalPages = 1;
            var allRows = first && first.rows ? first.rows.slice() : [];
            var pageBreaks = [allRows.length];

            await setSync2State(userId, {
                status: 'fetching',
                totalPages: totalPages,
                currentPage: 1
            });

            setProgress(
                Math.round((1 / totalPages) * FETCH_PROGRESS_MAX),
                'Page 1 / ' + totalPages
            );

            for (var p = 2; p <= totalPages; p++) {
                setProgress(
                    Math.round(((p - 1) / totalPages) * FETCH_PROGRESS_MAX),
                    'Page ' + p + ' / ' + totalPages
                );
                var chunk;
                try {
                    chunk = await runInActiveTabWithResultArgs(fetchDownlineSinglePage, [p]);
                } catch (e) {
                    syncProgress.style.display = 'none';
                    setBusy(false);
                    alert('Failed while loading page ' + p + ' of ' + totalPages + '. Try again.');
                    return;
                }
                if (chunk && chunk.rows && chunk.rows.length) {
                    for (var r = 0; r < chunk.rows.length; r++) {
                        allRows.push(chunk.rows[r]);
                    }
                }
                pageBreaks.push(allRows.length);
                setProgress(
                    Math.round((p / totalPages) * FETCH_PROGRESS_MAX),
                    'Page ' + p + ' / ' + totalPages
                );
                await setSync2State(userId, {
                    status: 'fetching',
                    currentPage: p,
                    totalPages: totalPages
                });
            }

            if (!allRows.length) {
                setProgress(100, 'No rows found.');
                syncProgress.style.display = 'none';
                setBusy(false);
                await clearSync2State(userId);
                return;
            }

            await setSync2State(userId, {
                status: 'processing',
                rows: allRows,
                pageBreaks: pageBreaks,
                totalPages: totalPages,
                totalRows: allRows.length,
                nextRowIndex: 0,
                lastProcessedRow: 0,
                currentPage: 1
            });

            await syncRowsToSupabase(allRows, supabaseUrl, anonKey, webappOrigin, userId, accessToken, {
                rowStart: 40,
                rowEnd: 97,
                getRowProgressText: function (rowIndex, totalRows) {
                    var rowNumber = rowIndex + 1;
                    var pageNumber = getPageFromRowNumber(pageBreaks, rowNumber);
                    return 'Processing row ' + rowNumber + ' of ' + totalRows + ' (Page ' + pageNumber + '/' + totalPages + ')...';
                },
                onRowProcessed: async function (rowIndex) {
                    var rowNumber = rowIndex + 1;
                    await setSync2State(userId, {
                        status: 'processing',
                        nextRowIndex: rowNumber,
                        lastProcessedRow: rowNumber,
                        currentPage: getPageFromRowNumber(pageBreaks, rowNumber)
                    });
                }
            });
            await clearSync2State(userId);
        } catch (e) {
            syncProgress.style.display = 'none';
            setBusy(false);
        }
    }

    async function showSync2ResumeHint() {
        try {
            var session = await new Promise(function (resolve) {
                chrome.storage.local.get('supabase_session', function (data) {
                    resolve(data.supabase_session || null);
                });
            });
            if (!session || !session.user || !session.user.id) return;
            var userId = session.user.id;
            var state = await getSync2State(userId);
            if (!state || state.status !== 'processing' || !Array.isArray(state.rows) || !state.rows.length) return;

            var lastRow = Number(state.lastProcessedRow || 0);
            if (!isFinite(lastRow) || lastRow < 0) lastRow = 0;
            var pct = 40 + Math.round((57 * lastRow) / state.rows.length);
            if (pct > 97) pct = 97;
            syncProgress.style.display = 'block';
            setProgress(
                pct,
                'Resume available: last row ' + lastRow + ' of ' + state.rows.length +
                (state.currentPage && state.totalPages ? ' (Page ' + state.currentPage + '/' + state.totalPages + ')' : '') +
                '. Click "Sync to CRMPG 2" to continue.'
            );
        } catch (e) { /* non-blocking */ }
    }

    if (btnSync) {
        btnSync.addEventListener('click', function () {
            void runSync(
                getCustomerRowsForSync,
                'Reading page...',
                'Could not read customer data. Open the PG Mall business center page and try again.'
            );
        });
    }
    if (btnSync2) {
        btnSync2.addEventListener('click', function () {
            void runSyncDownlineAllPages();
        });
    }
    void showSync2ResumeHint();

    function triggerConfetti() {
        if (typeof JSConfetti === 'undefined') return;
        try {
            var jsConfetti = window._syncConfetti || (window._syncConfetti = new JSConfetti());
            jsConfetti.addConfetti({
                // emojis: ['🎊', '👏', '🥳', '🎉', '🚀'],
                confettiColors: ['#0ea5e9', '#0284c7', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#ec4899'],
                confettiNumber: 120
            });
        } catch (e) {}
    }

    var btnTestConfetti = document.getElementById('btn-test-confetti');
    if (btnTestConfetti) {
        btnTestConfetti.addEventListener('click', triggerConfetti);
    }
})();
