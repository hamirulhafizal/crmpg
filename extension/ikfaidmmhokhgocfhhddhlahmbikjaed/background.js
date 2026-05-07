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
    function parseDirectDebitInfo(rawText) {
        var text = String(rawText || '').replace(/\s{2,}/g, ' ').trim();
        if (!text || /^no$/i.test(text)) {
            return {
                status: 'No',
                amount: null,
                date: null
            };
        }
        var amountMatch = text.match(/rm\s*([\d,]+(?:\.\d+)?)/i);
        var dateMatch = text.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);
        return {
            status: 'Yes',
            amount: amountMatch ? amountMatch[1].replace(/,/g, '') : null,
            date: dateMatch ? dateMatch[1] : null
        };
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
            var directDebit = parseDirectDebitInfo(get(14));
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
                'Last Purchase Date': get(13),
                'Direct Debit Subscription': directDebit.status,
                'Direct Debit Amount': directDebit.amount,
                'Direct Debit Date': directDebit.date
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
 * Injected into bc.pgmall.my: fetch viewDownlineInfo for one page.
 * First arg: page number (1-based). Returns { rows, totalPages } — totalPages set only when page === 1.
 */
async function fetchDownlineSinglePage(pageNum) {
    function toTitleCase(s) {
        if (!s || typeof s !== 'string') return s;
        return s.trim().split(/\s+/).map(function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join(' ');
    }
    function parseDirectDebitInfo(rawText) {
        var text = String(rawText || '').replace(/\s{2,}/g, ' ').trim();
        if (!text || /^no$/i.test(text)) {
            return {
                status: 'No',
                amount: null,
                date: null
            };
        }
        var amountMatch = text.match(/rm\s*([\d,]+(?:\.\d+)?)/i);
        var dateMatch = text.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);
        return {
            status: 'Yes',
            amount: amountMatch ? amountMatch[1].replace(/,/g, '') : null,
            date: dateMatch ? dateMatch[1] : null
        };
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

    var currentUrl = null;
    try {
        currentUrl = new URL(window.location.href);
    } catch (e) {
        currentUrl = null;
    }

    var input = document.querySelector('input[name="current-customer-id"]');
    var customerId = input && input.value && String(input.value).trim();
    if (!customerId) {
        customerId = (currentUrl && (currentUrl.searchParams.get('customer_id') || currentUrl.searchParams.get('filter_customer_id'))) || '';
    }

    var companySelect = document.querySelector('#company_select');
    var sortCountrySelect = document.querySelector('#sort_country_select');
    var sortStatusSelect = document.querySelector('#sort_status_select');
    var sortProfileStatusSelect = document.querySelector('#sort_profile_status_select');

    var filterCompany =
        (companySelect && companySelect.value && String(companySelect.value).trim()) ||
        (currentUrl && currentUrl.searchParams.get('filter_company')) ||
        '1';
    var filterSortCountry =
        (sortCountrySelect && sortCountrySelect.value && String(sortCountrySelect.value).trim()) ||
        (currentUrl && currentUrl.searchParams.get('filter_sort_country')) ||
        '0';
    var filterSortAccountStatus =
        (sortStatusSelect && sortStatusSelect.value && String(sortStatusSelect.value).trim()) ||
        (currentUrl && currentUrl.searchParams.get('filter_sort_account_status')) ||
        '';
    var filterSortProfileStatus =
        (sortProfileStatusSelect && sortProfileStatusSelect.value && String(sortProfileStatusSelect.value).trim()) ||
        (currentUrl && currentUrl.searchParams.get('filter_sort_profile_status')) ||
        '';

    if (!customerId) return { rows: [], totalPages: page === 1 ? 1 : null };

    var urlObj = new URL('https://bc.pgmall.my/index.php');
    urlObj.searchParams.set('route', 'business/group_details/viewDownlineInfo');
    urlObj.searchParams.set('page', String(page));
    urlObj.searchParams.set('filter_company', filterCompany);
    urlObj.searchParams.set('filter_sort_country', filterSortCountry);
    if (filterSortAccountStatus) {
        urlObj.searchParams.set('filter_sort_account_status', filterSortAccountStatus);
    }
    if (filterSortProfileStatus) {
        urlObj.searchParams.set('filter_sort_profile_status', filterSortProfileStatus);
    }
    urlObj.searchParams.set('customer_id', customerId);

    var url = urlObj.toString();
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
    var hasProfileVerifiedColumn = false;
    var ths = table.querySelectorAll('thead th');
    for (var hi = 0; hi < ths.length; hi++) {
        var headerText = (ths[hi].textContent || '').replace(/\s{2,}/g, ' ').trim().toLowerCase();
        if (headerText === 'profile verified status' || headerText === 'profile verified') {
            hasProfileVerifiedColumn = true;
            break;
        }
    }
    var trs = tbody.querySelectorAll('tr');
    var rows = [];
    for (var i = 0; i < trs.length; i++) {
        var td = trs[i].querySelectorAll('td');
        if (td.length < 5) continue;
        var get = function (idx) {
            return (td[idx] && td[idx].textContent && td[idx].textContent.replace(/\s{2,}/g, ' ').trim()) || '';
        };
        if (hasProfileVerifiedColumn) {
            var directDebit = parseDirectDebitInfo(get(14));
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
                'Last Purchase Date': get(13),
                'Direct Debit Subscription': directDebit.status,
                'Direct Debit Amount': directDebit.amount,
                'Direct Debit Date': directDebit.date
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

    async function createSyncRun(supabaseUrl, anonKey, accessToken, userId, mode, totalRows, metadata) {
        try {
            var res = await fetch(supabaseUrl + '/rest/v1/customer_sync_runs', {
                method: 'POST',
                headers: {
                    apikey: anonKey,
                    Authorization: 'Bearer ' + accessToken,
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation'
                },
                body: JSON.stringify({
                    user_id: userId,
                    source: 'extension',
                    mode: mode || 'customers_page',
                    status: 'running',
                    total_rows: totalRows,
                    metadata: metadata || {}
                })
            });
            if (!res.ok) return null;
            var rows = await res.json();
            return rows && rows[0] && rows[0].id ? rows[0].id : null;
        } catch (e) {
            return null;
        }
    }

    async function updateSyncRun(supabaseUrl, anonKey, accessToken, runId, patch) {
        if (!runId) return;
        try {
            await fetch(supabaseUrl + '/rest/v1/customer_sync_runs?id=eq.' + runId, {
                method: 'PATCH',
                headers: {
                    apikey: anonKey,
                    Authorization: 'Bearer ' + accessToken,
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify(patch || {})
            });
        } catch (e) { /* non-blocking */ }
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

    function normalizePgCodeForMatch(value) {
        if (value == null) return '';
        var s = String(value).trim();
        return s;
    }

    function normalizeEmailForMatch(value) {
        if (value == null) return '';
        return String(value).trim().toLowerCase();
    }

    function normalizePhoneForMatch(value) {
        if (value == null) return '';
        var digits = String(value).replace(/\D/g, '');
        if (!digits) return '';
        if (digits.startsWith('0')) digits = '6' + digits;
        if (!digits.startsWith('60') && digits.length >= 9) digits = '60' + digits;
        return digits;
    }

    function isPatchValueNonEmpty(value) {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim() !== '';
        if (Array.isArray(value)) return value.length > 0;
        return true; // keep numbers (incl. 0), booleans, and objects
    }

    function buildPatchBodyFromPayload(payload) {
        var patchBody = {};
        Object.keys(payload || {}).forEach(function (key) {
            if (key === 'user_id' || key === 'is_friend') return;
            if (key === 'original_data') {
                // Explicitly overwrite with latest original_data snapshot.
                patchBody.original_data = payload.original_data;
                return;
            }
            if (isPatchValueNonEmpty(payload[key])) {
                patchBody[key] = payload[key];
            }
        });
        return patchBody;
    }

    function buildCustomerPayload(row, processed, userId) {
        var nowIso = new Date().toISOString();
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
            updated_at: nowIso,
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
        var failed = 0;

        var existingByPgCode = {};
        var existingByPhone = {};
        var existingByEmail = {};
        var headers = { apikey: anonKey, Authorization: 'Bearer ' + accessToken };
        var checkPct = progressOpts.existingCheckPct != null
            ? progressOpts.existingCheckPct
            : (rowStart > 18 ? rowStart - 5 : 2);
        setProgress(checkPct, 'Checking existing...');
        try {
            var pageSize = 1000;
            var offset = 0;
            while (true) {
                var url = supabaseUrl
                    + '/rest/v1/customers?user_id=eq.' + userId
                    + '&select=id,pg_code,is_friend,phone,email'
                    + '&limit=' + pageSize
                    + '&offset=' + offset;
                var res = await fetch(url, { headers: headers });
                if (!res.ok) break;
                var list = await res.json();
                if (!Array.isArray(list) || list.length === 0) break;
                list.forEach(function (c) {
                    var entry = { id: c.id, is_friend: c.is_friend === true };
                    var pgKey = normalizePgCodeForMatch(c.pg_code);
                    var phoneKey = normalizePhoneForMatch(c.phone);
                    var emailKey = normalizeEmailForMatch(c.email);
                    if (pgKey) existingByPgCode[pgKey] = entry;
                    if (phoneKey) existingByPhone[phoneKey] = entry;
                    if (emailKey) existingByEmail[emailKey] = entry;
                });
                if (list.length < pageSize) break;
                offset += pageSize;
            }
        } catch (e) { /* ignore */ }

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
            var pgCode = normalizePgCodeForMatch(payload.pg_code);
            var phoneKey = normalizePhoneForMatch(payload.phone);
            var emailKey = normalizeEmailForMatch(payload.email);
            var existing = null;
            if (pgCode && existingByPgCode[pgCode]) {
                existing = existingByPgCode[pgCode];
            } else if (phoneKey && existingByPhone[phoneKey]) {
                existing = existingByPhone[phoneKey];
            } else if (emailKey && existingByEmail[emailKey]) {
                existing = existingByEmail[emailKey];
            }
            var existingId = existing && existing.id;

            try {
                if (existingId) {
                    var patchBody = buildPatchBodyFromPayload(payload);
                    // Never overwrite relationship naming fields that users can curate manually in CRM.
                    delete patchBody.sender_name;
                    delete patchBody.save_name;
                    if (pgCode && existing.is_friend === true) delete patchBody.name;
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
                    if (patchRes.ok) {
                        updated++;
                        var updatedEntry = { id: existingId, is_friend: existing.is_friend === true };
                        if (pgCode) existingByPgCode[pgCode] = updatedEntry;
                        if (phoneKey) existingByPhone[phoneKey] = updatedEntry;
                        if (emailKey) existingByEmail[emailKey] = updatedEntry;
                    } else {
                        failed++;
                    }
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
                            var createdEntry = {
                                id: created[0].id,
                                is_friend: created[0].is_friend === true
                            };
                            if (pgCode) existingByPgCode[pgCode] = createdEntry;
                            if (phoneKey) existingByPhone[phoneKey] = createdEntry;
                            if (emailKey) existingByEmail[emailKey] = createdEntry;
                        } else {
                            failed++;
                        }
                    } else {
                        failed++;
                    }
                }
            } catch (e) {
                failed++;
            }
            if (typeof progressOpts.onRowProcessed === 'function') {
                try {
                    await progressOpts.onRowProcessed(i, total, row);
                } catch (e) { /* non-blocking */ }
            }
            await new Promise(function (r) { setTimeout(r, 80); });
        }

        setProgress(100, 'Done: ' + inserted + ' added, ' + updated + ' updated, ' + failed + ' failed.');
        triggerConfetti();
        setBusy(false);
        setTimeout(function () {
            syncProgress.style.display = 'none';
        }, 3000);
        return {
            total: total,
            inserted: inserted,
            updated: updated,
            failed: failed
        };
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

            var runId = await createSyncRun(
                supabaseUrl,
                anonKey,
                accessToken,
                userId,
                'single_page_sync',
                rows.length,
                { source: 'btn-sync-supabase' }
            );
            var result = await syncRowsToSupabase(rows, supabaseUrl, anonKey, webappOrigin, userId, accessToken);
            await updateSyncRun(supabaseUrl, anonKey, accessToken, runId, {
                status: result.failed > 0 ? 'failed' : 'completed',
                inserted_count: result.inserted,
                updated_count: result.updated,
                failed_count: result.failed,
                finished_at: new Date().toISOString()
            });
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
                var resumeRunId = await createSyncRun(
                    supabaseUrl,
                    anonKey,
                    accessToken,
                    userId,
                    'downline_all_pages_resume',
                    resumeState.rows.length,
                    { source: 'btn-sync-supabase-2', resumed: true }
                );
                var resumeResult = await syncRowsToSupabase(resumeState.rows, supabaseUrl, anonKey, webappOrigin, userId, accessToken, {
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
                await updateSyncRun(supabaseUrl, anonKey, accessToken, resumeRunId, {
                    status: resumeResult.failed > 0 ? 'failed' : 'completed',
                    inserted_count: resumeResult.inserted,
                    updated_count: resumeResult.updated,
                    failed_count: resumeResult.failed,
                    finished_at: new Date().toISOString()
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

            var runId = await createSyncRun(
                supabaseUrl,
                anonKey,
                accessToken,
                userId,
                'downline_all_pages',
                allRows.length,
                { source: 'btn-sync-supabase-2', total_pages: totalPages }
            );
            var result = await syncRowsToSupabase(allRows, supabaseUrl, anonKey, webappOrigin, userId, accessToken, {
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
            await updateSyncRun(supabaseUrl, anonKey, accessToken, runId, {
                status: result.failed > 0 ? 'failed' : 'completed',
                inserted_count: result.inserted,
                updated_count: result.updated,
                failed_count: result.failed,
                finished_at: new Date().toISOString(),
                metadata: {
                    source: 'btn-sync-supabase-2',
                    total_pages: totalPages
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
