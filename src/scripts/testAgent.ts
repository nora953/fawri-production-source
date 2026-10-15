import { handleIncomingCustomerMessage } from "../ai/agentService";

async function runTest() {
  const merchantId = "test_merchant";
  const customerId = `test_customer_${Date.now()}`;

  const messages = [
    "السلام عليكم",
    "بيش المنتج الاول؟",
    "متوفر؟",
    "لا اريد المنتج الاول اريد المنتج الثاني",
    "شكد سعره؟",
    "اريد اطلبه",
    "التوصيل شكد؟",
    "هذا سؤال غريب ما اعرف شلون تجاوبون عليه",
  ];

  for (const [index, text] of messages.entries()) {
    const result = await handleIncomingCustomerMessage({
      merchantId,
      customerId,
      channel: "facebook",
      kind: "text",
      text,
      messageId: `test_msg_${Date.now()}_${index + 1}`,
    });

    console.log("====================================");
    console.log("Customer:", text);
    console.log("Bot:", result.reply);
    console.log("Intent:", result.intent);
    console.log("Language:", result.language);
    console.log("Used OpenAI:", result.usedOpenAI);
    console.log("Used Local Knowledge:", result.usedLocalKnowledge);
    console.log("Created Training Request:", result.createdTrainingRequest);
    console.log("Confidence:", result.confidence);
    console.log("Handoff:", result.shouldHandoff);
    console.log("Note:", result.internalNote);
  }
}

runTest().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});