const SheetIssueGateway = require("../services/SheetIssueGateway");
const TelegramOutboundNotifier = require("../services/TelegramOutboundNotifier");
const TelegramMediaEvidenceResolver = require("../services/TelegramMediaEvidenceResolver");
const TelegramIssueWorkflowRouter = require("../routing/TelegramIssueWorkflowRouter");
const TelegramIssueWebhookController = require("../controllers/TelegramIssueWebhookController");
const StartCommandSilencer = require("../commands/StartCommandSilencer");
const DoneIssueCommand = require("../commands/DoneIssueCommand");
const ProgressIssueCommand = require("../commands/ProgressIssueCommand");
const DeleteIssueCommand = require("../commands/DeleteIssueCommand");
const AssignIssueCommand = require("../commands/AssignIssueCommand");

function buildIssueWebhookController({ telegramToken, sheetWebhookUrl, httpClient }) {
    const sheetIssueGateway = new SheetIssueGateway(sheetWebhookUrl, httpClient);
    const telegramNotifier = new TelegramOutboundNotifier(telegramToken, httpClient);
    const mediaResolver = new TelegramMediaEvidenceResolver(telegramToken, httpClient);

    const commandRouter = new TelegramIssueWorkflowRouter([
        new StartCommandSilencer(sheetIssueGateway, telegramNotifier),
        new DoneIssueCommand(sheetIssueGateway, telegramNotifier),
        new ProgressIssueCommand(sheetIssueGateway, telegramNotifier),
        new DeleteIssueCommand(sheetIssueGateway, telegramNotifier),
        new AssignIssueCommand(sheetIssueGateway, telegramNotifier)
    ]);

    return new TelegramIssueWebhookController({
        issueGateway: sheetIssueGateway,
        notifier: telegramNotifier,
        mediaResolver,
        commandRouter
    });
}

module.exports = buildIssueWebhookController;