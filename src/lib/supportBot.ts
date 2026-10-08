export interface BotReplyResult {
  reply: string;
  suggestHuman: boolean;
  isEscalation: boolean;
}

export function generateBotReply(
  userMessage: string,
  historyCount: number,
  isHumanRequested: boolean
): BotReplyResult {
  const msg = userMessage.toLowerCase().trim();

  // If already connected with human agent, bot steps aside
  if (isHumanRequested) {
    return {
      reply: '',
      suggestHuman: false,
      isEscalation: false,
    };
  }

  // Explicit Human escalation keywords
  const humanKeywords = ['human', 'agent', 'person', 'representative', 'support executive', 'talk to someone', 'real person', 'call me', 'live agent'];
  if (humanKeywords.some((k) => msg.includes(k))) {
    return {
      reply: '🔔 I am connecting you to our Live Support Team now! An administrator has been notified with high priority and will join this chat momentarily.',
      suggestHuman: false,
      isEscalation: true,
    };
  }

  // Greetings
  if (msg === 'hi' || msg === 'hello' || msg === 'hey' || msg.startsWith('hi ') || msg.startsWith('hello ')) {
    return {
      reply: `Hello! 👋 Welcome to Gold Rate Pricer Support. 

I'm your automated assistant. I can help you with:
• **Today's Gold & Metal Rates** setup & auto-derivation
• **Making charges, Wastage % & Diamond pricing**
• **Pushing updated prices to Shopify**
• **Storefront Price Breakup Display**

What can I assist you with today?`,
      suggestHuman: historyCount >= 2,
      isEscalation: false,
    };
  }

  // Rate calculation / purity questions
  if (msg.includes('rate') || msg.includes('gold') || msg.includes('24k') || msg.includes('22k') || msg.includes('18k') || msg.includes('purity')) {
    return {
      reply: `📌 **Metal Rate Configuration:**
• On your store dashboard, enter today's **24K Gold Rate per gram**.
• The system automatically calculates 22K (91.6%), 18K (75%), 14K (58.3%), 10K, and 9K rates based on standard purity percentages.
• You can also click **"set manually"** if your store has custom rates per purity.
• Click **"Save & update Shopify prices"** whenever you update rates to reprice all variants.`,
      suggestHuman: true,
      isEscalation: false,
    };
  }

  // Price push / update Shopify questions
  if (msg.includes('push') || msg.includes('sync') || msg.includes('update') || msg.includes('shopify') || msg.includes('price')) {
    return {
      reply: `⚡ **Sync & Price Updates:**
• Click **"Sync products"** on your store page to pull new jewellery products and variants from Shopify.
• Click **"Update all prices on Shopify"** to push freshly calculated prices and price breakup metafields to your live store in the background.
• Progress and logs can be tracked under **Price Update History**.`,
      suggestHuman: true,
      isEscalation: false,
    };
  }

  // Making charges, wastage, diamond formula
  if (msg.includes('making') || msg.includes('charge') || msg.includes('wastage') || msg.includes('diamond') || msg.includes('gst') || msg.includes('formula')) {
    return {
      reply: `💎 **Pricing Formula & Charges:**
• **Metal Value** = Weight(g) × Rate per gram
• **Wastage** = Metal Value × Wastage %
• **Making Charges** = Per gram / Percentage / Fixed
• **Diamond & Stones** = Diamond Charge + (Carats × Rate/ct)
• **Final Price** = (Metal + Wastage + Making + Stones + Labour + Hallmark + Markup) × (1 + GST%)`,
      suggestHuman: true,
      isEscalation: false,
    };
  }

  // Website breakup display
  if (msg.includes('theme') || msg.includes('breakup') || msg.includes('product page') || msg.includes('display') || msg.includes('liquid')) {
    return {
      reply: `✨ **Storefront Price Breakup:**
• Each price push automatically writes the \`gold_pricing.breakup\` JSON metafield.
• To show the live breakdown table on your product page, insert the theme snippet in your Shopify theme or add the app block in the Theme Editor.`,
      suggestHuman: true,
      isEscalation: false,
    };
  }

  // Default response with human suggestion
  return {
    reply: `Thank you for your message. I have logged your inquiry regarding "${userMessage.slice(0, 60)}". 

Would you like me to connect you directly with a live human support specialist?`,
    suggestHuman: true,
    isEscalation: false,
  };
}
