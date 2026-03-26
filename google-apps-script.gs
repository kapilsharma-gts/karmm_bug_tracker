/**
 * @OnlyCurrentDoc
 */

// 📡 WEBHOOK CONFIG
const BOT_SERVER_URL = "https://telegrambotbugs.karmm.com"; 

function normalizeStatusValue(status) {
  const raw = String(status || "")
    .replace(/\u00A0/g, " ")
    .replace(/[\-_]+/g, " ")
    .replace(/[.,;:!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  const statusMap = {
    "OPEN": "OPEN", "TODO": "OPEN", "TO DO": "OPEN",
    "IN PROGRESS": "IN PROGRESS", "IN DEVELOPMENT": "IN PROGRESS", "DOING": "IN PROGRESS",
    "IN REVIEW": "IN REVIEW", "REVIEW": "IN REVIEW",
    "BUG NOT RESOLVED": "BUG NOT RESOLVED", "BUG-NOT-RESOLVED": "BUG NOT RESOLVED",
    "FUTURE UPDATE": "FUTURE UPDATE", "FUTURE UPDATES": "FUTURE UPDATE",
    "FUTRER UPDATE": "FUTURE UPDATE", "FUTUER UPDATE": "FUTURE UPDATE",
    "FUTURE": "FUTURE UPDATE", "DONE": "DONE"
  };
  return statusMap[raw] || raw;
}

function getStatusStyle(status) {
  const normalized = normalizeStatusValue(status);
  const styleMap = {
    "OPEN": { bg: "#2563eb", fg: "#ffffff" },
    "IN PROGRESS": { bg: "#0ea5e9", fg: "#ffffff" },
    "IN REVIEW": { bg: "#7c3aed", fg: "#ffffff" },
    "BUG NOT RESOLVED": { bg: "#ea580c", fg: "#ffffff" },
    "FUTURE UPDATE": { bg: "#334155", fg: "#ffffff" },
    "DONE": { bg: "#16a34a", fg: "#ffffff" }
  };
  return styleMap[normalized] || null;
}

function applyStatusCellStyle(sheet, row, statusValue) {
  if (!sheet) return;
  const statusCol = getColumnIndexByHeader(sheet, "Status", 8);
  const statusCell = sheet.getRange(row, statusCol);
  const style = getStatusStyle(statusValue);
  if (!style) {
    statusCell.setBackground(null).setFontColor("#111827").setFontWeight("normal");
    return;
  }
  statusCell.setBackground(style.bg).setFontColor(style.fg).setFontWeight("bold");
}

function getColumnIndexByHeader(sheet, headerName, fallbackIndex) {
  if (!sheet) return fallbackIndex;
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 14)).getValues()[0];
  const target = String(headerName || "").trim().toLowerCase();
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i] || "").trim().toLowerCase() === target) return i + 1;
  }
  return fallbackIndex;
}

function normalizeAndStyleStatusColumn(sheet) {
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const statusCol = getColumnIndexByHeader(sheet, "Status", 8);
  const statusRange = sheet.getRange(2, statusCol, lastRow - 1, 1);
  const statusValues = statusRange.getValues();
  let updated = false;
  for (let i = 0; i < statusValues.length; i++) {
    const original = String(statusValues[i][0]);
    const normalized = normalizeStatusValue(original);
    if (original !== normalized && normalized !== "") {
      statusValues[i][0] = normalized;
      updated = true;
    }
  }
  if (updated) statusRange.setValues(statusValues);
  for (let i = 0; i < statusValues.length; i++) {
    applyStatusCellStyle(sheet, i + 2, statusValues[i][0]);
  }
}

