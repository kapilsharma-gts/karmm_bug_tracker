class TrelloSyncWebhookController {
    constructor({ sheetGateway, notifier, trelloGateway }) {
        this.sheetGateway = sheetGateway;
        this.notifier = notifier;
        this.trelloGateway = trelloGateway;
        this.listStatusMap = {
            // These should be configured based on your Trello board's actual list IDs
            // Map format: trelloListId -> status name
        };
    }

    setListStatusMap(listStatusMap) {
        this.listStatusMap = listStatusMap;
    }

    resolveStatusFromListName(listName) {
        const normalized = String(listName || "").trim().toLowerCase();

        const nameMap = {
            "to do": "OPEN",
            "todo": "OPEN",
            "issues": "OPEN",
            "backlog": "OPEN",
            "doing": "IN PROGRESS",
            "in progress": "IN PROGRESS",
            "in development": "IN PROGRESS",
            "development": "IN PROGRESS",
            "review": "IN REVIEW",
            "in review": "IN REVIEW",
            "bug not resolved": "BUG NOT RESOLVED",
            "future update": "FUTURE UPDATE",
            "future updates": "FUTURE UPDATE",
            "future": "FUTURE UPDATE",
            "done": "DONE",
            "completed": "DONE",
            "closed": "DONE"
        };

        const resolvedStatus = nameMap[normalized] || null;
        console.log(`[TrelloSync] Resolved status for list name '${listName}': ${resolvedStatus}`);
        return resolvedStatus;
    }

    async processTrelloWebhook(webhookData) {
        // Trello webhook sends data in this format:
        // {
        //   action: { type: 'updateCard', data: { card: { id, name, idList } } },
        //   model: { id: cardId }
        // }

        const action = webhookData.action;
        if (!action) {
            return;
        }

        // Handle card movement (updateCard action with idList change)
        if (action.type === 'updateCard' && action.data.card) {
            const card = action.data.card;
            const newListId = card.idList;
            
            // Try to resolve using explicit map, then fallback to testing the list name in payload
            const listAfterName = action.data.listAfter ? action.data.listAfter.name : (action.data.list ? action.data.list.name : "");
            
            let status = this.listStatusMap[newListId];
            if (!status) {
                status = this.resolveStatusFromListName(listAfterName);
            }

            console.log(`[TrelloSync] updateCard action for card '${card.name}' (List ID: ${newListId}, List Name: '${listAfterName}', Evaluated Status: ${status})`);

            if (status) {
                const issueId = await this.resolveIssueId(card);

                if (issueId) {
                    console.log(`[TrelloSync] Updating sheet for issue ${issueId} to status ${status}`);
                    await this.sheetGateway.markWithStatus(issueId, status);
                    console.log(`✅ Synced Trello card '${card.name}' (${issueId}) to status: ${status}`);
                } else {
                    console.log(`[TrelloSync] Failed to resolve issue ID for card '${card.name}'`);
                }
            }

            // Sync media if an attachment was just added or it's a new card
            const attachment = action.data.attachment;
            if (attachment && attachment.url) {
                const issueId = await this.resolveIssueId(card);
                if (issueId) {
                   await this.sheetGateway.updateIssueImage(issueId, attachment.url);
                   console.log(`🖼️ Synced Trello attachment for issue ${issueId}`);
                }
            }
        }

        // Specifically handle "addAttachmentToCard" action
        if (action.type === 'addAttachmentToCard' && action.data.card) {
            const card = action.data.card;
            const attachment = action.data.attachment;
            if (attachment && attachment.url) {
                const issueId = await this.resolveIssueId(card);
                if (issueId) {
                    await this.sheetGateway.updateIssueImage(issueId, attachment.url);
                    console.log(`🖼️ Synced new Trello attachment for issue ${issueId}`);
                }
            }
        }

        // Handle card comments/activity if needed
        if (action.type === 'commentCard') {
            // Optional: log comment activity
            console.log(`💬 Comment on Trello card from Trello webhook`);
        }
    }

    extractIssueId(cardName) {
        // Try to extract ID from formats like:
        // "ID-123: Bug Title"
        // "ISSUE-456: Another Title"
        // "#789 - Title"
        const patterns = [
            /^ID-(\d+)/i,
            /^ISSUE-(\d+)/i,
            /^#(\d+)/
        ];

        for (const pattern of patterns) {
            const match = cardName.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return null;
    }

    async resolveIssueId(card) {
        const fromName = this.extractIssueId(card.name || "");
        if (fromName) {
            return fromName;
        }

        if (this.trelloGateway && card.id) {
            return await this.trelloGateway.getIssueIdFromCard(card.id, card.name || "");
        }

        return null;
    }
}

module.exports = TrelloSyncWebhookController;
