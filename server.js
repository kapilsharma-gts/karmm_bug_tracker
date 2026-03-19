const express = require("express");
const axios = require("axios");
const buildIssueWebhookController = require("./src/factory/buildIssueWebhookController");

const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SHEET_WEBHOOK = process.env.SHEET_WEBHOOK;

const issueWebhookController = buildIssueWebhookController({
    telegramToken: TELEGRAM_TOKEN,
    sheetWebhookUrl: SHEET_WEBHOOK,
    httpClient: axios
});

app.get("/", (req, res) => {
    res.send("Bug Bot Running");
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

app.listen(process.env.PORT || 3000);
