/**
 * Shared PG Mall Group Details table parser.
 * Injected before sync executeScript calls so column mapping follows thead headers.
 *
 * BC columns (2026): PGCode, Email, Profile Verified Status, Name, Parent Name,
 * D.O.B., Rank, Branch, Nationality, Telephone, Total Frontline, Empire Size,
 * Date Register, Last Purchase Date, Direct Debit Subscription.
 * Junior Account rows: Name / PGCode / D.O.B. are the child's. Parent Name is
 * the guardian only — never use it as the customer identity.
 * Row modal (Additional Information): Origin, FMD PGCode, FMD Name.
 *
 * Parent PG is not a column. Rules:
 * - Parent Name "-" / empty → parent_pg_code = currently viewed Tree Tier PG
 * - Parent Name = person → resolve that name to a PG within the sync batch
 *
 * Sync is manual per Tree Tier: user opens a node, then clicks sync.
 * The extension never auto-clicks / walks deeper tiers.
 */
function normalizeHeader(text) {
  return String(text || '').replace(/\s{2,}/g, ' ').trim().toLowerCase();
}

function toTitleCase(s) {
  if (!s || typeof s !== 'string') return s;
  return s.trim().split(/\s+/).map(function (w) {
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

function normalizePersonName(value) {
  return String(value || '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toUpperCase();
}

function isBlankParentName(value) {
  var t = String(value || '').replace(/\s{2,}/g, ' ').trim();
  if (!t) return true;
  return t === '-' || t === '—' || t === '–' || t.toLowerCase() === 'n/a';
}

function normalizePgCodeValue(value) {
  if (value == null) return '';
  var s = String(value).replace(/\s{2,}/g, ' ').trim();
  if (!s) return '';
  var lower = s.toLowerCase();
  if (['-', '—', '–', 'n/a', 'na', 'none', 'nil', '.', '--', 'null'].indexOf(lower) !== -1) {
    return '';
  }
  var match = s.match(/\b(PG\d+)\b/i);
  if (match) return match[1].toUpperCase();
  return s.toUpperCase();
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

function sanitizeTelephone(value) {
  var v = String(value || '').replace(/\s{2,}/g, ' ').trim();
  if (!v || v === '-') return '';
  var digits = v.replace(/\D/g, '');
  if (digits.length < 7) return '';
  return v;
}

function buildColumnIndexMap(table) {
  var map = {};
  var ths = table.querySelectorAll('thead th');
  for (var i = 0; i < ths.length; i++) {
    var key = normalizeHeader(ths[i].textContent);
    if (key) map[key] = i;
  }
  return map;
}

function cellText(cells, idx) {
  if (idx == null || idx < 0 || !cells[idx]) return '';
  return (cells[idx].textContent || '').replace(/\s{2,}/g, ' ').trim();
}

function col(map, cells, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var idx = map[aliases[i]];
    if (idx != null) return cellText(cells, idx);
  }
  return '';
}

function parseMoreDetailFields(tr) {
  var out = {};
  if (!tr) return out;
  var container = tr.querySelector('.more-detail-container');
  if (!container) return out;

  var rows = container.querySelectorAll('.content-info-row');
  for (var i = 0; i < rows.length; i++) {
    var titleEl = rows[i].querySelector('.content-info-title-block');
    var textEl = rows[i].querySelector('.content-info-text-block');
    var title = normalizeHeader(titleEl ? titleEl.textContent : '');
    var text = textEl
      ? String(textEl.textContent || '').replace(/\s{2,}/g, ' ').trim()
      : '';
    if (!title || !text || text === '-') continue;

    if (title === 'origin') out.Origin = text;
    else if (title === 'fmd pgcode' || title === 'fmd pg code') {
      out['FMD PGCode'] = normalizePgCodeValue(text) || text;
    } else if (title === 'fmd name') {
      out['FMD Name'] = toTitleCase(text);
    }
  }
  return out;
}

function parseTierLabel(text) {
  var raw = String(text || '').replace(/\s{2,}/g, ' ').trim();
  if (!raw) return { name: '', pgCode: '' };
  var match = raw.match(/^(.*)\((PG\d+)\)\s*$/i);
  if (match) {
    return {
      name: String(match[1] || '').replace(/\s{2,}/g, ' ').trim(),
      pgCode: String(match[2] || '').toUpperCase()
    };
  }
  return { name: raw, pgCode: normalizePgCodeValue(raw) };
}

/**
 * All Tree Tier breadcrumbs: name → PG (includes ancestors + current view).
 */
function readTreeTierNameToPgMap(root) {
  root = root || document;
  var map = {};
  var cells = root.querySelectorAll('#tier_info tr td:last-child, #tier_info .td-text-hover');
  for (var i = 0; i < cells.length; i++) {
    var parsed = parseTierLabel(cells[i].textContent || '');
    var key = normalizePersonName(parsed.name);
    if (key && parsed.pgCode) map[key] = parsed.pgCode;
  }
  return map;
}

function decodeBcJsString(value) {
  return String(value || '')
    .replace(/\\u0027/g, "'")
    .replace(/\\u0020/g, ' ')
    .replace(/\\'/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function namesLikelyMatch(a, b) {
  var left = normalizePersonName(a);
  var right = normalizePersonName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return left.indexOf(right) !== -1 || right.indexOf(left) !== -1;
}

function parseViewDownlineArgs(onclick) {
  // Names may contain escaped quotes (KHAIRUNNISA\' ...); read args more loosely.
  var match = /viewDownline\s*\(\s*'((?:\\'|[^'])*)'\s*,\s*'((?:\\'|[^'])*)'\s*(?:,\s*'((?:\\'|[^'])*)')?/.exec(
    onclick || ''
  );
  if (!match) {
    match = /viewDownline\s*\(\s*"((?:\\"|[^"])*)"\s*,\s*"((?:\\"|[^"])*)"\s*(?:,\s*"((?:\\"|[^"])*)")?/.exec(
      onclick || ''
    );
  }
  if (!match) return { customerId: '', name: '', tier: '' };
  return {
    customerId: String(match[1] || '').trim(),
    name: decodeBcJsString(match[2]),
    tier: String(match[3] || '').trim()
  };
}

function readTierRowLabelText(tierRow) {
  if (!tierRow) return '';
  var el =
    tierRow.querySelector('.td-text-hover') ||
    tierRow.querySelector('td:last-child span') ||
    tierRow.querySelector('td:last-child');
  return el ? String(el.textContent || '') : String(tierRow.textContent || '');
}

function readTierRowClickArgs(tierRow) {
  if (!tierRow) return { customerId: '', name: '', tier: '' };
  var clickEl =
    tierRow.querySelector('[onclick*="viewDownline"]') ||
    tierRow.querySelector('.td-text-hover');
  return parseViewDownlineArgs(
    clickEl ? clickEl.getAttribute('onclick') || '' : ''
  );
}

function contextFromTierRow(tierRow, tierOverride) {
  var tierClick = readTierRowClickArgs(tierRow);
  var parsed = parseTierLabel(readTierRowLabelText(tierRow));
  var tierNum = tierOverride != null && String(tierOverride).trim() !== ''
    ? String(tierOverride).trim()
    : tierClick.tier;
  var tierCell = tierRow ? tierRow.querySelector('td:first-child') : null;
  if (!tierNum && tierCell) {
    tierNum = String(tierCell.textContent || '').trim();
  }
  var name = (parsed.name || tierClick.name || '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return {
    customerId: tierClick.customerId || '',
    pgCode: parsed.pgCode || '',
    name: name,
    tier: tierNum || ''
  };
}

/**
 * BC uses DIFFERENT encrypted customer_id tokens for Tree Tier navigation vs
 * the loaded downline table / viewDownlineInfo fetch. Always prefer the table
 * token (header, pagination, hidden) — Tree Tier row token returns the wrong list.
 */
function readVisibleDownlineFetchContext(root) {
  root = root || document;
  var scope =
    root.querySelector('#group_detail_info_table') ||
    root.querySelector('.pagination-container') ||
    root;

  var header = scope.querySelector(
    'th[onclick*="viewDownline("], #group_detail_info_table th[onclick*="viewDownline("]'
  );
  var headerClick = parseViewDownlineArgs(
    header ? header.getAttribute('onclick') || '' : ''
  );

  var pageHref = '';
  var pageCustomerId = '';
  var pageParams = null;
  var links = scope.querySelectorAll(
    'a[href*="viewDownlineInfo"], a[href*="customer_id="]'
  );
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href') || '';
    try {
      var u = new URL(href, window.location.origin);
      if (u.searchParams.get('route') !== 'business/group_details/viewDownlineInfo') {
        if (!u.searchParams.get('customer_id')) continue;
      }
      var id = u.searchParams.get('customer_id');
      if (id && String(id).trim()) {
        pageCustomerId = String(id).trim();
        pageHref = href;
        pageParams = u.searchParams;
        break;
      }
    } catch (e) { /* skip */ }
  }

  var hiddenInput = root.querySelector('input[name="current-customer-id"]');
  var hiddenId =
    hiddenInput && hiddenInput.value ? String(hiddenInput.value).trim() : '';

  var customerId =
    (headerClick.customerId && headerClick.customerId) ||
    pageCustomerId ||
    hiddenId ||
    '';

  return {
    customerId: customerId,
    headerName: headerClick.name || '',
    headerTier: headerClick.tier || '',
    pageHref: pageHref,
    pageParams: pageParams,
    hiddenId: hiddenId
  };
}

/** customer_id from pagination inside the loaded downline table only. */
function readCustomerIdFromVisiblePagination(root) {
  return readVisibleDownlineFetchContext(root).customerId || '';
}

function resolveCustomerIdForTierContext(root, ctx) {
  root = root || document;
  if (!ctx) return '';

  var live = readVisibleDownlineFetchContext(root);
  var headerMatchesName = namesLikelyMatch(ctx.name, live.headerName);
  var headerMatchesTier =
    ctx.tier !== '' &&
    live.headerTier !== '' &&
    String(ctx.tier) === String(live.headerTier);

  // 1) Table token when it belongs to this Tree Tier dealer (correct BC fetch).
  if ((headerMatchesName || headerMatchesTier) && live.customerId) {
    return live.customerId;
  }
  // 2) Pagination / hidden when table header name is empty but table is loaded.
  if (live.pageParams && live.customerId) {
    var pageCustName = live.pageParams.get('cust_name') || '';
    if (namesLikelyMatch(ctx.name, pageCustName)) return live.customerId;
  }
  if (live.hiddenId && headerMatchesName) return live.hiddenId;
  // 3) Last resort: Tree Tier navigation token (often wrong for viewDownlineInfo).
  if (ctx.customerId) return ctx.customerId;
  if (live.customerId) return live.customerId;
  return resolveCurrentCustomerId(root);
}

/**
 * Root Tree Tier (tier 0) — logged-in dealer's own frontline.
 */
function resolveRootTreeTierContext(root) {
  root = root || document;
  var tierRow = root.querySelector('#tier_info tr#viewing-0');
  if (!tierRow) {
    var tierRows = root.querySelectorAll('#tier_info tr.tier-view, #tier_info tr');
    if (tierRows.length) tierRow = tierRows[tierRows.length - 1];
  }
  var ctx = contextFromTierRow(tierRow, '0');
  var live = readVisibleDownlineFetchContext(root);
  ctx.customerId = resolveCustomerIdForTierContext(root, ctx);
  ctx.tableMatchesTier = Boolean(
    live.customerId &&
      (namesLikelyMatch(ctx.name, live.headerName) ||
        (ctx.tier !== '' &&
          live.headerTier !== '' &&
          String(ctx.tier) === String(live.headerTier)) ||
        namesLikelyMatch(
          ctx.name,
          (live.pageParams && live.pageParams.get('cust_name')) || ''
        ))
  );
  ctx.fetchQuery = live.pageParams
    ? Object.fromEntries(live.pageParams.entries())
    : null;
  ctx.mode = 'root';
  return ctx;
}

/**
 * Resolve the Tree Tier node the user is currently viewing on BC.
 */
function resolveCurrentViewedContext(root) {
  root = root || document;
  var tierInput = root.querySelector('input[name="current-customer-tier"]');
  var tier =
    tierInput && tierInput.value != null ? String(tierInput.value).trim() : '';

  var tierRow = null;
  if (tier !== '') {
    tierRow = root.querySelector('#tier_info tr#viewing-' + tier);
  }
  if (!tierRow) {
    tierRow = root.querySelector(
      '#tier_info tr.tier-view.bg-color-grey, #tier_info tr.bg-color-grey'
    );
  }
  if (!tierRow) {
    tierRow = root.querySelector('#tier_info tr.tier-view, #tier_info tr');
  }

  var ctx = contextFromTierRow(tierRow, tier);
  if (!ctx.tier && tier !== '') ctx.tier = tier;
  var live = readVisibleDownlineFetchContext(root);
  ctx.customerId = resolveCustomerIdForTierContext(root, ctx);
  ctx.tableMatchesTier = Boolean(
    live.customerId &&
      (namesLikelyMatch(ctx.name, live.headerName) ||
        (ctx.tier !== '' &&
          live.headerTier !== '' &&
          String(ctx.tier) === String(live.headerTier)) ||
        namesLikelyMatch(
          ctx.name,
          (live.pageParams && live.pageParams.get('cust_name')) || ''
        ))
  );
  ctx.fetchQuery = live.pageParams
    ? Object.fromEntries(live.pageParams.entries())
    : null;
  ctx.mode = 'current';
  return ctx;
}

/**
 * Current Tree Tier PG from the live Group Details page.
 * Prefer highlighted / current-customer-tier row; text looks like "NAME (PG00333473)".
 */
function resolveCurrentViewedPgCode(root) {
  return resolveCurrentViewedContext(root).pgCode;
}

/**
 * After all pages are loaded, stamp parent_pg_code on each row.
 * viewedPgCode = Tree Tier node whose frontline is currently listed.
 * extraNameToPg = optional map (e.g. Tree Tier ancestors) merged into name lookup.
 */
function stampParentPgCodesOnRows(rows, viewedPgCode, extraNameToPg) {
  if (!Array.isArray(rows)) return [];
  var viewed = normalizePgCodeValue(viewedPgCode);
  var nameToPg = {};

  if (extraNameToPg && typeof extraNameToPg === 'object') {
    Object.keys(extraNameToPg).forEach(function (k) {
      var pg = normalizePgCodeValue(extraNameToPg[k]);
      var key = normalizePersonName(k);
      if (key && pg) nameToPg[key] = pg;
    });
  }

  for (var i = 0; i < rows.length; i++) {
    var nameKey = normalizePersonName(rows[i].Name || rows[i].name);
    var pg = normalizePgCodeValue(rows[i].PGCode || rows[i].pg_code);
    if (nameKey && pg) nameToPg[nameKey] = pg;
  }

  for (var j = 0; j < rows.length; j++) {
    var row = rows[j];
    var rowPg = normalizePgCodeValue(row.PGCode || row.pg_code);
    var parentNameRaw = row['Parent Name'] || row.parent_name || '';
    var parentPg = '';

    // Never stamp a dealer as their own parent (Tree Tier upsert of the
    // open dealer must keep parent = root, not viewed).
    if (rowPg && viewed && rowPg === viewed) {
      var existingParent = normalizePgCodeValue(
        row.parent_pg_code || row['Parent PGCode'] || ''
      );
      if (existingParent && existingParent !== rowPg) {
        row.parent_pg_code = existingParent;
        row['Parent PGCode'] = existingParent;
      }
      row._viewed_pg_code = existingParent || row._viewed_pg_code || '';
      continue;
    }

    if (isBlankParentName(parentNameRaw)) {
      // Blank Parent Name → the open Tree Tier / viewed dealer.
      parentPg = viewed;
    } else {
      parentPg = nameToPg[normalizePersonName(parentNameRaw)] || '';
      // Group Details table for a dealer is that dealer's frontline. If the
      // named parent is not in this batch yet, still attach to the viewed PG
      // so Workspace does not treat the row as root frontline (null parent).
      if (!parentPg && viewed) parentPg = viewed;
    }

    if (parentPg && rowPg && parentPg === rowPg) {
      parentPg = '';
    }

    if (parentPg) {
      row.parent_pg_code = parentPg;
      row['Parent PGCode'] = parentPg;
    } else {
      delete row.parent_pg_code;
      delete row['Parent PGCode'];
    }

    if (viewed) row._viewed_pg_code = viewed;
  }

  return rows;
}

function parseGroupDetailTableRows(table, options) {
  options = options || {};
  if (!table) return [];
  var tbody = table.querySelector('tbody');
  if (!tbody) return [];

  var columnMap = buildColumnIndexMap(table);
  var trs = tbody.querySelectorAll('tr');
  var rows = [];
  var viewedPgCode = normalizePgCodeValue(options.viewedPgCode || '');

  for (var i = 0; i < trs.length; i++) {
    var tr = trs[i];
    var cells = tr.querySelectorAll('td');
    if (cells.length < 5) continue;

    var directDebitRaw = col(columnMap, cells, ['direct debit subscription']);
    var directDebit = parseDirectDebitInfo(directDebitRaw);
    var telephone = sanitizeTelephone(col(columnMap, cells, ['telephone', 'phone']));

    var row = {
      PGCode: col(columnMap, cells, ['pgcode']),
      Email: col(columnMap, cells, ['email']),
      Name: toTitleCase(col(columnMap, cells, ['name'])),
      'D.O.B.': col(columnMap, cells, ['d.o.b.', 'dob']),
      Rank: col(columnMap, cells, ['rank']),
      Telephone: telephone,
      'Total Frontline': col(columnMap, cells, ['total frontline']),
      'Empire Size': col(columnMap, cells, ['empire size']),
      'Date Register': col(columnMap, cells, ['date register']),
      'Last Purchase Date': col(columnMap, cells, ['last purchase date'])
    };

    var profileVerified = col(columnMap, cells, [
      'profile verified status',
      'profile verified'
    ]);
    if (profileVerified) row['Profile Verified'] = profileVerified;

    var parentName = col(columnMap, cells, ['parent name']);
    if (parentName) {
      row['Parent Name'] = isBlankParentName(parentName)
        ? '-'
        : toTitleCase(parentName);
    }

    var branch = col(columnMap, cells, ['branch']);
    if (branch) row.Branch = branch;

    var nationality = col(columnMap, cells, ['nationality']);
    if (nationality) row.Nationality = nationality;

    if (directDebitRaw || columnMap['direct debit subscription'] != null) {
      row['Direct Debit Subscription'] = directDebit.status;
      row['Direct Debit Amount'] = directDebit.amount;
      row['Direct Debit Date'] = directDebit.date;
    }

    var more = parseMoreDetailFields(tr);
    if (more.Origin) row.Origin = more.Origin;
    if (more['FMD PGCode']) row['FMD PGCode'] = more['FMD PGCode'];
    if (more['FMD Name']) row['FMD Name'] = more['FMD Name'];

    if (viewedPgCode) row._viewed_pg_code = viewedPgCode;

    rows.push(row);
  }

  if (options.stampParents !== false) {
    stampParentPgCodesOnRows(rows, viewedPgCode, options.extraNameToPg || null);
  }

  return rows;
}

function extractCustomerIdFromHref(href) {
  if (!href) return '';
  try {
    var u = new URL(href, window.location.origin);
    var id = u.searchParams.get('customer_id') || u.searchParams.get('filter_customer_id');
    return id && String(id).trim() ? String(id).trim() : '';
  } catch (e) {
    return '';
  }
}

function resolveCurrentCustomerId(root) {
  root = root || document;

  var input = root.querySelector('input[name="current-customer-id"]');
  if (input && input.value && String(input.value).trim()) {
    return String(input.value).trim();
  }

  try {
    var currentUrl = new URL(window.location.href);
    var fromUrl =
      currentUrl.searchParams.get('customer_id') ||
      currentUrl.searchParams.get('filter_customer_id');
    if (fromUrl && String(fromUrl).trim()) return String(fromUrl).trim();
  } catch (e) { /* ignore */ }

  var links = root.querySelectorAll('a[href*="customer_id="], a[href*="filter_customer_id="]');
  for (var i = 0; i < links.length; i++) {
    var fromLink = extractCustomerIdFromHref(links[i].getAttribute('href') || '');
    if (fromLink) return fromLink;
  }

  var headers = root.querySelectorAll('th[onclick*="viewDownline("]');
  for (var j = 0; j < headers.length; j++) {
    var onclick = headers[j].getAttribute('onclick') || '';
    var match = /viewDownline\s*\(\s*['"]([^'"]+)['"]/.exec(onclick);
    if (match && match[1] && String(match[1]).trim()) return String(match[1]).trim();
  }

  return '';
}

function getVisibleGroupDetailTable(root) {
  root = root || document;
  var inContainer = root.querySelector('#group_detail_info_table table.business-center-data-table');
  if (inContainer) return inContainer;

  var tables = root.querySelectorAll('.business-center-data-table');
  if (tables.length > 1) return tables[1];
  if (tables.length === 1) return tables[0];
  return null;
}

function readVisibleGroupDetailRows() {
  var viewedPgCode = resolveCurrentViewedPgCode(document);
  var tierNames = readTreeTierNameToPgMap(document);
  return parseGroupDetailTableRows(getVisibleGroupDetailTable(document), {
    viewedPgCode: viewedPgCode,
    extraNameToPg: tierNames,
    stampParents: true
  });
}

function getDownlineSyncContext(mode) {
  var viewed =
    mode === 'root'
      ? resolveRootTreeTierContext(document)
      : resolveCurrentViewedContext(document);
  return {
    customerId: viewed.customerId || resolveCurrentCustomerId(document),
    viewedPgCode: viewed.pgCode || '',
    viewedName: viewed.name || '',
    tier: viewed.tier || '',
    mode: viewed.mode || mode || 'current',
    tableMatchesTier: Boolean(viewed.tableMatchesTier),
    visibleRowCount: readVisibleGroupDetailRows().length
  };
}
