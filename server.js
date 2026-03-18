const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

//  ENV
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SHEET_WEBHOOK = process.env.SHEET_WEBHOOK;

// Health
app.get("/", (req, res) => {
    res.send("Bug Bot Running (Detailed Mode)");
});

//  WEBHOOK
app.post("/webhook", async (req, res) => {
    try {
        const message = req.body.message;
        if (!message) return res.sendStatus(200);

        const chatId = message.chat.id;

        const username =
            message.from.username ||
            `${message.from.first_name || ""} ${message.from.last_name || ""}` ||
            "unknown";

        const content = message.text || message.caption;
        if (!content) return res.sendStatus(200);

        console.log("Incoming:", username, content);

        // =========================
        //  SMART TITLE
        // =========================
        let title = content.split("\n")[0];

        // =========================
        //  PRIORITY AUTO
        // =========================
        let priority = "MEDIUM";
        const lower = content.toLowerCase();

        if (
            lower.includes("crash") ||
            lower.includes("fail") ||
            lower.includes("error") ||
            lower.includes("not working")
        ) {
            priority = "HIGH";
        }

        if (lower.includes("slow") || lower.includes("lag")) {
            priority = "LOW";
        }

        //  Description (FULL message)
        let description = content;

        // =========================
        // AUTO STEPS
        // =========================
        let steps = `1. Open app\n2. Perform action related to "${title}"\n3. Observe issue`;

        // =========================
        //  EXPECTED
        // =========================
        let expected = `Feature should work correctly without errors`;

        // =========================
        //  ACTUAL
        // =========================
        let actual = `${title} issue occurring`;

        // =========================
        //  IMAGE
        // =========================
        let imageUrl = "";

        if (message.photo) {
            const fileId = message.photo[message.photo.length - 1].file_id;

            const fileRes = await axios.get(
                `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`
            );

            const filePath = fileRes.data.result.file_path;

            imageUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
        }

        // =========================
        // SEND TO SHEET
        // =========================
        const bugId = Date.now();

        await axios.post(SHEET_WEBHOOK, {
            id: bugId,
            title,
            description,
            steps,
            expected,
            actual,
            priority,
            status: "OPEN",
            image: imageUrl,
            reporter: username,
            date: new Date().toISOString()
        });

        // =========================
        //  TELEGRAM RESPONSE
        // =========================
        await sendMessage(
            chatId,
            `Bug Created!

ID: ${bugId}
 ${title}
 ${priority}
 Status: OPEN`
        );

        res.sendStatus(200);
    } catch (err) {
        console.error("Error:", err.message);
        res.sendStatus(500);
    }
});

//  SEND MESSAGE
async function sendMessage(chatId, text) {
    await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
            chat_id: chatId,
            text
        }
    );
}

// START
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server Running");
});