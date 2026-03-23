const FormData = require("form-data");
const fs = require("fs");
const path = require("path");

class TrelloIssueGateway {
    constructor(trelloConfig, httpClient) {
        this.trelloKey = trelloConfig.key;
        this.trelloToken = trelloConfig.token;
        this.boardId = trelloConfig.boardId;
        this.httpClient = httpClient;
        this.baseUrl = "https://api.trello.com/1";
        this.cardMap = {}; // Map to store issueId -> trelloCardId
        this.issueTitleMap = null;
    }

    getAuthParams() {
        return `key=${this.trelloKey}&token=${this.trelloToken}`;
    }

    async markDone(issueId) {
        const cardId = await this.getCardId(issueId);
        if (!cardId) {
            console.warn(`⚠️ Trello card not found for issue ${issueId} (markDone)`);
            return;
        }

        await this.httpClient.put(
            `${this.baseUrl}/cards/${cardId}?${this.getAuthParams()}`,
            {
                idList: await this.getDoneListId()
            }
        );
    }

    async markInProgress(issueId) {
        const cardId = await this.getCardId(issueId);
        if (!cardId) {
            console.warn(`⚠️ Trello card not found for issue ${issueId} (markInProgress)`);
            return;
        }

        await this.httpClient.put(
            `${this.baseUrl}/cards/${cardId}?${this.getAuthParams()}`,
            {
                idList: await this.getProgressListId()
            }
        );
    }

    async markOpen(issueId) {
        const cardId = await this.getCardId(issueId);
        if (!cardId) {
            console.warn(`⚠️ Trello card not found for issue ${issueId} (markOpen)`);
            return;
        }

        await this.httpClient.put(
            `${this.baseUrl}/cards/${cardId}?${this.getAuthParams()}`,
            {
                idList: await this.getTodoListId()
            }
        );
    }

    async markInReview(issueId) {
        const cardId = await this.getCardId(issueId);
        if (!cardId) {
            console.warn(`⚠️ Trello card not found for issue ${issueId} (markInReview)`);
            return;
        }

        await this.httpClient.put(
            `${this.baseUrl}/cards/${cardId}?${this.getAuthParams()}`,
            {
                idList: await this.getReviewListId()
            }
        );
    }

    async markFutureUpdate(issueId) {
        const cardId = await this.getCardId(issueId);
        if (!cardId) {
            console.warn(`⚠️ Trello card not found for issue ${issueId} (markFutureUpdate)`);
            return;
        }

        await this.httpClient.put(
            `${this.baseUrl}/cards/${cardId}?${this.getAuthParams()}`,
            {
                idList: await this.getFutureUpdateListId()
            }
        );
    }

    async markBugNotResolved(issueId) {
        const cardId = await this.getCardId(issueId);
        if (!cardId) {
            console.warn(`⚠️ Trello card not found for issue ${issueId} (markBugNotResolved)`);
            return;
        }

        await this.httpClient.put(
            `${this.baseUrl}/cards/${cardId}?${this.getAuthParams()}`,
            {
                idList: await this.getBugNotResolvedListId()
            }
        );
    }

    async removeIssue(issueId) {
        const cardId = await this.getCardId(issueId);
        if (!cardId) return;

        await this.httpClient.delete(
            `${this.baseUrl}/cards/${cardId}?${this.getAuthParams()}`
        );

        delete this.cardMap[issueId];
    }

    async assignIssue(issueId, responsibleOwner) {
        const cardId = await this.getCardId(issueId);
        if (!cardId) return;

        // Find member by username
        const members = await this.httpClient.get(
            `${this.baseUrl}/boards/${this.boardId}/members?${this.getAuthParams()}`
        );

        const member = members.data.find(m =>
            m.username === responsibleOwner || m.fullName === responsibleOwner
        );

        if (member) {
            await this.httpClient.put(
                `${this.baseUrl}/cards/${cardId}?${this.getAuthParams()}`,
                {
                    idMembers: [member.id]
                }
            );
        }
    }

    async createIssue(issuePayload) {
        const todoListId = await this.getTodoListId();
        const labelColor = this.getLabelColor(issuePayload.priority);
        const description = this.buildCardDescription(issuePayload);
        const cleanedTitle = this.cleanTitle(issuePayload.title || issuePayload.name || "New Issue");
        const title = cleanedTitle;

        const cardResponse = await this.httpClient.post(
            `${this.baseUrl}/cards?${this.getAuthParams()}`,
            {
                name: title,
                desc: description,
                idList: todoListId,
                due: issuePayload.dueDate || null,
                labels: labelColor || undefined
            }
        );

        const mediaUrl = issuePayload.image || issuePayload.preview || issuePayload.video || issuePayload.mediaUrl;
        if (mediaUrl) {
            await this.attachMediaToCard(cardResponse.data.id, mediaUrl);
        }

        // Store mapping
        if (issuePayload.id) {
            this.cardMap[issuePayload.id] = cardResponse.data.id;
        }

        return cardResponse.data;
    }

