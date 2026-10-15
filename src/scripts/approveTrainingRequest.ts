import {
  listTrainingRequests,
  approveTrainingRequest,
} from "../ai/trainingRequestsStore";

async function runApproveTest() {
  const merchantId = "test_merchant";

  const pendingRequests = await listTrainingRequests({
    merchantId,
    status: "pending_review",
  });

  if (pendingRequests.length === 0) {
    console.log("No pending review training requests found.");
    return;
  }

  const request = pendingRequests[0];

  console.log("Approving training request:");
  console.log("ID:", request.id);
  console.log("Customer message:", request.customerMessage);
  console.log("Suggested reply:", request.suggestedReply);

  const idealReply =
    "سؤالك يحتاج توضيح أكثر حتى أقدر أساعدك بشكل صحيح. ممكن تشرحلي شنو تقصد بالضبط؟";

  const approved = await approveTrainingRequest({
    requestId: request.id,
    idealReply,
    keywords: ["سؤال غريب", "ما اعرف", "توضحون", "شنو تقصد"],
  });

  if (!approved) {
    console.log("Could not approve request.");
    return;
  }

  console.log("Training request approved successfully.");
  console.log("Status:", approved.status);
  console.log("Saved ideal reply:", idealReply);
}

runApproveTest().catch((error) => {
  console.error("Approve test failed:", error);
  process.exit(1);
});
