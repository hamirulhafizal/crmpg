// ================= BUTTONS =================
const downloadCustomer = document.getElementById("btn-download-customer");
const downloadSales = document.getElementById("btn-download-sales");
const downloadGroupSales = document.getElementById("btn-download-group-sales");
const downloadPgmall = document.getElementById("btn-download-pgmall");
const downloadAutodebit = document.getElementById("btn-download-autodebit");

function getExtensionVersionHeader() {
    try {
        return { 'X-Extension-Version': chrome.runtime.getManifest().version || '' };
    } catch (e) {
        return {};
    }
}

async function ensureExtensionCanSync() {
    if (window.CRMPGExtensionUpdate && window.CRMPGExtensionUpdate.ensureCanSync) {
        await window.CRMPGExtensionUpdate.ensureCanSync();
    }
}

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

function injectIntoActiveTab(spec, files) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs || !tabs[0]) {
                reject(new Error('No active tab'));
                return;
            }

            var tabId = tabs[0].id;

            function runSpec() {
                chrome.scripting.executeScript(
                    Object.assign({ target: { tabId: tabId } }, spec),
                    (results) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                            return;
                        }
                        if (results && results[0] && results[0].result !== undefined) {
                            resolve(results[0].result);
                            return;
                        }
                        reject(new Error('No data from page'));
                    }
                );
            }

            if (files && files.length) {
                chrome.scripting.executeScript(
                    { target: { tabId: tabId }, files: files },
                    () => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                            return;
                        }
                        runSpec();
                    }
                );
                return;
            }

            runSpec();
        });
    });
}

/** Run a function in the active tab and return its result (for sync). */
function runInActiveTabWithResult(fn, files) {
    return injectIntoActiveTab({ func: fn }, files);
}

/** Run a function in the active tab with arguments (MV3: func + args). */
function runInActiveTabWithResultArgs(fn, args, files) {
    return injectIntoActiveTab({ func: fn, args: args || [] }, files);
}

const GROUP_DETAIL_PARSER_FILES = ['group-detail-parser.js'];

/** Injected into pgmall.my to return customer rows as array of objects for sync. */
function getCustomerRowsForSync() {
    return readVisibleGroupDetailRows();
}

/**
 * Injected into bc.pgmall.my: fetch viewDownlineInfo for one page of the
 * locked Tree Tier only. Does NOT click into child tiers — user navigates
 * Tree Tier manually, then clicks sync.
 *
 * Args: page number (1-based), optional locked syncTarget
 *   { customerId, pgCode, name, tier, mode, fetchQuery, nextCustomerId }.
 *
 * CRITICAL: BC uses DIFFERENT encrypted customer_id tokens for Tree Tier
 * navigation vs viewDownlineInfo table fetch. Always use the table token
 * (header / pagination / current-customer-id), never the Tree Tier row token.
 * viewedPgCode (Tree Tier PG) is only for parent_pg_code stamping.
 *
 * Returns { rows, totalPages, viewedPgCode, tierNameToPg, viewedCustomerId,
 *   nextCustomerId, fetchQuery, viewedName, viewedTier, syncMode, fetchUrl }.
 */
