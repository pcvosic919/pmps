export const sendTeamsWebhook = async (webhookUrl: string, title: string, text: string) => {
    if (!webhookUrl) return;
    try {
        await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                "@type": "MessageCard",
                "@context": "http://schema.org/extensions",
                "themeColor": "0076D7",
                "summary": title,
                "sections": [{
                    "activityTitle": title,
                    "text": text
                }]
            })
        });
    } catch (e) {
        console.error("[Webhook] Failed to send Teams webhook", e);
    }
};

export const sendSlackWebhook = async (webhookUrl: string, text: string) => {
    if (!webhookUrl) return;
    try {
        await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
        });
    } catch (e) {
        console.error("[Webhook] Failed to send Slack webhook", e);
    }
};
