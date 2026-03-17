const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ENV variables (Render me set karna)
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SHEET_WEBHOOK = process.env.SHEET_WEBHOOK;

// Health check
app.get("/", (req, res) => {
    res.send("🚀 Telegram Bug Bot Running");
});

// Telegram Webhook
app.post("/webhook", async (req, res) => {
    try {
        const body = req.body;

        // safety check
        if (!body.message) {
            return res.sendStatus(200);
        }

        const message = body.message;

        const chatId = message.chat.id;
        const username =
            message.from.username ||
            `${message.from.first_name || ""} ${message.from.last_name || ""}` ||
            "unknown";

        const text = message.text || "";

        console.log("Incoming:", username, text);

        // ❌ ignore empty
        if (!text) {
            return res.sendStatus(200);
        }

        // ✅ OPTIONAL: only allow /bug command
        // if (!text.startsWith("/bug")) {
        //   await sendMessage(chatId, "❌ Please use /bug command");
        //   return res.sendStatus(200);
        // }

        // ✅ Parse message (advanced format)
        // Example: login issue | app crash | high
        let title = text;
        let description = "";
        let priority = "normal";

        if (text.includes("|")) {
            const parts = text.split("|");
            title = parts[0]?.trim();
            description = parts[1]?.trim() || "";
            priority = parts[2]?.trim() || "normal";
        }

        // 📤 Send to Google Sheet
        await axios.post(SHEET_WEBHOOK, {
            username,
            title,
            description,
            priority,
            message: text
        });

        // 📩 Reply to user
        await sendMessage(chatId, "✅ Bug saved successfully!");

        res.sendStatus(200);
    } catch (error) {
        console.error("Error:", error.message);

        res.sendStatus(500);
    }
});

// 📩 Telegram send function
async function sendMessage(chatId, text) {
    try {
        await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
                chat_id: chatId,
                text: text,
            }
        );
    } catch (err) {
        console.error("Telegram Error:", err.message);
    }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});