async function fetchDownlineSinglePage(pageNum, syncTarget) {
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

    function queryObjectFromParams(params) {
        if (!params) return null;
        if (typeof params.entries === 'function') {
            try {
                return Object.fromEntries(params.entries());
            } catch (e) {
                return null;
            }
        }
        if (typeof params === 'object') {
            var out = {};
            Object.keys(params).forEach(function (k) {
                if (params[k] != null) out[k] = String(params[k]);
            });
            return Object.keys(out).length ? out : null;
        }
        return null;
    }

    function applyQueryObject(urlObj, queryObj) {
        if (!queryObj || typeof queryObj !== 'object') return;
        Object.keys(queryObj).forEach(function (k) {
            if (k === 'page' || k === 't') return;
            if (queryObj[k] != null && String(queryObj[k]) !== '') {
                urlObj.searchParams.set(k, String(queryObj[k]));
            }
        });
    }

    function emptyResult(totalPages, extra) {
        return Object.assign(
            {
                rows: [],
                totalPages: totalPages,
                viewedPgCode: null,
                tierNameToPg: {},
                viewedCustomerId: '',
                nextCustomerId: '',
                fetchQuery: null,
                viewedName: '',
                viewedTier: '',
                syncMode: 'current',
                fetchUrl: null
            },
            extra || {}
        );
    }

    var page = parseInt(pageNum, 10);
    if (isNaN(page) || page < 1) page = 1;

    var locked =
        syncTarget && typeof syncTarget === 'object' ? syncTarget : null;

    var currentUrl = null;
    try {
        currentUrl = new URL(window.location.href);
    } catch (e) {
        currentUrl = null;
    }

    // Live table / pagination token (correct for viewDownlineInfo).
    var live =
        typeof readVisibleDownlineFetchContext === 'function'
            ? readVisibleDownlineFetchContext(document)
            : {
                  customerId: '',
                  headerName: '',
                  headerTier: '',
                  pageParams: null,
                  hiddenId: ''
              };

    // Tree Tier PG/name/tier — for parent stamping + URL labels only.
    var viewedPgCode =
        locked && locked.pgCode
            ? String(locked.pgCode).trim()
            : typeof resolveCurrentViewedPgCode === 'function'
              ? resolveCurrentViewedPgCode(document) || ''
              : '';
    var viewedName =
        locked && locked.name
            ? String(locked.name).replace(/\s{2,}/g, ' ').trim()
            : live.headerName || '';
    var viewedTier =
        locked && locked.tier != null && String(locked.tier).trim() !== ''
            ? String(locked.tier).trim()
            : live.headerTier || '';
    var syncMode = locked && locked.mode ? String(locked.mode) : 'current';

    // Table token: rotating nextCustomerId → locked.customerId → live table → hidden.
    var customerId = '';
    if (locked && locked.nextCustomerId) {
        customerId = String(locked.nextCustomerId).trim();
    }
    if (!customerId && locked && locked.customerId) {
        customerId = String(locked.customerId).trim();
    }
    if (!customerId && live.customerId) {
        customerId = String(live.customerId).trim();
    }
    if (!customerId && live.hiddenId) {
        customerId = String(live.hiddenId).trim();
    }
    if (!customerId) {
        var input = document.querySelector('input[name="current-customer-id"]');
        customerId = input && input.value ? String(input.value).trim() : '';
    }
    if (!customerId && typeof resolveCurrentCustomerId === 'function') {
        customerId = resolveCurrentCustomerId(document) || '';
    }

    if (!viewedName && live.headerName) viewedName = live.headerName;
    if (!viewedTier && live.headerTier) viewedTier = String(live.headerTier);

    var tierNameToPg =
        typeof readTreeTierNameToPgMap === 'function'
            ? readTreeTierNameToPgMap(document)
            : {};

    // Clone live pagination query when available (matches Network tab after Mos eye).
    var fetchQuery =
        (locked && locked.fetchQuery && typeof locked.fetchQuery === 'object'
            ? Object.assign({}, locked.fetchQuery)
            : null) ||
        queryObjectFromParams(live.pageParams) ||
        null;

    var companySelect = document.querySelector('#company_select');
    var sortCountrySelect = document.querySelector('#sort_country_select');
    var sortStatusSelect = document.querySelector('#sort_status_select');
    var sortProfileStatusSelect = document.querySelector('#sort_profile_status_select');
    var searchTypeSelect = document.querySelector('#search_type_select');

    var filterCompany =
        (fetchQuery && fetchQuery.filter_company) ||
        (companySelect && companySelect.value && String(companySelect.value).trim()) ||
        (currentUrl && currentUrl.searchParams.get('filter_company')) ||
        '1';
    var filterSortCountry =
        (fetchQuery && fetchQuery.filter_sort_country) ||
        (sortCountrySelect && sortCountrySelect.value && String(sortCountrySelect.value).trim()) ||
        (currentUrl && currentUrl.searchParams.get('filter_sort_country')) ||
        '0';
    var filterSortAccountStatus =
        (fetchQuery && fetchQuery.filter_sort_account_status) ||
        (sortStatusSelect && sortStatusSelect.value && String(sortStatusSelect.value).trim()) ||
        (currentUrl && currentUrl.searchParams.get('filter_sort_account_status')) ||
        '';
    var filterSortProfileStatus =
        (fetchQuery && fetchQuery.filter_sort_profile_status) ||
        (sortProfileStatusSelect &&
            sortProfileStatusSelect.value &&
            String(sortProfileStatusSelect.value).trim()) ||
        (currentUrl && currentUrl.searchParams.get('filter_sort_profile_status')) ||
        '';
    var filterSearchType =
        (fetchQuery && fetchQuery.filter_search_type) ||
        (searchTypeSelect && searchTypeSelect.value && String(searchTypeSelect.value).trim()) ||
        '';
    var sortValue =
        (fetchQuery && fetchQuery.sort) ||
        (currentUrl && currentUrl.searchParams.get('sort')) ||
        'date_added-desc';

    var meta = {
        viewedPgCode: viewedPgCode || null,
        tierNameToPg: tierNameToPg,
        viewedCustomerId: customerId || '',
        nextCustomerId: customerId || '',
        fetchQuery: fetchQuery,
        viewedName: viewedName || '',
        viewedTier: viewedTier || '',
        syncMode: syncMode,
        fetchUrl: null
    };

    if (!customerId) {
        return emptyResult(page === 1 ? 1 : null, meta);
    }

    var urlObj = new URL('https://bc.pgmall.my/index.php');
    if (fetchQuery) {
        applyQueryObject(urlObj, fetchQuery);
    } else {
        urlObj.searchParams.set('filter_company', filterCompany);
        urlObj.searchParams.set('filter_sort_country', filterSortCountry);
        if (filterSortAccountStatus) {
            urlObj.searchParams.set('filter_sort_account_status', filterSortAccountStatus);
        }
        if (filterSortProfileStatus) {
            urlObj.searchParams.set('filter_sort_profile_status', filterSortProfileStatus);
        }
        if (filterSearchType) {
            urlObj.searchParams.set('filter_search_type', filterSearchType);
        }
        urlObj.searchParams.set('sort', sortValue);
        urlObj.searchParams.set('filter_name', '');
    }
    urlObj.searchParams.set('route', 'business/group_details/viewDownlineInfo');
    // Always force table token + page (never Tree Tier navigation token).
    urlObj.searchParams.set('customer_id', customerId);
    urlObj.searchParams.set('page', String(page));
    if (viewedName) {
        urlObj.searchParams.set('cust_name', viewedName);
    }
    if (viewedTier !== '') {
        urlObj.searchParams.set('tier', viewedTier);
    }
    if (!urlObj.searchParams.get('sort')) {
        urlObj.searchParams.set('sort', sortValue || 'date_added-desc');
    }
    if (!urlObj.searchParams.get('filter_company')) {
        urlObj.searchParams.set('filter_company', filterCompany);
    }
    if (!urlObj.searchParams.get('filter_sort_country')) {
        urlObj.searchParams.set('filter_sort_country', filterSortCountry);
    }
    urlObj.searchParams.set('t', String(Date.now()));

    var fetchUrl = urlObj.toString();
    meta.fetchUrl = fetchUrl;

    var res = await fetch(fetchUrl, { credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) {
        return emptyResult(page === 1 ? 1 : null, meta);
    }

    var html = await res.text();
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var totalPages = null;
    if (page === 1) {
        totalPages = parseTotalPagesFromDoc(doc);
    }

    // Tokens can rotate per page — capture next fetch context from response HTML.
    var nextLive =
        typeof readVisibleDownlineFetchContext === 'function'
            ? readVisibleDownlineFetchContext(doc)
            : { customerId: '', pageParams: null };
    var nextCustomerId =
        (nextLive.customerId && String(nextLive.customerId).trim()) || customerId;
    var nextFetchQuery =
        queryObjectFromParams(nextLive.pageParams) || fetchQuery || null;

    var table = doc.querySelector('#group_detail_info_table table.business-center-data-table');
    if (!table) {
        return emptyResult(totalPages, Object.assign({}, meta, {
            nextCustomerId: nextCustomerId,
            fetchQuery: nextFetchQuery
        }));
    }

    var rows = parseGroupDetailTableRows(table, {
        viewedPgCode: viewedPgCode,
        extraNameToPg: tierNameToPg,
        // Stamp after all pages merge so Parent Name → PG resolves across pages.
        stampParents: false
    });

    return {
        rows: rows,
        totalPages: totalPages,
        viewedPgCode: viewedPgCode || null,
        tierNameToPg: tierNameToPg,
        viewedCustomerId: customerId,
        nextCustomerId: nextCustomerId,
        fetchQuery: nextFetchQuery,
        viewedName: viewedName || '',
        viewedTier: viewedTier || '',
        syncMode: syncMode,
        fetchUrl: fetchUrl
    };
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
    const btnSyncRoot = document.getElementById('btn-sync-my-frontline');
    const btnSyncCurrent = document.getElementById('btn-sync-current-tier');
    const syncProgress = document.getElementById('syncProgress');
    const syncProgressFill = document.getElementById('syncProgressFill');
    const syncProgressText = document.getElementById('syncProgressText');
    const syncTierInfo = document.getElementById('syncTierInfo');
    const syncTierName = document.getElementById('syncTierName');
    const syncTierPg = document.getElementById('syncTierPg');
    const syncTierLevel = document.getElementById('syncTierLevel');
    const syncTierStatus = document.getElementById('syncTierStatus');
    const SYNC2_STATE_KEY = 'sync2_resume_state_v1';

    if (!syncProgress) return;
    if (!btnSync && !btnSyncRoot && !btnSyncCurrent) return;

    function setBusy(busy) {
        if (btnSync) btnSync.disabled = busy;
        if (btnSyncRoot) btnSyncRoot.disabled = busy;
        if (btnSyncCurrent) btnSyncCurrent.disabled = busy;
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

    /** PG Mall shows "-" (or similar) when a prospect has no PG code yet. */
    function isPlaceholderPgCode(value) {
        if (value == null) return true;
        var t = String(value).trim().toLowerCase();
        if (!t) return true;
        return ['-', '—', '–', 'n/a', 'na', 'none', 'nil', '.', '--', 'null'].indexOf(t) !== -1;
    }

    function normalizePgCodeForMatch(value) {
        if (value == null) return '';
        var s = String(value).trim();
        if (isPlaceholderPgCode(s)) return '';
        return s;
    }

    function normalizePgCodeForStorage(value) {
        var matchKey = normalizePgCodeForMatch(value);
        return matchKey || null;
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

    function sanitizePhoneForStorage(value) {
        if (value == null) return null;
        var v = String(value).replace(/\s{2,}/g, ' ').trim();
        if (!v || v === '-') return null;
        var digits = v.replace(/\D/g, '');
        if (digits.length < 7) return null;
        return v;
    }

    function isPatchValueNonEmpty(value) {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim() !== '';
        if (Array.isArray(value)) return value.length > 0;
        return true; // keep numbers (incl. 0), booleans, and objects
    }


    function formatTierLabel(ctx) {
        if (!ctx) return { name: '', pg: '', tierText: '', title: 'Tree Tier' };
        var pg = normalizePgCodeForStorage(ctx.pgCode || '') || '';
        var name = String(ctx.name || '').replace(/\s{2,}/g, ' ').trim();
        var tier = ctx.tier != null && String(ctx.tier).trim() !== ''
            ? String(ctx.tier).trim()
            : '';
        var tierText = tier !== '' ? ('Tier ' + tier) : '';
        var title = name || pg || 'Tree Tier';
        return { name: name, pg: pg, tierText: tierText, title: title };
    }

    function setSyncTierInfo(ctx, opts) {
        opts = opts || {};
        if (!syncTierInfo) return;
        var info = formatTierLabel(ctx);
        if (syncTierName) {
            syncTierName.textContent = info.name || (opts.emptyName || 'Unknown dealer');
        }
        if (syncTierPg) {
            syncTierPg.textContent = info.pg || '—';
        }
        if (syncTierLevel) {
            syncTierLevel.textContent = info.tierText || '';
            syncTierLevel.style.display = info.tierText ? '' : 'none';
        }
        if (syncTierStatus) {
            syncTierStatus.textContent = opts.status || '';
        }
        syncTierInfo.classList.toggle('is-syncing', Boolean(opts.syncing));
        syncTierInfo.classList.toggle('is-error', Boolean(opts.error));
        syncTierInfo.style.display = '';
    }

    function buildSyncTarget(ctx, syncMode) {
        if (!ctx) return null;
        var pg = normalizePgCodeForStorage(ctx.pgCode || '');
        var customerId = ctx.customerId ? String(ctx.customerId).trim() : '';
        if (!pg || !customerId) return null;
        return {
            customerId: customerId,
            pgCode: pg,
            name: String(ctx.name || '').replace(/\s{2,}/g, ' ').trim(),
            tier: ctx.tier != null && String(ctx.tier).trim() !== ''
                ? String(ctx.tier).trim()
                : '',
            mode: syncMode === 'root' ? 'root' : 'current',
            fetchQuery: ctx.fetchQuery && typeof ctx.fetchQuery === 'object'
                ? Object.assign({}, ctx.fetchQuery)
                : null,
            nextCustomerId: null
        };
    }

    function syncSourceId(syncMode) {
        return syncMode === 'root' ? 'btn-sync-my-frontline' : 'btn-sync-current-tier';
    }

    async function readTreeTierContext(syncMode) {
        return runInActiveTabWithResultArgs(function (mode) {
            if (mode === 'root' && typeof resolveRootTreeTierContext === 'function') {
                return resolveRootTreeTierContext(document);
            }
            if (typeof resolveCurrentViewedContext === 'function') {
                return resolveCurrentViewedContext(document);
            }
            return {
                customerId: typeof resolveCurrentCustomerId === 'function'
                    ? resolveCurrentCustomerId(document)
                    : '',
                pgCode: typeof resolveCurrentViewedPgCode === 'function'
                    ? resolveCurrentViewedPgCode(document)
                    : '',
                name: '',
                tier: '',
                mode: mode === 'root' ? 'root' : 'current',
                tableMatchesTier: false,
                fetchQuery: null
            };
        }, [syncMode === 'root' ? 'root' : 'current'], GROUP_DETAIL_PARSER_FILES);
    }

    async function refreshSyncTierPreview(statusText) {
        try {
            var ctx = await readTreeTierContext('current');
            var info = formatTierLabel(ctx);
            if (!info.pg && !info.name) {
                setSyncTierInfo(null, {
                    emptyName: 'Open Group Details on BC…',
                    status: statusText || 'No Tree Tier detected on the active tab',
                    error: true
                });
                return null;
            }
            setSyncTierInfo(ctx, {
                status:
                    statusText ||
                    ('Ready · open Tree Tier' +
                        (info.tierText ? ' · ' + info.tierText : '') +
                        (info.pg ? ' · ' + info.pg : '')),
                syncing: false,
                error: false
            });
            return ctx;
        } catch (e) {
            setSyncTierInfo(null, {
                emptyName: 'Open Group Details on BC…',
                status: 'Open bc.pgmall.my Group Details, then reopen this popup',
                error: true
            });
            return null;
        }
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
                patchBody.original_data = payload.original_data;
                return;
            }
            if (key === 'pg_code') {
                patchBody.pg_code = normalizePgCodeForStorage(payload.pg_code);
                return;
            }
            if (key === 'parent_pg_code') {
                var parentPg = normalizePgCodeForStorage(payload.parent_pg_code);
                if (parentPg) patchBody.parent_pg_code = parentPg;
                return;
            }
            if (key === 'phone') {
                patchBody.phone = payload.phone != null ? payload.phone : null;
                return;
            }
            if (isPatchValueNonEmpty(payload[key])) {
                patchBody[key] = payload[key];
            }
        });
        return patchBody;
    }

    function hasExistingClassificationData(existingEntry) {
        if (!existingEntry) return false;
        var hasText = function (v) { return typeof v === 'string' && v.trim() !== ''; };
        var hasAge = function (v) { return typeof v === 'number' && Number.isFinite(v); };
        return (
            hasText(existingEntry.gender) &&
            hasText(existingEntry.ethnicity) &&
            hasAge(existingEntry.age) &&
            hasText(existingEntry.prefix) &&
            hasText(existingEntry.first_name) &&
            hasText(existingEntry.sender_name) &&
            hasText(existingEntry.save_name)
        );
    }


    function buildCustomerPayload(row, processed, userId) {
        var nowIso = new Date().toISOString();
        var name = row.Name || row.name || null;
        var dob = row['D.O.B.'] || row['D.O.B'] || row.DOB || row.dob || null;
        var pgCode = normalizePgCodeForStorage(row.PGCode || row.pg_code || null);
        var parentPgCode = normalizePgCodeForStorage(
            row.parent_pg_code || row['Parent PGCode'] || row.parent_pg || null
        );
        var email = row.Email || row.email || null;
        var phone = sanitizePhoneForStorage(row.Telephone || row.phone || null);
        var mainFields = [
            'name', 'dob', 'email', 'phone', 'location', 'gender', 'ethnicity', 'age',
            'prefix', 'first_name', 'sender_name', 'save_name', 'pg_code', 'parent_pg_code',
            'is_friend', 'Name', 'Email', 'Telephone', 'D.O.B.', 'PGCode', 'Gender',
            'Ethnicity', 'Age', 'Prefix', 'FirstName', 'SenderName', 'SaveName', 'Location',
            'Parent PGCode', '_viewed_pg_code'
        ];
        var originalData = {};
        Object.keys(row).forEach(function (k) {
            if (k.charAt(0) === '_') return;
            if (mainFields.indexOf(k) === -1 && k !== 'id' && k !== 'user_id') {
                originalData[k] = row[k];
            }
        });
        if (parentPgCode) originalData['Parent PGCode'] = parentPgCode;
        // Keep Tree Tier context for CRM filters / re-stamp (underscore keys are
        // otherwise stripped above).
        var viewedHint = normalizePgCodeForStorage(row._viewed_pg_code || null);
        if (viewedHint) originalData._viewed_pg_code = viewedHint;
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
        if (parentPgCode) payload.parent_pg_code = parentPgCode;
        return payload;
    }

    /**
     * Open Tree Tier syncs only that dealer's children — never upsert the
     * viewed dealer themselves (phone / empire / rank live on root frontline).
     */
    function skipViewedDealerFromRows(rows, viewedPgCode) {
        var list = Array.isArray(rows) ? rows : [];
        var viewedKey = normalizePgCodeForMatch(viewedPgCode || '');
        if (!viewedKey) return list.slice();
        return list.filter(function (r) {
            var rowPg = normalizePgCodeForMatch(r.PGCode || r.pg_code || '');
            return !rowPg || rowPg !== viewedKey;
        });
    }

    function prepareRowsForUpsert(rows, viewedPgCodeHint, extraNameToPg) {
        var list = Array.isArray(rows) ? rows.slice() : [];
        var viewed = normalizePgCodeForStorage(viewedPgCodeHint);
        if (!viewed) {
            for (var i = 0; i < list.length; i++) {
                var hint = list[i] && list[i]._viewed_pg_code;
                if (hint) {
                    viewed = normalizePgCodeForStorage(hint);
                    if (viewed) break;
                }
            }
        }
        if (typeof stampParentPgCodesOnRows === 'function') {
            stampParentPgCodesOnRows(list, viewed || '', extraNameToPg || null);
        } else {
            var nameToPg = {};
            if (extraNameToPg && typeof extraNameToPg === 'object') {
                Object.keys(extraNameToPg).forEach(function (k) {
                    var pg = normalizePgCodeForStorage(extraNameToPg[k]);
                    var key = String(k || '').replace(/\s{2,}/g, ' ').trim().toUpperCase();
                    if (key && pg) nameToPg[key] = pg;
                });
            }
            list.forEach(function (r) {
                var n = String(r.Name || '').replace(/\s{2,}/g, ' ').trim().toUpperCase();
                var p = normalizePgCodeForStorage(r.PGCode || r.pg_code);
                if (n && p) nameToPg[n] = p;
            });
            list.forEach(function (r) {
                var rowPg = normalizePgCodeForStorage(r.PGCode || r.pg_code);
                if (rowPg && viewed && rowPg === viewed) {
                    var existingParent = normalizePgCodeForStorage(
                        r.parent_pg_code || r['Parent PGCode'] || ''
                    );
                    if (existingParent && existingParent !== rowPg) {
                        r.parent_pg_code = existingParent;
                        r['Parent PGCode'] = existingParent;
                    }
                    return;
                }
                var parentName = String(r['Parent Name'] || '').replace(/\s{2,}/g, ' ').trim();
                var parentPg = null;
                if (!parentName || parentName === '-' || parentName === '—' || parentName === '–') {
                    parentPg = viewed;
                } else {
                    parentPg = nameToPg[parentName.toUpperCase()] || null;
                    // Same as stampParentPgCodesOnRows: unresolved named parent
                    // on a Tree Tier sync still belongs under the viewed dealer.
                    if (!parentPg && viewed) parentPg = viewed;
                }
                if (parentPg && rowPg && parentPg === rowPg) parentPg = null;
                if (parentPg) {
                    r.parent_pg_code = parentPg;
                    r['Parent PGCode'] = parentPg;
                }
                if (viewed) r._viewed_pg_code = viewed;
            });
        }
        return list;
    }

    async function syncRowsToSupabase(rows, supabaseUrl, anonKey, webappOrigin, userId, accessToken, progressOpts) {
        progressOpts = progressOpts || {};
        rows = prepareRowsForUpsert(
            rows,
            progressOpts.viewedPgCode || null,
            progressOpts.extraNameToPg || null
        );
        // Never upsert the open Tree Tier dealer from their own frontline sync.
        rows = skipViewedDealerFromRows(rows, progressOpts.viewedPgCode || null);
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
                    + '&select=id,pg_code,is_friend,phone,email,gender,ethnicity,age,prefix,first_name,sender_name,save_name'
                    + '&limit=' + pageSize
                    + '&offset=' + offset;
                var res = await fetch(url, { headers: headers });
                if (!res.ok) break;
                var list = await res.json();
                if (!Array.isArray(list) || list.length === 0) break;
                list.forEach(function (c) {
                    var entry = {
                        id: c.id,
                        is_friend: c.is_friend === true,
                        gender: c.gender || null,
                        ethnicity: c.ethnicity || null,
                        age: c.age,
                        prefix: c.prefix || null,
                        first_name: c.first_name || null,
                        sender_name: c.sender_name || null,
                        save_name: c.save_name || null
                    };
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

        // Drop stale direct-frontline links under this Tree Tier PG before upsert.
        var viewedForCleanup = normalizePgCodeForStorage(progressOpts.viewedPgCode || '');
        if (viewedForCleanup && startIndex === 0) {
            try {
                setProgress(
                    Math.max(checkPct, rowStart - 3),
                    'Clearing stale frontline under ' + viewedForCleanup + '...'
                );
                var keepPg = {};
                rows.forEach(function (r) {
                    var k = normalizePgCodeForMatch(r.PGCode || r.pg_code || '');
                    if (k) keepPg[k] = true;
                });
                var clearOffset = 0;
                var clearPage = 500;
                var staleIds = [];
                while (true) {
                    var clearUrl =
                        supabaseUrl +
                        '/rest/v1/customers?user_id=eq.' +
                        encodeURIComponent(userId) +
                        '&parent_pg_code=eq.' +
                        encodeURIComponent(viewedForCleanup) +
                        '&select=id,pg_code&limit=' +
                        clearPage +
                        '&offset=' +
                        clearOffset;
                    var clearRes = await fetch(clearUrl, { headers: headers });
                    if (!clearRes.ok) break;
                    var staleBatch = await clearRes.json();
                    if (!Array.isArray(staleBatch) || staleBatch.length === 0) break;
                    for (var s = 0; s < staleBatch.length; s++) {
                        var stale = staleBatch[s];
                        var stalePg = normalizePgCodeForMatch(stale.pg_code);
                        if (stalePg && keepPg[stalePg]) continue;
                        if (stale.id) staleIds.push(stale.id);
                    }
                    if (staleBatch.length < clearPage) break;
                    clearOffset += clearPage;
                }
                for (var c = 0; c < staleIds.length; c++) {
                    await fetch(
                        supabaseUrl +
                            '/rest/v1/customers?id=eq.' +
                            encodeURIComponent(staleIds[c]),
                        {
                            method: 'PATCH',
                            headers: Object.assign({}, headers, {
                                'Content-Type': 'application/json',
                                Prefer: 'return=minimal'
                            }),
                            body: JSON.stringify({
                                parent_pg_code: null,
                                updated_at: new Date().toISOString()
                            })
                        }
                    );
                }
            } catch (cleanupErr) { /* non-fatal */ }
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
            var existing = null;
            var pgCode = normalizePgCodeForMatch(row.PGCode || row.pg_code || '');
            var phoneKey = normalizePhoneForMatch(row.Telephone || row.phone || '');
            var emailKey = normalizeEmailForMatch(row.Email || row.email || '');
            if (pgCode && existingByPgCode[pgCode]) {
                existing = existingByPgCode[pgCode];
            } else if (phoneKey && existingByPhone[phoneKey]) {
                existing = existingByPhone[phoneKey];
            } else if (emailKey && existingByEmail[emailKey]) {
                existing = existingByEmail[emailKey];
            }
            var processResult = null;
            try {
                if (!hasExistingClassificationData(existing)) {
                    var pr = await fetch(webappOrigin + '/api/openai/process-row', {
                        method: 'POST',
                        headers: Object.assign(
                            { 'Content-Type': 'application/json' },
                            getExtensionVersionHeader()
                        ),
                        body: JSON.stringify({ rowData: row, rowNumber: i + 1 })
                    });
                    var data = await pr.json();
                    if (pr.ok && data && data.result) {
                        processResult = data.result;
                    }
                }
            } catch (e) { /* use row only */ }

            var payload = buildCustomerPayload(row, processResult, userId);
            pgCode = normalizePgCodeForMatch(payload.pg_code);
            phoneKey = normalizePhoneForMatch(payload.phone);
            emailKey = normalizeEmailForMatch(payload.email);
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
                        var updatedEntry = {
                            id: existingId,
                            is_friend: existing.is_friend === true,
                            gender: (patchBody.gender != null ? patchBody.gender : existing.gender) || null,
                            ethnicity: (patchBody.ethnicity != null ? patchBody.ethnicity : existing.ethnicity) || null,
                            age: patchBody.age != null ? patchBody.age : existing.age,
                            prefix: (patchBody.prefix != null ? patchBody.prefix : existing.prefix) || null,
                            first_name: (patchBody.first_name != null ? patchBody.first_name : existing.first_name) || null,
                            sender_name: (patchBody.sender_name != null ? patchBody.sender_name : existing.sender_name) || null,
                            save_name: (patchBody.save_name != null ? patchBody.save_name : existing.save_name) || null
                        };
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
                                is_friend: created[0].is_friend === true,
                                gender: created[0].gender || payload.gender || null,
                                ethnicity: created[0].ethnicity || payload.ethnicity || null,
                                age: created[0].age != null ? created[0].age : payload.age,
                                prefix: created[0].prefix || payload.prefix || null,
                                first_name: created[0].first_name || payload.first_name || null,
                                sender_name: created[0].sender_name || payload.sender_name || null,
                                save_name: created[0].save_name || payload.save_name || null
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
            await ensureExtensionCanSync();

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
                rows = await runInActiveTabWithResult(rowsFetcher, GROUP_DETAIL_PARSER_FILES);
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
            if (e && e.code === 'EXTENSION_OUTDATED') {
                alert(e.message || 'Extension update required.');
            }
        }
    }

    var FETCH_PROGRESS_MAX = 38;

    async function syncVisibleRowsFromCurrentPage(userId, accessToken, supabaseUrl, anonKey, webappOrigin, progressLabel, syncMode) {
        var visibleRows = await runInActiveTabWithResult(getCustomerRowsForSync, GROUP_DETAIL_PARSER_FILES);
        if (!visibleRows || !visibleRows.length) {
            return null;
        }

        setProgress(40, progressLabel || ('Syncing ' + visibleRows.length + ' rows from current page...'));
        var runId = await createSyncRun(
            supabaseUrl,
            anonKey,
            accessToken,
            userId,
            'single_page_sync',
            visibleRows.length,
            { source: syncSourceId(syncMode || 'current'), mode: 'visible_page_fallback' }
        );
        var result = await syncRowsToSupabase(visibleRows, supabaseUrl, anonKey, webappOrigin, userId, accessToken, {
            rowStart: 40,
            rowEnd: 97
        });
        await updateSyncRun(supabaseUrl, anonKey, accessToken, runId, {
            status: result.failed > 0 ? 'failed' : 'completed',
            inserted_count: result.inserted,
            updated_count: result.updated,
            failed_count: result.failed,
            finished_at: new Date().toISOString()
        });
        return result;
    }

    function applyPageFetchMeta(syncTarget, pageResult) {
        if (!syncTarget || !pageResult) return;
        if (pageResult.nextCustomerId) {
            syncTarget.customerId = String(pageResult.nextCustomerId).trim();
            syncTarget.nextCustomerId = String(pageResult.nextCustomerId).trim();
        } else if (pageResult.viewedCustomerId) {
            syncTarget.customerId = String(pageResult.viewedCustomerId).trim();
        }
        if (pageResult.fetchQuery && typeof pageResult.fetchQuery === 'object') {
            syncTarget.fetchQuery = Object.assign({}, pageResult.fetchQuery);
        }
    }

    async function runSyncDownlineAllPages(syncMode) {
        syncMode = syncMode === 'root' ? 'root' : 'current';
        var syncModeLabel = syncMode === 'root' ? 'My frontline (tier 0)' : 'Open Tree Tier';
        try {
            await ensureExtensionCanSync();

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

            var targetContext = null;
            try {
                targetContext = await readTreeTierContext(syncMode);
            } catch (ctxErr) {
                targetContext = null;
            }

            if (
                targetContext &&
                targetContext.tableMatchesTier === false
            ) {
                if (syncMode === 'current') {
                    alert(
                        "This dealer's frontline table is not loaded yet.\n\n" +
                        'On Business Center: click the eye on Mos (or open them in Tree Tier) and wait until the table shows their members.\n' +
                        'Then click Sync open Tree Tier again.\n\n' +
                        'Tip: the Network tab URL must include their customer_id + tier — not your root list.'
                    );
                    setSyncTierInfo(targetContext, {
                        status: 'Waiting for table to match open Tree Tier — open dealer eye first',
                        syncing: false,
                        error: true
                    });
                    return;
                }
                alert(
                    'Your frontline table (tier 0) is not loaded.\n\n' +
                    'On Business Center: click your name in Tree Tier (tier 0) and wait until the table shows your members (~1364), then click Sync my frontline.'
                );
                setSyncTierInfo(targetContext, {
                    status: 'Waiting for tier 0 table — open your Tree Tier first',
                    syncing: false,
                    error: true
                });
                return;
            }

            var syncTarget = buildSyncTarget(targetContext, syncMode);
            var targetInfo = formatTierLabel(targetContext);
            var targetPg = targetInfo.pg || '';

            if (!syncTarget) {
                alert(
                    syncMode === 'root'
                        ? 'Could not read your tier 0 (root) on Business Center. Open Group Details and try again.'
                        : 'Could not read the open Tree Tier on Business Center. Click a dealer in Tree Tier first, then sync.'
                );
                return;
            }

            setBusy(true);
            syncProgress.style.display = 'block';
            setSyncTierInfo(targetContext, {
                emptyName: syncMode === 'root' ? 'Your frontline' : 'Open Tree Tier',
                status:
                    syncModeLabel +
                    ' · preparing ' +
                    targetInfo.title +
                    (targetInfo.tierText ? ' (' + targetInfo.tierText + ')' : '') +
                    ' · ' +
                    targetPg,
                syncing: true
            });
            setProgress(0, targetPg + ' — preparing ' + syncModeLabel.toLowerCase() + '…');

            // Discard legacy resume jobs that lack viewedCustomerId (wrong dealer risk).
            if (
                resumeState &&
                resumeState.status === 'processing' &&
                Array.isArray(resumeState.rows) &&
                resumeState.rows.length > 0
            ) {
                if (!resumeState.viewedCustomerId) {
                    await clearSync2State(userId);
                    resumeState = null;
                }
            }

            if (
                resumeState &&
                resumeState.status === 'processing' &&
                Array.isArray(resumeState.rows) &&
                resumeState.rows.length > 0
            ) {
                var resumePg = normalizePgCodeForStorage(resumeState.viewedPgCode || '');
                var resumeMode = resumeState.syncMode === 'root' ? 'root' : 'current';
                var resumeCustomerId = resumeState.viewedCustomerId
                    ? String(resumeState.viewedCustomerId).trim()
                    : '';
                var resumeMatchesTarget =
                    resumePg &&
                    targetPg &&
                    resumePg === targetPg &&
                    resumeMode === syncMode &&
                    resumeCustomerId &&
                    resumeCustomerId === syncTarget.customerId;
                if (!resumeMatchesTarget) {
                    await clearSync2State(userId);
                    resumeState = null;
                    setSyncTierInfo(targetContext, {
                        status:
                            'Starting fresh sync for ' +
                            targetInfo.title +
                            ' (' +
                            targetPg +
                            ')',
                        syncing: true
                    });
                    setProgress(0, 'Starting fresh sync for ' + targetPg + '…');
                }
            }

            if (
                resumeState &&
                resumeState.status === 'processing' &&
                Array.isArray(resumeState.rows) &&
                resumeState.rows.length > 0
            ) {
                var resumeFrom = Number(resumeState.nextRowIndex || 0);
                if (!isFinite(resumeFrom) || resumeFrom < 0) resumeFrom = 0;
                if (resumeFrom > resumeState.rows.length) resumeFrom = 0;
                var resumeLabel = resumePg || targetPg || 'Tree Tier';
                setSyncTierInfo(targetContext, {
                    status:
                        'Resuming ' +
                        resumeLabel +
                        ' · row ' +
                        (resumeFrom + 1) +
                        ' of ' +
                        resumeState.rows.length,
                    syncing: true
                });
                setProgress(
                    40 + Math.round((57 * resumeFrom) / resumeState.rows.length),
                    'Resuming ' + resumeLabel + ' from row ' + (resumeFrom + 1) + ' of ' + resumeState.rows.length + '...'
                );
                var resumeRunId = await createSyncRun(
                    supabaseUrl,
                    anonKey,
                    accessToken,
                    userId,
                    'downline_all_pages_resume',
                    resumeState.rows.length,
                    {
                        source: syncSourceId(syncMode),
                        resumed: true,
                        viewed_pg_code: resumePg || null,
                        sync_mode: syncMode,
                        viewed_customer_id: resumeCustomerId || null
                    }
                );
                var resumeResult = await syncRowsToSupabase(
                    resumeState.rows,
                    supabaseUrl,
                    anonKey,
                    webappOrigin,
                    userId,
                    accessToken,
                    {
                        rowStart: 40,
                        rowEnd: 97,
                        startIndex: resumeFrom,
                        viewedPgCode: resumePg || targetPg || null,
                        getRowProgressText: function (rowIndex, totalRows) {
                            var rowNumber = rowIndex + 1;
                            var pageNumber = getPageFromRowNumber(resumeState.pageBreaks, rowNumber);
                            var prefix = resumeLabel + ' — ';
                            setSyncTierInfo(targetContext, {
                                status:
                                    'Syncing to CRMPG · row ' +
                                    rowNumber +
                                    ' of ' +
                                    totalRows +
                                    (pageNumber && resumeState.totalPages
                                        ? ' · page ' + pageNumber + '/' + resumeState.totalPages
                                        : ''),
                                syncing: true
                            });
                            if (pageNumber && resumeState.totalPages) {
                                return prefix + 'Processing row ' + rowNumber + ' of ' + totalRows + ' (Page ' + pageNumber + '/' + resumeState.totalPages + ')...';
                            }
                            return prefix + 'Processing row ' + rowNumber + ' of ' + totalRows + '...';
                        },
                        onRowProcessed: async function (rowIndex) {
                            var rowNumber = rowIndex + 1;
                            await setSync2State(userId, {
                                status: 'processing',
                                syncMode: syncMode,
                                viewedPgCode: resumePg || targetPg || null,
                                viewedCustomerId: resumeCustomerId || syncTarget.customerId,
                                nextRowIndex: rowNumber,
                                lastProcessedRow: rowNumber,
                                currentPage: getPageFromRowNumber(resumeState.pageBreaks, rowNumber) || null
                            });
                        }
                    }
                );
                await updateSyncRun(supabaseUrl, anonKey, accessToken, resumeRunId, {
                    status: resumeResult.failed > 0 ? 'failed' : 'completed',
                    inserted_count: resumeResult.inserted,
                    updated_count: resumeResult.updated,
                    failed_count: resumeResult.failed,
                    finished_at: new Date().toISOString()
                });
                await clearSync2State(userId);
                setSyncTierInfo(targetContext, {
                    status:
                        'Done · ' +
                        resumeResult.inserted +
                        ' added, ' +
                        resumeResult.updated +
                        ' updated' +
                        (resumeResult.failed ? ', ' + resumeResult.failed + ' failed' : ''),
                    syncing: false,
                    error: resumeResult.failed > 0
                });
                return;
            }

            setSyncTierInfo(targetContext, {
                status:
                    'Fetching ' +
                    syncModeLabel.toLowerCase() +
                    ' for ' +
                    targetInfo.title +
                    ' (' +
                    targetPg +
                    ')',
                syncing: true
            });
            setProgress(0, targetPg + ' — reading page 1…');
            await setSync2State(userId, {
                status: 'fetching',
                syncMode: syncMode,
                startedAt: Date.now(),
                currentPage: 1,
                totalPages: null,
                lastProcessedRow: 0,
                nextRowIndex: 0,
                rows: null,
                pageBreaks: null,
                viewedPgCode: targetPg || null,
                viewedCustomerId: syncTarget.customerId
            });

            var first;
            var fetchError = null;
            try {
                first = await runInActiveTabWithResultArgs(
                    fetchDownlineSinglePage,
                    [1, syncTarget],
                    GROUP_DETAIL_PARSER_FILES
                );
            } catch (e) {
                fetchError = e;
                first = null;
            }

            if (first) {
                applyPageFetchMeta(syncTarget, first);
            }

            if (!first || !first.rows || !first.rows.length) {
                try {
                    var fallbackResult = await syncVisibleRowsFromCurrentPage(
                        userId,
                        accessToken,
                        supabaseUrl,
                        anonKey,
                        webappOrigin,
                        'Multi-page fetch unavailable. Syncing visible rows on this page...',
                        syncMode
                    );
                    if (fallbackResult) {
                        await clearSync2State(userId);
                        setSyncTierInfo(targetContext, {
                            status: 'Synced visible page (multi-page fetch unavailable)',
                            syncing: false
                        });
                        return;
                    }
                } catch (fallbackErr) {
                    fetchError = fallbackErr;
                }

                syncProgress.style.display = 'none';
                setBusy(false);
                await clearSync2State(userId);
                var detail = fetchError && fetchError.message ? (' ' + fetchError.message) : '';
                alert(
                    'Could not fetch all downline pages.' + detail +
                    ' Stay on Group Details with the customer table visible, then try again. ' +
                    'If the table is visible but sync still fails, reload the page and retry.'
                );
                setSyncTierInfo(targetContext, {
                    status: 'Fetch failed — reload Group Details and retry',
                    syncing: false,
                    error: true
                });
                return;
            }

            var totalPages = first && first.totalPages != null ? first.totalPages : 1;
            if (totalPages < 1) totalPages = 1;
            var allRows = first && first.rows ? first.rows.slice() : [];
            var pageBreaks = [allRows.length];
            var viewedPgCode =
                syncTarget.pgCode ||
                (first && first.viewedPgCode) ||
                (allRows[0] && allRows[0]._viewed_pg_code) ||
                targetPg ||
                null;
            var tierNameToPg = (first && first.tierNameToPg) || {};
            var syncDealerName =
                (targetContext && targetContext.name) ||
                (first && first.viewedName) ||
                '';
            var syncTierLevel =
                syncTarget.tier ||
                (targetContext && targetContext.tier != null ? String(targetContext.tier) : '') ||
                '';

            await setSync2State(userId, {
                status: 'fetching',
                syncMode: syncMode,
                totalPages: totalPages,
                currentPage: 1,
                viewedPgCode: viewedPgCode || null,
                viewedCustomerId: syncTarget.customerId
            });

            setProgress(
                Math.round((1 / totalPages) * FETCH_PROGRESS_MAX),
                targetPg + ' — page 1 / ' + totalPages
            );
            setSyncTierInfo(
                {
                    name: syncDealerName,
                    pgCode: viewedPgCode,
                    tier: syncTierLevel
                },
                {
                    status: 'Fetching page 1 / ' + totalPages,
                    syncing: true
                }
            );

            for (var p = 2; p <= totalPages; p++) {
                setProgress(
                    Math.round(((p - 1) / totalPages) * FETCH_PROGRESS_MAX),
                    targetPg + ' — page ' + p + ' / ' + totalPages
                );
                setSyncTierInfo(
                    {
                        name: syncDealerName,
                        pgCode: viewedPgCode,
                        tier: syncTierLevel
                    },
                    {
                        status: 'Fetching page ' + p + ' / ' + totalPages,
                        syncing: true
                    }
                );
                var chunk;
                try {
                    chunk = await runInActiveTabWithResultArgs(
                        fetchDownlineSinglePage,
                        [p, syncTarget],
                        GROUP_DETAIL_PARSER_FILES
                    );
                } catch (e) {
                    syncProgress.style.display = 'none';
                    setBusy(false);
                    alert('Failed while loading page ' + p + ' of ' + totalPages + '. Try again.');
                    return;
                }
                if (chunk) {
                    applyPageFetchMeta(syncTarget, chunk);
                }
                if (chunk && chunk.rows && chunk.rows.length) {
                    for (var r = 0; r < chunk.rows.length; r++) {
                        allRows.push(chunk.rows[r]);
                    }
                }
                pageBreaks.push(allRows.length);
                setProgress(
                    Math.round((p / totalPages) * FETCH_PROGRESS_MAX),
                    targetPg + ' — page ' + p + ' / ' + totalPages
                );
                await setSync2State(userId, {
                    status: 'fetching',
                    syncMode: syncMode,
                    currentPage: p,
                    totalPages: totalPages,
                    viewedPgCode: viewedPgCode || null,
                    viewedCustomerId: syncTarget.customerId
                });
            }

            if (!allRows.length) {
                setProgress(100, 'No rows found.');
                syncProgress.style.display = 'none';
                setBusy(false);
                await clearSync2State(userId);
                return;
            }

            // Stamp parents with locked Tree Tier PG after all pages merge.
            allRows = prepareRowsForUpsert(allRows, viewedPgCode, tierNameToPg);
            // Skip the open dealer — full profile comes from Sync my frontline only.
            allRows = skipViewedDealerFromRows(allRows, viewedPgCode);

            await setSync2State(userId, {
                status: 'processing',
                syncMode: syncMode,
                rows: allRows,
                pageBreaks: pageBreaks,
                totalPages: totalPages,
                totalRows: allRows.length,
                nextRowIndex: 0,
                lastProcessedRow: 0,
                currentPage: 1,
                viewedPgCode: viewedPgCode || null,
                viewedCustomerId: syncTarget.customerId
            });

            var runId = await createSyncRun(
                supabaseUrl,
                anonKey,
                accessToken,
                userId,
                'downline_all_pages',
                allRows.length,
                {
                    source: syncSourceId(syncMode),
                    total_pages: totalPages,
                    viewed_pg_code: viewedPgCode || null,
                    sync_mode: syncMode,
                    viewed_customer_id: syncTarget.customerId
                }
            );
            var result = await syncRowsToSupabase(allRows, supabaseUrl, anonKey, webappOrigin, userId, accessToken, {
                rowStart: 40,
                rowEnd: 97,
                viewedPgCode: viewedPgCode || null,
                extraNameToPg: tierNameToPg,
                getRowProgressText: function (rowIndex, totalRows) {
                    var rowNumber = rowIndex + 1;
                    var pageNumber = getPageFromRowNumber(pageBreaks, rowNumber);
                    setSyncTierInfo(
                        {
                            name: syncDealerName,
                            pgCode: viewedPgCode,
                            tier: syncTierLevel
                        },
                        {
                            status:
                                'Syncing to CRMPG · row ' +
                                rowNumber +
                                ' of ' +
                                totalRows +
                                (pageNumber ? ' · page ' + pageNumber + '/' + totalPages : ''),
                            syncing: true
                        }
                    );
                    return (
                        (viewedPgCode || targetPg || 'Tree Tier') +
                        ' — Processing row ' +
                        rowNumber +
                        ' of ' +
                        totalRows +
                        ' (Page ' +
                        pageNumber +
                        '/' +
                        totalPages +
                        ')...'
                    );
                },
                onRowProcessed: async function (rowIndex) {
                    var rowNumber = rowIndex + 1;
                    await setSync2State(userId, {
                        status: 'processing',
                        syncMode: syncMode,
                        viewedPgCode: viewedPgCode || null,
                        viewedCustomerId: syncTarget.customerId,
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
                    source: syncSourceId(syncMode),
                    total_pages: totalPages,
                    viewed_pg_code: viewedPgCode || null,
                    sync_mode: syncMode
                }
            });
            await clearSync2State(userId);
            setSyncTierInfo(
                {
                    name: syncDealerName,
                    pgCode: viewedPgCode,
                    tier: syncTierLevel
                },
                {
                    status:
                        'Done · ' +
                        result.inserted +
                        ' added, ' +
                        result.updated +
                        ' updated' +
                        (result.failed ? ', ' + result.failed + ' failed' : ''),
                    syncing: false,
                    error: result.failed > 0
                }
            );
        } catch (e) {
            syncProgress.style.display = 'none';
            setBusy(false);
            if (e && e.code === 'EXTENSION_OUTDATED') {
                alert(e.message || 'Extension update required.');
            }
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
            if (!state || state.status !== 'processing' || !Array.isArray(state.rows) || !state.rows.length) {
                void refreshSyncTierPreview();
                return;
            }
            if (!state.viewedCustomerId) {
                await clearSync2State(userId);
                void refreshSyncTierPreview();
                return;
            }

            var lastRow = Number(state.lastProcessedRow || 0);
            if (!isFinite(lastRow) || lastRow < 0) lastRow = 0;
            var pct = 40 + Math.round((57 * lastRow) / state.rows.length);
            if (pct > 97) pct = 97;
            var resumePg = normalizePgCodeForStorage(state.viewedPgCode || '') || '';
            var resumeMode = state.syncMode === 'root' ? 'root' : 'current';
            syncProgress.style.display = 'block';
            setSyncTierInfo(
                { name: '', pgCode: resumePg, tier: '' },
                {
                    emptyName: resumePg ? resumePg : 'Interrupted sync',
                    status:
                        'Resume available · last row ' +
                        lastRow +
                        ' of ' +
                        state.rows.length +
                        (resumePg ? ' · ' + resumePg : '') +
                        (resumeMode === 'root' ? ' · my frontline' : ' · open Tree Tier') +
                        '. Click the matching sync button to continue.',
                    syncing: false
                }
            );
            setProgress(
                pct,
                'Resume available' +
                (resumePg ? ' for ' + resumePg : '') +
                ': last row ' + lastRow + ' of ' + state.rows.length +
                (state.currentPage && state.totalPages ? ' (Page ' + state.currentPage + '/' + state.totalPages + ')' : '') +
                '. Click sync to continue.'
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
    if (btnSyncRoot) {
        btnSyncRoot.addEventListener('click', function () {
            void runSyncDownlineAllPages('root');
        });
    }
    if (btnSyncCurrent) {
        btnSyncCurrent.addEventListener('click', function () {
            void runSyncDownlineAllPages('current');
        });
    }
    void showSync2ResumeHint();

    function triggerConfetti() {
        if (typeof JSConfetti === 'undefined') return;
        try {
            var jsConfetti = window._syncConfetti || (window._syncConfetti = new JSConfetti());
            jsConfetti.addConfetti({
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
