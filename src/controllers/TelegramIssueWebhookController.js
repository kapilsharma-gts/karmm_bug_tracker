const fs = require("fs");
const path = require("path");
const TelegramReporterIdentity = require("../domain/TelegramReporterIdentity");
const TelegramIncomingContent = require("../domain/TelegramIncomingContent");
const IssuePayloadComposer = require("../domain/IssuePayloadComposer");
const IssueCommandExecutionContext = require("../commands/IssueCommandExecutionContext");

const TELEGRAM_USERS_FILE = path.resolve(process.cwd(), "telegram-users.json");
const PROCESSED_TELEGRAM_MESSAGES_FILE = path.resolve(process.cwd(), "processed-telegram-messages.json");
const ACCESS_DENIED_CONTACTS = ["Bhabha", "Ayog Rai"];

class TelegramIssueWebhookController {
    constructor({ issueGateway, notifier, mediaResolver, commandRouter }) {
        this.issueGateway = issueGateway;
        this.notifier = notifier;
        this.mediaResolver = mediaResolver;
        this.commandRouter = commandRouter;
        this.processedMessageKeys = new Map();
        this.duplicateGuardTtlMs = 24 * 60 * 60 * 1000;
        this.loadProcessedMessageKeysFromDisk();
    }

    async processIncomingMessage(telegramMessage) {
        if (!this.isUserGeneratedTelegramMessage(telegramMessage)) {
            return;
        }

        const chatIdentifier = telegramMessage.chat.id;
        const duplicateMessageKey = this.buildMessageDeduplicationKey(telegramMessage, chatIdentifier);
        if (duplicateMessageKey && this.isDuplicateMessage(duplicateMessageKey)) {
            return;
        }

        try {
            const reporterIdentity = TelegramReporterIdentity.composeReporter(telegramMessage.from || {});
            const isWebhookAutomation = this.isWebhookAutomationMessage(telegramMessage);
            const shouldSendTelegramReply = !isWebhookAutomation;

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

            const creationResult = await this.issueGateway.createIssue(issuePayload);
            const issueCreatedInAnyBackend = !creationResult || creationResult.sheetCreated || creationResult.trelloCreated;

            if (!issueCreatedInAnyBackend) {
                if (shouldSendTelegramReply) {
                    await this.notifier.send(
                        chatIdentifier,
                        "⚠️ Bug submission failed due to backend issue. Please retry in a moment."
                    );
                }
                return;
            }

            const acknowledgement = this.composeIssueCreatedAcknowledgement(issuePayload.id, creationResult, telegramMessage);

            if (shouldSendTelegramReply) {
                try {
                    await this.notifier.send(chatIdentifier, acknowledgement);
                } catch (error) {
                    console.error("Failed to send bug acknowledgement:", error.message);
                }
            }
        } catch (error) {
            if (duplicateMessageKey) {
                this.processedMessageKeys.delete(duplicateMessageKey);
            }

            throw error;
        }
    }

    buildMessageDeduplicationKey(telegramMessage, chatIdentifier) {
        const messageId = telegramMessage.message_id;
        if (messageId == null) {
            return "";
        }

        return `${String(chatIdentifier)}:${String(messageId)}`;
    }

    isDuplicateMessage(deduplicationKey) {
        const now = Date.now();
        this.pruneDuplicateCache(now);

        if (!deduplicationKey) {
            return false;
        }

        if (this.processedMessageKeys.has(deduplicationKey)) {
            return true;
        }

        this.processedMessageKeys.set(deduplicationKey, now + this.duplicateGuardTtlMs);
        this.persistProcessedMessageKeys();
        return false;
    }

    pruneDuplicateCache(now = Date.now()) {
        let removedAny = false;
        for (const [key, expiresAt] of this.processedMessageKeys.entries()) {
            if (expiresAt > now) {
                continue;
            }

            this.processedMessageKeys.delete(key);
            removedAny = true;
        }

        if (removedAny) {
            this.persistProcessedMessageKeys();
        }
    }

    isUserGeneratedTelegramMessage(telegramMessage) {
        const from = telegramMessage && telegramMessage.from ? telegramMessage.from : {};
        const hasChat = telegramMessage && telegramMessage.chat && telegramMessage.chat.id != null;
        const hasMessageId = telegramMessage && telegramMessage.message_id != null;

        if (!hasChat || !hasMessageId) {
            return false;
        }

        if (from.is_bot === true) {
            return false;
        }

        if (!from.id && !from.username && !from.first_name && !from.last_name) {
            return false;
        }

        return true;
    }

    loadProcessedMessageKeysFromDisk() {
        try {
            if (!fs.existsSync(PROCESSED_TELEGRAM_MESSAGES_FILE)) {
                return;
            }

            const payload = JSON.parse(fs.readFileSync(PROCESSED_TELEGRAM_MESSAGES_FILE, "utf-8"));
            if (!payload || typeof payload !== "object") {
                return;
            }

            const now = Date.now();
            for (const [key, expiresAt] of Object.entries(payload)) {
                if (typeof expiresAt !== "number" || expiresAt <= now) {
                    continue;
                }

                this.processedMessageKeys.set(key, expiresAt);
            }
        } catch (error) {
            console.error("Failed to load processed Telegram message keys:", error.message);
        }
    }

    persistProcessedMessageKeys() {
        try {
            const serialized = {};
            for (const [key, expiresAt] of this.processedMessageKeys.entries()) {
                serialized[key] = expiresAt;
            }

            fs.writeFileSync(
                PROCESSED_TELEGRAM_MESSAGES_FILE,
                JSON.stringify(serialized, null, 2)
            );
        } catch (error) {
            console.error("Failed to persist processed Telegram message keys:", error.message);
        }
    }

    composeIssueCreatedAcknowledgement(issueId, creationResult, telegramMessage) {
        const reporterLine = this.composeReporterAcknowledgementLine(telegramMessage);
        const defaultMessage = [
            `✅ Bug ID: ${issueId}`,
            reporterLine,
            "We have received your bug report and will resolve it very soon.",
            "Thank you for helping us improve KARMM."
        ].join("\n");

        if (!creationResult) {
            return defaultMessage;
        }

        if (creationResult.sheetCreated && creationResult.trelloCreated) {
            return defaultMessage;
        }

        if (creationResult.sheetCreated && !creationResult.trelloCreated) {
            return [
                `✅ Bug ID: ${issueId}`,
                reporterLine,
                "Your bug was saved to Sheet successfully.",
                "Trello sync will be retried automatically."
            ].join("\n");
        }

        if (!creationResult.sheetCreated && creationResult.trelloCreated) {
            return [
                `✅ Bug ID: ${issueId}`,
                reporterLine,
                "Your bug was saved to Trello successfully.",
                "Sheet sync will be retried automatically."
            ].join("\n");
        }

        return defaultMessage;
    }

    composeReporterAcknowledgementLine(telegramMessage) {
        const from = telegramMessage && telegramMessage.from ? telegramMessage.from : {};
        const displayName = `${from.first_name || ""} ${from.last_name || ""}`.trim();
        const username = from.username ? `@${from.username}` : "";

        if (displayName && username) {
            return `🙏 Thanks ${displayName} (${username}) for submitting the bug.`;
        }

        if (displayName) {
            return `🙏 Thanks ${displayName} for submitting the bug.`;
        }

        if (username) {
            return `🙏 Thanks ${username} for submitting the bug.`;
        }

        return "🙏 Thanks for submitting the bug.";
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