// FULL Helper Functions
function normalizeChatIdPreviewColumns(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 1) return;
  const colChatId = 13; const colPreview = 14;
  const headerChat = sheet.getRange(1, colChatId).getValue();
  const headerPreview = sheet.getRange(1, colPreview).getValue();
  if (String(headerChat || "").trim().toLowerCase() !== "chat id") sheet.getRange(1, colChatId).setValue("Chat ID");
  if (String(headerPreview || "").trim().toLowerCase() !== "preview") sheet.getRange(1, colPreview).setValue("Preview");
  if (lastRow < 2) return;
  for (let row = 2; row <= lastRow; row++) {
    const chatCell = sheet.getRange(row, colChatId);
    const previewCell = sheet.getRange(row, colPreview);
    const imageCell = sheet.getRange(row, 9);
    const chatFormula = chatCell.getFormula();
    if (chatFormula && String(chatFormula).toUpperCase().indexOf("=IMAGE(") === 0) {
      previewCell.setFormula(chatFormula);
      chatCell.clearContent();
    }
    if (!previewCell.getFormula()) {
      const imageValue = String(imageCell.getValue() || "").trim();
      if (imageValue) previewCell.setFormula(`=IMAGE(I${row})`);
    }
  }
}

function fixExistingChatIdPreviewColumns() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bugs");
  if (!sheet) return "Sheet not found";
  normalizeChatIdPreviewColumns(sheet);
  beautifyDashboard(sheet);
  return "✅ Chat ID / Preview columns repaired";
}

function fixExistingStatusColors() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bugs");
  if (!sheet) return "Sheet not found";
  normalizeAndStyleStatusColumn(sheet);
  beautifyDashboard(sheet);
  return "✅ Status values normalized and colors repaired";
}

function setupSheetHeaders() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bugs");
  if (!sheet) return "Sheet not found";
  const firstRow = sheet.getRange(1, 1, 1, 14).getValues()[0];
  if (!firstRow[0]) {
    sheet.getRange(1, 1, 1, 14).setValues([["ID", "Title", "Description", "Steps", "Expected", "Actual", "Priority", "Status", "Image", "Reporter", "Date", "Assignee", "Chat ID", "Preview"]]);
    beautifyDashboard(sheet);
    return "✅ Headers initialized!";
  }
  return "Headers already exist";
}

// 🔄 doPost (Execution Loop Fixed)
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bugs");
    if (!sheet) return ContentService.createTextOutput("❌ Sheet not found");
    const data = JSON.parse(e.postData.contents);
    const rows = sheet.getDataRange().getValues();

    if (data.action === "update") {
      const normalizedStatus = normalizeStatusValue(data.status);
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] == data.id) {
          sheet.getRange(i + 1, 8).setValue(normalizedStatus);
          applyStatusCellStyle(sheet, i + 1, normalizedStatus);
          if (String(data.source).toLowerCase() !== "trello") {
            sendWebhookToBot({ action: "update", id: data.id, status: normalizedStatus, source: "sheet" });
          }
          return ContentService.createTextOutput("Updated");
        }
      }
    }
    
    if (data.action === "linkchat") {
      const col = getColumnIndexByHeader(sheet, "Chat ID", 13);
      for (let i = 1; i < rows.length; i++) { if (rows[i][0] == data.id) { sheet.getRange(i + 1, col).setValue(data.chatId); return ContentService.createTextOutput("Linked"); } }
    }

    if (data.action === "linkimage") {
      const colImage = getColumnIndexByHeader(sheet, "Image", 9);
      const colPreview = getColumnIndexByHeader(sheet, "Preview", 14);
      for (let i = 1; i < rows.length; i++) {
        if (rows[i][0] == data.id) {
          sheet.getRange(i + 1, colImage).setValue(data.image);
          sheet.getRange(i + 1, colPreview).setFormula(`=IMAGE(I${i + 1})`);
          return ContentService.createTextOutput("Image Linked");
        }
      }
    }

    if (data.action === "assign") {
      for (let i = 1; i < rows.length; i++) { if (rows[i][0] == data.id) { sheet.getRange(i + 1, 12).setValue(data.assignee); return ContentService.createTextOutput("Assigned"); } }
    }

    if (data.action === "delete") {
      for (let i = 1; i < rows.length; i++) { if (rows[i][0] == data.id) { sheet.deleteRow(i + 1); beautifyDashboard(sheet); return ContentService.createTextOutput("Deleted"); } }
    }

    if (data.action === "create") {
      const newRow = sheet.getLastRow() + 1;
      sheet.getRange(newRow, 1, 1, 14).setValues([[data.id, data.title, data.description, data.steps, data.expected, data.actual, data.priority, normalizeStatusValue(data.status), data.image, data.reporter, data.date, "", data.chatId || "", ""]]);
      sheet.getRange(newRow, 14).setFormula(`=IMAGE(I${newRow})`);
      sheet.setRowHeight(newRow, 250);
      beautifyDashboard(sheet);
      return ContentService.createTextOutput("Created");
    }
    return ContentService.createTextOutput("OK");
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

