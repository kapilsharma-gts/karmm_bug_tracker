class IssueCommandExecutionContext {
    constructor({ chatIdentifier, messageText }) {
        this.chatIdentifier = chatIdentifier;
        this.messageText = messageText;
    }
}

module.exports = IssueCommandExecutionContext;