    async updateIssueChatId(issueId, chatId) {
        const cardId = await this.getCardId(issueId);
        if (!cardId) return;

        const cardName = await this.getCardName(cardId);
        await this.httpClient.put(
            `${this.baseUrl}/cards/${cardId}?${this.getAuthParams()}`,
            {
                name: `${cardName} [Chat: ${chatId}]`
            }
        );
    }

    // Helper methods
    async getCardId(issueId) {
        const normalizedIssueId = String(issueId || "").trim();
        if (!normalizedIssueId) {
            return null;
        }

        if (this.cardMap[normalizedIssueId]) {
            return this.cardMap[normalizedIssueId];
        }

        if (/^[a-f0-9]{24}$/i.test(normalizedIssueId)) {
            return normalizedIssueId;
        }

        const resolvedCardId = await this.findCardIdByIssueId(normalizedIssueId);
        if (resolvedCardId) {
            this.cardMap[normalizedIssueId] = resolvedCardId;
            return resolvedCardId;
        }

        return null;
    }

    async getCardName(cardId) {
        try {
            const response = await this.httpClient.get(
                `${this.baseUrl}/cards/${cardId}?${this.getAuthParams()}`
            );
            return response.data.name;
        } catch (error) {
            return "";
        }
    }

    async getTodoListId() {
        return await this.getListIdByAnyName(["To Do", "Todo", "Issues", "Backlog"]);
    }

    async getProgressListId() {
        return await this.getListIdByAnyName(["In Progress", "In Development", "Doing", "Development"]);
    }

    async getDoneListId() {
        return await this.getListIdByAnyName(["Done", "Completed", "Closed"]);
    }

    async getReviewListId() {
        return await this.getListIdByAnyName(["Review", "In Review", "Code Review", "QA"]);
    }

    async getFutureUpdateListId() {
        return await this.getListIdByAnyName(["Future Update", "Future Updates", "Future", "Planned", "Later"]);
    }

    async getBugNotResolvedListId() {
        return await this.getListIdByAnyName(["Bug Not Resolved", "Bug-Not-Resolved", "Not Resolved", "Rejected"]);
    }

    getLabelColor(priority) {
        const labelMap = {
            HIGH: "red",
            MEDIUM: "yellow",
            LOW: "green",
            CRITICAL: "red"
        };

        return labelMap[(priority || "").toUpperCase()] || null;
    }