// 🎨 DASHBOARD STYLING (Priority colors fixed)
function beautifyDashboard(sheet) {
  if (!sheet || typeof sheet.getLastRow !== 'function') { sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Bugs"); }
  if (!sheet) return;
  const lastRow = sheet.getLastRow(); const lastCol = 14;
  const priorityCol = getColumnIndexByHeader(sheet, "Priority", 7);
  const statusCol = getColumnIndexByHeader(sheet, "Status", 8);
  const dataRowCount = Math.max(sheet.getMaxRows() - 1, 1);

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, lastCol).setBackground("#111827").setFontColor("#ffffff").setFontWeight("bold");

  const widths = [120, 250, 400, 150, 150, 150, 120, 150, 200, 200, 180, 150, 150, 250];
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));

  if (lastRow > 1) {
    try { sheet.getBandings().forEach(b => b.remove()); sheet.getRange(2, 1, lastRow - 1, lastCol).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY); } catch (e) {}
  }

  normalizeAndStyleStatusColumn(sheet);

  const rules = [];
  const pRange = sheet.getRange(2, priorityCol, dataRowCount, 1);
  const sRange = sheet.getRange(2, statusCol, dataRowCount, 1);

  // Priority
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("CRITICAL").setBackground("#7f1d1d").setFontColor("#ffffff").setRanges([pRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("HIGH").setBackground("#dc2626").setFontColor("#ffffff").setRanges([pRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("MEDIUM").setBackground("#f59e0b").setFontColor("#111827").setRanges([pRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("LOW").setBackground("#10b981").setFontColor("#ffffff").setRanges([pRange]).build());

  // Status
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("OPEN").setBackground("#2563eb").setFontColor("#ffffff").setRanges([sRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("IN PROGRESS").setBackground("#0ea5e9").setFontColor("#ffffff").setRanges([sRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("IN REVIEW").setBackground("#7c3aed").setFontColor("#ffffff").setRanges([sRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("BUG NOT RESOLVED").setBackground("#ea580c").setFontColor("#ffffff").setRanges([sRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("FUTURE UPDATE").setBackground("#334155").setFontColor("#ffffff").setRanges([sRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("DONE").setBackground("#16a34a").setFontColor("#ffffff").setRanges([sRange]).build());

  sheet.setConditionalFormatRules(rules);
  if (!sheet.getFilter()) sheet.getRange(1, 1, lastRow, lastCol).createFilter();
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, lastCol).setVerticalAlignment("middle");
}

// 🔔 ONEDIT - Full Sync
function onEdit(e) {
  if (!e || !e.source) return;
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== "Bugs") return;
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const row = e.range.getRow(); const col = e.range.getColumn();
    if (row < 2) return;
    const issueId = sheet.getRange(row, 1).getValue();
    if (!issueId) return;

    let payload = { id: issueId, source: "sheet" };
    if (col === 8) { // Status
      const val = e.range.getValue(); if (!val) return;
      const newStatus = normalizeStatusValue(val);
      sheet.getRange(row, 8).setValue(newStatus);
      applyStatusCellStyle(sheet, row, newStatus);
      payload.action = "update"; payload.status = newStatus;
    } else if (col === 2) { // Title
      payload.action = "updateTitle"; payload.title = e.range.getValue();
    } else if (col === 3) { // Description
      payload.action = "updateDescription"; payload.description = e.range.getValue();
    } else { return; }
    sendWebhookToBot(payload);
  } finally { try { lock.releaseLock(); } catch(e) {} }
}

function sendWebhookToBot(payload) {
  try {
    const options = { method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true };
    UrlFetchApp.fetch(BOT_SERVER_URL + "/webhook/sheet-sync", options);
  } catch (error) { console.log("Webhook error: " + error); }
}