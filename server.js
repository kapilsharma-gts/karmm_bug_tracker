const express = require("express");
const axios = require("axios");
const buildIssueWebhookController = require("./src/factory/buildIssueWebhookController");
const buildSyncWebhookControllers = require("./src/factory/buildSyncWebhookControllers");
const SheetIssueGateway = require("./src/services/SheetIssueGateway");
const TrelloIssueGateway = require("./src/services/TrelloIssueGateway");
const TelegramOutboundNotifier = require("./src/services/TelegramOutboundNotifier");
const IssuesMigration = require("./migration");

const app = express();
app.use(express.json({ limit: '50mb' }));

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SHEET_WEBHOOK = process.env.SHEET_WEBHOOK;

// Trello configuration
const TRELLO_CONFIG = {
    key: process.env.TRELLO_KEY,
    token: process.env.TRELLO_TOKEN,
    boardId: process.env.TRELLO_BOARD_ID
};

// Trello list status mapping (from your board)
const TRELLO_LIST_STATUS_MAP = {
    "69bcd685eab03493fbad667e": "OPEN",           // Issues (Todo)
    "69bcd6995ed92343b8dfee81": "IN PROGRESS",    // In Development
    "69bcc0a478f5faa9a902ee40": "IN REVIEW",      // Review
    "69be1cf457fd814f40f58ab5": "BUG NOT RESOLVED", // Bug Not Resolved
    "69bcc0a478f5faa9a902ee42": "DONE"            // Done
};

const issueWebhookController = buildIssueWebhookController({
    telegramToken: TELEGRAM_TOKEN,
    sheetWebhookUrl: SHEET_WEBHOOK,
    trelloConfig: TRELLO_CONFIG,
    httpClient: axios
});

// Build sync controllers for bidirectional sync
let syncControllers = null;
if (SHEET_WEBHOOK && TRELLO_CONFIG.key) {
    const sheetGateway = new SheetIssueGateway(SHEET_WEBHOOK, axios);
    const trelloGateway = new TrelloIssueGateway(TRELLO_CONFIG, axios);
    const telegramNotifier = new TelegramOutboundNotifier(TELEGRAM_TOKEN, axios);

    syncControllers = buildSyncWebhookControllers({
        sheetGateway,
        trelloGateway,
        telegramNotifier,
        trelloListStatusMap: TRELLO_LIST_STATUS_MAP
    });

    console.log("✅ Bidirectional sync controllers initialized");
}

app.get("/", (req, res) => {
    res.send("Bug Bot Running");
});

// Trello validates callback URL with HEAD/GET before webhook creation.
app.head("/webhook/trello-sync", (req, res) => {
    return res.sendStatus(200);
});

app.get("/webhook/trello-sync", (req, res) => {
    return res.status(200).send("Trello sync webhook endpoint is active");
});

app.head("/webhook/sheet-sync", (req, res) => {
    return res.sendStatus(200);
});

app.get("/webhook/sheet-sync", (req, res) => {
    return res.status(200).send("Sheet sync webhook endpoint is active");
});

app.post("/webhook", async (req, res) => {
    try {
        const message = req.body.message;
        if (!message) {
            return res.sendStatus(200);
        }

        await issueWebhookController.processIncomingMessage(message);
        return res.sendStatus(200);
    } catch (error) {
        console.error(error.message);
        return res.sendStatus(500);
    }
});

// Trello Sync Webhook - triggered when Trello cards are moved/updated
app.post("/webhook/trello-sync", async (req, res) => {
    try {
        if (!syncControllers) {
            return res.status(400).json({ error: "Sync controllers not configured" });
        }

        const webhookData = req.body;
        if (!webhookData || !webhookData.action) {
            return res.sendStatus(200);
        }

        await syncControllers.trelloSync.processTrelloWebhook(webhookData);
        return res.sendStatus(200);
    } catch (error) {
        console.error("Trello sync error:", error.message);
        return res.sendStatus(500);
    }
});

// Google Sheets Sync Webhook - triggered when sheet status is updated
app.post("/webhook/sheet-sync", async (req, res) => {
    try {
        if (!syncControllers) {
            return res.status(400).json({ error: "Sync controllers not configured" });
        }

        const webhookData = req.body;
        if (!webhookData || !webhookData.action) {
            return res.sendStatus(200);
        }

        const handled = await syncControllers.sheetSync.processSheetWebhook(webhookData);
        return res.sendStatus(200);
    } catch (error) {
        console.error("Sheet sync error:", error.message);
        return res.sendStatus(500);
    }
});

// Migration endpoint - POST issues data to migrate to Trello
app.post("/migrate-to-trello", async (req, res) => {
    try {
        const issuesData = req.body.issues;

        if (!issuesData || !Array.isArray(issuesData)) {
            return res.status(400).json({
                error: "Invalid format. Send POST with {issues: [...]}"
            });
        }

        console.log(`📋 Migration request received for ${issuesData.length} issues`);

        const formattedData = IssuesMigration.formatSheetData(issuesData);
        const migration = new IssuesMigration();
        const result = await migration.migrateIssuesFromSheet(formattedData);

        return res.json({
            success: true,
            message: `Migrated ${result.successCount}/${result.total} issues to Trello`,
            stats: result
        });

    } catch (error) {
        console.error("Migration error:", error.message);
        return res.status(500).json({
            error: error.message
        });
    }
});

app.listen(process.env.PORT || 3000);