    cleanTitle(rawTitle) {
        const withoutStatus = String(rawTitle || "")
            .replace(/^\s*\[(open|done|in progress)\]\s*/i, "")
            .replace(/^\s*(open|done|in progress)\s*[:-]\s*/i, "");

        const withoutEmoji = withoutStatus.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, "");
        const compact = withoutEmoji.replace(/\s+/g, " ").trim();
        return compact || "Untitled";
    }

    buildCardDescription(issuePayload) {
        return [
            `Issue ID: ${issuePayload.id || "N/A"}`,
            `Description: ${issuePayload.description || ""}`,
            `Priority: ${issuePayload.priority || "MEDIUM"}`,
            `Status: ${issuePayload.status || "OPEN"}`,
            `Reporter: ${issuePayload.reporter || "Unknown"}`,
            `Date: ${issuePayload.date || "N/A"}`,
            `Chat ID: ${issuePayload.chatId || "N/A"}`
        ].join("\n\n");
    }

    async getIssueIdFromCard(cardId, cardName) {
        const fromName = this.extractIssueIdFromText(cardName);
        if (fromName) {
            return fromName;
        }

        try {
            const response = await this.httpClient.get(
                `${this.baseUrl}/cards/${cardId}?${this.getAuthParams()}`
            );
            const fromDesc = this.extractIssueIdFromText(response.data.desc || "");
            if (fromDesc) {
                return fromDesc;
            }

            return this.findIssueIdByTitle(response.data.name || cardName || "");
        } catch (_error) {
            return this.findIssueIdByTitle(cardName || "");
        }
    }

    async findCardIdByIssueId(issueId) {
        try {
            const response = await this.httpClient.get(
                `${this.baseUrl}/boards/${this.boardId}/cards?fields=id,name,desc&${this.getAuthParams()}`
            );

            const cards = response.data || [];

            // Preferred: card description contains Issue ID.
            const descMatch = cards.find((card) =>
                this.extractIssueIdFromText(card.desc || "") === String(issueId)
            );
            if (descMatch) {
                return descMatch.id;
            }

            // Fallback: card title contains parseable issue ID.
            const nameMatch = cards.find((card) =>
                this.extractIssueIdFromText(card.name || "") === String(issueId)
            );
            if (nameMatch) {
                return nameMatch.id;
            }

            // Last fallback: match card title with issue title from local issues.json.
            const expectedTitle = this.getIssueTitleById(issueId);
            if (expectedTitle) {
                const expectedNormalized = this.normalizeTextForMatch(expectedTitle);
                const titleMatch = cards.find(
                    (card) => this.normalizeTextForMatch(card.name || "") === expectedNormalized
                );
                if (titleMatch) {
                    return titleMatch.id;
                }

                const looseTitleMatch = cards.find((card) => {
                    const cardName = this.normalizeTextForMatch(card.name || "");
                    return cardName.includes(expectedNormalized) || expectedNormalized.includes(cardName);
                });
                if (looseTitleMatch) {
                    return looseTitleMatch.id;
                }
            }

            return null;
        } catch (_error) {
            return null;
        }
    }

    getIssueTitleById(issueId) {
        const map = this.loadIssueTitleMap();
        return map[String(issueId)] || null;
    }

    findIssueIdByTitle(cardName) {
        const normalizedCardName = this.normalizeTextForMatch(cardName);
        if (!normalizedCardName) {
            return null;
        }

        const map = this.loadIssueTitleMap();
        for (const [id, title] of Object.entries(map)) {
            if (this.normalizeTextForMatch(title) === normalizedCardName) {
                return id;
            }
        }

        return null;
    }

    loadIssueTitleMap() {
        if (this.issueTitleMap) {
            return this.issueTitleMap;
        }

        const map = {};
        try {
            const issuesPath = path.resolve(process.cwd(), "issues.json");
            if (!fs.existsSync(issuesPath)) {
                this.issueTitleMap = map;
                return map;
            }

            const payload = JSON.parse(fs.readFileSync(issuesPath, "utf-8"));
            for (const issue of payload) {
                if (issue && issue.id != null && issue.title) {
                    map[String(issue.id)] = String(issue.title);
                }
            }
        } catch (_error) {
            // Ignore; sync can still work from desc-based IDs.
        }

        this.issueTitleMap = map;
        return map;
    }

    normalizeTextForMatch(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    }

    extractIssueIdFromText(text) {
        const raw = String(text || "");
        const patterns = [
            /^ID-(\d+)/i,
            /^ISSUE-(\d+)/i,
            /^#(\d+)/,
            /Issue ID[:\s-]+(\d+)/i,
            /\bID[:\s-]+(\d+)/i
        ];

        for (const pattern of patterns) {
            const match = raw.match(pattern);
            if (match) {
                return match[1];
            }
        }

        return null;
    }

    async attachMediaToCard(cardId, mediaUrl) {
        if (!mediaUrl) {
            return;
        }

        try {
            const mediaResponse = await this.httpClient.get(mediaUrl, {
                responseType: "arraybuffer",
                timeout: 20000
            });

            const contentType = mediaResponse.headers["content-type"] || "application/octet-stream";
            const extension = this.getFileExtension(contentType, mediaUrl);
            const form = new FormData();
            form.append("file", Buffer.from(mediaResponse.data), {
                filename: `evidence.${extension}`,
                contentType
            });

            await this.httpClient.post(
                `${this.baseUrl}/cards/${cardId}/attachments?${this.getAuthParams()}`,
                form,
                {
                    headers: form.getHeaders(),
                    maxBodyLength: Infinity
                }
            );
        } catch (error) {
            try {
                await this.httpClient.post(
                    `${this.baseUrl}/cards/${cardId}/attachments?${this.getAuthParams()}`,
                    {
                        url: mediaUrl,
                        name: "evidence"
                    }
                );
            } catch (_fallbackError) {
                // Do not fail main issue flow if attachment cannot be added.
            }
        }
    }

    getFileExtension(contentType, mediaUrl) {
        if (contentType.includes("image/jpeg")) return "jpg";
        if (contentType.includes("image/png")) return "png";
        if (contentType.includes("image/webp")) return "webp";
        if (contentType.includes("video/mp4")) return "mp4";

        const cleanUrl = String(mediaUrl || "").split("?")[0];
        const parts = cleanUrl.split(".");
        if (parts.length > 1) {
            return parts.pop().toLowerCase();
        }

        return "bin";
    }

    async getListIdByAnyName(candidateNames) {
        const response = await this.httpClient.get(
            `${this.baseUrl}/boards/${this.boardId}/lists?${this.getAuthParams()}`
        );

        const normalizedCandidates = candidateNames.map((name) => name.toLowerCase());
        const list = response.data.find((item) =>
            normalizedCandidates.includes((item.name || "").trim().toLowerCase())
        );

        if (!list) {
            throw new Error(`Expected one of lists not found: ${candidateNames.join(", ")}`);
        }
        return list.id;
    }
}

module.exports = TrelloIssueGateway;
