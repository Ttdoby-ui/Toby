import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session } = await authenticate.webhook(request);

  console.log(`Received webhook: ${topic} for shop: ${shop}`);

  // Handle webhooks here based on topic
  switch (topic) {
    case "APP_UNINSTALLED":
      if (session) {
        // Optionally delete shop config and sessions here
        console.log(`App uninstalled from shop: ${shop}`);
      }
      break;
    default:
      console.log(`Unhandled webhook topic: ${topic}`);
  }

  return new Response(null, { status: 200 });
};
