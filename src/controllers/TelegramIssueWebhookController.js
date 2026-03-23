const fs = require("fs");
const path = require("path");
const TelegramReporterIdentity = require("../domain/TelegramReporterIdentity");
const TelegramIncomingContent = require("../domain/TelegramIncomingContent");
const IssuePayloadComposer = require("../domain/IssuePayloadComposer");
const IssueCommandExecutionContext = require("../commands/IssueCommandExecutionContext");

const TELEGRAM_USERS_FILE = path.resolve(process.cwd(), "telegram-users.json");
const ACCESS_DENIED_CONTACTS = ["Bhabha", "Ayog Rai"];

class TelegramIssueWebhookController {
    constructor({ issueGateway, notifier, mediaResolver, commandRouter }) {
        this.issueGateway = issueGateway;
        this.notifier = notifier;
        this.mediaResolver = mediaResolver;
        this.commandRouter = commandRouter;
    }

    async processIncomingMessage(telegramMessage) {
        const chatIdentifier = telegramMessage.chat.id;
        const reporterIdentity = TelegramReporterIdentity.composeReporter(telegramMessage.from || {});
        const isWebhookAutomation = this.isWebhookAutomationMessage(telegramMessage);

        const { messageText, consolidatedContent } = TelegramIncomingContent.parse(telegramMessage);
        const authorizedUserRecords = this.loadAuthorizedUsers();

        if ((messageText || "").trim().toLowerCase() === "/mychatid") {
            await this.notifier.send(chatIdentifier, `🆔 Your chat ID is: ${chatIdentifier}`);
            return;
        }

        const isAuthorizedReporter = isWebhookAutomation
            ? true
            : this.isAuthorizedReporter(telegramMessage, reporterIdentity, authorizedUserRecords);

        if (!isAuthorizedReporter) {
            const accessDeniedMessage = this.composeAccessDeniedMessage(
                telegramMessage,
                reporterIdentity,
                chatIdentifier,
                authorizedUserRecords
            );

            await this.notifier.send(chatIdentifier, accessDeniedMessage);
            await this.notifyAuthorizedUsersAboutUnauthorizedAttempt(
                telegramMessage,
                reporterIdentity,
                chatIdentifier,
                authorizedUserRecords
            );
            return;
        }

        if (!isWebhookAutomation) {
            this.upsertUserChatMapping(telegramMessage, reporterIdentity, chatIdentifier);
        }

        const commandExecutionContext = new IssueCommandExecutionContext({
            chatIdentifier,
            messageText,
            replyToMessage: telegramMessage.reply_to_message
        });

        const commandHandled = await this.commandRouter.tryHandle(commandExecutionContext);
        if (commandHandled) {
            return;
        }

        if (!consolidatedContent) {
            return;
        }

        const evidenceImageUrl = await this.mediaResolver.extractMediaUrl(telegramMessage);
        const issuePayload = IssuePayloadComposer.buildIssuePayload({
            issueText: consolidatedContent,
            issueReporter: reporterIdentity,
            evidenceImageUrl,
            chatId: chatIdentifier
        });

        await this.issueGateway.createIssue(issuePayload);

        await this.notifier.send(
            chatIdentifier,
            `✅ Bug ID: ${issuePayload.id}\n🙏 Thanks for your bug submission to KARMM. We appreciate your contribution. We will resolve this and notify you soon.`
        );
    }

    isWebhookAutomationMessage(telegramMessage) {
        const from = telegramMessage.from || {};

        // Internal webhook/bot-originated updates should bypass manual user access checks.
        if (from.is_bot === true) {
            return true;
        }

        if (!from.id && !from.username && !from.first_name && !from.last_name) {
            return true;
        }

        return false;
    }

    loadAuthorizedUsers() {
        try {
            if (!fs.existsSync(TELEGRAM_USERS_FILE)) {
                return [];
            }

            const parsed = JSON.parse(fs.readFileSync(TELEGRAM_USERS_FILE, "utf-8"));
            if (!Array.isArray(parsed)) {
                return [];
            }

            return parsed.filter((record) => record && typeof record.username === "string");
        } catch (error) {
            console.error("Failed to load telegram user mapping:", error.message);
            return [];
        }
    }

    isAuthorizedReporter(telegramMessage, reporterIdentity, authorizedUserRecords) {
        const candidates = this.buildReporterCandidateNames(telegramMessage, reporterIdentity);
        const allowedNames = this.extractAllowedNameSet(authorizedUserRecords);

        for (const candidate of candidates) {
            if (allowedNames.has(this.normalizeIdentity(candidate))) {
                return true;
            }
        }

        return false;
    }

