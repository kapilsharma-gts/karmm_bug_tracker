const TelegramReporterIdentity = require("../domain/TelegramReporterIdentity");
const TelegramIncomingContent = require("../domain/TelegramIncomingContent");
const IssuePayloadComposer = require("../domain/IssuePayloadComposer");
const IssueCommandExecutionContext = require("../commands/IssueCommandExecutionContext");

class TelegramIssueWebhookController {
    constructor({ issueGateway, notifier, mediaResolver, commandRouter }) {
        this.issueGateway = issueGateway;
        this.notifier = notifier;
        this.mediaResolver = mediaResolver;
        this.commandRouter = commandRouter;
    }

    async processIncomingMessage(telegramMessage) {
        const chatIdentifier = telegramMessage.chat.id;
        const reporterIdentity = TelegramReporterIdentity.composeReporter(telegramMessage.from);

        const { messageText, consolidatedContent } = TelegramIncomingContent.parse(telegramMessage);
        const commandExecutionContext = new IssueCommandExecutionContext({
            chatIdentifier,
            messageText
        });

        const commandHandled = await this.commandRouter.tryHandle(commandExecutionContext);
        if (commandHandled) {
            return;
        }

        if (!consolidatedContent) {
            return;
        }

        const evidenceImageUrl = await this.mediaResolver.extractPhotoUrl(telegramMessage);
        const issuePayload = IssuePayloadComposer.buildIssuePayload({
            issueText: consolidatedContent,
            issueReporter: reporterIdentity,
            evidenceImageUrl
        });

        await this.issueGateway.createIssue(issuePayload);

        await this.notifier.send(
            chatIdentifier,
            [
                "Bug created",
                `ID: ${issuePayload.id}`,
                `Title: ${issuePayload.title}`,
                `Priority: ${issuePayload.priority}`,
                `Reporter: ${issuePayload.reporter}`,
                "Status: OPEN"
            ].join("\n")
        );
    }
}

module.exports = TelegramIssueWebhookController;