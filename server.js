const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 🔑 ENV
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const SHEET_WEBHOOK = process.env.SHEET_WEBHOOK;

// 🟢 Health
app.get("/", (req, res) => {
    res.send("🚀 Bug Bot Running FINAL");
});

// 🔥 WEBHOOK
app.post("/webhook", async (req, res) => {
    try {
        const message = req.body.message;
        if (!message) return res.sendStatus(200);

        const chatId = message.chat.id;
        const user = message.from;

        // 👤 REPORTER
        let reporter = "unknown";
        const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim();

        if (user.username) reporter = `@${user.username}`;
        if (fullName) reporter = `${reporter} (${fullName})`;

        const text = message.text || "";
        const caption = message.caption || "";
        const content = text || caption;

        // =========================
        // ✅ DONE
        // =========================
        if (text.startsWith("/done")) {
            const id = text.split(" ")[1];

            await axios.post(SHEET_WEBHOOK, {
                action: "update",
                id,
                status: "DONE"
            });

            await sendMessage(chatId, `✅ Bug ${id} DONE`);
            return res.sendStatus(200);
        }

        // =========================
        // 🟡 PROGRESS
        // =========================
        if (text.startsWith("/progress")) {
            const id = text.split(" ")[1];

            await axios.post(SHEET_WEBHOOK, {
                action: "update",
                id,
                status: "IN PROGRESS"
            });

            await sendMessage(chatId, `🟡 Bug ${id} IN PROGRESS`);
            return res.sendStatus(200);
        }

        // =========================
        // 🔴 DELETE
        // =========================
        if (text.startsWith("/delete")) {
            const id = text.split(" ")[1];

            await axios.post(SHEET_WEBHOOK, {
                action: "delete",
                id
            });

            await sendMessage(chatId, `🗑️ Bug ${id} deleted`);
            return res.sendStatus(200);
        }

        // =========================
        // 👤 ASSIGN
        // =========================
        if (text.startsWith("/assign")) {
            const parts = text.split(" ");
            const id = parts[1];
            const assignee = parts[2];

            await axios.post(SHEET_WEBHOOK, {
                action: "assign",
                id,
                assignee
            });

            await sendMessage(chatId, `👤 Bug ${id} assigned to ${assignee}`);
            return res.sendStatus(200);
        }

        // =========================
        // 🧠 CREATE BUG
        // =========================
        if (!content) return res.sendStatus(200);

        let title = content.split("\n")[0];
        let description = content;

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

        let steps = `1. Open app\n2. Perform "${title}"\n3. Observe issue`;
        let expected = `Feature should work correctly`;
        let actual = `${title} issue occurring`;

        // 📸 IMAGE
        let imageUrl = "";

        if (message.photo) {
            const fileId = message.photo[message.photo.length - 1].file_id;

            const fileRes = await axios.get(
                `https://api.telegram.org/bot${TELEGRAM_TOKEN}/getFile?file_id=${fileId}`
            );

            imageUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileRes.data.result.file_path}`;
        }

        const bugId = Date.now();

        // 🟢 SAVE
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
            reporter,
            date: new Date().toISOString()
        });

        // 📩 RESPONSE
        await sendMessage(
            chatId,
            `✅ Bug Created!

🆔 ${bugId}
📝 ${title}
🔥 ${priority}
👤 ${reporter}
📌 OPEN`
        );

        res.sendStatus(200);

    } catch (err) {
        console.error(err.message);
        res.sendStatus(500);
    }
});

// 📩 SEND MESSAGE
async function sendMessage(chatId, text) {
    await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        { chat_id: chatId, text }
    );
}

// 🚀 START
app.listen(process.env.PORT || 3000);