    composeAccessDeniedMessage(telegramMessage, reporterIdentity, chatIdentifier, authorizedUserRecords) {
        const from = telegramMessage.from || {};
        const displayName = `${from.first_name || ""} ${from.last_name || ""}`.trim() || "Unknown User";
        const username = from.username ? `@${from.username}` : "N/A";
        const userId = from.id ? String(from.id) : "N/A";
        const contacts = this.composeContactDisplay(authorizedUserRecords);

        return [
            "You do not have access. This bug tracker is private.",
            `Currently, only these users have permission to submit bugs: ${contacts}.`,
            "If you need to report a bug, please contact them first.",
            "",
            "Your details:",
            `- Name: ${displayName}`,
            `- Username: ${username}`,
            `- Reporter Identity: ${reporterIdentity || "N/A"}`,
            `- Telegram User ID: ${userId}`,
            `- Chat ID: ${chatIdentifier}`
        ].join("\n");
    }

    async notifyAuthorizedUsersAboutUnauthorizedAttempt(
        telegramMessage,
        reporterIdentity,
        chatIdentifier,
        authorizedUserRecords
    ) {
        const from = telegramMessage.from || {};
        const displayName = `${from.first_name || ""} ${from.last_name || ""}`.trim() || "Unknown User";
        const username = from.username ? `@${from.username}` : "N/A";
        const userId = from.id ? String(from.id) : "N/A";

        const alertText = [
            "Unauthorized bug submission attempt detected.",
            `Name: ${displayName}`,
            `Username: ${username}`,
            `Reporter Identity: ${reporterIdentity || "N/A"}`,
            `Telegram User ID: ${userId}`,
            `Chat ID: ${chatIdentifier}`
        ].join("\n");

        const notifiedChatIds = new Set();
        for (const record of authorizedUserRecords) {
            if (!record.chatId) {
                continue;
            }

            const targetChatId = String(record.chatId).trim();
            if (!targetChatId || targetChatId === String(chatIdentifier) || notifiedChatIds.has(targetChatId)) {
                continue;
            }

            try {
                await this.notifier.send(targetChatId, alertText);
                notifiedChatIds.add(targetChatId);
            } catch (error) {
                console.error("Failed to notify authorized user:", error.message);
            }
        }
    }

    composeContactDisplay(authorizedUserRecords) {
        const contactNames = [];
        const seen = new Set();

        for (const record of authorizedUserRecords) {
            const normalized = this.normalizeIdentity(record.username);
            if (normalized && !seen.has(normalized)) {
                seen.add(normalized);
                contactNames.push(record.username.trim());
            }
        }

        for (const fallbackName of ACCESS_DENIED_CONTACTS) {
            const normalizedFallback = this.normalizeIdentity(fallbackName);
            if (!seen.has(normalizedFallback)) {
                seen.add(normalizedFallback);
                contactNames.push(fallbackName);
            }
        }

        return contactNames.join(", ");
    }

    extractAllowedNameSet(authorizedUserRecords) {
        const allowed = new Set();

        for (const record of authorizedUserRecords) {
            if (!record.username) {
                continue;
            }

            allowed.add(this.normalizeIdentity(record.username));
        }

        for (const fallbackName of ACCESS_DENIED_CONTACTS) {
            allowed.add(this.normalizeIdentity(fallbackName));
        }

        return allowed;
    }

    buildReporterCandidateNames(telegramMessage, reporterIdentity) {
        const from = telegramMessage.from || {};
        const fullName = `${from.first_name || ""} ${from.last_name || ""}`.trim();
        const candidates = [
            reporterIdentity,
            this.extractReporterAlias(reporterIdentity),
            fullName,
            from.username ? `@${from.username}` : "",
            from.username || ""
        ];

        return candidates.filter(Boolean);
    }

    normalizeIdentity(value) {
        return String(value || "")
            .trim()
            .replace(/^@/, "")
            .toLowerCase();
    }

    upsertUserChatMapping(telegramMessage, reporterIdentity, chatIdentifier) {
        try {
            const candidateNames = this.buildReporterCandidateNames(telegramMessage, reporterIdentity);

            let records = [];
            if (fs.existsSync(TELEGRAM_USERS_FILE)) {
                records = JSON.parse(fs.readFileSync(TELEGRAM_USERS_FILE, "utf-8"));
            }

            for (const name of candidateNames) {
                const existing = records.find(
                    (item) => this.normalizeIdentity(item.username) === this.normalizeIdentity(name)
                );

                if (existing) {
                    existing.chatId = String(chatIdentifier);
                } else {
                    records.push({ username: name, chatId: String(chatIdentifier) });
                }
            }

            fs.writeFileSync(TELEGRAM_USERS_FILE, JSON.stringify(records, null, 2));
        } catch (error) {
            console.error("Failed to auto-save telegram user mapping:", error.message);
        }
    }

    extractReporterAlias(reporterIdentity) {
        if (!reporterIdentity) {
            return "";
        }

        const bracketMatch = reporterIdentity.match(/\(([^)]+)\)/);
        if (bracketMatch && bracketMatch[1]) {
            return bracketMatch[1];
        }

        return reporterIdentity;
    }
}

module.exports = TelegramIssueWebhookController;