class SheetSyncWebhookController {
    constructor({ trelloGateway, notifier }) {
        this.trelloGateway = trelloGateway;
        this.notifier = notifier;
    }

    async processSheetWebhook(webhookData) {
        // Google Sheets webhook data format (when using Apps Script):
        // {
        //   action: 'update',
        //   id: '123',
        //   status: 'IN PROGRESS'  or 'DONE' or 'OPEN'
        // }

        const { action, id, status } = webhookData;

        if (!action || !id) {
            return false;
        }

        if (action === 'update' && status) {
            const normalizedStatus = String(status).toUpperCase().trim();

            // Map sheet status to Trello action
            if (normalizedStatus === 'IN PROGRESS' || normalizedStatus === 'IN DEVELOPMENT' || normalizedStatus === 'DOING') {
                await this.trelloGateway.markInProgress(id);
                console.log(`✅ Synced Sheet issue ${id} to Trello: IN PROGRESS`);
            } else if (normalizedStatus === 'IN REVIEW' || normalizedStatus === 'REVIEW') {
                await this.trelloGateway.markInReview(id);
                console.log(`✅ Synced Sheet issue ${id} to Trello: IN REVIEW`);
            } else if (normalizedStatus === 'BUG NOT RESOLVED') {
                // Bug not resolved - move to "Bug Not Resolved" list
                await this.trelloGateway.markBugNotResolved(id);
                console.log(`✅ Synced Sheet issue ${id} to Trello: BUG NOT RESOLVED`);
            } else if (normalizedStatus === 'FUTURE UPDATE' || normalizedStatus === 'FUTURE') {
                await this.trelloGateway.markFutureUpdate(id);
                console.log(`✅ Synced Sheet issue ${id} to Trello: FUTURE UPDATE`);
            } else if (normalizedStatus === 'DONE') {
                await this.trelloGateway.markDone(id);
                console.log(`✅ Synced Sheet issue ${id} to Trello: DONE`);
            } else if (normalizedStatus === 'OPEN' || normalizedStatus === 'TO DO' || normalizedStatus === 'TODO') {
                // Optionally move back to TODO/backlog
                await this.trelloGateway.markOpen(id);
                console.log(`✅ Synced Sheet issue ${id} to Trello: OPEN`);
            }
            return true;
        }

        return false;
    }
}

module.exports = SheetSyncWebhookController;
